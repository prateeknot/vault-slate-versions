// Cloudflare Pages Function — Turnstile siteverify
// Canonical: browser → this edge function → challenges.cloudflare.com siteverify
// The secret (TURNSTILE_SECRET) lives ONLY in the environment, never in the frontend.
//
// Same behaviour as the old Vercel serverless function (api/verify-turnstile.js),
// converted to Cloudflare Pages Functions format (onRequest + Request/Response).
// Cloudflare Pages: functions/ dir → deployed at /api/verify-turnstile

export async function onRequest(context) {
  const { request, env } = context

  // Only POST
  if (request.method !== 'POST') {
    return json({ success: false, error: 'method_not_allowed' }, 405)
  }

  // Read the token from the body (cf-turnstile-response from the widget)
  let body
  try {
    body = await request.json()
  } catch {
    return json({ success: false, error: 'invalid_json' }, 400)
  }
  const token = body?.token
  if (!token) {
    return json({ success: false, error: 'missing_token' }, 400)
  }

  const secret = env.TURNSTILE_SECRET
  if (!secret) {
    console.error('Missing TURNSTILE_SECRET environment variable')
    return json({ success: false, error: 'server_misconfigured' }, 500)
  }

  // Client IP (best-effort, for the remoteip param) — Cloudflare-native header
  // with x-forwarded-for fallback (important: use the trusted gateway value, not
  // the client-spoofable first hop).
  const clientIp =
    request.headers.get('cf-connecting-ip') ||
    (request.headers.get('x-forwarded-for') || '').split(',').pop()?.trim() ||
    ''

  let result
  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        secret,
        response: token,
        ...(clientIp ? { remoteip: clientIp } : {}),
      }),
    })
    if (!r.ok) {
      console.error('siteverify HTTP error:', r.status)
      return json({ success: false, error: 'siteverify_unreachable' }, 502)
    }
    result = await r.json()
  } catch (err) {
    // Network error or non-JSON body — fail closed
    console.error('siteverify exception:', err)
    return json({ success: false, error: 'siteverify_failed' }, 502)
  }

  if (!result.success) {
    console.error('Turnstile verification failed:', JSON.stringify(result))
    return json({ success: false, error: 'not_human', codes: result['error-codes'] || [] }, 403)
  }

  return json({ success: true }, 200)
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
