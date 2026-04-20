import circle from '@turf/circle'
import union from '@turf/union'
import area from '@turf/area'
import booleanPointInPolygon from '@turf/boolean-point-in-polygon'
import { point, featureCollection } from '@turf/helpers'
import { TURKEY_AREA_KM2, TURKEY_POPULATION } from '../config/categories'

/**
 * Recursively merge an array of GeoJSON polygons using divide-and-conquer.
 * Much faster and more numerically stable than sequential union.
 */
export function mergePolygons(polys) {
  if (polys.length === 0) return null
  if (polys.length === 1) return polys[0]

  const mid = Math.floor(polys.length / 2)
  const left  = mergePolygons(polys.slice(0, mid))
  const right = mergePolygons(polys.slice(mid))

  if (!left)  return right
  if (!right) return left

  try {
    const merged = union(featureCollection([left, right]))
    return merged || left
  } catch {
    return left
  }
}

/**
 * Build union polygon from a list of facility {lat, lng} and a range in km.
 * Returns a GeoJSON Feature (Polygon or MultiPolygon) or null.
 */
export function computeUnionPolygon(facilities, rangeKm) {
  if (!facilities || facilities.length === 0) return null

  // 48 steps → smooth enough visually, fast enough for 200+ circles
  const steps = 48

  const circles = facilities.map((f) =>
    circle([f.lng, f.lat], rangeKm, { steps, units: 'kilometers' })
  )

  return mergePolygons(circles)
}

/**
 * Area of a GeoJSON polygon in km².
 */
export function polygonAreaKm2(polygon) {
  if (!polygon) return 0
  try {
    const m2 = area(polygon)
    return Math.round(m2 / 1_000_000)
  } catch {
    return 0
  }
}

/**
 * Area coverage as percent of Turkey.
 */
export function areaCoveragePercent(areaKm2) {
  return Math.min((areaKm2 / TURKEY_AREA_KM2) * 100, 100)
}

/**
 * Sum population of provinces whose centroid falls inside the polygon.
 */
export function populationCoveragePercent(polygon, provinces) {
  if (!polygon || !provinces || provinces.length === 0) return 0
  try {
    const coveredPop = provinces
      .filter((p) => {
        try {
          return booleanPointInPolygon(point([p.lng, p.lat]), polygon)
        } catch {
          return false
        }
      })
      .reduce((sum, p) => sum + p.population, 0)
    return Math.min((coveredPop / TURKEY_POPULATION) * 100, 100)
  } catch {
    return 0
  }
}
