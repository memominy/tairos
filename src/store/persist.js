/**
 * Debounced localStorage persistence layer.
 *
 * The store exposes many setters that each write their slice to
 * localStorage (nodes, groups, facility products, saved views, …).
 * In the previous version these writes were synchronous — every setter
 * immediately `JSON.stringify`'d its payload and called
 * `localStorage.setItem`. Two problems:
 *
 *   1. Batch operations (applyPlacement, operator-wide migrations,
 *      area-group bulk remove) wrote the same slice many times in a
 *      row. Each write blocked the main thread for 5-50ms on large
 *      payloads — operators felt this as "kasma" when drawing
 *      polygons or applying mass changes.
 *   2. Unrelated state churn (drag, zoom, camera moves) occasionally
 *      triggered persistence paths, serialising hot state needlessly.
 *
 * This module coalesces rapid writes per-key: a call to
 * `schedulePersist(key, payload)` stores the latest payload and
 * schedules a single flush after `DEBOUNCE_MS`. Subsequent calls
 * before the timer fires just update the pending payload. On
 * `beforeunload` we flush everything pending so no data is lost.
 *
 * The public API is a tiny factory that returns a function shaped
 * like the old synchronous persist helpers:
 *
 *   const persistNodes = makePersister(NODE_STORAGE_KEY)
 *   persistNodes(nextNodes)   // debounced write
 *
 * Legacy helpers that want immediate persistence (rare — only the
 * seed migration path on first load) can call `flushPersist(key)` or
 * `flushAllPersist()` right after.
 */

const DEBOUNCE_MS = 250

/** key → pending payload (latest wins) */
const pending = new Map()
/** key → active timeout handle */
const timers = new Map()

function writeNow(key) {
  const payload = pending.get(key)
  pending.delete(key)
  const handle = timers.get(key)
  if (handle !== undefined) {
    clearTimeout(handle)
    timers.delete(key)
  }
  if (payload === undefined) return
  try {
    localStorage.setItem(key, JSON.stringify(payload))
  } catch {
    // Quota exceeded / storage unavailable — swallow silently so the
    // store stays usable even in private-mode or constrained contexts.
  }
}

export function schedulePersist(key, payload) {
  pending.set(key, payload)
  if (timers.has(key)) return
  const handle = setTimeout(() => writeNow(key), DEBOUNCE_MS)
  timers.set(key, handle)
}

/** Force-write a single key immediately (bypassing the timer). */
export function flushPersist(key) {
  if (pending.has(key)) writeNow(key)
}

/** Force-write every pending key — called on page unload. */
export function flushAllPersist() {
  for (const key of Array.from(pending.keys())) writeNow(key)
}

/** Factory: returns a debounced persister for a fixed storage key. */
export function makePersister(key) {
  return (payload) => schedulePersist(key, payload)
}

/* ── Page-unload flush ───────────────────────────────────────
 * `beforeunload` fires before the tab closes / reloads / navigates
 * away. We synchronously flush every pending write so the user's
 * last change makes it to disk. `pagehide` is the modern equivalent
 * on mobile — Safari in particular prefers it for bfcache friendliness. */
if (typeof window !== 'undefined') {
  const flush = () => flushAllPersist()
  window.addEventListener('beforeunload', flush)
  window.addEventListener('pagehide',     flush)
  // Also flush when the tab becomes hidden (user switches apps, locks
  // the screen, etc.) — mirrors the behaviour of IndexedDB-backed
  // persistence libraries.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush()
  })
}
