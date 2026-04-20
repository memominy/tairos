import React, { useEffect, useMemo, useState } from 'react'
import {
  Layers, Cloud, CloudRain, Play, Pause, Filter as FilterIcon,
} from 'lucide-react'
import useStore from '../store/useStore'
import { OVERLAYS, OVERLAY_ORDER } from '../utils/overlays'
import { formatFrameTime } from '../utils/weather'
import FloatingPanel from './FloatingPanel'

/**
 * Floating "island" on the map that replaces the old sidebar sections
 * for display-only preferences:
 *
 *   • Infrastructure overlays (rail, power, internet, water, towers, maritime…)
 *   • Weather (clouds, rain, timeline, opacity)
 *   • Dedupe display mode
 *
 * Why off the sidebar: these are set-and-forget toggles. The operator
 * leans into the sidebar for *task* work (platform planning, field
 * inventory, intel reading) and these were eating vertical space there.
 * On the map itself they're a glance away, drag-movable, and auto-grow
 * when something gets switched on so the operator gets immediate feedback
 * without having to go hunt for controls.
 *
 * Two modes:
 *   - collapsed: header-only pill showing active count + active-layer
 *                colour dots. Drag to move, double-click to expand.
 *   - expanded : full control surface with overlay grid + weather block.
 *
 * The "grow/shrink when selecting/deselecting" vibe the user asked for
 * is implemented via two hooks:
 *   (a) clicking ANY toggle while collapsed auto-expands the panel
 *       (so the operator immediately sees related controls)
 *   (b) CSS transitions on width/height + a pulse ring on the header when
 *       a layer flips on
 */
export default function MapLayersIsland() {
  // ── overlays
  const activeOverlays = useStore((s) => s.activeOverlays)
  const toggleOverlay  = useStore((s) => s.toggleOverlay)
  // ── weather
  const rainOn     = useStore((s) => s.weatherRainOn)
  const cloudsOn   = useStore((s) => s.weatherCloudsOn)
  const opacity    = useStore((s) => s.weatherOpacity)
  const frameIndex = useStore((s) => s.weatherFrameIndex)
  const animating  = useStore((s) => s.weatherAnimating)
  const toggleRain   = useStore((s) => s.toggleWeatherRain)
  const toggleClouds = useStore((s) => s.toggleWeatherClouds)
  const setOpacity   = useStore((s) => s.setWeatherOpacity)
  const setFrameIndex= useStore((s) => s.setWeatherFrameIndex)
  const setAnimating = useStore((s) => s.setWeatherAnimating)
  // ── display modes
  const dedupeMode   = useStore((s) => s.dedupeMode)
  const setDedupeMode= useStore((s) => s.setDedupeMode)

  // ── local UI state
  const [collapsed, setCollapsed] = useState(true)
  const [pulse, setPulse] = useState(null) // key of the last-toggled layer
  const [frames, setFrames] = useState({ radar: [], infrared: [], nowcastStart: 0 })

  // Listen for the weather manifest (already fetched by WeatherLayer).
  useEffect(() => {
    const onFrames = (e) => setFrames(e.detail || { radar: [], infrared: [] })
    window.addEventListener('weather-frames', onFrames)
    return () => window.removeEventListener('weather-frames', onFrames)
  }, [])

  // Rain timeline animation loop — mirrors the one in the old sidebar.
  const nFrames = (frames.radar || []).length
  useEffect(() => {
    const active = rainOn || cloudsOn
    if (!animating || !active || nFrames < 2) return
    const id = setInterval(() => {
      const cur = useStore.getState().weatherFrameIndex
      const i   = (cur == null ? nFrames - 1 : cur) + 1
      setFrameIndex(i >= nFrames ? 0 : i)
    }, 600)
    return () => clearInterval(id)
  }, [animating, rainOn, cloudsOn, nFrames, setFrameIndex])

  // ── summary data for the header + collapsed pill
  const activeCount = activeOverlays.size + (rainOn ? 1 : 0) + (cloudsOn ? 1 : 0)
  const activeDots  = useMemo(() => {
    const out = []
    OVERLAY_ORDER.forEach((id) => { if (activeOverlays.has(id)) out.push(OVERLAYS[id].color) })
    if (cloudsOn) out.push('#9CC4E8')
    if (rainOn)   out.push('#4A9EFF')
    return out.slice(0, 6) // cap to keep the pill tidy
  }, [activeOverlays, rainOn, cloudsOn])

  // Fire the pulse animation + auto-expand when the operator toggles
  // something while the panel is collapsed. Gives a visible "the island
  // just did something" feedback without requiring explicit expansion.
  const firePulse = (key) => {
    setPulse(key)
    setTimeout(() => setPulse((cur) => (cur === key ? null : cur)), 500)
  }
  const handleOverlayToggle = (id) => {
    toggleOverlay(id)
    firePulse(id)
    if (collapsed) setCollapsed(false)
  }
  const handleWeather = (kind) => {
    if (kind === 'clouds') toggleClouds()
    if (kind === 'rain')   toggleRain()
    firePulse(`wx-${kind}`)
    if (collapsed) setCollapsed(false)
  }

  const hasWeather = rainOn || cloudsOn
  const radar      = frames.radar || []
  const infrared   = frames.infrared || []
  const frameI     = frameIndex == null ? Math.max(0, nFrames - 1) : frameIndex
  const current    = radar[frameI]
  const label      = current ? formatFrameTime(current.time) : '—'
  const isFuture   = current && frames.nowcastStart != null && frameI >= frames.nowcastStart

  return (
    <FloatingPanel
      id="map-layers"
      title={collapsed ? `KATMAN · ${activeCount}` : 'HARİTA KATMANLARI'}
      icon={Layers}
      accent="#7AB8F0"
      defaultPos={{ x: -16, y: 72 }}   // negative = anchor from right edge
      defaultSize={{ w: 280, h: 440 }}
      minSize={{ w: 240, h: 200 }}
      maxSize={{ w: 420, h: 720 }}
      collapsed={collapsed}
      onCollapsedChange={setCollapsed}
      headerExtra={
        // Collapsed mode: render the coloured-dot summary in the header so
        // the operator can read active layers without expanding.
        collapsed && activeDots.length > 0 ? (
          <div className="flex items-center gap-[3px]">
            {activeDots.map((c, i) => (
              <span
                key={i}
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: c }}
              />
            ))}
          </div>
        ) : null
      }
    >
      {/* ── Overlay grid ──────────────────────────────────────── */}
      <div className="px-2.5 pt-2 pb-2 border-b border-ops-700/50">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-mono text-ops-500 uppercase tracking-wider">
            Altyapı & sınırlar
          </span>
          <span className="text-[9px] font-mono text-ops-500">{activeOverlays.size}/{OVERLAY_ORDER.length}</span>
        </div>
        <div className="grid grid-cols-2 gap-1">
          {OVERLAY_ORDER.map((id) => {
            const ov = OVERLAYS[id]
            const active = activeOverlays.has(id)
            const isPulsing = pulse === id
            return (
              <button
                key={id}
                onClick={() => handleOverlayToggle(id)}
                className={`flex items-center gap-1.5 px-2 py-1 rounded border text-[10px] transition-all ${
                  active ? '' : 'opacity-45'
                } ${isPulsing ? 'scale-[1.04]' : ''}`}
                style={{
                  borderColor: active ? ov.color : '#2A3F5A',
                  background:  active ? `${ov.color}18` : 'transparent',
                  color:       active ? ov.color : '#6A7F9F',
                  boxShadow:   isPulsing ? `0 0 0 2px ${ov.color}55` : 'none',
                }}
                title={ov.label}
              >
                <span
                  className="w-2 h-2 rounded-sm shrink-0"
                  style={{ background: active ? ov.color : 'transparent', border: `1px solid ${ov.color}` }}
                />
                <span className="truncate">{ov.label}</span>
              </button>
            )
          })}
        </div>

        <button
          onClick={() => setDedupeMode(!dedupeMode)}
          className={`mt-1.5 w-full flex items-center gap-1.5 px-2 py-1 rounded border text-[10px] transition-all ${
            dedupeMode ? 'border-accent/60 bg-accent/10 text-accent' : 'border-ops-600 text-ops-400 hover:border-ops-500'
          }`}
          title="Aynı konumdaki varlıklardan sadece en stratejiği göster"
        >
          <FilterIcon size={10} />
          <span className="flex-1 text-left">Üst üste gizle</span>
          <span className="font-mono text-[9px]">{dedupeMode ? 'AÇIK' : 'KAPALI'}</span>
        </button>
      </div>

      {/* ── Weather ──────────────────────────────────────────── */}
      <div className="px-2.5 pt-2 pb-2.5">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-mono text-ops-500 uppercase tracking-wider">Hava durumu</span>
          {hasWeather && (
            <span className="text-[9px] font-mono" style={{ color: isFuture ? '#F5C842' : '#7AB8F0' }}>
              {label}
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-1">
          <button
            onClick={() => handleWeather('clouds')}
            className={`flex items-center justify-center gap-1.5 py-1.5 rounded border text-[10px] font-mono transition-all ${
              cloudsOn
                ? 'border-sky-400/70 bg-sky-400/15 text-sky-200'
                : 'border-ops-600 text-ops-400 hover:border-ops-400'
            } ${pulse === 'wx-clouds' ? 'scale-[1.04]' : ''}`}
          >
            <Cloud size={11} />
            Bulut
          </button>
          <button
            onClick={() => handleWeather('rain')}
            className={`flex items-center justify-center gap-1.5 py-1.5 rounded border text-[10px] font-mono transition-all ${
              rainOn
                ? 'border-blue-400/70 bg-blue-400/15 text-blue-200'
                : 'border-ops-600 text-ops-400 hover:border-ops-400'
            } ${pulse === 'wx-rain' ? 'scale-[1.04]' : ''}`}
          >
            <CloudRain size={11} />
            Yağmur
          </button>
        </div>

        {hasWeather && (
          <>
            {/* Opacity */}
            <div className="mt-2">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[9px] font-mono text-ops-500 uppercase tracking-wider">Opaklık</span>
                <span className="text-[10px] font-mono text-ops-300">{Math.round(opacity * 100)}%</span>
              </div>
              <input
                type="range" min={0.1} max={1} step={0.05}
                value={opacity}
                onChange={(e) => setOpacity(Number(e.target.value))}
                className="range-slider w-full"
                style={{
                  background: `linear-gradient(to right, #7AB8F0 0%, #7AB8F0 ${((opacity - 0.1) / 0.9) * 100}%, #1E3050 ${((opacity - 0.1) / 0.9) * 100}%, #1E3050 100%)`,
                }}
              />
            </div>

            {/* Rain timeline */}
            {nFrames > 0 && (
              <div className="mt-2">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[9px] font-mono text-ops-500 uppercase tracking-wider">
                    {isFuture ? 'Tahmin' : 'Geçmiş'}
                  </span>
                  <button
                    onClick={() => setAnimating(!animating)}
                    className="w-5 h-5 flex items-center justify-center rounded border border-ops-600 text-ops-300 hover:border-ops-400 hover:text-white"
                    title={animating ? 'Duraklat' : 'Oynat'}
                  >
                    {animating ? <Pause size={8} /> : <Play size={8} />}
                  </button>
                </div>
                <input
                  type="range" min={0} max={Math.max(0, nFrames - 1)} step={1}
                  value={frameI}
                  onChange={(e) => { setAnimating(false); setFrameIndex(Number(e.target.value)) }}
                  className="range-slider w-full"
                  style={{
                    background: (() => {
                      const pct    = nFrames > 1 ? (frameI / (nFrames - 1)) * 100 : 100
                      const nowPct = nFrames > 1 ? ((frames.nowcastStart - 1) / (nFrames - 1)) * 100 : 100
                      return `linear-gradient(to right, #7AB8F0 0%, #7AB8F0 ${pct}%, #1E3050 ${pct}%, #1E3050 ${nowPct}%, #2A3F5A ${nowPct}%, #2A3F5A 100%)`
                    })(),
                  }}
                />
                <div className="flex justify-between text-[8px] font-mono text-ops-600 mt-0.5">
                  <span>{radar[0] ? formatFrameTime(radar[0].time) : ''}</span>
                  <span>şimdi</span>
                  <span>{radar[nFrames - 1] ? formatFrameTime(radar[nFrames - 1].time) : ''}</span>
                </div>
              </div>
            )}

            {rainOn && (
              <div className="mt-2">
                <div className="text-[9px] font-mono text-ops-500 uppercase tracking-wider mb-0.5">
                  Yağmur şiddeti
                </div>
                <div
                  className="h-1.5 rounded-full"
                  style={{ background: 'linear-gradient(to right, #1a4d8c, #2ea0ff, #47d86b, #f5e342, #ef5a3d, #9b2fc4)' }}
                />
                <div className="flex justify-between text-[8px] font-mono text-ops-600 mt-0.5">
                  <span>zayıf</span>
                  <span>şiddetli</span>
                </div>
              </div>
            )}

            {(cloudsOn && infrared.length > 0) && (
              <div className="mt-1 text-[9px] font-mono" style={{ color: '#9CC4E8' }}>
                ☁ bulut: {formatFrameTime(infrared[infrared.length - 1].time)} · {infrared.length} kare
              </div>
            )}

            <div className="mt-1.5 text-[8px] font-mono text-ops-600 italic">
              veri: RainViewer (~5 dk tazeleme)
            </div>
          </>
        )}
      </div>
    </FloatingPanel>
  )
}
