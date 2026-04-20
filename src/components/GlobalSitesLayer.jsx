import React, { useEffect, useRef, useMemo, useState } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import useStore from '../store/useStore'
import {
  GLOBAL_OPERATORS,
  GLOBAL_SITE_TYPES,
} from '../config/globalSites'

/**
 * Global standing strategic-sites layer.
 *
 * Third and highest rendering pane in the intel stack:
 *
 *   conflict-asset-pane    (z 475) — per-conflict site markers
 *   global-site-pane       (z 478) — this one
 *   conflict-pane          (z 486) — zones, frontlines, conflict bubbles
 *                                    + labels (above global sites so
 *                                    conflict titles dominate when both
 *                                    layers are on)
 *
 * Sits above the per-conflict asset pane so a Ramstein dot is never
 * buried under an asset marker, but below the conflict pane so the
 * operator sees conflict headlines over site chips when they overlap. Data source: `src/data/globalSites.json`
 * — but we import it lazily (via dynamic import) so the ~80 entries
 * don't bloat the initial chunk when the operator never turns the
 * layer on.
 */
export default function GlobalSitesLayer() {
  const map = useMap()

  const on           = useStore((s) => s.globalSitesOn)
  const operators    = useStore((s) => s.globalSiteOperators)
  const region       = useStore((s) => s.globalSiteRegion)
  const minImp       = useStore((s) => s.globalSiteMinImportance)
  const search       = useStore((s) => s.globalSiteSearch)
  const selected     = useStore((s) => s.selectedGlobalSite)
  const hoveredId    = useStore((s) => s.hoveredGlobalSiteId)
  const selectSite   = useStore((s) => s.selectGlobalSite)
  const setHovered   = useStore((s) => s.setHoveredGlobalSite)

  const groupRef   = useRef(null)
  const markersRef = useRef(new Map())
  // importance per site id — kept in sync with markers so the zoom-tier
  // effect below can compute per-marker visual mode without rebuilding.
  const impRef     = useRef(new Map())
  const [data, setData] = useState(null) // lazy-loaded sites array

  // Which zoom tier is currently in effect. Re-computed on `zoomend`.
  // Drives per-marker LOD: at continent view only importance-5 sites
  // render as full chips, everything else collapses to dots or hides.
  const [zoomTier, setZoomTier] = useState(() => tierForZoom(map.getZoom()))
  useEffect(() => {
    const onZoom = () => setZoomTier(tierForZoom(map.getZoom()))
    map.on('zoomend', onZoom)
    return () => { map.off('zoomend', onZoom) }
  }, [map])

  /* Dedicated pane above the conflict-asset pane. */
  useEffect(() => {
    if (!map.getPane('global-site-pane')) {
      const pane = map.createPane('global-site-pane')
      pane.style.zIndex = 478
    }
  }, [map])

  /* Lazy-load the seed data the first time the layer is switched on.
     Keeps the initial bundle smaller for operators who never touch it. */
  useEffect(() => {
    if (!on || data) return
    let cancelled = false
    import('../data/globalSites.json').then((mod) => {
      if (cancelled) return
      setData(Array.isArray(mod.default) ? mod.default : [])
    }).catch(() => {
      // Seed file may not exist yet during incremental development.
      if (!cancelled) setData([])
    })
    return () => { cancelled = true }
  }, [on, data])

  /* Filter pipeline lives in a memo so the layer effect below only
     re-runs when the actual visible set changes. */
  const visible = useMemo(() => {
    if (!on || !data) return []
    const q = search.trim().toLowerCase()
    return data.filter((s) => {
      if (!operators.has(s.operator)) return false
      if (region !== 'all' && s.region !== region) return false
      if ((s.importance || 0) < minImp) return false
      if (q) {
        const hay = `${s.name} ${s.country || ''} ${s.role || ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [on, operators, region, minImp, search, data])

  /* Build / rebuild the layer when visible set changes. */
  useEffect(() => {
    if (groupRef.current) { groupRef.current.remove(); groupRef.current = null }
    markersRef.current.clear()
    impRef.current.clear()
    if (!on || visible.length === 0) return

    const group = L.layerGroup().addTo(map)
    groupRef.current = group

    visible.forEach((s) => {
      const op   = GLOBAL_OPERATORS[s.operator]
      const type = GLOBAL_SITE_TYPES[s.type]
      if (!op || !type) return

      // Clamp importance 1-5 — the seed occasionally omits it.
      const imp        = Math.max(1, Math.min(5, Number(s.importance) || 1))
      const isKeystone = imp >= 5

      // Starting visual mode — computed from current zoom tier so the
      // marker renders at its final layout on first paint (no visible
      // "flash to full then compact" handoff).
      const initialMode = modeForPair(zoomTier, imp)

      if (isKeystone) {
        L.circleMarker([s.lat, s.lng], {
          pane: 'global-site-pane',
          radius: 13,
          color: op.color,
          weight: 1,
          opacity: 0.35,
          fillColor: op.color,
          fillOpacity: 0.1,
          interactive: false,
          className: 'tairos-global-site-halo',
        }).addTo(group)
      }

      const html = `
        <div class="tairos-global-site-marker ${isKeystone ? 'is-keystone' : ''}"
             style="--op-color:${op.color}; --op-accent:${op.accent}">
          <span class="tairos-global-site-glyph">${escapeHtml(type.glyph)}</span>
          <span class="tairos-global-site-op">${escapeHtml(op.label)}</span>
          <span class="tairos-global-site-name">${escapeHtml(s.name)}</span>
          <span class="tairos-global-site-dot" aria-hidden="true"></span>
        </div>
      `
      const marker = L.marker([s.lat, s.lng], {
        pane: 'global-site-pane',
        icon: L.divIcon({
          className: `tairos-global-site op-${s.operator} region-${s.region} type-${s.type} imp-${imp} mode-${initialMode}${isKeystone ? ' is-keystone' : ''}`,
          html,
          iconSize: [0, 0],
          iconAnchor: [0, 0],
        }),
        bubblingMouseEvents: false,
        riseOnHover: true,
      }).addTo(group)
      impRef.current.set(s.id, imp)

      marker.bindPopup(buildPopup(s, op, type), {
        className: 'tairos-global-site-popup',
        offset: [0, -8],
        maxWidth: 280,
      })

      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e)
        selectSite(s)
      })
      marker.on('popupclose', () => {
        const cur = useStore.getState().selectedGlobalSite
        if (cur && cur.id === s.id) useStore.getState().clearGlobalSite()
      })
      marker.on('mouseover', () => setHovered(s.id))
      marker.on('mouseout',  () => setHovered(null))

      markersRef.current.set(s.id, marker)
    })

    return () => {
      if (groupRef.current) { groupRef.current.remove(); groupRef.current = null }
      markersRef.current.clear()
    }
  }, [map, on, visible, selectSite, setHovered])

  /* External hover / selection sync without rebuild. */
  useEffect(() => {
    markersRef.current.forEach((marker, id) => {
      const el = marker.getElement()
      if (!el) return
      const hot = id === hoveredId || id === selected?.id
      el.classList.toggle('is-hot', !!hot)
    })
    if (selected && markersRef.current.has(selected.id)) {
      const m = markersRef.current.get(selected.id)
      if (m && !m.isPopupOpen()) m.openPopup()
    }
  }, [hoveredId, selected])

  /* Zoom tier sync — update each marker's `mode-*` class without
     tearing down and rebuilding the layer. Cheap O(n) class swap. */
  useEffect(() => {
    markersRef.current.forEach((marker, id) => {
      const el = marker.getElement()
      if (!el) return
      const imp = impRef.current.get(id) || 1
      const mode = modeForPair(zoomTier, imp)
      el.classList.remove('mode-full', 'mode-compact', 'mode-dot', 'mode-hidden')
      el.classList.add(`mode-${mode}`)
    })
  }, [zoomTier])

  return null
}

/* ── LOD / importance hierarchy helpers ─────────────────────────
   We don't rebuild on every zoom tick — instead each marker carries
   an `imp-N` class and, via `modeForPair`, a `mode-{full|compact|
   dot|hidden}` class that's hot-swapped when the zoom tier changes.
   Stylesheet drives the actual visual transformation from those
   classes, which keeps this file free of per-marker DOM tweaks. */

function tierForZoom(z) {
  const n = Math.round(z ?? 0)
  if (n <= 3) return 'continent'   // world view
  if (n <= 5) return 'region'      // multi-country
  if (n <= 7) return 'country'     // single country
  return 'local'                    // city / sub-country
}

/**
 * Effective visual mode per (zoom tier, importance) pair.
 *
 *   full    — normal chip (glyph + operator tag + name)
 *   compact — chip with the name stripped
 *   dot     — collapsed to a coloured dot (hover peeks the chip)
 *   hidden  — not rendered
 *
 * The table intentionally keeps keystones (5) always full, so the
 * operator can still see the highest-priority sites at any zoom.
 * Low-importance sites fade out first as the camera pulls back.
 */
const MODE_TABLE = {
  continent: { 5: 'full', 4: 'dot',     3: 'hidden',  2: 'hidden', 1: 'hidden' },
  region:    { 5: 'full', 4: 'full',    3: 'dot',     2: 'hidden', 1: 'hidden' },
  country:   { 5: 'full', 4: 'full',    3: 'full',    2: 'dot',    1: 'hidden' },
  local:     { 5: 'full', 4: 'full',    3: 'full',    2: 'compact', 1: 'dot'   },
}

function modeForPair(tier, imp) {
  const n = Math.max(1, Math.min(5, imp || 1))
  return MODE_TABLE[tier]?.[n] || 'full'
}

/* ── helpers ────────────────────────────────────────────────────── */

function buildPopup(site, op, type) {
  const imp = Math.max(0, Math.min(5, site.importance || 0))
  const impPips = Array.from({ length: 5 })
    .map((_, i) => `<span class="tairos-global-site-imp-pip ${i < imp ? 'filled' : ''}"></span>`)
    .join('')
  const tags = Array.isArray(site.tags) && site.tags.length
    ? `<div class="tairos-global-site-popup-tags">
         ${site.tags.map((t) => `<span class="tairos-global-site-popup-tag">${escapeHtml(t)}</span>`).join('')}
       </div>`
    : ''
  const since = site.since
    ? `<span class="tairos-global-site-popup-since">· ${escapeHtml(String(site.since))}</span>`
    : ''
  return `
    <div class="tairos-global-site-popup-inner" style="--op-color:${op.color}; --op-accent:${op.accent}">
      <div class="tairos-global-site-popup-head">
        <span class="tairos-global-site-popup-glyph">${escapeHtml(type.glyph)}</span>
        <div class="tairos-global-site-popup-titles">
          <div class="tairos-global-site-popup-op">${escapeHtml(op.labelLong)}</div>
          <div class="tairos-global-site-popup-name">${escapeHtml(site.name)}</div>
          <div class="tairos-global-site-popup-meta">
            ${escapeHtml(type.label)} · ${escapeHtml(site.country || '—')} ${since}
          </div>
        </div>
      </div>
      <div class="tairos-global-site-popup-importance">
        <span class="tairos-global-site-popup-imp-label">önem</span>
        <span class="tairos-global-site-popup-imp-pips">${impPips}</span>
      </div>
      ${site.role ? `<div class="tairos-global-site-popup-role">${escapeHtml(site.role)}</div>` : ''}
      ${tags}
    </div>
  `
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
