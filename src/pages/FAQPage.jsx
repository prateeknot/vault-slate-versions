import { useState } from 'react'
import { TELEGRAM_BOT_USERNAME } from '../constants'
import { BottomNav } from '../components/nav'

// FAQ — help & frequently asked questions

export function FAQPage({ onNavigate }) {
  const [open, setOpen] = useState(null)
  const items = [
    { q: 'How do I get my first card?', a: 'Buy any Top-Up Pack on the Plans page — tap “Pay via UPI QR”, scan the QR with any UPI app, and write your account email in the payment note. Once the admin verifies the payment, your plan activates and your card unlocks.' },
    { q: 'How do Top-Up Packs work?', a: 'Packs (Spark ₹299 up to Infinity ₹1599) add a higher-balance card to your account. Tap any pack on the Plans page and pay via UPI QR — scan, pay, and write your email in the payment note. Once the admin verifies the payment, your plan activates automatically and your new card unlocks.' },
    { q: 'What is a virtual card used for?', a: 'These are virtual card details (number, expiry, CVV) designed for free trial sign-ups and verification. They work like a prepaid-style card for online use.' },
    { q: 'What happens when a card expires?', a: 'Expired cards can no longer be used for new sign-ups. Copy important details before the expiry date — you will see an amber alert on the Cards page for cards expiring within 60 days.' },
    { q: 'Can I rename or favourite a card?', a: 'Yes — open any card and use the Nickname field or the star (Favorite) button. Favorites can be filtered with the ★ chip on the Cards page.' },
    { q: 'My card did not arrive after payment. What now?', a: 'Check the Plans page — if your request still says "Payment Under Review", the admin is verifying it. Activation happens right after payment verification, so if it has been more than a few minutes contact us via Telegram (@' + TELEGRAM_BOT_USERNAME + ') with your order details and our team will fix it.' },
    { q: 'Is my card data secure?', a: 'All card data is stored in a protected database and only your own cards are shown to you. Admin access requires a separate 6-digit code.' },
  ]
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="app-header sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-md">
        <div className="max-w-md mx-auto px-4 flex items-center h-14">
          <button onClick={() => onNavigate('account')} className="mr-3 text-muted-foreground hover:text-foreground" aria-label="Back">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" /></svg>
          </button>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-primary flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" /></svg>
            </div>
            <span className="font-bold text-foreground">Help & FAQ</span>
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-md mx-auto w-full px-4 py-6 pb-28 space-y-2.5">
        {items.map((item, i) => {
          const isOpen = open === i
          return (
            <div key={item.q} className="bg-white border border-border rounded-2xl overflow-hidden shadow-soft">
              <button
                onClick={() => setOpen(isOpen ? null : i)}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-surface transition-colors"
                aria-expanded={isOpen}
              >
                <p className="flex-1 text-[13px] font-semibold text-foreground">{item.q}</p>
                <svg className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
              </button>
              {isOpen && <p className="px-4 pb-4 text-[13px] text-muted-foreground leading-relaxed border-t border-border pt-3">{item.a}</p>}
            </div>
          )
        })}
        <p className="text-center text-[11px] text-muted-foreground pt-4">Still stuck? Message us on Telegram: @{TELEGRAM_BOT_USERNAME}</p>
      </main>
      <BottomNav view="account" isLoggedIn={true} onNavigate={onNavigate} />
    </div>
  )
}

// ─── TOP-UP PACKS PRICING PAGE ────────────────────────────────────────��───────
// ─── IBAN ACCOUNTS PAGE ───────────────────────────────────────────────────────
// v12: European IBAN accounts added by the admin. Unlike virtual cards, EVERY
// user sees ALL active IBANs (no assignment, no per-user limit) — latest first.