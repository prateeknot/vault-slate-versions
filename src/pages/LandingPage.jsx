import { Link } from 'react-router-dom'
import Logo from '../components/Logo'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-surface flex flex-col">
      {/* Header — compact for phone */}
      <header className="border-b border-line">
        <div className="container-mobile flex items-center justify-between py-3.5">
          <Logo size="sm" />
          <Link to="/auth" className="btn-primary !py-2 !px-4 text-sm">Sign in</Link>
        </div>
      </header>

      {/* Hero — phone-first, large touch-friendly */}
      <main className="flex-1 container-mobile py-10">
        <div className="text-center">
          <h1 className="text-[28px] leading-tight font-semibold tracking-tight text-ink">
            Temporary virtual cards,
            <br />
            <span className="text-gradient">ready when you need them.</span>
          </h1>
          <p className="mt-3 text-[15px] text-ink-muted">
            Browse and copy card details for free trial sign-ups. Simple, fast, and secure.
          </p>

          <div className="mt-8 space-y-3">
            <Link to="/auth" className="btn-primary w-full !py-3.5 text-base">
              Get started free
            </Link>
            <Link to="/pricing" className="btn-secondary w-full !py-3.5 text-base">
              View plans
            </Link>
          </div>
        </div>

        {/* Feature highlights — stacked for phone */}
        <div className="mt-10 space-y-3">
          <div className="card card-hover p-4 flex items-start gap-3">
            <div className="h-9 w-9 rounded-card bg-accent-soft flex items-center justify-center shrink-0">
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 text-accent" aria-hidden="true">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>
            <div>
              <h3 className="text-[15px] font-semibold text-ink">Free to start</h3>
              <p className="mt-0.5 text-sm text-ink-muted">Sign up in seconds. No email verification needed.</p>
            </div>
          </div>

          <div className="card card-hover p-4 flex items-start gap-3">
            <div className="h-9 w-9 rounded-card bg-accent-soft flex items-center justify-center shrink-0">
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 text-accent" aria-hidden="true">
                <path d="M7 3.5A1.5 1.5 0 018.5 2h3.879a1.5 1.5 0 011.06.44l3.122 3.12A1.5 1.5 0 0117 6.622V12.5a1.5 1.5 0 01-1.5 1.5h-1v-3.379a3 3 0 00-.879-2.121L10.5 5.379A3 3 0 008.379 4.5H7v-1z" />
                <path d="M4.5 6A1.5 1.5 0 003 7.5v9A1.5 1.5 0 004.5 18h7a1.5 1.5 0 001.5-1.5v-5.879a1.5 1.5 0 00-.44-1.06L9.44 6.439A1.5 1.5 0 008.378 6H4.5z" />
              </svg>
            </div>
            <div>
              <h3 className="text-[15px] font-semibold text-ink">Copy with one click</h3>
              <p className="mt-0.5 text-sm text-ink-muted">Full card details at your fingertips on any device.</p>
            </div>
          </div>

          <div className="card card-hover p-4 flex items-start gap-3">
            <div className="h-9 w-9 rounded-card bg-accent-soft flex items-center justify-center shrink-0">
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 text-accent" aria-hidden="true">
                <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
              </svg>
            </div>
            <div>
              <h3 className="text-[15px] font-semibold text-ink">Upgrade anytime</h3>
              <p className="mt-0.5 text-sm text-ink-muted">Unlock more cards with Pro or Max plans.</p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer — compact */}
      <footer className="border-t border-line">
        <div className="container-mobile py-4 flex items-center justify-between">
          <p className="text-xs text-ink-faint">© {new Date().getFullYear()} VirtualCards</p>
          <Link to="/admin" className="text-xs text-ink-faint hover:text-ink-muted transition-colors">
            Admin
          </Link>
        </div>
      </footer>
    </div>
  )
}