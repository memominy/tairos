/**
 * Tairos drone product definitions.
 * Each product has a fixed operational range and visual identity.
 * Add new products here — everything else picks them up automatically.
 */
export const DRONE_PRODUCTS = {
  nova: {
    id: 'nova',
    label: 'Nova',
    labelFull: 'Tairos Nova',
    description: 'Uzun menzil devriye & gözetleme',
    rangeKm: 100,
    color: '#E06835',
    bgColor: 'rgba(224,104,53,0.08)',
    strokeColor: 'rgba(224,104,53,0.55)',
    fillOpacity: 0.10,
  },
  iris: {
    id: 'iris',
    label: 'Iris',
    labelFull: 'Tairos Iris',
    description: 'Keşif & taktik gözetleme',
    rangeKm: 50,
    color: '#20C8A0',
    bgColor: 'rgba(32,200,160,0.08)',
    strokeColor: 'rgba(32,200,160,0.55)',
    fillOpacity: 0.10,
  },
  radar: {
    id: 'radar',
    label: 'UAV Radar',
    labelFull: 'Tairos UAV Radar',
    description: 'Alan tarama · 360° dönen radar',
    rangeKm: 60,
    color: '#22D3EE',
    bgColor: 'rgba(34,211,238,0.08)',
    strokeColor: 'rgba(34,211,238,0.55)',
    fillOpacity: 0.08,
    // Renderer hint: FacilityProductLayer draws a rotating sweep instead of
    // a solid circle for products with kind === 'radar'.
    kind: 'radar',
    sweepSec: 4,    // seconds per full rotation (default if deployment doesn't override)
  },
}

export const DRONE_ORDER = ['nova', 'iris', 'radar']

/** TSK baseline coverage colour */
export const TSK_COLOR = '#378ADD'
