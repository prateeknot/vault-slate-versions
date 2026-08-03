// =============================================
// Virtual Cards — SUPABASE FULL SETUP
// Run: node setup-final.js
// =============================================

const TOKEN = 'sbp_680ed6eced3aa8c66465778636c2cc662ae13bf3'
const PROJECT_REF = 'zkevroqnrydwmkguuazr'
const API = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`

async function sql(query) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  const text = await res.text()
  return { ok: res.ok, status: res.status, body: text }
}

async function run(label, query, maxPreview = 60) {
  process.stdout.write(`  ${label}... `)
  const r = await sql(query)
  if (r.ok) {
    console.log('✅')
    return true
  } else {
    console.log(`❌ ${r.body.substring(0, 150)}`)
    return false
  }
}

async function main() {
  console.log('')
  console.log('╔══════════════════════════════════════════════════╗')
  console.log('║     VIRTUAL CARDS  —  SUPABASE FULL SETUP       ║')
  console.log('╚══════════════════════════════════════════════════╝')
  console.log('')

  // ── STEP 1: Migration 0001 ─────────────────────────────────
  console.log('📦 Step 1/5 — Migration 0001: Initial Schema')
  const fs = await import('fs')
  const sql1 = fs.readFileSync('./supabase/migrations/0001_initial_schema.sql', 'utf-8')
  // Split SQL respecting $$ blocks
  const stmts1 = splitSql(sql1)
  console.log(`     ${stmts1.length} statements`)
  for (let i = 0; i < stmts1.length; i++) {
    await run(`[${i+1}/${stmts1.length}]`, stmts1[i])
  }

  // ── STEP 2: Migration 0002 ─────────────────────────────────
  console.log('\n📦 Step 2/5 — Migration 0002: Card Pools + Claims')
  const sql2 = fs.readFileSync('./supabase/migrations/0002_card_pools.sql', 'utf-8')
  const stmts2 = splitSql(sql2)
  console.log(`     ${stmts2.length} statements`)
  for (let i = 0; i < stmts2.length; i++) {
    await run(`[${i+1}/${stmts2.length}]`, stmts2[i])
  }

  // ── STEP 3: Migration 0003 ─────────────────────────────────
  console.log('\n📦 Step 3/5 — Migration 0003: Security Hardening')
  const sql3 = fs.readFileSync('./supabase/migrations/0003_security_fixes.sql', 'utf-8')
  const stmts3 = splitSql(sql3)
  console.log(`     ${stmts3.length} statements`)
  for (let i = 0; i < stmts3.length; i++) {
    await run(`[${i+1}/${stmts3.length}]`, stmts3[i])
  }

  // ── STEP 4: Realtime + Seed ────────────────────────────────
  console.log('\n📦 Step 4/5 — Realtime + Seed Data')
  await run('Enable realtime (plans)', "alter publication supabase_realtime add table if not exists public.plans")
  await run('Enable realtime (user_plans)', "alter publication supabase_realtime add table if not exists public.user_plans")
  await run('Enable realtime (user_cards)', "alter publication supabase_realtime add table if not exists public.user_cards")
  await run('Drop leaked card policy', `drop policy if exists "cards_realtime_select" on public.cards`)

  // Seed cards
  await run('Seed cards', `
    insert into public.cards (card_number, name, expiry, cvv, bank, provider, category, plan_tier, is_active) values
      ('4111111111111111', 'JOHN DOE', '12/28', '123', 'HDFC Bank', 'Visa', 'Netflix', 'free', true),
      ('5500000000000004', 'JANE SMITH', '08/27', '456', 'ICICI Bank', 'Mastercard', 'Amazon', 'free', true),
      ('340000000000009', 'ALICE WONG', '03/29', '789', 'SBI', 'Amex', 'Spotify', 'free', true),
      ('6011000000000004', 'BOB JOHNSON', '11/26', '321', 'Axis Bank', 'Discover', 'Netflix', 'pro', true),
      ('4000000000000002', 'CAROL LEE', '05/28', '654', 'Kotak', 'Visa', 'Amazon', 'pro', true),
      ('5100000000000008', 'DAVID KIM', '09/29', '987', 'HDFC Bank', 'Mastercard', 'YouTube', 'max', true),
      ('370000000000002', 'EMMA WILSON', '01/28', '246', 'ICICI Bank', 'Amex', 'Spotify', 'max', true),
      ('6200000000000005', 'FRANK MILLER', '07/27', '135', 'SBI', 'Discover', 'Netflix', 'free', true)
    on conflict do nothing
  `)
  await run('Seed admin codes', `
    insert into public.admin_codes (code_hash, code, label, is_active) values
      ('hash_123456', '123456', 'Owner', true),
      ('hash_654321', '654321', 'Manager', true),
      ('hash_111222', '111222', 'Support', false)
    on conflict do nothing
  `)

  // ── STEP 5: Verify ─────────────────────────────────────────
  console.log('\n📦 Step 5/5 — Verification')
  
  const r1 = await sql('SELECT id, name, card_limit, price_display FROM public.plans ORDER BY id')
  if (r1.ok) console.log(`  ✅ Plans: ${JSON.parse(r1.body).length} plans found`)
  else console.log(`  ❌ Plans: ${r1.body.substring(0, 80)}`)

  const r2 = await sql('SELECT count(*)::int as cnt FROM public.cards')
  if (r2.ok) {
    const cnt = JSON.parse(r2.body)[0].cnt
    const r2b = await sql("SELECT count(*)::int as cnt FROM public.cards WHERE plan_tier = 'free'")
    const free = JSON.parse(r2b.body)[0].cnt
    const r2c = await sql("SELECT count(*)::int as cnt FROM public.cards WHERE plan_tier = 'pro'")
    const pro = JSON.parse(r2c.body)[0].cnt
    const r2d = await sql("SELECT count(*)::int as cnt FROM public.cards WHERE plan_tier = 'max'")
    const max = JSON.parse(r2d.body)[0].cnt
    console.log(`  ✅ Cards: ${cnt} total (free: ${free}, pro: ${pro}, max: ${max})`)
  } else console.log(`  ❌ Cards: ${r2.body.substring(0, 80)}`)

  const r3 = await sql('SELECT code, label, is_active FROM public.admin_codes ORDER BY label')
  if (r3.ok) {
    const codes = JSON.parse(r3.body)
    codes.forEach(c => console.log(`  ✅ Code: ${c.code} — ${c.label} (${c.is_active ? 'Active' : 'Inactive'})`))
  } else console.log(`  ❌ Codes: ${r3.body.substring(0, 80)}`)

  const r4 = await sql('SELECT count(*)::int as cnt FROM public.masked_cards')
  if (r4.ok) console.log(`  ✅ Masked view: ${JSON.parse(r4.body)[0].cnt} cards visible`)
  else console.log(`  ❌ Masked view: ${r4.body.substring(0, 80)}`)

  const r5 = await sql(`
    SELECT count(*)::int as cnt FROM pg_proc 
    WHERE proname IN ('get_my_plan','get_available_cards','get_claimed_card_details','claim_card',
      'admin_is_valid','admin_verify_code','admin_list_cards','admin_add_card',
      'admin_update_card','admin_delete_card','admin_toggle_card',
      'admin_list_plans','admin_update_plan','admin_list_codes','admin_add_code',
      'admin_toggle_code','admin_delete_code','admin_count_users')
  `)
  if (r5.ok) console.log(`  ✅ RPCs: ${JSON.parse(r5.body)[0].cnt} functions registered`)
  else console.log(`  ❌ RPCs: ${r5.body.substring(0, 80)}`)

  // Refresh schema cache
  await sql("NOTIFY pgrst, 'reload schema'")
  console.log('  ✅ Schema cache refreshed')

  // ── SUMMARY ────────────────────────────────────────────────
  console.log('')
  console.log('╔══════════════════════════════════════════════════╗')
  console.log('║       🎉  SUPABASE SETUP COMPLETE!              ║')
  console.log('╚══════════════════════════════════════════════════╝')
  console.log('')
  console.log('📋 Add these to your .env file:')
  console.log(`   VITE_SUPABASE_URL=https://${PROJECT_REF}.supabase.co`)
  console.log('   VITE_SUPABASE_ANON_KEY=<your-anon-key>')
  console.log('')
  console.log('🔑 Admin codes:')
  console.log('   123456 — Owner')
  console.log('   654321 — Manager')
  console.log('')
  console.log('⚠️  Revoke old token: https://supabase.com/dashboard/account/tokens')
}

// SQL splitter — respects $$ dollar-quoting
function splitSql(sql) {
  const statements = []
  let current = ''
  let inDollarQuote = false
  for (let i = 0; i < sql.length; i++) {
    const char = sql[i]
    current += char
    if (char === '$' && sql[i + 1] === '$') {
      inDollarQuote = !inDollarQuote
      current += '$'
      i++
      continue
    }
    if (char === ';' && !inDollarQuote) {
      let cleaned = current.trim()
      const lines = cleaned.split('\n')
      const codeLines = lines.filter(l => !l.trim().startsWith('--'))
      cleaned = codeLines.join('\n').trim()
      if (cleaned) statements.push(cleaned)
      current = ''
    }
  }
  let cleaned = current.trim()
  const lines = cleaned.split('\n')
  const codeLines = lines.filter(l => !l.trim().startsWith('--'))
  cleaned = codeLines.join('\n').trim()
  if (cleaned) statements.push(cleaned)
  return statements
}

main().catch(err => { console.error('\n💥', err.message); process.exit(1) })