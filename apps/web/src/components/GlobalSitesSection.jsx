import React, { useEffect, useMemo, useState } from 'react'
import { Globe2, Eye, EyeOff, Search, X, ChevronRight, ChevronDown } from 'lucide-react'
import useStore from '../store/useStore'
import {
  GLOBAL_OPERATORS,
  GLOBAL_OPERATOR_ORDER,
  GLOBAL_REGIONS,
  GLOBAL_REGION_ORDER,
  GLOBAL_SITE_TYPES,
  IMPORTANCE_LABELS,
  GLOBAL_SITES_SECTION_LABEL_SHORT,
} from '../config/globalSites'

/**
 * Sidebar driver for the Global Strategic Sites layer.
 *
 * Designed around the user's ask: an operator should be able to
 * understand WHAT is on the map and WHY it is on the map without
 * leaving the sidebar. The controls are therefore:
 *
 *   1. Master toggle                — show/hide the whole namespace
 *   2. Operator chip row            — multi-select, colour-coded to match
 *                                     the map; "Tümü / Hiçbiri" shortcut
 *   3. Region chip row              — single-select (0…n), wider but
 *                                     shallower than operators
 *   4. Importance threshold slider  — 1…5, thins the map at a glance
 *   5. Live search                  — name / country / role
 *   6. Grouped site list            — by operator, sorted by importance
 *                                     desc, with hover sync + fly-to
 *                                     on click (delegated to the layer
 *                                     via the store)
 *   7. Legend footer                — compact operator palette key
 *
 * Data comes from src/data/globalSites.json, lazy-loaded here the same
 * way the map layer loads it. We don't try to share a single module —
 * the dynamic-import cost is ~free on the second caller because Vite
 * hoists the chunk.
 */
export default function GlobalSitesSection() {
  const on          = useStore((s) => s.globalSitesOn)
  const toggle      = useStore((s) => s.toggleGlobalSites)
  const operators   = useStore((s) => s.globalSiteOperators)
  const toggleOp    = useStore((s) => s.toggleGlobalOperator)
  const setAllOps   = useStore((s) => s.setAllGlobalOperators)
  const region      = useStore((s) => s.globalSiteRegion)
  const setRegion   = useStore((s) => s.setGlobalSiteRegion)
  const minImp      = useStore((s) => s.globalSiteMinImportance)
  const setMinImp   = useStore((s) => s.setGlobalSiteMinImportance)
  const search      = useStore((s) => s.globalSiteSearch)
  const setSearch   = useStore((s) => s.setGlobalSiteSearch)
  const selected    = useStore((s) => s.selectedGlobalSite)
  const selectSite  = useStore((s) => s.selectGlobalSite)
  const hoveredId   = useStore((s) => s.hoveredGlobalSiteId)
  const setHovered  = useStore((s) => s.setHoveredGlobalSite)

  const [data, setData] = useState(null)
  const [listOpen, setListOpen] = useState(true)

  /* Same lazy-load pattern as the layer — cheap because Vite caches
     the JSON chunk after the first importer. */
  useEffect(() => {
    if (!on || data) return
    let cancelled = false
    import('../data/globalSites.json').then((mod) => {
      if (cancelled) return
      setData(Array.isArray(mod.default) ? mod.default : [])
    }).catch(() => { if (!cancelled) setData([]) })
    return () => { cancelled = true }
  }, [on, data])

  /* Apply the same filter pipeline the layer uses so the sidebar count
     always matches the marker count. */
  const visible = useMemo(() => {
    if (!data) return []
    const q = search.trim().toLowerCase()
    return data.filter((s) => {
      if (!operators.has(s.operator)) return false
      if (region !== 'all' && s.region !== region) return false
      if ((s.importance || 0) < minImp) return false
      if (q) {
        const hay = `${s.name} ${s.country || ''} ${s.role || ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [data, operators, region, minImp, search])

  // Per-operator tallies drive the chip counters. Computed over the full
  // dataset (not filtered) so flipping an operator off doesn't zero its own
  // chip — the user still sees "there's 12 ABD sites to un-hide".
  const opCounts = useMemo(() => {
    const out = {}
    if (!data) return out
    data.forEach((s) => { out[s.operator] = (out[s.operator] || 0) + 1 })
    return out
  }, [data])

  const regionCounts = useMemo(() => {
    const out = { all: 0 }
    if (!data) return out
    data.forEach((s) => {
      out.all += 1
      out[s.region] = (out[s.region] || 0) + 1
    })
    return out
  }, [data])

  // Group filtered sites by operator for the list view — keeps the two
  // biggest operators (US, NATO) from drowning smaller ones.
  const grouped = useMemo(() => {
    const map = new Map()
    visible.forEach((s) => {
      if (!map.has(s.operator)) map.set(s.operator, [])
      map.get(s.operator).push(s)
    })
    // Sort each operator's list by importance desc so the keystones float up.
    map.forEach((arr) => arr.sort((a, b) => (b.importance || 0) - (a.importance || 0)))
    // Reorder by the canonical operator order, but only include operators
    // that actually have visible entries (otherwise empty sections look broken).
    return GLOBAL_OPERATOR_ORDER
      .filter((op) => map.has(op))
      .map((op) => [op, map.get(op)])
  }, [visible])

  return (
    <div className="px-3 py-2">
      {/* Master toggle — mirrors ConflictSection's style for consistency. */}
      <button
        onClick={toggle}
        className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-md border transition-colors ${
          on
            ? 'bg-sky-400/10 border-sky-400/40 text-sky-200'
            : 'bg-ops-900/40 border-ops-600 text-ops-200 hover:border-ops-500'
        }`}
      >
        <Globe2 size={13} />
        <span className="text-[11px] font-semibold uppercase tracking-wider flex-1 text-left">
          {GLOBAL_SITES_SECTION_LABEL_SHORT}
        </span>
        <span className="text-[10px] font-mono">{on ? 'AKTİF' : 'KAPALI'}</span>
      </button>

      {on && (
        <>
          {/* ── Operator chips ───────────────────────────────────
              Multi-select. We tint each chip with its operator colour so
              the legend is implicit — no need for a separate key block. */}
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[10px] font-mono text-ops-500 uppercase tracking-wider">Aktör</span>
            <div className="flex gap-1">
              <button
                onClick={() => setAllOps(true)}
                className="px-1.5 py-0.5 rounded border border-ops-600 text-ops-400 hover:text-ops-100 hover:border-ops-400 transition-colors"
                title="Tüm aktörleri aç"
              ><Eye size={10} /></button>
              <button
                onClick={() => setAllOps(false)}
                className="px-1.5 py-0.5 rounded border border-ops-600 text-ops-400 hover:text-ops-100 hover:border-ops-400 transition-colors"
                title="Tüm aktörleri kapat"
              ><EyeOff size={10} /></button>
            </div>
          </div>
          <div className="mt-1 flex gap-1 flex-wrap">
            {GLOBAL_OPERATOR_ORDER.map((opId) => {
              const op = GLOBAL_OPERATORS[opId]
              const active = operators.has(opId)
              const count = opCounts[opId] || 0
              return (
                <button
                  key={opId}
                  onClick={() => toggleOp(opId)}
                  title={`${op.labelLong} · ${op.doctrine}`}
                  className={`flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded-full border transition-all ${
                    active ? '' : 'opacity-40'
                  }`}
                  style={{
                    borderColor: active ? op.color : '#2A3F5A',
                    background:  active ? `${op.color}22` : 'transparent',
                    color:       active ? op.color : '#6A7F9F',
                  }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: op.color }}
                  />
                  {op.label}
                  <span className="opacity-70">{count}</span>
                </button>
              )
            })}
          </div>

          {/* ── Region chips ─────────────────────────────────────
              Single-select with an "all" escape hatch. Narrower vocab than
              operators, so a row of pills is enough. */}
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[10px] font-mono text-ops-500 uppercase tracking-wider">Bölge</span>
          </div>
          <div className="mt-1 flex gap-1 flex-wrap">
            <button
              onClick={() => setRegion('all')}
              className={`text-[10px] font-mono px-1.5 py-0.5 rounded border transition-colors ${
                region === 'all'
                  ? 'bg-ops-600 text-ops-50 border-ops-500'
                  : 'bg-ops-800/60 text-ops-300 border-ops-700 hover:border-ops-500'
              }`}
            >
              Tümü <span className="text-ops-500">· {regionCounts.all || 0}</span>
            </button>
            {GLOBAL_REGION_ORDER.map((rId) => {
              const r = GLOBAL_REGIONS[rId]
              const active = region === rId
              const count = regionCounts[rId] || 0
              return (
                <button
                  key={rId}
                  onClick={() => setRegion(active ? 'all' : rId)}
                  className={`text-[10px] font-mono px-1.5 py-0.5 rounded border transition-colors ${
                    active
                      ? 'bg-ops-600 text-ops-50 border-ops-500'
                      : 'bg-ops-800/60 text-ops-300 border-ops-700 hover:border-ops-500'
                  }`}
                >
                  {r.label} <span className="text-ops-500">· {count}</span>
                </button>
              )
            })}
          </div>

          {/* ── Importance slider ────────────────────────────────
              1 = show everything; 5 = only strategic-tier keystones. We
              print the textual band next to the value so the operator isn't
              decoding a bare "3". */}
          <div className="mt-3 pt-2 border-t border-ops-700/50">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-mono text-ops-500 uppercase tracking-wider">
                Önem eşiği
              </span>
              <span className="text-[10px] font-mono text-ops-200">
                {minImp}+ <span className="text-ops-500">· {IMPORTANCE_LABELS[minImp]}</span>
              </span>
            </div>
            <input
              type="range" min={1} max={5} step={1}
              value={minImp}
              onChange={(e) => setMinImp(Number(e.target.value))}
              className="range-slider w-full"
              style={{
                background: `linear-gradient(to right, #A484C0 0%, #A484C0 ${((minImp - 1) / 4) * 100}%, #1E3050 ${((minImp - 1) / 4) * 100}%, #1E3050 100%)`
              }}
            />
            <div className="flex justify-between text-[9px] font-mono text-ops-600 mt-0.5">
              <span>tüm</span>
              <span>orta</span>
              <span>stratejik</span>
            </div>
            {/* LOD legend — tells the operator WHY the map looks different
                at different zoom levels. Low-importance sites collapse to
                dots at wide zoom; stratejik-tier always stays readable. */}
            <div className="mt-1.5 flex items-center gap-1.5 text-[9px] font-mono text-ops-500 leading-tight">
              <span
                className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
                style={{ background: '#A484C0', boxShadow: '0 0 0 1px rgba(164,132,192,0.3)' }}
                aria-hidden
              />
              <span className="truncate">
                Uzakta düşük önem nokta olur; yakınlaş → açılır.
              </span>
            </div>
          </div>

          {/* ── Search ──────────────────────────────────────────
              Single box — name + country + role all fold into the haystack
              so "Ramstein", "Almanya" or "nuclear" all hit. */}
          <div className="mt-2 relative">
            <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-ops-500 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Ara: Ramstein, Cibuti, nükleer…"
              className="w-full pl-7 pr-7 py-1 rounded border border-ops-600 bg-ops-900/40 text-[11px] text-ops-100 placeholder-ops-500 font-mono focus:outline-none focus:border-sky-400/60"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-ops-500 hover:text-ops-200"
                title="Temizle"
              >
                <X size={11} />
              </button>
            )}
          </div>

          {/* ── Result count + list-toggle ─────────────────────── */}
          <button
            onClick={() => setListOpen((v) => !v)}
            className="mt-2 w-full flex items-center gap-1.5 text-[10px] font-mono text-ops-400 hover:text-ops-200 transition-colors"
          >
            {listOpen ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
            <span className="uppercase tracking-wider">Liste</span>
            <span className="text-ops-500">
              · {visible.length}{data ? `/${data.length}` : ''}
            </span>
            {!data && <span className="ml-auto text-ops-600 italic">yükleniyor…</span>}
          </button>

          {/* ── Grouped site list ──────────────────────────────── */}
          {listOpen && (
            <div className="mt-1 max-h-72 overflow-y-auto pr-0.5 space-y-2">
              {visible.length === 0 && data && (
                <p className="text-[10px] font-mono text-ops-500 text-center py-3">
                  Filtreye uyan üs bulunamadı.
                </p>
              )}
              {grouped.map(([opId, arr]) => {
                const op = GLOBAL_OPERATORS[opId]
                return (
                  <div key={opId}>
                    <div
                      className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider px-1 mb-0.5"
                      style={{ color: op.color }}
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ background: op.color, boxShadow: `0 0 0 2px ${op.color}22` }}
                      />
                      <span className="truncate">{op.labelLong}</span>
                      <span className="ml-auto text-ops-500">{arr.length}</span>
                    </div>
                    <div className="space-y-0.5">
                      {arr.map((s) => (
                        <SiteRow
                          key={s.id}
                          site={s}
                          op={op}
                          type={GLOBAL_SITE_TYPES[s.type]}
                          isHot={s.id === hoveredId || s.id === selected?.id}
                          onHover={setHovered}
                          onPick={selectSite}
                        />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* ── Footer hint ─────────────────────────────────── */}
          <p className="mt-2 text-[10px] font-mono text-ops-500 leading-snug">
            💡 Halo'lu chip'ler <span className="text-ops-200">stratejik (5)</span>; listedeki üsse tıkla → harita odaklanır.
          </p>
        </>
      )}
    </div>
  )
}

function SiteRow({ site, op, type, isHot, onHover, onPick }) {
  const imp = Math.max(0, Math.min(5, site.importance || 0))
  return (
    <button
      onMouseEnter={() => onHover(site.id)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onPick(site)}
      title={`${site.name} — ${type?.label || ''} · ${site.country || ''}`}
      className={`w-full flex items-center gap-1.5 px-1.5 py-1 rounded border-l-2 transition-colors text-left ${
        isHot
          ? 'bg-ops-700/60 text-ops-50'
          : 'bg-ops-900/30 text-ops-200 hover:bg-ops-800/60 hover:text-ops-50'
      }`}
      style={{ borderLeftColor: op.color }}
    >
      <span
        className="shrink-0 inline-flex items-center justify-center w-4 h-4 rounded text-[10px]"
        style={{
          background: `${op.color}22`,
          color: op.color,
          fontFamily: "'Segoe UI Symbol','Apple Symbols',sans-serif",
        }}
      >
        {type?.glyph || '•'}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[11px] truncate leading-tight">{site.name}</span>
        <span className="block text-[9px] font-mono text-ops-500 truncate">
          {type?.labelShort || '—'} · {site.country || '—'}
        </span>
      </span>
      <span className="shrink-0 inline-flex items-center gap-[1px]">
        {Array.from({ length: 5 }).map((_, i) => (
          <span
            key={i}
            className="inline-block w-[3px] h-[6px] rounded-sm"
            style={{ background: i < imp ? op.color : '#1E2E48' }}
          />
        ))}
      </span>
    </button>
  )
}
