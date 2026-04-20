import React, { useCallback } from 'react'
import L from 'leaflet'
import { useOverpassOverlay } from './useOverpassOverlay'
import OverpassBadge from './OverpassBadge'
import { TOWER_QUERY, towerColor, makeTowerIcon } from '../../utils/towers'

/**
 * Cell-tower / base-station overlay. Uses the shared tile-cache hook so the
 * data persists across pan/zoom — the first visit to a cell pays the network
 * cost, every subsequent visit is instant.
 *
 * At low zoom we only pull operator-tagged towers (Turkcell / Vodafone / Türk
 * Telekom etc.). OSM has many untagged radio masts that would drown the map
 * at country scale.
 */
const QUERY = (bbox, zoom) => {
  if (zoom >= 9) return TOWER_QUERY(bbox)
  // Operator-tagged only so the map stays readable when zoomed out.
  return `[out:json][timeout:25];
(
  node["man_made"="mast"]["operator"](${bbox});
  node["man_made"="tower"]["tower:type"="communication"]["operator"](${bbox});
  node["telecom"="base_transceiver_station"]["operator"](${bbox});
  node["communication"~"mobile|gsm|umts|lte"]["operator"](${bbox});
);
out body 500;`
}

export default function TowerLayer({ stackIndex = 0 }) {
  const render = useCallback(({ elements, group }) => {
    let towers = 0

    elements.forEach((el) => {
      if (el.type !== 'node' || typeof el.lat !== 'number') return
      const operator = el.tags?.operator || el.tags?.network || ''
      const ref      = el.tags?.ref || el.tags?.name || ''
      const height   = el.tags?.height ? ` · ${el.tags.height} m` : ''
      const tooltip  = `<b style="color:${towerColor(operator)}">⬥</b> ${operator || 'Baz İstasyonu'}${ref ? ' · ' + ref : ''}${height}`
      L.marker([el.lat, el.lon], { icon: makeTowerIcon(operator) })
        .bindTooltip(tooltip, { direction: 'top', offset: [0, -8] })
        .addTo(group)
      towers++
    })

    return { towers }
  }, [])

  const { status, counts, progress, reload } = useOverpassOverlay({
    overlayId: 'towers',
    buildQuery: QUERY,
    render,
    minZoom: 6,   // below z6 the bbox is too broad even with operator filter
  })

  return (
    <OverpassBadge
      status={status}
      color="#A78BFA"
      stackIndex={stackIndex}
      progress={progress}
      texts={{
        loading: 'baz istasyonları yükleniyor',
        zoom:    '🔍 yakınlaştır (zoom ≥ 6)',
        empty:   'bu alanda kayıt yok',
        done:    `◆ ${counts.towers || 0} baz istasyonu`,
      }}
      onRetry={reload}
    />
  )
}
