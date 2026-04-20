import React, { useState } from 'react'
import { Boxes, Plane, Anchor, Truck, Shield, X } from 'lucide-react'
import useStore from '../../store/useStore'
import { getCountry } from '../../config/countries'
import {
  inventoryOf, BRANCH_ORDER, KIND_LABELS, STATUS_STYLE,
} from '../../config/countryInventory'
import { Section } from './_shared'

/**
 * CountryInventoryPanel
 *
 * Ülke odağı açıkken o ülkenin askeri envanterini 4 branch'e (Hava,
 * Deniz, Kara, Hava Savunma) ayırıp, her kalemi sayı + durum rozetiyle
 * listeleyen panel. Operatör hangisi olursa olsun içerik odak ülkeye
 * aittir. Operatör bağlamı YALNIZCA "bu benim kendi envanterim mi,
 * yoksa başka bir ülkeyi mi inceliyorum" ayrımını görsel olarak
 * güçlendirmek için kullanılır (başlıkta "kendi" rozeti).
 */

const BRANCH_ICONS = {
  air:  Plane,
  navy: Anchor,
  land: Truck,
  sam:  Shield,
}

export default function CountryInventoryPanel() {
  const focusCountry    = useStore((s) => s.focusCountry)
  const operator        = useStore((s) => s.operator)
  const exitCountryFocus = useStore((s) => s.exitCountryFocus)
  const [filter, setFilter] = useState('all')   // 'all' | 'active' | 'reserve' | 'order'

  if (!focusCountry) {
    return (
      <div className="p-5 text-[11px] text-ops-500 font-mono leading-relaxed">
        Ülke odağı aktif değil. Bir ülke seç → envanter burada görünür.
      </div>
    )
  }

  const meta = getCountry(focusCountry)
  const inv  = inventoryOf(focusCountry)
  const isSelf = focusCountry === operator

  if (!inv) {
    return (
      <div className="flex-1 overflow-y-auto">
        <CountryHeader meta={meta} isSelf={isSelf} onExit={exitCountryFocus} />
        <div className="p-5 text-[11px] text-ops-500 leading-relaxed">
          <div className="mb-2 text-ops-400 font-mono uppercase text-[10px] tracking-wider">
            Envanter seed'i yok
          </div>
          <p className="text-ops-500">
            {meta.label} için <span className="text-ops-400">config/countryInventory.js</span>'e
            henüz bir giriş eklenmedi. Dosyaya bir kayıt eklemek tek satır —
            şema zaten orada dokümante.
          </p>
        </div>
      </div>
    )
  }

  const statusFilterActive = filter !== 'all'

  return (
    <div className="flex-1 overflow-y-auto">
      <CountryHeader meta={meta} isSelf={isSelf} onExit={exitCountryFocus} />

      {/* ── Toplam personel şeridi ──────────────────────── */}
      {inv.summary && (
        <div className="px-3 py-2 border-b border-ops-700/70 grid grid-cols-3 gap-1.5">
          <MiniStat label="Aktif"      value={inv.summary.active} />
          <MiniStat label="İhtiyat"    value={inv.summary.reserve} />
          <MiniStat label="Paramiliter" value={inv.summary.paramilitary} />
        </div>
      )}

      {/* ── Durum filtresi chips ────────────────────────── */}
      <div className="px-3 py-2 border-b border-ops-700/70 flex items-center gap-1 flex-wrap">
        <span className="text-[9px] uppercase tracking-wider text-ops-500 font-mono">Durum:</span>
        {['all','active','reserve','order','retiring'].map((k) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`text-[10px] font-mono px-1.5 py-0.5 rounded border transition-all ${
              filter === k
                ? 'border-accent text-accent bg-accent/10'
                : 'border-ops-700 text-ops-500 hover:text-ops-300'
            }`}
          >
            {k === 'all' ? 'tümü' : (STATUS_STYLE[k]?.label?.toLowerCase() || k)}
          </button>
        ))}
      </div>

      {/* ── Branches ────────────────────────────────────── */}
      {BRANCH_ORDER.map((bid) => {
        const b = inv.branches?.[bid]
        if (!b) return null
        const items = statusFilterActive
          ? b.items.filter((it) => it.status === filter)
          : b.items
        if (statusFilterActive && items.length === 0) return null
        const Icon = BRANCH_ICONS[bid] || Boxes

        return (
          <Section
            key={bid}
            icon={Icon}
            title={b.label}
            badge={items.length}
            defaultOpen={bid === 'air'}
          >
            <div className="px-3 space-y-0.5">
              {items.map((it, i) => (
                <InventoryRow key={`${bid}-${i}`} item={it} />
              ))}
            </div>
          </Section>
        )
      })}
    </div>
  )
}

/* ── Parçalar ─────────────────────────────────────────── */

function CountryHeader({ meta, isSelf, onExit }) {
  return (
    <div className="px-3 pt-3 pb-2 border-b border-ops-700/70 bg-ops-900/30 flex items-center gap-2">
      <span className="text-2xl leading-none">{meta.flag}</span>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] font-mono uppercase tracking-wider text-ops-500">
          {isSelf ? 'Kendi envanter' : 'Ülke envanter'}
        </div>
        <div className="text-sm font-semibold text-ops-100 truncate">
          {meta.label}
        </div>
      </div>
      {isSelf && (
        <span className="shrink-0 text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-accent/10 border border-accent/40 text-accent">
          BEN
        </span>
      )}
      <button
        onClick={onExit}
        className="shrink-0 px-1.5 py-1 rounded border border-ops-600 text-ops-400 hover:text-red-400 hover:border-red-400/50 transition-colors"
        title="Ülke odağından çık"
      >
        <X size={12} />
      </button>
    </div>
  )
}

function MiniStat({ label, value }) {
  const v = typeof value === 'number'
    ? value >= 1_000_000
      ? (value / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
      : value >= 1000
        ? (value / 1000).toFixed(0) + 'K'
        : String(value)
    : '—'
  return (
    <div className="rounded border border-ops-700 bg-ops-800/40 px-2 py-1">
      <div className="text-[9px] font-mono uppercase tracking-wider text-ops-500">{label}</div>
      <div className="text-xs font-mono text-ops-100">{v}</div>
    </div>
  )
}

function InventoryRow({ item }) {
  const status = STATUS_STYLE[item.status] || STATUS_STYLE.active
  const kindLabel = KIND_LABELS[item.kind] || item.kind
  const originTag = item.origin === 'domestic'   ? 'yerli'
                  : item.origin === 'co-produced' ? 'ortak'
                  : null
  return (
    <div
      className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-ops-700/40 transition-colors"
      title={item.note || item.name}
    >
      <span
        className="shrink-0 w-1.5 h-1.5 rounded-full"
        style={{ background: status.color }}
      />
      <div className="flex-1 min-w-0">
        <div className="text-xs text-ops-100 truncate leading-tight">{item.name}</div>
        <div className="text-[9px] font-mono text-ops-500 flex items-center gap-1.5">
          <span>{kindLabel}</span>
          {originTag && (
            <span className="px-1 py-px rounded bg-ops-700/60 text-ops-400 uppercase tracking-wider text-[8px]">
              {originTag}
            </span>
          )}
          {item.note && item.note.length < 40 && (
            <span className="text-ops-600 italic truncate">· {item.note}</span>
          )}
        </div>
      </div>
      <span
        className="shrink-0 text-xs font-mono px-1.5 py-0.5 rounded"
        style={{
          background: `${status.color}18`,
          color: status.color,
        }}
      >
        {typeof item.count === 'number' ? fmt(item.count) : item.count}
      </span>
    </div>
  )
}

function fmt(n) {
  if (typeof n !== 'number') return n
  if (n >= 10_000) return (n / 1000).toFixed(0) + 'K'
  if (n >= 1000)   return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K'
  return String(n)
}
