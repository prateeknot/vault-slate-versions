// Admin panel shared config
export const ADMIN_EMPTY_FORM = { card_number: '', name: '', expiry: '', cvv: '', provider: 'Visa', label: '', is_active: true, tier: 'free', balance_usd: 0 }
export const ADMIN_ALL_TIERS = [
  { id: 'free', label: 'Free (₹0)' },
  { id: 'spark', label: 'Spark ($15)' },
  { id: 'orbit', label: 'Orbit ($26)' },
  { id: 'nova', label: 'Nova ($32)' },
  { id: 'galaxy', label: 'Galaxy ($49)' },
  { id: 'cosmos', label: 'Cosmos ($67)' },
  { id: 'infinity', label: 'Infinity ($82)' },
]
export const ADMIN_RANDOM_NAMES = ['RAHUL SHARMA', 'PRIYA SINGH', 'AMIT VERMA', 'SNEHA GUPTA', 'VIKRAM NAIR', 'NEHA REDDY', 'ROHAN MISHRA', 'KAVYA PATEL', 'ANKIT JHA', 'POOJA IYER', 'SURESH KUMAR', 'MEERA JHA']
export const ADMIN_RANDOM_PROVIDERS = ['Visa', 'Mastercard', 'Amex', 'Discover', 'RuPay']
