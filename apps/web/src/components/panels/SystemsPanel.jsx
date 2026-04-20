import React from 'react'
import { Radar, Target } from 'lucide-react'
import useStore from '../../store/useStore'
import { getOperator } from '../../config/operators'
import { DRONE_PRODUCTS, DRONE_ORDER } from '../../config/drones'
import { Section, DroneCard } from './_shared'

/**
 * SystemsPanel ("Sistemler")
 *
 * Operatör-farkında sistem kataloğu — başlık aktif operatöre göre
 * dinamik ("Türkiye — Sistem Kataloğu", "ABD — Sistem Kataloğu"…).
 *
 * İçerik:
 *   1. Sistem Kataloğu — operatörün donanım listesi (drone ailesi)
 *      • Drone aç/kapat, menzil ayarı, konuşlanma kaynakları
 *      • İlerde operator.systemsCatalog ile kırpılacak — bugün tüm
 *        DRONE_ORDER listelenir; unsupported olanlar visually dimmed
 *        bir şekilde işaretlenir
 *   2. Stratejik Yerleştirme — alan çiz → sistem seç akışı
 *      • placementMode durumuna göre "Alan Çiz" / "İptal" butonu
 *
 * Bu panel eski Sidebar.jsx'in `sidebarTab === 'platform'` bloklarının
 * birebir karşılığı. Tüm UI parçaları artık _shared.jsx'ten geliyor.
 */
export default function SystemsPanel() {
  const operatorCode = useStore((s) => s.operator)
  const operator     = getOperator(operatorCode)

  const activeDrones      = useStore((s) => s.activeDrones)
  const toggleDrone       = useStore((s) => s.toggleDrone)
  const droneSources      = useStore((s) => s.droneSources)
  const toggleDroneSource = useStore((s) => s.toggleDroneSource)
  const droneRanges       = useStore((s) => s.droneRanges)
  const setDroneRange     = useStore((s) => s.setDroneRange)

  const placementMode     = useStore((s) => s.placementMode)
  const startPlacement    = useStore((s) => s.startPlacement)
  const cancelPlacement   = useStore((s) => s.cancelPlacement)

  const activeDroneCount  = activeDrones.size

  // Operatörün resmi katalog listesi — tanımlıysa ona saygı duy,
  // değilse tüm sistemleri göster. Katalog dışı sistemler görsel
  // olarak kısılmış görünür ama kullanıcıya aç/kapat imkânı verir
  // (senaryo: "ABD oynuyorum ama iris'i test etmek istiyorum").
  const supported = operator.systemsCatalog && operator.systemsCatalog.length
    ? new Set(operator.systemsCatalog)
    : null

  return (
    <div className="flex-1 overflow-y-auto">
      <Section
        icon={Radar}
        title={`${operator.label} — Sistem Kataloğu`}
        badge={`${activeDroneCount}/${DRONE_ORDER.length}`}
        defaultOpen
      >
        {operator.doctrine && (
          <div className="px-3 pb-2 text-[10px] text-ops-500 font-mono leading-snug">
            Doktrin: <span className="text-ops-300">{operator.doctrine}</span>
            {operator.description && ` · ${operator.description}`}
          </div>
        )}
        <div className="px-3 space-y-1.5">
          {DRONE_ORDER.map((id) => {
            const drone = DRONE_PRODUCTS[id]
            const inCatalog = supported ? supported.has(id) : true
            return (
              <div key={id} className={inCatalog ? '' : 'relative'}>
                {!inCatalog && (
                  <div
                    className="absolute top-1 right-1 text-[8px] font-mono px-1 py-0.5 rounded border border-ops-600 text-ops-500 bg-ops-900/60 z-10"
                    title={`${operator.label} katalog dışı — test için açılabilir`}
                  >
                    katalog dışı
                  </div>
                )}
                <DroneCard
                  drone={drone}
                  active={activeDrones.has(id)}
                  onToggle={() => toggleDrone(id)}
                  sources={droneSources[id] || new Set(['nodes'])}
                  onToggleSource={(srcId) => toggleDroneSource(id, srcId)}
                  rangeKm={droneRanges[id] ?? drone.rangeKm}
                  onRange={(km) => setDroneRange(id, km)}
                />
              </div>
            )
          })}
        </div>
      </Section>

      <Section
        icon={Target}
        title="Stratejik Yerleştirme"
        badge={placementMode !== 'idle' ? 'aktif' : null}
        defaultOpen={false}
      >
        <div className="px-3 text-xs text-ops-400 leading-snug space-y-2">
          <p className="text-[11px]">
            Alan çiz → sistemleri seç. En az merkezle tam kaplama için
            konumlar otomatik hesaplanır; her merkeze seçilen tüm sistemler
            birlikte konuşlanır. Yerleştirilen düğümler aktif operatöre
            (<span className="text-ops-200">{operator.label}</span>) etiketlenir.
          </p>
          {placementMode === 'idle' ? (
            <button
              onClick={startPlacement}
              className="w-full flex items-center justify-center gap-2 py-1.5 rounded border border-accent/50 bg-accent/10 text-accent hover:bg-accent/20 transition-colors font-mono text-xs"
            >
              <Target size={12} />
              Alan Çiz
            </button>
          ) : (
            <button
              onClick={cancelPlacement}
              className="w-full flex items-center justify-center gap-2 py-1.5 rounded border border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors font-mono text-xs"
            >
              ✕ İptal
            </button>
          )}
          {placementMode === 'drawing' && (
            <div className="text-[10px] text-emerald-400 font-mono">
              ◈ Haritaya tıklayarak köşe ekle · çift tıkla → bitir
            </div>
          )}
          {placementMode === 'configuring' && (
            <div className="text-[10px] text-accent font-mono">
              ◈ Yerleştirme panelinden ürünleri seç
            </div>
          )}
        </div>
      </Section>
    </div>
  )
}
