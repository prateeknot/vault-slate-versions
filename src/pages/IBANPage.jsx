import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { IBAN_COUNTRY_NAMES } from '../constants'
import { CopyButton, Toast } from '../components/ui'
import { BottomNav } from '../components/nav'

// IBAN — European bank accounts (all shared, latest first)

export function IBANPage({ onNavigate }) {
  const [ibans, setIbans] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState(null)

  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 2500)
  }, [])

  const fetchIbans = useCallback(async () => {
    try {
      const { data } = await supabase.rpc('ibans_for_me')
      if (Array.isArray(data)) setIbans(data)
    } catch { } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchIbans() }, [fetchIbans])

  // Realtime: admin adds an IBAN → it appears here instantly
  useEffect(() => {
    const ch = supabase.channel('ibans-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'iban_cards' }, () => fetchIbans())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [fetchIbans])

  const copyText = async (text) => {
    try {
      await navigator.clipboard.writeText(text)
      showToast('Copied!')
    } catch { showToast('Copy failed', 'error') }
  }

  const visible = ibans.filter((i) =>
    !search ||
    (i.bank_name || '').toLowerCase().includes(search.toLowerCase()) ||
    (i.holder_name || '').toLowerCase().includes(search.toLowerCase()) ||
    (i.country || '').toLowerCase().includes(search.toLowerCase()) ||
    (i.iban || '').toLowerCase().includes(search.toLowerCase())
  )

  const formatIban = (iban) => {
    const s = String(iban || '').replace(/\s/g, '')
    return s.match(/.{1,4}/g)?.join(' ') || s
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="app-header sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-md">
        <div className="max-w-md mx-auto px-4 flex items-center h-14">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-primary flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.008v.008H6.75V6.75zm6 0h.008v.008h-.008V6.75zm-6 5.25h.008v.008H6.75V12zm6 0h.008v.008h-.008V12zm-6 5.25h.008v.008H6.75v-.008zm6 0h.008v.008h-.008v-.008z" /></svg>
            </div>
            <div>
              <h1 className="font-bold text-foreground text-[15px] leading-tight">IBAN Accounts</h1>
              <p className="text-[10px] text-muted-foreground leading-tight">European bank accounts</p>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-md mx-auto w-full px-4 py-5 pb-28">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 flex items-start gap-3 mb-4">
          <span className="text-[16px]">🏦</span>
          <div>
            <p className="text-[12px] font-bold text-emerald-800">All IBANs are yours</p>
            <p className="text-[11px] text-emerald-700 leading-relaxed">These European IBAN accounts are shared with every user — use any of them. New ones appear here automatically as the admin adds them.</p>
          </div>
        </div>

        <div className="relative mb-4">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803a7.5 7.5 0 0010.607 0z" /></svg>
          <input type="search" aria-label="Search IBANs" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by bank, holder, country, IBAN..."
            className="w-full bg-surface border border-border rounded-xl pl-10 pr-4 py-2.5 text-[14px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-brand/50 focus:ring-2 focus:ring-brand/10 transition-colors" />
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <svg className="animate-spin h-7 w-7 text-brand" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
            <p className="mt-3 text-sm text-muted-foreground">Loading IBANs…</p>
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-12 h-12 rounded-2xl bg-surface border border-border flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
            <p className="text-muted-foreground text-[14px]">{ibans.length === 0 ? 'No IBAN accounts yet — check back soon.' : 'No IBANs match your search.'}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {visible.map((i) => (
              <div key={i.id} className="bg-white border border-border rounded-2xl p-3.5 shadow-soft">
                {/* Top row — cards-page list style: chip + bank + holder */}
                <div className="flex items-center gap-3.5">
                  <div className="relative w-14 h-10 rounded-xl bg-gradient-to-br from-emerald-500 via-teal-600 to-slate-800 flex flex-col items-start justify-between p-1.5 shrink-0 overflow-hidden">
                    <div className="absolute inset-0 rounded-xl" style={{ background: 'linear-gradient(135deg,rgba(255,255,255,0.14) 0%,transparent 55%)' }} />
                    <span className="relative z-10 text-white font-black text-[9px] tracking-wide">{String(i.country || 'EU').slice(0, 2).toUpperCase()}</span>
                    <span className="relative z-10 self-end text-white/80 text-[10px]">🏦</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-bold text-[13px] text-foreground truncate">{i.bank_name || 'Bank'}</p>
                      {i.label && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 bg-brand-dim text-brand capitalize">{i.label}</span>}
                    </div>
                    <p className="text-muted-foreground text-[12px] mt-0.5 truncate">{i.holder_name || '—'} · {IBAN_COUNTRY_NAMES[String(i.country).toUpperCase()] || i.country || 'EU'}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <p className="font-mono text-[12px] text-foreground font-semibold tracking-wide truncate">{formatIban(i.iban)}</p>
                      <CopyButton value={i.iban} label="IBAN" />
                    </div>
                  </div>
                  <span className="shrink-0 text-[9px] font-bold uppercase px-2 py-0.5 rounded-full bg-surface-2 text-muted-foreground border border-border">IBAN</span>
                </div>

                {i.bic && (
                  <div className="mt-3 rounded-xl bg-surface border border-border px-3 py-2.5 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold shrink-0">BIC</span>
                      <p className="font-mono text-[12px] font-bold text-foreground truncate">{i.bic}</p>
                    </div>
                    <button onClick={() => copyText(i.bic)} className="text-[11px] font-semibold text-brand border border-brand/20 bg-brand-dim px-2.5 py-1 rounded-lg hover:bg-brand/10 transition-colors shrink-0">Copy</button>
                  </div>
                )}

                {(i.card_number || i.expiry || i.cvv) && (
                  <div className="mt-2.5 rounded-xl border border-brand/15 bg-brand-dim/40 px-3.5 py-3">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <p className="text-[10px] uppercase tracking-widest text-brand font-bold">Linked Card</p>
                      {i.card_number && <button onClick={() => copyText(i.card_number)} className="text-[10px] font-semibold text-brand border border-brand/20 bg-white px-2 py-1 rounded-lg hover:bg-brand/10 transition-colors">Copy</button>}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {i.card_number && (
                        <div className="col-span-2">
                          <p className="text-[9px] uppercase tracking-widest text-muted-foreground font-bold mb-0.5">Card Number</p>
                          <p className="font-mono text-[13px] font-bold text-foreground break-all">•••• •••• •••• {String(i.card_number).slice(-4)}</p>
                        </div>
                      )}
                      {i.expiry && (
                        <div>
                          <p className="text-[9px] uppercase tracking-widest text-muted-foreground font-bold mb-0.5">Expiry</p>
                          <p className="font-mono text-[12px] font-bold text-foreground">{i.expiry}</p>
                        </div>
                      )}
                      {i.cvv && (
                        <div>
                          <p className="text-[9px] uppercase tracking-widest text-muted-foreground font-bold mb-0.5">CVV</p>
                          <p className="font-mono text-[12px] font-bold text-foreground">{i.cvv}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>

      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      <BottomNav view="cards" isLoggedIn={true} onNavigate={onNavigate} />
    </div>
  )
}

// ─── FAKE ID GENERATOR PAGE ──────────────────────────────────────────────────
// v13: the + (FakeID) button in the bottom nav opens this page. A user taps
// Generate and gets a random ID from the admin-added pool in ~1s (shuffled so
// everyone gets a different one). One ID per user — regenerating returns the
// same one. The ID content is a formatted text block (sections + key: value).