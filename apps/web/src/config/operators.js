/**
 * Operator (actor) kataloğu.
 *
 * Sentinel tek bir ülkeye bağlı değil — "operatör" kim olarak oynadığımızı
 * söyler. Bu dosya oynanabilir operatörlerin TEK kaynağıdır; ekleme tek
 * satırla olur ve dosya şemasını değiştirmeden yeni ülke katılır.
 *
 * Default: TR (Türkiye). Değiştirmek için store'da setOperator(code)
 * çağrılır; initialState o operatörün defaultCamera'sını alır.
 *
 * Şema:
 *   code               : 'TR'              — ISO 3166-1 alpha-2 kodu
 *   label              : 'Türkiye'         — panellerde gösterilen ad
 *   flag               : '🇹🇷'             — TopBar chip'inde
 *   shortLabel         : 'TR'              — dar alanlarda
 *   defaultCamera      : { lat, lng, zoom } — boş dünyada kamera açılışı
 *   systemsCatalog     : ['nova','iris','radar'] — operatörün kullandığı
 *                        drone ürün id'leri (DRONE_PRODUCTS anahtarları).
 *                        Bugün TR için tam liste; başkaları için kırpılmış
 *                        veya genişletilmiş olabilir. Kataloğu UI seviyesinde
 *                        filtre olarak kullanırız — store veri değil.
 *   doctrine           : 'NATO' | 'CSTO' | 'non-aligned' | … (rozet)
 *   description        : kısa açıklama — switcher modal'ında görünür
 *
 * İleride eklenecek şema parçaları (bugün yok, plan):
 *   - allyCodes / adversaryCodes (dost/düşman ön tanımı)
 *   - defaultNodes (operatör-sahibi ileri mevzi şablonu)
 *   - restrictedCategories (bazı varlıkları gizleme hakkı)
 *   - currency / distanceUnit / timeZone
 */

export const OPERATORS = {
  TR: {
    code:        'TR',
    label:       'Türkiye',
    shortLabel:  'TR',
    flag:        '🇹🇷',
    defaultCamera: { lat: 39.0, lng: 35.5, zoom: 6 },
    systemsCatalog: ['nova', 'iris', 'radar'],
    doctrine:    'NATO',
    description: 'Varsayılan operatör — doğu Akdeniz + Orta Doğu bakışı',
  },

  UA: {
    code:        'UA',
    label:       'Ukrayna',
    shortLabel:  'UA',
    flag:        '🇺🇦',
    defaultCamera: { lat: 49.0, lng: 32.0, zoom: 6 },
    systemsCatalog: ['nova', 'iris', 'radar'],
    doctrine:    'NATO-partner',
    description: 'Doğu Avrupa — aktif çatışma cephesi',
  },

  US: {
    code:        'US',
    label:       'ABD',
    shortLabel:  'US',
    flag:        '🇺🇸',
    defaultCamera: { lat: 39.5, lng: -98.35, zoom: 4 },
    systemsCatalog: ['nova', 'iris', 'radar'],
    doctrine:    'NATO',
    description: 'Küresel erişimli operatör — çok-teatro planlama',
  },

  FR: {
    code:        'FR',
    label:       'Fransa',
    shortLabel:  'FR',
    flag:        '🇫🇷',
    defaultCamera: { lat: 46.6, lng: 2.2, zoom: 6 },
    systemsCatalog: ['nova', 'iris', 'radar'],
    doctrine:    'NATO',
    description: 'Batı Avrupa — Akdeniz ve Afrika teatroları',
  },

  CN: {
    code:        'CN',
    label:       'Çin',
    shortLabel:  'CN',
    flag:        '🇨🇳',
    defaultCamera: { lat: 35.0, lng: 103.0, zoom: 4 },
    systemsCatalog: ['nova', 'iris', 'radar'],
    doctrine:    'non-aligned',
    description: 'Asya-Pasifik odağı',
  },
}

/** Operatör id'lerinin liste sırası (switcher modal'ında bu sırada görünür). */
export const OPERATOR_ORDER = ['TR', 'UA', 'US', 'FR', 'CN']

/** Uygulama açılırken aktif olan default operatör. URL / localStorage
 *  override'ı olmadığında bu değer kullanılır. */
export const DEFAULT_OPERATOR = 'TR'

/** Kataloğa üye olmayan bir kod gelirse default'a düşmek için guard. */
export function getOperator(code) {
  return OPERATORS[code] || OPERATORS[DEFAULT_OPERATOR]
}

/** Aktif kodu veya meta objesini almak için kısayol — parametre ISO kodu
 *  ya da operatör objesi olabilir. */
export function resolveOperatorCode(value) {
  if (!value) return DEFAULT_OPERATOR
  if (typeof value === 'string') {
    return OPERATORS[value] ? value : DEFAULT_OPERATOR
  }
  return value.code && OPERATORS[value.code] ? value.code : DEFAULT_OPERATOR
}
