/**
 * Persistent, tile-based Overpass cache (IndexedDB with a localStorage fallback).
 *
 * The world is snapped to a fixed 0.5° × 0.5° grid. Each overlay keeps one
 * record per visited cell, tagged with a fetch timestamp. Records older than
 * TTL_MS or exceeding MAX_CELLS_PER_OVERLAY are evicted (LRU on timestamp).
 *
 * Why this shape?
 *   · A fixed grid means panning back to a visited area is a free hit — we
 *     never re-fetch cells that were already answered.
 *   · 0.5° cells are small enough that a typical viewport covers 4–25 of
 *     them (manageable concurrency), but big enough to keep overall cell
 *     counts well under the cap.
 *   · IndexedDB handles the volume; localStorage is a last-resort fallback.
 */

const DB_NAME  = 'tairos-overpass-cache'
const STORE    = 'cells'
const LS_KEY   = 'tairos-overpass-cache-v1'
const TTL_MS   = 14 * 24 * 60 * 60 * 1000   // 14 days
const MAX_CELLS_PER_OVERLAY = 80
/** Legacy export retained for callers that want a fixed reference. */
export const CELL_SIZE_DEG = 0.5

/**
 * Zoom-adaptive cell size. At very low zoom the viewport covers thousands of
 * kilometres — if we kept 0.5° cells we'd fire hundreds of Overpass requests.
 * Bigger cells at low zoom keep the request count sane while the query itself
 * is expected to apply aggressive filtering (e.g. "only ≥154 kV lines") so the
 * per-cell payload stays small.
 *
 *   z ≥ 10  →  0.5°   (~55 km)   — fine-grain detail
 *   z ≥ 8   →  1.0°   (~110 km)  — regional
 *   z ≥ 6   →  2.0°   (~220 km)  — major infra only
 *   z < 6   →  4.0°   (~440 km)  — backbone only
 */
export function cellSizeForZoom(zoom) {
  if (zoom >= 10) return 0.5
  if (zoom >= 8)  return 1
  if (zoom >= 6)  return 2
  return 4
}

/* ── IndexedDB wrapper ─────────────────────────────────── */
let dbPromise
function idb() {
  if (dbPromise) return dbPromise
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('no idb'))
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror   = () => reject(req.error)
  })
  return dbPromise
}

async function idbGet(key) {
  try {
    const db = await idb()
    return await new Promise((res) => {
      const tx = db.transaction(STORE, 'readonly')
      const r  = tx.objectStore(STORE).get(key)
      r.onsuccess = () => res(r.result || null)
      r.onerror   = () => res(null)
    })
  } catch { return null }
}

async function idbPut(key, value) {
  try {
    const db = await idb()
    await new Promise((res) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(value, key)
      tx.oncomplete = () => res()
      tx.onerror   = () => res()
      tx.onabort   = () => res()
    })
  } catch {}
}

async function idbGetAllKeys() {
  try {
    const db = await idb()
    return await new Promise((res) => {
      const tx = db.transaction(STORE, 'readonly')
      const r  = tx.objectStore(STORE).getAllKeys()
      r.onsuccess = () => res(r.result || [])
      r.onerror   = () => res([])
    })
  } catch { return [] }
}

async function idbDelete(key) {
  try {
    const db = await idb()
    await new Promise((res) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(key)
      tx.oncomplete = () => res()
      tx.onerror   = () => res()
    })
  } catch {}
}

/* ── localStorage fallback ─────────────────────────────── */
function lsLoad() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}') } catch { return {} }
}
function lsSave(cache) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(cache)) }
  catch {
    // Quota hit — halve caches and retry once.
    Object.keys(cache).forEach((oid) => {
      const entries = Object.entries(cache[oid] || {})
        .sort((a, b) => (b[1].t || 0) - (a[1].t || 0))
      cache[oid] = Object.fromEntries(entries.slice(0, Math.floor(MAX_CELLS_PER_OVERLAY / 2)))
    })
    try { localStorage.setItem(LS_KEY, JSON.stringify(cache)) } catch {}
  }
}

/* ── Element compaction — strip metadata we never render ── */
function compactElement(el) {
  if (!el) return el
  if (el.type === 'node') {
    return { type: 'node', id: el.id, lat: el.lat, lon: el.lon, tags: el.tags }
  }
  if (el.type === 'way') {
    return { type: 'way', id: el.id, geometry: el.geometry, tags: el.tags }
  }
  if (el.type === 'relation') {
    return { type: 'relation', id: el.id, members: el.members, tags: el.tags }
  }
  return el
}
function compactElements(list) { return (list || []).map(compactElement) }

/* ── Public API ────────────────────────────────────────── */

/**
 * Compute the cell key for a point on the (zoom-dependent) grid.
 * Keys are strings of the form "size/cy_cx" so cells at different resolutions
 * never collide — a z5 2° cell and a z11 0.5° cell get distinct records even
 * when they overlap geographically.
 */
export function cellKeyFor(lat, lng, zoom = 11) {
  const size = cellSizeForZoom(zoom)
  return `${size}/${Math.floor(lat / size)}_${Math.floor(lng / size)}`
}

/**
 * List of { key, bbox } cells that cover a Leaflet LatLngBounds at a given
 * zoom. Cell size is chosen automatically — coarser at low zoom to keep the
 * number of requests manageable.
 */
export function cellsForBounds(bounds, zoom = 11) {
  const size = cellSizeForZoom(zoom)
  const s = Math.floor(bounds.getSouth() / size)
  const n = Math.floor(bounds.getNorth() / size)
  const w = Math.floor(bounds.getWest()  / size)
  const e = Math.floor(bounds.getEast()  / size)
  const cells = []
  for (let cy = s; cy <= n; cy++) {
    for (let cx = w; cx <= e; cx++) {
      const south = cy * size
      const west  = cx * size
      const north = south + size
      const east  = west  + size
      cells.push({
        key:  `${size}/${cy}_${cx}`,
        bbox: `${south.toFixed(3)},${west.toFixed(3)},${north.toFixed(3)},${east.toFixed(3)}`,
      })
    }
  }
  return cells
}

/**
 * Retrieve cached elements for a cell, or null when missing/expired.
 * IndexedDB is tried first; localStorage is a fallback for browsers or
 * contexts where IDB is unavailable.
 */
export async function getCell(overlayId, cellKey) {
  const k = `${overlayId}/${cellKey}`
  const rec = await idbGet(k)
  if (rec) {
    if (Date.now() - (rec.t || 0) > TTL_MS) { idbDelete(k); return null }
    return rec.els
  }
  // localStorage fallback
  const ls = lsLoad()
  const lsRec = ls?.[overlayId]?.[cellKey]
  if (!lsRec) return null
  if (Date.now() - (lsRec.t || 0) > TTL_MS) return null
  return lsRec.els
}

/** Write elements for a cell and enforce the per-overlay LRU cap. */
export async function setCell(overlayId, cellKey, elements) {
  const compact = compactElements(elements)
  const payload = { t: Date.now(), els: compact }
  const k = `${overlayId}/${cellKey}`

  await idbPut(k, payload)
  // LRU prune: read all keys for this overlay, drop oldest beyond cap.
  try {
    const allKeys = await idbGetAllKeys()
    const mine = allKeys.filter((x) => typeof x === 'string' && x.startsWith(`${overlayId}/`))
    if (mine.length > MAX_CELLS_PER_OVERLAY) {
      const entries = await Promise.all(mine.map(async (x) => {
        const r = await idbGet(x)
        return [x, r?.t || 0]
      }))
      entries.sort((a, b) => b[1] - a[1])           // newest first
      const keepers = new Set(entries.slice(0, MAX_CELLS_PER_OVERLAY).map(([x]) => x))
      await Promise.all(entries.filter(([x]) => !keepers.has(x)).map(([x]) => idbDelete(x)))
    }
  } catch {}

  // Mirror to localStorage as a last-resort fallback (keeps a tiny recent view).
  try {
    const ls = lsLoad()
    if (!ls[overlayId]) ls[overlayId] = {}
    ls[overlayId][cellKey] = payload
    // Cap localStorage at 8 cells per overlay to stay under quota.
    const ks = Object.keys(ls[overlayId])
    if (ks.length > 8) {
      const sorted = ks.map((k2) => [k2, ls[overlayId][k2].t || 0]).sort((a, b) => b[1] - a[1])
      ls[overlayId] = Object.fromEntries(sorted.slice(0, 8).map(([k2]) => [k2, ls[overlayId][k2]]))
    }
    lsSave(ls)
  } catch {}
}

/** Clear all cached cells for a specific overlay (used by a "refresh" action). */
export async function clearOverlayCache(overlayId) {
  try {
    const allKeys = await idbGetAllKeys()
    const mine = allKeys.filter((x) => typeof x === 'string' && x.startsWith(`${overlayId}/`))
    await Promise.all(mine.map((x) => idbDelete(x)))
  } catch {}
  try {
    const ls = lsLoad()
    delete ls[overlayId]
    lsSave(ls)
  } catch {}
}

/** Wipe every overlay's cache (used by a "clear all overlays" action). */
export async function clearAllOverlayCache() {
  try {
    const keys = await idbGetAllKeys()
    await Promise.all(keys.map((k) => idbDelete(k)))
  } catch {}
  try { localStorage.removeItem(LS_KEY) } catch {}
}

/** Dedupe elements by (type,id). Needed because adjacent cells can share ways. */
export function dedupeElements(list) {
  const seen = new Set()
  const out  = []
  for (const el of list) {
    const k = `${el.type}/${el.id}`
    if (seen.has(k)) continue
    seen.add(k)
    out.push(el)
  }
  return out
}

/** Simple concurrency limiter for cell fetches. */
export async function pLimit(tasks, limit) {
  const results = new Array(tasks.length)
  let i = 0
  const worker = async () => {
    while (i < tasks.length) {
      const idx = i++
      try { results[idx] = await tasks[idx]() }
      catch (e) { results[idx] = { _error: e } }
    }
  }
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, worker)
  await Promise.all(workers)
  return results
}
