import React, { useEffect, useRef, useState } from 'react'
import { Activity, Map, Users, Crosshair, ChevronDown, ChevronUp } from 'lucide-react'
import { DRONE_PRODUCTS } from '../config/drones'

/* ── Animated counter ───────────────────────────────────── */
function Counter({ value, decimals = 0 }) {
  const [display, setDisplay] = useState(value)
  const prev = useRef(value)
  const raf  = useRef(null)

  useEffect(() => {
    const from = prev.current
    const to   = value
    if (from === to) return
    const duration = 600
    const start = performance.now()
    const step = (now) => {
      const t    = Math.min((now - start) / duration, 1)
      const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
      setDisplay(from + (to - from) * ease)
      if (t < 1) raf.current = requestAnimationFrame(step)
      else { prev.current = to; setDisplay(to) }
    }
    raf.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf.current)
  }, [value])

  return <span>{display.toFixed(decimals)}</span>
}

/* ── A single labelled stat cell ────────────────────────── */
function StatCell({ icon: Icon, label, children, empty }) {
  return (
    <div className="flex flex-col justify-center px-3 py-1.5 min-w-[92px]">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-ops-400">
        {Icon && <Icon size={10} />}
        <span>{label}</span>
      </div>
      <div className="mt-0.5 leading-tight">
        {children || <span className="text-xs text-ops-600 font-mono italic">{empty}</span>}
      </div>
    </div>
  )
}

/* ── One row per active drone in a cell ─────────────────── */
function DroneRows({ rows }) {
  if (!rows.length) return null
  return (
    <div className="flex flex-col gap-px">
      {rows.map(({ id, value, suffix = '' }) => {
        const drone = DRONE_PRODUCTS[id]
        if (!drone) return null
        return (
          <div key={id} className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-mono" style={{ color: `${drone.color}99` }}>
              {drone.label}
            </span>
            <span className="font-mono font-semibold text-xs" style={{ color: drone.color }}>
              {value}<span className="text-[10px] font-normal opacity-70">{suffix}</span>
            </span>
          </div>
        )
      })}
    </div>
  )
}

/* ── StatCards bar — single compact strip ───────────────── */
export default function StatCards({
  novaStats,
  irisStats,
  facilityCount,
  nodeCount,
  activeDrones,
  isComputing,
}) {
  const [collapsed, setCollapsed] = useState(false)

  const droneAreaRows    = []
  const dronePercentRows = []
  const dronePopRows     = []

  if (novaStats) {
    droneAreaRows.push({ id: 'nova', value: <Counter value={Math.round(novaStats.area)} />, suffix: ' km²' })
    dronePercentRows.push({ id: 'nova', value: <Counter value={novaStats.areaPercent} decimals={1} />, suffix: '%' })
    dronePopRows.push({ id: 'nova', value: <Counter value={novaStats.popPercent} decimals={1} />, suffix: '%' })
  }
  if (irisStats) {
    droneAreaRows.push({ id: 'iris', value: <Counter value={Math.round(irisStats.area)} />, suffix: ' km²' })
    dronePercentRows.push({ id: 'iris', value: <Counter value={irisStats.areaPercent} decimals={1} />, suffix: '%' })
    dronePopRows.push({ id: 'iris', value: <Counter value={irisStats.popPercent} decimals={1} />, suffix: '%' })
  }

  return (
    <div
      className="no-export absolute bottom-4 left-1/2 -translate-x-1/2"
      style={{ zIndex: 1200 }}
    >
      <div
        className={`flex items-stretch bg-ops-800/90 backdrop-blur-sm border border-ops-600 rounded-lg overflow-hidden transition-opacity ${isComputing ? 'opacity-60' : 'opacity-100'}`}
      >
        {!collapsed && (
          <>
            <StatCell icon={Crosshair} label="Gözlem">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <span className="text-[10px] text-ops-500 font-mono">T</span>
                  <span className="font-mono font-semibold text-xs text-blue-400">
                    <Counter value={facilityCount} />
                  </span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="text-[10px] text-ops-500 font-mono">N</span>
                  <span className="font-mono font-semibold text-xs text-yellow-400">
                    <Counter value={nodeCount} />
                  </span>
                </span>
              </div>
            </StatCell>

            <div className="w-px bg-ops-700" />

            <StatCell icon={Map} label="Kapsama" empty="—">
              <DroneRows rows={droneAreaRows} />
            </StatCell>

            <div className="w-px bg-ops-700" />

            <StatCell icon={Activity} label="Alan %" empty="—">
              <DroneRows rows={dronePercentRows} />
            </StatCell>

            <div className="w-px bg-ops-700" />

            <StatCell icon={Users} label="Nüfus %" empty="—">
              <DroneRows rows={dronePopRows} />
            </StatCell>

            <div className="w-px bg-ops-700" />
          </>
        )}

        <button
          onClick={() => setCollapsed((v) => !v)}
          className="px-2 flex items-center justify-center text-ops-500 hover:text-ops-200 hover:bg-ops-700/50 transition-colors"
          title={collapsed ? 'İstatistikleri göster' : 'Gizle'}
        >
          {collapsed
            ? <><ChevronUp size={12} /><span className="ml-1 text-[10px] font-mono uppercase tracking-wider">İst.</span></>
            : <ChevronDown size={12} />}
        </button>
      </div>
    </div>
  )
}
