// SECURITY: never hardcode tokens. The old sbp_v0_... token was committed to
// this repo — revoke it at https://supabase.com/dashboard/account/tokens and
// use environment variables instead.
// Usage: SUPABASE_ACCESS_TOKEN=xxx SUPABASE_PROJECT_REF=yyy node seed-sql.js
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF

if (!TOKEN || !PROJECT_REF) {
  console.error('Missing SUPABASE_ACCESS_TOKEN / SUPABASE_PROJECT_REF environment variables.')
  process.exit(1)
}

const SEED_SQL = `
-- Seed cards
insert into public.cards (card_number, name, expiry, cvv, bank, provider, category, is_active) values
  ('4111111111111111', 'JOHN DOE', '12/28', '123', 'HDFC Bank', 'Visa', 'Netflix', true),
  ('5500000000000004', 'JANE SMITH', '08/27', '456', 'ICICI Bank', 'Mastercard', 'Amazon', true),
  ('340000000000009', 'ALICE WONG', '03/29', '789', 'SBI', 'Amex', 'Spotify', true),
  ('6011000000000004', 'BOB JOHNSON', '11/26', '321', 'Axis Bank', 'Discover', 'Netflix', true),
  ('4000000000000002', 'CAROL LEE', '05/28', '654', 'Kotak', 'Visa', 'Amazon', true),
  ('5100000000000008', 'DAVID KIM', '09/29', '987', 'HDFC Bank', 'Mastercard', 'YouTube', true),
  ('370000000000002', 'EMMA WILSON', '01/28', '246', 'ICICI Bank', 'Amex', 'Spotify', true),
  ('6200000000000005', 'FRANK MILLER', '07/27', '135', 'SBI', 'Discover', 'Netflix', true)
on conflict do nothing;

-- Seed admin codes (code stored in plaintext for demo — in production use hashing)
insert into public.admin_codes (code_hash, code, label, is_active) values
  ('hash_123456', '123456', 'Owner', true),
  ('hash_654321', '654321', 'Manager', true),
  ('hash_111222', '111222', 'Support', false)
on conflict do nothing;
`

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

async function main() {
  // Split on semicolons
  const statements = SEED_SQL.split(';').map(s => s.trim()).filter(s => s && !s.startsWith('--'))

  for (let i = 0; i < statements.length; i++) {
    const preview = statements[i].substring(0, 60).replace(/\n/g, ' ')
    process.stdout.write(`[${i + 1}/${statements.length}] ${preview}... `)
    const result = await runQuery(statements[i])
    if (result.status === 200 || result.status === 201) {
      console.log('✅')
    } else {
      console.log(`❌ ${result.body.substring(0, 200)}`)
    }
  }
  console.log('\nSeed data inserted!')

  // Refresh PostgREST schema cache — fixes "column not found" errors
  process.stdout.write('\nRefreshing schema cache... ')
  const refreshResult = await runQuery('NOTIFY pgrst, \'reload schema\'')
  if (refreshResult.status === 200 || refreshResult.status === 201) {
    console.log('✅')
  } else {
    console.log(`❌ ${refreshResult.body.substring(0, 200)}`)
  }
}

main().catch(console.error)
