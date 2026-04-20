/**
 * Ülke kritik tesis kataloğu — ülke odağı açıkken CountryCriticalSitesPanel
 * bu listeyi tüketir. "Kendi önemli yerlerim" sekmesi.
 *
 * Niyet:
 *   Operatör ülke odağına geçtiğinde ("biz o ülke olsak") harita kameranın
 *   etrafında kırmızı halkalı, önem-sıralı tesis listesi görsün. Başkent,
 *   nükleer, kritik limanlar, stratejik hava üsleri, büyük enerji
 *   santralleri gibi "kaybedersen şehir yanar" noktaları.
 *
 * Bu globalSites.json'dan farklı:
 *   - globalSites = "bir operatörün YURT DIŞI ileri konuşlanması"
 *   - burası      = "bir ülkenin KENDİ TOPRAĞINDAKİ stratejik düğümleri"
 *
 * Şema:
 *   COUNTRY_CRITICAL_SITES[ISO]
 *     sites[] : { id, name, kind, lat, lng, priority, note? }
 *       kind      → 'capital' | 'nuclear' | 'airbase' | 'naval' |
 *                   'port'    | 'energy'  | 'command' | 'missile' |
 *                   'c4isr'   | 'industry'| 'finance' | 'transport'
 *       priority  → 1 (kritik) | 2 (önemli) | 3 (destek)
 *       note      → kısa açıklama (UI'da tooltip)
 *
 * Eksik ülke → panel boş-state. Bu dosya özet, kapsamlı değil;
 * birkaç anahtar nokta yeterli.
 */

export const COUNTRY_CRITICAL_SITES = {
  TR: {
    sites: [
      { id: 'tr-ankara',        name: 'Ankara (başkent, GenelKur)', kind: 'capital',  lat: 39.93, lng: 32.86, priority: 1 },
      { id: 'tr-istanbul',      name: 'İstanbul (boğazlar + ekonomi)', kind: 'finance', lat: 41.01, lng: 28.97, priority: 1 },
      { id: 'tr-incirlik',      name: 'İncirlik Hava Üssü',        kind: 'airbase',  lat: 37.00, lng: 35.43, priority: 1, note: 'ABD/NATO ortak' },
      { id: 'tr-akkuyu',        name: 'Akkuyu NGS',                 kind: 'nuclear',  lat: 36.15, lng: 33.54, priority: 1 },
      { id: 'tr-diyarbakir',    name: '8. Ana Jet Üssü (Diyarbakır)', kind: 'airbase', lat: 37.89, lng: 40.20, priority: 2 },
      { id: 'tr-konya',         name: '3. Ana Jet Üssü + AWACS (Konya)', kind: 'airbase', lat: 37.99, lng: 32.56, priority: 1 },
      { id: 'tr-aksaz',         name: 'Aksaz Deniz Üssü',            kind: 'naval',    lat: 36.83, lng: 28.25, priority: 2 },
      { id: 'tr-golcuk',        name: 'Gölcük Tersanesi',            kind: 'naval',    lat: 40.72, lng: 29.83, priority: 1 },
      { id: 'tr-malatya-rad',   name: 'Kürecik AN/TPY-2',            kind: 'c4isr',    lat: 38.46, lng: 37.55, priority: 2, note: 'NATO erken uyarı' },
      { id: 'tr-bogazici',      name: 'İstanbul Boğazı (deniz geçişi)', kind: 'transport', lat: 41.10, lng: 29.07, priority: 1 },
    ],
  },

  UA: {
    sites: [
      { id: 'ua-kyiv',     name: 'Kyiv (başkent)',               kind: 'capital',  lat: 50.45, lng: 30.52, priority: 1 },
      { id: 'ua-zaporizh', name: 'Zaporijya NGS',                 kind: 'nuclear',  lat: 47.51, lng: 34.59, priority: 1, note: 'Rus işgali altında' },
      { id: 'ua-khmeln',   name: 'Khmelnytskyi NGS',              kind: 'nuclear',  lat: 50.30, lng: 26.65, priority: 1 },
      { id: 'ua-rivne',    name: 'Rivne NGS',                     kind: 'nuclear',  lat: 51.33, lng: 25.89, priority: 1 },
      { id: 'ua-south',    name: 'Güney Ukrayna NGS',             kind: 'nuclear',  lat: 47.82, lng: 31.22, priority: 1 },
      { id: 'ua-odesa',    name: 'Odessa Limanı',                  kind: 'port',     lat: 46.48, lng: 30.72, priority: 1 },
      { id: 'ua-kharkiv',  name: 'Kharkiv (sanayi + kilit şehir)', kind: 'industry', lat: 49.99, lng: 36.23, priority: 1 },
      { id: 'ua-starokos', name: 'Starokostiantyniv Hava Üssü',    kind: 'airbase',  lat: 49.77, lng: 27.23, priority: 2, note: 'Storm Shadow/F-16' },
      { id: 'ua-mykolaiv', name: 'Mikolayiv tersane/liman',        kind: 'naval',    lat: 46.97, lng: 32.00, priority: 2 },
    ],
  },

  US: {
    sites: [
      { id: 'us-washington', name: 'Washington DC (başkent)',       kind: 'capital',  lat: 38.90, lng: -77.03, priority: 1 },
      { id: 'us-pentagon',   name: 'Pentagon',                      kind: 'command',  lat: 38.87, lng: -77.06, priority: 1 },
      { id: 'us-norad',      name: 'NORAD / Cheyenne Mtn',          kind: 'c4isr',    lat: 38.74, lng: -104.85, priority: 1 },
      { id: 'us-stratcom',   name: 'USSTRATCOM Offutt AFB',         kind: 'command',  lat: 41.12, lng: -95.91, priority: 1 },
      { id: 'us-norfolk',    name: 'Norfolk Deniz Üssü',             kind: 'naval',    lat: 36.95, lng: -76.32, priority: 1 },
      { id: 'us-sandiego',   name: 'San Diego Deniz Üssü',           kind: 'naval',    lat: 32.68, lng: -117.13, priority: 1 },
      { id: 'us-pearl',      name: 'Pearl Harbor / Hickam',          kind: 'naval',    lat: 21.35, lng: -157.95, priority: 1 },
      { id: 'us-minot',      name: 'Minot AFB (ICBM + B-52)',        kind: 'missile',  lat: 48.42, lng: -101.36, priority: 1 },
      { id: 'us-warren',     name: 'F. E. Warren AFB (ICBM)',        kind: 'missile',  lat: 41.15, lng: -104.87, priority: 1 },
      { id: 'us-whiteman',   name: 'Whiteman AFB (B-2)',             kind: 'airbase',  lat: 38.73, lng: -93.55, priority: 1 },
      { id: 'us-ny',         name: 'New York (finans)',              kind: 'finance',  lat: 40.71, lng: -74.01, priority: 1 },
      { id: 'us-siliconvly', name: 'Silicon Valley (yarı-iletken tasarım)', kind: 'industry', lat: 37.39, lng: -122.08, priority: 2 },
    ],
  },

  CN: {
    sites: [
      { id: 'cn-beijing',     name: 'Pekin (başkent + MKK)',       kind: 'capital',  lat: 39.90, lng: 116.40, priority: 1 },
      { id: 'cn-shanghai',    name: 'Şanghay (finans + liman)',    kind: 'finance',  lat: 31.23, lng: 121.47, priority: 1 },
      { id: 'cn-dalian',      name: 'Dalian Tersanesi (uçak gemisi)', kind: 'naval', lat: 38.92, lng: 121.61, priority: 1 },
      { id: 'cn-qingdao',     name: 'Qingdao Denizaltı Üssü',       kind: 'naval',    lat: 36.07, lng: 120.38, priority: 1 },
      { id: 'cn-sanya',       name: 'Yulin Denizaltı Üssü (Hainan)', kind: 'naval',   lat: 18.22, lng: 109.70, priority: 1, note: 'SSBN üssü' },
      { id: 'cn-ningbo',      name: 'Ningbo-Zhoushan limanı',       kind: 'port',     lat: 29.87, lng: 121.54, priority: 1 },
      { id: 'cn-xichang',     name: 'Xichang Uydu Fırlatma',         kind: 'c4isr',    lat: 28.25, lng: 102.03, priority: 2 },
      { id: 'cn-jiuquan',     name: 'Jiuquan Uydu Fırlatma',         kind: 'c4isr',    lat: 40.96, lng: 100.29, priority: 2 },
      { id: 'cn-tsmcfoshan',  name: 'SMIC Şanghay fab',              kind: 'industry', lat: 31.34, lng: 121.58, priority: 2, note: 'yarı-iletken' },
      { id: 'cn-fujiandep',   name: 'Fujian kıyı füze brigadları',   kind: 'missile',  lat: 25.5,  lng: 119.0,  priority: 1, note: 'Tayvan karşısı' },
    ],
  },

  RU: {
    sites: [
      { id: 'ru-moscow',    name: 'Moskova (başkent + Kremlin)', kind: 'capital',  lat: 55.75, lng: 37.62, priority: 1 },
      { id: 'ru-stpet',     name: 'St. Petersburg',               kind: 'finance',  lat: 59.93, lng: 30.33, priority: 1 },
      { id: 'ru-sevastop',  name: 'Sivastopol (Karadeniz Filo)',   kind: 'naval',    lat: 44.62, lng: 33.53, priority: 1, note: 'Kırım' },
      { id: 'ru-vladivost', name: 'Vladivostok (Pasifik Filo)',    kind: 'naval',    lat: 43.12, lng: 131.88, priority: 1 },
      { id: 'ru-severomor', name: 'Severomorsk (Kuzey Filo)',      kind: 'naval',    lat: 69.07, lng: 33.42, priority: 1 },
      { id: 'ru-engels',    name: 'Engels-2 Stratejik Hava Üssü',  kind: 'airbase',  lat: 51.48, lng: 46.21, priority: 1, note: 'Tu-160/Tu-95' },
      { id: 'ru-olenya',    name: 'Olenya Hava Üssü',              kind: 'airbase',  lat: 68.15, lng: 33.46, priority: 1, note: 'stratejik bombardıman' },
      { id: 'ru-plesetsk',  name: 'Plesetsk Kozmodromu',            kind: 'c4isr',    lat: 62.96, lng: 40.58, priority: 1 },
      { id: 'ru-yasny',     name: 'Dombarovsky ICBM üssü',          kind: 'missile',  lat: 50.75, lng: 59.85, priority: 1 },
      { id: 'ru-taganrog',  name: 'Taganrog (Beriev, A-50)',        kind: 'industry', lat: 47.22, lng: 38.92, priority: 2 },
    ],
  },

  IR: {
    sites: [
      { id: 'ir-tehran',    name: 'Tahran (başkent)',              kind: 'capital',  lat: 35.69, lng: 51.42, priority: 1 },
      { id: 'ir-natanz',    name: 'Natanz Uranyum Zenginleştirme',  kind: 'nuclear',  lat: 33.72, lng: 51.73, priority: 1 },
      { id: 'ir-fordow',    name: 'Fordow Yer Altı Tesisi',         kind: 'nuclear',  lat: 34.88, lng: 50.99, priority: 1 },
      { id: 'ir-bushehr',   name: 'Bushehr NGS',                     kind: 'nuclear',  lat: 28.83, lng: 50.89, priority: 1 },
      { id: 'ir-arak',      name: 'Arak Ağır Su Reaktörü',           kind: 'nuclear',  lat: 34.37, lng: 49.24, priority: 2 },
      { id: 'ir-isfahan',   name: 'İsfahan Uranyum Dönüşüm',         kind: 'nuclear',  lat: 32.58, lng: 51.50, priority: 1 },
      { id: 'ir-bandar',    name: 'Bandar Abbas (IRIN ana üs)',      kind: 'naval',    lat: 27.19, lng: 56.28, priority: 1 },
      { id: 'ir-kharg',     name: 'Kharg Adası (petrol ihracatı)',   kind: 'energy',   lat: 29.23, lng: 50.32, priority: 1 },
      { id: 'ir-khomeini',  name: 'İmam Humeyni Hava Üssü (Kermanşah)', kind: 'airbase', lat: 34.35, lng: 47.17, priority: 2 },
      { id: 'ir-parchin',   name: 'Parchin askeri kompleks',          kind: 'industry', lat: 35.53, lng: 51.77, priority: 2 },
    ],
  },

  IL: {
    sites: [
      { id: 'il-telaviv',   name: 'Tel Aviv (finans + HQ)',         kind: 'finance',  lat: 32.08, lng: 34.78, priority: 1 },
      { id: 'il-jerusalem', name: 'Kudüs (hükümet)',                 kind: 'capital',  lat: 31.77, lng: 35.22, priority: 1 },
      { id: 'il-dimona',    name: 'Dimona Nükleer Araştırma',        kind: 'nuclear',  lat: 31.00, lng: 35.14, priority: 1 },
      { id: 'il-hatzor',    name: 'Hatzor Hava Üssü',                kind: 'airbase',  lat: 31.76, lng: 34.72, priority: 2 },
      { id: 'il-nevatim',   name: 'Nevatim Hava Üssü (F-35)',        kind: 'airbase',  lat: 31.21, lng: 35.01, priority: 1 },
      { id: 'il-ramatdavid',name: 'Ramat David Hava Üssü',           kind: 'airbase',  lat: 32.67, lng: 35.18, priority: 2 },
      { id: 'il-haifa',     name: 'Hayfa Deniz Üssü + Liman',        kind: 'naval',    lat: 32.82, lng: 35.00, priority: 1 },
      { id: 'il-ashdod',    name: 'Aşdod Limanı',                    kind: 'port',     lat: 31.82, lng: 34.65, priority: 2 },
      { id: 'il-ironome',   name: 'Iron Dome batarya ağı',            kind: 'c4isr',    lat: 31.5,  lng: 34.7,  priority: 1, note: '10+ batarya ülke geneli' },
    ],
  },

  IN: {
    sites: [
      { id: 'in-delhi',    name: 'Yeni Delhi (başkent)',             kind: 'capital',  lat: 28.61, lng: 77.21, priority: 1 },
      { id: 'in-mumbai',   name: 'Mumbai (finans + deniz HQ)',        kind: 'finance',  lat: 19.08, lng: 72.88, priority: 1 },
      { id: 'in-tarapur',  name: 'Tarapur NGS',                       kind: 'nuclear',  lat: 19.83, lng: 72.66, priority: 1 },
      { id: 'in-kudankul', name: 'Kudankulam NGS',                    kind: 'nuclear',  lat: 8.17,  lng: 77.71, priority: 1 },
      { id: 'in-visakha',  name: 'Visakhapatnam Deniz Üssü (SSBN)',   kind: 'naval',    lat: 17.70, lng: 83.30, priority: 1 },
      { id: 'in-karwar',   name: 'Karwar Deniz Üssü',                 kind: 'naval',    lat: 14.82, lng: 74.15, priority: 2 },
      { id: 'in-hasimara', name: 'Hasimara AFB (Rafale)',             kind: 'airbase',  lat: 26.70, lng: 89.22, priority: 1 },
      { id: 'in-ambala',   name: 'Ambala AFB (Rafale)',               kind: 'airbase',  lat: 30.37, lng: 76.78, priority: 1 },
      { id: 'in-bangalur', name: 'Bengaluru (HAL + savunma sanayi)',  kind: 'industry', lat: 12.97, lng: 77.59, priority: 2 },
    ],
  },

  KP: {
    sites: [
      { id: 'kp-pyong',    name: 'Pyongyang (başkent)',              kind: 'capital',  lat: 39.03, lng: 125.75, priority: 1 },
      { id: 'kp-yongbyon', name: 'Yongbyon Nükleer Tesis',            kind: 'nuclear',  lat: 39.80, lng: 125.76, priority: 1 },
      { id: 'kp-punggye',  name: 'Punggye-ri test sahası',            kind: 'nuclear',  lat: 41.28, lng: 129.09, priority: 1 },
      { id: 'kp-sohae',    name: 'Sohae Uydu Fırlatma',               kind: 'c4isr',    lat: 39.66, lng: 124.71, priority: 1 },
      { id: 'kp-sinpo',    name: 'Sinpo-C (SSBN) Tersane',            kind: 'naval',    lat: 40.03, lng: 128.19, priority: 1 },
      { id: 'kp-wonsan',   name: 'Wonsan Hava Üssü',                  kind: 'airbase',  lat: 39.17, lng: 127.49, priority: 2 },
      { id: 'kp-nampo',    name: 'Nampo Limanı',                       kind: 'port',     lat: 38.74, lng: 125.41, priority: 2 },
    ],
  },

  KR: {
    sites: [
      { id: 'kr-seoul',    name: 'Seul (başkent + finans)',          kind: 'capital',  lat: 37.57, lng: 126.98, priority: 1 },
      { id: 'kr-busan',    name: 'Busan (liman + donanma)',           kind: 'naval',    lat: 35.10, lng: 129.04, priority: 1 },
      { id: 'kr-osan',     name: 'Osan AFB (USFK + ROKAF)',           kind: 'airbase',  lat: 37.09, lng: 127.03, priority: 1 },
      { id: 'kr-kunsan',   name: 'Kunsan AFB',                        kind: 'airbase',  lat: 35.90, lng: 126.61, priority: 2 },
      { id: 'kr-seongju',  name: 'Seongju THAAD Bataryası',           kind: 'c4isr',    lat: 35.93, lng: 128.30, priority: 1 },
      { id: 'kr-ulsan',    name: 'Ulsan (HD/Hyundai tersane)',        kind: 'industry', lat: 35.54, lng: 129.31, priority: 2 },
      { id: 'kr-hwaseong', name: 'Hwaseong NGS',                      kind: 'nuclear',  lat: 37.09, lng: 126.81, priority: 1 },
    ],
  },

  FR: {
    sites: [
      { id: 'fr-paris',    name: 'Paris (başkent)',                 kind: 'capital',  lat: 48.85, lng: 2.35, priority: 1 },
      { id: 'fr-brest',    name: 'Brest (SSBN üssü)',                kind: 'naval',    lat: 48.39, lng: -4.49, priority: 1 },
      { id: 'fr-toulon',   name: 'Toulon (Akdeniz Filo + CdG)',      kind: 'naval',    lat: 43.11, lng: 5.93, priority: 1 },
      { id: 'fr-saint',    name: 'Saint-Dizier (Rafale)',            kind: 'airbase',  lat: 48.64, lng: 4.90, priority: 2 },
      { id: 'fr-mont',     name: 'Mont-de-Marsan (Rafale)',          kind: 'airbase',  lat: 43.91, lng: -0.51, priority: 2 },
      { id: 'fr-istres',   name: 'Istres (nükleer teslimat)',        kind: 'airbase',  lat: 43.52, lng: 4.92, priority: 1 },
      { id: 'fr-cattenom', name: 'Cattenom NGS',                     kind: 'nuclear',  lat: 49.42, lng: 6.22, priority: 2 },
    ],
  },

  GR: {
    sites: [
      { id: 'gr-athens',   name: 'Atina (başkent)',                 kind: 'capital',  lat: 37.98, lng: 23.73, priority: 1 },
      { id: 'gr-souda',    name: 'Souda Bay (Girit, NATO)',          kind: 'naval',    lat: 35.49, lng: 24.12, priority: 1 },
      { id: 'gr-tanagra',  name: 'Tanagra AFB (Rafale)',             kind: 'airbase',  lat: 38.34, lng: 23.57, priority: 1 },
      { id: 'gr-araxos',   name: 'Araxos AFB',                       kind: 'airbase',  lat: 38.15, lng: 21.42, priority: 2 },
      { id: 'gr-salamis',  name: 'Salamis Deniz Üssü',               kind: 'naval',    lat: 37.97, lng: 23.50, priority: 2 },
      { id: 'gr-pireus',   name: 'Pire Limanı',                       kind: 'port',     lat: 37.94, lng: 23.65, priority: 2 },
    ],
  },

  SA: {
    sites: [
      { id: 'sa-riyadh',   name: 'Riyad (başkent)',                 kind: 'capital',  lat: 24.71, lng: 46.68, priority: 1 },
      { id: 'sa-dhahran',  name: 'Dhahran (Aramco + kralî hava üssü)', kind: 'energy', lat: 26.27, lng: 50.15, priority: 1 },
      { id: 'sa-abqaiq',   name: 'Abqaiq petrol işleme',              kind: 'energy',   lat: 25.93, lng: 49.67, priority: 1 },
      { id: 'sa-jeddah',   name: 'Cidde Limanı',                     kind: 'port',     lat: 21.48, lng: 39.19, priority: 2 },
      { id: 'sa-taif',     name: 'Taif King Fahd AB',                kind: 'airbase',  lat: 21.48, lng: 40.54, priority: 2 },
    ],
  },

  /* ── Orta Doğu çatışma ülkeleri ─────────────────────── */
  SY: {
    sites: [
      { id: 'sy-damascus',  name: 'Şam (başkent + GenelKur)',          kind: 'capital',  lat: 33.51, lng: 36.29, priority: 1 },
      { id: 'sy-aleppo',    name: 'Halep (sanayi + 2. şehir)',          kind: 'industry', lat: 36.20, lng: 37.15, priority: 1 },
      { id: 'sy-latakia',   name: 'Lazkiye Limanı',                     kind: 'port',     lat: 35.52, lng: 35.79, priority: 1 },
      { id: 'sy-tartus',    name: 'Tartus (Rus deniz üssü)',            kind: 'naval',    lat: 34.90, lng: 35.87, priority: 1, note: 'Rus kiracı' },
      { id: 'sy-hmeymim',   name: 'Hmeymim Hava Üssü (Rus)',            kind: 'airbase',  lat: 35.40, lng: 35.94, priority: 1, note: 'Rus kiracı' },
      { id: 'sy-tiyas',     name: 'T-4 (Tiyas) Hava Üssü',              kind: 'airbase',  lat: 34.52, lng: 37.63, priority: 2, note: 'İsrail sık hedef' },
      { id: 'sy-dumayr',    name: 'Dumayr Hava Üssü',                   kind: 'airbase',  lat: 33.61, lng: 36.75, priority: 2 },
      { id: 'sy-deirezzor', name: 'Deir ez-Zor (petrol sahası)',        kind: 'energy',   lat: 35.33, lng: 40.14, priority: 2 },
      { id: 'sy-scud',      name: 'al-Safir (füze depo/üretim)',        kind: 'missile',  lat: 35.93, lng: 37.46, priority: 1 },
    ],
  },

  LB: {
    sites: [
      { id: 'lb-beirut',    name: 'Beyrut (başkent + liman)',            kind: 'capital',  lat: 33.90, lng: 35.50, priority: 1 },
      { id: 'lb-port',      name: 'Beyrut Limanı',                       kind: 'port',     lat: 33.90, lng: 35.51, priority: 1, note: '2020 patlaması' },
      { id: 'lb-rayak',     name: 'Rayak Hava Üssü',                     kind: 'airbase',  lat: 33.85, lng: 36.00, priority: 2 },
      { id: 'lb-baalbek',   name: 'Baalbek bölgesi (Hizbullah merkezi)', kind: 'command',  lat: 34.01, lng: 36.20, priority: 1, note: 'İsrail hedef listesi' },
      { id: 'lb-tyr',       name: 'Sur (güney kıyı)',                    kind: 'port',     lat: 33.27, lng: 35.20, priority: 2 },
      { id: 'lb-dahieh',    name: 'Dahiye (güney Beyrut)',               kind: 'command',  lat: 33.85, lng: 35.50, priority: 1, note: 'Hizbullah karargah bölgesi' },
    ],
  },

  PS: {
    sites: [
      { id: 'ps-gaza-city', name: 'Gazze Şehri',                         kind: 'capital',  lat: 31.52, lng: 34.45, priority: 1 },
      { id: 'ps-rafah',     name: 'Rafah geçişi (Mısır sınırı)',         kind: 'transport', lat: 31.29, lng: 34.25, priority: 1 },
      { id: 'ps-khan-younis', name: 'Khan Younis',                       kind: 'command',  lat: 31.34, lng: 34.31, priority: 2 },
      { id: 'ps-ramallah',  name: 'Ramallah (Batı Şeria merkezi)',        kind: 'capital',  lat: 31.90, lng: 35.20, priority: 2 },
      { id: 'ps-jenin',     name: 'Cenin',                               kind: 'command',  lat: 32.46, lng: 35.29, priority: 2 },
    ],
  },

  IQ: {
    sites: [
      { id: 'iq-baghdad',   name: 'Bağdat (başkent + Green Zone)',        kind: 'capital',  lat: 33.31, lng: 44.36, priority: 1 },
      { id: 'iq-basra',     name: 'Basra (petrol + liman)',               kind: 'energy',   lat: 30.50, lng: 47.81, priority: 1 },
      { id: 'iq-kirkuk',    name: 'Kerkük (petrol sahası)',                kind: 'energy',   lat: 35.47, lng: 44.39, priority: 1 },
      { id: 'iq-balad',     name: 'Balad (Ana Jet Üssü)',                  kind: 'airbase',  lat: 34.02, lng: 44.36, priority: 2 },
      { id: 'iq-erbil',     name: 'Erbil (KRG + ABD konsolosluğu)',        kind: 'command',  lat: 36.19, lng: 43.99, priority: 2, note: 'İran hedef listesi' },
      { id: 'iq-ainalasad', name: 'Ain al-Asad Hava Üssü',                 kind: 'airbase',  lat: 33.78, lng: 42.43, priority: 1, note: 'ABD kuvvetleri' },
      { id: 'iq-victory',   name: 'Victory Üssü (Bağdat Havalimanı)',      kind: 'airbase',  lat: 33.27, lng: 44.23, priority: 2 },
    ],
  },

  YE: {
    sites: [
      { id: 'ye-sanaa',     name: 'Sana\'a (Husi başkenti)',               kind: 'capital',  lat: 15.37, lng: 44.19, priority: 1 },
      { id: 'ye-aden',      name: 'Aden (hükümet başkenti + liman)',       kind: 'port',     lat: 12.78, lng: 45.04, priority: 1 },
      { id: 'ye-hodeidah',  name: 'Hudeyde Limanı',                        kind: 'port',     lat: 14.80, lng: 42.96, priority: 1, note: 'Kırmızı Deniz çıkışı' },
      { id: 'ye-marib',     name: 'Marib (enerji + cephe)',                 kind: 'energy',   lat: 15.47, lng: 45.32, priority: 1 },
      { id: 'ye-taizz',     name: 'Taiz',                                   kind: 'command',  lat: 13.58, lng: 44.02, priority: 2 },
      { id: 'ye-al-dulaimi', name: 'al-Dulaimi Hava Üssü (Sanaa)',          kind: 'airbase',  lat: 15.48, lng: 44.22, priority: 2 },
      { id: 'ye-babelmandeb', name: 'Bab el-Mandeb (deniz geçişi)',         kind: 'transport',lat: 12.58, lng: 43.42, priority: 1, note: 'Husi saldırı alanı' },
      { id: 'ye-saada',     name: 'Saada (Husi kalesi)',                    kind: 'command',  lat: 16.94, lng: 43.76, priority: 2 },
    ],
  },

  TW: {
    sites: [
      { id: 'tw-taipei',    name: 'Taipei (başkent)',                        kind: 'capital',  lat: 25.04, lng: 121.56, priority: 1 },
      { id: 'tw-taoyuan',   name: 'Taoyuan Uluslararası Havalimanı',         kind: 'transport',lat: 25.08, lng: 121.23, priority: 1 },
      { id: 'tw-hualien',   name: 'Hualien Hava Üssü (dağ sığınağı)',         kind: 'airbase',  lat: 23.98, lng: 121.61, priority: 1, note: 'Mirage + F-16 hangar' },
      { id: 'tw-chiashan',  name: 'Chiashan (yeraltı uçaksavar)',             kind: 'airbase',  lat: 23.95, lng: 121.62, priority: 1 },
      { id: 'tw-ching-chuan', name: 'Ching Chuan Kang HQ (Taichung)',         kind: 'airbase',  lat: 24.26, lng: 120.62, priority: 2 },
      { id: 'tw-zuoying',   name: 'Zuoying Deniz Üssü (Kaohsiung)',           kind: 'naval',    lat: 22.66, lng: 120.28, priority: 1 },
      { id: 'tw-suao',      name: 'Suao Deniz Üssü',                          kind: 'naval',    lat: 24.59, lng: 121.87, priority: 2 },
      { id: 'tw-hsinchu',   name: 'TSMC Hsinchu (küresel çip merkezi)',       kind: 'industry', lat: 24.78, lng: 121.00, priority: 1, note: 'Stratejik değer' },
      { id: 'tw-tsmc-fab18', name: 'TSMC Fab 18 (Tainan, 3nm)',               kind: 'industry', lat: 23.02, lng: 120.26, priority: 1 },
      { id: 'tw-lungtan',   name: 'Lungtan AN/FPS-115 PAVE PAWS',             kind: 'c4isr',    lat: 24.85, lng: 121.19, priority: 1, note: 'Erken uyarı radarı' },
      { id: 'tw-hengshan',  name: 'Hengshan Askeri Komuta (yeraltı)',         kind: 'command',  lat: 25.07, lng: 121.58, priority: 1 },
      { id: 'tw-taichung-port', name: 'Taichung Limanı',                       kind: 'port',     lat: 24.29, lng: 120.52, priority: 2 },
      { id: 'tw-keelung',   name: 'Keelung Limanı',                           kind: 'port',     lat: 25.13, lng: 121.74, priority: 2 },
    ],
  },
}

/**
 * Ülke kodundan kritik tesis listesini oku. Yoksa boş array — UI
 * "henüz tanımlanmamış" placeholder'ı gösterir.
 */
export function criticalSitesOf(code) {
  if (!code) return []
  return COUNTRY_CRITICAL_SITES[code]?.sites || []
}

/** Panel sekme listesi için — tesis türü → TR label. */
export const SITE_KIND_LABELS = {
  capital:   'Başkent',
  nuclear:   'Nükleer',
  airbase:   'Hava üssü',
  naval:     'Deniz üssü',
  port:      'Liman',
  energy:    'Enerji',
  command:   'Komuta',
  missile:   'Füze',
  c4isr:     'C4ISR',
  industry:  'Sanayi',
  finance:   'Finans',
  transport: 'Ulaştırma',
}

/** Priority → UI renk (panel rozeti). */
export const PRIORITY_STYLE = {
  1: { label: 'Kritik',  color: '#D85A30' },
  2: { label: 'Önemli',  color: '#D4A42C' },
  3: { label: 'Destek',  color: '#8A8A8A' },
}
