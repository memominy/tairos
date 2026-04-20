import React, { useState, useEffect } from 'react'
import { X, MapPin, Tag, Info, Navigation, Pencil, Check, Trash2 } from 'lucide-react'
import { CATEGORIES } from '../config/categories'
import useStore from '../store/useStore'
import FacilityProducts from './FacilityProducts'

export default function DetailPanel({ facility, onClose }) {
  const flyToPoint    = useStore((s) => s.flyToPoint)
  const mapZoom       = useStore((s) => s.mapZoom)
  const customNodes   = useStore((s) => s.customNodes)
  const renameNode    = useStore((s) => s.renameNode)
  const removeNode    = useStore((s) => s.removeNode)
  const selectFacility = useStore((s) => s.selectFacility)

  const isTairos = facility?.category === 'tairos'

  // For tairos nodes, resolve the canonical record from the store so rename
  // changes reflect here immediately.
  const node = isTairos && facility
    ? customNodes.find((n) => n.id === facility.id) || facility
    : null
  const display = isTairos ? { ...facility, ...node } : facility

  const [editing, setEditing]   = useState(false)
  const [draftName, setDraftName] = useState(display?.name || '')

  useEffect(() => {
    setEditing(false)
    setDraftName(display?.name || '')
  }, [display?.id])

  if (!facility || !display) return null

  const cat   = isTairos ? null : CATEGORIES[display.category]
  const color = isTairos ? '#F5C842' : (cat?.color || '#888')

  const flyTo = () => {
    flyToPoint(display.lat, display.lng, Math.max(mapZoom, 11))
  }

  const saveName = () => {
    const v = draftName.trim()
    if (v && v !== display.name) {
      renameNode(display.id, v)
      selectFacility({ ...display, name: v })
    }
    setEditing(false)
  }

  const deleteNode = () => {
    if (confirm(`"${display.name}" silinsin mi?`)) {
      removeNode(display.id)
      onClose()
    }
  }

  return (
    <div className="absolute right-0 top-0 bottom-0 w-72 bg-ops-800 border-l border-ops-600 slide-right-enter flex flex-col overflow-hidden" style={{ zIndex: 1200 }}>
      {/* Header */}
      <div className="flex items-start gap-2 p-4 border-b border-ops-700">
        <div
          className="shrink-0 w-2 h-full min-h-[40px] rounded-full mt-0.5"
          style={{ background: color }}
        />
        <div className="flex-1 min-w-0">
          {isTairos && editing ? (
            <div className="flex items-center gap-1">
              <input
                autoFocus
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveName()
                  if (e.key === 'Escape') { setEditing(false); setDraftName(display.name) }
                }}
                onBlur={saveName}
                className="flex-1 min-w-0 bg-ops-900 border border-ops-600 rounded px-2 py-0.5 text-sm text-ops-50 focus:outline-none focus:border-accent/70 focus:ring-1 focus:ring-accent/30"
              />
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={saveName}
                className="shrink-0 p-1 rounded hover:bg-ops-700 text-emerald-400"
                title="Kaydet"
              >
                <Check size={13} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 group">
              <h3 className="text-sm font-semibold text-ops-50 leading-tight truncate">
                {display.name}
              </h3>
              {isTairos && (
                <button
                  onClick={() => { setDraftName(display.name); setEditing(true) }}
                  className="shrink-0 opacity-0 group-hover:opacity-100 text-ops-500 hover:text-yellow-400 transition-all"
                  title="Adı düzenle"
                >
                  <Pencil size={11} />
                </button>
              )}
            </div>
          )}
          {isTairos ? (
            <span className="text-xs font-mono text-yellow-400 mt-1 inline-block">
              {display.custom ? 'Özel Tairos Node' : 'Tairos Drone Node'}
            </span>
          ) : (
            <span
              className="text-xs font-mono mt-1 inline-block px-1.5 py-0.5 rounded"
              style={{ background: cat?.bgColor, color }}
            >
              {cat?.labelShort || display.category}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="shrink-0 p-1 rounded hover:bg-ops-700 text-ops-400 hover:text-ops-100 transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Coordinates */}
        <div className="flex items-start gap-2">
          <MapPin size={13} className="text-ops-400 mt-0.5 shrink-0" />
          <div>
            <div className="text-xs text-ops-400 mb-0.5">Koordinat</div>
            <div className="font-mono text-xs text-ops-100">
              {display.lat.toFixed(4)}°N, {display.lng.toFixed(4)}°E
            </div>
          </div>
        </div>

        {/* City */}
        {display.city && (
          <div className="flex items-start gap-2">
            <Tag size={13} className="text-ops-400 mt-0.5 shrink-0" />
            <div>
              <div className="text-xs text-ops-400 mb-0.5">Konum</div>
              <div className="text-xs text-ops-100">{display.city}</div>
            </div>
          </div>
        )}

        {/* Info */}
        {display.info && (
          <div className="flex items-start gap-2">
            <Info size={13} className="text-ops-400 mt-0.5 shrink-0" />
            <div>
              <div className="text-xs text-ops-400 mb-0.5">Açıklama</div>
              <div className="text-xs text-ops-200 leading-relaxed">{display.info}</div>
            </div>
          </div>
        )}

        {/* Tairos node extra info */}
        {isTairos && (
          <div className="mt-2 p-2 rounded-lg bg-yellow-400/5 border border-yellow-400/20">
            <div className="text-xs text-yellow-400/80 leading-relaxed">
              Tairos drone box konumu. Nova / Iris kapsamasının dağıtım noktası olarak kullanılır.
            </div>
            {display.status && (
              <div className="mt-1 text-xs font-mono text-yellow-400">
                Durum: {String(display.status).toUpperCase()}
              </div>
            )}
          </div>
        )}

        {/* Deployed products — Nova / Iris / Radar on this specific site */}
        <FacilityProducts facility={display} />
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-ops-700 flex items-center gap-2">
        <button
          onClick={flyTo}
          className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border border-ops-600 text-xs text-ops-300 hover:bg-ops-700 hover:text-ops-100 transition-colors"
        >
          <Navigation size={12} />
          Haritada göster
        </button>
        {isTairos && (
          <button
            onClick={deleteNode}
            className="shrink-0 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-red-500/40 text-xs text-red-400 hover:bg-red-500/10 hover:border-red-500/70 transition-colors"
            title="Node'u sil"
          >
            <Trash2 size={12} />
            Sil
          </button>
        )}
      </div>
    </div>
  )
}
