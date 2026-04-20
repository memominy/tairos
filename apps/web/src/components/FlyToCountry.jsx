import { useEffect } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import useStore from '../store/useStore'
import { getCountry } from '../config/countries'

/**
 * FlyToCountry — focusCountry değişince (veya tick artınca) kamerayı o
 * ülkenin bounds'ına uçurur. Hatta bounds tanımlı değilse odaklanamaz
 * (büyük ülkelerin çoğunda bounds mevcut; olmayanları countries.js
 * doldurmak bir satırlık iş).
 *
 * FlyToConflict ile aynı pattern — tick deps ile aynı ülke iki kez
 * seçilirse yine animasyon koşar.
 *
 * MapContainer içinde mount edilir (useMap() çağrısı o context'i gerektirir).
 */
export default function FlyToCountry() {
  const focusCountry = useStore((s) => s.focusCountry)
  const tick         = useStore((s) => s.countryFocusTick)
  const map          = useMap()

  useEffect(() => {
    if (!focusCountry) return
    const country = getCountry(focusCountry)
    if (!country || !Array.isArray(country.bounds)) return
    try {
      const bounds = L.latLngBounds(country.bounds)
      if (!bounds.isValid()) return
      map.flyToBounds(bounds, {
        padding:  [60, 60],
        maxZoom:  7,
        duration: 0.9,
        animate:  true,
      })
    } catch {
      // degenerate bounds → sessiz düş
    }
  }, [focusCountry, tick, map])

  return null
}
