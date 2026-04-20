import React, { useEffect, useMemo, useState } from 'react'
import useStore from '../store/useStore'
import {
  THREAT_STYLES,
  THREAT_STYLE_ORDER,
  THREAT_PROFILES,
  resolveSamSystem,
  FORCE_SIDE_COLOUR,
} from '../config/forceDeployments'
import { Radar, Network, ChevronDown, ChevronUp } from 'lucide-react'

/**
 * Düşman Analitiği Lejant'ı — harita sağ altında duran kompakt bir
 * overlay. "Ne görüyorum?" sorusuna bakışta cevap verir:
 *
 *   • Hangi tehdit stilleri aktif? (SAM/HAV/DNZ/…)
 *   • Her stil için kaç birim halkada?
 *   • Hangi taraflar görünür? (A: çelik mavi, B: tuğla)
 *   • Komuta zinciri aktif mi? Hangi HQ?
 *
 * Yalnızca `threatProjectionOn` veya `killChainOn` true olduğunda
 * render edilir — kapalıyken haritayı kirletmez. Collapsible — yoğun
 * haritada tek satıra çöker, operatör "C" (chevron) tıklayarak açar.
 *
 * Tüm hesaplar buradan — LayerLerin görsel değişkenleri (intensity
 * vb.) bu widget'ı etkilemez; sadece aynı store üzerinden okur.
 */
export default function ThreatLegend() {
  const threatOn     = useStore((s) => s.threatProjectionOn)
  const killChainOn  = useStore((s) => s.killChainOn)
  const sides        = useStore((s) => s.threatProjectionSides)
  const stylesFilter = useStore((s) => s.threatProjectionStyles)
  const scope        = useStore((s) => s.forceDeployScope)
  const selectedConflict = useStore((s) => s.selectedConflict)
  const selected     = useStore((s) => s.selectedDeployUnit)

  const [collapsed, setCollapsed] = useState(false)
  const [data, setData] = useState(null)

  /* Lazy-load the same seed — cached via Vite chunk, cost ~0 after
     the first loader already pulled it. */
  useEffect(() => {
    if (!threatOn && !killChainOn) return
    if (data) return
    let cancelled = false
    import('../data/forceDeployments.json').then((mod) => {
      if (cancelled) return
      const raw = mod.default
      const flat = []
      if (Array.isArray(raw)) flat.push(...raw)
      else Object.keys(raw).forEach((k) => {
        const arr = raw[k]
        if (!Array.isArray(arr)) return
        arr.forEach((u) => { if (u) flat.push({ ...u, conflict: u.conflict || k }) })
      })
      setData(flat)
    }).catch(() => { if (!cancelled) setData([]) })
    return () => { cancelled = true }
  }, [threatOn, killChainOn, data])

  /* Per-style counts of rendered threats. Respects the same filters
     the layer uses so the numbers here match what's on the map. */
  const styleCounts = useMemo(() => {
    const zero = { sam:0, air:0, naval:0, fires:0, special:0, ground:0 }
    if (!data || !threatOn) return zero
    const out = { ...zero }
    data.forEach((u) => {
      if (!sides.has(u.side)) return
      if (scope === 'selected-conflict') {
        if (!selectedConflict?.id) return
        if (u.conflict !== selectedConflict.id) return
      }
      const prof = THREAT_PROFILES[u.type]
      if (!prof || prof.style === 'passive') return
      if (!stylesFilter.has(prof.style)) return
      out[prof.style] = (out[prof.style] || 0) + 1
    })
    return out
  }, [data, threatOn, sides, scope, selectedConflict, stylesFilter])

  /* Named SAM roster — if threats are on and any airdef units resolve
     to real systems, list the top 5 longest-range ones. Gives the
     operator a "these are the big rings you're seeing" anchor. */
  const namedSams = useMemo(() => {
    if (!data || !threatOn || !stylesFilter.has('sam')) return []
    const seen = new Map()
    data.forEach((u) => {
      if (u.type !== 'airdef') return
      if (!sides.has(u.side)) return
      if (scope === 'selected-conflict' && u.conflict !== selectedConflict?.id) return
      const sam = resolveSamSystem(u)
      if (!sam) return
      if (!seen.has(sam.label) || seen.get(sam.label).rangeKm < sam.rangeKm) {
        seen.set(sam.label, sam)
      }
    })
    return Array.from(seen.values()).sort((a, b) => b.rangeKm - a.rangeKm).slice(0, 5)
  }, [data, threatOn, sides, stylesFilter, scope, selectedConflict])

  if (!threatOn && !killChainOn) return null

  const totalThreats = Object.values(styleCounts).reduce((a, b) => a + b, 0)

  return (
    <div className="tairos-threat-legend">
      {/* Header — always visible, click to collapse */}
      <button
        className="tairos-threat-legend-header"
        onClick={() => setCollapsed((v) => !v)}
        title={collapsed ? 'Lejant\'ı aç' : 'Lejant\'ı daralt'}
      >
        <span className="tairos-threat-legend-title">
          <span className="tairos-threat-legend-dot" />
          DÜŞMAN ANALİTİĞİ
        </span>
        <span className="tairos-threat-legend-meta">
          {threatOn && <span>{totalThreats} tehdit</span>}
          {threatOn && killChainOn && <span className="tairos-threat-legend-sep">·</span>}
          {killChainOn && <span>komuta</span>}
        </span>
        {collapsed
          ? <ChevronUp   size={11} className="opacity-60" />
          : <ChevronDown size={11} className="opacity-60" />}
      </button>

      {!collapsed && (
        <div className="tairos-threat-legend-body">
          {/* Side colour key */}
          <div className="tairos-threat-legend-row">
            <span className="tairos-threat-legend-label">TARAF</span>
            <div className="tairos-threat-legend-chips">
              {['A', 'B'].map((sideId) => {
                const active = sides.has(sideId)
                return (
                  <span
                    key={sideId}
                    className={`tairos-threat-legend-side ${active ? '' : 'is-off'}`}
                    style={{
                      borderColor: FORCE_SIDE_COLOUR[sideId],
                      color:       FORCE_SIDE_COLOUR[sideId],
                    }}
                  >
                    <span
                      className="tairos-threat-legend-side-dot"
                      style={{ background: FORCE_SIDE_COLOUR[sideId] }}
                    />
                    {sideId}
                  </span>
                )
              })}
            </div>
          </div>

          {/* Style key with counts */}
          {threatOn && (
            <div className="tairos-threat-legend-row">
              <span className="tairos-threat-legend-label">
                <Radar size={9} style={{ marginRight: 3, marginTop: -1, display: 'inline-block', verticalAlign: 'middle' }} />
                TEHDİT
              </span>
              <div className="tairos-threat-legend-chips">
                {THREAT_STYLE_ORDER.map((styleId) => {
                  const st = THREAT_STYLES[styleId]
                  const count = styleCounts[styleId] || 0
                  const active = stylesFilter.has(styleId) && count > 0
                  if (!active && count === 0) return null
                  return (
                    <span
                      key={styleId}
                      className={`tairos-threat-legend-style ${active ? '' : 'is-off'}`}
                      title={`${st.label}${count ? ` — ${count} birim` : ' (filtre kapalı)'}`}
                      style={{
                        borderColor: active ? st.color : '#2A3F5A',
                        color:       active ? st.color : '#4A5A70',
                        background:  active ? `${st.color}14` : 'transparent',
                      }}
                    >
                      <span
                        className="tairos-threat-legend-style-dot"
                        style={{ background: active ? st.color : '#3A4A60' }}
                      />
                      {st.short}
                      {count > 0 && (
                        <span className="tairos-threat-legend-count">{count}</span>
                      )}
                    </span>
                  )
                })}
              </div>
            </div>
          )}

          {/* Named SAM roster */}
          {threatOn && namedSams.length > 0 && (
            <div className="tairos-threat-legend-row">
              <span className="tairos-threat-legend-label">HVS</span>
              <div className="tairos-threat-legend-sams">
                {namedSams.map((sam) => (
                  <span key={sam.label} className="tairos-threat-legend-sam">
                    <span className="tairos-threat-legend-sam-name">{sam.label}</span>
                    <span className="tairos-threat-legend-sam-range">{sam.rangeKm} km</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Kill-chain context */}
          {killChainOn && (
            <div className="tairos-threat-legend-row">
              <span className="tairos-threat-legend-label">
                <Network size={9} style={{ marginRight: 3, marginTop: -1, display: 'inline-block', verticalAlign: 'middle' }} />
                KOMUTA
              </span>
              <div className="tairos-threat-legend-kc">
                {selected?.type === 'hq'
                  ? <span className="tairos-threat-legend-kc-active">
                      <span className="tairos-threat-legend-kc-dot" />
                      {selected.name}
                    </span>
                  : <span className="tairos-threat-legend-kc-hint">
                      Bir karargâh seç
                    </span>}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
