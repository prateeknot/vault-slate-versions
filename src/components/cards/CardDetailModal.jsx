import { useState } from 'react'
import { formatCardNumber, maskCardNumber } from '../../utils'
import { VirtualCardVisual } from './VirtualCardVisual'
import { CopyButton } from '../ui'

// CardDetailModal — bottom sheet with flip card + copyable info

export function CardDetailModal({ card, flipped, onFlip, onClose, onCopy, isPreview = false, onRename, onToggleFav }) {
  const [noteInput, setNoteInput] = useState(card?.note || '')
  const isOwned = !!card?.uc_id
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" />
      <div className="modal-slide-up relative bg-white rounded-t-3xl border-t border-border p-5 pb-10 max-h-[90vh] overflow-y-auto shadow-panel" onClick={(e) => e.stopPropagation()}>
        <div className="absolute top-3 left-1/2 -translate-x-1/2 w-10 h-1 rounded-full bg-border/60" />
        <div className="flex items-center justify-between mb-5 mt-3">
          <div>
            <h2 className="font-black text-[17px] text-foreground">Card Details</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">{card.provider} · {card.bank}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-surface-2 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors border border-border" aria-label="Close">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="mb-6"><VirtualCardVisual card={card} flipped={flipped} onFlip={onFlip} /></div>
        {isPreview && <div className="mb-4 rounded-2xl border border-brand/20 bg-brand-dim px-4 py-3 text-[12px] font-medium text-brand">This is a display-only sample card. Its details are for preview purposes only.</div>}
        {isOwned && (
          <div className="mb-4 rounded-2xl border border-border bg-surface p-3.5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Nickname</p>
              {card?.is_favorite
                ? <button onClick={() => onToggleFav?.(card)} className="text-[11px] font-bold text-amber-600 hover:text-amber-700 flex items-center gap-1"><span className="text-[13px]">★</span> Favorite</button>
                : <button onClick={() => onToggleFav?.(card)} className="text-[11px] font-bold text-muted-foreground hover:text-brand flex items-center gap-1"><span className="text-[13px]">☆</span> Favorite</button>}
            </div>
            <div className="flex gap-2">
              <input
                value={noteInput}
                onChange={(e) => setNoteInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') onRename?.(noteInput) }}
                placeholder="e.g. Netflix card"
                maxLength={40}
                className="flex-1 bg-white border border-border rounded-xl px-3 py-2.5 text-[13px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-brand/60 transition-colors"
              />
              <button onClick={() => onRename?.(noteInput)} className="shrink-0 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-[12px] hover:opacity-90 transition-opacity">Save</button>
            </div>
          </div>
        )}
        <p className="text-[11px] text-muted-foreground uppercase tracking-widest font-semibold mb-2 px-1">Card Information</p>
        <div className="space-y-2">
          {[
            { label: 'Card Number', value: formatCardNumber(card.card_number), displayValue: maskCardNumber(card.card_number) },
            { label: 'Card Holder', value: card.name },
            { label: 'Expiry Date', value: card.expiry },
            { label: 'CVV', value: card.cvv, displayValue: '•••' },
            { label: 'Bank', value: card.bank },
            { label: 'Network', value: card.provider },
          ].map((item) => (
            <div key={item.label} className="flex items-center justify-between border border-border bg-surface rounded-xl px-4 py-3">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">{item.label}</p>
                <p className="text-[14px] font-bold text-foreground mt-0.5 font-mono">{item.displayValue || item.value}</p>
              </div>
              {!isPreview && <CopyButton value={item.value || ''} label={item.label} />}
            </div>
          ))}
        </div>
        {!isPreview && <button
          onClick={() => {
            const text = `Card: ${formatCardNumber(card.card_number)}\nName: ${card.name}\nExpiry: ${card.expiry}\nCVV: ${card.cvv}\nBank: ${card.bank}`
            navigator.clipboard.writeText(text).catch(() => { })
            onCopy(text, 'All details')
          }}
          className="mt-5 w-full py-3.5 rounded-2xl font-black text-[14px] hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-lg text-primary-foreground bg-primary"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2 2 2 0 00-2 2z" /></svg>
          Share Card Details
        </button>}
      </div>
    </div>
  )
}

// ─── CARDS PAGE ───────────────────────────────────────────────────────────────