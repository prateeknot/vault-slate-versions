// Cloudflare Pages Function — AI Assistant chat (Phase 2, v11.1 hardened)
//
// Flow:
//   browser (admin panel) → POST /api/ai-chat { token, message }
//   → 1. validates the admin session (vs_admin_code_id via admin_ping)
//   → 2. loads AI config + last 100 history messages from Supabase
//   → 3. calls the LLM with tools + history context. Two adapters:
//        - google  → native Gemini generateContent (reliable function calling)
//        - others  → OpenAI-compatible /chat/completions (OpenAI, Groq, custom)
//        If a tools-enabled call is rejected (some models don't accept tools),
//        it automatically retries WITHOUT tools so plain chat still works.
//   → 4. executes any tool_calls the model makes (mapped to admin RPCs using
//        the SAME admin token), feeds results back, repeats (max 8 loops)
//   → 5. saves user + assistant messages to history, returns reply
//
// The AI config (incl. API key) lives ONLY in Supabase (RPC-gated) and is
// read server-side here — never shipped to the browser.
//
// Tool safety: every tool maps to an admin RPC that itself validates the
// admin session token (p_token), so a compromised/buggy model still cannot
// act without a valid admin session.

export async function onRequest(context) {
  const { request, env } = context

  if (request.method !== 'POST') {
    return json({ success: false, error: 'method_not_allowed' }, 405)
  }

  let body
  try {
    body = await request.json()
  } catch {
    return json({ success: false, error: 'invalid_json' }, 400)
  }
  const token = typeof body?.token === 'string' ? body.token : ''
  if (!token) return json({ success: false, error: 'missing_token' }, 400)

  const supabaseUrl = env.VITE_SUPABASE_URL
  const anonKey = env.VITE_SUPABASE_ANON_KEY
  if (!supabaseUrl || !anonKey) {
    return json({ success: false, error: 'server_misconfigured' }, 500)
  }

  const rpc = async (fn, args = {}) => {
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify(args),
    })
    const text = await res.text()
    let data
    try { data = JSON.parse(text) } catch { data = text }
    return { status: res.status, data }
  }

  // 1. Validate admin session (throws SESSION_INVALID server-side if bad)
  try {
    const ping = await rpc('admin_ping', { p_token: token })
    if (ping.status >= 400) {
      return json({ success: false, error: 'invalid_token' }, 401)
    }
  } catch {
    return json({ success: false, error: 'session_check_failed' }, 502)
  }

  // 2. Load AI config (real API key lives here, server-side only)
  let cfg
  try {
    const c = await rpc('admin_ai_config_full', { p_token: token })
    if (c.status >= 400 || !c.data?.ok) {
      return json({ success: false, error: 'config_unavailable' }, 403)
    }
    cfg = c.data
  } catch {
    return json({ success: false, error: 'config_failed' }, 502)
  }
  if (!cfg.enabled) {
    return json({ success: false, error: 'ai_disabled', hint: 'Enable the AI Assistant in admin Settings first.' }, 403)
  }
  if (!cfg.api_key) {
    return json({ success: false, error: 'no_api_key', hint: 'Add an API key in the AI Assistant settings.' }, 403)
  }
  if (!cfg.model) {
    return json({ success: false, error: 'no_model', hint: 'Set a model name (e.g. gpt-4o-mini, gemini-2.0-flash, llama-3.3-70b-versatile).' }, 403)
  }

  const provider = String(cfg.provider || 'openai').toLowerCase()

  // 2b. History (previous context the AI sees before answering)
  let history = []
  try {
    const h = await rpc('admin_ai_history_list', { p_token: token })
    if (h.status < 400 && Array.isArray(h.data)) history = h.data
  } catch { /* history is best-effort */ }

  // Persist the user's message (skip the internal connection-probe message)
  const isProbe = body.message === '__test__'
  if (!isProbe) {
    try {
      await rpc('admin_ai_history_add', { p_token: token, p_role: 'user', p_content: body.message || '' })
    } catch { /* non-fatal */ }
  }

  const messages = [
    {
      role: 'system',
      content:
        'You are the admin assistant for VCardz, a virtual-cards web app. ' +
        'You have full admin powers through the tools provided (view cards/users/orders/payments, add/delete/toggle cards, ' +
        'assign cards to users, change user plans, approve/decline payments, change settings). ' +
        'Use the tools whenever the user asks for any action or status. ' +
        'After executing tools, summarise the result clearly and concisely in the user\'s language. ' +
        'Never invent card numbers or users — always read via tools before claiming facts. ' +
        'Be helpful and honest; if a tool fails, explain the error plainly.',
    },
    ...history
      .filter((m) => m && ['user', 'assistant'].includes(m.role))
      .map((m) => ({ role: m.role, content: m.content || '' })),
    { role: 'user', content: body.message || '' },
  ]

  // 3+4. Tool loop (bounded)
  const toolResults = []
  const MAX_LOOPS = 8
  let finalText = ''
  let toolsActive = true // flip to false if the provider rejects tools

  for (let loop = 0; loop < MAX_LOOPS; loop++) {
    const llm = await callLLM(cfg, provider, messages, toolsActive)
    if (llm.error) {
      // Some providers reject the tools payload (e.g. older models / certain
      // OpenAI-compat layers). Retry ONCE without tools so plain chat works.
      if (toolsActive && looksLikeToolRejection(llm.error)) {
        toolsActive = false
        const retry = await callLLM(cfg, provider, messages, false)
        if (!retry.error) {
          const msg = retry.message || {}
          finalText = msg.content || '…'
          break
        }
      }
      return json({ success: false, error: 'llm_error', detail: llm.error }, 502)
    }
    const msg = llm.message || {}
    const toolCalls = msg.tool_calls || []

    if (toolCalls.length === 0) {
      finalText = msg.content || '…'
      break
    }

    messages.push({ role: 'assistant', content: msg.content || '', tool_calls: toolCalls })

    for (const tc of toolCalls) {
      const fn = tc.function || {}
      const name = fn.name || ''
      let args = {}
      try { args = JSON.parse(fn.arguments || '{}') } catch { args = {} }
      const result = await executeTool(rpc, token, name, args)
      toolResults.push({ name, args, ...result })
      // _fnName lets the Gemini adapter put the ORIGINAL function name into
      // functionResponse (Gemini requires it; tool_call_id is provider-specific).
      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        _fnName: name,
        content: typeof result === 'string' ? result : JSON.stringify(result),
      })
    }
  }

  if (!finalText) finalText = 'I ran into too many steps and stopped. Try rephrasing or splitting the request.'

  // Save the assistant reply (skip the probe reply too)
  if (!isProbe) {
    try {
      await rpc('admin_ai_history_add', { p_token: token, p_role: 'assistant', p_content: finalText })
    } catch { /* non-fatal */ }
  }

  return json({
    success: true,
    reply: finalText,
    tools_used: toolResults.map((t) => ({ name: t.name, ok: t.ok, summary: t.summary || '' })),
    tools_active: toolsActive,
    probe: isProbe,
  })
}

// ── Tool definitions (OpenAI function-calling schema; Gemini converts these) ──
// Maps to admin RPCs that re-validate the admin token on the server.
const TOOL_DEFS = [
  { name: 'list_cards', description: 'List all cards in the inventory (number, holder, provider, tier, expiry, balance, status).', parameters: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'list_users', description: 'List all registered users (name, email, plan, active/suspended).', parameters: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'list_payments', description: 'List UPI payment upgrade requests (user, pack, amount, status pending/approved/rejected).', parameters: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'list_orders', description: 'List orders.', parameters: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'inventory', description: 'Card pool by tier (total/active/assigned/available).', parameters: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'stats', description: 'Overall stats (total users, etc.).', parameters: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'user_cards', description: 'List the cards a specific user owns.', parameters: { type: 'object', properties: { user_id: { type: 'string', description: 'User uuid' } }, required: ['user_id'], additionalProperties: false } },
  { name: 'add_card', description: 'Add a NEW card to the inventory. One card per call.', parameters: { type: 'object', properties: {
    card_number: { type: 'string', description: 'Full card number (12-19 digits)' },
    cardholder_name: { type: 'string', description: 'Name on the card' },
    expiry: { type: 'string', description: 'MM/YY' },
    cvv: { type: 'string' },
    provider: { type: 'string', enum: ['Visa', 'Mastercard', 'Amex', 'Discover', 'RuPay'] },
    tier: { type: 'string', enum: ['free', 'spark', 'orbit', 'nova', 'galaxy', 'cosmos', 'infinity'] },
    label: { type: 'string', description: 'Category', enum: ['Netflix', 'Amazon', 'Spotify', 'YouTube', 'Other'] },
    balance_usd: { type: 'number' },
    is_active: { type: 'boolean' },
  }, required: ['card_number', 'cardholder_name', 'expiry', 'cvv'], additionalProperties: false } },
  { name: 'update_card', description: 'Edit an existing card (any subset of fields).', parameters: { type: 'object', properties: {
    id: { type: 'string', description: 'Card uuid' },
    card_number: { type: 'string' }, cardholder_name: { type: 'string' }, expiry: { type: 'string' }, cvv: { type: 'string' },
    provider: { type: 'string' }, tier: { type: 'string' }, label: { type: 'string' }, balance_usd: { type: 'number' }, is_active: { type: 'boolean' },
  }, required: ['id'], additionalProperties: false } },
  { name: 'delete_card', description: 'Permanently delete a card.', parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false } },
  { name: 'toggle_card', description: 'Activate/inactivate a card.', parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false } },
  { name: 'assign_card', description: 'Assign an available card of a tier to a user (one per tier per user).', parameters: { type: 'object', properties: { user_id: { type: 'string' }, tier: { type: 'string', enum: ['spark', 'orbit', 'nova', 'galaxy', 'cosmos', 'infinity'] } }, required: ['user_id', 'tier'], additionalProperties: false } },
  { name: 'remove_user_card', description: 'Remove a card from a user (needs the user_card id — see user_cards).', parameters: { type: 'object', properties: { user_card_id: { type: 'string' } }, required: ['user_card_id'], additionalProperties: false } },
  { name: 'set_user_plan', description: "Change a user's plan (pack tier or free).", parameters: { type: 'object', properties: { user_id: { type: 'string' }, plan: { type: 'string', enum: ['free', 'spark', 'orbit', 'nova', 'galaxy', 'cosmos', 'infinity'] } }, required: ['user_id', 'plan'], additionalProperties: false } },
  { name: 'toggle_user_status', description: 'Suspend or reactivate a user (blocks login).', parameters: { type: 'object', properties: { user_id: { type: 'string' } }, required: ['user_id'], additionalProperties: false } },
  { name: 'approve_payment', description: 'Approve a pending UPI payment request — activates the plan AND auto-assigns the purchased tier card.', parameters: { type: 'object', properties: { request_id: { type: 'string', description: 'upgrade_request uuid (see list_payments)' } }, required: ['request_id'], additionalProperties: false } },
  { name: 'decline_payment', description: 'Decline a pending UPI payment request (user must wait 24h to retry).', parameters: { type: 'object', properties: { request_id: { type: 'string' }, note: { type: 'string', description: 'Optional reason' } }, required: ['request_id'], additionalProperties: false } },
  { name: 'set_setting', description: 'Change a global setting (maintenance on/off, announcement banner, maintenance message, force theme).', parameters: { type: 'object', properties: { key: { type: 'string', enum: ['maintenance', 'announcement', 'maintenance_message', 'force_theme'] }, value: { type: 'string' } }, required: ['key', 'value'], additionalProperties: false } },
  { name: 'get_settings', description: 'Read current global settings.', parameters: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'list_ibans', description: 'List all European IBAN accounts (bank, holder, country, BIC, status).', parameters: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'add_iban', description: 'Add a NEW European IBAN account. It becomes visible to ALL users immediately.', parameters: { type: 'object', properties: {
    iban: { type: 'string', description: 'Full IBAN, e.g. DE89 3704 0044 0532 0130 00' },
    bank_name: { type: 'string', description: 'Bank name' },
    holder_name: { type: 'string', description: 'Account holder name' },
    country: { type: 'string', description: '2-letter country code, e.g. DE, FR, ES' },
    bic: { type: 'string', description: 'BIC / SWIFT code' },
    label: { type: 'string', enum: ['Bank', 'Business', 'Personal', 'Savings', 'Other'] },
    is_active: { type: 'boolean' },
  }, required: ['iban', 'bank_name'], additionalProperties: false } },
  { name: 'update_iban', description: 'Edit an existing IBAN account (any subset of fields).', parameters: { type: 'object', properties: {
    id: { type: 'string', description: 'IBAN uuid' },
    iban: { type: 'string' }, bank_name: { type: 'string' }, holder_name: { type: 'string' }, country: { type: 'string' }, bic: { type: 'string' }, label: { type: 'string' }, is_active: { type: 'boolean' },
  }, required: ['id'], additionalProperties: false } },
  { name: 'delete_iban', description: 'Permanently delete an IBAN account.', parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false } },
  { name: 'toggle_iban', description: 'Activate/inactivate an IBAN account.', parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false } },
]

// ── LLM dispatch ──────────────────────────────────────────────────────────────
async function callLLM(cfg, provider, messages, withTools) {
  if (provider === 'google') {
    return callGemini(cfg, messages, withTools)
  }
  return callOpenAICompat(cfg, provider, messages, withTools)
}

// OpenAI-compatible: OpenAI, Groq, custom providers
async function callOpenAICompat(cfg, provider, messages, withTools) {
  const baseUrl = (cfg.base_url || 'https://api.openai.com/v1').replace(/\/+$/, '')
  const payload = { model: cfg.model, messages: messages.map(sanitizeOpenAIMessage) }
  if (withTools) {
    payload.tools = TOOL_DEFS.map((t) => ({ type: 'function', function: t }))
    payload.tool_choice = 'auto'
  }
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.api_key}`,
    },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const text = (await res.text()).slice(0, 600)
    return { error: `LLM HTTP ${res.status}${text ? `: ${text}` : ''}` }
  }
  const data = await res.json()
  const choice = data?.choices?.[0]
  if (!choice) return { error: 'LLM returned no choices' }
  return { message: choice.message || {} }
}

// Google Gemini — native generateContent (function calling is reliable here)
async function callGemini(cfg, messages, withTools) {
  const baseUrl = (cfg.base_url || 'https://generativelanguage.googleapis.com').replace(/\/+$/, '')
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n')
  const contents = toGeminiContents(messages)
  const payload = {}
  if (system) payload.systemInstruction = { parts: [{ text: system }] }
  payload.contents = contents
  if (withTools) {
    payload.tools = [{ functionDeclarations: TOOL_DEFS.map(toGeminiTool) }]
    payload.toolConfig = { functionCallingConfig: { mode: 'AUTO' } }
  }

  const res = await fetch(`${baseUrl}/v1beta/models/${encodeURIComponent(cfg.model)}:generateContent?key=${encodeURIComponent(cfg.api_key)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const text = (await res.text()).slice(0, 600)
    return { error: `Gemini HTTP ${res.status}${text ? `: ${text}` : ''}` }
  }
  const data = await res.json()
  const candidate = data?.candidates?.[0]
  if (!candidate?.content?.parts) return { error: 'Gemini returned no candidates' }
  const parts = candidate.content.parts
  const text = parts.filter((p) => p.text).map((p) => p.text).join('')
  const fns = parts.filter((p) => p.functionCall)
  if (fns.length === 0) return { message: { content: text || '' } }
  return {
    message: {
      content: text || '',
      tool_calls: fns.map((p, i) => ({
        id: `gemini_call_${i}`,
        type: 'function',
        function: { name: p.functionCall.name, arguments: JSON.stringify(p.functionCall.args || {}) },
      })),
    },
  }
}

// Convert OpenAI-style messages to Gemini contents (handles tool results)
function toGeminiContents(messages) {
  const out = []
  for (const m of messages) {
    if (m.role === 'system') continue
    if (m.role === 'tool') {
      // tool results go back as user-role functionResponse parts
      const name = (m.tool_call_id || '').replace(/^gemini_call_/, '') || ''
      let resp
      try { resp = JSON.parse(m.content || '{}') } catch { resp = { result: m.content } }
      // Gemini keys functionResponse by the ORIGINAL function name; we embed it
      const fnName = m._fnName || name || 'list_cards'
      out.push({ role: 'user', parts: [{ functionResponse: { name: fnName, response: resp } }] })
      continue
    }
    if (m.tool_calls && m.tool_calls.length) {
      // assistant request for a function call
      const parts = m.tool_calls.map((tc) => ({
        functionCall: { name: tc.function.name, args: (() => { try { return JSON.parse(tc.function.arguments || '{}') } catch { return {} } })() },
      }))
      out.push({ role: 'model', parts })
      continue
    }
    out.push({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content || '' }] })
  }
  // Tag tool messages with the function name (Gemini needs it in functionResponse)
  // We set _fnName on tool messages right before pushing them in the loop.
  return out.filter((c) => c.parts && c.parts.length)
}

// OpenAI messages may contain tool_calls; Gemini messages array is rebuilt by
// toGeminiContents so no extra sanitizing needed for Gemini. For OpenAI, drop
// our internal _fnName helper field if present.
function sanitizeOpenAIMessage(m) {
  const copy = { ...m }
  delete copy._fnName
  return copy
}

function toGeminiTool(t) {
  return { name: t.name, description: t.description, parameters: t.parameters }
}

// ── Tool execution ────────────────────────────────────────────────────────────
async function executeTool(rpc, token, name, args) {
  const summary = (d) => {
    if (Array.isArray(d)) return `${d.length} item(s)`
    if (d && typeof d === 'object') {
      if (d.ok === true) return d.error || 'ok'
      return d.error || JSON.stringify(d).slice(0, 120)
    }
    return String(d ?? '').slice(0, 120)
  }
  try {
    let res
    switch (name) {
      case 'list_cards': res = await rpc('admin_cards', { p_token: token }); break
      case 'list_users': res = await rpc('admin_users', { p_token: token }); break
      case 'list_payments': res = await rpc('admin_payments_list', { p_token: token }); break
      case 'list_orders': res = await rpc('admin_orders_list', { p_token: token }); break
      case 'inventory': res = await rpc('admin_inventory', { p_token: token }); break
      case 'stats': res = await rpc('admin_stats', { p_token: token }); break
      case 'user_cards': res = await rpc('admin_user_cards', { p_token: token, p_user_id: args.user_id }); break
      case 'add_card':
        res = await rpc('admin_card_save', {
          p_token: token, p_id: null,
          p_card_number: String(args.card_number || '').replace(/\D/g, ''),
          p_cardholder_name: args.cardholder_name,
          p_expiry: args.expiry, p_cvv: args.cvv,
          p_provider: args.provider || 'Visa',
          p_is_active: args.is_active !== false,
          p_label: args.label || 'Other',
          p_tier: args.tier || 'free',
          p_balance_usd: Number(args.balance_usd) || 0,
        })
        break
      case 'update_card':
        res = await rpc('admin_card_save', {
          p_token: token, p_id: args.id,
          p_card_number: String(args.card_number || '').replace(/\D/g, ''),
          p_cardholder_name: args.cardholder_name,
          p_expiry: args.expiry, p_cvv: args.cvv,
          p_provider: args.provider, p_is_active: args.is_active,
          p_label: args.label, p_tier: args.tier, p_balance_usd: Number(args.balance_usd) || 0,
        })
        break
      case 'delete_card': res = await rpc('admin_card_delete', { p_token: token, p_id: args.id }); break
      case 'toggle_card': res = await rpc('admin_card_toggle', { p_token: token, p_id: args.id }); break
      case 'assign_card': res = await rpc('admin_assign_card', { p_token: token, p_user_id: args.user_id, p_tier: args.tier }); break
      case 'remove_user_card': res = await rpc('admin_remove_user_card', { p_token: token, p_user_card_id: args.user_card_id }); break
      case 'set_user_plan': res = await rpc('admin_set_user_plan', { p_token: token, p_user_id: args.user_id, p_plan: args.plan }); break
      case 'toggle_user_status': res = await rpc('admin_toggle_user_status', { p_token: token, p_user_id: args.user_id }); break
      case 'approve_payment': res = await rpc('admin_payment_approve', { p_token: token, p_request_id: args.request_id }); break
      case 'decline_payment': res = await rpc('admin_payment_decline', { p_token: token, p_request_id: args.request_id, p_note: args.note || 'declined by admin' }); break
      case 'set_setting': res = await rpc('admin_set_setting', { p_token: token, p_key: args.key, p_value: String(args.value) }); break
      case 'list_ibans': res = await rpc('admin_ibans', { p_token: token }); break
      case 'add_iban':
        res = await rpc('admin_iban_save', {
          p_token: token, p_id: null,
          p_iban: String(args.iban || '').replace(/\s/g, ''),
          p_bank_name: args.bank_name,
          p_holder_name: args.holder_name || '',
          p_country: args.country || 'DE',
          p_bic: args.bic || '',
          p_label: args.label || 'Bank',
          p_is_active: args.is_active !== false,
        })
        break
      case 'update_iban':
        res = await rpc('admin_iban_save', {
          p_token: token, p_id: args.id,
          p_iban: String(args.iban || '').replace(/\s/g, ''),
          p_bank_name: args.bank_name,
          p_holder_name: args.holder_name,
          p_country: args.country,
          p_bic: args.bic,
          p_label: args.label,
          p_is_active: args.is_active,
        })
        break
      case 'delete_iban': res = await rpc('admin_iban_delete', { p_token: token, p_id: args.id }); break
      case 'toggle_iban': res = await rpc('admin_iban_toggle', { p_token: token, p_id: args.id }); break
      case 'get_settings': res = await rpc('get_app_settings'); break
      default:
        return { ok: false, summary: `Unknown tool: ${name}` }
    }
    if (res.status >= 400) {
      return { ok: false, summary: `RPC error ${res.status}: ${summary(res.data)}` }
    }
    return { ok: true, summary: summary(res.data), data: res.data }
  } catch (err) {
    return { ok: false, summary: `Exception: ${err.message || err}` }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
// Detect errors that look like "tools / function calling not supported" so we
// can retry without tools instead of failing the whole request.
function looksLikeToolRejection(err) {
  const e = String(err || '').toLowerCase()
  return (
    e.includes('tool') || e.includes('function calling') || e.includes('function_call') ||
    e.includes('not supported') || e.includes('invalid_request_error') ||
    e.includes('additionalproperties') || e.includes('schema')
  ) && (e.includes('400') || e.includes('422') || e.includes('unsupported') || e.includes('not supported'))
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
