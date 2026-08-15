import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Toast } from '../components/ui'
import { BottomNav } from '../components/nav'

// FakeID — random identity generator (collection model)

export function FakeIDPage({ onNavigate, currentUser }) {
  const [myIds, setMyIds] = useState([])
  const [generating, setGenerating] = useState(false)
  const [toast, setToast] = useState(null)

  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 2500)
  }, [])

  // parse a raw ID block into sections of { title, fields: [k,v] }
  // Handles the box-drawing / emoji format admins paste (━━━ 👤 PERSONAL DETAILS ━━━)
  const parseId = useCallback((content) => {
    const sections = []
    let current = null
    const emojiStrip = (s) => s.replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE0F}\u{1F1E6}-\u{1F1FF}\u{200D}]/gu, '')
    for (const raw of String(content || '').split('\n')) {
      const line = raw.replace(/\r/g, '')
      const stripped = line.replace(/[━─┉─│├└]+/g, ' ')
      const clean = emojiStrip(stripped).replace(/\s+/g, ' ').trim()
      // section header like "━━━ 👤 PERSONAL DETAILS ━━━" or "PERSONAL DETAILS"
      const secMatch = clean.match(/^(?:[A-Z0-9 &()/.-]{2,}?)\s*(?:DETAILS|BANK|IBAN|CREDIT CARD|FINANCIAL|ADDRESS|GENERAL|PERSONAL)/i)
      if (secMatch && clean.length < 60 && !clean.includes(':')) {
        current = { title: secMatch[0].trim(), fields: [] }
        sections.push(current)
        continue
      }
      if (/^(PERSONAL DETAILS|FINANCIAL DETAILS|BANK|IBAN|CREDIT CARD|ADDRESS|GENERAL|DETAILS)$/i.test(clean)) {
        current = { title: clean, fields: [] }
        sections.push(current)
        continue
      }
      const kv = line.match(/^\s*[├└│]?\s*([^:]+?)\s*:\s*(.*)$/)
      if (kv && kv[1].trim() && kv[2].trim()) {
        const key = emojiStrip(kv[1].trim()).replace(/[├└│]\s*$/, '').trim()
        if (!current) { current = { title: 'Details', fields: [] }; sections.push(current) }
        current.fields.push([key, kv[2].trim()])
      } else if (current && /^[A-Z]{2}\d{2}[A-Z0-9 ]{11,30}$/i.test(line.trim())) {
        // standalone IBAN line (the sample format has it without a key)
        current.fields.push(['IBAN', line.trim().replace(/\s+/g, ' ')])
      }
    }
    return sections
  }, [])

  const copyText = async (text) => {
    try {
      await navigator.clipboard.writeText(text)
      showToast('Copied!')
    } catch { showToast('Copy failed', 'error') }
  }

  const fetchMine = useCallback(async () => {
    try {
      const { data } = await supabase.rpc('fake_id_mine')
      if (data?.ok && Array.isArray(data.ids)) setMyIds(data.ids)
    } catch { }
  }, [])

  useEffect(() => { fetchMine() }, [fetchMine])

  const generate = async () => {
    if (generating) return
    setGenerating(true)
    try {
      // ~1s "random pick" feel, as requested
      const [result] = await Promise.all([
        supabase.rpc('fake_id_generate'),
        new Promise((r) => setTimeout(r, 1000)),
      ])
      const { data, error } = result
      if (error) throw error
      if (!data?.ok) {
        showToast(data?.error === 'NO_FAKE_IDS_AVAILABLE' ? 'No fake IDs available right now — try again later.' : 'Generation failed', 'error')
        return
      }
      setMyIds((prev) => {
        const existing = prev.some((x) => x.id === data.id)
        return existing ? prev : [{ id: data.id, content: data.content, name: data.name, iban: data.iban, email: data.email, country: data.country, assigned_at: new Date().toISOString() }, ...prev]
      })
      showToast('New fake ID generated 🎉')
    } catch (err) {
      showToast('Could not generate: ' + (err.message || 'unknown'), 'error')
    } finally {
      setGenerating(false)
    }
  }

  const deleteId = async (id) => {
    try {
      const { data, error } = await supabase.rpc('fake_id_delete', { p_id: id })
      if (error) throw error
      if (!data?.ok) { showToast(data?.error === 'NOT_YOURS' ? 'This ID is not yours anymore' : 'Could not delete', 'error'); return }
      setMyIds((prev) => prev.filter((x) => x.id !== id))
      showToast('ID removed from your collection', 'info')
    } catch (err) { showToast('Could not delete: ' + (err.message || 'unknown'), 'error') }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="app-header sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-md">
        <div className="max-w-md mx-auto px-4 flex items-center h-14">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-primary flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>
            </div>
            <div>
              <h1 className="font-bold text-foreground text-[15px] leading-tight">Fake ID</h1>
              <p className="text-[10px] text-muted-foreground leading-tight">Instant identity generator</p>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-md mx-auto w-full px-4 py-5 pb-28">
        <div className="rounded-2xl border border-brand/15 bg-brand-dim/40 px-4 py-3 flex items-start gap-3 mb-4">
          <span className="text-[16px]">🪪</span>
          <div>
            <p className="text-[12px] font-bold text-brand">Generate random fake identities</p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">Tap Generate to instantly receive a random fake ID (personal details, bank, IBAN, card) from the pool. Keep generating to build your own collection — every ID is different.</p>
          </div>
        </div>

        <button
          onClick={generate}
          disabled={generating}
          className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground font-black text-[14px] hover:opacity-90 active:scale-[0.98] transition-all shadow-md disabled:opacity-50 flex items-center justify-center gap-2 mb-6"
        >
          {generating
            ? <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Picking a random ID…</>
            : <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12a7.5 7.5 0 0015 0m-7.5-7.5v7.5m0 0l3-3m-3 3l-3-3" /></svg>Generate Fake ID</>}
        </button>

        {myIds.length === 0 && !generating && (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="w-12 h-12 rounded-2xl bg-surface border border-border flex items-center justify-center mb-3">
              <svg className="w-6 h-6 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>
            </div>
            <p className="text-muted-foreground text-[14px] max-w-[260px]">No fake IDs in your collection yet. Press Generate above — a random identity will appear in about a second.</p>
          </div>
        )}

        {myIds.length > 0 && (
          <>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[12px] font-bold text-foreground">Your Collection</p>
              <span className="text-[11px] text-muted-foreground bg-surface border border-border px-2 py-0.5 rounded-full">{myIds.length} ID{myIds.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="space-y-4">
              {myIds.map((id, idx) => {
                const sections = parseId(id.content)
                return (
                  <div key={id.id} className="bg-white border border-border rounded-2xl overflow-hidden shadow-soft">
                    <div className="bg-slate-900 px-4 py-3 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
                        <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                        <span className="ml-2 text-[10px] font-bold text-slate-400 tracking-widest uppercase truncate">Identity #{myIds.length - idx} · {id.name || 'Fake ID'}</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button onClick={() => copyText(id.content)} className="text-[10px] font-semibold text-slate-200 bg-white/10 border border-white/15 px-2 py-1 rounded-lg hover:bg-white/20 transition-colors">Copy All</button>
                        <button onClick={() => deleteId(id.id)} className="text-[10px] font-bold text-red-300 bg-red-500/20 border border-red-400/30 px-2 py-1 rounded-lg hover:bg-red-500/30 transition-colors" aria-label="Delete this ID">Delete</button>
                      </div>
                    </div>
                    <div className="p-4 space-y-4">
                      {sections.map((sec, si) => (
                        <div key={si}>
                          <p className="text-[10px] uppercase tracking-widest text-brand font-black mb-2 pb-1 border-b border-dashed border-brand/30">{sec.title}</p>
                          <div className="space-y-1">
                            {sec.fields.map(([k, v], fi) => (
                              <div key={fi} className="flex items-baseline justify-between gap-3">
                                <span className="text-[11px] text-muted-foreground font-semibold shrink-0">{k}</span>
                                <span className="text-[12px] text-foreground font-bold text-right break-all">{v}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                      {sections.length === 0 && (
                        <pre className="whitespace-pre-wrap text-[11px] font-mono text-slate-800 leading-relaxed">{id.content}</pre>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
            <p className="text-center text-[10px] text-muted-foreground mt-4">Your IDs are saved to your account. Delete any ID anytime — it returns to the pool for others.</p>
          </>
        )}
      </main>

      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      <BottomNav view="fakeid" isLoggedIn={!!currentUser} onNavigate={onNavigate} />
    </div>
  )
}
