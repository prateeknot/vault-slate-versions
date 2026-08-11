// Vercel Serverless Function — Turnstile siteverify
// Canonical: browser → this backend → challenges.cloudflare.com siteverify
// The secret (TURNSTILE_SECRET) lives ONLY in the environment, never in the frontend.

export default async function handler(req, res) {
    // Only POST
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'method_not_allowed' })
    }

    // Read the token from the body (cf-turnstile-response from the widget)
    const { token } = req.body || {}
    if (!token) {
        return res.status(400).json({ success: false, error: 'missing_token' })
    }

    const secret = process.env.TURNSTILE_SECRET
    if (!secret) {
        console.error('Missing TURNSTILE_SECRET environment variable')
        return res.status(500).json({ success: false, error: 'server_misconfigured' })
    }

    // Client IP (best-effort, for the remoteip param)
    const clientIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || ''

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
            return res.status(502).json({ success: false, error: 'siteverify_unreachable' })
        }
        result = await r.json()
    } catch (err) {
        // Network error or non-JSON body — fail closed
        console.error('siteverify exception:', err)
        return res.status(502).json({ success: false, error: 'siteverify_failed' })
    }

    if (!result.success) {
        console.error('Turnstile verification failed:', JSON.stringify(result))
        return res.status(403).json({ success: false, error: 'not_human', codes: result['error-codes'] || [] })
    }

    return res.json({ success: true })
}