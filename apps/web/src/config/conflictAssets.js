/* ── Conflict-theatre strategic asset taxonomy ──────────────────────────
   Deliberately separate from the domestic `CATEGORIES` taxonomy in
   ./categories.js. Those describe Turkey's own inventory (airforce,
   navy, gendarmerie, etc.). This one describes *foreign* strategic
   sites that sit inside the 16 conflict theatres on the intel map —
   things like "rival capital", "proxy-militia stronghold", "strategic
   bomber base", "nuclear facility". Mixing the two would be a mess:
   an Iranian nuclear site has no place in the Türkiye asset filter
   and a Turkish hudut alayı has no place in the Iran–USA theatre.

   Every type here has:
     id          — internal key (used in conflict-asset records)
     label       — full display name (Turkish)
     labelShort  — compact name for chips / tooltips
     glyph       — single-character map marker symbol
     color       — accent colour when the asset isn't side-tinted
     kind        — rough category used for filtering / grouping:
                     'command' | 'kinetic' | 'infra' | 'civic'
     doctrine    — one-line rationale shown in tooltips */

export const CONFLICT_ASSET_TYPES = {
  capital: {
    id: 'capital',
    label: 'Başkent / Yönetim Merkezi',
    labelShort: 'Başkent',
    glyph: '★',
    color: '#E4EAF4',
    kind: 'civic',
    doctrine: 'Ulusal yönetim ve komuta ağırlık merkezi.',
  },
  command: {
    id: 'command',
    label: 'Karargâh / Komuta Merkezi',
    labelShort: 'Karargâh',
    glyph: '◆',
    color: '#C9A236',
    kind: 'command',
    doctrine: 'Operasyonel komuta-kontrol yerleşkesi.',
  },
  airbase: {
    id: 'airbase',
    label: 'Askeri Hava Üssü',
    labelShort: 'Hava Üssü',
    glyph: '✈',
    color: '#E06835',
    kind: 'kinetic',
    doctrine: 'Taktik/stratejik uçak konuşlanma noktası.',
  },
  naval_base: {
    id: 'naval_base',
    label: 'Deniz Üssü',
    labelShort: 'Deniz Üssü',
    glyph: '⚓',
    color: '#4A9EE8',
    kind: 'kinetic',
    doctrine: 'Kıyı ağırlıklı kuvvet ve deniz unsurları konuş noktası.',
  },
  air_defense: {
    id: 'air_defense',
    label: 'Hava Savunma Mevzii',
    labelShort: 'Hava Svn.',
    glyph: '▲',
    color: '#7A7AE8',
    kind: 'kinetic',
    doctrine: 'Uzun/orta menzilli hava savunma sistemleri.',
  },
  missile_site: {
    id: 'missile_site',
    label: 'Füze / Rampa Mevzii',
    labelShort: 'Füze',
    glyph: '►',
    color: '#C04631',
    kind: 'kinetic',
    doctrine: 'Balistik/seyir füze veya çok namlulu roketatar mevzisi.',
  },
  proxy_stronghold: {
    id: 'proxy_stronghold',
    label: 'Vekil Güç Üssü',
    labelShort: 'Vekil Güç',
    glyph: '✦',
    color: '#B84020',
    kind: 'command',
    doctrine: 'Devlet-dışı silahlı grubun kontrol/komuta yoğunluğu.',
  },
  logistics: {
    id: 'logistics',
    label: 'Lojistik / İkmal Noktası',
    labelShort: 'Lojistik',
    glyph: '■',
    color: '#B09340',
    kind: 'infra',
    doctrine: 'Cephane, yakıt veya nakliye ikmal düğümü.',
  },
  energy: {
    id: 'energy',
    label: 'Enerji Altyapısı',
    labelShort: 'Enerji',
    glyph: '⚡',
    color: '#F0C030',
    kind: 'infra',
    doctrine: 'Stratejik enerji üretim/depolama/terminal tesisi.',
  },
  port: {
    id: 'port',
    label: 'Ticari / Stratejik Liman',
    labelShort: 'Liman',
    glyph: '⚓',
    color: '#3068A8',
    kind: 'infra',
    doctrine: 'Ticari yük veya stratejik ikmal limanı.',
  },
  contested_city: {
    id: 'contested_city',
    label: 'Çatışma Altındaki Kent',
    labelShort: 'Kent',
    glyph: '◉',
    color: '#C9A236',
    kind: 'civic',
    doctrine: 'Kontrolü el değiştiren veya aktif çatışma içindeki kent.',
  },
  border_crossing: {
    id: 'border_crossing',
    label: 'Sınır Geçiş Noktası',
    labelShort: 'Geçiş',
    glyph: '◈',
    color: '#9AA6B8',
    kind: 'civic',
    doctrine: 'İnsani/lojistik akışın geçtiği kontrol noktası.',
  },
  turkish_presence: {
    id: 'turkish_presence',
    label: 'Türk Varlığı',
    labelShort: 'TR Üssü',
    glyph: '✚',
    color: '#D85A30',
    kind: 'command',
    doctrine: 'Türkiye Silahlı Kuvvetleri / Bayraktar UAV operasyon üssü.',
  },
}

export const CONFLICT_ASSET_TYPE_ORDER = Object.keys(CONFLICT_ASSET_TYPES)

/* Functional clustering for filter chips. Kept shallow — the goal is
   glance-readability on the detail panel, not a deep taxonomy. */
export const CONFLICT_ASSET_KINDS = [
  { id: 'command', label: 'Komuta',   color: '#C9A236' },
  { id: 'kinetic', label: 'Kinetik',  color: '#C04631' },
  { id: 'infra',   label: 'Altyapı',  color: '#F0C030' },
  { id: 'civic',   label: 'Kent/Sivil', color: '#9AA6B8' },
]

/* Side palette — chromatic opposites, matches ConflictLayer.jsx so the
   same "A = cool steel / B = warm brick" story holds across zones,
   frontlines and individual asset markers. Keep the two in sync. */
export const CONFLICT_SIDE_COLOUR = {
  A: '#5C7FA8',
  B: '#9E5A48',
}

/* Side label — shown on asset popup to clarify who operates/controls
   the site. Each conflict entry in the intel panel can override these
   via `sideLabels` if the generic terms don't fit. */
export const CONFLICT_SIDE_DEFAULT_LABEL = {
  A: 'Taraf A',
  B: 'Taraf B',
}

/* Centralised label for the concept, so the UI never hard-codes a
   string that might drift. */
export const CONFLICT_ASSET_SECTION_LABEL = 'Sahadaki Stratejik Varlıklar'
export const CONFLICT_ASSET_SECTION_LABEL_SHORT = 'Saha Varlıkları'
