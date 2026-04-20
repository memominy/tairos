import React, { useCallback } from 'react'
import L from 'leaflet'
import { useOverpassOverlay } from './useOverpassOverlay'
import OverpassBadge from './OverpassBadge'
import { centroid } from '../../utils/overpass'
import { addHoverablePolyline } from '../../utils/leafletHover'
import maritimeBackbone from '../../data/maritime-backbone.json'

/**
 * OSM has rich maritime tagging via `seamark:*`. We pull:
 *   · Harbours / marinas (harbour=*, leisure=marina, landuse=harbour)
 *   · Piers, breakwaters  (man_made=pier, man_made=breakwater)
 *   · Lighthouses         (man_made=lighthouse, seamark:type=light_*)
 *   · Buoys / beacons     (seamark:type=buoy_*, beacon_*)
 *   · Ferry terminals     (amenity=ferry_terminal)
 *   · Ferry routes        (route=ferry, highway=ferry)
 *   · Anchorage zones     (seamark:type=anchorage)
 */
/**
 * Zoom-aware query. Static strait/shipping/ferry backbone is in
 * `maritime-backbone.json`, so at low zoom we only need major ports +
 * lighthouses from OSM.
 */
const QUERY = (bbox, zoom) => {
  if (zoom >= 10) {
    return `[out:json][timeout:25];
(
  node["amenity"="ferry_terminal"](${bbox});
  way["amenity"="ferry_terminal"](${bbox});
  way["route"="ferry"](${bbox});
  way["highway"="ferry"](${bbox});
  node["man_made"="lighthouse"](${bbox});
  node["seamark:type"~"light_minor|light_major|lighthouse"](${bbox});
  node["leisure"="marina"](${bbox});
  way["leisure"="marina"](${bbox});
  node["harbour"](${bbox});
  way["harbour"](${bbox});
  way["man_made"="breakwater"](${bbox});
  ${zoom >= 11 ? `way["man_made"="pier"](${bbox});` : ''}
  ${zoom >= 12 ? `node["seamark:type"~"buoy|beacon|anchorage"](${bbox});` : ''}
);
out geom 2500;`
  }
  if (zoom >= 8) {
    return `[out:json][timeout:25];
(
  node["amenity"="ferry_terminal"](${bbox});
  way["amenity"="ferry_terminal"](${bbox});
  node["man_made"="lighthouse"](${bbox});
  node["harbour"](${bbox});
  way["harbour"](${bbox});
  way["route"="ferry"](${bbox});
);
out geom 1200;`
  }
  // Low zoom — ports + lighthouses only.
  return `[out:json][timeout:30];
(
  node["harbour"](${bbox});
  way["harbour"](${bbox});
  node["man_made"="lighthouse"](${bbox});
);
out geom 600;`
}

function placePoint(group, lat, lon, kind, tags) {
  const name = tags?.name || (
    kind === 'ferry' ? 'Feribot İskelesi' :
    kind === 'light' ? 'Deniz Feneri' :
    kind === 'marina' ? 'Marina' :
    kind === 'harbour' ? 'Liman' :
    kind === 'buoy' ? 'Şamandıra' :
    kind === 'anchor' ? 'Demir Sahası' : 'Deniz Tesisi'
  )
  let html, color, size = [14, 14], anchor = [7, 7]
  if (kind === 'ferry') {
    color = '#06B6D4'
    html = `<div style="
      width:12px;height:12px;background:${color};
      border:2px solid #0D1526;border-radius:50%;
      box-shadow:0 0 5px ${color}aa;
      display:flex;align-items:center;justify-content:center;
      font-size:9px;color:#0D1526;font-weight:700;font-family:monospace;line-height:1;
    ">⚓</div>`
  } else if (kind === 'light') {
    color = '#FDE047'
    html = `<div style="position:relative;width:14px;height:16px;">
      <div style="position:absolute;top:0;left:4px;width:6px;height:6px;background:${color};border-radius:50%;box-shadow:0 0 8px ${color}"></div>
      <div style="position:absolute;top:4px;left:5px;width:4px;height:10px;background:${color};border:1px solid #0D1526"></div>
    </div>`
    size = [14, 16]; anchor = [7, 14]
  } else if (kind === 'marina') {
    color = '#22D3EE'
    html = `<div style="
      width:10px;height:10px;background:${color};
      border:1.5px solid #0D1526;border-radius:2px;
      box-shadow:0 0 4px ${color}88;
    "></div>`
  } else if (kind === 'harbour') {
    color = '#3B82F6'; size = [16, 16]; anchor = [8, 8]
    html = `<div style="
      width:12px;height:12px;background:${color};
      border:2px solid #0D1526;
      box-shadow:0 0 6px ${color}aa;
      display:flex;align-items:center;justify-content:center;
      font-size:9px;color:#fff;font-weight:700;font-family:monospace;line-height:1;
    ">⚓</div>`
  } else if (kind === 'buoy') {
    color = '#F87171'; size = [6, 6]; anchor = [3, 3]
    html = `<div style="width:4px;height:4px;background:${color};border-radius:50%;border:1px solid #0D1526"></div>`
  } else { // anchor
    color = '#A78BFA'; size = [10, 10]; anchor = [5, 5]
    html = `<div style="
      width:8px;height:8px;background:transparent;
      border:1.5px dashed ${color};border-radius:50%;
    "></div>`
  }
  L.marker([lat, lon], { icon: L.divIcon({ className: '', iconSize: size, iconAnchor: anchor, html }) })
    .bindTooltip(`<b style="color:${color}">${kind === 'light' ? '💡' : '⚓'} ${name}</b>`, { direction: 'top', offset: [0, -anchor[1]] })
    .addTo(group)
}

export default function MaritimeLayer({ stackIndex = 4 }) {
  const render = useCallback(({ elements, group, map }) => {
    const c = { ferries: 0, terminals: 0, lights: 0, marinas: 0, harbours: 0, piers: 0, routes: 0 }

    // Static Turkish maritime network — always shown when in view.
    const bounds = map.getBounds()
    maritimeBackbone.features.forEach((f) => {
      if (f.geometry?.type !== 'LineString') return
      const coords = f.geometry.coordinates.map(([lon, lat]) => [lat, lon])
      if (!coords.some(([la, lo]) => bounds.contains([la, lo]))) return
      const kind = f.properties.kind
      const style =
        kind === 'strait'    ? { color: '#F97316', weight: 3.0, dash: null,    op: 0.70 }   // boğazlar — turuncu kalın
      : kind === 'shipping'  ? { color: '#EF4444', weight: 2.0, dash: '12 6',  op: 0.55 }   // sevkiyat rotası — kırmızı uzun kesikli
      : kind === 'ferry'     ? { color: '#06B6D4', weight: 1.8, dash: '2 5',   op: 0.80 }   // feribot — cyan noktalı
      :                        { color: '#8A9BB5', weight: 1.5, dash: '4 4',   op: 0.60 }
      const op  = f.properties.operator || ''
      const info = f.properties.info ? `<br/><span style="color:#8A9BB5;font-size:10px">${f.properties.info}</span>` : ''
      const icon = kind === 'strait' ? '🌊' : kind === 'shipping' ? '🚢' : '⛴'
      addHoverablePolyline(
        group, coords,
        { color: style.color, weight: style.weight, opacity: style.op, dashArray: style.dash, lineCap: 'round' },
        `<b style="color:${style.color}">${icon} ${f.properties.name}</b><br/>` +
        `<span style="color:#8A9BB5;font-size:10px">${op}</span>${info}<br/>` +
        `<span style="color:#4A6080;font-size:9px;font-style:italic">gösterim amaçlı · yaklaşık güzergah</span>`,
      )
      c.routes++
    })

    // OSM-sourced real data
    elements.forEach((el) => {
      const tags = el.tags || {}

      // Ferry routes (ways)
      if (el.type === 'way' && (tags.route === 'ferry' || tags.highway === 'ferry') && el.geometry) {
        const coords = el.geometry.map((g) => [g.lat, g.lon])
        if (coords.length < 2) return
        const op = tags.operator ? ` · ${tags.operator}` : ''
        const name = tags.name || 'Feribot Hattı'
        addHoverablePolyline(
          group, coords,
          { color: '#06B6D4', weight: 1.8, opacity: 0.80, dashArray: '2 5', lineCap: 'round' },
          `<b style="color:#06B6D4">⛴ ${name}</b>${op}<br/><span style="color:#4A6080;font-size:9px">OSM kaynak</span>`,
        )
        c.ferries++
        return
      }

      // Piers (ways)
      if (el.type === 'way' && tags.man_made === 'pier' && el.geometry) {
        const coords = el.geometry.map((g) => [g.lat, g.lon])
        if (coords.length < 2) return
        addHoverablePolyline(
          group, coords,
          { color: '#94A3B8', weight: 2.5, opacity: 0.75, lineCap: 'butt' },
          `<b style="color:#94A3B8">${tags.name || 'İskele'}</b>`,
        )
        c.piers++
        return
      }

      // Breakwaters
      if (el.type === 'way' && tags.man_made === 'breakwater' && el.geometry) {
        const coords = el.geometry.map((g) => [g.lat, g.lon])
        if (coords.length < 2) return
        addHoverablePolyline(
          group, coords,
          { color: '#78716C', weight: 2.0, opacity: 0.65, lineCap: 'round' },
          `<b style="color:#A8A29E">Dalgakıran</b>`,
        )
        return
      }

      // Point features
      const placePt = (kind) => {
        let lat, lon
        if (el.type === 'node') { lat = el.lat; lon = el.lon }
        else if (el.geometry?.length) { const ct = centroid(el.geometry); lat = ct.lat; lon = ct.lon }
        else return
        placePoint(group, lat, lon, kind, tags)
      }

      if (tags.amenity === 'ferry_terminal')                { placePt('ferry');   c.terminals++; return }
      if (tags.man_made === 'lighthouse' ||
          /^light_(minor|major)$|^lighthouse$/.test(tags['seamark:type'] || '')) { placePt('light'); c.lights++; return }
      if (tags.leisure === 'marina')                        { placePt('marina');  c.marinas++;  return }
      if (tags.harbour)                                     { placePt('harbour'); c.harbours++; return }
      if (/^buoy_|^beacon_/.test(tags['seamark:type'] || '')) { placePt('buoy'); return }
      if (tags['seamark:type'] === 'anchorage')             { placePt('anchor'); return }
    })

    return c
  }, [])

  const { status, counts, progress, reload } = useOverpassOverlay({
    overlayId: 'maritime',
    buildQuery: QUERY,
    render,
    minZoom: 5,
  })

  const parts = []
  if (counts.harbours)  parts.push(`⚓ ${counts.harbours} liman`)
  if (counts.terminals) parts.push(`⛴ ${counts.terminals} iskele`)
  if (counts.ferries)   parts.push(`~ ${counts.ferries} hat`)
  if (counts.marinas)   parts.push(`● ${counts.marinas} marina`)
  if (counts.lights)    parts.push(`💡 ${counts.lights} fener`)
  if (counts.piers)     parts.push(`| ${counts.piers} iskele`)
  if (counts.routes)    parts.push(`🚢 ${counts.routes} rota`)

  return (
    <OverpassBadge
      status={status}
      color="#06B6D4"
      stackIndex={stackIndex}
      progress={progress}
      texts={{
        loading: 'deniz ulaşımı yükleniyor',
        zoom:    '🔍 yakınlaştır (zoom ≥ 5)',
        empty:   'bu alanda deniz ulaşım verisi yok',
        done:    parts.join(' · ') || 'kayıt yok',
      }}
      onRetry={reload}
    />
  )
}
