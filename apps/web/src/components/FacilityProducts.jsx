import React, { useState } from 'react'
import { Plus, Trash2, Package, ChevronDown, ChevronRight, Check, X } from 'lucide-react'
import useStore from '../store/useStore'
import { DRONE_PRODUCTS, DRONE_ORDER } from '../config/drones'
import {
  facilityKey,
  DEPLOYMENT_STATUSES,
  STATUS_BY_ID,
  RANGE_MIN_KM,
  RANGE_MAX_KM,
} from '../utils/facilityProducts'

/**
 * Product-placement section rendered inside DetailPanel.
 * Lets the user drop Nova / Iris (and future products) onto a specific
 * facility or node, then fine-tune per-deployment range, quantity, status,
 * and free-text notes. Everything persists to localStorage via the store.
 *
 * UX şeması (node ile paralel):
 *   - Compact satır: [▶] [renk] [etiket + sayaç · menzil + durum] [Kaldır]
 *   - Tıklanınca açılan editör: menzil / adet / durum / not / hızlı
 *     presetler / (radar ise) tarama hızı
 *   - Kaldır butonu: her zaman görünür + confirm() ile doğrulama
 *     (node'ların Trash gibi, yanlış tıklamayı engeller)
 */
export default function FacilityProducts({ facility }) {
  const facilityProducts        = useStore((s) => s.facilityProducts)
  const addFacilityProduct      = useStore((s) => s.addFacilityProduct)
  const updateFacilityProduct   = useStore((s) => s.updateFacilityProduct)
  const removeFacilityProduct   = useStore((s) => s.removeFacilityProduct)
  const clearFacilityProducts   = useStore((s) => s.clearFacilityProducts)

  const [picker, setPicker]     = useState(false)
  const [expanded, setExpanded] = useState({})   // uid → bool (details open)

  const key         = facilityKey(facility)
  const deployments = (key && facilityProducts[key]) || []

  if (!key) return null

  const toggleExpanded = (uid) =>
    setExpanded((e) => ({ ...e, [uid]: !e[uid] }))

  const handleAdd = (productId) => {
    const product = DRONE_PRODUCTS[productId]
    if (!product) return
    // Snapshot the current uids so we can diff and find the newly added one
    // after the store update, then auto-expand it.
    const before = new Set((key && facilityProducts[key] || []).map((d) => d.uid))
    addFacilityProduct(facility, product)
    setPicker(false)
    // The store update is synchronous; run on next tick so our closure sees
    // the refreshed deployments array.
    setTimeout(() => {
      const s = useStore.getState()
      const fresh = (key && s.facilityProducts[key]) || []
      const added = fresh.find((d) => !before.has(d.uid))
      if (added) setExpanded((e) => ({ ...e, [added.uid]: true }))
    }, 0)
  }

  /** Kaldır: confirm diyaloğundan geçirmeden silme — node'daki deleteNode
   *  pattern'i ile bire bir. Kullanıcı yanlış tıklamayı anında fark eder,
   *  ve "silemedim sandım" durumu olmaz. */
  const handleRemove = (d, product) => {
    const label = product?.label || d.productId
    const msg   = `${label} konuşlandırması silinsin mi?` +
                  (d.quantity > 1 ? ` (×${d.quantity})` : '')
    if (confirm(msg)) {
      removeFacilityProduct(facility, d.uid)
    }
  }

  return (
    <div className="mt-2 pt-3 border-t border-ops-700">
      {/* Section header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-xs text-ops-300">
          <Package size={13} />
          <span className="font-semibold">Konuşlu Ürünler</span>
          {deployments.length > 0 && (
            <span className="text-ops-400 font-mono">· {deployments.length}</span>
          )}
        </div>
        {deployments.length > 1 && (
          <button
            onClick={() => {
              if (confirm('Bu varlıktaki tüm ürün konuşlandırmaları silinsin mi?'))
                clearFacilityProducts(facility)
            }}
            className="text-[10px] text-ops-500 hover:text-red-400 transition-colors"
          >
            tümünü temizle
          </button>
        )}
      </div>

      {/* Deployment cards */}
      <div className="space-y-2">
        {deployments.map((d) => {
          const product = DRONE_PRODUCTS[d.productId]
          if (!product) return null
          const status = STATUS_BY_ID[d.status] || DEPLOYMENT_STATUSES[0]
          const isOpen = !!expanded[d.uid]
          return (
            <div
              key={d.uid}
              className={`rounded-lg border bg-ops-900/40 overflow-hidden transition-colors ${
                isOpen ? 'border-ops-600' : 'border-ops-700 hover:border-ops-600'
              }`}
              style={{ borderLeft: `3px solid ${product.color}` }}
            >
              {/* Compact row — her zaman görünür. Sol blok (chevron +
                  label) düzenlemek için genişletir; sağdaki kırmızı
                  tonlu kaldır butonu ayrı bir dokunma alanı, yanlış
                  tıklamayı önlemek için confirm() ile sarılı. */}
              <div className="flex items-center gap-1 px-1.5 py-1.5">
                <button
                  onClick={() => toggleExpanded(d.uid)}
                  className="flex-1 min-w-0 flex items-center gap-2 text-left rounded hover:bg-ops-700/40 px-1 py-0.5 -mx-0.5 -my-0.5 transition-colors"
                  title={isOpen ? 'Ayrıntıları gizle' : 'Ayrıntıları düzenle'}
                >
                  {isOpen ? (
                    <ChevronDown size={12} className="shrink-0 text-ops-400" />
                  ) : (
                    <ChevronRight size={12} className="shrink-0 text-ops-500" />
                  )}
                  <div
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: product.color }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-xs font-semibold text-ops-100 truncate">
                        {product.label}
                      </span>
                      <span className="text-[10px] font-mono text-ops-400 shrink-0">
                        ×{d.quantity} · {d.rangeKm}km
                      </span>
                    </div>
                    <div
                      className="text-[10px] font-mono mt-0.5 truncate"
                      style={{ color: status.color }}
                    >
                      ● {status.label}
                    </div>
                  </div>
                </button>
                <button
                  onClick={() => handleRemove(d, product)}
                  className="shrink-0 flex items-center justify-center w-7 h-7 rounded border border-red-500/30 text-red-400/80 hover:bg-red-500/10 hover:border-red-500/60 hover:text-red-400 transition-colors"
                  title="Konuşlandırmayı sil"
                  aria-label={`${product.label} konuşlandırmasını sil`}
                >
                  <Trash2 size={13} />
                </button>
              </div>

              {/* Expanded editor */}
              {isOpen && (
                <div className="px-2.5 pb-2.5 pt-1 space-y-2 border-t border-ops-700/50 bg-ops-900/50">
                  {/* Range slider */}
                  <div>
                    <div className="flex items-baseline justify-between">
                      <label className="text-[10px] text-ops-400">Menzil</label>
                      <span className="text-[10px] font-mono text-ops-100">
                        {d.rangeKm} km
                      </span>
                    </div>
                    <input
                      type="range"
                      min={RANGE_MIN_KM}
                      max={RANGE_MAX_KM}
                      step={1}
                      value={d.rangeKm}
                      onChange={(e) =>
                        updateFacilityProduct(facility, d.uid, {
                          rangeKm: Number(e.target.value),
                        })
                      }
                      className="range-slider mt-1"
                    />
                  </div>

                  {/* Quantity + status row */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-ops-400 block mb-1">
                        Adet
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={999}
                        value={d.quantity}
                        onChange={(e) =>
                          updateFacilityProduct(facility, d.uid, {
                            quantity: Math.max(
                              1,
                              Math.min(999, parseInt(e.target.value, 10) || 1)
                            ),
                          })
                        }
                        className="w-full px-2 py-1 text-xs font-mono bg-ops-800 border border-ops-600 rounded text-ops-100 focus:outline-none focus:border-ops-500"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-ops-400 block mb-1">
                        Durum
                      </label>
                      <select
                        value={d.status}
                        onChange={(e) =>
                          updateFacilityProduct(facility, d.uid, {
                            status: e.target.value,
                          })
                        }
                        className="w-full px-1.5 py-1 text-xs bg-ops-800 border border-ops-600 rounded text-ops-100 focus:outline-none focus:border-ops-500"
                      >
                        {DEPLOYMENT_STATUSES.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Note */}
                  <div>
                    <label className="text-[10px] text-ops-400 block mb-1">
                      Not
                    </label>
                    <textarea
                      value={d.note}
                      onChange={(e) =>
                        updateFacilityProduct(facility, d.uid, {
                          note: e.target.value,
                        })
                      }
                      placeholder="Operasyonel not, birim, tarih…"
                      rows={2}
                      className="w-full px-2 py-1 text-xs bg-ops-800 border border-ops-600 rounded text-ops-200 placeholder-ops-500 focus:outline-none focus:border-ops-500 resize-none"
                    />
                  </div>

                  {/* Quick range presets */}
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-ops-500">hızlı:</span>
                    {[25, 50, 100, 150, 200].map((km) => (
                      <button
                        key={km}
                        onClick={() =>
                          updateFacilityProduct(facility, d.uid, {
                            rangeKm: km,
                          })
                        }
                        className={`text-[10px] font-mono px-1.5 py-0.5 rounded border transition-colors ${
                          d.rangeKm === km
                            ? 'border-ops-500 text-ops-100 bg-ops-700'
                            : 'border-ops-700 text-ops-400 hover:border-ops-600 hover:text-ops-200'
                        }`}
                      >
                        {km}
                      </button>
                    ))}
                  </div>

                  {/* Radar-only: rotation speed */}
                  {product.kind === 'radar' && (
                    <div>
                      <div className="flex items-baseline justify-between">
                        <label className="text-[10px] text-ops-400">
                          Tarama hızı
                        </label>
                        <span className="text-[10px] font-mono text-ops-100">
                          {(d.sweepSec ?? product.sweepSec ?? 4)}s / tur
                        </span>
                      </div>
                      <input
                        type="range"
                        min={1}
                        max={20}
                        step={0.5}
                        value={d.sweepSec ?? product.sweepSec ?? 4}
                        onChange={(e) =>
                          updateFacilityProduct(facility, d.uid, {
                            sweepSec: Number(e.target.value),
                          })
                        }
                        className="range-slider mt-1"
                      />
                      <div className="flex items-center gap-1 mt-1">
                        <span className="text-[10px] text-ops-500">hızlı:</span>
                        {[1.5, 3, 5, 8, 12].map((s) => (
                          <button
                            key={s}
                            onClick={() =>
                              updateFacilityProduct(facility, d.uid, {
                                sweepSec: s,
                              })
                            }
                            className={`text-[10px] font-mono px-1.5 py-0.5 rounded border transition-colors ${
                              (d.sweepSec ?? product.sweepSec) === s
                                ? 'border-ops-500 text-ops-100 bg-ops-700'
                                : 'border-ops-700 text-ops-400 hover:border-ops-600 hover:text-ops-200'
                            }`}
                          >
                            {s}s
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Editör footer — node panelindeki gibi ayırıcı alt
                      şerit: sol tarafta kapat, sağda belirgin kaldır.
                      Minik-ikon kalır (sağ üstte, hızlı erişim), ama
                      açıkken büyük etiketli buton da burada durur. */}
                  <div className="flex items-center gap-2 pt-2 border-t border-ops-700/60">
                    <button
                      onClick={() => toggleExpanded(d.uid)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded border border-ops-700 text-[11px] text-ops-300 hover:bg-ops-700/50 hover:border-ops-600 hover:text-ops-100 transition-colors"
                    >
                      <X size={11} />
                      Kapat
                    </button>
                    <button
                      onClick={() => handleRemove(d, product)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded border border-red-500/40 text-[11px] text-red-400 hover:bg-red-500/10 hover:border-red-500/70 transition-colors"
                      title="Bu konuşlandırmayı sil"
                    >
                      <Trash2 size={11} />
                      Sil
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}

        {deployments.length === 0 && !picker && (
          <div className="text-[11px] text-ops-500 italic px-1">
            Bu varlığa henüz ürün konuşlandırılmamış.
          </div>
        )}
      </div>

      {/* Add product */}
      {picker ? (
        <div className="mt-2 rounded-lg border border-ops-700 bg-ops-900/40 p-2">
          <div className="text-[10px] text-ops-400 mb-1.5">Ürün seç</div>
          <div className="grid grid-cols-2 gap-1.5">
            {DRONE_ORDER.map((id) => {
              const p = DRONE_PRODUCTS[id]
              return (
                <button
                  key={id}
                  onClick={() => handleAdd(id)}
                  className="flex items-center gap-1.5 px-2 py-1.5 rounded border border-ops-700 hover:border-ops-500 hover:bg-ops-700/50 transition-colors text-left"
                  style={{ borderLeft: `3px solid ${p.color}` }}
                >
                  <div
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: p.color }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-ops-100 truncate">
                      {p.label}
                    </div>
                    <div className="text-[9px] font-mono text-ops-500">
                      {p.rangeKm}km
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
          <button
            onClick={() => setPicker(false)}
            className="w-full mt-1.5 text-[10px] text-ops-500 hover:text-ops-300 transition-colors"
          >
            iptal
          </button>
        </div>
      ) : (
        <button
          onClick={() => setPicker(true)}
          className="w-full mt-2 flex items-center justify-center gap-1 py-1.5 rounded-lg border border-dashed border-ops-600 text-[11px] text-ops-400 hover:border-ops-500 hover:text-ops-200 hover:bg-ops-700/30 transition-colors"
        >
          <Plus size={11} />
          Ürün ekle
        </button>
      )}
    </div>
  )
}
