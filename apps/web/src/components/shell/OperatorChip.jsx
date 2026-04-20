import React, { useState, useRef, useEffect } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import useStore from '../../store/useStore'
import { OPERATORS, OPERATOR_ORDER, getOperator } from '../../config/operators'

/**
 * Actor göstergesi + switcher — "ben hangi ülke adına oynuyorum?"
 *
 *   [🇹🇷 TR ▼]
 *    → tıklanınca operatör listesi açılır
 *      ● Türkiye  · NATO
 *        Ukrayna  · NATO-partner
 *        ABD      · NATO
 *        Fransa   · NATO
 *        Çin      · bağlantısız
 *
 * Prensip: operatör UI'ın HER yerinden görünür olmalı — Sentinel'de
 * "ben kimim?" sorusu operatöre çok şey söyler (kapsama benim, tehdit
 * benden başkası, dost listesi buna bağlı). TopBar'ın solunda, logodan
 * hemen sonra. Breadcrumb bu chip'in devamında ne gösterdiğimizi
 * söyler (scope: global / country / conflict).
 *
 * Bugün davranış:
 *   - setOperator(code) kamera default'unu o operatörün merkezine uçurur
 *   - Conflict Focus'daysak odak kapatılır (iki actor arası
 *     "tarafımız" kavramı devretmez)
 *   - Ülke odağı korunur (operator × country bağımsız eksen)
 */
export default function OperatorChip() {
  const operator    = useStore((s) => s.operator)
  const setOperator = useStore((s) => s.setOperator)

  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  // Dışarı tıklayınca kapat
  useEffect(() => {
    if (!open) return
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    const onEsc = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown',   onEsc)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown',   onEsc)
    }
  }, [open])

  const active = getOperator(operator)

  const onSelect = (code) => {
    setOpen(false)
    if (code !== operator) setOperator(code)
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={`Operatör: ${active.label} — değiştirmek için tıkla`}
        className={`flex items-center gap-1.5 px-2 py-1 rounded border text-xs transition-all ${
          open
            ? 'bg-ops-700 border-ops-500 text-ops-100'
            : 'border-ops-600 text-ops-200 hover:border-ops-400 hover:text-ops-50'
        }`}
      >
        <span className="text-sm leading-none" aria-hidden>{active.flag}</span>
        <span className="font-mono uppercase tracking-wider text-[10px]">
          {active.shortLabel || active.code}
        </span>
        <ChevronDown size={11} className="text-ops-400" />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 top-full mt-1 bg-ops-800 border border-ops-600 rounded-md shadow-xl z-[2000] py-1 min-w-[240px] fade-in"
        >
          <div className="px-3 py-1.5 text-[9px] font-mono uppercase tracking-wider text-ops-500 border-b border-ops-700/60">
            Operatör seç
          </div>
          {OPERATOR_ORDER.map((code) => {
            const op = OPERATORS[code]
            if (!op) return null
            const isActive = code === operator
            return (
              <button
                key={code}
                role="option"
                aria-selected={isActive}
                onClick={() => onSelect(code)}
                className={`w-full text-left px-3 py-2 text-xs transition-colors flex items-start gap-2 ${
                  isActive ? 'bg-ops-700/60' : 'hover:bg-ops-700'
                }`}
              >
                <span className="text-base leading-none mt-0.5 shrink-0" aria-hidden>
                  {op.flag}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-1.5">
                    <span className={`font-medium ${isActive ? 'text-accent' : 'text-ops-100'}`}>
                      {op.label}
                    </span>
                    <span className="text-[9px] font-mono uppercase text-ops-500">
                      {op.shortLabel}
                    </span>
                    {op.doctrine && (
                      <span className="text-[9px] px-1 rounded border border-ops-700 text-ops-400 font-mono">
                        {op.doctrine}
                      </span>
                    )}
                  </span>
                  <span className="block text-[10px] text-ops-400 mt-0.5 leading-snug">
                    {op.description}
                  </span>
                </span>
                {isActive && <Check size={13} className="text-accent shrink-0 mt-0.5" />}
              </button>
            )
          })}
          <div className="px-3 py-1.5 text-[9px] font-mono uppercase tracking-wider text-ops-500 border-t border-ops-700/60">
            Yeni operatör ekle → config/operators.js
          </div>
        </div>
      )}
    </div>
  )
}
