/* ── Kuvvet Konuşlanması taxonomy ────────────────────────────────────
   Fourth namespace in the intel stack — the first three being:
     • src/config/categories.js     → Turkey's domestic inventory
     • src/config/conflictAssets.js → per-conflict strategic sites
                                       (facility-level: base, silo, port)
     • src/config/globalSites.js    → standing global power-projection sites
     • THIS file                    → in-theatre MILITARY FORMATIONS and
                                       their headquarters (brigades, corps,
                                       air wings, fleets, …)

   Why a separate namespace: conflict-assets (port, airfield, silo) are
   permanent physical installations — they don't move with the campaign.
   Force deployments ARE the campaign: a Russian Combined Arms Army's
   HQ sits in Mariupol today, Donetsk last month. They're side-tagged
   (A / B), echelon-graded (brigade → army group), and filter targets.

   The visual vocabulary is NATO-APP6-inspired — a framed shield
   carrying an arm-symbol glyph, side-tinted colour, echelon pips at
   the top. We don't try to be strict APP6 (operators on the product
   don't all speak that language), but the reading order (echelon →
   branch → name) is the same.

   Seed data lives in src/data/forceDeployments.json. */

/* UNIT TYPES — "what the formation does". The `kind` bucket groups
   these for the sidebar kind-filter chips so the operator can mute
   the noisy ones (e.g. irregular proxies) without per-type surgery. */
export const UNIT_TYPES = {
  hq: {
    id: 'hq',
    label: 'Karargâh',
    short: 'KRG',
    glyph: '★',
    color: '#E0A42C',
    kind: 'command',
    doctrine: 'Stratejik ya da operasyonel komuta merkezi',
  },
  inf: {
    id: 'inf',
    label: 'Piyade',
    short: 'PYD',
    glyph: '╳',
    color: '#6E8A5C',
    kind: 'combat',
    doctrine: 'Klasik yaya piyade birliği',
  },
  mech: {
    id: 'mech',
    label: 'Mekanize',
    short: 'MKZ',
    glyph: '⫶',
    color: '#8B7A4A',
    kind: 'combat',
    doctrine: 'Zırhlı muharebe aracı üzerinde hareketli piyade',
  },
  armor: {
    id: 'armor',
    label: 'Zırhlı',
    short: 'ZRH',
    glyph: '◯',
    color: '#B3693A',
    kind: 'combat',
    doctrine: 'Ana muharebe tankı ağırlıklı zırhlı formasyon',
  },
  abn: {
    id: 'abn',
    label: 'Hava İndirme',
    short: 'HVİ',
    glyph: '⌒',
    color: '#A8774A',
    kind: 'combat',
    doctrine: 'Paraşüt / hava indirme / hava taşımalı',
  },
  sof: {
    id: 'sof',
    label: 'Özel Kuvvetler',
    short: 'ÖKK',
    glyph: '⁑',
    color: '#C04631',
    kind: 'combat',
    doctrine: 'Doğrudan eylem + derin keşif + vekâlet eğitimi',
  },
  art: {
    id: 'art',
    label: 'Topçu',
    short: 'TPÇ',
    glyph: '●',
    color: '#B87035',
    kind: 'fires',
    doctrine: 'Tabur/alay seviyesi toplu ateş desteği',
  },
  airdef: {
    id: 'airdef',
    label: 'Hava Savunma',
    short: 'HVS',
    glyph: '△',
    color: '#8C6BB3',
    kind: 'fires',
    doctrine: 'SAM bataryası / radar mevzisi',
  },
  airwing: {
    id: 'airwing',
    label: 'Hava Filosu',
    short: 'AVY',
    glyph: '✈',
    color: '#3E74B8',
    kind: 'air',
    doctrine: 'Sabit kanat muharip filo',
  },
  heli: {
    id: 'heli',
    label: 'Helikopter',
    short: 'HEL',
    glyph: '⊛',
    color: '#4A9080',
    kind: 'air',
    doctrine: 'Taktik helikopter tugayı',
  },
  uav: {
    id: 'uav',
    label: 'İHA / SİHA',
    short: 'İHA',
    glyph: '◬',
    color: '#6FA4DC',
    kind: 'air',
    doctrine: 'İHA/SİHA üssü',
  },
  naval: {
    id: 'naval',
    label: 'Donanma',
    short: 'DNZ',
    glyph: '⚓',
    color: '#3E74B8',
    kind: 'naval',
    doctrine: 'Filo karargâhı ya da ana üs',
  },
  proxy: {
    id: 'proxy',
    label: 'Vekil / Paralı',
    short: 'VKL',
    glyph: '◈',
    color: '#9E5A48',
    kind: 'irregular',
    doctrine: 'Vekâlet / PMC / paralı güç',
  },
  irreg: {
    id: 'irreg',
    label: 'Gayrinizami',
    short: 'GNZ',
    glyph: '▲',
    color: '#8C6BB3',
    kind: 'irregular',
    doctrine: 'Hücre / milis / partizan',
  },
}

export const UNIT_TYPE_ORDER = [
  'hq', 'inf', 'mech', 'armor', 'abn', 'sof',
  'art', 'airdef', 'airwing', 'heli', 'uav', 'naval',
  'proxy', 'irreg',
]

/* Kind clusters — sidebar chip-filter row. Each kind collapses a
   handful of unit types so the top-level filter stays shallow. */
export const UNIT_KINDS = [
  { id: 'all',       label: 'Tümü',    color: '#9AA6B8' },
  { id: 'command',   label: 'Komuta',  color: '#E0A42C' },
  { id: 'combat',    label: 'Muharip', color: '#B87035' },
  { id: 'fires',     label: 'Ateş',    color: '#C04631' },
  { id: 'air',       label: 'Hava',    color: '#3E74B8' },
  { id: 'naval',     label: 'Deniz',   color: '#3E74B8' },
  { id: 'irregular', label: 'Gayr.',   color: '#8C6BB3' },
]

/* ECHELONS — unit size. Drives both the pip badge on the marker
   (visual reading: bigger pip string → bigger formation) AND the
   marker's overall size (bigger formations get a larger chip). */
export const ECHELONS = {
  teatre:    { id: 'teatre',    label: 'Tiyatro / GKB', short: 'GKB',  pips: '★★', weight: 6 },
  army:      { id: 'army',      label: 'Ordu',          short: 'ORD',  pips: '✕✕✕', weight: 5 },
  corps:     { id: 'corps',     label: 'Kolordu',       short: 'KOL',  pips: '✕✕',  weight: 4 },
  division:  { id: 'division',  label: 'Tümen',         short: 'TÜM',  pips: '✕',   weight: 3 },
  brigade:   { id: 'brigade',   label: 'Tugay',         short: 'TUG',  pips: '❚❚❚',  weight: 2 },
  regiment:  { id: 'regiment',  label: 'Alay',          short: 'ALY',  pips: '❚❚',   weight: 1.5 },
  battalion: { id: 'battalion', label: 'Tabur',         short: 'TBR',  pips: '❚',    weight: 1 },
  wing:      { id: 'wing',      label: 'Filo / Grup',   short: 'FLO',  pips: '◆',   weight: 2.5 },
}

export const ECHELON_ORDER = [
  'teatre', 'army', 'corps', 'division', 'wing',
  'brigade', 'regiment', 'battalion',
]

/* Side A/B chromatic pair — lifted from the conflict palette so the
   ForceDeploymentLayer reads as a continuation of the conflict layer.
   Importing from '../config/conflictAssets' causes a cycle with the
   ConflictDetailPanel during some test harnesses, so we keep the
   raw values here too. */
export const FORCE_SIDE_COLOUR = {
  A: '#5C7FA8',  // cool steel
  B: '#B3523E',  // warm brick
}

/* Section + header labels — centralised so sidebar + map legend +
   operator briefings use the same vocabulary. */
export const FORCE_SECTION_LABEL      = 'Kuvvet Konuşlanması'
export const FORCE_SECTION_LABEL_SHORT = 'Kuvvet'

/* ── THREAT PROFILES ─────────────────────────────────────────────
   Operational reach + engagement envelope per unit type. Drives the
   Tehdit Projeksiyonu layer: when toggled, each formation projects
   a coloured ring on the map showing its "don't-stand-here" radius.
   Numbers are deliberately generic OSINT-composite per formation
   class — the seed can override individual units via `threatKm`.

   Style buckets:
     • sam     — air defence dome (purple, heaviest visual)
     • air     — fixed/rotary wing combat radius
     • naval   — sea-control radius
     • fires   — artillery + MLRS
     • special — SOF / deep recon
     • ground  — ATGM / tank direct-fire reach
     • passive — not kinetic (HQ), draws nothing

   The UI kind filter (SAM / Ateş / Hava / Deniz / Kara) maps 1:1
   to these styles so the operator can mute the noisy ones without
   per-type surgery. */
export const THREAT_PROFILES = {
  hq:      { rangeKm: 0,    label: 'Komuta — kinetik değil',                  style: 'passive' },
  inf:     { rangeKm: 8,    label: 'Piyade — küçük silah + ATGM',             style: 'ground'  },
  mech:    { rangeKm: 15,   label: 'Mekanize — IFV + ATGM menzili',           style: 'ground'  },
  armor:   { rangeKm: 20,   label: 'Zırhlı — tank + yakın koruma',            style: 'ground'  },
  abn:     { rangeKm: 40,   label: 'Hava indirme — hızlı açılma dairesi',     style: 'ground'  },
  sof:     { rangeKm: 150,  label: 'Özel Kuvvetler — keşif + doğrudan eylem', style: 'special' },
  art:     { rangeKm: 40,   label: 'Topçu — alan ateşi menzili',              style: 'fires'   },
  airdef:  { rangeKm: 150,  label: 'HVS — hava savunma dome (tipik)',         style: 'sam'     },
  airwing: { rangeKm: 800,  label: 'Hava filosu — muharebe yarıçapı',         style: 'air'     },
  heli:    { rangeKm: 250,  label: 'Helikopter — taarruz yarıçapı',           style: 'air'     },
  uav:     { rangeKm: 1200, label: 'SİHA — uzun mesafe görev yarıçapı',       style: 'air'     },
  naval:   { rangeKm: 600,  label: 'Donanma — deniz kontrol menzili',         style: 'naval'   },
  proxy:   { rangeKm: 30,   label: 'Vekil — hafif silahlı hücre',             style: 'ground'  },
  irreg:   { rangeKm: 20,   label: 'Gayrinizami — milis etki alanı',          style: 'ground'  },
}

/* ── NAMED SAM SYSTEMS ──────────────────────────────────────────
   For airdef units where the name / formation / note contains a
   recognisable system code, we plot the REAL system dome instead
   of the generic airdef ring. The operator-visible payoff: an
   entry called "S-400 Moskva Bölgesi" draws a 400 km circle, a
   "Pantsir-S1 mevzisi" only draws 20 km — the map stops lying
   about engagement reach. Match is longest-first so "S-500"
   beats "S-400" beats "S-300" when multiple codes co-occur. */
export const SAM_SYSTEMS = {
  'S-500':          { rangeKm: 600,  label: 'S-500 Prometheus' },
  'S-400':          { rangeKm: 400,  label: 'S-400 Triumf' },
  'S-300':          { rangeKm: 200,  label: 'S-300' },
  'Pantsir':        { rangeKm: 20,   label: 'Pantsir-S1' },
  'SA-22':          { rangeKm: 20,   label: 'Pantsir-S1 (SA-22)' },
  'S-200':          { rangeKm: 300,  label: 'S-200 Vega' },
  'BUK':            { rangeKm: 50,   label: 'BUK-M3' },
  'TOR':            { rangeKm: 16,   label: 'TOR-M2' },
  'SAMP/T':         { rangeKm: 120,  label: 'SAMP/T Mamba' },
  'Sky Sabre':      { rangeKm: 45,   label: 'Sky Sabre (CAMM)' },
  'Barak':          { rangeKm: 150,  label: 'Barak 8' },
  'SM-3':           { rangeKm: 700,  label: 'SM-3 Block II (ABM)' },
  'SM-6':           { rangeKm: 240,  label: 'SM-6 ERAM' },
  'Patriot':        { rangeKm: 160,  label: 'MIM-104 Patriot' },
  'THAAD':          { rangeKm: 200,  label: 'THAAD (ABM)' },
  'NASAMS':         { rangeKm: 50,   label: 'NASAMS' },
  'IRIS-T':         { rangeKm: 40,   label: 'IRIS-T SLM' },
  'Iron Dome':      { rangeKm: 70,   label: 'Iron Dome' },
  "David's Sling":  { rangeKm: 300,  label: "David's Sling" },
  'Arrow':          { rangeKm: 2400, label: 'Arrow 3 (ABM)' },
  'HQ-19':          { rangeKm: 600,  label: 'HQ-19 (ABM)' },
  'HQ-9':           { rangeKm: 200,  label: 'HQ-9' },
  'Bavar':          { rangeKm: 200,  label: 'Bavar-373' },
  'SİPER':          { rangeKm: 150,  label: 'SİPER (TUR)' },
  'HİSAR':          { rangeKm: 100,  label: 'HİSAR-A+ (TUR)' },
  'Aegis':          { rangeKm: 180,  label: 'Aegis SPY-1 (deniz)' },
}

const SAM_SYSTEM_KEYS = Object.keys(SAM_SYSTEMS)
  .sort((a, b) => b.length - a.length)  // longest first so "S-500" beats "S-300"

/** Resolve best-match SAM system from a unit's name + formation +
 * note fields. Returns { rangeKm, label } or null if no match. */
export function resolveSamSystem(unit) {
  if (!unit) return null
  const hay = `${unit.name || ''} ${unit.formation || ''} ${unit.note || ''}`.toLowerCase()
  for (const key of SAM_SYSTEM_KEYS) {
    if (hay.includes(key.toLowerCase())) return SAM_SYSTEMS[key]
  }
  return null
}

/* Style palette — colour + label shown on the threat ring + legend. */
export const THREAT_STYLES = {
  sam:     { id: 'sam',     color: '#A084E8', label: 'HVS Domu',      short: 'HVS' },
  air:     { id: 'air',     color: '#5FA8D3', label: 'Hava Tehditi',  short: 'HAV' },
  naval:   { id: 'naval',   color: '#3E74B8', label: 'Deniz Tehditi', short: 'DNZ' },
  fires:   { id: 'fires',   color: '#E0A42C', label: 'Ateş Menzili',  short: 'ATŞ' },
  special: { id: 'special', color: '#C04631', label: 'ÖKK Etki',      short: 'ÖKK' },
  ground:  { id: 'ground',  color: '#8B6A4A', label: 'Kara Tehditi',  short: 'KRA' },
}

export const THREAT_STYLE_ORDER = ['sam', 'air', 'naval', 'fires', 'special', 'ground']
