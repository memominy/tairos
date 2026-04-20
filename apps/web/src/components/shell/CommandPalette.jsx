import React, { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import {
  Search, ArrowRight, Cpu, Globe2, Flame, Bot, Bell,
  Settings as SettingsIcon, Target, Shield, Radio, Newspaper, Clock,
  Boxes, ClipboardList, Bookmark, Map as MapIcon, LogOut,
  Swords, Building2,
} from 'lucide-react'
import useStore from '../../store/useStore'
import { resolvePanels } from '../../config/panels'
import { OPERATORS, OPERATOR_ORDER, getOperator } from '../../config/operators'
import { COUNTRIES, countryList } from '../../config/countries'

/**
 * CommandPalette — Ctrl+K / Cmd+K ile açılan, tüm uygulamayı
 * klavyeden sürebildiğiniz birleşik quick-switch.
 *
 * İlk sürüm kapsamı (F2):
 *   • Panel geçişi          — Sistemler/Saha/Dünya/Asistan/... tek tuş
 *   • Operatör seçimi       — "ABD", "Türkiye", "Fransa"... olarak oyna
 *   • Ülke odağı            — "Ukrayna", "Suriye"... focus et
 *   • Katman aç/kapat       — Çatışma, Kuvvet, Küresel, Hava
 *   • Hızlı çıkışlar        — Conflict Focus'tan çık, Ülke odağından çık
 *   • Kayıtlı görünüm geri yükle
 *
 * Yaklaşım:
 *   - Tüm "yapılabilir aksiyonlar" flat bir ITEMS dizisine indirilir
 *   - Arama = ITEM.label + ITEM.hint + ITEM.keywords içinde case-insensitive
 *   - Enter = seçili ITEM'in run()'ını çalıştır + kapat
 *   - Ok tuşları + Home/End = seçimde gezin
 *   - Esc = kapat
 *
 * Klavye kısayolunu kuran hook (useCommandPaletteShortcut) altta;
 * App.jsx tek bir <CommandPalette /> mount ederek bununla birlikte
 * çağırır.
 */

const PANEL_ICONS = {
  platform: Cpu, field: Globe2, intel: Flame,
  operations: ClipboardList, assets: Boxes,
  assistant: Bot, alerts: Bell, settings: SettingsIcon,
  situation: Target, forces: Shield, threats: Radio,
  news: Newspaper, timeline: Clock,
  'country-brief':     Target,
  'country-inventory': Boxes,
  'country-critical':  Building2,
  'country-rivals':    Swords,
}

export default function CommandPalette() {
  const open           = useStore((s) => s.commandPaletteOpen)
  const setOpen        = useStore((s) => s.setCommandPaletteOpen)
  const appMode        = useStore((s) => s.appMode)
  const operator       = useStore((s) => s.operator)
  const focusCountry   = useStore((s) => s.focusCountry)
  const selectedConflict = useStore((s) => s.selectedConflict)

  const setActivePanel    = useStore((s) => s.setActivePanel)
  const setOperator       = useStore((s) => s.setOperator)
  const setFocusCountry   = useStore((s) => s.setFocusCountry)
  const exitCountryFocus  = useStore((s) => s.exitCountryFocus)
  const exitConflictFocus = useStore((s) => s.exitConflictFocus)

  const toggleConflicts     = useStore((s) => s.toggleConflicts)
  const toggleGlobalSites   = useStore((s) => s.toggleGlobalSites)
  const toggleForceDeploy   = useStore((s) => s.toggleForceDeploy)
  const toggleWeatherClouds = useStore((s) => s.toggleWeatherClouds)
  const toggleWeatherRain   = useStore((s) => s.toggleWeatherRain)

  const conflictsOn      = useStore((s) => s.conflictsOn)
  const globalSitesOn    = useStore((s) => s.globalSitesOn)
  const forceDeployOn    = useStore((s) => s.forceDeployOn)
  const weatherCloudsOn  = useStore((s) => s.weatherCloudsOn)
  const weatherRainOn    = useStore((s) => s.weatherRainOn)

  const savedViews       = useStore((s) => s.savedViews)
  const restoreView      = useStore((s) => s.restoreView)

  const [query, setQuery]     = useState('')
  const [selIdx, setSelIdx]   = useState(0)
  const inputRef              = useRef(null)

  // Dialog açılınca arama alanını boş başlat, focus ver
  useEffect(() => {
    if (open) {
      setQuery('')
      setSelIdx(0)
      setTimeout(() => inputRef.current?.focus(), 10)
    }
  }, [open])

  // Kapatıcılar
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); setOpen(false) }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  const items = useMemo(() => {
    const panels = resolvePanels({ appMode, focusCountry })
    const list = []

    // Panel geçişi
    panels.forEach((p) => {
      const Icon = PANEL_ICONS[p.id] || MapIcon
      list.push({
        kind:    'panel',
        id:      `panel:${p.id}`,
        label:   p.label,
        hint:    p.title,
        keywords: [p.id, 'panel', 'git'],
        icon:    Icon,
        run:     () => setActivePanel(p.id),
      })
    })

    // Operatör değiştir
    OPERATOR_ORDER.forEach((code) => {
      const meta = OPERATORS[code]
      if (!meta || code === operator) return
      list.push({
        kind:    'operator',
        id:      `op:${code}`,
        label:   `${meta.flag} ${meta.label} olarak oyna`,
        hint:    meta.doctrine ? `Doktrin: ${meta.doctrine}` : 'Operatörü değiştir',
        keywords: [code, meta.label, meta.shortLabel, 'operator', 'actor'],
        icon:    () => <span className="text-base leading-none">{meta.flag}</span>,
        run:     () => setOperator(code),
      })
    })

    // Ülke odağı
    if (appMode === 'global') {
      countryList().forEach((c) => {
        if (c.code === focusCountry) return
        list.push({
          kind:    'country',
          id:      `ctry:${c.code}`,
          label:   `${c.flag} ${c.label}'e odaklan`,
          hint:    'Ülke odağı — kamera yakınlaşır, liste daralır',
          keywords: [c.code, c.label, 'ülke', 'odak', 'country'],
          icon:    () => <span className="text-base leading-none">{c.flag}</span>,
          run:     () => setFocusCountry(c.code),
        })
      })
    }

    // Hızlı çıkışlar
    if (focusCountry) {
      const c = COUNTRIES[focusCountry]
      list.push({
        kind: 'exit', id: 'exit:country',
        label: `Ülke odağından çık (${c?.label || focusCountry})`,
        hint: 'Global görünüme dön',
        keywords: ['çık', 'exit', 'dünya', 'global'],
        icon: LogOut,
        run: () => exitCountryFocus(),
      })
    }
    if (appMode === 'local' && selectedConflict) {
      list.push({
        kind: 'exit', id: 'exit:conflict',
        label: `Çatışma odağından çık (${selectedConflict.name})`,
        hint: 'Global moda dön',
        keywords: ['çık', 'exit', 'conflict', 'odak', 'çatışma'],
        icon: LogOut,
        run: () => exitConflictFocus(),
      })
    }

    // Katman toggle
    const layers = [
      { id: 'conflicts', label: `Çatışma katmanı ${conflictsOn ? 'kapat' : 'aç'}`,      run: toggleConflicts,     icon: Flame },
      { id: 'global',    label: `Küresel üsler ${globalSitesOn ? 'kapat' : 'aç'}`,      run: toggleGlobalSites,   icon: Globe2 },
      { id: 'force',     label: `Kuvvet konuşlanmaları ${forceDeployOn ? 'kapat' : 'aç'}`, run: toggleForceDeploy, icon: Shield },
      { id: 'clouds',    label: `Bulutlar ${weatherCloudsOn ? 'kapat' : 'aç'}`,         run: toggleWeatherClouds, icon: MapIcon },
      { id: 'rain',      label: `Yağış radarı ${weatherRainOn ? 'kapat' : 'aç'}`,       run: toggleWeatherRain,   icon: MapIcon },
    ]
    layers.forEach((l) => list.push({
      kind: 'layer', id: `layer:${l.id}`,
      label: l.label, hint: 'Katmanı aç/kapat',
      keywords: ['katman', 'layer', 'toggle', l.id],
      icon: l.icon,
      run: l.run,
    }))

    // Kayıtlı görünümler (aktif operatöre aitler)
    const opViews = savedViews.filter((v) => (v.operator || 'TR') === operator)
    opViews.forEach((v) => list.push({
      kind: 'view', id: `view:${v.id}`,
      label: `Görünüm: ${v.name}`,
      hint: 'Kamera + katmanları geri yükle',
      keywords: ['view', 'görünüm', v.name],
      icon: Bookmark,
      run: () => restoreView(v.id),
    }))

    return list
  }, [
    appMode, operator, focusCountry, selectedConflict,
    conflictsOn, globalSitesOn, forceDeployOn, weatherCloudsOn, weatherRainOn,
    savedViews,
    setActivePanel, setOperator, setFocusCountry,
    exitCountryFocus, exitConflictFocus,
    toggleConflicts, toggleGlobalSites, toggleForceDeploy,
    toggleWeatherClouds, toggleWeatherRain, restoreView,
  ])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items.slice(0, 12)  // boş aramada ilk 12
    return items.filter((it) => {
      const hay = [it.label, it.hint, ...(it.keywords || [])]
        .filter(Boolean).join(' ').toLowerCase()
      return hay.includes(q)
    }).slice(0, 50)
  }, [items, query])

  // Seçili indeks filtered değişiminde resetlensin
  useEffect(() => { setSelIdx(0) }, [query])

  const runItem = (it) => {
    if (!it) return
    it.run()
    setOpen(false)
  }

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelIdx((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Home') {
      e.preventDefault(); setSelIdx(0)
    } else if (e.key === 'End') {
      e.preventDefault(); setSelIdx(filtered.length - 1)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      runItem(filtered[selIdx])
    }
  }

  if (!open) return null

  const opMeta = getOperator(operator)

  return createPortal(
    <div
      className="fixed inset-0 flex items-start justify-center pt-[15vh] px-4"
      style={{ zIndex: 9998, background: 'rgba(6,11,22,0.75)' }}
      onClick={() => setOpen(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl bg-ops-800 border border-ops-600 rounded-xl shadow-2xl overflow-hidden"
        style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(216,90,48,0.15)' }}
      >
        {/* Header — operatör bilgisi + arama */}
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-ops-700 bg-ops-900/50">
          <Search size={14} className="text-ops-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Panel, operatör, ülke, katman ara..."
            className="flex-1 bg-transparent text-sm text-ops-100 placeholder-ops-500 focus:outline-none"
          />
          <span
            className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-ops-600 text-ops-400"
            title={`${opMeta.label} olarak oynuyorsunuz`}
          >
            {opMeta.flag} {opMeta.shortLabel || opMeta.code}
          </span>
        </div>

        {/* Sonuç listesi */}
        <div className="max-h-[50vh] overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-ops-500 font-mono">
              Eşleşen komut yok
            </div>
          ) : (
            filtered.map((it, i) => {
              const Icon = it.icon
              const selected = i === selIdx
              return (
                <button
                  key={it.id}
                  onClick={() => runItem(it)}
                  onMouseEnter={() => setSelIdx(i)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${
                    selected
                      ? 'bg-accent/10 border-l-2 border-accent'
                      : 'border-l-2 border-transparent hover:bg-ops-700/40'
                  }`}
                >
                  <span className="shrink-0 w-4 h-4 flex items-center justify-center text-ops-300">
                    {Icon ? <Icon size={14} /> : <span>·</span>}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className={`text-xs truncate ${selected ? 'text-ops-50' : 'text-ops-100'}`}>
                      {it.label}
                    </div>
                    {it.hint && (
                      <div className="text-[10px] text-ops-500 truncate font-mono">
                        {it.hint}
                      </div>
                    )}
                  </div>
                  {selected && <ArrowRight size={11} className="text-accent shrink-0" />}
                </button>
              )
            })
          )}
        </div>

        {/* Footer — tuş ipuçları */}
        <div className="flex items-center justify-between px-3 py-1.5 border-t border-ops-700 bg-ops-900/40 text-[10px] font-mono text-ops-500">
          <div className="flex items-center gap-3">
            <span>↑↓ gezin</span>
            <span>↵ seç</span>
            <span>esc kapat</span>
          </div>
          <span>{filtered.length} sonuç</span>
        </div>
      </div>
    </div>,
    document.body
  )
}

/**
 * Ctrl+K / Cmd+K dinleyicisi — App.jsx'te bir kez useEffect ile
 * kurulduğunda Command Palette'i açar/kapatır.
 */
/* Shortcut hook moved → ./useCommandPaletteShortcut.js
 * Kept separate so App.jsx can wire Ctrl+K eagerly while the palette
 * component itself stays behind React.lazy. Re-import path:
 *   import { useCommandPaletteShortcut } from './shell/useCommandPaletteShortcut'
 */
