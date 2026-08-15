import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { V2_PACKS, APP_THEMES, APP_VERSION } from '../constants'
import { setAdminToken } from '../utils'
import { BottomNav } from '../components/nav'

// Account — profile, theme, display name, password, admin access

export function AccountPage({ currentUser, onLogout, onNavigate, theme, onThemeChange, onUserUpdate }) {
  const [showAdminInput, setShowAdminInput] = useState(false)
  const [adminCodeInput, setAdminCodeInput] = useState('')
  const [nameInput, setNameInput] = useState(currentUser?.name || '')
  const [savingName, setSavingName] = useState(false)
  const [nameMsg, setNameMsg] = useState('')
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' })
  const [pwBusy, setPwBusy] = useState(false)
  const [pwMsg, setPwMsg] = useState(null)
  const [pwErr, setPwErr] = useState('')
  const name = currentUser?.name || 'Guest'
  const email = currentUser?.email || ''
  const planName = currentUser?.plan || 'free'
  const initials = name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) || 'G'
  const currentPack = V2_PACKS.find((p) => p.id === planName)
  const planColors = { free: 'bg-surface-2 text-muted-foreground border-border', spark: 'bg-brand-dim text-brand border-brand/20', orbit: 'bg-brand-dim text-brand border-brand/20', nova: 'bg-brand-dim text-brand border-brand/20', galaxy: 'bg-amber-100 text-amber-700 border-amber-200', cosmos: 'bg-amber-100 text-amber-700 border-amber-200', infinity: 'bg-amber-100 text-amber-700 border-amber-200' }

  const saveDisplayName = async () => {
    const trimmed = nameInput.trim()
    if (trimmed.length < 2 || trimmed.length > 50) { setNameMsg('Name must be 2-50 characters'); return }
    if (!/^[a-zA-Z\s'-]+$/.test(trimmed)) { setNameMsg('Name can only contain letters, spaces, hyphens, and apostrophes'); return }
    setSavingName(true)
    setNameMsg('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not signed in')
      const { error } = await supabase.from('profiles').update({ display_name: trimmed }).eq('id', user.id)
      if (error) throw error
      onUserUpdate?.({ name: trimmed })
      setNameMsg('Name updated ✓')
    } catch (err) {
      setNameMsg('Could not update: ' + err.message)
    } finally {
      setSavingName(false)
    }
  }

  const changePassword = async () => {
    setPwErr('')
    setPwMsg(null)
    if (pw.next.length < 8) { setPwErr('New password must be at least 8 characters'); return }
    if (!/[A-Z]/.test(pw.next) || !/[a-z]/.test(pw.next) || !/[0-9]/.test(pw.next)) { setPwErr('New password must contain uppercase, lowercase, and a number'); return }
    if (pw.next !== pw.confirm) { setPwErr('New passwords do not match'); return }
    setPwBusy(true)
    try {
      const { error: verifyErr } = await supabase.auth.signInWithPassword({ email, password: pw.current })
      if (verifyErr) throw new Error('Current password is incorrect')
      const { error } = await supabase.auth.updatePassword(pw.next)
      if (error) throw error
      setPwMsg({ ok: true, text: 'Password changed successfully ✓' })
      setPw({ current: '', next: '', confirm: '' })
    } catch (err) {
      setPwMsg({ ok: false, text: err.message || 'Could not change password' })
    } finally {
      setPwBusy(false)
    }
  }

  const handleAdmin = async () => {
    if (adminCodeInput.length !== 6) return
    try {
      const { data, error } = await supabase.rpc('admin_login', { p_code: adminCodeInput })
      if (error) throw error
      if (data?.ok) {
        setAdminToken(data.session_token)
        onNavigate('admin')
      } else {
        setShowAdminInput(false)
        window.alert(data?.error === 'COOLDOWN' ? `Too many attempts. Try again in ${data.retry_after}s` : 'Invalid admin code')
      }
    } catch {
      setShowAdminInput(false)
      window.alert('Invalid admin code')
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="app-header sticky top-0 z-40 px-3 pt-3">
        <div className="max-w-md mx-auto flex items-center gap-2">
          <div className="ios-icon-well w-10 h-10 rounded-full bg-primary flex items-center justify-center shadow-md">
            <svg className="w-4 h-4 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" /></svg>
          </div>
          <div className="ios-title-box rounded-2xl px-4 py-2.5">
            <span className="font-bold text-foreground">Settings</span>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-md mx-auto w-full px-4 py-5 pb-28 space-y-4">
        <div className="bg-white border border-border rounded-2xl p-5 flex items-center gap-4 shadow-soft">
          <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center shrink-0">
            <span className="text-primary-foreground font-black text-[18px]">{initials}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-[16px] text-foreground truncate">{name}</p>
            <p className="text-muted-foreground text-[13px] truncate">{email}</p>
            <span className={`inline-flex mt-1.5 text-[11px] font-bold uppercase px-2.5 py-0.5 rounded-full border ${planColors[planName]}`}>{planName} plan</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => onNavigate('cards')} className="bg-primary text-primary-foreground rounded-2xl p-4 flex flex-col items-start gap-2 hover:opacity-90 transition-opacity shadow-sm">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" /></svg>
            <div>
              <p className="font-bold text-[13px]">Browse Cards</p>
              <p className="text-[11px] text-primary-foreground/70">{currentPack ? `$${currentPack.balance_usd} USD balance` : 'Free card'}</p>
            </div>
          </button>
          <button onClick={() => onNavigate('pricing')} className="bg-surface border border-border rounded-2xl p-4 flex flex-col items-start gap-2 hover:border-brand/40 transition-colors">
            <svg className="w-5 h-5 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" /><path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" /></svg>
            <div>
              <p className="font-bold text-[13px] text-foreground">Upgrade Plan</p>
              <p className="text-[11px] text-muted-foreground">More cards</p>
            </div>
          </button>
        </div>

        <section className="bg-white border border-border rounded-2xl p-4 shadow-soft">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="font-semibold text-[13px] text-foreground">Appearance</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Choose a soft iOS-inspired color theme</p>
            </div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-brand">{APP_THEMES.find((item) => item.id === theme)?.label}</span>
          </div>
          <div className="grid grid-cols-5 gap-2">
            {APP_THEMES.map((item) => (
              <button key={item.id} type="button" onClick={() => onThemeChange(item.id)} aria-label={`Use ${item.label} theme`} aria-pressed={theme === item.id}
                className={`theme-choice rounded-2xl p-1.5 border text-left transition-all ${theme === item.id ? 'border-brand ring-2 ring-brand/20 scale-[1.03]' : 'border-border hover:border-brand/40'}`}>
                <span className="flex h-9 overflow-hidden rounded-xl border border-black/5">
                  {item.swatches.map((color) => <span key={color} className="flex-1" style={{ backgroundColor: color }} />)}
                </span>
                <span className="mt-1 block truncate text-center text-[9px] font-bold text-foreground">{item.label}</span>
              </button>
            ))}
          </div>
        </section>

        <div className="bg-white border border-border rounded-2xl p-4 shadow-soft">
          <div className="flex items-center justify-between mb-3">
            <p className="font-semibold text-[13px] text-foreground">Display Name</p>
            <span className="text-[10px] font-bold uppercase tracking-widest text-brand">v{APP_VERSION}</span>
          </div>
          <div className="flex gap-2">
            <input
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              maxLength={50}
              placeholder="Your display name"
              className="flex-1 bg-surface border border-border rounded-xl px-3 py-2.5 text-[13px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-brand/60 transition-colors"
            />
            <button onClick={saveDisplayName} disabled={savingName}
              className="shrink-0 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-[12px] hover:opacity-90 disabled:opacity-50 transition-opacity">
              {savingName ? '…' : 'Save'}
            </button>
          </div>
          {nameMsg && <p className={`mt-2 text-[11px] ${nameMsg.includes('✓') ? 'text-emerald-600' : 'text-red-500'}`}>{nameMsg}</p>}
        </div>

        <div className="bg-white border border-border rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border"><p className="font-semibold text-[13px] text-foreground">Account Details</p></div>
          <div className="divide-y divide-border">
            {[
              { label: 'Full Name', value: name },
              { label: 'Email', value: email },
              { label: 'Current Pack', value: currentPack ? `${currentPack.name} (₹${currentPack.price_inr})` : 'Free' },
              { label: 'Card Balance', value: currentPack ? `$${currentPack.balance_usd} USD` : '$0 USD' },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between px-4 py-3.5">
                <p className="text-[13px] text-muted-foreground">{item.label}</p>
                <p className="text-[13px] font-semibold text-foreground">{item.value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border border-border rounded-2xl p-4 shadow-soft">
          <p className="font-semibold text-[13px] text-foreground mb-3">Change Password</p>
          <div className="space-y-2.5">
            <input type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} placeholder="Current password"
              className="w-full bg-surface border border-border rounded-xl px-3 py-2.5 text-[13px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-brand/60 transition-colors" />
            <input type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} placeholder="New password (8+ chars, upper+lower+number)"
              className="w-full bg-surface border border-border rounded-xl px-3 py-2.5 text-[13px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-brand/60 transition-colors" />
            <input type="password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} placeholder="Confirm new password"
              className="w-full bg-surface border border-border rounded-xl px-3 py-2.5 text-[13px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-brand/60 transition-colors" />
            <button onClick={changePassword} disabled={pwBusy}
              className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-[13px] hover:opacity-90 disabled:opacity-50 transition-opacity">
              {pwBusy ? 'Updating…' : 'Update Password'}
            </button>
            {pwErr && <p className="text-[11px] text-red-500">{pwErr}</p>}
            {pwMsg && <p className={`text-[11px] ${pwMsg.ok ? 'text-emerald-600' : 'text-red-500'}`}>{pwMsg.text}</p>}
          </div>
        </div>

        <button onClick={() => onNavigate('iban')} className="w-full bg-white border border-border rounded-2xl px-4 py-3.5 flex items-center gap-3 hover:border-emerald-400/50 transition-colors shadow-soft">
          <svg className="w-4 h-4 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.008v.008H6.75V6.75zm6 0h.008v.008h-.008V6.75zm-6 5.25h.008v.008H6.75V12zm6 0h.008v.008h-.008V12zm-6 5.25h.008v.008H6.75v-.008zm6 0h.008v.008h-.008v-.008z" /></svg>
          <p className="text-[13px] font-semibold text-foreground text-left">IBAN Accounts</p>
          <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">Europe</span>
          <svg className="w-4 h-4 text-muted-foreground ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
        </button>

        <button onClick={() => onNavigate('faq')} className="w-full bg-white border border-border rounded-2xl px-4 py-3.5 flex items-center gap-3 hover:border-brand/40 transition-colors shadow-soft">
          <svg className="w-4 h-4 text-brand shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" /></svg>
          <p className="text-[13px] font-semibold text-foreground text-left">Help & FAQ</p>
          <svg className="w-4 h-4 text-muted-foreground ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
        </button>

        <div className="bg-white border border-border rounded-2xl overflow-hidden">
          <button
            onClick={() => setShowAdminInput(!showAdminInput)}
            className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-surface transition-colors text-left"
          >
            <svg className="w-4 h-4 text-muted-foreground shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" /></svg>
            <p className="text-[13px] font-semibold text-foreground">Admin Access</p>
            <svg className={`w-4 h-4 text-muted-foreground ml-auto transition-transform ${showAdminInput ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
          </button>
          {showAdminInput && (
            <div className="px-4 pb-4 border-t border-border pt-3">
              <p className="text-[12px] text-muted-foreground mb-2">Enter your 6-digit admin code</p>
              <div className="flex gap-2">
                <input type="text" maxLength={6} inputMode="numeric" value={adminCodeInput}
                  onChange={(e) => setAdminCodeInput(e.target.value.replace(/\D/g, ''))} placeholder="000000"
                  className="flex-1 bg-surface border border-border rounded-xl px-3 py-2.5 text-[14px] font-mono tracking-widest text-center text-foreground focus:outline-none focus:border-brand/60 transition-colors"
                  onKeyDown={(e) => e.key === 'Enter' && handleAdmin()} />
                <button onClick={handleAdmin} disabled={adminCodeInput.length !== 6}
                  className="px-4 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-[13px] hover:opacity-90 disabled:opacity-40 transition-all">
                  Enter
                </button>
              </div>
            </div>
          )}
        </div>

        <button onClick={onLogout} className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl border border-red-200 bg-red-50 text-red-600 font-semibold text-[14px] hover:bg-red-100 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" /></svg>
          Sign Out
        </button>
      </main>

      <BottomNav view="account" isLoggedIn={true} onNavigate={onNavigate} />
    </div>
  )
}

// ─── ADMIN PANEL ──────────────────────────────────────────────────��───────────