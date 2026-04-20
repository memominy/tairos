/**
 * Tactical region buckets. Used for filtering the global-sites layer
 * and for conflict grouping. The list is intentionally coarse — anything
 * finer (e.g. "Levant" vs "Gulf") is derived client-side.
 */
export const REGIONS = Object.freeze([
  'EUROPE',
  'MIDDLE_EAST',
  'CAUCASUS',
  'CENTRAL_ASIA',
  'EAST_ASIA',
  'SOUTH_ASIA',
  'SOUTHEAST_ASIA',
  'AFRICA',
  'AMERICAS',
  'ARCTIC',
  'PACIFIC',
])

/** Display labels (Turkish). UI can override from its own i18n table. */
export const REGION_LABELS = Object.freeze({
  EUROPE:         'Avrupa',
  MIDDLE_EAST:    'Orta Doğu',
  CAUCASUS:       'Kafkasya',
  CENTRAL_ASIA:   'Orta Asya',
  EAST_ASIA:      'Doğu Asya',
  SOUTH_ASIA:     'Güney Asya',
  SOUTHEAST_ASIA: 'Güneydoğu Asya',
  AFRICA:         'Afrika',
  AMERICAS:       'Amerika',
  ARCTIC:         'Arktik',
  PACIFIC:        'Pasifik',
})
