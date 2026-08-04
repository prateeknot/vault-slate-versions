// Quick check: does the V2 packs system exist on Supabase?
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

// Parse .env manually
const env = {};
for (const line of fs.readFileSync('.env', 'utf-8').split('\n')) {
  const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function main() {
  // 1. Check if available_packs RPC exists
  const { data: packs, error: packsErr } = await supabase.rpc('available_packs');
  console.log('=== available_packs ===');
  if (packsErr) {
    console.log('ERROR:', packsErr.message);
  } else {
    console.log('SUCCESS — packs found:', JSON.stringify(packs, null, 2));
  }

  // 2. Check if my_card RPC exists
  const { data: myCard, error: myCardErr } = await supabase.rpc('my_card');
  console.log('\n=== my_card ===');
  if (myCardErr) {
    console.log('ERROR:', myCardErr.message);
  } else {
    console.log('SUCCESS — my_card:', JSON.stringify(myCard, null, 2));
  }

  // 3. Check if packs table exists via a public RPC
  const { data: claimFree, error: claimFreeErr } = await supabase.rpc('claim_free_card');
  console.log('\n=== claim_free_card ===');
  if (claimFreeErr) {
    console.log('ERROR:', claimFreeErr.message);
  } else {
    console.log('SUCCESS — claim_free_card:', JSON.stringify(claimFree, null, 2));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });