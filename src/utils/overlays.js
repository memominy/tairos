/**
 * Map overlay definitions — transparent layers drawn ON TOP of the base tile.
 * type: 'tile'   → TileLayer (transparent PNG overlay)
 * type: 'geojson' → fetched GeoJSON drawn as vector shapes
 * type: 'live'   → dynamically fetched on map move (handled by MapView)
 */
export const OVERLAYS = {
  provinces: {
    id: 'provinces',
    label: 'İl Sınırları',
    color: '#7AB8F0',
    type: 'geojson',
    url: 'https://raw.githubusercontent.com/cihadturhan/tr-geojson/master/geo/tr-cities-utf8.json',
    style: {
      color: '#7AB8F0',
      weight: 1.2,
      opacity: 0.65,
      fillOpacity: 0,
      interactive: false,
    },
  },
  roads: {
    id: 'roads',
    label: 'Yollar',
    color: '#F5C842',
    type: 'tile',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}',
    attribution: '© Esri',
    opacity: 0.75,
  },
  labels: {
    id: 'labels',
    label: 'Yer Adları',
    color: '#E4EAF4',
    type: 'tile',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
    attribution: '© Esri',
    opacity: 0.9,
  },
  railways: {
    id: 'railways',
    label: 'Demiryolları',
    color: '#E06835',
    type: 'tile',
    url: 'https://{s}.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png',
    attribution: '© OpenRailwayMap',
    subdomains: 'abc',
    opacity: 0.7,
    maxZoom: 19,
  },
  towers: {
    id: 'towers',
    label: 'Baz İstasyonları',
    color: '#A78BFA',
    type: 'live',   // fetched dynamically from Overpass on map move
  },
  power: {
    id: 'power',
    label: 'Elektrik Altyapısı',
    color: '#FF9500',
    type: 'live',   // power lines + substations from Overpass
  },
  internet: {
    id: 'internet',
    label: 'İnternet Altyapısı',
    color: '#22D3EE',
    type: 'live',   // data centers + exchanges + cables + street cabinets
  },
  water: {
    id: 'water',
    label: 'Su Altyapısı',
    color: '#3B82F6',
    type: 'live',   // water works + towers + pipelines + canals + pumping stations
  },
  maritime: {
    id: 'maritime',
    label: 'Deniz Ulaşımı',
    color: '#06B6D4',
    type: 'live',   // shipping lanes + ferries + lighthouses + harbours + marinas
  },
}

export const OVERLAY_ORDER = ['provinces', 'roads', 'labels', 'railways', 'towers', 'power', 'internet', 'water', 'maritime']
