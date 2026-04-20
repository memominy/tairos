/* ── Global strategic-sites taxonomy ─────────────────────────────────
   Deliberately a THIRD namespace alongside:
     • src/config/categories.js     → Turkey's domestic inventory
     • src/config/conflictAssets.js → per-conflict theatre sites
     • this file                     → standing, always-visible global
                                       power-projection sites

   Why split again: conflict-assets are scoped to an active conflict
   (they disappear when no conflict is selected), whereas global sites
   are the standing order of battle an intel operator wants on the map
   all the time — US overseas bases, NATO forward sites, chokepoints,
   keystone Russian/Chinese deployments. Mixing them would muddy both
   the filter controls and the narrative.

   The schema for each operator / region / type is UI-facing: colours
   and short labels drive the sidebar chip filters and legend. The
   physical seed data lives in src/data/globalSites.json. */

export const GLOBAL_OPERATORS = {
  US: {
    id: 'US',
    label: 'ABD',
    labelLong: 'Amerika Birleşik Devletleri',
    color: '#3E74B8',
    accent: '#6FA4DC',
    doctrine: 'Küresel güç projeksiyonu — donanma/hava ağı',
  },
  NATO: {
    id: 'NATO',
    label: 'NATO',
    labelLong: 'NATO Ortak Altyapısı',
    color: '#224A8E',
    accent: '#3E74B8',
    doctrine: 'İttifakın ortak komuta/kontrol ve müşterek üsleri',
  },
  UK: {
    id: 'UK',
    label: 'İng.',
    labelLong: 'Birleşik Krallık',
    color: '#5A7FAE',
    accent: '#8BA5C6',
    doctrine: 'Dünya çapında kalan Britanya deniz/hava üsleri',
  },
  FRANCE: {
    id: 'FRANCE',
    label: 'FR',
    labelLong: 'Fransa',
    color: '#4E6FA4',
    accent: '#7896C3',
    doctrine: 'Sahra/Hint Ok./Karayip ön konuşlanmaları',
  },
  RUSSIA: {
    id: 'RUSSIA',
    label: 'RUS',
    labelLong: 'Rusya Federasyonu',
    color: '#A04A3A',
    accent: '#C46D5B',
    doctrine: 'Yakın çevre + Suriye/Arktik yoğunlaşması',
  },
  CHINA: {
    id: 'CHINA',
    label: 'ÇİN',
    labelLong: 'Çin Halk Cumhuriyeti',
    color: '#B8743A',
    accent: '#D89459',
    doctrine: 'İnci Dizisi — Hint Ok./Afrika lojistiği',
  },
  TURKEY: {
    id: 'TURKEY',
    label: 'TR',
    labelLong: 'Türkiye — Yurtdışı Konuşlanma',
    color: '#D85A30',
    accent: '#EF7F52',
    doctrine: 'Somali/Katar/Libya/Azerbaycan ön üsleri',
  },
  ALLY: {
    id: 'ALLY',
    label: 'MÜT.',
    labelLong: 'ABD-Müttefik',
    color: '#3E8C6C',
    accent: '#5BB48E',
    doctrine: 'Japonya/G.Kore/Avustralya/Körfez eş-konuşlanmalar',
  },
  UN: {
    id: 'UN',
    label: 'BM',
    labelLong: 'Birleşmiş Milletler',
    color: '#5AA3C0',
    accent: '#83C1D9',
    doctrine: 'Sabit görev karargâhları (UNIFIL, UNDOF vd.)',
  },
  STRATEGIC: {
    id: 'STRATEGIC',
    label: 'STR.',
    labelLong: 'Stratejik Coğrafi Nokta',
    color: '#A484C0',
    accent: '#BFA5D4',
    doctrine: 'Boğaz/kanal/geçit — kimsenin tekelinde değil',
  },
}

export const GLOBAL_OPERATOR_ORDER = [
  'US', 'NATO', 'UK', 'FRANCE', 'TURKEY', 'ALLY', 'UN',
  'RUSSIA', 'CHINA', 'STRATEGIC',
]

/* Region filter — kept shallow on purpose. A six-way split is enough
   for "zoom to an area" thinking, and the seventh (`SEA`) catches
   chokepoints that don't cleanly belong to a continent. */
export const GLOBAL_REGIONS = {
  EUROPE:      { id: 'EUROPE',      label: 'Avrupa' },
  MIDDLE_EAST: { id: 'MIDDLE_EAST', label: 'Ortadoğu' },
  AFRICA:      { id: 'AFRICA',      label: 'Afrika' },
  ASIA_PAC:    { id: 'ASIA_PAC',    label: 'Asya-Pasifik' },
  AMERICAS:    { id: 'AMERICAS',    label: 'Amerikalar' },
  ARCTIC:      { id: 'ARCTIC',      label: 'Arktik' },
  SEA:         { id: 'SEA',         label: 'Açık Deniz' },
}

export const GLOBAL_REGION_ORDER = [
  'EUROPE', 'MIDDLE_EAST', 'AFRICA', 'ASIA_PAC', 'AMERICAS', 'ARCTIC', 'SEA',
]

/* Site-type metadata. Extends the conflict-asset taxonomy with four
   global-only types (intel, space, chokepoint, nuclear). We keep them
   in a standalone map so changes here don't ripple into theatre assets. */
export const GLOBAL_SITE_TYPES = {
  airbase:          { label: 'Hava Üssü',            labelShort: 'Hava',      glyph: '✈', kind: 'kinetic' },
  naval_base:       { label: 'Deniz Üssü',           labelShort: 'Deniz',     glyph: '⚓', kind: 'kinetic' },
  command:          { label: 'Karargâh',             labelShort: 'Karargâh',  glyph: '◆', kind: 'command' },
  logistics:        { label: 'Lojistik Merkezi',     labelShort: 'Lojistik',  glyph: '■', kind: 'infra'   },
  missile_site:     { label: 'Füze / Rampa',         labelShort: 'Füze',      glyph: '►', kind: 'kinetic' },
  air_defense:      { label: 'Hava Savunma',         labelShort: 'Hava Svn.', glyph: '▲', kind: 'kinetic' },
  energy:           { label: 'Enerji Altyapısı',     labelShort: 'Enerji',    glyph: '⚡', kind: 'infra'   },
  port:             { label: 'Stratejik Liman',      labelShort: 'Liman',     glyph: '⚓', kind: 'infra'   },
  border_crossing:  { label: 'Sınır Geçiş',          labelShort: 'Geçiş',     glyph: '◈', kind: 'civic'   },
  capital:          { label: 'Başkent',              labelShort: 'Başkent',   glyph: '★', kind: 'civic'   },
  contested_city:   { label: 'Çatışmalı Kent',       labelShort: 'Kent',      glyph: '◉', kind: 'civic'   },
  proxy_stronghold: { label: 'Vekil Güç Üssü',       labelShort: 'Vekil',     glyph: '✦', kind: 'command' },
  intel:            { label: 'SIGINT / Dinleme',     labelShort: 'SIGINT',    glyph: '◎', kind: 'command' },
  space:            { label: 'Uzay / Fırlatma',      labelShort: 'Uzay',      glyph: '✧', kind: 'command' },
  chokepoint:       { label: 'Stratejik Geçit',      labelShort: 'Geçit',     glyph: '⛋', kind: 'civic'   },
  nuclear:          { label: 'Nükleer Tesis',        labelShort: 'Nükleer',   glyph: '☢', kind: 'kinetic' },
}

/* Importance threshold helper — used by the sidebar "min importance"
   slider to thin low-value markers at a glance. */
export const IMPORTANCE_LABELS = {
  1: 'ikincil',
  2: 'standart',
  3: 'orta',
  4: 'yüksek',
  5: 'stratejik',
}

export const GLOBAL_SITES_SECTION_LABEL       = 'Küresel Stratejik Üsler'
export const GLOBAL_SITES_SECTION_LABEL_SHORT = 'Küresel Üsler'
