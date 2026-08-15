import { CARD_GRADIENTS, CATEGORY_COLORS, CARD_GLOW } from '../../constants'
import { maskCardNumber } from '../../utils'
import { ProviderLogo } from '../ui'

// CardListItem — compact card row (list/grid view)

export function CardListItem({ card, onOpen, compact = false }) {
  const catColor = CATEGORY_COLORS[card.category] ?? CATEGORY_COLORS.Other
  return (
    <button
      onClick={() => onOpen(card)}
      className={`card-item-glow relative w-full text-left bg-white border border-border rounded-2xl ${compact ? 'p-3' : 'p-3.5'} flex items-center gap-3.5 active:scale-[0.98] transition-all duration-200 hover:shadow-soft`}
      style={{ ['--glow-color']: CARD_GLOW[card.provider] }}
    >
      {card.is_favorite && !compact && <span className="absolute top-2 right-2 text-[12px] text-amber-500" aria-label="Favorite">★</span>}
      <div className={`relative w-14 h-10 rounded-xl bg-gradient-to-br ${CARD_GRADIENTS[card.provider] || CARD_GRADIENTS.Visa} flex flex-col items-start justify-between p-1.5 shrink-0 overflow-hidden`}>
        <div className="absolute inset-0 rounded-xl" style={{ background: 'linear-gradient(135deg,rgba(255,255,255,0.14) 0%,transparent 55%)' }} />
        <div className="w-4 h-3 rounded-sm relative z-10" style={{ background: 'linear-gradient(135deg,#dfe5ec,#b8c2d1)', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }}>
          <div className="absolute inset-0 rounded-sm opacity-40" style={{ background: 'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.15) 2px,rgba(0,0,0,0.15) 3px)' }} />
        </div>
        <div className="relative z-10 self-end"><ProviderLogo provider={card.provider} size="sm" /></div>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="font-bold text-[13px] text-foreground truncate">{card.name || 'Claimed Card'}</p>
          {card.category && <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${catColor.bg} ${catColor.text}`}>{card.category}</span>}
        </div>
        <p className="text-muted-foreground text-[12px] mt-0.5 font-mono tracking-wide">{card.card_number ? maskCardNumber(card.card_number) : (card.last4 ? '•••• •••• •••• ' + card.last4 : '•••• •••• •••• ••••')}</p>
        <div className={`flex items-center gap-1.5 mt-1 ${compact ? 'flex-wrap' : ''}`}>
          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${card.tier === 'free' ? 'bg-surface-2 text-muted-foreground' : 'bg-brand-dim text-brand'}`}>{card.tier || 'free'}</span>
          <span className="text-[11px] text-emerald-600 font-bold">${card.balance_usd ?? 0} USD</span>
          {!compact && <><span className="text-[11px] text-muted-foreground/60 font-medium">{card.bank}</span>{card.expiry && <><span className="text-muted-foreground/30 text-[10px]">•</span><span className="text-[11px] text-muted-foreground/60">Exp {card.expiry}</span></>}</>}
        </div>
        {!compact && card.note && <p className="text-[11px] text-brand font-semibold mt-1 truncate">🏷 {card.note}</p>}
      </div>

      <div className="shrink-0 w-7 h-7 rounded-full bg-surface flex items-center justify-center border border-border">
        <svg className="w-3.5 h-3.5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
      </div>
    </button>
  )
}

// ─── Card Detail Modal ────────────────────────────────────────────────────────