const fs = require('fs')
let c = fs.readFileSync('src/App.jsx', 'utf8')
c = 'import { useState, useCallback, useEffect } from "react"\nimport { supabase } from "./lib/supabase"\n\n' + c
c = c.replace(/export default function App\(\) \{[\s\S]*?\n\}/, `export default function App() {
  const [view, setView] = useState("landing")
  const [currentUser, setCurrentUser] = useState(null)
  const [adminCode, setAdminCode] = useState("")
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setCurrentUser({ email: session.user.email, name: session.user.email.split("@")[0], plan: "free" })
    })
  }, [])
  const handleLogin = (user) => { setCurrentUser(user); setView("cards") }
  const handleLogout = async () => { await supabase.auth.signOut(); setCurrentUser(null); setView("landing") }
  const handleNavigate = (v) => { if ((v === "account" || v === "settings") && !currentUser) { setView("auth"); return } setView(v) }
  const handleAdminAccess = (code) => { setAdminCode(code) }
  return (
    <>
      {view === "landing" && <LandingPage isLoggedIn={!!currentUser} onNavigate={handleNavigate} />}
      {view === "auth" && <AuthPage onLogin={handleLogin} onNavigate={handleNavigate} />}
      {view === "cards" && <CardsPage currentUser={currentUser} onNavigate={handleNavigate} />}
      {view === "account" && currentUser && <AccountPage currentUser={currentUser} onLogout={handleLogout} onNavigate={handleNavigate} onAdminAccess={handleAdminAccess} />}
      {view === "pricing" && <PricingPage currentUser={currentUser} onNavigate={handleNavigate} />}
      {view === "admin" && <AdminPanelPage onNavigate={handleNavigate} adminCode={adminCode} />}
    </>
  )
}`)
fs.writeFileSync('src/App.jsx', c)
console.log('Root App wired. Has supabase:', c.includes('supabase'))
