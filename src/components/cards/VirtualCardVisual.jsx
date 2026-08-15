import { CARD_FULL_GRADIENTS } from '../../constants'
import { formatCardNumber } from '../../utils'
import { ProviderLogo } from '../ui'
import { ChipSVG } from '../ui'

// VirtualCardVisual — animated flip card (front/back)

export function VirtualCardVisual({ card, flipped = false, onFlip }) {
  const gradient = CARD_FULL_GRADIENTS[card.provider] || CARD_FULL_GRADIENTS.Visa
  return (
    <div
      className="relative w-full cursor-pointer select-none card-float"
      style={{ aspectRatio: '1.586', perspective: 1000 }}
      onClick={onFlip}
      onKeyDown={onFlip ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onFlip() } } : undefined}
      role="button"
      tabIndex={onFlip ? 0 : -1}
      aria-label={flipped ? 'Show card front' : 'Show card back'}
    >
      <div
        className="w-full h-full transition-transform duration-500"
        style={{ transformStyle: 'preserve-3d', transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}
      >
        {/* Front */}
        <div
          className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${gradient} p-5 flex flex-col justify-between overflow-hidden card-shimmer`}
          style={{ backfaceVisibility: 'hidden', boxShadow: '0 18px 34px -14px rgba(15,23,42,0.45)' }}
        >
          <div className="absolute inset-0 rounded-2xl pointer-events-none" style={{ background: 'linear-gradient(135deg,rgba(255,255,255,0.10) 0%,transparent 55%)' }} />
          <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white/[0.04] pointer-events-none" />
          <div className="absolute -bottom-12 -left-8 w-32 h-32 rounded-full bg-black/15 pointer-events-none" />

          <div className="flex items-start justify-between relative z-10">
            <div>
              <p className="text-[10px] text-white/55 uppercase tracking-widest font-bold">VCardz</p>
              <p className="text-[11px] text-white/40 mt-0.5 font-medium">{card.bank}</p>
            </div>
            <div className="flex items-center gap-2">
              {card.balance_usd !== undefined && (
                <span className="bg-white/10 backdrop-blur-md px-2.5 py-0.5 rounded-full border border-white/15 text-white font-black text-[11px] shadow-sm tracking-wide">
                  ${card.balance_usd} USD
                </span>
              )}
              <ProviderLogo provider={card.provider} size="sm" />
            </div>
          </div>
          <div className="relative z-10"><ChipSVG /></div>
          <div className="relative z-10">
            <p className="font-mono text-white/90 text-[15px] tracking-[0.2em] font-semibold drop-shadow-sm">{formatCardNumber(card.card_number)}</p>
            <div className="flex items-end justify-between mt-2.5">
              <div>
                <p className="text-[8px] text-white/35 uppercase tracking-widest">Card Holder</p>
                <p className="text-[12px] text-white font-bold tracking-wide mt-0.5">{card.name}</p>
              </div>
              <div className="text-right">
                <p className="text-[8px] text-white/35 uppercase tracking-widest">Expires</p>
                <p className="text-[12px] text-white font-bold mt-0.5">{card.expiry}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Back */}
        <div
          className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${gradient} flex flex-col justify-between overflow-hidden`}
          style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)', boxShadow: '0 18px 34px -14px rgba(15,23,42,0.45)' }}
        >
          <div className="absolute inset-0 rounded-2xl pointer-events-none" style={{ background: 'linear-gradient(135deg,rgba(255,255,255,0.06) 0%,transparent 55%)' }} />
          <div className="mt-8 h-10 bg-black/50 w-full" />
          <div className="px-5 pb-5 relative z-10">
            <div className="flex items-center justify-end gap-3 mt-4">
              <div className="flex-1 h-8 rounded-lg bg-white/8 backdrop-blur-sm" />
              <div className="bg-white/95 rounded-lg px-3 py-2 flex items-center gap-2 shadow-md">
                <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wide">CVV</p>
                <p className="font-mono text-slate-900 font-black text-[14px] tracking-widest">{card.cvv}</p>
              </div>
            </div>
            <p className="text-[9px] text-white/25 text-center mt-4 tracking-wide">Tap to flip back</p>
          </div>
        </div>
      </div>

      {!flipped && (
        <div className="absolute bottom-3 right-3 z-20 text-[9px] text-white/30 flex items-center gap-1">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.042 21.672L13.684 16.6m0 0l-2.51 2.225.569-9.47 5.227 7.917-3.286-.672zm-7.518-.267A8.25 8.25 0 1120.25 10.5M8.288 14.212A5.25 5.25 0 1117.25 10.5" /></svg>
          tap to flip
        </div>
      )}
    </div>
  )
}
