import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import {
  ADMIN_EMPTY_FORM, ADMIN_ALL_TIERS, ADMIN_RANDOM_NAMES, ADMIN_RANDOM_PROVIDERS,
  TIER_BALANCES, PLAN_LIMITS, APP_THEMES, IBAN_COUNTRY_NAMES,
  CARD_GRADIENTS,
} from '../../constants'
import { getAdminToken, setAdminToken } from '../../utils'
import { ProviderLogo } from '../../components/ui'

// AdminPanel — full admin dashboard (cards, users, payments, packs, fake IDs, settings)

export function AdminPanelPage({ onNavigate, settings, onSettingsChange }) {
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

  const [showCardModal, setShowCardModal] = useState(false)
  const [editingCard, setEditingCard] = useState(null)
  const [formData, setFormData] = useState(ADMIN_EMPTY_FORM)
  const [deleteTarget, setDeleteTarget] = useState(null)

  // v12: Manage Cards has 2 sub-tabs — normal virtual cards + European IBANs
  const [cardsSubTab, setCardsSubTab] = useState('cards')
  const [ibans, setIbans] = useState([])
  const [showIbanModal, setShowIbanModal] = useState(false)
  const [editingIban, setEditingIban] = useState(null)
  const [ibanForm, setIbanForm] = useState({ iban: '', bank_name: '', holder_name: '', country: 'DE', bic: '', label: 'Bank', is_active: true, card_number: '', expiry: '', cvv: '' })
  const [ibanDeleteTarget, setIbanDeleteTarget] = useState(null)

  // v13: Fake IDs pool — admin pastes full identities into one box
  const [fakeIds, setFakeIds] = useState([])
  const [fakeBulkText, setFakeBulkText] = useState('')
  const [fakeBulkPreview, setFakeBulkPreview] = useState([])
  const [fakeDeleteTarget, setFakeDeleteTarget] = useState(null)
  const [fakeSearch, setFakeSearch] = useState('')

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
  const [payments, setPayments] = useState([])
  const [paymentsLoading, setPaymentsLoading] = useState(false)
  const [payFilter, setPayFilter] = useState('all')
  // v13.1: Orders + Payments merged into ONE Payments tab with 2 sub-views
  const [paySubTab, setPaySubTab] = useState('orders')

  const showToast = useCallback((msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 2500) }, [])

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
      const [cardsRes, plansRes, codesRes, statsRes, usersRes, packsRes, ibansRes, fakeRes] = await Promise.all([
        safe('admin_cards', { p_token: token }),
        safe('admin_limits', { p_token: token }),
        safe('admin_codes_list', { p_token: token }),
        safe('admin_stats', { p_token: token }),
        safe('admin_users', { p_token: token }),
        safe('admin_packs', { p_token: token }),
        safe('admin_ibans', { p_token: token }),
        safe('admin_fake_ids', { p_token: token }),
      ])
      const all = [cardsRes, plansRes, codesRes, statsRes, usersRes, packsRes, ibansRes, fakeRes]
      if (all.some((r) => r.error?.message === 'SESSION_INVALID')) { setSessionExpired(true); return }
      if (cardsRes.ok && cardsRes.data) setCards(cardsRes.data.map(normalizeCard))
      if (plansRes.ok && plansRes.data) {
        const limits = {}
        plansRes.data.forEach((p) => { limits[p.plan_type] = p.card_limit })
        setPlanLimits((prev) => ({ ...prev, ...limits }))
      }
      if (codesRes.ok && codesRes.data) setAdminCodes(codesRes.data)
      if (statsRes.ok && statsRes.data) setTotalUsers(statsRes.data.total_users ?? 0)
      if (usersRes.ok && usersRes.data) setUsers(usersRes.data.map((u) => ({
        ...u,
        name: u.display_name,
        // Normalize plan casing (Free/Spark/…/Infinity) so the plan dropdown
        // matches its option values even when the DB stores lowercase.
        plan: u.plan_type ? u.plan_type.charAt(0).toUpperCase() + u.plan_type.slice(1) : 'Free',
      })))
      if (packsRes.ok && packsRes.data) setPacks(packsRes.data)
      if (ibansRes.ok && ibansRes.data) setIbans(ibansRes.data)
      if (fakeRes.ok && fakeRes.data) setFakeIds(fakeRes.data)
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

  const fetchPayments = async () => {
    if (!token) return
    setPaymentsLoading(true)
    try {
      const { data, error } = await supabase.rpc('admin_payments_list', { p_token: token })
      if (error) {
        if (String(error.message).includes('SESSION_INVALID')) setSessionExpired(true)
        return
      }
      setPayments(data || [])
    } catch { } finally { setPaymentsLoading(false) }
  }

  const approvePayment = async (p) => {
    const { data, error } = await supabase.rpc('admin_payment_approve', { p_token: token, p_request_id: p.id })
    if (error) { showToast(error.message, 'error'); return }
    if (!data?.ok) { showToast(data?.error || 'Approve failed', 'error'); return }
    // v10: approve now auto-assigns a card of the purchased tier when available
    showToast(data?.card_assigned
      ? `Plan + card activated for ${p.display_name || p.email} 🎉`
      : `Plan activated for ${p.display_name || p.email} (no card left in pool)`)
    fetchPayments()
    fetchAll()
  }

  const declinePayment = async (p) => {
    const { data, error } = await supabase.rpc('admin_payment_decline', { p_token: token, p_request_id: p.id, p_note: 'declined by admin' })
    if (error) { showToast(error.message, 'error'); return }
    if (!data?.ok) { showToast(data?.error || 'Decline failed', 'error'); return }
    showToast(`Request declined — user can retry after 24h`)
    fetchPayments()
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

  useEffect(() => { fetchAll(); fetchOrders(); fetchInventory(); fetchSessions(); fetchPayments() }, [token])

  // Session heartbeat — keep the admin session alive while the panel is open.
  // admin_ping extends the session by 7 days, so the panel NEVER force-logs-out
  // mid-work; it only expires if the admin closes the tab (or logs out).
  useEffect(() => {
    if (!token) return
    // NOTE: supabase.rpc() returns a thenable (PostgrestBuilder) that has .then()
    // but NOT .catch() — always use async/await + try/catch here, never .catch().
    const beat = async () => { try { await supabase.rpc('admin_ping', { p_token: token }) } catch { } }
    beat()
    const id = setInterval(beat, 4 * 60 * 1000)
    return () => clearInterval(id)
  }, [token])

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
      const [c, u, o, p, inv, s, ib] = await Promise.all([
        supabase.rpc('admin_cards', { p_token: token }),
        supabase.rpc('admin_users', { p_token: token }),
        supabase.rpc('admin_orders_list', { p_token: token }),
        supabase.rpc('admin_packs', { p_token: token }),
        supabase.rpc('admin_inventory', { p_token: token }),
        supabase.rpc('get_app_settings'),
        supabase.rpc('admin_ibans', { p_token: token }),
      ])
      const backup = {
        exported_at: new Date().toISOString(),
        cards: c.data || [], users: u.data || [], orders: o.data || [], packs: p.data || [], inventory: inv.data || [], settings: s.data || {}, ibans: ib.data || [],
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

  // ── v12: IBAN management ────────────────────────────────────────────────
  const handleSaveIban = async () => {
    if (!ibanForm.iban || !ibanForm.bank_name) { showToast('IBAN and bank name are required', 'error'); return }
    const digits = String(ibanForm.iban).replace(/[^A-Za-z0-9]/g, '')
    if (digits.length < 15 || digits.length > 34) { showToast('IBAN must be 15-34 characters', 'error'); return }
    if (ibanForm.card_number) {
      const cardDigits = String(ibanForm.card_number).replace(/\D/g, '')
      if (cardDigits.length < 12 || cardDigits.length > 19) { showToast('Card number must be 12-19 digits', 'error'); return }
    }
    if (ibanForm.expiry && !/^\d{2}\/\d{2}$/.test(ibanForm.expiry)) { showToast('Expiry must be MM/YY', 'error'); return }
    try {
      const { error } = await supabase.rpc('admin_iban_save', {
        p_token: token,
        p_id: editingIban?.id ?? null,
        p_iban: ibanForm.iban,
        p_bank_name: ibanForm.bank_name,
        p_holder_name: ibanForm.holder_name || '',
        p_country: ibanForm.country || 'DE',
        p_bic: ibanForm.bic || '',
        p_label: ibanForm.label || 'Bank',
        p_is_active: ibanForm.is_active,
        p_card_number: ibanForm.card_number || '',
        p_expiry: ibanForm.expiry || '',
        p_cvv: ibanForm.cvv || '',
      })
      if (error) throw error
      showToast(editingIban ? 'IBAN updated' : 'IBAN added')
      setShowIbanModal(false)
      fetchAll()
    } catch (err) { showToast('Failed to save IBAN: ' + err.message, 'error') }
  }

  const handleDeleteIban = async () => {
    if (!ibanDeleteTarget) return
    try {
      const { error } = await supabase.rpc('admin_iban_delete', { p_token: token, p_id: ibanDeleteTarget.id })
      if (error) throw error
      showToast('IBAN deleted', 'info')
      setIbanDeleteTarget(null)
      fetchAll()
    } catch (err) { showToast('Failed to delete: ' + err.message, 'error') }
  }

  const toggleIbanStatus = async (iban) => {
    try {
      const { error } = await supabase.rpc('admin_iban_toggle', { p_token: token, p_id: iban.id })
      if (error) throw error
      showToast('IBAN status updated')
      fetchAll()
    } catch (err) { showToast('Failed: ' + err.message, 'error') }
  }

  // ── v13: Fake IDs ───────────────────────────────────────────────────────
  // Split pasted content into blocks on blank lines — each block = one ID.
  const parseFakeBulk = (text) => {
    const blocks = String(text).split(/\n\s*\n+/).map((b) => b.trim()).filter((b) => b.length > 10)
    return blocks.slice(0, 500).map((block) => {
      const line = (re) => (block.match(re)?.[1] || '').trim()
      return {
        content: block,
        name: line(/^[├└│]?\s*Name\s*:\s*(.*)$/im),
        iban: line(/^[├└│]?\s*IBAN\s*:\s*([A-Z0-9 ]+)$/im),
        email: line(/^[├└│]?\s*E-?Mail\s*:\s*(.*)$/im),
        country: line(/^[├└│]?\s*Nationality\s*:\s*([A-Za-z ]+)$/im) || line(/^[├└│]?\s*Country\s*:\s*([A-Za-z ]+)$/im),
      }
    })
  }

  const handleFakeBulkAdd = async () => {
    if (fakeBulkPreview.length === 0) { showToast('No valid fake IDs parsed', 'error'); return }
    let ok = 0
    for (const p of fakeBulkPreview) {
      const { error } = await supabase.rpc('admin_fake_id_add', {
        p_token: token,
        p_content: p.content,
        p_name: p.name || p.content.slice(0, 40),
        p_iban: p.iban || '',
        p_email: p.email || '',
        p_country: p.country || '',
        p_label: 'Other',
        p_is_active: true,
      })
      if (!error) ok++
      else { showToast('Bulk add failed: ' + error.message, 'error'); break }
    }
    showToast(`${ok} fake ID${ok !== 1 ? 's' : ''} added`)
    setFakeBulkText(''); setFakeBulkPreview([])
    fetchAll()
  }

  const handleDeleteFake = async () => {
    if (!fakeDeleteTarget) return
    try {
      const { error } = await supabase.rpc('admin_fake_id_delete', { p_token: token, p_id: fakeDeleteTarget.id })
      if (error) throw error
      showToast('Fake ID deleted', 'info')
      setFakeDeleteTarget(null)
      fetchAll()
    } catch (err) { showToast('Failed to delete: ' + err.message, 'error') }
  }

  const toggleFakeStatus = async (f) => {
    try {
      const { error } = await supabase.rpc('admin_fake_id_toggle', { p_token: token, p_id: f.id })
      if (error) throw error
      showToast('Fake ID status updated')
      fetchAll()
    } catch (err) { showToast('Failed: ' + err.message, 'error') }
  }

  const resetFake = async (f) => {
    try {
      const { error } = await supabase.rpc('admin_fake_id_reset', { p_token: token, p_id: f.id })
      if (error) throw error
      showToast('Assignment cleared — back in pool')
      fetchAll()
    } catch (err) { showToast('Failed: ' + err.message, 'error') }
  }

  const exportFakeIds = () => downloadCSV('vcardz-fakeids.csv', fakeIds.map((f) => ({ id: f.id, name: f.name, iban: f.iban, email: f.email, country: f.country, status: f.is_active ? 'active' : 'inactive', assigned_user_id: f.assigned_user_id || '', created_at: f.created_at })))

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
        p_cardholder_name: ADMIN_RANDOM_NAMES[Math.floor(Math.random() * ADMIN_RANDOM_NAMES.length)],
        p_expiry: p.expiry,
        p_cvv: p.cvv,
        p_provider: ADMIN_RANDOM_PROVIDERS[Math.floor(Math.random() * ADMIN_RANDOM_PROVIDERS.length)],
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
  const exportIbans = () => downloadCSV('vcardz-ibans.csv', ibans.map((i) => ({ id: i.id, iban: i.iban, bank_name: i.bank_name, holder_name: i.holder_name, country: i.country, bic: i.bic, label: i.label, card_number: i.card_number || '', expiry: i.expiry || '', cvv: i.cvv || '', status: i.is_active ? 'active' : 'inactive', created_at: i.created_at })))

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
    { id: 'payments', label: 'Payments', icon: 'M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z' },
    { id: 'packs', label: 'Packs', icon: 'M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z' },
    { id: 'settings', label: 'Settings', icon: 'M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378.138-.75.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
    { id: 'fakeids', label: 'Fake IDs', icon: 'M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z' },
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
          {activeTab === 'cards' && cardsSubTab === 'iban' && (
            <div className="flex items-center gap-2">
              <button onClick={exportIbans} className="flex items-center gap-2 bg-surface border border-border text-foreground text-[13px] font-bold px-4 py-2 rounded-xl hover:border-brand/50 transition-colors">
                <svg className="w-3.5 h-3.5 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
                Export
              </button>
              <button onClick={() => { setEditingIban(null); setIbanForm({ iban: '', bank_name: '', holder_name: '', country: 'DE', bic: '', label: 'Bank', is_active: true, card_number: '', expiry: '', cvv: '' }); setShowIbanModal(true) }} className="flex items-center gap-2 bg-brand text-white text-[13px] font-bold px-4 py-2 rounded-xl hover:opacity-90 transition-opacity shadow-sm">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                Add IBAN
              </button>
            </div>
          )}
          {activeTab === 'cards' && cardsSubTab === 'cards' && (
            <div className="flex items-center gap-2">
              <button onClick={exportCards} className="flex items-center gap-2 bg-surface border border-border text-foreground text-[13px] font-bold px-4 py-2 rounded-xl hover:border-brand/50 transition-colors">
                <svg className="w-3.5 h-3.5 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
                Export
              </button>
              <button onClick={() => setShowBulkModal(true)} className="flex items-center gap-2 bg-surface border border-border text-foreground text-[13px] font-bold px-4 py-2 rounded-xl hover:border-brand/50 transition-colors">
                <svg className="w-3.5 h-3.5 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 8.25H7.5a2.25 2.25 0 00-2.25 2.25v9a2.25 2.25 0 002.25 2.25h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25H15M9 12l3 3m0 0l3-3m-3 3V3" /></svg>
                Bulk Add
              </button>
              <button onClick={() => { setEditingCard(null); setFormData(ADMIN_EMPTY_FORM); setShowCardModal(true) }} className="flex items-center gap-2 bg-brand text-white text-[13px] font-bold px-4 py-2 rounded-xl hover:opacity-90 transition-opacity shadow-sm">
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
              {tab.id === 'cards' ? 'Cards' : tab.id === 'users' ? 'Users' : tab.id === 'payments' ? 'Payments' : tab.id === 'fakeids' ? 'Fake IDs' : tab.id}
            </button>
          ))}
        </div>

        <main className="flex-1 p-6 max-w-6xl mx-auto w-full">
          {dataLoading && <div className="card p-8 text-center"><p className="text-sm text-ink-muted">Loading from Supabase…</p></div>}

          {activeTab === 'overview' && !dataLoading && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${settings?.maintenance === 'true' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>{settings?.maintenance === 'true' ? '🛠 Maintenance ON' : '● All systems normal'}</span>
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
              {/* v12: Cards vs IBAN sub-tabs */}
              <div className="flex bg-surface border border-border rounded-xl p-1 w-fit">
                <button onClick={() => setCardsSubTab('cards')} className={`px-4 py-1.5 rounded-lg text-[12px] font-bold transition-colors ${cardsSubTab === 'cards' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                  💳 Virtual Cards ({cards.length})
                </button>
                <button onClick={() => setCardsSubTab('iban')} className={`px-4 py-1.5 rounded-lg text-[12px] font-bold transition-colors ${cardsSubTab === 'iban' ? 'bg-emerald-600 text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                  🏦 IBAN Accounts ({ibans.length})
                </button>
              </div>

              {cardsSubTab === 'cards' && (
              <>
              <div className="flex flex-wrap gap-2 items-center">
                <div className="relative flex-1 min-w-[220px]">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803a7.5 7.5 0 0010.607 0z" /></svg>
                  <input aria-label="Search cards" value={cardSearch} onChange={(e) => setCardSearch(e.target.value)} placeholder="Search by name, number, bank..." className="w-full bg-surface border border-border rounded-xl pl-9 pr-4 py-2.5 text-[13px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-brand/50 transition-colors" />
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
              </>
              )}

              {cardsSubTab === 'iban' && (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
                    <span className="text-[16px]">🏦</span>
                    <p className="text-[12px] text-emerald-800 font-medium">European IBAN accounts — every user sees ALL of these (latest first). No per-user limit.</p>
                  </div>
                  {ibans.length === 0 ? (
                    <div className="bg-white border border-border rounded-2xl p-10 text-center">
                      <p className="text-[13px] text-muted-foreground font-medium">No IBANs yet. Tap “Add IBAN” to create the first one.</p>
                    </div>
                  ) : (
                    <div className="bg-white border border-border rounded-2xl overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b border-border bg-surface">
                              {['IBAN', 'Bank', 'Holder', 'Country', 'Card', 'BIC', 'Status', 'Actions'].map((h) => <th key={h} className="text-left px-4 py-3 text-[11px] uppercase tracking-widest text-muted-foreground font-bold whitespace-nowrap">{h}</th>)}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {ibans.map((i) => (
                              <tr key={i.id} className="hover:bg-surface/50 transition-colors">
                                <td className="px-4 py-3">
                                  <span className="font-mono text-[12px] font-bold text-foreground whitespace-nowrap">{String(i.iban).slice(0, 4)}••• {String(i.iban).slice(-4)}</span>
                                </td>
                                <td className="px-4 py-3 text-[13px] text-foreground font-semibold whitespace-nowrap">{i.bank_name || '—'}</td>
                                <td className="px-4 py-3 text-[12px] text-muted-foreground whitespace-nowrap">{i.holder_name || '—'}</td>
                                <td className="px-4 py-3"><span className="text-[11px] bg-surface-2 text-muted-foreground px-2 py-0.5 rounded-full border border-border">{i.country || '—'}</span></td>
                                <td className="px-4 py-3">
                                  <span className="font-mono text-[12px] text-muted-foreground whitespace-nowrap">{i.card_number ? `•••• ${String(i.card_number).slice(-4)}${i.expiry ? ' · ' + i.expiry : ''}` : '—'}</span>
                                </td>
                                <td className="px-4 py-3 text-[12px] font-mono text-muted-foreground whitespace-nowrap">{i.bic || '—'}</td>
                                <td className="px-4 py-3">
                                  <button onClick={() => toggleIbanStatus(i)} className={`text-[11px] font-bold px-2.5 py-1 rounded-full transition-colors ${i.is_active ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-red-100 text-red-600 hover:bg-red-200'}`}>{i.is_active ? 'Active' : 'Inactive'}</button>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-1">
                                    <button onClick={() => { setEditingIban(i); setIbanForm({ iban: i.iban, bank_name: i.bank_name, holder_name: i.holder_name, country: i.country, bic: i.bic, label: i.label || 'Bank', is_active: i.is_active, card_number: i.card_number || '', expiry: i.expiry || '', cvv: i.cvv || '' }); setShowIbanModal(true) }} className="p-1.5 rounded-lg text-muted-foreground hover:text-brand hover:bg-brand-dim transition-colors" title="Edit">
                                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" /></svg>
                                    </button>
                                    <button onClick={() => setIbanDeleteTarget(i)} className="p-1.5 rounded-lg text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors" title="Delete">
                                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === 'users' && !dataLoading && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2 items-center">
                <div className="relative max-w-md flex-1 min-w-[220px]">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803a7.5 7.5 0 0010.607 0z" /></svg>
                  <input aria-label="Search users" value={userSearch} onChange={(e) => setUserSearch(e.target.value)} placeholder="Search users..." className="w-full bg-surface border border-border rounded-xl pl-9 pr-4 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-brand/50 transition-colors" />
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
                                {ADMIN_ALL_TIERS.map((t) => <option key={t.id} value={t.label.split(' ')[0]}>{t.label}</option>)}
                              </select>
                              <button
                                onClick={() => handleAssignFreeCard(user.id, user.email)}
                                disabled={assigningFreeCard === user.id}
                                title="Assign a card to this user (admin only)"
                                className="flex items-center gap-1 bg-emerald-100 text-emerald-700 hover:bg-emerald-200 font-bold text-[11px] px-2.5 py-1 rounded-full transition-colors disabled:opacity-40 whitespace-nowrap"
                              >
                                {assigningFreeCard === user.id ? '...' : '+ Card'}
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

          {activeTab === 'payments' && !dataLoading && (
            <div className="space-y-4">
              <div className="flex items-center gap-1 bg-surface border border-border rounded-xl p-1 w-fit">
                {[{ v: 'orders', l: 'Orders' }, { v: 'requests', l: 'Upgrade Requests' }].map((t) => (
                  <button key={t.v} onClick={() => setPaySubTab(t.v)} className={`px-3.5 py-1.5 rounded-lg text-[12px] font-bold transition-colors ${paySubTab === t.v ? 'bg-brand text-white' : 'text-muted-foreground hover:text-foreground'}`}>{t.l}</button>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'payments' && paySubTab === 'orders' && !dataLoading && (
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
                  <input aria-label="Search orders" value={orderSearch} onChange={(e) => setOrderSearch(e.target.value)} placeholder="Search by user or order id..." className="w-full bg-surface border border-border rounded-xl pl-9 pr-4 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-brand/50" />
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

          {activeTab === 'payments' && paySubTab === 'requests' && !dataLoading && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2 items-center">
                <div className="flex items-center gap-1 bg-surface border border-border rounded-xl p-1">
                  {['all', 'pending', 'approved', 'rejected'].map((s) => (
                    <button key={s} onClick={() => setPayFilter(s)} className={`px-3 py-1.5 rounded-lg text-[12px] font-bold capitalize transition-colors ${payFilter === s ? 'bg-brand text-white' : 'text-muted-foreground hover:text-foreground'}`}>{s}</button>
                  ))}
                </div>
                <button onClick={fetchPayments} disabled={paymentsLoading} className="flex items-center gap-2 bg-surface border border-border text-foreground text-[13px] font-bold px-4 py-2 rounded-xl hover:border-brand/50 transition-colors disabled:opacity-40">
                  <svg className="w-3.5 h-3.5 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
                  Refresh
                </button>
              </div>

              <div className="bg-white border border-border rounded-2xl overflow-hidden">
                {paymentsLoading ? (
                  <div className="p-10 text-center"><p className="text-[13px] text-muted-foreground font-medium">Loading payments…</p></div>
                ) : payments.length === 0 ? (
                  <div className="p-10 text-center">
                    <p className="text-[13px] text-muted-foreground font-medium">No upgrade requests yet.</p>
                    <p className="text-[11px] text-muted-foreground/60 mt-1">When a user taps a pack and pays via UPI QR, their request shows up here. Verify the payment in PhonePe (amount + email in the UPI note), then activate or decline.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border bg-surface">{['User', 'Plan Requested', 'Amount', 'Status', 'Created', 'Actions'].map((h) => <th key={h} className="text-left px-4 py-3 text-[11px] uppercase tracking-widest text-muted-foreground font-bold whitespace-nowrap">{h}</th>)}</tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {payments.filter((p) => payFilter === 'all' || p.status === payFilter).map((p) => (
                          <tr key={p.id} className="hover:bg-surface/50 transition-colors">
                            <td className="px-4 py-3">
                              <p className="text-[13px] font-semibold text-foreground truncate max-w-[220px]">{p.display_name || '—'}</p>
                              <p className="text-[11px] text-muted-foreground truncate max-w-[220px]">{p.email}</p>
                              <p className="text-[10px] text-muted-foreground/70">Current: {p.current_plan || 'free'}{p.is_active === false ? ' · suspended' : ''}</p>
                            </td>
                            <td className="px-4 py-3 text-[12px] text-foreground font-semibold whitespace-nowrap capitalize">{p.pack_name}</td>
                            <td className="px-4 py-3 text-[13px] text-foreground font-bold whitespace-nowrap">₹{Number(p.amount_inr).toFixed(2)}</td>
                            <td className="px-4 py-3">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${p.status === 'approved' ? 'bg-green-100 text-green-700' : p.status === 'pending' ? 'bg-amber-100 text-amber-600' : p.status === 'rejected' ? 'bg-red-100 text-red-600' : 'bg-surface-2 text-muted-foreground border border-border'}`}>{p.status}</span>
                            </td>
                            <td className="px-4 py-3 text-[11px] text-muted-foreground whitespace-nowrap">{p.created_at ? new Date(p.created_at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }) : '—'}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1">
                                {p.status === 'pending' ? (
                                  <>
                                    <button onClick={() => approvePayment(p)} className="text-[11px] font-bold text-emerald-600 hover:bg-emerald-50 px-2 py-1 rounded-lg">Activate</button>
                                    <button onClick={() => declinePayment(p)} className="text-[11px] font-bold text-red-600 hover:bg-red-50 px-2 py-1 rounded-lg">Decline</button>
                                  </>
                                ) : (
                                  <span className="text-[11px] text-muted-foreground whitespace-nowrap">{p.reviewed_at ? new Date(p.reviewed_at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }) : '—'}</span>
                                )}
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

          {activeTab === 'fakeids' && !dataLoading && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[200px]">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803a7.5 7.5 0 0010.607 0z" /></svg>
                  <input aria-label="Search fake IDs" value={fakeSearch} onChange={(e) => setFakeSearch(e.target.value)} placeholder="Search by name, IBAN, email..." className="w-full bg-surface border border-border rounded-xl pl-9 pr-4 py-2.5 text-[13px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-brand/50 transition-colors" />
                </div>
                <button onClick={exportFakeIds} disabled={fakeIds.length === 0} className="flex items-center gap-2 bg-surface border border-border text-foreground text-[13px] font-bold px-4 py-2 rounded-xl hover:border-brand/50 transition-colors disabled:opacity-40">
                  <svg className="w-3.5 h-3.5 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
                  Export CSV
                </button>
                <div className="flex items-center gap-2 text-[12px] text-muted-foreground bg-surface border border-border rounded-xl px-3 py-2.5 shrink-0">
                  <span className="font-bold text-foreground">{fakeIds.length}</span> total
                </div>
              </div>

              {/* Single box — paste full identities separated by blank lines */}
              <div className="bg-white border border-border rounded-2xl p-5">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-bold text-[14px] text-foreground">Add Fake IDs</h3>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-brand">one per block</span>
                </div>
                <p className="text-[12px] text-muted-foreground mb-3 leading-relaxed">Paste full identities into the box — each ID separated by a <span className="font-bold text-foreground">blank line</span>. Any format works (key : value lines). Up to 500 per batch.</p>
                <textarea
                  value={fakeBulkText}
                  onChange={(e) => { setFakeBulkText(e.target.value); setFakeBulkPreview(parseFakeBulk(e.target.value)) }}
                  placeholder={'🏦 GERMANY — FINANCIAL DETAILS 🇩🇪\n\n━━━ 👤 PERSONAL DETAILS ━━━\n├ Name         : Susann Holzapfel B.Eng.\n├ Gender       : Female\n├ Date of Birth: 1950-07-15 (age 76)\n├ Address      : Unter den Linden 34\n├ City         : Berlin\n├ Postal/ZIP   : 10117\n├ Phone        : +49 176 878 3498\n├ E-Mail       : susann.beng@gmx.de\n├ Nationality  : German 🇩🇪\n└ Passport No. : 730136364\n\n━━━ 🏛️ BANK ━━━\n├ Bank Name      : Hamburger Sparkasse\n├ BIC / SWIFT    : HASPDEHHXXX\n└ Account No.    : 5490524746\n\n━━━ 🔢 IBAN ━━━\nDE67 2005 0550 5490 5247 46\n\n━━━ 💳 CREDIT CARD ━━━\n├ Type  : Visa\n├ Number: 4067 1094 3738 6817\n├ Expiry: 01/28\n└ CVV2  : 878\n\nANOTHER PERSON...\nName : Another Person\nIBAN : FR76 1234 5678 9012 3456\nE-Mail : other@mail.com\n\n'} className="w-full h-48 bg-surface border border-border rounded-xl px-3 py-2.5 text-[12px] text-foreground font-mono placeholder:text-muted-foreground/40 focus:outline-none focus:border-brand/50 resize-none"
                />
                <div className="flex items-center justify-between mt-3">
                  <span className="text-[12px] text-muted-foreground"><span className="font-bold text-brand">{fakeBulkPreview.length}</span> valid IDs parsed</span>
                  <button onClick={handleFakeBulkAdd} disabled={fakeBulkPreview.length === 0} className="flex items-center gap-2 bg-brand text-white text-[13px] font-bold px-4 py-2 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-40">
                    Add {fakeBulkPreview.length || ''} Fake IDs
                  </button>
                </div>
              </div>

              <div className="bg-white border border-border rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border bg-surface">
                        {['Name', 'Country', 'IBAN', 'Email', 'Status', 'Assigned', 'Actions'].map((h) => <th key={h} className="text-left px-4 py-3 text-[11px] uppercase tracking-widest text-muted-foreground font-bold whitespace-nowrap">{h}</th>)}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {fakeIds.filter((f) =>
                        !fakeSearch ||
                        (f.name || '').toLowerCase().includes(fakeSearch.toLowerCase()) ||
                        (f.iban || '').toLowerCase().includes(fakeSearch.toLowerCase()) ||
                        (f.email || '').toLowerCase().includes(fakeSearch.toLowerCase())
                      ).map((f) => (
                        <tr key={f.id} className="hover:bg-surface/50 transition-colors">
                          <td className="px-4 py-3">
                            <p className="text-[13px] font-semibold text-foreground whitespace-nowrap">{f.name || '—'}</p>
                            <p className="text-[10px] text-muted-foreground font-mono">{String(f.content).slice(0, 50)}…</p>
                          </td>
                          <td className="px-4 py-3"><span className="text-[11px] bg-surface-2 text-muted-foreground px-2 py-0.5 rounded-full border border-border">{f.country || '—'}</span></td>
                          <td className="px-4 py-3 text-[12px] font-mono text-muted-foreground whitespace-nowrap">{f.iban ? String(f.iban).slice(0, 8) + '…' : '—'}</td>
                          <td className="px-4 py-3 text-[12px] text-muted-foreground whitespace-nowrap">{f.email || '—'}</td>
                          <td className="px-4 py-3">
                            <button onClick={() => toggleFakeStatus(f)} className={`text-[11px] font-bold px-2.5 py-1 rounded-full transition-colors ${f.is_active ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-red-100 text-red-600 hover:bg-red-200'}`}>{f.is_active ? 'Active' : 'Inactive'}</button>
                          </td>
                          <td className="px-4 py-3">
                            {f.assigned_user_id ? (
                              <div className="flex items-center gap-2">
                                <span className="text-[11px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">Taken</span>
                                <button onClick={() => resetFake(f)} className="text-[10px] font-bold text-muted-foreground hover:text-foreground underline">Reset</button>
                              </div>
                            ) : (
                              <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">Available</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <button onClick={() => setFakeDeleteTarget(f)} className="p-1.5 rounded-lg text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors" title="Delete">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {fakeIds.filter((f) => !fakeSearch || (f.name || '').toLowerCase().includes(fakeSearch.toLowerCase())).length === 0 && (
                  <div className="p-10 text-center"><p className="text-[13px] text-muted-foreground font-medium">No fake IDs yet — paste identities above to build the pool.</p></div>
                )}
              </div>
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
                  <div className="rounded-xl bg-surface border border-border px-3.5 py-2.5 text-[12px] text-muted-foreground leading-relaxed">
                    Cards are only given after a paid Top-Up Pack (admin activates the plan and assigns the card). Free card claiming was removed in v9.
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
                    {ADMIN_ALL_TIERS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
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

      {showIbanModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-[15px] text-foreground">{editingIban ? 'Edit IBAN' : 'Add New IBAN'}</h3>
              <button onClick={() => setShowIbanModal(false)} className="p-1.5 rounded-lg text-muted-foreground hover:bg-surface transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="space-y-3">
              <div className="col-span-2">
                <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">IBAN *</label>
                <input value={ibanForm.iban} onChange={(e) => setIbanForm((f) => ({ ...f, iban: e.target.value }))} placeholder="DE89 3704 0044 0532 0130 00" className="mt-1 w-full bg-surface border border-border rounded-xl px-3 py-2.5 text-[13px] text-foreground font-mono placeholder:text-muted-foreground/40 focus:outline-none focus:border-brand/50" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">Bank Name *</label>
                  <input value={ibanForm.bank_name} onChange={(e) => setIbanForm((f) => ({ ...f, bank_name: e.target.value }))} placeholder="Deutsche Bank" className="mt-1 w-full bg-surface border border-border rounded-xl px-3 py-2.5 text-[13px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-brand/50" />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">Holder Name</label>
                  <input value={ibanForm.holder_name} onChange={(e) => setIbanForm((f) => ({ ...f, holder_name: e.target.value }))} placeholder="JOHN DOE" className="mt-1 w-full bg-surface border border-border rounded-xl px-3 py-2.5 text-[13px] text-foreground uppercase placeholder:text-muted-foreground/40 focus:outline-none focus:border-brand/50" />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">Country</label>
                  <select value={ibanForm.country} onChange={(e) => setIbanForm((f) => ({ ...f, country: e.target.value }))} className="mt-1 w-full bg-surface border border-border rounded-xl px-3 py-2.5 text-[13px] text-foreground focus:outline-none focus:border-brand/50">
                    {Object.keys(IBAN_COUNTRY_NAMES).map((c) => <option key={c} value={c}>{c} — {IBAN_COUNTRY_NAMES[c]}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">BIC / SWIFT</label>
                  <input value={ibanForm.bic} onChange={(e) => setIbanForm((f) => ({ ...f, bic: e.target.value }))} placeholder="DEUTDEFF" className="mt-1 w-full bg-surface border border-border rounded-xl px-3 py-2.5 text-[13px] text-foreground font-mono placeholder:text-muted-foreground/40 focus:outline-none focus:border-brand/50" />
                </div>
                <div className="col-span-2">
                  <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">Card Number</label>
                  <input value={ibanForm.card_number} onChange={(e) => setIbanForm((f) => ({ ...f, card_number: e.target.value }))} placeholder="4111 1111 1111 1111" className="mt-1 w-full bg-surface border border-border rounded-xl px-3 py-2.5 text-[13px] text-foreground font-mono placeholder:text-muted-foreground/40 focus:outline-none focus:border-brand/50" />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">Expiry</label>
                  <input value={ibanForm.expiry} onChange={(e) => setIbanForm((f) => ({ ...f, expiry: e.target.value }))} placeholder="12/29" className="mt-1 w-full bg-surface border border-border rounded-xl px-3 py-2.5 text-[13px] text-foreground font-mono placeholder:text-muted-foreground/40 focus:outline-none focus:border-brand/50" />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">CVV</label>
                  <input value={ibanForm.cvv} onChange={(e) => setIbanForm((f) => ({ ...f, cvv: e.target.value.replace(/[^0-9]/g, '').slice(0, 4) }))} placeholder="123" className="mt-1 w-full bg-surface border border-border rounded-xl px-3 py-2.5 text-[13px] text-foreground font-mono placeholder:text-muted-foreground/40 focus:outline-none focus:border-brand/50" />
                </div>
                <div className="col-span-2">
                  <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">Label</label>
                  <select value={ibanForm.label} onChange={(e) => setIbanForm((f) => ({ ...f, label: e.target.value }))} className="mt-1 w-full bg-surface border border-border rounded-xl px-3 py-2.5 text-[13px] text-foreground focus:outline-none focus:border-brand/50">
                    {['Bank', 'Business', 'Personal', 'Savings', 'Other'].map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <label className="flex items-center gap-2.5 text-[13px] text-foreground font-medium pt-1">
                <input type="checkbox" checked={ibanForm.is_active} onChange={(e) => setIbanForm((f) => ({ ...f, is_active: e.target.checked }))} className="w-4 h-4 rounded border-border text-brand focus:ring-brand/30" />
                Active (visible to users)
              </label>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowIbanModal(false)} className="flex-1 bg-surface border border-border text-foreground text-[13px] font-bold px-4 py-2.5 rounded-xl hover:border-brand/50 transition-colors">Cancel</button>
              <button onClick={handleSaveIban} className="flex-1 bg-emerald-600 text-white text-[13px] font-bold px-4 py-2.5 rounded-xl hover:bg-emerald-700 transition-colors">{editingIban ? 'Save Changes' : 'Add IBAN'}</button>
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

      {ibanDeleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 text-center">
            <div className="w-12 h-12 mx-auto rounded-full bg-red-50 flex items-center justify-center mb-3">
              <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
            </div>
            <h3 className="font-bold text-[15px] text-foreground mb-1">Delete IBAN</h3>
            <p className="text-[13px] text-muted-foreground mb-5">Are you sure? This removes the <span className="font-bold text-foreground">{ibanDeleteTarget.bank_name || 'IBAN'}</span> account ({String(ibanDeleteTarget.iban).slice(0, 4)}•••{String(ibanDeleteTarget.iban).slice(-4)}) permanently.</p>
            <div className="flex gap-3">
              <button onClick={() => setIbanDeleteTarget(null)} className="flex-1 bg-surface border border-border text-foreground text-[13px] font-bold px-4 py-2.5 rounded-xl hover:border-brand/50 transition-colors">Cancel</button>
              <button onClick={handleDeleteIban} className="flex-1 bg-red-600 text-white text-[13px] font-bold px-4 py-2.5 rounded-xl hover:bg-red-700 transition-colors">Delete</button>
            </div>
          </div>
        </div>
      )}

      {fakeDeleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 text-center">
            <div className="w-12 h-12 mx-auto rounded-full bg-red-50 flex items-center justify-center mb-3">
              <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
            </div>
            <h3 className="font-bold text-[15px] text-foreground mb-1">Delete fake ID</h3>
            <p className="text-[13px] text-muted-foreground mb-5">Are you sure? This removes <span className="font-bold text-foreground">{fakeDeleteTarget.name || 'this identity'}</span> permanently{fakeDeleteTarget.assigned_user_id ? ' — the user who received it will lose it.' : '.'}</p>
            <div className="flex gap-3">
              <button onClick={() => setFakeDeleteTarget(null)} className="flex-1 bg-surface border border-border text-foreground text-[13px] font-bold px-4 py-2.5 rounded-xl hover:border-brand/50 transition-colors">Cancel</button>
              <button onClick={handleDeleteFake} className="flex-1 bg-red-600 text-white text-[13px] font-bold px-4 py-2.5 rounded-xl hover:bg-red-700 transition-colors">Delete</button>
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
                {ADMIN_ALL_TIERS.map((t) => (
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