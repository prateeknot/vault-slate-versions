import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import Logo from '../components/Logo'
import CardItem from '../components/CardItem'
import { useToast } from '../components/Toast'
import { useApp } from '../context/AppContext'
import { supabase } from '../lib/supabase'

export default function CardListingPage() {
  const { currentUser } = useApp()
  const { showToast } = useToast()
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')

  const [availableCards, setAvailableCards] = useState([])
  const [claimedCards, setClaimedCards] = useState([])
  const [planLimit, setPlanLimit] = useState(3)
  const [userPlan, setUserPlan] = useState('free')
  const [loading, setLoading] = useState(true)
  const [claiming, setClaiming] = useState(null)
  const [authUser, setAuthUser] = useState(null)

  const isGuest = currentUser?.isGuest

  const fetchData = async (userId) => {
    try {
      let currentPlan = 'free'

      if (isGuest) {
        // Guests see only the masked view — last4 + metadata, never full details
        const { data, error } = await supabase.from('masked_cards')
          .select('id, last4, bank, provider, category, plan_tier, created_at')
          .order('created_at', { ascending: false })
        if (error) throw error
        setAvailableCards(data || [])
        setClaimedCards([])
        setUserPlan('free')
        setPlanLimit(3)
        return
      }

      // Plan + limit from the DB via RPC
      const { data: planRows } = await supabase.rpc('get_my_plan')
      let limit = 3
      if (planRows && planRows.length > 0) {
        currentPlan = planRows[0].plan_id
        limit = planRows[0].card_limit
      }

      // Available cards come back MASKED (last4 only);
      // full details only for cards the user has claimed.
      const [availRes, claimedRes] = await Promise.all([
        supabase.rpc('get_available_cards', { p_plan: currentPlan }),
        supabase.rpc('get_claimed_card_details'),
      ])
      if (availRes.error) console.error('Available error:', availRes.error)
      if (claimedRes.error) console.error('Claimed error:', claimedRes.error)

      setUserPlan(currentPlan)
      setPlanLimit(limit)
      setClaimedCards(claimedRes.data || [])
      setAvailableCards(availRes.data || [])
    } catch (err) {
      console.error('Fetch error:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isGuest) { fetchData(null); return }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) { setAuthUser(session.user); fetchData(session.user.id) }
      else { setLoading(false) }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) { setAuthUser(session.user); fetchData(session.user.id) }
      else { setAuthUser(null); setLoading(false) }
    })

    return () => subscription.unsubscribe()
  }, [isGuest])

  useEffect(() => {
    if (!authUser || isGuest) return
    const channel = supabase.channel('cards-realtime')
      // Note: the 'cards' table is intentionally NOT subscribed — it is no longer
      // directly readable (RLS), so its realtime events would never be delivered.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'plans' }, () => fetchData(authUser.id))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_plans' }, () => fetchData(authUser.id))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_cards' }, () => fetchData(authUser.id))
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [authUser, isGuest])

  const handleClaim = async (card) => {
    if (!authUser) { showToast('Please sign in to claim cards', 'error'); return }
    if (claimedCards.length >= planLimit) { showToast(`You've claimed your maximum of ${planLimit} cards`, 'error'); return }

    setClaiming(card.id)
    try {
      // Server-side validated claim (active card + matching tier + plan limit)
      const { data: ok, error } = await supabase.rpc('claim_card', { p_card_id: card.id })
      if (error) throw error
      if (!ok) {
        showToast('Limit reached or card is no longer available', 'error')
        fetchData(authUser.id)
        return
      }
      showToast(`${card.bank} / ${card.provider} claimed!`, 'success')
      fetchData(authUser.id)
    } catch (err) {
      showToast('Failed to claim: ' + err.message, 'error')
    } finally {
      setClaiming(null)
    }
  }

  const remainingClaims = Math.max(0, planLimit - claimedCards.length)
  const allCards = [...availableCards, ...claimedCards]
  const categories = ['all', ...new Set(allCards.map((c) => c.category || 'Other'))]

  const filteredAvailable = availableCards.filter((card) => {
    const matchesSearch = !search ||
      (card.last4 || '').includes(search) ||
      card.name.toLowerCase().includes(search.toLowerCase()) ||
      card.bank.toLowerCase().includes(search.toLowerCase()) ||
      (card.category || '').toLowerCase().includes(search.toLowerCase())
    const matchesCategory = categoryFilter === 'all' || (card.category || 'Other') === categoryFilter
    return matchesSearch && matchesCategory
  })

  const filteredClaimed = claimedCards.filter((card) => {
    const matchesSearch = !search ||
      card.card_number.includes(search) ||
      card.name.toLowerCase().includes(search.toLowerCase()) ||
      card.bank.toLowerCase().includes(search.toLowerCase()) ||
      (card.category || '').toLowerCase().includes(search.toLowerCase())
    const matchesCategory = categoryFilter === 'all' || (card.category || 'Other') === categoryFilter
    return matchesSearch && matchesCategory
  })

  if (loading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="container-mobile text-center">
          <svg className="animate-spin h-8 w-8 text-accent mx-auto" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <p className="mt-3 text-sm text-ink-muted">Loading cards…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-surface">
      <header className="border-b border-line sticky top-0 bg-surface/95 backdrop-blur-sm z-30">
        <div className="container-mobile flex items-center justify-between py-3">
          <Link to="/"><Logo size="sm" /></Link>
          <div className="flex items-center gap-2">
            {isGuest && <span className="text-xs font-medium text-ink-faint bg-surface-alt border border-line rounded-full px-3 py-1.5">Guest</span>}
            <span className="text-xs font-medium text-ink-muted bg-surface-alt border border-line rounded-full px-3 py-1.5 capitalize">{userPlan}</span>
            <Link to="/pricing" className="btn-ghost !py-1.5 text-sm">Upgrade</Link>
            <Link to="/settings" className="h-8 w-8 flex items-center justify-center rounded-full text-ink-muted hover:text-ink hover:bg-surface-alt transition-colors" aria-label="Settings">
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden="true">
                <path fillRule="evenodd" d="M7.84 1.804A1 1 0 018.82 1h2.36a1 1 0 01.98.804l.331 1.652a6.993 6.993 0 011.929 1.115l1.598-.54a1 1 0 011.186.447l1.18 2.044a1 1 0 01-.205 1.251l-1.267 1.113a7.047 7.047 0 010 2.228l1.267 1.113a1 1 0 01.206 1.25l-1.18 2.045a1 1 0 01-1.187.447l-1.598-.54a6.993 6.993 0 01-1.929 1.115l-.33 1.652a1 1 0 01-.98.804H8.82a1 1 0 01-.98-.804l-.331-1.652a6.993 6.993 0 01-1.929-1.115l-1.598.54a1 1 0 01-1.186-.447l-1.18-2.044a1 1 0 01.205-1.251l1.267-1.114a7.05 7.05 0 010-2.227L1.821 7.773a1 1 0 01-.206-1.25l1.18-2.045a1 1 0 011.187-.447l1.598.54A6.993 6.993 0 017.51 3.456l.33-1.652zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
              </svg>
            </Link>
          </div>
        </div>
      </header>

      <main className="container-mobile py-5 pb-28">
        <div className="mb-5">
          <h1 className="text-xl font-semibold tracking-tight text-ink">Your Cards</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {claimedCards.length} of {planLimit} cards claimed on your {userPlan} plan.
            {remainingClaims > 0 && ` ${remainingClaims} remaining.`}
          </p>
        </div>

        <div className="mb-4 space-y-3">
          <div className="relative">
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-ink-faint absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true">
              <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
            </svg>
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} className="input !pl-9" placeholder="Search cards, banks, categories…" />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4">
            {categories.map((c) => (
              <button key={c} type="button" onClick={() => setCategoryFilter(c)}
                className={`shrink-0 px-3.5 py-1.5 text-xs font-medium rounded-full border transition-colors cursor-pointer capitalize ${categoryFilter === c ? 'bg-accent text-white border-accent' : 'bg-surface text-ink-muted border-line hover:border-accent'}`}>
                {c}
              </button>
            ))}
          </div>
        </div>

        {filteredClaimed.length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-ink mb-3">Your Claimed Cards</h2>
            <div className="space-y-3">
              {filteredClaimed.map((card) => <CardItem key={card.id} card={card} isUnlocked={true} />)}
            </div>
          </div>
        )}

        <div>
          <h2 className="text-sm font-semibold text-ink mb-3">
            Available in {userPlan} Pool
            {filteredAvailable.length > 0 && <span className="text-xs font-normal text-ink-faint ml-1">({filteredAvailable.length} available)</span>}
          </h2>

          {filteredAvailable.length === 0 ? (
            <div className="card p-8 text-center">
              <div className="mx-auto h-12 w-12 rounded-full bg-surface-alt flex items-center justify-center mb-3">
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-6 w-6 text-ink-faint" aria-hidden="true">
                  <path fillRule="evenodd" d="M1 10a9 9 0 1118 0 9 9 0 01-18 0zm8-5a1 1 0 011-1h1a1 1 0 010 2h-1a1 1 0 01-1-1zm0 4a1 1 0 011-1h1a1 1 0 010 2h-1a1 1 0 01-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <p className="text-sm font-medium text-ink">Cards Exhausted</p>
              <p className="text-xs text-ink-faint mt-1">No more cards available in the {userPlan} pool. Check back later or upgrade your plan.</p>
              <Link to="/pricing" className="btn-primary mt-4 inline-block !py-2.5 text-sm">Upgrade Plan</Link>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredAvailable.map((card) => (
                <div key={card.id} className="card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-[15px] font-semibold text-ink">{card.bank || 'Bank'}</p>
                        {card.category && <span className="text-[10px] font-medium text-accent bg-accent-soft rounded-full px-2 py-0.5">{card.category}</span>}
                      </div>
                      <p className="text-xs text-ink-faint mt-0.5">{card.provider || 'Provider'}</p>
                      <p className="font-mono text-sm text-ink mt-2 tracking-wider">
                        {card.last4 ? '•••• •••• •••• ' + card.last4 : '•••• •••• •••• ••••'}
                      </p>
                    </div>
                    <div className="shrink-0">
                      <button onClick={() => handleClaim(card)} disabled={claiming === card.id || remainingClaims <= 0} className="btn-primary !py-2.5 !px-5 text-sm">
                        {claiming === card.id ? (
                          <span className="inline-flex items-center gap-2">
                            <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            Claiming…
                          </span>
                        ) : remainingClaims <= 0 ? 'Limit Reached' : 'Claim'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {claimedCards.length < planLimit && filteredAvailable.length > 0 && (
        <div className="bottom-bar">
          <div className="container-mobile py-3">
            <p className="text-center text-sm text-ink-muted">
              You can claim <span className="font-semibold text-accent">{remainingClaims}</span> more card{remainingClaims > 1 ? 's' : ''}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
