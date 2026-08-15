// Top-Up packs (INR price -> USD card balance) + tier config
export const V2_PACKS = [
  { id: 'spark', name: 'Spark', price_inr: 299, balance_usd: 15, badge: 'Starter' },
  { id: 'orbit', name: 'Orbit', price_inr: 499, balance_usd: 26, badge: 'Popular' },
  { id: 'nova', name: 'Nova', price_inr: 799, balance_usd: 32, badge: 'Best Value' },
  { id: 'galaxy', name: 'Galaxy', price_inr: 999, balance_usd: 49, badge: 'Pro' },
  { id: 'cosmos', name: 'Cosmos', price_inr: 1299, balance_usd: 67, badge: 'Ultra' },
  { id: 'infinity', name: 'Infinity', price_inr: 1599, balance_usd: 82, badge: 'Max Balance' },
]
export const TIER_BALANCES = {
  free: 0,
  spark: 15,
  orbit: 26,
  nova: 32,
  galaxy: 49,
  cosmos: 67,
  infinity: 82,
}
export let PLAN_LIMITS = { free: 3, pro: 5, max: 10 }
export const CATEGORIES = ['All', 'Netflix', 'Amazon', 'Spotify', 'YouTube', 'Other']
