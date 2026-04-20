/**
 * Shared Overpass API helpers — used by every live overlay (power, internet,
 * water, maritime, cell towers) + the nearest-tower lookup.
 *
 * Handles: mirror fallback, POST body, 15s per-mirror client timeout, abort
 * propagation, JSON parse, and consolidated error reporting.
 */

export const OVERPASS_MIRRORS = [
  'https://overpass.kumi.systems/api/interpreter',   // fastest / most reliable in EU
  'https://overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://z.overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.openstreetmap.ru/api/interpreter',
]

/**
 * POST a query to each mirror in order until one responds with JSON.
 * Returns the parsed JSON, or an object `{ _error: [...] }` if all failed.
 * Callers should pass an AbortController whose signal is propagated per mirror.
 */
export async function fetchFromMirrors(query, ac) {
  const errors = []
  for (const mirror of OVERPASS_MIRRORS) {
    if (ac.signal.aborted) throw new DOMException('aborted', 'AbortError')
    const mirrorAc = new AbortController()
    const t = setTimeout(() => mirrorAc.abort(), 15000)
    const onAbort = () => mirrorAc.abort()
    ac.signal.addEventListener('abort', onAbort, { once: true })
    const host = new URL(mirror).host
    try {
      const res = await fetch(mirror, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
        signal: mirrorAc.signal,
      })
      if (!res.ok) { errors.push(`${host}: HTTP ${res.status}`); continue }
      const text = await res.text()
      if (text.trim().startsWith('{')) {
        try {
          const data = JSON.parse(text)
          console.info(`[Overpass] ${host} → ${data.elements?.length ?? 0} el`)
          return data
        } catch { errors.push(`${host}: parse fail`); continue }
      }
      errors.push(`${host}: non-JSON (rate limit?)`)
    } catch (e) {
      if (ac.signal.aborted) throw new DOMException('aborted', 'AbortError')
      errors.push(`${host}: ${e.name === 'AbortError' ? 'timeout' : (e.message || 'fetch fail')}`)
    } finally {
      clearTimeout(t)
      ac.signal.removeEventListener('abort', onAbort)
    }
  }
  console.warn('[Overpass] all mirrors failed:\n  ' + errors.join('\n  '))
  return { _error: errors }
}

/**
 * Compute an Overpass bbox string from a Leaflet map bounds object.
 * Output format: "south,west,north,east" with 3-digit precision.
 */
export function boundsToBbox(bounds) {
  return `${bounds.getSouth().toFixed(3)},${bounds.getWest().toFixed(3)},${bounds.getNorth().toFixed(3)},${bounds.getEast().toFixed(3)}`
}

/** Polygon centroid (arithmetic mean of lat/lon from an array of {lat,lon}). */
export function centroid(geom) {
  const n = geom.length
  return {
    lat: geom.reduce((a, g) => a + g.lat, 0) / n,
    lon: geom.reduce((a, g) => a + g.lon, 0) / n,
  }
}
