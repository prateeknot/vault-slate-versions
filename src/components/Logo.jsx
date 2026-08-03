export default function Logo({ size = 'md' }) {
  const sizes = {
    sm: 'h-6 w-6',
    md: 'h-8 w-8',
    lg: 'h-10 w-10',
  }

  return (
    <div className="flex items-center gap-2.5">
      <div className={`${sizes[size]} rounded-card bg-accent flex items-center justify-center`}>
        <svg viewBox="0 0 24 24" fill="none" className="h-1/2 w-1/2 text-white" aria-hidden="true">
          <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="2" />
          <path d="M3 10h18" stroke="currentColor" strokeWidth="2" />
        </svg>
      </div>
      <span className={`font-semibold tracking-tight text-ink ${size === 'lg' ? 'text-xl' : 'text-lg'}`}>
        Virtual<span className="text-accent">Cards</span>
      </span>
    </div>
  )
}