import L from 'leaflet'

/**
 * Shared cell-tower helpers used by both the live overlay (TowerLayer) and
 * the on-demand "nearest tower" lookup in MapView. Keeping them in one place
 * so the marker style + operator palette stay consistent between both surfaces.
 */
export const TOWER_QUERY = (bbox) => `[out:json][timeout:25];
(
  node["man_made"="mast"](${bbox});
  node["man_made"="tower"]["tower:type"="communication"](${bbox});
  node["telecom"="base_transceiver_station"](${bbox});
  node["communication"~"mobile|gsm|umts|lte"](${bbox});
);
out body 500;`

export function towerColor(operator) {
  const op = (operator || '').toLowerCase()
  return op.includes('turkcell')   ? '#FFD700' :
         op.includes('vodafone')   ? '#FF3333' :
         op.includes('turk telekom') || op.includes('türk telekom') ? '#3399FF' :
         '#A78BFA'
}

export function makeTowerIcon(operator) {
  const color = towerColor(operator)
  const svg = `<svg viewBox="0 0 18 22" width="18" height="22" xmlns="http://www.w3.org/2000/svg">
    <polygon points="9,5 3.5,20 14.5,20" fill="${color}" opacity="0.92"/>
    <circle cx="9" cy="3" r="2.1" fill="${color}"/>
    <line x1="6" y1="13" x2="12" y2="13" stroke="#0D1526" stroke-width="1"/>
    <line x1="7.2" y1="17" x2="10.8" y2="17" stroke="#0D1526" stroke-width="1"/>
  </svg>`
  return L.divIcon({
    className: '',
    iconSize: [18, 22],
    iconAnchor: [9, 20],
    html: svg,
  })
}
