import React from 'react'
import { Flame, Globe2, Swords } from 'lucide-react'
import useStore from '../../store/useStore'
import { Section, IntelHeader } from './_shared'
import { FORCE_SECTION_LABEL } from '../../config/forceDeployments'
import ConflictSection        from '../ConflictSection'
import GlobalSitesSection     from '../GlobalSitesSection'
import ForceDeploymentSection from '../ForceDeploymentSection'

/**
 * WorldPanel ("Dünya")
 *
 * Operatörden BAĞIMSIZ global istihbarat panosu. Burada gösterilen
 * veriler — çatışma haritası, küresel stratejik üsler, kuvvet
 * konuşlanmaları — herkes için aynıdır; operatör değişse bile bu
 * liste değişmez. Operator chip sadece "dünyayı kimin gözünden
 * izliyorum" sorusunu cevaplar; dünyadaki olgular değişmez.
 *
 * Bu tasarım bilinçli: çatışma + küresel üs + kuvvet konuşlanması
 * = dünya durumu. Onu operatöre göre filtrelemek hem yanlış (US
 * oyuncusu Rusya'nın Suriye üssünü "görmemesi" gerekmez) hem de
 * UX'i kırar. Operatöre özel görüş ise FieldPanel tarafında yaşar.
 *
 * Yapı eskiden Sidebar.jsx `sidebarTab === 'intel'` bloklarıyla
 * aynı — IntelHeader quick-toggle şeridi + 3 büyük bölüm.
 */
export default function WorldPanel() {
  const conflictsOn       = useStore((s) => s.conflictsOn)
  const toggleConflicts   = useStore((s) => s.toggleConflicts)
  const globalSitesOn     = useStore((s) => s.globalSitesOn)
  const toggleGlobalSites = useStore((s) => s.toggleGlobalSites)
  const forceDeployOn     = useStore((s) => s.forceDeployOn)
  const toggleForceDeploy = useStore((s) => s.toggleForceDeploy)
  const weatherRainOn     = useStore((s) => s.weatherRainOn)
  const weatherCloudsOn   = useStore((s) => s.weatherCloudsOn)
  const toggleWeatherRain   = useStore((s) => s.toggleWeatherRain)
  const toggleWeatherClouds = useStore((s) => s.toggleWeatherClouds)

  return (
    <div className="flex-1 overflow-y-auto">
      <IntelHeader
        conflictsOn={conflictsOn}
        onToggleConflicts={toggleConflicts}
        globalSitesOn={globalSitesOn}
        onToggleGlobalSites={toggleGlobalSites}
        forceDeployOn={forceDeployOn}
        onToggleForceDeploy={toggleForceDeploy}
        weatherOn={weatherRainOn || weatherCloudsOn}
        onToggleWeather={() => {
          // Tek buton her iki alt-katmanı sürüyor: bir şey açıksa
          // kapat; değilse bulutları aç (rain tek başına düşük zoom'da
          // boş hissediyor, clouds daha iyi default).
          if (weatherRainOn || weatherCloudsOn) {
            if (weatherRainOn)   toggleWeatherRain()
            if (weatherCloudsOn) toggleWeatherClouds()
          } else {
            toggleWeatherClouds()
          }
        }}
      />

      <Section
        icon={Flame}
        title="Çatışma Haritası"
        badge={conflictsOn ? 'aktif' : null}
        defaultOpen
      >
        <ConflictSection />
      </Section>

      <Section
        icon={Globe2}
        title="Küresel Stratejik Üsler"
        badge={globalSitesOn ? 'aktif' : null}
        defaultOpen={false}
      >
        <GlobalSitesSection />
      </Section>

      <Section
        icon={Swords}
        title={FORCE_SECTION_LABEL}
        badge={forceDeployOn ? 'aktif' : null}
        defaultOpen={false}
      >
        <ForceDeploymentSection />
      </Section>
    </div>
  )
}
