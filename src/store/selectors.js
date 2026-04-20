/**
 * Operatör-farkında seçiciler — Zustand store üzerinde hesaplanır.
 *
 * Amacı: her panel "bu operatöre ait node'lar neler?" soruşunu aynı
 * yerden çözsün. Store ham veriyi bozulmadan tutar (böylece operatör
 * değişince eski kayıt kaybolmaz); UI bu seçicilerle filtreli görür.
 *
 * Kullanım:
 *
 *   import { useVisibleNodes, useOperatorFacilityProducts } from '@/store/selectors'
 *   const nodes = useVisibleNodes()          // aktif operatör + scope
 *   const fp    = useOperatorFacilityProducts()
 *
 * ÖNEMLİ — referans stabilitesi:
 *   Her hook iki ham dilim (operator + liste) okuyup `useMemo` ile
 *   filtreliyor. Böylece mapView/zoom gibi *alakasız* store değişimleri
 *   yeni bir .filter() dizisi üretmiyor → aşağı akıştaki useMemo/
 *   useCallback dep'leri boşuna invalidate olmuyor (önceden App.jsx
 *   useCoverage zincirini tetikleyip "hesaplıyor..." flash'ine sebep
 *   oluyordu).
 *
 *   Store doğrudan selector içinde .filter() çağrılırsa Zustand her
 *   store emit'inde yeni referans döner ve abone component'i
 *   gereksiz yere rerender eder.
 */
import { useMemo } from 'react'
import useStore from './useStore'

/** Aktif operatör kodunu döner. */
export const useOperatorCode = () => useStore((s) => s.operator)

/**
 * Aktif operatöre ait custom/preset node'lar.
 * Etiketsiz kayıtlar 'TR' kabul edilir (migration).
 */
export const useVisibleNodes = () => {
  const customNodes = useStore((s) => s.customNodes)
  const operator    = useStore((s) => s.operator)
  return useMemo(
    () => customNodes.filter((n) => (n.operator || 'TR') === operator),
    [customNodes, operator]
  )
}

/** Aktif operatörün isimli alan grupları. */
export const useVisibleGroups = () => {
  const areaGroups = useStore((s) => s.areaGroups)
  const operator   = useStore((s) => s.operator)
  return useMemo(
    () => areaGroups.filter((g) => (g.operator || 'TR') === operator),
    [areaGroups, operator]
  )
}

/**
 * Aktif operatörün facility-product deployment haritası.
 * Aynı facilityKey altında başka operatörlerin kayıtları varsa
 * bu seçici onları dışarıda bırakır; anahtar altında hiç kalmadıysa
 * key de düşer.
 */
export const useOperatorFacilityProducts = () => {
  const facilityProducts = useStore((s) => s.facilityProducts)
  const operator         = useStore((s) => s.operator)
  return useMemo(() => {
    const out = {}
    for (const [key, list] of Object.entries(facilityProducts)) {
      if (!Array.isArray(list)) continue
      const filtered = list.filter((d) => (d.operator || 'TR') === operator)
      if (filtered.length > 0) out[key] = filtered
    }
    return out
  }, [facilityProducts, operator])
}

/** Aktif operatörün saved view listesi. */
export const useOperatorSavedViews = () => {
  const savedViews = useStore((s) => s.savedViews)
  const operator   = useStore((s) => s.operator)
  return useMemo(
    () => savedViews.filter((v) => (v.operator || 'TR') === operator),
    [savedViews, operator]
  )
}

/** Aktif operatörün görev (mission) listesi. */
export const useOperatorMissions = () => {
  const missions = useStore((s) => s.missions)
  const operator = useStore((s) => s.operator)
  return useMemo(
    () => missions.filter((m) => (m.operator || 'TR') === operator),
    [missions, operator]
  )
}

/** Aktif operatörün sensör envanteri. */
export const useOperatorSensors = () => {
  const sensors  = useStore((s) => s.sensors)
  const operator = useStore((s) => s.operator)
  return useMemo(
    () => sensors.filter((x) => (x.operator || 'TR') === operator),
    [sensors, operator]
  )
}

/**
 * Aktif operatörün ürün envanteri (productId → sayaç).
 * Operatör için hiç kayıt yoksa boş obje.
 */
export const useOperatorInventory = () => {
  const inventory = useStore((s) => s.inventory)
  const operator  = useStore((s) => s.operator)
  return useMemo(
    () => inventory[operator] || EMPTY_OBJ,
    [inventory, operator]
  )
}
const EMPTY_OBJ = Object.freeze({})

/* ── Saf yardımcılar (hook olmayan, selector composition için) ─── */

/** Operatör koduna göre node filtrele (herhangi bir dizi için). */
export const filterByOperator = (list, opCode) =>
  Array.isArray(list)
    ? list.filter((x) => (x?.operator || 'TR') === opCode)
    : []

/** Node'ları ülke odağına göre filtrele — bounds kontrolüyle. */
export const filterByCountryBounds = (nodes, countryMeta) => {
  if (!countryMeta?.bounds || !Array.isArray(nodes)) return nodes
  const [[sLat, wLng], [nLat, eLng]] = countryMeta.bounds
  return nodes.filter(
    (n) => n.lat >= sLat && n.lat <= nLat && n.lng >= wLng && n.lng <= eLng
  )
}
