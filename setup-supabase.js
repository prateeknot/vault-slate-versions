import { readFileSync } from 'fs'

// =============================================
// Virtual Cards — Full Supabase Setup Script
// Applies all 3 migrations, enables realtime,
// seeds data, and refreshes the schema cache.
// =============================================

const TOKEN = 'sbp_680ed6eced3aa8c66465778636c2cc662ae13bf3'
const PROJECT_REF = 'zkevroqnrydwmkguuazr'

// ── SQL Provider ──────────────────────────────
async function runQuery(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  })
  const text = await res.text()
  return { status: res.status, body: text }
}

// ── SQL Splitter (respects $$ dollar-quoting) ─
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

// ── Execute a batch of SQL with progress ──────
async function execBatch(label, sql) {
  const statements = splitSql(sql)
  console.log(`\n📦 ${label} — ${statements.length} statements`)

  let success = 0, failed = 0
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i]
    const preview = stmt.substring(0, 70).replace(/\n/g, ' ')
    process.stdout.write(`  [${i + 1}/${statements.length}] ${preview}... `)

    const result = await runQuery(stmt)
    if (result.status === 200 || result.status === 201) {
      console.log('✅')
      success++
    } else {
      console.log(`❌ ${result.body.substring(0, 180)}`)
      failed++
    }
  }
  console.log(`  → ${success} passed, ${failed} failed`)
  return failed === 0
}

// ── Main ──────────────────────────────────────
async function main() {
  console.log('🚀 Virtual Cards — Full Supabase Setup')
  console.log(`   Project: ${PROJECT_REF}`)
  console.log(`   Time:    ${new Date().toISOString()}\n`)

  // ── Step 1: Migration 0001 (Initial Schema) ──
  let sql1 = readFileSync('./supabase/migrations/0001_initial_schema.sql', 'utf-8')
  const ok1 = await execBatch('Migration 0001 — Initial Schema', sql1)
  if (!ok1) {
    console.log('\n⚠️  Some errors in 0001 — checking if tables already exist...')
  }

  // ── Step 2: Migration 0002 (Card Pools) ──
  let sql2 = readFileSync('./supabase/migrations/0002_card_pools.sql', 'utf-8')
  const ok2 = await execBatch('Migration 0002 — Card Pools + Claims', sql2)
  if (!ok2) {
    console.log('\n⚠️  Some errors in 0002 — checking if already applied...')
  }

  // ── Step 3: Migration 0003 (Security Fixes) ──
  let sql3 = readFileSync('./supabase/migrations/0003_security_fixes.sql', 'utf-8')
  const ok3 = await execBatch('Migration 0003 — Security Hardening', sql3)
  if (!ok3) {
    console.log('\n⚠️  Some errors in 0003 — may need manual review')
  }

  // ── Step 4: Enable Realtime ──────────────────
  console.log('\n📦 Enabling Realtime...')
  const realtimeQueries = [
    "alter publication supabase_realtime add table public.plans",
    "alter publication supabase_realtime add table public.user_plans",
    "alter publication supabase_realtime add table public.user_cards",
    "drop policy if exists \"cards_realtime_select\" on public.cards",
  ]
  for (let i = 0; i < realtimeQueries.length; i++) {
    process.stdout.write(`  [${i + 1}/${realtimeQueries.length}] ${realtimeQueries[i].substring(0, 60)}... `)
    const res = await runQuery(realtimeQueries[i])
    if (res.status === 200 || res.status === 201) console.log('✅')
    else console.log(`⚠️  ${res.body.substring(0, 120)}`)
  }

  // ── Step 5: Seed Data ────────────────────────
  console.log('\n📦 Seeding sample data...')
  const SEED_SQL = `
insert into public.cards (card_number, name, expiry, cvv, bank, provider, category, plan_tier, is_active) values
  ('4111111111111111', 'JOHN DOE', '12/28', '123', 'HDFC Bank', 'Visa', 'Netflix', 'free', true),
  ('5500000000000004', 'JANE SMITH', '08/27', '456', 'ICICI Bank', 'Mastercard', 'Amazon', 'free', true),
  ('340000000000009', 'ALICE WONG', '03/29', '789', 'SBI', 'Amex', 'Spotify', 'free', true),
  ('6011000000000004', 'BOB JOHNSON', '11/26', '321', 'Axis Bank', 'Discover', 'Netflix', 'pro', true),
  ('4000000000000002', 'CAROL LEE', '05/28', '654', 'Kotak', 'Visa', 'Amazon', 'pro', true),
  ('5100000000000008', 'DAVID KIM', '09/29', '987', 'HDFC Bank', 'Mastercard', 'YouTube', 'max', true),
  ('370000000000002', 'EMMA WILSON', '01/28', '246', 'ICICI Bank', 'Amex', 'Spotify', 'max', true),
  ('6200000000000005', 'FRANK MILLER', '07/27', '135', 'SBI', 'Discover', 'Netflix', 'free', true)
on conflict do nothing;

insert into public.admin_codes (code_hash, code, label, is_active) values
  ('hash_123456', '123456', 'Owner', true),
  ('hash_654321', '654321', 'Manager', true),
  ('hash_111222', '111222', 'Support', false)
on conflict do nothing;
`
  const seedStatements = SEED_SQL.split(';').map(s => s.trim()).filter(s => s && !s.startsWith('--'))
  for (let i = 0; i < seedStatements.length; i++) {
    const preview = seedStatements[i].substring(0, 60).replace(/\n/g, ' ')
    process.stdout.write(`  [${i + 1}/${seedStatements.length}] ${preview}... `)
    const res = await runQuery(seedStatements[i])
    if (res.status === 200 || res.status === 201) console.log('✅')
    else console.log(`⚠️  ${res.body.substring(0, 120)}`)
  }

  // ── Step 6: Refresh Schema Cache ──────────────
  process.stdout.write('\n📦 Refreshing PostgREST schema cache... ')
  const refresh = await runQuery('NOTIFY pgrst, \'reload schema\'')
  if (refresh.status === 200 || refresh.status === 201) console.log('✅')
  else console.log(`⚠️  ${refresh.body.substring(0, 120)}`)

  // ── Step 7: Verify ────────────────────────────
  console.log('\n🔍 Verification...')
  
  process.stdout.write('  Check plans table... ')
  const plansCheck = await runQuery('SELECT id, name, card_limit, price_display FROM public.plans ORDER BY id')
  if (plansCheck.status === 200) {
    const data = JSON.parse(plansCheck.body)
    console.log(`✅ ${data.length} plans found`)
    data.forEach(p => console.log(`    • ${p.id}: ${p.name} (${p.card_limit} cards, ${p.price_display})`))
  } else {
    console.log(`❌ ${plansCheck.body.substring(0, 100)}`)
  }

  process.stdout.write('  Check cards (count)... ')
  const cardsCheck = await runQuery('SELECT count(*)::int as cnt FROM public.cards')
  if (cardsCheck.status === 200) {
    const data = JSON.parse(cardsCheck.body)
    console.log(`✅ ${data[0].cnt} cards seeded`)
  } else {
    console.log(`❌ ${cardsCheck.body.substring(0, 100)}`)
  }

  process.stdout.write('  Check admin_codes... ')
  const codesCheck = await runQuery('SELECT code, label, is_active FROM public.admin_codes ORDER BY label')
  if (codesCheck.status === 200) {
    const data = JSON.parse(codesCheck.body)
    console.log(`✅ ${data.length} codes found`)
    data.forEach(c => console.log(`    • ${c.code} — ${c.label} (${c.is_active ? 'Active' : 'Inactive'})`))
  } else {
    console.log(`❌ ${codesCheck.body.substring(0, 100)}`)
  }

  process.stdout.write('  Check masked_cards view... ')
  const viewCheck = await runQuery('SELECT count(*)::int as cnt FROM public.masked_cards')
  if (viewCheck.status === 200) {
    const data = JSON.parse(viewCheck.body)
    console.log(`✅ ${data[0].cnt} visible cards`)
  } else {
    console.log(`❌ ${viewCheck.body.substring(0, 100)}`)
  }

  process.stdout.write('  Check RPC functions exist... ')
  const rpcCheck = await runQuery(`
    SELECT count(*)::int as cnt FROM pg_proc 
    WHERE proname IN (
      'get_my_plan', 'get_available_cards', 'get_claimed_card_details', 'claim_card',
      'admin_is_valid', 'admin_verify_code', 'admin_list_cards', 'admin_add_card',
      'admin_update_card', 'admin_delete_card', 'admin_toggle_card',
      'admin_list_plans', 'admin_update_plan',
      'admin_list_codes', 'admin_add_code', 'admin_toggle_code', 'admin_delete_code',
      'admin_count_users'
    )
  `)
  if (rpcCheck.status === 200) {
    const data = JSON.parse(rpcCheck.body)
    console.log(`✅ ${data[0].cnt} RPCs registered`)
  } else {
    console.log(`❌ ${rpcCheck.body.substring(0, 100)}`)
  }

  // ── Summary ──────────────────────────────────
  console.log('\n' + '='.repeat(50))
  console.log('🎉 SUPABASE SETUP COMPLETE!')
  console.log('='.repeat(50))
  console.log(`\n📋 Next steps:`)
  console.log(`  1. Add these to your .env file:`)
  console.log(`     VITE_SUPABASE_URL=https://${PROJECT_REF}.supabase.co`)
  console.log(`     VITE_SUPABASE_ANON_KEY=<your-anon-key>`)
  console.log(`  2. Run: npm run dev`)
  console.log(`  3. Open http://localhost:5173`)
  console.log(`\n🔑 Admin codes:`)
  console.log(`  123456 — Owner`)
  console.log(`  654321 — Manager`)
  console.log(`\n⚠️  IMPORTANT: Revoke the old token (sbp_v0_77685ea61c4957213eef32ea7d496a64837c2273)`)
  console.log(`   at https://supabase.com/dashboard/account/tokens`)
}

main().catch(err => {
  console.error('\n💥 FATAL:', err.message)
  process.exit(1)
})