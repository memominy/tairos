/**
 * Location-based deduplication of facility markers.
 *
 * When multiple facilities sit at (nearly) the same coordinates,
 * keep only the highest-priority one for display purposes.
 * Coverage polygon computation is NOT affected — this is purely visual.
 *
 * Priority 0 = most important (shown first / never hidden).
 */

const CATEGORY_PRIORITY = {
  airforce:             0,
  navy:                 1,
  commando:             2,
  army:                 3,
  artillery:            4,
  coast_guard:          5,
  border:               6,
  defense_industry:     7,
  military_school:      8,
  gendarmerie_region:   9,
  gendarmerie_province: 10,
  tairos:               11,
}

function distKm(a, b) {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const lat1 = (a.lat * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
}

/**
 * Returns only the highest-priority facility within each location cluster.
 * Facilities further than `thresholdKm` apart are treated as separate locations.
 *
 * Coverage computation should still use the original, unfiltered list.
 */
export function deduplicateByLocation(facilities, thresholdKm = 1.5) {
  // Sort by priority: most important first
  const sorted = [...facilities].sort(
    (a, b) =>
      (CATEGORY_PRIORITY[a.category] ?? 99) -
      (CATEGORY_PRIORITY[b.category] ?? 99)
  )

  const kept = []
  for (const f of sorted) {
    const shadowed = kept.some((k) => distKm(f, k) < thresholdKm)
    if (!shadowed) kept.push(f)
  }
  return kept
}
