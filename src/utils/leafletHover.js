import L from 'leaflet'

/**
 * Adds a polyline whose tooltip triggers from a comfortable distance around
 * the stroke, not just on the pixel-thin visible line itself.
 *
 * Implementation note: previously this drew two coincident polylines — a
 * transparent fat hit-target under a slim visible stroke. Now that the map
 * uses `L.canvas({ tolerance: 10 })`, hit-testing on canvas paths already
 * extends ~10 px around every line, so one polyline is enough. That's a 2×
 * reduction in path count across the whole overlay pipeline, which matters
 * when the power/water/maritime/internet layers are all on at once.
 *
 * Keeping the same function name and signature so existing call-sites don't
 * need to change.
 *
 * @param {L.LayerGroup}     group        target layer group
 * @param {Array}            coords       [[lat, lng], …]
 * @param {Object}           style        L.polyline options for the visible line
 * @param {string}           tooltipHtml  HTML shown on hover (optional)
 * @param {Object}           tooltipOpts  Leaflet tooltip options merged over defaults
 * @returns {{ line: L.Polyline }}
 */
export function addHoverablePolyline(group, coords, style, tooltipHtml, tooltipOpts = {}) {
  const line = L.polyline(coords, { ...style, interactive: true })
  if (tooltipHtml) {
    line.bindTooltip(tooltipHtml, {
      direction: 'top',
      sticky:    true,
      ...tooltipOpts,
    })
  }
  line.addTo(group)
  return { line }
}
