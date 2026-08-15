// BottomNav — iOS-style bottom navigation bar with center + (Fake ID) button
export function BottomNav({ view, isLoggedIn, onNavigate }) {
  const tabs = [
    {
      id: 'landing', label: 'Home',
      icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" /></svg>,
      activeFill: <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M11.47 3.84a.75.75 0 011.06 0l8.69 8.69a.75.75 0 101.06-1.06l-8.689-8.69a2.25 2.25 0 00-3.182 0l-8.69 8.69a.75.75 0 001.061 1.06l8.69-8.69z" /><path d="M12 5.432l8.159 8.159c.03.03.06.058.091.086v6.198c0 1.035-.84 1.875-1.875 1.875H15a.75.75 0 01-.75-.75v-4.5a.75.75 0 00-.75-.75h-3a.75.75 0 00-.75.75V21a.75.75 0 01-.75.75H5.625a1.875 1.875 0 01-1.875-1.875v-6.198a2.29 2.29 0 00.091-.086L12 5.43z" /></svg>,
    },
    {
      id: 'cards', label: 'Cards',
      icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" /></svg>,
      activeFill: <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M2.273 5.625A4.483 4.483 0 015.25 4.5h13.5c1.141 0 2.183.425 2.977 1.125A3 3 0 0018.75 3H5.25a3 3 0 00-2.977 2.625zM2.273 8.625A4.483 4.483 0 015.25 7.5h13.5c1.141 0 2.183.425 2.977 1.125A3 3 0 0018.75 6H5.25a3 3 0 00-2.977 2.625zM5.25 9a3 3 0 00-3 3v6a3 3 0 003 3h13.5a3 3 0 003-3v-6a3 3 0 00-3-3H5.25zm6.75 8.25a2.25 2.25 0 110-4.5 2.25 2.25 0 010 4.5z" /></svg>,
    },
    {
      id: 'iban', label: 'IBAN',
      icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.008v.008H6.75V6.75zm6 0h.008v.008h-.008V6.75zm-6 5.25h.008v.008H6.75V12zm6 0h.008v.008h-.008V12zm-6 5.25h.008v.008H6.75v-.008zm6 0h.008v.008h-.008v-.008z" /></svg>,
      activeFill: <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.008v.008H6.75V6.75zm6 0h.008v.008h-.008V6.75zm-6 5.25h.008v.008H6.75V12zm6 0h.008v.008h-.008V12zm-6 5.25h.008v.008H6.75v-.008zm6 0h.008v.008h-.008v-.008z" /></svg>,
    },
    {
      id: isLoggedIn ? 'account' : 'auth', label: isLoggedIn ? 'Settings' : 'Login',
      icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>,
      activeFill: <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path fillRule="evenodd" d="M7.5 6a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM3.751 20.105a8.25 8.25 0 0116.498 0 .75.75 0 01-.437.695A18.683 18.683 0 0112 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 01-.437-.695z" clipRule="evenodd" /></svg>,
    },
  ]

  const visibleTabs = isLoggedIn ? tabs : [tabs[tabs.length - 1]]

  const activeView = view === 'account' || view === 'settings' ? 'account' : view === 'auth' ? (isLoggedIn ? 'account' : 'auth') : view
  const activeColor = 'text-brand'

  // Split tabs around a decorative, raised center action button (visual parity
  // with the reference design). It performs a harmless existing navigation
  // (browse cards) — no new functionality is introduced.
  const [leftTabs, rightTabs] = [visibleTabs.slice(0, 2), visibleTabs.slice(2)]

  const renderTab = (tab) => {
    const isActive = activeView === tab.id || (tab.id === 'auth' && view === 'auth' && !isLoggedIn)
    return (
      <button
        key={tab.id}
        onClick={() => onNavigate(tab.id)}
        className={`flex flex-col items-center gap-0.5 px-4 py-2 rounded-xl transition-colors ${isActive ? activeColor : 'text-muted-foreground/60'}`}
      >
        <span className={isActive ? 'nav-active' : ''}>{isActive ? tab.activeFill : tab.icon}</span>
        <span className={`text-[10px] font-bold tracking-wide ${isActive ? activeColor : 'text-muted-foreground/50'}`}>{tab.label}</span>
      </button>
    )
  }

  return (
    <nav className="app-nav fixed bottom-0 left-0 right-0 z-40 px-3 pb-3">
      <div className="max-w-md mx-auto relative rounded-[28px] border border-border bg-white/90 backdrop-blur-xl shadow-panel">
        <div className="flex items-center justify-around h-16 px-2">
          {leftTabs.map(renderTab)}
          <span className="w-14 shrink-0" aria-hidden="true" />
          {rightTabs.map(renderTab)}
        </div>
        <button
          onClick={() => onNavigate(isLoggedIn ? 'fakeid' : 'auth')}
          aria-label="Fake ID"
          className="ios-topup ios-topup-icon absolute -top-5 left-1/2 -translate-x-1/2 w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg border-4 border-background active:scale-95 transition-transform"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
        </button>
      </div>
    </nav>
  )
}

// ─── LANDING PAGE ─────────────────────────────────────────────────────────────