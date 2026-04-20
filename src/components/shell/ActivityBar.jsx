import React from 'react'
import { ChevronLeft, X } from 'lucide-react'
import useStore from '../../store/useStore'
import { resolvePanels, resolveLayer, splitPanelsBySection } from '../../config/panels'
import { getCountry } from '../../config/countries'

/**
 * 64px genişliğinde, KATMANA DUYARLI sol-kenar navigasyonu.
 *
 * Panel listesi `resolvePanels({ appMode, focusCountry })` tarafından
 * seçilir — 3 katman, 3 farklı yerleşim:
 *
 *   [GLOBAL]          [COUNTRY]            [CONFLICT]
 *    Dünya           ✕ Ülke Çık            ← Geri
 *    ──────           Durum                 Durum
 *    Sistemler        Envanter              Kuvvetler
 *    Saha             Kritik                Tehditler
 *    Operasyon        Rakipler              Haberler
 *    Envanter         Dünya                 Zaman
 *    Asistan         ──────                ──────
 *    Uyarılar         Sistemler             Asistan
 *    Ayarlar          Saha                  Uyarılar
 *                     Asistan               Ayarlar
 *                     Uyarılar
 *                     Ayarlar
 *
 * Bir simgeye tıklanması activePanelId'yi günceller. Zaten aktif olan
 * simgeye ikinci kez tıklanınca sol raf tamamen kapanır
 * (activePanelId = null) — harita nefes alsın diye.
 *
 * Rozetler: canlı store sayıları. Operatör paneli açmadan durumu okusun
 * diye — aktif drone, kaydedilmiş node+grup, açık intel katman sayısı.
 *
 * Data-driven: panel listesi src/config/panels.js'den gelir.
 */
export default function ActivityBar() {
  const appMode          = useStore((s) => s.appMode)
  const focusCountry     = useStore((s) => s.focusCountry)
  const activePanelId    = useStore((s) => s.activePanelId)
  const setActivePanel   = useStore((s) => s.setActivePanel)
  const setSidebarOpen   = useStore((s) => s.setSidebarOpen)
  const sidebarOpen      = useStore((s) => s.sidebarOpen)
  const exitFocus        = useStore((s) => s.exitConflictFocus)
  const exitCountryFocus = useStore((s) => s.exitCountryFocus)

  /* Fine-grained abonelikler — her rozet yalnız kendi kaynağı değişince
     yeniden render tetikler. Global store tam refresh'i yaşanmaz. */
  const activeDrones    = useStore((s) => s.activeDrones)
  const customNodes     = useStore((s) => s.customNodes)
  const areaGroups      = useStore((s) => s.areaGroups)
  const conflictsOn     = useStore((s) => s.conflictsOn)
  const globalSitesOn   = useStore((s) => s.globalSitesOn)
  const forceDeployOn   = useStore((s) => s.forceDeployOn)
  const weatherRainOn   = useStore((s) => s.weatherRainOn)
  const weatherCloudsOn = useStore((s) => s.weatherCloudsOn)

  const list  = resolvePanels({ appMode, focusCountry })
  const layer = resolveLayer({ appMode, focusCountry })
  const { primary, secondary } = splitPanelsBySection(list)

  /* Rozet kaynakları — her panelin kendi meta'sında `badgeSource` alanı
     gelecekte tanımlanacak; şimdilik üç legacy panel için elle. */
  const badges = {
    platform: activeDrones.size || null,
    field:    (customNodes.length + areaGroups.length) || null,
    intel:
      (conflictsOn    ? 1 : 0) +
      (globalSitesOn  ? 1 : 0) +
      (forceDeployOn  ? 1 : 0) +
      ((weatherRainOn || weatherCloudsOn) ? 1 : 0) || null,
  }

  const onClickPanel = (id) => {
    if (id === activePanelId) {
      // Aynı ikona ikinci tık → paneli kapat, harita genişlesin
      setActivePanel(null)
      return
    }
    setActivePanel(id)
    if (!sidebarOpen) setSidebarOpen(true)
  }

  /* Tek bir ikon düğmesi — primary ve secondary her ikisi de bunu
     kullanır. Görsel farkı section stilinde değil, diziliş yerinde. */
  const renderPanelButton = (p) => {
    const Icon   = p.icon
    const active = activePanelId === p.id
    const badge  = badges[p.id]
    return (
      <button
        key={p.id}
        onClick={() => onClickPanel(p.id)}
        title={p.title || p.label}
        aria-pressed={active}
        className={`relative flex flex-col items-center justify-center gap-0.5 mx-1.5 py-2.5 rounded transition-colors ${
          active
            ? 'bg-accent/15 text-accent'
            : 'text-ops-400 hover:text-ops-100 hover:bg-ops-800'
        }`}
      >
        {/* Aktif ikon için sol kenar şeridi */}
        {active && (
          <span
            className="absolute -left-1.5 top-1.5 bottom-1.5 w-[3px] rounded-r"
            style={{ background: '#D85A30' }}
          />
        )}
        <Icon size={18} strokeWidth={active ? 2.2 : 1.8} />
        <span className="text-[9px] font-mono uppercase tracking-wider leading-none mt-0.5">
          {p.label}
        </span>
        {badge != null && (
          <span
            className={`absolute top-1 right-1 text-[9px] font-mono px-1 rounded leading-tight ${
              active ? 'bg-accent/30 text-accent' : 'bg-ops-700/80 text-ops-300'
            }`}
          >
            {badge}
          </span>
        )}
      </button>
    )
  }

  return (
    <nav
      className="shrink-0 flex flex-col items-stretch border-r border-ops-700 bg-ops-900/95 select-none"
      style={{ width: 64, zIndex: 1260 }}
      aria-label="TAIROS ana navigasyon"
    >
      {/* Conflict (local) modda üstte "Global'e dön" — breadcrumb'daki ×
          kadar keşfedilebilir olsun diye ikinci bir çıkış yolu. */}
      {layer === 'conflict' && (
        <button
          onClick={exitFocus}
          className="flex flex-col items-center justify-center gap-0.5 py-3 border-b border-ops-700/60 text-ops-400 hover:text-accent hover:bg-ops-800 transition-colors"
          title="Global'e dön"
        >
          <ChevronLeft size={18} />
          <span className="text-[9px] font-mono uppercase tracking-wider">Geri</span>
        </button>
      )}

      {/* Country katmanında "Ülke çık" — bayrak+çarpı */}
      {layer === 'country' && (
        <button
          onClick={exitCountryFocus}
          className="flex flex-col items-center justify-center gap-0.5 py-3 border-b border-ops-700/60 text-ops-400 hover:text-accent hover:bg-ops-800 transition-colors"
          title={`${getCountry(focusCountry).label} odağından çık`}
        >
          <div className="flex items-center gap-0.5">
            <span className="text-base leading-none">{getCountry(focusCountry).flag}</span>
            <X size={11} />
          </div>
          <span className="text-[9px] font-mono uppercase tracking-wider">Çık</span>
        </button>
      )}

      {/* PRIMARY — ana çalışma panelleri (üst blok) */}
      <div className="flex-1 flex flex-col py-2 gap-0.5 overflow-y-auto">
        {primary.map(renderPanelButton)}
      </div>

      {/* SECONDARY — sistem/destek panelleri (alt blok, ayraçla) */}
      {secondary.length > 0 && (
        <div className="flex flex-col py-2 gap-0.5 border-t border-ops-700/60 shrink-0">
          {secondary.map(renderPanelButton)}
        </div>
      )}
    </nav>
  )
}
