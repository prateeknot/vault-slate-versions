import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from './lib/supabase'

// ─── View / Plan types ────────────────────────────────────────────────────────
// (JS port keeps the same shapes as the original vcardz-source page.tsx)

// ─── V2 PACK DEFINITIONS (INR Price -> USD Card Balance) ──────────────────────
const V2_PACKS = [
  { id: 'spark', name: 'Spark', price_inr: 299, balance_usd: 15, stars: 153, badge: 'Starter' },
  { id: 'orbit', name: 'Orbit', price_inr: 499, balance_usd: 26, stars: 256, badge: 'Popular' },
  { id: 'nova', name: 'Nova', price_inr: 799, balance_usd: 32, stars: 410, badge: 'Best Value' },
  { id: 'galaxy', name: 'Galaxy', price_inr: 999, balance_usd: 49, stars: 512, badge: 'Pro' },
  { id: 'cosmos', name: 'Cosmos', price_inr: 1299, balance_usd: 67, stars: 666, badge: 'Ultra' },
  { id: 'infinity', name: 'Infinity', price_inr: 1599, balance_usd: 82, stars: 820, badge: 'Max Balance' },
]

// ─── Version (v1 → v2 → v3 → v4 → v5) ─────────────────────────────────────────
const APP_VERSION = '5.0.0'

const TELEGRAM_BOT_USERNAME = 'temp_card_pro_bot'
const TELEGRAM_BOT_URL = `https://t.me/${TELEGRAM_BOT_USERNAME}`
const BOT_API_BASE = 'https://temp-card-bot.onrender.com'

const TIER_BALANCES = {
  free: 0,
  spark: 15,
  orbit: 26,
  nova: 32,
  galaxy: 49,
  cosmos: 67,
  infinity: 82,
}

// ─── Defaults & seed fallback (used only when Supabase is unreachable) ────────
let PLAN_LIMITS = { free: 3, pro: 5, max: 10 }
const CATEGORIES = ['All', 'Netflix', 'Amazon', 'Spotify', 'YouTube', 'Other']

// Session-persisted admin token (issued by admin_login, gates all admin RPCs)
function getAdminToken() { try { return sessionStorage.getItem('vcz_admin_token') || '' } catch { return '' } }
function setAdminToken(t) { try { t ? sessionStorage.setItem('vcz_admin_token', t) : sessionStorage.removeItem('vcz_admin_token') } catch { } }

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
      <rect width="34" height="26" rx="4" fill="#b8c2d1" />
      <rect x="3" y="3" width="28" height="20" rx="3" fill="#dfe5ec" />
      <rect x="13" y="0" width="8" height="26" rx="1" fill="#b8c2d1" opacity="0.5" />
      <rect x="0" y="9" width="34" height="8" rx="1" fill="#b8c2d1" opacity="0.5" />
      <rect x="13" y="9" width="8" height="8" rx="1" fill="#a3aec0" />
    </svg>
  )
}

// ─── Card Gradients (slate / navy fintech family, subtle per-provider hue) ────
const CARD_GRADIENTS = {
  Visa: 'from-slate-500 via-slate-600 to-slate-700',
  Mastercard: 'from-zinc-500 via-neutral-600 to-zinc-700',
  Amex: 'from-teal-600 via-slate-600 to-slate-700',
  Discover: 'from-stone-500 via-neutral-600 to-stone-700',
  RuPay: 'from-indigo-500 via-slate-600 to-slate-700',
}
const CARD_FULL_GRADIENTS = {
  Visa: 'from-[#7189a3] via-[#5f7894] to-[#4c637c]',
  Mastercard: 'from-[#818995] via-[#68717c] to-[#535d69]',
  Amex: 'from-[#6d9090] via-[#5f7d84] to-[#4f6973]',
  Discover: 'from-[#958777] via-[#7d7163] to-[#655b50]',
  RuPay: 'from-[#7b86aa] via-[#687898] to-[#53637f]',
}
const CARD_GLOW = {
  Visa: 'rgba(95,120,148,0.20)',
  Mastercard: 'rgba(104,113,124,0.18)',
  Amex: 'rgba(95,125,132,0.18)',
  Discover: 'rgba(125,113,99,0.18)',
  RuPay: 'rgba(104,120,152,0.18)',
}
const CATEGORY_COLORS = {
  Netflix: { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200' },
  Amazon: { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200' },
  Spotify: { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200' },
  YouTube: { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200' },
  Other: { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200' },
  All: { bg: 'bg-brand-dim', text: 'text-brand', border: 'border-brand/20' },
}

  // Display-only sample so the Cards screen has a clear visual reference even
  // before the connected account has claimed a real card. It never enters state
  // or Supabase and cannot be claimed.
const PREVIEW_CARD = {
  id: 'preview-card',
  provider: 'Visa',
  bank: 'Sample Bank',
  card_number: '4242424242424242',
  name: 'Your Name',
  expiry: '09/29',
  cvv: '123',
  balance_usd: 12,
  category: 'Other',
  tier: 'preview',
}

// ─── Virtual Card Visual ──────────────────────────────────────────────────────
function VirtualCardVisual({ card, flipped = false, onFlip }) {
  const gradient = CARD_FULL_GRADIENTS[card.provider] || CARD_FULL_GRADIENTS.Visa
  return (
    <div
      className="relative w-full cursor-pointer select-none card-float"
      style={{ aspectRatio: '1.586', perspective: 1000 }}
      onClick={onFlip}
      onKeyDown={onFlip ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onFlip() } } : undefined}
      role="button"
      tabIndex={onFlip ? 0 : -1}
      aria-label={flipped ? 'Show card front' : 'Show card back'}
    >
      <div
        className="w-full h-full transition-transform duration-500"
        style={{ transformStyle: 'preserve-3d', transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}
      >
        {/* Front */}
        <div
          className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${gradient} p-5 flex flex-col justify-between overflow-hidden card-shimmer`}
          style={{ backfaceVisibility: 'hidden', boxShadow: '0 18px 34px -14px rgba(15,23,42,0.45)' }}
        >
          <div className="absolute inset-0 rounded-2xl pointer-events-none" style={{ background: 'linear-gradient(135deg,rgba(255,255,255,0.10) 0%,transparent 55%)' }} />
          <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white/[0.04] pointer-events-none" />
          <div className="absolute -bottom-12 -left-8 w-32 h-32 rounded-full bg-black/15 pointer-events-none" />

          <div className="flex items-start justify-between relative z-10">
            <div>
              <p className="text-[10px] text-white/55 uppercase tracking-widest font-bold">VCardz</p>
              <p className="text-[11px] text-white/40 mt-0.5 font-medium">{card.bank}</p>
            </div>
            <div className="flex items-center gap-2">
              {card.balance_usd !== undefined && (
                <span className="bg-white/10 backdrop-blur-md px-2.5 py-0.5 rounded-full border border-white/15 text-white font-black text-[11px] shadow-sm tracking-wide">
                  ${card.balance_usd} USD
                </span>
              )}
              <ProviderLogo provider={card.provider} size="sm" />
            </div>
          </div>
          <div className="relative z-10"><ChipSVG /></div>
          <div className="relative z-10">
            <p className="font-mono text-white/90 text-[15px] tracking-[0.2em] font-semibold drop-shadow-sm">{formatCardNumber(card.card_number)}</p>
            <div className="flex items-end justify-between mt-2.5">
              <div>
                <p className="text-[8px] text-white/35 uppercase tracking-widest">Card Holder</p>
                <p className="text-[12px] text-white font-bold tracking-wide mt-0.5">{card.name}</p>
              </div>
              <div className="text-right">
                <p className="text-[8px] text-white/35 uppercase tracking-widest">Expires</p>
                <p className="text-[12px] text-white font-bold mt-0.5">{card.expiry}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Back */}
        <div
          className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${gradient} flex flex-col justify-between overflow-hidden`}
          style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)', boxShadow: '0 18px 34px -14px rgba(15,23,42,0.45)' }}
        >
          <div className="absolute inset-0 rounded-2xl pointer-events-none" style={{ background: 'linear-gradient(135deg,rgba(255,255,255,0.06) 0%,transparent 55%)' }} />
          <div className="mt-8 h-10 bg-black/50 w-full" />
          <div className="px-5 pb-5 relative z-10">
            <div className="flex items-center justify-end gap-3 mt-4">
              <div className="flex-1 h-8 rounded-lg bg-white/8 backdrop-blur-sm" />
              <div className="bg-white/95 rounded-lg px-3 py-2 flex items-center gap-2 shadow-md">
                <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wide">CVV</p>
                <p className="font-mono text-slate-900 font-black text-[14px] tracking-widest">{card.cvv}</p>
              </div>
            </div>
            <p className="text-[9px] text-white/25 text-center mt-4 tracking-wide">Tap to flip back</p>
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

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toast({ message, type, onClose }) {
  const s = { success: 'bg-white border-border text-foreground', error: 'bg-white border-red-200 text-red-600', info: 'bg-white border-border text-foreground' }
  const dot = { success: 'bg-emerald-500', error: 'bg-red-500', info: 'bg-slate-400' }
  return (
    <div className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-2.5 px-4 py-3 rounded-xl border shadow-panel backdrop-blur-md ${s[type]}`} style={{ minWidth: 220 }}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot[type]}`} />
      <span className="text-[13px] font-medium">{message}</span>
      <button onClick={onClose} className="ml-auto opacity-50 hover:opacity-100" aria-label="Close">
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
      onClick={() => { navigator.clipboard.writeText(value).catch(() => { }); setCopied(true); setTimeout(() => setCopied(false), 1800) }}
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
      activeFill: <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M11.47 3.84a.75.75 0 011.06 0l8.69 8.69a.75.75 0 101.06-1.06l-8.689-8.69a2.25 2.25 0 00-3.182 0l-8.69 8.69a.75.75 0 001.061 1.06l8.69-8.69z" /><path d="M12 5.432l8.159 8.159c.03.03.06.058.091.086v6.198c0 1.035-.84 1.875-1.875 1.875H15a.75.75 0 01-.75-.75v-4.5a.75.75 0 00-.75-.75h-3a.75.75 0 00-.75.75V21a.75.75 0 01-.75.75H5.625a1.875 1.875 0 01-1.875-1.875v-6.198a2.29 2.29 0 00.091-.086L12 5.43z" /></svg>,
    },
    {
      id: 'cards', label: 'Cards',
      icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" /></svg>,
      activeFill: <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M2.273 5.625A4.483 4.483 0 015.25 4.5h13.5c1.141 0 2.183.425 2.977 1.125A3 3 0 0018.75 3H5.25a3 3 0 00-2.977 2.625zM2.273 8.625A4.483 4.483 0 015.25 7.5h13.5c1.141 0 2.183.425 2.977 1.125A3 3 0 0018.75 6H5.25a3 3 0 00-2.977 2.625zM5.25 9a3 3 0 00-3 3v6a3 3 0 003 3h13.5a3 3 0 003-3v-6a3 3 0 00-3-3H5.25zm6.75 8.25a2.25 2.25 0 110-4.5 2.25 2.25 0 010 4.5z" /></svg>,
    },
    {
      id: 'pricing', label: 'Plans',
      icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" /><path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" /></svg>,
      activeFill: <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path fillRule="evenodd" d="M5.25 2.25a3 3 0 00-3 3v4.318a3 3 0 00.879 2.121l9.58 9.581c.92.92 2.39 1.056 3.46.3a18.598 18.598 0 005.441-5.44c.757-1.072.62-2.54-.3-3.461L11.73 3.53a3 3 0 00-2.122-.879H5.25zM6.375 7.5a1.125 1.125 0 100-2.25 1.125 1.125 0 000 2.25z" clipRule="evenodd" /></svg>,
    },
    {
      id: isLoggedIn ? 'account' : 'auth', label: isLoggedIn ? 'Settings' : 'Login',
      icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>,
      activeFill: <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path fillRule="evenodd" d="M7.5 6a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM3.751 20.105a8.25 8.25 0 0116.498 0 .75.75 0 01-.437.695A18.683 18.683 0 0112 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 01-.437-.695z" clipRule="evenodd" /></svg>,
    },
  ]

  const visibleTabs = isLoggedIn ? tabs : [tabs[3]]

  const activeView = view === 'account' || view === 'settings' ? 'account' : view === 'auth' ? (isLoggedIn ? 'account' : 'auth') : view
  const activeColor = 'text-brand'

  // Split tabs around a decorative, raised center action button (visual parity
  // with the reference design). It performs a harmless existing navigation
  // (browse cards) — no new functionality is introduced.
  const [leftTabs, rightTabs] = [visibleTabs.slice(0, 2), visibleTabs.slice(2)]

  const renderTab = (tab) => {
    const isActive = activeView === tab.id || (tab.id === 'auth' && view === 'auth' && !isLoggedIn)
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
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 px-3 pb-3">
      <div className="max-w-md mx-auto relative rounded-[28px] border border-border bg-white/90 backdrop-blur-xl shadow-panel">
        <div className="flex items-center justify-around h-16 px-2">
          {leftTabs.map(renderTab)}
          <span className="w-14 shrink-0" aria-hidden="true" />
          {rightTabs.map(renderTab)}
        </div>
        <button
          onClick={() => onNavigate(isLoggedIn ? 'cards' : 'auth')}
          aria-label="Top up"
          className="ios-topup ios-topup-icon absolute -top-5 left-1/2 -translate-x-1/2 w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg border-4 border-background active:scale-95 transition-transform"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
        </button>
      </div>
    </nav>
  )
}

// ─── LANDING PAGE ─────────────────────────────────────────────────────────────
function LandingPage({ isLoggedIn, onNavigate, settings }) {
  const [availableCount, setAvailableCount] = useState(null)

  useEffect(() => {
    let active = true
    supabase.rpc('tier_stock').then(({ data }) => {
      if (!active || !Array.isArray(data)) return
      setAvailableCount(data.reduce((s, i) => s + (i.available || 0), 0))
    }).catch(() => { })
    return () => { active = false }
  }, [])

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {settings?.announcement && (
        <div className="bg-brand text-primary-foreground text-center text-[12px] font-semibold px-4 py-2">{settings.announcement}</div>
      )}
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-md">
        <div className="max-w-md mx-auto px-4 flex items-center justify-between h-14">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
              <svg className="w-4 h-4 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" /></svg>
            </div>
            <span className="font-bold text-foreground tracking-tight">VCardz</span>
          </div>
          <div className="ios-header-box px-2 py-1.5 rounded-2xl">
            {isLoggedIn
              ? <button onClick={() => onNavigate('cards')} className="ios-header-action text-sm font-semibold text-brand px-3 py-1.5 rounded-xl">Browse Cards</button>
              : <button onClick={() => onNavigate('auth')} className="ios-header-action text-sm font-semibold text-brand px-3 py-1.5 rounded-xl">Sign in</button>}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-md mx-auto w-full px-4 pb-28">
        <section className="pt-10 pb-8">
          <div className="inline-flex items-center gap-2 bg-brand-dim border border-brand/15 rounded-full px-3 py-1 mb-5">
            <span className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse" />
            <span className="text-[11px] text-brand font-semibold tracking-wide uppercase">{availableCount ?? '…'} cards available now</span>
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
              className="w-full py-3.5 rounded-2xl font-black text-[15px] hover:opacity-90 active:scale-[0.98] transition-all shadow-lg text-primary-foreground bg-primary"
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
          <p className="text-[11px] text-muted-foreground uppercase tracking-widest font-semibold mb-4 text-center">Top-Up Packs</p>
          <div className="grid grid-cols-3 gap-2">
            {V2_PACKS.slice(0, 6).map((p) => (
              <div key={p.id} className="relative rounded-2xl border p-3 text-center transition-all border-border bg-surface">
                <p className="font-bold text-[13px] text-foreground">{p.name}</p>
                <p className="text-brand font-bold text-[13px] mt-0.5">₹{p.price_inr}</p>
                <p className="text-muted-foreground text-[11px] mt-0.5">${p.balance_usd} USD</p>
              </div>
            ))}
          </div>
          <button onClick={() => onNavigate('pricing')} className="mt-3 w-full text-[13px] text-brand font-semibold py-2.5 rounded-xl border border-brand/20 hover:bg-brand-dim transition-colors">
            View all packs
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
  const [plan] = useState('free')
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
        const verifyJson = await verifyRes.json().catch(() => ({}))
        if (!verifyRes.ok || !verifyJson.success) {
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

  const inputBase = 'w-full bg-surface border border-border rounded-xl px-4 py-3 text-foreground text-[14px] placeholder:text-muted-foreground/50 focus:outline-none focus:border-brand/60 focus:ring-2 focus:ring-brand/15 transition-colors'

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-md">
        <div className="max-w-md mx-auto px-4 flex items-center h-14">
          <button onClick={() => onNavigate('landing')} className="mr-3 text-muted-foreground hover:text-foreground" aria-label="Back">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" /></svg>
          </button>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-primary flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" /></svg>
            </div>
            <span className="font-bold text-foreground">VCardz</span>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-md mx-auto w-full px-4 py-8 pb-28 space-y-4">
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

            <div ref={turnstileRef} className="flex justify-center" />
            {turnstileFailed && <p className="text-center text-[11px] text-amber-600">Security check unavailable — you can continue without it.</p>}

            {!isLogin && (
              <p className="text-center text-[11px] text-muted-foreground">Free plan on signup — upgrade to a Top-Up Pack anytime.</p>
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

      <BottomNav view="auth" isLoggedIn={false} onNavigate={onNavigate} />
    </div>
  )
}

// ─── Card List Item ───────────────────────────────────────────────────────────
function CardListItem({ card, onOpen, compact = false }) {
  const catColor = CATEGORY_COLORS[card.category] ?? CATEGORY_COLORS.Other
  return (
    <button
      onClick={() => onOpen(card)}
      className={`card-item-glow relative w-full text-left bg-white border border-border rounded-2xl ${compact ? 'p-3' : 'p-3.5'} flex items-center gap-3.5 active:scale-[0.98] transition-all duration-200 hover:shadow-soft`}
      style={{ ['--glow-color']: CARD_GLOW[card.provider] }}
    >
      {card.is_favorite && !compact && <span className="absolute top-2 right-2 text-[12px] text-amber-500" aria-label="Favorite">★</span>}
      <div className={`relative w-14 h-10 rounded-xl bg-gradient-to-br ${CARD_GRADIENTS[card.provider] || CARD_GRADIENTS.Visa} flex flex-col items-start justify-between p-1.5 shrink-0 overflow-hidden`}>
        <div className="absolute inset-0 rounded-xl" style={{ background: 'linear-gradient(135deg,rgba(255,255,255,0.14) 0%,transparent 55%)' }} />
        <div className="w-4 h-3 rounded-sm relative z-10" style={{ background: 'linear-gradient(135deg,#dfe5ec,#b8c2d1)', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }}>
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
        <div className={`flex items-center gap-1.5 mt-1 ${compact ? 'flex-wrap' : ''}`}>
          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${card.tier === 'free' ? 'bg-surface-2 text-muted-foreground' : 'bg-brand-dim text-brand'}`}>{card.tier || 'free'}</span>
          <span className="text-[11px] text-emerald-600 font-bold">${card.balance_usd ?? 0} USD</span>
          {!compact && <><span className="text-[11px] text-muted-foreground/60 font-medium">{card.bank}</span>{card.expiry && <><span className="text-muted-foreground/30 text-[10px]">•</span><span className="text-[11px] text-muted-foreground/60">Exp {card.expiry}</span></>}</>}
        </div>
        {!compact && card.note && <p className="text-[11px] text-brand font-semibold mt-1 truncate">🏷 {card.note}</p>}
      </div>

      <div className="shrink-0 w-7 h-7 rounded-full bg-surface flex items-center justify-center border border-border">
        <svg className="w-3.5 h-3.5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
      </div>
    </button>
  )
}

// ─── Card Detail Modal ────────────────────────────────────────────────────────
function CardDetailModal({ card, flipped, onFlip, onClose, onCopy, isPreview = false, onRename, onToggleFav }) {
  const [noteInput, setNoteInput] = useState(card?.note || '')
  const isOwned = !!card?.uc_id
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" />
      <div className="modal-slide-up relative bg-white rounded-t-3xl border-t border-border p-5 pb-10 max-h-[90vh] overflow-y-auto shadow-panel" onClick={(e) => e.stopPropagation()}>
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
        {isPreview && <div className="mb-4 rounded-2xl border border-brand/20 bg-brand-dim px-4 py-3 text-[12px] font-medium text-brand">This is a display-only sample card. Its details are for preview purposes only.</div>}
        {isOwned && (
          <div className="mb-4 rounded-2xl border border-border bg-surface p-3.5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Nickname</p>
              {card?.is_favorite
                ? <button onClick={() => onToggleFav?.(card)} className="text-[11px] font-bold text-amber-600 hover:text-amber-700 flex items-center gap-1"><span className="text-[13px]">★</span> Favorite</button>
                : <button onClick={() => onToggleFav?.(card)} className="text-[11px] font-bold text-muted-foreground hover:text-brand flex items-center gap-1"><span className="text-[13px]">☆</span> Favorite</button>}
            </div>
            <div className="flex gap-2">
              <input
                value={noteInput}
                onChange={(e) => setNoteInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') onRename?.(noteInput) }}
                placeholder="e.g. Netflix card"
                maxLength={40}
                className="flex-1 bg-white border border-border rounded-xl px-3 py-2.5 text-[13px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-brand/60 transition-colors"
              />
              <button onClick={() => onRename?.(noteInput)} className="shrink-0 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-[12px] hover:opacity-90 transition-opacity">Save</button>
            </div>
          </div>
        )}
        <p className="text-[11px] text-muted-foreground uppercase tracking-widest font-semibold mb-2 px-1">Card Information</p>
        <div className="space-y-2">
          {[
            { label: 'Card Number', value: formatCardNumber(card.card_number), displayValue: maskCardNumber(card.card_number) },
            { label: 'Card Holder', value: card.name },
            { label: 'Expiry Date', value: card.expiry },
            { label: 'CVV', value: card.cvv, displayValue: '•••' },
            { label: 'Bank', value: card.bank },
            { label: 'Network', value: card.provider },
          ].map((item) => (
            <div key={item.label} className="flex items-center justify-between border border-border bg-surface rounded-xl px-4 py-3">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">{item.label}</p>
                <p className="text-[14px] font-bold text-foreground mt-0.5 font-mono">{item.displayValue || item.value}</p>
              </div>
              {!isPreview && <CopyButton value={item.value || ''} label={item.label} />}
            </div>
          ))}
        </div>
        {!isPreview && <button
          onClick={() => {
            const text = `Card: ${formatCardNumber(card.card_number)}\nName: ${card.name}\nExpiry: ${card.expiry}\nCVV: ${card.cvv}\nBank: ${card.bank}`
            navigator.clipboard.writeText(text).catch(() => { })
            onCopy(text, 'All details')
          }}
          className="mt-5 w-full py-3.5 rounded-2xl font-black text-[14px] hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-lg text-primary-foreground bg-primary"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2 2 2 0 00-2 2z" /></svg>
          Share Card Details
        </button>}
      </div>
    </div>
  )
}

// ─── CARDS PAGE ───────────────────────────────────────────────────────────────
function CardsPage({ currentUser, onNavigate, settings }) {
  const userPlan = currentUser?.plan ?? 'free'
  const claimsEnabled = settings?.claims_enabled !== 'false'
  const isGuest = !!currentUser?.isGuest
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [search, setSearch] = useState('')
  const [selectedCard, setSelectedCard] = useState(null)
  const [flipped, setFlipped] = useState(false)
  const [toast, setToast] = useState(null)
  const [claimed, setClaimed] = useState([])
  const [overview, setOverview] = useState(null)
  const [loading, setLoading] = useState(true)
  const [claiming, setClaiming] = useState(false)
  const [layout, setLayout] = useState('list')
  const [favOnly, setFavOnly] = useState(false)

  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 2500)
  }, [])

  const handleClaimFreeCard = async () => {
    setClaiming(true)
    try {
      const { data, error } = await supabase.rpc('claim_free_card')
      if (error) throw error
      if (!data || data.length === 0) throw new Error('NO_FREE_CARDS')
      showToast('🎉 Free card claimed with random USD balance!')
      await fetchData()
    } catch (err) {
      console.error('Claim free card error:', err)
      const msg = String(err.message || err)
      if (msg.includes('NO_FREE_CARDS')) {
        showToast('No free cards left right now. Upgrade your plan to get a card instantly.', 'error')
      } else {
        showToast('Could not claim free card. Please try again.', 'error')
      }
    } finally {
      setClaiming(false)
    }
  }

  const normalizeCards = (rows) => (rows || []).map((c) => ({
    id: c.id,
    uc_id: c.uc_id,
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
    tier: c.tier || 'free',
    balance_usd: c.balance_usd ?? TIER_BALANCES[c.tier || 'free'] ?? 0,
    note: c.note || '',
    is_favorite: !!c.is_favorite,
    created_at: c.created_at,
  }))

  const fetchData = useCallback(async () => {
    try {
      if (isGuest) {
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
      setOverview(overview)
      setClaimed(rows)
    } catch (err) {
      console.error('Fetch error:', err)
      showToast('Could not load cards', 'error')
    } finally {
      setLoading(false)
    }
  }, [isGuest, showToast])

  useEffect(() => { fetchData() }, [fetchData])

  // Realtime: cards table (admin edits) + user_cards table (admin assigning/removing
  // cards, user nickname/favorite changes). Both broadcast the user's own rows only
  // (RLS), so admin actions now reach the user within seconds instead of minutes.
  useEffect(() => {
    if (isGuest) return
    let channel = null
    let cancelled = false
    supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return
      const uid = data.user?.id
      if (uid) {
        channel = supabase.channel('cards-realtime')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'cards' }, () => fetchData())
          .on('postgres_changes', { event: '*', schema: 'public', table: 'user_cards', filter: `user_id=eq.${uid}` }, () => fetchData())
          .subscribe()
      }
    })
    return () => { cancelled = true; if (channel) supabase.removeChannel(channel) }
  }, [isGuest, fetchData])

  const expiringSoon = claimed.filter((c) => {
    const m = String(c.expiry || '').match(/^(\d{2})\/(\d{2})$/)
    if (!m) return false
    const exp = new Date(2000 + parseInt(m[2], 10), parseInt(m[1], 10), 1).getTime()
    const now = Date.now()
    return exp >= now && exp < now + 60 * 24 * 60 * 60 * 1000
  })

  const visibleClaimed = claimed.filter((c) =>
    (!favOnly || c.is_favorite) &&
    (selectedCategory === 'All' || c.category === selectedCategory) &&
    (!search || (c.name || '').toLowerCase().includes(search.toLowerCase()) || (c.bank || '').toLowerCase().includes(search.toLowerCase()) || (c.provider || '').toLowerCase().includes(search.toLowerCase()))
  )

  const renameCard = async (note) => {
    if (!selectedCard?.uc_id) return
    try {
      const { error } = await supabase.rpc('my_card_update', { p_uc_id: selectedCard.uc_id, p_note: String(note || '').slice(0, 40) })
      if (error) throw error
      setSelectedCard((prev) => ({ ...prev, note: String(note || '').slice(0, 40) }))
      setClaimed((prev) => prev.map((c) => (c.uc_id === selectedCard.uc_id ? { ...c, note: String(note || '').slice(0, 40) } : c)))
      showToast('Nickname saved')
    } catch (err) { showToast('Could not save: ' + err.message, 'error') }
  }

  const toggleFavorite = async (card) => {
    if (!card?.uc_id) return
    const next = !card.is_favorite
    try {
      const { error } = await supabase.rpc('my_card_update', { p_uc_id: card.uc_id, p_favorite: next })
      if (error) throw error
      setSelectedCard((prev) => prev && prev.uc_id === card.uc_id ? { ...prev, is_favorite: next } : prev)
      setClaimed((prev) => prev.map((c) => (c.uc_id === card.uc_id ? { ...c, is_favorite: next } : c)))
      showToast(next ? 'Added to favorites' : 'Removed from favorites')
    } catch (err) { showToast('Could not update: ' + err.message, 'error') }
  }

  const exportMyCards = () => {
    try {
      const blob = new Blob([JSON.stringify(claimed, null, 2)], { type: 'application/json' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `vcardz-my-cards-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove() }, 100)
      showToast('Your cards exported')
    } catch { showToast('Export failed', 'error') }
  }

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

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {settings?.announcement && (
        <div className="bg-brand text-primary-foreground text-center text-[12px] font-semibold px-4 py-2">{settings.announcement}</div>
      )}
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-md">
        <div className="max-w-md mx-auto px-4 flex items-center justify-between h-14">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
              <svg className="w-4 h-4 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" /></svg>
            </div>
            <span className="font-bold text-foreground">VCardz</span>
          </div>
          {!isGuest && (
            <span className={`text-[11px] font-bold uppercase px-2.5 py-1 rounded-full ${['max', 'galaxy', 'cosmos', 'infinity'].includes(userPlan) ? 'bg-amber-100 text-amber-700 border border-amber-200' : ['pro', 'spark', 'orbit', 'nova'].includes(userPlan) ? 'bg-brand-dim text-brand border border-brand/20' : 'bg-surface-2 text-muted-foreground border border-border'}`}>
              {userPlan} plan
            </span>
          )}
        </div>
      </header>

      <main className="flex-1 max-w-md mx-auto w-full px-4 pt-4 pb-28">
        <div className="relative mb-4">
          {!isGuest && (
            <>
              <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803a7.5 7.5 0 0010.607 0z" /></svg>
              <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, bank, provider..."
                className="w-full bg-surface border border-border rounded-xl pl-10 pr-4 py-2.5 text-[14px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-brand/50 focus:ring-2 focus:ring-brand/10 transition-colors" />
            </>
          )}
        </div>

        {!isGuest && (
          <div className="flex gap-2 overflow-x-auto pb-1 mb-5 scrollbar-none">
            <button onClick={() => setFavOnly(!favOnly)}
              className={`shrink-0 px-3.5 py-1.5 rounded-full text-[12px] font-bold transition-all duration-200 border ${favOnly ? 'bg-amber-500 text-white border-amber-500 shadow-sm' : 'bg-white border-border text-muted-foreground'}`}>
              ★ Favorites{claimed.some((c) => c.is_favorite) ? ` (${claimed.filter((c) => c.is_favorite).length})` : ''}
            </button>
            {CATEGORIES.map((cat) => {
              const isActive = selectedCategory === cat && !favOnly
              return (
                <button key={cat} onClick={() => { setFavOnly(false); setSelectedCategory(cat) }}
                  className={`shrink-0 px-3.5 py-1.5 rounded-full text-[12px] font-bold transition-all duration-200 border ${isActive ? 'bg-primary text-primary-foreground border-primary shadow-sm' : 'bg-white border-border text-muted-foreground'}`}>
                  {cat}
                </button>
              )
            })}
          </div>
        )}

        {!isGuest && claimed.length > 0 && (
          <div className="rounded-2xl border border-border bg-white shadow-soft p-4 mb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Total Balance</p>
                <p className="text-[22px] font-black text-foreground mt-0.5">${Number(overview?.total_balance ?? 0).toFixed(2)}</p>
              </div>
              <div className="text-right">
                <p className="text-[12px] font-bold text-foreground">{claimed.length} card{claimed.length !== 1 ? 's' : ''}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{userPlan} plan</p>
              </div>
            </div>
            <div className="mt-3">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground font-semibold mb-1">
                <span>Free claim limit</span>
                <span>{claimed.filter((c) => c.tier === 'free').length} / {overview?.card_limit ?? 1}</span>
              </div>
              <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
                <div className="h-full rounded-full bg-brand transition-all duration-500" style={{ width: `${Math.min(100, (claimed.filter((c) => c.tier === 'free').length / Math.max(1, overview?.card_limit ?? 1)) * 100)}%` }} />
              </div>
            </div>
          </div>
        )}

        {!isGuest && expiringSoon.length > 0 && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-center gap-3 mb-4">
            <span className="text-[18px]">⏰</span>
            <div className="flex-1">
              <p className="text-[12px] font-bold text-amber-700">{expiringSoon.length} card{expiringSoon.length !== 1 ? 's' : ''} expiring soon</p>
              <p className="text-[11px] text-amber-600">Copy details before they expire.</p>
            </div>
            <button onClick={() => { setSelectedCard(expiringSoon[0]); setFlipped(false) }} className="text-[11px] font-bold text-amber-700 bg-white border border-amber-200 px-3 py-1.5 rounded-lg hover:bg-amber-100 transition-colors">View</button>
          </div>
        )}

        {!isGuest && (
          <div className="flex items-center justify-between mb-4">
            <p className="text-[12px] text-muted-foreground">
              <span className="text-foreground font-semibold">{visibleClaimed.length}</span> virtual card{visibleClaimed.length !== 1 ? 's' : ''} shown
            </p>
            <div className="flex items-center gap-2">
              <button onClick={exportMyCards} title="Export my cards" aria-label="Export my cards" className="w-8 h-8 rounded-xl bg-surface border border-border flex items-center justify-center text-muted-foreground hover:text-brand hover:border-brand/40 transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
              </button>
              <div className="flex bg-surface border border-border rounded-xl p-0.5">
                <button onClick={() => setLayout('list')} aria-label="List view" className={`w-8 h-7 rounded-lg flex items-center justify-center transition-colors ${layout === 'list' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground'}`}>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" /></svg>
                </button>
                <button onClick={() => setLayout('grid')} aria-label="Grid view" className={`w-8 h-7 rounded-lg flex items-center justify-center transition-colors ${layout === 'grid' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground'}`}>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" /></svg>
                </button>
              </div>
              <button onClick={() => onNavigate('pricing')} className="text-[11px] text-brand font-semibold hover:underline">Add a card</button>
            </div>
          </div>
        )}

        <section className="mb-5 rounded-2xl border border-brand/15 bg-white/70 p-3 shadow-soft">
          <div className="flex items-center justify-between px-1 pb-2">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-brand">Card preview</p>
              <p className="text-[12px] text-muted-foreground">Example details and layout</p>
            </div>
            <span className="rounded-full bg-brand-dim px-2.5 py-1 text-[10px] font-bold text-brand">DEMO</span>
          </div>
          <CardListItem card={PREVIEW_CARD} onOpen={(c) => { setSelectedCard(c); setFlipped(false) }} />
        </section>

        {!isGuest && claimed.length === 0 && !loading && (
          <div className="bg-surface border border-border rounded-2xl p-6 text-center mb-4">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-primary flex items-center justify-center mb-3">
              <svg className="w-7 h-7 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 11.25v8.25a1.5 1.5 0 01-1.5 1.5H5.25a1.5 1.5 0 01-1.5-1.5v-8.25M12 4.875A2.625 2.625 0 109.375 7.5H12m0-2.625V7.5m0-2.625A2.625 2.625 0 1114.625 7.5H12m0 0v3.75m0-3.75h5.25" /></svg>
            </div>
            {claimsEnabled ? (
              <>
                <h3 className="font-black text-[16px] text-foreground mb-1">Get Your Free Card</h3>
                <p className="text-[12px] text-muted-foreground mb-4">Claim a free virtual card with a random USD balance ($1 - $15)</p>
                <button
                  onClick={handleClaimFreeCard}
                  disabled={claiming}
                  className="w-full py-3 rounded-xl font-bold text-[14px] text-primary-foreground bg-primary hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-60 shadow-md"
                >
                  {claiming
                    ? <span className="flex items-center justify-center gap-2"><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Claiming...</span>
                    : 'Claim Free Card'}
                </button>
              </>
            ) : (
              <>
                <h3 className="font-black text-[16px] text-foreground mb-1">Free claims are paused</h3>
                <p className="text-[12px] text-muted-foreground mb-4">Free card claiming is temporarily disabled. You can still buy a Top-Up Pack.</p>
                <button onClick={() => onNavigate('pricing')} className="w-full py-3 rounded-xl font-bold text-[14px] text-primary-foreground bg-primary hover:opacity-90 transition-opacity shadow-md">View Plans</button>
              </>
            )}
          </div>
        )}

        <div className={layout === 'grid' ? 'grid grid-cols-2 gap-3' : 'space-y-3'}>
          {visibleClaimed.map((card) => (
            <CardListItem key={card.id} card={card} compact={layout === 'grid'} onOpen={(c) => { setSelectedCard(c); setFlipped(false) }} />
          ))}
        </div>

        {visibleClaimed.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-12 h-12 rounded-2xl bg-surface border border-border flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803a7.5 7.5 0 0010.607 0z" /></svg>
            </div>
            {isGuest ? (
              <>
                <p className="text-muted-foreground text-[14px]">Sign up to claim your free virtual card</p>
                <button onClick={() => onNavigate('auth')} className="mt-4 w-full max-w-xs py-3 rounded-xl font-bold text-[14px] text-primary-foreground bg-primary hover:opacity-90 active:scale-[0.98] transition-all shadow-md">Create free account</button>
                <button onClick={() => onNavigate('pricing')} className="mt-2 w-full max-w-xs py-3 rounded-xl bg-white border border-border text-foreground font-semibold text-[14px] hover:border-brand/40 transition-colors">View Plans</button>
              </>
            ) : (
              <p className="text-muted-foreground text-[14px]">No cards found</p>
            )}
          </div>
        )}
      </main>

      {selectedCard && (
        <CardDetailModal card={selectedCard} flipped={flipped} onFlip={() => setFlipped(!flipped)} onClose={() => setSelectedCard(null)}
          isPreview={selectedCard.id === PREVIEW_CARD.id}
          onCopy={(_, l) => showToast(`${l} copied!`)}
          onRename={renameCard}
          onToggleFav={toggleFavorite} />
      )}
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      <BottomNav view="cards" isLoggedIn={!!currentUser} onNavigate={onNavigate} />
    </div>
  )
}

// ─── FAQ / HELP PAGE ───────────────────────────────────────────────────────────
function FAQPage({ onNavigate }) {
  const [open, setOpen] = useState(null)
  const items = [
    { q: 'How do I get my first card?', a: 'Sign up for free and claim your free virtual card on the Cards page. It comes with a random USD balance ($1–$15). One free card per account.' },
    { q: 'How do Top-Up Packs work?', a: 'Packs (Spark ₹299 up to Infinity ₹1599) add a higher-balance card to your account. Tap any pack on the Plans page to pay via Telegram — after payment, your card is assigned to your account automatically.' },
    { q: 'What is a virtual card used for?', a: 'These are virtual card details (number, expiry, CVV) designed for free trial sign-ups and verification. They work like a prepaid-style card for online use.' },
    { q: 'What happens when a card expires?', a: 'Expired cards can no longer be used for new sign-ups. Copy important details before the expiry date — you will see an amber alert on the Cards page for cards expiring within 60 days.' },
    { q: 'Can I rename or favourite a card?', a: 'Yes — open any card and use the Nickname field or the star (Favorite) button. Favorites can be filtered with the ★ chip on the Cards page.' },
    { q: 'My card did not arrive after payment. What now?', a: 'Contact us via Telegram (@' + TELEGRAM_BOT_USERNAME + ') with your order details. Assignments are instant, so if it has been more than a few minutes something is wrong — our team will fix it.' },
    { q: 'Is my card data secure?', a: 'All card data is stored in a protected database and only your own cards are shown to you. Admin access requires a separate 6-digit code.' },
  ]
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-md">
        <div className="max-w-md mx-auto px-4 flex items-center h-14">
          <button onClick={() => onNavigate('account')} className="mr-3 text-muted-foreground hover:text-foreground" aria-label="Back">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" /></svg>
          </button>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-primary flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" /></svg>
            </div>
            <span className="font-bold text-foreground">Help & FAQ</span>
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-md mx-auto w-full px-4 py-6 pb-28 space-y-2.5">
        {items.map((item, i) => {
          const isOpen = open === i
          return (
            <div key={i} className="bg-white border border-border rounded-2xl overflow-hidden shadow-soft">
              <button
                onClick={() => setOpen(isOpen ? null : i)}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-surface transition-colors"
                aria-expanded={isOpen}
              >
                <p className="flex-1 text-[13px] font-semibold text-foreground">{item.q}</p>
                <svg className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
              </button>
              {isOpen && <p className="px-4 pb-4 text-[13px] text-muted-foreground leading-relaxed border-t border-border pt-3">{item.a}</p>}
            </div>
          )
        })}
        <p className="text-center text-[11px] text-muted-foreground pt-4">Still stuck? Message us on Telegram: @{TELEGRAM_BOT_USERNAME}</p>
      </main>
      <BottomNav view="account" isLoggedIn={true} onNavigate={onNavigate} />
    </div>
  )
}

// ─── TOP-UP PACKS PRICING PAGE ────────────────────────────────────────��───────
function PricingPage({ currentUser, onNavigate, settings }) {
  const [toast, setToast] = useState(null)
  const [telegramCard, setTelegramCard] = useState(null)
  const [telegramLoading, setTelegramLoading] = useState(false)
  const [stock, setStock] = useState({})

  useEffect(() => {
    supabase.rpc('tier_stock').then(({ data }) => {
      const m = {}
      ;(data || []).forEach((i) => { m[i.tier] = i.available || 0 })
      setStock(m)
    }).catch(() => { })
  }, [])

  // Check URL for telegram_id param (returning from Telegram payment)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const tgId = params.get('telegram_id')
    const plan = params.get('plan')
    if (tgId) {
      setTelegramLoading(true)
      fetch(`${BOT_API_BASE}/api/get-card/${tgId}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.ok) {
            setTelegramCard(data)
            showToast(`🎉 ${data.plan} plan activated via Telegram Stars!`)
          }
        })
        .catch(() => { })
        .finally(() => setTelegramLoading(false))
      // Clean URL
      window.history.replaceState({}, document.title, window.location.pathname)
    }
  }, [])

  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 2500)
  }, [])


  return (
    <div className="min-h-screen bg-background flex flex-col">
      {settings?.announcement && (
        <div className="bg-brand text-primary-foreground text-center text-[12px] font-semibold px-4 py-2">{settings.announcement}</div>
      )}
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-md">
        <div className="max-w-md mx-auto px-4 flex items-center h-14">
          <button onClick={() => onNavigate('landing')} className="mr-3 text-muted-foreground hover:text-foreground" aria-label="Back">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" /></svg>
          </button>
          <h1 className="font-bold text-foreground">Top-Up Balance Packs</h1>
        </div>
      </header>

      <main className="flex-1 max-w-md mx-auto w-full px-4 py-5 pb-28">
        <p className="text-muted-foreground text-[13px] mb-5 leading-relaxed text-center">
          Choose a pack to assign a virtual card loaded with your chosen USD Balance ($)!
        </p>

        <div className="space-y-3.5">
          {V2_PACKS.map((p) => (
            <div key={p.id} className="bg-white border border-border rounded-2xl p-4 flex items-center justify-between shadow-soft hover:border-brand/40 transition-all">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-black text-[16px] text-foreground">{p.name}</p>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand-dim text-brand uppercase">{p.badge}</span>
                </div>
                <p className="text-[20px] font-black text-brand mt-1">${p.balance_usd} USD <span className="text-[11px] text-muted-foreground font-medium">Card Balance</span></p>
              </div>

              <div className="text-right space-y-1.5">
                <p className="text-[18px] font-black text-foreground">₹{p.price_inr}</p>                {stock[p.id] === 0 ? (
                  <span className="block w-full text-center px-3.5 py-1.5 rounded-xl bg-red-50 text-red-600 font-bold text-[12px] border border-red-200">Sold out</span>
                ) : (
                  <button
                    onClick={() => window.open(`${TELEGRAM_BOT_URL}?start=buy_${p.id}`, '_blank')}
                    className="px-3.5 py-1.5 rounded-xl bg-primary text-primary-foreground font-bold text-[12px] hover:opacity-90 transition-opacity shadow-sm w-full flex items-center justify-center gap-1"
                  >
                    ⭐ Buy via Telegram
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <section className="mt-8">
          <p className="text-[11px] text-muted-foreground uppercase tracking-widest font-semibold mb-3 text-center">Compare All Packs</p>
          <div className="bg-white border border-border rounded-2xl overflow-hidden shadow-soft">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border bg-surface">
                  <th className="px-4 py-3 text-[11px] uppercase tracking-widest text-muted-foreground font-bold">Pack</th>
                  <th className="px-4 py-3 text-[11px] uppercase tracking-widest text-muted-foreground font-bold">Price</th>
                  <th className="px-4 py-3 text-[11px] uppercase tracking-widest text-muted-foreground font-bold">Balance</th>
                  <th className="px-4 py-3 text-[11px] uppercase tracking-widest text-muted-foreground font-bold">Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {V2_PACKS.map((p) => {
                  const perDollar = (p.price_inr / p.balance_usd).toFixed(0)
                  return (
                    <tr key={p.id} className="hover:bg-surface/50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-bold text-[13px] text-foreground">{p.name}</p>
                        <p className="text-[10px] text-muted-foreground">{p.badge}</p>
                      </td>
                      <td className="px-4 py-3 text-[13px] font-bold text-foreground">₹{p.price_inr}</td>
                      <td className="px-4 py-3 text-[13px] font-bold text-emerald-600">${p.balance_usd}</td>
                      <td className="px-4 py-3">
                        <span className="text-[11px] font-bold bg-brand-dim text-brand px-2 py-0.5 rounded-full">₹{perDollar}/$</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="text-center text-[10px] text-muted-foreground mt-2">Lower ₹/$ = better value. All packs include instant Telegram delivery.</p>
        </section>
      </main>

      {/* Telegram Stars success card modal */}
      {telegramCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-panel space-y-4">
            <div className="text-center">
              <div className="w-14 h-14 mx-auto rounded-full bg-emerald-100 flex items-center justify-center mb-3">
                <svg className="w-7 h-7 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
              </div>
              <h3 className="font-black text-[18px] text-foreground">Payment Successful</h3>
              <p className="text-[12px] text-muted-foreground mt-1">{telegramCard.plan} plan activated via Telegram Stars</p>
            </div>

            <div className="bg-gradient-to-br from-[#2c3a52] via-[#212c3f] to-[#141b28] rounded-2xl p-5 text-white relative overflow-hidden">
              <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg,rgba(255,255,255,0.10) 0%,transparent 55%)' }} />
              <p className="text-[10px] text-white/55 uppercase tracking-widest font-bold relative z-10">VCardz — Temp Card</p>
              <p className="font-mono text-white text-[18px] tracking-[0.15em] font-bold mt-4 relative z-10">{telegramCard.temp_card || '•••• •••• •••• ••••'}</p>
              <div className="flex items-center justify-between mt-5 relative z-10">
                <div>
                  <p className="text-[8px] text-white/35 uppercase tracking-widest">Plan</p>
                  <p className="text-[13px] text-white font-bold">{telegramCard.plan}</p>
                </div>
                <div className="text-right">
                  <p className="text-[8px] text-white/35 uppercase tracking-widest">Status</p>
                  <p className="text-[13px] text-emerald-300 font-bold">{telegramCard.status}</p>
                </div>
                <div className="text-right">
                  <p className="text-[8px] text-white/35 uppercase tracking-widest">Stars</p>
                  <p className="text-[13px] text-white font-bold">{telegramCard.stars_paid} ⭐</p>
                </div>
              </div>
            </div>

            <button
              onClick={() => setTelegramCard(null)}
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold text-[14px] hover:opacity-90 transition-opacity"
            >
              View My Cards
            </button>
          </div>
        </div>
      )}

      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      <BottomNav view="pricing" isLoggedIn={!!currentUser} onNavigate={onNavigate} />
    </div>
  )
}

const APP_THEMES = [
  { id: 'blue', label: 'Mist', description: 'Soft blue-grey', swatches: ['#EEF3F8', '#5F7894', '#DCE5ED'] },
  { id: 'lavender', label: 'Lavender', description: 'Quiet lilac', swatches: ['#F3F1F8', '#817A9C', '#E3DFEE'] },
  { id: 'sage', label: 'Sage', description: 'Calm green', swatches: ['#F0F5F1', '#708D7B', '#D9E6DC'] },
  { id: 'sand', label: 'Sand', description: 'Warm neutral', swatches: ['#F7F3ED', '#9A8268', '#E9DED0'] },
  { id: 'graphite', label: 'Graphite', description: 'Cool charcoal', swatches: ['#EEF0F2', '#596572', '#D8DEE4'] },
]

// ─── ACCOUNT PAGE ─────────────────────────────────────────────────────────────
function AccountPage({ currentUser, onLogout, onNavigate, theme, onThemeChange, onUserUpdate }) {
  const [showAdminInput, setShowAdminInput] = useState(false)
  const [adminCodeInput, setAdminCodeInput] = useState('')
  const [nameInput, setNameInput] = useState(currentUser?.name || '')
  const [savingName, setSavingName] = useState(false)
  const [nameMsg, setNameMsg] = useState('')
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' })
  const [pwBusy, setPwBusy] = useState(false)
  const [pwMsg, setPwMsg] = useState(null)
  const [pwErr, setPwErr] = useState('')
  const name = currentUser?.name || 'Guest'
  const email = currentUser?.email || ''
  const planName = currentUser?.plan || 'free'
  const initials = name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) || 'G'
  const currentPack = V2_PACKS.find((p) => p.id === planName)
  const planColors = { free: 'bg-surface-2 text-muted-foreground border-border', spark: 'bg-brand-dim text-brand border-brand/20', orbit: 'bg-brand-dim text-brand border-brand/20', nova: 'bg-brand-dim text-brand border-brand/20', galaxy: 'bg-amber-100 text-amber-700 border-amber-200', cosmos: 'bg-amber-100 text-amber-700 border-amber-200', infinity: 'bg-amber-100 text-amber-700 border-amber-200' }

  const saveDisplayName = async () => {
    const trimmed = nameInput.trim()
    if (trimmed.length < 2 || trimmed.length > 50) { setNameMsg('Name must be 2-50 characters'); return }
    if (!/^[a-zA-Z\s'-]+$/.test(trimmed)) { setNameMsg('Name can only contain letters, spaces, hyphens, and apostrophes'); return }
    setSavingName(true)
    setNameMsg('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not signed in')
      const { error } = await supabase.from('profiles').update({ display_name: trimmed }).eq('id', user.id)
      if (error) throw error
      onUserUpdate?.({ name: trimmed })
      setNameMsg('Name updated ✓')
    } catch (err) {
      setNameMsg('Could not update: ' + err.message)
    } finally {
      setSavingName(false)
    }
  }

  const changePassword = async () => {
    setPwErr('')
    setPwMsg(null)
    if (pw.next.length < 8) { setPwErr('New password must be at least 8 characters'); return }
    if (!/[A-Z]/.test(pw.next) || !/[a-z]/.test(pw.next) || !/[0-9]/.test(pw.next)) { setPwErr('New password must contain uppercase, lowercase, and a number'); return }
    if (pw.next !== pw.confirm) { setPwErr('New passwords do not match'); return }
    setPwBusy(true)
    try {
      const { error: verifyErr } = await supabase.auth.signInWithPassword({ email, password: pw.current })
      if (verifyErr) throw new Error('Current password is incorrect')
      const { error } = await supabase.auth.updatePassword(pw.next)
      if (error) throw error
      setPwMsg({ ok: true, text: 'Password changed successfully ✓' })
      setPw({ current: '', next: '', confirm: '' })
    } catch (err) {
      setPwMsg({ ok: false, text: err.message || 'Could not change password' })
    } finally {
      setPwBusy(false)
    }
  }

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
      <header className="sticky top-0 z-40 px-3 pt-3">
        <div className="max-w-md mx-auto flex items-center gap-2">
          <div className="ios-icon-well w-10 h-10 rounded-full bg-primary flex items-center justify-center shadow-md">
            <svg className="w-4 h-4 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" /></svg>
          </div>
          <div className="ios-title-box rounded-2xl px-4 py-2.5">
            <span className="font-bold text-foreground">Settings</span>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-md mx-auto w-full px-4 py-5 pb-28 space-y-4">
        <div className="bg-white border border-border rounded-2xl p-5 flex items-center gap-4 shadow-soft">
          <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center shrink-0">
            <span className="text-primary-foreground font-black text-[18px]">{initials}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-[16px] text-foreground truncate">{name}</p>
            <p className="text-muted-foreground text-[13px] truncate">{email}</p>
            <span className={`inline-flex mt-1.5 text-[11px] font-bold uppercase px-2.5 py-0.5 rounded-full border ${planColors[planName]}`}>{planName} plan</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => onNavigate('cards')} className="bg-primary text-primary-foreground rounded-2xl p-4 flex flex-col items-start gap-2 hover:opacity-90 transition-opacity shadow-sm">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" /></svg>
            <div>
              <p className="font-bold text-[13px]">Browse Cards</p>
              <p className="text-[11px] text-primary-foreground/70">{currentPack ? `$${currentPack.balance_usd} USD balance` : 'Free card'}</p>
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

        <section className="bg-white border border-border rounded-2xl p-4 shadow-soft">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="font-semibold text-[13px] text-foreground">Appearance</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Choose a soft iOS-inspired color theme</p>
            </div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-brand">{APP_THEMES.find((item) => item.id === theme)?.label}</span>
          </div>
          <div className="grid grid-cols-5 gap-2">
            {APP_THEMES.map((item) => (
              <button key={item.id} type="button" onClick={() => onThemeChange(item.id)} aria-label={`Use ${item.label} theme`} aria-pressed={theme === item.id}
                className={`theme-choice rounded-2xl p-1.5 border text-left transition-all ${theme === item.id ? 'border-brand ring-2 ring-brand/20 scale-[1.03]' : 'border-border hover:border-brand/40'}`}>
                <span className="flex h-9 overflow-hidden rounded-xl border border-black/5">
                  {item.swatches.map((color) => <span key={color} className="flex-1" style={{ backgroundColor: color }} />)}
                </span>
                <span className="mt-1 block truncate text-center text-[9px] font-bold text-foreground">{item.label}</span>
              </button>
            ))}
          </div>
        </section>

        <div className="bg-white border border-border rounded-2xl p-4 shadow-soft">
          <div className="flex items-center justify-between mb-3">
            <p className="font-semibold text-[13px] text-foreground">Display Name</p>
            <span className="text-[10px] font-bold uppercase tracking-widest text-brand">v{APP_VERSION}</span>
          </div>
          <div className="flex gap-2">
            <input
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              maxLength={50}
              placeholder="Your display name"
              className="flex-1 bg-surface border border-border rounded-xl px-3 py-2.5 text-[13px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-brand/60 transition-colors"
            />
            <button onClick={saveDisplayName} disabled={savingName}
              className="shrink-0 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-[12px] hover:opacity-90 disabled:opacity-50 transition-opacity">
              {savingName ? '…' : 'Save'}
            </button>
          </div>
          {nameMsg && <p className={`mt-2 text-[11px] ${nameMsg.includes('✓') ? 'text-emerald-600' : 'text-red-500'}`}>{nameMsg}</p>}
        </div>

        <div className="bg-white border border-border rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border"><p className="font-semibold text-[13px] text-foreground">Account Details</p></div>
          <div className="divide-y divide-border">
            {[
              { label: 'Full Name', value: name },
              { label: 'Email', value: email },
              { label: 'Current Pack', value: currentPack ? `${currentPack.name} (₹${currentPack.price_inr})` : 'Free' },
              { label: 'Card Balance', value: currentPack ? `$${currentPack.balance_usd} USD` : '$0 USD' },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between px-4 py-3.5">
                <p className="text-[13px] text-muted-foreground">{item.label}</p>
                <p className="text-[13px] font-semibold text-foreground">{item.value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border border-border rounded-2xl p-4 shadow-soft">
          <p className="font-semibold text-[13px] text-foreground mb-3">Change Password</p>
          <div className="space-y-2.5">
            <input type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} placeholder="Current password"
              className="w-full bg-surface border border-border rounded-xl px-3 py-2.5 text-[13px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-brand/60 transition-colors" />
            <input type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} placeholder="New password (8+ chars, upper+lower+number)"
              className="w-full bg-surface border border-border rounded-xl px-3 py-2.5 text-[13px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-brand/60 transition-colors" />
            <input type="password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} placeholder="Confirm new password"
              className="w-full bg-surface border border-border rounded-xl px-3 py-2.5 text-[13px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-brand/60 transition-colors" />
            <button onClick={changePassword} disabled={pwBusy}
              className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-[13px] hover:opacity-90 disabled:opacity-50 transition-opacity">
              {pwBusy ? 'Updating…' : 'Update Password'}
            </button>
            {pwErr && <p className="text-[11px] text-red-500">{pwErr}</p>}
            {pwMsg && <p className={`text-[11px] ${pwMsg.ok ? 'text-emerald-600' : 'text-red-500'}`}>{pwMsg.text}</p>}
          </div>
        </div>

        <button onClick={() => onNavigate('faq')} className="w-full bg-white border border-border rounded-2xl px-4 py-3.5 flex items-center gap-3 hover:border-brand/40 transition-colors shadow-soft">
          <svg className="w-4 h-4 text-brand shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" /></svg>
          <p className="text-[13px] font-semibold text-foreground text-left">Help & FAQ</p>
          <svg className="w-4 h-4 text-muted-foreground ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
        </button>

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
                  className="px-4 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-[13px] hover:opacity-90 disabled:opacity-40 transition-all">
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

// ─── ADMIN PANEL ──────────────────────────────────────────────────��───────────
function AdminPanelPage({ onNavigate, settings, onSettingsChange }) {
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
  const [selectedCards, setSelectedCards] = useState([])
  const [selectedUsers, setSelectedUsers] = useState([])
  const [expiryFilter, setExpiryFilter] = useState('all')
  const [orderRange, setOrderRange] = useState('all')
  const [sessions, setSessions] = useState([])
  const [settingsDraft, setSettingsDraft] = useState({})

  const EMPTY_FORM = { card_number: '', name: '', expiry: '', cvv: '', provider: 'Visa', label: '', is_active: true, tier: 'free', balance_usd: 0 }
  const PLAN_TIERS = ['Free', 'Pro', 'Max']
  const ALL_TIERS = [
    { id: 'free', label: 'Free (₹0)' },
    { id: 'spark', label: 'Spark ($15)' },
    { id: 'orbit', label: 'Orbit ($26)' },
    { id: 'nova', label: 'Nova ($32)' },
    { id: 'galaxy', label: 'Galaxy ($49)' },
    { id: 'cosmos', label: 'Cosmos ($67)' },
    { id: 'infinity', label: 'Infinity ($82)' },
  ]
  const [showCardModal, setShowCardModal] = useState(false)
  const [editingCard, setEditingCard] = useState(null)
  const [formData, setFormData] = useState(EMPTY_FORM)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const [showBulkModal, setShowBulkModal] = useState(false)
  const [bulkText, setBulkText] = useState('')
  const [bulkPreview, setBulkPreview] = useState([])
  const [bulkTier, setBulkTier] = useState('free')
  const [assigningFreeCard, setAssigningFreeCard] = useState(null)

  const [orders, setOrders] = useState([])
  const [packs, setPacks] = useState([])
  const [inventory, setInventory] = useState([])
  const [orderFilter, setOrderFilter] = useState('all')
  const [orderSearch, setOrderSearch] = useState('')
  const [sessionExpired, setSessionExpired] = useState(false)
  const [userCards, setUserCards] = useState([])
  const [userCardsUser, setUserCardsUser] = useState(null)
  const [packEditing, setPackEditing] = useState(null)
  const [editingPackForm, setEditingPackForm] = useState({})
  const [ordersLoading, setOrdersLoading] = useState(false)

  const showToast = useCallback((msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 2500) }, [])

  const RANDOM_NAMES = ['RAHUL SHARMA', 'PRIYA SINGH', 'AMIT VERMA', 'SNEHA GUPTA', 'VIKRAM NAIR', 'NEHA REDDY', 'ROHAN MISHRA', 'KAVYA PATEL', 'ANKIT JHA', 'POOJA IYER', 'SURESH KUMAR', 'MEERA JHA']
  const RANDOM_PROVIDERS = ['Visa', 'Mastercard', 'Amex', 'Discover', 'RuPay']

  const parseBulkText = (text) => {
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 1000)
    const parsed = []
    for (const line of lines) {
      const clean = line.replace(/[^0-9|/ ]/g, ' ').replace(/\s+/g, ' ').trim()
      const parts = clean.split(/[\s|]+/).filter(Boolean)
      if (parts.length < 2) continue
      const cardNum = parts[0]
      if (cardNum.length < 12) continue
      const tokens = parts.slice(1).flatMap((t) => t.split('/')).map((t) => t.replace(/\D/g, '')).filter(Boolean)
      let month = '', year = '', cvv = ''
      if (tokens.length === 1) {
        if (tokens[0].length >= 4) { month = tokens[0].slice(0, 2); year = tokens[0].slice(2, 4) }
      } else if (tokens.length === 2) {
        if (tokens[0].length === 4) { month = tokens[0].slice(0, 2); year = tokens[0].slice(2, 4); cvv = tokens[1] }
        else { month = tokens[0]; year = tokens[1] }
      } else {
        month = tokens[0]; year = tokens[1]; cvv = tokens.slice(2).join('')
      }
      if (!/^\d{2}$/.test(month) || !/^\d{2}$/.test(year)) continue
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
    tier: c.tier || 'free',
    balance_usd: c.balance_usd ?? TIER_BALANCES[c.tier || 'free'] ?? 0,
  })

  const fetchAll = async () => {
    if (!token) { setDataLoading(false); return }
    setDataLoading(true)
    const safe = (fn, params) => supabase.rpc(fn, params)
      .then((r) => ({ ok: true, data: r.data, error: r.error, fn }))
      .catch((e) => ({ ok: false, data: null, error: e, fn }))
    try {
      const [cardsRes, plansRes, codesRes, statsRes, usersRes, packsRes] = await Promise.all([
        safe('admin_cards', { p_token: token }),
        safe('admin_limits', { p_token: token }),
        safe('admin_codes_list', { p_token: token }),
        safe('admin_stats', { p_token: token }),
        safe('admin_users', { p_token: token }),
        safe('admin_packs', { p_token: token }),
      ])
      const all = [cardsRes, plansRes, codesRes, statsRes, usersRes, packsRes]
      if (all.some((r) => r.error?.message === 'SESSION_INVALID')) { setSessionExpired(true); return }
      if (cardsRes.ok && cardsRes.data) setCards(cardsRes.data.map(normalizeCard))
      if (plansRes.ok && plansRes.data) {
        const limits = {}
        plansRes.data.forEach((p) => { limits[p.plan_type] = p.card_limit })
        setPlanLimits((prev) => ({ ...prev, ...limits }))
      }
      if (codesRes.ok && codesRes.data) setAdminCodes(codesRes.data)
      if (statsRes.ok && statsRes.data) setTotalUsers(statsRes.data.total_users ?? 0)
      if (usersRes.ok && usersRes.data) setUsers(usersRes.data.map((u) => ({ ...u, name: u.display_name, plan: u.plan_type })))
      if (packsRes.ok && packsRes.data) setPacks(packsRes.data)
      const failures = all.filter((r) => !r.ok)
      if (failures.length > 0) {
        console.warn('Admin data partial failures:', failures.map((f) => f.fn + ': ' + (f.error?.message || f.error)))
      }
    } catch (err) {
      if (String(err?.message).includes('SESSION_INVALID')) { setSessionExpired(true); return }
      showToast('Failed to load admin data', 'error')
    } finally {
      setDataLoading(false)
    }
  }

  const fetchOrders = async () => {
    if (!token) return
    setOrdersLoading(true)
    try {
      const { data, error } = await supabase.rpc('admin_orders_list', { p_token: token })
      if (error) {
        if (String(error.message).includes('SESSION_INVALID')) setSessionExpired(true)
        return
      }
      setOrders(data || [])
    } catch { } finally { setOrdersLoading(false) }
  }

  const fetchInventory = async () => {
    if (!token) return
    try {
      const { data } = await supabase.rpc('admin_inventory', { p_token: token })
      if (data) setInventory(data)
    } catch { }
  }

  useEffect(() => { fetchAll(); fetchOrders(); fetchInventory(); fetchSessions() }, [])

  const fetchSessions = async () => {
    if (!token) return
    try {
      const { data } = await supabase.rpc('admin_sessions_list', { p_token: token })
      if (data) setSessions(data)
    } catch { }
  }

  const revokeSession = async (sess) => {
    try {
      const { error } = await supabase.rpc('admin_session_revoke', { p_token: token, p_session_id: sess.id })
      if (error) throw error
      showToast('Session revoked', 'info')
      fetchSessions()
    } catch (err) { showToast('Failed: ' + err.message, 'error') }
  }

  const saveSetting = async (key, value) => {
    try {
      const { error } = await supabase.rpc('admin_set_setting', { p_token: token, p_key: key, p_value: String(value) })
      if (error) throw error
      onSettingsChange?.((prev) => ({ ...prev, [key]: String(value) }))
      showToast('Setting saved')
    } catch (err) { showToast('Failed to save: ' + err.message, 'error') }
  }

  const bulkToggleCards = async (active) => {
    if (!selectedCards.length) return
    let ok = 0
    for (const id of selectedCards) {
      const { error } = await supabase.rpc('admin_card_set_active', { p_token: token, p_id: id, p_active: active })
      if (!error) ok++
    }
    showToast(`${ok} cards ${active ? 'activated' : 'deactivated'}`)
    setSelectedCards([])
    fetchAll()
  }

  const bulkDeleteCards = async () => {
    if (!selectedCards.length) return
    if (!window.confirm(`Delete ${selectedCards.length} selected card(s)?`)) return
    let ok = 0
    for (const id of selectedCards) {
      const { error } = await supabase.rpc('admin_card_delete', { p_token: token, p_id: id })
      if (!error) ok++
    }
    showToast(`${ok} cards deleted`, 'info')
    setSelectedCards([])
    fetchAll()
  }

  const bulkToggleUsers = async (activate) => {
    if (!selectedUsers.length) return
    // Only touch users whose current state differs from the target — the RPC is a
    // flip (banned_until based), so acting on an already-matching selection would
    // do the opposite of the button label.
    const targets = selectedUsers.filter((id) => users.find((u) => u.id === id)?.is_active !== activate)
    if (!targets.length) { setSelectedUsers([]); showToast('Nothing to do — selection already matches', 'info'); return }
    if (!activate && !window.confirm(`Suspend ${targets.length} selected user(s)? Their access will be blocked until reactivated.`)) return
    let ok = 0
    for (const id of targets) {
      const { data, error } = await supabase.rpc('admin_toggle_user_status', { p_token: token, p_user_id: id })
      if (!error && !!data?.active === activate) ok++
    }
    showToast(`${ok} users ${activate ? 'activated' : 'suspended'}`)
    setSelectedUsers([])
    fetchAll()
  }

  const downloadBackup = async () => {
    try {
      const [c, u, o, p, inv, s] = await Promise.all([
        supabase.rpc('admin_cards', { p_token: token }),
        supabase.rpc('admin_users', { p_token: token }),
        supabase.rpc('admin_orders_list', { p_token: token }),
        supabase.rpc('admin_packs', { p_token: token }),
        supabase.rpc('admin_inventory', { p_token: token }),
        supabase.rpc('get_app_settings'),
      ])
      const backup = {
        exported_at: new Date().toISOString(),
        cards: c.data || [], users: u.data || [], orders: o.data || [], packs: p.data || [], inventory: inv.data || [], settings: s.data || {},
      }
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `vcardz-backup-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove() }, 100)
      showToast('Backup downloaded')
    } catch (err) { showToast('Backup failed: ' + err.message, 'error') }
  }

  const handleSaveCard = async () => {
    if (!formData.card_number || !formData.name || !formData.expiry || !formData.cvv) { showToast('Fill all required fields', 'error'); return }
    const cardDigits = String(formData.card_number).replace(/\D/g, '')
    if (cardDigits.length < 12 || cardDigits.length > 19) { showToast('Card number must be 12-19 digits', 'error'); return }
    if (!/^\d{2}\/\d{2}$/.test(formData.expiry)) { showToast('Expiry must be MM/YY', 'error'); return }
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
      p_tier: formData.tier || 'free',
      p_balance_usd: Number(formData.balance_usd) || TIER_BALANCES[formData.tier || 'free'] || 0,
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
        p_tier: bulkTier,
        p_balance_usd: TIER_BALANCES[bulkTier] ?? 0,
      })
      if (!error) ok++
      else { showToast('Bulk add failed', 'error'); break }
    }
    showToast(`${ok} cards added as '${bulkTier}' tier`)
    setShowBulkModal(false); setBulkText(''); setBulkPreview([])
    fetchAll()
  }

  const handleAssignFreeCard = async (userId, userEmail) => {
    setAssigningFreeCard(userId)
    try {
      const { error } = await supabase.rpc('admin_assign_free_card', { p_token: token, p_user_id: userId })
      if (error) throw error
      showToast(`✅ Free card assigned to ${userEmail || userId}`)
      fetchAll()
    } catch (err) {
      const msg = String(err.message || err)
      if (msg.includes('USER_ALREADY_HAS_FREE_CARD')) {
        showToast('User already has a free card', 'error')
      } else if (msg.includes('NO_FREE_CARDS')) {
        showToast('No unassigned free cards left in the pool', 'error')
      } else {
        showToast('Could not assign free card: ' + msg, 'error')
      }
    } finally {
      setAssigningFreeCard(null)
    }
  }

  const setOrderStatus = async (orderId, status) => {
    try {
      const { error } = await supabase.rpc('admin_order_set_status', { p_token: token, p_order_id: orderId, p_status: status })
      if (error) throw error
      showToast(`Order marked ${status}`)
      fetchOrders()
      fetchInventory()
    } catch (err) { showToast('Failed: ' + err.message, 'error') }
  }

  const openPackEdit = (pack) => {
    setPackEditing(pack.id)
    setEditingPackForm({ price_inr: pack.price_inr, balance_usd: Number(pack.balance_usd), sort_order: pack.sort_order, is_active: !!pack.is_active })
  }

  const savePack = async (packId) => {
    try {
      const { error } = await supabase.rpc('admin_pack_set', {
        p_token: token,
        p_id: packId,
        p_price_inr: Number(editingPackForm.price_inr) || 0,
        p_balance_usd: Number(editingPackForm.balance_usd) || 0,
        p_is_active: !!editingPackForm.is_active,
        p_sort_order: Number(editingPackForm.sort_order) || 0,
      })
      if (error) throw error
      showToast('Pack updated')
      setPackEditing(null)
      fetchAll()
    } catch (err) { showToast('Failed: ' + err.message, 'error') }
  }

  const togglePackActive = async (pack) => {
    try {
      const { error } = await supabase.rpc('admin_pack_set', {
        p_token: token,
        p_id: pack.id,
        p_price_inr: pack.price_inr,
        p_balance_usd: Number(pack.balance_usd),
        p_is_active: !pack.is_active,
        p_sort_order: pack.sort_order,
      })
      if (error) throw error
      showToast(pack.is_active ? 'Pack disabled' : 'Pack enabled')
      fetchAll()
    } catch (err) { showToast('Failed: ' + err.message, 'error') }
  }

  const changeUserPlan = async (userId, newPlan) => {
    try {
      const { error } = await supabase.rpc('admin_set_user_plan', { p_token: token, p_user_id: userId, p_plan: newPlan })
      if (error) throw error
      showToast(`Plan updated to ${newPlan}`)
      fetchAll()
    } catch (err) { showToast('Plan update failed: ' + err.message, 'error') }
  }

  const toggleUserStatus = async (user) => {
    try {
      const { data, error } = await supabase.rpc('admin_toggle_user_status', { p_token: token, p_user_id: user.id })
      if (error) throw error
      showToast(data?.active ? 'User activated' : 'User suspended')
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, is_active: !!data?.active } : u)))
    } catch (err) { showToast('Failed: ' + err.message, 'error') }
  }

  const viewUserCards = async (user) => {
    setUserCardsUser(user)
    setUserCards([])
    try {
      const { data, error } = await supabase.rpc('admin_user_cards', { p_token: token, p_user_id: user.id })
      if (error) throw error
      setUserCards(data || [])
    } catch (err) { showToast('Failed to load cards: ' + err.message, 'error') }
  }

  const removeUserCard = async (userCardId) => {
    try {
      const { error } = await supabase.rpc('admin_remove_user_card', { p_token: token, p_user_card_id: userCardId })
      if (error) throw error
      showToast('Card removed from user')
      if (userCardsUser) viewUserCards(userCardsUser)
      fetchInventory()
    } catch (err) { showToast('Failed: ' + err.message, 'error') }
  }

  const assignTierCard = async (tier) => {
    if (!userCardsUser || !tier) return
    try {
      const { error } = await supabase.rpc('admin_assign_card', { p_token: token, p_user_id: userCardsUser.id, p_tier: tier })
      if (error) throw error
      showToast(`Assigned ${tier} card`)
      viewUserCards(userCardsUser)
      fetchInventory()
      fetchAll()
    } catch (err) { showToast('Failed: ' + (err.message === 'NO_CARD_AVAILABLE' ? 'no card of that tier left' : err.message), 'error') }
  }

  const downloadCSV = (filename, rows) => {
    if (!rows.length) { showToast('Nothing to export', 'info'); return }
    const headers = Object.keys(rows[0])
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const csv = [headers.join(','), ...rows.map((r) => headers.map((h) => esc(r[h])).join(','))].join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = filename
    document.body.appendChild(a)
    a.click()
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove() }, 100)
  }

  const exportCards = () => downloadCSV('vcardz-cards.csv', cards.map((c) => ({ id: c.id, card_number: c.card_number, cardholder_name: c.name, provider: c.provider, tier: c.tier, balance_usd: c.balance_usd, expiry: c.expiry, cvv: c.cvv, status: c.is_active ? 'active' : 'inactive', created_at: c.created_at })))
  const exportUsers = () => downloadCSV('vcardz-users.csv', users.map((u) => ({ id: u.id, email: u.email, name: u.name, plan: u.plan, status: u.is_active === false ? 'suspended' : 'active', created_at: u.created_at })))
  const exportOrders = () => downloadCSV('vcardz-orders.csv', orders.map((o) => ({ id: o.id, email: o.user_email, name: o.display_name, pack: o.pack_name, amount_inr: o.amount_inr, status: o.status, gateway: o.gateway, gateway_ref: o.gateway_ref, created_at: o.created_at, paid_at: o.paid_at })))

  const filteredCards = cards.filter((c) => {
    if (cardSearch && !(c.name?.toLowerCase().includes(cardSearch.toLowerCase()) || c.card_number?.includes(cardSearch) || c.provider?.toLowerCase().includes(cardSearch.toLowerCase()))) return false
    if (expiryFilter === 'expired' && !expiredCard(c)) return false
    if (expiryFilter === 'expiring' && !expiringCard(c)) return false
    if (expiryFilter === 'duplicates' && !duplicateNumbers.has(String(c.card_number || '').replace(/\D/g, ''))) return false
    return true
  })
  const filteredUsers = users.filter((u) => !userSearch || (u.display_name || u.email || '').toLowerCase().includes(userSearch.toLowerCase()) || (u.email || '').toLowerCase().includes(userSearch.toLowerCase()))

  const stats = {
    totalCards: cards.length,
    activeCards: cards.filter((c) => c.is_active).length,
    totalUsers,
  }

  const availableCards = inventory.reduce((s, i) => s + (i.available || 0), 0)
  const duplicateNumbers = (() => {
    const counts = {}
    cards.forEach((c) => { const n = String(c.card_number || '').replace(/\D/g, ''); if (n) counts[n] = (counts[n] || 0) + 1 })
    return new Set(Object.keys(counts).filter((n) => counts[n] > 1))
  })()
  const expiringCard = (c) => {
    const m = /^(\d{2})\/(\d{2})$/.exec(String(c.expiry || ''))
    if (!m) return false
    const exp = new Date(2000 + Number(m[2]), Number(m[1]))
    const in3m = new Date(); in3m.setMonth(in3m.getMonth() + 3)
    return exp < in3m
  }
  const expiredCard = (c) => {
    const m = /^(\d{2})\/(\d{2})$/.exec(String(c.expiry || ''))
    if (!m) return true
    return new Date(2000 + Number(m[2]), Number(m[1])) < new Date()
  }
  const rangeOk = (dateStr) => {
    if (orderRange === 'all' || !dateStr) return true
    const d = new Date(dateStr)
    const now = Date.now()
    const days = orderRange === '7' ? 7 : orderRange === '30' ? 30 : 90
    return now - d.getTime() <= days * 86400000
  }
  const paidRevenue = orders.filter((o) => o.status === 'paid').reduce((s, o) => s + (o.amount_inr || 0), 0)
  const pendingOrders = orders.filter((o) => o.status === 'pending').length
  const totalAssigned = inventory.reduce((s, i) => s + (i.assigned || 0), 0)
  const lowStockTiers = inventory.filter((i) => i.available < 3)

  const sidebarItems = [
    { id: 'overview', label: 'Overview', icon: 'M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z' },
    { id: 'cards', label: 'Manage Cards', icon: 'M2.273 5.625A4.483 4.483 0 015.25 4.5h13.5c1.141 0 2.183.425 2.977 1.125A3 3 0 0018.75 3H5.25a3 3 0 00-2.977 2.625zM2.273 8.625A4.483 4.483 0 015.25 7.5h13.5c1.141 0 2.183.425 2.977 1.125A3 3 0 0018.75 6H5.25a3 3 0 00-2.977 2.625zM5.25 9a3 3 0 00-3 3v6a3 3 0 003 3h13.5a3 3 0 003-3v-6a3 3 0 00-3-3H5.25zm6.75 8.25a2.25 2.25 0 110-4.5 2.25 2.25 0 010 4.5z' },
    { id: 'users', label: 'Manage Users', icon: 'M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z' },
    { id: 'orders', label: 'Orders', icon: 'M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z' },
    { id: 'packs', label: 'Packs', icon: 'M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z' },
    { id: 'settings', label: 'Settings', icon: 'M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
  ]

  if (sessionExpired) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="bg-white border border-border rounded-2xl p-8 max-w-sm w-full text-center">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </div>
          <h2 className="font-bold text-[17px] text-foreground mb-1">Session expired</h2>
          <p className="text-[13px] text-muted-foreground mb-5">Your admin session ran out. Log in again to continue.</p>
          <button onClick={() => onNavigate('auth')} className="w-full bg-brand text-white text-[13px] font-bold py-2.5 rounded-xl hover:opacity-90 transition-opacity">Back to login</button>
        </div>
      </div>
    )
  }

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
          <button onClick={async () => { try { await supabase.rpc('admin_logout', { p_token: token }) } catch { } setAdminToken(null); onNavigate('landing') }} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium text-red-500 hover:text-red-600 hover:bg-red-50 transition-all">
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
              <button onClick={exportCards} className="flex items-center gap-2 bg-surface border border-border text-foreground text-[13px] font-bold px-4 py-2 rounded-xl hover:border-brand/50 transition-colors">
                <svg className="w-3.5 h-3.5 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
                Export
              </button>
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
              <div className="flex flex-wrap items-center gap-2">
                <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${settings?.maintenance === 'true' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>{settings?.maintenance === 'true' ? '🛠 Maintenance ON' : '● All systems normal'}</span>
                <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${settings?.claims_enabled === 'false' ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-700'}`}>{settings?.claims_enabled === 'false' ? 'Free claims paused' : 'Free claims ON'}</span>
                <button onClick={downloadBackup} className="ml-auto flex items-center gap-2 bg-surface border border-border text-foreground text-[13px] font-bold px-4 py-2 rounded-xl hover:border-brand/50 transition-colors">
                  <svg className="w-3.5 h-3.5 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
                  Download Backup
                </button>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: 'Total Cards', value: stats.totalCards, sub: `${stats.activeCards} active`, color: 'text-brand', bg: 'bg-brand-dim' },
                  { label: 'Available', value: inventory.length ? availableCards : '—', sub: inventory.length ? `${totalAssigned} assigned` : 'load inventory', color: 'text-emerald-600', bg: 'bg-emerald-50' },
                  { label: 'Total Users', value: stats.totalUsers, sub: 'registered', color: 'text-blue-600', bg: 'bg-blue-50' },
                  { label: 'Revenue (₹)', value: orders.length ? paidRevenue.toLocaleString('en-IN') : '—', sub: `${pendingOrders} pending`, color: 'text-amber-600', bg: 'bg-amber-50' },
                ].map((s) => (
                  <div key={s.label} className="bg-white border border-border rounded-2xl p-5">
                    <div className={`w-8 h-8 rounded-xl ${s.bg} flex items-center justify-center mb-3`}><span className={`text-[10px] font-black ${s.color}`}>#</span></div>
                    <p className={`text-[28px] font-black ${s.color}`}>{s.value}</p>
                    <p className="text-[12px] text-muted-foreground font-medium mt-0.5">{s.label}</p>
                    <p className="text-[11px] text-muted-foreground/60 mt-0.5">{s.sub}</p>
                  </div>
                ))}
              </div>

              {inventory.length > 0 && (
                <div className="bg-white border border-border rounded-2xl overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                    <h3 className="font-bold text-[14px] text-foreground">Card Pool by Tier</h3>
                    {lowStockTiers.length > 0 && <span className="text-[11px] font-bold text-red-600 bg-red-50 px-2 py-1 rounded-full">{lowStockTiers.map((t) => t.tier).join(', ')} low!</span>}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead><tr className="border-b border-border bg-surface">{['Tier', 'Total', 'Active', 'Assigned', 'Available'].map((h) => <th key={h} className="text-left px-4 py-2.5 text-[11px] uppercase tracking-widest text-muted-foreground font-bold">{h}</th>)}</tr></thead>
                      <tbody className="divide-y divide-border">
                        {inventory.map((i) => (
                          <tr key={i.tier} className="hover:bg-surface/50 transition-colors">
                            <td className="px-4 py-2.5 text-[13px] font-semibold text-foreground capitalize">{i.tier}</td>
                            <td className="px-4 py-2.5 text-[12px] text-muted-foreground">{i.total}</td>
                            <td className="px-4 py-2.5 text-[12px] text-muted-foreground">{i.active}</td>
                            <td className="px-4 py-2.5 text-[12px] text-muted-foreground">{i.assigned}</td>
                            <td className="px-4 py-2.5">
                              <span className={`text-[12px] font-bold px-2.5 py-0.5 rounded-full ${i.available < 3 ? 'bg-red-100 text-red-600' : i.available === 0 ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-700'}`}>{i.available}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

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

              {orders.length > 0 && (
                <div className="bg-white border border-border rounded-2xl overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                    <h3 className="font-bold text-[14px] text-foreground">Recent Orders</h3>
                    <button onClick={() => setActiveTab('orders')} className="text-[12px] text-brand font-semibold hover:underline">View all</button>
                  </div>
                  <div className="divide-y divide-border">
                    {orders.slice(0, 5).map((o) => (
                      <div key={o.id} className="flex items-center gap-3 px-5 py-3 hover:bg-surface transition-colors">
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-semibold text-foreground truncate">{o.display_name || o.user_email}</p>
                          <p className="text-[11px] text-muted-foreground">{o.pack_name} · ₹{o.amount_inr}</p>
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${o.status === 'paid' ? 'bg-green-100 text-green-700' : o.status === 'pending' ? 'bg-amber-100 text-amber-600' : o.status === 'refunded' ? 'bg-red-100 text-red-600' : 'bg-surface-2 text-muted-foreground border border-border'}`}>{o.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'cards' && !dataLoading && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2 items-center">
                <div className="relative flex-1 min-w-[220px]">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803a7.5 7.5 0 0010.607 0z" /></svg>
                  <input value={cardSearch} onChange={(e) => setCardSearch(e.target.value)} placeholder="Search by name, number, bank..." className="w-full bg-surface border border-border rounded-xl pl-9 pr-4 py-2.5 text-[13px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-brand/50 transition-colors" />
                </div>
                <select value={expiryFilter} onChange={(e) => setExpiryFilter(e.target.value)} className="bg-surface border border-border rounded-xl px-3 py-2.5 text-[12px] font-bold text-foreground focus:outline-none focus:border-brand/50">
                  <option value="all">All cards</option>
                  <option value="expiring">Expiring ≤ 3mo ({cards.filter(expiringCard).length})</option>
                  <option value="expired">Expired ({cards.filter(expiredCard).length})</option>
                  <option value="duplicates">Duplicates ({duplicateNumbers.size} numbers)</option>
                </select>
                <div className="flex items-center gap-2 text-[12px] text-muted-foreground bg-surface border border-border rounded-xl px-3 py-2.5 shrink-0"><span className="font-bold text-foreground">{filteredCards.length}</span> cards</div>
              </div>
              {selectedCards.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 bg-brand-dim border border-brand/20 rounded-xl px-3 py-2">
                  <span className="text-[12px] font-bold text-brand">{selectedCards.length} selected</span>
                  <div className="flex-1" />
                  <button onClick={() => bulkToggleCards(true)} className="text-[11px] font-bold text-emerald-700 bg-emerald-100 hover:bg-emerald-200 px-3 py-1.5 rounded-lg transition-colors">Activate</button>
                  <button onClick={() => bulkToggleCards(false)} className="text-[11px] font-bold text-amber-700 bg-amber-100 hover:bg-amber-200 px-3 py-1.5 rounded-lg transition-colors">Deactivate</button>
                  <button onClick={bulkDeleteCards} className="text-[11px] font-bold text-red-600 bg-red-100 hover:bg-red-200 px-3 py-1.5 rounded-lg transition-colors">Delete</button>
                  <button onClick={() => setSelectedCards([])} className="text-[11px] font-bold text-muted-foreground hover:text-foreground px-2">Clear</button>
                </div>
              )}
              <div className="bg-white border border-border rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border bg-surface">
                        <th className="px-3 py-3 w-8"><input type="checkbox" className="w-4 h-4 accent-brand" checked={selectedCards.length === filteredCards.length && filteredCards.length > 0} onChange={(e) => setSelectedCards(e.target.checked ? filteredCards.map((c) => c.id) : [])} /></th>
                        {['Card', 'Holder', 'Provider', 'Category', 'Expiry', 'Status', 'Actions'].map((h) => <th key={h} className="text-left px-4 py-3 text-[11px] uppercase tracking-widest text-muted-foreground font-bold whitespace-nowrap">{h}</th>)}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredCards.map((card) => (
                        <tr key={card.id} className={`hover:bg-surface/50 transition-colors ${selectedCards.includes(card.id) ? 'bg-brand-dim/40' : ''} ${duplicateNumbers.has(String(card.card_number || '').replace(/\D/g, '')) && expiryFilter === 'duplicates' ? 'bg-red-50' : ''}`}>
                          <td className="px-3 py-3"><input type="checkbox" className="w-4 h-4 accent-brand" checked={selectedCards.includes(card.id)} onChange={(e) => setSelectedCards((prev) => e.target.checked ? [...prev, card.id] : prev.filter((x) => x !== card.id))} /></td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              <div className={`w-10 h-7 rounded-lg bg-gradient-to-br ${CARD_GRADIENTS[card.provider] || CARD_GRADIENTS.Visa} flex items-end justify-end p-1 shrink-0`}><ProviderLogo provider={card.provider} size="md" /></div>
                              <span className="font-mono text-[12px] text-foreground whitespace-nowrap">•••• {card.card_number?.slice(-4)}{duplicateNumbers.has(String(card.card_number || '').replace(/\D/g, '')) && <span className="ml-1 text-[9px] font-bold text-red-600 bg-red-100 px-1.5 py-0.5 rounded-full">DUP</span>}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-[13px] text-foreground font-semibold whitespace-nowrap">{card.name}</td>
                          <td className="px-4 py-3 text-[12px] text-muted-foreground whitespace-nowrap">{card.provider}</td>
                          <td className="px-4 py-3"><span className="text-[11px] bg-surface-2 text-muted-foreground px-2 py-0.5 rounded-full border border-border">{card.category}</span></td>
                          <td className={`px-4 py-3 text-[12px] font-mono whitespace-nowrap ${expiredCard(card) ? 'text-red-600 font-bold' : expiringCard(card) ? 'text-amber-600' : 'text-muted-foreground'}`}>{card.expiry}</td>
                          <td className="px-4 py-3">
                            <button onClick={() => toggleCardStatus(card)} className={`text-[11px] font-bold px-2.5 py-1 rounded-full transition-colors ${card.is_active ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-red-100 text-red-600 hover:bg-red-200'}`}>{card.is_active ? 'Active' : 'Inactive'}</button>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              <button onClick={() => { setEditingCard(card); setFormData({ card_number: card.card_number, name: card.name, expiry: card.expiry, cvv: card.cvv, label: card.label, provider: card.provider, is_active: card.is_active, tier: card.tier || 'free', balance_usd: card.balance_usd ?? TIER_BALANCES[card.tier || 'free'] ?? 0 }); setShowCardModal(true) }} className="p-1.5 rounded-lg text-muted-foreground hover:text-brand hover:bg-brand-dim transition-colors" title="Edit">
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
              <div className="flex flex-wrap gap-2 items-center">
                <div className="relative max-w-md flex-1 min-w-[220px]">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803a7.5 7.5 0 0010.607 0z" /></svg>
                  <input value={userSearch} onChange={(e) => setUserSearch(e.target.value)} placeholder="Search users..." className="w-full bg-surface border border-border rounded-xl pl-9 pr-4 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-brand/50 transition-colors" />
                </div>
                <button onClick={exportUsers} disabled={users.length === 0} className="flex items-center gap-2 bg-surface border border-border text-foreground text-[13px] font-bold px-4 py-2 rounded-xl hover:border-brand/50 transition-colors disabled:opacity-40">
                  <svg className="w-3.5 h-3.5 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
                  Export CSV
                </button>
              </div>
              {selectedUsers.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 bg-brand-dim border border-brand/20 rounded-xl px-3 py-2">
                  <span className="text-[12px] font-bold text-brand">{selectedUsers.length} selected</span>
                  <div className="flex-1" />
                  <button onClick={() => bulkToggleUsers(true)} className="text-[11px] font-bold text-emerald-700 bg-emerald-100 hover:bg-emerald-200 px-3 py-1.5 rounded-lg transition-colors">Activate</button>
                  <button onClick={() => bulkToggleUsers(false)} className="text-[11px] font-bold text-red-600 bg-red-100 hover:bg-red-200 px-3 py-1.5 rounded-lg transition-colors">Suspend</button>
                  <button onClick={() => setSelectedUsers([])} className="text-[11px] font-bold text-muted-foreground hover:text-foreground px-2">Clear</button>
                </div>
              )}
              <div className="bg-white border border-border rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border bg-surface">
                        <th className="px-3 py-3 w-8"><input type="checkbox" className="w-4 h-4 accent-brand" checked={selectedUsers.length === filteredUsers.length && filteredUsers.length > 0} onChange={(e) => setSelectedUsers(e.target.checked ? filteredUsers.map((u) => u.id) : [])} /></th>
                        {['User', 'Plan', 'Actions'].map((h) => <th key={h} className="text-left px-4 py-3 text-[11px] uppercase tracking-widest text-muted-foreground font-bold whitespace-nowrap">{h}</th>)}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredUsers.map((user) => (
                        <tr key={user.id} className={`hover:bg-surface/50 transition-colors ${user.is_active === false ? 'opacity-60 bg-red-50/40' : ''} ${selectedUsers.includes(user.id) ? 'bg-brand-dim/40' : ''}`}>
                          <td className="px-3 py-3"><input type="checkbox" className="w-4 h-4 accent-brand" checked={selectedUsers.includes(user.id)} onChange={(e) => setSelectedUsers((prev) => e.target.checked ? [...prev, user.id] : prev.filter((x) => x !== user.id))} /></td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-brand flex items-center justify-center shrink-0">
                                <span className="text-white font-bold text-[12px]">{(user.name || user.email || 'U')[0].toUpperCase()}</span>
                              </div>
                              <div className="min-w-0">
                                <p className="text-[13px] font-semibold text-foreground truncate">{user.name || '—'}</p>
                                <p className="text-[11px] text-muted-foreground truncate">{user.email}</p>
                              </div>
                              {user.is_active === false && <span className="text-[10px] font-bold text-red-600 bg-red-100 px-2 py-0.5 rounded-full shrink-0">Suspended</span>}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-[11px] font-bold uppercase px-2.5 py-0.5 rounded-full ${user.plan === 'Galaxy' || user.plan === 'Cosmos' || user.plan === 'Infinity' ? 'bg-amber-100 text-amber-600' : user.plan !== 'Free' ? 'bg-brand-dim text-brand' : 'bg-surface-2 text-muted-foreground border border-border'}`}>{user.plan || 'Free'}</span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <select value={user.plan || 'Free'} onChange={(e) => changeUserPlan(user.id, e.target.value)} className="bg-surface border border-border rounded-lg px-2 py-1 text-[12px] text-foreground focus:outline-none focus:border-brand/50">
                                {ALL_TIERS.map((t) => <option key={t.id} value={t.label.split(' ')[0]}>{t.label}</option>)}
                              </select>
                              <button
                                onClick={() => handleAssignFreeCard(user.id, user.email)}
                                disabled={assigningFreeCard === user.id}
                                title="Assign a free card to this user"
                                className="flex items-center gap-1 bg-emerald-100 text-emerald-700 hover:bg-emerald-200 font-bold text-[11px] px-2.5 py-1 rounded-full transition-colors disabled:opacity-40 whitespace-nowrap"
                              >
                                {assigningFreeCard === user.id ? '...' : '+ Free Card'}
                              </button>
                              <button
                                onClick={() => viewUserCards(user)}
                                title="View cards this user owns"
                                className="flex items-center gap-1 bg-blue-50 text-blue-600 hover:bg-blue-100 font-bold text-[11px] px-2.5 py-1 rounded-full transition-colors whitespace-nowrap"
                              >
                                Cards
                              </button>
                              <button
                                onClick={() => toggleUserStatus(user)}
                                title={user.is_active === false ? 'Activate this user' : 'Suspend this user (blocks login)'}
                                className={`flex items-center gap-1 font-bold text-[11px] px-2.5 py-1 rounded-full transition-colors whitespace-nowrap ${user.is_active === false ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-red-50 text-red-600 hover:bg-red-100'}`}
                              >
                                {user.is_active === false ? 'Activate' : 'Suspend'}
                              </button>
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

          {activeTab === 'orders' && !dataLoading && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2 items-center">
                <div className="flex items-center gap-1 bg-surface border border-border rounded-xl p-1">
                  {['all', 'pending', 'paid', 'failed', 'refunded'].map((s) => (
                    <button key={s} onClick={() => setOrderFilter(s)} className={`px-3 py-1.5 rounded-lg text-[12px] font-bold capitalize transition-colors ${orderFilter === s ? 'bg-brand text-white' : 'text-muted-foreground hover:text-foreground'}`}>{s}</button>
                  ))}
                </div>
                <div className="flex items-center gap-1 bg-surface border border-border rounded-xl p-1">
                  {[{ v: 'all', l: 'All time' }, { v: '7', l: '7d' }, { v: '30', l: '30d' }, { v: '90', l: '90d' }].map((r) => (
                    <button key={r.v} onClick={() => setOrderRange(r.v)} className={`px-2.5 py-1.5 rounded-lg text-[12px] font-bold transition-colors ${orderRange === r.v ? 'bg-brand text-white' : 'text-muted-foreground hover:text-foreground'}`}>{r.l}</button>
                  ))}
                </div>
                <div className="relative flex-1 min-w-[200px]">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803a7.5 7.5 0 0010.607 0z" /></svg>
                  <input value={orderSearch} onChange={(e) => setOrderSearch(e.target.value)} placeholder="Search by user or order id..." className="w-full bg-surface border border-border rounded-xl pl-9 pr-4 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-brand/50" />
                </div>
                <button onClick={exportOrders} disabled={orders.length === 0} className="flex items-center gap-2 bg-surface border border-border text-foreground text-[13px] font-bold px-4 py-2 rounded-xl hover:border-brand/50 transition-colors disabled:opacity-40">
                  <svg className="w-3.5 h-3.5 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
                  Export CSV
                </button>
              </div>

              <div className="bg-white border border-border rounded-2xl overflow-hidden">
                {ordersLoading ? (
                  <div className="p-10 text-center"><p className="text-[13px] text-muted-foreground font-medium">Loading orders…</p></div>
                ) : orders.length === 0 ? (
                  <div className="p-10 text-center">
                    <p className="text-[13px] text-muted-foreground font-medium">No orders found.</p>
                    <p className="text-[11px] text-muted-foreground/60 mt-1">If this is unexpected, make sure migration <span className="font-mono">0009_admin_features.sql</span> has been run in Supabase (SQL Editor).</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border bg-surface">{['User', 'Pack', 'Amount', 'Status', 'Created', 'Actions'].map((h) => <th key={h} className="text-left px-4 py-3 text-[11px] uppercase tracking-widest text-muted-foreground font-bold whitespace-nowrap">{h}</th>)}</tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {orders.filter((o) => orderFilter === 'all' || o.status === orderFilter).filter((o) => rangeOk(o.created_at)).filter((o) => !orderSearch || (o.user_email || o.display_name || o.pack_name || '').toLowerCase().includes(orderSearch.toLowerCase())).map((o) => (
                          <tr key={o.id} className="hover:bg-surface/50 transition-colors">
                            <td className="px-4 py-3">
                              <p className="text-[13px] font-semibold text-foreground truncate">{o.display_name || '—'}</p>
                              <p className="text-[11px] text-muted-foreground truncate">{o.user_email}</p>
                            </td>
                            <td className="px-4 py-3 text-[12px] text-foreground font-semibold whitespace-nowrap capitalize">{o.pack_name}</td>
                            <td className="px-4 py-3 text-[13px] text-foreground font-bold whitespace-nowrap">₹{o.amount_inr}</td>
                            <td className="px-4 py-3">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${o.status === 'paid' ? 'bg-green-100 text-green-700' : o.status === 'pending' ? 'bg-amber-100 text-amber-600' : o.status === 'refunded' ? 'bg-red-100 text-red-600' : 'bg-surface-2 text-muted-foreground border border-border'}`}>{o.status}</span>
                            </td>
                            <td className="px-4 py-3 text-[11px] text-muted-foreground whitespace-nowrap">{o.created_at ? new Date(o.created_at).toLocaleDateString('en-IN') : '—'}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1">
                                {o.status !== 'paid' && <button onClick={() => setOrderStatus(o.id, 'paid')} className="text-[11px] font-bold text-emerald-600 hover:bg-emerald-50 px-2 py-1 rounded-lg">Mark Paid</button>}
                                {o.status !== 'failed' && <button onClick={() => setOrderStatus(o.id, 'failed')} className="text-[11px] font-bold text-red-600 hover:bg-red-50 px-2 py-1 rounded-lg">Fail</button>}
                                {o.status !== 'refunded' && <button onClick={() => setOrderStatus(o.id, 'refunded')} className="text-[11px] font-bold text-amber-600 hover:bg-amber-50 px-2 py-1 rounded-lg">Refund</button>}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'packs' && !dataLoading && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {packs.map((pack) => (
                  <div key={pack.id} className={`bg-white border rounded-2xl p-5 ${pack.is_active ? 'border-border' : 'border-red-200 opacity-70'}`}>
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <p className="font-bold text-[15px] text-foreground capitalize">{pack.name}</p>
                        <p className="text-[11px] text-muted-foreground">id: <span className="font-mono">{pack.id}</span></p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${pack.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>{pack.is_active ? 'Active' : 'Off'}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${inventory.find((i) => i.tier === pack.id)?.available < 3 ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-700'}`}>{inventory.find((i) => i.tier === pack.id)?.available ?? 0} in pool</span>
                      </div>
                    </div>
                    {packEditing === pack.id ? (
                      <div className="space-y-2.5">
                        <div>
                          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Price (₹)</label>
                          <input type="number" value={editingPackForm.price_inr} onChange={(e) => setEditingPackForm((f) => ({ ...f, price_inr: e.target.value }))} className="mt-0.5 w-full bg-surface border border-border rounded-lg px-3 py-2 text-[13px] text-foreground font-bold focus:outline-none focus:border-brand/50" />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Balance ($)</label>
                          <input type="number" value={editingPackForm.balance_usd} onChange={(e) => setEditingPackForm((f) => ({ ...f, balance_usd: e.target.value }))} className="mt-0.5 w-full bg-surface border border-border rounded-lg px-3 py-2 text-[13px] text-foreground font-bold focus:outline-none focus:border-brand/50" />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Sort order</label>
                          <input type="number" value={editingPackForm.sort_order} onChange={(e) => setEditingPackForm((f) => ({ ...f, sort_order: e.target.value }))} className="mt-0.5 w-full bg-surface border border-border rounded-lg px-3 py-2 text-[13px] text-foreground font-bold focus:outline-none focus:border-brand/50" />
                        </div>
                        <label className="flex items-center gap-2 text-[12px] font-semibold text-foreground">
                          <input type="checkbox" checked={!!editingPackForm.is_active} onChange={(e) => setEditingPackForm((f) => ({ ...f, is_active: e.target.checked }))} className="w-4 h-4 accent-brand" /> Active
                        </label>
                        <div className="flex gap-2 pt-1">
                          <button onClick={() => savePack(pack.id)} className="flex-1 bg-brand text-white text-[12px] font-bold py-2 rounded-xl hover:opacity-90 transition-opacity">Save</button>
                          <button onClick={() => setPackEditing(null)} className="px-3 text-[12px] font-bold text-muted-foreground hover:text-foreground">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-1.5 text-[13px]">
                        <div className="flex justify-between"><span className="text-muted-foreground">Price</span><span className="font-bold text-foreground">₹{pack.price_inr}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Balance</span><span className="font-bold text-foreground">${pack.balance_usd}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Order</span><span className="font-bold text-foreground">{pack.sort_order}</span></div>
                        <div className="flex gap-2 pt-3">
                          <button onClick={() => openPackEdit(pack)} className="flex-1 bg-surface border border-border text-[12px] font-bold text-foreground py-2 rounded-xl hover:border-brand/50 transition-colors">Edit</button>
                          <button onClick={() => togglePackActive(pack)} className={`flex-1 text-[12px] font-bold py-2 rounded-xl transition-colors ${pack.is_active ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}>{pack.is_active ? 'Disable' : 'Enable'}</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {packs.length === 0 && (
                <div className="bg-white border border-border rounded-2xl p-10 text-center">
                  <p className="text-[13px] text-muted-foreground font-medium">No packs loaded. Migration <span className="font-mono">0009_admin_features.sql</span> should already list them.</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'settings' && !dataLoading && (
            <div className="space-y-6">
              <div className="bg-white border border-border rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-[14px] text-foreground">Global Settings</h3>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-brand">applies instantly</span>
                </div>
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-[13px] font-semibold text-foreground">Maintenance mode</p>
                      <p className="text-[11px] text-muted-foreground">Blocks all users (admin can still sign in). Great for breaking changes.</p>
                    </div>
                    <button onClick={() => saveSetting('maintenance', settings?.maintenance === 'true' ? 'false' : 'true')} className={`shrink-0 w-12 h-7 rounded-full transition-colors ${settings?.maintenance === 'true' ? 'bg-amber-500' : 'bg-slate-300'}`} aria-label="Toggle maintenance">
                      <span className={`block w-5 h-5 bg-white rounded-full shadow transition-transform ${settings?.maintenance === 'true' ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-[13px] font-semibold text-foreground">Free card claims</p>
                      <p className="text-[11px] text-muted-foreground">Pause the free card pool while you manage inventory.</p>
                    </div>
                    <button onClick={() => saveSetting('claims_enabled', settings?.claims_enabled === 'false' ? 'true' : 'false')} className={`shrink-0 w-12 h-7 rounded-full transition-colors ${settings?.claims_enabled === 'false' ? 'bg-slate-300' : 'bg-emerald-500'}`} aria-label="Toggle free claims">
                      <span className={`block w-5 h-5 bg-white rounded-full shadow transition-transform ${settings?.claims_enabled === 'false' ? 'translate-x-1' : 'translate-x-6'}`} />
                    </button>
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">Announcement banner (empty = hidden)</label>
                    <div className="flex gap-2 mt-1">
                      <input value={settings?.announcement || ''} onChange={(e) => onSettingsChange?.((p) => ({ ...p, announcement: e.target.value }))} placeholder="e.g. New packs arriving Friday!" className="flex-1 bg-surface border border-border rounded-xl px-3 py-2.5 text-[13px] text-foreground focus:outline-none focus:border-brand/50" />
                      <button onClick={() => saveSetting('announcement', settings?.announcement || '')} className="bg-brand text-white text-[13px] font-bold px-4 py-2.5 rounded-xl hover:opacity-90 transition-opacity shrink-0">Save</button>
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">Force theme for everyone</label>
                    <select value={settings?.force_theme || ''} onChange={(e) => saveSetting('force_theme', e.target.value)} className="mt-1 w-full bg-surface border border-border rounded-xl px-3 py-2.5 text-[13px] text-foreground focus:outline-none focus:border-brand/50">
                      <option value="">User choice (default)</option>
                      {APP_THEMES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">Maintenance message</label>
                    <div className="flex gap-2 mt-1">
                      <input value={settings?.maintenance_message || ''} onChange={(e) => onSettingsChange?.((p) => ({ ...p, maintenance_message: e.target.value }))} className="flex-1 bg-surface border border-border rounded-xl px-3 py-2.5 text-[13px] text-foreground focus:outline-none focus:border-brand/50" />
                      <button onClick={() => saveSetting('maintenance_message', settings?.maintenance_message || '')} className="bg-surface border border-border text-foreground text-[13px] font-bold px-4 py-2.5 rounded-xl hover:border-brand/50 transition-colors shrink-0">Save</button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white border border-border rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-[14px] text-foreground">Active Admin Sessions</h3>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{sessions.filter((s) => s.is_active).length} active</span>
                </div>
                <div className="divide-y divide-border">
                  {sessions.length === 0 && <p className="text-[12px] text-muted-foreground">No sessions found.</p>}
                  {sessions.slice(0, 10).map((s) => (
                    <div key={s.id} className="flex items-center gap-3 py-2.5">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${s.is_active ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-foreground truncate">{s.label || 'Admin'}</p>
                        <p className="text-[11px] text-muted-foreground">{s.created_at ? new Date(s.created_at).toLocaleString() : ''} · expires {s.expires_at ? new Date(s.expires_at).toLocaleString() : ''}</p>
                      </div>
                      {s.is_active && <button onClick={() => revokeSession(s)} className="text-[11px] font-bold text-red-600 hover:underline shrink-0">Revoke</button>}
                    </div>
                  ))}
                </div>
              </div>

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
                      <span className={`text-[13px] font-semibold ${c.is_active ? 'text-foreground' : 'text-muted-foreground/50 line-through'}`}>{c.label || `Admin #${c.id.slice(0, 4)}`}</span>
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
                <div>
                  <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">Tier Pool</label>
                  <select value={formData.tier} onChange={(e) => setFormData((f) => ({ ...f, tier: e.target.value, balance_usd: TIER_BALANCES[e.target.value] ?? 0 }))} className="mt-1 w-full bg-surface border border-border rounded-xl px-3 py-2.5 text-[13px] text-foreground focus:outline-none focus:border-brand/50">
                    {ALL_TIERS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">Label (Category)</label>
                  <select value={formData.label} onChange={(e) => setFormData((f) => ({ ...f, label: e.target.value }))} className="mt-1 w-full bg-surface border border-border rounded-xl px-3 py-2.5 text-[13px] text-foreground focus:outline-none focus:border-brand/50">
                    {['Netflix', 'Amazon', 'Spotify', 'YouTube', 'Other'].map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">Balance (USD)</label>
                  <div className="mt-1 flex items-center gap-2">
                    <input type="number" min="0" value={formData.balance_usd} onChange={(e) => setFormData((f) => ({ ...f, balance_usd: Number(e.target.value) }))} className="flex-1 bg-surface border border-border rounded-xl px-3 py-2.5 text-[13px] text-foreground font-mono focus:outline-none focus:border-brand/50" />
                    <span className="text-[12px] font-bold text-emerald-600 bg-emerald-50 px-3 py-2.5 rounded-xl border border-emerald-200">${formData.balance_usd} USD</span>
                  </div>
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
            <p className="text-[12px] text-muted-foreground mb-3">One card per line: <span className="font-mono text-brand">cardnumber MM/YY CVV</span> (e.g. <span className="font-mono">4111111111111111 12/29 123</span>). Up to 1000 per batch.</p>
            <div className="mb-3">
              <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">Tier Pool for All Cards</label>
              <select value={bulkTier} onChange={(e) => setBulkTier(e.target.value)} className="mt-1 w-full bg-surface border border-border rounded-xl px-3 py-2.5 text-[13px] text-foreground focus:outline-none focus:border-brand/50">
                {[
                  { id: 'free', label: 'Free (₹0 / $0)' },
                  { id: 'spark', label: 'Spark (₹299 / $15)' },
                  { id: 'orbit', label: 'Orbit (₹499 / $26)' },
                  { id: 'nova', label: 'Nova (₹799 / $32)' },
                  { id: 'galaxy', label: 'Galaxy (₹999 / $49)' },
                  { id: 'cosmos', label: 'Cosmos (₹1299 / $67)' },
                  { id: 'infinity', label: 'Infinity (₹1599 / $82)' },
                ].map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
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

      {userCardsUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div>
                <h3 className="font-bold text-[15px] text-foreground">Cards of {userCardsUser.name || userCardsUser.email}</h3>
                <p className="text-[11px] text-muted-foreground">{userCards.length} card(s) owned</p>
              </div>
              <button onClick={() => { setUserCardsUser(null) }} className="p-1.5 rounded-lg text-muted-foreground hover:bg-surface transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="overflow-y-auto flex-1 divide-y divide-border">
              {userCards.length === 0 && <p className="p-6 text-center text-[13px] text-muted-foreground">This user has no cards yet.</p>}
              {userCards.map((c) => (
                <div key={c.user_card_id} className="flex items-center gap-3 px-5 py-3">
                  <div className={`w-10 h-7 rounded-lg bg-gradient-to-br ${CARD_GRADIENTS[c.provider] || CARD_GRADIENTS.Visa} flex items-end justify-end p-1 shrink-0`}><ProviderLogo provider={c.provider} size="sm" /></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-foreground font-mono truncate">•••• {String(c.card_number).slice(-4)} · {c.provider}</p>
                    <p className="text-[11px] text-muted-foreground">tier <span className="font-bold capitalize">{c.tier}</span> · ${c.balance_usd} · {c.pack_name}</p>
                  </div>
                  <button onClick={() => removeUserCard(c.user_card_id)} title="Remove this card from the user" className="text-[11px] font-bold text-red-600 hover:bg-red-50 px-2 py-1 rounded-lg transition-colors">Remove</button>
                </div>
              ))}
            </div>
            <div className="px-5 py-4 border-t border-border">
              <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-2">Assign a card of tier</p>
              <div className="flex flex-wrap gap-1.5">
                {ALL_TIERS.map((t) => (
                  <button key={t.id} onClick={() => assignTierCard(t.id)} className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-surface border border-border text-foreground hover:border-brand/50 transition-colors capitalize">
                    {t.label.split(' ')[0]}
                  </button>
                ))}
              </div>
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
      {view === 'pricing' && <PricingPage currentUser={currentUser} onNavigate={navigate} settings={appSettings} />}
      {view === 'account' && <AccountPage currentUser={currentUser} onLogout={handleLogout} onNavigate={navigate} theme={effectiveTheme} onThemeChange={setTheme} onUserUpdate={handleUserUpdate} />}
      {view === 'faq' && <FAQPage onNavigate={navigate} />}
      {view === 'admin' && <AdminPanelPage onNavigate={navigate} settings={appSettings} onSettingsChange={setAppSettings} />}
    </div>
  )
}

export default App
