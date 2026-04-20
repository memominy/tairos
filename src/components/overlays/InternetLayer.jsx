import React, { useCallback } from 'react'
import L from 'leaflet'
import { useOverpassOverlay } from './useOverpassOverlay'
import OverpassBadge from './OverpassBadge'
import { centroid } from '../../utils/overpass'
import { addHoverablePolyline } from '../../utils/leafletHover'
import internetBackbone from '../../data/internet-backbone.json'

/**
 * Zoom-aware query. At low zoom the static fiber-backbone GeoJSON already
 * provides the big picture; we only need submarine cables + data centres
 * from OSM as a sanity check.
 */
const QUERY = (bbox, zoom) => {
  if (zoom >= 10) {
    return `[out:json][timeout:25];
(
  node["telecom"="data_center"](${bbox});
  way["telecom"="data_center"](${bbox});
  node["telecom"="exchange"](${bbox});
  way["telecom"="exchange"](${bbox});
  node["man_made"="communications_tower"](${bbox});
  way["man_made"="cable"]["cable"!="power"](${bbox});
  way["telecom"="line"](${bbox});
  way["communication"="line"](${bbox});
  way["man_made"="communications_line"](${bbox});
  way["telecom:medium"](${bbox});
  ${zoom >= 14 ? `node["street_cabinet"="telecom"](${bbox});` : ''}
);
out geom 2000;`
  }
  if (zoom >= 8) {
    return `[out:json][timeout:25];
(
  node["telecom"="data_center"](${bbox});
  way["telecom"="data_center"](${bbox});
  node["telecom"="exchange"](${bbox});
  way["telecom"="exchange"](${bbox});
  way["man_made"="cable"]["cable"="submarine"](${bbox});
  way["telecom"="line"](${bbox});
);
out geom 1000;`
  }
  // Low zoom — only submarine cables & data centres.
  return `[out:json][timeout:30];
(
  node["telecom"="data_center"](${bbox});
  way["telecom"="data_center"](${bbox});
  way["man_made"="cable"]["cable"="submarine"](${bbox});
);
out geom 500;`
}

/**
 * Translate a capacity tier code into a plain-Turkish descriptor so users
 * don't need to know telecom jargon. Tier numbering follows the ISP peering
 * hierarchy: 0 = intercontinental submarine, 1 = national backbone, 2 =
 * regional, 3 = feeder.
 */
function tierDescription(tier) {
  switch ((tier || '').toLowerCase()) {
    case 'tier-0': return 'Tier-0 · Kıtalar arası denizaltı kablo'
    case 'tier-1': return 'Tier-1 · Ulusal ana omurga (yüksek kapasite)'
    case 'tier-2': return 'Tier-2 · Bölgesel omurga'
    case 'tier-3': return 'Tier-3 · Yerel besleme hattı'
    default:       return tier || ''
  }
}

function placePoint(group, lat, lon, kind, tags) {
  const name = tags?.name || (
    kind === 'dc' ? 'Veri Merkezi' : kind === 'ex' ? 'Telekom Merkezi' : 'Sokak Kabini'
  )
  let html, color, size = [14, 14], anchor = [7, 7]
  if (kind === 'dc') {
    color = '#22D3EE'; size = [18, 18]; anchor = [9, 9]
    html = `<div style="
      width:14px;height:14px;background:${color};
      border:2px solid #0D1526;border-radius:2px;
      box-shadow:0 0 6px ${color}aa;
      display:flex;align-items:center;justify-content:center;
      font-size:8px;font-weight:700;color:#0D1526;font-family:monospace;
    ">DC</div>`
  } else if (kind === 'ex') {
    color = '#60A5FA'
    html = `<div style="
      width:10px;height:10px;background:${color};
      border:2px solid #0D1526;border-radius:50%;
      box-shadow:0 0 6px ${color}aa;
    "></div>`
  } else {
    color = '#A0A0A0'; size = [8, 8]; anchor = [4, 4]
    html = `<div style="
      width:6px;height:6px;background:${color};
      border:1px solid #0D1526;border-radius:1px;
    "></div>`
  }
  L.marker([lat, lon], { icon: L.divIcon({ className: '', iconSize: size, iconAnchor: anchor, html }) })
    .bindTooltip(`<b style="color:${color}">${kind === 'dc' ? '⬛' : kind === 'ex' ? '●' : '▫'} ${name}</b>`, { direction: 'top', offset: [0, -anchor[1]] })
    .addTo(group)
}

export default function InternetLayer({ stackIndex = 2 }) {
  const render = useCallback(({ elements, group, map }) => {
    const c = { dc: 0, ex: 0, cables: 0, cab: 0 }

    // Static Turkish fiber backbone — always shown when in view.
    const bounds = map.getBounds()
    internetBackbone.features.forEach((f) => {
      if (f.geometry?.type !== 'LineString') return
      const coords = f.geometry.coordinates.map(([lon, lat]) => [lat, lon])
      if (!coords.some(([la, lo]) => bounds.contains([la, lo]))) return
      const isSubmarine = f.properties.kind === 'submarine'
      const color  = isSubmarine ? '#22D3EE' : '#8B5CF6'
      const weight = isSubmarine ? 2.2 : 2.0
      const dash   = isSubmarine ? '10 4' : '2 6'
      const op   = f.properties.operator || 'Omurga'
      const tier = tierDescription(f.properties.capacity)
      const info = f.properties.info
        ? `<br/><span style="color:#B8C5D6;font-size:10px;line-height:1.35;">${f.properties.info}</span>`
        : ''
      addHoverablePolyline(
        group, coords,
        { color, weight, opacity: 0.75, dashArray: dash, lineCap: 'round' },
        `<div style="max-width:300px">` +
          `<b style="color:${color}">${isSubmarine ? '🌊 ' : '🌐 '}${f.properties.name}</b><br/>` +
          `<span style="color:#8A9BB5;font-size:10px"><b>Operatör:</b> ${op}</span><br/>` +
          (tier ? `<span style="color:#8A9BB5;font-size:10px"><b>Sınıf:</b> ${tier}</span>` : '') +
          info +
          `<br/><span style="color:#4A6080;font-size:9px;font-style:italic">gösterim amaçlı · yaklaşık güzergah</span>` +
        `</div>`,
      )
      c.cables++
    })

    // OSM-sourced real data
    elements.forEach((el) => {
      const tags = el.tags || {}

      const isTelecomLine = el.type === 'way' && el.geometry && (
        (tags.man_made === 'cable' && tags.cable !== 'power') ||
        tags.telecom === 'line' ||
        tags.communication === 'line' ||
        tags.man_made === 'communications_line' ||
        tags['telecom:medium']
      )
      if (isTelecomLine) {
        const coords = el.geometry.map((g) => [g.lat, g.lon])
        if (coords.length < 2) return
        const isSubmarine = tags.cable === 'submarine'
        const color  = isSubmarine ? '#22D3EE' : '#34D399'
        const weight = isSubmarine ? 2.0 : 1.6
        const dash   = isSubmarine ? '8 4' : '5 3'
        const medium = tags['telecom:medium'] || tags.cable || 'fiber'
        const mediumLabel =
          medium === 'fiber'   ? 'Fiber optik' :
          medium === 'copper'  ? 'Bakır kablo' :
          medium === 'radio'   ? 'Telsiz link' :
          medium === 'submarine' ? 'Denizaltı fiber' :
          medium
        const name = tags.name ? `<br/><span style="color:#8A9BB5;font-size:10px"><b>Ad:</b> ${tags.name}</span>` : ''
        const op   = tags.operator ? `<br/><span style="color:#8A9BB5;font-size:10px"><b>Operatör:</b> ${tags.operator}</span>` : ''
        addHoverablePolyline(
          group, coords,
          { color, weight, opacity: 0.9, dashArray: dash, lineCap: 'round' },
          `<div style="max-width:280px">` +
            `<b style="color:${color}">🌐 ${isSubmarine ? 'Deniz altı kablo' : 'İletişim hattı'}</b><br/>` +
            `<span style="color:#8A9BB5;font-size:10px"><b>Tür:</b> ${mediumLabel}</span>` +
            name + op +
            `<br/><span style="color:#4A6080;font-size:9px">kaynak: OSM</span>` +
          `</div>`,
        )
        c.cables++
        return
      }

      if (tags.telecom === 'data_center') {
        if (el.type === 'node') { placePoint(group, el.lat, el.lon, 'dc', tags); c.dc++ }
        else if (el.geometry?.length) { const ct = centroid(el.geometry); placePoint(group, ct.lat, ct.lon, 'dc', tags); c.dc++ }
        return
      }
      if (tags.telecom === 'exchange') {
        if (el.type === 'node') { placePoint(group, el.lat, el.lon, 'ex', tags); c.ex++ }
        else if (el.geometry?.length) { const ct = centroid(el.geometry); placePoint(group, ct.lat, ct.lon, 'ex', tags); c.ex++ }
        return
      }
      if (tags.man_made === 'communications_tower' && el.type === 'node') {
        placePoint(group, el.lat, el.lon, 'ex', tags); c.ex++
        return
      }
      if (tags.street_cabinet === 'telecom' && el.type === 'node') {
        placePoint(group, el.lat, el.lon, 'cab', tags); c.cab++
      }
    })

    return c
  }, [])

  const { status, counts, progress, reload } = useOverpassOverlay({
    overlayId: 'internet',
    buildQuery: QUERY,
    render,
    minZoom: 5,
  })

  const parts = []
  if (counts.dc)     parts.push(`⬛ ${counts.dc} DC`)
  if (counts.ex)     parts.push(`● ${counts.ex} santral`)
  if (counts.cables) parts.push(`🌐 ${counts.cables} kablo`)
  if (counts.cab)    parts.push(`▫ ${counts.cab} kabin`)

  return (
    <OverpassBadge
      status={status}
      color="#22D3EE"
      stackIndex={stackIndex}
      progress={progress}
      texts={{
        loading: 'internet altyapısı yükleniyor',
        zoom:    '🔍 yakınlaştır (zoom ≥ 5)',
        empty:   'bu alanda internet altyapısı yok',
        done:    parts.join(' · ') || 'kayıt yok',
      }}
      onRetry={reload}
    />
  )
}
