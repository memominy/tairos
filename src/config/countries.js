/**
 * Ülke (country) registry — ISO 3166-1 alpha-2 kodları.
 *
 * Sentinel iki ayrı ülke-kavramıyla çalışır:
 *
 *   1. OPERATOR  → "ben kimim?" (operators.js)
 *      Oynanabilir tarafların kataloğu. Operatör kataloğu sınırlıdır.
 *
 *   2. COUNTRY   → "haritadaki herhangi bir ülke"
 *      Ülke odağı (focusCountry), conflict taraf etiketleri, global üs
 *      sahipleri gibi yerlerde kullanılır. Buradaki liste daha geniş;
 *      sadece "mevcut" değil, "bahsedilmesi olası" tüm ülkeler.
 *
 * Bu registry operatorlerden TÜREMEZ çünkü bir ülke operatör olmadan da
 * haritada var olur (Suriye operatör değil ama çatışma üyesi; Gürcistan
 * odaklanabilir). Operatör kataloğunda olan kodlar burada da var —
 * tutarlılık için.
 *
 * Şema:
 *   code      : ISO alpha-2 (büyük harf)
 *   label     : Türkçe ad (UI'da gösterilen)
 *   flag      : emoji bayrak
 *   region    : geniş bölge etiketi ('europe','me','asia','americas','africa','oceania')
 *   bounds    : opsiyonel [[sw_lat, sw_lng],[ne_lat, ne_lng]] — ülke odağında kamera fitBounds'a geçer
 *   rivals    : opsiyonel [ISO, ...] — ülkenin başlıca rakipleri. CountryRivalsPanel
 *               bu listeyi tüketir; rakip panelinde her biri için düşman üsleri ve
 *               (varsa) iki ülkeyi birleştiren çatışma yüzeye çıkar.
 *   conflicts : opsiyonel [conflictId, ...] — bu ülkenin dahil olduğu conflicts.json
 *               kayıtları. CountryRivalsPanel bu alandan side-picker'ı türetir.
 *
 * Eksik ülke eklemek tek satır — format aynı olduğu sürece UI otomatik alır.
 */

export const COUNTRIES = {
  /* ── Operatörler (aynı zamanda ülke) ─────────────────── */
  TR: {
    code: 'TR', label: 'Türkiye', flag: '🇹🇷', region: 'me',
    bounds: [[35.8, 25.6],[42.1, 44.8]],
    rivals: ['GR','SY','AM','RU'],
    conflicts: ['syria-civil','aegean-easternmed','cyprus-division'],
  },
  UA: {
    code: 'UA', label: 'Ukrayna', flag: '🇺🇦', region: 'europe',
    bounds: [[44.4, 22.1],[52.4, 40.2]],
    rivals: ['RU','BY'],
    conflicts: ['ukraine-russia'],
  },
  US: {
    code: 'US', label: 'ABD', flag: '🇺🇸', region: 'americas',
    bounds: [[24.4,-124.8],[49.4,-66.9]],
    rivals: ['CN','RU','IR','KP'],
    conflicts: ['iran-usa','south-china-sea'],
  },
  FR: {
    code: 'FR', label: 'Fransa', flag: '🇫🇷', region: 'europe',
    bounds: [[41.3,-5.2],[51.1, 9.6]],
    rivals: ['RU'],
  },
  CN: {
    code: 'CN', label: 'Çin', flag: '🇨🇳', region: 'asia',
    bounds: [[18.1, 73.5],[53.6,134.8]],
    rivals: ['US','IN','TW','JP'],
    conflicts: ['taiwan-strait','south-china-sea'],
  },

  /* ── Çatışma / komşuluk bağlamında sık geçen ülkeler ── */
  RU: {
    code: 'RU', label: 'Rusya', flag: '🇷🇺', region: 'europe',
    bounds: [[41.2, 19.6],[81.9,180]],
    rivals: ['UA','US','PL','GE'],
    conflicts: ['ukraine-russia','transnistria'],
  },
  SY: {
    code: 'SY', label: 'Suriye', flag: '🇸🇾', region: 'me',
    bounds: [[32.3, 35.7],[37.3, 42.4]],
    rivals: ['TR','IL'],
    conflicts: ['syria-civil'],
  },
  IR: {
    code: 'IR', label: 'İran', flag: '🇮🇷', region: 'me',
    bounds: [[25.1, 44.0],[39.8, 63.3]],
    rivals: ['US','IL','SA'],
    conflicts: ['iran-usa','iraq-proxy'],
  },
  IQ: { code: 'IQ', label: 'Irak', flag: '🇮🇶', region: 'me', bounds: [[29.1, 38.8],[37.4, 48.6]],
    rivals: ['IR'], conflicts: ['iraq-proxy'] },
  IL: {
    code: 'IL', label: 'İsrail', flag: '🇮🇱', region: 'me',
    bounds: [[29.5, 34.3],[33.3, 35.9]],
    rivals: ['IR','LB','SY','PS'],
    conflicts: ['gaza-israel','lebanon-israel'],
  },
  LB: { code: 'LB', label: 'Lübnan', flag: '🇱🇧', region: 'me', bounds: [[33.1, 35.1],[34.7, 36.6]],
    rivals: ['IL'], conflicts: ['lebanon-israel'] },
  PS: { code: 'PS', label: 'Filistin', flag: '🇵🇸', region: 'me',
    bounds: [[31.22, 34.20],[32.55, 35.58]],
    rivals: ['IL'], conflicts: ['gaza-israel'] },
  EG: { code: 'EG', label: 'Mısır', flag: '🇪🇬', region: 'me', bounds: [[22.0, 24.7],[31.7, 36.9]] },
  SA: { code: 'SA', label: 'S. Arabistan', flag: '🇸🇦', region: 'me', bounds: [[16.3, 34.6],[32.2, 55.7]],
    rivals: ['IR','YE'] },
  YE: { code: 'YE', label: 'Yemen', flag: '🇾🇪', region: 'me',
    bounds: [[12.11, 41.81],[19.00, 54.54]],
    rivals: ['SA','IL','US'], conflicts: ['yemen'] },
  AF: { code: 'AF', label: 'Afganistan', flag: '🇦🇫', region: 'asia' },
  PK: { code: 'PK', label: 'Pakistan', flag: '🇵🇰', region: 'asia',
    rivals: ['IN'] },
  IN: { code: 'IN', label: 'Hindistan', flag: '🇮🇳', region: 'asia',
    rivals: ['PK','CN'], conflicts: ['india-china-border'] },
  KR: { code: 'KR', label: 'G. Kore', flag: '🇰🇷', region: 'asia',
    rivals: ['KP'] },
  KP: { code: 'KP', label: 'K. Kore', flag: '🇰🇵', region: 'asia',
    rivals: ['US','KR'] },
  JP: { code: 'JP', label: 'Japonya', flag: '🇯🇵', region: 'asia',
    rivals: ['CN','KP','RU'] },
  TW: { code: 'TW', label: 'Tayvan', flag: '🇹🇼', region: 'asia',
    rivals: ['CN'], conflicts: ['taiwan-strait'] },

  GE: { code: 'GE', label: 'Gürcistan', flag: '🇬🇪', region: 'europe',
    rivals: ['RU'] },
  AM: { code: 'AM', label: 'Ermenistan', flag: '🇦🇲', region: 'europe',
    rivals: ['AZ','TR'] },
  AZ: { code: 'AZ', label: 'Azerbaycan', flag: '🇦🇿', region: 'europe',
    rivals: ['AM'] },
  BY: { code: 'BY', label: 'Belarus', flag: '🇧🇾', region: 'europe',
    rivals: ['UA','PL'] },
  PL: { code: 'PL', label: 'Polonya', flag: '🇵🇱', region: 'europe',
    rivals: ['RU','BY'] },
  RO: { code: 'RO', label: 'Romanya', flag: '🇷🇴', region: 'europe',
    rivals: ['RU'] },
  MD: { code: 'MD', label: 'Moldova', flag: '🇲🇩', region: 'europe',
    rivals: ['RU'] },
  GR: { code: 'GR', label: 'Yunanistan', flag: '🇬🇷', region: 'europe',
    rivals: ['TR'] },
  BG: { code: 'BG', label: 'Bulgaristan', flag: '🇧🇬', region: 'europe' },
  DE: { code: 'DE', label: 'Almanya', flag: '🇩🇪', region: 'europe' },
  UK: { code: 'UK', label: 'İngiltere', flag: '🇬🇧', region: 'europe' },
  IT: { code: 'IT', label: 'İtalya', flag: '🇮🇹', region: 'europe' },
  ES: { code: 'ES', label: 'İspanya', flag: '🇪🇸', region: 'europe' },

  LY: { code: 'LY', label: 'Libya', flag: '🇱🇾', region: 'africa' },
  SD: { code: 'SD', label: 'Sudan', flag: '🇸🇩', region: 'africa' },
  ET: { code: 'ET', label: 'Etiyopya', flag: '🇪🇹', region: 'africa' },
  SO: { code: 'SO', label: 'Somali', flag: '🇸🇴', region: 'africa' },
  NG: { code: 'NG', label: 'Nijerya', flag: '🇳🇬', region: 'africa' },
}

/** Bölgelere göre gruplama — switcher/ülke odağı UI'ında liste
 *  oluşturulurken kullanılır. 'other' regions listede yoksa region
 *  'etc' altına düşer. */
export const COUNTRIES_BY_REGION = Object.values(COUNTRIES).reduce((acc, c) => {
  const region = c.region || 'etc'
  if (!acc[region]) acc[region] = []
  acc[region].push(c)
  return acc
}, {})

export const REGION_LABELS = {
  europe:   'Avrupa',
  me:       'Orta Doğu',
  asia:     'Asya',
  americas: 'Amerika',
  africa:   'Afrika',
  oceania:  'Okyanusya',
  etc:      'Diğer',
}

/** ISO kodundan ülke meta'sını güvenli bir şekilde al. Yoksa basit
 *  bir placeholder objesi döner — UI kırılmasın. */
export function getCountry(code) {
  if (!code) return null
  return COUNTRIES[code] || { code, label: code, flag: '🏳️', region: 'etc' }
}

/** Verilen koda ait bayrak — yoksa boş string. */
export function flagOf(code) {
  return code && COUNTRIES[code]?.flag ? COUNTRIES[code].flag : ''
}

/** Kataloğun alfabetik sıralı listesi — switcher/arama'da kullanılır. */
export function countryList() {
  return Object.values(COUNTRIES).sort((a, b) =>
    a.label.localeCompare(b.label, 'tr')
  )
}

/** Ülkenin rakipleri — config.rivals'ı ISO meta'sına çevirir.
 *  Meta yoksa placeholder döner (UI kırılmasın). */
export function rivalsOf(code) {
  const c = COUNTRIES[code]
  if (!c?.rivals?.length) return []
  return c.rivals.map((r) => getCountry(r)).filter(Boolean)
}

/** Ülkenin dahil olduğu çatışmaların id listesi. */
export function conflictIdsOf(code) {
  return COUNTRIES[code]?.conflicts || []
}
