import React from 'react'
import { ChevronRight, X } from 'lucide-react'
import useStore from '../../store/useStore'
import { getOperator } from '../../config/operators'

/**
 * "Neredeyim?" gösterge şeridi — iki eksenli scope zinciri.
 *
 *   Global:            › Dünya
 *   Ülke odağı:        › Dünya › Ukrayna  [× Çık]
 *   Çatışma odağı:     › Dünya › Ukrayna-Rusya  [× Çık]
 *
 * Operatör (actor) chip ayrı bileşende (OperatorChip) — bu şerit
 * sadece SCOPE'u gösterir. Böylece "ben kimim?" ve "neye bakıyorum?"
 * görsel olarak ayrışır ve operatör her an sabit kalır:
 *
 *   [🇹🇷 TR ▼]   › Dünya › Ukrayna-Rusya  [× Çık]
 *    ^actor        ^────── scope ──────^
 *
 * Dünya crumb'ı odak halindeyken tıklanabilirdir — odağı kapatır
 * (country ise sadece country'i, conflict ise conflict'i).
 * × düğmesi ikinci çıkış yolu; F3'te ESC tuşu da bağlanacak.
 * Global+ülkesiz modda tüm crumb pasif etikettir.
 */
export default function Breadcrumb() {
  const appMode          = useStore((s) => s.appMode)
  const selectedConflict = useStore((s) => s.selectedConflict)
  const focusCountry     = useStore((s) => s.focusCountry)
  const exitConflict     = useStore((s) => s.exitConflictFocus)
  const exitCountry      = useStore((s) => s.exitCountryFocus)
  const operator         = useStore((s) => s.operator)

  const inConflict = appMode === 'local' && !!selectedConflict
  const inCountry  = !inConflict && !!focusCountry
  const inFocus    = inConflict || inCountry

  // Operatör-farkında ülke çevirisi: focusCountry ISO kodu
  // (örn 'UA') → operatör kataloğunda eşi varsa güzel isim, yoksa
  // kodun kendisi. İlerde countries.js ayrı data source'u eklenebilir.
  const countryLabel = inCountry
    ? (getOperator(focusCountry).label || focusCountry)
    : null

  const exit = () => {
    if (inConflict) exitConflict()
    else if (inCountry) exitCountry()
  }

  return (
    <div className="hidden md:flex items-center gap-1 text-[11px] font-mono select-none mr-1">
      <span className="text-ops-500">›</span>
      <button
        type="button"
        onClick={inFocus ? exit : undefined}
        disabled={!inFocus}
        title={inFocus ? "Global'e dön" : 'Global görünüm'}
        className={`transition-colors ${
          inFocus
            ? 'text-ops-400 hover:text-ops-100 cursor-pointer'
            : 'text-ops-100 cursor-default'
        }`}
      >
        Dünya
      </button>

      {inCountry && (
        <>
          <ChevronRight size={11} className="text-ops-600" />
          <span
            className="text-accent max-w-[180px] truncate"
            title={`Ülke odağı: ${countryLabel}`}
          >
            {countryLabel}
          </span>
          <button
            type="button"
            onClick={exitCountry}
            className="ml-1 flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-ops-600 text-ops-400 hover:text-accent hover:border-accent/60 transition-colors"
            title="Ülke odağından çık"
          >
            <X size={10} />
            <span className="text-[10px] uppercase tracking-wider">Çık</span>
          </button>
        </>
      )}

      {inConflict && (
        <>
          <ChevronRight size={11} className="text-ops-600" />
          <span
            className="text-accent max-w-[220px] truncate"
            title={selectedConflict.name}
          >
            {selectedConflict.name}
          </span>
          <button
            type="button"
            onClick={exitConflict}
            className="ml-1 flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-ops-600 text-ops-400 hover:text-accent hover:border-accent/60 transition-colors"
            title="Odaktan çık (ESC)"
          >
            <X size={10} />
            <span className="text-[10px] uppercase tracking-wider">Çık</span>
          </button>
        </>
      )}
    </div>
  )
}
