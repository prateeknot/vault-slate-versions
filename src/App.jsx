import { useState, useEffect, useCallback } from 'react'
import { supabase } from './lib/supabase'

// ─── View / Plan types ────────────────────────────────────────────────────────
// (JS port keeps the same shapes as the original vcardz-source page.tsx)

// ─── Defaults & seed fallback (used only when Supabase is unreachable) ────────
let PLAN_LIMITS = { free: 3, pro: 5, max: 10 }
const CATEGORIES = ['All', 'Netflix', 'Amazon', 'Spotify', 'YouTube', 'Other']

// Session-persisted admin token (issued by admin_login, gates all admin RPCs)
function getAdminToken() { try { return sessionStorage.getItem('vcz_admin_token') || '' } catch { return '' } }
function setAdminToken(t) { try { t ? sessionStorage.setItem('vcz_admin_token', t) : sessionStorage.removeItem('vcz_admin_token') } catch {} }

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatCardNumber(num) {
  return String(num || '').replace(/\s/g, '').replace(/(.{4})/g, '$1 ').trim()
}
function maskCardNumber(num) {
  const clean = String(num || '').replace(/\s/g, '')
  return '•••• •••• •••• ' + clean.slice(-4)
}

// ─── Provider Logo ────────────────────────────────────────────────────────────
function ProviderLogo({ provider, size = 'sm' }) {
  if (provider === 'Visa')
    return <span className="font-black text-white tracking-tighter" style={{ fontSize: size === 'md' ? 18 : 12 }}>VISA</span>
  if (provider === 'Mastercard')
    return (
      <span className="flex items-center">
        <span className="rounded-full bg-red-500 opacity-90" style={{ width: size === 'md' ? 20 : 14, height: size === 'md' ? 20 : 14 }} />
        <span className="rounded-full bg-amber-400 opacity-80 -ml-2" style={{ width: size === 'md' ? 20 : 14, height: size === 'md' ? 20 : 14, marginLeft: size === 'md' ? -8 : -6 }} />
      </span>
    )
  if (provider === 'Amex')
    return <span className="font-bold text-cyan-300 tracking-widest" style={{ fontSize: size === 'md' ? 11 : 9 }}>AMEX</span>
  if (provider === 'Discover')
    return <span className="font-bold text-orange-300 tracking-wider" style={{ fontSize: size === 'md' ? 10 : 8 }}>DISC</span>
  return <span className="font-bold text-purple-300" style={{ fontSize: size === 'md' ? 10 : 8 }}>RUPAY</span>
}

// ─── Chip SVG ─────────────────────────────────────────────────────────────────
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

// ─── Card Gradients ───────────────────────────────────────────────────────────
const CARD_GRADIENTS = {
  Visa: 'from-violet-500 via-purple-600 to-indigo-700',
  Mastercard: 'from-rose-500 via-pink-600 to-orange-500',
  Amex: 'from-emerald-500 via-teal-600 to-cyan-700',
  Discover: 'from-orange-400 via-amber-500 to-yellow-500',
  RuPay: 'from-fuchsia-500 via-pink-600 to-rose-600',
}
const CARD_FULL_GRADIENTS = {
  Visa: 'from-[#4f46e5] via-[#6d28d9] to-[#312e81]',
  Mastercard: 'from-[#be123c] via-[#db2777] to-[#ea580c]',
  Amex: 'from-[#065f46] via-[#0f766e] to-[#164e63]',
  Discover: 'from-[#b45309] via-[#d97706] to-[#92400e]',
  RuPay: 'from-[#86198f] via-[#be185d] to-[#9f1239]',
}
const CARD_GLOW = {
  Visa: 'rgba(99,91,255,0.22)',
  Mastercard: 'rgba(244,63,94,0.22)',
  Amex: 'rgba(16,185,129,0.22)',
  Discover: 'rgba(245,158,11,0.22)',
  RuPay: 'rgba(217,70,239,0.22)',
}
const CATEGORY_COLORS = {
  Netflix: { bg: 'bg-red-100', text: 'text-red-600', border: 'border-red-200' },
  Amazon: { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-200' },
  Spotify: { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-200' },
  YouTube: { bg: 'bg-rose-100', text: 'text-rose-600', border: 'border-rose-200' },
  Other: { bg: 'bg-violet-100', text: 'text-violet-700', border: 'border-violet-200' },
  All: { bg: 'bg-indigo-100', text: 'text-indigo-700', border: 'border-indigo-200' },
}

// ─── Virtual Card Visual ──────────────────────────────────────────────────────
function VirtualCardVisual({ card, flipped = false, onFlip }) {
  const gradient = CARD_FULL_GRADIENTS[card.provider] || CARD_FULL_GRADIENTS.Visa
  return (
    <div
      className="relative w-full cursor-pointer select-none card-float"
      style={{ aspectRatio: '1.586', perspective: 1000 }}
      onClick={onFlip}
      role="button"
      aria-label={flipped ? 'Show card front' : 'Show card back'}
    >
      <div
        className="w-full h-full transition-transform duration-500"
        style={{ transformStyle: 'preserve-3d', transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}
      >
        {/* Front */}
        <div
          className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${gradient} p-5 flex flex-col justify-between overflow-hidden card-shimmer`}
          style={{ backfaceVisibility: 'hidden' }}
        >
          <div className="absolute inset-0 rounded-2xl pointer-events-none" style={{ background: 'linear-gradient(135deg,rgba(255,255,255,0.14) 0%,transparent 50%)' }} />
          <div className="absolute -top-8 -right-8 w-36 h-36 rounded-full bg-white/5 pointer-events-none" />
          <div className="absolute -bottom-10 -left-6 w-28 h-28 rounded-full bg-black/10 pointer-events-none" />

          <div className="flex items-start justify-between relative z-10">
            <div>
              <p className="text-[10px] text-white/60 uppercase tracking-widest font-bold">VCardz</p>
              <p className="text-[11px] text-white/50 mt-0.5 font-medium">{card.bank}</p>
            </div>
            <ProviderLogo provider={card.provider} size="sm" />
          </div>
          <div className="relative z-10"><ChipSVG /></div>
          <div className="relative z-10">
            <p className="font-mono text-white/90 text-[15px] tracking-[0.2em] font-semibold drop-shadow-sm">{formatCardNumber(card.card_number)}</p>
            <div className="flex items-end justify-between mt-2.5">
              <div>
                <p className="text-[8px] text-white/40 uppercase tracking-widest">Card Holder</p>
                <p className="text-[12px] text-white font-bold tracking-wide mt-0.5">{card.name}</p>
              </div>
              <div className="text-right">
                <p className="text-[8px] text-white/40 uppercase tracking-widest">Expires</p>
                <p className="text-[12px] text-white font-bold mt-0.5">{card.expiry}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Back */}
        <div
          className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${gradient} flex flex-col justify-between overflow-hidden`}
          style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
        >
          <div className="absolute inset-0 rounded-2xl pointer-events-none" style={{ background: 'linear-gradient(135deg,rgba(255,255,255,0.08) 0%,transparent 50%)' }} />
          <div className="mt-8 h-10 bg-black/60 w-full" />
          <div className="px-5 pb-5 relative z-10">
            <div className="flex items-center justify-end gap-3 mt-4">
              <div className="flex-1 h-8 rounded-lg bg-white/10 backdrop-blur-sm" />
              <div className="bg-white/95 rounded-lg px-3 py-2 flex items-center gap-2 shadow-md">
                <p className="text-[9px] text-gray-500 font-bold uppercase tracking-wide">CVV</p>
                <p className="font-mono text-gray-900 font-black text-[14px] tracking-widest">{card.cvv}</p>
              </div>
            </div>
            <p className="text-[9px] text-white/30 text-center mt-4 tracking-wide">Tap to flip back</p>
          </div>
        </div>
      </div>

      {!flipped && (
        <div className="absolute bottom-3 right-3 z-20 text-[9px] text-white/35 flex items-center gap-1">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.042 21.672L13.684 16.6m0 0l-2.51 2.225.569-9.47 5.227 7.917-3.286-.672zm-7.518-.267A8.25 8.25 0 1120.25 10.5M8.288 14.212A5.25 5.25 0 1117.25 10.5" /></svg>
          tap to flip
        </div>
      )}
    </div>
  )
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toast({ message, type, onClose }) {
  const s = { success: 'bg-green-50 border-green-200 text-green-700', error: 'bg-red-50 border-red-200 text-red-600', info: 'bg-blue-50 border-blue-200 text-blue-600' }
  return (
    <div className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-2.5 px-4 py-3 rounded-xl border shadow-lg ${s[type]}`} style={{ minWidth: 220 }}>
      <span className="text-[13px] font-medium">{message}</span>
      <button onClick={onClose} className="ml-auto opacity-60 hover:opacity-100" aria-label="Close">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
      </button>
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
        : <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>}
      {copied ? 'Copied!' : label}
    </button>
  )
}

// ─── Bottom Nav ───────────────────────────────────────────────────────────────
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
      id: isLoggedIn ? 'account' : 'auth', label: isLoggedIn ? 'Account' : 'Login',
      icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>,
      activeFill: <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path fillRule="evenodd" d="M7.5 6a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM3.751 20.105a8.25 8.25 0 0116.498 0 .75.75 0 01-.437.695A18.683 18.683 0 0112 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 01-.437-.695z" clipRule="evenodd"/></svg>,
    },
  ]

  const activeView = view === 'account' || view === 'settings' ? 'account' : view === 'auth' ? (isLoggedIn ? 'account' : 'auth') : view
  const NAV_ACTIVE_COLORS = ['text-violet-600', 'text-pink-500', 'text-emerald-500', 'text-amber-500']

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-white/95 backdrop-blur-md">
      <div className="max-w-md mx-auto px-2 flex items-center justify-around h-16">
        {tabs.map((tab, i) => {
          const isActive = activeView === tab.id || (tab.id === 'auth' && view === 'auth' && !isLoggedIn)
          const activeColor = NAV_ACTIVE_COLORS[i] ?? 'text-brand'
          return (
            <button
              key={tab.id}
              onClick={() => onNavigate(tab.id)}
              className={`flex flex-col items-center gap-0.5 px-4 py-2 rounded-xl transition-colors ${isActive ? activeColor : 'text-muted-foreground/60'}`}
            >
              <span className={isActive ? 'nav-active' : ''}>{isActive ? tab.activeFill : tab.icon}</span>
              <span className={`text-[10px] font-bold tracking-wide ${isActive ? activeColor : 'text-muted-foreground/50'}`}>{tab.label}</span>
            </button>
          )
        })}
      </div>
      <div className="h-px bg-gradient-to-r from-violet-200 via-pink-200 to-emerald-200 opacity-60" />
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
            : <button onClick={() => onNavigate('auth')} className="text-sm font-semibold text-brand bg-brand-dim border border-brand/20 rounded-xl px-4 py-1.5">Sign in</button>}
        </div>
      </header>

      <main className="flex-1 max-w-md mx-auto w-full px-4 pb-24">
        <section className="pt-10 pb-8">
          <div className="inline-flex items-center gap-2 bg-brand-dim border border-brand/20 rounded-full px-3 py-1 mb-5">
            <span className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse" />
            <span className="text-[11px] text-brand font-semibold tracking-wide uppercase">{availableCount ?? 8} cards available now</span>
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
              className="w-full py-3.5 rounded-2xl font-black text-[15px] hover:opacity-90 active:scale-[0.98] transition-all shadow-lg text-white"
              style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #db2777 100%)' }}
            >
              {isLoggedIn ? 'Browse Cards' : 'Get started free'}
            </button>
            <button
              onClick={() => onNavigate('pricing')}
              className="w-full py-3.5 rounded-2xl bg-white border border-border text-foreground font-semibold text-[15px] hover:border-brand/40 transition-colors"
            >
              View Plans
            </button>
          </div>
        </section>

        <section className="mb-8">
          <VirtualCardVisual card={{ provider: 'Visa', bank: 'Preview', card_number: '4111111111111111', name: 'VCardz', expiry: '12/28', cvv: '000' }} />
        </section>

        <section className="mb-8 space-y-3">
          {[
            { icon: 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z', title: 'Free to start', desc: 'Sign up in seconds.' },
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
              { plan: 'Free', price: '₹0', cards: '3 cards', active: false },
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
function AuthPage({ onLogin, onAdminLogin, onNavigate }) {
  const [mode, setMode] = useState('user')
  const [isLogin, setIsLogin] = useState(true)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [plan, setPlan] = useState('free')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [adminCode, setAdminCode] = useState(['', '', '', '', '', ''])
  const [adminError, setAdminError] = useState('')
  const [adminLoading, setAdminLoading] = useState(false)

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
        const { error: signUpError } = await supabase.auth.signUp({
          email, password,
          options: { data: { full_name: name } },
        })
        if (signUpError) throw signUpError
        onLogin({ email, name, plan })
      }
    } catch (err) {
      setError(err.message || 'Authentication failed')
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
    if (e.key === 'Backspace' && !adminCode[index] && index > 0) {
      document.getElementById(`acode-${index - 1}`)?.focus()
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
        } else if (data?.error === 'SESSION_ACTIVE') {
          setAdminError('An admin session is already active on another device')
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
      setAdminLoading(false)
      setAdminError(err.message || 'Verification failed')
    }
  }

  const handleGuestLogin = () => {
    onLogin({ email: 'guest@vcardz.app', name: 'Guest User', plan: 'free', isGuest: true })
  }

  const inputBase = 'w-full bg-surface border border-border rounded-xl px-4 py-3 text-foreground text-[14px] placeholder:text-muted-foreground/50 focus:outline-none focus:border-brand/60 focus:ring-2 focus:ring-brand/15 transition-colors'

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-md">
        <div className="max-w-md mx-auto px-4 flex items-center h-14">
          <button onClick={() => onNavigate('landing')} className="mr-3 text-muted-foreground hover:text-foreground" aria-label="Back">
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

      <main className="flex-1 max-w-md mx-auto w-full px-4 py-8 pb-24 space-y-4">
        {/* User card */}
        <div className="rounded-2xl border border-border bg-white overflow-hidden shadow-sm">
          <button
            onClick={() => setMode(mode === 'user' ? 'user' : 'user')}
            className="w-full flex items-center gap-3 px-5 py-4 bg-white"
          >
            <div className="w-9 h-9 rounded-xl bg-brand/10 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>
            </div>
            <div className="text-left">
              <p className="text-[14px] font-bold text-foreground">User Account</p>
              <p className="text-[12px] text-muted-foreground">Sign in or create a new account</p>
            </div>
          </button>

          <div className="px-5 pb-1">
            <div className="flex bg-surface rounded-xl p-1 border border-border">
              {[{ label: 'Sign In', val: true }, { label: 'Sign Up', val: false }].map(({ label, val }) => (
                <button key={label} onClick={() => setIsLogin(val)}
                  className={`flex-1 py-2 rounded-lg text-[13px] font-semibold transition-all ${isLogin === val ? 'bg-brand text-white shadow-sm' : 'text-muted-foreground'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="px-5 pt-4 pb-5 space-y-3">
            {!isLogin && (
              <div>
                <label htmlFor="name" className="block text-[12px] text-foreground font-semibold mb-1.5">Full Name</label>
                <input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Rahul Sharma" className={inputBase} />
              </div>
            )}
            <div>
              <label htmlFor="email" className="block text-[12px] text-foreground font-semibold mb-1.5">Email</label>
              <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className={inputBase} />
            </div>
            <div>
              <label htmlFor="password" className="block text-[12px] text-foreground font-semibold mb-1.5">Password</label>
              <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className={inputBase} />
            </div>

            {!isLogin && (
              <div>
                <p className="text-[12px] text-foreground font-semibold mb-2">Choose Plan</p>
                <div className="grid grid-cols-3 gap-2">
                  {[{ id: 'free', label: 'Free', price: '₹0' }, { id: 'pro', label: 'Pro', price: '₹99/mo' }, { id: 'max', label: 'Max', price: '₹199/mo' }].map((p) => (
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
              className="w-full py-3 rounded-xl font-bold text-[14px] hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-60 shadow-md text-white"
              style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #db2777 100%)' }}>
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
        </div>

        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-border" />
          <span className="text-[11px] text-muted-foreground font-semibold uppercase tracking-widest">or</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        <div className="rounded-2xl border border-border bg-white overflow-hidden shadow-sm">
          <div className="px-5 py-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.182 15.182a4.5 4.5 0 01-6.364 0M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75zm-.375 0h.008v.015h-.008V9.75zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75zm-.375 0h.008v.015h-.008V9.75z" /></svg>
            </div>
            <div className="flex-1">
              <p className="text-[14px] font-bold text-foreground">Continue as Guest</p>
              <p className="text-[12px] text-muted-foreground">Free plan, no sign-up needed</p>
            </div>
            <button
              onClick={handleGuestLogin}
              disabled={loading}
              className="shrink-0 px-4 py-2 rounded-xl bg-emerald-500 text-white text-[13px] font-bold hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-60 shadow-sm"
            >
              {loading ? '...' : 'Enter'}
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-white overflow-hidden shadow-sm">
          <button
            onClick={() => setMode(mode === 'admin' ? 'user' : 'admin')}
            className="w-full flex items-center gap-3 px-5 py-4"
          >
            <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
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
                  <input key={i} id={`acode-${i}`} type="text" inputMode="numeric" maxLength={1} value={digit}
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
                className="w-full py-3 rounded-xl bg-slate-800 text-white font-bold text-[14px] hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-40 shadow-sm"
              >
                {adminLoading
                  ? <span className="flex items-center justify-center gap-2"><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Verifying...</span>
                  : 'Access Admin Panel'}
              </button>
            </div>
          )}
        </div>
      </main>

      <BottomNav view="auth" isLoggedIn={false} onNavigate={onNavigate} />
    </div>
  )
}

// ─── Card List Item ───────────────────────────────────────────────────────────
function CardListItem({ card, onOpen, locked = false }) {
  const catColor = CATEGORY_COLORS[card.category] ?? CATEGORY_COLORS.Other
  return (
    <button
      onClick={() => onOpen(card)}
      disabled={locked}
      className="card-item-glow w-full text-left bg-white border border-border rounded-2xl p-3.5 flex items-center gap-3.5 active:scale-[0.98] transition-all duration-200 hover:shadow-md hover:border-white"
      style={{ ['--glow-color']: CARD_GLOW[card.provider] }}
    >
      <div className={`relative w-14 h-10 rounded-xl bg-gradient-to-br ${CARD_GRADIENTS[card.provider] || CARD_GRADIENTS.Visa} flex flex-col items-start justify-between p-1.5 shrink-0 overflow-hidden`}>
        <div className="absolute inset-0 rounded-xl" style={{ background: 'linear-gradient(135deg,rgba(255,255,255,0.2) 0%,transparent 55%)' }} />
        <div className="w-4 h-3 rounded-sm relative z-10" style={{ background: 'linear-gradient(135deg,#e8c96e,#c8a84b)', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }}>
          <div className="absolute inset-0 rounded-sm opacity-40" style={{ background: 'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.15) 2px,rgba(0,0,0,0.15) 3px)' }} />
        </div>
        <div className="relative z-10 self-end"><ProviderLogo provider={card.provider} size="sm" /></div>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="font-bold text-[13px] text-foreground truncate">{card.name || 'Claimed Card'}</p>
          {card.category && <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${catColor.bg} ${catColor.text}`}>{card.category}</span>}
        </div>
        <p className="text-muted-foreground text-[12px] mt-0.5 font-mono tracking-wide">{card.card_number ? maskCardNumber(card.card_number) : (card.last4 ? '•••• •••• •••• ' + card.last4 : '•••• •••• •••• ••••')}</p>
        <div className="flex items-center gap-1.5 mt-1">
          <span className="text-[11px] text-muted-foreground/60 font-medium">{card.bank}</span>
          {card.expiry && <><span className="text-muted-foreground/30 text-[10px]">•</span><span className="text-[11px] text-muted-foreground/60">Exp {card.expiry}</span></>}
        </div>
      </div>

      <div className="shrink-0 w-7 h-7 rounded-full bg-surface flex items-center justify-center border border-border">
        <svg className="w-3.5 h-3.5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
      </div>
    </button>
  )
}

// ─── Card Detail Modal ────────────────────────────────────────────────────────
function CardDetailModal({ card, flipped, onFlip, onClose, onCopy }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="modal-slide-up relative bg-white rounded-t-3xl border-t border-border p-5 pb-10 max-h-[90vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="absolute top-3 left-1/2 -translate-x-1/2 w-10 h-1 rounded-full bg-border/60" />
        <div className="flex items-center justify-between mb-5 mt-3">
          <div>
            <h2 className="font-black text-[17px] text-foreground">Card Details</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">{card.provider} · {card.bank}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-surface-2 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors border border-border" aria-label="Close">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="mb-6"><VirtualCardVisual card={card} flipped={flipped} onFlip={onFlip} /></div>
        <div className="space-y-2">
          {[
            { label: 'Card Number', value: formatCardNumber(card.card_number), displayValue: maskCardNumber(card.card_number), accent: 'bg-violet-50 border-violet-100' },
            { label: 'Card Holder', value: card.name, accent: 'bg-pink-50 border-pink-100' },
            { label: 'Expiry Date', value: card.expiry, accent: 'bg-emerald-50 border-emerald-100' },
            { label: 'CVV', value: card.cvv, displayValue: '•••', accent: 'bg-amber-50 border-amber-100' },
            { label: 'Bank', value: card.bank, accent: 'bg-sky-50 border-sky-100' },
            { label: 'Network', value: card.provider, accent: 'bg-fuchsia-50 border-fuchsia-100' },
          ].map((item) => (
            <div key={item.label} className={`flex items-center justify-between border rounded-xl px-4 py-3 ${item.accent}`}>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">{item.label}</p>
                <p className="text-[14px] font-bold text-foreground mt-0.5 font-mono">{item.displayValue || item.value}</p>
              </div>
              <CopyButton value={item.value || ''} label={item.label} />
            </div>
          ))}
        </div>
        <button
          onClick={() => {
            const text = `Card: ${formatCardNumber(card.card_number)}\nName: ${card.name}\nExpiry: ${card.expiry}\nCVV: ${card.cvv}\nBank: ${card.bank}`
            navigator.clipboard.writeText(text).catch(() => {})
            onCopy(text, 'All details')
          }}
          className="mt-5 w-full py-3.5 rounded-2xl font-black text-[14px] hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-lg text-white"
          style={{ background: 'linear-gradient(135deg,#7c3aed,#db2777)' }}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
          Copy All Details
        </button>
      </div>
    </div>
  )
}

// ─── CARDS PAGE ───────────────────────────────────────────────────────────────
function CardsPage({ currentUser, onNavigate }) {
  const userPlan = currentUser?.plan ?? 'free'
  const isGuest = !!currentUser?.isGuest
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [search, setSearch] = useState('')
  const [selectedCard, setSelectedCard] = useState(null)
  const [flipped, setFlipped] = useState(false)
  const [toast, setToast] = useState(null)
  const [available, setAvailable] = useState([])
  const [claimed, setClaimed] = useState([])
  const [planLimit, setPlanLimit] = useState(3)
  const [loading, setLoading] = useState(true)

  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 2500)
  }, [])

  const normalizeCards = (rows) => (rows || []).map((c) => ({
    id: c.id,
    card_number: c.card_number,
    cardholder_name: c.cardholder_name,
    name: c.cardholder_name || c.label || 'Card',
    bank: c.provider,
    provider: c.provider,
    category: c.label || 'Other',
    last4: c.number_prefix,
    expiry: c.expiry,
    cvv: c.cvv,
    is_active: true,
    unlocked: !!c.unlocked,
    created_at: c.created_at,
  }))

  const fetchData = useCallback(async () => {
    try {
      if (isGuest) {
        setAvailable([])
        setClaimed([])
        setPlanLimit(3)
        return
      }
      const [overviewRes, cardsRes] = await Promise.all([
        supabase.rpc('my_overview'),
        supabase.rpc('cards_for_me'),
      ])
      const overview = overviewRes.data || {}
      const rows = normalizeCards(cardsRes.data)
      setPlanLimit(overview.card_limit ?? 3)
      setClaimed(rows.filter((c) => c.unlocked))
      setAvailable(rows.filter((c) => !c.unlocked))
    } catch (err) {
      console.error('Fetch error:', err)
      showToast('Could not load cards', 'error')
    } finally {
      setLoading(false)
    }
  }, [isGuest, showToast])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    if (isGuest) return
    const channel = supabase.channel('cards-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cards' }, () => fetchData())
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [isGuest, fetchData])

  const visibleAvailable = available.filter((c) =>
    (selectedCategory === 'All' || c.category === selectedCategory) &&
    (!search || (c.bank || '').toLowerCase().includes(search.toLowerCase()) || (c.provider || '').toLowerCase().includes(search.toLowerCase()) || (c.category || '').toLowerCase().includes(search.toLowerCase()))
  )
  const visibleClaimed = claimed.filter((c) =>
    (selectedCategory === 'All' || c.category === selectedCategory) &&
    (!search || (c.name || '').toLowerCase().includes(search.toLowerCase()) || (c.bank || '').toLowerCase().includes(search.toLowerCase()) || (c.provider || '').toLowerCase().includes(search.toLowerCase()))
  )

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="max-w-md mx-auto text-center">
          <svg className="animate-spin h-8 w-8 text-brand mx-auto" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
          <p className="mt-3 text-sm text-muted-foreground">Loading cards…</p>
        </div>
      </div>
    )
  }

  const remainingClaims = Math.max(0, planLimit - claimed.length)

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
          {!isGuest && (
            <span className={`text-[11px] font-bold uppercase px-2.5 py-1 rounded-full ${userPlan === 'max' ? 'bg-amber-100 text-amber-600 border border-amber-200' : userPlan === 'pro' ? 'bg-brand-dim text-brand border border-brand/20' : 'bg-surface-2 text-muted-foreground border border-border'}`}>
              {userPlan} plan
            </span>
          )}
        </div>
      </header>

      <main className="flex-1 max-w-md mx-auto w-full px-4 pt-4 pb-24">
        <div className="relative mb-4">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803a7.5 7.5 0 0010.607 0z" /></svg>
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, bank, provider..."
            className="w-full bg-surface border border-border rounded-xl pl-10 pr-4 py-2.5 text-[14px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-brand/50 focus:ring-2 focus:ring-brand/10 transition-colors" />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 mb-5 scrollbar-none">
          {CATEGORIES.map((cat) => {
            const cc = CATEGORY_COLORS[cat] ?? CATEGORY_COLORS.Other
            const isActive = selectedCategory === cat
            return (
              <button key={cat} onClick={() => setSelectedCategory(cat)}
                className={`shrink-0 px-3.5 py-1.5 rounded-full text-[12px] font-bold transition-all duration-200 border ${isActive ? `${cc.bg} ${cc.text} ${cc.border} shadow-sm scale-105` : 'bg-white border-border text-muted-foreground hover:scale-105'}`}>
                {cat}
              </button>
            )
          })}
        </div>

        {!isGuest && (
          <div className="flex items-center justify-between mb-4">
            <p className="text-[12px] text-muted-foreground">
              <span className="text-foreground font-semibold">{claimed.length}</span> of {planLimit} cards unlocked
            </p>
            {remainingClaims > 0 && visibleAvailable.length > 0 && (
              <button onClick={() => onNavigate('pricing')} className="text-[11px] text-brand font-semibold hover:underline">Unlock more</button>
            )}
          </div>
        )}

        <div className="space-y-3">
          {visibleClaimed.map((card) => (
            <CardListItem key={card.id} card={card} onOpen={(c) => { setSelectedCard(c); setFlipped(false) }} />
          ))}
          {visibleAvailable.map((card) => (
            <div key={card.id} className="rounded-2xl border border-border overflow-hidden">
              <CardListItem card={card} locked />
              <div className="px-4 pb-3 bg-white border-t border-border/60 -mt-2 pt-2.5">
                <button onClick={() => (isGuest ? onNavigate('auth') : onNavigate('pricing'))}
                  className="w-full py-2.5 rounded-xl font-bold text-[13px] transition-all active:scale-[0.98] bg-surface border border-border text-muted-foreground">
                  {isGuest ? 'Sign in to unlock' : 'Locked — upgrade your plan'}
                </button>
              </div>
            </div>
          ))}
        </div>

        {visibleClaimed.length === 0 && visibleAvailable.length === 0 && (
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

// ─── PRICING PAGE ─────────────────────────────────────────────────────────────
function PricingPage({ currentUser, onNavigate }) {
  const plans = [
    { id: 'free', name: 'Free', price: '₹0', period: 'forever', cards: PLAN_LIMITS.free, color: 'border-border', badge: '', features: ['Access to cards', 'All providers', 'Copy card details', 'Basic support'] },
    { id: 'pro', name: 'Pro', price: '₹99', period: '/month', cards: PLAN_LIMITS.pro, color: 'border-brand ring-2 ring-brand/20', badge: 'Most Popular', features: ['Access to 5 cards', 'All providers', 'Copy all details', 'Category filters', 'Priority support'] },
    { id: 'max', name: 'Max', price: '₹199', period: '/month', cards: PLAN_LIMITS.max, color: 'border-amber-300', badge: '', features: ['Access to 10 cards', 'All providers', 'Copy all details', 'Category filters', 'Premium support', 'Early access to new cards'] },
  ]
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-md">
        <div className="max-w-md mx-auto px-4 flex items-center h-14">
          <button onClick={() => onNavigate('landing')} className="mr-3 text-muted-foreground hover:text-foreground" aria-label="Back">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" /></svg>
          </button>
          <h1 className="font-bold text-foreground">Plans & Pricing</h1>
        </div>
      </header>
      <main className="flex-1 max-w-md mx-auto w-full px-4 py-6 pb-24">
        <p className="text-muted-foreground text-[14px] mb-6 leading-relaxed">Choose a plan that fits your needs. Upgrade or downgrade anytime.</p>
        <div className="space-y-4">
          {plans.map((p) => (
            <div key={p.id} className={`rounded-2xl border ${p.color} bg-white p-5 relative`}>
              {p.badge && <div className="absolute -top-3 left-5 bg-brand text-white text-[10px] font-bold px-3 py-0.5 rounded-full uppercase tracking-wide">{p.badge}</div>}
              {currentUser?.plan === p.id && <div className="absolute -top-3 right-5 bg-green-500 text-white text-[10px] font-bold px-3 py-0.5 rounded-full uppercase tracking-wide">Current</div>}
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
              <button onClick={() => onNavigate(currentUser ? 'account' : 'auth')}
                className={`w-full py-3 rounded-xl font-bold text-[14px] transition-all ${p.id === 'pro' ? 'bg-brand text-white hover:opacity-90 shadow-sm' : p.id === 'max' ? 'bg-amber-500 text-white hover:opacity-90 shadow-sm' : 'bg-surface border border-border text-foreground hover:border-brand/40'}`}>
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
function AccountPage({ currentUser, onLogout, onNavigate }) {
  const [showAdminInput, setShowAdminInput] = useState(false)
  const [adminCodeInput, setAdminCodeInput] = useState('')
  const name = currentUser?.name || 'Guest'
  const email = currentUser?.email || ''
  const planName = currentUser?.plan || 'free'
  const initials = name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) || 'G'
  const planColors = { free: 'bg-surface-2 text-muted-foreground border-border', pro: 'bg-brand-dim text-brand border-brand/20', max: 'bg-amber-100 text-amber-600 border-amber-200' }

  const handleAdmin = async () => {
    if (adminCodeInput.length !== 6) return
    try {
      const { data, error } = await supabase.rpc('admin_login', { p_code: adminCodeInput })
      if (error) throw error
      if (data?.ok) {
        setAdminToken(data.session_token)
        onNavigate('admin')
      } else {
        setShowAdminInput(false)
        window.alert(data?.error === 'COOLDOWN' ? `Too many attempts. Try again in ${data.retry_after}s` : 'Invalid admin code')
      }
    } catch {
      setShowAdminInput(false)
      window.alert('Invalid admin code')
    }
  }

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
            <p className="font-bold text-[16px] text-foreground truncate">{name}</p>
            <p className="text-muted-foreground text-[13px] truncate">{email}</p>
            <span className={`inline-flex mt-1.5 text-[11px] font-bold uppercase px-2.5 py-0.5 rounded-full border ${planColors[planName]}`}>{planName} plan</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => onNavigate('cards')} className="bg-brand text-white rounded-2xl p-4 flex flex-col items-start gap-2 hover:opacity-90 transition-opacity shadow-sm">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" /></svg>
            <div>
              <p className="font-bold text-[13px]">Browse Cards</p>
              <p className="text-[11px] text-white/70">{PLAN_LIMITS[planName]} cards</p>
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
          <div className="px-4 py-3 border-b border-border"><p className="font-semibold text-[13px] text-foreground">Account Details</p></div>
          <div className="divide-y divide-border">
            {[
              { label: 'Full Name', value: name },
              { label: 'Email', value: email },
              { label: 'Current Plan', value: planName.charAt(0).toUpperCase() + planName.slice(1) },
              { label: 'Card Limit', value: `${PLAN_LIMITS[planName]} cards/month` },
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
            <svg className="w-4 h-4 text-muted-foreground shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" /></svg>
            <p className="text-[13px] font-semibold text-foreground">Admin Access</p>
            <svg className={`w-4 h-4 text-muted-foreground ml-auto transition-transform ${showAdminInput ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
          </button>
          {showAdminInput && (
            <div className="px-4 pb-4 border-t border-border pt-3">
              <p className="text-[12px] text-muted-foreground mb-2">Enter your 6-digit admin code</p>
              <div className="flex gap-2">
                <input type="text" maxLength={6} inputMode="numeric" value={adminCodeInput}
                  onChange={(e) => setAdminCodeInput(e.target.value.replace(/\D/g, ''))} placeholder="000000"
                  className="flex-1 bg-surface border border-border rounded-xl px-3 py-2.5 text-[14px] font-mono tracking-widest text-center text-foreground focus:outline-none focus:border-brand/60 transition-colors"
                  onKeyDown={(e) => e.key === 'Enter' && handleAdmin()} />
                <button onClick={handleAdmin} disabled={adminCodeInput.length !== 6}
                  className="px-4 py-2.5 rounded-xl bg-brand text-white font-bold text-[13px] hover:opacity-90 disabled:opacity-40 transition-all">
                  Enter
                </button>
              </div>
            </div>
          )}
        </div>

        <button onClick={onLogout} className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl border border-red-200 bg-red-50 text-red-600 font-semibold text-[14px] hover:bg-red-100 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" /></svg>
          Sign Out
        </button>
      </main>

      <BottomNav view="account" isLoggedIn={true} onNavigate={onNavigate} />
    </div>
  )
}

// ─── ADMIN PANEL ──────────────────────────────────────────────────────────────
function AdminPanelPage({ onNavigate }) {
  const token = getAdminToken()
  const [activeTab, setActiveTab] = useState('overview')
  const [cards, setCards] = useState([])
  const [users, setUsers] = useState([])
  const [totalUsers, setTotalUsers] = useState(0)
  const [planLimits, setPlanLimits] = useState({ Free: PLAN_LIMITS.free, Pro: PLAN_LIMITS.pro, Max: PLAN_LIMITS.max })
  const [adminCodes, setAdminCodes] = useState([])
  const [cardSearch, setCardSearch] = useState('')
  const [userSearch, setUserSearch] = useState('')
  const [dataLoading, setDataLoading] = useState(true)
  const [toast, setToast] = useState(null)

  const EMPTY_FORM = { card_number: '', name: '', expiry: '', cvv: '', provider: 'Visa', label: '', is_active: true }
  const PLAN_TIERS = ['Free', 'Pro', 'Max']
  const [showCardModal, setShowCardModal] = useState(false)
  const [editingCard, setEditingCard] = useState(null)
  const [formData, setFormData] = useState(EMPTY_FORM)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const [showBulkModal, setShowBulkModal] = useState(false)
  const [bulkText, setBulkText] = useState('')
  const [bulkPreview, setBulkPreview] = useState([])

  const showToast = useCallback((msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 2500) }, [])

  const RANDOM_NAMES = ['RAHUL SHARMA','PRIYA SINGH','AMIT VERMA','SNEHA GUPTA','VIKRAM NAIR','NEHA REDDY','ROHAN MISHRA','KAVYA PATEL','ANKIT JHA','POOJA IYER','SURESH KUMAR','MEERA JHA']
  const RANDOM_PROVIDERS = ['Visa','Mastercard','Amex','Discover','RuPay']

  const parseBulkText = (text) => {
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 1000)
    const parsed = []
    for (const line of lines) {
      const clean = line.replace(/[^0-9|/ ]/g, ' ').replace(/\s+/g, ' ').trim()
      const parts = clean.split(/[\s|]+/).filter(Boolean)
      if (parts.length < 2) continue
      const cardNum = parts[0]
      if (cardNum.length < 12) continue
      let month = '', year = '', cvv = ''
      const rest = parts.slice(1)
      if (rest.length === 1 && rest[0].length === 6) { month = rest[0].slice(0, 2); year = rest[0].slice(2, 4); cvv = '' }
      else if (rest.length === 2) {
        if (rest[0].length === 4) { month = rest[0].slice(0, 2); year = rest[0].slice(2, 4); cvv = rest[1] }
        else if (rest[0].length === 2 && rest[1].length >= 2) { month = rest[0]; year = rest[1].slice(0, 2); cvv = rest[1].slice(2) || '' }
        else { month = rest[0]; year = rest[1]; cvv = '' }
      } else if (rest.length >= 3) { month = rest[0]; year = rest[1]; cvv = rest[2] }
      if (!month || !year) continue
      parsed.push({ card_number: cardNum, expiry: `${month}/${year}`, cvv: cvv || String(Math.floor(100 + Math.random() * 900)) })
    }
    return parsed
  }

  const normalizeCard = (c) => ({
    id: c.id,
    card_number: c.card_number,
    name: c.cardholder_name || c.label || '—',
    bank: c.provider,
    provider: c.provider,
    category: c.label || 'Other',
    cardholder_name: c.cardholder_name,
    expiry: c.expiry,
    cvv: c.cvv,
    label: c.label,
    notes: c.notes,
    is_active: c.is_active,
    created_at: c.created_at,
  })

  const fetchAll = async () => {
    if (!token) { setDataLoading(false); return }
    setDataLoading(true)
    try {
      const [cardsRes, plansRes, codesRes, statsRes, usersRes] = await Promise.all([
        supabase.rpc('admin_cards', { p_token: token }),
        supabase.rpc('admin_limits', { p_token: token }),
        supabase.rpc('admin_codes_list', { p_token: token }),
        supabase.rpc('admin_stats', { p_token: token }),
        supabase.rpc('admin_users', { p_token: token }),
      ])
      if (cardsRes.data) setCards(cardsRes.data.map(normalizeCard))
      if (plansRes.data) {
        const limits = {}
        plansRes.data.forEach((p) => { limits[p.plan_type] = p.card_limit })
        setPlanLimits((prev) => ({ ...prev, ...limits }))
      }
      if (codesRes.data) setAdminCodes(codesRes.data)
      if (statsRes.data) setTotalUsers(statsRes.data.total_users ?? 0)
      if (usersRes.data) setUsers(usersRes.data.map((u) => ({ ...u, name: u.display_name, plan: u.plan_type })))
    } catch (err) {
      showToast('Failed to load admin data', 'error')
    } finally {
      setDataLoading(false)
    }
  }

  useEffect(() => { fetchAll() }, [])

  const handleSaveCard = async () => {
    if (!formData.card_number || !formData.name || !formData.expiry || !formData.cvv) { showToast('Fill all required fields', 'error'); return }
    const payload = {
      p_token: token,
      p_id: editingCard?.id ?? null,
      p_card_number: formData.card_number,
      p_cardholder_name: formData.name,
      p_expiry: formData.expiry,
      p_cvv: formData.cvv,
      p_provider: formData.provider,
      p_is_active: formData.is_active,
      p_label: formData.label || null,
    }
    try {
      const { error } = await supabase.rpc('admin_card_save', payload)
      if (error) throw error
      showToast(editingCard ? 'Card updated' : 'New card added')
      setShowCardModal(false)
      fetchAll()
    } catch (err) { showToast('Failed to save card: ' + err.message, 'error') }
  }

  const handleDeleteCard = async () => {
    if (!deleteTarget) return
    try {
      const { error } = await supabase.rpc('admin_card_delete', { p_token: token, p_id: deleteTarget.id })
      if (error) throw error
      showToast('Card deleted', 'info')
      setDeleteTarget(null)
      fetchAll()
    } catch (err) { showToast('Failed to delete: ' + err.message, 'error') }
  }

  const toggleCardStatus = async (card) => {
    try {
      const { error } = await supabase.rpc('admin_card_toggle', { p_token: token, p_id: card.id })
      if (error) throw error
      showToast('Card status updated')
      fetchAll()
    } catch (err) { showToast('Failed: ' + err.message, 'error') }
  }

  const changePlan = async (userId, newPlan) => {
    try {
      const { error } = await supabase.rpc('admin_user_plan', { p_token: token, p_id: userId, p_plan: newPlan })
      if (error) throw error
      showToast(`Plan updated to ${newPlan}`)
      fetchAll()
    } catch (err) { showToast('User plan update failed: ' + err.message, 'error') }
  }

  const savePlanLimits = async () => {
    try {
      for (const [plan, limit] of Object.entries(planLimits)) {
        const { error } = await supabase.rpc('admin_limit_set', { p_token: token, p_plan: plan, p_limit: limit })
        if (error) throw error
      }
      showToast('Plan limits saved')
      fetchAll()
    } catch (err) { showToast('Failed to save: ' + err.message, 'error') }
  }

  const addAdminCode = async () => {
    try {
      const { error } = await supabase.rpc('admin_code_add', { p_token: token, p_code: newCode, p_label: newCodeLabel })
      if (error) throw error
      showToast('Admin code added')
      setNewCode(''); setNewCodeLabel('')
      fetchAll()
    } catch (err) { showToast('Failed: ' + err.message, 'error') }
  }
  const [newCode, setNewCode] = useState('')
  const [newCodeLabel, setNewCodeLabel] = useState('')

  const deleteAdminCode = async (c) => {
    try {
      const { error } = await supabase.rpc('admin_code_delete', { p_token: token, p_id: c.id })
      if (error) throw error
      showToast('Code removed', 'info')
      fetchAll()
    } catch (err) { showToast('Failed: ' + err.message, 'error') }
  }

  const handleBulkAdd = async () => {
    if (bulkPreview.length === 0) { showToast('No valid cards parsed', 'error'); return }
    let ok = 0
    for (const p of bulkPreview) {
      const { error } = await supabase.rpc('admin_card_save', {
        p_token: token,
        p_id: null,
        p_card_number: p.card_number,
        p_cardholder_name: RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)],
        p_expiry: p.expiry,
        p_cvv: p.cvv,
        p_provider: RANDOM_PROVIDERS[Math.floor(Math.random() * RANDOM_PROVIDERS.length)],
        p_is_active: true,
        p_label: 'Other',
      })
      if (!error) ok++
      else { showToast('Bulk add failed', 'error'); break }
    }
    showToast(`${ok} cards added`)
    setShowBulkModal(false); setBulkText(''); setBulkPreview([])
    fetchAll()
  }

  const filteredCards = cards.filter((c) => !cardSearch || c.name?.toLowerCase().includes(cardSearch.toLowerCase()) || c.card_number?.includes(cardSearch) || c.provider?.toLowerCase().includes(cardSearch.toLowerCase()))
  const filteredUsers = users.filter((u) => !userSearch || (u.display_name || u.email || '').toLowerCase().includes(userSearch.toLowerCase()) || (u.email || '').toLowerCase().includes(userSearch.toLowerCase()))

  const stats = {
    totalCards: cards.length,
    activeCards: cards.filter((c) => c.is_active).length,
    totalUsers,
    activeUsers: totalUsers,
    planDist: { free: 0, pro: 0, max: 0 },
  }

  const sidebarItems = [
    { id: 'overview', label: 'Overview', icon: 'M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z' },
    { id: 'cards', label: 'Manage Cards', icon: 'M2.273 5.625A4.483 4.483 0 015.25 4.5h13.5c1.141 0 2.183.425 2.977 1.125A3 3 0 0018.75 3H5.25a3 3 0 00-2.977 2.625zM2.273 8.625A4.483 4.483 0 015.25 7.5h13.5c1.141 0 2.183.425 2.977 1.125A3 3 0 0018.75 6H5.25a3 3 0 00-2.977 2.625zM5.25 9a3 3 0 00-3 3v6a3 3 0 003 3h13.5a3 3 0 003-3v-6a3 3 0 00-3-3H5.25zm6.75 8.25a2.25 2.25 0 110-4.5 2.25 2.25 0 010 4.5z' },
    { id: 'users', label: 'Manage Users', icon: 'M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z' },
    { id: 'settings', label: 'Settings', icon: 'M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
  ]

  return (
    <div className="min-h-screen bg-background flex">
      <aside className="hidden md:flex w-64 flex-col border-r border-border bg-sidebar fixed inset-y-0 left-0 z-30">
        <div className="flex items-center gap-3 px-5 h-16 border-b border-border">
          <div className="w-8 h-8 rounded-lg bg-brand flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" /></svg>
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
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d={item.icon} /></svg>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="px-3 pb-4 border-t border-border pt-3 space-y-0.5">
          <button onClick={() => onNavigate('cards')} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium text-muted-foreground hover:text-foreground hover:bg-surface transition-all">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            View User Side
          </button>
          <button onClick={async () => { try { await supabase.rpc('admin_logout', { p_token: token }) } catch {} setAdminToken(null); onNavigate('landing') }} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium text-red-500 hover:text-red-600 hover:bg-red-50 transition-all">
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
            <div className="flex items-center gap-2">
              <button onClick={() => setShowBulkModal(true)} className="flex items-center gap-2 bg-surface border border-border text-foreground text-[13px] font-bold px-4 py-2 rounded-xl hover:border-brand/50 transition-colors">
                <svg className="w-3.5 h-3.5 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 8.25H7.5a2.25 2.25 0 00-2.25 2.25v9a2.25 2.25 0 002.25 2.25h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25H15M9 12l3 3m0 0l3-3m-3 3V3" /></svg>
                Bulk Add
              </button>
              <button onClick={() => { setEditingCard(null); setFormData(EMPTY_FORM); setShowCardModal(true) }} className="flex items-center gap-2 bg-brand text-white text-[13px] font-bold px-4 py-2 rounded-xl hover:opacity-90 transition-opacity shadow-sm">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                Add Card
              </button>
            </div>
          )}
          <div className="flex items-center gap-2 bg-surface border border-border rounded-xl px-3 py-1.5">
            <div className="w-6 h-6 rounded-full bg-brand flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 24 24"><path fillRule="evenodd" d="M7.5 6a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM3.751 20.105a8.25 8.25 0 0116.498 0 .75.75 0 01-.437.695A18.683 18.683 0 0112 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 01-.437-.695z" clipRule="evenodd" /></svg>
            </div>
            <span className="text-[12px] font-bold text-foreground">Admin</span>
          </div>
        </header>

        <div className="md:hidden flex border-b border-border bg-background sticky top-16 z-10 overflow-x-auto scrollbar-none">
          {sidebarItems.map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`shrink-0 px-4 py-3 text-[11px] font-bold uppercase tracking-wide transition-colors ${activeTab === tab.id ? 'text-brand border-b-2 border-brand' : 'text-muted-foreground'}`}>
              {tab.id === 'cards' ? 'Cards' : tab.id === 'users' ? 'Users' : tab.id}
            </button>
          ))}
        </div>

        <main className="flex-1 p-6 max-w-6xl mx-auto w-full">
          {dataLoading && <div className="card p-8 text-center"><p className="text-sm text-ink-muted">Loading from Supabase…</p></div>}

          {activeTab === 'overview' && !dataLoading && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: 'Total Cards', value: stats.totalCards, sub: `${stats.activeCards} active`, color: 'text-brand', bg: 'bg-brand-dim' },
                  { label: 'Total Users', value: stats.totalUsers, sub: 'registered', color: 'text-blue-600', bg: 'bg-blue-50' },
                  { label: 'Active Cards', value: stats.activeCards, sub: 'visible', color: 'text-brand', bg: 'bg-brand-dim' },
                  { label: 'Admin Codes', value: adminCodes.length, sub: 'access codes', color: 'text-amber-600', bg: 'bg-amber-50' },
                ].map((s) => (
                  <div key={s.label} className="bg-white border border-border rounded-2xl p-5">
                    <div className={`w-8 h-8 rounded-xl ${s.bg} flex items-center justify-center mb-3`}><span className={`text-[10px] font-black ${s.color}`}>#</span></div>
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
                        <p className="text-[11px] text-muted-foreground font-mono">•••• {card.card_number?.slice(-4)} · {card.bank}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[11px] text-muted-foreground">{card.category}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${card.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>{card.is_active ? 'Active' : 'Off'}</span>
                      </div>
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
                  <input value={cardSearch} onChange={(e) => setCardSearch(e.target.value)} placeholder="Search by name, number, bank..." className="w-full bg-surface border border-border rounded-xl pl-9 pr-4 py-2.5 text-[13px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-brand/50 transition-colors" />
                </div>
                <div className="flex items-center gap-2 text-[12px] text-muted-foreground bg-surface border border-border rounded-xl px-3 py-2.5 shrink-0"><span className="font-bold text-foreground">{filteredCards.length}</span> cards</div>
              </div>
              <div className="bg-white border border-border rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border bg-surface">{['Card', 'Holder', 'Provider', 'Category', 'Expiry', 'Status', 'Actions'].map((h) => <th key={h} className="text-left px-4 py-3 text-[11px] uppercase tracking-widest text-muted-foreground font-bold whitespace-nowrap">{h}</th>)}</tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredCards.map((card) => (
                        <tr key={card.id} className="hover:bg-surface/50 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              <div className={`w-10 h-7 rounded-lg bg-gradient-to-br ${CARD_GRADIENTS[card.provider] || CARD_GRADIENTS.Visa} flex items-end justify-end p-1 shrink-0`}><ProviderLogo provider={card.provider} size="md" /></div>
                              <span className="font-mono text-[12px] text-foreground whitespace-nowrap">•••• {card.card_number?.slice(-4)}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-[13px] text-foreground font-semibold whitespace-nowrap">{card.name}</td>
                          <td className="px-4 py-3 text-[12px] text-muted-foreground whitespace-nowrap">{card.provider}</td>
                          <td className="px-4 py-3"><span className="text-[11px] bg-surface-2 text-muted-foreground px-2 py-0.5 rounded-full border border-border">{card.category}</span></td>
                          <td className="px-4 py-3 text-[12px] text-muted-foreground font-mono whitespace-nowrap">{card.expiry}</td>
                          <td className="px-4 py-3">
                            <button onClick={() => toggleCardStatus(card)} className={`text-[11px] font-bold px-2.5 py-1 rounded-full transition-colors ${card.is_active ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-red-100 text-red-600 hover:bg-red-200'}`}>{card.is_active ? 'Active' : 'Inactive'}</button>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              <button onClick={() => { setEditingCard(card); setFormData({ card_number: card.card_number, name: card.name, expiry: card.expiry, cvv: card.cvv, label: card.label, provider: card.provider, is_active: card.is_active }); setShowCardModal(true) }} className="p-1.5 rounded-lg text-muted-foreground hover:text-brand hover:bg-brand-dim transition-colors" title="Edit">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" /></svg>
                              </button>
                              <button onClick={() => setDeleteTarget(card)} className="p-1.5 rounded-lg text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors" title="Delete">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {filteredCards.length === 0 && (
                  <div className="p-10 text-center">
                    <p className="text-[13px] text-muted-foreground font-medium">No cards match your search.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'users' && !dataLoading && (
            <div className="space-y-4">
              <div className="relative max-w-md">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803a7.5 7.5 0 0010.607 0z" /></svg>
                <input value={userSearch} onChange={(e) => setUserSearch(e.target.value)} placeholder="Search users..." className="w-full bg-surface border border-border rounded-xl pl-9 pr-4 py-2.5 text-[13px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-brand/50 transition-colors" />
              </div>
              <div className="bg-white border border-border rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border bg-surface">{['User', 'Plan', 'Actions'].map((h) => <th key={h} className="text-left px-4 py-3 text-[11px] uppercase tracking-widest text-muted-foreground font-bold whitespace-nowrap">{h}</th>)}</tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredUsers.map((user) => (
                        <tr key={user.id} className="hover:bg-surface/50 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-brand flex items-center justify-center shrink-0">
                                <span className="text-white font-bold text-[12px]">{(user.name || user.email || 'U')[0].toUpperCase()}</span>
                              </div>
                              <div className="min-w-0">
                                <p className="text-[13px] font-semibold text-foreground truncate">{user.name || '—'}</p>
                                <p className="text-[11px] text-muted-foreground truncate">{user.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-[11px] font-bold uppercase px-2.5 py-0.5 rounded-full ${user.plan === 'Pro' ? 'bg-brand-dim text-brand' : user.plan === 'Max' ? 'bg-amber-100 text-amber-600' : 'bg-surface-2 text-muted-foreground border border-border'}`}>{user.plan || 'Free'}</span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <select value={user.plan || 'Free'} onChange={(e) => changePlan(user.id, e.target.value)} className="bg-surface border border-border rounded-lg px-2 py-1 text-[12px] text-foreground focus:outline-none focus:border-brand/50">
                                {PLAN_TIERS.map((t) => <option key={t} value={t}>{t}</option>)}
                              </select>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {filteredUsers.length === 0 && (
                  <div className="p-10 text-center">
                    <p className="text-[13px] text-muted-foreground font-medium">{users.length === 0 ? 'No users yet.' : 'No users match your search.'}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'settings' && !dataLoading && (
            <div className="space-y-6">
              <div className="bg-white border border-border rounded-2xl p-5">
                <h3 className="font-bold text-[14px] text-foreground mb-4">Plan Limits</h3>
                <div className="grid grid-cols-3 gap-3">
                  {Object.entries(planLimits).map(([plan, limit]) => (
                    <div key={plan} className="border border-border rounded-xl p-4">
                      <p className="text-[11px] uppercase tracking-wide font-bold text-muted-foreground mb-2">{plan} plan</p>
                      <input type="number" min="0" value={limit} onChange={(e) => setPlanLimits((p) => ({ ...p, [plan]: Number(e.target.value) }))} className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-foreground font-bold focus:outline-none focus:border-brand/50" />
                    </div>
                  ))}
                </div>
                <button onClick={savePlanLimits} className="mt-4 bg-brand text-white text-[13px] font-bold px-4 py-2.5 rounded-xl hover:opacity-90 transition-opacity">Save Limits</button>
              </div>

              <div className="bg-white border border-border rounded-2xl p-5">
                <h3 className="font-bold text-[14px] text-foreground mb-4">Admin Codes</h3>
                <div className="flex gap-2 mb-4">
                  <input value={newCode} onChange={(e) => setNewCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))} placeholder="6-digit code" className="flex-1 bg-surface border border-border rounded-xl px-3 py-2.5 text-[13px] text-foreground font-mono placeholder:text-muted-foreground/40 focus:outline-none focus:border-brand/50" />
                  <input value={newCodeLabel} onChange={(e) => setNewCodeLabel(e.target.value)} placeholder="Label (e.g. Owner)" className="flex-1 bg-surface border border-border rounded-xl px-3 py-2.5 text-[13px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-brand/50" />
                  <button onClick={addAdminCode} disabled={newCode.length !== 6} className="bg-brand text-white text-[13px] font-bold px-4 py-2.5 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-40 shrink-0">Add Code</button>
                </div>
                <div className="divide-y divide-border">
                  {adminCodes.map((c) => (
                    <div key={c.id} className="flex items-center gap-3 py-3">
                      {c.is_current && <span className="font-mono text-[13px] font-bold text-brand">●</span>}
                      <span className={`text-[13px] font-semibold ${c.is_active ? 'text-foreground' : 'text-muted-foreground/50 line-through'}`}>{c.label || `Admin #${c.id.slice(0,4)}`}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${c.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>{c.is_active ? 'Active' : 'Inactive'}</span>
                      <span className="text-[11px] text-muted-foreground/60">{c.created_at ? 'created ' + new Date(c.created_at).toLocaleDateString() : ''}</span>
                      <div className="flex-1" />
                      <button onClick={() => deleteAdminCode(c)} disabled={c.is_current} className="text-[11px] font-bold text-red-600 hover:underline disabled:opacity-40">Delete</button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {showCardModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-[15px] text-foreground">{editingCard ? 'Edit Card' : 'Add New Card'}</h3>
              <button onClick={() => setShowCardModal(false)} className="p-1.5 rounded-lg text-muted-foreground hover:bg-surface transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">Card Number *</label>
                  <input value={formData.card_number} onChange={(e) => setFormData((f) => ({ ...f, card_number: e.target.value }))} placeholder="4111 1111 1111 1111" className="mt-1 w-full bg-surface border border-border rounded-xl px-3 py-2.5 text-[13px] text-foreground font-mono placeholder:text-muted-foreground/40 focus:outline-none focus:border-brand/50" />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">Holder Name *</label>
                  <input value={formData.name} onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))} placeholder="JOHN DOE" className="mt-1 w-full bg-surface border border-border rounded-xl px-3 py-2.5 text-[13px] text-foreground uppercase placeholder:text-muted-foreground/40 focus:outline-none focus:border-brand/50" />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">Expiry *</label>
                  <input value={formData.expiry} onChange={(e) => setFormData((f) => ({ ...f, expiry: e.target.value }))} placeholder="12/29" className="mt-1 w-full bg-surface border border-border rounded-xl px-3 py-2.5 text-[13px] text-foreground font-mono placeholder:text-muted-foreground/40 focus:outline-none focus:border-brand/50" />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">CVV *</label>
                  <input value={formData.cvv} onChange={(e) => setFormData((f) => ({ ...f, cvv: e.target.value.replace(/[^0-9]/g, '').slice(0, 4) }))} placeholder="123" className="mt-1 w-full bg-surface border border-border rounded-xl px-3 py-2.5 text-[13px] text-foreground font-mono placeholder:text-muted-foreground/40 focus:outline-none focus:border-brand/50" />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">Provider</label>
                  <select value={formData.provider} onChange={(e) => setFormData((f) => ({ ...f, provider: e.target.value }))} className="mt-1 w-full bg-surface border border-border rounded-xl px-3 py-2.5 text-[13px] text-foreground focus:outline-none focus:border-brand/50">
                    {['Visa', 'Mastercard', 'Amex', 'Discover', 'RuPay'].map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">Label (Category)</label>
                  <select value={formData.label} onChange={(e) => setFormData((f) => ({ ...f, label: e.target.value }))} className="mt-1 w-full bg-surface border border-border rounded-xl px-3 py-2.5 text-[13px] text-foreground focus:outline-none focus:border-brand/50">
                    {['Netflix', 'Amazon', 'Spotify', 'YouTube', 'Other'].map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <label className="flex items-center gap-2.5 text-[13px] text-foreground font-medium pt-1">
                <input type="checkbox" checked={formData.is_active} onChange={(e) => setFormData((f) => ({ ...f, is_active: e.target.checked }))} className="w-4 h-4 rounded border-border text-brand focus:ring-brand/30" />
                Active (visible in card pool)
              </label>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowCardModal(false)} className="flex-1 bg-surface border border-border text-foreground text-[13px] font-bold px-4 py-2.5 rounded-xl hover:border-brand/50 transition-colors">Cancel</button>
              <button onClick={handleSaveCard} className="flex-1 bg-brand text-white text-[13px] font-bold px-4 py-2.5 rounded-xl hover:opacity-90 transition-opacity">{editingCard ? 'Save Changes' : 'Add Card'}</button>
            </div>
          </div>
        </div>
      )}

      {showBulkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold text-[15px] text-foreground">Bulk Add Cards</h3>
              <button onClick={() => setShowBulkModal(false)} className="p-1.5 rounded-lg text-muted-foreground hover:bg-surface transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <p className="text-[12px] text-muted-foreground mb-4">One card per line: <span className="font-mono text-brand">cardnumber MM/YY CVV</span> (e.g. <span className="font-mono">4111111111111111 12/29 123</span>). Up to 1000 per batch.</p>
            <textarea value={bulkText} onChange={(e) => { setBulkText(e.target.value); setBulkPreview(parseBulkText(e.target.value)) }} placeholder={'4111111111111111 12/29 123\n4222222222222222 01/30 456\n...'} className="w-full h-40 bg-surface border border-border rounded-xl px-3 py-2.5 text-[12px] text-foreground font-mono placeholder:text-muted-foreground/40 focus:outline-none focus:border-brand/50 resize-none" />
            <div className="flex items-center justify-between mt-3 text-[12px] text-muted-foreground">
              <span><span className="font-bold text-brand">{bulkPreview.length}</span> valid cards parsed</span>
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={() => setShowBulkModal(false)} className="flex-1 bg-surface border border-border text-foreground text-[13px] font-bold px-4 py-2.5 rounded-xl hover:border-brand/50 transition-colors">Cancel</button>
              <button onClick={handleBulkAdd} disabled={bulkPreview.length === 0} className="flex-1 bg-brand text-white text-[13px] font-bold px-4 py-2.5 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-40">Add {bulkPreview.length || ''} Cards</button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 text-center">
            <div className="w-12 h-12 mx-auto rounded-full bg-red-50 flex items-center justify-center mb-3">
              <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
            </div>
            <h3 className="font-bold text-[15px] text-foreground mb-1">Delete card</h3>
            <p className="text-[13px] text-muted-foreground mb-5">Are you sure? This removes <span className="font-mono font-bold text-foreground">•••• {deleteTarget.card_number?.slice(-4)}</span> permanently.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 bg-surface border border-border text-foreground text-[13px] font-bold px-4 py-2.5 rounded-xl hover:border-brand/50 transition-colors">Cancel</button>
              <button onClick={handleDeleteCard} className="flex-1 bg-red-600 text-white text-[13px] font-bold px-4 py-2.5 rounded-xl hover:bg-red-700 transition-colors">Delete</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl text-[13px] font-bold shadow-lg text-white ${toast.type === 'error' ? 'bg-red-600' : toast.type === 'info' ? 'bg-ink text-white' : 'bg-green-600'}`}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}

// ─── ROOT APP ─────────────────────────────────────────────────────────────────
function App() {
  const [view, setView] = useState('landing')
  const [currentUser, setCurrentUser] = useState(null)
  const [booting, setBooting] = useState(true)

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('vcz_user')
      if (saved) setCurrentUser(JSON.parse(saved))
    } catch {}
    setBooting(false)
  }, [])

  const navigate = useCallback((v) => setView(v), [])

  const handleLogin = useCallback((user) => {
    setCurrentUser(user)
    try { user?.isGuest ? sessionStorage.removeItem('vcz_user') : sessionStorage.setItem('vcz_user', JSON.stringify(user)) } catch {}
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
    try { sessionStorage.removeItem('vcz_user') } catch {}
    setView('landing')
  }, [])

  if (booting) return <div className="min-h-screen bg-background flex items-center justify-center"><p className="text-sm text-muted-foreground">Loading…</p></div>

  return (
    <>
      {view === 'landing' && <LandingPage isLoggedIn={!!currentUser} onNavigate={navigate} />}
      {view === 'auth' && <AuthPage onLogin={handleLogin} onAdminLogin={handleAdminLogin} onNavigate={navigate} />}
      {view === 'cards' && <CardsPage currentUser={currentUser} onNavigate={navigate} />}
      {view === 'pricing' && <PricingPage currentUser={currentUser} onNavigate={navigate} />}
      {view === 'account' && <AccountPage currentUser={currentUser} onLogout={handleLogout} onNavigate={navigate} />}
      {view === 'admin' && <AdminPanelPage onNavigate={navigate} />}
    </>
  )
}

export default App