import { create } from 'zustand'
import { CATEGORY_ORDER } from '../config/categories'
import { DRONE_ORDER, DRONE_PRODUCTS } from '../config/drones'
import { GLOBAL_OPERATOR_ORDER } from '../config/globalSites'
import { OPERATORS, DEFAULT_OPERATOR, getOperator } from '../config/operators'
import tairosSeedNodes from '../data/tairos-nodes.json'
import { facilityKey, makeDeployment } from '../utils/facilityProducts'
import { makePersister } from './persist'

/* Operatör (actor) kimliğini oturumlar arası tutar — kullanıcı bir kez
 * "ABD olarak oyna" dediyse yeniden açılışta da öyle başlasın. URL
 * parametresi (?op=US) bu değeri geçersiz kılar; URL'siz girişte
 * localStorage'daki son operatör kullanılır. */
const OPERATOR_STORAGE_KEY = 'tairos:operator'
const loadOperator = () => {
  try {
    const code = localStorage.getItem(OPERATOR_STORAGE_KEY)
    if (code && OPERATORS[code]) return code
  } catch {}
  return DEFAULT_OPERATOR
}
const persistOperator = (code) => {
  try { localStorage.setItem(OPERATOR_STORAGE_KEY, code) } catch {}
}

// All Tairos nodes live here — both the preset ones shipped with the app and
// anything the user adds at runtime. Everything in this list is equally
// modifiable: deletable, renameable, etc. A node's `preset: true` flag only
// controls a tiny visual hint; it has NO behavioural consequence.
const NODE_STORAGE_KEY = 'tairos-nodes-v2'

const loadNodes = () => {
  // Operator etiketleme: F2 öncesi kayıtlarda `operator` alanı yok — o
  // dönemdeki her şey varsayılan olarak TR (platformun ilk actor'ı) içindi.
  // Migration untagged → 'TR' bu tarihçe ile uyumlu. Yeni eklemeler kendi
  // operatörünü taşır (bkz. addNode, applyPlacement).
  const tagTR = (n) => (n.operator ? n : { ...n, operator: 'TR' })
  try {
    const raw = localStorage.getItem(NODE_STORAGE_KEY)
    if (raw !== null) {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed.map(tagTR) : []
    }
    // One-time migration: if the old custom-only key exists, merge it into the
    // seed so returning users don't lose their additions.
    const old = localStorage.getItem('tairos-custom-nodes')
    const oldNodes = old ? JSON.parse(old) : []
    const seeded = [
      ...tairosSeedNodes.map((n) => ({ ...n, preset: true, operator: n.operator || 'TR' })),
      ...oldNodes.map(tagTR),
    ]
    localStorage.setItem(NODE_STORAGE_KEY, JSON.stringify(seeded))
    return seeded
  } catch {
    return tairosSeedNodes.map((n) => ({ ...n, preset: true, operator: n.operator || 'TR' }))
  }
}

// Debounced (250ms) — batch placement/migration writes don't block the main
// thread, but we still flush on beforeunload/visibilitychange so crashes or
// tab-close never lose the last change. See ./persist.js for the mechanism.
const persistNodes = makePersister(NODE_STORAGE_KEY)

// Facility product deployments: { [facilityKey]: [deployment, …] }
// Her deployment kendi `operator` alanını taşır — aynı tesise iki farklı
// operatör ürün yerleştirebilir (örneğin aynı Suriye şehir noktasında
// hem TR hem US dağıtımı olabilir, ikisi ayrı oynanış). UI operatöre göre
// filtreler; store ham veriyi bozulmadan tutar.
const FP_STORAGE_KEY = 'tairos-facility-products-v1'
const loadFacilityProducts = () => {
  try {
    const raw = localStorage.getItem(FP_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    const migrated = {}
    for (const [key, list] of Object.entries(parsed)) {
      migrated[key] = Array.isArray(list)
        ? list.map((d) => d.operator ? d : { ...d, operator: 'TR' })
        : list
    }
    return migrated
  } catch { return {} }
}
const persistFacilityProducts = makePersister(FP_STORAGE_KEY)

// Named rectangular groups drawn on the map. Minimal schema so the user can
// mark an area once and refer to it ("Bölge 1", "Güneydoğu gözlem") without
// re-drawing every time.
const GROUPS_STORAGE_KEY = 'tairos-area-groups-v1'
const loadGroups = () => {
  try {
    const raw = localStorage.getItem(GROUPS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed)
      ? parsed.map((g) => g.operator ? g : { ...g, operator: 'TR' })
      : []
  } catch { return [] }
}
const persistGroups = makePersister(GROUPS_STORAGE_KEY)

// ── Saved views (operatöre bağlı ön-kayıtlı bakış açıları) ─────
//   "Güney sahil deniz savunması" | "Harkiv cephe izleme" gibi isimli
//   paketler: kamera + aktif katmanlar + filtreler + scope snapshot'ı.
//   Her view operatöre etiketlenir, böylece TR'ye ait view US operatörüne
//   geçildiğinde listede görünmez.
const SAVED_VIEWS_KEY = 'tairos:saved-views-v1'
const loadSavedViews = () => {
  try {
    const raw = localStorage.getItem(SAVED_VIEWS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed)
      ? parsed.map((v) => v.operator ? v : { ...v, operator: 'TR' })
      : []
  } catch { return [] }
}
const persistSavedViews = makePersister(SAVED_VIEWS_KEY)

const DEFAULT_CATEGORIES = new Set(CATEGORY_ORDER)
const DEFAULT_DRONES     = new Set(DRONE_ORDER)  // all products active by default

const getInitialState = () => {
  // Operatör ilk burada çözülür çünkü kamera default'u operatör
  // konfigine bağlı — TR açılışı Türkiye merkezli, US açılışı ABD merkezli.
  const lsOperator = loadOperator()
  try {
    const params   = new URLSearchParams(window.location.search)
    const cats     = params.get('c')
    const tile     = params.get('tile')
    const lat      = params.get('lat')
    const lng      = params.get('lng')
    const zoom     = params.get('z')
    const drones   = params.get('d')
    const op       = params.get('op')      // ?op=US gibi — aktif operatör
    const country  = params.get('ctry')    // ?ctry=UA  — ülke odağı (ISO)

    // URL > localStorage > DEFAULT_OPERATOR öncelik sırası. URL geçersiz
    // kod taşıyorsa sessizce localStorage'a düşeriz.
    const operator = (op && OPERATORS[op]) ? op : lsOperator
    const cam      = getOperator(operator).defaultCamera

    return {
      operator,
      focusCountry: country || null,    // ISO alpha-2 veya null
      activeCategories: (() => {
        const parsed = cats ? cats.split(',').filter(Boolean).filter(id => CATEGORY_ORDER.includes(id)) : []
        return parsed.length > 0 ? new Set(parsed) : DEFAULT_CATEGORIES
      })(),
      activeDrones: (() => {
        const parsed = drones ? drones.split(',').filter(Boolean).filter(id => DRONE_ORDER.includes(id)) : []
        return parsed.length > 0 ? new Set(parsed) : DEFAULT_DRONES
      })(),
      tileStyle: ['dark', 'light', 'satellite', 'tactical', 'minimal'].includes(tile) ? tile : 'dark',
      mapCenter: lat && lng ? [Number(lat), Number(lng)] : [cam.lat, cam.lng],
      mapZoom:   zoom ? Number(zoom) : cam.zoom,
    }
  } catch {
    const cam = getOperator(lsOperator).defaultCamera
    return {
      operator:         lsOperator,
      focusCountry:     null,
      activeCategories: DEFAULT_CATEGORIES,
      activeDrones:     DEFAULT_DRONES,
      tileStyle:        'dark',
      mapCenter:        [cam.lat, cam.lng],
      mapZoom:          cam.zoom,
    }
  }
}

const initial = getInitialState()

const useStore = create((set, get) => ({
  // Facility layers (markers only — no coverage polygon).
  // Platform is observational: facilities are shown so you can see WHAT is
  // where. Coverage/menzil is exclusively a Tairos drone-product feature.
  activeCategories: initial.activeCategories,

  // Tairos drone products — the ONLY source of coverage polygons.
  activeDrones: initial.activeDrones,       // which products are enabled
  droneRanges: { nova: 100, iris: 50, radar: 60 },  // adjustable range per drone (km)
  droneSources: {                                     // deployment sources per drone
    nova:  new Set(['nodes']),
    iris:  new Set(['nodes']),
    // Radar intentionally starts with NO default sources. Unlike nova/iris
    // which merge into a single coverage polygon, radar draws an individual
    // rotating sweep at every source site — so having 'nodes' on by default
    // meant every newly-added node auto-grew its own radar scope, which the
    // user reported as surprising/buggy. Now radar is opt-in: enable 'nodes'
    // (or a specific category) as a radar source, or configure radar per-site
    // via the facility detail panel.
    radar: new Set(),
  },

  // Tairos nodes — unified list (preset + user-added). All entries are fully
  // modifiable (delete / rename). Persisted in localStorage.
  customNodes: loadNodes(),
  nodeEditMode: false,   // when true: map click adds a node

  // Products deployed onto specific facilities / nodes. Separate from the
  // global drone layer: these are site-specific configurations that can
  // override range, hold status/quantity/notes, and render their own circle.
  facilityProducts: loadFacilityProducts(),

  // UI state
  selectedFacility: null,
  searchQuery:      '',
  searchResults:    [],
  tileStyle:        initial.tileStyle,
  activeOverlays:   new Set(),
  sidebarOpen:      true,
  dedupeMode:       false,

  // Strategic product placement tool state.
  //   'idle'        → tool off, map behaves normally
  //   'drawing'     → user is clicking polygon vertices on the map
  //   'configuring' → polygon closed, user picks which products to place
  placementMode:     'idle',
  placementPolygon:  null,   // [[lat, lng], …]  (ring, first != last)
  placementPreview:  [],     // [{productId, lat, lng, rangeKm}, …] — draws preview circles

  // Right-drag area selection rectangle (transient — cleared by panel close).
  //   null when inactive, otherwise [[southLat, westLng], [northLat, eastLng]]
  areaSelection:     null,

  // Persistent user-named groups of an area. Each entry:
  //   { id, name, bounds: [[sLat,wLng],[nLat,eLng]], color, createdAt }
  // Facilities/nodes inside a group's bounds are counted dynamically so the
  // group stays meaningful when the map data changes.
  areaGroups:        loadGroups(),
  highlightedGroupId: null,
  // When the user clicks a saved group on the map or in the sidebar, we load
  // it into the AreaInfoPanel in "edit" mode — the same panel doubles as a
  // group editor so rename / delete / re-send-to-placement all live in one
  // place. `null` → creating a new selection; group.id → editing that group.
  editingGroupId:    null,

  // ── Weather (RainViewer) ──
  // Rain radar + cloud infrared tiles overlaid on the map. Layer fetches the
  // frame manifest itself; store only holds on/off state, opacity, and the
  // selected frame index (for animation). Nowcast is preferred over past
  // frames for rain so the operator sees the imminent precipitation field.
  weatherRainOn:     false,
  weatherCloudsOn:   false,
  weatherOpacity:    0.7,
  weatherFrameIndex: null,    // null → use the latest frame; number → animation pointer
  weatherAnimating:  false,

  // ── Conflict Intel layer ───────────────────────────────
  // Country-level conflict overlay — bubbles for affected countries,
  // simplified frontlines, contested zones, and named hotspots. The whole
  // thing is read-only (seed data only) but toggleable; clicking a bubble
  // opens a detail panel explaining Tairos relevance for that theatre.
  conflictsOn:        false,
  selectedConflict:   null,     // conflict object when detail panel is open
  hoveredConflictId:  null,     // sidebar ⇄ map hover sync
  conflictStatusFilter: 'all',  // 'all' | 'active' | 'tension' | 'frozen'
  // Monotonic counter bumped every time the operator picks a conflict from
  // the sidebar or clicks a bubble. MapView subscribes to it to re-fit
  // bounds to the conflict's theatre even when the same conflict is
  // clicked twice in a row (id alone wouldn't trigger a re-run).
  conflictFocusTick:  0,

  // ── Foreign strategic assets inside conflict theatres ─────
  // DELIBERATELY separate namespace from the domestic facility taxonomy:
  //   activeCategories  → Turkey's own inventory (airforce / navy / etc.)
  //   conflictAssetsOn  → rival capitals, proxy strongholds, nuclear
  //                        sites, TURKSOM, GERD, Taiwan air-defence, etc.
  // Same map, different store slice, different pane, different data file —
  // so a Bayraktar UAV base in Somalia never shows up next to a hudut
  // alayı in the Turkey filter, and vice versa.
  conflictAssetsOn:        true,
  conflictAssetKindFilter: 'all',   // 'all' | 'command' | 'kinetic' | 'infra' | 'civic'
  selectedConflictAsset:   null,    // asset record when its popup/panel is open
  hoveredConflictAssetId:  null,    // sidebar ⇄ map hover sync

  // ── Global standing strategic sites (independent of conflicts) ─────
  // The third namespace. Shows ALL THE TIME when on, not gated on a
  // selected conflict. Operator filter is multi-select (Set) so the
  // operator can combine "ABD + NATO" or drop "Çin" without losing the
  // rest. See src/config/globalSites.js for the palette vocabulary.
  globalSitesOn:          false,    // starts off — user opts in
  globalSiteOperators:    new Set(GLOBAL_OPERATOR_ORDER),
  globalSiteRegion:       'all',    // 'all' | <region id>
  globalSiteMinImportance: 1,       // 1-5 threshold (drops markers below)
  globalSiteSearch:       '',
  selectedGlobalSite:     null,
  hoveredGlobalSiteId:    null,

  // ── Force deployments (in-theatre military formations) ─────
  // Fourth namespace — NOT facilities, NOT conflict bubbles, NOT global
  // standing sites. These are the actual formations (brigades, corps, air
  // wings, fleets, proxy cells) that physically carry out the campaign.
  // Side is A/B (mapped per-conflict to real labels), echelon gates marker
  // size + pip badge, and the kind filter lets the operator mute noisy
  // clusters (e.g. irregular proxy cells) without per-type surgery. Scope
  // toggles between "everything, everywhere" and "only in the currently
  // selected conflict" so the operator can declutter when drilled in.
  forceDeployOn:           false,   // starts off — user opts in
  forceDeploySides:        new Set(['A', 'B']),
  forceDeployKindFilter:   'all',   // 'all' | 'command' | 'combat' | 'fires' | 'air' | 'naval' | 'irregular'
  forceDeployMinEchelon:   0,       // 0 = all, 1=battalion, 2=brigade, 3=division, 4=corps, 5=army, 6=theatre
  forceDeployScope:        'all',   // 'all' | 'selected-conflict'
  forceDeploySearch:       '',
  selectedDeployUnit:      null,
  hoveredDeployUnitId:     null,

  // ── Tehdit Projeksiyonu (threat domes + engagement rings) ─────
  // Draws a "don't-stand-here" ring on the map for every enemy
  // formation based on its unit type (airdef → SAM dome, art → fires
  // fan, uav → long mission radius, etc.). Reuses force-deploy data,
  // so enabling it without the parent layer is a no-op but cheap.
  threatProjectionOn:      false,
  threatProjectionSides:   new Set(['A', 'B']),      // which sides' threats to render
  threatProjectionStyles:  new Set(['sam', 'air', 'naval', 'fires']),  // style filter
  threatIntensity:         0.55,    // 0-1 master opacity (UI slider)

  // ── Komuta Zinciri (decapitation visualizer) ──────────────────
  // When a HQ unit is selected AND this is on, we draw lines from
  // the HQ to its subordinates (matched by formation-name heuristic
  // across the same side + conflict). "Which units go dark if I hit
  // this karargah?" becomes a visual answer.
  killChainOn:             false,
  killChainRangeKm:        400,     // fallback proximity when name-match is sparse

  // ── Sidebar tab state (legacy) ─────────────────────────
  // Eskiden Sidebar üç ana sekmeyle sürülüyordu (platform / field / intel).
  // F1'den itibaren o sekme çubuğu kaldırıldı; kontrolü sol kenardaki
  // ActivityBar ve `activePanelId` aldı. Mevcut Sidebar bölümleri hâlâ
  // `sidebarTab === 'platform'` gibi guard'larla gate'leniyor — bu yüzden
  // `setActivePanel` legacy id'leri sidebarTab'a mirror eder. Panel host
  // refactor'u bitince bu key kaldırılacak.
  sidebarTab:         'platform',  // 'platform' | 'field' | 'intel'  — DEPRECATED

  // ── Actor layer ("ben kimim?") ────────────────────────
  // Platform tek bir ülkeye kilitli değil — `operator` uygulamanın
  // hangi ulus/taraf adına oynadığımızı söyler. TR default; URL
  // (?op=US) veya switcher aracılığıyla değişir. Operatör değişince
  // varsayılan kamera ve "benim sistemlerim" görüş açısı güncellenir;
  // işaretlenmiş nodes/groups bugün paylaşımlı — operatör-scoped
  // depolama ileride eklenecek.
  operator:           initial.operator,

  // ── Scope layer ("neye bakıyorum?") ───────────────────
  //   global   → hiç filtre yok (varsayılan)
  //   country  → tek bir ülkeye daraltılmış görünüm (focusCountry'de ISO kod)
  //   conflict → bir çatışmaya odaklı (Lokal modda; `conflictFocus` dolu)
  // appMode bu eksenin GLOBAL (global+country) vs LOCAL (conflict) görsel
  // ayrımıdır. Ülke odağı Global mod içinde yaşar.
  focusCountry:       initial.focusCountry,  // null | ISO alpha-2

  // ── App mod (Global / Lokal) ──────────────────────────
  // Global → varsayılan dünya görünümü (çoklu çatışma, tarama)
  // Lokal  → Conflict Focus: tek bir çatışmanın içindeyiz; activity bar
  //          workspace sekmelerine dönüşür, kamera o bölgeye kilitlenir,
  //          force-deploy scope otomatik 'selected-conflict' olur,
  //          taraf seçici (Dost/Düşman) aktifleşir.
  // Geçiş tek yoldan: enter/exitConflictFocus — böylece girişte çekilen
  // kamera snapshot'ı çıkışta restore edilebilir.
  appMode:            'global',    // 'global' | 'local'

  // ActivityBar'ın açık paneli. null → sol raf tamamen kapalı.
  // Panel listesi src/config/panels.js'den gelir. Legacy panellerde
  // (platform/field/intel) id aynı zamanda sidebarTab değeri — F1
  // boyunca ikisi senkron tutuluyor.
  activePanelId:      'intel',

  // ── Conflict Focus state ──────────────────────────────
  // Non-null → uygulama belirli bir çatışma için Lokal moddadır.
  // prevCenter/prevZoom giriş anındaki kamerayı tutar; çıkışta tam olarak
  // o görünüme dön. Her zaman enterConflictFocus(conflict) ile girilir.
  conflictFocus:      null,
  // { conflictId: string, enteredAt: ms, prevCenter: [lat,lng], prevZoom: number }

  // Her çatışma için ayrı saklanan "ben hangi cepheden izliyorum" seçimi.
  // Odaktan çıkıp tekrar girildiğinde o çatışma için seçim hatırlanır.
  // Shape: { [conflictId]: 'A' | 'B' | 'neutral' }
  focusSideByConflict: {},

  // Ülke odağı değiştiğinde harita animasyonunu tetiklemek için tick.
  // Aynı ülkeye ikinci kez focus atınca da flyToBounds yeniden koşsun.
  countryFocusTick: 0,

  // Ülke odağı açıkken hangi görsel katmanların haritada çizileceğini
  // kontrol eden toggle seti. CountryBriefPanel'deki "Katmanlar" bloğu
  // buna yazar, CountryFocusLayer okur.
  countryFocusView: {
    outline:    true,   // ülke sınır kutusu (dashed rectangle)
    ownSites:   true,   // kendi kritik tesisleri (accent)
    rivalSites: true,   // rakip ülke kritik tesisleri (kırmızı)
    rivalFlag:  true,   // rakip ülkelerin bayrak etiketleri
  },

  // ── İleriye dönük altyapı slotları (F2) ───────────────
  // Panellerin bağlanabileceği şekil-sabit boş veri kapları. Bugün UI
  // hepsine salt-okunur stub olarak bakıyor; F3+'te mission planner,
  // envanter takibi, sensör füzyonu ve "saved view" listeleri buraya
  // yerleşecek. Şimdiden durumu açıkça var etmek, sonra state'i
  // dağıtık ekleyip tipleri kırma riskini ortadan kaldırır.
  //
  // missions:   [{ id, title, operator, status, steps:[…] }]
  //   "Kuzey Suriye keşif tur 1" gibi görev paketleri.
  // inventory:  { [operatorCode]: { [productId]: { stock, deployed, reserve } } }
  //   Operatöre göre ayrılmış envanter sayıcı. UI "ABD'nin 14 Nova'sı var"
  //   demek için buraya bakacak.
  // sensors:    [{ id, type, lat, lng, operator, health, lastPing }]
  //   Radar / SIGINT / optik sensörlerin canlı durum izleme kaydı.
  // savedViews: [{ id, name, operator, createdAt, snapshot:{…} }]
  //   Operatöre etiketli, adlandırılmış bakış açıları.
  missions:    [],
  inventory:   {},
  sensors:     [],
  savedViews:  loadSavedViews(),

  // ── Yer-tutucu slotlar (F1'de boş, gelecekte dolacak) ──
  // Shell JSX'inde zaten hazırda; aksiyonlar kayıtta ama kimse açmıyor.
  // F5+'te in-app yardımcı chatbot (Tairos Asistan) buraya bağlanacak;
  // simülasyon/önizleme overlay'i de buradan kontrol edilecek.
  chatbotDockOpen:    false,
  previewOverlay:     null,   // null | { kind: 'drone'|'sim'|..., payload: {...} }

  // ── Command Palette (Ctrl+K) ─────────────────────────
  // Tüm uygulamayı klavyeden sürmek için birleşik quick-switch.
  // Open state'i store'da tutuyoruz çünkü a) ActivityBar butonu
  // ile de açılabilsin, b) diğer panellerden slash-komutlarla
  // programatik açılabilsin.
  commandPaletteOpen: false,

  // Map state (default'u aktif operatörün camera'sından geldi — bkz.
  //  initial hesabı yukarıda).
  mapCenter: initial.mapCenter,
  mapZoom:   initial.mapZoom,

  // ── Actions ────────────────────────────────────────────────
  toggleCategory:   (id) => set((s) => {
    const next = new Set(s.activeCategories)
    next.has(id) ? next.delete(id) : next.add(id)
    return { activeCategories: next }
  }),
  setAllCategories: (enabled) => set({
    activeCategories: enabled ? new Set(CATEGORY_ORDER) : new Set()
  }),

  toggleDrone:   (id) => set((s) => {
    const next = new Set(s.activeDrones)
    next.has(id) ? next.delete(id) : next.add(id)
    return { activeDrones: next }
  }),

  setDroneRange: (droneId, km) => set((s) => ({
    droneRanges: { ...s.droneRanges, [droneId]: km }
  })),

  toggleDroneSource: (droneId, sourceId) => set((s) => {
    const current = new Set(s.droneSources[droneId] || [])
    current.has(sourceId) ? current.delete(sourceId) : current.add(sourceId)
    return { droneSources: { ...s.droneSources, [droneId]: current } }
  }),

  // Node actions — apply uniformly to preset & user-added nodes.
  addNode: (lat, lng, name) => set((s) => {
    const n = {
      id: `cn-${Date.now()}`,
      name: name || `Node ${s.customNodes.length + 1}`,
      lat, lng,
      custom: true,
      operator: s.operator,    // yeni node aktif operatöre ait
    }
    const next = [...s.customNodes, n]
    persistNodes(next)
    return { customNodes: next }
  }),
  removeNode: (id) => set((s) => {
    const node = s.customNodes.find((n) => n.id === id)
    const next = s.customNodes.filter((n) => n.id !== id)
    persistNodes(next)
    // Also purge any deployments pinned to this node so we don't leave
    // orphaned products lingering in localStorage.
    const fp = { ...s.facilityProducts }
    const nodeKey = node ? facilityKey(node) : null
    if (nodeKey && fp[nodeKey]) { delete fp[nodeKey]; persistFacilityProducts(fp) }
    return { customNodes: next, facilityProducts: fp }
  }),
  /**
   * Bulk-delete every custom node whose lat/lng falls inside `bounds`.
   * Used by the crowded-area cleanup flow: the operator right-drags a
   * region, opens the info panel, hits "clear". Facility-product rows on
   * those nodes are dropped at the same time so the store stays consistent.
   *
   * Preset nodes are included in the sweep — the seed list is a starting
   * point, not a sacred set: if the operator says "delete nodes in this
   * rectangle", they mean every node there. `resetNodes()` restores the
   * factory set when needed.
   *
   * @param {[[number, number], [number, number]]} bounds  [[sLat,wLng],[nLat,eLng]]
   * @returns {number} how many nodes were removed
   */
  removeNodesInBounds: (bounds) => {
    if (!bounds) return 0
    const [[sLat, wLng], [nLat, eLng]] = bounds
    const s = get()
    const toRemove = s.customNodes.filter(
      (n) => n.lat >= sLat && n.lat <= nLat && n.lng >= wLng && n.lng <= eLng
    )
    if (toRemove.length === 0) return 0
    const idSet   = new Set(toRemove.map((n) => n.id))
    const nextNodes = s.customNodes.filter((n) => !idSet.has(n.id))
    persistNodes(nextNodes)
    // Drop any facility-product rows attached to those node ids.
    const fp = { ...s.facilityProducts }
    let fpDirty = false
    toRemove.forEach((n) => {
      const k = facilityKey(n)
      if (k && fp[k]) { delete fp[k]; fpDirty = true }
    })
    if (fpDirty) persistFacilityProducts(fp)
    set({ customNodes: nextNodes, facilityProducts: fpDirty ? fp : s.facilityProducts })
    return toRemove.length
  },
  renameNode: (id, name) => set((s) => {
    const next = s.customNodes.map((n) => n.id === id ? { ...n, name } : n)
    persistNodes(next)
    return { customNodes: next }
  }),
  clearCustomNodes: () => {
    // Wipe everything — leaves an empty map. Useful as a "clean slate".
    persistNodes([])
    set({ customNodes: [] })
  },
  resetNodes: () => {
    // Restore the factory preset set, dropping any user additions.
    const seeded = tairosSeedNodes.map((n) => ({ ...n, preset: true }))
    persistNodes(seeded)
    set({ customNodes: seeded })
  },
  setNodeEditMode: (v) => set({ nodeEditMode: v }),

  // Facility-product actions — operate on the store's facilityProducts map.
  addFacilityProduct: (facility, product, overrides) => set((s) => {
    const key = facilityKey(facility)
    if (!key || !product) return {}
    const list = s.facilityProducts[key] ? [...s.facilityProducts[key]] : []
    // Deployment'a aktif operatörü ekle — merge'de override edilmesin diye
    // tagging makeDeployment sonucu üzerinden yapılır.
    list.push({ ...makeDeployment(product, overrides), operator: s.operator })
    const next = { ...s.facilityProducts, [key]: list }
    persistFacilityProducts(next)
    return { facilityProducts: next }
  }),
  updateFacilityProduct: (facility, uid, patch) => set((s) => {
    const key = facilityKey(facility)
    if (!key) return {}
    const list = (s.facilityProducts[key] || []).map((d) =>
      d.uid === uid ? { ...d, ...patch } : d
    )
    const next = { ...s.facilityProducts, [key]: list }
    persistFacilityProducts(next)
    return { facilityProducts: next }
  }),
  removeFacilityProduct: (facility, uid) => set((s) => {
    const key = facilityKey(facility)
    if (!key) return {}
    const list = (s.facilityProducts[key] || []).filter((d) => d.uid !== uid)
    const next = { ...s.facilityProducts }
    if (list.length === 0) delete next[key]
    else next[key] = list
    persistFacilityProducts(next)
    return { facilityProducts: next }
  }),
  clearFacilityProducts: (facility) => set((s) => {
    const key = facilityKey(facility)
    if (!key) return {}
    const next = { ...s.facilityProducts }
    delete next[key]
    persistFacilityProducts(next)
    return { facilityProducts: next }
  }),

  selectFacility:   (f) => set({ selectedFacility: f }),
  clearSelection:   ()  => set({ selectedFacility: null }),
  setSearch:        (q) => set({ searchQuery: q }),
  setSearchResults: (r) => set({ searchResults: r }),
  setTile:          (t) => set({ tileStyle: t }),
  toggleOverlay:    (id) => set((s) => {
    const next = new Set(s.activeOverlays)
    next.has(id) ? next.delete(id) : next.add(id)
    return { activeOverlays: next }
  }),
  setSidebarOpen:   (v) => set({ sidebarOpen: v }),
  setDedupeMode:    (v) => set({ dedupeMode: v }),

  // ── Strategic placement tool ────────────────────────────
  startPlacement:  () => set({ placementMode: 'drawing', placementPolygon: null, placementPreview: [] }),
  cancelPlacement: () => set({ placementMode: 'idle',     placementPolygon: null, placementPreview: [] }),
  setPlacementPolygon: (pts) => set({
    placementPolygon: pts,
    placementMode:    pts && pts.length >= 3 ? 'configuring' : 'drawing',
  }),
  setPlacementPreview: (items) => set({ placementPreview: items || [] }),

  // ── Area selection (right-drag) & persistent groups ─────
  setAreaSelection:   (bounds) => set({ areaSelection: bounds, editingGroupId: null }),
  clearAreaSelection: ()       => set({ areaSelection: null, editingGroupId: null }),

  /**
   * Open a saved group in the AreaInfoPanel. The panel is the same one shown
   * for a fresh right-drag selection but — because `editingGroupId` is set —
   * its "Save" button becomes "Update" and a "Delete" action appears.
   */
  openGroup: (id) => set((s) => {
    const g = s.areaGroups.find((x) => x.id === id)
    if (!g) return {}
    return { areaSelection: g.bounds, editingGroupId: id, highlightedGroupId: id }
  }),

  saveGroup: (name, bounds, color) => set((s) => {
    if (!bounds || !name?.trim()) return {}
    const g = {
      id:    `grp-${Date.now().toString(36)}`,
      name:  name.trim(),
      bounds,
      color: color || '#F5C842',
      createdAt: Date.now(),
      operator:  s.operator,   // aktif operatöre etiketlendi
    }
    const next = [...s.areaGroups, g]
    persistGroups(next)
    return { areaGroups: next, areaSelection: null, editingGroupId: null }
  }),
  /** Overwrite an existing group's bounds/name/color. */
  updateGroup: (id, patch) => set((s) => {
    if (!id || !patch) return {}
    const next = s.areaGroups.map((g) => {
      if (g.id !== id) return g
      const name = patch.name?.trim() || g.name
      return { ...g, ...patch, name }
    })
    persistGroups(next)
    return { areaGroups: next }
  }),
  renameGroup: (id, name) => set((s) => {
    if (!name?.trim()) return {}
    const next = s.areaGroups.map((g) => g.id === id ? { ...g, name: name.trim() } : g)
    persistGroups(next)
    return { areaGroups: next }
  }),
  removeGroup: (id) => set((s) => {
    const next = s.areaGroups.filter((g) => g.id !== id)
    persistGroups(next)
    return {
      areaGroups: next,
      highlightedGroupId: s.highlightedGroupId === id ? null : s.highlightedGroupId,
      editingGroupId:     s.editingGroupId     === id ? null : s.editingGroupId,
      areaSelection:      s.editingGroupId     === id ? null : s.areaSelection,
    }
  }),
  clearAllGroups: () => set(() => {
    persistGroups([])
    return { areaGroups: [], highlightedGroupId: null, editingGroupId: null, areaSelection: null }
  }),
  setHighlightedGroup: (id) => set({ highlightedGroupId: id }),

  // ── Weather (RainViewer) ────────────────────────────────
  toggleWeatherRain:   () => set((s) => ({ weatherRainOn:   !s.weatherRainOn })),
  toggleWeatherClouds: () => set((s) => ({ weatherCloudsOn: !s.weatherCloudsOn })),
  setWeatherOpacity:   (v) => set({ weatherOpacity: Math.max(0.1, Math.min(1, Number(v) || 0.7)) }),
  setWeatherFrameIndex:(i) => set({ weatherFrameIndex: (i === null || i === undefined) ? null : Number(i) }),
  setWeatherAnimating: (v) => set({ weatherAnimating: !!v }),

  // ── Conflict Intel ──────────────────────────────────────
  toggleConflicts:     () => set((s) => ({ conflictsOn: !s.conflictsOn })),
  setConflictsOn:      (v) => set({ conflictsOn: !!v }),
  // Picking a conflict both opens the detail panel AND asks the map to
  // reframe on its geometry. Bumping `conflictFocusTick` makes the
  // MapView effect re-run even if the same conflict is selected again
  // (so clicking the same sidebar card twice re-zooms rather than
  // silently doing nothing).
  selectConflict:      (c) => set((s) => ({
    selectedConflict:  c,
    conflictFocusTick: s.conflictFocusTick + 1,
  })),
  focusConflict:       () => set((s) => ({ conflictFocusTick: s.conflictFocusTick + 1 })),
  clearConflict:       ()  => set({ selectedConflict: null, selectedConflictAsset: null }),

  // ── Ad-hoc "fly the camera here" command ─────────────────
  // Separate from focusConflict because that fits bounds; this one is for
  // pin-point targets (hotspots, individual strategic assets) where the
  // operator just wants the map to land on a single coord at a known zoom.
  // MapView subscribes to `mapFlyTick` so the flyTo re-fires even when the
  // same coord is asked for twice in a row.
  mapFlyTarget: null,     // { lat, lng, zoom? } | null
  mapFlyTick:   0,
  flyToPoint:   (lat, lng, zoom) => set((s) => ({
    mapFlyTarget: { lat, lng, zoom: typeof zoom === 'number' ? zoom : null },
    mapFlyTick:   s.mapFlyTick + 1,
  })),

  // ── Conflict strategic assets (foreign theatre) ──────────
  toggleConflictAssets:        () => set((s) => ({ conflictAssetsOn: !s.conflictAssetsOn })),
  setConflictAssetsOn:         (v) => set({ conflictAssetsOn: !!v }),
  setConflictAssetKindFilter:  (f) => set({ conflictAssetKindFilter: f || 'all' }),
  selectConflictAsset:         (a) => set({ selectedConflictAsset: a }),
  clearConflictAsset:          ()  => set({ selectedConflictAsset: null }),
  setHoveredConflictAsset:     (id) => set({ hoveredConflictAssetId: id || null }),

  // ── Global strategic sites ───────────────────────────────
  toggleGlobalSites:       () => set((s) => ({ globalSitesOn: !s.globalSitesOn })),
  setGlobalSitesOn:        (v) => set({ globalSitesOn: !!v }),
  toggleGlobalOperator:    (opId) => set((s) => {
    const next = new Set(s.globalSiteOperators)
    next.has(opId) ? next.delete(opId) : next.add(opId)
    return { globalSiteOperators: next }
  }),
  setAllGlobalOperators:   (enabled) => set({
    globalSiteOperators: enabled ? new Set(GLOBAL_OPERATOR_ORDER) : new Set(),
  }),
  setGlobalSiteRegion:     (r) => set({ globalSiteRegion: r || 'all' }),
  setGlobalSiteMinImportance: (n) => set({
    globalSiteMinImportance: Math.max(1, Math.min(5, Number(n) || 1)),
  }),
  setGlobalSiteSearch:     (q) => set({ globalSiteSearch: String(q || '') }),
  selectGlobalSite:        (s) => set({ selectedGlobalSite: s }),
  clearGlobalSite:         ()  => set({ selectedGlobalSite: null }),
  setHoveredGlobalSite:    (id) => set({ hoveredGlobalSiteId: id || null }),

  // ── Force deployments (formations + HQs) ─────────────────
  toggleForceDeploy:        () => set((s) => ({ forceDeployOn: !s.forceDeployOn })),
  setForceDeployOn:         (v) => set({ forceDeployOn: !!v }),
  toggleForceDeploySide:    (side) => set((s) => {
    const next = new Set(s.forceDeploySides)
    next.has(side) ? next.delete(side) : next.add(side)
    return { forceDeploySides: next }
  }),
  setForceDeployKindFilter: (f) => set({ forceDeployKindFilter: f || 'all' }),
  setForceDeployMinEchelon: (n) => set({
    forceDeployMinEchelon: Math.max(0, Math.min(6, Number(n) || 0)),
  }),
  setForceDeployScope:      (s) => set({ forceDeployScope: s === 'selected-conflict' ? 'selected-conflict' : 'all' }),
  setForceDeploySearch:     (q) => set({ forceDeploySearch: String(q || '') }),
  selectDeployUnit:         (u) => set({ selectedDeployUnit: u }),
  clearDeployUnit:          ()  => set({ selectedDeployUnit: null }),
  setHoveredDeployUnit:     (id) => set({ hoveredDeployUnitId: id || null }),

  // ── Tehdit projeksiyonu ───────────────────────────────────
  toggleThreatProjection:   () => set((s) => ({ threatProjectionOn: !s.threatProjectionOn })),
  setThreatProjectionOn:    (v) => set({ threatProjectionOn: !!v }),
  toggleThreatSide:         (side) => set((s) => {
    const next = new Set(s.threatProjectionSides)
    next.has(side) ? next.delete(side) : next.add(side)
    return { threatProjectionSides: next }
  }),
  toggleThreatStyle:        (style) => set((s) => {
    const next = new Set(s.threatProjectionStyles)
    next.has(style) ? next.delete(style) : next.add(style)
    return { threatProjectionStyles: next }
  }),
  setThreatIntensity:       (n) => set({
    threatIntensity: Math.max(0, Math.min(1, Number(n) || 0)),
  }),

  // ── Komuta zinciri ────────────────────────────────────────
  toggleKillChain:          () => set((s) => ({ killChainOn: !s.killChainOn })),
  setKillChainOn:           (v) => set({ killChainOn: !!v }),
  setKillChainRange:        (km) => set({
    killChainRangeKm: Math.max(50, Math.min(2000, Number(km) || 400)),
  }),

  setHoveredConflict:  (id) => set({ hoveredConflictId: id || null }),
  setConflictStatusFilter: (f) => set({ conflictStatusFilter: f || 'all' }),

  // ── Sidebar tabs (legacy) ───────────────────────────────
  setSidebarTab:       (t) => set({ sidebarTab: t }),

  // ── Operator + scope aksiyonları ────────────────────────
  /**
   * Operatörü (actor) değiştir. Katalog dışı kod sessizce yoksayılır.
   * Kamera kullanıcı değiştirmediyse yeni operatörün defaultCamera'sına
   * uçar — böylece "ABD oldum" dediğinde harita beklendiği gibi Kuzey
   * Amerika'ya gelir. Değişim çatışma odağında yapılırsa önce çıkar
   * (iki scope birbirine karışmasın diye).
   */
  setOperator:         (code) => set((s) => {
    if (!code || !OPERATORS[code] || code === s.operator) return {}
    persistOperator(code)
    const cam = OPERATORS[code].defaultCamera
    const patch = {
      operator:     code,
      mapFlyTarget: { lat: cam.lat, lng: cam.lng, zoom: cam.zoom },
      mapFlyTick:   s.mapFlyTick + 1,
    }
    // Operatör değişirken conflict focus'u kapat — iki farklı actor
    // arasında çatışma "tarafımız" kavramı tutmaz. Ülke odağı ise
    // operatörden bağımsızdır, korunur.
    if (s.appMode === 'local') {
      patch.appMode          = 'global'
      patch.conflictFocus    = null
      patch.forceDeployScope = 'all'
      patch.activePanelId    = 'intel'
      patch.sidebarTab       = 'intel'
    }
    return patch
  }),

  /**
   * Ülke odağına gir/çık. Conflict focus'dan daha gevşek: kamera
   * yakınlaşır, listeler o ülkeye daralır, ama Global modda kalırız.
   * Çatışma odağı açıkken ülke odağı ayarlanmaz (çatışma zaten iki
   * ülkeyi kapsar — öncelik onda). null → ülke odağı temizlenir.
   *
   * Katman geçişi (F2 IA):
   *   - Ülke odağına girerken aktif panel 'country-brief'e (Durum)
   *     atlar. Böylece "ülkeyi seç, panel katmanı kendiliğinden gelir"
   *     beklentisi karşılanır. Zaten bir country-* panelindeyse
   *     dokunulmaz (kullanıcı Envanter'de kalmak isteyebilir).
   *   - Ülke odağından çıkarken country-* panelindeyse 'intel'e
   *     (Dünya) dön; değilse bulunduğu yerde kal.
   */
  setFocusCountry:     (iso) => set((s) => {
    if (s.appMode === 'local') return {}
    if (!iso) return { focusCountry: null }
    const patch = {
      focusCountry:     iso,
      // Harita animasyonunu tetikle — aynı ülke yeniden seçilse de
      // tick arttığı için FlyToCountry yeniden ateşler.
      countryFocusTick: s.countryFocusTick + 1,
    }
    const onCountryPanel = typeof s.activePanelId === 'string' &&
      s.activePanelId.startsWith('country-')
    if (!onCountryPanel) {
      patch.activePanelId = 'country-brief'
    }
    if (!s.sidebarOpen) patch.sidebarOpen = true
    return patch
  }),
  exitCountryFocus:    () => set((s) => {
    if (!s.focusCountry) return {}
    const patch = { focusCountry: null }
    if (typeof s.activePanelId === 'string' && s.activePanelId.startsWith('country-')) {
      patch.activePanelId = 'intel'
      patch.sidebarTab    = 'intel'
    }
    return patch
  }),

  // ── App mod + panel + Conflict Focus aksiyonları ────────
  setAppMode:          (m) => set({ appMode: m === 'local' ? 'local' : 'global' }),

  /**
   * ActivityBar'ın aktif panelini değiştirir. null → sol raf kapanır.
   * Legacy panel id'leri (platform/field/intel) için sidebarTab'a da
   * aynı değeri yazar — böylece eski Sidebar section guard'ları çalışır.
   */
  setActivePanel:      (id) => set((s) => {
    const patch = { activePanelId: id || null }
    if (id === 'platform' || id === 'field' || id === 'intel') {
      patch.sidebarTab = id
    }
    return patch
  }),

  /**
   * Belirli bir çatışmaya odaklanmayı başlat. Mevcut kamerayı snapshot'la
   * (çıkışta restore için), force-deploy scope'unu 'selected-conflict'e
   * kilitle, default Lokal paneli (Durum) aç. Kamera fly-to'yu MapView
   * mevcut `conflictFocusTick` üzerinden yakalar.
   */
  enterConflictFocus:  (conflict) => set((s) => {
    if (!conflict?.id) return {}
    return {
      appMode:            'local',
      conflictFocus: {
        conflictId: conflict.id,
        enteredAt:  Date.now(),
        prevCenter: s.mapCenter,
        prevZoom:   s.mapZoom,
      },
      selectedConflict:   conflict,
      forceDeployScope:   'selected-conflict',
      conflictFocusTick:  s.conflictFocusTick + 1,
      activePanelId:      'situation',
    }
  }),

  /**
   * Conflict Focus'dan çık. Kamera, giriş anında kaydedilen görünüme
   * flyTo ile uçar; sol raf 'intel' paneline döner; force-deploy scope
   * 'all'a geri döner.
   */
  exitConflictFocus:   () => set((s) => {
    const prev = s.conflictFocus
    const patch = {
      appMode:          'global',
      conflictFocus:    null,
      forceDeployScope: 'all',
      activePanelId:    'intel',
      sidebarTab:       'intel',
    }
    if (prev && Array.isArray(prev.prevCenter)) {
      patch.mapFlyTarget = {
        lat:  prev.prevCenter[0],
        lng:  prev.prevCenter[1],
        zoom: prev.prevZoom,
      }
      patch.mapFlyTick = s.mapFlyTick + 1
    }
    return patch
  }),

  /**
   * Bir çatışma için taraf seçimi. Her çatışma için ayrı saklandığı için
   * başka bir çatışmaya geçmek mevcut seçimi silmez.
   */
  setFocusSide:        (conflictId, side) => set((s) => {
    if (!conflictId) return {}
    const normalized = side === 'A' || side === 'B' ? side : 'neutral'
    return {
      focusSideByConflict: { ...s.focusSideByConflict, [conflictId]: normalized },
    }
  }),

  /**
   * Ülke-odak haritalama toggle'ı. CountryBriefPanel bu ayarları UI'a
   * yansıtır, CountryFocusLayer ise haritada hangi katmanın çizileceğini
   * bu tablodan okur.
   */
  setCountryFocusViewToggle: (key, value) => set((s) => ({
    countryFocusView: {
      ...s.countryFocusView,
      [key]: typeof value === 'boolean' ? value : !s.countryFocusView?.[key],
    },
  })),

  // ── Rezerve slot aksiyonları (F5+ için) ─────────────────
  setChatbotDockOpen:  (v) => set({ chatbotDockOpen: !!v }),
  setPreviewOverlay:   (p) => set({ previewOverlay: p || null }),

  // ── Command Palette ─────────────────────────────────────
  setCommandPaletteOpen:    (v) => set({ commandPaletteOpen: !!v }),
  toggleCommandPalette:     ()  => set((s) => ({ commandPaletteOpen: !s.commandPaletteOpen })),

  // ── İleriye dönük altyapı aksiyonları ──────────────────
  // missions/inventory/sensors için minimum CRUD: panel stub'ları bağ
  // kurmaya başlayabilsin diye. Şekil sabit, iç mantık ileride dolacak.
  addMission:     (m) => set((s) => {
    if (!m?.title) return {}
    const mission = {
      id:       m.id || `msn-${Date.now().toString(36)}`,
      operator: m.operator || s.operator,
      status:   m.status || 'draft',
      steps:    Array.isArray(m.steps) ? m.steps : [],
      ...m,
    }
    return { missions: [...s.missions, mission] }
  }),
  removeMission:  (id) => set((s) => ({ missions: s.missions.filter((m) => m.id !== id) })),
  updateMission:  (id, patch) => set((s) => ({
    missions: s.missions.map((m) => m.id === id ? { ...m, ...patch } : m),
  })),

  setInventory:   (operatorCode, productId, counts) => set((s) => {
    if (!operatorCode || !productId) return {}
    const opInv  = { ...(s.inventory[operatorCode] || {}) }
    opInv[productId] = { ...(opInv[productId] || {}), ...counts }
    return { inventory: { ...s.inventory, [operatorCode]: opInv } }
  }),

  addSensor:      (sensor) => set((s) => {
    if (!sensor?.lat || !sensor?.lng) return {}
    const rec = {
      id:        sensor.id || `snr-${Date.now().toString(36)}`,
      operator:  sensor.operator || s.operator,
      health:    sensor.health || 'ok',
      lastPing:  sensor.lastPing || Date.now(),
      ...sensor,
    }
    return { sensors: [...s.sensors, rec] }
  }),
  removeSensor:   (id) => set((s) => ({ sensors: s.sensors.filter((x) => x.id !== id) })),

  /**
   * Snapshot alır: kamera + aktif katmanlar + scope. İleride paneller
   * "bu bakışa dön" butonu sunabilir. Operatöre etiketlenir.
   */
  saveView: (name) => set((s) => {
    if (!name?.trim()) return {}
    const view = {
      id:        `view-${Date.now().toString(36)}`,
      name:      name.trim(),
      operator:  s.operator,
      createdAt: Date.now(),
      snapshot: {
        mapCenter:         s.mapCenter,
        mapZoom:           s.mapZoom,
        tileStyle:         s.tileStyle,
        focusCountry:      s.focusCountry,
        activeCategories:  [...s.activeCategories],
        activeDrones:      [...s.activeDrones],
        conflictsOn:       s.conflictsOn,
        globalSitesOn:     s.globalSitesOn,
        forceDeployOn:     s.forceDeployOn,
        weatherRainOn:     s.weatherRainOn,
        weatherCloudsOn:   s.weatherCloudsOn,
      },
    }
    const next = [...s.savedViews, view]
    persistSavedViews(next)
    return { savedViews: next }
  }),
  /** Kayıtlı görünümü geri yükle — kamera + katmanlar. */
  restoreView: (id) => set((s) => {
    const v = s.savedViews.find((x) => x.id === id)
    if (!v?.snapshot) return {}
    const snap = v.snapshot
    const patch = {
      mapFlyTarget: { lat: snap.mapCenter[0], lng: snap.mapCenter[1], zoom: snap.mapZoom },
      mapFlyTick:   s.mapFlyTick + 1,
      tileStyle:    snap.tileStyle || s.tileStyle,
      focusCountry: snap.focusCountry || null,
      activeCategories: new Set(snap.activeCategories || []),
      activeDrones:     new Set(snap.activeDrones || []),
      conflictsOn:     !!snap.conflictsOn,
      globalSitesOn:   !!snap.globalSitesOn,
      forceDeployOn:   !!snap.forceDeployOn,
      weatherRainOn:   !!snap.weatherRainOn,
      weatherCloudsOn: !!snap.weatherCloudsOn,
    }
    return patch
  }),
  removeView: (id) => set((s) => {
    const next = s.savedViews.filter((v) => v.id !== id)
    persistSavedViews(next)
    return { savedViews: next }
  }),
  renameView: (id, name) => set((s) => {
    if (!name?.trim()) return {}
    const next = s.savedViews.map((v) => v.id === id ? { ...v, name: name.trim() } : v)
    persistSavedViews(next)
    return { savedViews: next }
  }),
  /**
   * Apply a finalized strategic placement. Each CENTER becomes a single
   * custom node carrying every selected product as a co-located deployment.
   *
   * centers: [{ lat, lng, name, products: [{ productId, rangeKm, label }] }]
   */
  applyPlacement: (centers) => set((s) => {
    if (!centers?.length) return { placementMode: 'idle', placementPolygon: null, placementPreview: [] }
    const newNodes = [...s.customNodes]
    const newFp    = { ...s.facilityProducts }
    const stamp    = Date.now().toString(36)
    const op       = s.operator
    centers.forEach((c, i) => {
      const node = {
        id:        `sp-${stamp}-${i}`,
        name:      c.name,
        lat:       c.lat,
        lng:       c.lng,
        custom:    true,
        strategic: true,
        operator:  op,
      }
      newNodes.push(node)
      const key  = `id:${node.id}`
      const list = newFp[key] ? [...newFp[key]] : []
      ;(c.products || []).forEach((p) => {
        const product = DRONE_PRODUCTS[p.productId]
        if (!product) return
        list.push({
          ...makeDeployment(product, {
            rangeKm: p.rangeKm ?? product.rangeKm,
            status:  'planned',
            note:    'Stratejik yerleştirme',
          }),
          operator: op,
        })
      })
      newFp[key] = list
    })
    persistNodes(newNodes)
    persistFacilityProducts(newFp)
    return {
      customNodes:       newNodes,
      facilityProducts:  newFp,
      placementMode:     'idle',
      placementPolygon:  null,
      placementPreview:  [],
    }
  }),
  setMapView: (center, zoom) => set({ mapCenter: center, mapZoom: zoom }),

  // URL serialization — paylaş / yenile sonrası aynı görüntü açılsın diye.
  //   ?op=TR        → operatör (actor)
  //   ?ctry=UA      → ülke odağı (varsa)
  //   ?c / d / tile → kategoriler, drone'lar, harita stili
  //   ?lat/lng/z    → kamera
  getUrlState: () => {
    const s = get()
    const params = new URLSearchParams()
    if (s.operator && s.operator !== DEFAULT_OPERATOR) {
      params.set('op', s.operator)
    }
    if (s.focusCountry) {
      params.set('ctry', s.focusCountry)
    }
    params.set('c',    [...s.activeCategories].join(','))
    params.set('d',    [...s.activeDrones].join(','))
    params.set('tile', s.tileStyle)
    if (s.mapCenter) {
      params.set('lat', s.mapCenter[0].toFixed(4))
      params.set('lng', s.mapCenter[1].toFixed(4))
    }
    params.set('z', String(s.mapZoom))
    return params.toString()
  },
}))

export default useStore
