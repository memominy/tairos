import { useEffect, useRef, useState, useCallback } from 'react'
import L from 'leaflet'
import { useMap } from 'react-leaflet'
import useStore from '../../store/useStore'
import { fetchFromMirrors } from '../../utils/overpass'
import {
  cellsForBounds, getCell, setCell, dedupeElements, pLimit,
} from '../../utils/overpassCache'

/**
 * Shared lifecycle for every Overpass-based overlay (power, internet, water,
 * maritime, cell). Key properties:
 *
 *   · Enable/disable on store toggle
 *   · Zoom guard — below `minZoom` we skip fetching and clear layers
 *   · The current viewport is broken into 0.5° cells. For each cell:
 *       - hit in persistent cache  → use as-is, no network call
 *       - miss                      → fetch, store, then render
 *   · Cached cells are painted IMMEDIATELY; missing cells are filled in
 *     concurrently (up to 3 in parallel) and the whole layer is re-rendered
 *     once everything resolves.
 *   · Abort propagates across mirrors + cells on re-fetch / unmount.
 *
 * Consumer contract:
 *   overlayId    — key under `useStore.activeOverlays` to watch
 *   buildQuery   — (bbox, zoom) → Overpass QL string, called PER CELL
 *   render       — ({ elements, group, map, zoom }) → countsObject
 *                  add Leaflet layers to `group`, return named numeric counts
 *   minZoom      — zoom threshold; below this we show 'zoom' status (default 7)
 *   debounceMs   — moveend debounce (default 800)
 *
 * Returns: { active, status, counts, progress, reload }
 *   progress — { done, total } while loading; total=0 when no fetches queued.
 */
const CONCURRENCY = 3

export function useOverpassOverlay({
  overlayId,
  buildQuery,
  render,
  minZoom = 7,
  debounceMs = 800,
}) {
  const map = useMap()
  const activeOverlays = useStore((s) => s.activeOverlays)
  const active = activeOverlays.has(overlayId)

  const layerRef = useRef(null)
  const abortRef = useRef(null)
  const timerRef = useRef(null)
  // Bumped on each load() invocation — any async work using an older id must
  // bail out, so we never render stale results on top of fresh ones.
  const loadIdRef = useRef(0)

  const [status, setStatus]     = useState(null)    // null|zoom|loading|done|empty|error
  const [counts, setCounts]     = useState({})
  const [progress, setProgress] = useState({ done: 0, total: 0 })

  const load = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort()
    const ac = new AbortController()
    abortRef.current = ac
    const myId = ++loadIdRef.current

    const zoom = map.getZoom()
    if (zoom < minZoom) {
      setStatus('zoom')
      setProgress({ done: 0, total: 0 })
      if (layerRef.current) { layerRef.current.remove(); layerRef.current = null }
      return
    }

    const bounds = map.getBounds()
    const cells  = cellsForBounds(bounds, zoom)
    if (!cells.length) return

    // ── Phase 1: assemble what's cached, note what's missing ──────
    const cellData = new Map()          // cellKey → elements[]
    const missing  = []

    await Promise.all(cells.map(async (c) => {
      const hit = await getCell(overlayId, c.key)
      if (hit) cellData.set(c.key, hit)
      else     missing.push(c)
    }))
    if (ac.signal.aborted || myId !== loadIdRef.current) return

    const renderAll = () => {
      const flat = []
      cellData.forEach((els) => flat.push(...els))
      const deduped = dedupeElements(flat)
      if (layerRef.current) { layerRef.current.remove(); layerRef.current = null }
      const group = L.layerGroup().addTo(map)
      layerRef.current = group
      const result = render({ elements: deduped, group, map, zoom }) || {}
      setCounts(result)
      return Object.values(result).reduce((a, v) => a + (typeof v === 'number' ? v : 0), 0)
    }

    // Paint cached data first so the map never looks blank while fetching.
    if (cellData.size > 0) renderAll()

    // ── Phase 2: if everything was cached, we're done ─────────────
    if (missing.length === 0) {
      const total = renderAll()
      setProgress({ done: 0, total: 0 })
      setStatus(total === 0 ? 'empty' : 'done')
      return
    }

    setStatus('loading')
    setProgress({ done: 0, total: missing.length })

    // ── Phase 3: fetch missing cells with bounded concurrency ─────
    let done = 0
    let anyError = false
    const tasks = missing.map((cell) => async () => {
      if (ac.signal.aborted || myId !== loadIdRef.current) return
      try {
        const query = buildQuery(cell.bbox, zoom)
        const data  = await fetchFromMirrors(query, ac)
        if (ac.signal.aborted || myId !== loadIdRef.current) return
        if (!data || data._error) { anyError = true; return }
        const els = data.elements || []
        cellData.set(cell.key, els)
        // Persist — fire-and-forget so the next cell can start immediately.
        setCell(overlayId, cell.key, els)
      } catch (e) {
        if (e.name !== 'AbortError') anyError = true
      } finally {
        done++
        setProgress({ done, total: missing.length })
      }
    })
    await pLimit(tasks, CONCURRENCY)
    if (ac.signal.aborted || myId !== loadIdRef.current) return

    const total = renderAll()
    setProgress({ done: 0, total: 0 })
    if (anyError && total === 0) setStatus('error')
    else                         setStatus(total === 0 ? 'empty' : 'done')
  }, [map, buildQuery, render, minZoom, overlayId])

  useEffect(() => {
    if (!active) {
      if (abortRef.current) abortRef.current.abort()
      if (layerRef.current) { layerRef.current.remove(); layerRef.current = null }
      setStatus(null)
      setCounts({})
      setProgress({ done: 0, total: 0 })
      return
    }
    load()
    const onMoveEnd = () => {
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(load, debounceMs)
    }
    map.on('moveend', onMoveEnd)
    return () => {
      map.off('moveend', onMoveEnd)
      clearTimeout(timerRef.current)
      if (abortRef.current) abortRef.current.abort()
    }
  }, [active, load, map, debounceMs])

  return { active, status, counts, progress, reload: load }
}
