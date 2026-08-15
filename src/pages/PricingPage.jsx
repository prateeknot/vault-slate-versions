import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { V2_PACKS, UPI_QR_IMAGE, UPGRADE_COOLDOWN_HOURS } from '../constants'
import { BottomNav } from '../components/nav'

// Pricing — Top-Up Balance Packs with UPI QR payment flow

export function PricingPage({ currentUser, onNavigate, settings }) {
  const [stock, setStock] = useState({})
  const [buying, setBuying] = useState('')
  const [payModal, setPayModal] = useState(null)
  const [myRequests, setMyRequests] = useState([])
  const [notice, setNotice] = useState(null)

  const refreshRequests = useCallback(async () => {
    if (!currentUser) return
    const { data } = await supabase.rpc('my_upgrade_requests')
    if (data) setMyRequests(data)
  }, [currentUser])

  useEffect(() => {
    supabase.rpc('tier_stock').then(({ data }) => {
      const m = {}
      ;(data || []).forEach((i) => { m[i.tier] = i.available || 0 })
      setStock(m)
    }).catch(() => { })
  }, [])

  useEffect(() => { refreshRequests() }, [refreshRequests])

  // Realtime: admin activate/decline reaches this page within seconds
  useEffect(() => {
    if (!currentUser) return
    const ch = supabase.channel('pricing-upgrades')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'upgrade_requests' }, () => refreshRequests())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [currentUser, refreshRequests])

  const pendingReq = myRequests.find((r) => r.status === 'pending')
  const lastRejected = myRequests.find((r) => r.status === 'rejected')
  const cooldownUntil = lastRejected?.reviewed_at
    ? new Date(lastRejected.reviewed_at).getTime() + UPGRADE_COOLDOWN_HOURS * 3600 * 1000
    : 0
  const cooldownActive = cooldownUntil > Date.now()

  // v9: opening the QR modal does NOT create the request yet. The user reviews
  // the QR + instructions and then presses Confirm (or Cancel) — the request is
  // only created on Confirm, so nobody gets locked accidentally.
  const startUpgrade = (pack) => {
    if (!currentUser) {
      setNotice({ type: 'error', msg: 'Please log in first to upgrade your plan.' })
      return
    }
    setNotice(null)
    setPayModal({ pack, stage: 'confirm' })
  }

  const confirmUpgrade = async () => {
    const pack = payModal?.pack
    if (!pack) return
    setBuying(pack.id)
    setNotice(null)
    const { data, error } = await supabase.rpc('create_upgrade_request', { p_pack_id: pack.id })
    setBuying('')
    if (error) { setPayModal(null); setNotice({ type: 'error', msg: error.message }); return }
    if (!data?.ok) {
      setPayModal(null)
      if (data?.error === 'PENDING_EXISTS') {
        setNotice({ type: 'info', msg: 'You already have a payment under review — it will be activated once the admin verifies it.' })
      } else if (data?.error === 'COOLDOWN_ACTIVE') {
        setNotice({ type: 'error', msg: 'Your previous request was declined. You can submit a new upgrade request after 24 hours.' })
      } else {
        setNotice({ type: 'error', msg: data?.error || 'Request failed. Please try again.' })
      }
      return
    }
    await refreshRequests()
    setPayModal({ pack, req: data.request, stage: 'sent' })
  }

  const recheckPayment = async () => {
    const { data } = await supabase.rpc('my_upgrade_requests')
    if (data) setMyRequests(data)
    const req = (data || []).find((r) => r.id === payModal.req.id)
    if (req?.status === 'approved') {
      setPayModal(null)
      setNotice({ type: 'success', msg: 'Payment verified — your plan is now active! 🎉' })
    } else if (req?.status === 'rejected') {
      setPayModal(null)
      setNotice({ type: 'error', msg: 'Your payment request was declined. You can try again after 24 hours.' })
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {settings?.announcement && (
        <div className="bg-brand text-primary-foreground text-center text-[12px] font-semibold px-4 py-2">{settings.announcement}</div>
      )}
      <header className="app-header sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-md">
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

        {pendingReq && (
          <div className="mb-4 rounded-2xl bg-amber-50 border border-amber-200 p-3.5 flex items-start gap-3">
            <span className="text-amber-600 text-[16px]">🔒</span>
            <div>
              <p className="text-[12px] font-bold text-amber-800">Payment Under Review</p>
              <p className="text-[11px] text-amber-700 mt-0.5 leading-relaxed">Your {pendingReq.pack_name} request (₹{Number(pendingReq.amount_inr).toFixed(2)}) is being verified. Your Cards page is locked until the admin activates it.</p>
            </div>
          </div>
        )}

        {notice && (
          <div className={`mb-4 rounded-xl px-3.5 py-2.5 text-[12px] font-semibold leading-relaxed ${notice.type === 'error' ? 'bg-red-50 text-red-600 border border-red-200' : notice.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-sky-50 text-sky-700 border border-sky-200'}`}>
            {notice.msg}
          </div>
        )}

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
                <p className="text-[18px] font-black text-foreground">₹{p.price_inr}</p>
                {stock[p.id] === 0 ? (
                  <span className="block w-full text-center px-3.5 py-1.5 rounded-xl bg-red-50 text-red-600 font-bold text-[12px] border border-red-200">Sold out</span>
                ) : pendingReq ? (
                  <span className="block w-full text-center px-3.5 py-1.5 rounded-xl bg-amber-50 text-amber-600 font-bold text-[12px] border border-amber-200">⏳ Under Review</span>
                ) : cooldownActive ? (
                  <span className="block w-full text-center px-3.5 py-1.5 rounded-xl bg-surface text-muted-foreground font-bold text-[12px] border border-border" title="You can submit a new request after 24 hours">Wait 24h</span>
                ) : (
                  <button
                    onClick={() => startUpgrade(p)}
                    disabled={buying === p.id}
                    className="px-3.5 py-1.5 rounded-xl bg-primary text-primary-foreground font-bold text-[12px] hover:opacity-90 transition-opacity shadow-sm w-full flex items-center justify-center gap-1 disabled:opacity-50"
                  >
                    {buying === p.id ? 'Please wait…' : 'Pay via UPI QR'}
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
          <p className="text-center text-[10px] text-muted-foreground mt-2">Lower ₹/$ = better value. Activation is instant once payment is verified.</p>
        </section>
      </main>

      {payModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4" onClick={() => setPayModal(null)}>
          <div className="bg-white rounded-3xl w-full max-w-sm p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-black text-[17px] text-foreground">Pay via UPI QR</h3>
                <p className="text-[12px] text-muted-foreground mt-0.5">{payModal.pack.name} pack · <span className="font-bold text-foreground">₹{payModal.pack.price_inr}</span></p>
              </div>
              <button onClick={() => setPayModal(null)} className="w-8 h-8 rounded-full bg-surface flex items-center justify-center text-muted-foreground" aria-label="Close">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="mt-4 rounded-2xl border-2 border-dashed border-brand/40 bg-brand-dim/40 flex flex-col items-center justify-center py-7">
              {UPI_QR_IMAGE ? (
                <img src={UPI_QR_IMAGE} alt="UPI QR code" className="w-44 h-44 object-contain rounded-xl" />
              ) : (
                <>
                  <div className="w-20 h-20 rounded-2xl bg-white border border-border flex items-center justify-center mb-3">
                    <svg className="w-10 h-10 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5zM13.5 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5z" /></svg>
                  </div>
                  <p className="text-[12px] font-bold text-brand">UPI QR</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">QR code image added soon</p>
                </>
              )}
            </div>

            <ol className="mt-4 space-y-2 text-[12px] text-muted-foreground leading-relaxed">
              <li className="flex gap-2"><span className="w-5 h-5 shrink-0 rounded-full bg-brand text-white text-[10px] font-bold flex items-center justify-center">1</span>Scan the QR with PhonePe, GPay, Paytm or any UPI app and pay exactly <span className="font-bold text-foreground">₹{payModal.pack.price_inr}</span>.</li>
              <li className="flex gap-2"><span className="w-5 h-5 shrink-0 rounded-full bg-brand text-white text-[10px] font-bold flex items-center justify-center">2</span>In the <span className="font-bold text-foreground">payment note / message</span>, write your email: <span className="font-mono font-bold text-brand bg-brand-dim px-1.5 py-0.5 rounded-md break-all">{currentUser?.email}</span></li>
              <li className="flex gap-2"><span className="w-5 h-5 shrink-0 rounded-full bg-brand text-white text-[10px] font-bold flex items-center justify-center">3</span>Your request is now <span className="font-bold text-amber-600">Under Review</span>. The admin verifies the payment and your plan activates automatically — cards unlock instantly.</li>
            </ol>

            {payModal.stage === 'sent' ? (
              <>
                <div className="mt-4 rounded-xl bg-amber-50 border border-amber-200 px-3.5 py-2.5 flex items-center gap-2">
                  <span className="text-amber-600">⏳</span>
                  <p className="text-[11px] font-semibold text-amber-800">Payment Under Review — cards unlock once verified</p>
                </div>

                <button onClick={recheckPayment} className="mt-3 w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-[13px] hover:opacity-90 transition-opacity">
                  Re-check Status
                </button>
                <p className="text-center text-[10px] text-muted-foreground mt-2">Your request is matched by the email written in the UPI note.</p>
              </>
            ) : (
              <>
                <div className="mt-5 flex gap-2">
                  <button
                    onClick={() => setPayModal(null)}
                    disabled={buying === payModal.pack.id}
                    className="flex-1 py-3 rounded-xl bg-white border border-border text-foreground font-bold text-[13px] hover:border-brand/40 transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmUpgrade}
                    disabled={buying === payModal.pack.id}
                    className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-bold text-[13px] hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    {buying === payModal.pack.id ? 'Sending…' : 'Confirm & Send Request'}
                  </button>
                </div>
                <p className="text-center text-[10px] text-muted-foreground mt-2">Nothing is sent until you press Confirm. Don't forget to write your email in the payment note.</p>
              </>
            )}
          </div>
        </div>
      )}

      <BottomNav view="pricing" isLoggedIn={!!currentUser} onNavigate={onNavigate} />
    </div>
  )
}

