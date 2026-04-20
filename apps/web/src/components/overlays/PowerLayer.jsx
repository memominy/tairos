import React, { useCallback } from 'react'
import L from 'leaflet'
import { useOverpassOverlay } from './useOverpassOverlay'
import OverpassBadge from './OverpassBadge'
import { addHoverablePolyline } from '../../utils/leafletHover'

/**
 * Zoom-aware query.
 *
 *   z ≥ 10 → full detail (lines + minor_lines + substations)
 *   z ≥ 8  → lines + substations (no residential minor_line spam)
 *   z < 8  → only high-voltage transmission (≥154 kV) + major substations
 *            so a country-wide view stays responsive.
 */
const QUERY = (bbox, zoom) => {
  if (zoom >= 10) {
    return `[out:json][timeout:25];
(
  way["power"="line"](${bbox});
  way["power"="minor_line"](${bbox});
  way["power"="substation"](${bbox});
  node["power"="substation"](${bbox});
);
out geom 1500;`
  }
  if (zoom >= 8) {
    return `[out:json][timeout:25];
(
  way["power"="line"](${bbox});
  way["power"="substation"](${bbox});
  node["power"="substation"](${bbox});
);
out geom 1200;`
  }
  // Low zoom — backbone only.
  return `[out:json][timeout:30];
(
  way["power"="line"]["voltage"~"^(154|220|380|400|500|800)"](${bbox});
  way["power"="line"]["voltage"~"[0-9]{6}"](${bbox});
  way["power"="substation"]["voltage"~"^(154|220|380|400|500|800)"](${bbox});
  node["power"="substation"]["voltage"~"^(154|220|380|400|500|800)"](${bbox});
);
out geom 800;`
}

function voltageKv(v) {
  if (!v) return 0
  const nums = String(v).split(';').map((x) => parseInt(x, 10)).filter(Number.isFinite)
  return nums.length ? Math.max(...nums) / 1000 : 0
}

function lineStyle(tags) {
  const kv = voltageKv(tags?.voltage)
  const isMinor = tags?.power === 'minor_line'
  if (kv >= 380)  return { color: '#FF3B3B', weight: 2.4, opacity: 0.85, dash: null,   label: `${kv} kV` }
  if (kv >= 154)  return { color: '#FF9500', weight: 2.0, opacity: 0.80, dash: null,   label: `${kv} kV` }
  if (kv >= 66)   return { color: '#F5C842', weight: 1.6, opacity: 0.75, dash: null,   label: `${kv} kV` }
  if (isMinor)    return { color: '#7AB8F0', weight: 1.0, opacity: 0.55, dash: '3 3',  label: 'Dağıtım hattı' }
  return          { color: '#8A9BB5', weight: 1.2, opacity: 0.60, dash: null,   label: kv ? `${kv} kV` : 'Elektrik hattı' }
}

export default function PowerLayer({ stackIndex = 1 }) {
  const render = useCallback(({ elements, group }) => {
    let lines = 0, subs = 0

    elements.forEach((el) => {
      const tags = el.tags || {}

      if (el.type === 'way' && (tags.power === 'line' || tags.power === 'minor_line') && el.geometry) {
        const coords = el.geometry.map((g) => [g.lat, g.lon])
        if (coords.length < 2) return
        const s = lineStyle(tags)
        const op = tags.operator ? ` · ${tags.operator}` : ''
        addHoverablePolyline(
          group, coords,
          { color: s.color, weight: s.weight, opacity: s.opacity, dashArray: s.dash, lineCap: 'round' },
          `<b style="color:${s.color}">⚡ ${s.label}</b>${op}`,
        )
        lines++
        return
      }

      if (tags.power === 'substation') {
        let lat, lon
        if (el.type === 'node') { lat = el.lat; lon = el.lon }
        else if (el.geometry?.length) {
          const n = el.geometry.length
          lat = el.geometry.reduce((a, g) => a + g.lat, 0) / n
          lon = el.geometry.reduce((a, g) => a + g.lon, 0) / n
        } else return

        const kv = voltageKv(tags.voltage)
        const color = kv >= 380 ? '#FF3B3B' : kv >= 154 ? '#FF9500' : kv >= 66 ? '#F5C842' : '#8A9BB5'
        const icon = L.divIcon({
          className: '', iconSize: [12, 12], iconAnchor: [6, 6],
          html: `<div style="
            width:10px;height:10px;background:${color};
            border:1.5px solid #0D1526;box-shadow:0 0 4px ${color}aa;
          "></div>`,
        })
        const name = tags.name || 'Trafo Merkezi'
        L.marker([lat, lon], { icon })
          .bindTooltip(`<b style="color:${color}">⬛ ${name}</b>${kv ? ` · ${kv} kV` : ''}`, { direction: 'top', offset: [0, -6] })
          .addTo(group)
        subs++
      }
    })

    return { lines, subs }
  }, [])

  const { status, counts, progress, reload } = useOverpassOverlay({
    overlayId: 'power',
    buildQuery: QUERY,
    render,
    minZoom: 5,
  })

  return (
    <OverpassBadge
      status={status}
      color="#FF9500"
      stackIndex={stackIndex}
      progress={progress}
      texts={{
        loading: 'elektrik altyapısı yükleniyor',
        zoom:    '🔍 yakınlaştır (zoom ≥ 5)',
        empty:   'bu alanda elektrik altyapısı yok',
        done:    `⚡ ${counts.lines || 0} hat · ⬛ ${counts.subs || 0} trafo`,
      }}
      onRetry={reload}
    />
  )
}
