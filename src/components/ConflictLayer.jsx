import React, { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import useStore from '../store/useStore'
import conflicts from '../data/conflicts.json'

/**
 * Conflict Intel map layer.
 *
 * Renders a declarative set of geometry per conflict entry:
 *
 *   1. Theatre polygon    — the broader combat environment envelope, if
 *                           present. Rendered first so it sits beneath
 *                           everything else as a hazard-zone backdrop with
 *                           a dashed amber border.
 *   2. Contested zones    — translucent polygons colour-coded by `side`:
 *                           side-A uses a cool steel-blue, side-B a warm
 *                           brick tone. Zones without a side fall back to
 *                           the conflict's status colour. A centroid tag
 *                           carries the `controlledBy` actor.
 *   3. Frontline          — polyline with two small endpoint tags carrying
 *                           the `sideA` / `sideB` party names so the viewer
 *                           can read who holds which side at a glance.
 *   4. Hotspots           — small circle + label (divIcon) for named
 *                           flashpoints inside a conflict theatre.
 *   5. Country bubble     — CircleMarker at `bubble.lat/lng`, colour by
 *                           status, radius by severity (1–5). Rendered last
 *                           so it sits on top and stays the primary click
 *                           target. Interactive.
 *
 * Palette: pulled back from the original neon reds/ambers to a muted
 * command-map tone — the surface is meant to feel tactical, not game-y.
 * No animated halos, no dash-march: just a single dashed stroke and a
 * gentle pulse on the bubble outer ring.
 *
 * Side palette: the side-A / side-B split uses semantically neutral
 * chromatic opposites (cool vs warm) so the viewer reads "opposing
 * actors" rather than "good vs bad". Independent of status colour.
 *
 * Clicking a bubble fires `selectConflict(c)` → opens the detail panel.
 * Hovering a bubble highlights it (and the matching sidebar row via
 * `hoveredConflictId`). All geometry is declarative from the seed JSON.
 *
 * Performance note: everything lives on a single `L.layerGroup` that is
 * removed/rebuilt when `conflictsOn` or `conflictStatusFilter` flip. The
 * seed list is small (~15), so rebuild cost is negligible.
 */
export default function ConflictLayer() {
  const map = useMap()

  const on          = useStore((s) => s.conflictsOn)
  const filter      = useStore((s) => s.conflictStatusFilter)
  const hoveredId   = useStore((s) => s.hoveredConflictId)
  const selected    = useStore((s) => s.selectedConflict)
  const select      = useStore((s) => s.selectConflict)
  const setHovered  = useStore((s) => s.setHoveredConflict)

  const groupRef    = useRef(null)
  const bubblesRef  = useRef(new Map())   // id → { outer, inner, label }

  /* Dedicated pane ensures conflict geometry sits above overlays but below
     the area-selection rectangle so it doesn't eat right-drag events.
     Bumped to 486 so conflict labels + bubbles render on top of the
     global-site chips (pane 478) — the operator wanted conflict headings
     to dominate when both layers are on. Polygons on this pane are
     `interactive: false` and have fillOpacity ≤ 0.12, so they don't
     meaningfully occlude the sites under them. */
  useEffect(() => {
    const pane = map.getPane('conflict-pane') || map.createPane('conflict-pane')
    pane.style.zIndex = 486
  }, [map])

  /* Build / rebuild the whole layer when visibility or filter changes. */
  useEffect(() => {
    // Tear down any previous render first.
    if (groupRef.current) { groupRef.current.remove(); groupRef.current = null }
    bubblesRef.current.clear()
    if (!on) return

    const group = L.layerGroup().addTo(map)
    groupRef.current = group

    const visible = conflicts.filter((c) => filter === 'all' || c.status === filter)

    visible.forEach((c) => {
      const colour = statusColour(c.status)
      const r      = bubbleRadius(c.severity)

      // ── Theatre envelope (drawn first, sits underneath) ────
      // Broader combat environment. Distinctive dashed amber border +
      // low-opacity fill + a single centroid label in the conflict's
      // status colour so it doesn't fight the side-zone palette.
      if (c.theatre && Array.isArray(c.theatre.polygon) && c.theatre.polygon.length >= 3) {
        L.polygon(c.theatre.polygon, {
          pane: 'conflict-pane',
          color: '#C9A236',           // muted amber hazard stroke
          weight: 1.2,
          opacity: 0.55,
          dashArray: '2 5',
          fillColor: '#C9A236',
          fillOpacity: 0.05,
          interactive: false,
          className: 'tairos-theatre-zone',
        }).addTo(group)

        if (c.theatre.label) {
          const [tlat, tlng] = polygonCentroid(c.theatre.polygon)
          L.marker([tlat, tlng], {
            pane: 'conflict-pane',
            interactive: false,
            icon: L.divIcon({
              className: 'tairos-theatre-label',
              html: `<span class="tairos-theatre-label-inner">
                       <span class="tairos-theatre-label-tag">ÇATIŞMA SAHASI</span>
                       <span class="tairos-theatre-label-name">${escapeHtml(c.theatre.label)}</span>
                     </span>`,
              iconSize: [0, 0],
              iconAnchor: [0, 0],
            }),
          }).addTo(group)
        }
      }

      // ── Contested zones (side-differentiated palette) ────
      // Side A = cool steel-blue, Side B = warm brick. Unsided zones
      // keep the conflict's status colour so legacy entries still read.
      ;(c.contested || []).forEach((zone) => {
        const sideColour = zoneColour(zone.side, colour)
        L.polygon(zone.polygon, {
          pane: 'conflict-pane',
          color: sideColour,
          weight: 1.1,
          opacity: 0.55,
          dashArray: '4 3',
          fillColor: sideColour,
          fillOpacity: 0.12,
          interactive: false,
          className: `tairos-zone side-${(zone.side || 'n').toLowerCase()}`,
        }).addTo(group)

        // "Controlled by" centroid tag.
        if (zone.controlledBy) {
          const [clat, clng] = polygonCentroid(zone.polygon)
          L.marker([clat, clng], {
            pane: 'conflict-pane',
            interactive: false,
            icon: L.divIcon({
              className: 'tairos-zone-label',
              html: `<span class="tairos-zone-label-inner" style="--conflict-color:${sideColour}">${escapeHtml(zone.controlledBy)}</span>`,
              iconSize: [0, 0],
              iconAnchor: [0, 0],
            }),
          }).addTo(group)
        }
      })

      // ── Frontline (with optional side labels) ───────────────
      const front = normaliseFrontline(c.frontline)
      if (front && front.line.length >= 2) {
        // Single dashed stroke — no glow halo, no marching dash animation.
        // The pane's stacking context gives it enough presence over tiles.
        L.polyline(front.line, {
          pane: 'conflict-pane',
          color: colour,
          weight: 2,
          opacity: 0.7,
          dashArray: '5 4',
          lineCap: 'round',
          interactive: false,
        }).addTo(group)

        // Side-A / Side-B endpoint tags, offset on opposite sides so the
        // reader can see who holds which side of the line. Tinted with
        // their side palette so they correlate with the territorial
        // polygons drawn above.
        if (front.sideA) {
          const a = front.line[0]
          L.marker(a, {
            pane: 'conflict-pane',
            interactive: false,
            icon: L.divIcon({
              className: 'tairos-side-label',
              html: `<span class="tairos-side-label-inner" style="--conflict-color:${SIDE_A_COLOUR}">${escapeHtml(front.sideA)}</span>`,
              iconSize: [0, 0],
              iconAnchor: [-6, 14],
            }),
          }).addTo(group)
        }
        if (front.sideB) {
          const b = front.line[front.line.length - 1]
          L.marker(b, {
            pane: 'conflict-pane',
            interactive: false,
            icon: L.divIcon({
              className: 'tairos-side-label',
              html: `<span class="tairos-side-label-inner" style="--conflict-color:${SIDE_B_COLOUR}">${escapeHtml(front.sideB)}</span>`,
              iconSize: [0, 0],
              iconAnchor: [-6, -14],
            }),
          }).addTo(group)
        }
      }

      // ── Hotspots ─────────────────────────────────────────
      ;(c.hotspots || []).forEach((h) => {
        L.circleMarker([h.lat, h.lng], {
          pane: 'conflict-pane',
          radius: 3,
          color: colour,
          weight: 1.2,
          opacity: 0.8,
          fillColor: colour,
          fillOpacity: 0.7,
          interactive: false,
        }).addTo(group)
        L.marker([h.lat, h.lng], {
          pane: 'conflict-pane',
          interactive: false,
          icon: L.divIcon({
            className: 'tairos-hotspot-label',
            html: `<span style="color:${colour}">${escapeHtml(h.name)}</span>`,
            iconSize: [0, 0],
            iconAnchor: [-8, 6],
          }),
        }).addTo(group)
      })

      // ── Country bubble (interactive) ─────────────────────
      // Outer pulse ring — gentler than before.
      const outer = L.circleMarker([c.bubble.lat, c.bubble.lng], {
        pane: 'conflict-pane',
        radius: r + 6,
        color: colour,
        weight: 1,
        opacity: 0.35,
        fillColor: colour,
        fillOpacity: 0.06,
        className: `tairos-conflict-pulse sev-${c.severity}`,
        interactive: false,
      }).addTo(group)

      // Inner solid bubble — the click/hover target
      const inner = L.circleMarker([c.bubble.lat, c.bubble.lng], {
        pane: 'conflict-pane',
        radius: r,
        color: colour,
        weight: 1.5,
        opacity: 0.9,
        fillColor: colour,
        fillOpacity: 0.42,
        bubblingMouseEvents: false,
        className: 'tairos-conflict-bubble',
      }).addTo(group)

      // Label
      const label = L.marker([c.bubble.lat, c.bubble.lng], {
        pane: 'conflict-pane',
        interactive: false,
        icon: L.divIcon({
          className: 'tairos-conflict-label',
          html: `<div class="tairos-conflict-label-inner" style="--conflict-color:${colour}">
                   <span class="tairos-conflict-label-name">${escapeHtml(c.shortName)}</span>
                   <span class="tairos-conflict-label-status">${statusLabel(c.status)}</span>
                 </div>`,
          iconSize: [0, 0],
          iconAnchor: [0, r + 8],
        }),
      }).addTo(group)

      inner.on('click', (e) => {
        if (e.originalEvent?.button !== 0) return
        L.DomEvent.stopPropagation(e)
        select(c)
      })
      inner.on('mouseover', () => setHovered(c.id))
      inner.on('mouseout',  () => setHovered(null))

      bubblesRef.current.set(c.id, { outer, inner, label })
    })

    return () => {
      if (groupRef.current) { groupRef.current.remove(); groupRef.current = null }
      bubblesRef.current.clear()
    }
  }, [map, on, filter, select, setHovered])

  /* Sync hover/selection emphasis without rebuilding the layer. */
  useEffect(() => {
    bubblesRef.current.forEach(({ inner, outer }, id) => {
      const hot = id === hoveredId || id === selected?.id
      inner.setStyle({
        weight: hot ? 2.5 : 1.5,
        fillOpacity: hot ? 0.62 : 0.42,
      })
      outer.setStyle({
        opacity: hot ? 0.55 : 0.35,
        fillOpacity: hot ? 0.12 : 0.06,
      })
    })
  }, [hoveredId, selected])

  return null
}

/* ── helpers ────────────────────────────────────────────────────────── */

/* Territorial side palette — chromatic opposites (cool vs warm) so the
   viewer reads "two opposing actors" rather than "good vs bad". These
   are independent of the conflict's status colour so the side identity
   stays consistent across every theatre. Keep in sync with
   `.tairos-zone-label-inner` in index.css. */
const SIDE_A_COLOUR = '#5C7FA8'   // cool steel-blue
const SIDE_B_COLOUR = '#9E5A48'   // warm brick

function zoneColour(side, fallback) {
  if (side === 'A' || side === 'a') return SIDE_A_COLOUR
  if (side === 'B' || side === 'b') return SIDE_B_COLOUR
  return fallback
}

/* Muted command-map palette. The earlier hues (#EF5A3D etc.) read like a
   neon sign on a dark theme; these are pulled back ~20% saturation so the
   bubbles sit in the scene instead of shouting over it. */
function statusColour(status) {
  switch (status) {
    case 'active':   return '#C04631'   // muted brick red
    case 'ongoing':  return '#B87035'   // muted amber
    case 'frozen':   return '#9AA6B8'   // cool grey-blue (frozen = cold)
    case 'tension':  return '#B09340'   // muted ochre
    default:         return '#8C5A44'
  }
}

function statusLabel(status) {
  switch (status) {
    case 'active':   return 'AKTİF'
    case 'ongoing':  return 'SÜREGELEN'
    case 'frozen':   return 'DONDURULMUŞ'
    case 'tension':  return 'GERİLİM'
    default:         return String(status || '').toUpperCase()
  }
}

// Severity 1–5 mapped to a pleasant bubble radius range.
function bubbleRadius(sev) {
  const s = Math.max(1, Math.min(5, Number(sev) || 3))
  return 12 + (s - 1) * 3     // 12, 15, 18, 21, 24
}

// Accept both the new `{line, sideA, sideB}` shape and the legacy raw array
// shape so the seed data migration can roll out gradually without breaking
// the render.
function normaliseFrontline(front) {
  if (!front) return null
  if (Array.isArray(front)) return { line: front, sideA: null, sideB: null }
  if (Array.isArray(front.line)) return {
    line: front.line,
    sideA: front.sideA || null,
    sideB: front.sideB || null,
  }
  return null
}

// Simple arithmetic mean centroid — good enough for label placement on
// the small, roughly convex polygons the seed data uses.
function polygonCentroid(poly) {
  let lat = 0, lng = 0
  poly.forEach(([la, ln]) => { lat += la; lng += ln })
  const n = poly.length || 1
  return [lat / n, lng / n]
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
