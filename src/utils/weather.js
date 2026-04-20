/**
 * RainViewer weather tile source.
 *
 *   https://www.rainviewer.com/api.html
 *
 * Free, no API key. Provides two relevant datasets:
 *   · radar     → precipitation (rain + snow), past + nowcast frames
 *   · satellite → infrared cloud cover, past frames only
 *
 * A frame list looks like:
 *   {
 *     version, generated, host: "https://tilecache.rainviewer.com",
 *     radar:     { past: [{ time, path }, …], nowcast: [{ time, path }, …] },
 *     satellite: { infrared: [{ time, path }, …] },
 *   }
 *
 * Final tile URL is built from `host + path + {size}/{z}/{x}/{y}/{color}/{options}.png`.
 *   · Radar:     color 0–8 (palette), options = "{smooth}_{snow}" e.g. "1_1"
 *   · Satellite: color 0 only,         options = "0_0"
 *
 * We refresh the frame list every 10 minutes so the animation stays live.
 */

const ENDPOINT = 'https://api.rainviewer.com/public/weather-maps.json'

/** Fetch the current frame manifest. Throws on network errors. */
export async function fetchWeatherFrames(signal) {
  const res = await fetch(ENDPOINT, { signal })
  if (!res.ok) throw new Error(`RainViewer ${res.status}`)
  const json = await res.json()

  const host     = json.host || 'https://tilecache.rainviewer.com'
  const radar    = [...(json.radar?.past || []), ...(json.radar?.nowcast || [])]
  const infrared = json.satellite?.infrared || []

  return {
    host,
    generated: json.generated,
    radar,      // [{ time, path }, …] chronologically ordered past→future
    infrared,   // [{ time, path }, …] chronologically ordered
    nowcastStart: json.radar?.past?.length ?? 0, // index where nowcast begins
  }
}

/**
 * Build a Leaflet tile URL template for a single frame.
 *
 * @param {string} host       e.g. "https://tilecache.rainviewer.com"
 * @param {string} path       frame path, e.g. "/v2/radar/1710000000"
 * @param {Object} [opts]
 * @param {'radar'|'satellite'} [opts.kind='radar']
 * @param {number} [opts.size=256]
 * @param {number} [opts.color]            Palette (radar: 0–8, satellite: 0)
 * @param {number} [opts.smooth=1]         Interpolated edges
 * @param {number} [opts.snow=1]           Snow as separate color (radar only)
 */
export function tileUrlFor(host, path, opts = {}) {
  const kind   = opts.kind   || 'radar'
  const size   = opts.size   || 256
  const color  = opts.color  ?? (kind === 'satellite' ? 0 : 4)
  const smooth = opts.smooth ?? 1
  const snow   = opts.snow   ?? 1
  return `${host}${path}/${size}/{z}/{x}/{y}/${color}/${smooth}_${snow}.png`
}

/** Pick the latest available frame from a list (most recent by time). */
export function latestFrame(frames) {
  if (!frames?.length) return null
  return frames.reduce((a, b) => (b.time > a.time ? b : a), frames[0])
}

/** Format a unix-seconds timestamp as "HH:MM" local time. */
export function formatFrameTime(unixSec) {
  if (!unixSec) return '—'
  const d = new Date(unixSec * 1000)
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}
