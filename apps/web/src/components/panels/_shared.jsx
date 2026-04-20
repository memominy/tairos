/**
 * Panel dosyalarının paylaştığı küçük parçacıklar. Eski Sidebar.jsx 900
 * satırdı ve her bölümün parçaları aynı dosyada iç içeydi. Şimdi:
 *
 *   Section         — koleksiyon başlığı + sağa aksiyon yuvası + aç/kapat
 *   RangePopover    — drone kartına sağ-tık menzil slider'ı (portal)
 *   DroneCard       — drone aç/kapat + menzil + kaynaklar
 *   CategoryRow     — tek bir varlık kategorisi toggle satırı
 *   CategoryGroup   — kategori kümesi başlığı (açık/kapalı)
 *   IntelHeader     — Dünya panelinin üstündeki 4'lü quick-toggle
 *
 * Tümü stateless veya yalnız lokal state'li — parent zustand'dan okur,
 * prop olarak iletir. Böylece panel dosyaları istediği gibi yeniden
 * birleştirebilir.
 */
import React, { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  ChevronDown, ChevronRight,
  Flame, Globe2, Swords, Cloud,
} from 'lucide-react'
import { CATEGORIES, CATEGORY_ORDER } from '../../config/categories'
import { GLOBAL_OPERATORS, GLOBAL_OPERATOR_ORDER } from '../../config/globalSites'

/* ── Section ──────────────────────────────────────────────
 * Panellerin tekrar kullandığı "başlıklı, açılır/kapanır, sağa küçük
 * aksiyonlar" çerçevesi. */
export function Section({ icon: Icon, title, badge, action, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-ops-700">
      <div className="flex items-center">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex-1 flex items-center gap-2 px-3 py-2 text-left hover:bg-ops-700/30 transition-colors"
        >
          <span className="text-ops-500">
            {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          </span>
          {Icon && <Icon size={12} className="text-ops-400" />}
          <span className="text-[11px] text-ops-300 uppercase tracking-wider font-medium">
            {title}
          </span>
          {badge != null && (
            <span className="ml-1 text-[10px] font-mono text-ops-500">· {badge}</span>
          )}
        </button>
        {action && <div className="pr-2 flex items-center gap-1">{action}</div>}
      </div>
      {open && <div className="pb-2">{children}</div>}
    </div>
  )
}

/* ── Ortak sayı tablosu ──────────────────────────────────
 * Toplam kategori sayıları — tek bir tablo. Sidebar eskiden kendi
 * içinde yeniden üretiyordu, şimdi panel dosyaları import ederek alır. */
import allFacilities from '../../data/facilities.json'
export const TOTAL_COUNT = CATEGORY_ORDER.reduce((acc, id) => {
  acc[id] = allFacilities.filter((f) => f.category === id).length
  return acc
}, {})

/* ── RangePopover ────────────────────────────────────────
 * Sağ-tık ile drone kartından açılır — portal, klavye ESC kapatır. */
export function RangePopover({ drone, rangeKm, onRange, x, y, onClose }) {
  const ref = useRef(null)
  const PRESETS = [50, 100, 200, 400, 600, 1000]

  useEffect(() => {
    const onKey  = (e) => { if (e.key === 'Escape') onClose() }
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    document.addEventListener('keydown',   onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown',   onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [onClose])

  const left = Math.min(x, window.innerWidth  - 220)
  const top  = Math.min(y, window.innerHeight - 180)

  return createPortal(
    <div
      ref={ref}
      className="fixed rounded-xl border shadow-2xl p-3 w-52"
      style={{
        left, top,
        zIndex: 9999,
        background: '#0D1526',
        borderColor: `${drone.color}44`,
        boxShadow: `0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px ${drone.color}22`,
      }}
    >
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ background: drone.color }} />
          <span className="text-xs font-bold" style={{ color: drone.color }}>{drone.label} Menzili</span>
        </div>
        <span className="font-mono text-sm font-bold" style={{ color: drone.color }}>{rangeKm} km</span>
      </div>

      <input
        type="range" min={10} max={1000} step={5}
        value={rangeKm}
        onChange={(e) => onRange(Number(e.target.value))}
        className="range-slider w-full mb-2"
        style={{
          background: `linear-gradient(to right, ${drone.color} 0%, ${drone.color} ${((rangeKm - 10) / 990) * 100}%, #1E3050 ${((rangeKm - 10) / 990) * 100}%, #1E3050 100%)`
        }}
      />

      <div className="flex gap-1 flex-wrap">
        {PRESETS.map((v) => (
          <button
            key={v}
            onClick={() => onRange(v)}
            className="flex-1 min-w-[28px] text-xs py-0.5 rounded border font-mono transition-all"
            style={rangeKm === v
              ? { borderColor: drone.color, background: `${drone.color}33`, color: drone.color }
              : { borderColor: '#2A3F5A', color: '#4A5F80' }
            }
          >
            {v}
          </button>
        ))}
      </div>
    </div>,
    document.body
  )
}

/* ── DroneCard ───────────────────────────────────────────
 * Drone aç/kapat + menzil rozeti + konuşlanma kaynağı kartı. */
export function DroneCard({ drone, active, onToggle, sources, onToggleSource, rangeKm, onRange }) {
  const [expanded, setExpanded] = useState(false)
  const [popover,  setPopover]  = useState(null)

  const extraCount = [...sources].filter((s) => s !== 'nodes').length
  const hasNodes   = sources.has('nodes')

  const handleContextMenu = (e) => {
    e.preventDefault()
    setPopover({ x: e.clientX, y: e.clientY })
  }

  return (
    <>
      {popover && (
        <RangePopover
          drone={drone} rangeKm={rangeKm} onRange={onRange}
          x={popover.x} y={popover.y} onClose={() => setPopover(null)}
        />
      )}

      <div
        className={`rounded-lg border transition-all ${active ? '' : 'opacity-40'}`}
        style={active ? { borderColor: `${drone.color}55`, background: drone.bgColor } : { borderColor: '#2A3F5A' }}
        onContextMenu={handleContextMenu}
      >
        <button
          className="w-full flex items-center gap-2.5 px-2.5 pt-2 pb-1.5 text-left"
          onClick={onToggle}
        >
          <span
            className="shrink-0 w-2 h-2 rounded-full transition-colors"
            style={{ background: active ? drone.color : '#3A4F6A' }}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold tracking-wide" style={{ color: active ? drone.color : '#6A7F9F' }}>
                {drone.label}
              </span>
              <span
                className="text-xs font-mono px-1 py-px rounded"
                style={{
                  background: active ? `${drone.color}22` : 'rgba(30,48,80,0.4)',
                  color: active ? drone.color : '#4A5F80',
                }}
              >
                {rangeKm} km
              </span>
            </div>
            <div className="text-xs text-ops-500 truncate leading-tight">{drone.description}</div>
          </div>
          <span className="shrink-0 text-xs font-mono" style={{ color: active ? drone.color : '#3A4F6A' }}>
            {active ? '●' : '○'}
          </span>
        </button>

        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-full flex items-center justify-between px-2.5 pb-2 text-left group"
        >
          <div className="flex items-center gap-1 flex-wrap">
            {hasNodes && (
              <span
                className="text-xs font-mono px-1.5 py-px rounded-full border"
                style={{ borderColor: `${drone.color}44`, color: `${drone.color}99`, background: `${drone.color}11` }}
              >
                ◆ Nodes
              </span>
            )}
            {[...sources].filter((s) => s !== 'nodes').map((catId) => {
              const cat = CATEGORIES[catId]
              return cat ? (
                <span
                  key={catId}
                  className="text-xs font-mono px-1.5 py-px rounded-full border"
                  style={{ borderColor: `${cat.color}55`, color: `${cat.color}bb`, background: `${cat.color}11` }}
                >
                  {cat.labelShort.split(' ')[0]}
                </span>
              ) : null
            })}
            {!hasNodes && extraCount === 0 && (
              <span className="text-xs text-ops-600 italic">kaynak yok</span>
            )}
          </div>
          <span className="text-ops-500 group-hover:text-ops-300 transition-colors shrink-0 ml-1">
            {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          </span>
        </button>

        {expanded && (
          <div className="px-2.5 pb-2.5 border-t border-ops-700/50">
            <div className="text-xs text-ops-500 mt-2 mb-1.5 uppercase tracking-wider">Konuşlanma kaynakları</div>
            <div className="flex flex-wrap gap-1">
              <button
                onClick={() => onToggleSource('nodes')}
                className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border transition-all font-mono"
                style={
                  hasNodes
                    ? { borderColor: drone.color, background: `${drone.color}22`, color: drone.color }
                    : { borderColor: '#2A3F5A', color: '#4A5F80' }
                }
              >
                ◆ Nodes
              </button>
              {CATEGORY_ORDER.map((catId) => {
                const cat      = CATEGORIES[catId]
                const selected = sources.has(catId)
                return (
                  <button
                    key={catId}
                    onClick={() => onToggleSource(catId)}
                    title={`${cat.label} (${TOTAL_COUNT[catId]} varlık)`}
                    className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border transition-all font-mono"
                    style={
                      selected
                        ? { borderColor: cat.color, background: `${cat.color}22`, color: cat.color }
                        : { borderColor: '#2A3F5A', color: '#4A5F80' }
                    }
                  >
                    {cat.labelShort.split(' ')[0]}
                    <span className="opacity-60">{TOTAL_COUNT[catId]}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </>
  )
}

/* ── CategoryRow ─────────────────────────────────────────
 * Tek kategori (üs/liman/enerji/…) aç/kapat satırı. */
export function CategoryRow({ cat, active, onToggle, count }) {
  const tip = cat.description
    ? `${cat.label} — ${cat.description}${cat.doctrine ? `\n→ ${cat.doctrine}` : ''}`
    : cat.label
  return (
    <button
      onClick={() => onToggle(cat.id)}
      title={tip}
      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded transition-all text-left group ${
        active ? 'opacity-100' : 'opacity-40'
      }`}
    >
      <span
        className="shrink-0 flex items-center justify-center w-5 h-5 rounded-full border transition-all"
        style={{
          borderColor: cat.color,
          background: active ? `${cat.color}22` : 'transparent',
          color: cat.color,
          fontSize: 11,
          lineHeight: 1,
          fontFamily: "'Segoe UI Symbol','Apple Symbols',sans-serif",
        }}
      >
        {cat.glyph || '•'}
      </span>
      <span className="flex-1 text-xs text-ops-100 group-hover:text-white truncate leading-tight">
        {cat.label}
      </span>
      <span
        className="shrink-0 text-xs font-mono px-1.5 py-0.5 rounded"
        style={{
          background: active ? cat.bgColor : 'rgba(30,48,80,0.3)',
          color: active ? cat.color : '#4A5F80',
        }}
      >
        {count}
      </span>
    </button>
  )
}

/* ── CategoryGroup ───────────────────────────────────────
 * Kategori kümesi başlığı — askeri/sivil/altyapı sınıflarını ayırır. */
export function CategoryGroup({ group, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="mb-1.5">
      <button
        onClick={() => setOpen((v) => !v)}
        title={group.note || group.label}
        className="w-full flex items-center gap-1.5 px-2 py-1 text-[10px] uppercase tracking-wider font-medium hover:text-ops-100"
        style={{ color: group.color }}
      >
        <span
          className="shrink-0 w-1.5 h-1.5 rounded-full"
          style={{ background: group.color, boxShadow: `0 0 0 2px ${group.color}22` }}
        />
        <span className="truncate">{group.label}</span>
        {group.short && (
          <span className="ml-1 text-[9px] font-mono text-ops-500 normal-case tracking-normal">
            {group.short}
          </span>
        )}
        <span className="ml-auto text-ops-500">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <>
          {group.note && (
            <div className="px-2 -mt-0.5 mb-1 text-[9px] text-ops-500 leading-snug font-mono">
              {group.note}
            </div>
          )}
          <div>{children}</div>
        </>
      )}
    </div>
  )
}

/* ── IntelHeader (Dünya paneli için) ─────────────────────
 * Dünya panelinin üst şeridi — 4'lü quick-toggle (çatışma/küresel
 * üs/kuvvet/hava) + global üs operator legend'i. */
export function IntelHeader({
  conflictsOn, onToggleConflicts,
  globalSitesOn, onToggleGlobalSites,
  forceDeployOn, onToggleForceDeploy,
  weatherOn, onToggleWeather,
}) {
  const ITEMS = [
    { id: 'confl',  label: 'Çatışma', on: conflictsOn,    onToggle: onToggleConflicts,    color: '#C04631', icon: Flame },
    { id: 'global', label: 'Küresel', on: globalSitesOn,  onToggle: onToggleGlobalSites,  color: '#3E74B8', icon: Globe2 },
    { id: 'force',  label: 'Kuvvet',  on: forceDeployOn,  onToggle: onToggleForceDeploy,  color: '#E0A42C', icon: Swords },
    { id: 'wx',     label: 'Hava',    on: weatherOn,      onToggle: onToggleWeather,      color: '#7AB8F0', icon: Cloud },
  ]
  return (
    <div className="px-3 pt-2 pb-1.5 border-b border-ops-700/70 bg-ops-900/30">
      <div className="grid grid-cols-4 gap-1">
        {ITEMS.map((it) => {
          const Icon = it.icon
          return (
            <button
              key={it.id}
              onClick={it.onToggle}
              className={`flex items-center justify-center gap-1 py-1.5 rounded border text-[10px] font-mono transition-all ${
                it.on ? '' : 'opacity-45'
              }`}
              style={{
                borderColor: it.on ? it.color : '#2A3F5A',
                background:  it.on ? `${it.color}1A` : 'transparent',
                color:       it.on ? it.color : '#6A7F9F',
              }}
              title={`${it.label} katmanı`}
            >
              <Icon size={11} />
              <span>{it.label}</span>
            </button>
          )
        })}
      </div>
      {globalSitesOn && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {GLOBAL_OPERATOR_ORDER.map((opId) => {
            const op = GLOBAL_OPERATORS[opId]
            return (
              <span
                key={opId}
                title={op.labelLong}
                className="inline-flex items-center gap-1 text-[9px] font-mono text-ops-400"
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: op.color }}
                />
                {op.label}
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}
