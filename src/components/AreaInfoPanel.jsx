import React, { useMemo, useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Save, Target, Trash2, Check } from 'lucide-react'
import useStore from '../store/useStore'
import { CATEGORIES, CATEGORY_ORDER } from '../config/categories'
import allFacilities from '../data/facilities.json'

/**
 * Floating panel shown after a right-drag selection.
 *
 *   ─ Properties: area km², bounds, facility counts per category, node list
 *   ─ Actions:
 *       · Save as group (persist a named rectangle overlay)
 *       · Make this a strategic placement area (hand to the placement tool)
 *       · Close / ESC
 */

function kmBetween(aLat, aLng, bLat, bLng) {
  const R = 6371
  const dLat = (bLat - aLat) * Math.PI / 180
  const dLng = (bLng - aLng) * Math.PI / 180
  const la1  = aLat * Math.PI / 180
  const la2  = bLat * Math.PI / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.asin(Math.sqrt(h))
}

function pointInBounds(lat, lng, bounds) {
  const [[sLat, wLng], [nLat, eLng]] = bounds
  return lat >= sLat && lat <= nLat && lng >= wLng && lng <= eLng
}

export default function AreaInfoPanel() {
  const selection       = useStore((s) => s.areaSelection)
  const clearSelection  = useStore((s) => s.clearAreaSelection)
  const saveGroup       = useStore((s) => s.saveGroup)
  const updateGroup     = useStore((s) => s.updateGroup)
  const removeGroup     = useStore((s) => s.removeGroup)
  const editingGroupId  = useStore((s) => s.editingGroupId)
  const areaGroups      = useStore((s) => s.areaGroups)
  const customNodes     = useStore((s) => s.customNodes)
  const activeCats      = useStore((s) => s.activeCategories)
  const setPlacementPolygon = useStore((s) => s.setPlacementPolygon)
  const cancelPlacement     = useStore((s) => s.cancelPlacement)
  const removeNodesInBounds = useStore((s) => s.removeNodesInBounds)

  const editingGroup = useMemo(
    () => (editingGroupId ? areaGroups.find((g) => g.id === editingGroupId) : null),
    [editingGroupId, areaGroups],
  )
  const isEditing = !!editingGroup

  const [nameDraft, setNameDraft] = useState('')

  // Reset the name input whenever a fresh selection appears, or whenever the
  // editing target changes. New drag → "Alan HH:MM" default; existing group
  // → that group's current name.
  useEffect(() => {
    if (!selection) return
    if (editingGroup) setNameDraft(editingGroup.name)
    else              setNameDraft(defaultGroupName())
  }, [selection, editingGroupId])

  // ESC closes the panel.
  useEffect(() => {
    if (!selection) return
    const onKey = (e) => { if (e.key === 'Escape') clearSelection() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selection, clearSelection])

  const analytics = useMemo(() => {
    if (!selection) return null
    const [[sLat, wLng], [nLat, eLng]] = selection

    // Rectangle geometry metrics (approximate but plenty for operator UI).
    const widthKm  = kmBetween((sLat + nLat) / 2, wLng, (sLat + nLat) / 2, eLng)
    const heightKm = kmBetween(sLat, (wLng + eLng) / 2, nLat, (wLng + eLng) / 2)
    const areaKm2  = widthKm * heightKm
    const center   = [(sLat + nLat) / 2, (wLng + eLng) / 2]

    // Facilities inside — only count those whose category is currently on,
    // so the number matches what the user sees on the map.
    const facByCat = {}
    let facTotal = 0
    allFacilities.forEach((f) => {
      if (!activeCats.has(f.category)) return
      if (pointInBounds(f.lat, f.lng, selection)) {
        facByCat[f.category] = (facByCat[f.category] || 0) + 1
        facTotal++
      }
    })

    // Tairos nodes inside
    const nodesInside = (customNodes || []).filter((n) => pointInBounds(n.lat, n.lng, selection))

    return { widthKm, heightKm, areaKm2, center, facByCat, facTotal, nodesInside }
  }, [selection, customNodes, activeCats])

  if (!selection || !analytics) return null

  const handleSave = () => {
    const name = nameDraft.trim() || defaultGroupName()
    if (isEditing) {
      // Update name/bounds in place; keep id + color + createdAt.
      updateGroup(editingGroup.id, { name, bounds: selection })
      clearSelection()
    } else {
      saveGroup(name, selection, '#F5C842')
    }
  }

  const handleDelete = () => {
    if (!editingGroup) return
    if (!confirm(`"${editingGroup.name}" grubu silinsin mi?`)) return
    removeGroup(editingGroup.id)
  }

  const handleSendToPlacement = () => {
    const [[sLat, wLng], [nLat, eLng]] = selection
    // Turn rectangle into a 4-vertex CCW ring for the placement tool.
    const ring = [[sLat, wLng], [sLat, eLng], [nLat, eLng], [nLat, wLng]]
    cancelPlacement()                 // make sure drawing mode is clean
    setPlacementPolygon(ring)         // flips straight to 'configuring'
    clearSelection()
  }

  const handleClearNodes = () => {
    const n = analytics.nodesInside.length
    if (!n) return
    if (!confirm(`Bu alanda ${n} node silinecek. Emin misin?`)) return
    removeNodesInBounds(selection)
  }

  return createPortal(
    <div
      className="fixed top-16 right-4 rounded-xl border font-mono text-xs"
      style={{
        background: 'rgba(13,21,38,0.97)',
        borderColor: '#F5C84266',
        color: '#C8D8F0',
        width: 300, maxHeight: 'calc(100vh - 120px)', overflowY: 'auto',
        boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
        zIndex: 1350,
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 border-b"
        style={{ borderColor: '#F5C84233' }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span style={{ color: '#F5C842', fontSize: 14 }}>◱</span>
          <span style={{ color: '#F5C842', fontWeight: 700, fontSize: 12 }}>
            {isEditing ? 'Grubu Düzenle' : 'Seçili Alan'}
          </span>
          {isEditing && (
            <span className="text-[10px] font-mono truncate" style={{ color: '#8CA4C8' }}>
              · {editingGroup.name}
            </span>
          )}
        </div>
        <button
          onClick={clearSelection}
          className="text-ops-500 hover:text-red-400 transition-colors"
          title="Kapat (ESC)"
        >
          <X size={14} />
        </button>
      </div>

      {/* Metrics */}
      <div className="px-3 py-2.5 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <Metric label="Alan"     value={`${Math.round(analytics.areaKm2).toLocaleString('tr-TR')} km²`} big />
          <Metric label="Ölçüler"  value={`${Math.round(analytics.widthKm)}×${Math.round(analytics.heightKm)} km`} />
          <Metric label="Varlık"   value={analytics.facTotal.toLocaleString('tr-TR')} accent="#7AB8F0" />
          <Metric label="Node"     value={analytics.nodesInside.length.toLocaleString('tr-TR')} accent="#34D399" />
        </div>

        {/* Category breakdown (only non-zero) */}
        {analytics.facTotal > 0 && (
          <div className="pt-1">
            <div className="text-[10px] text-ops-500 uppercase tracking-wider mb-1">
              Kategoriye göre
            </div>
            <div className="flex flex-wrap gap-1">
              {CATEGORY_ORDER
                .filter((id) => analytics.facByCat[id])
                .map((id) => {
                  const cat = CATEGORIES[id]
                  return (
                    <span
                      key={id}
                      className="text-[10px] px-1.5 py-px rounded-full border"
                      style={{
                        borderColor: `${cat.color}55`,
                        color: cat.color,
                        background: `${cat.color}11`,
                      }}
                    >
                      {cat.labelShort || cat.label} · {analytics.facByCat[id]}
                    </span>
                  )
                })}
            </div>
          </div>
        )}

        {/* Node list (cap at 8 to avoid panel bloat) */}
        {analytics.nodesInside.length > 0 && (
          <div className="pt-1">
            <div className="text-[10px] text-ops-500 uppercase tracking-wider mb-1">
              Node'lar
            </div>
            <div className="space-y-0.5 max-h-24 overflow-y-auto">
              {analytics.nodesInside.slice(0, 8).map((n) => (
                <div key={n.id} className="flex items-center gap-1.5 text-[11px]">
                  <span className="shrink-0 w-1.5 h-1.5 rotate-45" style={{ background: n.custom ? '#34D399' : '#F5C842' }} />
                  <span className="truncate" style={{ color: '#B8C5D6' }}>{n.name}</span>
                </div>
              ))}
              {analytics.nodesInside.length > 8 && (
                <div className="text-[10px] text-ops-600 italic">
                  +{analytics.nodesInside.length - 8} daha…
                </div>
              )}
            </div>
          </div>
        )}

        {/* Bounds */}
        <div className="pt-1 text-[10px] leading-tight" style={{ color: '#4A6080' }}>
          <div>
            merkez: {analytics.center[0].toFixed(3)}, {analytics.center[1].toFixed(3)}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="px-3 py-2 border-t space-y-2" style={{ borderColor: '#F5C84222' }}>
        <div className="text-[10px] text-ops-500 uppercase tracking-wider">
          {isEditing ? 'Grup adı' : 'Grup olarak kaydet'}
        </div>
        <div className="flex items-center gap-1">
          <input
            type="text"
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            placeholder="Grup adı"
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave() }}
            className="flex-1 min-w-0 h-7 px-2 rounded border font-mono text-[11px] bg-ops-900 text-ops-100"
            style={{ borderColor: '#F5C84244' }}
            autoFocus
          />
          <button
            onClick={handleSave}
            disabled={!nameDraft.trim()}
            className="h-7 px-2.5 rounded border font-mono text-[11px] flex items-center gap-1 disabled:opacity-40"
            style={{ borderColor: '#F5C84288', color: '#F5C842', background: '#F5C84211' }}
            title={isEditing ? 'Grubu güncelle' : 'Yeni grup oluştur'}
          >
            {isEditing ? <Check size={11} /> : <Save size={11} />}
            {isEditing ? 'Güncelle' : 'Kaydet'}
          </button>
        </div>

        <button
          onClick={handleSendToPlacement}
          className="w-full flex items-center justify-center gap-1.5 h-7 rounded border font-mono text-[11px] transition-colors"
          style={{ borderColor: '#20C8A066', color: '#20C8A0', background: '#20C8A011' }}
          title="Bu alan için stratejik yerleştirme aracını aç"
        >
          <Target size={11} />
          Stratejik Yerleştirmeye Gönder
        </button>

        {/* Bulk cleanup — only shown when there are nodes inside the rect */}
        {analytics.nodesInside.length > 0 && (
          <button
            onClick={handleClearNodes}
            className="w-full flex items-center justify-center gap-1.5 h-7 rounded border font-mono text-[11px] transition-colors"
            style={{ borderColor: '#F8717155', color: '#F87171', background: '#F8717108' }}
            title="Bu alandaki tüm node'ları ve bağlı ürünleri sil"
          >
            <Trash2 size={11} />
            Alandaki Node'ları Sil ({analytics.nodesInside.length})
          </button>
        )}

        {isEditing && (
          <button
            onClick={handleDelete}
            className="w-full flex items-center justify-center gap-1.5 h-7 rounded border font-mono text-[11px] transition-colors"
            style={{ borderColor: '#F8717155', color: '#F87171', background: '#F8717108' }}
            title="Grubu kalıcı olarak sil"
          >
            <Trash2 size={11} />
            Grubu Sil
          </button>
        )}
      </div>
    </div>,
    document.body,
  )
}

/* ── Small metric cell ─────────────────────────────────── */
function Metric({ label, value, accent = '#F5C842', big }) {
  return (
    <div
      className="px-2 py-1 rounded border"
      style={{ borderColor: '#1E3050', background: 'rgba(30,48,80,0.25)' }}
    >
      <div className="text-[9px] text-ops-500 uppercase tracking-wider">{label}</div>
      <div
        className={`font-mono ${big ? 'text-sm font-bold' : 'text-xs'}`}
        style={{ color: accent }}
      >
        {value}
      </div>
    </div>
  )
}

function defaultGroupName() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `Alan ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
