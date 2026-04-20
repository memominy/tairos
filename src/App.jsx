import React, { useMemo, useCallback, useEffect, lazy, Suspense } from 'react'
import useStore from './store/useStore'
import { useVisibleNodes } from './store/selectors'
import { useUrlState } from './hooks/useUrlState'
import { useCoverage } from './hooks/useCoverage'
import { CATEGORY_ORDER } from './config/categories'
import { DRONE_PRODUCTS } from './config/drones'
import { mergePolygons } from './utils/coverage'
import { attachStoreSounds } from './utils/sounds'
import allFacilities from './data/facilities.json'

import TopBar           from './components/TopBar'
import MapView          from './components/MapView'
import StatCards        from './components/StatCards'
import AssistantBubble  from './components/AssistantBubble'
import ActivityBar      from './components/shell/ActivityBar'
import PanelHost        from './components/shell/PanelHost'
import { useCommandPaletteShortcut } from './components/shell/useCommandPaletteShortcut'

/* Lazy chunks — these components either only mount when a store flag
 * flips (DetailPanel when a facility is selected) or only open on a
 * keyboard shortcut (CommandPalette via Ctrl+K). Splitting them off
 * the main bundle shrinks first-paint JS; the fallback is `null`
 * because both are edge/overlay UI — a loading block would flash. */
const DetailPanel     = lazy(() => import('./components/DetailPanel'))
const CommandPalette  = lazy(() => import('./components/shell/CommandPalette'))

export default function App() {
  useUrlState()
  useCommandPaletteShortcut()   // Ctrl+K / Cmd+K → Command Palette

  // Wire tactical UI sounds to store transitions exactly once. The engine
  // itself stays idle until the first user gesture (autoplay policy).
  useEffect(() => { attachStoreSounds(useStore) }, [])

  const activeCategories = useStore((s) => s.activeCategories)
  const activeDrones     = useStore((s) => s.activeDrones)
  const droneSources     = useStore((s) => s.droneSources)
  const droneRanges      = useStore((s) => s.droneRanges)
  const selectedFacility = useStore((s) => s.selectedFacility)
  const clearSelection   = useStore((s) => s.clearSelection)

  // Gate lazy CommandPalette mount on its open flag. The Ctrl+K
  // shortcut hook runs synchronously (lives in a tiny module); only
  // when the operator actually triggers it does the palette bundle
  // download and mount.
  const commandPaletteOpen = useStore((s) => s.commandPaletteOpen)

  // Tairos node listesi artık operatöre scope'lu — aktif operatör
  // hangisiyse yalnızca onun (ve eski TR migration'ı ile etiketlenenler)
  // node'ları harita + drone kaplama kaynağı olarak kullanılır.
  // Başka operatörlerin kayıtları store'da kalır; FieldPanel'de de
  // gizlenir, operatör değiştirildiğinde tekrar görünür.
  const allTairosNodes = useVisibleNodes()

  // All facilities (military + civil + infrastructure) visible on the map
  // given active category filters. They are markers only — they do NOT
  // contribute to any coverage polygon. Coverage is a drone-only concept.
  const visibleFacilities = useMemo(
    () => allFacilities.filter((f) => activeCategories.has(f.category)),
    [activeCategories]
  )

  // ── Resolve deployment facilities per drone from sources ─────
  const getDroneFacilities = useCallback((droneId) => {
    const sources = droneSources[droneId] || new Set(['nodes'])
    const pts = []
    if (sources.has('nodes')) pts.push(...allTairosNodes)
    CATEGORY_ORDER.forEach((catId) => {
      if (sources.has(catId))
        pts.push(...allFacilities.filter((f) => f.category === catId))
    })
    // deduplicate by id
    const seen = new Set()
    return pts.filter((f) => {
      const key = f.id ?? `${f.lat},${f.lng}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [droneSources, allTairosNodes])

  // ── Memoize drone facility arrays (stable refs → no infinite recompute) ──
  const novaFacilities = useMemo(
    () => activeDrones.has('nova') ? getDroneFacilities('nova') : [],
    [activeDrones, getDroneFacilities]
  )
  const irisFacilities = useMemo(
    () => activeDrones.has('iris') ? getDroneFacilities('iris') : [],
    [activeDrones, getDroneFacilities]
  )
  // Radar has no coverage polygon — we render individual rotating scopes
  // at each source site instead. MapView consumes this list directly.
  const radarFacilities = useMemo(
    () => activeDrones.has('radar') ? getDroneFacilities('radar') : [],
    [activeDrones, getDroneFacilities]
  )

  // ── Drone coverage polygons (only source of coverage in the platform) ──
  const novaCoverage = useCoverage(novaFacilities, droneRanges.nova ?? DRONE_PRODUCTS.nova.rangeKm)
  const irisCoverage = useCoverage(irisFacilities, droneRanges.iris ?? DRONE_PRODUCTS.iris.rangeKm)

  // Combined Tairos polygon = union of all active drone polygons (used for totals)
  const tairosCombinedPolygon = useMemo(() => {
    const polys = [novaCoverage.polygon, irisCoverage.polygon].filter(Boolean)
    if (polys.length === 0) return null
    if (polys.length === 1) return polys[0]
    try { return mergePolygons(polys) } catch { return polys[0] }
  }, [novaCoverage.polygon, irisCoverage.polygon])

  const isComputing = novaCoverage.computing || irisCoverage.computing

  // Coverage layers passed to MapView (drone polygons only).
  const coverageLayers = useMemo(() => {
    const layers = []
    if (novaCoverage.polygon) {
      layers.push({ id: 'nova', polygon: novaCoverage.polygon, color: DRONE_PRODUCTS.nova.color, fillOpacity: 0.10, strokeOpacity: 0.50 })
    }
    if (irisCoverage.polygon) {
      layers.push({ id: 'iris', polygon: irisCoverage.polygon, color: DRONE_PRODUCTS.iris.color, fillOpacity: 0.10, strokeOpacity: 0.50 })
    }
    return layers
  }, [novaCoverage.polygon, irisCoverage.polygon])

  // Markers shown on map — always the full node list.
  const visibleNodes = allTairosNodes

  const handleMapClick = useCallback(() => {
    if (selectedFacility) clearSelection()
  }, [selectedFacility, clearSelection])

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-ops-900">
      <TopBar isComputing={isComputing} />

      <div className="flex flex-1 overflow-hidden relative">
        {/* 3-şerit iskeletin sol şeridi: mod-duyarlı navigasyon barı.
            Global modda Platform/Saha/İstihbarat; Lokal modda Durum/
            Kuvvetler/Tehditler/... workspace sekmeleri render eder. */}
        <ActivityBar />

        {/* PanelHost aktif panel id'sine göre doğru component'i render
            eder. platform/field/intel → SystemsPanel/FieldPanel/
            WorldPanel, assistant → AssistantPanel (lazy), diğerleri
            → PanelStub. Tüm paneller kendi operatör-scope'larını
            kendi uygular (selectors.js üzerinden). */}
        <PanelHost />

        <div className="flex-1 flex flex-col relative overflow-hidden" id="map-export-area">
          <MapView
            facilities={visibleFacilities}
            tairosNodes={visibleNodes}
            coverageLayers={coverageLayers}
            onMapClick={handleMapClick}
            radarFacilities={radarFacilities}
            radarRangeKm={droneRanges.radar ?? DRONE_PRODUCTS.radar?.rangeKm ?? 60}
          />

          <StatCards
            novaStats={activeDrones.has('nova') ? novaCoverage.stats : null}
            irisStats={activeDrones.has('iris') ? irisCoverage.stats : null}
            facilityCount={visibleFacilities.length}
            nodeCount={allTairosNodes.length}
            activeDrones={activeDrones}
            isComputing={isComputing}
          />
        </div>

        {selectedFacility && (
          <Suspense fallback={null}>
            <DetailPanel facility={selectedFacility} onClose={clearSelection} />
          </Suspense>
        )}
      </div>

      {/* Ctrl+K ile çağrılan birleşik quick-nav. Portal kullanır,
          o yüzden DOM'da nerede mount edildiği görsel olarak önemli
          değil — App köküne koyduk ki uygulama kapandığında da düşsün.
          Lazy: chunk yalnızca ilk açılışta iner, o noktadan sonra cache'li. */}
      {commandPaletteOpen && (
        <Suspense fallback={null}>
          <CommandPalette />
        </Suspense>
      )}

      {/* Sentinel AI — sağ-alt köşede yüzen chat widget'ı. Sidebar'dan
          çıkarıldı, her mod/sayfada erişilebilir. FAB tıklanınca açılır,
          Esc ile kapanır. Agent içinde kendi araçlarıyla haritayı ve
          panelleri yönlendirebilir. */}
      <AssistantBubble />
    </div>
  )
}
