import { useState } from 'react'
import { Link } from 'react-router-dom'
import Logo from '../components/Logo'

const PLANS = [
  {
    name: 'Free',
    price: '₹0',
    period: 'forever',
    description: 'For getting started with trial sign-ups.',
    features: ['Limited card access', 'Copy card details', 'Mobile & desktop'],
    cta: 'Current plan',
    highlighted: false,
  },
  {
    name: 'Pro',
    price: '₹199',
    period: '/month',
    description: 'For regular users who need more cards.',
    features: ['Higher card limit', 'All Free features', 'Priority support'],
    cta: 'Upgrade to Pro',
    highlighted: true,
  },
  {
    name: 'Max',
    price: '₹499',
    period: '/month',
    description: 'For power users who need full access.',
    features: ['Highest card limit', 'All Pro features', 'Early access to new cards'],
    cta: 'Upgrade to Max',
    highlighted: false,
  },
]

export default function PricingPage() {
  const [selectedPlan, setSelectedPlan] = useState(null)

  const handlePayClick = (planName) => {
    // Payment gateway deferred — visual no-op for now
    setSelectedPlan(planName)
    setTimeout(() => setSelectedPlan(null), 2000)
  }

  return (
    <div className="min-h-screen bg-surface">
      <header className="border-b border-line">
        <div className="container-mobile flex items-center justify-between py-3.5">
          <Link to="/">
            <Logo size="sm" />
          </Link>
          <Link to="/auth" className="btn-primary !py-2 !px-4 text-sm">Sign in</Link>
        </div>
      </header>

      <main className="container-mobile py-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Simple, transparent pricing</h1>
          <p className="mt-1.5 text-sm text-ink-muted">
            Choose the plan that fits your needs. Upgrade or downgrade anytime.
          </p>
        </div>

        {/* Plans — stacked for phone */}
        <div className="space-y-4">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`card p-5 ${plan.highlighted ? 'border-accent ring-1 ring-accent' : ''}`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-base font-semibold text-ink">{plan.name}</h2>
                  <p className="mt-1 text-sm text-ink-muted">{plan.description}</p>
                </div>
                {plan.highlighted && (
                  <span className="text-xs font-medium text-accent bg-accent-soft rounded-full px-2.5 py-1">
                    Popular
                  </span>
                )}
              </div>

              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-3xl font-semibold tracking-tight text-ink">{plan.price}</span>
                <span className="text-sm text-ink-faint">{plan.period}</span>
              </div>

              <ul className="mt-4 space-y-2">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2 text-sm text-ink-muted">
                    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-accent shrink-0" aria-hidden="true">
                      <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                    </svg>
                    {feature}
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handlePayClick(plan.name)}
                disabled={plan.name === 'Free'}
                className={`mt-5 w-full !py-3.5 text-base ${plan.highlighted ? 'btn-primary' : 'btn-secondary'}`}
              >
                {plan.name === 'Free'
                  ? plan.cta
                  : selectedPlan === plan.name
                    ? 'Payment coming soon…'
                    : plan.cta}
              </button>
            </div>
          ))}
        </div>

        <p className="mt-8 text-center text-xs text-ink-faint">
          Payment gateway integration coming soon. Plan upgrades are currently managed by admins.
        </p>
      </main>
    </div>
  )
}