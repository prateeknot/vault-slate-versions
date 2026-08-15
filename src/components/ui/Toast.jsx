// Toast — lightweight success/error/info banner
export function Toast({ message, type, onClose }) {
  const s = { success: 'bg-white border-border text-foreground', error: 'bg-white border-red-200 text-red-600', info: 'bg-white border-border text-foreground' }
  const dot = { success: 'bg-emerald-500', error: 'bg-red-500', info: 'bg-slate-400' }
  return (
    <div className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-2.5 px-4 py-3 rounded-xl border shadow-panel backdrop-blur-md ${s[type]}`} style={{ minWidth: 220 }}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot[type]}`} />
      <span className="text-[13px] font-medium">{message}</span>
      <button onClick={onClose} className="ml-auto opacity-50 hover:opacity-100" aria-label="Close">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
      </button>
    </div>
  )
}

// ─── Copy Button ──────────────────────────────────────────────────────────────