/**
 * Tile providers.
 *
 * maxNativeZoom = the provider's TRUE server-side max. Leaflet will only
 *   request tiles up to this zoom. Going above this = placeholder/404/blank.
 * maxZoom       = how far the USER can zoom. Beyond maxNativeZoom, Leaflet
 *   upscales the last real tile. This gives more visual zoom without
 *   triggering "Map data not yet available" placeholders from the server.
 *
 * @2x suffix = provider serves genuinely higher-detail 512×512 tiles at the
 *   same geographic extent. Real data, not interpolation.
 */
export const TILE_PROVIDERS = {
  dark: {
    label: 'Operasyon (Koyu)',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
    maxNativeZoom: 20,      // Carto documented native max
    maxZoom: 22,            // 2 extra levels of client-side zoom
  },
  light: {
    label: 'Standart (Açık)',
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
    maxNativeZoom: 20,
    maxZoom: 22,
  },
  satellite: {
    label: 'Uydu Görüntüsü',
    // Esri World_Imagery: z18 is the globally reliable native max and there is
    // NO @2x retina variant, so the source is 256px. We allow ONE extra level
    // of client-side scale (2×). Going further (3×+, i.e. maxZoom 20+) pushes
    // CSS transforms past the point where Leaflet reliably paints tiles —
    // result was a navy blank pane during zoom-in. Keeping gap tight fixes it.
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; <a href="https://www.esri.com/">Esri</a> · Maxar · Earthstar Geographics',
    maxNativeZoom: 18,
    maxZoom: 19,
  },
  tactical: {
    // Stadia Maps — very clean cartography, but anonymous usage gets a daily
    // quota. If street-zoom panning exhausts it the server starts returning
    // an "Account limit exceeded" image in place of tiles. Register a domain
    // + API key at stadiamaps.com to raise the limit.
    label: 'Taktik (Stadia)',
    url: 'https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}@2x.png',
    attribution: '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a>',
    maxNativeZoom: 20,
    maxZoom: 22,
  },
  minimal: {
    // Same tactical aesthetic as Stadia's alidade_smooth_dark but served by
    // CARTO — no API key, no per-account quota. Use this if Stadia starts
    // showing "Account limit exceeded" tiles.
    label: 'Minimal (CARTO)',
    url: 'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}@2x.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
    maxNativeZoom: 20,
    maxZoom: 22,
  },
}
