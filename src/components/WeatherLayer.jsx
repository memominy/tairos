import React, { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import useStore from '../store/useStore'
import { fetchWeatherFrames, tileUrlFor } from '../utils/weather'

/**
 * RainViewer weather overlay. Two independent layers:
 *
 *   · Clouds → infrared satellite tiles (global cloud field)
 *   · Rain   → radar tiles (precipitation intensity + snow)
 *
 * Both are TileLayer overlays drawn on top of the basemap. Frame manifest is
 * refreshed every ~5 minutes so the "latest" tile stays current. A single
 * frame index drives any animation — when `weatherFrameIndex` is null we use
 * the latest frame for each layer.
 *
 * Why a single store-level frame index across both layers:
 *   The rain and cloud timelines don't line up exactly (different cadence),
 *   but for operator UX it's cleaner to scrub one slider representing "N
 *   minutes ago" and let each layer pick the closest-time frame it has.
 */
export default function WeatherLayer() {
  const map = useMap()

  const rainOn       = useStore((s) => s.weatherRainOn)
  const cloudsOn     = useStore((s) => s.weatherCloudsOn)
  const opacity      = useStore((s) => s.weatherOpacity)
  const frameIndex   = useStore((s) => s.weatherFrameIndex)

  const framesRef = useRef({ radar: [], infrared: [], host: '' })
  const layerRef  = useRef({ rain: null, clouds: null })

  /* Create a dedicated pane for cloud tiles so we can apply a blend mode to
     the pane itself. Leaflet wraps each tile layer in its own `.leaflet-layer`
     div which forms a stacking context — that isolates CSS blend modes on
     individual tiles from the basemap behind. Giving clouds their own pane
     lets `mix-blend-mode: screen` blend properly against the basemap. */
  useEffect(() => {
    if (!map.getPane('cloud-pane')) {
      const pane = map.createPane('cloud-pane')
      pane.style.zIndex       = 430
      pane.style.pointerEvents = 'none'
      pane.style.mixBlendMode = 'screen'
    }
  }, [map])

  /* Load + refresh the RainViewer manifest. */
  useEffect(() => {
    if (!rainOn && !cloudsOn) return
    const ac  = new AbortController()
    let timer
    let disposed = false

    const load = async () => {
      try {
        const data = await fetchWeatherFrames(ac.signal)
        if (disposed) return
        framesRef.current = data
        // Fire a custom event so the sidebar badges can pick up latest times.
        window.dispatchEvent(new CustomEvent('weather-frames', { detail: data }))
        redraw()
      } catch {
        /* network / abort — ignore, retry on the next tick */
      }
    }

    load()
    timer = setInterval(load, 5 * 60 * 1000)
    return () => {
      disposed = true
      ac.abort()
      clearInterval(timer)
    }
  }, [rainOn, cloudsOn])

  /* React to toggles, opacity, and frame index changes. */
  useEffect(() => {
    redraw()
  }, [rainOn, cloudsOn, opacity, frameIndex])

  /* Unmount cleanup. */
  useEffect(() => () => {
    const { rain, clouds } = layerRef.current
    if (rain)   { rain.remove();   layerRef.current.rain   = null }
    if (clouds) { clouds.remove(); layerRef.current.clouds = null }
  }, [])

  function pickFrame(list) {
    if (!list?.length) return null
    if (frameIndex == null) return list[list.length - 1] // latest
    const i = Math.max(0, Math.min(list.length - 1, frameIndex))
    return list[i]
  }

  function redraw() {
    const { host, radar, infrared } = framesRef.current

    // ── Rain (radar) ────────────────────────────────────
    if (rainOn && host && radar.length) {
      const frame = pickFrame(radar)
      const url   = tileUrlFor(host, frame.path, { kind: 'radar', color: 4, smooth: 1, snow: 1 })
      if (!layerRef.current.rain) {
        layerRef.current.rain = L.tileLayer(url, {
          opacity,
          zIndex: 440,
          attribution: '© <a href="https://www.rainviewer.com/">RainViewer</a>',
          crossOrigin: true,
        }).addTo(map)
      } else {
        // Changing the URL template on a live TileLayer — setUrl rebuilds tiles.
        layerRef.current.rain.setUrl(url)
        layerRef.current.rain.setOpacity(opacity)
      }
    } else if (layerRef.current.rain) {
      layerRef.current.rain.remove()
      layerRef.current.rain = null
    }

    // ── Clouds (satellite IR) ───────────────────────────
    // RainViewer satellite tiles are opaque grayscale (black = no clouds,
    // white = thick clouds). On a dark basemap, the default painter's-model
    // blend would just darken the map. We use mix-blend-mode: screen so only
    // the bright cloud pixels add to the base — black pixels effectively
    // become transparent. That matches how clouds actually look from above.
    if (cloudsOn && host && infrared.length) {
      const frame = pickFrame(infrared)
      // Satellite supports color palettes 0–4. 0 = grayscale (white=cloud
      // tops, black=clear sky), which combined with `mix-blend-mode: screen`
      // on the cloud pane renders only the cloud mass against the basemap.
      const url   = tileUrlFor(host, frame.path, { kind: 'satellite', color: 0, smooth: 0, snow: 0 })
      if (!layerRef.current.clouds) {
        layerRef.current.clouds = L.tileLayer(url, {
          opacity,
          pane: 'cloud-pane',
          className: 'tairos-cloud-tile',
          attribution: '© <a href="https://www.rainviewer.com/">RainViewer</a>',
          crossOrigin: true,
        }).addTo(map)
      } else {
        layerRef.current.clouds.setUrl(url)
        layerRef.current.clouds.setOpacity(opacity)
      }
    } else if (layerRef.current.clouds) {
      layerRef.current.clouds.remove()
      layerRef.current.clouds = null
    }
  }

  return null
}
