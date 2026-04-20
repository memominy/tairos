import React, { useState, useMemo } from 'react'
import { Building2, MapPin, X } from 'lucide-react'
import useStore from '../../store/useStore'
import { getCountry } from '../../config/countries'
import {
  criticalSitesOf, SITE_KIND_LABELS, PRIORITY_STYLE,
} from '../../config/countryCriticalSites'
import { Section } from './_shared'

/**
 * CountryCriticalSitesPanel
 *
 * Odak ülkenin kendi topraklarındaki stratejik düğümler — başkent,
 * nükleer tesisler, stratejik hava ve deniz üsleri, liman/enerji
 * altyapısı. Bu panel "biz o ülke olsak neyi kaybetmeyi göze alamayız"
 * listesidir.
 *
 * globalSites.json ile karıştırılmamalı: orası bir operatörün
 * YURT DIŞI ileri üslerini gösterir (US'nin Ramstein'i gibi).
 * Burası ülkenin KENDİ toprağındaki hassas noktalardır.
 *
 * Tıklayınca harita o noktaya fly-to yapar. Priority'ye göre
 * gruplama, kind'a göre filtre chip'leri.
 */
export default function CountryCriticalSitesPanel() {
  const focusCountry     = useStore((s) => s.focusCountry)
  const exitCountryFocus = useStore((s) => s.exitCountryFocus)
  const flyToPoint       = useStore((s) => s.flyToPoint)

  const [kindFilter, setKindFilter] = useState('all')

  if (!focusCountry) {
    return (
      <div className="p-5 text-[11px] text-ops-500 font-mono leading-relaxed">
        Ülke odağı aktif değil. Bir ülke seç → kritik tesisler burada görünür.
      </div>
    )
  }

  const meta  = getCountry(focusCountry)
  const sites = criticalSitesOf(focusCountry)

  // Tüm kind'ları çıkar (filtre chip'leri için)
  const kinds = useMemo(() => {
    const s = new Set()
    sites.forEach((x) => s.add(x.kind))
    return Array.from(s)
  }, [sites])

  const filtered = kindFilter === 'all'
    ? sites
    : sites.filter((s) => s.kind === kindFilter)

  // Priority gruplandırması
  const byPriority = useMemo(() => {
    const acc = { 1: [], 2: [], 3: [] }
    filtered.forEach((s) => {
      const p = s.priority || 3
      if (!acc[p]) acc[p] = []
      acc[p].push(s)
    })
    return acc
  }, [filtered])

  return (
    <div className="flex-1 overflow-y-auto">
      {/* ── Başlık ───────────────────────────────────────── */}
      <div className="px-3 pt-3 pb-2 border-b border-ops-700/70 bg-ops-900/30 flex items-center gap-2">
        <span className="text-2xl leading-none">{meta.flag}</span>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-mono uppercase tracking-wider text-ops-500">
            Kritik Tesisler
          </div>
          <div className="text-sm font-semibold text-ops-100 truncate">
            {meta.label}
          </div>
        </div>
        <button
          onClick={exitCountryFocus}
          className="shrink-0 px-1.5 py-1 rounded border border-ops-600 text-ops-400 hover:text-red-400 hover:border-red-400/50 transition-colors"
          title="Ülke odağından çık"
        >
          <X size={12} />
        </button>
      </div>

      {sites.length === 0 ? (
        <div className="p-5 text-[11px] text-ops-500 leading-relaxed">
          <div className="mb-2 text-ops-400 font-mono uppercase text-[10px] tracking-wider">
            Tesis seed'i yok
          </div>
          <p className="text-ops-500">
            {meta.label} için <span className="text-ops-400">config/countryCriticalSites.js</span>'e
            kayıt eklenmedi. Şema dosyada dokümante.
          </p>
        </div>
      ) : (
        <>
          {/* ── Kind filtresi ──────────────────────── */}
          <div className="px-3 py-2 border-b border-ops-700/70 flex items-center gap-1 flex-wrap">
            <span className="text-[9px] uppercase tracking-wider text-ops-500 font-mono">Tür:</span>
            <button
              onClick={() => setKindFilter('all')}
              className={`text-[10px] font-mono px-1.5 py-0.5 rounded border transition-all ${
                kindFilter === 'all'
                  ? 'border-accent text-accent bg-accent/10'
                  : 'border-ops-700 text-ops-500 hover:text-ops-300'
              }`}
            >
              tümü · {sites.length}
            </button>
            {kinds.map((k) => (
              <button
                key={k}
                onClick={() => setKindFilter(k)}
                className={`text-[10px] font-mono px-1.5 py-0.5 rounded border transition-all ${
                  kindFilter === k
                    ? 'border-accent text-accent bg-accent/10'
                    : 'border-ops-700 text-ops-500 hover:text-ops-300'
                }`}
              >
                {SITE_KIND_LABELS[k]?.toLowerCase() || k}
              </button>
            ))}
          </div>

          {/* ── Priority gruplandırması ─────────────── */}
          {[1, 2, 3].map((p) => {
            const list = byPriority[p]
            if (!list || list.length === 0) return null
            const style = PRIORITY_STYLE[p]
            return (
              <Section
                key={p}
                icon={Building2}
                title={style.label}
                badge={list.length}
                defaultOpen={p === 1}
              >
                <div className="px-3 space-y-0.5">
                  {list.map((s) => (
                    <SiteRow
                      key={s.id}
                      site={s}
                      onFly={() => flyToPoint(s.lat, s.lng, 9)}
                    />
                  ))}
                </div>
              </Section>
            )
          })}
        </>
      )}
    </div>
  )
}

/* ── Parça ─────────────────────────────────────────────── */

function SiteRow({ site, onFly }) {
  const kindLabel = SITE_KIND_LABELS[site.kind] || site.kind
  const pri       = PRIORITY_STYLE[site.priority || 3]
  return (
    <button
      onClick={onFly}
      className="w-full flex items-center gap-2 px-1.5 py-1.5 rounded hover:bg-ops-700/50 transition-colors text-left group"
      title={site.note ? `${site.name}\n${site.note}` : site.name}
    >
      <span
        className="shrink-0 w-1.5 h-1.5 rounded-full"
        style={{ background: pri.color, boxShadow: `0 0 0 2px ${pri.color}22` }}
      />
      <div className="flex-1 min-w-0">
        <div className="text-xs text-ops-100 truncate leading-tight group-hover:text-ops-50">
          {site.name}
        </div>
        <div className="text-[9px] font-mono text-ops-500 flex items-center gap-1.5">
          <span>{kindLabel}</span>
          {site.note && (
            <span className="text-ops-600 italic truncate">· {site.note}</span>
          )}
        </div>
      </div>
      <MapPin size={11} className="shrink-0 text-ops-500 group-hover:text-accent transition-colors" />
    </button>
  )
}
