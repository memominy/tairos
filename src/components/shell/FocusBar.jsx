import React from 'react'
import { X, ChevronRight, Swords } from 'lucide-react'
import useStore from '../../store/useStore'
import CountryPicker from './CountryPicker'

/**
 * FocusBar — TopBar'ın "hangi ülkeye bakıyorum + hangi taraf" kontrol adası.
 *
 * Sade hali:
 *   [🌍 ODAK · Dünya ▼]
 *   [🇺🇦 ODAK · Ukrayna ▼] [× Çık]
 *   [🇺🇦 Ukrayna ▼] › Ukrayna-Rusya [⚔ Taraf A] [× Çık]
 *
 * Eskiden "BEN" (operator) seçici de buradaydı; kullanıcı arayüzü
 * sadeleştirmek için çıkarıldı. Operatör değiştirmek için Command Palette
 * (Ctrl+K) üzerinden "operatör seç" komutu hâlâ çalışıyor.
 *
 * Eksenler:
 *   ODAK  = focusCountry     → setFocusCountry(code) | exitCountryFocus()
 *   TARAF = selectedConflict için focusSideByConflict[conflictId]
 *           → setFocusSide(conflictId, 'A'|'B'|'neutral')
 */
export default function FocusBar() {
  const focusCountry      = useStore((s) => s.focusCountry)
  const setFocusCountry   = useStore((s) => s.setFocusCountry)
  const exitCountryFocus  = useStore((s) => s.exitCountryFocus)
  const appMode           = useStore((s) => s.appMode)
  const selectedConflict  = useStore((s) => s.selectedConflict)
  const exitConflictFocus = useStore((s) => s.exitConflictFocus)
  const sideByConflict    = useStore((s) => s.focusSideByConflict)
  const setFocusSide      = useStore((s) => s.setFocusSide)

  const inConflict  = appMode === 'local' && !!selectedConflict
  const currentSide = inConflict ? (sideByConflict?.[selectedConflict.id] || 'neutral') : null

  const pickFocus = (code) => {
    if (code == null) {
      if (focusCountry) exitCountryFocus()
    } else if (code !== focusCountry) {
      setFocusCountry(code)
    }
  }

  const cycleSide = () => {
    if (!inConflict) return
    const next =
      currentSide === 'A'       ? 'B' :
      currentSide === 'B'       ? 'neutral' :
                                  'A'
    setFocusSide(selectedConflict.id, next)
  }

  const sideALabel = selectedConflict?.parties?.sideA?.label || 'A'
  const sideBLabel = selectedConflict?.parties?.sideB?.label || 'B'
  const sideLabel  =
    currentSide === 'A'       ? sideALabel :
    currentSide === 'B'       ? sideBLabel :
                                'Taraf seç'

  const sideToneCls =
    currentSide === 'A' ? 'border-sky-500/60 text-sky-200 hover:bg-sky-500/10'
  : currentSide === 'B' ? 'border-rose-500/60 text-rose-200 hover:bg-rose-500/10'
  :                       'border-ops-600 text-ops-400 hover:text-ops-200'

  return (
    <div className="flex items-center gap-1.5 select-none flex-wrap">
      {/* ODAK — focusCountry (null → Dünya). 40+ ülke aranabilir. */}
      <CountryPicker
        value={focusCountry}
        onPick={pickFocus}
        scope="country"
        label="Odak"
        allowClear={true}
        clearLabel="Dünya"
        tone={focusCountry ? 'focus' : 'neutral'}
      />

      {/* Ülke odağı aktif ama çatışma modunda değiliz → hızlı çıkış */}
      {focusCountry && !inConflict && (
        <button
          onClick={exitCountryFocus}
          title="Ülke odağından çık (Dünya görünümüne dön)"
          className="flex items-center gap-0.5 px-1.5 py-1 rounded border border-ops-600 text-ops-400 hover:text-accent hover:border-accent/60 transition-colors"
        >
          <X size={10} />
          <span className="text-[10px] font-mono uppercase">Çık</span>
        </button>
      )}

      {/* Çatışma odağı: ad + taraf chip + çıkış */}
      {inConflict && (
        <>
          <ChevronRight size={11} className="text-ops-600 shrink-0" />
          <span
            className="text-accent text-[11px] font-mono max-w-[160px] truncate"
            title={selectedConflict.name}
          >
            {selectedConflict.name}
          </span>

          <button
            onClick={cycleSide}
            title={`Taraf: ${sideLabel} — tıkla: A → B → seçilmemiş`}
            aria-pressed={currentSide === 'A' || currentSide === 'B'}
            className={`flex items-center gap-1 px-1.5 py-1 rounded border text-[10px] font-mono uppercase transition-colors ${sideToneCls}`}
          >
            <Swords size={10} />
            <span className="max-w-[90px] truncate">{sideLabel}</span>
          </button>

          <button
            onClick={exitConflictFocus}
            title="Çatışma odağından çık (ESC)"
            className="flex items-center gap-0.5 px-1.5 py-1 rounded border border-ops-600 text-ops-400 hover:text-accent hover:border-accent/60 transition-colors"
          >
            <X size={10} />
            <span className="text-[10px] font-mono uppercase">Çık</span>
          </button>
        </>
      )}
    </div>
  )
}
