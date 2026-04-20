import { useState, useEffect, useRef, useCallback } from 'react'
import {
  computeUnionPolygon,
  polygonAreaKm2,
  areaCoveragePercent,
  populationCoveragePercent,
} from '../utils/coverage'
import provinces from '../data/provinces.json'

/**
 * Computes coverage polygon and stats for a given set of facilities + range.
 * Debounced to avoid recomputing on every slider tick.
 */
export function useCoverage(facilities, rangeKm, debounceMs = 400) {
  const [polygon, setPolygon] = useState(null)
  const [stats, setStats] = useState({ area: 0, areaPercent: 0, popPercent: 0 })
  const [computing, setComputing] = useState(false)
  const timerRef = useRef(null)
  const abortRef = useRef(false)

  const compute = useCallback(() => {
    abortRef.current = true   // cancel any in-flight
    setComputing(true)

    // Yield to the browser before heavy computation
    setTimeout(() => {
      abortRef.current = false
      const poly = computeUnionPolygon(facilities, rangeKm)
      if (abortRef.current) return   // superseded by a newer call
      const areaKm2 = polygonAreaKm2(poly)
      const areaPercent = areaCoveragePercent(areaKm2)
      const popPercent = populationCoveragePercent(poly, provinces)
      setPolygon(poly)
      setStats({ area: areaKm2, areaPercent, popPercent })
      setComputing(false)
    }, 0)
  }, [facilities, rangeKm])

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(compute, debounceMs)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [compute, debounceMs])

  return { polygon, stats, computing }
}
