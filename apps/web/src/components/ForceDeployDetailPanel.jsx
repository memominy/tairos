import React, { useEffect, useMemo, useState } from 'react'
import {
  X, MapPin, Navigation, Network, Radar, Radio, ShieldAlert,
  ChevronRight, ArrowUpRight, Crosshair, Info, Anchor, Target,
} from 'lucide-react'
import useStore from '../store/useStore'
import {
  UNIT_TYPES,
  ECHELONS,
  FORCE_SIDE_COLOUR,
  THREAT_PROFILES,
  THREAT_STYLES,
  resolveSamSystem,
} from '../config/forceDeployments'
import { CONFLICT_SIDE_DEFAULT_LABEL } from '../config/conflictAssets'

/**
 * Force Deployment Detail Panel — right-edge slide-in.
 *
 * Opens whenever `selectedDeployUnit` is set (i.e. operator clicks any
 * force-deploy chip on the map). Replaces the old small Leaflet popup
 * with a full intel card that answers the five questions operators
 * actually ask of a formation:
 *
 *   1. Who is this?              — side, type, echelon, formation name
 *   2. What can it hit?          — threat profile + named SAM resolution
 *   3. Who commands it?          — parentId lookup (clickable)
 *   4. What does it command?     — subordinates list (clickable)
 *   5. What do I do next?        — fly-to / kill-chain / threat-dome actions
 *
 * Data: lazy-imports `forceDeployments.json` (chunk already in cache
 * after the map layer loaded it) so parent/subordinates lookup works
 * even if the user clicks the unit via a ring or legend entry.
 *
 * Sits at zIndex 1180 — below ConflictDetailPanel (1200) so a still-open
 * conflict panel stays on top, but above every map chrome widget.
 */
export default function ForceDeployDetailPanel() {
  const selected         = useStore((s) => s.selectedDeployUnit)
  const selectedConflict = useStore((s) => s.selectedConflict)
  const killChainOn      = useStore((s) => s.killChainOn)
  const threatOn         = useStore((s) => s.threatProjectionOn)
  const forceDeployOn    = useStore((s) => s.forceDeployOn)
  const mapZoom          = useStore((s) => s.mapZoom)

  const selectUnit       = useStore((s) => s.selectDeployUnit)
  const clearUnit        = useStore((s) => s.clearDeployUnit)
  const setHovered       = useStore((s) => s.setHoveredDeployUnit)
  const setKillChainOn   = useStore((s) => s.setKillChainOn)
  const setThreatOn      = useStore((s) => s.setThreatProjectionOn)
  const setForceDeployOn = useStore((s) => s.setForceDeployOn)
  const flyToPoint       = useStore((s) => s.flyToPoint)

  const [data, setData] = useState(null)

  // Lazy-load the force dataset so parent/subordinate lookups work.
  // The chunk is already in Vite's module cache after ForceDeploymentLayer
  // pulled it, so this is essentially free on re-open.
  useEffect(() => {
    if (!selected) return
    if (data) return
    let cancelled = false
    import('../data/forceDeployments.json').then((mod) => {
      if (cancelled) return
      setData(flattenForceData(mod.default))
    }).catch(() => { if (!cancelled) setData([]) })
    return () => { cancelled = true }
  }, [selected, data])

  // Toggle focus-mode body class while a unit is selected — lets CSS dim
  // every non-focused marker on the map so the reader's eye locks onto
  // the one unit the panel is about. Cleaned up on unmount / deselect so
  // we don't leak the dim state after a deselect.
  useEffect(() => {
    if (!selected) {
      document.body.classList.remove('tairos-deploy-focus')
      return
    }
    document.body.classList.add('tairos-deploy-focus')
    return () => document.body.classList.remove('tairos-deploy-focus')
  }, [selected])

  // Parent HQ — either by explicit parentId, or by name-substring fallback.
  const parentUnit = useMemo(() => {
    if (!selected || !data) return null
    if (selected.parentId) {
      const p = data.find((u) => u.id === selected.parentId)
      if (p) return p
    }
    // Name-substring fallback (mirrors KillChainLayer's resolver so the
    // panel's "Üst birlik" matches what the chain actually renders).
    if (selected.formation) {
      const key = selected.formation.toLowerCase()
      const p = data.find((u) =>
        u.type === 'hq' &&
        u.side === selected.side &&
        u.conflict === selected.conflict &&
        u.id !== selected.id &&
        key.length >= 4 &&
        (u.name.toLowerCase().includes(key) || key.includes(u.name.toLowerCase()))
      )
      if (p) return p
    }
    return null
  }, [selected, data])

  // Direct subordinates — parentId-first, with an optional name-substring
  // pass so HQs whose seed data doesn't wire parentId still show chains.
  const subordinates = useMemo(() => {
    if (!selected || !data) return []
    const out = new Map()
    data.forEach((u) => {
      if (u.id === selected.id) return
      if (u.side !== selected.side) return
      if (u.conflict !== selected.conflict) return
      if (u.parentId === selected.id) out.set(u.id, u)
    })
    if (selected.type === 'hq' && out.size === 0) {
      const keys = [selected.name, selected.formation]
        .filter((s) => s && s.length >= 4)
        .map((s) => s.toLowerCase())
      if (keys.length) {
        data.forEach((u) => {
          if (u.id === selected.id) return
          if (u.side !== selected.side) return
          if (u.conflict !== selected.conflict) return
          const hay = `${u.formation || ''} ${u.note || ''}`.toLowerCase()
          if (keys.some((k) => hay.includes(k))) out.set(u.id, u)
        })
      }
    }
    return Array.from(out.values())
      .sort((a, b) => (weightOf(b) - weightOf(a)) || a.name.localeCompare(b.name))
      .slice(0, 12)  // cap — if you've got 30+ subs, this is a chain viewer not a card
  }, [selected, data])

  if (!selected) return null

  const type = UNIT_TYPES[selected.type]
  const ech  = ECHELONS[selected.echelon] || ECHELONS.battalion
  const prof = THREAT_PROFILES[selected.type]
  const sam  = selected.type === 'airdef' ? resolveSamSystem(selected) : null
  const style = THREAT_STYLES[prof?.style]
  const sideColour = FORCE_SIDE_COLOUR[selected.side] || '#888'
  const threatRangeKm = (selected.threatKm && Number(selected.threatKm))
                     || sam?.rangeKm
                     || prof?.rangeKm
                     || 0

  // Resolve taraf display name from the currently-selected conflict.
  // If user navigated here without an active conflict context, fall back
  // to the generic "Taraf A / Taraf B" defaults.
  const sideLabels = selectedConflict?.id === selected.conflict
    ? {
        A: selectedConflict?.sideLabels?.A || CONFLICT_SIDE_DEFAULT_LABEL.A,
        B: selectedConflict?.sideLabels?.B || CONFLICT_SIDE_DEFAULT_LABEL.B,
      }
    : CONFLICT_SIDE_DEFAULT_LABEL
  const sideName = selected.side === 'A' ? sideLabels.A : sideLabels.B

  const flyTo = () => {
    flyToPoint(selected.lat, selected.lng, Math.max(mapZoom || 0, 8))
  }

  const focusCommand = () => {
    if (selected.type !== 'hq') return
    if (!forceDeployOn) setForceDeployOn(true)
    setKillChainOn(true)
    flyTo()
  }

  const focusThreat = () => {
    if (!prof || prof.style === 'passive') return
    if (!forceDeployOn) setForceDeployOn(true)
    setThreatOn(true)
    flyTo()
  }

  const jumpTo = (u) => {
    selectUnit(u)
    flyToPoint(u.lat, u.lng, Math.max(mapZoom || 0, 8))
  }

  return (
    <div
      className="tairos-force-detail absolute right-0 top-0 bottom-0 slide-right-enter"
      style={{ '--side-color': sideColour, '--unit-color': type?.color || '#888' }}
    >
      {/* Classification ribbon */}
      <div className="tairos-force-detail-ribbon">
        <span>// KUVVET KONUŞLANMASI //</span>
        <span className="tairos-force-detail-ribbon-sep">OSINT · KOMPOZIT</span>
        <span className="tairos-force-detail-ribbon-side">
          <span className="tairos-force-detail-ribbon-side-dot" />
          {selected.side === 'A' ? 'TARAF A' : 'TARAF B'}
        </span>
        <button
          onClick={clearUnit}
          className="tairos-force-detail-close"
          title="Kapat"
        >
          <X size={11} />
        </button>
      </div>

      {/* Header */}
      <div className="tairos-force-detail-header">
        <div className="tairos-force-detail-shield">
          <span className="tairos-force-detail-shield-pips">{ech.pips}</span>
          <span className="tairos-force-detail-shield-glyph">{type?.glyph || '?'}</span>
        </div>
        <div className="tairos-force-detail-titles">
          <div className="tairos-force-detail-side-name">{sideName}</div>
          <div className="tairos-force-detail-name" title={selected.name}>
            {selected.name}
          </div>
          <div className="tairos-force-detail-meta">
            <span className="tairos-force-detail-chip" style={{ color: type?.color }}>
              <span className="tairos-force-detail-chip-dot" style={{ background: type?.color }} />
              {type?.label || selected.type}
            </span>
            <span className="tairos-force-detail-sep">·</span>
            <span className="tairos-force-detail-chip-echelon">
              {ech.label}
            </span>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="tairos-force-detail-body">

        {/* Formation */}
        {selected.formation && (
          <Row label="ÜST FORMASYON" icon={Network}>
            <div className="tairos-force-detail-formation">{selected.formation}</div>
          </Row>
        )}

        {/* Named SAM system (airdef only) */}
        {sam && (
          <Row label="HVS SİSTEMİ" icon={Radar} accent={THREAT_STYLES.sam.color}>
            <div className="tairos-force-detail-sam">
              <div className="tairos-force-detail-sam-name">{sam.label}</div>
              <div className="tairos-force-detail-sam-range">
                <span className="tairos-force-detail-sam-range-val">{sam.rangeKm}</span>
                <span className="tairos-force-detail-sam-range-unit">km</span>
                <span className="tairos-force-detail-sam-range-sub">angaje menzili</span>
              </div>
            </div>
          </Row>
        )}

        {/* Threat profile */}
        {prof && prof.style !== 'passive' && threatRangeKm > 0 && (
          <Row label="TEHDİT PROFİLİ" icon={ShieldAlert} accent={style?.color}>
            <div className="tairos-force-detail-threat">
              <span
                className="tairos-force-detail-threat-chip"
                style={{
                  borderColor: `${style?.color}66`,
                  color: style?.color,
                  background: `${style?.color}14`,
                }}
              >
                <span
                  className="tairos-force-detail-threat-chip-dot"
                  style={{ background: style?.color }}
                />
                {style?.label}
              </span>
              {!sam && (
                <span className="tairos-force-detail-threat-range">
                  {threatRangeKm}
                  <span className="tairos-force-detail-threat-range-unit"> km</span>
                </span>
              )}
            </div>
            <div className="tairos-force-detail-threat-desc">{prof.label}</div>
          </Row>
        )}

        {/* Parent HQ */}
        {parentUnit && (
          <Row label="ÜST BİRLİK" icon={ArrowUpRight}>
            <button
              className="tairos-force-detail-link"
              onClick={() => jumpTo(parentUnit)}
              onMouseEnter={() => setHovered(parentUnit.id)}
              onMouseLeave={() => setHovered(null)}
              title="Karargâha geç"
            >
              <span className="tairos-force-detail-link-glyph">
                {UNIT_TYPES[parentUnit.type]?.glyph || '★'}
              </span>
              <span className="tairos-force-detail-link-body">
                <span className="tairos-force-detail-link-name">{parentUnit.name}</span>
                <span className="tairos-force-detail-link-meta">
                  {UNIT_TYPES[parentUnit.type]?.label}
                  <span className="tairos-force-detail-sep">·</span>
                  {ECHELONS[parentUnit.echelon]?.label}
                </span>
              </span>
              <ChevronRight size={11} className="tairos-force-detail-link-arrow" />
            </button>
          </Row>
        )}

        {/* Subordinates */}
        {subordinates.length > 0 && (
          <Row label={`ASTLAR · ${subordinates.length}`} icon={ChevronRight}>
            <div className="tairos-force-detail-subs">
              {subordinates.map((u) => {
                const t = UNIT_TYPES[u.type]
                const e = ECHELONS[u.echelon]
                return (
                  <button
                    key={u.id}
                    className="tairos-force-detail-sub"
                    onClick={() => jumpTo(u)}
                    onMouseEnter={() => setHovered(u.id)}
                    onMouseLeave={() => setHovered(null)}
                    title={`${t?.label || u.type} · ${e?.label || ''}`}
                  >
                    <span
                      className="tairos-force-detail-sub-glyph"
                      style={{ color: t?.color }}
                    >
                      {t?.glyph || '•'}
                    </span>
                    <span className="tairos-force-detail-sub-body">
                      <span className="tairos-force-detail-sub-name">{u.name}</span>
                      <span className="tairos-force-detail-sub-meta">
                        {t?.short}
                        <span className="tairos-force-detail-sep">·</span>
                        {e?.short}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          </Row>
        )}

        {/* Coordinates */}
        <Row label="KONUM" icon={MapPin}>
          <div className="tairos-force-detail-coords">
            <span className="tairos-force-detail-coords-val">
              {fmtLat(selected.lat)}
            </span>
            <span className="tairos-force-detail-coords-val">
              {fmtLng(selected.lng)}
            </span>
          </div>
        </Row>

        {/* Note */}
        {selected.note && (
          <Row label="AÇIKLAMA" icon={Info}>
            <div className="tairos-force-detail-note">{selected.note}</div>
          </Row>
        )}

        {/* Doctrine */}
        {type?.doctrine && (
          <Row label="DOKTRİN" icon={type.kind === 'naval' ? Anchor : Target}>
            <div className="tairos-force-detail-doctrine">{type.doctrine}</div>
          </Row>
        )}
      </div>

      {/* Actions footer */}
      <div className="tairos-force-detail-footer">
        <button
          onClick={flyTo}
          className="tairos-force-detail-action"
          title="Haritada merkeze al"
        >
          <Navigation size={11} />
          <span>Haritada göster</span>
        </button>

        {prof && prof.style !== 'passive' && (
          <button
            onClick={focusThreat}
            className={`tairos-force-detail-action is-threat ${threatOn ? 'is-active' : ''}`}
            title="Tehdit halkasını aç"
          >
            <Radar size={11} />
            <span>Tehdit</span>
          </button>
        )}

        {selected.type === 'hq' && (
          <button
            onClick={focusCommand}
            className={`tairos-force-detail-action is-command ${killChainOn ? 'is-active' : ''}`}
            title="Komuta zincirini aç"
          >
            <Crosshair size={11} />
            <span>Zincir</span>
          </button>
        )}
      </div>
    </div>
  )
}

/* ── Row primitive — label + icon on top, content below. ─────────── */
function Row({ label, icon: Icon, accent, children }) {
  return (
    <div className="tairos-force-detail-row">
      <div
        className="tairos-force-detail-row-label"
        style={accent ? { color: accent } : undefined}
      >
        {Icon && <Icon size={9} className="tairos-force-detail-row-icon" />}
        {label}
      </div>
      <div className="tairos-force-detail-row-body">{children}</div>
    </div>
  )
}

/* ── Helpers ─────────────────────────────────────────────── */
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

function weightOf(u) {
  const e = ECHELONS[u.echelon]
  return e?.weight ?? 0
}

function fmtLat(lat) {
  const n = Number(lat)
  if (!Number.isFinite(n)) return '—'
  const hemi = n >= 0 ? 'N' : 'S'
  return `${Math.abs(n).toFixed(4)}° ${hemi}`
}

function fmtLng(lng) {
  const n = Number(lng)
  if (!Number.isFinite(n)) return '—'
  const hemi = n >= 0 ? 'E' : 'W'
  return `${Math.abs(n).toFixed(4)}° ${hemi}`
}
