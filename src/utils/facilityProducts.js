/**
 * Helpers for the "products deployed on a facility/node" feature.
 *
 * A deployment is a product (Nova, Iris, …) placed onto a specific facility
 * or Tairos node. Each deployment carries its own configuration (range,
 * quantity, status, note) so the same product can be tuned differently at
 * different sites.
 *
 * Storage model: a flat map keyed by `facilityKey(f)` → array of deployments.
 */

/** Canonical storage key for a facility or node. */
export function facilityKey(f) {
  if (!f) return null
  if (f.id != null) return `id:${f.id}`
  if (typeof f.lat === 'number' && typeof f.lng === 'number')
    return `xy:${f.lat.toFixed(5)},${f.lng.toFixed(5)}`
  return null
}

/** Deployment lifecycle statuses. */
export const DEPLOYMENT_STATUSES = [
  { id: 'planned',     label: 'Planlanıyor', color: '#8A9BB5' },
  { id: 'deployed',    label: 'Konuşlandı',  color: '#20C8A0' },
  { id: 'active',      label: 'Aktif',       color: '#F5C842' },
  { id: 'maintenance', label: 'Bakımda',     color: '#F87171' },
  { id: 'retired',     label: 'Çekildi',     color: '#4A5F80' },
]

export const STATUS_BY_ID = Object.fromEntries(DEPLOYMENT_STATUSES.map((s) => [s.id, s]))

/** Reasonable range bounds for slider UI. */
export const RANGE_MIN_KM = 5
export const RANGE_MAX_KM = 1000

/** Build a new deployment record with defaults from a product definition. */
export function makeDeployment(product, overrides = {}) {
  return {
    uid: `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    productId: product.id,
    rangeKm: product.rangeKm,
    quantity: 1,
    status: 'planned',
    note: '',
    createdAt: Date.now(),
    ...overrides,
  }
}
