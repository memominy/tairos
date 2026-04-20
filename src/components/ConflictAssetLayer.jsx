import React, { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import useStore from '../store/useStore'
import conflictAssets from '../data/conflictAssets.json'
import {
  CONFLICT_ASSET_TYPES,
  CONFLICT_SIDE_COLOUR,
} from '../config/conflictAssets'

/**
 * Foreign-theatre strategic-asset rendering layer.
 *
 * Intentionally isolated from the domestic Turkish inventory layer:
 *
 *   Domestic (facilities)         Foreign (this layer)
 *   ───────────────────           ─────────────────────
 *   src/config/categories.js      src/config/conflictAssets.js
 *   src/data/facilities.json      src/data/conflictAssets.json
 *   activeCategories              conflictAssetsOn
 *   pane: overlayPane (default)   pane: conflict-asset-pane (z 475)
 *
 * Two namespaces means Turkey's airforce filter can never accidentally
 * toggle Iran's nuclear sites, and vice versa. That was the whole point
 * of the split — "hersey birbirine karismasin diye".
 *
 * Rendering rules
 * ───────────────
 *   - Only shown when `conflictsOn && conflictAssetsOn && selectedConflict`.
 *     The layer is scoped to the CURRENTLY selected conflict so 13 theatres
 *     × dozens of markers never all paint at once. Clicking a bubble
 *     opens the conflict → this layer adds its overlay on top.
 *   - Side-tinted divIcon markers: cool-blue for Side A, warm-brick for
 *     Side B, neutral for unaligned. Each marker carries the asset type's
 *     glyph and a small name tag.
 *   - A Leaflet popup opens on click with the asset's name, type,
 *     side (via `sideLabels` override if present), and free-form info.
 *   - Kind filter (`conflictAssetKindFilter`) lets the operator hide
 *     e.g. all civic assets to focus on kinetic only.
 *
 * Performance: everything is a single `L.layerGroup` that is torn down
 * and rebuilt when the selected conflict or filter changes. Asset counts
 * per theatre are small (5-15), so the rebuild is cheap.
 */
export default function ConflictAssetLayer() {
  const map = useMap()

  const conflictsOn     = useStore((s) => s.conflictsOn)
  const assetsOn        = useStore((s) => s.conflictAssetsOn)
  const kindFilter      = useStore((s) => s.conflictAssetKindFilter)
  const selectedConf    = useStore((s) => s.selectedConflict)
  const selectedAsset   = useStore((s) => s.selectedConflictAsset)
  const hoveredAssetId  = useStore((s) => s.hoveredConflictAssetId)
  const selectAsset     = useStore((s) => s.selectConflictAsset)
  const setHoveredAsset = useStore((s) => s.setHoveredConflictAsset)

  const groupRef   = useRef(null)
  const markersRef = useRef(new Map())   // id → L.marker

  /* Dedicated pane sits ABOVE the conflict geometry (zones / frontline /
     bubbles live on zIndex 470) so asset markers stay clickable even
     when they fall inside a contested polygon. */
  useEffect(() => {
    if (!map.getPane('conflict-asset-pane')) {
      const pane = map.createPane('conflict-asset-pane')
      pane.style.zIndex = 475
    }
  }, [map])

  /* Build / rebuild when the selected conflict, visibility, or filter
     changes. We deliberately key the layer to the CURRENT conflict —
     showing every asset from every theatre at once would turn the map
     into confetti. */
  useEffect(() => {
    // Tear down any previous render.
    if (groupRef.current) { groupRef.current.remove(); groupRef.current = null }
    markersRef.current.clear()

    if (!conflictsOn || !assetsOn) return
    if (!selectedConf) return

    const assets = conflictAssets[selectedConf.id]
    if (!Array.isArray(assets) || assets.length === 0) return

    const group = L.layerGroup().addTo(map)
    groupRef.current = group

    // Optional per-conflict side-label override (e.g. "Ukrayna" / "Rusya"
    // instead of generic "Taraf A" / "Taraf B"). Falls back to the global
    // defaults if the conflict entry doesn't carry one.
    const sideLabels = selectedConf.sideLabels || {}

    assets.forEach((a) => {
      const type = CONFLICT_ASSET_TYPES[a.type]
      if (!type) return
      if (kindFilter !== 'all' && type.kind !== kindFilter) return

      const sideTint = CONFLICT_SIDE_COLOUR[a.side] || '#A0A8B4'
      const tint     = a.side ? sideTint : type.color

      const html = `
        <div class="tairos-conflict-asset-marker"
             style="--asset-color:${tint}; --asset-type-color:${type.color}">
          <span class="tairos-conflict-asset-glyph">${escapeHtml(type.glyph)}</span>
          <span class="tairos-conflict-asset-name">${escapeHtml(a.name)}</span>
        </div>
      `
      const marker = L.marker([a.lat, a.lng], {
        pane: 'conflict-asset-pane',
        icon: L.divIcon({
          className: `tairos-conflict-asset side-${(a.side || 'n').toLowerCase()} kind-${type.kind}`,
          html,
          iconSize: [0, 0],
          iconAnchor: [0, 0],
        }),
        bubblingMouseEvents: false,
        riseOnHover: true,
      }).addTo(group)

      marker.bindPopup(buildPopup(a, type, sideLabels), {
        className: 'tairos-conflict-asset-popup',
        closeButton: true,
        offset: [0, -8],
        maxWidth: 260,
      })

      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e)
        selectAsset(a)
      })
      marker.on('popupclose', () => {
        // Popup close should only clear if THIS asset is still the
        // selected one — avoids stomping a subsequent selection.
        const cur = useStore.getState().selectedConflictAsset
        if (cur && cur.id === a.id) useStore.getState().clearConflictAsset()
      })
      marker.on('mouseover', () => setHoveredAsset(a.id))
      marker.on('mouseout',  () => setHoveredAsset(null))

      markersRef.current.set(a.id, marker)
    })

    return () => {
      if (groupRef.current) { groupRef.current.remove(); groupRef.current = null }
      markersRef.current.clear()
    }
  }, [map, conflictsOn, assetsOn, kindFilter, selectedConf, selectAsset, setHoveredAsset])

  /* Sync external hover / panel selection → map emphasis without rebuilding
     the layer. Also opens the popup for the externally-selected asset. */
  useEffect(() => {
    markersRef.current.forEach((marker, id) => {
      const el = marker.getElement()
      if (!el) return
      const hot = id === hoveredAssetId || id === selectedAsset?.id
      el.classList.toggle('is-hot', !!hot)
    })
    if (selectedAsset && markersRef.current.has(selectedAsset.id)) {
      const m = markersRef.current.get(selectedAsset.id)
      if (m && !m.isPopupOpen()) m.openPopup()
    }
  }, [hoveredAssetId, selectedAsset])

  return null
}

/* ── helpers ────────────────────────────────────────────────────── */

function buildPopup(asset, type, sideLabels) {
  const sideTint = CONFLICT_SIDE_COLOUR[asset.side] || '#A0A8B4'
  const sideName = asset.side
    ? (sideLabels[asset.side] || `Taraf ${asset.side}`)
    : 'Tarafsız'
  const countryLine = asset.country
    ? `<div class="tairos-conflict-asset-country">${escapeHtml(asset.country)}</div>`
    : ''
  const info = asset.info
    ? `<div class="tairos-conflict-asset-info">${escapeHtml(asset.info)}</div>`
    : ''
  return `
    <div class="tairos-conflict-asset-popup-inner" style="--asset-color:${sideTint}; --asset-type-color:${type.color}">
      <div class="tairos-conflict-asset-popup-head">
        <span class="tairos-conflict-asset-popup-glyph">${escapeHtml(type.glyph)}</span>
        <div class="tairos-conflict-asset-popup-titles">
          <div class="tairos-conflict-asset-popup-name">${escapeHtml(asset.name)}</div>
          <div class="tairos-conflict-asset-popup-type">${escapeHtml(type.label)}</div>
        </div>
      </div>
      ${countryLine}
      <div class="tairos-conflict-asset-popup-side">
        <span class="tairos-conflict-asset-popup-dot"></span>
        <span>${escapeHtml(sideName)}</span>
      </div>
      <div class="tairos-conflict-asset-popup-doctrine">${escapeHtml(type.doctrine)}</div>
      ${info}
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
