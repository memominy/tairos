import React from 'react'
import { Flame, Filter } from 'lucide-react'
import useStore from '../store/useStore'
import conflicts from '../data/conflicts.json'

const FILTERS = [
  { id: 'all',     label: 'Tümü'   },
  { id: 'active',  label: 'Aktif'  },
  { id: 'tension', label: 'Gerilim' },
  { id: 'frozen',  label: 'Donmuş' },
]

// Muted command-map palette — must stay in sync with ConflictLayer's
// statusColour() so sidebar chips read the same hue as map bubbles.
const STATUS_COLOUR = {
  active:  '#C04631',
  ongoing: '#B87035',
  frozen:  '#9AA6B8',
  tension: '#B09340',
}

/**
 * Sidebar section that drives the Conflict Intel layer.
 * Layout mirrors the other sections but lives under the `intel` tab so the
 * platform/field tabs stay focused. Each row is a compact conflict card:
 * status stripe, short name, severity pip row, region tag. Click → opens
 * the detail panel; hover → highlights the matching bubble on the map.
 */
export default function ConflictSection() {
  const on         = useStore((s) => s.conflictsOn)
  const toggle     = useStore((s) => s.toggleConflicts)
  const filter     = useStore((s) => s.conflictStatusFilter)
  const setFilter  = useStore((s) => s.setConflictStatusFilter)
  const select     = useStore((s) => s.selectConflict)
  const selected   = useStore((s) => s.selectedConflict)
  const setHovered = useStore((s) => s.setHoveredConflict)

  const list = conflicts.filter((c) => filter === 'all' || c.status === filter)
  const counts = conflicts.reduce((acc, c) => {
    acc[c.status] = (acc[c.status] || 0) + 1
    return acc
  }, {})

  return (
    <div className="px-3 py-2">
      {/* Master toggle */}
      <button
        onClick={toggle}
        className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-md border transition-colors ${
          on
            ? 'bg-conflict-active/10 border-conflict-active/40 text-conflict-active'
            : 'bg-ops-900/40 border-ops-600 text-ops-200 hover:border-ops-500'
        }`}
      >
        <Flame size={13} />
        <span className="text-[11px] font-semibold uppercase tracking-wider flex-1 text-left">
          Çatışma Haritası
        </span>
        <span className="text-[10px] font-mono">{on ? 'AKTİF' : 'KAPALI'}</span>
      </button>

      {on && (
        <>
          {/* Filter pills */}
          <div className="mt-2 flex items-center gap-1 flex-wrap">
            <Filter size={9} className="text-ops-500" />
            {FILTERS.map((f) => {
              const isActive = filter === f.id
              const count = f.id === 'all' ? conflicts.length : (counts[f.id] || 0)
              return (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors ${
                    isActive
                      ? 'bg-ops-600 text-ops-50 border border-ops-500'
                      : 'bg-ops-800/60 text-ops-300 border border-ops-700 hover:border-ops-500 hover:text-ops-100'
                  }`}
                >
                  {f.label} <span className="text-ops-500">· {count}</span>
                </button>
              )
            })}
          </div>

          {/* Conflict list */}
          <div className="mt-2 space-y-1">
            {list.map((c) => {
              const colour = STATUS_COLOUR[c.status] || '#8C5A44'
              const isSelected = selected?.id === c.id
              return (
                <button
                  key={c.id}
                  onClick={() => {
                    // select() bumps conflictFocusTick, which MapView's
                    // <FlyToConflict /> subscriber reads and uses to
                    // fitBounds to the whole theatre — much better than
                    // landing at a fixed zoom on the bubble centroid.
                    select(c)
                  }}
                  onMouseEnter={() => setHovered(c.id)}
                  onMouseLeave={() => setHovered(null)}
                  className={`w-full text-left rounded-md border px-2 py-1.5 transition-colors group ${
                    isSelected
                      ? 'bg-ops-700 border-ops-500'
                      : 'bg-ops-900/40 border-ops-700 hover:border-ops-500 hover:bg-ops-800/60'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span
                      className="mt-0.5 w-1 self-stretch rounded-full shrink-0"
                      style={{ background: colour }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[11px] font-medium text-ops-100 truncate">
                          {c.shortName}
                        </span>
                        <SeverityPips value={c.severity} colour={colour} />
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5">
                        <span
                          className="text-[9px] font-mono font-bold uppercase tracking-wider"
                          style={{ color: colour }}
                        >
                          {statusLabel(c.status)}
                        </span>
                        <span className="text-[9px] font-mono text-ops-500 truncate">
                          · {c.region}
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              )
            })}
            {list.length === 0 && (
              <p className="text-[10px] font-mono text-ops-500 text-center py-3">
                Filtreye uyan çatışma bulunamadı.
              </p>
            )}
          </div>

          {/* Footer hint */}
          <p className="mt-2 text-[10px] font-mono text-ops-500 leading-snug">
            💡 Harita üzerindeki baloncuğa tıkla → çatışma özeti ve Tairos uygunluk değerlendirmesi.
          </p>
        </>
      )}
    </div>
  )
}

function SeverityPips({ value, colour }) {
  const v = Math.max(0, Math.min(5, Number(value) || 0))
  return (
    <span className="inline-flex items-center gap-[1px] shrink-0">
      {Array.from({ length: 5 }).map((_, i) => (
        <span
          key={i}
          className="inline-block w-[3px] h-[7px] rounded-sm"
          style={{ background: i < v ? colour : '#1E2E48' }}
        />
      ))}
    </span>
  )
}

function statusLabel(status) {
  switch (status) {
    case 'active':   return 'AKTİF'
    case 'ongoing':  return 'SÜREGELEN'
    case 'frozen':   return 'DONMUŞ'
    case 'tension':  return 'GERİLİM'
    default:         return String(status || '').toUpperCase()
  }
}
