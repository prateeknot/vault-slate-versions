import { useState, useCallback, useEffect } from 'react'
import { supabase } from './lib/supabase'

// ─── Categories & plan limits ─────────────────────────────────────────
const CATEGORIES = ['All', 'Netflix', 'Amazon', 'Spotify', 'YouTube', 'Other']
const PLAN_LIMITS = { free: 2, pro: 5, max: 10 }

// ─── Helpers ─────────────────────────────────────────────────────────
function formatCardNumber(num) {
  return String(num || '').replace(/\s/g, '').replace(/(.{4})/g, '$1 ').trim()
}
function maskCardNumber(num) {
  const clean = String(num || '').replace(/\s/g, '')
  return '•••• •••• •••• ' + clean.slice(-4)
}

// ─── Provider Logo ────────────────────────────────────────────────────
function ProviderLogo({ provider, size = 'sm' }) {
  if (provider === 'Visa')
    return <span className="font-black text-white tracking-tighter" style={{ fontSize: size === 'md' ? 18 : 12 }}>VISA</span>
  if (provider === 'Mastercard')
    return (
      <span className="flex items-center">
        <span className="rounded-full bg-red-500 opacity-90" style={{ width: size === 'md' ? 20 : 14, height: size === 'md' ? 20 : 14 }} />
        <span className="rounded-full bg-amber-400 opacity-80" style={{ width: size === 'md' ? 20 : 14, height: size === 'md' ? 20 : 14, marginLeft: size === 'md' ? -8 : -6 }} />
      </span>
    )
  if (provider === 'Amex')
    return <span className="font-bold text-cyan-300 tracking-widest" style={{ fontSize: size === 'md' ? 11 : 9 }}>AMEX</span>
  if (provider === 'Discover')
    return <span className="font-bold text-orange-300 tracking-wider" style={{ fontSize: size === 'md' ? 10 : 8 }}>DISC</span>
  return <span className="font-bold text-purple-300" style={{ fontSize: size === 'md' ? 10 : 8 }}>RUPAY</span>
}

// ─── Chip SVG ─────────────────────────────────────────────────────────
function ChipSVG() {
  return (
    <svg width="34" height="26" viewBox="0 0 34 26" fill="none" aria-hidden="true">
      <rect width="34" height="26" rx="4" fill="#c8a84b" />
      <rect x="3" y="3" width="28" height="20" rx="3" fill="#e8c96e" />
      <rect x="13" y="0" width="8" height="26" rx="1" fill="#c8a84b" opacity="0.4" />
      <rect x="0" y="9" width="34" height="8" rx="1" fill="#c8a84b" opacity="0.4" />
      <rect x="13" y="9" width="8" height="8" rx="1" fill="#b8922a" />
    </svg>
  )
}

// ─── Card Gradients ───────────────────────────────────────────────────
const CARD_GRADIENTS = {
  Visa: 'from-slate-700 via-slate-800 to-slate-900',
  Mastercard: 'from-purple-900 via-slate-800 to-slate-900',
  Amex: 'from-blue-900 via-blue-800 to-slate-900',
  Discover: 'from-red-900 via-slate-800 to-slate-900',
  RuPay: 'from-indigo-900 via-slate-800 to-slate-900',
}
const CARD_FULL_GRADIENTS = {
  Visa: 'from-[#0f2027] via-[#203a43] to-[#2c5364]',
  Mastercard: 'from-[#1a0533] via-[#2d1b69] to-[#11998e]',
  Amex: 'from-[#0a2342] via-[#0e3d6b] to-[#1565c0]',
  Discover: 'from-[#200122] via-[#6f0000] to-[#200122]',
  RuPay: 'from-[#0f0c29] via-[#302b63] to-[#24243e]',
}

// ─── Virtual Card Visual ──────────────────────────────────────────────
function VirtualCardVisual({ card, flipped = false, onFlip }) {
  const gradient = CARD_FULL_GRADIENTS[card.provider] || CARD_FULL_GRADIENTS.Visa
  return (
    <div
      className="relative w-full cursor-pointer select-none"
      style={{ aspectRatio: '1.586', perspective: 1000 }}
      onClick={onFlip}
      role="button"
      aria-label={flipped ? 'Show card front' : 'Show card back'}
    >
      <div
        className="w-full h-full transition-transform duration-500"
        style={{ transformStyle: 'preserve-3d', transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}
      >
        <div
          className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${gradient} p-5 flex flex-col justify-between overflow-hidden`}
          style={{ backfaceVisibility: 'hidden' }}
        >
          <div className="absolute inset-0 rounded-2xl" style={{ background: 'linear-gradient(135deg,rgba(255,255,255,0.09) 0%,transparent 55%)' }} />
          <div className="flex items-start justify-between relative z-10">
            <div>
              <p className="text-[10px] text-white/50 uppercase tracking-widest font-medium">VCardz</p>
              <p className="text-[11px] text-white/60 mt-0.5">{card.bank}</p>
            </div>
            <ProviderLogo provider={card.provider} size="sm" />
          </div>
          <div className="relative z-10"><ChipSVG /></div>
          <div className="relative z-10">
            <p className="font-mono text-white text-[14px] tracking-[0.18em] font-medium">{formatCardNumber(card.card_number)}</p>
            <div className="flex items-end justify-between mt-2">
              <div>
                <p className="text-[9px] text-white/40 uppercase tracking-widest">Card Holder</p>
                <p className="text-[12px] text-white font-semibold tracking-wide mt-0.5">{card.name}</p>
              </div>
              <div className="text-right">
                <p className="text-[9px] text-white/40 uppercase tracking-widest">Expires</p>
                <p className="text-[12px] text-white font-semibold mt-0.5">{card.expiry}</p>
              </div>
            </div>
          </div>
        </div>
        <div
          className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${gradient} flex flex-col justify-between overflow-hidden`}
          style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
        >
          <div className="mt-7 h-10 bg-black/60 w-full" />
          <div className="px-5 pb-5">
            <div className="flex items-center justify-end gap-3 mt-4">
              <div className="flex-1 h-8 rounded bg-white/10" />
              <div className="bg-white rounded px-3 py-1.5 flex items-center gap-2">
                <p className="text-[9px] text-gray-500 font-medium">CVV</p>
                <p className="font-mono text-black font-bold text-[13px] tracking-widest">{card.cvv}</p>
              </div>
            </div>
            <p className="text-[9px] text-white/30 text-center mt-3">Tap to flip back</p>
          </div>
        </div>
      </div>
      {!flipped && (
        <div className="absolute bottom-3 right-3 z-20 text-[9px] text-white/30 flex items-center gap-1">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.042 21.672L13.684 16.6m0 0l-2.51 2.225.569-9.47 5.227 7.917-3.286-.672zm-7.518-.267A8.25 8.25 0 1120.25 10.5M8.288 14.212A5.25 5.25 0 1117.25 10.5" /></svg>
          tap to flip
        </div>
      )}
    </div>
  )
}

// ─── Toast ────────────────────────────────────────────────────────────
function Toast({ message, type, onClose }) {
  const s = { success: 'bg-green-50 border-green-200 text-green-700', error: 'bg-red-50 border-red-200 text-red-600', info: 'bg-blue-50 border-blue-200 text-blue-600' }
  return (
    <div className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-2.5 px-4 py-3 rounded-xl border shadow-lg ${s[type]}`} style={{ minWidth: 220 }}>
      <span className="text-[13px] font-medium">{message}</span>
      <button onClick={onClose} className="ml-auto opacity-60 hover:opacity-100">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
      </button>
    </div>
  )
}

// ─── Bottom Nav ───────────────────────────────────────────────────────
function BottomNav({ view, isLoggedIn, onNavigate }) {
  const tabs = [
    {
      id: 'landing', label: 'Home',
      icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" /></svg>,
      activeFill: <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M11.47 3.84a.75.75 0 011.06 0l8.69 8.69a.75.75 0 101.06-1.06l-8.689-8.69a2.25 2.25 0 00-3.182 0l-8.69 8.69a.75.75 0 001.061 1.06l8.69-8.69z"/><path d="M12 5.432l8.159 8.159c.03.03.06.058.091.086v6.198c0 1.035-.84 1.875-1.875 1.875H15a.75.75 0 01-.75-.75v-4.5a.75.75 0 00-.75-.75h-3a.75.75 0 00-.75.75V21a.75.75 0 01-.75.75H5.625a1.875 1.875 0 01-1.875-1.875v-6.198a2.29 2.29 0 00.091-.086L12 5.43z"/></svg>,
    },
    {
      id: 'cards', label: 'Cards',
      icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" /></svg>,
      activeFill: <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M2.273 5.625A4.483 4.483 0 015.25 4.5h13.5c1.141 0 2.183.425 2.977 1.125A3 3 0 0018.75 3H5.25a3 3 0 00-2.977 2.625zM2.273 8.625A4.483 4.483 0 015.25 7.5h13.5c1.141 0 2.183.425 2.977 1.125A3 3 0 0018.75 6H5.25a3 3 0 00-2.977 2.625zM5.25 9a3 3 0 00-3 3v6a3 3 0 003 3h13.5a3 3 0 003-3v-6a3 3 0 00-3-3H5.25zm6.75 8.25a2.25 2.25 0 110-4.5 2.25 2.25 0 010 4.5z"/></svg>,
    },
    {
      id: 'pricing', label: 'Plans',
      icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" /><path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" /></svg>,
      activeFill: <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path fillRule="evenodd" d="M5.25 2.25a3 3 0 00-3 3v4.318a3 3 0 00.879 2.121l9.58 9.581c.92.92 2.39 1.056 3.46.3a18.598 18.598 0 005.441-5.44c.757-1.072.62-2.54-.3-3.461L11.73 3.53a3 3 0 00-2.122-.879H5.25zM6.375 7.5a1.125 1.125 0 100-2.25 1.125 1.125 0 000 2.25z" clipRule="evenodd"/></svg>,
    },
    {
      id: (isLoggedIn ? 'account' : 'auth'), label: isLoggedIn ? 'Account' : 'Login',
      icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>,
      activeFill: <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path fillRule="evenodd" d="M7.5 6a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM3.751 20.105a8.25 8.25 0 0116.498 0 .75.75 0 01-.437.695A18.683 18.683 0 0112 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 01-.437-.695z" clipRule="evenodd"/></svg>,
    },
  ]

  const activeView = view === 'account' || view === 'settings' ? 'account' : view === 'auth' ? (isLoggedIn ? 'account' : 'auth') : view

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background/95 backdrop-blur-md">
      <div className="max-w-md mx-auto px-2 flex items-center justify-around h-16">
        {tabs.map((tab) => {
          const isActive = activeView === tab.id || (tab.id === 'auth' && view === 'auth' && !isLoggedIn)
          return (
            <button
              key={tab.id}
              onClick={() => onNavigate(tab.id)}
              className={`flex flex-col items-center gap-0.5 px-4 py-2 rounded-xl transition-colors ${isActive ? 'text-brand' : 'text-muted-foreground'}`}
            >
              {isActive ? tab.activeFill : tab.icon}
              <span className="text-[10px] font-semibold">{tab.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}

// ─── LANDING PAGE ─────────────────────────────────────────────────────────────
function LandingPage({ isLoggedIn, onNavigate, availableCount }) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-md">
        <div className="max-w-md mx-auto px-4 flex items-center justify-between h-14">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-brand flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" /></svg>
            </div>
            <span className="font-bold text-foreground tracking-tight">VCardz</span>
          </div>
          {isLoggedIn
            ? <button onClick={() => onNavigate('cards')} className="text-sm font-semibold text-brand bg-brand-dim border border-brand/20 rounded-xl px-4 py-1.5">Browse Cards</button>
            : <button onClick={() => onNavigate('auth')} className="text-sm font-semibold text-brand bg-brand-dim border border-brand/20 rounded-xl px-4 py-1.5">Sign in</button>
          }
        </div>
      </header>

      <main className="flex-1 max-w-md mx-auto w-full px-4 pb-24">
        <section className="pt-10 pb-8">
          <div className="inline-flex items-center gap-2 bg-brand-dim border border-brand/20 rounded-full px-3 py-1 mb-5">
            <span className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse" />
            <span className="text-[11px] text-brand font-semibold tracking-wide uppercase">{availableCount} cards available now</span>
          </div>
          <h1 className="text-[30px] leading-[1.2] font-bold text-foreground tracking-tight text-balance">
            Temporary virtual cards,{' '}
            <span className="text-brand">ready instantly.</span>
          </h1>
          <p className="mt-3 text-[15px] text-muted-foreground leading-relaxed">
            Browse real-looking virtual card details for free trial sign-ups. No commitment, no hassle.
          </p>
          <div className="mt-7 flex flex-col gap-3">
            <button
              onClick={() => onNavigate(isLoggedIn ? 'cards' : 'auth')}
              className="w-full py-3.5 rounded-xl bg-brand text-white font-bold text-[15px] hover:opacity-90 active:scale-[0.98] transition-all shadow-sm"
            >
              {isLoggedIn ? 'Browse Cards' : 'Get started free'}
            </button>
            <button
              onClick={() => onNavigate('pricing')}
              className="w-full py-3.5 rounded-xl bg-surface border border-border text-foreground font-semibold text-[15px] hover:border-brand/40 transition-colors"
            >
              View Plans
            </button>
          </div>
        </section>

        <section className="mb-8">
          <div className="flex items-center justify-center gap-3">
            <div className="w-14 h-10 rounded-xl bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900 flex items-end justify-end p-1.5">
              <ProviderLogo provider="Visa" size="sm" />
            </div>
            <div className="w-14 h-10 rounded-xl bg-gradient-to-br from-purple-900 via-slate-800 to-slate-900 flex items-end justify-end p-1.5">
              <ProviderLogo provider="Mastercard" size="sm" />
            </div>
            <div className="w-14 h-10 rounded-xl bg-gradient-to-br from-blue-900 via-blue-800 to-slate-900 flex items-end justify-end p-1.5">
              <ProviderLogo provider="Amex" size="sm" />
            </div>
            <div className="w-14 h-10 rounded-xl bg-gradient-to-br from-red-900 via-slate-800 to-slate-900 flex items-end justify-end p-1.5">
              <ProviderLogo provider="Discover" size="sm" />
            </div>
            <div className="w-14 h-10 rounded-xl bg-gradient-to-br from-indigo-900 via-slate-800 to-slate-900 flex items-end justify-end p-1.5">
              <ProviderLogo provider="RuPay" size="sm" />
            </div>
          </div>
        </section>

        <section className="mb-8 space-y-3">
          {[
            { icon: 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z', title: 'Free to start', desc: 'Sign up in seconds. No email verification needed.' },
            { icon: 'M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184', title: 'One-tap copy', desc: 'Copy card number, CVV, and expiry in one tap.' },
            { icon: 'M9 12.75l3 3m0 0l3-3m-3 3v-7.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z', title: '5 providers', desc: 'Visa, Mastercard, Amex, Discover & RuPay.' },
          ].map((f) => (
            <div key={f.title} className="flex items-start gap-3.5 p-4 rounded-2xl bg-surface border border-border">
              <div className="w-9 h-9 rounded-xl bg-brand-dim flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d={f.icon} /></svg>
              </div>
              <div>
                <p className="font-semibold text-[14px] text-foreground">{f.title}</p>
                <p className="text-[13px] text-muted-foreground mt-0.5 leading-relaxed">{f.desc}</p>
              </div>
            </div>
          ))}
        </section>

        <section className="mb-4">
          <p className="text-[11px] text-muted-foreground uppercase tracking-widest font-semibold mb-4 text-center">Our Plans</p>
          <div className="grid grid-cols-3 gap-2">
            {[
              { plan: 'Free', price: '₹0', cards: '2 cards', active: false },
              { plan: 'Pro', price: '₹99/mo', cards: '5 cards', active: true },
              { plan: 'Max', price: '₹199/mo', cards: '10 cards', active: false },
            ].map((p) => (
              <div key={p.plan} className={`relative rounded-2xl border p-3 text-center transition-all ${p.active ? 'border-brand bg-brand-dim shadow-sm' : 'border-border bg-surface'}`}>
                {p.active && <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-brand text-white text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">Popular</div>}
                <p className="font-bold text-[13px] text-foreground">{p.plan}</p>
                <p className="text-brand font-bold text-[13px] mt-0.5">{p.price}</p>
                <p className="text-muted-foreground text-[11px] mt-0.5">{p.cards}</p>
              </div>
            ))}
          </div>
          <button onClick={() => onNavigate('pricing')} className="mt-3 w-full text-[13px] text-brand font-semibold py-2.5 rounded-xl border border-brand/25 hover:bg-brand-dim transition-colors">
            Compare plans
          </button>
        </section>
      </main>
      <BottomNav view="landing" isLoggedIn={isLoggedIn} onNavigate={onNavigate} />
    </div>
  )
}

// ─── AUTH PAGE ────────────────────────────────────────────────────────────────
function AuthPage({ onLogin, onNavigate }) {
  const [isLogin, setIsLogin] = useState(true)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [plan, setPlan] = useState('free')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!email || !password) { setError('Please fill in all fields.'); return }
    if (!isLogin && !name) { setError('Please enter your name.'); return }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return }
    setLoading(true)
    try {
      if (isLogin) {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
        if (signInError) throw signInError
        onLogin({ email, name: email.split('@')[0], plan: 'free' })
      } else {
        const { error: signUpError } = await supabase.auth.signUp({ email, password })
        if (signUpError) throw signUpError
        onLogin({ email, name: name || email.split('@')[0], plan })
      }
    } catch (err) {
      setError(err.message || 'Authentication failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-md">
        <div className="max-w-md mx-auto px-4 flex items-center h-14">
          <button onClick={() => onNavigate('landing')} className="mr-3 text-muted-foreground hover:text-foreground">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" /></svg>
          </button>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-brand flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" /></svg>
            </div>
            <span className="font-bold text-foreground">VCardz</span>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-md mx-auto w-full px-4 py-8 pb-24">
        <div className="mb-7">
          <h1 className="text-2xl font-bold text-foreground">{isLogin ? 'Welcome back' : 'Create account'}</h1>
          <p className="text-muted-foreground text-[14px] mt-1">{isLogin ? 'Sign in to access your cards' : 'Start browsing virtual cards for free'}</p>
        </div>

        <div className="flex bg-surface rounded-xl p-1 mb-6 border border-border">
          {[{ label: 'Sign In', val: true }, { label: 'Sign Up', val: false }].map(({ label, val }) => (
            <button
              key={label}
              onClick={() => setIsLogin(val)}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${isLogin === val ? 'bg-brand text-white shadow-sm' : 'text-muted-foreground'}`}
            >
              {label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <div>
              <label htmlFor="name" className="block text-[13px] text-foreground font-semibold mb-1.5">Full Name</label>
              <input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Rahul Sharma"
                className="w-full bg-surface border border-border rounded-xl px-4 py-3 text-foreground text-[14px] placeholder:text-muted-foreground/50 focus:outline-none focus:border-brand/60 focus:ring-2 focus:ring-brand/15 transition-colors" />
            </div>
          )}
          <div>
            <label htmlFor="email" className="block text-[13px] text-foreground font-semibold mb-1.5">Email</label>
            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com"
              className="w-full bg-surface border border-border rounded-xl px-4 py-3 text-foreground text-[14px] placeholder:text-muted-foreground/50 focus:outline-none focus:border-brand/60 focus:ring-2 focus:ring-brand/15 transition-colors" />
          </div>
          <div>
            <label htmlFor="password" className="block text-[13px] text-foreground font-semibold mb-1.5">Password</label>
            <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••"
              className="w-full bg-surface border border-border rounded-xl px-4 py-3 text-foreground text-[14px] placeholder:text-muted-foreground/50 focus:outline-none focus:border-brand/60 focus:ring-2 focus:ring-brand/15 transition-colors" />
          </div>

          {!isLogin && (
            <div>
              <p className="text-[13px] text-foreground font-semibold mb-2">Choose Plan</p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'free', label: 'Free', price: '₹0' },
                  { id: 'pro', label: 'Pro', price: '₹99/mo' },
                  { id: 'max', label: 'Max', price: '₹199/mo' },
                ].map((p) => (
                  <button key={p.id} type="button" onClick={() => setPlan(p.id)}
                    className={`py-2.5 rounded-xl border text-center transition-all ${plan === p.id ? 'border-brand bg-brand-dim' : 'border-border bg-surface'}`}>
                    <p className={`text-[13px] font-bold ${plan === p.id ? 'text-brand' : 'text-foreground'}`}>{p.label}</p>
                    <p className={`text-[11px] ${plan === p.id ? 'text-brand/70' : 'text-muted-foreground'}`}>{p.price}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <svg className="w-4 h-4 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>
              <p className="text-red-600 text-[13px]">{error}</p>
            </div>
          )}

          <button type="submit" disabled={loading}
            className="w-full py-3.5 rounded-xl bg-brand text-white font-bold text-[15px] hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-60 mt-2 shadow-sm">
            {loading
              ? <span className="flex items-center justify-center gap-2"><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>{isLogin ? 'Signing in...' : 'Creating account...'}</span>
              : (isLogin ? 'Sign In' : 'Create Account')}
          </button>
        </form>

        <p className="text-center text-muted-foreground text-[13px] mt-5">
          {isLogin ? "Don't have an account? " : 'Already have an account? '}
          <button onClick={() => setIsLogin(!isLogin)} className="text-brand font-semibold hover:underline">
            {isLogin ? 'Sign up free' : 'Sign in'}
          </button>
        </p>
      </main>
      <BottomNav view="auth" isLoggedIn={false} onNavigate={onNavigate} />
    </div>
  )
}

// ─── CARDS PAGE ───────────────────────────────────────────────────────────────
function CardsPage({ currentUser, onNavigate }) {
  const userPlan = currentUser?.plan ?? 'free'
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [search, setSearch] = useState('')
  const [selectedCard, setSelectedCard] = useState(null)
  const [flipped, setFlipped] = useState(false)
  const [toast, setToast] = useState(null)
  const [availableCards, setAvailableCards] = useState([])
  const [claimedCards, setClaimedCards] = useState([])
  const [planLimit, setPlanLimit] = useState(PLAN_LIMITS[userPlan] || 2)
  const [loading, setLoading] = useState(true)

  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 2500)
  }, [])

  const fetchData = useCallback(async () => {
    try {
      const { data: planRows } = await supabase.rpc('get_my_plan')
      let limit = PLAN_LIMITS[userPlan] || 2
      if (planRows && planRows.length > 0) limit = planRows[0].card_limit

      const [availRes, claimedRes] = await Promise.all([
        supabase.rpc('get_available_cards', { p_plan: userPlan }),
        supabase.rpc('get_claimed_card_details'),
      ])
      if (availRes.error) console.error('Available error:', availRes.error)
      if (claimedRes.error) console.error('Claimed error:', claimedRes.error)
      setPlanLimit(limit)
      setAvailableCards(availRes.data || [])
      setClaimedCards(claimedRes.data || [])
    } catch (err) {
      console.error('Fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [userPlan])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const allFiltered = [...availableCards, ...claimedCards]
    .filter((c) => c.is_active !== false)
    .filter((c) => selectedCategory === 'All' || c.category === selectedCategory)
    .filter((c) => !search || (c.name || '').toLowerCase().includes(search.toLowerCase()) || (c.bank || '').toLowerCase().includes(search.toLowerCase()) || (c.provider || '').toLowerCase().includes(search.toLowerCase()))

  const visible = allFiltered.slice(0, planLimit)
  const locked = allFiltered.slice(planLimit)

  const handleClaim = async (card) => {
    if (!currentUser) { showToast('Please sign in to claim cards', 'error'); return }
    const { data: ok, error } = await supabase.rpc('claim_card', { p_card_id: card.id })
    if (error) { showToast('Failed to claim: ' + error.message, 'error'); return }
    if (!ok) { showToast('Limit reached or card no longer available', 'error'); fetchData(); return }
    showToast(`${card.bank} / ${card.provider} claimed!`)
    fetchData()
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <svg className="w-8 h-8 text-brand animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-md">
        <div className="max-w-md mx-auto px-4 flex items-center justify-between h-14">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-brand flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" /></svg>
            </div>
            <span className="font-bold text-foreground">VCardz</span>
          </div>
          <span className={`text-[11px] font-bold uppercase px-2.5 py-1 rounded-full ${userPlan === 'max' ? 'bg-amber-100 text-amber-600 border border-amber-200' : userPlan === 'pro' ? 'bg-brand-dim text-brand border border-brand/20' : 'bg-surface-2 text-muted-foreground border border-border'}`}>
            {userPlan} plan
          </span>
        </div>
      </header>

      <main className="flex-1 max-w-md mx-auto w-full px-4 pt-4 pb-24">
        <div className="relative mb-4">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803a7.5 7.5 0 0010.607 0z" /></svg>
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, bank, provider..."
            className="w-full bg-surface border border-border rounded-xl pl-10 pr-4 py-2.5 text-[14px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-brand/50 focus:ring-2 focus:ring-brand/10 transition-colors" />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 mb-5 scrollbar-none">
          {CATEGORIES.map((cat) => (
            <button key={cat} onClick={() => setSelectedCategory(cat)}
              className={`shrink-0 px-3.5 py-1.5 rounded-full text-[12px] font-semibold transition-all ${selectedCategory === cat ? 'bg-brand text-white shadow-sm' : 'bg-surface border border-border text-muted-foreground hover:border-brand/40'}`}>
              {cat}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between mb-4">
          <p className="text-[12px] text-muted-foreground">
            Showing <span className="text-foreground font-semibold">{visible.length}</span> of {allFiltered.length} cards
          </p>
          {locked.length > 0 && (
            <button onClick={() => onNavigate('pricing')} className="text-[11px] text-brand font-semibold hover:underline">
              Unlock {locked.length} more
            </button>
          )}
        </div>

        <div className="space-y-3">
          {visible.map((card) => (
            <CardListItem key={card.id} card={card} onOpen={(c) => { setSelectedCard(c); setFlipped(false) }} />
          ))}
          {locked.map((card) => (
            <div key={card.id} className="relative rounded-2xl border border-border overflow-hidden">
              <CardListItem card={card} onOpen={() => showToast('Upgrade your plan to unlock more cards', 'info')} locked />
              <div className="absolute inset-0 bg-white/70 backdrop-blur-[1px] flex items-center justify-center rounded-2xl">
                <button onClick={() => onNavigate('pricing')} className="flex items-center gap-2 bg-white border border-border rounded-xl px-4 py-2.5 shadow-sm hover:border-brand/40 transition-colors">
                  <svg className="w-4 h-4 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" /></svg>
                  <span className="text-[12px] text-foreground font-semibold">Upgrade to unlock</span>
                </button>
              </div>
            </div>
          ))}
        </div>

        {allFiltered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-12 h-12 rounded-2xl bg-surface border border-border flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803a7.5 7.5 0 0010.607 0z" /></svg>
            </div>
            <p className="text-muted-foreground text-[14px]">No cards found</p>
          </div>
        )}
      </main>

      {selectedCard && (
        <CardDetailModal card={selectedCard} flipped={flipped} onFlip={() => setFlipped(!flipped)} onClose={() => setSelectedCard(null)}
          onCopy={(_, l) => showToast(`${l} copied!`)} />
      )}
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      <BottomNav view="cards" isLoggedIn={!!currentUser} onNavigate={onNavigate} />
    </div>
  )
}

// ─── Card List Item ───────────────────────────────────────────────────────────
function CardListItem({ card, onOpen, locked = false }) {
  return (
    <button onClick={() => onOpen(card)} disabled={locked}
      className="w-full text-left bg-white border border-border rounded-2xl p-4 flex items-center gap-3.5 hover:border-brand/30 hover:shadow-sm active:scale-[0.98] transition-all">
      <div className={`w-14 h-10 rounded-xl bg-gradient-to-br ${CARD_GRADIENTS[card.provider] || CARD_GRADIENTS.Visa} flex items-end justify-end p-1.5 shrink-0`}>
        <ProviderLogo provider={card.provider} size="sm" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="font-semibold text-[13px] text-foreground truncate">{card.name}</p>
          <span className="text-[10px] font-semibold text-muted-foreground bg-surface-2 px-2 py-0.5 rounded-full shrink-0 border border-border">{card.category}</span>
        </div>
        <p className="text-muted-foreground text-[12px] mt-0.5 font-mono">{card.last4 ? '•••• ' + card.last4 : maskCardNumber(card.card_number)}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[11px] text-muted-foreground/70">{card.bank}</span>
          <span className="text-[11px] text-muted-foreground/40">·</span>
          <span className="text-[11px] text-muted-foreground/70">Exp {card.expiry}</span>
        </div>
      </div>
      <svg className="w-4 h-4 text-muted-foreground/40 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
    </button>
  )
}

// ─── Card Detail Modal ────────────────────────────────────────────────────────
function CardDetailModal({ card, flipped, onFlip, onClose, onCopy }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative bg-white rounded-t-3xl border-t border-border p-5 pb-8 max-h-[88vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="absolute top-3 left-1/2 -translate-x-1/2 w-10 h-1 rounded-full bg-border" />
        <div className="flex items-center justify-between mb-5 mt-2">
          <h2 className="font-bold text-[16px] text-foreground">Card Details</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-surface-2 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors border border-border">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="mb-6"><VirtualCardVisual card={card} flipped={flipped} onFlip={onFlip} /></div>
        <div className="space-y-2.5">
          {[
            { label: 'Card Number', value: formatCardNumber(card.card_number), displayValue: maskCardNumber(card.card_number) },
            { label: 'Card Holder', value: card.name },
            { label: 'Expiry Date', value: card.expiry },
            { label: 'CVV', value: card.cvv, displayValue: '•••' },
            { label: 'Bank', value: card.bank },
            { label: 'Network', value: card.provider },
          ].map((item) => (
            <div key={item.label} className="flex items-center justify-between bg-surface border border-border rounded-xl px-4 py-3">
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-widest font-semibold">{item.label}</p>
                <p className="text-[14px] font-semibold text-foreground mt-0.5 font-mono">{item.displayValue || item.value}</p>
              </div>
              <CopyButton value={item.value} label={item.label} />
            </div>
          ))}
        </div>
        <button
          onClick={() => {
            const text = `Card: ${formatCardNumber(card.card_number)}\nName: ${card.name}\nExpiry: ${card.expiry}\nCVV: ${card.cvv}\nBank: ${card.bank}`
            navigator.clipboard.writeText(text).catch(() => {})
            onCopy(text, 'All details')
          }}
          className="mt-5 w-full py-3.5 rounded-xl bg-brand text-white font-bold text-[14px] hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
          Copy All Details
        </button>
      </div>
    </div>
  )
}

// ─── Copy Button ──────────────────────────────────────────────────────────────
function CopyButton({ value, label }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(value).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1800) }}
      className="flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-brand transition-colors"
      aria-label={`Copy ${label}`}
    >
      {copied
        ? <svg className="w-3.5 h-3.5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
        : <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
      }
      {copied ? 'Copied!' : label}
    </button>
  )
}

// ─── PRICING PAGE ─────────────────────────────────────────────────────────────
function PricingPage({ currentUser, onNavigate }) {
  const plans = [
    { id: 'free', name: 'Free', price: '₹0', period: 'forever', cards: PLAN_LIMITS.free, color: 'border-border', badge: '', features: ['Access to 2 cards', 'All providers', 'Copy card details', 'Basic support'] },
    { id: 'pro', name: 'Pro', price: '₹99', period: '/month', cards: PLAN_LIMITS.pro, color: 'border-brand ring-2 ring-brand/20', badge: 'Most Popular', features: ['Access to 5 cards', 'All providers', 'Copy all details', 'Category filters', 'Priority support'] },
    { id: 'max', name: 'Max', price: '₹199', period: '/month', cards: PLAN_LIMITS.max, color: 'border-amber-300', badge: '', features: ['Access to 10 cards', 'All providers', 'Copy all details', 'Category filters', 'Premium support', 'Early access to new cards'] },
  ]
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-md">
        <div className="max-w-md mx-auto px-4 flex items-center h-14">
          <button onClick={() => onNavigate('landing')} className="mr-3 text-muted-foreground hover:text-foreground">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" /></svg>
          </button>
          <h1 className="font-bold text-foreground">Plans & Pricing</h1>
        </div>
      </header>
      <main className="flex-1 max-w-md mx-auto w-full px-4 py-6 pb-24">
        <p className="text-muted-foreground text-[14px] mb-6 leading-relaxed">
          Choose a plan that fits your needs. Upgrade or downgrade anytime.
        </p>
        <div className="space-y-4">
          {plans.map((p) => (
            <div key={p.id} className={`rounded-2xl border ${p.color} bg-white p-5 relative`}>
              {p.badge && (
                <div className="absolute -top-3 left-5 bg-brand text-white text-[10px] font-bold px-3 py-0.5 rounded-full uppercase tracking-wide">{p.badge}</div>
              )}
              {currentUser?.plan === p.id && (
                <div className="absolute -top-3 right-5 bg-green-500 text-white text-[10px] font-bold px-3 py-0.5 rounded-full uppercase tracking-wide">Current</div>
              )}
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="font-bold text-[18px] text-foreground">{p.name}</p>
                  <p className="text-muted-foreground text-[12px]">{p.cards} cards/month</p>
                </div>
                <div className="text-right">
                  <span className="font-black text-[24px] text-foreground">{p.price}</span>
                  <span className="text-muted-foreground text-[12px]">{p.period}</span>
                </div>
              </div>
              <div className="space-y-2 mb-4">
                {p.features.map((f) => (
                  <div key={f} className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-green-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                    <span className="text-[13px] text-foreground">{f}</span>
                  </div>
                ))}
              </div>
              <button
                onClick={() => onNavigate(currentUser ? 'account' : 'auth')}
                className={`w-full py-3 rounded-xl font-bold text-[14px] transition-all ${p.id === 'pro' ? 'bg-brand text-white hover:opacity-90 shadow-sm' : p.id === 'max' ? 'bg-amber-500 text-white hover:opacity-90 shadow-sm' : 'bg-surface border border-border text-foreground hover:border-brand/40'}`}
              >
                {currentUser?.plan === p.id ? 'Current Plan' : currentUser ? 'Switch to ' + p.name : 'Get ' + p.name}
              </button>
            </div>
          ))}
        </div>
      </main>
      <BottomNav view="pricing" isLoggedIn={!!currentUser} onNavigate={onNavigate} />
    </div>
  )
}

// ─── ACCOUNT PAGE ─────────────────────────────────────────────────────────────
function AccountPage({ currentUser, onLogout, onNavigate, onAdminAccess }) {
  const [showAdminInput, setShowAdminInput] = useState(false)
  const [adminCodeInput, setAdminCodeInput] = useState('')
  const initials = (currentUser.name || 'G').split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
  const planColors = { free: 'bg-surface-2 text-muted-foreground border-border', pro: 'bg-brand-dim text-brand border-brand/20', max: 'bg-amber-100 text-amber-600 border-amber-200' }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-md">
        <div className="max-w-md mx-auto px-4 flex items-center h-14">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-brand flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" /></svg>
            </div>
            <span className="font-bold text-foreground">My Account</span>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-md mx-auto w-full px-4 py-5 pb-24 space-y-4">
        <div className="bg-white border border-border rounded-2xl p-5 flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-brand flex items-center justify-center shrink-0">
            <span className="text-white font-black text-[18px]">{initials}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-[16px] text-foreground truncate">{currentUser.name}</p>
            <p className="text-muted-foreground text-[13px] truncate">{currentUser.email}</p>
            <span className={`inline-flex mt-1.5 text-[11px] font-bold uppercase px-2.5 py-0.5 rounded-full border ${planColors[currentUser.plan] || planColors.free}`}>
              {currentUser.plan} plan
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => onNavigate('cards')} className="bg-brand text-white rounded-2xl p-4 flex flex-col items-start gap-2 hover:opacity-90 transition-opacity shadow-sm">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" /></svg>
            <div>
              <p className="font-bold text-[13px]">Browse Cards</p>
              <p className="text-[11px] text-white/70">{PLAN_LIMITS[currentUser.plan] || 2} cards</p>
            </div>
          </button>
          <button onClick={() => onNavigate('pricing')} className="bg-surface border border-border rounded-2xl p-4 flex flex-col items-start gap-2 hover:border-brand/40 transition-colors">
            <svg className="w-5 h-5 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" /><path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" /></svg>
            <div>
              <p className="font-bold text-[13px] text-foreground">Upgrade Plan</p>
              <p className="text-[11px] text-muted-foreground">More cards</p>
            </div>
          </button>
        </div>

        <div className="bg-white border border-border rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <p className="font-semibold text-[13px] text-foreground">Account Details</p>
          </div>
          <div className="divide-y divide-border">
            {[
              { label: 'Full Name', value: currentUser.name },
              { label: 'Email', value: currentUser.email },
              { label: 'Current Plan', value: currentUser.plan.charAt(0).toUpperCase() + currentUser.plan.slice(1) },
              { label: 'Card Limit', value: `${PLAN_LIMITS[currentUser.plan] || 2} cards/month` },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between px-4 py-3.5">
                <p className="text-[13px] text-muted-foreground">{item.label}</p>
                <p className="text-[13px] font-semibold text-foreground">{item.value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border border-border rounded-2xl overflow-hidden">
          <button
            onClick={() => setShowAdminInput(!showAdminInput)}
            className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-surface transition-colors text-left"
          >
            <svg className="w-4.5 h-4.5 text-muted-foreground shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" /></svg>
            <p className="text-[13px] font-semibold text-foreground">Admin Access</p>
            <svg className={`w-4 h-4 text-muted-foreground ml-auto transition-transform ${showAdminInput ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
          </button>
          {showAdminInput && (
            <div className="px-4 pb-4 border-t border-border pt-3">
              <p className="text-[12px] text-muted-foreground mb-2">Enter your 6-digit admin code</p>
              <div className="flex gap-2">
                <input
                  type="text" maxLength={6} inputMode="numeric"
                  value={adminCodeInput}
                  onChange={(e) => setAdminCodeInput(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  className="flex-1 bg-surface border border-border rounded-xl px-3 py-2.5 text-[14px] font-mono tracking-widest text-center text-foreground focus:outline-none focus:border-brand/60 transition-colors"
                />
                <button
                  onClick={async () => {
                    const { data, error } = await supabase.rpc('admin_verify_code', { p_code: adminCodeInput })
                    if (!error && data && data.length > 0 && data[0].is_active) {
                      onAdminAccess(adminCodeInput)
                      onNavigate('admin')
                    } else (alert('Invalid or inactive code'))
                  }}
                  disabled={adminCodeInput.length !== 6}
                  className="px-4 py-2.5 rounded-xl bg-brand text-white font-bold text-[13px] hover:opacity-90 disabled:opacity-40 transition-all"
                >
                  Enter
                </button>
              </div>
            </div>
          )}
        </div>

        <button
          onClick={onLogout}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl border border-red-200 bg-red-50 text-red-600 font-semibold text-[14px] hover:bg-red-100 transition-colors"
        >
          <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" /></svg>
          Sign Out
        </button>
      </main>

      <BottomNav view="account" isLoggedIn={true} onNavigate={onNavigate} />
    </div>
  )
}

// ─── ADMIN PANEL ──────────────────────────────────────────────────────────────
function AdminPanelPage({ onNavigate, adminCode }) {
  const [activeTab, setActiveTab] = useState('overview')
  const [cards, setCards] = useState([])
  const [planLimits, setPlanLimits] = useState({ ...PLAN_LIMITS })
  const [adminCodes, setAdminCodes] = useState([])
  const [totalUsers, setTotalUsers] = useState(0)
  const [cardSearch, setCardSearch] = useState('')
  const [toast, setToast] = useState(null)
  const [dataLoading, setDataLoading] = useState(true)
  const [showCardModal, setShowCardModal] = useState(false)
  const [editingCard, setEditingCard] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const EMPTY_FORM = { card_number: '', name: '', expiry: '', cvv: '', bank: '', provider: 'Visa', category: 'Other', plan_tier: 'free', is_active: true }
  const [formData, setFormData] = useState(EMPTY_FORM)

  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 2500)
  }, [])

  const fetchAllData = useCallback(async () => {
    try {
      const [cardsRes, plansRes, codesRes, usersRes] = await Promise.all([
        supabase.rpc('admin_list_cards', { p_code: adminCode }),
        supabase.rpc('admin_list_plans', { p_code: adminCode }),
        supabase.rpc('admin_list_codes', { p_code: adminCode }),
        supabase.rpc('admin_count_users', { p_code: adminCode }),
      ])
      if (cardsRes.error) throw cardsRes.error
      if (cardsRes.data) setCards(cardsRes.data)
      if (plansRes.data) {
        const limits = {}
        plansRes.data.forEach(p => { limits[p.id] = p.card_limit })
        setPlanLimits(limits)
      }
      if (codesRes.data) setAdminCodes(codesRes.data)
      if (usersRes.data != null) setTotalUsers(usersRes.data)
    } catch (err) {
      showToast('Failed to load admin data', 'error')
    } finally {
      setDataLoading(false)
    }
  }, [adminCode, showToast])

  useEffect(() => { fetchAllData() }, [fetchAllData])

  const handleSaveCard = async () => {
    if (!formData.card_number || !formData.name || !formData.expiry || !formData.cvv || !formData.bank) { showToast('Fill all required fields', 'error'); return }
    try {
      const cardArgs = {
        p_code: adminCode,
        p_number: formData.card_number, p_name: formData.name, p_expiry: formData.expiry,
        p_cvv: formData.cvv, p_bank: formData.bank, p_provider: formData.provider,
        p_category: formData.category, p_plan: formData.plan_tier, p_active: formData.is_active,
      }
      if (editingCard) {
        const { error } = await supabase.rpc('admin_update_card', { ...cardArgs, p_id: editingCard.id })
        if (error) throw error
        showToast('Card updated successfully')
      } else {
        const { error } = await supabase.rpc('admin_add_card', cardArgs)
        if (error) throw error
        showToast('New card added')
      }
      setShowCardModal(false); fetchAllData()
    } catch (err) { showToast('Failed: ' + err.message, 'error') }
  }

  const handleDeleteCard = async () => {
    if (!deleteTarget) return
    try {
      const { error } = await supabase.rpc('admin_delete_card', { p_code: adminCode, p_id: deleteTarget.id })
      if (error) throw error
      showToast('Card deleted', 'info'); setDeleteTarget(null); fetchAllData()
    } catch (err) { showToast('Failed: ' + err.message, 'error') }
  }

  const toggleCardStatus = async (id) => {
    try {
      const { error } = await supabase.rpc('admin_toggle_card', { p_code: adminCode, p_id: id })
      if (error) throw error
      showToast('Card status updated'); fetchAllData()
    } catch (err) { showToast('Failed: ' + err.message, 'error') }
  }

  const savePlanLimits = async () => {
    try {
      for (const [plan, limit] of Object.entries(planLimits)) {
        const { error } = await supabase.rpc('admin_update_plan', { p_code: adminCode, p_plan: plan, p_limit: limit })
        if (error) throw error
      }
      showToast('Plan limits saved')
    } catch (err) { showToast('Failed: ' + err.message, 'error') }
  }

  const stats = { totalCards: cards.length, activeCards: cards.filter((c) => c.is_active).length, totalUsers, activeCodes: adminCodes.filter((c) => c.is_active).length }
  const filteredCards = cards.filter((c) => !cardSearch || (c.name || '').toLowerCase().includes(cardSearch.toLowerCase()) || (c.card_number || '').includes(cardSearch) || (c.bank || '').toLowerCase().includes(cardSearch.toLowerCase()))

  const sidebarItems = [
    { id: 'overview', label: 'Overview',
      icon: 'M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z' },
    { id: 'cards', label: 'Manage Cards',
      icon: 'M2.273 5.625A4.483 4.483 0 015.25 4.5h13.5c1.141 0 2.183.425 2.977 1.125A3 3 0 0018.75 3H5.25a3 3 0 00-2.977 2.625zM2.273 8.625A4.483 4.483 0 015.25 7.5h13.5c1.141 0 2.183.425 2.977 1.125A3 3 0 0018.75 6H5.25a3 3 0 00-2.977 2.625zM5.25 9a3 3 0 00-3 3v6a3 3 0 003 3h13.5a3 3 0 003-3v-6a3 3 0 00-3-3H5.25zm6.75 8.25a2.25 2.25 0 110-4.5 2.25 2.25 0 010 4.5z' },
    { id: 'settings', label: 'Settings',
      icon: 'M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
  ]

  return (
    <div className="min-h-screen bg-background flex">
      <aside className="hidden md:flex w-64 flex-col border-r border-border bg-sidebar fixed inset-y-0 left-0 z-30">
        <div className="flex items-center gap-3 px-5 h-16 border-b border-border">
          <div className="w-8 h-8 rounded-lg bg-brand flex items-center justify-center">
            <svg className="w-4.5 h-4.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" /></svg>
          </div>
          <div>
            <p className="font-bold text-[14px] text-foreground">VCardz</p>
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Admin Panel</p>
          </div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {sidebarItems.map((item) => (
            <button key={item.id} onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all ${activeTab === item.id ? 'bg-brand text-white shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-surface'}`}>
              <svg className="w-4.5 h-4.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d={item.icon} /></svg>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="px-3 pb-4 border-t border-border pt-3 space-y-0.5">
          <button onClick={() => onNavigate('cards')} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium text-muted-foreground hover:text-foreground hover:bg-surface transition-all">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            View User Side
          </button>
          <button onClick={() => onNavigate('account')} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium text-red-500 hover:text-red-600 hover:bg-red-50 transition-all">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" /></svg>
            Exit Admin
          </button>
        </div>
      </aside>

      <div className="flex-1 md:ml-64 flex flex-col min-h-screen">
        <header className="h-16 border-b border-border bg-background sticky top-0 z-20 flex items-center px-6 gap-4">
          <div className="flex-1">
            <h1 className="font-bold text-[17px] text-foreground">{sidebarItems.find((s) => s.id === activeTab)?.label ?? 'Dashboard'}</h1>
          </div>
          {activeTab === 'cards' && (
            <button onClick={() => { setEditingCard(null); setFormData(EMPTY_FORM); setShowCardModal(true) }} className="flex items-center gap-2 bg-brand text-white text-[13px] font-bold px-4 py-2 rounded-xl hover:opacity-90 transition-opacity shadow-sm">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
              Add Card
            </button>
          )}
        </header>

        <div className="md:hidden flex border-b border-border bg-background sticky top-16 z-10 overflow-x-auto scrollbar-none">
          {sidebarItems.map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`shrink-0 px-4 py-3 text-[11px] font-bold uppercase tracking-wide transition-colors ${activeTab === tab.id ? 'text-brand border-b-2 border-brand' : 'text-muted-foreground'}`}>
              {tab.id === 'cards' ? 'Cards' : tab.id}
            </button>
          ))}
        </div>

        <main className="flex-1 p-6 max-w-6xl mx-auto w-full">
          {dataLoading && <div className="py-12 text-center text-muted-foreground text-[13px]">Loading from Supabase…</div>}

          {activeTab === 'overview' && !dataLoading && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: 'Total Cards', value: stats.totalCards, sub: `${stats.activeCards} active`, color: 'text-brand', bg: 'bg-brand-dim' },
                  { label: 'Total Users', value: stats.totalUsers, sub: 'registered', color: 'text-blue-600', bg: 'bg-blue-50' },
                  { label: 'Active Cards', value: stats.activeCards, sub: 'live', color: 'text-green-600', bg: 'bg-green-50' },
                  { label: 'Admin Codes', value: stats.activeCodes, sub: 'active', color: 'text-amber-600', bg: 'bg-amber-50' },
                ].map((s) => (
                  <div key={s.label} className="bg-white border border-border rounded-2xl p-5">
                    <div className={`w-8 h-8 rounded-xl ${s.bg} flex items-center justify-center mb-3`}>
                      <span className={`text-[10px] font-black ${s.color}`}>#</span>
                    </div>
                    <p className={`text-[28px] font-black ${s.color}`}>{s.value}</p>
                    <p className="text-[12px] text-muted-foreground font-medium mt-0.5">{s.label}</p>
                    <p className="text-[11px] text-muted-foreground/60 mt-0.5">{s.sub}</p>
                  </div>
                ))}
              </div>

              <div className="bg-white border border-border rounded-2xl overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                  <h3 className="font-bold text-[14px] text-foreground">Recent Cards</h3>
                  <button onClick={() => setActiveTab('cards')} className="text-[12px] text-brand font-semibold hover:underline">View all</button>
                </div>
                <div className="divide-y divide-border">
                  {cards.slice(0, 5).map((card) => (
                    <div key={card.id} className="flex items-center gap-3 px-5 py-3 hover:bg-surface transition-colors">
                      <div className={`w-10 h-7 rounded-lg bg-gradient-to-br ${CARD_GRADIENTS[card.provider] || CARD_GRADIENTS.Visa} flex items-end justify-end p-1 shrink-0`}>
                        <ProviderLogo provider={card.provider} size="sm" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-foreground truncate">{card.name}</p>
                        <p className="text-[11px] text-muted-foreground font-mono">•••• {String(card.card_number).slice(-4)} · {card.bank}</p>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${card.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                        {card.is_active ? 'Active' : 'Off'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'cards' && !dataLoading && (
            <div className="space-y-4">
              <div className="flex gap-3 items-center">
                <div className="relative flex-1">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803a7.5 7.5 0 0010.607 0z" /></svg>
                  <input value={cardSearch} onChange={(e) => setCardSearch(e.target.value)} placeholder="Search by name, number, bank..."
                    className="w-full bg-surface border border-border rounded-xl pl-9 pr-4 py-2.5 text-[13px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-brand/50 transition-colors" />
                </div>
                <div className="flex items-center gap-2 text-[12px] text-muted-foreground bg-surface border border-border rounded-xl px-3 py-2.5 shrink-0">
                  <span className="font-bold text-foreground">{filteredCards.length}</span> cards
                </div>
              </div>
              <div className="bg-white border border-border rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border bg-surface">
                        {['Card', 'Holder', 'Bank', 'Provider', 'Category', 'Plan', 'Expiry', 'Status', 'Actions'].map((h) => (
                          <th key={h} className="text-left px-4 py-3 text-[11px] uppercase tracking-widest text-muted-foreground font-bold whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredCards.map((card) => (
                        <tr key={card.id} className="hover:bg-surface/50 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              <div className={`w-10 h-7 rounded-lg bg-gradient-to-br ${CARD_GRADIENTS[card.provider] || CARD_GRADIENTS.Visa} flex items-end justify-end p-1 shrink-0`}>
                                <ProviderLogo provider={card.provider} size="sm" />
                              </div>
                              <span className="font-mono text-[12px] text-foreground whitespace-nowrap">•••• {String(card.card_number).slice(-4)}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-[13px] text-foreground font-semibold whitespace-nowrap">{card.name}</td>
                          <td className="px-4 py-3 text-[12px] text-muted-foreground whitespace-nowrap">{card.bank}</td>
                          <td className="px-4 py-3 text-[12px] text-muted-foreground whitespace-nowrap">{card.provider}</td>
                          <td className="px-4 py-3"><span className="text-[11px] bg-surface-2 text-muted-foreground px-2 py-0.5 rounded-full border border-border">{card.category}</span></td>
                          <td className="px-4 py-3">
                            <span className={`text-[11px] font-bold uppercase px-2 py-0.5 rounded-full ${card.plan_tier === 'max' ? 'bg-amber-100 text-amber-600' : card.plan_tier === 'pro' ? 'bg-brand-dim text-brand' : 'bg-surface-2 text-muted-foreground border border-border'}`}>
                              {card.plan_tier}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-[12px] text-muted-foreground font-mono whitespace-nowrap">{card.expiry}</td>
                          <td className="px-4 py-3">
                            <button onClick={() => toggleCardStatus(card.id)}
                              className={`text-[11px] font-bold px-2.5 py-1 rounded-full transition-colors ${card.is_active ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-red-100 text-red-600 hover:bg-red-200'}`}>
                              {card.is_active ? 'Active' : 'Inactive'}
                            </button>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              <button onClick={() => { setEditingCard(card); setFormData({ card_number: card.card_number, name: card.name, expiry: card.expiry, cvv: card.cvv, bank: card.bank, provider: card.provider, category: card.category || 'Other', is_active: card.is_active, plan_tier: card.plan_tier || 'free' }); setShowCardModal(true) }} className="p-1.5 rounded-lg text-muted-foreground hover:text-brand hover:bg-brand-dim transition-colors" title="Edit">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" /></svg>
                              </button>
                              <button onClick={() => setDeleteTarget(card)} className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors" title="Delete">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filteredCards.length === 0 && <div className="py-12 text-center text-muted-foreground text-[13px]">No cards found.</div>}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'settings' && !dataLoading && (
            <div className="max-w-2xl mx-auto space-y-5">
              <div className="bg-white border border-border rounded-2xl p-5 space-y-4">
                <h3 className="font-bold text-[14px] text-foreground">Plan Card Limits</h3>
                {['free', 'pro', 'max'].map((p) => (
                  <div key={p} className="flex items-center gap-3">
                    <span className={`text-[12px] font-bold uppercase w-10 ${p === 'max' ? 'text-amber-600' : p === 'pro' ? 'text-brand' : 'text-muted-foreground'}`}>{p}</span>
                    <input type="number" min={1} max={100}
                      value={planLimits[p] || 2}
                      onChange={(e) => setPlanLimits((prev) => ({ ...prev, [p]: parseInt(e.target.value) || 1 }))}
                      className="flex-1 bg-surface border border-border rounded-xl px-3 py-2.5 text-[13px] text-foreground focus:outline-none focus:border-brand/50 transition-colors" />
                    <span className="text-[12px] text-muted-foreground w-10">cards</span>
                  </div>
                ))}
                <button onClick={savePlanLimits} className="w-full py-2.5 rounded-xl bg-brand text-white text-[13px] font-bold hover:opacity-90 transition-opacity shadow-sm">
                  Save Plan Limits
                </button>
              </div>

              <div className="bg-white border border-border rounded-2xl p-5 space-y-4">
                <h3 className="font-bold text-[14px] text-foreground">Admin Access Codes</h3>
                <div className="space-y-2">
                  {adminCodes.map((c) => (
                    <div key={c.id} className="flex items-center justify-between bg-surface border border-border rounded-xl px-4 py-2.5">
                      <span className="font-mono text-[14px] text-foreground font-bold tracking-widest">{c.code}</span>
                      <span className="text-[10px] text-green-600 font-bold bg-green-100 px-2 py-0.5 rounded-full">Active</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {showCardModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white border border-border rounded-2xl p-6 w-full max-w-md max-h-[92vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-bold text-[16px] text-foreground">{editingCard ? 'Edit Card' : 'Add New Card'}</h2>
              <button onClick={() => setShowCardModal(false)} className="text-muted-foreground hover:text-foreground w-7 h-7 rounded-lg bg-surface flex items-center justify-center border border-border">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="space-y-3">
              {[
                { key: 'card_number', label: 'Card Number *', placeholder: '1234 5678 9012 3456' },
                { key: 'name', label: 'Card Holder Name *', placeholder: 'RAHUL SHARMA' },
                { key: 'expiry', label: 'Expiry *', placeholder: 'MM/YY' },
                { key: 'cvv', label: 'CVV *', placeholder: '123' },
                { key: 'bank', label: 'Bank *', placeholder: 'HDFC Bank' },
              ].map((field) => (
                <div key={field.key}>
                  <label className="block text-[12px] text-muted-foreground font-semibold mb-1 uppercase tracking-wide">{field.label}</label>
                  <input value={formData[field.key]}
                    onChange={(e) => setFormData((p) => ({ ...p, [field.key]: e.target.value }))}
                    placeholder={field.placeholder}
                    className="w-full bg-surface border border-border rounded-xl px-3 py-2.5 text-[13px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-brand/50 transition-colors" />
                </div>
              ))}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12px] text-muted-foreground font-semibold mb-1 uppercase tracking-wide">Provider</label>
                  <select value={formData.provider} onChange={(e) => setFormData((p) => ({ ...p, provider: e.target.value }))}
                    className="w-full bg-surface border border-border rounded-xl px-3 py-2.5 text-[13px] text-foreground focus:outline-none focus:border-brand/50">
                    {['Visa', 'Mastercard', 'Amex', 'Discover', 'RuPay'].map((p) => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[12px] text-muted-foreground font-semibold mb-1 uppercase tracking-wide">Category</label>
                  <select value={formData.category} onChange={(e) => setFormData((p) => ({ ...p, category: e.target.value }))}
                    className="w-full bg-surface border border-border rounded-xl px-3 py-2.5 text-[13px] text-foreground focus:outline-none focus:border-brand/50">
                    {['Netflix', 'Amazon', 'Spotify', 'YouTube', 'Other'].map((c) => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-[12px] text-muted-foreground font-semibold mb-1 uppercase tracking-wide">Visible to Plan</label>
                <div className="grid grid-cols-3 gap-2">
                  {['free', 'pro', 'max'].map((p) => (
                    <button key={p} type="button"
                      onClick={() => setFormData((prev) => ({ ...prev, plan_tier: p }))}
                      className={`py-2 rounded-xl text-[12px] font-bold uppercase border transition-all ${formData.plan_tier === p ? 'bg-brand-dim text-brand border-brand/30' : 'bg-white text-muted-foreground border-border hover:border-brand/40'}`}>
                      {p.charAt(0).toUpperCase() + p.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-3 bg-surface border border-border rounded-xl px-4 py-3">
                <button type="button" onClick={() => setFormData((p) => ({ ...p, is_active: !p.is_active }))}
                  className={`relative w-10 h-5 rounded-full transition-colors ${formData.is_active ? 'bg-brand' : 'bg-surface-2 border border-border'}`}>
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${formData.is_active ? 'left-5' : 'left-0.5'}`} />
                </button>
                <span className="text-[13px] font-semibold text-foreground">Active</span>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowCardModal(false)} className="flex-1 py-2.5 rounded-xl border border-border text-[13px] font-semibold text-muted-foreground hover:text-foreground transition-colors">
                Cancel
              </button>
              <button onClick={handleSaveCard} className="flex-1 py-2.5 rounded-xl bg-brand text-white text-[13px] font-bold hover:opacity-90 transition-opacity shadow-sm">
                {editingCard ? 'Save Changes' : 'Add Card'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white border border-border rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <div className="text-center mb-5">
              <div className="w-12 h-12 rounded-2xl bg-red-100 border border-red-200 flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
              </div>
              <h3 className="font-bold text-[15px] text-foreground">Delete Card?</h3>
              <p className="text-muted-foreground text-[13px] mt-1">Card ending in <span className="font-mono font-bold">{String(deleteTarget.card_number).slice(-4)}</span> will be permanently removed.</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 py-2.5 rounded-xl border border-border text-[13px] font-semibold text-muted-foreground hover:border-border transition-colors">Cancel</button>
              <button onClick={handleDeleteCard} className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-[13px] font-bold hover:opacity-90 transition-opacity">Delete</button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}

// ─── ROOT APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [view, setView] = useState('landing')
  const [currentUser, setCurrentUser] = useState(null)
  const [adminCode, setAdminCode] = useState('')
  const [availableCount, setAvailableCount] = useState(0)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setCurrentUser({ email: session.user.email, name: session.user.email.split('@')[0], plan: 'free' })
      }
    })
    supabase.from('masked_cards').select('id', { count: 'exact', head: true }).then(({ count }) => {
      if (count != null) setAvailableCount(count)
    })
  }, [])

  const handleLogin = (user) => {
    setCurrentUser(user)
    setView('cards')
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setCurrentUser(null)
    setView('landing')
  }

  const handleNavigate = (v) => {
    if ((v === 'account' || v === 'settings') && !currentUser) {
      setView('auth')
      return
    }
    setView(v)
  }

  const handleAdminAccess = (code) => {
    setAdminCode(code)
  }

  return (
    <>
      {view === 'landing' && <LandingPage isLoggedIn={!!currentUser} onNavigate={handleNavigate} availableCount={availableCount} />}
      {view === 'auth' && <AuthPage onLogin={handleLogin} onNavigate={handleNavigate} />}
      {view === 'cards' && <CardsPage currentUser={currentUser} onNavigate={handleNavigate} />}
      {view === 'account' && currentUser && <AccountPage currentUser={currentUser} onLogout={handleLogout} onNavigate={handleNavigate} onAdminAccess={handleAdminAccess} />}
      {view === 'pricing' && <PricingPage currentUser={currentUser} onNavigate={handleNavigate} />}
      {view === 'admin' && <AdminPanelPage onNavigate={handleNavigate} adminCode={adminCode} />}
    </>
  )
}
