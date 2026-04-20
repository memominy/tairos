import React, { useEffect, useRef, useMemo, useState } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import useStore from '../store/useStore'
import {
  THREAT_PROFILES,
  THREAT_STYLES,
  resolveSamSystem,
  FORCE_SIDE_COLOUR,
  UNIT_TYPES,
} from '../config/forceDeployments'

/**
 * Tehdit Projeksiyonu — düşman (ve seçime bağlı, dost) kuvvetlerin
 * etki alanlarını haritaya yansıtan katman.
 *
 * Her kuvvet-konuşlanması birimi, tipine göre bir "don't-stand-here"
 * halkası çizer:
 *   • airdef (HVS) → gerçek SAM dome (S-400 = 400 km, Pantsir = 20 km, …)
 *   • art / MLRS   → alan ateşi yarıçapı
 *   • uav / air    → görev yarıçapı
 *   • naval        → deniz kontrol menzili
 *   • armor / mech → yakın kara tehdit halkası
 *
 * İki görsel pas:
 *   1. Ana halka + iç odak halka + origin nokta
 *   2. İsimli SAM sistemleri için halka kuzey kenarında
 *      divIcon etiketi ("S-400 · 400 km") — zoom >= 5'te görünür,
 *      daha geniş zoom'da isimli sistemlerin "kim olduğunu" söyler.
 *
 * Kill-chain focus modu: `killChainOn && selected.type === 'hq'`
 * olduğunda, seçili HQ'ya bağlı olmayan birimlerin halkaları
 * opaklıkta %30'a düşürülür (CSS class `is-faded`) — operatör
 * seçilen zincire odaklanırken arka plan kaybolmaz, sessizleşir.
 *
 * Pane (zIndex 474) konuşlanma chip'lerinin ALTINDA — chip'leri
 * tıklanabilir bırakırız, halkalar sadece görsel.
 */
export default function ThreatProjectionLayer() {
  const map = useMap()

  const on              = useStore((s) => s.threatProjectionOn)
  const sides           = useStore((s) => s.threatProjectionSides)
  const styles          = useStore((s) => s.threatProjectionStyles)
  const intensity       = useStore((s) => s.threatIntensity)
  const scope           = useStore((s) => s.forceDeployScope)
  const selectedConflict= useStore((s) => s.selectedConflict)
  const killChainOn     = useStore((s) => s.killChainOn)
  const selectedUnit    = useStore((s) => s.selectedDeployUnit)

  const groupRef = useRef(null)
  const [data, setData] = useState(null)
  const [zoom, setZoom] = useState(() => {
    try { return map.getZoom() } catch { return 5 }
  })

  /* Dedicated panes. threat-dome-pane (474) sits below the force-deploy
     chips (480); threat-label-pane (482) sits ABOVE them so named SAM
     edge labels stay legible even when chips pile up near a dome. */
  useEffect(() => {
    if (!map.getPane('threat-dome-pane')) {
      const pane = map.createPane('threat-dome-pane')
      pane.style.zIndex = 474
      pane.style.pointerEvents = 'none'
    }
    if (!map.getPane('threat-label-pane')) {
      const pane = map.createPane('threat-label-pane')
      pane.style.zIndex = 482
      pane.style.pointerEvents = 'none'
    }
  }, [map])

  /* Track zoom so SAM labels can gate visibility without triggering
     heavy ring rebuilds — the effect dep below is intentional. */
  useEffect(() => {
    const onZoom = () => setZoom(map.getZoom())
    map.on('zoomend', onZoom)
    return () => map.off('zoomend', onZoom)
  }, [map])

  /* Lazy-load the same seed the force-deploy layer uses. */
  useEffect(() => {
    if (!on || data) return
    let cancelled = false
    import('../data/forceDeployments.json').then((mod) => {
      if (cancelled) return
      setData(flattenForceData(mod.default))
    }).catch(() => { if (!cancelled) setData([]) })
    return () => { cancelled = true }
  }, [on, data])

  /* Resolve threat envelope per unit. */
  const threats = useMemo(() => {
    if (!on || !data) return []
    return data
      .filter((u) => {
        if (!sides.has(u.side)) return false
        if (scope === 'selected-conflict') {
          if (!selectedConflict?.id) return false
          if (u.conflict !== selectedConflict.id) return false
        }
        const prof = THREAT_PROFILES[u.type]
        if (!prof || prof.style === 'passive') return false
        if (!styles.has(prof.style)) return false
        return true
      })
      .map((u) => {
        const prof = THREAT_PROFILES[u.type]
        const sam  = u.type === 'airdef' ? resolveSamSystem(u) : null
        const rangeKm = (u.threatKm && Number(u.threatKm))
                     || sam?.rangeKm
                     || prof.rangeKm
        const visual = THREAT_STYLES[prof.style] || THREAT_STYLES.ground
        return {
          u,
          rangeKm,
          label: sam?.label || prof.label,
          samLabel: sam?.label || null,
          style: prof.style,
          visual,
          sideColour: FORCE_SIDE_COLOUR[u.side] || '#888',
          isSam: !!sam,
        }
      })
      .filter((t) => t.rangeKm > 0)
      .sort((a, b) => b.rangeKm - a.rangeKm)
  }, [on, data, sides, styles, scope, selectedConflict])

  /* Kill-chain focus set. Mirrors KillChainLayer's resolver so the
     "chain" a user sees on-screen matches the non-faded rings here.
     Only parentId + name-substring are used for focus (no proximity
     fallback) — proximity fallback is a "show SOMETHING" crutch for
     the chain renderer, not a statement of real subordination. */
  const focusIds = useMemo(() => {
    if (!killChainOn || !selectedUnit || selectedUnit.type !== 'hq' || !data) return null
    const keys = [selectedUnit.name, selectedUnit.formation]
      .filter((s) => s && s.length >= 4)
      .map((s) => s.toLowerCase())
    const ids = new Set([selectedUnit.id])
    data.forEach((u) => {
      if (u.id === selectedUnit.id) return
      if (u.side !== selectedUnit.side) return
      if (u.conflict !== selectedUnit.conflict) return
      if (u.parentId === selectedUnit.id) { ids.add(u.id); return }
      if (keys.length > 0) {
        const hay = `${u.formation || ''} ${u.note || ''}`.toLowerCase()
        if (keys.some((k) => hay.includes(k))) { ids.add(u.id); return }
      }
    })
    // If only the HQ itself is in the set (no real matches), skip focus
    // mode entirely — we don't want a whole-map blackout when the HQ
    // genuinely has no wired subordinates.
    return ids.size > 1 ? ids : null
  }, [killChainOn, selectedUnit, data])

  /* Build / rebuild the Leaflet layer. */
  useEffect(() => {
    if (groupRef.current) { groupRef.current.remove(); groupRef.current = null }
    if (!on || threats.length === 0) return

    const group = L.layerGroup().addTo(map)
    groupRef.current = group

    threats.forEach(({ u, rangeKm, visual, isSam, sideColour, style, samLabel }) => {
      const radiusMeters = rangeKm * 1000
      const faded = focusIds && !focusIds.has(u.id)
      const fadeClass = faded ? ' is-faded' : ''
      const fadeMul   = faded ? 0.28 : 1

      // Main engagement ring
      L.circle([u.lat, u.lng], {
        pane: 'threat-dome-pane',
        radius: radiusMeters,
        color: visual.color,
        weight: isSam ? 1.6 : 1.1,
        opacity: Math.min(1, (intensity + 0.25)) * fadeMul,
        fillColor: visual.color,
        fillOpacity: (isSam ? 0.10 : 0.06) * intensity * fadeMul,
        dashArray: isSam ? '6,4' : '3,5',
        interactive: false,
        className: `tairos-threat-ring style-${style} side-${u.side}${isSam ? ' is-sam' : ''}${fadeClass}`,
      }).addTo(group)

      // Inner focal ring at 35% — only for long-range systems.
      if (rangeKm >= 80) {
        L.circle([u.lat, u.lng], {
          pane: 'threat-dome-pane',
          radius: radiusMeters * 0.35,
          color: visual.color,
          weight: 1,
          opacity: (0.35 * intensity + 0.15) * fadeMul,
          fillColor: visual.color,
          fillOpacity: 0.04 * intensity * fadeMul,
          interactive: false,
          dashArray: null,
          className: `tairos-threat-ring-inner style-${style} side-${u.side}${fadeClass}`,
        }).addTo(group)
      }

      // Origin dot
      L.circleMarker([u.lat, u.lng], {
        pane: 'threat-dome-pane',
        radius: isSam ? 3.5 : 2.5,
        color: sideColour,
        weight: 1.2,
        fillColor: visual.color,
        fillOpacity: 0.9 * fadeMul,
        opacity: 0.95 * fadeMul,
        interactive: false,
      }).addTo(group)

      // Named SAM edge label. Zoom-gated by range so wide-zoom views
      // only show the strategic domes (S-400/Patriot/HQ-9) and the
      // crowd of 20-50 km point-defence systems only appears once
      // the operator has zoomed in enough for labels not to collide.
      //   zoom >=7 → all named SAMs get labels
      //   zoom 6  → only ≥80 km systems (BUK, NASAMS, IRIS-T, HISAR…)
      //   zoom 5  → only ≥150 km systems (S-300/400/500, Patriot, HQ-9…)
      //   zoom <5 → no labels (whole continent, too crowded)
      const minLabelRangeKm =
        zoom >= 7 ? 0 :
        zoom >= 6 ? 80 :
        zoom >= 5 ? 150 :
        Infinity
      if (isSam && samLabel && rangeKm >= minLabelRangeKm && !faded) {
        const labelLat = latOffsetForKm(u.lat, rangeKm)
        const labelHtml = `
          <div class="tairos-sam-label side-${u.side}">
            <span class="tairos-sam-label-name">${escapeHtml(samLabel)}</span>
            <span class="tairos-sam-label-range">${rangeKm} km</span>
          </div>
        `.trim()
        L.marker([labelLat, u.lng], {
          pane: 'threat-label-pane',
          interactive: false,
          keyboard: false,
          icon: L.divIcon({
            className: 'tairos-sam-label-wrap',
            html: labelHtml,
            iconSize: [1, 1],
            iconAnchor: [0, 0],
          }),
        }).addTo(group)
      }
    })

    return () => {
      if (groupRef.current) { groupRef.current.remove(); groupRef.current = null }
    }
  }, [map, on, threats, intensity, focusIds, zoom])

  return null
}

/* Shared conflict-keyed → flat-array conversion (same as ForceDeploymentLayer). */
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

/* Given (lat, rangeKm), return a latitude `rangeKm` north. Good enough
   for label placement — no need for geodesic precision, just put the
   chip at the top edge of the dome. */
function latOffsetForKm(lat, km) {
  const dLat = km / 111.0
  return lat + dLat
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]))
}
