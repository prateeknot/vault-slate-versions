// SECURITY: never hardcode tokens. The old sbp_v0_... token was committed to
// this repo — revoke it at https://supabase.com/dashboard/account/tokens and
// use environment variables instead.
// Usage: SUPABASE_ACCESS_TOKEN=xxx SUPABASE_PROJECT_REF=yyy node enable-realtime.js
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF

if (!TOKEN || !PROJECT_REF) {
  console.error('Missing SUPABASE_ACCESS_TOKEN / SUPABASE_PROJECT_REF environment variables.')
  process.exit(1)
}

const SQL_STATEMENTS = [
  // Enable real-time on plans + user_plans (user_cards is enabled in migration 0002)
  'alter publication supabase_realtime add table public.plans',
  'alter publication supabase_realtime add table public.user_plans',
  // Cleanup: this policy previously leaked full card data via realtime.
  // Cards are no longer directly readable (see migration 0003).
  'drop policy if exists "cards_realtime_select" on public.cards',
]

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
  for (let i = 0; i < SQL_STATEMENTS.length; i++) {
    const preview = SQL_STATEMENTS[i].substring(0, 60)
    process.stdout.write(`[${i + 1}/${SQL_STATEMENTS.length}] ${preview}... `)
    const result = await runQuery(SQL_STATEMENTS[i])
    if (result.status === 200 || result.status === 201) {
      console.log('✅')
    } else {
      console.log(`❌ ${result.body.substring(0, 200)}`)
    }
  }
  console.log('\nReal-time enabled!')
}

main().catch(console.error)