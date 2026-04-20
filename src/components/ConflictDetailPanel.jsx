import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  X, AlertTriangle, Target, Crosshair, MapPin, Users, Calendar,
  ChevronRight, ChevronDown, Swords, Layers, Eye, EyeOff, Copy, Check,
  Activity, Clock, Shield, FileText, Flame, Building2, ExternalLink,
  Radio, Newspaper, Handshake, ArrowUpRight, Scale, Flag, ChevronsRight,
  Skull, Home, HeartPulse, DollarSign, Hammer, Package,
  ChevronsDownUp, ChevronsUpDown,
} from 'lucide-react'
import useStore from '../store/useStore'
import { DRONE_PRODUCTS } from '../config/drones'
import conflictAssets from '../data/conflictAssets.json'
import conflictDevelopments from '../data/conflictDevelopments.json'
import conflictMaterial from '../data/conflictMaterial.json'
import {
  CONFLICT_ASSET_TYPES,
  CONFLICT_ASSET_KINDS,
  CONFLICT_SIDE_COLOUR,
  CONFLICT_SIDE_DEFAULT_LABEL,
  CONFLICT_ASSET_SECTION_LABEL,
} from '../config/conflictAssets'

// News-feed severity palette. Intentionally narrower than the conflict
// status palette — these are report-level classifications, not force
// posture, so they get their own vocabulary.
//   critical    → hot kinetic / casualty event — red
//   major       → significant operational move — amber
//   routine     → status update / low-intensity — steel
//   diplomatic  → talks / treaties / sanctions — violet
const DEV_SEVERITY = {
  critical:   { color: '#C04631', label: 'KRİTİK',     icon: Flame        },
  major:      { color: '#B87035', label: 'ÖNEMLİ',     icon: AlertTriangle },
  routine:    { color: '#5C7FA8', label: 'RUTİN',      icon: Radio        },
  diplomatic: { color: '#8C6BB3', label: 'DİPLOMATİK', icon: Handshake    },
}

// Muted command-map palette — keep in sync with ConflictLayer.statusColour()
// and ConflictSection.STATUS_COLOUR so chip colour matches the map bubble.
const STATUS_META = {
  active:   { label: 'AKTİF ÇATIŞMA',     color: '#C04631', icon: Flame,    severity: 'HIGH' },
  ongoing:  { label: 'SÜREGELEN',         color: '#B87035', icon: Activity, severity: 'MED'  },
  frozen:   { label: 'DONMUŞ',            color: '#9AA6B8', icon: Shield,   severity: 'LOW'  },
  tension:  { label: 'GERİLİM HATTI',     color: '#B09340', icon: AlertTriangle, severity: 'WATCH' },
}

// Cool-steel / warm-brick opposition — matches ConflictLayer.
const SIDE_A_COLOUR = CONFLICT_SIDE_COLOUR.A
const SIDE_B_COLOUR = CONFLICT_SIDE_COLOUR.B

// Equipment taxonomy rendered in the Kuvvet → ForceCard inventory
// strip. Keeps the palette restrained — each kind is only a color
// accent on the chip, the glyph carries the visual identity. Order
// implicitly encodes "coarse-to-fine-grained lethality" so a chip
// row reads left-to-right: heavy armour → precision weapons.
//
// The chip renderer uses the Unicode glyph (renders identically
// across platforms via the "Segoe UI Symbol" / "Apple Symbols"
// fallback that the rest of the SAHA layer also uses).
const EQUIPMENT_KINDS = {
  tank:      { label: 'Tank',         short: 'Tank',   glyph: '⛊', color: '#B3693A' },
  afv:       { label: 'Zırhlı Araç',  short: 'AFV',    glyph: '▦', color: '#A06349' },
  artillery: { label: 'Topçu',        short: 'Topçu',  glyph: '⁞', color: '#B87035' },
  mlrs:      { label: 'ÇNRA / Roket', short: 'ÇNRA',   glyph: '⋰', color: '#C9552E' },
  uav:       { label: 'İHA / SİHA',   short: 'İHA',    glyph: '◬', color: '#6FA4DC' },
  aircraft:  { label: 'Sabit Kanat',  short: 'Uçak',   glyph: '✈', color: '#3E74B8' },
  helo:      { label: 'Helikopter',   short: 'Helo',   glyph: '⊛', color: '#4A9080' },
  sam:       { label: 'Hava Savunma', short: 'HavaSav',glyph: '⛨', color: '#8C6BB3' },
  naval:     { label: 'Donanma',      short: 'Deniz',  glyph: '⚓', color: '#3E74B8' },
  missile:   { label: 'Füze',         short: 'Füze',   glyph: '↟', color: '#C04631' },
}

// Order used when rendering the equipment strip so the same kind
// always appears in the same slot across both sides — keeps visual
// comparison honest (reader's eye doesn't track column-jumps).
const EQUIPMENT_ORDER = [
  'tank', 'afv', 'artillery', 'mlrs', 'uav', 'aircraft', 'helo', 'sam', 'naval', 'missile',
]

// Tab identifiers. Ordered left-to-right as the operator would read them
// on a first glance: summary → forces → field → product fit.
const TABS = [
  { id: 'brief',   label: 'BRİFİNG',  icon: FileText },
  { id: 'forces',  label: 'KUVVET',   icon: Swords   },
  { id: 'field',   label: 'SAHA',     icon: Layers   },
  { id: 'tairos',  label: 'TAİROS',   icon: Crosshair },
]

/**
 * Conflict intel detail panel.
 *
 * Upgraded from the single-scroll brief to a proper intel surface:
 *
 *   • CLASSIFICATION RIBBON  OSINT tag + generated-at stamp so the reader
 *                            immediately sees this is OSINT composite,
 *                            not proprietary feed.
 *   • METRIC DASHBOARD       four live cards (severity / duration /
 *                            parties / assets) — clickable to scroll to
 *                            their tab.
 *   • TAB STRIP              BRİFİNG / KUVVET / SAHA / TAİROS — the content
 *                            used to be one long scroll; tabs keep each
 *                            dimension readable.
 *   • FORCE BALANCE BAR      when both sides declare numeric estimates we
 *                            parse them out and render a proportional
 *                            bar; a qualitative bar if numbers are fuzzy.
 *   • COPY-BRIEF             clipboard export of the textual summary so
 *                            the operator can paste into a report.
 *
 * The panel is width-resizable from its left edge (persisted to
 * localStorage); the content inside is driven by the selected conflict.
 */
export default function ConflictDetailPanel() {
  const conflict   = useStore((s) => s.selectedConflict)
  const clear      = useStore((s) => s.clearConflict)
  const flyToPoint = useStore((s) => s.flyToPoint)
  const focusConflict = useStore((s) => s.focusConflict)
  const mapZoom    = useStore((s) => s.mapZoom)
  const setHoveredConflict = useStore((s) => s.setHoveredConflict)

  // Foreign-theatre strategic asset state (separate namespace from the
  // Turkey-facing `activeCategories`; see store for the rationale).
  const assetsOn       = useStore((s) => s.conflictAssetsOn)
  const toggleAssets   = useStore((s) => s.toggleConflictAssets)
  const kindFilter     = useStore((s) => s.conflictAssetKindFilter)
  const setKindFilter  = useStore((s) => s.setConflictAssetKindFilter)
  const selectAsset    = useStore((s) => s.selectConflictAsset)
  const hoveredAssetId = useStore((s) => s.hoveredConflictAssetId)
  const setHoveredAsset= useStore((s) => s.setHoveredConflictAsset)

  // Resizable width — persisted to localStorage.
  const LS_KEY = 'tairos:conflict-panel:width'
  const [width, setWidth] = useState(() => {
    try {
      const raw = parseInt(localStorage.getItem(LS_KEY) || '', 10)
      if (raw >= 320 && raw <= 820) return raw
    } catch {}
    return 380
  })
  useEffect(() => {
    try { localStorage.setItem(LS_KEY, String(width)) } catch {}
  }, [width])

  const onResizeStart = useCallback((e) => {
    if (e.button !== 0) return
    e.preventDefault()
    const startX = e.clientX
    const startW = width
    const move = (ev) => {
      const delta = startX - ev.clientX
      setWidth(Math.max(320, Math.min(820, startW + delta)))
    }
    const up = () => {
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup',   up)
      document.body.style.userSelect = ''
    }
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup',   up)
  }, [width])

  // Which tab is active. Reset to 'brief' whenever the operator opens a
  // different conflict — carrying "field" open from a Syria click into a
  // Venezuela click would disorient.
  const [tab, setTab] = useState('brief')
  useEffect(() => { setTab('brief') }, [conflict?.id])

  // Copy-to-clipboard feedback state.
  const [copied, setCopied] = useState(false)

  // Precompute things that several tabs / header regions use.
  const now = new Date()
  const generatedAt = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`
  const assetsAll = (conflict && conflictAssets[conflict.id]) || []

  if (!conflict) return null

  const meta       = STATUS_META[conflict.status] || STATUS_META.active
  const StatusIcon = meta.icon
  const priority   = conflict.tairos?.priority || []
  const stats      = conflict.stats ? Object.entries(conflict.stats) : []
  const forces     = conflict.forces || null
  const duration   = Math.max(0, now.getFullYear() - (Number(conflict.startedYear) || now.getFullYear()))

  const assets = kindFilter === 'all'
    ? assetsAll
    : assetsAll.filter((a) => CONFLICT_ASSET_TYPES[a.type]?.kind === kindFilter)
  const sideLabels = {
    A: conflict.sideLabels?.A || CONFLICT_SIDE_DEFAULT_LABEL.A,
    B: conflict.sideLabels?.B || CONFLICT_SIDE_DEFAULT_LABEL.B,
  }

  const flyTo = () => { focusConflict() }
  // Fly-to for individual pin targets. We go through the store action
  // (which bumps `mapFlyTick`) so the <FlyToPoint /> subscriber in MapView
  // actually moves the Leaflet map — plain setMapView only writes state
  // and doesn't touch the map. Asset clicks also select the asset so its
  // popup/overlay can respond.
  const focusAsset = (a) => {
    flyToPoint(a.lat, a.lng, Math.max(mapZoom, 9))
    selectAsset(a)
  }
  const focusHotspot = (h) => {
    flyToPoint(h.lat, h.lng, Math.max(mapZoom, 8))
  }

  // Compile an OSINT-style text brief for clipboard export. Mirrors what
  // an operator might paste into a Slack channel or an internal memo.
  const copyBrief = async () => {
    const lines = [
      `// TAIROS SENTINEL // OSINT — KOMPOZIT · ${generatedAt}`,
      ``,
      `${meta.label}  ·  ${conflict.region}`,
      conflict.name,
      `Başlangıç: ${conflict.startedYear} · Süre: ${duration} yıl · Şiddet: ${conflict.severity}/5`,
      ``,
      conflict.summary || '',
      conflict.parties?.length ? `\nTARAFLAR:\n- ${conflict.parties.join('\n- ')}` : '',
      forces?.sideA?.estimate ? `\nKUVVET (${sideLabels.A}): ${forces.sideA.estimate}` : '',
      forces?.sideB?.estimate ? `\nKUVVET (${sideLabels.B}): ${forces.sideB.estimate}` : '',
      conflict.tairos?.headline ? `\nTAİROS: ${conflict.tairos.headline}` : '',
    ].filter(Boolean).join('\n')
    try {
      await navigator.clipboard.writeText(lines)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div
      className="absolute right-0 top-0 bottom-0 bg-ops-800 border-l border-ops-600 flex flex-col overflow-hidden fade-in"
      style={{ zIndex: 1200, width }}
    >
      {/* Left-edge resize grip */}
      <div
        onMouseDown={onResizeStart}
        className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-accent/60 transition-colors z-20"
        title="Boyutlandır — sola/sağa sürükle"
      />

      {/* ── Classification ribbon ──────────────────────────── */}
      <div
        className="shrink-0 flex items-center gap-2 px-3 py-1 text-[9px] font-mono uppercase tracking-widest border-b"
        style={{
          background: `repeating-linear-gradient(45deg, ${meta.color}10 0 6px, transparent 6px 12px)`,
          borderColor: `${meta.color}55`,
          color: meta.color,
        }}
      >
        <span>// TAIROS SENTINEL //</span>
        <span className="text-ops-500">OSINT · KOMPOZIT</span>
        <span className="ml-auto text-ops-500">{generatedAt}</span>
        <button
          onClick={clear}
          className="ml-1 -mr-1 p-1 rounded hover:bg-ops-700 text-ops-400 hover:text-ops-100"
          title="Kapat"
        >
          <X size={12} />
        </button>
      </div>

      {/* ── Header ─────────────────────────── */}
      <div
        className="shrink-0 border-b border-ops-700 px-3 py-2.5 flex items-start gap-2"
        style={{ background: `linear-gradient(180deg, ${meta.color}22 0%, transparent 100%)` }}
      >
        <div className="mt-0.5 w-1 self-stretch rounded-full" style={{ background: meta.color }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase tracking-wider"
              style={{ background: `${meta.color}22`, color: meta.color }}
              title={`Tehdit seviyesi: ${meta.severity}`}
            >
              <StatusIcon size={9} /> {meta.label}
            </span>
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono uppercase tracking-wider text-ops-300 border border-ops-600/70"
              title="Coğrafi bölge"
            >
              <MapPin size={9} /> {conflict.region}
            </span>
            {conflict.shortName && conflict.shortName !== conflict.name && (
              <span
                className="text-[9px] font-mono uppercase tracking-widest text-ops-500"
                title="Kısa ad"
              >
                · {conflict.shortName}
              </span>
            )}
          </div>
          <h2 className="mt-1 text-[15px] font-semibold text-ops-50 leading-tight">
            {conflict.name}
          </h2>
        </div>
      </div>

      {/* ── Metric dashboard (always visible) ─────────────── */}
      <div className="shrink-0 grid grid-cols-4 gap-px bg-ops-700/40 border-b border-ops-700">
        <MetricCard
          label="Şiddet"
          value={`${conflict.severity || 0}/5`}
          sub={severityLabel(conflict.severity)}
          color={meta.color}
          icon={AlertTriangle}
          renderExtra={() => <SeverityBar v={conflict.severity} color={meta.color} />}
          onClick={() => setTab('brief')}
        />
        <MetricCard
          label="Süre"
          value={`${duration}y`}
          sub={`${conflict.startedYear}→`}
          color="#C9A236"
          icon={Clock}
          onClick={() => setTab('brief')}
        />
        <MetricCard
          label="Taraf"
          value={String(conflict.parties?.length || 0)}
          sub="parti"
          color="#5C7FA8"
          icon={Users}
          onClick={() => setTab('forces')}
        />
        <MetricCard
          label="Saha"
          value={String(assetsAll.length)}
          sub="varlık"
          color="#3E8C6C"
          icon={Building2}
          onClick={() => setTab('field')}
        />
      </div>

      {/* ── Tab strip ─────────────────────────────────────── */}
      <div className="shrink-0 flex border-b border-ops-700 bg-ops-900/40">
        {TABS.map((t) => {
          const active = tab === t.id
          const Icon = t.icon
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 flex items-center justify-center gap-1 px-1 py-1.5 text-[10px] font-mono uppercase tracking-wider transition-colors relative ${
                active ? 'text-ops-50' : 'text-ops-400 hover:text-ops-200'
              }`}
            >
              <Icon size={10} className={active ? 'text-accent' : ''} />
              <span>{t.label}</span>
              {active && (
                <span
                  className="absolute left-0 right-0 bottom-0 h-[2px]"
                  style={{ background: meta.color }}
                />
              )}
            </button>
          )
        })}
      </div>

      {/* ── Tab body ──────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {tab === 'brief'  && (
          <BriefTab
            conflict={conflict}
            meta={meta}
            duration={duration}
            stats={stats}
            onCopy={copyBrief}
            copied={copied}
            focusHotspot={focusHotspot}
          />
        )}
        {tab === 'forces' && (
          <ForcesTab
            conflict={conflict}
            forces={forces}
            sideLabels={sideLabels}
          />
        )}
        {tab === 'field'  && (
          <FieldTab
            assetsAll={assetsAll}
            assets={assets}
            kindFilter={kindFilter}
            setKindFilter={setKindFilter}
            assetsOn={assetsOn}
            toggleAssets={toggleAssets}
            focusAsset={focusAsset}
            hoveredAssetId={hoveredAssetId}
            setHoveredAsset={setHoveredAsset}
            sideLabels={sideLabels}
          />
        )}
        {tab === 'tairos' && (
          <TairosTab
            tairos={conflict.tairos}
            priority={priority}
          />
        )}
      </div>

      {/* ── Footer ─────────────────────────── */}
      <div className="shrink-0 border-t border-ops-700 px-3 py-2 flex items-center gap-2 bg-ops-900/40">
        <button
          onClick={flyTo}
          className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-[11px] font-medium bg-ops-700 hover:bg-ops-600 text-ops-100 transition-colors"
          title="Tiyatroya odaklan — haritayı çatışma sınırlarına sığdır"
        >
          <Target size={12} /> Tiyatroya Uç
        </button>
        <button
          onClick={copyBrief}
          className={`flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-[11px] font-medium border transition-colors ${
            copied
              ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'
              : 'border-ops-600 text-ops-300 hover:border-ops-400 hover:text-ops-100'
          }`}
          title="OSINT brifingi panoya kopyala"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'Kopyalandı' : 'Brifing'}
        </button>
      </div>
    </div>
  )
}

/* ═══ TAB: BRİFİNG ═══════════════════════════════════════════════════
 * Layout strategy (post-grouping):
 *
 *   1. SectionNav        sticky chip strip — shows all sections, chip
 *                        colour reflects open/closed state, click opens
 *                        + smooth-scrolls to that section. A right-side
 *                        "Tümünü aç/kapat" button resets density in one
 *                        click.
 *   2. Durum Özeti       always visible (sabit) — primary narrative.
 *   3. Güncel Gelişmeler collapsible, default OPEN — feed is the second
 *                        highest-signal surface.
 *   4. Öne Çıkan Noktalar collapsible, default OPEN — tactically useful.
 *   5. Zaman Çizelgesi   collapsible, default CLOSED — decorative.
 *   6. Sayısal Ayak İzi  collapsible, default CLOSED — raw key/value
 *                        dump, only matters when operator drills down.
 *
 * The copy-brief nudge is anchored below the nav so it's always one tap
 * away regardless of which sections are expanded.
 */
function BriefTab({ conflict, meta, duration, stats, onCopy, copied, focusHotspot }) {
  const now = new Date()
  const started = Number(conflict.startedYear) || now.getFullYear()
  // Developments feed — loaded from conflictDevelopments.json keyed by
  // conflict.id. Gracefully empty if the seed has nothing for this theatre.
  const updates = useMemo(() => {
    const raw = conflictDevelopments[conflict.id] || []
    // Sort newest first; critical/major get a subtle priority bump when
    // the timestamps are equal so urgent things float to the top.
    const severityWeight = { critical: 3, major: 2, diplomatic: 1, routine: 0 }
    return [...raw].sort((a, b) => {
      const d = (b.date || '').localeCompare(a.date || '')
      if (d !== 0) return d
      return (severityWeight[b.severity] || 0) - (severityWeight[a.severity] || 0)
    })
  }, [conflict.id])

  // Section descriptors drive both the visible sections and the
  // sticky SectionNav chip strip. Keep ids stable — the scroll-into-
  // view lookup matches by `data-section-id`.
  const sections = [
    { id: 'summary',    label: 'Özet',       accent: meta.color,  collapsible: false, visible: !!conflict.summary },
    { id: 'devs',       label: 'Gelişmeler', accent: meta.color,  visible: updates.length > 0,          defaultOpen: true  },
    { id: 'hotspots',   label: 'Noktalar',   accent: meta.color,  visible: conflict.hotspots?.length > 0, defaultOpen: true  },
    { id: 'timeline',   label: 'Zaman',      accent: meta.color,  visible: true,                         defaultOpen: false },
    { id: 'stats',      label: 'İstatistik', accent: meta.color,  visible: stats.length > 0,             defaultOpen: false },
  ].filter((s) => s.visible)

  const initial = Object.fromEntries(sections.map((s) => [s.id, s.defaultOpen ?? true]))
  const { openMap, toggle, expandAll, collapseAll } = useSectionOpenState(conflict.id, initial)

  return (
    <div className="p-3 space-y-2">
      <SectionNav
        sections={sections}
        openMap={openMap}
        onToggle={toggle}
        onExpandAll={expandAll}
        onCollapseAll={collapseAll}
      />

      {/* Summary paragraph — always visible, frames everything else. */}
      {conflict.summary && (
        <Block id="summary" title="Durum Özeti" accent={meta.color}>
          <p className="text-[11.5px] text-ops-200 leading-relaxed">
            {conflict.summary}
          </p>
        </Block>
      )}

      {/* ── Güncel Gelişmeler feed ─────────────────────────
          The operator needs a "what moved this week" surface on a brief
          — otherwise everything in the panel reads as static seed data. */}
      {updates.length > 0 && (
        <DevelopmentsFeed
          id="devs"
          updates={updates}
          accent={meta.color}
          collapsible
          open={openMap.devs}
          onToggle={() => toggle('devs')}
        />
      )}

      {/* Hotspots — clickable chips with coord hover. */}
      {conflict.hotspots?.length > 0 && (
        <Block
          id="hotspots"
          title="Öne Çıkan Noktalar"
          accent={meta.color}
          collapsible
          open={openMap.hotspots}
          onToggle={() => toggle('hotspots')}
          headerExtra={
            <span className="text-[9px] font-mono text-ops-500">
              {conflict.hotspots.length} nokta
            </span>
          }
        >
          <div className="flex flex-wrap gap-1">
            {conflict.hotspots.map((h, i) => (
              <button
                key={i}
                onClick={() => focusHotspot(h)}
                title={`${h.name}\n${h.lat.toFixed(2)}, ${h.lng.toFixed(2)}\ntıkla → haritayı oraya uçur`}
                className="group flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-mono bg-ops-900/40 hover:bg-ops-700 text-ops-200 border border-ops-700 hover:border-accent/60 transition-colors"
              >
                <MapPin size={9} className="text-ops-500 group-hover:text-accent" />
                <span className="truncate max-w-[180px]">{h.name}</span>
                <span className="text-[9px] text-ops-600 group-hover:text-ops-400">
                  {h.lat.toFixed(1)},{h.lng.toFixed(1)}
                </span>
              </button>
            ))}
          </div>
        </Block>
      )}

      {/* Duration ribbon — tiny visual of how long this has been running. */}
      <Block
        id="timeline"
        title="Zaman Çizelgesi"
        accent={meta.color}
        collapsible
        open={openMap.timeline}
        onToggle={() => toggle('timeline')}
        headerExtra={
          <span className="text-[9px] font-mono text-ops-500">
            {duration}y
          </span>
        }
      >
        <DurationRibbon startedYear={started} color={meta.color} />
        <div className="flex justify-between text-[9px] font-mono text-ops-500 mt-1">
          <span>{started}</span>
          <span className="text-ops-300">{duration} yıl</span>
          <span>{now.getFullYear()}</span>
        </div>
      </Block>

      {/* Raw stats — varies per conflict; rendered as compact cards. */}
      {stats.length > 0 && (
        <Block
          id="stats"
          title="Sayısal Ayak İzi"
          accent={meta.color}
          collapsible
          open={openMap.stats}
          onToggle={() => toggle('stats')}
          headerExtra={
            <span className="text-[9px] font-mono text-ops-500">
              {stats.length} alan
            </span>
          }
        >
          <div className="grid grid-cols-2 gap-1.5">
            {stats.map(([k, v]) => (
              <div
                key={k}
                className="rounded border border-ops-700 bg-ops-900/30 px-2 py-1.5"
                title={k}
              >
                <div className="text-[9px] font-mono text-ops-500 uppercase tracking-wider truncate">
                  {k}
                </div>
                <div className="text-[12px] font-mono text-ops-100 leading-tight truncate">
                  {String(v)}
                </div>
              </div>
            ))}
          </div>
        </Block>
      )}

      {/* Copy hint — only rendered if the operator hasn't used it yet. */}
      {!copied && (
        <button
          onClick={onCopy}
          className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded border border-dashed border-ops-600 text-[10px] font-mono text-ops-400 hover:border-accent/60 hover:text-accent transition-colors"
        >
          <Copy size={10} /> Bu brifingin metnini panoya kopyala
        </button>
      )}
    </div>
  )
}

/* ═══ TAB: KUVVET ════════════════════════════════════════════════════
 * Head-to-head intel surface — side-by-side for easy comparison.
 * Layout, top-to-bottom:
 *
 *   1. BalanceStrip      slim header with classification + ratio pill
 *                        + a proportional bar (no duplicate side
 *                        labels — the cards below carry those).
 *   2. ForceCard × 2     two compact cards in a 2-col grid so the
 *                        operator's eye can pivot left/right to
 *                        compare the same field directly. Each card
 *                        shows: real side NAME (big, color-tinted,
 *                        no abstract "Taraf A/B" chip), personnel
 *                        estimate, personnel breakdown as mini-bars,
 *                        EQUIPMENT inventory (tank / UAV / aircraft
 *                        / …), saha varlığı cross-refs, posture
 *                        chips, free-text note.
 *   3. DamageBlock       theatre-level destruction estimates: dead,
 *                        wounded, displaced, infrastructure %, econ
 *                        loss, civil structures — OSINT composite.
 *   4. ActorNetwork      the flat parties array rendered as chips.
 *   5. IntelMeta         asOf + source tag (single line).
 *
 * The "Taraf A / Taraf B" abstract labels are intentionally DROPPED
 * from this tab — every surface uses the real side name instead, so
 * the operator never has to remember the A/B mapping. */
function ForcesTab({ conflict, forces, sideLabels }) {
  const a = forces?.sideA ? parseForceEstimate(forces.sideA.estimate) : 0
  const b = forces?.sideB ? parseForceEstimate(forces.sideB.estimate) : 0
  const hasData = !!(forces?.sideA || forces?.sideB)
  const hasParties = conflict.parties && conflict.parties.length > 0

  // Equipment + damage intel — optional; missing data degrades
  // gracefully (card still renders without equipment strip, damage
  // block hides entirely).
  const material = conflictMaterial[conflict.id] || null

  // Saha varlığı cross-reference — per-side totals grouped by the
  // same "kind" taxonomy (komuta / kinetik / altyapı / sivil) that
  // drives the SAHA tab filter chips. Computed once per conflict,
  // consumed by both ForceCards below. Keyed on `conflict.id` (and
  // not on the array reference) so the memo survives re-renders.
  const sideAssetCounts = useMemo(() => {
    const list = conflictAssets[conflict.id] || []
    const blank = () => ({ total: 0, byKind: {} })
    const out = { A: blank(), B: blank() }
    for (const it of list) {
      if (it.side !== 'A' && it.side !== 'B') continue
      const kind = CONFLICT_ASSET_TYPES[it.type]?.kind
      if (!kind) continue
      out[it.side].total += 1
      out[it.side].byKind[kind] = (out[it.side].byKind[kind] || 0) + 1
    }
    return out
  }, [conflict.id])

  if (!hasData && !hasParties) {
    return (
      <p className="text-[10px] font-mono text-ops-500 italic text-center py-6 px-3">
        Bu tiyatro için taraf ve kuvvet verisi seed edilmemiş.
      </p>
    )
  }

  // Section descriptor list — drives the sticky SectionNav. We only
  // render a section in the list if the underlying data exists, so the
  // chip strip never shows a dead-end. `balance` encompasses the
  // BalanceStrip + the two ForceCards (they belong together visually:
  // ratio up top, detail cards below).
  const sections = [
    { id: 'balance', label: 'Kıyaslama', accent: '#C9A236', visible: hasData,             defaultOpen: true  },
    { id: 'damage',  label: 'Yıkım',     accent: '#C04631', visible: !!material?.damage,  defaultOpen: false },
    { id: 'actors',  label: 'Aktörler',  accent: '#5C7FA8', visible: hasParties,          defaultOpen: false },
  ].filter((s) => s.visible)

  const initial = Object.fromEntries(sections.map((s) => [s.id, s.defaultOpen ?? true]))
  const { openMap, toggle, expandAll, collapseAll } = useSectionOpenState(conflict.id, initial)

  return (
    <div className="p-3 space-y-2">
      <SectionNav
        sections={sections}
        openMap={openMap}
        onToggle={toggle}
        onExpandAll={expandAll}
        onCollapseAll={collapseAll}
      />

      {/* ── 1. Kıyaslama bloğu — strip + iki ForceCard ────────
          Bu üç şey mantıksal olarak tek bir "güç dengesi" üniteyi
          oluşturduğu için tek bir collapsible kabuğa sarıldı. Strip en
          üstte (özet), kartlar altında (detay). Tek chevron ile ikisi
          birden açılıp kapanır — operatör "toplu karşılaştırma" vs
          "sadece yıkım/aktör" arasında kolayca geçer. */}
      {hasData && (
        <Block
          id="balance"
          title="Kıyaslama"
          accent="#C9A236"
          collapsible
          open={openMap.balance}
          onToggle={() => toggle('balance')}
          headerExtra={<BalanceRatioBadge a={a} b={b} sideLabels={sideLabels} />}
        >
          <div className="space-y-2">
            <BalanceStrip forces={forces} sideLabels={sideLabels} a={a} b={b} />
            <div className="grid grid-cols-2 gap-1.5">
              <ForceCard
                colour={SIDE_A_COLOUR}
                sideName={forces.sideA?.label || sideLabels.A}
                entry={forces.sideA}
                material={material?.sideA}
                assetCounts={sideAssetCounts.A}
                align="left"
              />
              <ForceCard
                colour={SIDE_B_COLOUR}
                sideName={forces.sideB?.label || sideLabels.B}
                entry={forces.sideB}
                material={material?.sideB}
                assetCounts={sideAssetCounts.B}
                align="right"
              />
            </div>
          </div>
        </Block>
      )}

      {/* ── 2. Damage / destruction estimates ─────────────────── */}
      {material?.damage && (
        <DamageBlock
          id="damage"
          damage={material.damage}
          collapsible
          open={openMap.damage}
          onToggle={() => toggle('damage')}
        />
      )}

      {/* ── 3. Actor network ─────────────────────────────────── */}
      {hasParties && (
        <Block
          id="actors"
          title="Aktör Ağı"
          accent="#5C7FA8"
          collapsible
          open={openMap.actors}
          onToggle={() => toggle('actors')}
          headerExtra={
            <span className="text-[9px] font-mono text-ops-500">
              {conflict.parties.length} aktör
            </span>
          }
        >
          <ul className="flex flex-wrap gap-1">
            {conflict.parties.map((p, i) => (
              <li
                key={i}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-ops-900/40 border border-ops-700 text-[10px] text-ops-200"
              >
                <Flag size={8} className="text-ops-500 shrink-0" />
                <span className="leading-snug">{p}</span>
              </li>
            ))}
          </ul>
        </Block>
      )}

      {/* ── 4. Intel meta line ───────────────────────────────── */}
      {(forces?.asOf || forces?.source || material?.asOf || material?.source) && (
        <div className="flex items-center justify-between gap-2 text-[9px] font-mono text-ops-500 border-t border-ops-700 pt-2">
          <span className="inline-flex items-center gap-1 shrink-0">
            <Clock size={9} />
            {forces?.asOf || material?.asOf || '—'}
          </span>
          {(forces?.source || material?.source) && (
            <span className="inline-flex items-center gap-1 truncate" title={forces?.source || material?.source}>
              <ExternalLink size={9} /> {forces?.source || material?.source}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Compact ratio badge rendered in the Kıyaslama block header when it's
 * collapsed so the operator sees the headline ratio ("3.2 : 1 · RU")
 * without having to expand. Hidden when the balance can't be derived.
 */
function BalanceRatioBadge({ a, b, sideLabels }) {
  if (!(a > 0 && b > 0)) return null
  const ratio = Math.max(a, b) / Math.min(a, b)
  const lead  = a >= b ? sideLabels.A : sideLabels.B
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-px rounded text-[9px] font-mono font-bold uppercase tracking-wider"
      style={{ background: 'rgba(201, 162, 54, 0.15)', color: '#E4C268' }}
      title={`${lead} ~${ratio.toFixed(2)}× lehte`}
    >
      <Scale size={9} /> {ratio.toFixed(1)}:1
    </span>
  )
}

/**
 * Slim balance strip. Shows ONLY the comparison summary (ratio +
 * classification + proportional bar) — the side labels and estimates
 * have been moved down into the ForceCards below so they're never
 * duplicated. This keeps the strip ~60px tall, leaving maximum room
 * for the side-by-side cards which are the actual intel surface.
 *
 * If only ONE side has a numeric estimate, the bar is hidden and we
 * say so honestly instead of faking a balance.
 */
function BalanceStrip({ forces, sideLabels, a, b }) {
  const hasBalance = a > 0 && b > 0
  const total     = a + b
  const aPct      = hasBalance ? Math.round((a / total) * 100) : null
  const bPct      = hasBalance ? 100 - aPct : null
  const ratio     = hasBalance ? (Math.max(a, b) / Math.min(a, b)) : null
  const ratioLead = hasBalance ? (a >= b ? sideLabels.A : sideLabels.B) : null
  const cls       = hasBalance ? classifyBalance(ratio) : null

  // Wrapper-free variant — BalanceStrip used to render its own Block
  // header, but after the Kıyaslama grouping refactor it lives INSIDE
  // a parent Block. Returning raw content keeps the chrome single-
  // titled. The qualitative badge (SİMETRİK / ASİMETRİK / …) now sits
  // above the bar as a thin strip so the intel doesn't get lost.
  return (
    <div className="rounded border border-ops-700/60 bg-ops-900/30 p-2 space-y-2">
      {cls && (
        <div className="flex items-center justify-end">
          <span
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase tracking-wider"
            style={{ background: `${cls.color}22`, color: cls.color }}
            title={cls.hint}
          >
            <Scale size={9} /> {cls.label}
          </span>
        </div>
      )}
      {hasBalance ? (
        <>
          {/* Ratio pill — "WHO is bigger, by HOW MUCH, in plain words". */}
          <div className="flex items-center justify-center">
            <span
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono max-w-full"
              style={{
                background: 'rgba(201, 162, 54, 0.12)',
                border: '1px solid rgba(201, 162, 54, 0.35)',
                color: '#E4C268',
              }}
              title={`${ratioLead} tarafı ${ratio.toFixed(2)}x daha büyük`}
            >
              <ChevronsRight size={10} className="shrink-0" />
              <span className="font-bold shrink-0">{ratio.toFixed(1)} : 1</span>
              <span className="text-ops-400 shrink-0">·</span>
              <span className="truncate">{ratioLead} lehte</span>
            </span>
          </div>

          {/* Proportional balance bar with 50% midline tick. */}
          <div className="mt-2 relative">
            <div className="h-2.5 rounded-full overflow-hidden flex border border-ops-700 bg-ops-900/70">
              <div
                className="transition-all"
                style={{
                  width: `${aPct}%`,
                  background: `linear-gradient(90deg, ${SIDE_A_COLOUR}aa 0%, ${SIDE_A_COLOUR} 100%)`,
                }}
                title={`${sideLabels.A}: ~${formatApprox(a)} (${aPct}%)`}
              />
              <div
                className="transition-all"
                style={{
                  width: `${bPct}%`,
                  background: `linear-gradient(270deg, ${SIDE_B_COLOUR}aa 0%, ${SIDE_B_COLOUR} 100%)`,
                }}
                title={`${sideLabels.B}: ~${formatApprox(b)} (${bPct}%)`}
              />
            </div>
            <div
              className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-px bg-ops-400/30 pointer-events-none"
              aria-hidden
            />
            {/* Side-tinted % badges anchored to each bar end + the real
                side names under them so the bar is self-labelling and
                the reader doesn't have to guess which colour is who. */}
            <div className="mt-1 flex items-start justify-between gap-2 text-[9px] font-mono">
              <div className="min-w-0 flex-1 flex flex-col items-start">
                <span className="font-bold" style={{ color: SIDE_A_COLOUR }}>{aPct}%</span>
                <span className="truncate max-w-full text-ops-400" title={sideLabels.A}>
                  {sideLabels.A}
                </span>
              </div>
              <span className="text-ops-600 shrink-0 pt-px">parite</span>
              <div className="min-w-0 flex-1 flex flex-col items-end text-right">
                <span className="font-bold" style={{ color: SIDE_B_COLOUR }}>{bPct}%</span>
                <span className="truncate max-w-full text-ops-400" title={sideLabels.B}>
                  {sideLabels.B}
                </span>
              </div>
            </div>
          </div>

          {/* Combined total — "this many bodies in theatre". */}
          <div className="mt-2 flex items-center justify-between text-[9px] font-mono">
            <span className="text-ops-500 uppercase tracking-wider">toplam angaje</span>
            <span className="text-ops-100 font-bold">≈ {formatApprox(total)}</span>
          </div>
        </>
      ) : (
        <p className="text-[9px] font-mono text-ops-500 italic leading-snug">
          ⚠ Taraflardan birinin kuvvet tahmini sayısal değil — güç dengesi bandı çizilmedi.
        </p>
      )}
    </div>
  )
}

/**
 * Compact per-side force card, sized to fit half a panel (~170px
 * inner width on a 380px panel). Stacks vertically, top-to-bottom:
 *
 *   1. Side header  colour dot + real side NAME (truncated, color-
 *                   tinted) + a subtle "Kuvvet" tag. We deliberately
 *                   do NOT use "Taraf A / Taraf B" — the operator
 *                   should never have to remember the A/B mapping.
 *   2. Personnel    big estimate (the headline number), then a
 *                   compact list of sub-faction mini-bars with
 *                   value + within-side share %.
 *   3. Equipment    chip grid of inventory categories (tank / AFV /
 *                   topçu / ÇNRA / İHA / uçak / helo / havaSav /
 *                   deniz / füze) with counts. Tooltip on each chip
 *                   surfaces the OSINT note where we have one.
 *   4. Saha         cross-ref chip row: count of strategic assets
 *                   already placed on the map for THIS side, split
 *                   by command/kinetic/infra/civic kind.
 *   5. Posture      keyword-derived chips (SEFERBERLIK / ROTASYONLU
 *                   / PMC DAHIL / …) + optional free-text note.
 *
 * The card is intentionally narrow-friendly: long side names wrap
 * to two lines, value strings break-word, and chip rows flex-wrap.
 */
function ForceCard({ colour, sideName, entry, material, assetCounts, align }) {
  // Parse personnel breakdown so the mini-bars know their scale.
  const items = Array.isArray(entry?.breakdown) ? entry.breakdown.map((b) => {
    const v = parseForceEstimate(b.value)
    return { ...b, parsed: v }
  }) : []
  const maxParsed = items.reduce((m, it) => Math.max(m, it.parsed || 0), 0)
  const sumParsed = items.reduce((m, it) => m + (it.parsed || 0), 0)
  const postures  = detectPosture(entry?.note)

  // Equipment, normalized + sorted into the canonical display order
  // so both sides line up visually even when they carry different
  // kind sets.
  const equipmentByKind = {}
  if (material?.equipment) {
    for (const e of material.equipment) {
      equipmentByKind[e.kind] = e
    }
  }
  const equipmentOrdered = EQUIPMENT_ORDER
    .map((k) => equipmentByKind[k] ? { kind: k, ...equipmentByKind[k] } : null)
    .filter(Boolean)

  // Saha varlığı chips — only the non-zero kinds so we don't dilute.
  const sahaChips = CONFLICT_ASSET_KINDS
    .map((k) => ({ ...k, count: assetCounts?.byKind?.[k.id] || 0 }))
    .filter((k) => k.count > 0)

  return (
    <section
      className="rounded border flex flex-col min-w-0"
      style={{
        borderColor: `${colour}55`,
        background: `linear-gradient(180deg, ${colour}14 0%, ${colour}06 100%)`,
      }}
    >
      {/* ── 1. Header: real side name, big ─────────────────── */}
      <header
        className="px-2 py-1.5 border-b"
        style={{ borderColor: `${colour}33` }}
      >
        <div className="flex items-start gap-1.5 min-w-0">
          <span
            className="mt-1 w-1.5 h-1.5 rounded-full shrink-0"
            style={{ background: colour, boxShadow: `0 0 0 2px ${colour}33` }}
          />
          <div className="min-w-0 flex-1">
            <div
              className="text-[11px] font-semibold leading-tight break-words"
              style={{ color: colour }}
              title={sideName}
            >
              {sideName || '—'}
            </div>
            <div className="text-[8px] font-mono uppercase tracking-widest text-ops-500 mt-0.5">
              Kuvvet
            </div>
          </div>
        </div>
        {entry?.estimate ? (
          <div
            className="mt-1 text-[14px] font-mono font-bold text-ops-50 leading-tight break-words"
            title={`Toplam personel tahmini: ${entry.estimate}`}
          >
            {entry.estimate}
          </div>
        ) : (
          <div className="mt-1 text-[10px] font-mono text-ops-600 italic">
            tahmin yok
          </div>
        )}
      </header>

      {/* ── 2. Personnel breakdown bars ────────────────────── */}
      {items.length > 0 && (
        <ul className="px-2 pt-1.5 pb-1 space-y-1">
          {items.map((it, i) => {
            const pct      = maxParsed > 0 ? (it.parsed / maxParsed) * 100 : 0
            const sharePct = sumParsed > 0 ? Math.round((it.parsed / sumParsed) * 100) : null
            const numeric  = it.parsed > 0
            return (
              <li key={i} className="min-w-0">
                <div className="flex items-baseline justify-between gap-1 mb-0.5 min-w-0">
                  <span className="text-[9.5px] font-mono text-ops-300 truncate min-w-0" title={it.kind}>
                    {it.kind}
                  </span>
                  <span className="text-[9.5px] font-mono text-ops-100 shrink-0">
                    {it.value}
                    {numeric && sharePct !== null && (
                      <span className="text-[9px] text-ops-500 ml-0.5">·{sharePct}%</span>
                    )}
                  </span>
                </div>
                <div className="h-1 rounded-full bg-ops-900/70 overflow-hidden border border-ops-700/60">
                  {numeric ? (
                    <div
                      className="h-full transition-all"
                      style={{
                        width: `${pct}%`,
                        background: `linear-gradient(90deg, ${colour}99 0%, ${colour} 100%)`,
                      }}
                    />
                  ) : (
                    <div
                      className="h-full opacity-30"
                      style={{
                        background: `repeating-linear-gradient(90deg, ${colour} 0 4px, transparent 4px 8px)`,
                      }}
                      title="nitel değer"
                    />
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {/* ── 3. Equipment inventory ─────────────────────────── */}
      {equipmentOrdered.length > 0 && (
        <div className="px-2 pt-1.5 pb-1 border-t" style={{ borderColor: `${colour}22` }}>
          <div className="flex items-center gap-1 text-[8.5px] font-mono uppercase tracking-widest text-ops-500 mb-1">
            <Package size={8} /> Teçhizat
          </div>
          <EquipmentStrip items={equipmentOrdered} tint={colour} />
        </div>
      )}

      {/* ── 4. Saha varlığı cross-ref ──────────────────────── */}
      {(assetCounts?.total || 0) > 0 && (
        <div className="px-2 pt-1.5 pb-1 border-t" style={{ borderColor: `${colour}22` }}>
          <div className="flex items-center justify-between gap-1 text-[8.5px] font-mono uppercase tracking-widest text-ops-500 mb-1">
            <span className="inline-flex items-center gap-1">
              <MapPin size={8} /> Saha Varlığı
            </span>
            <span className="text-ops-400 font-bold normal-case tracking-normal">
              {assetCounts.total}
            </span>
          </div>
          <div className="flex flex-wrap gap-1">
            {sahaChips.map((k) => (
              <span
                key={k.id}
                className="inline-flex items-center gap-1 px-1 py-px rounded border text-[9px] font-mono"
                style={{
                  borderColor: `${k.color}66`,
                  color: k.color,
                  background: `${k.color}12`,
                }}
                title={`${k.label}: ${k.count} varlık haritada`}
              >
                {k.label}
                <span className="text-ops-200 font-bold">{k.count}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── 5. Posture chips + free-text note ──────────────── */}
      {(postures.length > 0 || entry?.note) && (
        <div className="px-2 pt-1.5 pb-2 border-t mt-auto" style={{ borderColor: `${colour}22` }}>
          {postures.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-1">
              {postures.map((p, i) => (
                <span
                  key={i}
                  className="inline-flex items-center px-1 py-px rounded text-[8.5px] font-mono font-bold uppercase tracking-wider"
                  style={{ background: `${p.color}22`, color: p.color }}
                  title={p.hint}
                >
                  {p.label}
                </span>
              ))}
            </div>
          )}
          {entry?.note && (
            <p className="text-[9.5px] font-mono text-ops-400 italic leading-snug">
              {entry.note}
            </p>
          )}
        </div>
      )}

      {/* Degenerate case: no breakdown, no equipment, no note. */}
      {items.length === 0 && equipmentOrdered.length === 0 && !entry?.note && (
        <p className="px-2 py-2 text-[9.5px] font-mono text-ops-500 italic">
          alt kırılım seed edilmemiş
        </p>
      )}
    </section>
  )
}

/**
 * Equipment inventory chip grid. Renders the canonical equipment
 * kinds (tank → missile) as a flex-wrap chip strip. Each chip:
 *   • coloured glyph (visual anchor — reads at a glance)
 *   • count (the headline datum)
 *   • short label (second-line, muted)
 *
 * Chips stay compact enough to fit ~3 per row in a half-panel card.
 */
function EquipmentStrip({ items, tint }) {
  return (
    <div className="grid grid-cols-3 gap-1">
      {items.map((it) => {
        const kind = EQUIPMENT_KINDS[it.kind]
        if (!kind) return null
        const hover = it.note
          ? `${kind.label}: ${it.count.toLocaleString('tr-TR')} — ${it.note}`
          : `${kind.label}: ${it.count.toLocaleString('tr-TR')}`
        return (
          <div
            key={it.kind}
            className="flex items-center gap-1 px-1 py-0.5 rounded border bg-ops-900/40"
            style={{ borderColor: `${tint}44` }}
            title={hover}
          >
            <span
              className="shrink-0 w-4 h-4 rounded flex items-center justify-center text-[11px] leading-none"
              style={{
                color: kind.color,
                background: `${kind.color}18`,
                border: `1px solid ${kind.color}55`,
                fontFamily: "'Segoe UI Symbol','Apple Symbols',sans-serif",
              }}
            >
              {kind.glyph}
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <div className="text-[10px] font-mono font-bold text-ops-100 truncate">
                {formatCount(it.count)}
              </div>
              <div className="text-[8.5px] font-mono text-ops-500 truncate uppercase tracking-wider">
                {kind.short}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/**
 * Damage / destruction estimates block. Shows six metric cards in
 * two rows: Ölü / Yaralı / Yerinden · Altyapı% / Ekonomi / Yapı.
 *
 * Numbers are OSINT composite — we cite the source on the Kuvvet
 * footer so the reader can tell this is a triangulated estimate,
 * not an authoritative casualty registry. Zero values render as
 * "—" so dormant/dondurulmuş theatres don't flash the reader with
 * misleading "0 ölü" (implying "we measured and there were none").
 */
function DamageBlock({ id, damage, collapsible, open, onToggle }) {
  const d = damage
  // Extract the first meaningful headline figure for the header badge
  // so the reader sees "~30k ölü" at a glance when the block is closed.
  const headlineNum = damageNum(d.killed)
  const hasHeadline = headlineNum && headlineNum !== '—'
  return (
    <Block
      id={id}
      title="Tahmini Yıkım"
      accent="#C04631"
      collapsible={collapsible}
      open={open}
      onToggle={onToggle}
      headerExtra={
        hasHeadline && (
          <span
            className="inline-flex items-center gap-1 px-1.5 py-px rounded text-[9px] font-mono font-bold uppercase tracking-wider"
            style={{ background: '#C0463122', color: '#E47A62' }}
            title="Tahmini ölü sayısı"
          >
            <Skull size={9} /> {headlineNum}
          </span>
        )
      }
    >
      <div className="grid grid-cols-3 gap-1">
        <DamageCell
          label="Ölü"
          value={damageNum(d.killed)}
          note={damageNote(d.killed)}
          color="#C04631"
          icon={Skull}
        />
        <DamageCell
          label="Yaralı"
          value={damageNum(d.wounded)}
          note={damageNote(d.wounded)}
          color="#B87035"
          icon={HeartPulse}
        />
        <DamageCell
          label="Yerinden"
          value={damageNum(d.displaced)}
          note={damageNote(d.displaced)}
          color="#C9A236"
          icon={Home}
        />
        <DamageCell
          label="Altyapı"
          value={typeof d.infraDamagePct === 'number' ? `${d.infraDamagePct}%` : '—'}
          note={d.infraDamagePct ? 'hasarlı altyapı payı' : null}
          color="#8C6BB3"
          icon={Hammer}
          barPct={typeof d.infraDamagePct === 'number' ? d.infraDamagePct : null}
        />
        <DamageCell
          label="Ekonomi"
          value={d.econDamageUsd || '—'}
          note="kümülatif ekonomik kayıp"
          color="#3E8C6C"
          icon={DollarSign}
        />
        <DamageCell
          label="Sivil Yapı"
          value={damageNum(d.civStructures)}
          note={damageNote(d.civStructures) || 'hasarlı/yıkık konut+bina'}
          color="#5C7FA8"
          icon={Building2}
        />
      </div>
      <p className="mt-2 text-[9px] font-mono text-ops-600 italic leading-snug">
        OSINT kompozit · üçgenleme ile türetilmiş; resmi sicil değildir.
      </p>
    </Block>
  )
}

function DamageCell({ label, value, note, color, icon: Icon, barPct }) {
  return (
    <div
      className="relative flex flex-col min-w-0 px-1.5 py-1.5 rounded border bg-ops-900/40"
      style={{ borderColor: `${color}44` }}
      title={note || label}
    >
      <div className="flex items-center gap-1 text-[8.5px] font-mono uppercase tracking-wider" style={{ color }}>
        {Icon && <Icon size={9} />}
        <span className="truncate">{label}</span>
      </div>
      <div className="text-[12px] font-mono font-bold text-ops-50 leading-tight truncate mt-0.5">
        {value}
      </div>
      {note && (
        <div className="text-[8.5px] font-mono text-ops-500 truncate mt-0.5">
          {note}
        </div>
      )}
      {typeof barPct === 'number' && (
        <div className="mt-1 h-1 rounded-full bg-ops-900 overflow-hidden border border-ops-700/60">
          <div
            className="h-full"
            style={{
              width: `${Math.max(0, Math.min(100, barPct))}%`,
              background: `linear-gradient(90deg, ${color}aa 0%, ${color} 100%)`,
            }}
          />
        </div>
      )}
    </div>
  )
}

/** Helpers for DamageBlock — tolerate either a raw number or a
    {value, note} envelope from the seed file. */
function damageNum(field) {
  if (field == null) return '—'
  if (typeof field === 'number') return field > 0 ? formatCount(field) : '—'
  if (typeof field === 'object' && typeof field.value === 'number') {
    return field.value > 0 ? formatCount(field.value) : '—'
  }
  return String(field)
}
function damageNote(field) {
  if (field && typeof field === 'object' && typeof field.note === 'string') return field.note
  return null
}

/** Integer-friendly compact formatter.
    - <1k       → raw number with Turkish thousand separators
    - <1M       → "45k", "120k"
    - ≥1M       → "2.1M", "11.2M" (one decimal when <10M) */
function formatCount(n) {
  if (n == null || !Number.isFinite(n)) return '—'
  if (n === 0) return '0'
  if (n < 1_000) return String(n)
  if (n < 1_000_000) return `${Math.round(n / 1_000)}k`
  const m = n / 1_000_000
  return `${m < 10 ? m.toFixed(1).replace(/\.0$/, '') : Math.round(m)}M`
}
/* ═══ TAB: SAHA ══════════════════════════════════════════════════════ */
function FieldTab({
  assetsAll, assets, kindFilter, setKindFilter,
  assetsOn, toggleAssets, focusAsset, hoveredAssetId, setHoveredAsset,
  sideLabels,
}) {
  if (assetsAll.length === 0) {
    return (
      <p className="text-[10px] font-mono text-ops-500 italic text-center py-8 px-3 leading-snug">
        Bu tiyatro için stratejik varlık seed edilmemiş.<br/>
        İleride konuşlanma bilgisi geldikçe bu liste dolacak.
      </p>
    )
  }

  // Count per kind for the chip badges.
  const kindCounts = {}
  CONFLICT_ASSET_KINDS.forEach((k) => {
    kindCounts[k.id] = assetsAll.filter(
      (a) => CONFLICT_ASSET_TYPES[a.type]?.kind === k.id
    ).length
  })

  return (
    <div className="p-3">
      {/* Visibility + count header */}
      <div className="flex items-center justify-between gap-1.5 mb-2">
        <div className="text-[10px] font-mono text-ops-400">
          <span className="text-ops-100 font-bold">{assets.length}</span>
          <span className="text-ops-500"> / {assetsAll.length} varlık</span>
        </div>
        <button
          onClick={toggleAssets}
          title={assetsOn ? 'Haritadaki varlık katmanını gizle' : 'Haritadaki varlık katmanını göster'}
          className={`flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-mono transition-colors ${
            assetsOn
              ? 'border-accent/50 text-accent bg-accent/10'
              : 'border-ops-600 text-ops-400 hover:border-ops-400 hover:text-ops-200'
          }`}
        >
          {assetsOn ? <Eye size={10} /> : <EyeOff size={10} />}
          {assetsOn ? 'görünür' : 'gizli'}
        </button>
      </div>

      {/* Kind chips — the main interactivity handle for density control */}
      <div className="flex items-center gap-1 flex-wrap mb-2">
        <KindChip
          id="all"
          label="Tümü"
          count={assetsAll.length}
          active={kindFilter === 'all'}
          color="#9AA6B8"
          onClick={() => setKindFilter('all')}
        />
        {CONFLICT_ASSET_KINDS.map((k) => {
          if (!kindCounts[k.id]) return null
          return (
            <KindChip
              key={k.id}
              id={k.id}
              label={k.label}
              count={kindCounts[k.id]}
              active={kindFilter === k.id}
              color={k.color}
              onClick={() => setKindFilter(k.id)}
            />
          )
        })}
      </div>

      {/* Asset rows — click flies the map, hover syncs to the layer */}
      <div className="space-y-1">
        {assets.map((a) => {
          const type = CONFLICT_ASSET_TYPES[a.type]
          if (!type) return null
          const sideTint = CONFLICT_SIDE_COLOUR[a.side] || '#9AA6B8'
          const sideName = a.side ? sideLabels[a.side] : 'Tarafsız'
          const hot = hoveredAssetId === a.id
          return (
            <button
              key={a.id}
              onClick={() => focusAsset(a)}
              onMouseEnter={() => setHoveredAsset(a.id)}
              onMouseLeave={() => setHoveredAsset(null)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded border text-left transition-colors ${
                hot
                  ? 'border-ops-500 bg-ops-700/60'
                  : 'border-ops-700 bg-ops-900/40 hover:border-ops-600 hover:bg-ops-800/60'
              }`}
              style={{ borderLeft: `3px solid ${sideTint}` }}
            >
              <span
                className="shrink-0 flex items-center justify-center w-5 h-5 rounded border"
                style={{
                  color: type.color,
                  borderColor: `${type.color}55`,
                  background: `${type.color}15`,
                  fontSize: 11,
                  lineHeight: 1,
                  fontFamily: "'Segoe UI Symbol','Apple Symbols',sans-serif",
                }}
              >
                {type.glyph}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-medium text-ops-100 truncate">
                  {a.name}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span
                    className="text-[9px] font-mono uppercase tracking-wider truncate"
                    style={{ color: type.color }}
                  >
                    {type.labelShort}
                  </span>
                  <span className="text-[9px] font-mono text-ops-600 truncate">
                    · {sideName}
                  </span>
                </div>
              </div>
              <ChevronRight size={10} className="text-ops-600 shrink-0" />
            </button>
          )
        })}
        {assets.length === 0 && (
          <p className="text-[10px] font-mono text-ops-500 italic px-1 py-1.5">
            Bu türde varlık yok.
          </p>
        )}
      </div>

      <p className="mt-2 text-[9px] font-mono text-ops-600 italic leading-snug">
        💡 Satıra tıkla → harita varlık noktasına uçar ve popup açılır.
      </p>
    </div>
  )
}

/* ═══ TAB: TAİROS ════════════════════════════════════════════════════ */
function TairosTab({ tairos, priority }) {
  if (!tairos) {
    return (
      <p className="text-[10px] font-mono text-ops-500 italic text-center py-8 px-3">
        Tairos uygunluk değerlendirmesi bu tiyatro için seed edilmemiş.
      </p>
    )
  }
  return (
    <div className="p-3 space-y-3">
      {tairos.headline && (
        <Block title="Baş Yazı" accent="#D85A30">
          <p className="text-[12px] text-ops-100 font-medium leading-snug">
            {tairos.headline}
          </p>
        </Block>
      )}

      {priority.length > 0 && (
        <Block title="Öncelikli Ürünler" accent="#D85A30">
          <div className="flex flex-wrap gap-1.5">
            {priority.map((id) => {
              const p = DRONE_PRODUCTS[id]
              if (!p) return null
              return (
                <div
                  key={id}
                  className="flex items-center gap-1.5 px-2 py-1 rounded"
                  style={{
                    background: `${p.color}1F`,
                    color: p.color,
                    border: `1px solid ${p.color}55`,
                  }}
                  title={p.description}
                >
                  <Target size={10} />
                  <span className="text-[11px] font-mono font-bold uppercase tracking-wide">
                    {p.label}
                  </span>
                  {p.rangeKm && (
                    <span className="text-[9px] font-mono opacity-70">
                      {p.rangeKm} km
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </Block>
      )}

      {tairos.useCases?.length > 0 && (
        <Block title="Operasyonel Senaryolar" accent="#D85A30">
          <ol className="space-y-2 counter-reset list-none">
            {tairos.useCases.map((u, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-[11px] text-ops-200 leading-snug"
              >
                <span
                  className="shrink-0 mt-0.5 w-4 h-4 rounded flex items-center justify-center text-[9px] font-mono font-bold"
                  style={{ background: '#D85A3022', color: '#D85A30', border: '1px solid #D85A3055' }}
                >
                  {i + 1}
                </span>
                <span>{u}</span>
              </li>
            ))}
          </ol>
        </Block>
      )}
    </div>
  )
}

/* ── helpers ────────────────────────────────────────────────────────── */

/**
 * Group wrapper used by every tab — small accent dot + uppercase label.
 *
 * Two modes:
 *   • Static        (default)  title bar + body, always visible
 *   • Collapsible   when `collapsible` is true the whole header becomes a
 *                   button with a chevron, clicking toggles open/closed.
 *                   External control via `open` + `onToggle` lets the
 *                   parent tab orchestrate "expand all / collapse all"
 *                   and a section-jump nav.
 *
 * When `collapsible` is set the block gets a subtle border+bg so the
 * chrome reads as a discrete unit rather than floating body text with a
 * chevron prepended.
 */
function Block({
  id,
  title, accent = '#D85A30', headerExtra, children,
  collapsible = false, open = true, onToggle, defaultOpen = true,
}) {
  const [localOpen, setLocalOpen] = useState(defaultOpen)
  const controlled = typeof onToggle === 'function'
  const isOpen  = collapsible ? (controlled ? open : localOpen) : true
  const toggle  = () => {
    if (!collapsible) return
    if (controlled) onToggle()
    else setLocalOpen((v) => !v)
  }

  if (!collapsible) {
    return (
      <section data-section-id={id}>
        <div className="flex items-center justify-between gap-1.5 mb-1.5">
          <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider" style={{ color: accent }}>
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: accent, boxShadow: `0 0 0 2px ${accent}22` }}
            />
            {title}
          </div>
          {headerExtra}
        </div>
        {children}
      </section>
    )
  }

  return (
    <section
      data-section-id={id}
      className="rounded border bg-ops-900/20 overflow-hidden transition-colors"
      style={{ borderColor: isOpen ? `${accent}40` : '#1E2E48' }}
    >
      <div className="flex items-center">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={isOpen}
          className="flex-1 min-w-0 flex items-center gap-1.5 px-2 py-1.5 text-left hover:bg-ops-800/40 transition-colors"
        >
          <span className="shrink-0 text-ops-500">
            {isOpen ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
          </span>
          <span
            className="shrink-0 w-1.5 h-1.5 rounded-full"
            style={{ background: accent, boxShadow: `0 0 0 2px ${accent}22` }}
          />
          <span
            className="text-[10px] font-mono uppercase tracking-wider truncate"
            style={{ color: accent }}
          >
            {title}
          </span>
        </button>
        {headerExtra && (
          <div className="shrink-0 pr-2 pl-1">{headerExtra}</div>
        )}
      </div>
      {isOpen && <div className="px-2 pb-2 pt-0.5">{children}</div>}
    </section>
  )
}

/**
 * Section-jump strip rendered at the top of heavy tabs. Each chip
 * shows a section title + open/closed status and clicking it either
 * scrolls to the (always-visible) section or opens the collapsible
 * section. The "Tümünü aç / Tümünü kapat" action on the right lets
 * the operator reset the panel density in one click.
 *
 * The chip uses the section's accent colour when open and a muted
 * steel tone when closed so the reader can tell at a glance which
 * sections are surfaced.
 */
function SectionNav({ sections, openMap, onToggle, onExpandAll, onCollapseAll }) {
  const openCount = sections.filter((s) => s.collapsible !== false && openMap[s.id]).length
  const total     = sections.filter((s) => s.collapsible !== false).length
  const allOpen   = total > 0 && openCount === total
  return (
    <div className="sticky top-0 z-10 -mx-3 -mt-3 mb-2 px-3 py-1.5 bg-ops-800/95 backdrop-blur border-b border-ops-700/60">
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-[9px] font-mono uppercase tracking-widest text-ops-500">
          Bölümler · {openCount}/{total}
        </span>
        <button
          type="button"
          onClick={allOpen ? onCollapseAll : onExpandAll}
          className="inline-flex items-center gap-1 text-[9px] font-mono text-ops-400 hover:text-accent transition-colors"
          title={allOpen ? 'Tümünü kapat' : 'Tümünü aç'}
        >
          {allOpen ? <ChevronsDownUp size={10} /> : <ChevronsUpDown size={10} />}
          {allOpen ? 'kapat' : 'aç'}
        </button>
      </div>
      <div className="flex items-center gap-1 flex-wrap">
        {sections.map((s) => {
          const lockedOpen = s.collapsible === false
          const isOpen = lockedOpen ? true : !!openMap[s.id]
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                if (!lockedOpen) onToggle(s.id)
                // Smooth-scroll the section into view so the click always
                // feels responsive even if the section was already open.
                requestAnimationFrame(() => {
                  const el = document.querySelector(`[data-section-id="${s.id}"]`)
                  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
                })
              }}
              title={lockedOpen ? `${s.label} · sabit` : isOpen ? `${s.label} · açık` : `${s.label} · kapalı — aç`}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[9.5px] font-mono transition-colors"
              style={{
                borderColor: isOpen ? `${s.accent}66` : '#2A3F5A',
                color:       isOpen ? s.accent : '#7A8AA0',
                background:  isOpen ? `${s.accent}14` : 'transparent',
              }}
            >
              <span
                className="w-1 h-1 rounded-full"
                style={{ background: isOpen ? s.accent : '#4A5F80' }}
              />
              {s.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Shared hook that gives each tab a keyed open/closed map plus the
 * imperative helpers the SectionNav needs. Smart defaults live in
 * `initial`; resetting happens automatically whenever the conflict
 * id changes so reopening a theatre starts with a clean slate.
 */
function useSectionOpenState(conflictId, initial) {
  const [openMap, setOpenMap] = useState(initial)
  useEffect(() => { setOpenMap(initial) }, [conflictId])    // eslint-disable-line react-hooks/exhaustive-deps
  const toggle      = (id) => setOpenMap((m) => ({ ...m, [id]: !m[id] }))
  const expandAll   = () => setOpenMap((m) => {
    const next = { ...m }
    Object.keys(next).forEach((k) => { next[k] = true })
    return next
  })
  const collapseAll = () => setOpenMap((m) => {
    const next = { ...m }
    Object.keys(next).forEach((k) => { next[k] = false })
    return next
  })
  return { openMap, toggle, expandAll, collapseAll }
}

/**
 * Güncel Gelişmeler feed.
 *
 * An OSINT news-style ticker inside the brief tab. Shows the latest N
 * developments up front, and opens the full list on demand. Each card
 * carries:
 *   • a coloured left rail (severity vocabulary)
 *   • a severity pill + relative date chip ("bugün" / "2 g önce" …)
 *   • a headline and short summary
 *   • optional tags and a source line
 *
 * The feed is deliberately styled differently from the other Blocks in
 * the panel — it should read as a "stream" of events, not a static
 * data card.
 */
function DevelopmentsFeed({ id, updates, accent, collapsible, open, onToggle }) {
  const [expanded, setExpanded] = useState(false)
  const VISIBLE_CLOSED = 3
  const items = expanded ? updates : updates.slice(0, VISIBLE_CLOSED)
  const hiddenCount = updates.length - VISIBLE_CLOSED
  // Latest timestamp we have — rendered in the header so the operator
  // knows how fresh this feed is without scanning every row.
  const latestDate = updates[0]?.date

  return (
    <Block
      id={id}
      title="Güncel Gelişmeler"
      accent={accent}
      collapsible={collapsible}
      open={open}
      onToggle={onToggle}
      headerExtra={
        <div className="flex items-center gap-1.5 text-[9px] font-mono text-ops-500">
          <Newspaper size={9} />
          <span>{updates.length} girdi</span>
          {latestDate && (
            <>
              <span className="text-ops-700">·</span>
              <span title={latestDate}>{relativeDate(latestDate)}</span>
            </>
          )}
        </div>
      }
    >
      <ol className="space-y-1.5">
        {items.map((u, i) => (
          <DevelopmentCard key={`${u.date}-${i}`} update={u} />
        ))}
      </ol>
      {hiddenCount > 0 && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-1.5 w-full flex items-center justify-center gap-1 px-2 py-1 rounded border border-dashed border-ops-600 text-[10px] font-mono text-ops-400 hover:border-accent/60 hover:text-accent transition-colors"
        >
          {expanded ? (
            <>Daha az göster</>
          ) : (
            <>
              <ArrowUpRight size={10} />
              {hiddenCount} eski gelişmeyi aç
            </>
          )}
        </button>
      )}
    </Block>
  )
}

function DevelopmentCard({ update }) {
  const sev = DEV_SEVERITY[update.severity] || DEV_SEVERITY.routine
  const SevIcon = sev.icon
  return (
    <li
      className="relative pl-2.5 pr-2 py-2 rounded bg-ops-900/40 border border-ops-700/80 hover:border-ops-600 transition-colors group"
    >
      {/* Left severity rail — coloured bar that doubles as a priority hint. */}
      <span
        className="absolute left-0 top-1 bottom-1 w-[3px] rounded-r"
        style={{ background: sev.color }}
        aria-hidden
      />
      <div className="flex items-start gap-1.5 mb-1">
        <span
          className="inline-flex items-center gap-1 px-1.5 py-px rounded text-[9px] font-mono font-bold uppercase tracking-wider"
          style={{ background: `${sev.color}22`, color: sev.color }}
          title={`Önem: ${sev.label.toLowerCase()}`}
        >
          <SevIcon size={9} /> {sev.label}
        </span>
        <span
          className="ml-auto inline-flex items-center gap-1 text-[9px] font-mono text-ops-500"
          title={update.date}
        >
          <Clock size={8} /> {relativeDate(update.date)}
        </span>
      </div>
      <h4 className="text-[11.5px] font-semibold text-ops-50 leading-snug">
        {update.headline}
      </h4>
      {update.summary && (
        <p className="mt-1 text-[10.5px] text-ops-300 leading-relaxed">
          {update.summary}
        </p>
      )}
      {(update.tags?.length || update.source) && (
        <div className="mt-1.5 flex items-center gap-1 flex-wrap">
          {update.tags?.map((t) => (
            <span
              key={t}
              className="inline-flex items-center px-1.5 py-px rounded bg-ops-800/60 border border-ops-700 text-[9px] font-mono text-ops-400"
            >
              {t}
            </span>
          ))}
          {update.source && (
            <span
              className="ml-auto inline-flex items-center gap-1 text-[9px] font-mono text-ops-600 truncate max-w-[60%]"
              title={update.source}
            >
              <Radio size={8} /> {update.source}
            </span>
          )}
        </div>
      )}
    </li>
  )
}

/**
 * Relative date formatter — produces "bugün", "dün", "3 g önce", "2 hf önce",
 * "mm/dd" for anything older than ~2 months. Clips to minutes if the date
 * somehow comes in as a full ISO timestamp. Absolute date always survives
 * in the surrounding `title=` tooltip.
 */
function relativeDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const now = new Date()
  const diffMs = now - d
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays < 0) return iso.slice(5)     // future date → show MM-DD
  if (diffDays === 0) return 'bugün'
  if (diffDays === 1) return 'dün'
  if (diffDays < 7)  return `${diffDays} g önce`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} hf önce`
  if (diffDays < 90) return `${Math.floor(diffDays / 30)} ay önce`
  return iso.slice(5) // "MM-DD" fallback for older entries
}

/** Metric dashboard card. Clickable to jump to its tab. */
function MetricCard({ label, value, sub, color, icon: Icon, renderExtra, onClick }) {
  return (
    <button
      onClick={onClick}
      className="bg-ops-800 px-2 py-1.5 text-left hover:bg-ops-700/60 transition-colors flex flex-col gap-0.5 min-w-0"
      title={label}
    >
      <div className="flex items-center gap-1 text-[9px] font-mono uppercase tracking-wider text-ops-500 leading-none">
        {Icon && <Icon size={9} style={{ color }} />}
        <span className="truncate">{label}</span>
      </div>
      <div className="text-[13px] font-mono font-bold text-ops-50 leading-tight truncate">
        {value}
      </div>
      {sub && (
        <div className="text-[9px] font-mono text-ops-500 truncate">{sub}</div>
      )}
      {renderExtra && <div className="mt-0.5">{renderExtra()}</div>}
    </button>
  )
}

/** Compact 5-pip severity indicator for the MetricCard. */
function SeverityBar({ v, color }) {
  const n = Math.max(0, Math.min(5, Number(v) || 0))
  return (
    <div className="flex gap-[2px]">
      {Array.from({ length: 5 }).map((_, i) => (
        <span
          key={i}
          className="h-1 flex-1 rounded-sm"
          style={{ background: i < n ? color : '#1E2E48' }}
        />
      ))}
    </div>
  )
}

/** Qualitative severity banner. */
function severityLabel(n) {
  const v = Number(n) || 0
  if (v >= 5) return 'kritik'
  if (v >= 4) return 'yüksek'
  if (v >= 3) return 'orta'
  if (v >= 2) return 'düşük'
  return 'gözlem'
}

/** Duration ribbon — visual bar from startedYear to this year. */
function DurationRibbon({ startedYear, color }) {
  const now = new Date().getFullYear()
  const years = Math.max(1, now - startedYear)
  const ticks = Array.from({ length: years + 1 })
  return (
    <div className="relative h-5 rounded border border-ops-700 bg-ops-900/40 overflow-hidden">
      <div
        className="absolute inset-y-0 left-0"
        style={{ width: '100%', background: `linear-gradient(90deg, ${color}44, ${color}11)` }}
      />
      <div className="absolute inset-0 flex items-end justify-between px-1 pb-0.5">
        {ticks.map((_, i) => (
          <span
            key={i}
            className="w-px bg-ops-500"
            style={{ height: i === 0 || i === years ? '70%' : '40%', opacity: i === 0 || i === years ? 1 : 0.5 }}
          />
        ))}
      </div>
      <span
        className="absolute top-1/2 -translate-y-1/2 right-1 w-2 h-2 rounded-full animate-pulse"
        style={{ background: color, boxShadow: `0 0 8px ${color}` }}
        title="şimdi"
      />
    </div>
  )
}

/** Kind-filter chip used on the SAHA tab. */
function KindChip({ label, count, active, color, onClick }) {
  return (
    <button
      onClick={onClick}
      className="px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors border"
      style={
        active
          ? { borderColor: color, color: color, background: `${color}1A` }
          : { borderColor: '#2A3F5A', color: '#7A8AA0', background: 'transparent' }
      }
    >
      {label} <span className="opacity-60">· {count}</span>
    </button>
  )
}

/**
 * Classify the force ratio into a qualitative band. Driven by pure
 * multiplier, not absolute numbers — a 4:1 ratio is "asymmetric"
 * whether the weaker side is 5k or 500k. Returned object carries a
 * label (used as a chip), a colour (palette-matched so SİMETRİK reads
 * cool and AĞIR ASİMETRİK reads hot), and a tooltip hint.
 */
function classifyBalance(r) {
  if (!r || r < 1) return null
  if (r < 1.3) return { label: 'SİMETRİK',       color: '#3E8C6C', hint: 'Yakın nicel denklik — simetrik cephe dinamiği.' }
  if (r < 2)   return { label: 'DENGESİZ',       color: '#5C7FA8', hint: 'Bir tarafın kayda değer sayısal avantajı var.' }
  if (r < 4)   return { label: 'ASİMETRİK',      color: '#B87035', hint: 'Klasik asimetrik çatışma — küçük taraf savunma / vekâlet.' }
  return         { label: 'AĞIR ASİMETRİK', color: '#C04631', hint: 'Zayıf taraf yalnızca gayri-nizami yöntemlerle dayanabilir.' }
}

/**
 * Posture keyword miner. The seed data's free-text `note` field encodes
 * posture hints in natural language ("genel seferberlik altında",
 * "rotasyonla beslenen cephe", "PMC içerir", etc.). We lift these into
 * structured chips so the operator gets the signal without reading
 * the paragraph.
 *
 * Each entry returns { label, color, hint } matching the posture pill
 * style used in ForceCard.
 */
function detectPosture(note) {
  if (!note || typeof note !== 'string') return []
  const n = note.toLowerCase()
  const rules = [
    { rx: /seferberlik|mobilizasyon/,                  label: 'SEFERBERLIK',  color: '#C04631', hint: 'Genel ya da kısmi seferberlik altında.' },
    { rx: /rotasyon/,                                  label: 'ROTASYONLU',   color: '#B87035', hint: 'Cephe rotasyonla beslenir — görev süresi sınırlı.' },
    { rx: /rezerv|yedek/,                              label: 'REZERV DAHIL', color: '#5C7FA8', hint: 'Toplama aktif ordu dışı rezerv/milis dahil edildi.' },
    { rx: /gerilla|tünel|hücre|asimetrik|gayri/,       label: 'ASIMETRİK',    color: '#8C6BB3', hint: 'Düzensiz harp / hücre tabanlı yapı.' },
    { rx: /koalisyon|müttefik|destek/,                 label: 'KOALİSYON',    color: '#3E8C6C', hint: 'Yabancı ordu unsurları veya müttefik destek mevcut.' },
    { rx: /paralı|pmc|wagner/,                         label: 'PMC DAHIL',    color: '#9E5A48', hint: 'Özel askeri şirketler muharebe düzeni içinde.' },
    { rx: /danışman/,                                  label: 'DANIŞMAN VAR', color: '#C9A236', hint: 'Yabancı danışman kadroları raporlanıyor.' },
    { rx: /vekâlet|vekalet|proxy|vekil/,               label: 'VEKÂLET',      color: '#A484C0', hint: 'Vekâleten muharebe eden unsurlar mevcut.' },
    { rx: /hava\+|hava lojistik|hava destek/,          label: 'HAVA DESTEK',  color: '#6FA4DC', hint: 'Hava kuvveti ile lojistik destek belirgin.' },
    { rx: /deniz|donanma|filo/,                        label: 'DENİZ UNSURU', color: '#3E74B8', hint: 'Donanma unsurları muharebe düzeninde.' },
  ]
  const seen = new Set()
  const out = []
  for (const r of rules) {
    if (r.rx.test(n) && !seen.has(r.label)) {
      seen.add(r.label)
      out.push(r)
    }
  }
  return out
}

/**
 * Best-effort numeric parse of a force-estimate string.
 *
 * Examples it's designed to handle (seed data is Turkish/English mix):
 *   "~900.000"       → 900000
 *   "900k+"          → 900000
 *   "70 bin aktif"   → 70000
 *   "2.5m"           → 2500000
 *   "1,2 milyon"     → 1200000
 *
 * We intentionally take the FIRST numeric token only — summing every
 * number in the string would double-count when a breakdown follows
 * ("70k aktif + 40k milis = 110k"). Returns 0 when nothing usable is
 * found; the caller hides the balance bar in that case.
 */
function parseForceEstimate(s) {
  if (!s || typeof s !== 'string') return 0
  const norm = s.replace(/\./g, '').replace(/,/g, '.').toLowerCase()
  const m = norm.match(/([\d.]+)\s*(milyon|million|m|bin|k|thousand)?/)
  if (!m) return 0
  const n = parseFloat(m[1]) || 0
  const unit = m[2]
  if (unit === 'milyon' || unit === 'million' || unit === 'm') return Math.round(n * 1_000_000)
  if (unit === 'bin'    || unit === 'k' || unit === 'thousand') return Math.round(n * 1_000)
  return Math.round(n)
}

/** Compact human readout for the force balance tooltip. */
function formatApprox(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}m`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}k`
  return String(n)
}
