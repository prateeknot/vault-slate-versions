import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const AppContext = createContext(null)

// Initial seed data (fallback when Supabase not connected)
const SEED_CARDS = [
  { id: 1, card_number: '4111111111111111', name: 'JOHN DOE', expiry: '12/28', cvv: '123', bank: 'HDFC Bank', provider: 'Visa', active: true, created_at: '2026-01-15', category: 'Netflix' },
  { id: 2, card_number: '5500000000000004', name: 'JANE SMITH', expiry: '08/27', cvv: '456', bank: 'ICICI Bank', provider: 'Mastercard', active: true, created_at: '2026-01-20', category: 'Amazon' },
  { id: 3, card_number: '340000000000009', name: 'ALICE WONG', expiry: '03/29', cvv: '789', bank: 'SBI', provider: 'Amex', active: true, created_at: '2026-02-01', category: 'Spotify' },
  { id: 4, card_number: '6011000000000004', name: 'BOB JOHNSON', expiry: '11/26', cvv: '321', bank: 'Axis Bank', provider: 'Discover', active: true, created_at: '2026-02-10', category: 'Netflix' },
  { id: 5, card_number: '4000000000000002', name: 'CAROL LEE', expiry: '05/28', cvv: '654', bank: 'Kotak', provider: 'Visa', active: true, created_at: '2026-02-15', category: 'Amazon' },
  { id: 6, card_number: '5100000000000008', name: 'DAVID KIM', expiry: '09/29', cvv: '987', bank: 'HDFC Bank', provider: 'Mastercard', active: true, created_at: '2026-02-20', category: 'YouTube' },
  { id: 7, card_number: '370000000000002', name: 'EMMA WILSON', expiry: '01/28', cvv: '246', bank: 'ICICI Bank', provider: 'Amex', active: true, created_at: '2026-02-25', category: 'Spotify' },
  { id: 8, card_number: '6200000000000005', name: 'FRANK MILLER', expiry: '07/27', cvv: '135', bank: 'SBI', provider: 'Discover', active: true, created_at: '2026-03-01', category: 'Netflix' },
]

const SEED_USERS = [
  { id: 1, email: 'rahul@example.com', plan: 'free', joined: '2026-01-10', status: 'active' },
  { id: 2, email: 'priya@example.com', plan: 'pro', joined: '2026-01-15', status: 'active' },
  { id: 3, email: 'amit@example.com', plan: 'max', joined: '2026-01-20', status: 'active' },
  { id: 4, email: 'sneha@example.com', plan: 'free', joined: '2026-02-01', status: 'active' },
  { id: 5, email: 'vikram@example.com', plan: 'pro', joined: '2026-02-10', status: 'active' },
  { id: 6, email: 'neha@example.com', plan: 'free', joined: '2026-02-15', status: 'inactive' },
  { id: 7, email: 'rohan@example.com', plan: 'max', joined: '2026-02-20', status: 'active' },
  { id: 8, email: 'kavya@example.com', plan: 'free', joined: '2026-03-01', status: 'active' },
]

const SEED_ADMIN_CODES = [
  { id: 1, code: '123456', label: 'Owner', is_active: true, last_used: '2026-03-01' },
  { id: 2, code: '654321', label: 'Manager', is_active: true, last_used: '2026-02-25' },
  { id: 3, code: '111222', label: 'Support', is_active: false, last_used: null },
]

export function AppProvider({ children }) {
  // Shared state — this is the "road" between admin and user
  const [cards, setCards] = useState(SEED_CARDS)
  const [planLimits, setPlanLimits] = useState({ free: 2, pro: 5, max: 10 })
  const [users, setUsers] = useState(SEED_USERS)
  const [adminCodes, setAdminCodes] = useState(SEED_ADMIN_CODES)
  const [currentUser, setCurrentUser] = useState(null)
  const [authUser, setAuthUser] = useState(null) // Supabase auth user
  const [activityLog, setActivityLog] = useState([])

  // Initialize auth state from Supabase on mount
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setAuthUser(session.user)
        // Fetch user's plan from DB
        fetchUserPlan(session.user.id)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setAuthUser(session.user)
        fetchUserPlan(session.user.id)
      } else {
        setAuthUser(null)
        setCurrentUser(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  // Fetch user's plan from Supabase
  const fetchUserPlan = useCallback(async (userId) => {
    try {
      const { data: planData } = await supabase
        .from('user_plans')
        .select('plan_id')
        .eq('user_id', userId)
        .maybeSingle()

      const plan = planData?.plan_id || 'free'
      setCurrentUser((prev) => ({
        ...(prev || {}),
        id: userId,
        email: prev?.email || '',
        plan,
      }))
    } catch (err) {
      console.error('Error fetching user plan:', err)
    }
  }, [])

  // Log activity
  const logActivity = useCallback((action, detail) => {
    setActivityLog((prev) => [
      { id: Date.now(), action, detail, time: new Date().toISOString() },
      ...prev,
    ].slice(0, 50))
  }, [])

  // Get user email from Supabase session if not set yet
  const syncUserEmail = useCallback(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setCurrentUser((prev) => prev ? { ...prev, id: user.id, email: user.email } : prev)
      }
    })
  }, [])

  // ===== AUTH =====
  const login = useCallback(async (email) => {
    // Sign in via Supabase
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: '' })
    if (error) {
      return { success: false, error: error.message }
    }
    syncUserEmail()
    return { success: true }
  }, [syncUserEmail])

  const loginAsGuest = useCallback(() => {
    const guest = { id: 'guest', email: 'guest@virtualcards.app', plan: 'free', isGuest: true }
    setCurrentUser(guest)
    logActivity('guest_entered', 'Guest entered the app')
    return { success: true, user: guest }
  }, [logActivity])

  const logout = useCallback(async () => {
    await supabase.auth.signOut()
    setAuthUser(null)
    setCurrentUser(null)
  }, [])

  // ===== CARD OPERATIONS (admin, local state for UI) =====
  const addCard = useCallback((cardData) => {
    const newCard = {
      id: Date.now(),
      ...cardData,
      created_at: new Date().toISOString().slice(0, 10),
    }
    setCards((prev) => [newCard, ...prev])
    logActivity('card_added', `${newCard.bank} / ${newCard.provider} card added`)
    return newCard
  }, [logActivity])

  const updateCard = useCallback((id, cardData) => {
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, ...cardData } : c)))
    logActivity('card_updated', `Card ${id} updated`)
  }, [logActivity])

  const deleteCard = useCallback((id) => {
    setCards((prev) => prev.filter((c) => c.id !== id))
    logActivity('card_deleted', `Card ${id} deleted`)
  }, [logActivity])

  const toggleCardActive = useCallback((id) => {
    setCards((prev) => {
      const card = prev.find((c) => c.id === id)
      if (card) {
        logActivity('card_toggled', `${card.name} ${card.active ? 'deactivated' : 'activated'}`)
      }
      return prev.map((c) => (c.id === id ? { ...c, active: !c.active } : c))
    })
  }, [logActivity])

  // ===== PLAN OPERATIONS (admin, local state for UI) =====
  const updatePlanLimit = useCallback((plan, value) => {
    setPlanLimits((prev) => ({ ...prev, [plan]: Math.max(0, parseInt(value) || 0) }))
  }, [])

  const savePlanLimits = useCallback(() => {
    logActivity('plans_updated', 'Plan limits updated')
  }, [logActivity])

  // ===== USER OPERATIONS (admin, local state for UI) =====
  const updateUserPlan = useCallback((userId, newPlan) => {
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, plan: newPlan } : u)))
    logActivity('user_plan_changed', `User ${userId} moved to ${newPlan} plan`)
  }, [logActivity])

  const toggleUserStatus = useCallback((userId) => {
    setUsers((prev) => {
      const user = prev.find((u) => u.id === userId)
      if (user) {
        logActivity('user_status_changed', `${user.email} ${user.status === 'active' ? 'suspended' : 'activated'}`)
      }
      return prev.map((u) => (u.id === userId ? { ...u, status: u.status === 'active' ? 'inactive' : 'active' } : u))
    })
  }, [logActivity])

  // ===== ADMIN CODE OPERATIONS =====
  const addAdminCode = useCallback((code, label) => {
    const newCode = { id: Date.now(), code, label, is_active: true, last_used: null }
    setAdminCodes((prev) => [...prev, newCode])
    logActivity('admin_code_added', `New admin code created for ${label}`)
    return newCode
  }, [logActivity])

  const toggleAdminCode = useCallback((id) => {
    setAdminCodes((prev) => prev.map((c) => (c.id === id ? { ...c, is_active: !c.is_active } : c)))
    logActivity('admin_code_toggled', `Admin code ${id} ${adminCodes.find((c) => c.id === id)?.is_active ? 'deactivated' : 'activated'}`)
  }, [adminCodes, logActivity])

  const deleteAdminCode = useCallback((id) => {
    setAdminCodes((prev) => prev.filter((c) => c.id !== id))
    logActivity('admin_code_deleted', `Admin code ${id} deleted`)
  }, [logActivity])

  const value = {
    // Shared data
    cards,
    planLimits,
    users,
    adminCodes,
    currentUser,
    authUser,
    activityLog,
    // Card ops
    addCard,
    updateCard,
    deleteCard,
    toggleCardActive,
    // Plan ops
    updatePlanLimit,
    savePlanLimits,
    // User ops
    updateUserPlan,
    toggleUserStatus,
    // Admin code ops
    addAdminCode,
    toggleAdminCode,
    deleteAdminCode,
    // Auth
    login,
    loginAsGuest,
    logout,
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const context = useContext(AppContext)
  if (!context) {
    throw new Error('useApp must be used within AppProvider')
  }
  return context
}