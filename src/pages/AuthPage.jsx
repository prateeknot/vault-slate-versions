import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { AUTH_INPUT_BASE } from '../constants'
import { setAdminToken } from '../utils'

// Auth — sign in / sign up / guest + admin code login

export function AuthPage({ onLogin, onAdminLogin, onNavigate }) {
  const [mode, setMode] = useState('user')
  const [isLogin, setIsLogin] = useState(true)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const plan = 'free' // static — no state needed (v9.0.1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [googleNotice, setGoogleNotice] = useState(false)

  const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || '0x4AAAAAAEMyGZlQOjX7EQJK'
  const [turnstileToken, setTurnstileToken] = useState('')
  const [turnstileFailed, setTurnstileFailed] = useState(false)
  const turnstileRef = useRef(null)
  const turnstileIdRef = useRef(null)

  const renderTurnstile = useCallback(() => {
    if (!window.turnstile || !turnstileRef.current || !SITE_KEY) return
    if (turnstileIdRef.current) {
      window.turnstile.remove(turnstileIdRef.current)
      turnstileIdRef.current = null
    }
    turnstileIdRef.current = window.turnstile.render(turnstileRef.current, {
      sitekey: SITE_KEY,
      theme: 'light',
      callback: (token) => setTurnstileToken(token),
      'expired-callback': () => setTurnstileToken(''),
      'error-callback': () => setTurnstileToken(''),
    })
  }, [SITE_KEY])

  useEffect(() => {
    const failTimer = setTimeout(() => {
      if (!window.turnstile) setTurnstileFailed(true)
    }, 6000)
    if (window.turnstile) {
      renderTurnstile()
    } else {
      const checkInterval = setInterval(() => {
        if (window.turnstile) {
          clearInterval(checkInterval)
          clearTimeout(failTimer)
          setTurnstileFailed(false)
          renderTurnstile()
        }
      }, 300)
      return () => { clearInterval(checkInterval); clearTimeout(failTimer) }
    }
    return () => clearTimeout(failTimer)
  }, [renderTurnstile])

  useEffect(() => () => {
    if (turnstileIdRef.current && window.turnstile) {
      try { window.turnstile.remove(turnstileIdRef.current) } catch { }
    }
  }, [])

  const [adminCode, setAdminCode] = useState(['', '', '', '', '', ''])
  const [adminError, setAdminError] = useState('')
  const [adminLoading, setAdminLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    // ── Strict Input Validation ──
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
    if (!email || !emailRegex.test(email)) { setError('Please enter a valid email address.'); return }
    if (!password) { setError('Please enter your password.'); return }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
      setError('Password must contain uppercase, lowercase, and a number.')
      return
    }
    if (!isLogin && !name) { setError('Please enter your name.'); return }
    if (!isLogin && (name.length < 2 || name.length > 50)) { setError('Name must be 2-50 characters.'); return }
    if (!isLogin && !/^[a-zA-Z\s'-]+$/.test(name)) { setError('Name can only contain letters, spaces, hyphens, and apostrophes.'); return }
    if (SITE_KEY && !turnstileToken && !turnstileFailed) { setError('Please complete the security check.'); return }
    setLoading(true)
    try {
      if (SITE_KEY && turnstileToken) {
        const verifyRes = await fetch('/api/verify-turnstile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: turnstileToken }),
        })
        // Check the HTTP status BEFORE consuming the response body (v9.0.1)
        const verifyJson = verifyRes.ok ? await verifyRes.json().catch(() => ({})) : null
        if (!verifyJson?.success) {
          setError('Security verification failed. Please try again.')
          window.turnstile?.reset()
          setTurnstileToken('')
          setLoading(false)
          return
        }
      }
      if (isLogin) {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
        if (signInError) throw signInError
        onLogin({ email, name: email.split('@')[0], plan: 'free' })
      } else {
        const { error: signUpError } = await supabase.auth.signUp({
          email, password,
          options: { data: { full_name: name } },
        })
        if (signUpError) throw signUpError
        onLogin({ email, name, plan })
      }
    } catch (err) {
      console.error('Auth error:', err)
      setError('Authentication failed. Please check your credentials and try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleAdminCodeChange = (index, val) => {
    if (!/^\d?$/.test(val)) return
    const next = [...adminCode]
    next[index] = val
    setAdminCode(next)
    setAdminError('')
    if (val && index < 5) {
      const nextInput = document.getElementById(`acode-${index + 1}`)
      nextInput?.focus()
    }
    if (val && index === 5) {
      const code = next.join('')
      if (code.length === 6) handleAdminSubmit(code)
    }
  }

  const handleAdminKeyDown = (index, e) => {
    if (e.key === 'Backspace') {
      if (adminCode[index]) {
        const next = [...adminCode]; next[index] = ''; setAdminCode(next)
      } else if (index > 0) {
        const next = [...adminCode]; next[index - 1] = ''; setAdminCode(next)
        document.getElementById(`acode-${index - 1}`)?.focus()
      }
    }
  }

  const handleAdminSubmit = async (code) => {
    const finalCode = code ?? adminCode.join('')
    if (finalCode.length < 6) { setAdminError('Enter all 6 digits'); return }
    setAdminLoading(true)
    setAdminError('')
    try {
      const { data, error } = await supabase.rpc('admin_login', { p_code: finalCode })
      if (error) throw error
      if (!data?.ok) {
        if (data?.error === 'COOLDOWN') {
          setAdminError(`Too many attempts. Try again in ${data.retry_after}s`)
        } else {
          setAdminError('Invalid admin code. Try again.')
        }
        setAdminCode(['', '', '', '', '', ''])
        setAdminLoading(false)
        setTimeout(() => document.getElementById('acode-0')?.focus(), 50)
        return
      }
      setAdminToken(data.session_token)
      setAdminLoading(false)
      onAdminLogin(data)
    } catch (err) {
      console.error('Admin login error:', err)
      setAdminLoading(false)
      setAdminError('Verification failed. Please try again.')
    }
  }

  const handleGuestLogin = () => {
    onLogin({ email: 'guest@vcardz.app', name: 'Guest User', plan: 'free', isGuest: true })
  }

  const [googleLoading, setGoogleLoading] = useState(false)
  const handleGoogleLogin = async () => {
    setGoogleLoading(true)
    setError('')
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin },
      })
      if (error) throw error
    } catch (err) {
      console.error('Google sign-in error:', err)
      setGoogleNotice(true)
      setTimeout(() => setGoogleNotice(false), 4200)
    } finally {
      setGoogleLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="app-header sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-md">
        <div className="max-w-md mx-auto px-4 flex items-center h-14">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-primary flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" /></svg>
            </div>
            <span className="font-bold text-foreground">VCardz</span>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-md mx-auto w-full px-4 py-8 pb-10 space-y-4">
        {/* User card */}
<div className="rounded-2xl border border-border bg-white overflow-hidden shadow-soft">
          <div className="w-full flex items-center gap-3 px-5 py-4 bg-white">
            <div className="w-9 h-9 rounded-xl bg-brand-dim flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>
            </div>
            <div className="text-left">
              <p className="text-[14px] font-bold text-foreground">User Account</p>
              <p className="text-[12px] text-muted-foreground">Sign in or create a new account</p>
            </div>
          </div>

          <div className="px-5 pb-1">
            <div className="flex bg-surface rounded-xl p-1 border border-border">
              {[{ label: 'Sign In', val: true }, { label: 'Sign Up', val: false }].map(({ label, val }) => (
                <button key={label} onClick={() => setIsLogin(val)}
                  className={`flex-1 py-2 rounded-lg text-[13px] font-semibold transition-all ${isLogin === val ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="px-5 pt-4 pb-5 space-y-3">
            {!isLogin && (
              <div>
                <label htmlFor="name" className="block text-[12px] text-foreground font-semibold mb-1.5">Full Name</label>
                <input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Rahul Sharma" className={AUTH_INPUT_BASE} />
              </div>
            )}
            <div>
              <label htmlFor="email" className="block text-[12px] text-foreground font-semibold mb-1.5">Email</label>
              <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className={AUTH_INPUT_BASE} />
            </div>
            <div>
              <label htmlFor="password" className="block text-[12px] text-foreground font-semibold mb-1.5">Password</label>
              <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className={AUTH_INPUT_BASE} />
            </div>

            <div ref={turnstileRef} className="flex justify-center" />
            {turnstileFailed && <p className="text-center text-[11px] text-amber-600">Security check unavailable — you can continue without it.</p>}

            {!isLogin && (
              <p className="text-center text-[11px] text-muted-foreground">Free account on signup — cards unlock when you buy a Top-Up Pack.</p>
            )}

            {error && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                <svg className="w-4 h-4 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>
                <p className="text-red-600 text-[13px]">{error}</p>
              </div>
            )}

            <button type="submit" disabled={loading}
              className="w-full py-3 rounded-xl font-bold text-[14px] hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-60 shadow-md text-primary-foreground bg-primary">
              {loading
                ? <span className="flex items-center justify-center gap-2"><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>{isLogin ? 'Signing in...' : 'Creating account...'}</span>
                : (isLogin ? 'Sign In' : 'Create Account')}
            </button>

            <p className="text-center text-muted-foreground text-[12px]">
              {isLogin ? 'No account? ' : 'Have an account? '}
              <button type="button" onClick={() => setIsLogin(!isLogin)} className="text-brand font-semibold hover:underline">
                {isLogin ? 'Sign up free' : 'Sign in'}
              </button>
            </p>
          </form>
          <div className="px-5 pb-5">
            <button type="button" onClick={handleGoogleLogin} disabled={googleLoading} className="glass-secondary w-full flex items-center justify-center gap-3 py-3 rounded-2xl text-[13px] font-bold text-foreground disabled:opacity-60">
              <span className="google-mark" aria-hidden="true">G</span>
              {googleLoading ? 'Redirecting to Google…' : 'Continue with Google'}
            </button>
            {googleNotice && <p role="status" className="mt-2 text-center text-[11px] text-red-500">Google sign-in is unavailable right now. Please try again in a moment.</p>}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-border" />
          <span className="text-[11px] text-muted-foreground font-semibold uppercase tracking-widest">or</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        <div className="rounded-2xl border border-border bg-white overflow-hidden shadow-soft">
          <div className="px-5 py-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-surface-2 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.182 15.182a4.5 4.5 0 01-6.364 0M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75zm-.375 0h.008v.015h-.008V9.75zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75zm-.375 0h.008v.015h-.008V9.75z" /></svg>
            </div>
            <div className="flex-1">
              <p className="text-[14px] font-bold text-foreground">Continue as Guest</p>
              <p className="text-[12px] text-muted-foreground">Free plan, no sign-up needed</p>
            </div>
            <button
              onClick={handleGuestLogin}
              disabled={loading}
              className="shrink-0 px-4 py-2 rounded-xl bg-slate-700 text-white text-[13px] font-bold hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-60 shadow-sm"
            >
              {loading ? '...' : 'Enter'}
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-white overflow-hidden shadow-soft">
          <button
            onClick={() => setMode(mode === 'admin' ? 'user' : 'admin')}
            className="w-full flex items-center gap-3 px-5 py-4"
          >
            <div className="w-9 h-9 rounded-xl bg-surface-2 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" /></svg>
            </div>
            <div className="text-left flex-1">
              <p className="text-[14px] font-bold text-foreground">Admin Panel</p>
              <p className="text-[12px] text-muted-foreground">Enter 6-digit admin code to access</p>
            </div>
            <svg className={`w-4 h-4 text-muted-foreground transition-transform ${mode === 'admin' ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
          </button>

          {mode === 'admin' && (
            <div className="px-5 pb-5 space-y-4 border-t border-border pt-4">
              <p className="text-[13px] text-muted-foreground text-center">Enter the 6-digit admin access code</p>
              <div className="flex items-center justify-center gap-2">
                {adminCode.map((digit, i) => (
                  <input key={`acode-${i}`} id={`acode-${i}`} aria-label={`Admin code digit ${i + 1}`} type="text" inputMode="numeric" maxLength={1} value={digit}
                    onChange={(e) => handleAdminCodeChange(i, e.target.value)}
                    onKeyDown={(e) => handleAdminKeyDown(i, e)}
                    className={`w-11 h-12 text-center text-[18px] font-bold border rounded-xl bg-surface focus:outline-none focus:ring-2 transition-all ${adminError ? 'border-red-300 focus:ring-red-200 text-red-600' : 'border-border focus:border-brand/60 focus:ring-brand/15 text-foreground'}`} />
                ))}
              </div>

              {adminError && (
                <div className="flex items-center justify-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
                  <svg className="w-4 h-4 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>
                  <p className="text-red-600 text-[13px]">{adminError}</p>
                </div>
              )}

              <button
                onClick={() => handleAdminSubmit()}
                disabled={adminLoading || adminCode.join('').length < 6}
                className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold text-[14px] hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-40 shadow-sm"
              >
                {adminLoading
                  ? <span className="flex items-center justify-center gap-2"><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Verifying...</span>
                  : 'Access Admin Panel'}
              </button>
            </div>
          )}
        </div>
      </main>
      {/* v9: no bottom dock on the login page — the app can only be used after
          login/signup/guest, so the dock (and the useless back button above) were
          removed from this page. */}
    </div>
  )
}

// ─── Card List Item ───────────────────────────────────────────────────────────