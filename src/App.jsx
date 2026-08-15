import { useCallback, useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import { getAdminToken, setAdminToken } from './utils'
import { LandingPage, AuthPage, CardsPage, PricingPage, IBANPage, FakeIDPage, FAQPage, AccountPage, AdminPanelPage } from './pages'

// ─── ROOT APP ─────────────────────────────────────────────────────────────────
function App() {
  const [view, setView] = useState('auth')
  const [currentUser, setCurrentUser] = useState(null)
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('vcz_theme') || 'blue' } catch { return 'blue' }
  })
  const [appSettings, setAppSettings] = useState(null)
  const [booting, setBooting] = useState(true)

  useEffect(() => {
    supabase.rpc('get_app_settings').then(({ data }) => {
      if (data) setAppSettings(data)
    }).catch(() => { })
  }, [])

  const effectiveTheme = appSettings?.force_theme || theme
  useEffect(() => {
    try { localStorage.setItem('vcz_theme', theme) } catch { }
    document.documentElement.dataset.theme = effectiveTheme
  }, [effectiveTheme, theme])

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('vcz_user')
      if (saved) { setCurrentUser(JSON.parse(saved)); setView('cards') }
    } catch { }
    setBooting(false)
  }, [])

  useEffect(() => {
    if (!booting && !currentUser && view !== 'auth') setView('auth')
  }, [booting, currentUser, view])

  const applySupabaseUser = useCallback(async (authUser) => {
    let plan = 'free'
    let displayName = authUser.user_metadata?.name || authUser.user_metadata?.full_name || ''
    try {
      const { data: prof } = await supabase
        .from('profiles')
        .select('plan_type, display_name')
        .eq('id', authUser.id)
        .maybeSingle()
      if (prof?.plan_type) plan = String(prof.plan_type).toLowerCase()
      if (prof?.display_name) displayName = prof.display_name
    } catch { }
    const user = {
      email: authUser.email || '',
      name: displayName || (authUser.email || '').split('@')[0] || 'User',
      plan,
    }
    setCurrentUser(user)
    try { sessionStorage.setItem('vcz_user', JSON.stringify(user)) } catch { }
    setView('cards')
  }, [])

  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      if (data.session?.user) applySupabaseUser(data.session.user)
      else setBooting(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return
      if (session?.user && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED')) {
        applySupabaseUser(session.user)
        setBooting(false)
      }
    })
    return () => { active = false; sub?.subscription.unsubscribe() }
  }, [applySupabaseUser])

  const navigate = useCallback((v) => setView(v), [])

  const handleLogin = useCallback((user) => {
    setCurrentUser(user)
    try { user?.isGuest ? sessionStorage.removeItem('vcz_user') : sessionStorage.setItem('vcz_user', JSON.stringify(user)) } catch { }
    setView('cards')
  }, [])

  const handleAdminLogin = useCallback((session) => {
    setAdminToken(session?.session_token)
    try {
      const saved = sessionStorage.getItem('vcz_user')
      setCurrentUser(saved ? JSON.parse(saved) : { email: '', name: 'Administrator', plan: 'Max', isAdmin: true })
    } catch {
      setCurrentUser({ email: '', name: 'Administrator', plan: 'Max', isAdmin: true })
    }
    setView('admin')
  }, [])

  const handleLogout = useCallback(() => {
    setCurrentUser(null)
    try { sessionStorage.removeItem('vcz_user') } catch { }
    try { supabase.auth.signOut() } catch { }
    setView('auth')
  }, [])

  const handleUserUpdate = useCallback((patch) => {
    setCurrentUser((prev) => (prev ? { ...prev, ...patch } : prev))
    try {
      const saved = JSON.parse(sessionStorage.getItem('vcz_user') || '{}')
      sessionStorage.setItem('vcz_user', JSON.stringify({ ...saved, ...patch }))
    } catch { }
  }, [])

  // v9: LIVE plan sync. When the admin upgrades a user's plan (Users tab) or
  // approves a payment, the profiles row changes and realtime pushes it here,
  // so the plan badge/limits update instantly without a page refresh.
  useEffect(() => {
    if (currentUser?.isGuest) return
    let cancelled = false
    let channel = null
    supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return
      const uid = data.user?.id
      if (!uid) return
      channel = supabase.channel('profile-live')
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${uid}` }, async () => {
          const { data: prof } = await supabase
            .from('profiles')
            .select('plan_type, display_name')
            .eq('id', uid)
            .maybeSingle()
          if (!prof) return
          handleUserUpdate({
            plan: String(prof.plan_type || 'free').toLowerCase(),
            ...(prof.display_name ? { name: prof.display_name } : {}),
          })
        })
        .subscribe()
    })
    return () => { cancelled = true; if (channel) supabase.removeChannel(channel) }
  }, [currentUser?.isGuest, currentUser?.email, handleUserUpdate])

  if (booting) return <div className="min-h-screen bg-background flex items-center justify-center"><p className="text-sm text-muted-foreground">Loading…</p></div>

  const isAdminSession = !!getAdminToken()
  const inMaintenance = appSettings?.maintenance === 'true' && !isAdminSession

  if (inMaintenance) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6" data-theme={effectiveTheme}>
        <div className="max-w-sm w-full text-center">
          <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto mb-5">
            <svg className="w-8 h-8 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </div>
          <h1 className="text-[22px] font-black text-foreground mb-2">Under Maintenance</h1>
          <p className="text-[14px] text-muted-foreground leading-relaxed mb-6">{appSettings?.maintenance_message || 'We are doing some maintenance right now. Please check back in a few minutes.'}</p>
          <button onClick={() => setView('auth')} className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold text-[14px] hover:opacity-90 transition-opacity">Admin Sign In</button>
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell" data-theme={effectiveTheme}>
      {view === 'landing' && <LandingPage isLoggedIn={!!currentUser} onNavigate={navigate} settings={appSettings} />}
      {view === 'auth' && <AuthPage onLogin={handleLogin} onAdminLogin={handleAdminLogin} onNavigate={navigate} />}
      {view === 'cards' && <CardsPage currentUser={currentUser} onNavigate={navigate} settings={appSettings} />}
      {view === 'iban' && <IBANPage onNavigate={navigate} />}
      {view === 'fakeid' && <FakeIDPage onNavigate={navigate} currentUser={currentUser} />}
      {view === 'pricing' && <PricingPage currentUser={currentUser} onNavigate={navigate} settings={appSettings} />}
      {view === 'account' && <AccountPage currentUser={currentUser} onLogout={handleLogout} onNavigate={navigate} theme={effectiveTheme} onThemeChange={setTheme} onUserUpdate={handleUserUpdate} />}
      {view === 'faq' && <FAQPage onNavigate={navigate} />}
      {view === 'admin' && <AdminPanelPage onNavigate={navigate} settings={appSettings} onSettingsChange={setAppSettings} />}
    </div>
  )
}

export default App
