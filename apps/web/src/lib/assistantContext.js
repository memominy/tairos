/**
 * Sentinel AI — canlı bağlam toplayıcı.
 *
 * Zustand store'undan + seed veri dosyalarından asistanın "bu an haritada
 * ne görüyor?" sorusuna cevap verebilmesi için gereken minimum bilgiyi
 * derler. Her mesajda baştan çağrılır; maliyet için bağlam kasten kompakt
 * tutulur — büyük JSON kümeleri (conflicts.json, forceDeployments.json
 * vs.) **özet satırlara** sıkıştırılır, LLM isterse adını referans alır.
 *
 * Çıktı schema'sı:
 *   {
 *     scope:      { mode, operator, focusCountry, conflict?, side? }
 *     map:        { center, zoom, tile }
 *     layers:     { conflictsOn, assetsOn, forceDeployOn, globalSitesOn, ...}
 *     filters:    { categories[], drones[], conflictAssetKind, ...}
 *     selection:  { facility?, conflictAsset?, deployUnit?, globalSite? }
 *     data:       { <kısa özet veri kataloğu> }
 *   }
 */

import conflicts           from '../data/conflicts.json'
import conflictAssets      from '../data/conflictAssets.json'
import conflictDevelopments from '../data/conflictDevelopments.json'
import conflictMaterial    from '../data/conflictMaterial.json'
import forceDeployments    from '../data/forceDeployments.json'
import globalSites         from '../data/globalSites.json'
import facilities          from '../data/facilities.json'
import { COUNTRIES }       from '../config/countries'
import { inventoryOf }     from '../config/countryInventory'
import { criticalSitesOf } from '../config/countryCriticalSites'

/** Set'i diziye çevirir (undefined/null'a toleranslı). */
function asArray(v) {
  if (!v) return []
  if (v instanceof Set) return Array.from(v)
  if (Array.isArray(v)) return v
  return []
}

/**
 * Seçili çatışma için gereken veriyi derler. Sadece conflict seçiliyken
 * çağrılır — boş çağrı durumunda null döner.
 */
function buildConflictSnapshot(conflict) {
  if (!conflict) return null
  const assets       = conflictAssets[conflict.id] || []
  const deployments  = forceDeployments[conflict.id] || []
  const developments = conflictDevelopments[conflict.id] || []
  const material     = conflictMaterial[conflict.id] || null

  // Top-level özet — her listenin sadece sayı + birkaç örnek
  return {
    id:        conflict.id,
    name:      conflict.name,
    region:    conflict.region,
    status:    conflict.status,
    severity:  conflict.severity,
    startedYear: conflict.startedYear,
    parties:   conflict.parties || [],
    sideLabels: conflict.sideLabels || { A: 'Taraf A', B: 'Taraf B' },
    summary:   conflict.summary,
    hotspots:  conflict.hotspots?.map((h) => h.name) || [],
    stats:     conflict.stats || {},
    forces:    conflict.forces || null,
    tairos:    conflict.tairos || null,
    counts: {
      assets:       assets.length,
      deployments:  deployments.length,
      developments: developments.length,
    },
    // Yalnızca en son 5 gelişme — brief hissi için
    latestDevelopments: developments
      .slice()
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      .slice(0, 5)
      .map((d) => ({
        date: d.date,
        severity: d.severity,
        headline: d.headline,
      })),
    // Ekipman özeti — her taraf için sadece kind: count
    materialSummary: material ? {
      sideA: material.sideA?.equipment?.map((e) => `${e.kind}:${e.count}`) || [],
      sideB: material.sideB?.equipment?.map((e) => `${e.kind}:${e.count}`) || [],
      damage: material.damage || null,
    } : null,
  }
}

/**
 * Odak ülke seçiliyken dolu envanter + kritik tesis özeti. Ülke odağı
 * yokken ama focusCountry varsa yine veriyi döndürürüz.
 */
function buildCountrySnapshot(code) {
  if (!code) return null
  const meta  = COUNTRIES[code]
  const inv   = inventoryOf(code)
  const sites = criticalSitesOf(code)
  return {
    code,
    name:   meta?.label || code,
    region: meta?.region,
    rivals: meta?.rivals || [],
    conflicts: meta?.conflicts || [],
    inventory: inv ? {
      summary: inv.summary || null,
      branches: Object.fromEntries(
        Object.entries(inv.branches || {}).map(([k, v]) => [
          k,
          { count: v.items?.length || 0, note: v.note }
        ])
      ),
    } : null,
    criticalSites: sites.map((s) => ({
      name: s.name,
      kind: s.kind,
      priority: s.priority,
    })),
  }
}

/**
 * Store'un tamamından, asistanın anlayabileceği düz bir bağlam nesnesi
 * üretir. useStore.getState() ile senkron okur — her çağrıda taze.
 */
export function buildAssistantContext(state) {
  const conflict = state.selectedConflict
  const country  = state.focusCountry

  return {
    scope: {
      mode:          state.appMode,           // 'global' | 'local'
      operator:      state.operator,
      focusCountry:  country,
      conflictId:    conflict?.id || null,
      conflictSide:  conflict ? (state.focusSideByConflict?.[conflict.id] || null) : null,
      activePanel:   state.activePanelId,
    },
    map: {
      center:   state.mapCenter,
      zoom:     state.mapZoom,
      tile:     state.tileStyle,
    },
    layers: {
      conflictsOn:       state.conflictsOn,
      conflictAssetsOn:  state.conflictAssetsOn,
      forceDeployOn:     state.forceDeployOn,
      globalSitesOn:     state.globalSitesOn,
      threatProjectionOn: state.threatProjectionOn,
      killChainOn:       state.killChainOn,
      weatherRainOn:     state.weatherRainOn,
      weatherCloudsOn:   state.weatherCloudsOn,
    },
    filters: {
      categories:            asArray(state.activeCategories),
      drones:                asArray(state.activeDrones),
      droneRanges:           state.droneRanges,
      conflictAssetKind:     state.conflictAssetKindFilter,
      conflictStatusFilter:  state.conflictStatusFilter,
      forceDeploySides:      asArray(state.forceDeploySides),
      forceDeployKind:       state.forceDeployKindFilter,
      forceDeployScope:      state.forceDeployScope,
      globalSiteOperators:   asArray(state.globalSiteOperators),
      globalSiteRegion:      state.globalSiteRegion,
      globalSiteMinImportance: state.globalSiteMinImportance,
    },
    selection: {
      facility:      state.selectedFacility ? {
        name: state.selectedFacility.name,
        category: state.selectedFacility.category,
        city: state.selectedFacility.city,
        coords: [state.selectedFacility.lat, state.selectedFacility.lng],
      } : null,
      conflictAsset: state.selectedConflictAsset ? {
        name: state.selectedConflictAsset.name,
        type: state.selectedConflictAsset.type,
        side: state.selectedConflictAsset.side,
      } : null,
      deployUnit:    state.selectedDeployUnit ? {
        name: state.selectedDeployUnit.name,
        echelon: state.selectedDeployUnit.echelon,
        side: state.selectedDeployUnit.side,
      } : null,
      globalSite:    state.selectedGlobalSite ? {
        name: state.selectedGlobalSite.name,
        operator: state.selectedGlobalSite.operator,
        country: state.selectedGlobalSite.country,
      } : null,
    },
    // Derin veri — sadece ilgili scope dolunca dahil edilir
    conflict: buildConflictSnapshot(conflict),
    country:  buildCountrySnapshot(country),

    // Genel katalog — LLM "hangi çatışmalar var?" diye sorduğunda
    // tam listeyi iki aşamada sorabilsin diye referans özetler.
    catalog: {
      conflicts: conflicts.map((c) => ({
        id: c.id, name: c.name, region: c.region,
        status: c.status, severity: c.severity,
      })),
      countries: Object.values(COUNTRIES).map((c) => c.code),
      globalSitesTotal: globalSites.length,
      facilitiesTotal:  facilities.length,
    },
    ts: new Date().toISOString(),
  }
}

/**
 * Bağlam özetini Markdown'a çevir — sistem promptunda kullanılacak.
 * LLM için human-friendly + token-verimli format.
 */
export function formatContextAsMarkdown(ctx) {
  const L = []
  L.push(`# SENTINEL CANLI BAĞLAM`)
  L.push(`_Kayıt: ${ctx.ts}_`)
  L.push('')
  L.push(`## Kapsam`)
  L.push(`- Mod: **${ctx.scope.mode}** · Operatör: **${ctx.scope.operator}**`)
  if (ctx.scope.focusCountry) L.push(`- Odak ülke: **${ctx.scope.focusCountry}** (${ctx.country?.name || ''})`)
  if (ctx.scope.conflictId)   L.push(`- Seçili çatışma: **${ctx.scope.conflictId}** · taraf: ${ctx.scope.conflictSide || '—'}`)
  if (ctx.scope.activePanel)  L.push(`- Aktif panel: ${ctx.scope.activePanel}`)
  L.push('')
  L.push(`## Harita`)
  L.push(`- Merkez: ${ctx.map.center?.map((n) => n.toFixed(2)).join(', ') || '—'} · Zoom: ${ctx.map.zoom} · Tile: ${ctx.map.tile}`)
  L.push('')
  L.push(`## Aktif Katmanlar`)
  L.push(Object.entries(ctx.layers).filter(([, v]) => v).map(([k]) => k).join(', ') || '—')
  L.push('')
  if (ctx.filters.categories?.length) {
    L.push(`## Aktif Filtreler`)
    L.push(`- Kategoriler: ${ctx.filters.categories.join(', ')}`)
    L.push(`- Dronelar: ${ctx.filters.drones.join(', ') || '—'}`)
    L.push('')
  }
  const sel = ctx.selection
  if (sel.facility || sel.conflictAsset || sel.deployUnit || sel.globalSite) {
    L.push(`## Seçim`)
    if (sel.facility)      L.push(`- Tesis: ${sel.facility.name} (${sel.facility.category})`)
    if (sel.conflictAsset) L.push(`- Çatışma varlığı: ${sel.conflictAsset.name} · ${sel.conflictAsset.side}`)
    if (sel.deployUnit)    L.push(`- Birlik: ${sel.deployUnit.name} · ${sel.deployUnit.echelon}`)
    if (sel.globalSite)    L.push(`- Global üs: ${sel.globalSite.name} · ${sel.globalSite.operator}`)
    L.push('')
  }
  if (ctx.conflict) {
    const c = ctx.conflict
    L.push(`## Seçili Çatışma Detay: ${c.name}`)
    L.push(`- Durum: ${c.status} · Şiddet: ${c.severity}/5 · Başlangıç: ${c.startedYear}`)
    L.push(`- Taraflar (${c.sideLabels.A} vs ${c.sideLabels.B}): ${c.parties.join(', ')}`)
    if (c.summary) L.push(`- Özet: ${c.summary}`)
    L.push(`- Saha varlığı: ${c.counts.assets} · konuşlanma: ${c.counts.deployments} · gelişme: ${c.counts.developments}`)
    if (c.hotspots.length) L.push(`- Hotspotlar: ${c.hotspots.join(', ')}`)
    if (c.latestDevelopments?.length) {
      L.push(`- Son gelişmeler:`)
      c.latestDevelopments.forEach((d) => {
        L.push(`  - [${d.date}] (${d.severity}) ${d.headline}`)
      })
    }
    if (c.materialSummary) {
      L.push(`- Ekipman (A): ${c.materialSummary.sideA.join(', ') || '—'}`)
      L.push(`- Ekipman (B): ${c.materialSummary.sideB.join(', ') || '—'}`)
    }
    L.push('')
  }
  if (ctx.country) {
    const c = ctx.country
    L.push(`## Odak Ülke Detay: ${c.name}`)
    L.push(`- Bölge: ${c.region || '—'} · Rakipler: ${c.rivals.join(', ') || '—'}`)
    L.push(`- Kritik tesis: ${c.criticalSites.length} konum`)
    if (c.inventory?.summary) {
      const s = c.inventory.summary
      L.push(`- Personel: aktif ${s.active || '—'} · ihtiyat ${s.reserve || '—'} · paramiliter ${s.paramilitary || '—'}`)
    }
    if (c.inventory?.branches) {
      const b = Object.entries(c.inventory.branches)
        .map(([k, v]) => `${k}(${v.count})`).join(', ')
      L.push(`- Envanter: ${b}`)
    }
    L.push('')
  }
  L.push(`## Veri Kataloğu (referans için)`)
  L.push(`- ${ctx.catalog.conflicts.length} çatışma, ${ctx.catalog.countries.length} ülke, ${ctx.catalog.globalSitesTotal} global üs, ${ctx.catalog.facilitiesTotal} TR tesis`)
  return L.join('\n')
}
