import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Logo from '../components/Logo'
import { useToast } from '../components/Toast'
import { useApp } from '../context/AppContext'

export default function SettingsPage() {
  const { currentUser, logout, planLimits } = useApp()
  const { showToast } = useToast()
  const navigate = useNavigate()
  const [notifications, setNotifications] = useState(true)
  const [darkMode, setDarkMode] = useState(false)
  const [compactView, setCompactView] = useState(false)

  const isGuest = currentUser?.isGuest

  const handleLogout = () => {
    logout()
    showToast('Logged out', 'info')
    navigate('/')
  }

  const planLimit = planLimits[currentUser?.plan] || 0

  return (
    <div className="min-h-screen bg-surface">
      <header className="border-b border-line sticky top-0 bg-surface/95 backdrop-blur-sm z-30">
        <div className="container-mobile flex items-center justify-between py-3">
          <Link to="/cards" className="btn-ghost !py-1.5 text-sm">← Back</Link>
          <Logo size="sm" />
          <div className="w-14" />
        </div>
      </header>

      <main className="container-mobile py-5 pb-28">
        <h1 className="text-xl font-semibold tracking-tight text-ink mb-5">Settings</h1>

        {/* Profile */}
        <div className="card p-5 mb-4">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-accent-soft flex items-center justify-center shrink-0">
              <span className="text-lg font-semibold text-accent">
                {(currentUser?.email || 'G')[0].toUpperCase()}
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink truncate">{currentUser?.email}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-accent-soft text-accent capitalize">
                  {currentUser?.plan} plan
                </span>
                {isGuest && (
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-surface-alt text-ink-faint">
                    Guest
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-line">
            <div className="flex items-center justify-between text-sm">
              <span className="text-ink-muted">Cards unlocked</span>
              <span className="font-medium text-ink">{planLimit}</span>
            </div>
          </div>
        </div>

        {/* Preferences */}
        <div className="card p-5 mb-4">
          <h2 className="text-sm font-semibold text-ink mb-4">Preferences</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-ink">Notifications</p>
                <p className="text-xs text-ink-faint">Get notified about new cards</p>
              </div>
              <button
                onClick={() => setNotifications(!notifications)}
                className={`relative h-6 w-11 rounded-full transition-colors cursor-pointer ${
                  notifications ? 'bg-accent' : 'bg-line-strong'
                }`}
                aria-label="Toggle notifications"
              >
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  notifications ? 'translate-x-[22px]' : 'translate-x-0.5'
                }`} />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-ink">Compact view</p>
                <p className="text-xs text-ink-faint">Show more cards per screen</p>
              </div>
              <button
                onClick={() => setCompactView(!compactView)}
                className={`relative h-6 w-11 rounded-full transition-colors cursor-pointer ${
                  compactView ? 'bg-accent' : 'bg-line-strong'
                }`}
                aria-label="Toggle compact view"
              >
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  compactView ? 'translate-x-[22px]' : 'translate-x-0.5'
                }`} />
              </button>
            </div>
          </div>
        </div>

        {/* Account */}
        <div className="card p-5 mb-4">
          <h2 className="text-sm font-semibold text-ink mb-4">Account</h2>
          <div className="space-y-2">
            {!isGuest && (
              <Link to="/pricing" className="btn-secondary w-full !py-3">
                Upgrade Plan
              </Link>
            )}
            <button onClick={handleLogout} className="btn-danger w-full !py-3">
              Log Out
            </button>
          </div>
        </div>

        {/* About */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-ink mb-2">About</h2>
          <p className="text-xs text-ink-faint leading-relaxed">
            VirtualCards v0.1.0 — Temporary virtual cards for free trial sign-ups.
          </p>
        </div>
      </main>
    </div>
  )
}