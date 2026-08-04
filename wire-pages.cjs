const fs = require("fs")
let c = fs.readFileSync("src/App.jsx", "utf8")

// AuthPage: async handleSubmit with supabase auth
c = c.replace(/const handleSubmit = \(e\) => \{[\s\S]*?\n  \}/, `const handleSubmit = async (e) => {
    e.preventDefault()
    setError("")
    if (!email || !password) { setError("Please fill in all fields."); return }
    if (!isLogin && !name) { setError("Please enter your name."); return }
    if (password.length < 6) { setError("Password must be at least 6 characters."); return }
    setLoading(true)
    try {
      if (isLogin) {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
        if (signInError) throw signInError
        onLogin({ email, name: email.split("@")[0], plan: "free" })
      } else {
        const { error: signUpError } = await supabase.auth.signUp({ email, password })
        if (signUpError) throw signUpError
        onLogin({ email, name: name || email.split("@")[0], plan })
      }
    } catch (err) {
      setError(err.message || "Authentication failed")
    } finally {
      setLoading(false)
    }
  }`)

// CardsPage: add state + fetch from supabase
c = c.replace(/function CardsPage\(\{ currentUser, onNavigate \}\) \{[\s\S]*?const showToast = useCallback/, `function CardsPage({ currentUser, onNavigate }) {
  const userPlan = currentUser?.plan ?? "free"
  const [selectedCategory, setSelectedCategory] = useState("All")
  const [search, setSearch] = useState("")
  const [selectedCard, setSelectedCard] = useState(null)
  const [flipped, setFlipped] = useState(false)
  const [toast, setToast] = useState(null)
  const [cards, setCards] = useState([])
  const [limit, setLimit] = useState(2)

  useEffect(() => {
    const fetchCards = async () => {
      try {
        const { data: planRows } = await supabase.rpc("get_my_plan")
        if (planRows && planRows.length > 0) setLimit(planRows[0].card_limit)
        const [availRes, claimedRes] = await Promise.all([
          supabase.rpc("get_available_cards", { p_plan: userPlan }),
          supabase.rpc("get_claimed_card_details"),
        ])
        const avail = (availRes.data || []).map((x) => ({ ...x, is_active: true, plan: x.plan_tier || userPlan }))
        const claimed = (claimedRes.data || []).map((x) => ({ ...x, is_active: true, plan: x.plan_tier || userPlan }))
        setCards([...claimed, ...avail])
      } catch (err) { console.error("Fetch cards error:", err) }
    }
    fetchCards()
  }, [userPlan])

  const showToast = useCallback`)

// CardsPage: replace SEED_CARDS filter with cards state
c = c.replace(/const allFiltered = SEED_CARDS[\s\S]*?const visible = allFiltered\.slice\(0, limit\)/, `const allFiltered = cards
    .filter((x) => x.is_active !== false)
    .filter((x) => selectedCategory === "All" || x.category === selectedCategory)
    .filter((x) => !search || (x.name || "").toLowerCase().includes(search.toLowerCase()) || (x.bank || "").toLowerCase().includes(search.toLowerCase()) || (x.provider || "").toLowerCase().includes(search.toLowerCase()))

  const visible = allFiltered.slice(0, limit)`)

// AccountPage: add onAdminAccess prop + admin verify RPC
c = c.replace(/function AccountPage\(\{ currentUser, onLogout, onNavigate \}\)/, "function AccountPage({ currentUser, onLogout, onNavigate, onAdminAccess })")
c = c.replace(/onClick=\{\(\) => \{ if \(ADMIN_CODES\.includes\(adminCodeInput\)\) onNavigate\("admin"\) \}\}/, `onClick={async () => {
                    const { data, error } = await supabase.rpc("admin_verify_code", { p_code: adminCodeInput })
                    if (!error && data && data.length > 0 && data[0].is_active) {
                      onAdminAccess(adminCodeInput)
                      onNavigate("admin")
                    } else (alert("Invalid or inactive code"))
                  }}`)

// AdminPanelPage: accept adminCode prop
c = c.replace(/function AdminPanelPage\(\{ onNavigate \}\)/, "function AdminPanelPage({ onNavigate, adminCode })")

// AdminPanelPage: add useEffect to load data from supabase
c = c.replace(/const \[toast, setToast\] = useState\(null\)\n\n  \/\/ Card modal/, `const [toast, setToast] = useState(null)
  const [dataLoading, setDataLoading] = useState(true)
  const [dbTotalUsers, setDbTotalUsers] = useState(0)

  useEffect(() => {
    const loadAdmin = async () => {
      try {
        const [cardsRes, plansRes, codesRes, usersRes] = await Promise.all([
          supabase.rpc("admin_list_cards", { p_code: adminCode }),
          supabase.rpc("admin_list_plans", { p_code: adminCode }),
          supabase.rpc("admin_list_codes", { p_code: adminCode }),
          supabase.rpc("admin_count_users", { p_code: adminCode }),
        ])
        if (cardsRes.error) throw cardsRes.error
        if (cardsRes.data) setCards(cardsRes.data.map((x) => ({ ...x, plan: x.plan_tier || "all" })))
        if (plansRes.data) { const l = {}; plansRes.data.forEach((p) => { l[p.id] = p.card_limit }); PLAN_LIMITS = l; setPlanLimits(l) }
        if (codesRes.data) setAdminCodes(codesRes.data.map((x) => x.code))
        if (usersRes.data != null) setDbTotalUsers(usersRes.data)
      } catch (err) { console.error("Admin load error:", err) }
      finally { setDataLoading(false) }
    }
    loadAdmin()
  }, [adminCode])

  // Card modal`)

// AdminPanelPage: wire handleSaveCard to RPC
c = c.replace(/const handleSaveCard = \(\) => \{[\s\S]*?\n  \}/, `const handleSaveCard = async () => {
    if (!formData.card_number || !formData.name || !formData.expiry || !formData.cvv || !formData.bank) { showToast("Fill all required fields", "error"); return }
    try {
      const args = { p_code: adminCode, p_number: formData.card_number, p_name: formData.name, p_expiry: formData.expiry, p_cvv: formData.cvv, p_bank: formData.bank, p_provider: formData.provider, p_category: formData.category, p_plan: formData.plan === "all" ? "free" : formData.plan, p_active: formData.is_active }
      if (editingCard) { const { error } = await supabase.rpc("admin_update_card", { ...args, p_id: editingCard.id }); if (error) throw error }
      else { const { error } = await supabase.rpc("admin_add_card", args); if (error) throw error }
      setShowCardModal(false); showToast("Card saved")
    } catch (err) { showToast("Failed: " + err.message, "error") }
  }`)

// AdminPanelPage: wire handleDeleteCard to RPC
c = c.replace(/const handleDeleteCard = \(\) => \{[\s\S]*?\n  \}/, `const handleDeleteCard = async () => {
    if (!deleteTarget) return
    try { const { error } = await supabase.rpc("admin_delete_card", { p_code: adminCode, p_id: deleteTarget.id }); if (error) throw error; showToast("Card deleted", "info"); setDeleteTarget(null) }
    catch (err) { showToast("Failed: " + err.message, "error") }
  }`)

// AdminPanelPage: wire toggleCardStatus to RPC
c = c.replace(/const toggleCardStatus = \(id\) => \{[\s\S]*?\n  \}/, `const toggleCardStatus = async (id) => {
    try { const { error } = await supabase.rpc("admin_toggle_card", { p_code: adminCode, p_id: id }); if (error) throw error; showToast("Card status updated") }
    catch (err) { showToast("Failed: " + err.message, "error") }
  }`)

// AdminPanelPage: wire savePlanLimits to RPC
c = c.replace(/const savePlanLimits = \(\) => \{[\s\S]*?\n  \}/, `const savePlanLimits = async () => {
    try {
      for (const [plan, limit] of Object.entries(planLimits)) {
        const { error } = await supabase.rpc("admin_update_plan", { p_code: adminCode, p_plan: plan, p_limit: limit })
        if (error) throw error
      }
      showToast("Plan limits saved")
    } catch (err) { showToast("Failed: " + err.message, "error") }
  }`)

// AdminPanelPage: fix stats to use dbTotalUsers
c = c.replace(/totalUsers: users\.length,/g, "totalUsers: dbTotalUsers,")

// AdminPanelPage: fix openEditCard param
c = c.replace(/const openEditCard = \(\) => \{/, "const openEditCard = (card) => {")

// AdminPanelPage: wire handleBulkAdd to RPC
c = c.replace(/const handleBulkAdd = \(\) => \{[\s\S]*?\n  \}/, `const handleBulkAdd = async () => {
    if (bulkPreview.length === 0) { showToast("No valid cards parsed", "error"); return }
    try {
      for (const p of bulkPreview) {
        const { error } = await supabase.rpc("admin_add_card", { p_code: adminCode, p_number: p.card_number, p_name: RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)], p_expiry: p.expiry, p_cvv: p.cvv, p_bank: RANDOM_BANKS[Math.floor(Math.random() * RANDOM_BANKS.length)], p_provider: RANDOM_PROVIDERS[Math.floor(Math.random() * RANDOM_PROVIDERS.length)], p_category: bulkCategory, p_plan: bulkPlan === "all" ? "free" : bulkPlan, p_active: true })
        if (error) throw error
      }
      showToast(bulkPreview.length + " cards added")
      setShowBulkModal(false); setBulkText(""); setBulkPreview([]); setBulkPlan("all"); setBulkCategory("Other")
    } catch (err) { showToast("Failed: " + err.message, "error") }
  }`)

fs.writeFileSync("src/App.jsx", c)
console.log("All pages wired. Lines:", c.split("\\n").length)
