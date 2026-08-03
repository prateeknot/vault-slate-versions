import { readFileSync } from 'fs'

// SECURITY: never hardcode tokens. The old sbp_v0_... token was committed to
// this repo — revoke it at https://supabase.com/dashboard/account/tokens and
// use environment variables instead.
// Usage: SUPABASE_ACCESS_TOKEN=xxx SUPABASE_PROJECT_REF=yyy node apply-sql.js [path-to.sql]
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF
const SQL_FILE = process.argv[2] || './supabase/migrations/0002_card_pools.sql'
const SQL = readFileSync(SQL_FILE, 'utf-8')

if (!TOKEN || !PROJECT_REF) {
  console.error('Missing SUPABASE_ACCESS_TOKEN / SUPABASE_PROJECT_REF environment variables.')
  process.exit(1)
}

// Split SQL into individual statements (split on semicolons, but respect $$ blocks)
function splitSql(sql) {
  const statements = []
  let current = ''
  let inDollarQuote = false

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i]
    current += char

    // Check for $$ dollar-quote blocks
    if (char === '$' && sql[i + 1] === '$') {
      inDollarQuote = !inDollarQuote
      current += '$'
      i++ // skip next $
      continue
    }

    // Split on semicolon only if not inside $$ block
    if (char === ';' && !inDollarQuote) {
      // Strip comment lines from the beginning of each statement
      let cleaned = current.trim()
      const lines = cleaned.split('\n')
      const codeLines = lines.filter(l => !l.trim().startsWith('--'))
      cleaned = codeLines.join('\n').trim()
      if (cleaned) {
        statements.push(cleaned)
      }
      current = ''
    }
  }

  // Add any remaining statement
  let cleaned = current.trim()
  const lines = cleaned.split('\n')
  const codeLines = lines.filter(l => !l.trim().startsWith('--'))
  cleaned = codeLines.join('\n').trim()
  if (cleaned) {
    statements.push(cleaned)
  }

  return statements
}

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
  const statements = splitSql(SQL)
  console.log(`Found ${statements.length} SQL statements to execute\n`)

  let success = 0
  let failed = 0

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i]
    const preview = stmt.substring(0, 60).replace(/\n/g, ' ')
    process.stdout.write(`[${i + 1}/${statements.length}] ${preview}... `)

    const result = await runQuery(stmt)
    if (result.status === 200 || result.status === 201) {
      console.log('✅')
      success++
    } else {
      console.log(`❌ ${result.status}: ${result.body.substring(0, 200)}`)
      failed++
    }
  }

  console.log(`\nDone: ${success} succeeded, ${failed} failed`)
}

main().catch(console.error)