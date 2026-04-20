/* ── Strategic asset taxonomy ──────────────────────────────────────────
   What used to be called "Tesisler" (facilities) is really a mixed
   inventory of armed-forces bases, internal-security installations,
   support sites, civil infrastructure and critical national assets.
   Calling the whole lot "facilities" under-sold it; the canonical
   defense-intel term is "strategic assets", so that's the label we
   expose in the UI now.

   Each entry describes a *class* of site (e.g. all air bases) with:
     id         — internal key used in facility records
     label      — full display name
     labelShort — compact name for chips, filters
     group      — functional cluster (see CATEGORY_GROUPS below)
     glyph      — single character rendered inside the map marker
     color      — stroke + badge colour
     bgColor    — soft fill for pill backgrounds
     count      — informational only; the Sidebar recomputes from data
     description— single-sentence plain-language explainer (hover, panels)
     doctrine   — one-line operational rationale ("why monitor this")

   Groups are a tight 5-cluster split that mirrors real operational
   command structure (armed forces / internal security / defense
   industry & support / civil-public / critical infrastructure), which
   is more precise than the previous 3-bucket military/civil/infra
   lumping. */

export const CATEGORIES = {
  // ── Silahlı Kuvvetler (TSK) ────────────────────────────
  airforce: {
    id: 'airforce',
    label: 'Hava Kuvvetleri Üsleri',
    labelShort: 'Hava Kuvvetleri',
    group: 'armed_forces',
    glyph: '✈',
    color: '#E06835',
    bgColor: 'rgba(224,104,53,0.15)',
    count: 13,
    description: 'Taktik ve nakliye hava filolarının konuşlandığı TSK hava üsleri.',
    doctrine: 'Üs çevresinde UAV/insansız tehdit erken uyarısı ve çevresel gözetim.',
  },
  navy: {
    id: 'navy',
    label: 'Deniz Kuvvetleri Üsleri',
    labelShort: 'Deniz Kuvvetleri',
    group: 'armed_forces',
    glyph: '⚓',
    color: '#4A9EE8',
    bgColor: 'rgba(74,158,232,0.15)',
    count: 10,
    description: 'Açık deniz harekâtı yürüten fırkateyn/korvet/denizaltı üsleri.',
    doctrine: 'Liman yaklaşımı ve demir sahası deniz gözetimi, sabotaj-karşıtı devriye.',
  },
  army: {
    id: 'army',
    label: 'Ordu / Kolordu / Tümen',
    labelShort: 'Kara Kuvvetleri',
    group: 'armed_forces',
    glyph: '★',
    color: '#6BA832',
    bgColor: 'rgba(107,168,50,0.15)',
    count: 20,
    description: 'Ordu, kolordu, tümen ve tugay seviyesindeki kara birlikleri karargâhı.',
    doctrine: 'Derinlik ISR, manevra koridoru izleme, karargâh güvenlik kuşağı.',
  },
  commando: {
    id: 'commando',
    label: 'Komando & Özel Kuvvetler',
    labelShort: 'Komando / ÖKK',
    group: 'armed_forces',
    glyph: '⚔',
    color: '#B84020',
    bgColor: 'rgba(184,64,32,0.15)',
    count: 8,
    description: 'Komando tugayları, ÖKK ve hareketli vurucu unsurların konuş noktaları.',
    doctrine: 'Sınır-ötesi görev öncesi alan istihbaratı, sızma koridoru takibi.',
  },
  artillery: {
    id: 'artillery',
    label: 'Topçu / Eğitim Birlikleri',
    labelShort: 'Topçu & Eğitim',
    group: 'armed_forces',
    glyph: '◎',
    color: '#CC8820',
    bgColor: 'rgba(204,136,32,0.15)',
    count: 6,
    description: 'Sahra/alçak irtifa topçu alayları ve ana silah eğitim merkezleri.',
    doctrine: 'Mevzi çevresi koruma, atış sahası güvenliği, hedef doğrulama.',
  },

  // ── Sınır & İç Güvenlik ─────────────────────────────────
  border: {
    id: 'border',
    label: 'Hudut Alayları',
    labelShort: 'Hudut',
    group: 'internal_security',
    glyph: '▲',
    color: '#C03030',
    bgColor: 'rgba(192,48,48,0.15)',
    count: 16,
    description: 'Kara sınırı boyunca konuşlu hudut alayları ve ileri karakollar.',
    doctrine: 'Sürekli sınır gözetim hattı, geçiş noktası insansız hava izlemesi.',
  },
  gendarmerie_region: {
    id: 'gendarmerie_region',
    label: 'Jandarma Bölge Komutanlıkları',
    labelShort: 'Jandarma Bölge',
    group: 'internal_security',
    glyph: '✦',
    color: '#7A7AE8',
    bgColor: 'rgba(122,122,232,0.15)',
    count: 7,
    description: 'Birden fazla ili kapsayan jandarma bölge komutanlıkları.',
    doctrine: 'Geniş bölgesel istihbarat, afet ve operasyonel destek koordinasyonu.',
  },
  gendarmerie_province: {
    id: 'gendarmerie_province',
    label: 'İl Jandarma Komutanlıkları',
    labelShort: 'İl Jandarma',
    group: 'internal_security',
    glyph: '•',
    color: '#909090',
    bgColor: 'rgba(144,144,144,0.12)',
    count: 81,
    description: 'İl seviyesinde jandarma komutanlığı karargâhları.',
    doctrine: 'Kırsal güvenlik, suç önleme ve vaka-bazlı taktik keşif.',
  },
  coast_guard: {
    id: 'coast_guard',
    label: 'Sahil Güvenlik',
    labelShort: 'Sahil Güvenlik',
    group: 'internal_security',
    glyph: '⚓',
    color: '#20B888',
    bgColor: 'rgba(32,184,136,0.15)',
    count: 15,
    description: 'Kıyı sularını denetleyen sahil güvenlik komutanlıkları ve botları.',
    doctrine: 'Yetki alanı deniz devriyesi, kaçakçılık/arama-kurtarma desteği.',
  },
  police: {
    id: 'police',
    label: 'Emniyet Genel Müdürlüğü',
    labelShort: 'Emniyet',
    group: 'internal_security',
    glyph: '★',
    color: '#2B7FE0',
    bgColor: 'rgba(43,127,224,0.15)',
    count: 5,
    description: 'Stratejik EGM tesisleri: özel harekât, istihbarat, kriminal.',
    doctrine: 'Büyükşehir merkez kuşağı destek, olay yeri hızlı görüntü akışı.',
  },

  // ── Savunma Sanayii & Askeri Destek ────────────────────
  defense_industry: {
    id: 'defense_industry',
    label: 'Savunma Sanayii Yerleşkeleri',
    labelShort: 'Savunma Sanayii',
    group: 'defense_support',
    glyph: '⚙',
    color: '#E05080',
    bgColor: 'rgba(224,80,128,0.15)',
    count: 20,
    description: 'ASELSAN, TUSAŞ, Roketsan, MKE gibi kritik savunma üretim kampüsleri.',
    doctrine: 'Üretim alanı çevre güvenliği, hassas AR-GE bölgesi koruma.',
  },
  military_school: {
    id: 'military_school',
    label: 'Askeri Okul & Hastaneler',
    labelShort: 'Okul & Hastane',
    group: 'defense_support',
    glyph: '⚕',
    color: '#5050B0',
    bgColor: 'rgba(80,80,176,0.15)',
    count: 19,
    description: 'Harp okulları, astsubay meslek yüksek okulları ve GATA merkezleri.',
    doctrine: 'Kampüs çevre güvenliği, yüksek hareketlilik dönemlerinde gözetim.',
  },

  // ── Sivil & Kamu ───────────────────────────────────────
  civil_airport: {
    id: 'civil_airport',
    label: 'Sivil Havalimanları',
    labelShort: 'Havalimanı',
    group: 'civil',
    glyph: '✈',
    color: '#60D0D0',
    bgColor: 'rgba(96,208,208,0.15)',
    count: 8,
    description: 'Yoğun trafikli ticari yolcu havalimanları ve terminalleri.',
    doctrine: 'Pist yaklaşma koridorları ve apron çevresi insansız tehdit tespiti.',
  },
  hospital: {
    id: 'hospital',
    label: 'Büyük Hastaneler',
    labelShort: 'Hastane',
    group: 'civil',
    glyph: '✚',
    color: '#F05070',
    bgColor: 'rgba(240,80,112,0.15)',
    count: 6,
    description: 'Yüksek kapasiteli şehir hastaneleri ve eğitim hastaneleri.',
    doctrine: 'Kriz durumunda helikopter iniş koridoru ve çevre akış gözetimi.',
  },
  government: {
    id: 'government',
    label: 'Kritik Kamu Binaları',
    labelShort: 'Kamu',
    group: 'civil',
    glyph: '⬢',
    color: '#A0A0B8',
    bgColor: 'rgba(160,160,184,0.15)',
    count: 5,
    description: 'Meclis, Cumhurbaşkanlığı, bakanlıklar gibi yönetim merkezleri.',
    doctrine: 'VIP hareket koridoru, protokol çevre güvenliği, hava sahası boşaltma.',
  },
  port: {
    id: 'port',
    label: 'Ticari Limanlar',
    labelShort: 'Liman',
    group: 'civil',
    glyph: '⚓',
    color: '#3068A8',
    bgColor: 'rgba(48,104,168,0.15)',
    count: 5,
    description: 'Ana konteyner limanları ve yük-yolcu terminalleri.',
    doctrine: 'Rıhtım yanaşma güvenliği, demir sahası ve yaklaşım kanalı gözetimi.',
  },

  // ── Kritik Altyapı ─────────────────────────────────────
  power_plant: {
    id: 'power_plant',
    label: 'Enerji Santralleri',
    labelShort: 'Enerji',
    group: 'infrastructure',
    glyph: '⚡',
    color: '#F0C030',
    bgColor: 'rgba(240,192,48,0.15)',
    count: 6,
    description: 'Nükleer, termik ve büyük hidroelektrik üretim tesisleri.',
    doctrine: 'Şalt sahası ve yakıt depolama çevre güvenliği, sabotaj önleme.',
  },
  dam: {
    id: 'dam',
    label: 'Barajlar',
    labelShort: 'Baraj',
    group: 'infrastructure',
    glyph: '≈',
    color: '#40B0E0',
    bgColor: 'rgba(64,176,224,0.15)',
    count: 5,
    description: 'Ulusal öneme sahip hidroelektrik ve içme suyu barajları.',
    doctrine: 'Gövde ve taşkın sahası izleme, hidrolojik kritiklik gözetimi.',
  },
  refinery: {
    id: 'refinery',
    label: 'Rafineri & Petrokimya',
    labelShort: 'Rafineri',
    group: 'infrastructure',
    glyph: '◆',
    color: '#D07030',
    bgColor: 'rgba(208,112,48,0.15)',
    count: 4,
    description: 'Ham petrol rafinerileri ve büyük petrokimya kompleksleri.',
    doctrine: 'Yanıcı madde depolama çevresi, boru hattı güzergâhı sürekli izleme.',
  },
  telecom: {
    id: 'telecom',
    label: 'Radyo / TV / İletişim',
    labelShort: 'İletişim',
    group: 'infrastructure',
    glyph: '📡',
    color: '#C060D0',
    bgColor: 'rgba(192,96,208,0.15)',
    count: 4,
    description: 'Stratejik vericiler, uydu yer istasyonları ve TRT tesisleri.',
    doctrine: 'Görüş hattı tespit, anten çevresi insansız hava izleme.',
  },
}

export const CATEGORY_ORDER = Object.keys(CATEGORIES)

/* ── Functional groupings ─────────────────────────────────────────────
   5-cluster split aligned to how Turkish defense/security command
   structure actually organises these sites. Each group gets a colour
   used as a hairline accent in the sidebar header so the viewer can
   jump visually between clusters. */
export const CATEGORY_GROUPS = [
  {
    id:    'armed_forces',
    label: 'Silahlı Kuvvetler',
    short: 'TSK',
    color: '#C04631',              // alert red — hard power
    note:  'Muharip hava / deniz / kara unsurları',
  },
  {
    id:    'internal_security',
    label: 'Sınır & İç Güvenlik',
    short: 'İç Güv.',
    color: '#3A7BD5',              // signal blue — constabulary
    note:  'Hudut, jandarma, sahil güvenlik, emniyet',
  },
  {
    id:    'defense_support',
    label: 'Savunma Sanayii & Destek',
    short: 'Sanayi',
    color: '#B09340',              // ochre — industrial
    note:  'Üretim yerleşkeleri ve askeri eğitim/destek',
  },
  {
    id:    'civil',
    label: 'Sivil & Kamu',
    short: 'Sivil',
    color: '#9AA6B8',              // steel grey — neutral civic
    note:  'Ulaşım, sağlık ve yönetim merkezleri',
  },
  {
    id:    'infrastructure',
    label: 'Kritik Altyapı',
    short: 'Altyapı',
    color: '#2EA889',               // ok green — essential systems
    note:  'Enerji, su ve iletişim omurgası',
  },
]

export const CATEGORIES_BY_GROUP = CATEGORY_GROUPS.reduce((acc, g) => {
  acc[g.id] = CATEGORY_ORDER.filter((id) => CATEGORIES[id].group === g.id)
  return acc
}, {})

/* Human-facing label for the whole inventory concept. The old UI called
   this "Tesisler" (Facilities) which is flat and generic; "Stratejik
   Varlıklar" (Strategic Assets) is the canonical defense-intel term and
   frames the list correctly. */
export const ASSET_SECTION_LABEL = 'Stratejik Varlıklar'
export const ASSET_SECTION_LABEL_SHORT = 'Varlıklar'

export const TURKEY_AREA_KM2  = 783_356
export const TURKEY_POPULATION = 85_372_000
