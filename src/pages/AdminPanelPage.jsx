import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import Logo from '../components/Logo'
import { useToast } from '../components/Toast'
import { useApp } from '../context/AppContext'
import { supabase } from '../lib/supabase'

const EMPTY_CARD = {
  card_number: '', name: '', expiry: '', cvv: '', bank: '', provider: '', category: 'Other', plan_tier: 'free', is_active: true,
}
const CATEGORIES = ['Netflix', 'Amazon', 'Spotify', 'YouTube', 'Other']
const PLAN_TIERS = ['free', 'pro', 'max']

export default function AdminPanelPage() {
  const [code, setCode] = useState('')
  const [isAuthed, setIsAuthed] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { showToast } = useToast()
  const { adminCodes: mockCodes, activityLog } = useApp()

  const [cards, setCards] = useState([])
  const [planLimits, setPlanLimits] = useState({})
  const [adminCodes, setAdminCodes] = useState([])
  const [totalUsers, setTotalUsers] = useState(0)
  const [dataLoading, setDataLoading] = useState(true)

  const [activeTab, setActiveTab] = useState('cards')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [showModal, setShowModal] = useState(false)
  const [editingCard, setEditingCard] = useState(null)
  const [formData, setFormData] = useState(EMPTY_CARD)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [showCodeModal, setShowCodeModal] = useState(false)
  const [newCode, setNewCode] = useState('')
  const [newCodeLabel, setNewCodeLabel] = useState('')

  const fetchAllData = async () => {
    try {
      const [cardsRes, plansRes, codesRes, usersRes] = await Promise.all([
        supabase.rpc('admin_list_cards', { p_code: code }),
        supabase.rpc('admin_list_plans', { p_code: code }),
        supabase.rpc('admin_list_codes', { p_code: code }),
        supabase.rpc('admin_count_users', { p_code: code }),
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
  }

  useEffect(() => { if (isAuthed) fetchAllData() }, [isAuthed])

  const handleCodeSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!/^\d{6}$/.test(code)) { setError('Please enter a valid 6-digit code.'); return }
    setLoading(true)
    try {
      let found = null
      const { data, error } = await supabase.rpc('admin_verify_code', { p_code: code })
      if (!error && data && data.length > 0 && data[0].is_active) {
        found = data[0]
      }
      if (!found) { found = mockCodes.find((m) => m.code === code && m.is_active) }
      if (!found) { setError('Invalid or inactive code.'); setLoading(false); return }
      setIsAuthed(true)
      showToast(`Welcome, ${found.label || 'Admin'}`, 'success')
    } catch (err) {
      const found = mockCodes.find((m) => m.code === code && m.is_active)
      if (found) { setIsAuthed(true); showToast(`Welcome, ${found.label}`, 'success') }
      else { setError('Invalid or inactive code.') }
    } finally {
      setLoading(false)
    }
  }


  const handleLogout = () => { setIsAuthed(false); setCode(''); showToast('Logged out', 'info') }

  const openAddModal = () => { setEditingCard(null); setFormData(EMPTY_CARD); setShowModal(true) }
  const openEditModal = (card) => {
    setEditingCard(card)
    setFormData({ card_number: card.card_number, name: card.name, expiry: card.expiry, cvv: card.cvv, bank: card.bank, provider: card.provider, category: card.category || 'Other', plan_tier: card.plan_tier || 'free', is_active: card.is_active })
    setShowModal(true)
  }

  const handleFormChange = (e) => {
    const { name, value, type, checked } = e.target
    setFormData((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }))
  }

  const handleSaveCard = async (e) => {
    e.preventDefault()
    if (!formData.card_number || !formData.name || !formData.expiry || !formData.cvv || !formData.bank || !formData.provider) { showToast('Please fill in all fields', 'error'); return }
    if (!/^\d{13,19}$/.test(formData.card_number.replace(/\s/g, ''))) { showToast('Invalid card number', 'error'); return }
    if (!/^\d{3,4}$/.test(formData.cvv)) { showToast('Invalid CVV', 'error'); return }
    try {
      const cardArgs = {
        p_code: code,
        p_number: formData.card_number, p_name: formData.name, p_expiry: formData.expiry,
        p_cvv: formData.cvv, p_bank: formData.bank, p_provider: formData.provider,
        p_category: formData.category, p_plan: formData.plan_tier, p_active: formData.is_active,
      }
      if (editingCard) {
        const { error } = await supabase.rpc('admin_update_card', { ...cardArgs, p_id: editingCard.id })
        if (error) throw error
        showToast('Card updated — users will see it on next load', 'success')
      } else {
        const { error } = await supabase.rpc('admin_add_card', cardArgs)
        if (error) throw error
        showToast('Card added — now visible to all users!', 'success')
      }
      setShowModal(false); fetchAllData()
    } catch (err) { showToast('Failed to save card: ' + err.message, 'error') }
  }

  const handleDeleteCard = async () => {
    if (!deleteTarget) return
    try {
      const { error } = await supabase.rpc('admin_delete_card', { p_code: code, p_id: deleteTarget.id })
      if (error) throw error
      showToast('Card deleted', 'success'); setDeleteTarget(null); fetchAllData()
    } catch (err) { showToast('Failed to delete: ' + err.message, 'error') }
  }

  const toggleCardActive = async (id) => {
    const card = cards.find((c) => c.id === id)
    try {
      const { error } = await supabase.rpc('admin_toggle_card', { p_code: code, p_id: id })
      if (error) throw error
      showToast(`${card.name} ${card.is_active ? 'deactivated' : 'activated'}`, 'info'); fetchAllData()
    } catch (err) { showToast('Failed: ' + err.message, 'error') }
  }

  const updatePlanLimit = (plan, value) => { setPlanLimits({ ...planLimits, [plan]: Math.max(0, parseInt(value) || 0) }) }

  const savePlanLimits = async () => {
    try {
      for (const [plan, limit] of Object.entries(planLimits)) {
        const { error } = await supabase.rpc('admin_update_plan', { p_code: code, p_plan: plan, p_limit: limit })
        if (error) throw error
      }
      showToast('Plan limits saved — users see new limits immediately', 'success')
    } catch (err) { showToast('Failed to save: ' + err.message, 'error') }
  }

  const handleAddCode = async (e) => {
    e.preventDefault()
    if (!/^\d{6}$/.test(newCode)) { showToast('Code must be 6 digits', 'error'); return }
    if (!newCodeLabel) { showToast('Please add a label', 'error'); return }
    try {
      const { error } = await supabase.rpc('admin_add_code', { p_code: code, p_new_code: newCode, p_label: newCodeLabel })
      if (error) throw error
      showToast('Admin code created', 'success'); setNewCode(''); setNewCodeLabel(''); setShowCodeModal(false); fetchAllData()
    } catch (err) { showToast('Failed: ' + err.message, 'error') }
  }

  const toggleAdminCodeDb = async (c) => {
    try {
      const { error } = await supabase.rpc('admin_toggle_code', { p_code: code, p_id: c.id })
      if (error) throw error
      showToast('Code toggled', 'info'); fetchAllData()
    } catch (err) { showToast('Failed: ' + err.message, 'error') }
  }

  const deleteAdminCodeDb = async (c) => {
    try {
      const { error } = await supabase.rpc('admin_delete_code', { p_code: code, p_id: c.id })
      if (error) throw error
      showToast('Code deleted', 'success'); fetchAllData()
    } catch (err) { showToast('Failed: ' + err.message, 'error') }
  }

  const filteredCards = cards.filter((card) => {
    const matchesSearch = !search || card.card_number.includes(search) || card.name.toLowerCase().includes(search.toLowerCase()) || card.bank.toLowerCase().includes(search.toLowerCase()) || card.provider.toLowerCase().includes(search.toLowerCase()) || (card.category || '').toLowerCase().includes(search.toLowerCase())
    const matchesFilter = filter === 'all' || (filter === 'active' ? card.is_active : !card.is_active)
    return matchesSearch && matchesFilter
  })

  const stats = {
    totalCards: cards.length,
    activeCards: cards.filter((c) => c.is_active).length,
    inactiveCards: cards.filter((c) => !c.is_active).length,
    totalUsers,
    activeUsers: 0,
    activeCodes: adminCodes.filter((c) => c.is_active).length,
  }

  if (!isAuthed) {
    return (
      <div className="min-h-screen bg-surface flex flex-col">
        <header className="border-b border-line">
          <div className="container-mobile flex items-center justify-between py-3.5">
            <Link to="/"><Logo size="sm" /></Link>
            <Link to="/" className="btn-ghost !py-2 text-sm">Back</Link>
          </div>
        </header>
        <main className="flex-1 container-mobile py-10">
          <div className="text-center mb-8">
            <div className="mx-auto h-14 w-14 rounded-card bg-accent-soft flex items-center justify-center mb-4">
              <svg viewBox="0 0 24 24" fill="none" className="h-7 w-7 text-accent" aria-hidden="true">
                <path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-ink">Admin Access</h1>
            <p className="mt-1.5 text-sm text-ink-muted">Enter your 6-digit access code to continue.</p>
          </div>
          <form onSubmit={handleCodeSubmit} className="space-y-4">
            <div>
              <label htmlFor="admin-code" className="label">Access Code</label>
              <input id="admin-code" type="password" inputMode="numeric" pattern="[0-9]*" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className="input !py-3.5 text-center font-mono text-xl tracking-[0.5em]" placeholder="••••••" autoComplete="off" />
            </div>
            {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-card px-3.5 py-2.5">{error}</p>}
            <button type="submit" className="btn-primary w-full !py-3.5 text-base" disabled={loading}>{loading ? 'Verifying…' : 'Enter Admin Panel'}</button>
          </form>
          <p className="mt-6 text-center text-xs text-ink-faint">Demo codes: 123456 (Owner), 654321 (Manager)</p>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-surface">
      <header className="border-b border-line sticky top-0 bg-surface/95 backdrop-blur-sm z-30">
        <div className="container-mobile flex items-center justify-between py-3">
          <Logo size="sm" />
          <button onClick={handleLogout} className="btn-ghost !py-1.5 text-sm">Logout</button>
        </div>
      </header>

      <main className="container-mobile py-5 pb-28">
        <h1 className="text-xl font-semibold tracking-tight text-ink mb-4">Admin Panel</h1>

        <div className="grid grid-cols-4 gap-2 mb-5">
          <div className="card p-3 text-center"><p className="text-lg font-semibold text-ink">{stats.totalCards}</p><p className="text-[10px] text-ink-faint mt-0.5">Cards</p></div>
          <div className="card p-3 text-center"><p className="text-lg font-semibold text-accent">{stats.activeCards}</p><p className="text-[10px] text-ink-faint mt-0.5">Active</p></div>
          <div className="card p-3 text-center"><p className="text-lg font-semibold text-ink">{stats.totalUsers}</p><p className="text-[10px] text-ink-faint mt-0.5">Users</p></div>
          <div className="card p-3 text-center"><p className="text-lg font-semibold text-accent">{stats.activeCodes}</p><p className="text-[10px] text-ink-faint mt-0.5">Codes</p></div>
        </div>

        <div className="flex rounded-card border border-line p-1 mb-5 bg-surface-alt overflow-x-auto">
          {[{ id: 'cards', label: 'Cards' }, { id: 'plans', label: 'Plans' }, { id: 'codes', label: 'Codes' }, { id: 'activity', label: 'Activity' }].map((tab) => (
            <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} className={`flex-1 min-w-[70px] py-2.5 text-sm font-medium rounded-card transition-colors cursor-pointer whitespace-nowrap ${activeTab === tab.id ? 'bg-surface text-ink shadow-card' : 'text-ink-muted hover:text-ink'}`}>{tab.label}</button>
          ))}
        </div>

        {dataLoading && <div className="card p-8 text-center"><p className="text-sm text-ink-muted">Loading from Supabase…</p></div>}

        {activeTab === 'cards' && !dataLoading && (
          <>
            <div className="mb-4 space-y-3">
              <div className="relative">
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-ink-faint absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true"><path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" /></svg>
                <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} className="input !pl-9" placeholder="Search cards, banks, categories…" />
              </div>
              <div className="flex gap-2">
                {['all', 'active', 'inactive'].map((f) => (
                  <button key={f} type="button" onClick={() => setFilter(f)} className={`flex-1 py-2 text-xs font-medium rounded-card border transition-colors cursor-pointer capitalize ${filter === f ? 'bg-accent text-white border-accent' : 'bg-surface text-ink-muted border-line hover:border-accent'}`}>{f}</button>
                ))}
              </div>
            </div>
            <button onClick={openAddModal} className="btn-primary w-full !py-3.5 text-base mb-4">
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden="true"><path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" /></svg>
              Add New Card
            </button>
            {filteredCards.length === 0 ? (
              <div className="card p-8 text-center"><p className="text-sm text-ink-muted">No cards found</p></div>
            ) : (
              <div className="space-y-3">
                {filteredCards.map((card) => (
                  <div key={card.id} className="card p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-mono text-sm text-ink truncate">{card.card_number}</p>
                          {card.category && <span className="text-[10px] font-medium text-accent bg-accent-soft rounded-full px-2 py-0.5 shrink-0">{card.category}</span>}
                        </div>
                        <p className="text-xs text-ink-faint mt-0.5">{card.bank} / {card.provider} · {card.name} · {card.expiry}</p>
                      </div>
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <button onClick={() => toggleCardActive(card.id)} className={`text-xs font-medium px-2.5 py-1.5 rounded-full transition-colors cursor-pointer ${card.is_active ? 'bg-accent-soft text-accent hover:bg-accent-muted/50' : 'bg-surface-alt text-ink-faint hover:text-ink-muted'}`}>{card.is_active ? 'Active' : 'Inactive'}</button>
                        <div className="flex items-center gap-2">
                          <button onClick={() => openEditModal(card)} className="text-xs font-medium text-accent hover:text-accent-hover transition-colors cursor-pointer">Edit</button>
                          <button onClick={() => setDeleteTarget(card)} className="text-xs font-medium text-red-600 hover:text-red-700 transition-colors cursor-pointer">Delete</button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === 'plans' && !dataLoading && (
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-ink mb-1">Plan Card Limits</h2>
            <p className="text-xs text-ink-faint mb-4">Set how many cards each plan can unlock.</p>
            <div className="space-y-4">
              {Object.entries(planLimits).map(([plan, limit]) => (
                <div key={plan} className="flex items-center justify-between gap-3">
                  <div>
                    <label htmlFor={`limit-${plan}`} className="text-sm font-medium text-ink capitalize block">{plan}</label>
                    <p className="text-xs text-ink-faint">{plan === 'free' ? '₹0' : plan === 'pro' ? '₹199' : '₹499'}/month</p>
                  </div>
                  <input id={`limit-${plan}`} type="number" min="0" value={limit} onChange={(e) => updatePlanLimit(plan, e.target.value)} className="input w-24 text-center !py-2.5" />
                </div>
              ))}
            </div>
            <button onClick={savePlanLimits} className="btn-primary w-full !py-3 mt-5">Save Plan Limits</button>
          </div>
        )}

        {activeTab === 'codes' && !dataLoading && (
          <div className="space-y-3">
            <button onClick={() => setShowCodeModal(true)} className="btn-primary w-full !py-3.5 text-base mb-2">
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden="true"><path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" /></svg>
              Create Admin Code
            </button>
            {adminCodes.map((c) => (
              <div key={c.id} className="card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-sm text-ink tracking-widest">{c.code}</p>
                    <p className="text-xs text-ink-faint mt-0.5">{c.label}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <button onClick={() => toggleAdminCodeDb(c)} className={`text-xs font-medium px-2.5 py-1.5 rounded-full transition-colors cursor-pointer ${c.is_active ? 'bg-accent-soft text-accent hover:bg-accent-muted/50' : 'bg-surface-alt text-ink-faint hover:text-ink-muted'}`}>{c.is_active ? 'Active' : 'Inactive'}</button>
                    <button onClick={() => deleteAdminCodeDb(c)} className="text-xs font-medium text-red-600 hover:text-red-700 transition-colors cursor-pointer">Delete</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'activity' && (
          <div className="space-y-2">
            {activityLog.length === 0 ? <div className="card p-8 text-center"><p className="text-sm text-ink-muted">No activity yet</p></div> : activityLog.map((log) => (
              <div key={log.id} className="card p-3.5 flex items-start gap-3">
                <div className="h-8 w-8 rounded-full bg-accent-soft flex items-center justify-center shrink-0">
                  <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-accent" aria-hidden="true"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 000-1.5h-3.25V5z" clipRule="evenodd" /></svg>
                </div>
                <div className="min-w-0"><p className="text-sm text-ink">{log.detail}</p><p className="text-[11px] text-ink-faint mt-0.5">{new Date(log.time).toLocaleString()}</p></div>
              </div>
            ))}
          </div>
        )}
      </main>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-ink/40 animate-[fadeIn_0.2s_ease-out]" onClick={() => setShowModal(false)} />
          <div className="relative w-full max-w-[430px] bg-surface rounded-t-card sm:rounded-card max-h-[90vh] overflow-y-auto animate-[scaleIn_0.2s_ease-out]">
            <div className="sticky top-0 bg-surface border-b border-line px-5 py-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-ink">{editingCard ? 'Edit Card' : 'Add New Card'}</h2>
              <button onClick={() => setShowModal(false)} className="h-8 w-8 flex items-center justify-center rounded-full text-ink-faint hover:text-ink hover:bg-surface-alt transition-colors cursor-pointer" aria-label="Close">
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden="true"><path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" /></svg>
              </button>
            </div>
            <form onSubmit={handleSaveCard} className="p-5 space-y-4">
              <div><label htmlFor="card_number" className="label">Card Number</label><input id="card_number" name="card_number" type="text" inputMode="numeric" value={formData.card_number} onChange={handleFormChange} className="input font-mono" placeholder="4111 1111 1111 1111" /></div>
              <div><label htmlFor="name" className="label">Cardholder Name</label><input id="name" name="name" type="text" value={formData.name} onChange={handleFormChange} className="input" placeholder="JOHN DOE" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label htmlFor="expiry" className="label">Expiry</label><input id="expiry" name="expiry" type="text" value={formData.expiry} onChange={handleFormChange} className="input font-mono" placeholder="12/28" /></div>
                <div><label htmlFor="cvv" className="label">CVV</label><input id="cvv" name="cvv" type="text" inputMode="numeric" maxLength={4} value={formData.cvv} onChange={handleFormChange} className="input font-mono" placeholder="123" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label htmlFor="bank" className="label">Bank</label><input id="bank" name="bank" type="text" value={formData.bank} onChange={handleFormChange} className="input" placeholder="HDFC Bank" /></div>
                <div><label htmlFor="provider" className="label">Provider</label><input id="provider" name="provider" type="text" value={formData.provider} onChange={handleFormChange} className="input" placeholder="Visa" /></div>
              </div>
              <div><label htmlFor="category" className="label">Category</label><select id="category" name="category" value={formData.category} onChange={handleFormChange} className="input cursor-pointer">{CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
              <div><label htmlFor="plan_tier" className="label">Pool (Plan Tier)</label><select id="plan_tier" name="plan_tier" value={formData.plan_tier} onChange={handleFormChange} className="input cursor-pointer">{PLAN_TIERS.map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
              <label className="flex items-center gap-2.5 cursor-pointer select-none"><input type="checkbox" name="is_active" checked={formData.is_active} onChange={handleFormChange} className="h-4 w-4 rounded border-line text-accent focus:ring-accent" /><span className="text-sm font-medium text-ink">Active</span></label>
              <div className="flex gap-3 pt-2"><button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1 !py-3">Cancel</button><button type="submit" className="btn-primary flex-1 !py-3">{editingCard ? 'Save Changes' : 'Add Card'}</button></div>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-ink/40 animate-[fadeIn_0.2s_ease-out]" onClick={() => setDeleteTarget(null)} />
          <div className="relative w-full max-w-[340px] bg-surface rounded-card p-5 animate-[scaleIn_0.2s_ease-out]">
            <div className="mx-auto h-12 w-12 rounded-full bg-red-50 flex items-center justify-center mb-3">
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-6 w-6 text-red-600" aria-hidden="true"><path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" /></svg>
            </div>
            <h3 className="text-base font-semibold text-ink text-center">Delete this card?</h3>
            <p className="text-sm text-ink-muted text-center mt-1">{deleteTarget.name} · {deleteTarget.card_number}</p>
            <p className="text-xs text-ink-faint text-center mt-2">This action cannot be undone.</p>
            <div className="flex gap-3 mt-5"><button onClick={() => setDeleteTarget(null)} className="btn-secondary flex-1 !py-3">Cancel</button><button onClick={handleDeleteCard} className="btn-danger flex-1 !py-3">Delete</button></div>
          </div>
        </div>
      )}

      {showCodeModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-ink/40 animate-[fadeIn_0.2s_ease-out]" onClick={() => setShowCodeModal(false)} />
          <div className="relative w-full max-w-[430px] bg-surface rounded-t-card sm:rounded-card p-5 animate-[scaleIn_0.2s_ease-out]">
            <h2 className="text-base font-semibold text-ink mb-4">Create Admin Code</h2>
            <form onSubmit={handleAddCode} className="space-y-4">
              <div><label htmlFor="new-code" className="label">6-Digit Code</label><input id="new-code" type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6} value={newCode} onChange={(e) => setNewCode(e.target.value.replace(/\D/g, ''))} className="input text-center font-mono text-xl tracking-[0.5em]" placeholder="••••••" /></div>
              <div><label htmlFor="new-code-label" className="label">Label (who is this for?)</label><input id="new-code-label" type="text" value={newCodeLabel} onChange={(e) => setNewCodeLabel(e.target.value)} className="input" placeholder="e.g. Team Member" /></div>
              <div className="flex gap-3 pt-2"><button type="button" onClick={() => setShowCodeModal(false)} className="btn-secondary flex-1 !py-3">Cancel</button><button type="submit" className="btn-primary flex-1 !py-3">Create Code</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}