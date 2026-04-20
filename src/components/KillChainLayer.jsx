import React, { useEffect, useRef, useState, useMemo } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import useStore from '../store/useStore'
import { FORCE_SIDE_COLOUR } from '../config/forceDeployments'

/**
 * Komuta Zinciri (Kill-Chain) — bir karargâh (HQ) seçildiğinde, aynı
 * taraf + aynı tiyatrodaki birliklerden o karargâha bağlı olanları
 * animasyonlu çizgilerle bağlar.
 *
 * Bağlılık kuralları (öncelik sırasıyla):
 *   1. `u.parentId` alanı HQ'nun id'sine eşitse → kesin subordinate
 *   2. `u.formation` alanı HQ'nun `name` veya `formation` field'ının
 *      anlamlı bir alt-stringini içeriyorsa → isim-eşleşmesi
 *   3. Yukarıdakiler boşsa ve `killChainRangeKm` içinde aynı taraf +
 *      tiyatro birim varsa → mesafe-tabanlı yedek (tek seferlik,
 *      "hiç bir şey gösterme"den iyi)
 *
 * Pane zIndex 479 — force-deploy chip'lerinin (480) hemen altında,
 * tehdit halkalarının (474) üzerinde; seçili HQ etrafındaki halo +
 * bağlantı çizgileri chip'lerin önünde durmasın ama tehdidi örtsün.
 *
 * Demo değeri: "bu karargâhı vurursan bu birlikler kafasız kalır"
 * hikayesini iki klikte, haritada, konuşlanma verisinden üretir.
 */
export default function KillChainLayer() {
  const map = useMap()

  const on       = useStore((s) => s.killChainOn)
  const selected = useStore((s) => s.selectedDeployUnit)
  const rangeKm  = useStore((s) => s.killChainRangeKm)

  const [data, setData] = useState(null)
  const groupRef = useRef(null)

  useEffect(() => {
    if (!on || data) return
    let cancelled = false
    import('../data/forceDeployments.json').then((mod) => {
      if (cancelled) return
      setData(flattenForceData(mod.default))
    }).catch(() => { if (!cancelled) setData([]) })
    return () => { cancelled = true }
  }, [on, data])

  useEffect(() => {
    if (!map.getPane('kill-chain-pane')) {
      const pane = map.createPane('kill-chain-pane')
      pane.style.zIndex = 479
      pane.style.pointerEvents = 'none'
    }
  }, [map])

  /* Subordinate resolution. Priority waterfall so demo data with
     explicit `parentId` wiring looks crisp, while loose seed data
     still gets something plausible on screen. */
  const subordinates = useMemo(() => {
    if (!on || !selected || !data) return []
    if (selected.type !== 'hq') return []

    const sameSide = (u) =>
         u.id !== selected.id
      && u.side === selected.side
      && u.conflict === selected.conflict

    // 1. Explicit parentId wiring.
    const byParent = data.filter((u) => sameSide(u) && u.parentId === selected.id)
    if (byParent.length > 0) return byParent

    // 2. Name substring match — HQ name or formation must appear in
    //    the subordinate's formation / note. Min length 4 to avoid
    //    false positives on ultra-short tokens like "K3".
    const keys = [selected.name, selected.formation]
      .filter((s) => s && s.length >= 4)
      .map((s) => s.toLowerCase())
    if (keys.length > 0) {
      const byName = data.filter((u) => {
        if (!sameSide(u)) return false
        const hay = `${u.formation || ''} ${u.note || ''}`.toLowerCase()
        return keys.some((k) => hay.includes(k))
      })
      if (byName.length > 0) return byName
    }

    // 3. Proximity fallback — same side + conflict, within rangeKm.
    //    Only used when the above yielded nothing. Soft guess, but
    //    better than a blank map when the seed is sparse.
    return data
      .filter(sameSide)
      .filter((u) => haversineKm(selected.lat, selected.lng, u.lat, u.lng) <= rangeKm)
  }, [on, selected, data, rangeKm])

  useEffect(() => {
    if (groupRef.current) { groupRef.current.remove(); groupRef.current = null }
    if (!on || !selected || selected.type !== 'hq' || subordinates.length === 0) return

    const group = L.layerGroup().addTo(map)
    groupRef.current = group

    const sideColour = FORCE_SIDE_COLOUR[selected.side] || '#888'

    // HQ halo — a pulsing oversize circle around the HQ chip so the
    // "decapitation target" stands out in the crowd.
    L.circleMarker([selected.lat, selected.lng], {
      pane: 'kill-chain-pane',
      radius: 16,
      color: sideColour,
      weight: 2,
      opacity: 0.85,
      fillColor: sideColour,
      fillOpacity: 0.12,
      className: 'tairos-killchain-hq-halo',
      interactive: false,
    }).addTo(group)

    subordinates.forEach((sub) => {
      // Bağlantı çizgisi — animasyonlu kesik çizgi (CSS tarafında
      // dash-offset animation'ı var).
      L.polyline([[selected.lat, selected.lng], [sub.lat, sub.lng]], {
        pane: 'kill-chain-pane',
        color: sideColour,
        weight: 1.4,
        opacity: 0.7,
        dashArray: '6,5',
        className: 'tairos-killchain-line',
        interactive: false,
      }).addTo(group)

      // Subordinate endpoint — küçük dolgulu daire, çizginin nereye
      // bağlandığını net gösterir.
      L.circleMarker([sub.lat, sub.lng], {
        pane: 'kill-chain-pane',
        radius: 4.5,
        color: sideColour,
        weight: 1.5,
        opacity: 0.95,
        fillColor: '#0D1526',
        fillOpacity: 1,
        className: 'tairos-killchain-endpoint',
        interactive: false,
      }).addTo(group)
    })

    return () => {
      if (groupRef.current) { groupRef.current.remove(); groupRef.current = null }
    }
  }, [map, on, selected, subordinates])

  return null
}

function flattenForceData(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  const out = []
  Object.keys(raw).forEach((k) => {
    const arr = raw[k]
    if (!Array.isArray(arr)) return
    arr.forEach((u) => { if (u) out.push({ ...u, conflict: u.conflict || k }) })
  })
  return out
}

/* Great-circle distance km — tiny inline, avoids pulling in turf here. */
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2
          + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}
