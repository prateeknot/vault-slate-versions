// Formatting helpers
export function formatCardNumber(num) {
  return String(num || '').replace(/\s/g, '').replace(/(.{4})/g, '$1 ').trim()
}
export function maskCardNumber(num) {
  const clean = String(num || '').replace(/\s/g, '')
  return '•••• •••• •••• ' + clean.slice(-4)
}
