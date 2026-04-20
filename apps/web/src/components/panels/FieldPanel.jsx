import React from 'react'
import {
  MapPin, PenLine, Trash2, Layers, Eye, EyeOff, Bookmark,
} from 'lucide-react'
import useStore from '../../store/useStore'
import {
  useVisibleNodes, useVisibleGroups, useOperatorSavedViews,
} from '../../store/selectors'
import { getOperator } from '../../config/operators'
import {
  CATEGORIES, CATEGORY_ORDER, CATEGORY_GROUPS, CATEGORIES_BY_GROUP,
  ASSET_SECTION_LABEL,
} from '../../config/categories'
import allFacilities from '../../data/facilities.json'
import { Section, CategoryGroup, CategoryRow } from './_shared'

/**
 * FieldPanel ("Saha")
 *
 * Operatör-scope'lu saha görünümü — aktif operatör hangisi ise o
 * operatörün node'ları/gruplarını görür. Başka operatörün kayıtları
 * store'da durur ama burada görünmez. Böylece "TR oynarken Ukrayna
 * düğümü görünmez, UA'ya geçince TR kayıtları tekrar gizlenir"
 * beklentisi karşılanır.
 *
 * Bölümler:
 *   1. Nodes (operatör-scoped)        — seed + custom, aç/kapat, ad/sil
 *   2. Gruplar (operatör-scoped)      — adlandırılmış alan kayıtları
 *   3. Kayıtlı Görünümler             — F2 savedViews, tek-tık restore
 *   4. Stratejik Varlık Envanteri     — CATEGORY_GROUPS → rows
 *
 * Not: facility-envanteri (category) operatörden BAĞIMSIZ — aynı
 * envanter her operatör için aynıdır, çünkü bu liste "haritadaki
 * bağımsız objeler" (DHMİ, Polis karakolu, GERD vb). Operatör-scope
 * burada değil, FacilityProducts üzerinde olur.
 */
export default function FieldPanel() {
  const operatorCode = useStore((s) => s.operator)
  const operator     = getOperator(operatorCode)

  // ── Nodes ───────────────────────────────────────────────
  const visibleNodes     = useVisibleNodes()
  const allNodeCount     = useStore((s) => s.customNodes.length)
  const removeNode       = useStore((s) => s.removeNode)
  const renameNode       = useStore((s) => s.renameNode)
  const clearCustomNodes = useStore((s) => s.clearCustomNodes)
  const resetNodes       = useStore((s) => s.resetNodes)
  const nodeEditMode     = useStore((s) => s.nodeEditMode)
  const setNodeEditMode  = useStore((s) => s.setNodeEditMode)

  // ── Groups ──────────────────────────────────────────────
  const visibleGroups       = useVisibleGroups()
  const highlightedGroup    = useStore((s) => s.highlightedGroupId)
  const setHighlightedGroup = useStore((s) => s.setHighlightedGroup)
  const openGroup           = useStore((s) => s.openGroup)
  const removeGroup         = useStore((s) => s.removeGroup)
  const clearAllGroups      = useStore((s) => s.clearAllGroups)

  // ── Saved views (operator-scope) ────────────────────────
  const savedViews   = useOperatorSavedViews()
  const saveView     = useStore((s) => s.saveView)
  const restoreView  = useStore((s) => s.restoreView)
  const removeView   = useStore((s) => s.removeView)

  // ── Categories (operator-neutral envanter) ──────────────
  const activeCategories = useStore((s) => s.activeCategories)
  const toggleCategory   = useStore((s) => s.toggleCategory)
  const setAllCategories = useStore((s) => s.setAllCategories)

  const countByCategory = React.useMemo(
    () => CATEGORY_ORDER.reduce((acc, id) => {
      acc[id] = allFacilities.filter((f) => f.category === id).length
      return acc
    }, {}),
    []
  )

  // Başka operatörlere ait (bu panelde gizli) node sayısı — bilgi amaçlı
  const otherOperatorNodeCount = allNodeCount - visibleNodes.length

  const activeCategoryCount = activeCategories.size

  return (
    <div className="flex-1 overflow-y-auto">
      {/* ── Nodes ─────────────────────────────────────────── */}
      <Section
        icon={MapPin}
        title={`${operator.shortLabel || operator.label} Nodes`}
        badge={visibleNodes.length}
        defaultOpen={false}
        action={
          <>
            <button
              onClick={() => {
                if (confirm('Fabrika ayarlarına geri yüklensin mi? Tüm özel eklemeler silinecek.')) resetNodes()
              }}
              className="px-1.5 py-0.5 rounded border border-ops-600 text-ops-400 hover:text-yellow-400 hover:border-yellow-400/50 transition-colors text-[10px] font-mono"
              title="Varsayılan node listesini geri yükle"
            >↻</button>
            {visibleNodes.length > 0 && (
              <button
                onClick={() => {
                  if (confirm(`${operator.label} için tüm node'lar silinecek. Emin misin?`)) clearCustomNodes()
                }}
                className="px-1.5 py-0.5 rounded border border-ops-600 text-ops-400 hover:text-red-400 hover:border-red-400/50 transition-colors"
                title="Tüm node'ları sil"
              ><Trash2 size={10} /></button>
            )}
            <button
              onClick={() => setNodeEditMode(!nodeEditMode)}
              className={`flex items-center gap-1 px-2 py-0.5 rounded border text-xs transition-all ${
                nodeEditMode
                  ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-400'
                  : 'border-ops-600 text-ops-400 hover:border-ops-400'
              }`}
              title={nodeEditMode ? 'Düzenlemeyi bitir' : 'Haritaya node ekle (haritaya tıkla)'}
            >
              <PenLine size={10} />
              <span>{nodeEditMode ? 'Bitir' : 'Ekle'}</span>
            </button>
          </>
        }
      >
        <div className="px-3">
          {nodeEditMode && (
            <div className="mb-1.5 px-2 py-1 rounded text-xs text-emerald-400 border border-emerald-500/30 bg-emerald-500/8 font-mono">
              ✦ Haritaya tıklayarak {operator.label} adına node ekle
            </div>
          )}
          {visibleNodes.length > 10 && (
            <div className="mb-1.5 px-2 py-1 rounded text-[10px] text-ops-400 border border-ops-600/60 bg-ops-900/40 font-mono leading-snug">
              💡 Kalabalık bir bölge mi? Haritada <span className="text-yellow-300">sağ-tık sürükle</span> → açılan panelden o alandaki node'ları tek seferde sil.
            </div>
          )}
          {visibleNodes.length > 0 ? (
            <div className="space-y-0.5 max-h-48 overflow-y-auto">
              <div className="text-[10px] text-ops-500 font-mono px-1 mb-1">
                tıkla → ad değiştir
              </div>
              {visibleNodes.map((n) => {
                const isUserAdded = !!n.custom
                const dotColor = isUserAdded ? '#34D399' : '#F5C842'
                return (
                  <div key={n.id} className="flex items-center gap-1.5 px-1.5 py-1 rounded group hover:bg-ops-700/50">
                    <span className="shrink-0 w-2 h-2 rounded-sm rotate-45" style={{ background: dotColor }} />
                    <button
                      onClick={() => {
                        const next = prompt('Yeni ad:', n.name)
                        if (next && next.trim() && next.trim() !== n.name) renameNode(n.id, next.trim())
                      }}
                      className="flex-1 text-left text-xs text-ops-200 truncate hover:text-ops-50 transition-colors"
                      title={`${n.name} · ${n.lat.toFixed(3)}, ${n.lng.toFixed(3)}`}
                    >
                      {n.name}
                    </button>
                    <button
                      onClick={() => removeNode(n.id)}
                      className="shrink-0 opacity-0 group-hover:opacity-100 text-ops-500 hover:text-red-400 transition-all"
                      title="Sil"
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="text-xs text-ops-600 italic px-1 leading-snug">
              {nodeEditMode
                ? `Haritaya tıkla → ${operator.label} adına node ekle`
                : otherOperatorNodeCount > 0
                  ? `Bu operatör (${operator.label}) için henüz node yok. Başka operatörlerde ${otherOperatorNodeCount} node var — operatör değiştirerek görebilirsin.`
                  : '↻ ile varsayılan node\'ları geri yükle veya Ekle ile yeni ekle'}
            </div>
          )}
          {otherOperatorNodeCount > 0 && visibleNodes.length > 0 && (
            <div className="mt-2 text-[9px] text-ops-600 font-mono italic leading-snug">
              · başka operatörlerde {otherOperatorNodeCount} node daha saklanıyor
            </div>
          )}
        </div>
      </Section>

      {/* ── Groups ───────────────────────────────────────── */}
      <Section
        icon={Bookmark}
        title="Gruplar"
        badge={visibleGroups.length || null}
        defaultOpen={visibleGroups.length > 0}
        action={
          visibleGroups.length > 0 ? (
            <button
              onClick={() => {
                if (confirm('Tüm gruplar silinecek. Emin misin?')) clearAllGroups()
              }}
              className="px-1.5 py-0.5 rounded border border-ops-600 text-ops-400 hover:text-red-400 hover:border-red-400/50 transition-colors"
              title="Tüm grupları sil"
            ><Trash2 size={10} /></button>
          ) : null
        }
      >
        <div className="px-3">
          {visibleGroups.length === 0 ? (
            <div className="text-xs text-ops-600 italic leading-snug">
              Haritada sağ tıklayıp sürükleyerek bir alan seç,
              ardından panelden "Kaydet" ile gruplamaya ekle.
              Grup aktif operatöre ({operator.label}) etiketlenir.
            </div>
          ) : (
            <div className="space-y-0.5 max-h-48 overflow-y-auto">
              {visibleGroups.map((g) => {
                const isHi = g.id === highlightedGroup
                return (
                  <div
                    key={g.id}
                    onMouseEnter={() => setHighlightedGroup(g.id)}
                    onMouseLeave={() => setHighlightedGroup(null)}
                    className={`flex items-center gap-1.5 px-1.5 py-1 rounded group transition-colors ${
                      isHi ? 'bg-ops-700/60' : 'hover:bg-ops-700/40'
                    }`}
                  >
                    <span
                      className="shrink-0 w-2.5 h-2.5 rounded-sm border"
                      style={{
                        borderColor: g.color,
                        background: isHi ? g.color : `${g.color}33`,
                      }}
                    />
                    <button
                      onClick={() => openGroup(g.id)}
                      className="flex-1 text-left text-xs text-ops-200 truncate hover:text-ops-50 transition-colors"
                      title={`${g.name} · tıkla → aç / düzenle`}
                    >
                      {g.name}
                    </button>
                    <button
                      onClick={() => removeGroup(g.id)}
                      className="shrink-0 opacity-0 group-hover:opacity-100 text-ops-500 hover:text-red-400 transition-all"
                      title="Grubu sil"
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </Section>

      {/* ── Saved Views ─────────────────────────────────── */}
      <Section
        icon={Bookmark}
        title="Kayıtlı Görünümler"
        badge={savedViews.length || null}
        defaultOpen={false}
        action={
          <button
            onClick={() => {
              const name = prompt('Görünüm adı:', '')
              if (name?.trim()) saveView(name.trim())
            }}
            className="px-1.5 py-0.5 rounded border border-ops-600 text-ops-400 hover:text-accent hover:border-accent/50 transition-colors text-[10px] font-mono"
            title="Şu anki kamera + katmanları kaydet"
          >+ Kaydet</button>
        }
      >
        <div className="px-3">
          {savedViews.length === 0 ? (
            <div className="text-xs text-ops-600 italic leading-snug">
              Şu anki kamera + aktif katmanları adlandırılmış bir
              görünüm olarak kaydet. Sonra tek tıkla geri dön.
            </div>
          ) : (
            <div className="space-y-0.5">
              {savedViews.map((v) => (
                <div key={v.id} className="flex items-center gap-1.5 px-1.5 py-1 rounded group hover:bg-ops-700/50">
                  <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-accent/60" />
                  <button
                    onClick={() => restoreView(v.id)}
                    className="flex-1 text-left text-xs text-ops-200 truncate hover:text-ops-50 transition-colors"
                    title={`${v.name} · tıkla → geri dön`}
                  >
                    {v.name}
                  </button>
                  <button
                    onClick={() => removeView(v.id)}
                    className="shrink-0 opacity-0 group-hover:opacity-100 text-ops-500 hover:text-red-400 transition-all"
                    title="Sil"
                  >
                    <Trash2 size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Section>

      {/* ── Asset Inventory (operator-neutral) ──────────── */}
      <Section
        icon={Layers}
        title={ASSET_SECTION_LABEL}
        badge={`${activeCategoryCount}/${CATEGORY_ORDER.length}`}
        defaultOpen
        action={
          <>
            <button onClick={() => setAllCategories(true)}  className="px-1.5 py-0.5 rounded border border-ops-600 text-ops-400 hover:text-ops-100 hover:border-ops-400 transition-colors" title="Tümünü aç"><Eye size={11} /></button>
            <button onClick={() => setAllCategories(false)} className="px-1.5 py-0.5 rounded border border-ops-600 text-ops-400 hover:text-ops-100 hover:border-ops-400 transition-colors" title="Tümünü kapat"><EyeOff size={11} /></button>
          </>
        }
      >
        <div className="px-2">
          {CATEGORY_GROUPS.map((group) => (
            <CategoryGroup key={group.id} group={group}>
              {CATEGORIES_BY_GROUP[group.id].map((id) => (
                <CategoryRow
                  key={id}
                  cat={CATEGORIES[id]}
                  active={activeCategories.has(id)}
                  onToggle={toggleCategory}
                  count={countByCategory[id]}
                />
              ))}
            </CategoryGroup>
          ))}
        </div>
      </Section>
    </div>
  )
}
