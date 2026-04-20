import React, { useEffect, useMemo, useState } from 'react'
import {
  Swords, Search, X, ChevronRight, ChevronDown,
  Target, Crosshair, Radar, Network, Zap,
} from 'lucide-react'
import useStore from '../store/useStore'
import {
  UNIT_TYPES,
  UNIT_KINDS,
  ECHELONS,
  ECHELON_ORDER,
  FORCE_SIDE_COLOUR,
  FORCE_SECTION_LABEL_SHORT,
  THREAT_STYLES,
  THREAT_STYLE_ORDER,
} from '../config/forceDeployments'
import { CONFLICT_SIDE_DEFAULT_LABEL } from '../config/conflictAssets'

/**
 * Sidebar driver for the Kuvvet Konuşlanması layer.
 *
 * Controls (top to bottom):
 *
 *   1. Master toggle
 *   2. Scope toggle — "Tümü" vs "Seçili çatışma" (declutters when drilled in)
 *   3. Side A/B chips — colour-tinted; operator can mute one side entirely
 *   4. Kind chips — command / combat / fires / air / naval / irregular
 *   5. Echelon minimum slider — drop battalions when the map gets noisy
 *   6. Search — name / formation / note
 *   7. Grouped unit list — by side then echelon
 *   8. Legend hint
 */
export default function ForceDeploymentSection() {
  const on            = useStore((s) => s.forceDeployOn)
  const toggle        = useStore((s) => s.toggleForceDeploy)
  const sides         = useStore((s) => s.forceDeploySides)
  const toggleSide    = useStore((s) => s.toggleForceDeploySide)
  const kindFilter    = useStore((s) => s.forceDeployKindFilter)
  const setKind       = useStore((s) => s.setForceDeployKindFilter)
  const minEchelon    = useStore((s) => s.forceDeployMinEchelon)
  const setMinEchelon = useStore((s) => s.setForceDeployMinEchelon)
  const scope         = useStore((s) => s.forceDeployScope)
  const setScope      = useStore((s) => s.setForceDeployScope)
  const search        = useStore((s) => s.forceDeploySearch)
  const setSearch     = useStore((s) => s.setForceDeploySearch)
  const selected      = useStore((s) => s.selectedDeployUnit)
  const selectUnit    = useStore((s) => s.selectDeployUnit)
  const hoveredId     = useStore((s) => s.hoveredDeployUnitId)
  const setHovered    = useStore((s) => s.setHoveredDeployUnit)
  const selectedConflict = useStore((s) => s.selectedConflict)
  const flyToPoint    = useStore((s) => s.flyToPoint)

  // Threat + kill-chain slice — downstream layers subscribe too,
  // but the UI controls live here so the operator finds everything
  // about "this unit ecosystem" in one place.
  const threatOn          = useStore((s) => s.threatProjectionOn)
  const toggleThreat      = useStore((s) => s.toggleThreatProjection)
  const threatStyles      = useStore((s) => s.threatProjectionStyles)
  const toggleThreatStyle = useStore((s) => s.toggleThreatStyle)
  const threatIntensity   = useStore((s) => s.threatIntensity)
  const setThreatIntensity= useStore((s) => s.setThreatIntensity)
  const killChainOn       = useStore((s) => s.killChainOn)
  const toggleKillChain   = useStore((s) => s.toggleKillChain)
  const killChainRange    = useStore((s) => s.killChainRangeKm)
  const setKillChainRange = useStore((s) => s.setKillChainRange)

  const [data, setData] = useState(null)
  const [listOpen, setListOpen] = useState(true)

  /* Lazy-load the seed — same pattern as the layer. */
  useEffect(() => {
    if (!on || data) return
    let cancelled = false
    import('../data/forceDeployments.json').then((mod) => {
      if (cancelled) return
      setData(flattenForceData(mod.default))
    }).catch(() => { if (!cancelled) setData([]) })
    return () => { cancelled = true }
  }, [on, data])

  /* Same filter pipeline as the layer so sidebar count == marker count. */
  const visible = useMemo(() => {
    if (!data) return []
    const q = search.trim().toLowerCase()
    return data.filter((u) => {
      if (!sides.has(u.side)) return false
      const type = UNIT_TYPES[u.type]
      if (!type) return false
      if (kindFilter !== 'all' && type.kind !== kindFilter) return false
      const ech = ECHELONS[u.echelon]
      if (ech && minEchelon > 0 && ech.weight < minEchelon) return false
      if (scope === 'selected-conflict') {
        if (!selectedConflict?.id) return false
        if (u.conflict !== selectedConflict.id) return false
      }
      if (q) {
        const hay = `${u.name} ${u.formation || ''} ${u.note || ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [data, sides, kindFilter, minEchelon, scope, selectedConflict, search])

  /* Per-side tallies drive the side-chip counters. Computed over full
     dataset (not filtered) so flipping a side off doesn't zero its chip. */
  const sideCounts = useMemo(() => {
    const out = { A: 0, B: 0 }
    if (!data) return out
    data.forEach((u) => { out[u.side] = (out[u.side] || 0) + 1 })
    return out
  }, [data])

  const kindCounts = useMemo(() => {
    const out = { all: 0 }
    if (!data) return out
    data.forEach((u) => {
      out.all += 1
      const k = UNIT_TYPES[u.type]?.kind
      if (k) out[k] = (out[k] || 0) + 1
    })
    return out
  }, [data])

  /* Group visible units by side then echelon so the strategic-grade
     formations float to the top of each side. */
  const grouped = useMemo(() => {
    const bySide = { A: [], B: [] }
    visible.forEach((u) => {
      if (bySide[u.side]) bySide[u.side].push(u)
    })
    // Sort by echelon weight desc, then name asc.
    Object.keys(bySide).forEach((k) => {
      bySide[k].sort((a, b) => {
        const wa = ECHELONS[a.echelon]?.weight || 0
        const wb = ECHELONS[b.echelon]?.weight || 0
        if (wb !== wa) return wb - wa
        return a.name.localeCompare(b.name, 'tr')
      })
    })
    return bySide
  }, [visible])

  // Resolve side labels from currently-selected conflict so the
  // grouped-list headers say "Rusya" instead of "Taraf A" when drilled in.
  const sideLabels = useMemo(() => {
    if (!selectedConflict) return null
    return {
      A: selectedConflict.sideLabels?.A || CONFLICT_SIDE_DEFAULT_LABEL.A,
      B: selectedConflict.sideLabels?.B || CONFLICT_SIDE_DEFAULT_LABEL.B,
    }
  }, [selectedConflict])

  return (
    <div className="px-3 py-2">
      {/* Master toggle */}
      <button
        onClick={toggle}
        className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-md border transition-colors ${
          on
            ? 'bg-amber-400/10 border-amber-400/40 text-amber-200'
            : 'bg-ops-900/40 border-ops-600 text-ops-200 hover:border-ops-500'
        }`}
      >
        <Swords size={13} />
        <span className="text-[11px] font-semibold uppercase tracking-wider flex-1 text-left">
          {FORCE_SECTION_LABEL_SHORT}
        </span>
        <span className="text-[10px] font-mono">{on ? 'AKTİF' : 'KAPALI'}</span>
      </button>

      {on && (
        <>
          {/* ── Scope toggle ─────────────────────────────────────
              "Tümü" = every seeded formation; "Seçili çatışma" = only
              units tagged with the currently-open conflict. The second
              button is disabled when no conflict is selected so the
              operator doesn't end up staring at an empty map. */}
          <div className="mt-2 grid grid-cols-2 gap-1">
            <button
              onClick={() => setScope('all')}
              className={`flex items-center justify-center gap-1 text-[10px] font-mono px-1.5 py-1 rounded border transition-colors ${
                scope === 'all'
                  ? 'bg-ops-600 text-ops-50 border-ops-500'
                  : 'bg-ops-800/60 text-ops-300 border-ops-700 hover:border-ops-500'
              }`}
              title="Tüm tiyatrolardaki birlikleri göster"
            >
              <Target size={10} /> Tümü
            </button>
            <button
              onClick={() => setScope('selected-conflict')}
              disabled={!selectedConflict}
              className={`flex items-center justify-center gap-1 text-[10px] font-mono px-1.5 py-1 rounded border transition-colors ${
                scope === 'selected-conflict' && selectedConflict
                  ? 'bg-ops-600 text-ops-50 border-ops-500'
                  : selectedConflict
                    ? 'bg-ops-800/60 text-ops-300 border-ops-700 hover:border-ops-500'
                    : 'bg-ops-900/30 text-ops-600 border-ops-800 cursor-not-allowed'
              }`}
              title={selectedConflict ? 'Yalnızca seçili çatışmadaki birlikler' : 'Önce bir çatışma seç'}
            >
              <Crosshair size={10} /> Seçili
            </button>
          </div>

          {/* ── Side chips A / B ─────────────────────────────────
              Colour-tinted so the operator reads "steel-blue = Taraf A /
              brick-red = Taraf B" without a legend lookup. If a conflict
              is selected, show the real side names in the tooltips. */}
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[10px] font-mono text-ops-500 uppercase tracking-wider">Taraf</span>
          </div>
          <div className="mt-1 grid grid-cols-2 gap-1">
            {['A', 'B'].map((side) => {
              const active = sides.has(side)
              const colour = FORCE_SIDE_COLOUR[side]
              const label = sideLabels?.[side] || (side === 'A' ? 'Taraf A' : 'Taraf B')
              const count = sideCounts[side] || 0
              return (
                <button
                  key={side}
                  onClick={() => toggleSide(side)}
                  title={label}
                  className={`flex items-center gap-1.5 text-[10px] font-mono px-1.5 py-1 rounded border transition-all ${
                    active ? '' : 'opacity-40'
                  }`}
                  style={{
                    borderColor: active ? colour : '#2A3F5A',
                    background:  active ? `${colour}22` : 'transparent',
                    color:       active ? colour : '#6A7F9F',
                  }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ background: colour }}
                  />
                  <span className="truncate flex-1 text-left">{label}</span>
                  <span className="opacity-70">{count}</span>
                </button>
              )
            })}
          </div>

          {/* ── Kind chips ───────────────────────────────────────
              Single-select; mutes whole branch categories without
              per-type surgery. "Tümü" is first for the escape hatch. */}
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[10px] font-mono text-ops-500 uppercase tracking-wider">Sınıf</span>
          </div>
          <div className="mt-1 flex gap-1 flex-wrap">
            {UNIT_KINDS.map((k) => {
              const active = kindFilter === k.id
              const count = k.id === 'all' ? (kindCounts.all || 0) : (kindCounts[k.id] || 0)
              return (
                <button
                  key={k.id}
                  onClick={() => setKind(k.id)}
                  className={`text-[10px] font-mono px-1.5 py-0.5 rounded border transition-colors ${
                    active
                      ? 'bg-ops-600 text-ops-50 border-ops-500'
                      : 'bg-ops-800/60 text-ops-300 border-ops-700 hover:border-ops-500'
                  }`}
                  style={active ? { borderColor: k.color, color: k.color, background: `${k.color}22` } : {}}
                >
                  {k.label} <span className="opacity-70">· {count}</span>
                </button>
              )
            })}
          </div>

          {/* ── Echelon minimum slider ───────────────────────────
              0 = show everything; 5 = only army-grade and up. Label
              printed next to the slider so "3" isn't a bare number. */}
          <div className="mt-3 pt-2 border-t border-ops-700/50">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-mono text-ops-500 uppercase tracking-wider">
                Min. kademe
              </span>
              <span className="text-[10px] font-mono text-ops-200">
                {echelonLabelForMin(minEchelon)}
              </span>
            </div>
            <input
              type="range" min={0} max={5} step={1}
              value={minEchelon}
              onChange={(e) => setMinEchelon(Number(e.target.value))}
              className="range-slider w-full"
              style={{
                background: `linear-gradient(to right, #E0A42C 0%, #E0A42C ${(minEchelon / 5) * 100}%, #1E3050 ${(minEchelon / 5) * 100}%, #1E3050 100%)`
              }}
            />
            <div className="flex justify-between text-[9px] font-mono text-ops-600 mt-0.5">
              <span>hepsi</span>
              <span>tabur</span>
              <span>tugay</span>
              <span>tümen</span>
              <span>kolordu</span>
              <span>ordu</span>
            </div>
          </div>

          {/* ── Search ──────────────────────────────────────────
              name + formation + note all fold into the haystack so
              "58 Kombine", "Pasdaran" or "Radwan" all hit. */}
          <div className="mt-2 relative">
            <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-ops-500 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Ara: 58. Ordu, Radwan, IRGC…"
              className="w-full pl-7 pr-7 py-1 rounded border border-ops-600 bg-ops-900/40 text-[11px] text-ops-100 placeholder-ops-500 font-mono focus:outline-none focus:border-amber-400/60"
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

          {/* ── Grouped unit list ──────────────────────────────── */}
          {listOpen && (
            <div className="mt-1 max-h-72 overflow-y-auto pr-0.5 space-y-2">
              {visible.length === 0 && data && (
                <p className="text-[10px] font-mono text-ops-500 text-center py-3">
                  Filtreye uyan birlik bulunamadı.
                </p>
              )}
              {['A', 'B'].map((side) => {
                const arr = grouped[side]
                if (!arr || arr.length === 0) return null
                const colour = FORCE_SIDE_COLOUR[side]
                const label = sideLabels?.[side] || (side === 'A' ? 'Taraf A' : 'Taraf B')
                return (
                  <div key={side}>
                    <div
                      className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider px-1 mb-0.5"
                      style={{ color: colour }}
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ background: colour, boxShadow: `0 0 0 2px ${colour}22` }}
                      />
                      <span className="truncate">{label}</span>
                      <span className="ml-auto text-ops-500">{arr.length}</span>
                    </div>
                    <div className="space-y-0.5">
                      {arr.map((u) => (
                        <UnitRow
                          key={u.id}
                          unit={u}
                          isHot={u.id === hoveredId || u.id === selected?.id}
                          onHover={setHovered}
                          onPick={(un) => {
                            selectUnit(un)
                            if (typeof un.lat === 'number' && typeof un.lng === 'number') {
                              flyToPoint(un.lat, un.lng, 8)
                            }
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* ── Düşman Analitiği (Threat + Kill-Chain) ──────────
              İki kart: "Tehdit kubbeleri" (mor) ve "Komuta zinciri"
              (kızıl). Aynı güdülerden beslenir ama farklı soruları
              cevaplar: birincisi "kimden uzak duralım?", ikincisi
              "kimi vurursak kafasız kalırlar?". Kartlar kapalıyken
              sadece header + toggle durur; açıkken detay inflate eder. */}
          <div className="tairos-analytics-block">
            <div className="tairos-analytics-header">
              <Zap size={11} className="text-amber-300" />
              <span>DÜŞMAN ANALİTİĞİ</span>
              <span className="tairos-analytics-sub">// tehdit + komuta</span>
            </div>

            {/* ── KART 1: Tehdit Projeksiyonu ───────────────── */}
            <div className={`tairos-analytics-card threat ${threatOn ? 'is-on' : ''}`}>
              <button
                onClick={toggleThreat}
                className="tairos-analytics-card-toggle"
                aria-pressed={threatOn}
              >
                <span className="tairos-analytics-card-icon">
                  <Radar size={12} />
                </span>
                <span className="tairos-analytics-card-title">
                  Tehdit projeksiyonu
                  <span className="tairos-analytics-card-sub">düşman etki halkaları</span>
                </span>
                <span className={`tairos-analytics-card-status ${threatOn ? 'is-on' : ''}`}>
                  {threatOn ? 'AÇIK' : 'KAPALI'}
                </span>
              </button>

              {threatOn && (
                <div className="tairos-analytics-card-body">
                  {/* Style chips */}
                  <div className="tairos-analytics-section">
                    <span className="tairos-analytics-section-label">STİL</span>
                    <div className="flex gap-1 flex-wrap">
                      {THREAT_STYLE_ORDER.map((styleId) => {
                        const st = THREAT_STYLES[styleId]
                        const active = threatStyles.has(styleId)
                        return (
                          <button
                            key={styleId}
                            onClick={() => toggleThreatStyle(styleId)}
                            title={st.label}
                            className={`tairos-analytics-chip ${active ? 'is-on' : ''}`}
                            style={{
                              borderColor: active ? st.color : '#2A3F5A',
                              background:  active ? `${st.color}1F` : 'transparent',
                              color:       active ? st.color : '#6A7F9F',
                            }}
                          >
                            <span
                              className="tairos-analytics-chip-dot"
                              style={{ background: active ? st.color : '#3A4A60' }}
                            />
                            {st.short}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Intensity slider */}
                  <div className="tairos-analytics-section">
                    <div className="flex items-center justify-between mb-1">
                      <span className="tairos-analytics-section-label">YOĞUNLUK</span>
                      <span className="text-[9.5px] font-mono text-purple-200 tabular-nums">
                        {Math.round(threatIntensity * 100)}%
                      </span>
                    </div>
                    <input
                      type="range" min={0.1} max={1} step={0.05}
                      value={threatIntensity}
                      onChange={(e) => setThreatIntensity(Number(e.target.value))}
                      className="range-slider w-full"
                      style={{
                        background: `linear-gradient(to right, #A084E8 0%, #A084E8 ${threatIntensity * 100}%, #1E3050 ${threatIntensity * 100}%, #1E3050 100%)`
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* ── KART 2: Komuta Zinciri ────────────────────── */}
            <div className={`tairos-analytics-card killchain ${killChainOn ? 'is-on' : ''}`}>
              <button
                onClick={toggleKillChain}
                className="tairos-analytics-card-toggle"
                aria-pressed={killChainOn}
              >
                <span className="tairos-analytics-card-icon">
                  <Network size={12} />
                </span>
                <span className="tairos-analytics-card-title">
                  Komuta zinciri
                  <span className="tairos-analytics-card-sub">HQ → bağlı birimler</span>
                </span>
                <span className={`tairos-analytics-card-status ${killChainOn ? 'is-on' : ''}`}>
                  {killChainOn ? 'AÇIK' : 'KAPALI'}
                </span>
              </button>

              {killChainOn && (
                <div className="tairos-analytics-card-body">
                  <div className={`tairos-analytics-kc-hint ${selected?.type === 'hq' ? 'is-active' : ''}`}>
                    {selected?.type === 'hq'
                      ? <>
                          <span className="tairos-analytics-kc-dot" />
                          <div className="min-w-0">
                            <div className="text-[9px] font-mono text-ops-500 uppercase tracking-wider">Seçili KRG</div>
                            <div className="text-[10.5px] text-rose-200 truncate">{selected.name}</div>
                          </div>
                        </>
                      : <>
                          <span className="tairos-analytics-kc-dot is-empty" />
                          <div className="text-[10px] text-ops-400 leading-snug">
                            Listeden bir <span className="text-rose-300">★ KRG</span> seç → bağlı birimler çizgiyle görünür.
                          </div>
                        </>}
                  </div>

                  <div className="tairos-analytics-section">
                    <div className="flex items-center justify-between mb-1">
                      <span className="tairos-analytics-section-label">YEDEK MESAFE</span>
                      <span className="text-[9.5px] font-mono text-rose-200 tabular-nums">
                        {killChainRange} km
                      </span>
                    </div>
                    <input
                      type="range" min={50} max={1500} step={50}
                      value={killChainRange}
                      onChange={(e) => setKillChainRange(Number(e.target.value))}
                      className="range-slider w-full"
                      style={{
                        background: `linear-gradient(to right, #C04631 0%, #C04631 ${((killChainRange - 50) / 1450) * 100}%, #1E3050 ${((killChainRange - 50) / 1450) * 100}%, #1E3050 100%)`
                      }}
                    />
                    <p className="mt-1 text-[9px] font-mono text-ops-600 leading-snug">
                      İsim/parent eşleşmesi yoksa aynı-taraf birimleri bu mesafeye kadar tarar.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Footer hint ─────────────────────────────────── */}
          <p className="mt-2 text-[10px] font-mono text-ops-500 leading-snug">
            💡 Kademe ne kadar büyükse chip o kadar büyür; uzakta tabur/alay gizlenir.
          </p>
        </>
      )}
    </div>
  )
}

/**
 * Same conflict-keyed → flat-array conversion the layer uses. Kept as
 * a local copy so the two components don't need an extra shared util.
 */
function flattenForceData(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  const out = []
  Object.keys(raw).forEach((conflictId) => {
    const arr = raw[conflictId]
    if (!Array.isArray(arr)) return
    arr.forEach((u) => {
      if (!u) return
      out.push({ ...u, conflict: u.conflict || conflictId })
    })
  })
  return out
}

/* Echelon weight → label for the min-echelon slider. */
function echelonLabelForMin(n) {
  if (n <= 0) return 'tüm kademeler'
  // Closest echelon at-or-above the given weight.
  const match = ECHELON_ORDER
    .map((k) => ECHELONS[k])
    .filter((e) => e.weight >= n)
    .sort((a, b) => a.weight - b.weight)[0]
  return match ? `${match.label}+` : 'yüksek'
}

function UnitRow({ unit, isHot, onHover, onPick }) {
  const type = UNIT_TYPES[unit.type]
  const ech  = ECHELONS[unit.echelon]
  const colour = FORCE_SIDE_COLOUR[unit.side] || FORCE_SIDE_COLOUR.A
  if (!type) return null
  return (
    <button
      onMouseEnter={() => onHover(unit.id)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onPick(unit)}
      title={`${unit.name} — ${type.label} · ${ech?.label || ''}${unit.formation ? ` · ${unit.formation}` : ''}`}
      className={`w-full flex items-center gap-1.5 px-1.5 py-1 rounded border-l-2 transition-colors text-left ${
        isHot
          ? 'bg-ops-700/60 text-ops-50'
          : 'bg-ops-900/30 text-ops-200 hover:bg-ops-800/60 hover:text-ops-50'
      }`}
      style={{ borderLeftColor: colour }}
    >
      <span
        className="shrink-0 inline-flex items-center justify-center w-4 h-4 rounded text-[10px]"
        style={{
          background: `${type.color}22`,
          color: type.color,
          fontFamily: "'Segoe UI Symbol','Apple Symbols',sans-serif",
        }}
      >
        {type.glyph}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[11px] truncate leading-tight">{unit.name}</span>
        <span className="block text-[9px] font-mono text-ops-500 truncate">
          {type.short} · {ech?.short || '—'}{unit.formation ? ` · ${unit.formation}` : ''}
        </span>
      </span>
      {ech?.pips && (
        <span
          className="shrink-0 text-[9px] font-mono tracking-tighter"
          style={{ color: colour, opacity: 0.7 }}
          aria-hidden
        >
          {ech.pips}
        </span>
      )}
    </button>
  )
}
