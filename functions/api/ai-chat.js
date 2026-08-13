// Cloudflare Pages Function — AI Assistant chat (Phase 2)
//
// Flow:
//   browser (admin panel) → POST /api/ai-chat { token, message }
//   → 1. validates the admin session (vs_admin_code_id via admin_ping)
//   → 2. loads AI config + last 100 history messages from Supabase
//   → 3. calls the LLM (OpenAI-compatible chat/completions — works for
//        OpenAI, Google Gemini via its OpenAI-compat endpoint, or any
//        custom OpenAI-compatible provider) with tools + history context
//   → 4. executes any tool_calls the model makes (mapped to admin RPCs
//        using the SAME admin token), feeds results back, repeats
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
    return json({ success: false, error: 'no_model', hint: 'Set a model name (e.g. gpt-4o-mini or gemini-2.0-flash).' }, 403)
  }

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

  // 3. Build the LLM request (OpenAI-compatible)
  const baseUrl = (cfg.base_url || 'https://api.openai.com/v1').replace(/\/+$/, '')
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

  // 4. Tool loop (bounded)
  const toolResults = []
  const MAX_LOOPS = 8
  let finalText = ''
  let conversation = messages.slice()

  for (let loop = 0; loop < MAX_LOOPS; loop++) {
    const llm = await callLLM(cfg, baseUrl, conversation, AI_TOOLS)
    if (llm.error) {
      return json({ success: false, error: 'llm_error', detail: llm.error }, 502)
    }
    const msg = llm.message || {}
    const toolCalls = msg.tool_calls || []

    if (toolCalls.length === 0) {
      finalText = msg.content || '…'
      break
    }

    conversation.push({ role: 'assistant', content: msg.content || '', tool_calls: toolCalls })

    for (const tc of toolCalls) {
      const fn = tc.function || {}
      const name = fn.name || ''
      let args = {}
      try { args = JSON.parse(fn.arguments || '{}') } catch { args = {} }
      const result = await executeTool(rpc, token, name, args)
      toolResults.push({ name, args, ...result })
      conversation.push({
        role: 'tool',
        tool_call_id: tc.id,
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
    probe: isProbe,
  })
}

// ── Tool definitions (OpenAI function-calling schema) ─────────────────────────
// Maps to admin RPCs that re-validate the admin token on the server.
const AI_TOOLS = [
  { type: 'function', function: { name: 'list_cards', description: 'List all cards in the inventory (number, holder, provider, tier, expiry, balance, status).', parameters: { type: 'object', properties: {}, additionalProperties: false } } },
  { type: 'function', function: { name: 'list_users', description: 'List all registered users (name, email, plan, active/suspended).', parameters: { type: 'object', properties: {}, additionalProperties: false } } },
  { type: 'function', function: { name: 'list_payments', description: 'List UPI payment upgrade requests (user, pack, amount, status pending/approved/rejected).', parameters: { type: 'object', properties: {}, additionalProperties: false } } },
  { type: 'function', function: { name: 'list_orders', description: 'List orders.', parameters: { type: 'object', properties: {}, additionalProperties: false } } },
  { type: 'function', function: { name: 'inventory', description: 'Card pool by tier (total/active/assigned/available).', parameters: { type: 'object', properties: {}, additionalProperties: false } } },
  { type: 'function', function: { name: 'stats', description: 'Overall stats (total users, etc.).', parameters: { type: 'object', properties: {}, additionalProperties: false } } },
  { type: 'function', function: { name: 'user_cards', description: 'List the cards a specific user owns.', parameters: { type: 'object', properties: { user_id: { type: 'string', description: 'User uuid' } }, required: ['user_id'], additionalProperties: false } } },
  { type: 'function', function: { name: 'add_card', description: 'Add a NEW card to the inventory. One card per call.', parameters: { type: 'object', properties: {
    card_number: { type: 'string', description: 'Full card number (12-19 digits)' },
    cardholder_name: { type: 'string', description: 'Name on the card' },
    expiry: { type: 'string', description: 'MM/YY' },
    cvv: { type: 'string' },
    provider: { type: 'string', enum: ['Visa', 'Mastercard', 'Amex', 'Discover', 'RuPay'] },
    tier: { type: 'string', enum: ['free', 'spark', 'orbit', 'nova', 'galaxy', 'cosmos', 'infinity'] },
    label: { type: 'string', description: 'Category', enum: ['Netflix', 'Amazon', 'Spotify', 'YouTube', 'Other'] },
    balance_usd: { type: 'number' },
    is_active: { type: 'boolean' },
  }, required: ['card_number', 'cardholder_name', 'expiry', 'cvv'], additionalProperties: false } } },
  { type: 'function', function: { name: 'update_card', description: 'Edit an existing card (any subset of fields).', parameters: { type: 'object', properties: {
    id: { type: 'string', description: 'Card uuid' },
    card_number: { type: 'string' }, cardholder_name: { type: 'string' }, expiry: { type: 'string' }, cvv: { type: 'string' },
    provider: { type: 'string' }, tier: { type: 'string' }, label: { type: 'string' }, balance_usd: { type: 'number' }, is_active: { type: 'boolean' },
  }, required: ['id'], additionalProperties: false } } },
  { type: 'function', function: { name: 'delete_card', description: 'Permanently delete a card.', parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false } } },
  { type: 'function', function: { name: 'toggle_card', description: 'Activate/inactivate a card.', parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false } } },
  { type: 'function', function: { name: 'assign_card', description: 'Assign an available card of a tier to a user (one per tier per user).', parameters: { type: 'object', properties: { user_id: { type: 'string' }, tier: { type: 'string', enum: ['spark', 'orbit', 'nova', 'galaxy', 'cosmos', 'infinity'] } }, required: ['user_id', 'tier'], additionalProperties: false } } },
  { type: 'function', function: { name: 'remove_user_card', description: 'Remove a card from a user (needs the user_card id — see user_cards).', parameters: { type: 'object', properties: { user_card_id: { type: 'string' } }, required: ['user_card_id'], additionalProperties: false } } },
  { type: 'function', function: { name: 'set_user_plan', description: "Change a user's plan (pack tier or free).", parameters: { type: 'object', properties: { user_id: { type: 'string' }, plan: { type: 'string', enum: ['free', 'spark', 'orbit', 'nova', 'galaxy', 'cosmos', 'infinity'] } }, required: ['user_id', 'plan'], additionalProperties: false } } },
  { type: 'function', function: { name: 'toggle_user_status', description: 'Suspend or reactivate a user (blocks login).', parameters: { type: 'object', properties: { user_id: { type: 'string' } }, required: ['user_id'], additionalProperties: false } } },
  { type: 'function', function: { name: 'approve_payment', description: 'Approve a pending UPI payment request — activates the plan AND auto-assigns the purchased tier card.', parameters: { type: 'object', properties: { request_id: { type: 'string', description: 'upgrade_request uuid (see list_payments)' } }, required: ['request_id'], additionalProperties: false } } },
  { type: 'function', function: { name: 'decline_payment', description: 'Decline a pending UPI payment request (user must wait 24h to retry).', parameters: { type: 'object', properties: { request_id: { type: 'string' }, note: { type: 'string', description: 'Optional reason' } }, required: ['request_id'], additionalProperties: false } } },
  { type: 'function', function: { name: 'set_setting', description: 'Change a global setting (maintenance on/off, announcement banner, maintenance message, force theme).', parameters: { type: 'object', properties: { key: { type: 'string', enum: ['maintenance', 'announcement', 'maintenance_message', 'force_theme'] }, value: { type: 'string' } }, required: ['key', 'value'], additionalProperties: false } } },
  { type: 'function', function: { name: 'get_settings', description: 'Read current global settings.', parameters: { type: 'object', properties: {}, additionalProperties: false } } },
]

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

// ── LLM call (OpenAI-compatible) ─────────────────────────────────────────────
async function callLLM(cfg, baseUrl, messages, tools) {
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.api_key}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      messages,
      tools,
      tool_choice: 'auto',
    }),
  })
  if (!res.ok) {
    const text = (await res.text()).slice(0, 500)
    return { error: `LLM HTTP ${res.status}: ${text}` }
  }
  const data = await res.json()
  const choice = data?.choices?.[0]
  if (!choice) return { error: 'LLM returned no choices' }
  return { message: choice.message || {} }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
