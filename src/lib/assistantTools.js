/**
 * Sentinel AI — araç (tool) kaydı.
 *
 * LLM'in uygulamanın iç durumunu değiştirebilmesi için çağırabileceği
 * fonksiyonların düz listesi. Her tool:
 *   • name   — "namespace.action" formatı (örn. "map.fly_to")
 *   • desc   — Türkçe kısa tanım
 *   • schema — args için { alan: "açıklama" } haritası (şema yerine doc)
 *   • run    — (args, { getState, setState }) => Promise<result>
 *
 * LLM yanıtta şu fence'i basar:
 *
 *   <tool_call>
 *   {"name":"map.fly_to","args":{"lat":41.01,"lng":29.0,"zoom":9}}
 *   </tool_call>
 *
 * Panel bu bloğu parse eder, run()'u çağırır, sonucu bir sonraki
 * LLM çağrısına user mesajı olarak geri besler. Araçsız (düz metin)
 * cevap = final answer, döngü biter.
 *
 * BU DOSYA STORE'U DOĞRUDAN IMPORT ETMEZ — panel çağrılırken injection
 * ile getirir, böylece circular-dep riski yok ve test edilebilir kalır.
 */

import conflictsData       from '../data/conflicts.json'
import globalSitesData     from '../data/globalSites.json'
import facilitiesData      from '../data/facilities.json'
import forceDeploymentsData from '../data/forceDeployments.json'
import conflictAssetsData  from '../data/conflictAssets.json'
import { COUNTRIES }       from '../config/countries'

/* ────────────────────────────────────────────────────────── */
/* Yardımcılar                                                 */
/* ────────────────────────────────────────────────────────── */

/** Haversine mesafe — kilometre. */
function kmBetween(a, b) {
  if (!a || !b || typeof a.lat !== 'number' || typeof b.lat !== 'number') return Infinity
  const R = 6371
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)))
}

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)) }

function requireNumber(v, name) {
  const n = Number(v)
  if (!Number.isFinite(n)) throw new Error(`"${name}" sayı olmalı (verilen: ${v})`)
  return n
}
function requireString(v, name) {
  if (typeof v !== 'string' || !v.trim()) throw new Error(`"${name}" string olmalı`)
  return v.trim()
}

/** Bir string sorguyu küçük harfe çevirip trim eder — fuzzy için. */
function norm(s) { return String(s || '').toLowerCase().trim() }

/** Basit ad araması — alt-string eşleşmesi. */
function nameMatches(candidate, query) {
  if (!query) return true
  return norm(candidate).includes(norm(query))
}

/* ────────────────────────────────────────────────────────── */
/* Katman tanımları — store key + action ismi haritası         */
/* ────────────────────────────────────────────────────────── */

const LAYERS = [
  { id: 'conflicts',        stateKey: 'conflictsOn',        setter: 'setConflictsOn',        toggle: 'toggleConflicts',        label: 'Çatışma bubbles + hotspot' },
  { id: 'conflictAssets',   stateKey: 'conflictAssetsOn',   setter: 'setConflictAssetsOn',   toggle: 'toggleConflictAssets',   label: 'Seçili çatışmanın saha varlıkları' },
  { id: 'forceDeploy',      stateKey: 'forceDeployOn',      setter: 'setForceDeployOn',      toggle: 'toggleForceDeploy',      label: 'Kuvvet konuşlanmaları (birlikler)' },
  { id: 'globalSites',      stateKey: 'globalSitesOn',      setter: 'setGlobalSitesOn',      toggle: 'toggleGlobalSites',      label: 'Küresel üsler (US/NATO/Çin/Rusya)' },
  { id: 'threatProjection', stateKey: 'threatProjectionOn', setter: 'setThreatProjectionOn', toggle: 'toggleThreatProjection', label: 'Tehdit projeksiyonu (SAM/ATEŞ)' },
  { id: 'killChain',        stateKey: 'killChainOn',        setter: 'setKillChainOn',        toggle: 'toggleKillChain',        label: 'Komuta zinciri çizgileri' },
  { id: 'weatherRain',      stateKey: 'weatherRainOn',      setter: null,                    toggle: 'toggleWeatherRain',      label: 'Yağış radarı' },
  { id: 'weatherClouds',    stateKey: 'weatherCloudsOn',    setter: null,                    toggle: 'toggleWeatherClouds',    label: 'Bulut kapak' },
]
const LAYER_BY_ID = Object.fromEntries(LAYERS.map((l) => [l.id, l]))

const TILE_CHOICES = ['dark', 'light', 'satellite', 'tactical', 'minimal']

// NOT: 'assistant' burada yok — asistan artık sidebar paneli değil,
// yüzen widget (AssistantBubble). Agent kendi widget'ını açamaz.
const PANEL_IDS = [
  'intel', 'platform', 'field', 'operations', 'inventory',
  'alerts', 'settings', 'country-brief', 'country-inventory',
  'country-critical', 'country-rivals', 'situation', 'forces',
  'threats', 'news', 'timeline',
]

/* ────────────────────────────────────────────────────────── */
/* Tool tanımları                                              */
/* ────────────────────────────────────────────────────────── */

export const TOOLS = [
  /* ─── Harita kamerası ─── */
  {
    name: 'map.fly_to',
    desc: 'Haritayı belirtilen koordinata animasyonla uçurur. zoom opsiyonel (verilmezse mevcut zoom korunur).',
    schema: { lat: 'enlem (-90..90)', lng: 'boylam (-180..180)', zoom: 'opsiyonel 3..18' },
    run: ({ lat, lng, zoom }, { getState }) => {
      const la = clamp(requireNumber(lat, 'lat'), -85, 85)
      const lo = clamp(requireNumber(lng, 'lng'), -180, 180)
      const z  = zoom == null ? getState().mapZoom : clamp(requireNumber(zoom, 'zoom'), 3, 18)
      getState().flyToPoint(la, lo, z)
      return { ok: true, center: [la, lo], zoom: z }
    },
  },
  {
    name: 'map.set_view',
    desc: 'Haritayı animasyon olmadan anında belirtilen merkez+zoom\'a sıfırlar.',
    schema: { lat: 'enlem', lng: 'boylam', zoom: 'zoom 3..18' },
    run: ({ lat, lng, zoom }, { getState }) => {
      const la = clamp(requireNumber(lat, 'lat'), -85, 85)
      const lo = clamp(requireNumber(lng, 'lng'), -180, 180)
      const z  = clamp(requireNumber(zoom, 'zoom'), 3, 18)
      getState().setMapView([la, lo], z)
      return { ok: true, center: [la, lo], zoom: z }
    },
  },
  {
    name: 'map.get_state',
    desc: 'Haritanın mevcut merkez/zoom/tile durumunu okur.',
    schema: {},
    run: (_, { getState }) => {
      const s = getState()
      return { center: s.mapCenter, zoom: s.mapZoom, tile: s.tileStyle }
    },
  },
  {
    name: 'map.set_tile',
    desc: 'Harita tile stilini değiştirir.',
    schema: { tile: `biri: ${TILE_CHOICES.join(' | ')}` },
    run: ({ tile }, { getState }) => {
      const t = requireString(tile, 'tile')
      if (!TILE_CHOICES.includes(t)) {
        throw new Error(`Geçersiz tile "${t}". Seçenekler: ${TILE_CHOICES.join(', ')}`)
      }
      getState().setTile(t)
      return { ok: true, tile: t }
    },
  },

  /* ─── Katmanlar ─── */
  {
    name: 'layer.list',
    desc: 'Tüm katmanları ve açık/kapalı durumlarını listeler.',
    schema: {},
    run: (_, { getState }) => {
      const s = getState()
      return LAYERS.map((l) => ({
        id: l.id, label: l.label, on: !!s[l.stateKey],
      }))
    },
  },
  {
    name: 'layer.set',
    desc: 'Bir katmanı kesin olarak açar veya kapar.',
    schema: { id: 'layer.list\'ten bir id', visible: 'true | false' },
    run: ({ id, visible }, { getState }) => {
      const layer = LAYER_BY_ID[requireString(id, 'id')]
      if (!layer) throw new Error(`Bilinmeyen katman "${id}". Kullan: ${LAYERS.map((l) => l.id).join(', ')}`)
      const st = getState()
      const target = !!visible
      const current = !!st[layer.stateKey]
      if (current === target) return { ok: true, id: layer.id, visible: target, changed: false }
      if (layer.setter) {
        st[layer.setter](target)
      } else if (layer.toggle) {
        st[layer.toggle]()
      }
      return { ok: true, id: layer.id, visible: target, changed: true }
    },
  },
  {
    name: 'layer.toggle',
    desc: 'Bir katmanın durumunu tersine çevirir.',
    schema: { id: 'layer id' },
    run: ({ id }, { getState }) => {
      const layer = LAYER_BY_ID[requireString(id, 'id')]
      if (!layer) throw new Error(`Bilinmeyen katman "${id}"`)
      const st = getState()
      const before = !!st[layer.stateKey]
      st[layer.toggle]()
      return { ok: true, id: layer.id, before, after: !before }
    },
  },

  /* ─── Çatışmalar ─── */
  {
    name: 'conflict.list',
    desc: 'Tüm bilinen çatışmaları listeler (id, ad, bölge, durum, şiddet).',
    schema: { query: 'opsiyonel ad içerik araması' },
    run: ({ query } = {}) => {
      const list = conflictsData.map((c) => ({
        id: c.id, name: c.name, region: c.region,
        status: c.status, severity: c.severity,
      }))
      if (!query) return list
      return list.filter((c) => nameMatches(c.name, query) || nameMatches(c.region, query))
    },
  },
  {
    name: 'conflict.select',
    desc: 'Bir çatışmayı id veya ad ile seçer — sidebar açılır, haritaya odaklanır.',
    schema: { id: 'çatışma id veya adı (adın parçası yeterli)' },
    run: ({ id }, { getState }) => {
      const needle = requireString(id, 'id')
      const match =
        conflictsData.find((c) => c.id === needle) ||
        conflictsData.find((c) => nameMatches(c.name, needle))
      if (!match) throw new Error(`"${needle}" ile eşleşen çatışma yok. conflict.list kullan.`)
      const st = getState()
      st.selectConflict(match)
      if (typeof st.enterConflictFocus === 'function') st.enterConflictFocus(match)
      return { ok: true, conflict: { id: match.id, name: match.name, region: match.region } }
    },
  },
  {
    name: 'conflict.exit',
    desc: 'Seçili çatışmadan çıkar, haritayı global görünüme getirir.',
    schema: {},
    run: (_, { getState }) => {
      const st = getState()
      if (typeof st.exitConflictFocus === 'function') st.exitConflictFocus()
      st.clearConflict()
      return { ok: true }
    },
  },

  /* ─── Ülke odağı ─── */
  {
    name: 'country.list',
    desc: 'Bilinen ülkeleri (ISO-2 + ad) listeler.',
    schema: {},
    run: () => Object.values(COUNTRIES).map((c) => ({ code: c.code, name: c.label, region: c.region })),
  },
  {
    name: 'country.focus',
    desc: 'Bir ülkeye odaklanır — harita sınırlara uçar, ülke panelleri açılır.',
    schema: { code: 'ISO-2 kod (TR, US, RU, UA, IL...)' },
    run: ({ code }, { getState }) => {
      const c = requireString(code, 'code').toUpperCase()
      if (!COUNTRIES[c]) throw new Error(`Bilinmeyen ülke kodu "${c}". country.list kullan.`)
      getState().setFocusCountry(c)
      return { ok: true, code: c, name: COUNTRIES[c].label }
    },
  },
  {
    name: 'country.exit',
    desc: 'Ülke odağından çıkar.',
    schema: {},
    run: (_, { getState }) => {
      if (typeof getState().exitCountryFocus === 'function') getState().exitCountryFocus()
      return { ok: true }
    },
  },

  /* ─── Operatör / Uygulama modu ─── */
  {
    name: 'operator.set',
    desc: 'Aktif operatörü değiştirir (senin "oyuncu tarafın"). Sahne + haritayı etkiler.',
    schema: { code: 'TR, US, RU, CN, IL, UA...' },
    run: ({ code }, { getState }) => {
      const c = requireString(code, 'code').toUpperCase()
      getState().setOperator(c)
      return { ok: true, code: c }
    },
  },
  {
    name: 'app.set_mode',
    desc: 'Uygulama modunu değiştirir (global veya local).',
    schema: { mode: '"global" veya "local"' },
    run: ({ mode }, { getState }) => {
      const m = mode === 'local' ? 'local' : 'global'
      getState().setAppMode(m)
      return { ok: true, mode: m }
    },
  },

  /* ─── Kullanıcı node'ları ─── */
  {
    name: 'node.list',
    desc: 'Tüm Tairos node\'larını (preset + kullanıcı eklediği) listeler.',
    schema: { operator: 'opsiyonel operator kodu (sadece o operatöre ait olanlar)' },
    run: ({ operator } = {}, { getState }) => {
      const nodes = getState().customNodes || []
      const filtered = operator ? nodes.filter((n) => n.operator === operator.toUpperCase()) : nodes
      return filtered.map((n) => ({
        id: n.id, name: n.name, lat: n.lat, lng: n.lng,
        city: n.city, operator: n.operator, preset: !!n.preset,
      }))
    },
  },
  {
    name: 'node.add',
    desc: 'Haritaya yeni bir node ekler (kullanıcı marker\'ı).',
    schema: { lat: 'enlem', lng: 'boylam', name: 'node adı' },
    run: ({ lat, lng, name }, { getState }) => {
      const la = clamp(requireNumber(lat, 'lat'), -85, 85)
      const lo = clamp(requireNumber(lng, 'lng'), -180, 180)
      const nm = requireString(name, 'name')
      const before = getState().customNodes.length
      getState().addNode(la, lo, nm)
      const after = getState().customNodes
      const added = after[after.length - 1]  // addNode sona ekliyor
      return { ok: true, added: { id: added?.id, name: added?.name, lat: la, lng: lo }, total: after.length, wasTotal: before }
    },
  },
  {
    name: 'node.remove',
    desc: 'Bir node\'u id ile siler.',
    schema: { id: 'node id (node.list\'ten)' },
    run: ({ id }, { getState }) => {
      const nid = requireString(id, 'id')
      const existed = getState().customNodes.find((n) => n.id === nid)
      if (!existed) throw new Error(`"${nid}" id ile node yok.`)
      getState().removeNode(nid)
      return { ok: true, removed: { id: nid, name: existed.name } }
    },
  },
  {
    name: 'node.rename',
    desc: 'Bir node\'un adını değiştirir.',
    schema: { id: 'node id', name: 'yeni ad' },
    run: ({ id, name }, { getState }) => {
      const nid = requireString(id, 'id')
      const nm  = requireString(name, 'name')
      getState().renameNode(nid, nm)
      return { ok: true, id: nid, name: nm }
    },
  },

  /* ─── Panel ─── */
  {
    name: 'panel.open',
    desc: 'Belirtilen id\'li paneli açar.',
    schema: { id: `panel id — ${PANEL_IDS.join(' | ')}` },
    run: ({ id }, { getState }) => {
      const pid = requireString(id, 'id')
      getState().setActivePanel(pid)
      return { ok: true, panel: pid }
    },
  },
  {
    name: 'panel.close',
    desc: 'Aktif paneli kapatır.',
    schema: {},
    run: (_, { getState }) => {
      getState().setActivePanel(null)
      return { ok: true }
    },
  },

  /* ─── Arama ─── */
  {
    name: 'search.nearby',
    desc: 'Verilen koordinatın belirli yarıçapındaki yakın tehditleri/tesisleri bulur. Kinds belirtmezsen hepsine bakar.',
    schema: {
      lat: 'enlem', lng: 'boylam', radius_km: 'km cinsinden yarıçap',
      kinds: 'opsiyonel: ["facility","global_site","force","asset","node"] altkümesi',
      limit: 'opsiyonel üst sınır (varsayılan 15)',
    },
    run: ({ lat, lng, radius_km, kinds, limit }, { getState }) => {
      const la = requireNumber(lat, 'lat')
      const lo = requireNumber(lng, 'lng')
      const r  = requireNumber(radius_km, 'radius_km')
      const max = clamp(Number(limit) || 15, 1, 100)
      const wanted = new Set(Array.isArray(kinds) && kinds.length ? kinds : ['facility', 'global_site', 'force', 'asset', 'node'])
      const origin = { lat: la, lng: lo }
      const hits = []

      if (wanted.has('facility')) {
        facilitiesData.forEach((f) => {
          const km = kmBetween(origin, f)
          if (km <= r) hits.push({ kind: 'facility', id: f.id, name: f.name, category: f.category, lat: f.lat, lng: f.lng, km })
        })
      }
      if (wanted.has('global_site')) {
        globalSitesData.forEach((g) => {
          const km = kmBetween(origin, g)
          if (km <= r) hits.push({ kind: 'global_site', id: g.id, name: g.name, operator: g.operator, type: g.type, lat: g.lat, lng: g.lng, km })
        })
      }
      if (wanted.has('force')) {
        // forceDeployments.json çatışma id'si ile indexlenmiş nesne
        const all = Object.values(forceDeploymentsData).flat()
        all.forEach((u) => {
          if (typeof u.lat !== 'number') return
          const km = kmBetween(origin, u)
          if (km <= r) hits.push({ kind: 'force', id: u.id, name: u.name, side: u.side, type: u.type, conflictId: u.conflictId, lat: u.lat, lng: u.lng, km })
        })
      }
      if (wanted.has('asset')) {
        const all = Object.values(conflictAssetsData).flat()
        all.forEach((a) => {
          if (typeof a.lat !== 'number') return
          const km = kmBetween(origin, a)
          if (km <= r) hits.push({ kind: 'asset', id: a.id, name: a.name, type: a.type, side: a.side, conflictId: a.conflictId, lat: a.lat, lng: a.lng, km })
        })
      }
      if (wanted.has('node')) {
        (getState().customNodes || []).forEach((n) => {
          const km = kmBetween(origin, n)
          if (km <= r) hits.push({ kind: 'node', id: n.id, name: n.name, operator: n.operator, lat: n.lat, lng: n.lng, km })
        })
      }

      hits.sort((a, b) => a.km - b.km)
      return {
        origin: [la, lo],
        radius_km: r,
        total: hits.length,
        truncated: hits.length > max,
        hits: hits.slice(0, max).map((h) => ({ ...h, km: +h.km.toFixed(1) })),
      }
    },
  },
  {
    name: 'search.by_name',
    desc: 'Ad ile arama — tesisler, global üsler, çatışma varlıkları, birlikler, node\'lar.',
    schema: {
      query: 'aranan string (alt-string eşleşmesi)',
      kinds: 'opsiyonel filtre altkümesi',
      limit: 'varsayılan 20',
    },
    run: ({ query, kinds, limit }, { getState }) => {
      const q   = requireString(query, 'query')
      const max = clamp(Number(limit) || 20, 1, 100)
      const wanted = new Set(Array.isArray(kinds) && kinds.length ? kinds : ['facility', 'global_site', 'force', 'asset', 'node', 'conflict', 'country'])
      const hits = []

      if (wanted.has('conflict')) {
        conflictsData.forEach((c) => {
          if (nameMatches(c.name, q) || c.id === q) {
            hits.push({ kind: 'conflict', id: c.id, name: c.name, region: c.region, status: c.status })
          }
        })
      }
      if (wanted.has('country')) {
        Object.values(COUNTRIES).forEach((c) => {
          if (nameMatches(c.label, q) || c.code === q.toUpperCase()) {
            hits.push({ kind: 'country', code: c.code, name: c.label })
          }
        })
      }
      if (wanted.has('facility')) {
        facilitiesData.forEach((f) => {
          if (nameMatches(f.name, q) || nameMatches(f.city, q)) {
            hits.push({ kind: 'facility', id: f.id, name: f.name, category: f.category, city: f.city, lat: f.lat, lng: f.lng })
          }
        })
      }
      if (wanted.has('global_site')) {
        globalSitesData.forEach((g) => {
          if (nameMatches(g.name, q) || nameMatches(g.country, q)) {
            hits.push({ kind: 'global_site', id: g.id, name: g.name, operator: g.operator, country: g.country, lat: g.lat, lng: g.lng })
          }
        })
      }
      if (wanted.has('force')) {
        Object.values(forceDeploymentsData).flat().forEach((u) => {
          if (nameMatches(u.name, q)) hits.push({ kind: 'force', id: u.id, name: u.name, conflictId: u.conflictId, lat: u.lat, lng: u.lng })
        })
      }
      if (wanted.has('asset')) {
        Object.values(conflictAssetsData).flat().forEach((a) => {
          if (nameMatches(a.name, q)) hits.push({ kind: 'asset', id: a.id, name: a.name, conflictId: a.conflictId, lat: a.lat, lng: a.lng })
        })
      }
      if (wanted.has('node')) {
        (getState().customNodes || []).forEach((n) => {
          if (nameMatches(n.name, q)) hits.push({ kind: 'node', id: n.id, name: n.name, lat: n.lat, lng: n.lng })
        })
      }

      return { query: q, total: hits.length, truncated: hits.length > max, hits: hits.slice(0, max) }
    },
  },

  /* ─── Durum snapshot ─── */
  {
    name: 'state.snapshot',
    desc: 'Mevcut scope + map + layers + selection özetini bir JSON olarak döner.',
    schema: {},
    run: (_, { getState }) => {
      const s = getState()
      return {
        mode: s.appMode,
        operator: s.operator,
        focusCountry: s.focusCountry,
        selectedConflictId: s.selectedConflict?.id || null,
        map: { center: s.mapCenter, zoom: s.mapZoom, tile: s.tileStyle },
        layers: Object.fromEntries(LAYERS.map((l) => [l.id, !!s[l.stateKey]])),
        activePanel: s.activePanelId,
        customNodesCount: (s.customNodes || []).length,
      }
    },
  },
]

const TOOL_BY_NAME = Object.fromEntries(TOOLS.map((t) => [t.name, t]))

/** Tool çalıştırıcı — hata durumunda structured error döner. */
export async function executeTool(name, args, ctx) {
  const tool = TOOL_BY_NAME[name]
  if (!tool) return { ok: false, error: `Bilinmeyen tool: "${name}". Mevcut: ${TOOLS.map((t) => t.name).join(', ')}` }
  try {
    const result = await tool.run(args || {}, ctx)
    return { ok: true, result }
  } catch (e) {
    return { ok: false, error: e?.message || String(e) }
  }
}

/** LLM sistem promptu için araç manifesti — kompakt markdown tablo. */
export function describeTools() {
  const lines = []
  lines.push('## Araç Listesi')
  lines.push('Aşağıdaki araçları `<tool_call>{"name":"...","args":{...}}</tool_call>` bloklarıyla çağırabilirsin.')
  lines.push('Birden fazla araç art arda çağırabilirsin. Araç çağırdıktan sonra mutlaka sonucu bekle.')
  lines.push('')
  let currentNs = null
  for (const t of TOOLS) {
    const ns = t.name.split('.')[0]
    if (ns !== currentNs) { currentNs = ns; lines.push(`### ${ns}`) }
    const args = Object.entries(t.schema).map(([k, d]) => `${k}: ${d}`).join(' · ') || '(yok)'
    lines.push(`- **${t.name}** — ${t.desc}  \n  args: ${args}`)
  }
  return lines.join('\n')
}

/**
 * LLM yanıtında <tool_call>...</tool_call> bloklarını bul, JSON'a çevir.
 * Format katı: blok içeriği saf JSON olmalı.
 *
 * Geriye { calls, narrative } döner:
 *   calls     — [{ name, args, raw }]
 *   narrative — tool_call blokları çıkarılmış, kullanıcıya gösterilecek metin
 */
export function parseToolCalls(text) {
  if (!text) return { calls: [], narrative: '' }
  const rx = /<tool_call>([\s\S]*?)<\/tool_call>/g
  const calls = []
  let m
  while ((m = rx.exec(text)) !== null) {
    const raw = m[1].trim()
    try {
      // Bazen LLM JSON'u ```json ... ``` fence'i içinde verir; onu da sök
      const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
      const parsed = JSON.parse(clean)
      if (parsed && typeof parsed.name === 'string') {
        calls.push({ name: parsed.name, args: parsed.args || {}, raw })
      } else {
        calls.push({ name: null, args: null, raw, error: 'name alanı yok' })
      }
    } catch (e) {
      calls.push({ name: null, args: null, raw, error: `JSON parse: ${e.message}` })
    }
  }
  const narrative = text.replace(rx, '').trim()
  return { calls, narrative }
}

/** Tool sonuçlarını LLM'e geri beslemek için kompakt metin. */
export function formatToolResultsForLLM(results) {
  const lines = ['Tool sonuçları:']
  results.forEach((r, i) => {
    lines.push(`\n[${i + 1}] ${r.name}`)
    if (r.ok) {
      const j = JSON.stringify(r.result)
      lines.push(j.length > 4000 ? j.slice(0, 4000) + '…(kırpıldı)' : j)
    } else {
      lines.push(`HATA: ${r.error}`)
    }
  })
  return lines.join('\n')
}
