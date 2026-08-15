import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { V2_PACKS } from '../constants'
import { VirtualCardVisual } from '../components/cards'
import { BottomNav } from '../components/nav'

// Landing — hero + feature grid + pack preview

export function LandingPage({ isLoggedIn, onNavigate, settings }) {
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
      <header className="app-header sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-md">
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