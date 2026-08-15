import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { TIER_BALANCES, CATEGORIES, PREVIEW_CARD, V2_PACKS, TELEGRAM_BOT_USERNAME, UPGRADE_COOLDOWN_HOURS } from '../constants'
import { CardListItem, CardDetailModal, VirtualCardVisual } from '../components/cards'
import { Toast, CopyButton } from '../components/ui'
import { BottomNav } from '../components/nav'

// Cards — user's claimed cards with preview, list/grid, favorites, realtime

export function CardsPage({ currentUser, onNavigate, settings }) {
  const userPlan = currentUser?.plan ?? 'free'
  const isGuest = !!currentUser?.isGuest
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [search, setSearch] = useState('')
  const [selectedCard, setSelectedCard] = useState(null)
  const [flipped, setFlipped] = useState(false)
  const [toast, setToast] = useState(null)
  const [claimed, setClaimed] = useState([])
  const [overview, setOverview] = useState(null)
  const [loading, setLoading] = useState(true)
  const [layout, setLayout] = useState('list')
  const [favOnly, setFavOnly] = useState(false)
  const [pendingRequests, setPendingRequests] = useState([])
  const [myUpgradeReqs, setMyUpgradeReqs] = useState([])

  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 2500)
  }, [])

  // Cards are only available after buying a Top-Up Pack (admin activates the
  // plan + assigns the card). Free claiming was removed in v9.
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
        // Guests have no DB account — show zero cards (v10: removed a stale
        // setPlanLimit(3) call that referenced a non-existent state).
        setClaimed([])
        setOverview(null)
        return
      }
      const [overviewRes, cardsRes, pendingRes, upgradeRes] = await Promise.all([
        supabase.rpc('my_overview'),
        supabase.rpc('cards_for_me'),
        supabase.rpc('my_pending_requests'),
        supabase.rpc('my_upgrade_requests'),
      ])
      const overview = overviewRes.data || {}
      const rows = normalizeCards(cardsRes.data)
      setOverview(overview)
      setClaimed(rows)
      setPendingRequests(pendingRes.data || [])
      setMyUpgradeReqs(upgradeRes.data || [])
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
          .on('postgres_changes', { event: '*', schema: 'public', table: 'upgrade_requests' }, () => fetchData())
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

  // Pending upgrade payment → cards stay LOCKED until the owner approves/rejects
  if (!isGuest && pendingRequests.length > 0) {
    const req = pendingRequests[0]
    const pack = V2_PACKS.find((p) => p.id === req.pack_id)
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
              <span className="font-bold text-foreground">VCardz</span>
            </div>
            <span className="text-[11px] font-bold uppercase px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 border border-amber-200">Payment review</span>
          </div>
        </header>

        <main className="flex-1 max-w-md mx-auto w-full px-4 pt-8 pb-28">
          <div className="rounded-3xl border border-amber-200 bg-white shadow-soft p-6 text-center">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-100 flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" /></svg>
            </div>
            <h2 className="font-black text-[18px] text-foreground">Payment Under Review</h2>
            <p className="text-[13px] text-muted-foreground mt-2 leading-relaxed">
              Aapki <span className="font-bold text-foreground">{pack?.name || req.pack_name || req.pack_id}</span> pack ki payment
              review mein hai. Admin approve karte hi aapke cards unlock ho jayenge.
            </p>

            <div className="mt-4 rounded-2xl bg-surface border border-border p-4 text-left space-y-2">
              <div className="flex justify-between text-[12px]">
                <span className="text-muted-foreground font-semibold">Pack</span>
                <span className="font-bold text-foreground">{pack?.name || req.pack_name || req.pack_id}</span>
              </div>
              <div className="flex justify-between text-[12px]">
                <span className="text-muted-foreground font-semibold">Amount</span>
                <span className="font-bold text-foreground">₹{Number(req.amount_inr).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-[12px]">
                <span className="text-muted-foreground font-semibold">Status</span>
                <span className="font-bold text-amber-600">Pending review</span>
              </div>
              <div className="flex justify-between text-[12px]">
                <span className="text-muted-foreground font-semibold">Requested</span>
                <span className="font-semibold text-foreground">{new Date(req.created_at).toLocaleDateString()} {new Date(req.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            </div>

            <p className="text-[12px] text-muted-foreground mt-4">
              Koi sawaal? Message us on Telegram: <span className="font-bold text-brand">@{TELEGRAM_BOT_USERNAME}</span>
            </p>
            <button
              onClick={() => fetchData()}
              className="mt-4 w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold text-[14px] hover:opacity-90 active:scale-[0.98] transition-all shadow-md"
            >
              Re-check Status
            </button>
          </div>
        </main>
        <BottomNav view="cards" isLoggedIn={!!currentUser} onNavigate={onNavigate} />
      </div>
    )
  }

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
        {(() => {
          const rej = myUpgradeReqs.find((r) => r.status === 'rejected')
          if (isGuest || !rej?.reviewed_at) return null
          const retryAt = new Date(rej.reviewed_at).getTime() + UPGRADE_COOLDOWN_HOURS * 3600 * 1000
          if (retryAt <= Date.now()) return null
          return (
            <div className="mb-4 rounded-2xl bg-red-50 border border-red-200 p-3.5 flex items-start gap-3">
              <span className="text-red-500 text-[16px]">🚫</span>
              <div>
                <p className="text-[12px] font-bold text-red-700">Payment request declined</p>
                <p className="text-[11px] text-red-600 mt-0.5 leading-relaxed">Your last upgrade request was declined. You can submit a new one after 24 hours.</p>
              </div>
            </div>
          )
        })()}
        <div className="relative mb-4">
          {!isGuest && (
            <>
              <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803a7.5 7.5 0 0010.607 0z" /></svg>
              <input type="search" aria-label="Search cards" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, bank, provider..."
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
                <span>Card limit</span>
                <span>{claimed.length} / {overview?.card_limit ?? 1}</span>
              </div>
              <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
                <div className="h-full rounded-full bg-brand transition-all duration-500" style={{ width: `${Math.min(100, (claimed.length / Math.max(1, overview?.card_limit ?? 1)) * 100)}%` }} />
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
              <button onClick={() => onNavigate('iban')} className="text-[11px] font-semibold text-emerald-600 hover:underline">IBAN Accounts</button>
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
              <svg className="w-7 h-7 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" /></svg>
            </div>
            <h3 className="font-black text-[16px] text-foreground mb-1">No cards yet</h3>
            <p className="text-[12px] text-muted-foreground mb-4 leading-relaxed">Cards unlock when you buy a Top-Up Pack. Pay via UPI QR and the admin activates your plan.</p>
            <button onClick={() => onNavigate('pricing')} className="w-full py-3 rounded-xl font-bold text-[14px] text-primary-foreground bg-primary hover:opacity-90 transition-opacity shadow-md">View Plans</button>
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
                <p className="text-muted-foreground text-[14px]">Buy a Top-Up Pack to unlock your first virtual card</p>
                <button onClick={() => onNavigate('pricing')} className="mt-4 w-full max-w-xs py-3 rounded-xl font-bold text-[14px] text-primary-foreground bg-primary hover:opacity-90 active:scale-[0.98] transition-all shadow-md">View Plans</button>
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