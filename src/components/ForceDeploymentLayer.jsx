import React, { useEffect, useRef, useMemo, useState } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import useStore from '../store/useStore'
import {
  UNIT_TYPES,
  ECHELONS,
  FORCE_SIDE_COLOUR,
} from '../config/forceDeployments'

/**
 * Force deployment layer — in-theatre formations and HQs.
 *
 * Fourth and topmost markers-layer pane in the intel stack. Sits above
 * global sites (478) but below conflict bubbles (486) so conflict
 * headlines still dominate when the camera pulls back:
 *
 *   conflict-asset-pane  (475)
 *   global-site-pane     (478)
 *   force-deploy-pane    (480)  ← this layer
 *   conflict-pane        (486)
 *
 * Visual language:
 *   • A framed shield, side-tinted (steel-blue A / brick-red B), with the
 *     unit-type glyph in the centre and echelon pips clipped to the top
 *     edge.
 *   • A "saha" strap under the shield carries the formation name at
 *     closer zooms (≥ country), truncates at wider zooms.
 *   • Zoom tier gates visual mode: at continent view only army-grade+
 *     render, brigade+ at region, everything at country/local.
 *
 * Data source: `src/data/forceDeployments.json`, loaded lazily the first
 * time the operator switches the layer on so the ~200-unit seed doesn't
 * bloat the initial bundle.
 */
export default function ForceDeploymentLayer() {
  const map = useMap()

  const on             = useStore((s) => s.forceDeployOn)
  const sides          = useStore((s) => s.forceDeploySides)
  const kindFilter     = useStore((s) => s.forceDeployKindFilter)
  const minEchelon     = useStore((s) => s.forceDeployMinEchelon)
  const scope          = useStore((s) => s.forceDeployScope)
  const search         = useStore((s) => s.forceDeploySearch)
  const selectedDeploy = useStore((s) => s.selectedDeployUnit)
  const hoveredId      = useStore((s) => s.hoveredDeployUnitId)
  const selectedConflict = useStore((s) => s.selectedConflict)
  const selectUnit     = useStore((s) => s.selectDeployUnit)
  const setHovered     = useStore((s) => s.setHoveredDeployUnit)

  const groupRef   = useRef(null)
  const markersRef = useRef(new Map())
  const [data, setData] = useState(null) // lazy-loaded units array

  // Zoom tier for LOD — re-computed on zoomend. Drives per-marker mode
  // class swap so we never have to rebuild the whole layer on zoom.
  const [zoomTier, setZoomTier] = useState(() => tierForZoom(map.getZoom()))
  useEffect(() => {
    const onZoom = () => setZoomTier(tierForZoom(map.getZoom()))
    map.on('zoomend', onZoom)
    return () => { map.off('zoomend', onZoom) }
  }, [map])

  /* Dedicated pane between global-site and conflict panes. */
  useEffect(() => {
    if (!map.getPane('force-deploy-pane')) {
      const pane = map.createPane('force-deploy-pane')
      pane.style.zIndex = 480
    }
  }, [map])

  /* Lazy-load the seed the first time the operator turns the layer on. */
  useEffect(() => {
    if (!on || data) return
    let cancelled = false
    import('../data/forceDeployments.json').then((mod) => {
      if (cancelled) return
      setData(flattenForceData(mod.default))
    }).catch(() => {
      if (!cancelled) setData([])
    })
    return () => { cancelled = true }
  }, [on, data])

  /* Filter pipeline — memoised so the layer effect only re-fires when
     the visible unit set actually changes. */
  const visible = useMemo(() => {
    if (!on || !data) return []
    const q = search.trim().toLowerCase()
    return data.filter((u) => {
      if (!sides.has(u.side)) return false
      const type = UNIT_TYPES[u.type]
      if (!type) return false
      if (kindFilter !== 'all' && type.kind !== kindFilter) return false
      const ech = ECHELONS[u.echelon]
      if (ech && minEchelon > 0 && ech.weight < minEchelon) return false
      if (scope === 'selected-conflict') {
        if (!selectedConflict?.id) return false
        if (u.conflict !== selectedConflict.id) return false
      }
      if (q) {
        const hay = `${u.name} ${u.formation || ''} ${u.note || ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [on, data, sides, kindFilter, minEchelon, scope, selectedConflict, search])

  /* Build the layer when the visible set changes. */
  useEffect(() => {
    if (groupRef.current) { groupRef.current.remove(); groupRef.current = null }
    markersRef.current.clear()
    if (!on || visible.length === 0) return

    const group = L.layerGroup().addTo(map)
    groupRef.current = group

    visible.forEach((u) => {
      const type = UNIT_TYPES[u.type]
      const ech  = ECHELONS[u.echelon] || ECHELONS.battalion
      if (!type) return

      const sideColour = FORCE_SIDE_COLOUR[u.side] || FORCE_SIDE_COLOUR.A
      const initialMode = modeForPair(zoomTier, ech.weight)

      const html = `
        <div class="tairos-force-marker side-${u.side} kind-${type.kind} mode-${initialMode}"
             style="--side-color:${sideColour}; --unit-color:${type.color}">
          <div class="tairos-force-marker-shield">
            <span class="tairos-force-marker-pips">${escapeHtml(ech.pips)}</span>
            <span class="tairos-force-marker-glyph">${escapeHtml(type.glyph)}</span>
          </div>
          <div class="tairos-force-marker-strap">
            <span class="tairos-force-marker-short">${escapeHtml(type.short)}</span>
            <span class="tairos-force-marker-name">${escapeHtml(u.name)}</span>
          </div>
        </div>
      `

      const marker = L.marker([u.lat, u.lng], {
        pane: 'force-deploy-pane',
        icon: L.divIcon({
          className: `tairos-force-deploy side-${u.side} kind-${type.kind} type-${u.type} echelon-${u.echelon} mode-${initialMode}`,
          html,
          iconSize: [0, 0],
          iconAnchor: [0, 0],
        }),
        bubblingMouseEvents: false,
        riseOnHover: true,
      }).addTo(group)

      // Click → open the rich ForceDeployDetailPanel via the store. The
      // in-map Leaflet popup was replaced by a slide-in detail card so
      // "S-300" and friends can show full intel (SAM range, parent HQ,
      // subordinates, doctrine) rather than just a 300px tooltip.
      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e)
        selectUnit(u)
      })
      marker.on('mouseover', () => setHovered(u.id))
      marker.on('mouseout',  () => setHovered(null))

      markersRef.current.set(u.id, marker)
    })

    return () => {
      if (groupRef.current) { groupRef.current.remove(); groupRef.current = null }
      markersRef.current.clear()
    }
    // zoomTier intentionally omitted — mode class is swapped below
  }, [map, on, visible, selectUnit, setHovered])

  /* Hover / selection sync without rebuild. Selection just toggles the
     is-hot class on the marker — the actual detail panel lives in
     ForceDeployDetailPanel and reads the same store key directly. */
  useEffect(() => {
    markersRef.current.forEach((marker, id) => {
      const el = marker.getElement()
      if (!el) return
      const hot = id === hoveredId || id === selectedDeploy?.id
      el.classList.toggle('is-hot', !!hot)
    })
  }, [hoveredId, selectedDeploy])

  /* Zoom tier sync — O(n) class swap on zoom. */
  useEffect(() => {
    markersRef.current.forEach((marker) => {
      const el = marker.getElement()
      if (!el) return
      const weight = weightFromElement(el)
      const mode = modeForPair(zoomTier, weight)
      el.classList.remove('mode-full', 'mode-compact', 'mode-dot', 'mode-hidden')
      el.classList.add(`mode-${mode}`)
      const inner = el.querySelector('.tairos-force-marker')
      if (inner) {
        inner.classList.remove('mode-full', 'mode-compact', 'mode-dot', 'mode-hidden')
        inner.classList.add(`mode-${mode}`)
      }
    })
  }, [zoomTier])

  return null
}

/**
 * The seed JSON is keyed by conflict id (`{ "ukraine-russia": [...] }`)
 * rather than a flat array — that groups the raw data nicely for hand-
 * editing, but we want a flat, conflict-tagged list at runtime so the
 * filter pipeline can treat everything uniformly. This helper handles
 * both shapes (legacy/flat arrays too) so older formats keep working.
 */
function flattenForceData(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  const out = []
  Object.keys(raw).forEach((conflictId) => {
    const arr = raw[conflictId]
    if (!Array.isArray(arr)) return
    arr.forEach((u) => {
      if (!u) return
      out.push({ ...u, conflict: u.conflict || conflictId })
    })
  })
  return out
}

/* ── LOD helpers ─────────────────────────────────────────── */

function tierForZoom(z) {
  const n = Math.round(z ?? 0)
  if (n <= 3) return 'continent'
  if (n <= 5) return 'region'
  if (n <= 7) return 'country'
  return 'local'
}

/**
 * Per-tier visibility per echelon weight. Army-grade (weight ≥ 5) always
 * renders full so the operator can still see strategic formations at
 * world view. Battalions only appear at local zoom.
 */
const MODE_TABLE = {
  continent: { 6: 'full', 5: 'full',    4: 'dot',     3: 'hidden', 2: 'hidden', 1.5: 'hidden', 1: 'hidden', 2.5: 'hidden' },
  region:    { 6: 'full', 5: 'full',    4: 'full',    3: 'compact', 2: 'dot',    1.5: 'hidden', 1: 'hidden', 2.5: 'compact' },
  country:   { 6: 'full', 5: 'full',    4: 'full',    3: 'full',    2: 'full',   1.5: 'compact', 1: 'dot',   2.5: 'full' },
  local:     { 6: 'full', 5: 'full',    4: 'full',    3: 'full',    2: 'full',   1.5: 'full',    1: 'full',  2.5: 'full' },
}

function modeForPair(tier, weight) {
  const w = weight ?? 1
  return MODE_TABLE[tier]?.[w] || 'full'
}

function weightFromElement(el) {
  // Read back weight by looking for echelon-* class
  const cls = Array.from(el.classList || []).find((c) => c.startsWith('echelon-'))
  if (!cls) return 1
  const key = cls.slice('echelon-'.length)
  return ECHELONS[key]?.weight ?? 1
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
