import React, {
  useEffect, useRef, useState, useCallback, useMemo,
  lazy, Suspense,
} from 'react'
import { createPortal } from 'react-dom'
import {
  MapContainer,
  TileLayer,
  GeoJSON,
  useMap,
  useMapEvents,
  ScaleControl,
  ZoomControl,
} from 'react-leaflet'
import L from 'leaflet'
import useStore from '../store/useStore'
import { TILE_PROVIDERS } from '../utils/tiles'
import { CATEGORIES } from '../config/categories'
import { fetchFromMirrors } from '../utils/overpass'
import {
  PowerLayer,
  InternetLayer,
  WaterLayer,
  MaritimeLayer,
  TowerLayer,
} from './overlays'
import { TOWER_QUERY } from '../utils/towers'
import { OVERLAYS, OVERLAY_ORDER } from '../utils/overlays'
import { deduplicateByLocation } from '../utils/thinning'
import { DRONE_PRODUCTS } from '../config/drones'
import { STATUS_BY_ID } from '../utils/facilityProducts'
import WeatherLayer from './WeatherLayer'
import ConflictLayer from './ConflictLayer'
import ConflictAssetLayer from './ConflictAssetLayer'
import GlobalSitesLayer from './GlobalSitesLayer'
import ForceDeploymentLayer from './ForceDeploymentLayer'
import CountryFocusLayer from './CountryFocusLayer'
import FlyToCountry from './FlyToCountry'
import ThreatProjectionLayer from './ThreatProjectionLayer'
import KillChainLayer from './KillChainLayer'
import ThreatLegend from './ThreatLegend'
import MapLayersIsland from './MapLayersIsland'

/* ── Lazy-loaded heavy detail panels ────────────────────────
 * These four panels only render when the operator opens them
 * (click-to-select or draw-to-place). Keeping them out of the
 * main MapView chunk saves ~120KB gzip on initial load; when
 * the user opens one the Suspense fallback is invisible
 * (fallback={null}) because the panels are edge drawers that
 * slide in anyway — a loading flicker here would be worse than
 * the micro-latency of a cached dynamic import. */
const PlacementPanel         = lazy(() => import('./PlacementPanel'))
const AreaInfoPanel          = lazy(() => import('./AreaInfoPanel'))
const ConflictDetailPanel    = lazy(() => import('./ConflictDetailPanel'))
const ForceDeployDetailPanel = lazy(() => import('./ForceDeployDetailPanel'))

/* ── Map event bridge ───────────────────────────────────── */
function MapEvents({ onClick }) {
  const setMapView = useStore((s) => s.setMapView)
  useMapEvents({
    click: onClick,
    moveend: (e) => {
      const c = e.target.getCenter()
      setMapView([c.lat, c.lng], e.target.getZoom())
    },
  })
  return null
}

/* ── Dynamic tile layer — caps at provider's TRUE native max ── */
// 1x1 transparent PNG — shown instead of bad/missing tiles so we never display
// provider placeholders like "Map data not yet available".
const EMPTY_TILE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

function DynamicTile() {
  const tileStyle = useStore((s) => s.tileStyle)
  const provider  = TILE_PROVIDERS[tileStyle] || TILE_PROVIDERS.dark
  return (
    <TileLayer
      key={tileStyle}
      url={provider.url}
      attribution={provider.attribution}
      maxZoom={provider.maxZoom}
      maxNativeZoom={provider.maxNativeZoom}
      subdomains="abcd"
      keepBuffer={8}
      crossOrigin={true}
      errorTileUrl={EMPTY_TILE}
    />
  )
}

/* ── Sync MapContainer maxZoom with active tile provider's visual max ── */
function DynamicMaxZoom() {
  const map       = useMap()
  const tileStyle = useStore((s) => s.tileStyle)
  useEffect(() => {
    const provider = TILE_PROVIDERS[tileStyle] || TILE_PROVIDERS.dark
    map.setMaxZoom(provider.maxZoom)
    if (map.getZoom() > provider.maxZoom) map.setZoom(provider.maxZoom)
  }, [map, tileStyle])
  return null
}

/* ── Fly to selected facility ───────────────────────────── */
function FlyToSelected() {
  const selected = useStore((s) => s.selectedFacility)
  const map = useMap()
  useEffect(() => {
    if (selected) {
      map.flyTo([selected.lat, selected.lng], Math.max(map.getZoom(), 10), { duration: 0.8 })
    }
  }, [selected]) // eslint-disable-line
  return null
}

/* ── Fly to selected conflict (fit the whole theatre) ──────
   Takes over from the old "center on bubble at fixed zoom" behaviour.
   When the operator clicks a conflict card from halfway across the
   world, we want to actually see the theatre — not land at zoom 5
   next to a generic bubble. So we walk every geometry the seed
   carries (theatre envelope, contested polygons, frontline, hotspots,
   fallback bubble point) and fitBounds() onto the union.

   `conflictFocusTick` is in the deps so clicking the same entry twice
   still refocuses, even though `selected.id` wouldn't change. */
function FlyToConflict() {
  const selected = useStore((s) => s.selectedConflict)
  const tick     = useStore((s) => s.conflictFocusTick)
  const map = useMap()
  useEffect(() => {
    if (!selected) return
    const bounds = conflictBounds(selected)
    if (!bounds || !bounds.isValid()) return
    try {
      map.flyToBounds(bounds, {
        padding: [60, 60],
        maxZoom: 7,           // never so close we blow past the theatre
        duration: 0.8,
        animate: true,
      })
    } catch {
      // flyToBounds can throw on degenerate bounds (single point) — fall
      // back to a gentle flyTo on the bubble so the interaction still
      // feels responsive instead of silent.
      if (selected.bubble) {
        map.flyTo(
          [selected.bubble.lat, selected.bubble.lng],
          Math.max(map.getZoom(), 6),
          { duration: 0.7 }
        )
      }
    }
  }, [selected?.id, tick]) // eslint-disable-line
  return null
}

/* ── Fly to ad-hoc point ────────────────────────────────────
   For pin-point targets (conflict hotspots, individual strategic assets,
   anything the operator wants to physically fly to on demand).
   Driven by `mapFlyTick` so the same coord asked for twice in a row still
   re-fires — same pattern as FlyToConflict. `mapZoom` is read here too but
   only as a floor: we always zoom in to at least the requested/target
   zoom, never out. */
function FlyToPoint() {
  const target = useStore((s) => s.mapFlyTarget)
  const tick   = useStore((s) => s.mapFlyTick)
  const map = useMap()
  useEffect(() => {
    if (!target) return
    const lat = Number(target.lat)
    const lng = Number(target.lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return
    const wanted = typeof target.zoom === 'number' ? target.zoom : 8
    const z = Math.max(map.getZoom(), wanted)
    try {
      map.flyTo([lat, lng], z, { duration: 0.75, animate: true })
    } catch {
      // Degenerate case (Leaflet complains about invalid bounds during
      // rapid tile swaps, etc.) — fall back to a silent setView so the
      // interaction isn't completely dropped.
      try { map.setView([lat, lng], z) } catch {}
    }
  }, [tick]) // eslint-disable-line
  return null
}

/**
 * Build a LatLngBounds from whatever geometry a conflict entry carries.
 * Returns null if there is nothing to fit (an unrealistic case, since
 * every seed entry has at least a bubble point).
 */
function conflictBounds(c) {
  if (!c) return null
  const pts = []
  if (c.theatre && Array.isArray(c.theatre.polygon)) {
    c.theatre.polygon.forEach((p) => Array.isArray(p) && pts.push(p))
  }
  if (Array.isArray(c.contested)) {
    c.contested.forEach((zone) => {
      if (Array.isArray(zone.polygon)) {
        zone.polygon.forEach((p) => Array.isArray(p) && pts.push(p))
      }
    })
  }
  if (c.frontline) {
    const line = Array.isArray(c.frontline) ? c.frontline : c.frontline.line
    if (Array.isArray(line)) line.forEach((p) => Array.isArray(p) && pts.push(p))
  }
  if (Array.isArray(c.hotspots)) {
    c.hotspots.forEach((h) => {
      if (typeof h.lat === 'number' && typeof h.lng === 'number') pts.push([h.lat, h.lng])
    })
  }
  if (c.bubble && typeof c.bubble.lat === 'number') {
    pts.push([c.bubble.lat, c.bubble.lng])
  }
  if (pts.length < 1) return null
  // One-point conflicts (just a bubble) would produce zero-size bounds;
  // pad them with ~0.6° so fitBounds has something meaningful to work with.
  if (pts.length === 1) {
    const [la, ln] = pts[0]
    return L.latLngBounds([la - 0.6, ln - 0.6], [la + 0.6, ln + 0.6])
  }
  return L.latLngBounds(pts)
}

/* ── Coverage polygon layer ─────────────────────────────── */
function CoverageLayer({ polygon, color, opacity = 0.18, strokeOpacity = 0.6 }) {
  const key = polygon
    ? JSON.stringify(polygon.geometry?.coordinates?.[0]?.[0]?.slice(0, 3))
    : 'empty'
  if (!polygon) return null
  return (
    <GeoJSON
      key={key}
      data={polygon}
      style={{
        color,
        weight: 1.5,
        opacity: strokeOpacity,
        fillColor: color,
        fillOpacity: opacity,
        interactive: false,
      }}
    />
  )
}

/* ── Facility-product deployment circles ────────────────────
   Draws a coverage circle for each product deployed onto a specific
   facility or node. Distinct from the global drone coverage polygons:
   these are per-site overrides with their own range, status, and notes.
   Products with kind === 'radar' get a rotating 360° sweep SVG overlay
   instead of a solid circle. */
const SVG_NS = 'http://www.w3.org/2000/svg'

// Parse hex or rgb() into "r,g,b" for rgba() interpolation.
function colorToRgb(c) {
  if (!c) return '120,170,255'
  if (c.startsWith('#')) {
    const h = c.slice(1)
    const n = h.length === 3
      ? h.split('').map((d) => parseInt(d + d, 16))
      : [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
    return n.join(',')
  }
  const m = c.match(/(\d+)[,\s]+(\d+)[,\s]+(\d+)/)
  return m ? `${m[1]},${m[2]},${m[3]}` : '120,170,255'
}

// A radar scope with a phosphor-trail sweep, compass ticks, concentric
// range rings, cardinal labels, and a glowing leading edge. Rendered
// inside an L.svgOverlay; all geometry uses a centered viewBox so paths
// stay readable whatever physical size Leaflet stretches to.
function buildRadarSvg({ color, durationSec, active }) {
  const rgb = colorToRgb(color)
  const dim = active ? 1 : 0.55
  const R   = 49
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '-50 -50 100 100')
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet')
  svg.style.overflow = 'visible'
  const uid = Math.random().toString(36).slice(2, 7)

  // ── Phosphor trail: 26 narrow wedges fanning counter-clockwise from
  // the leading edge (top), each slightly more transparent than the
  // last. The whole stack rotates as one so the shape stays fixed
  // relative to the sweep's direction of motion.
  const fadeSteps = 26
  const fadeArc   = 140           // degrees of trail behind leading edge
  let wedges = ''
  for (let i = 0; i < fadeSteps; i++) {
    const a1 = -Math.PI / 2 - (i       / fadeSteps) * fadeArc * Math.PI / 180
    const a2 = -Math.PI / 2 - ((i + 1) / fadeSteps) * fadeArc * Math.PI / 180
    const x1 = (R * Math.cos(a1)).toFixed(2)
    const y1 = (R * Math.sin(a1)).toFixed(2)
    const x2 = (R * Math.cos(a2)).toFixed(2)
    const y2 = (R * Math.sin(a2)).toFixed(2)
    const t  = 1 - i / fadeSteps
    const op = (Math.pow(t, 1.9) * 0.78 * dim).toFixed(3)
    // sweep-flag=0 → counter-clockwise short arc (trail goes CCW from leader)
    wedges += `<path d="M 0 0 L ${x1} ${y1} A ${R} ${R} 0 0 0 ${x2} ${y2} Z" fill="rgba(${rgb},${op})"/>`
  }

  // 12 compass ticks around the rim (every 30°); the four cardinals
  // (N/E/S/W) are a touch longer + brighter.
  let ticks = ''
  for (let i = 0; i < 24; i++) {
    const cardinal = i % 6 === 0
    const ang = (i * 15) * Math.PI / 180 - Math.PI / 2
    const r1 = R
    const r2 = cardinal ? R - 4 : R - 2
    const x1 = (r1 * Math.cos(ang)).toFixed(2)
    const y1 = (r1 * Math.sin(ang)).toFixed(2)
    const x2 = (r2 * Math.cos(ang)).toFixed(2)
    const y2 = (r2 * Math.sin(ang)).toFixed(2)
    const op = cardinal ? 0.8 * dim : 0.35 * dim
    ticks += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="rgba(${rgb},${op.toFixed(2)})" stroke-width="${cardinal ? 0.35 : 0.18}"/>`
  }

  // Cardinal labels (N/E/S/W) in small caps just inside the rim.
  const labels = [
    { t: 'N', x:   0, y: -R + 6.8 },
    { t: 'E', x:  R - 6.8, y: 1.8 },
    { t: 'S', x:   0, y:  R - 4.5 },
    { t: 'W', x: -R + 6.8, y: 1.8 },
  ].map((l) =>
    `<text x="${l.x}" y="${l.y}" text-anchor="middle" font-size="4.5"
      font-family="'JetBrains Mono','Courier New',monospace" font-weight="600"
      fill="rgba(${rgb},${(0.55 * dim).toFixed(2)})">${l.t}</text>`
  ).join('')

  svg.innerHTML = `
    <defs>
      <!-- Soft glow filter for the leading edge. -->
      <filter id="glow-${uid}" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="0.6" result="b"/>
        <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
      <!-- Subtle scope vignette so it feels like a CRT, not a flat ring. -->
      <radialGradient id="vignette-${uid}" cx="50%" cy="50%" r="50%">
        <stop offset="0%"  stop-color="rgba(${rgb},${(0.04 * dim).toFixed(3)})"/>
        <stop offset="70%" stop-color="rgba(${rgb},${(0.02 * dim).toFixed(3)})"/>
        <stop offset="100%" stop-color="rgba(${rgb},0)"/>
      </radialGradient>
    </defs>

    <!-- Scope face -->
    <circle cx="0" cy="0" r="${R}" fill="url(#vignette-${uid})"
            stroke="rgba(${rgb},${(0.6 * dim).toFixed(2)})" stroke-width="0.4"/>

    <!-- Concentric range rings at 1/3 and 2/3 -->
    <circle cx="0" cy="0" r="${(R * 2 / 3).toFixed(2)}" fill="none"
            stroke="rgba(${rgb},${(0.22 * dim).toFixed(2)})" stroke-width="0.18"/>
    <circle cx="0" cy="0" r="${(R * 1 / 3).toFixed(2)}" fill="none"
            stroke="rgba(${rgb},${(0.22 * dim).toFixed(2)})" stroke-width="0.18"/>

    <!-- Crosshair diagonals (finer than cardinals) -->
    <line x1="${-R}" y1="0" x2="${R}" y2="0"
          stroke="rgba(${rgb},${(0.14 * dim).toFixed(2)})" stroke-width="0.14"/>
    <line x1="0" y1="${-R}" x2="0" y2="${R}"
          stroke="rgba(${rgb},${(0.14 * dim).toFixed(2)})" stroke-width="0.14"/>

    <!-- Compass tick ring -->
    <g>${ticks}</g>

    <!-- Cardinal direction letters -->
    <g>${labels}</g>

    <!-- Rotating phosphor trail (stepped wedges) -->
    <g>
      ${wedges}
      <animateTransform attributeName="transform" type="rotate"
        from="0" to="360" dur="${durationSec}s" repeatCount="indefinite"/>
    </g>

    <!-- Bright leading edge, glows slightly -->
    <g filter="url(#glow-${uid})">
      <line x1="0" y1="0" x2="0" y2="${-R}"
            stroke="rgba(${rgb},${(0.95 * dim).toFixed(2)})" stroke-width="0.45"/>
      <circle cx="0" cy="${-R}" r="0.9" fill="rgba(${rgb},${(1 * dim).toFixed(2)})"/>
      <animateTransform attributeName="transform" type="rotate"
        from="0" to="360" dur="${durationSec}s" repeatCount="indefinite"/>
    </g>

    <!-- Center reticle: dot + small ring -->
    <circle cx="0" cy="0" r="1" fill="rgba(${rgb},${(1 * dim).toFixed(2)})"/>
    <circle cx="0" cy="0" r="2.2" fill="none"
            stroke="rgba(${rgb},${(0.45 * dim).toFixed(2)})" stroke-width="0.18"/>
  `
  return svg
}

function FacilityProductLayer({ facilities, tairosNodes }) {
  const map              = useMap()
  const facilityProducts = useStore((s) => s.facilityProducts)
  const selectFacility   = useStore((s) => s.selectFacility)
  const layerRef         = useRef(null)

  useEffect(() => {
    // Build a lookup: facility key → { site, isNode }.  Nodes tracked
    // separately so click-handler can tag them with `category: 'tairos'`
    // (DetailPanel uses that to render node-specific actions).
    const lookup = new Map()
    const index = (f, isNode) => {
      if (!f) return
      if (f.id != null) lookup.set(`id:${f.id}`, { site: f, isNode })
      if (typeof f.lat === 'number' && typeof f.lng === 'number')
        lookup.set(`xy:${f.lat.toFixed(5)},${f.lng.toFixed(5)}`, { site: f, isNode })
    }
    ;(facilities || []).forEach((f) => index(f, false))
    ;(tairosNodes || []).forEach((n) => index(n, true))

    if (layerRef.current) { layerRef.current.remove(); layerRef.current = null }
    const group = L.layerGroup().addTo(map)
    layerRef.current = group

    Object.entries(facilityProducts || {}).forEach(([key, list]) => {
      const entry = lookup.get(key)
      if (!entry || !Array.isArray(list)) return
      const { site, isNode } = entry
      // Click handler — tairos nodes need `category: 'tairos'` on the
      // selection payload so DetailPanel renders node actions (rename,
      // delete, deploy products). Facilities are passed through as-is.
      const selectPayload = isNode ? { ...site, category: site.category || 'tairos' } : site
      const onClick = (e) => {
        L.DomEvent.stopPropagation(e)
        selectFacility(selectPayload)
      }

      list.forEach((d) => {
        const product = DRONE_PRODUCTS[d.productId]
        if (!product) return
        if (d.status === 'retired') return   // don't render retired deployments
        const status = STATUS_BY_ID[d.status] || { color: product.color }
        const active = d.status === 'active' || d.status === 'deployed'
        const rangeKm = d.rangeKm || product.rangeKm
        const rangeM  = rangeKm * 1000

        // Rich tooltip — product, quantity, status, range, site name, note, and a
        // hint that clicking opens the detail/edit panel.
        const note = d.note ? `<br/><span style="color:#8A9BB5;font-size:10px">“${d.note}”</span>` : ''
        const tooltip =
          `<b style="color:${product.color}">${product.kind === 'radar' ? '◎' : '●'} ${product.label}</b>` +
          ` <span style="color:#8A9BB5">×${d.quantity}</span><br/>` +
          `<span style="color:${status.color};font-size:10px">${status.label || d.status}</span> · ` +
          `<span style="color:#E4EAF4;font-size:10px">${rangeKm} km</span>` +
          `<br/><span style="color:#4A6080;font-size:9px">${site.name || 'Varlık'}</span>` +
          note +
          `<br/><span style="color:#6B7FA0;font-size:9px;font-style:italic">⟲ düzenle/kaldır için tıkla</span>`

        if (product.kind === 'radar') {
          // Rotating sweep via SVG overlay. Bounds are a physical square
          // 2*range meters wide, centered on the site. `bubblingMouseEvents:
          // false` keeps the click inside the overlay so the background map
          // click (which deselects) doesn't immediately fire after selection.
          const durationSec = d.sweepSec || product.sweepSec || 4
          const svg = buildRadarSvg({ color: product.color, durationSec, active })
          const bounds = L.latLng(site.lat, site.lng).toBounds(2 * rangeM)
          const overlay = L.svgOverlay(svg, bounds, {
            interactive: true,
            opacity: 1,
            bubblingMouseEvents: false,
            className: 'tairos-product-overlay',
          })
          overlay.bindTooltip(tooltip, { direction: 'top', sticky: true })
          overlay.on('click', onClick)
          overlay.addTo(group)
        } else {
          const circle = L.circle([site.lat, site.lng], {
            radius: rangeM,
            color: product.color,
            weight: active ? 1.6 : 1.0,
            opacity: active ? 0.70 : 0.40,
            dashArray: active ? null : '4 4',
            fillColor: product.color,
            fillOpacity: active ? 0.08 : 0.04,
            interactive: true,
            bubblingMouseEvents: false,
            className: 'tairos-product-overlay',
          })
          circle.bindTooltip(tooltip, { direction: 'top', sticky: true })
          circle.on('click', onClick)
          circle.addTo(group)
        }
      })
    })

    return () => {
      if (layerRef.current) { layerRef.current.remove(); layerRef.current = null }
    }
  }, [facilityProducts, facilities, tairosNodes, map, selectFacility])

  return null
}

/* ── Global radar layer — driven by the sidebar Radar toggle ───
   For every site in `facilities`, renders a rotating radar scope with
   the given range. Independent of per-facility product deployments so
   the global toggle and the per-site placement can coexist. */
function GlobalRadarLayer({ facilities, rangeKm }) {
  const map      = useMap()
  const layerRef = useRef(null)

  useEffect(() => {
    if (layerRef.current) { layerRef.current.remove(); layerRef.current = null }
    if (!facilities?.length || !rangeKm) return

    const product = DRONE_PRODUCTS.radar
    if (!product) return
    const durationSec = product.sweepSec || 4
    const rangeM      = rangeKm * 1000
    const group       = L.layerGroup().addTo(map)
    layerRef.current  = group

    facilities.forEach((f) => {
      if (!f || typeof f.lat !== 'number' || typeof f.lng !== 'number') return
      const svg    = buildRadarSvg({ color: product.color, durationSec, active: true })
      const bounds = L.latLng(f.lat, f.lng).toBounds(2 * rangeM)
      const overlay = L.svgOverlay(svg, bounds, { interactive: false, opacity: 1 })
      overlay.bindTooltip(
        `<b style="color:${product.color}">◎ UAV Radar</b>` +
        ` <span style="color:#8A9BB5">${rangeKm} km</span>` +
        `<br/><span style="color:#4A6080;font-size:9px">${f.name || 'Varlık'}</span>`,
        { direction: 'top', sticky: true }
      )
      overlay.addTo(group)
    })

    return () => {
      if (layerRef.current) { layerRef.current.remove(); layerRef.current = null }
    }
  }, [facilities, rangeKm, map])

  return null
}

/* ── Minimal per-product symbol (used as a corner badge) ──
   Kept tiny and clean — just enough to read at marker scale. Each product
   gets its own silhouette so a glance is enough to tell them apart:
     • nova   → fixed-wing / rocket-like UAV (long-range patrol)
     • iris   → quadcopter with central camera lens (taktik gözetleme)
     • radar  → rotating sweep arm with range rings
     • default → clean ring with center dot (unknown product fallback) */
function productMiniSymbol(product, { size = 12 } = {}) {
  const c = product.color
  if (product.kind === 'radar') {
    return `<svg width="${size}" height="${size}" viewBox="-10 -10 20 20" xmlns="http://www.w3.org/2000/svg" style="display:block;overflow:visible">
      <circle cx="0" cy="0" r="8" fill="none" stroke="${c}" stroke-width="1.1" opacity="0.75"/>
      <circle cx="0" cy="0" r="4" fill="none" stroke="${c}" stroke-width="0.6" opacity="0.45"/>
      <g>
        <line x1="0" y1="0" x2="0" y2="-8" stroke="${c}" stroke-width="1.4" stroke-linecap="round"/>
        <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="2.4s" repeatCount="indefinite"/>
      </g>
      <circle cx="0" cy="0" r="1.3" fill="${c}"/>
    </svg>`
  }
  if (product.id === 'nova') {
    // Fixed-wing / rocket: vertical fuselage, swept delta wings, tail fin.
    // Nose points up. Stroke-only for the wings keeps it light at small sizes.
    return `<svg width="${size}" height="${size}" viewBox="-10 -10 20 20" xmlns="http://www.w3.org/2000/svg" style="display:block;overflow:visible">
      <!-- fuselage -->
      <path d="M 0 -8 L -1.6 -1 L -1.6 5 L 1.6 5 L 1.6 -1 Z"
            fill="${c}" stroke="${c}" stroke-width="0.4" stroke-linejoin="round"/>
      <!-- swept wings -->
      <path d="M -1.6 -0.5 L -7.5 4 L -1.6 2.5 Z"
            fill="${c}" fill-opacity="0.55" stroke="${c}" stroke-width="0.7" stroke-linejoin="round"/>
      <path d="M  1.6 -0.5 L  7.5 4 L  1.6 2.5 Z"
            fill="${c}" fill-opacity="0.55" stroke="${c}" stroke-width="0.7" stroke-linejoin="round"/>
      <!-- tail fin -->
      <path d="M -1.4 4.5 L 0 7.5 L 1.4 4.5 Z"
            fill="${c}" fill-opacity="0.65" stroke="${c}" stroke-width="0.5" stroke-linejoin="round"/>
      <!-- cockpit dot -->
      <circle cx="0" cy="-4" r="0.9" fill="#0D1526"/>
    </svg>`
  }
  if (product.id === 'iris') {
    // Quadcopter: 4 rotor rings on an X frame, central camera eye. The
    // inner dark pupil reads as an observation sensor even at 10–14px.
    return `<svg width="${size}" height="${size}" viewBox="-10 -10 20 20" xmlns="http://www.w3.org/2000/svg" style="display:block;overflow:visible">
      <!-- X-frame arms -->
      <line x1="-5.2" y1="-5.2" x2="5.2" y2="5.2" stroke="${c}" stroke-width="1.3" stroke-linecap="round"/>
      <line x1="5.2"  y1="-5.2" x2="-5.2" y2="5.2" stroke="${c}" stroke-width="1.3" stroke-linecap="round"/>
      <!-- 4 rotor rings -->
      <circle cx="-6" cy="-6" r="2.6" fill="#0D1526" stroke="${c}" stroke-width="1.1"/>
      <circle cx=" 6" cy="-6" r="2.6" fill="#0D1526" stroke="${c}" stroke-width="1.1"/>
      <circle cx="-6" cy=" 6" r="2.6" fill="#0D1526" stroke="${c}" stroke-width="1.1"/>
      <circle cx=" 6" cy=" 6" r="2.6" fill="#0D1526" stroke="${c}" stroke-width="1.1"/>
      <!-- central camera (lens + pupil + catch-light) -->
      <circle cx="0" cy="0" r="3.2" fill="${c}"/>
      <circle cx="0" cy="0" r="1.6" fill="#0D1526"/>
      <circle cx="0.6" cy="-0.6" r="0.5" fill="${c}"/>
    </svg>`
  }
  // Default fallback for unknown products — clean ring with center dot.
  return `<svg width="${size}" height="${size}" viewBox="-10 -10 20 20" xmlns="http://www.w3.org/2000/svg" style="display:block">
    <circle cx="0" cy="0" r="7.5" fill="none" stroke="${c}" stroke-width="1.2"/>
    <circle cx="0" cy="0" r="2.6" fill="${c}"/>
  </svg>`
}

/* ── Product-deployment decoration for facility/node markers ──
   Given a list of deployments at a site, returns HTML fragments that
   wrap a marker with:
     (1) a segmented SVG ring (one arc per unique product, clean gaps)
     (2) a radial halo that pulses when a deployment is live
     (3) a corner count chip when there's >1 deployment (top-right)
     (4) per-product mini-symbol badges in the remaining corners:
           nova  → top-left
           iris  → bottom-right
           radar → bottom-left
         Each badge uses the product's distinct silhouette from
         productMiniSymbol so a glance tells Nova from Iris from Radar.
   Retired deployments are ignored. */
function productBadgeDecor(deployments, { innerSize = 20 } = {}) {
  const live = (deployments || []).filter((d) => d && d.status !== 'retired')
  if (!live.length) return null

  // Preserve insertion order, but deduplicate products for a cleaner ring.
  const seen = new Set()
  const uniqueProducts = []
  live.forEach((d) => {
    if (seen.has(d.productId)) return
    seen.add(d.productId)
    const p = DRONE_PRODUCTS[d.productId]
    if (p) uniqueProducts.push(p)
  })

  const hasRadar  = uniqueProducts.some((p) => p.kind === 'radar')
  const hasNova   = uniqueProducts.some((p) => p.id === 'nova')
  const hasIris   = uniqueProducts.some((p) => p.id === 'iris')
  const hasActive = live.some((d) => d.status === 'active' || d.status === 'deployed')
  const primary   = uniqueProducts[0].color

  // ── Segmented SVG ring ──────────────────────────────────
  // The ring sits INSET negative so it extends past the marker on all sides.
  const RING_INSET = 4
  const ringSize   = innerSize + RING_INSET * 2
  const cx         = ringSize / 2
  const r          = ringSize / 2 - 1.6
  const stroke     = 2.0
  const n          = uniqueProducts.length
  const gap        = n > 1 ? 14 : 0            // degrees between arcs
  const segDeg     = (360 - gap * n) / n

  let arcs
  if (n === 1) {
    arcs = `<circle cx="${cx}" cy="${cx}" r="${r.toFixed(2)}" fill="none" stroke="${uniqueProducts[0].color}" stroke-width="${stroke}" stroke-linecap="round"/>`
  } else {
    arcs = uniqueProducts.map((p, i) => {
      const startA = -90 + i * (segDeg + gap) + gap / 2
      const endA   = startA + segDeg
      const sx = cx + r * Math.cos(startA * Math.PI / 180)
      const sy = cx + r * Math.sin(startA * Math.PI / 180)
      const ex = cx + r * Math.cos(endA * Math.PI / 180)
      const ey = cx + r * Math.sin(endA * Math.PI / 180)
      const large = segDeg > 180 ? 1 : 0
      return `<path d="M ${sx.toFixed(2)} ${sy.toFixed(2)} A ${r.toFixed(2)} ${r.toFixed(2)} 0 ${large} 1 ${ex.toFixed(2)} ${ey.toFixed(2)}" fill="none" stroke="${p.color}" stroke-width="${stroke}" stroke-linecap="round"/>`
    }).join('')
  }

  const ring = `<svg width="${ringSize}" height="${ringSize}" viewBox="0 0 ${ringSize} ${ringSize}" style="position:absolute;inset:-${RING_INSET}px;pointer-events:none;z-index:1;overflow:visible">${arcs}</svg>`

  // ── Halo (behind ring) — only when a deployment is operationally live ──
  const halo = hasActive
    ? `<div class="tairos-deployment-pulse" style="
        position:absolute;inset:-${RING_INSET + 3}px;border-radius:50%;
        background:radial-gradient(circle, ${primary}66 0%, ${primary}00 70%);
        pointer-events:none;z-index:0;
      "></div>`
    : ''

  // ── Count chip (only if >1 deployment — single deployment already implied by ring) ──
  const count = live.length > 1
    ? `<div style="
        position:absolute;top:-${RING_INSET + 1}px;right:-${RING_INSET + 1}px;
        min-width:13px;height:13px;padding:0 3px;
        border-radius:8px;
        background:#0D1526;
        border:1.2px solid ${primary};
        color:${primary};
        font-size:9px;font-weight:700;font-family:'JetBrains Mono',monospace;
        line-height:11px;text-align:center;
        box-shadow:0 0 4px ${primary}88;
        pointer-events:none;z-index:4;
      ">${live.length}</div>`
    : ''

  // ── Per-product mini-symbol badges ──
  // Each unique deployed product gets a small pill in one of the corners
  // with its own silhouette (nova: fixed-wing / iris: quadcopter /
  // radar: rotating sweep). Corners kept constant per-product so the user
  // learns "radar always bottom-left, nova always top-left" etc.
  const badgePill = (prod, posStyle) => `<div style="
        position:absolute;${posStyle}
        width:14px;height:14px;border-radius:50%;
        background:#0D1526;
        border:1px solid ${prod.color}aa;
        display:flex;align-items:center;justify-content:center;
        box-shadow:0 0 4px rgba(0,0,0,0.85);
        pointer-events:none;z-index:3;
      ">${productMiniSymbol(prod, { size: 10 })}</div>`

  const radarBadge = hasRadar
    ? badgePill(DRONE_PRODUCTS.radar, `left:-${RING_INSET + 1}px;bottom:-${RING_INSET + 1}px;`)
    : ''
  // Nova sits at top-left unless count chip would collide — count is
  // top-right so top-left is always free.
  const novaBadge = hasNova
    ? badgePill(DRONE_PRODUCTS.nova, `left:-${RING_INSET + 1}px;top:-${RING_INSET + 1}px;`)
    : ''
  // Iris sits at bottom-right.
  const irisBadge = hasIris
    ? badgePill(DRONE_PRODUCTS.iris, `right:-${RING_INSET + 1}px;bottom:-${RING_INSET + 1}px;`)
    : ''

  return { halo, ring, count, radarBadge, novaBadge, irisBadge }
}

/* ── Facility + Tairos markers (flat layer group, no clustering) ──── */
function FacilityMarkers({ facilities, tairosNodes, dedupeMode, openMenuRef }) {
  const map = useMap()
  const selectFacility      = useStore((s) => s.selectFacility)
  const selected            = useStore((s) => s.selectedFacility)
  const facilityProducts    = useStore((s) => s.facilityProducts)
  const layerRef = useRef(null)

  // Helper: look up deployments for a facility/node without pulling in the
  // facilityKey util (keeps this component self-contained).
  const deploymentsFor = (f) => {
    if (!f) return null
    if (f.id != null) return facilityProducts[`id:${f.id}`]
    if (typeof f.lat === 'number' && typeof f.lng === 'number')
      return facilityProducts[`xy:${f.lat.toFixed(5)},${f.lng.toFixed(5)}`]
    return null
  }

  useEffect(() => {
    // Remove previous layer
    if (layerRef.current) {
      layerRef.current.remove()
      layerRef.current = null
    }

    // When dedupeMode is on: show only the highest-priority marker per location.
    // Coverage polygon is computed from the full list in App.jsx — not affected here.
    const visibleFacilities = (() => {
      const base = dedupeMode ? deduplicateByLocation(facilities) : facilities
      // Always keep selected facility visible even if dedupe would hide it
      if (selected && !base.find((f) => f.id === selected.id)) {
        const orig = facilities.find((f) => f.id === selected.id)
        if (orig) return [...base, orig]
      }
      return base
    })()
    const visibleTairos = dedupeMode
      ? deduplicateByLocation(tairosNodes)
      : tairosNodes

    const container = L.layerGroup()

    // Facility markers — colored badge with the category glyph inside.
    // Markers are observational only (no coverage rings — those are drones).
    visibleFacilities.forEach((f) => {
      const cat        = CATEGORIES[f.category]
      const color      = cat?.color || '#888888'
      const glyph      = cat?.glyph || '•'
      const isSelected = selected?.id === f.id
      const deployments = deploymentsFor(f)
      const innerSize   = 20
      const decor       = productBadgeDecor(deployments, { innerSize })
      const size        = decor ? innerSize + 12 : innerSize

      const markerHtml = `<div class="facility-marker ${isSelected ? 'selected' : ''}" style="
        position:relative;z-index:2;
        width:${innerSize}px;height:${innerSize}px;
        display:flex;align-items:center;justify-content:center;
        border-radius:50%;
        border:1.5px solid ${color};
        background:${isSelected ? color : 'rgba(13,21,38,0.92)'};
        color:${isSelected ? '#0D1526' : color};
        font-size:11px;line-height:1;
        font-family:'Segoe UI Symbol','Apple Symbols',sans-serif;
        text-align:center;
        box-shadow:0 0 4px rgba(0,0,0,0.6);
      ">${glyph}</div>`

      const wrappedHtml = decor
        ? `<div style="position:relative;width:${innerSize}px;height:${innerSize}px;display:flex;align-items:center;justify-content:center;">
             ${decor.halo}
             ${decor.ring}
             ${markerHtml}
             ${decor.count}
             ${decor.radarBadge}
             ${decor.novaBadge}
             ${decor.irisBadge}
           </div>`
        : markerHtml

      const icon = L.divIcon({
        className: '',
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
        html: wrappedHtml,
      })

      // Tooltip: append a compact deployment summary when products exist.
      let tooltipHtml = `<b>${f.name}</b><br/><span style="color:${color}">${cat?.labelShort || f.category}</span>`
      if (decor) {
        const live = deployments.filter((d) => d.status !== 'retired')
        const summary = live
          .map((d) => {
            const p = DRONE_PRODUCTS[d.productId]
            return p ? `<span style="color:${p.color}">${p.label}×${d.quantity}</span>` : ''
          })
          .filter(Boolean)
          .join(' · ')
        tooltipHtml += `<br/><span style="color:#6B7FA0;font-size:10px">⌁ Konuşlu:</span> ${summary}`
      }

      const marker = L.marker([f.lat, f.lng], {
        icon,
        zIndexOffset: isSelected ? 1000 : (decor ? 50 : 0),
      })
        .bindTooltip(tooltipHtml, { direction: 'top', offset: [0, -10] })
        .on('click', (e) => {
          L.DomEvent.stopPropagation(e)
          selectFacility(f)
        })
        .on('contextmenu', (e) => {
          L.DomEvent.stopPropagation(e)
          e.originalEvent.preventDefault()
          openMenuRef?.current?.(e.originalEvent.clientX, e.originalEvent.clientY, { lat: f.lat, lng: f.lng }, 'facility', f)
        })

      container.addLayer(marker)
    })

    // Tairos node markers — click opens the DetailPanel, same as facilities.
    // All node management (rename, delete, deploy products) happens in the
    // panel; right-click still exposes the context menu.
    visibleTairos.forEach((n) => {
      const isUserAdded = !!n.custom
      const color       = isUserAdded ? '#34D399' : '#F5C842'
      const isSelected  = selected?.id === n.id
      const deployments = deploymentsFor(n)
      const innerSize   = 14
      const decor       = productBadgeDecor(deployments, { innerSize })
      const size        = decor ? innerSize + 12 : innerSize

      // Base diamond (the node icon itself).
      const diamondHtml = `<div style="
        position:relative;z-index:2;
        width:10px;height:10px;
        background:${color};
        border:2px solid ${isSelected ? '#fff' : 'rgba(0,0,0,0.5)'};
        transform:rotate(45deg);
        box-shadow:0 0 ${isSelected ? 10 : 6}px ${color}${isSelected ? 'cc' : '88'};
      "></div>`

      const wrappedHtml = decor
        ? `<div style="position:relative;width:${innerSize}px;height:${innerSize}px;display:flex;align-items:center;justify-content:center;">
             ${decor.halo}
             ${decor.ring}
             ${diamondHtml}
             ${decor.count}
             ${decor.radarBadge}
             ${decor.novaBadge}
             ${decor.irisBadge}
           </div>`
        : diamondHtml

      const icon = L.divIcon({
        className: '',
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
        html: wrappedHtml,
      })

      const marker = L.marker([n.lat, n.lng], {
        icon,
        zIndexOffset: isSelected ? 1000 : (isUserAdded ? 100 : (decor ? 50 : 0)),
      })

      let nodeTooltip = `<b>${n.name}</b><br/><span style="color:${color}">${isUserAdded ? 'Özel Node' : 'Tairos Node'}</span>`
      if (decor) {
        const live = deployments.filter((d) => d.status !== 'retired')
        const summary = live
          .map((d) => {
            const p = DRONE_PRODUCTS[d.productId]
            return p ? `<span style="color:${p.color}">${p.label}×${d.quantity}</span>` : ''
          })
          .filter(Boolean)
          .join(' · ')
        nodeTooltip += `<br/><span style="color:#6B7FA0;font-size:10px">⌁ Konuşlu:</span> ${summary}`
      }

      marker
        .bindTooltip(nodeTooltip, { direction: 'top', offset: [0, -8] })
        .on('click', (e) => {
          L.DomEvent.stopPropagation(e)
          selectFacility({ ...n, category: 'tairos' })
        })
        .on('contextmenu', (e) => {
          L.DomEvent.stopPropagation(e)
          e.originalEvent.preventDefault()
          openMenuRef?.current?.(e.originalEvent.clientX, e.originalEvent.clientY, { lat: n.lat, lng: n.lng }, 'node', n)
        })

      container.addLayer(marker)
    })

    container.addTo(map)
    layerRef.current = container

    return () => {
      if (layerRef.current) {
        layerRef.current.remove()
        layerRef.current = null
      }
    }
  }, [facilities, tairosNodes, dedupeMode, selected, facilityProducts]) // eslint-disable-line

  return null
}

/* ── Distance measure tool ──────────────────────────────── */
function haversineKm(a, b) {
  const R = 6371
  const dLat = (b.lat - a.lat) * Math.PI / 180
  const dLon = (b.lng - a.lng) * Math.PI / 180
  const sinLat = Math.sin(dLat / 2)
  const sinLon = Math.sin(dLon / 2)
  const h = sinLat * sinLat + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * sinLon * sinLon
  return R * 2 * Math.asin(Math.sqrt(h))
}

function MeasureLayer({ active, onResult, onClear }) {
  const map    = useMap()
  const points = useRef([])
  const lineRef = useRef(null)

  useEffect(() => {
    if (!active) {
      points.current = []
      if (lineRef.current) { lineRef.current.remove(); lineRef.current = null }
      onClear()
      map.getContainer().style.cursor = ''
      return
    }
    map.getContainer().style.cursor = 'crosshair'
    return () => { map.getContainer().style.cursor = '' }
  }, [active, map, onClear])

  useMapEvents({
    click: (e) => {
      if (!active) return
      points.current.push({ lat: e.latlng.lat, lng: e.latlng.lng })
      if (points.current.length === 1) {
        onResult({ status: 'first', point: points.current[0] })
      } else if (points.current.length === 2) {
        const [a, b] = points.current
        const km = haversineKm(a, b)
        if (lineRef.current) lineRef.current.remove()
        lineRef.current = L.polyline([[a.lat, a.lng], [b.lat, b.lng]], {
          color: '#F5C842', weight: 2, dashArray: '6 4', opacity: 0.85, interactive: false,
        }).addTo(map)
        onResult({ status: 'done', km })
        points.current = []   // reset — next click starts new measurement
      }
    },
  })
  return null
}

/* ── Node edit mode — click-to-add crosshair layer ──────── */
function NodeEditLayer({ measureActive }) {
  const map          = useMap()
  const nodeEditMode = useStore((s) => s.nodeEditMode)
  const addNode      = useStore((s) => s.addNode)
  const active       = nodeEditMode && !measureActive

  useEffect(() => {
    const container = map.getContainer()
    container.style.cursor = active ? 'crosshair' : ''
    return () => { container.style.cursor = '' }
  }, [active, map])

  useMapEvents({
    click: (e) => {
      if (!active) return
      addNode(e.latlng.lat, e.latlng.lng)
    },
  })

  return null
}

/* ── Strategic placement overlay ──────────────────────────
   Runs two modes driven by the store:
     drawing     → captures map clicks as polygon vertices, shows a live
                    polyline + dashed closing segment to the first vertex,
                    double-click closes the polygon and flips to configuring.
     configuring → renders the closed polygon + preview circles for each
                    placement planned by PlacementPanel. Non-interactive so
                    the user can still pan/zoom while tweaking counts.
*/
function PlacementLayer() {
  const map              = useMap()
  const placementMode    = useStore((s) => s.placementMode)
  const placementPolygon = useStore((s) => s.placementPolygon)
  const placementPreview = useStore((s) => s.placementPreview)
  const setPolygon       = useStore((s) => s.setPlacementPolygon)
  const cancel           = useStore((s) => s.cancelPlacement)

  const pointsRef = useRef([])          // [[lat,lng], …] collected while drawing
  const drawLayerRef = useRef(null)     // leaflet layer for the live drawing
  const staticLayerRef = useRef(null)   // leaflet layer for closed polygon + previews

  // ── Drawing interactivity ────────────────────────────────
  useEffect(() => {
    const container = map.getContainer()
    if (placementMode === 'drawing') {
      container.style.cursor = 'crosshair'
      pointsRef.current = []
    } else {
      container.style.cursor = ''
    }
    return () => { container.style.cursor = '' }
  }, [placementMode, map])

  // Capture clicks + double-clicks only while drawing. Suppress Leaflet's
  // default double-click-to-zoom behaviour for the duration.
  useEffect(() => {
    if (placementMode !== 'drawing') return
    map.doubleClickZoom.disable()
    return () => map.doubleClickZoom.enable()
  }, [placementMode, map])

  // ESC to cancel while drawing/configuring
  useEffect(() => {
    if (placementMode === 'idle') return
    const onKey = (e) => { if (e.key === 'Escape') cancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [placementMode, cancel])

  useMapEvents({
    click: (e) => {
      if (placementMode !== 'drawing') return
      pointsRef.current = [...pointsRef.current, [e.latlng.lat, e.latlng.lng]]
      renderDrawing()
    },
    dblclick: (e) => {
      if (placementMode !== 'drawing') return
      // Leaflet emits both `click` and `dblclick` for a double-click, so the
      // preceding click already appended a vertex near `e.latlng`. Drop that
      // duplicate before closing, using a tiny epsilon to account for
      // sub-pixel noise.
      const pts = pointsRef.current.slice()
      const EPS = 1e-5
      if (pts.length >= 1) {
        const last = pts[pts.length - 1]
        if (Math.abs(last[0] - e.latlng.lat) < EPS && Math.abs(last[1] - e.latlng.lng) < EPS) {
          pts.pop()
        }
      }
      if (pts.length >= 3) {
        setPolygon(pts)
      }
    },
    mousemove: (e) => {
      if (placementMode !== 'drawing') return
      renderDrawing(e.latlng)
    },
  })

  function renderDrawing(hover) {
    if (drawLayerRef.current) { drawLayerRef.current.remove(); drawLayerRef.current = null }
    const pts = pointsRef.current
    if (!pts.length) return
    const g = L.layerGroup()

    // Main polyline through the collected vertices.
    L.polyline(pts, {
      color: '#20C8A0', weight: 2.2, opacity: 0.9, interactive: false,
    }).addTo(g)

    // Closing segment: from last vertex to first, dashed. Plus the hover
    // preview segment from last vertex to the current mouse position.
    if (pts.length >= 2) {
      L.polyline([pts[pts.length - 1], pts[0]], {
        color: '#20C8A0', weight: 1.5, opacity: 0.45, dashArray: '4 4', interactive: false,
      }).addTo(g)
    }
    if (hover) {
      L.polyline([pts[pts.length - 1], [hover.lat, hover.lng]], {
        color: '#20C8A0', weight: 1.2, opacity: 0.55, dashArray: '2 4', interactive: false,
      }).addTo(g)
    }

    // Vertex dots
    pts.forEach((p, i) => {
      L.circleMarker(p, {
        radius: i === 0 ? 5 : 3.5,
        color: '#20C8A0',
        fillColor: i === 0 ? '#0D1526' : '#20C8A0',
        fillOpacity: 1,
        weight: 2,
        interactive: false,
      }).addTo(g)
    })

    g.addTo(map)
    drawLayerRef.current = g
  }

  // Clear the drawing layer when we leave drawing mode.
  useEffect(() => {
    if (placementMode !== 'drawing') {
      if (drawLayerRef.current) { drawLayerRef.current.remove(); drawLayerRef.current = null }
      pointsRef.current = []
    }
  }, [placementMode])

  // ── Static layer: closed polygon + preview circles ───────
  useEffect(() => {
    if (staticLayerRef.current) { staticLayerRef.current.remove(); staticLayerRef.current = null }
    if (placementMode !== 'configuring' || !placementPolygon) return

    const g = L.layerGroup()
    L.polygon(placementPolygon, {
      color: '#20C8A0',
      weight: 1.8,
      opacity: 0.85,
      fillColor: '#20C8A0',
      fillOpacity: 0.06,
      interactive: false,
    }).addTo(g)

    // Group preview items by (lat,lng) so we can draw one center marker per
    // site with all its product rings stacked around it.
    const byCenter = new Map()
    ;(placementPreview || []).forEach((p) => {
      const key = `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`
      if (!byCenter.has(key)) byCenter.set(key, { lat: p.lat, lng: p.lng, rings: [] })
      byCenter.get(key).rings.push(p)
    })

    byCenter.forEach((c) => {
      // Draw non-driver rings first (thinner, dashed), then driver on top.
      const sorted = [...c.rings].sort((a, b) => (a.isDriver ? 1 : 0) - (b.isDriver ? 1 : 0))
      sorted.forEach((r) => {
        const product = DRONE_PRODUCTS[r.productId]
        if (!product) return
        L.circle([r.lat, r.lng], {
          radius: r.rangeKm * 1000,
          color: product.color,
          weight:    r.isDriver ? 1.8 : 1.1,
          opacity:   r.isDriver ? 0.90 : 0.55,
          dashArray: r.isDriver ? null  : '4 4',
          fillColor: product.color,
          fillOpacity: r.isDriver ? 0.09 : 0.04,
          interactive: false,
        }).addTo(g)
      })
      // Center marker — single dot for the whole stack.
      L.circleMarker([c.lat, c.lng], {
        radius: 4.5,
        color: '#20C8A0',
        fillColor: '#0D1526',
        fillOpacity: 1,
        weight: 2,
        interactive: false,
      }).addTo(g)
    })

    g.addTo(map)
    staticLayerRef.current = g
    return () => {
      if (staticLayerRef.current) { staticLayerRef.current.remove(); staticLayerRef.current = null }
    }
  }, [placementMode, placementPolygon, placementPreview, map])

  return null
}

/* ── Saved area groups — labelled rectangles on the map ────
   Each persistent group from the sidebar "Gruplar" section renders as a
   dashed rectangle with a small name label anchored at its top-left. The
   currently-highlighted group (from clicking in the sidebar) gets a
   brighter stroke. Non-interactive so they never block clicks. */
function AreaGroupsLayer() {
  const map               = useMap()
  const groups            = useStore((s) => s.areaGroups)
  const highId            = useStore((s) => s.highlightedGroupId)
  const editingId         = useStore((s) => s.editingGroupId)
  const openGroup         = useStore((s) => s.openGroup)
  const setHighlightedGrp = useStore((s) => s.setHighlightedGroup)
  const layerRef          = useRef(null)

  useEffect(() => {
    if (layerRef.current) { layerRef.current.remove(); layerRef.current = null }
    if (!groups?.length) return
    const g = L.layerGroup().addTo(map)
    layerRef.current = g
    groups.forEach((grp) => {
      const isHi  = grp.id === highId
      const isEd  = grp.id === editingId
      const color = grp.color || '#F5C842'
      const rect = L.rectangle(grp.bounds, {
        color,
        weight:       isEd ? 2.6 : isHi ? 2.2 : 1.2,
        opacity:      isEd ? 1    : isHi ? 0.95 : 0.55,
        dashArray:    isEd ? null : '6 4',
        fillColor:    color,
        fillOpacity:  isEd ? 0.12 : isHi ? 0.08 : 0.04,
        interactive:  true,
        // NOTE: leave bubbling ON so right-mousedown still reaches the map's
        // drag-select handler. We only stopPropagation inside the click
        // handler below for the open-group gesture.
      }).addTo(g)
      rect.on('mouseover', () => setHighlightedGrp(grp.id))
      rect.on('mouseout',  () => setHighlightedGrp(null))
      rect.on('click',     (e) => {
        // Left-click opens the group in the info/edit panel. Right-click is
        // reserved for the map-wide drag-select, so only treat a non-modified
        // primary button as the open-group gesture.
        if (e.originalEvent?.button !== 0) return
        L.DomEvent.stopPropagation(e)
        openGroup(grp.id)
      })
      // Name label at the top-left corner. Clickable too for convenience.
      const [[sLat, wLng], [nLat]] = grp.bounds
      const label = L.marker([nLat, wLng], {
        interactive: true,
        icon: L.divIcon({
          className: '',
          iconSize: null,
          iconAnchor: [0, 14],
          html: `<div style="
            display:inline-block;white-space:nowrap;cursor:pointer;
            padding:2px 7px;border-radius:4px 4px 4px 0;
            background:rgba(13,21,38,${isEd ? 0.95 : 0.85});
            border:1px solid ${color}${isEd ? 'FF' : '88'};
            color:${color};
            font-family:'JetBrains Mono',monospace;
            font-size:10px;font-weight:600;
            box-shadow:0 2px 4px rgba(0,0,0,0.4);
          ">◱ ${grp.name}</div>`,
        }),
      }).addTo(g)
      label.on('click', (e) => {
        if (e.originalEvent?.button !== 0) return
        L.DomEvent.stopPropagation(e)
        openGroup(grp.id)
      })
      label.on('mouseover', () => setHighlightedGrp(grp.id))
      label.on('mouseout',  () => setHighlightedGrp(null))
    })
    return () => { if (layerRef.current) { layerRef.current.remove(); layerRef.current = null } }
  }, [groups, highId, editingId, map, openGroup, setHighlightedGrp])
  return null
}

/* ── Nearest-tower line + endpoint marker (inside MapContainer) ── */
function NearestTowerLayer({ nearest }) {
  const map = useMap()
  const lineRef   = useRef(null)
  const markerRef = useRef(null)

  useEffect(() => {
    // Tear down any previous visuals first.
    if (lineRef.current)   { lineRef.current.remove();   lineRef.current = null }
    if (markerRef.current) { markerRef.current.remove(); markerRef.current = null }

    if (!nearest || nearest.status !== 'done') return
    const { origin, tower } = nearest
    if (!origin || !tower) return

    lineRef.current = L.polyline(
      [[origin.lat, origin.lng], [tower.lat, tower.lon]],
      { color: '#A78BFA', weight: 2, dashArray: '6 4', opacity: 0.85, interactive: false }
    ).addTo(map)

    const icon = L.divIcon({
      className: '',
      iconSize: [22, 22],
      iconAnchor: [11, 11],
      html: `<div style="
        width:18px;height:18px;border-radius:50%;
        background:rgba(167,139,250,0.25);
        border:2px solid #A78BFA;
        box-shadow:0 0 8px #A78BFAaa;
      "></div>`,
    })
    markerRef.current = L.marker([tower.lat, tower.lon], { icon, interactive: false }).addTo(map)

    // Fit both points into view without jumping if already close.
    try {
      const bounds = L.latLngBounds([[origin.lat, origin.lng], [tower.lat, tower.lon]])
      if (!map.getBounds().contains(bounds)) {
        map.fitBounds(bounds, { padding: [80, 80], maxZoom: 13, animate: true })
      }
    } catch {}

    return () => {
      if (lineRef.current)   { lineRef.current.remove();   lineRef.current = null }
      if (markerRef.current) { markerRef.current.remove(); markerRef.current = null }
    }
  }, [nearest, map])

  return null
}

/* ── Nearest cell tower helper ──────────────────────────────
   On-demand Overpass lookup: expands the bbox until it finds at least one
   tower, up to ~80 km. Returns { tower, km } or null. */
const NEAREST_TOWER_STEPS_KM = [10, 30, 80]

async function findNearestTower(lat, lng, ac) {
  // 1 deg lat ≈ 111 km; 1 deg lon ≈ 111·cos(lat) km
  const cosLat = Math.cos(lat * Math.PI / 180)
  for (const r of NEAREST_TOWER_STEPS_KM) {
    if (ac.signal.aborted) throw new DOMException('aborted', 'AbortError')
    const dLat = r / 111
    const dLon = r / (111 * Math.max(cosLat, 0.1))
    const bbox = `${(lat - dLat).toFixed(4)},${(lng - dLon).toFixed(4)},${(lat + dLat).toFixed(4)},${(lng + dLon).toFixed(4)}`
    const data = await fetchFromMirrors(TOWER_QUERY(bbox), ac)
    if (ac.signal.aborted) throw new DOMException('aborted', 'AbortError')
    if (!data || data._error) return { _error: data?._error || ['fetch fail'] }
    if (!data.elements || data.elements.length === 0) continue

    let best = null
    let bestKm = Infinity
    for (const el of data.elements) {
      if (el.type !== 'node' || typeof el.lat !== 'number') continue
      const km = haversineKm({ lat, lng }, { lat: el.lat, lng: el.lon })
      if (km < bestKm) { bestKm = km; best = el }
    }
    if (best) return { tower: best, km: bestKm }
  }
  return null
}

/* ── Overlay layers (tile + geojson) ────────────────────── */
const geojsonCache = {}

function OverlayLayers() {
  const activeOverlays = useStore((s) => s.activeOverlays)
  const [geojsonData, setGeojsonData] = useState({})

  useEffect(() => {
    OVERLAY_ORDER.forEach((id) => {
      const overlay = OVERLAYS[id]
      if (overlay.type !== 'geojson') return
      if (!activeOverlays.has(id)) return
      if (geojsonCache[id] || geojsonData[id]) return

      fetch(overlay.url)
        .then((r) => r.json())
        .then((data) => {
          geojsonCache[id] = data
          setGeojsonData((prev) => ({ ...prev, [id]: data }))
        })
        .catch(() => {})
    })
  }, [activeOverlays]) // eslint-disable-line

  // merge cache into local state on first render
  useEffect(() => {
    const cached = {}
    OVERLAY_ORDER.forEach((id) => {
      if (geojsonCache[id]) cached[id] = geojsonCache[id]
    })
    if (Object.keys(cached).length) setGeojsonData((prev) => ({ ...prev, ...cached }))
  }, [])

  return (
    <>
      {OVERLAY_ORDER.map((id) => {
        const overlay = OVERLAYS[id]
        if (!activeOverlays.has(id)) return null

        if (overlay.type === 'geojson') {
          const data = geojsonData[id] || geojsonCache[id]
          if (!data) return null
          return (
            <GeoJSON
              key={id}
              data={data}
              style={overlay.style}
            />
          )
        }

        if (overlay.type === 'tile') {
          return (
            <TileLayer
              key={id}
              url={overlay.url}
              attribution={overlay.attribution}
              opacity={overlay.opacity ?? 0.8}
              subdomains={overlay.subdomains || 'abc'}
              maxZoom={22}
              maxNativeZoom={overlay.maxZoom || 19}
              keepBuffer={3}
              errorTileUrl={EMPTY_TILE}
            />
          )
        }

        return null
      })}
    </>
  )
}

/* ── Context menu portal ─────────────────────────────────── */
function ContextMenu({ menu, onClose }) {
  const ref = useRef(null)

  useEffect(() => {
    if (!menu) return
    const onKey  = (e) => { if (e.key === 'Escape') onClose() }
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [menu, onClose])

  if (!menu) return null

  // Clamp to viewport
  const x = Math.min(menu.x, window.innerWidth  - 180)
  const y = Math.min(menu.y, window.innerHeight - menu.items.length * 36 - 8)

  return createPortal(
    <div
      ref={ref}
      style={{
        position: 'fixed', left: x, top: y, zIndex: 9999,
        background: '#0D1526', border: '1px solid #2A3F5A',
        borderRadius: 8, minWidth: 168,
        boxShadow: '0 8px 32px rgba(0,0,0,0.65), 0 0 0 1px rgba(55,138,221,0.1)',
        overflow: 'hidden', userSelect: 'none',
      }}
    >
      {menu.label && (
        <div style={{ padding: '6px 12px 4px', fontSize: 10, color: '#4A6080', fontFamily: 'monospace', borderBottom: '1px solid #1A2A3F', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          {menu.label}
        </div>
      )}
      {menu.items.map((item, i) => (
        item === 'sep'
          ? <div key={i} style={{ height: 1, background: '#1A2A3F', margin: '2px 0' }} />
          : (
            <button
              key={i}
              onClick={(e) => { e.stopPropagation(); item.action(); onClose() }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                padding: '7px 12px', background: 'transparent', border: 'none',
                cursor: 'pointer', color: item.danger ? '#F87171' : '#C8D8F0',
                fontSize: 12, fontFamily: 'monospace', textAlign: 'left',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#1A2A3F' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            >
              <span style={{ width: 16, textAlign: 'center', opacity: 0.8 }}>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          )
      ))}
    </div>,
    document.body
  )
}

/* ── Map right-click: single-click menu OR drag-select rectangle ──
   Windows-style: a short right-click opens the existing context menu;
   right-click + drag draws a selection rectangle and, on release, flips
   the store into area-selection mode which pops up an info/group panel.
   The native contextmenu event is suppressed for drags so the browser
   menu never competes with our UI. */
function MapRightClickHandler({ openMenuRef, disabled }) {
  const map              = useMap()
  const setAreaSelection = useStore((s) => s.setAreaSelection)
  const stateRef = useRef({
    active:   false,    // true while right button is held
    wasDrag:  false,    // set once movement crosses DRAG_THRESHOLD px
    startPx:  null,
    startLL:  null,
    rect:     null,     // live L.rectangle preview
    suppressNextContextmenu: false,
  })

  const DRAG_THRESHOLD = 6  // px — below this, treat as click

  // Native contextmenu on the container — suppresses the browser menu after
  // a drag. We preventDefault() regardless so the app menu is the only one
  // that can appear.
  useEffect(() => {
    const el = map.getContainer()
    const onCtx = (ev) => {
      ev.preventDefault()
      if (stateRef.current.suppressNextContextmenu) {
        ev.stopImmediatePropagation()
        stateRef.current.suppressNextContextmenu = false
      }
    }
    el.addEventListener('contextmenu', onCtx)
    return () => el.removeEventListener('contextmenu', onCtx)
  }, [map])

  useMapEvents({
    mousedown: (e) => {
      if (disabled) return
      if (e.originalEvent.button !== 2) return
      stateRef.current.active   = true
      stateRef.current.wasDrag  = false
      stateRef.current.startPx  = { x: e.originalEvent.clientX, y: e.originalEvent.clientY }
      stateRef.current.startLL  = e.latlng
    },
    mousemove: (e) => {
      const st = stateRef.current
      if (!st.active || !st.startPx) return
      const dx = e.originalEvent.clientX - st.startPx.x
      const dy = e.originalEvent.clientY - st.startPx.y
      if (!st.wasDrag && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
        st.wasDrag = true
        // Disable map panning for the duration (panning uses left btn anyway,
        // but this keeps cursors/styles consistent).
        map.dragging.disable()
      }
      if (st.wasDrag) {
        const bounds = L.latLngBounds(st.startLL, e.latlng)
        if (!st.rect) {
          st.rect = L.rectangle(bounds, {
            color: '#F5C842', weight: 1.5, opacity: 0.9, dashArray: '5 3',
            fillColor: '#F5C842', fillOpacity: 0.10, interactive: false,
          }).addTo(map)
        } else {
          st.rect.setBounds(bounds)
        }
      }
    },
    mouseup: (e) => {
      const st = stateRef.current
      if (!st.active) return
      const wasRightButton = e.originalEvent.button === 2
      st.active = false
      map.dragging.enable()
      if (!wasRightButton) return

      if (st.wasDrag && st.rect) {
        const b = st.rect.getBounds()
        st.rect.remove()
        st.rect = null
        st.suppressNextContextmenu = true
        setAreaSelection([
          [b.getSouth(), b.getWest()],
          [b.getNorth(), b.getEast()],
        ])
      } else {
        // Not a drag → fall through to the normal contextmenu handler below.
        if (st.rect) { st.rect.remove(); st.rect = null }
      }
      st.wasDrag = false
      st.startPx = null
      st.startLL = null
    },
    contextmenu: (e) => {
      e.originalEvent.preventDefault()
      // If the drag path already consumed this contextmenu, bail out; the
      // native listener above stops propagation. This is a belt-and-braces
      // check in case native listener ordering differs.
      if (stateRef.current.wasDrag) {
        stateRef.current.wasDrag = false
        return
      }
      openMenuRef.current?.(e.originalEvent.clientX, e.originalEvent.clientY, e.latlng, 'map')
    },
  })
  return null
}

/* ── Auto POI / building / street labels at high zoom ────── */
/* Carto label-only tiles with transparent backgrounds + white halos.
   - dark/tactical/satellite bases → dark_only_labels (light text w/ dark halo)
   - light base                    → voyager_only_labels (dark text w/ white
     halo, richest POI/building coverage — looks like Google Maps) */
function HighZoomLabels() {
  const map       = useMap()
  const tileStyle = useStore((s) => s.tileStyle)
  const [zoom, setZoom] = useState(map.getZoom())
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) })
  // Kick in early (z=12 ≈ city-block view) so names appear as user zooms in
  if (zoom < 12) return null

  const darkBase = tileStyle === 'dark' || tileStyle === 'tactical' || tileStyle === 'minimal' || tileStyle === 'satellite'
  // voyager_only_labels has more POIs/buildings than light_only_labels.
  // Uses rastertiles/ path for raster version.
  const url = darkBase
    ? 'https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}@2x.png'
    : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}@2x.png'

  return (
    <TileLayer
      key={url}
      url={url}
      attribution="&copy; CARTO"
      subdomains="abcd"
      opacity={1}
      maxZoom={22}
      maxNativeZoom={20}
      keepBuffer={6}
      zIndex={650}
      pane="overlayPane"
      errorTileUrl={EMPTY_TILE}
    />
  )
}

/* ── Embedded Mapillary street-view panel ────────────────── */
function StreetViewPanel() {
  const mapCenter   = useStore((s) => s.mapCenter)
  const [open,      setOpen]      = useState(false)
  const [token,     setToken]     = useState(() => localStorage.getItem('mly-token') || '')
  const [tokenDraft, setTokenDraft] = useState('')
  const [status,    setStatus]    = useState('idle') // idle|notoken|loading|ready|empty|error
  const [imageId,   setImageId]   = useState(null)
  const viewerRef   = useRef(null)
  const containerRef = useRef(null)
  const mlyRef      = useRef(null)

  const loadMly = useCallback(() => new Promise((resolve, reject) => {
    if (window.mapillary) { resolve(window.mapillary); return }
    const ex = document.querySelector('script[data-mly]')
    if (ex) { ex.addEventListener('load', () => resolve(window.mapillary), { once: true }); return }
    if (!document.querySelector('link[data-mly]')) {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = 'https://unpkg.com/mapillary-js@4.1.2/dist/mapillary.css'
      link.setAttribute('data-mly', '1')
      document.head.appendChild(link)
    }
    const script = document.createElement('script')
    script.src = 'https://unpkg.com/mapillary-js@4.1.2/dist/mapillary.js'
    script.setAttribute('data-mly', '1')
    script.onload  = () => resolve(window.mapillary)
    script.onerror = reject
    document.head.appendChild(script)
  }), [])

  const fetchNearest = useCallback(async (lat, lng, tok) => {
    const d = 0.004
    const res = await fetch(
      `https://graph.mapillary.com/images?fields=id&bbox=${lng-d},${lat-d},${lng+d},${lat+d}&limit=1&access_token=${tok}`,
      { signal: AbortSignal.timeout(9000) }
    )
    const json = await res.json()
    return json?.data?.[0]?.id || null
  }, [])

  const tryOpen = useCallback(async (tok) => {
    if (!tok) { setStatus('notoken'); return }
    setStatus('loading')
    try {
      const mly = await loadMly()
      mlyRef.current = mly
      const [lat, lng] = mapCenter
      const id = await fetchNearest(lat, lng, tok)
      if (!id) { setStatus('empty'); return }
      setImageId(id)
      setStatus('ready')
    } catch {
      setStatus('error')
    }
  }, [mapCenter, loadMly, fetchNearest])

  const handleOpen = () => { setOpen(true); tryOpen(token) }

  const refresh = useCallback(async () => {
    setStatus('loading')
    try {
      const [lat, lng] = mapCenter
      const id = await fetchNearest(lat, lng, token)
      if (!id) { setStatus('empty'); return }
      setImageId(id)
      setStatus('ready')
    } catch { setStatus('error') }
  }, [mapCenter, fetchNearest, token])

  const saveToken = () => {
    const t = tokenDraft.trim()
    if (!t) return
    localStorage.setItem('mly-token', t)
    setToken(t)
    setTokenDraft('')
    tryOpen(t)
  }

  // Mount/move viewer when imageId becomes ready
  useEffect(() => {
    if (status !== 'ready' || !imageId || !containerRef.current || !mlyRef.current) return
    if (viewerRef.current) {
      viewerRef.current.moveTo(imageId).catch(() => {})
      return
    }
    viewerRef.current = new mlyRef.current.Viewer({
      accessToken: token,
      container: containerRef.current,
      imageId,
      component: { cover: false },
    })
  }, [status, imageId, token])

  // Cleanup on close
  useEffect(() => {
    if (!open) {
      viewerRef.current?.remove()
      viewerRef.current = null
      setStatus('idle')
      setImageId(null)
    }
  }, [open])

  if (!open) {
    return (
      <button
        onClick={handleOpen}
        style={{
          position: 'absolute', bottom: 56, left: '50%', transform: 'translateX(-50%)',
          zIndex: 1200, display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 16px', background: 'rgba(13,21,38,0.92)',
          border: '1px solid rgba(55,138,221,0.4)', borderRadius: 20,
          color: '#7AB8F0', fontSize: 12, fontFamily: 'monospace',
          cursor: 'pointer', whiteSpace: 'nowrap',
          boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
        }}
      >
        🚶 Sokak Görünümü
      </button>
    )
  }

  const panelBg  = '#0A1220'
  const borderC  = '#2A3F5A'

  return (
    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0, height: '42%',
      zIndex: 1200, background: panelBg, borderTop: `1px solid ${borderC}`,
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '5px 12px', borderBottom: `1px solid ${borderC}`,
        background: '#080F1A', flexShrink: 0,
      }}>
        <span style={{ fontSize: 12, color: '#7AB8F0', fontFamily: 'monospace', fontWeight: 600 }}>🚶 Sokak Görünümü</span>
        <span style={{ fontSize: 10, color: '#3A5A7A', fontFamily: 'monospace' }}>· Mapillary</span>
        {status === 'ready' && (
          <button onClick={refresh} style={{ marginLeft: 'auto', fontSize: 11, padding: '2px 8px', background: '#1A2A3F', border: `1px solid ${borderC}`, borderRadius: 4, color: '#7AB8F0', cursor: 'pointer', fontFamily: 'monospace' }}>
            ↻ Güncelle
          </button>
        )}
        {token && status !== 'notoken' && (
          <button onClick={() => { localStorage.removeItem('mly-token'); setToken(''); setStatus('notoken') }}
            style={{ marginLeft: status === 'ready' ? 6 : 'auto', fontSize: 10, padding: '2px 6px', background: 'transparent', border: `1px solid ${borderC}`, borderRadius: 4, color: '#4A6080', cursor: 'pointer', fontFamily: 'monospace' }}>
            token
          </button>
        )}
        <button onClick={() => setOpen(false)}
          style={{ marginLeft: (status === 'ready' || token) ? 6 : 'auto', fontSize: 16, background: 'none', border: 'none', color: '#4A6080', cursor: 'pointer', lineHeight: 1, paddingTop: 1 }}>
          ✕
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {status === 'notoken' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 14, padding: '16px 32px', textAlign: 'center', fontFamily: 'monospace' }}>
            <div style={{ fontSize: 32 }}>🗝️</div>
            <div style={{ color: '#C8D8F0', fontSize: 13, fontWeight: 600 }}>Mapillary Erişim Tokeni Gerekiyor</div>
            <div style={{ color: '#6B7FA0', fontSize: 11, lineHeight: 1.7 }}>
              1.{' '}
              <a href="https://www.mapillary.com/dashboard/developers" target="_blank" rel="noopener noreferrer" style={{ color: '#7AB8F0' }}>
                mapillary.com/dashboard/developers
              </a>{' '}→ hesap oluşturun (ücretsiz)<br/>
              2. "Register application" → uygulama oluşturun<br/>
              3. <b style={{ color: '#C8D8F0' }}>Client Token</b>'ı kopyalayıp aşağıya yapıştırın
            </div>
            <div style={{ display: 'flex', gap: 8, width: '100%', maxWidth: 460 }}>
              <input
                value={tokenDraft}
                onChange={(e) => setTokenDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && saveToken()}
                placeholder="MLY|... token yapıştırın"
                style={{ flex: 1, padding: '7px 12px', background: '#1A2A3F', border: `1px solid ${borderC}`, borderRadius: 6, color: '#C8D8F0', fontSize: 12, fontFamily: 'monospace', outline: 'none' }}
              />
              <button onClick={saveToken}
                style={{ padding: '7px 16px', background: '#378ADD22', border: '1px solid #378ADD66', borderRadius: 6, color: '#7AB8F0', fontSize: 12, fontFamily: 'monospace', cursor: 'pointer' }}>
                Kaydet
              </button>
            </div>
          </div>
        )}

        {status === 'loading' && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 10, color: '#6B7FA0', fontFamily: 'monospace', fontSize: 12 }}>
            <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</span>
            Yakındaki sokak fotoğrafları aranıyor…
          </div>
        )}

        {status === 'empty' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 10, color: '#6B7FA0', fontFamily: 'monospace' }}>
            <div style={{ fontSize: 24 }}>🔍</div>
            <div style={{ fontSize: 12 }}>Bu alanda sokak fotoğrafı bulunamadı</div>
            <div style={{ fontSize: 10, color: '#4A6080' }}>Mapillary kapsama dışı bölge · haritayı kaydırıp tekrar deneyin</div>
            <button onClick={refresh} style={{ marginTop: 4, padding: '4px 14px', background: '#1A2A3F', border: `1px solid ${borderC}`, borderRadius: 6, color: '#7AB8F0', fontSize: 11, fontFamily: 'monospace', cursor: 'pointer' }}>
              ↻ Tekrar dene
            </button>
          </div>
        )}

        {status === 'error' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 10, color: '#F87171', fontFamily: 'monospace' }}>
            <div style={{ fontSize: 12 }}>✕ Yüklenemedi</div>
            <button onClick={() => tryOpen(token)} style={{ padding: '4px 14px', background: '#F8717122', border: '1px solid #F8717155', borderRadius: 4, color: '#F87171', fontSize: 11, fontFamily: 'monospace', cursor: 'pointer' }}>
              ↻ Tekrar dene
            </button>
          </div>
        )}

        {/* Mapillary viewer mounts here */}
        <div ref={containerRef} style={{ width: '100%', height: '100%', display: status === 'ready' ? 'block' : 'none' }} />
      </div>
    </div>
  )
}

/* ── Main MapView ───────────────────────────────────────── */
export default function MapView({
  facilities,
  tairosNodes,
  coverageLayers = [],   // [{ id, polygon, color, fillOpacity, strokeOpacity }]
  onMapClick,
  radarFacilities = [],  // sites where the global radar toggle should place a scope
  radarRangeKm    = 60,
}) {
  const mapCenter      = useStore((s) => s.mapCenter)
  const mapZoom        = useStore((s) => s.mapZoom)
  const dedupeMode     = useStore((s) => s.dedupeMode)
  const addNode        = useStore((s) => s.addNode)
  const removeNode     = useStore((s) => s.removeNode)
  const selectFacility = useStore((s) => s.selectFacility)
  const nodeEditMode   = useStore((s) => s.nodeEditMode)

  // Lazy panel gate flags — read *just* the boolean-ish trigger so the
  // heavy panel dynamic imports don't fire until the operator actually
  // engages with a conflict / formation / placement draw / area select.
  const placementMode     = useStore((s) => s.placementMode)
  const areaSelection     = useStore((s) => s.areaSelection)
  const selectedConflict  = useStore((s) => s.selectedConflict)
  const selectedDeployUnit = useStore((s) => s.selectedDeployUnit)

  const [measureActive, setMeasureActive] = useState(false)
  const [measureResult, setMeasureResult] = useState(null)
  const handleMeasureResult  = useCallback((r) => setMeasureResult(r), [])
  const handleMeasureClear   = useCallback(() => setMeasureResult(null), [])

  /* Zoom-responsive marker sizing.
     Two CSS custom properties, written to :root whenever the camera zoom
     changes:
       • --tairos-zoom-scale  — master size multiplier applied to every
         map marker (force, global site, conflict asset, tairos node).
         Markers subtly breathe — smaller at wide zoom, bigger at close
         zoom — so the operator's eye gets a spatial cue on top of the
         discrete LOD mode-swaps (full/compact/dot/hidden).
       • --tairos-strap-cap   — max-width cap for text straps under
         markers. Collapses hard at continent/region so long formation
         names don't cannibalise neighbours.
     Curve stays within [0.80, 1.30] — enough to feel, not enough to
     make the icon design break down. */
  useEffect(() => {
    const z = Number(mapZoom) || 5
    const scale = Math.max(0.80, Math.min(1.30, 0.60 + 0.06 * z))
    // Strap cap: tier-scaled text width. Theatre/army HQ names still
    // need room at continent view (the pyramid reveals them there),
    // so 0 is no longer usable — 100px barely fits "3rd Motor Rifle
    // Army" after the ~0.82 scale is applied, and lets every cluster
    // of <=5 HQs co-exist without edge overrun.
    const cap =
      z <= 3 ? '100px' :
      z <= 5 ? '120px' :
      z <= 7 ? '150px' :
      '180px'
    const root = document.documentElement
    root.style.setProperty('--tairos-zoom-scale', scale.toFixed(3))
    root.style.setProperty('--tairos-strap-cap', cap)
    // Discrete tier class for CSS that wants step-wise rules (e.g. hide
    // low-importance markers at continent, show everything at local).
    const tier = z <= 3 ? 'continent' : z <= 5 ? 'region' : z <= 7 ? 'country' : 'local'
    root.setAttribute('data-tairos-zoom-tier', tier)
  }, [mapZoom])

  // Shared canvas renderer for every path (polylines + polygons). Canvas is
  // vastly faster than SVG when the map is dense — infrastructure overlays
  // produce thousands of polylines and the SVG DOM grinds. `tolerance: 10`
  // lets hover pick up a line from 10 px away, so we don't need the fat
  // invisible hit-target polyline trick anymore.
  const mapRenderer = useMemo(() => L.canvas({ padding: 0.5, tolerance: 10 }), [])

  // ── Nearest-tower lookup (on-demand Overpass query) ──────
  // Triggered from right-click menu. Shows a dashed line origin→tower + a
  // distance badge. Auto-cancels on re-invoke / dismiss.
  const [nearest, setNearest] = useState(null) // null | { status, origin, km?, tower?, error? }
  const nearestAcRef = useRef(null)
  const runNearestTower = useCallback(async (origin) => {
    if (nearestAcRef.current) nearestAcRef.current.abort()
    const ac = new AbortController()
    nearestAcRef.current = ac
    setNearest({ status: 'loading', origin })
    try {
      const result = await findNearestTower(origin.lat, origin.lng, ac)
      if (ac.signal.aborted) return
      if (!result) { setNearest({ status: 'empty', origin }); return }
      if (result._error) { setNearest({ status: 'error', origin, error: result._error }); return }
      setNearest({ status: 'done', origin, tower: result.tower, km: result.km })
    } catch (e) {
      if (e.name !== 'AbortError') setNearest({ status: 'error', origin, error: [e.message || 'fail'] })
    }
  }, [])
  const dismissNearest = useCallback(() => {
    if (nearestAcRef.current) nearestAcRef.current.abort()
    setNearest(null)
  }, [])

  // ── Context menu ─────────────────────────────────────────
  const [ctxMenu, setCtxMenu] = useState(null)
  const closeCtxMenu = useCallback(() => setCtxMenu(null), [])

  // Stable ref so Leaflet handlers always see latest callbacks without re-binding
  const openMenuRef = useRef(null)
  openMenuRef.current = (clientX, clientY, latlng, type, extra = {}) => {
    const copy = () => navigator.clipboard?.writeText(`${latlng.lat.toFixed(6)}, ${latlng.lng.toFixed(6)}`)
    const coordLabel = `${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)}`

    const nearestTowerItem = {
      icon: '📡',
      label: 'En Yakın Baz İstasyonu',
      action: () => runNearestTower({ lat: latlng.lat, lng: latlng.lng }),
    }

    let label, items
    if (type === 'map') {
      label = coordLabel
      items = [
        { icon: '◆', label: 'Node Ekle',          action: () => addNode(latlng.lat, latlng.lng) },
        { icon: '📏', label: 'Mesafe Ölç',         action: () => setMeasureActive(true) },
        nearestTowerItem,
        'sep',
        { icon: '📋', label: 'Koordinatı Kopyala', action: copy },
      ]
    } else if (type === 'node' || type === 'custom-node') {
      // All Tairos nodes are fully modifiable — preset or user-added.
      label = extra.name || 'Tairos Node'
      items = [
        { icon: 'ℹ️', label: 'Detayları Gör',      action: () => selectFacility({ ...extra, category: 'tairos' }) },
        { icon: '✕', label: 'Node Sil', danger: true, action: () => removeNode(extra.id) },
        'sep',
        { icon: '📏', label: 'Mesafe Ölç',         action: () => setMeasureActive(true) },
        nearestTowerItem,
        { icon: '📋', label: 'Koordinatı Kopyala', action: copy },
      ]
    } else { // facility
      const cat = CATEGORIES[extra.category]
      label     = cat?.labelShort ? `${extra.name} · ${cat.labelShort}` : (extra.name || 'Varlık')
      items = [
        { icon: 'ℹ️', label: 'Detayları Gör',      action: () => selectFacility(extra) },
        { icon: '📏', label: 'Mesafe Ölç',         action: () => setMeasureActive(true) },
        nearestTowerItem,
        { icon: '📋', label: 'Koordinatı Kopyala', action: copy },
      ]
    }
    setCtxMenu({ x: clientX, y: clientY, label, items })
  }

  return (
    <div className="flex-1 relative">
      {/* Measure toggle button */}
      <button
        onClick={() => setMeasureActive((v) => !v)}
        title="Mesafe ölç (iki noktaya tıkla)"
        className={`absolute top-2 right-12 z-[1200] flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-mono transition-all ${
          measureActive
            ? 'bg-yellow-400/15 border-yellow-400/60 text-yellow-300'
            : 'bg-ops-800/90 border-ops-600 text-ops-300 hover:border-ops-400'
        }`}
      >
        📏 {measureActive ? 'İptal' : 'Mesafe Ölç'}
      </button>

      {/* Measure result badge */}
      {measureActive && measureResult && (
        <div
          className="absolute top-2 right-40 z-[1200] px-3 py-1.5 rounded-lg border font-mono text-xs"
          style={{ background: 'rgba(13,21,38,0.92)', borderColor: '#F5C84255', color: '#F5C842' }}
        >
          {measureResult.status === 'first'
            ? '→ İkinci noktayı seç'
            : `📏 ${measureResult.km < 1
                ? `${(measureResult.km * 1000).toFixed(0)} m`
                : `${measureResult.km.toFixed(1)} km`}`
          }
        </div>
      )}
      {measureActive && !measureResult && (
        <div
          className="absolute top-2 right-40 z-[1200] px-3 py-1.5 rounded-lg border font-mono text-xs"
          style={{ background: 'rgba(13,21,38,0.92)', borderColor: '#F5C84255', color: '#6B7FA0' }}
        >
          → Birinci noktayı seç
        </div>
      )}

      {/* Nearest-tower result badge */}
      {nearest && (() => {
        const km = nearest.km
        const operator = nearest.tower?.tags?.operator || nearest.tower?.tags?.network || 'Bilinmeyen operatör'
        const ref = nearest.tower?.tags?.ref || ''
        const title = nearest.status === 'loading' ? '📡 En yakın baz istasyonu aranıyor…'
                    : nearest.status === 'empty'   ? '📡 Yakında baz istasyonu bulunamadı (80 km)'
                    : nearest.status === 'error'   ? '📡 Sorgu başarısız'
                    : null
        const distanceText = km == null ? '' :
          km < 1 ? `${(km * 1000).toFixed(0)} m` :
          km < 10 ? `${km.toFixed(2)} km` : `${km.toFixed(1)} km`

        return (
          <div
            className="absolute top-14 right-2 z-[1200] rounded-lg border font-mono text-xs"
            style={{
              background: 'rgba(13,21,38,0.95)',
              borderColor: nearest.status === 'error' ? '#F8717177' : '#A78BFA55',
              color: '#C8D8F0',
              minWidth: 220, maxWidth: 280,
              boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
            }}
          >
            <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b" style={{ borderColor: '#A78BFA33' }}>
              <span style={{ color: '#A78BFA', fontSize: 10, letterSpacing: '0.05em' }}>EN YAKIN BAZ İSTASYONU</span>
              <button
                onClick={dismissNearest}
                style={{ color: '#4A6080', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}
                title="Kapat"
              >✕</button>
            </div>
            <div className="px-3 py-2">
              {title && <div className="text-xs" style={{ color: nearest.status === 'error' ? '#F87171' : '#6B7FA0' }}>
                {nearest.status === 'loading' && <span style={{ display: 'inline-block', marginRight: 6 }}>⟳</span>}
                {title}
              </div>}
              {nearest.status === 'done' && (
                <>
                  <div className="flex items-baseline gap-1.5" style={{ color: '#A78BFA' }}>
                    <span style={{ fontSize: 18, fontWeight: 700 }}>{distanceText}</span>
                    <span style={{ fontSize: 10, color: '#6B7FA0' }}>kuş uçuşu</span>
                  </div>
                  <div style={{ fontSize: 11, color: '#C8D8F0', marginTop: 4 }}>{operator}{ref ? ` · ${ref}` : ''}</div>
                  <div style={{ fontSize: 10, color: '#4A6080', marginTop: 2 }}>
                    {nearest.tower.lat.toFixed(4)}, {nearest.tower.lon.toFixed(4)}
                  </div>
                </>
              )}
              {nearest.status === 'error' && (
                <button
                  onClick={() => runNearestTower(nearest.origin)}
                  style={{ marginTop: 6, padding: '3px 10px', background: '#F8717122', border: '1px solid #F8717155', borderRadius: 4, color: '#F87171', fontSize: 11, fontFamily: 'monospace', cursor: 'pointer' }}
                >↻ Tekrar dene</button>
              )}
            </div>
          </div>
        )
      })()}

      <MapContainer
        center={mapCenter}
        zoom={mapZoom}
        zoomSnap={0.5}
        zoomDelta={0.5}
        wheelPxPerZoomLevel={80}
        className="w-full h-full"
        zoomControl={false}
        scrollWheelZoom={true}
        attributionControl={true}
        renderer={mapRenderer}
      >
        <DynamicMaxZoom />
        <DynamicTile />
        <HighZoomLabels />
        <ZoomControl position="bottomright" />
        <ScaleControl position="bottomleft" imperial={false} />
        <MapEvents onClick={onMapClick} />
        <MapRightClickHandler openMenuRef={openMenuRef} />
        <FlyToSelected />
        <FlyToConflict />
        <FlyToCountry />
        <FlyToPoint />
        <NodeEditLayer measureActive={measureActive} />
        <MeasureLayer active={measureActive} onResult={handleMeasureResult} onClear={handleMeasureClear} />
        <PlacementLayer />
        <AreaGroupsLayer />
        <WeatherLayer />
        <ConflictLayer />
        <ConflictAssetLayer />
        <GlobalSitesLayer />
        <ThreatProjectionLayer />
        <ForceDeploymentLayer />
        <CountryFocusLayer />
        <KillChainLayer />
        <OverlayLayers />
        <TowerLayer />
        <PowerLayer />
        <InternetLayer />
        <WaterLayer />
        <MaritimeLayer />
        <NearestTowerLayer nearest={nearest} />

        {/* One coverage polygon per active layer */}
        {coverageLayers.map((layer) => (
          <CoverageLayer
            key={layer.id}
            polygon={layer.polygon}
            color={layer.color}
            opacity={layer.fillOpacity ?? 0.12}
            strokeOpacity={layer.strokeOpacity ?? 0.45}
          />
        ))}

        {/* Per-facility product deployment circles (user-placed products) */}
        <FacilityProductLayer facilities={facilities} tairosNodes={tairosNodes || []} />

        {/* Global radar sweeps driven by the sidebar Radar toggle.
            Renders a scope at every source facility/node of the 'radar' drone. */}
        <GlobalRadarLayer facilities={radarFacilities} rangeKm={radarRangeKm} />

        <FacilityMarkers
          facilities={facilities}
          tairosNodes={tairosNodes || []}
          dedupeMode={dedupeMode}
          openMenuRef={openMenuRef}
        />
      </MapContainer>

      <StreetViewPanel />
      <ContextMenu menu={ctxMenu} onClose={closeCtxMenu} />

      {/* Lazy edge panels — mount + dynamic-import only once the operator
          actually triggers the relevant mode/selection. Suspense fallback
          is null because each of these is a slide-in drawer; a visible
          "Yükleniyor…" block would jar the operator. After first use, the
          chunk stays cached and subsequent opens are instant. */}
      {placementMode !== 'idle' && (
        <Suspense fallback={null}><PlacementPanel /></Suspense>
      )}
      {areaSelection && (
        <Suspense fallback={null}><AreaInfoPanel /></Suspense>
      )}
      {selectedConflict && (
        <Suspense fallback={null}><ConflictDetailPanel /></Suspense>
      )}
      {selectedDeployUnit && (
        <Suspense fallback={null}><ForceDeployDetailPanel /></Suspense>
      )}

      <MapLayersIsland />
      <ThreatLegend />
    </div>
  )
}
