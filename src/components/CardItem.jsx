import { useState } from 'react'
import CopyButton from './CopyButton'

export default function CardItem({ card, isUnlocked }) {
  const [copiedField, setCopiedField] = useState(null)

  const handleCopy = async (text, field) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedField(field)
      setTimeout(() => setCopiedField(null), 2000)
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea')
      textarea.value = text
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopiedField(field)
      setTimeout(() => setCopiedField(null), 2000)
    }
  }

  const maskedNumber = card.card_number ? card.card_number.slice(0, 4) + ' •••• •••• ••••' : '•••• •••• •••• ••••'

  return (
    <div className="card p-4">
      {/* Card header — bank/provider + status */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-[15px] font-semibold text-ink">{card.bank || 'Bank'}</p>
            {card.category && (
              <span className="text-[10px] font-medium text-accent bg-accent-soft rounded-full px-2 py-0.5">{card.category}</span>
            )}
          </div>
          <p className="text-xs text-ink-faint mt-0.5">{card.provider || 'Provider'}</p>
        </div>
        {isUnlocked ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-accent bg-accent-soft rounded-full px-2.5 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            Unlocked
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-ink-faint bg-surface-alt rounded-full px-2.5 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-ink-faint" />
            Locked
          </span>
        )}
      </div>

      {/* Card number — large, phone-friendly */}
      <div className="mb-3">
        <p className="text-xs text-ink-faint mb-1">Card Number</p>
        <div className="flex items-center justify-between gap-2">
          <p className="font-mono text-[15px] tracking-wider text-ink break-all">
            {isUnlocked ? card.card_number : maskedNumber}
          </p>
          {isUnlocked && (
            <CopyButton
              onCopy={() => handleCopy(card.card_number, 'number')}
              copied={copiedField === 'number'}
              label="Copy"
            />
          )}
        </div>
      </div>

      {/* Details — only when unlocked */}
      {isUnlocked ? (
        <div className="border-t border-line pt-3 space-y-2.5">
          {/* Name */}
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs text-ink-faint">Name</p>
              <p className="text-sm font-medium text-ink truncate">{card.name || '—'}</p>
            </div>
            <CopyButton
              onCopy={() => handleCopy(card.name, 'name')}
              copied={copiedField === 'name'}
              label="Copy"
            />
          </div>

          {/* Expiry + CVV row */}
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs text-ink-faint">Expiry</p>
              <p className="text-sm font-medium text-ink font-mono">{card.expiry || '—'}</p>
            </div>
            <CopyButton
              onCopy={() => handleCopy(card.expiry, 'expiry')}
              copied={copiedField === 'expiry'}
              label="Copy"
            />
          </div>

          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs text-ink-faint">CVV</p>
              <p className="text-sm font-medium text-ink font-mono">{card.cvv || '—'}</p>
            </div>
            <CopyButton
              onCopy={() => handleCopy(card.cvv, 'cvv')}
              copied={copiedField === 'cvv'}
              label="Copy"
            />
          </div>
        </div>
      ) : (
        <div className="border-t border-line pt-3">
          <p className="text-sm text-ink-muted">
            Upgrade your plan to view full card details.
          </p>
        </div>
      )}
    </div>
  )
}