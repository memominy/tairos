import React, { useCallback } from 'react'
import L from 'leaflet'
import { useOverpassOverlay } from './useOverpassOverlay'
import OverpassBadge from './OverpassBadge'
import { centroid } from '../../utils/overpass'
import { addHoverablePolyline } from '../../utils/leafletHover'
import waterBackbone from '../../data/water-backbone.json'

/**
 * Zoom-aware query. The static water-backbone GeoJSON covers the major DSİ
 * lines, so at low zoom we only need canals + major treatment plants from OSM.
 */
const QUERY = (bbox, zoom) => {
  if (zoom >= 10) {
    return `[out:json][timeout:25];
(
  node["man_made"="water_tower"](${bbox});
  way["man_made"="water_tower"](${bbox});
  node["man_made"="water_works"](${bbox});
  way["man_made"="water_works"](${bbox});
  node["man_made"="pumping_station"](${bbox});
  way["man_made"="pumping_station"](${bbox});
  node["man_made"="wastewater_plant"](${bbox});
  way["man_made"="wastewater_plant"](${bbox});
  node["man_made"="reservoir_covered"](${bbox});
  way["man_made"="reservoir_covered"](${bbox});
  way["man_made"="pipeline"]["substance"~"water|drinking_water|wastewater|sewage"](${bbox});
  way["waterway"="canal"](${bbox});
  ${zoom >= 14 ? `node["man_made"="water_well"](${bbox});` : ''}
);
out geom 2000;`
  }
  if (zoom >= 8) {
    return `[out:json][timeout:25];
(
  node["man_made"="water_works"](${bbox});
  way["man_made"="water_works"](${bbox});
  node["man_made"="wastewater_plant"](${bbox});
  way["man_made"="wastewater_plant"](${bbox});
  way["waterway"="canal"](${bbox});
);
out geom 1200;`
  }
  // Low zoom — canals + major treatment plants only.
  return `[out:json][timeout:30];
(
  node["man_made"="water_works"](${bbox});
  way["man_made"="water_works"](${bbox});
  way["waterway"="canal"](${bbox});
);
out geom 600;`
}

function placePoint(group, lat, lon, kind, tags) {
  const name = tags?.name || (
    kind === 'works' ? 'Su Arıtma Tesisi' :
    kind === 'tower' ? 'Su Kulesi' :
    kind === 'pump'  ? 'Pompa İstasyonu' :
    kind === 'waste' ? 'Atık Su Arıtma' :
    kind === 'reservoir' ? 'Kapalı Rezervuar' :
    kind === 'well'  ? 'Su Kuyusu' : 'Su Tesisi'
  )
  let html, color, size = [14, 14], anchor = [7, 7]
  if (kind === 'works') {
    color = '#3B82F6'; size = [18, 18]; anchor = [9, 9]
    html = `<div style="
      width:14px;height:14px;background:${color};
      border:2px solid #0D1526;border-radius:2px;
      box-shadow:0 0 6px ${color}aa;
      display:flex;align-items:center;justify-content:center;
      font-size:8px;font-weight:700;color:#0D1526;font-family:monospace;
    ">SU</div>`
  } else if (kind === 'tower') {
    color = '#60A5FA'
    html = `<div style="position:relative;width:14px;height:14px;">
      <div style="position:absolute;top:0;left:3px;width:8px;height:6px;background:${color};border-radius:6px 6px 2px 2px;border:1.5px solid #0D1526"></div>
      <div style="position:absolute;top:5px;left:5px;width:4px;height:8px;background:${color};border:1.5px solid #0D1526"></div>
    </div>`
  } else if (kind === 'pump') {
    color = '#06B6D4'; size = [14, 12]; anchor = [7, 6]
    html = `<div style="
      width:0;height:0;
      border-left:7px solid transparent;
      border-right:7px solid transparent;
      border-bottom:12px solid ${color};
      filter:drop-shadow(0 0 4px ${color}88);
    "></div>`
  } else if (kind === 'waste') {
    color = '#6366F1'
    html = `<div style="
      width:12px;height:12px;background:${color};
      border:2px solid #0D1526;transform:rotate(45deg);
      box-shadow:0 0 4px ${color}88;
    "></div>`
  } else if (kind === 'reservoir') {
    color = '#1E40AF'; size = [12, 12]; anchor = [6, 6]
    html = `<div style="
      width:10px;height:10px;background:${color};
      border:1.5px solid #0D1526;border-radius:50%;
    "></div>`
  } else { // well
    color = '#93C5FD'; size = [6, 6]; anchor = [3, 3]
    html = `<div style="
      width:4px;height:4px;background:${color};
      border:1px solid #0D1526;border-radius:50%;
    "></div>`
  }
  L.marker([lat, lon], { icon: L.divIcon({ className: '', iconSize: size, iconAnchor: anchor, html }) })
    .bindTooltip(`<b style="color:${color}">💧 ${name}</b>`, { direction: 'top', offset: [0, -anchor[1]] })
    .addTo(group)
}

export default function WaterLayer({ stackIndex = 3 }) {
  const render = useCallback(({ elements, group, map }) => {
    const c = { works: 0, tower: 0, pump: 0, waste: 0, pipe: 0, canal: 0, well: 0 }

    // Static Turkish water backbone — drawn first.
    const bounds = map.getBounds()
    waterBackbone.features.forEach((f) => {
      if (f.geometry?.type !== 'LineString') return
      const coords = f.geometry.coordinates.map(([lon, lat]) => [lat, lon])
      if (!coords.some(([la, lo]) => bounds.contains([la, lo]))) return
      const isCanal = f.properties.kind === 'canal'
      const color  = isCanal ? '#0EA5E9' : '#3B82F6'
      const weight = isCanal ? 2.4 : 2.2
      const dash   = isCanal ? null  : '4 3'
      const op   = f.properties.operator || 'DSİ'
      const info = f.properties.info ? `<br/><span style="color:#8A9BB5;font-size:10px">${f.properties.info}</span>` : ''
      addHoverablePolyline(
        group, coords,
        { color, weight, opacity: 0.80, dashArray: dash, lineCap: 'round' },
        `<b style="color:${color}">${isCanal ? '🌊 ' : '💧 '}${f.properties.name}</b><br/>` +
        `<span style="color:#8A9BB5;font-size:10px">${op}</span>${info}<br/>` +
        `<span style="color:#4A6080;font-size:9px;font-style:italic">gösterim amaçlı · yaklaşık güzergah</span>`,
      )
    })

    // OSM-sourced real data
    elements.forEach((el) => {
      const tags = el.tags || {}

      if (el.type === 'way' && tags.man_made === 'pipeline' && el.geometry) {
        const coords = el.geometry.map((g) => [g.lat, g.lon])
        if (coords.length < 2) return
        const isWaste = /wastewater|sewage/.test(tags.substance || '')
        const color  = isWaste ? '#6366F1' : '#3B82F6'
        const op     = tags.operator ? ` · ${tags.operator}` : ''
        addHoverablePolyline(
          group, coords,
          { color, weight: 1.6, opacity: 0.85, dashArray: '5 3', lineCap: 'round' },
          `<b style="color:${color}">💧 ${isWaste ? 'Atık su hattı' : 'Su hattı'}</b> · ${tags.substance || 'water'}${op}<br/><span style="color:#4A6080;font-size:9px">OSM kaynak</span>`,
        )
        c.pipe++
        return
      }

      if (el.type === 'way' && tags.waterway === 'canal' && el.geometry) {
        const coords = el.geometry.map((g) => [g.lat, g.lon])
        if (coords.length < 2) return
        const name = tags.name || 'Kanal'
        addHoverablePolyline(
          group, coords,
          { color: '#0EA5E9', weight: 1.8, opacity: 0.80, lineCap: 'round' },
          `<b style="color:#0EA5E9">🌊 ${name}</b><br/><span style="color:#4A6080;font-size:9px">OSM kaynak</span>`,
        )
        c.canal++
        return
      }

      const kindMap = {
        water_works: 'works', water_tower: 'tower', pumping_station: 'pump',
        wastewater_plant: 'waste', reservoir_covered: 'reservoir', water_well: 'well',
      }
      const kind = kindMap[tags.man_made]
      if (!kind) return
      if (el.type === 'node') placePoint(group, el.lat, el.lon, kind, tags)
      else if (el.geometry?.length) { const ct = centroid(el.geometry); placePoint(group, ct.lat, ct.lon, kind, tags) }
      c[kind === 'reservoir' ? 'works' : kind]++
    })

    return c
  }, [])

  const { status, counts, progress, reload } = useOverpassOverlay({
    overlayId: 'water',
    buildQuery: QUERY,
    render,
    minZoom: 5,
  })

  const parts = []
  if (counts.works) parts.push(`⬛ ${counts.works} tesis`)
  if (counts.tower) parts.push(`▲ ${counts.tower} kule`)
  if (counts.pump)  parts.push(`△ ${counts.pump} pompa`)
  if (counts.waste) parts.push(`◆ ${counts.waste} atık`)
  if (counts.pipe)  parts.push(`💧 ${counts.pipe} hat`)
  if (counts.canal) parts.push(`🌊 ${counts.canal} kanal`)
  if (counts.well)  parts.push(`· ${counts.well} kuyu`)

  return (
    <OverpassBadge
      status={status}
      color="#3B82F6"
      stackIndex={stackIndex}
      progress={progress}
      texts={{
        loading: 'su altyapısı yükleniyor',
        zoom:    '🔍 yakınlaştır (zoom ≥ 5)',
        empty:   'bu alanda su altyapısı yok',
        done:    parts.join(' · ') || 'kayıt yok',
      }}
      onRetry={reload}
    />
  )
}
