import React, { useState, useMemo, useRef, useEffect } from 'react'
import { Search, Check, ChevronDown, Globe2 } from 'lucide-react'
import {
  COUNTRIES, REGION_LABELS, countryList, getCountry,
} from '../../config/countries'
import {
  OPERATORS, OPERATOR_ORDER, getOperator,
} from '../../config/operators'

/**
 * CountryPicker — ülke/operatör seçmek için tek, aranabilir dropdown.
 *
 * Eski OperatorChip 5 kalemlik kısa listeyi açıyordu; bu bileşen 40+
 * ülkeyi bölgeye göre gruplayıp yazarak süzmeyi sağlıyor. Hem BEN
 * (operatör) hem ODAK (focusCountry) seçicisi buna sarmalanır.
 *
 * Props:
 *   value       — aktif ISO kodu (ör 'TR'); null → allowClear true ise
 *                 "Dünya" temsili seçili.
 *   onPick(code)— seçim callback. null gelirse odağı temizle anlamında
 *                 tüketen tarafta yorumlanır.
 *   scope       — 'operator' (OPERATORS kataloğu, 5 kalem) |
 *                 'country'  (COUNTRIES kataloğu, tüm ülkeler)
 *   label       — chip'in solunda küçük etiket ('BEN', 'ODAK'...)
 *   allowClear  — başa "× Dünya" (null) satırı ekle (focus picker için).
 *   clearLabel  — null seçimin başlığı (default 'Dünya').
 *   tone        — 'actor' (mavi) | 'focus' (accent/turuncu) | 'neutral'
 */
export default function CountryPicker({
  value,
  onPick,
  scope = 'country',
  label,
  allowClear = false,
  clearLabel = 'Dünya',
  tone = 'neutral',
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const wrapRef  = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false); setQ('')
      }
    }
    const onEsc = (e) => {
      if (e.key === 'Escape') { setOpen(false); setQ('') }
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown',   onEsc)
    // Aç-açmaz arama kutusuna odaklan
    const t = setTimeout(() => inputRef.current?.focus(), 10)
    return () => {
      clearTimeout(t)
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown',   onEsc)
    }
  }, [open])

  const list = useMemo(() => {
    if (scope === 'operator') {
      return OPERATOR_ORDER.map((code) => OPERATORS[code]).filter(Boolean)
    }
    return countryList()
  }, [scope])

  const filtered = useMemo(() => {
    if (!q.trim()) return list
    const lower = q.toLowerCase()
    return list.filter((c) =>
      c.label.toLowerCase().includes(lower) ||
      c.code.toLowerCase().includes(lower)
    )
  }, [list, q])

  /* Bölgeye göre grupla — sadece country scope'ta. Operator scope
     zaten kısa liste, düz akışta gösterilir. */
  const grouped = useMemo(() => {
    if (scope === 'operator') return [['_', filtered]]
    const map = {}
    filtered.forEach((c) => {
      const r = c.region || 'etc'
      if (!map[r]) map[r] = []
      map[r].push(c)
    })
    // REGION_LABELS sırasını koru, kalanları sona at
    const order = ['me','europe','asia','americas','africa','oceania','etc']
    return order.filter((r) => map[r]?.length).map((r) => [r, map[r]])
  }, [filtered, scope])

  const current   = scope === 'operator' ? getOperator(value) : getCountry(value)
  const showFlag  = value ? (current?.flag || '🏳️') : '🌍'
  const showLabel = value ? (current?.label || value) : clearLabel

  const toneCls = {
    actor:   'border-sky-500/40 text-sky-200 hover:border-sky-400 hover:text-sky-100',
    focus:   'border-accent/60 text-accent hover:border-accent',
    neutral: 'border-ops-600 text-ops-200 hover:border-ops-400 hover:text-ops-50',
  }[tone] || 'border-ops-600 text-ops-200'

  const onChoose = (code) => {
    setOpen(false); setQ('')
    onPick?.(code)
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={label ? `${label}: ${showLabel}` : showLabel}
        className={`flex items-center gap-1.5 px-2 py-1 rounded border text-xs transition-all ${
          open ? 'bg-ops-700 border-ops-500 text-ops-100' : toneCls
        }`}
      >
        {label && (
          <span className="text-[9px] font-mono uppercase tracking-wider text-ops-500 pr-1.5 border-r border-ops-700/80">
            {label}
          </span>
        )}
        <span className="text-sm leading-none" aria-hidden>{showFlag}</span>
        <span className="font-medium text-[11px] max-w-[110px] truncate">
          {showLabel}
        </span>
        <ChevronDown size={11} className="text-ops-400" />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 top-full mt-1 bg-ops-800 border border-ops-600 rounded-md shadow-xl z-[2500] w-[300px] max-h-[480px] flex flex-col fade-in"
        >
          {/* Arama çubuğu */}
          <div className="p-2 border-b border-ops-700/60">
            <div className="relative">
              <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-ops-500 pointer-events-none" />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={scope === 'operator' ? 'Operatör ara...' : 'Ülke ara (ör: ukrayna, UA)...'}
                className="w-full bg-ops-900 border border-ops-700 rounded pl-6 pr-2 py-1 text-[11px] text-ops-100 placeholder-ops-500 focus:outline-none focus:border-accent"
              />
            </div>
          </div>

          {/* Liste */}
          <div className="overflow-y-auto flex-1 py-1">
            {allowClear && (
              <button
                onClick={() => onChoose(null)}
                className={`w-full text-left px-3 py-2 text-xs transition-colors flex items-center gap-2 ${
                  !value ? 'bg-ops-700/60 text-accent' : 'hover:bg-ops-700 text-ops-200'
                }`}
              >
                <Globe2 size={14} className="shrink-0" />
                <span className="flex-1">{clearLabel}</span>
                {!value && <Check size={12} className="text-accent" />}
              </button>
            )}

            {grouped.length === 0 && (
              <div className="px-3 py-3 text-[11px] text-ops-500">Eşleşme yok</div>
            )}

            {grouped.map(([region, items]) => (
              <div key={region}>
                {scope === 'country' && region !== '_' && (
                  <div className="px-3 pt-2 pb-1 text-[9px] font-mono uppercase tracking-wider text-ops-500">
                    {REGION_LABELS[region] || region}
                  </div>
                )}
                {items.map((c) => {
                  const active = c.code === value
                  return (
                    <button
                      key={c.code}
                      role="option"
                      aria-selected={active}
                      onClick={() => onChoose(c.code)}
                      className={`w-full text-left px-3 py-1.5 text-xs transition-colors flex items-center gap-2 ${
                        active ? 'bg-ops-700/60' : 'hover:bg-ops-700'
                      }`}
                    >
                      <span className="text-base leading-none shrink-0" aria-hidden>
                        {c.flag}
                      </span>
                      <span className={`flex-1 min-w-0 truncate ${active ? 'text-accent' : 'text-ops-100'}`}>
                        {c.label}
                      </span>
                      <span className="text-[9px] font-mono uppercase text-ops-500 shrink-0">
                        {c.code}
                      </span>
                      {scope === 'operator' && c.doctrine && (
                        <span className="text-[9px] px-1 rounded border border-ops-700 text-ops-400 font-mono shrink-0">
                          {c.doctrine}
                        </span>
                      )}
                      {active && <Check size={12} className="text-accent shrink-0" />}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>

          {scope === 'operator' && (
            <div className="px-3 py-1.5 text-[9px] font-mono uppercase tracking-wider text-ops-500 border-t border-ops-700/60">
              Yeni operatör → config/operators.js
            </div>
          )}
        </div>
      )}
    </div>
  )
}
