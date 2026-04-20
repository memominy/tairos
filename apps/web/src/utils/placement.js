/**
 * Strategic product placement — given a user-drawn polygon and a set of
 * selected products, pick the MINIMUM number of center points inside the
 * polygon such that the polygon is fully covered by the longest-range
 * product's circle at each center. ALL selected products are then deployed
 * at every chosen center (co-located systems).
 *
 * Why the longest range drives the layout:
 *   If the big drone covers the area, anything with a smaller range can ride
 *   along at the same site — the operator still has ground presence at every
 *   chosen point even if the smaller-range product only covers a sub-region.
 *   Optimising for the biggest range also minimises the number of sites,
 *   which is the real operational cost.
 *
 * Algorithm:
 *   1. Build a dense sample grid inside the polygon (these are the "pixels"
 *      we need to cover).
 *   2. Build a hex lattice of candidate centers inside the polygon with
 *      spacing = range·√3 (classic tight hex packing). Add the polygon's
 *      centroid as an extra candidate so tiny polygons always have one.
 *   3. Run a greedy max-cover loop: at each step pick the hex that covers
 *      the most still-uncovered sample points. Stop when coverage ≥ target
 *      (default 99%) or no candidate adds anything new.
 *   4. Return the picked centers; the caller deploys whatever products the
 *      user ticked at each one.
 */

import booleanPointInPolygon from '@turf/boolean-point-in-polygon'
import area from '@turf/area'
import { point, polygon as turfPolygon } from '@turf/helpers'

const KM_PER_DEG_LAT = 111.32
function kmPerDegLng(lat) { return KM_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180) }

/** Haversine distance in km. */
function haversineKm(aLat, aLng, bLat, bLng) {
  const R = 6371
  const dLat = (bLat - aLat) * Math.PI / 180
  const dLng = (bLng - aLng) * Math.PI / 180
  const la1  = aLat * Math.PI / 180
  const la2  = bLat * Math.PI / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.asin(Math.sqrt(h))
}

/** Turn a [[lat, lng], …] ring into a closed Turf Feature<Polygon>. */
export function ringToPolygon(ring) {
  if (!ring || ring.length < 3) return null
  const coords = ring.map(([lat, lng]) => [lng, lat])
  if (
    coords[0][0] !== coords[coords.length - 1][0] ||
    coords[0][1] !== coords[coords.length - 1][1]
  ) coords.push(coords[0])
  try { return turfPolygon([coords]) } catch { return null }
}

/** Area of a Turf polygon in km². */
export function polygonAreaKm2(poly) {
  if (!poly) return 0
  try { return area(poly) / 1_000_000 } catch { return 0 }
}

/** [minLat, minLng, maxLat, maxLng] of a ring. */
function ringBounds(ring) {
  let minLat = Infinity, maxLat = -Infinity
  let minLng = Infinity, maxLng = -Infinity
  for (const [lat, lng] of ring) {
    if (lat < minLat) minLat = lat
    if (lat > maxLat) maxLat = lat
    if (lng < minLng) minLng = lng
    if (lng > maxLng) maxLng = lng
  }
  return [minLat, minLng, maxLat, maxLng]
}

/** Unweighted centroid of a ring. */
function ringCentroid(ring) {
  let sLat = 0, sLng = 0
  for (const [lat, lng] of ring) { sLat += lat; sLng += lng }
  return [sLat / ring.length, sLng / ring.length]
}

/**
 * Hex lattice of candidate centers whose position is inside the polygon.
 * Spacing is distance between neighbour lattice points in km. Using
 * spacing = range * √3 makes a tight hex packing of radius-`range` circles.
 */
function hexGrid(ring, poly, spacingKm) {
  const [minLat, minLng, maxLat, maxLng] = ringBounds(ring)
  const centerLat = (minLat + maxLat) / 2
  const dLat = spacingKm / KM_PER_DEG_LAT
  const dLng = spacingKm / kmPerDegLng(centerLat)
  const rowStep = dLat * Math.sqrt(3) / 2
  const out = []
  let row = 0
  // Extend the scan slightly beyond the bbox so boundary-hugging hexes get in.
  for (let lat = minLat - rowStep; lat <= maxLat + rowStep; lat += rowStep, row++) {
    const offset = (row % 2) * (dLng / 2)
    for (let lng = minLng + offset - dLng; lng <= maxLng + dLng; lng += dLng) {
      if (booleanPointInPolygon(point([lng, lat]), poly)) out.push([lat, lng])
    }
  }
  return out
}

/** Dense grid of sample "pixels" inside the polygon. cellKm controls resolution. */
function buildSampleGrid(ring, poly, cellKm) {
  const [minLat, minLng, maxLat, maxLng] = ringBounds(ring)
  const centerLat = (minLat + maxLat) / 2
  const dLat = cellKm / KM_PER_DEG_LAT
  const dLng = cellKm / kmPerDegLng(centerLat)
  const pts = []
  for (let lat = minLat; lat <= maxLat; lat += dLat) {
    for (let lng = minLng; lng <= maxLng; lng += dLng) {
      if (booleanPointInPolygon(point([lng, lat]), poly)) {
        pts.push({ lat, lng, covered: false })
      }
    }
  }
  return pts
}

/**
 * Greedy max-cover loop. Returns the centers picked (stops when coverage
 * reaches `targetRatio` or no candidate contributes any more).
 */
function greedyMinCover(candidates, samples, rangeKm, targetRatio, maxCenters) {
  if (!candidates.length || !samples.length) return { picks: [], covered: 0, total: samples.length }
  const r2 = rangeKm * rangeKm
  const avail = candidates.map(([lat, lng]) => ({ lat, lng, used: false }))
  const picks = []
  let coveredCount = 0
  const target = Math.ceil(samples.length * targetRatio)

  while (picks.length < maxCenters && coveredCount < target) {
    let bestIdx = -1, bestGain = 0
    for (let i = 0; i < avail.length; i++) {
      const c = avail[i]
      if (c.used) continue
      let gain = 0
      for (let j = 0; j < samples.length; j++) {
        const p = samples[j]
        if (p.covered) continue
        const dKm = haversineKm(c.lat, c.lng, p.lat, p.lng)
        if (dKm * dKm <= r2) gain++
      }
      if (gain > bestGain) { bestGain = gain; bestIdx = i }
    }
    if (bestIdx < 0 || bestGain === 0) break
    const pick = avail[bestIdx]
    pick.used = true
    picks.push([pick.lat, pick.lng])
    for (let j = 0; j < samples.length; j++) {
      const p = samples[j]
      if (p.covered) continue
      const dKm = haversineKm(pick.lat, pick.lng, p.lat, p.lng)
      if (dKm * dKm <= r2) { p.covered = true; coveredCount++ }
    }
  }
  return { picks, covered: coveredCount, total: samples.length }
}

/**
 * Public entry point.
 *
 * @param {Array} ring        [[lat, lng], …] polygon ring
 * @param {Array} productList [{ productId, label, rangeKm }, …] — selected products
 * @param {Object} [opts]
 * @param {number} [opts.targetRatio=0.99]  Minimum fraction of polygon to cover
 * @param {number} [opts.maxCenters=60]     Safety cap
 * @returns {{ centers: Array, coverageRatio: number, driverRangeKm: number, driverProductId: string }}
 *   centers: [{ lat, lng, name, products: [{productId, rangeKm, label}] }]
 */
export function planPlacements(ring, productList, opts = {}) {
  const empty = { centers: [], coverageRatio: 0, driverRangeKm: 0, driverProductId: null }
  if (!ring || ring.length < 3) return empty
  const active = (productList || []).filter((p) => p.rangeKm > 0)
  if (active.length === 0) return empty

  const poly = ringToPolygon(ring)
  if (!poly) return empty

  // Longest-range product drives the layout.
  const driver = active.reduce((a, b) => (b.rangeKm > a.rangeKm ? b : a), active[0])
  const range  = driver.rangeKm

  // Sample grid cell size: scale to driver range so huge areas don't blow up
  // the sample count, but stay fine enough on small areas for accurate gain.
  const cellKm = Math.max(0.5, Math.min(range / 10, 8))

  const samples = buildSampleGrid(ring, poly, cellKm)
  if (samples.length === 0) return empty

  // Candidate centers — tight hex packing + polygon centroid as a fallback
  // for tiny polygons.
  let candidates = hexGrid(ring, poly, range * Math.sqrt(3))
  const centroid = ringCentroid(ring)
  if (booleanPointInPolygon(point([centroid[1], centroid[0]]), poly)) {
    candidates.push(centroid)
  }
  // If hex spacing was too coarse for a small polygon, fall back to a
  // denser grid so we always have candidates.
  if (candidates.length === 0) candidates = hexGrid(ring, poly, range)
  if (candidates.length === 0) candidates = [centroid]

  const targetRatio = opts.targetRatio ?? 0.99
  const maxCenters  = opts.maxCenters  ?? 60

  const { picks, covered, total } = greedyMinCover(candidates, samples, range, targetRatio, maxCenters)

  const centers = picks.map(([lat, lng], i) => ({
    lat, lng,
    name: `Stratejik Merkez #${i + 1}`,
    products: active.map((p) => ({ productId: p.productId, rangeKm: p.rangeKm, label: p.label })),
  }))

  return {
    centers,
    coverageRatio: total === 0 ? 0 : covered / total,
    driverRangeKm: range,
    driverProductId: driver.productId,
  }
}

/**
 * Flatten a plan into the format the store's `applyPlacement` expects:
 * one row per (center × product).
 */
export function planToPlacements(plan) {
  const out = []
  ;(plan?.centers || []).forEach((c, i) => {
    c.products.forEach((p) => {
      out.push({
        productId: p.productId,
        rangeKm:   p.rangeKm,
        lat:       c.lat,
        lng:       c.lng,
        name:      c.name,                  // all products share the same center name
      })
    })
  })
  return out
}
