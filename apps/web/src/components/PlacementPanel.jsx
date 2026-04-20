import React, { useMemo, useState, useEffect } from 'react'
import { Target, Check, X, Sparkles } from 'lucide-react'
import useStore from '../store/useStore'
import { DRONE_PRODUCTS, DRONE_ORDER } from '../config/drones'
import { planPlacements, polygonAreaKm2, ringToPolygon } from '../utils/placement'

/**
 * Strategic placement panel.
 *
 *   drawing     → short instruction banner while the user draws the polygon
 *   configuring → check the products to co-locate, see auto-computed
 *                 center count & coverage %, then apply.
 *
 * The big idea: operator picks PRODUCTS (which systems run on each center),
 * the algorithm picks LOCATIONS (minimum centers such that the longest-range
 * product fully covers the drawn area). Every center carries every selected
 * product — systems are co-located.
 */
export default function PlacementPanel() {
  const mode            = useStore((s) => s.placementMode)
  const polygon         = useStore((s) => s.placementPolygon)
  const cancel          = useStore((s) => s.cancelPlacement)
  const apply           = useStore((s) => s.applyPlacement)
  const setPreview      = useStore((s) => s.setPlacementPreview)
  const droneRanges     = useStore((s) => s.droneRanges)

  // Which products are selected to co-locate at every chosen center.
  const [selected, setSelected] = useState(() => new Set(DRONE_ORDER))

  // Target coverage — user can loosen this if they want fewer centers.
  const [targetPct, setTargetPct] = useState(99)

  // Reset selections when the tool closes so a fresh run starts clean.
  useEffect(() => {
    if (mode === 'idle') {
      setSelected(new Set(DRONE_ORDER))
      setTargetPct(99)
    }
  }, [mode])

  const areaKm2 = useMemo(() => {
    if (!polygon) return 0
    const poly = ringToPolygon(polygon)
    return Math.round(polygonAreaKm2(poly))
  }, [polygon])

  // Resolve per-product ranges from the store's current drone ranges.
  const productList = useMemo(
    () => DRONE_ORDER
      .filter((id) => selected.has(id))
      .map((id) => ({
        productId: id,
        label:     DRONE_PRODUCTS[id].label,
        rangeKm:   droneRanges[id] ?? DRONE_PRODUCTS[id].rangeKm,
      })),
    [selected, droneRanges],
  )

  // Plan is fully determined by (polygon, selected products, target %).
  const plan = useMemo(() => {
    if (mode !== 'configuring' || !polygon) return null
    return planPlacements(polygon, productList, { targetRatio: targetPct / 100 })
  }, [mode, polygon, productList, targetPct])

  // Push preview to the store so the map draws circles per center per product.
  useEffect(() => {
    if (!plan) return setPreview?.([])
    const items = []
    plan.centers.forEach((c) => {
      c.products.forEach((p) => {
        items.push({
          lat: c.lat, lng: c.lng,
          rangeKm: p.rangeKm,
          productId: p.productId,
          isDriver: p.productId === plan.driverProductId,
        })
      })
    })
    setPreview?.(items)
  }, [plan, setPreview])

  if (mode === 'idle') return null

  // ── Drawing banner ──────────────────────────────────────
  if (mode === 'drawing') {
    return (
      <div
        className="absolute top-2 left-1/2 -translate-x-1/2 z-[1300] rounded-lg border font-mono text-xs px-3 py-2 flex items-center gap-3"
        style={{
          background: 'rgba(13,21,38,0.95)',
          borderColor: '#20C8A077',
          color: '#C8D8F0',
          boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
        }}
      >
        <Target size={13} style={{ color: '#20C8A0' }} />
        <span>
          <span style={{ color: '#20C8A0', fontWeight: 700 }}>Alan Çiz</span>
          <span style={{ color: '#6B7FA0', marginLeft: 8 }}>
            haritaya tıklayarak köşe ekle · çift tıkla → bitir · ESC → iptal
          </span>
        </span>
        <button
          onClick={cancel}
          className="ml-2 px-2 py-0.5 rounded border border-red-500/50 text-red-400 hover:bg-red-500/20 transition-colors"
        >
          İptal
        </button>
      </div>
    )
  }

  // ── Configuring panel ───────────────────────────────────
  const centerCount    = plan?.centers.length || 0
  const coveragePct    = Math.round((plan?.coverageRatio || 0) * 100)
  const driverId       = plan?.driverProductId
  const driverRangeKm  = plan?.driverRangeKm || 0
  const canApply       = centerCount > 0 && selected.size > 0

  const toggle = (id) => setSelected((s) => {
    const next = new Set(s)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  return (
    <div
      className="absolute top-2 left-1/2 -translate-x-1/2 z-[1300] rounded-xl border w-[440px] max-w-[92vw]"
      style={{
        background: 'rgba(13,21,38,0.97)',
        borderColor: '#20C8A077',
        color: '#C8D8F0',
        boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
      }}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: '#20C8A033' }}>
        <div className="flex items-center gap-2">
          <Sparkles size={14} style={{ color: '#20C8A0' }} />
          <span style={{ color: '#20C8A0', fontWeight: 700, fontSize: 12 }}>
            Stratejik Yerleştirme
          </span>
          <span className="text-xs font-mono" style={{ color: '#6B7FA0' }}>
            · {areaKm2.toLocaleString('tr-TR')} km²
          </span>
        </div>
        <button
          onClick={cancel}
          className="text-ops-500 hover:text-red-400 transition-colors"
          title="İptal"
        >
          <X size={14} />
        </button>
      </div>

      <div className="px-3 py-2.5 space-y-3">
        <div className="text-[11px] text-ops-400 leading-snug">
          Her merkeze kurulacak sistemleri seç. Alan en az merkezle kaplansın diye
          konumlar en uzun menzilli ürüne göre otomatik hesaplanır — tüm seçili
          sistemler aynı merkezlere birlikte konuşlandırılır.
        </div>

        {/* Product checklist — co-location selector */}
        <div className="space-y-1.5">
          {DRONE_ORDER.map((id) => {
            const product = DRONE_PRODUCTS[id]
            const range   = droneRanges[id] ?? product.rangeKm
            const on      = selected.has(id)
            const isDriver = id === driverId
            return (
              <button
                key={id}
                onClick={() => toggle(id)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded border transition-all text-left"
                style={{
                  borderColor: on ? `${product.color}88` : '#1E3050',
                  background:  on ? `${product.color}15` : 'transparent',
                }}
              >
                <span
                  className="shrink-0 w-4 h-4 rounded border flex items-center justify-center"
                  style={{
                    borderColor: on ? product.color : '#3A4F6A',
                    background:  on ? product.color : 'transparent',
                    color:       '#0D1526',
                  }}
                >
                  {on ? <Check size={10} strokeWidth={3} /> : null}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-xs font-bold" style={{ color: on ? product.color : '#6A7F9F' }}>
                      {product.label}
                    </span>
                    <span className="text-[10px] font-mono" style={{ color: '#6B7FA0' }}>
                      {range} km
                    </span>
                    {isDriver && on && (
                      <span
                        className="text-[9px] font-mono px-1.5 py-px rounded-full"
                        style={{ background: `${product.color}22`, color: product.color }}
                        title="Alan kaplamasını bu ürün belirliyor (en uzun menzil)"
                      >
                        kaplama ölçütü
                      </span>
                    )}
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        {/* Coverage slider — trade centers for completeness */}
        <div className="px-1 pt-1">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-mono text-ops-500 uppercase tracking-wider">
              Hedef kaplama
            </span>
            <span className="text-xs font-mono" style={{ color: '#20C8A0' }}>{targetPct}%</span>
          </div>
          <input
            type="range" min={70} max={100} step={1}
            value={targetPct}
            onChange={(e) => setTargetPct(Number(e.target.value))}
            className="range-slider w-full"
            style={{
              background: `linear-gradient(to right, #20C8A0 0%, #20C8A0 ${((targetPct - 70) / 30) * 100}%, #1E3050 ${((targetPct - 70) / 30) * 100}%, #1E3050 100%)`,
            }}
          />
          <div className="flex justify-between text-[9px] font-mono text-ops-600">
            <span>daha az merkez</span>
            <span>tam kaplama</span>
          </div>
        </div>

        {/* Live plan summary */}
        <div
          className="rounded-md border px-2.5 py-2 flex items-center justify-between"
          style={{ borderColor: '#20C8A033', background: '#20C8A008' }}
        >
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-mono text-ops-500 uppercase tracking-wider">plan</span>
            <span className="text-xs" style={{ color: '#C8D8F0' }}>
              <span style={{ color: '#20C8A0', fontWeight: 700 }}>{centerCount}</span> merkez ·{' '}
              <span style={{ color: coveragePct >= targetPct ? '#20C8A0' : '#F5C842' }}>
                %{coveragePct}
              </span>{' '}
              <span style={{ color: '#6B7FA0' }}>kaplama</span>
            </span>
          </div>
          {driverRangeKm > 0 && (
            <div className="text-right">
              <div className="text-[10px] font-mono text-ops-500">ölçüt menzili</div>
              <div className="text-xs font-mono" style={{ color: '#20C8A0' }}>{driverRangeKm} km</div>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 px-3 py-2 border-t" style={{ borderColor: '#20C8A022' }}>
        <span className="text-[11px] font-mono" style={{ color: '#6B7FA0' }}>
          {selected.size === 0
            ? '↳ en az bir sistem seç'
            : `↳ her merkeze ${selected.size} sistem birlikte kurulur`}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={cancel}
            className="px-2.5 py-1 rounded border border-ops-600 text-ops-300 hover:border-ops-400 font-mono text-xs"
          >
            İptal
          </button>
          <button
            onClick={() => apply(plan?.centers)}
            disabled={!canApply}
            className="flex items-center gap-1 px-3 py-1 rounded border font-mono text-xs transition-colors"
            style={{
              borderColor: canApply ? '#20C8A0' : '#2A3F5A',
              background:  canApply ? '#20C8A022' : 'transparent',
              color:       canApply ? '#20C8A0' : '#4A5F80',
              cursor:      canApply ? 'pointer' : 'not-allowed',
            }}
          >
            <Check size={11} />
            Yerleştir
          </button>
        </div>
      </div>
    </div>
  )
}
