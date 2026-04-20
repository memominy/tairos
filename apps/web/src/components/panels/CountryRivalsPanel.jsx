import React, { useMemo } from 'react'
import { Swords, Flame, MapPin, X, ArrowLeftRight } from 'lucide-react'
import useStore from '../../store/useStore'
import {
  COUNTRIES, getCountry, rivalsOf, conflictIdsOf,
} from '../../config/countries'
import { criticalSitesOf } from '../../config/countryCriticalSites'
import conflicts from '../../data/conflicts.json'
import { Section } from './_shared'

/**
 * CountryRivalsPanel
 *
 * Ülke odağı açıkken — o ülkenin rakipleri ve dahil olduğu çatışmaların
 * taraf/karşı-taraf bakış açısı. Kullanıcı geri bildirimi:
 *
 *   "ulke sectikten sonra ulke ici konflikt varsa oradada taraf secme
 *    seysi olabilir — bizim usslerimiz dumsna usleri yapilari"
 *
 * Yapı:
 *   1. Rakip ülkeler (bilateral) — chip listesi, click → o ülkeye odak
 *   2. Aktif çatışmalar — her çatışma için:
 *      a. Taraf seçici (A ↔ B) — default: odak ülkenin olduğu taraf
 *      b. Seçili tarafın kuvvet özeti
 *      c. "Bizim üslerimiz" / "Düşman üsleri" hızlı erişim (fly-to liste)
 *      d. Çatışma odağına gir butonu (full Conflict Focus)
 */
export default function CountryRivalsPanel() {
  const focusCountry     = useStore((s) => s.focusCountry)
  const setFocusCountry  = useStore((s) => s.setFocusCountry)
  const exitCountryFocus = useStore((s) => s.exitCountryFocus)
  const enterConflictFocus = useStore((s) => s.enterConflictFocus)
  const flyToPoint       = useStore((s) => s.flyToPoint)
  const sideByConflict     = useStore((s) => s.focusSideByConflict)
  const setSideForConflict = useStore((s) => s.setFocusSide)

  if (!focusCountry) {
    return (
      <div className="p-5 text-[11px] text-ops-500 font-mono leading-relaxed">
        Ülke odağı aktif değil. Bir ülke seç → rakipler burada görünür.
      </div>
    )
  }

  const meta        = getCountry(focusCountry)
  const rivals      = rivalsOf(focusCountry)
  const conflictIds = conflictIdsOf(focusCountry)
  const myConflicts = conflicts.filter((c) => conflictIds.includes(c.id))

  return (
    <div className="flex-1 overflow-y-auto">
      {/* ── Başlık ─────────────────────────────────────── */}
      <div className="px-3 pt-3 pb-2 border-b border-ops-700/70 bg-ops-900/30 flex items-center gap-2">
        <span className="text-2xl leading-none">{meta.flag}</span>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-mono uppercase tracking-wider text-ops-500">
            Rakipler & Çatışmalar
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

      {/* ── Rakip ülkeler (bilateral) ──────────────────── */}
      <Section icon={Swords} title="Rakip Ülkeler" badge={rivals.length || null} defaultOpen>
        <div className="px-3">
          {rivals.length === 0 ? (
            <div className="text-[11px] text-ops-600 italic leading-snug">
              {meta.label} için rakip tanımlanmamış.
              <br />
              <span className="text-ops-500">config/countries.js</span> içindeki rivals listesine ekle.
            </div>
          ) : (
            <div className="flex flex-wrap gap-1">
              {rivals.map((r) => (
                <button
                  key={r.code}
                  onClick={() => setFocusCountry(r.code)}
                  className="flex items-center gap-1.5 px-2 py-1 rounded border border-ops-700 hover:border-yellow-400/50 hover:bg-yellow-400/5 transition-all group"
                  title={`Odağı ${r.label}'e kaydır`}
                >
                  <span className="text-base leading-none">{r.flag}</span>
                  <span className="text-xs text-ops-200 group-hover:text-ops-50">
                    {r.label}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </Section>

      {/* ── Aktif çatışmalar ───────────────────────────── */}
      {myConflicts.length > 0 ? (
        myConflicts.map((c) => (
          <ConflictBlock
            key={c.id}
            conflict={c}
            focusCountry={focusCountry}
            selectedSide={sideByConflict?.[c.id] || inferDefaultSide(c, focusCountry)}
            onSideChange={(side) => setSideForConflict(c.id, side)}
            onEnterFocus={() => enterConflictFocus(c)}
            onFly={flyToPoint}
          />
        ))
      ) : (
        <Section icon={Flame} title="Dahil Olduğu Çatışmalar" defaultOpen>
          <div className="px-3 text-[11px] text-ops-600 italic leading-snug">
            {meta.label} aktif bir çatışma kaydında tanımlı değil.
            <br />
            <span className="text-ops-500">config/countries.js</span> içindeki conflicts listesine ekle.
          </div>
        </Section>
      )}
    </div>
  )
}

/* ── Tek çatışma bloğu ────────────────────────────────── */

function ConflictBlock({ conflict, focusCountry, selectedSide, onSideChange, onEnterFocus, onFly }) {
  const sideALabel = conflict.frontline?.sideA || conflict.theatre?.sideA?.label || conflict.parties?.[0] || 'Side A'
  const sideBLabel = conflict.frontline?.sideB || conflict.theatre?.sideB?.label || conflict.parties?.[1] || 'Side B'

  // Seçili tarafın karşısındaki ülke — odak ülke rakiplerinden bul
  const otherCode = useMemo(() => {
    const focusMeta = COUNTRIES[focusCountry]
    if (!focusMeta?.rivals?.length) return null
    // Aynı çatışmayı paylaşan rakip — büyük ihtimalle "öteki taraf"
    return focusMeta.rivals.find((r) =>
      (COUNTRIES[r]?.conflicts || []).includes(conflict.id)
    ) || null
  }, [focusCountry, conflict.id])

  const selfIsA = selectedSide === 'A'
  const mySideLabel    = selfIsA ? sideALabel : sideBLabel
  const enemySideLabel = selfIsA ? sideBLabel : sideALabel

  const forces       = conflict.forces || {}
  const mySideForce    = selfIsA ? forces.sideA : forces.sideB
  const enemySideForce = selfIsA ? forces.sideB : forces.sideA

  const mySites    = criticalSitesOf(focusCountry)
  const enemySites = otherCode ? criticalSitesOf(otherCode) : []
  const otherMeta  = otherCode ? getCountry(otherCode) : null

  return (
    <Section
      icon={Flame}
      title={conflict.shortName || conflict.name}
      badge={conflict.status || 'active'}
      defaultOpen
    >
      <div className="px-3 space-y-3">
        {/* Taraf seçici */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => onSideChange('A')}
            className={`flex-1 text-[10px] font-mono px-2 py-1 rounded border transition-all truncate ${
              selfIsA
                ? 'border-accent text-accent bg-accent/10'
                : 'border-ops-700 text-ops-500 hover:text-ops-300'
            }`}
            title={sideALabel}
          >
            A · {sideALabel}
          </button>
          <button
            onClick={() => onSideChange(selfIsA ? 'B' : 'A')}
            className="px-1.5 py-1 rounded border border-ops-700 text-ops-500 hover:text-ops-300 transition-colors"
            title="Tarafı değiştir"
          >
            <ArrowLeftRight size={11} />
          </button>
          <button
            onClick={() => onSideChange('B')}
            className={`flex-1 text-[10px] font-mono px-2 py-1 rounded border transition-all truncate ${
              !selfIsA
                ? 'border-accent text-accent bg-accent/10'
                : 'border-ops-700 text-ops-500 hover:text-ops-300'
            }`}
            title={sideBLabel}
          >
            B · {sideBLabel}
          </button>
        </div>

        {/* Kuvvet özeti kartları */}
        <div className="grid grid-cols-2 gap-1.5">
          <ForceCard
            label={mySideLabel}
            estimate={mySideForce?.estimate}
            color="#38BF72"
            tag="BİZ"
          />
          <ForceCard
            label={enemySideLabel}
            estimate={enemySideForce?.estimate}
            color="#C46D5B"
            tag="KARŞI"
          />
        </div>

        {/* Üs grupları */}
        <div className="grid grid-cols-2 gap-1.5">
          <SiteGroupCard
            title="Bizim Üslerimiz"
            color="#38BF72"
            sites={mySites}
            onFly={onFly}
            emptyHint={`${getCountry(focusCountry).label} için tesis seed'i yok`}
          />
          <SiteGroupCard
            title="Düşman Üsleri"
            color="#C46D5B"
            sites={enemySites}
            onFly={onFly}
            emptyHint={otherMeta
              ? `${otherMeta.label} için tesis seed'i yok`
              : 'karşı taraf ülkesi tanımlı değil'}
          />
        </div>

        {/* Hotspot listesi (varsa) */}
        {conflict.hotspots?.length > 0 && (
          <div>
            <div className="text-[9px] font-mono uppercase tracking-wider text-ops-500 mb-1">
              Sıcak Noktalar
            </div>
            <div className="flex flex-wrap gap-1">
              {conflict.hotspots.map((h, i) => (
                <button
                  key={i}
                  onClick={() => onFly(h.lat, h.lng, 10)}
                  className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-red-400/30 text-red-400 hover:bg-red-400/10 transition-colors"
                >
                  {h.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Tam çatışma odağına giriş */}
        <button
          onClick={onEnterFocus}
          className="w-full text-[10px] font-mono px-2 py-1.5 rounded border border-ops-700 text-ops-400 hover:text-accent hover:border-accent/50 hover:bg-accent/5 transition-all"
        >
          → Çatışma odağına gir (tam ekran)
        </button>
      </div>
    </Section>
  )
}

function ForceCard({ label, estimate, color, tag }) {
  return (
    <div
      className="rounded border px-2 py-1.5"
      style={{ borderColor: `${color}55`, background: `${color}0A` }}
    >
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[9px] font-mono uppercase tracking-wider" style={{ color }}>
          {tag}
        </span>
        <span className="text-[10px] font-mono text-ops-400">
          {estimate || '—'}
        </span>
      </div>
      <div className="text-[11px] text-ops-200 leading-tight line-clamp-2">
        {label}
      </div>
    </div>
  )
}

function SiteGroupCard({ title, color, sites, onFly, emptyHint }) {
  return (
    <div
      className="rounded border overflow-hidden"
      style={{ borderColor: `${color}55` }}
    >
      <div
        className="px-2 py-1 text-[9px] font-mono uppercase tracking-wider"
        style={{ background: `${color}12`, color }}
      >
        {title} · {sites.length}
      </div>
      <div className="p-1 max-h-40 overflow-y-auto">
        {sites.length === 0 ? (
          <div className="text-[10px] text-ops-600 italic leading-snug px-1 py-0.5">
            {emptyHint}
          </div>
        ) : (
          sites.slice(0, 6).map((s) => (
            <button
              key={s.id}
              onClick={() => onFly(s.lat, s.lng, 9)}
              className="w-full flex items-center gap-1.5 px-1 py-0.5 rounded hover:bg-ops-700/40 transition-colors text-left group"
              title={s.name}
            >
              <MapPin size={9} className="shrink-0 text-ops-500 group-hover:text-accent" />
              <span className="flex-1 text-[10px] text-ops-200 truncate group-hover:text-ops-50">
                {s.name}
              </span>
            </button>
          ))
        )}
        {sites.length > 6 && (
          <div className="text-[9px] font-mono text-ops-600 italic px-1 pt-0.5">
            +{sites.length - 6} daha — Kritik paneline bak
          </div>
        )}
      </div>
    </div>
  )
}

/* ── helpers ──────────────────────────────────────────── */

/** Odak ülke hangi tarafın üyesi? Ülke labelinin side labelinde
 *  geçmesinden kestirim. Bulamazsa 'A' varsayılan. */
function inferDefaultSide(conflict, countryCode) {
  const meta = getCountry(countryCode)
  if (!meta) return 'A'
  const aText = [
    conflict.frontline?.sideA,
    conflict.theatre?.sideA?.label,
    conflict.parties?.[0],
  ].filter(Boolean).join(' ')
  const bText = [
    conflict.frontline?.sideB,
    conflict.theatre?.sideB?.label,
    conflict.parties?.[1],
  ].filter(Boolean).join(' ')
  const label = meta.label.toLowerCase()
  if (aText.toLowerCase().includes(label)) return 'A'
  if (bText.toLowerCase().includes(label)) return 'B'
  // Özel eşlemeler — label varyantları
  const aliases = {
    TR: ['türkiye','turkey','tr','smo'],
    US: ['abd','usa','amerikan','koalisyon','cent'],
    RU: ['rusya','russia','rus','wagner'],
    UA: ['ukrayna','ukraine','ukr'],
    IR: ['iran','ira','irgc','vekil'],
    IL: ['israil','israel','idf','isr'],
    CN: ['çin','china','çhc','plan','plaaf'],
    IN: ['hindistan','india','iaf'],
    PK: ['pakistan','pak'],
  }
  const list = aliases[countryCode] || []
  const aL = aText.toLowerCase(), bL = bText.toLowerCase()
  for (const a of list) {
    if (aL.includes(a)) return 'A'
    if (bL.includes(a)) return 'B'
  }
  return 'A'
}
