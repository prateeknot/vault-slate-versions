// ProviderLogo — brand chip for card providers
export function ProviderLogo({ provider, size = 'sm' }) {
  if (provider === 'Visa')
    return <span className="font-black text-white tracking-tighter" style={{ fontSize: size === 'md' ? 18 : 12 }}>VISA</span>
  if (provider === 'Mastercard')
    return (
      <span className="flex items-center">
        <span className="rounded-full bg-red-500 opacity-90" style={{ width: size === 'md' ? 20 : 14, height: size === 'md' ? 20 : 14 }} />
        <span className="rounded-full bg-amber-400 opacity-80 -ml-2" style={{ width: size === 'md' ? 20 : 14, height: size === 'md' ? 20 : 14, marginLeft: size === 'md' ? -8 : -6 }} />
      </span>
    )
  if (provider === 'Amex')
    return <span className="font-bold text-cyan-300 tracking-widest" style={{ fontSize: size === 'md' ? 11 : 9 }}>AMEX</span>
  if (provider === 'Discover')
    return <span className="font-bold text-orange-300 tracking-wider" style={{ fontSize: size === 'md' ? 10 : 8 }}>DISC</span>
  return <span className="font-bold text-purple-300" style={{ fontSize: size === 'md' ? 10 : 8 }}>RUPAY</span>
}

// ─── Chip SVG ─────────────────────────────────────────────────────────────────