#!/usr/bin/env node
/* Seed strategic-asset entries for the 12 newly-added conflicts.
   Merge-only: if a conflict key already exists in conflictAssets.json
   we leave it untouched. Run from repo root:
     node scripts/seed-conflict-assets.mjs                            */

import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const TARGET = path.resolve(__dirname, '..', 'apps', 'web', 'src', 'data', 'conflictAssets.json')

/* ── New conflict asset blocks ────────────────────────────────────────
   Coordinates verified against public atlases (approx, 3-4 decimals).
   Side attribution follows `parties[]` order in conflicts.json:
     first party = A, second party = B. Neutral/downstream = null.
   `info` kept single-line Turkish operational flavour.               */

const NEW_ASSETS = {
  /* Party order in conflicts.json: Kosova (A) / Sırbistan (B) / KFOR (A) */
  'serbia-kosovo': [
    { id: 'sk-pristina',   name: 'Priştine',                     country: 'Kosova',    side: 'A', type: 'capital',         lat: 42.6629, lng: 21.1655, info: 'Kosova başkenti ve hükümet merkezi; KSF karargâhı burada konuşlu.' },
    { id: 'sk-bondsteel',  name: 'Camp Bondsteel (KFOR)',        country: 'Kosova',    side: 'A', type: 'command',         lat: 42.3606, lng: 21.2750, info: 'NATO KFOR\'un ana lojistik ve komuta üssü; ABD ağırlıklı tabur kuvveti.' },
    { id: 'sk-merdare',    name: 'Merdare Sınır Kapısı',         country: 'Kosova',    side: 'A', type: 'border_crossing', lat: 42.9290, lng: 21.2640, info: 'Priştine–Belgrad hattının ana geçişi; gerilim dönemlerinde sık kapanıyor.' },
    { id: 'sk-mitrovica',  name: 'Kuzey Mitroviça',              country: 'Kosova',    side: 'A', type: 'contested_city',  lat: 42.8914, lng: 20.8660, info: 'Ibar nehriyle ikiye bölünmüş kent; kuzey yakasında Sırp nüfusu ağırlıkta.' },
    { id: 'sk-belgrade',   name: 'Belgrad',                      country: 'Sırbistan', side: 'B', type: 'capital',         lat: 44.7866, lng: 20.4489, info: 'Sırbistan başkenti; Genelkurmay ve siyasi komuta merkezi.' },
    { id: 'sk-batajnica',  name: 'Batajnica H.Ü.',               country: 'Sırbistan', side: 'B', type: 'airbase',         lat: 44.9350, lng: 20.2600, info: 'VS ana avcı üssü; MiG-29 filosu ve yakın hava destek unsurları.' },
    { id: 'sk-raska',      name: 'Raška Garnizonu',              country: 'Sırbistan', side: 'B', type: 'command',         lat: 43.2870, lng: 20.6110, info: 'Kosova sınırına en yakın VS ileri komuta merkezi; Banjska sonrası yığınak arttı.' },
  ],

  /* Party order: KKTC (A) / Güney Kıbrıs Rum Yönetimi (B)
     NOTE: KKTC is A per conflicts.json ordering; Turkish presence legitimate. */
  'cyprus-division': [
    { id: 'cy-lefkosa',      name: 'Lefkoşa (KKTC)',             country: 'KKTC',       side: 'A', type: 'capital',         lat: 35.1856, lng: 33.3823, info: 'KKTC başkenti; Yeşil Hat\'ın kuzey yakasındaki yönetim merkezi.' },
    { id: 'cy-gecitkale',    name: 'Geçitkale Havaalanı',        country: 'KKTC',       side: 'A', type: 'turkish_presence',lat: 35.2372, lng: 33.7250, info: 'Türk Bayraktar TB2 operasyon üssü; adada TSK hava unsurlarının çekirdeği.' },
    { id: 'cy-girne',        name: 'Girne Limanı',               country: 'KKTC',       side: 'A', type: 'port',            lat: 35.3417, lng: 33.3187, info: 'KKTC\'nin ana deniz bağlantı noktası; Mersin-Girne feribot hattı.' },
    { id: 'cy-magusa',       name: 'Mağusa (Gazimağusa) Limanı', country: 'KKTC',       side: 'A', type: 'port',            lat: 35.1250, lng: 33.9420, info: 'KKTC doğu kıyı lojistik limanı; Kapalı Maraş\'ın hemen güneyinde.' },
    { id: 'cy-guzelyurt',    name: 'Güzelyurt Geçişi',           country: 'KKTC',       side: 'A', type: 'border_crossing', lat: 35.1990, lng: 32.9910, info: 'Yeşil Hat üzerinde batı koridor geçiş noktası.' },
    { id: 'cy-nicosia-s',    name: 'Nicosia (GKRY)',             country: 'GKRY',       side: 'B', type: 'capital',         lat: 35.1756, lng: 33.3642, info: 'Güney Lefkoşa; GKRY başkenti ve AB tanınırlıklı yönetim merkezi.' },
    { id: 'cy-akrotiri',     name: 'RAF Akrotiri (SBA)',         country: 'Birleşik K.',side: 'B', type: 'airbase',         lat: 34.5904, lng: 32.9880, info: 'İngiliz Egemen Üs Bölgesi; Doğu Akdeniz ISR ve Tayfun konuşlanma noktası.' },
    { id: 'cy-dhekelia',     name: 'Dhekelia SBA',               country: 'Birleşik K.',side: 'B', type: 'command',         lat: 34.9900, lng: 33.7200, info: 'İkinci İngiliz Egemen Üs Bölgesi; sinyal istihbarat tesisi ağırlıklı.' },
    { id: 'cy-limassol',     name: 'Limasol Limanı',             country: 'GKRY',       side: 'B', type: 'port',            lat: 34.6480, lng: 33.0480, info: 'GKRY\'nin en büyük ticari limanı; Doğu Akdeniz konteyner düğümü.' },
  ],

  /* Party order: Güney Kore (A) / Kuzey Kore (B) */
  'korean-dmz': [
    { id: 'kr-seoul',       name: 'Seul',                        country: 'G. Kore', side: 'A', type: 'capital',       lat: 37.5665, lng: 126.9780, info: 'Başkent; DMZ\'ye sadece 40 km uzaklıkta, uzun menzilli KN topları menzilinde.' },
    { id: 'kr-osan',        name: 'Osan H.Ü. (USFK)',            country: 'G. Kore', side: 'A', type: 'airbase',       lat: 37.0906, lng: 127.0295, info: '7. ABD Hava Kuvvetleri karargâhı; F-16 ve U-2 ISR konuşlanma noktası.' },
    { id: 'kr-panmunjom',   name: 'Panmunjom / JSA',             country: 'G. Kore', side: 'A', type: 'contested_city',lat: 37.9555, lng: 126.6780, info: 'Ortak Güvenlik Bölgesi; iki Kore\'nin yüz yüze durduğu tek nokta.' },
    { id: 'kr-camphumphrey',name: 'Camp Humphreys',              country: 'G. Kore', side: 'A', type: 'command',       lat: 36.9670, lng: 127.0300, info: 'USFK ana karargâhı; ABD denizaşırı en büyük kara üssü.' },
    { id: 'kp-pyongyang',   name: 'Pyongyang',                   country: 'K. Kore', side: 'B', type: 'capital',       lat: 39.0392, lng: 125.7625, info: 'KDHC başkenti; parti ve askeri komuta yoğunluğu.' },
    { id: 'kp-kaesong',     name: 'Kaesong',                     country: 'K. Kore', side: 'B', type: 'border_crossing',lat: 37.9720, lng: 126.5550, info: 'DMZ\'ye bitişik sanayi bölgesi ve geçmişte kullanılan sınır kapısı.' },
    { id: 'kp-yongbyon',    name: 'Yongbyon Nükleer Kompleksi',  country: 'K. Kore', side: 'B', type: 'energy',        lat: 39.7970, lng: 125.7540, info: 'Plütonyum üretim reaktörü ve zenginleştirme santrifüjleri; programın kalbi.' },
    { id: 'kp-sohae',       name: 'Sohae Uydu Fırlatma Sahası',  country: 'K. Kore', side: 'B', type: 'missile_site',  lat: 39.6600, lng: 124.7050, info: 'KDHC\'nin ana uzay/füze fırlatma sahası; uzun menzilli test pedleri.' },
    { id: 'kp-pyongsan',    name: 'Pyongsan Uranyum Tesisi',     country: 'K. Kore', side: 'B', type: 'energy',        lat: 38.3220, lng: 126.4290, info: 'Sarı pasta üretimi için ana uranyum işleme tesisi.' },
  ],

  /* Party order: Filipinler / ABD / Vietnam / Malezya / Brunei (A) — Çin (B) */
  'south-china-sea': [
    { id: 'scs-manila',     name: 'Manila',                      country: 'Filipinler', side: 'A', type: 'capital',         lat: 14.5995, lng: 120.9842, info: 'Filipinler başkenti; AFP Genelkurmay ve Batı Filipin Denizi komuta merkezi.' },
    { id: 'scs-subic',      name: 'Subic Bay Deniz Üssü',        country: 'Filipinler', side: 'A', type: 'naval_base',      lat: 14.7930, lng: 120.2820, info: 'ABD-Filipin ortak kullanım limanı; EDCA anlaşması kapsamında rotasyonel konuşlanma.' },
    { id: 'scs-pagasa',     name: 'Pag-asa (Thitu Adası)',       country: 'Filipinler', side: 'A', type: 'command',         lat: 11.0550, lng: 114.2850, info: 'Filipinler\'in Spratly\'deki ana garnizon adası; pist genişletme çalışmaları sürüyor.' },
    { id: 'scs-sierra',     name: 'Second Thomas Shoal (BRP S. Madre)',country: 'Filipinler',side: 'A',type: 'contested_city',lat: 9.7400,  lng: 115.8670, info: 'Karaya oturtulmuş BRP Sierra Madre üzerinde devriye; Çin gemileri tarafından kuşatılmış durumda.' },
    { id: 'scs-scarborough',name: 'Scarborough Shoal',           country: 'Filipinler', side: 'A', type: 'contested_city',  lat: 15.1500, lng: 117.7500, info: '2012\'den bu yana Çin sahil güvenlik kontrolünde; balıkçılık gerilim noktası.' },
    { id: 'scs-mischief',   name: 'Mischief Reef (Meiji)',       country: 'Çin',        side: 'B', type: 'airbase',         lat: 9.9100,  lng: 115.5330, info: 'PLA yapay ada; 3 km pist, hangar hatları ve radar kubbeleri.' },
    { id: 'scs-fiery',      name: 'Fiery Cross Reef (Yongshu)',  country: 'Çin',        side: 'B', type: 'airbase',         lat: 9.5480,  lng: 112.8890, info: 'Spratly\'deki PLA komuta adası; uzun pist, HQ-9 batarya ve deniz radarı.' },
    { id: 'scs-subi',       name: 'Subi Reef (Zhubi)',           country: 'Çin',        side: 'B', type: 'airbase',         lat: 10.9190, lng: 114.0860, info: 'Üç ana PLA yapay adasından biri; pist, liman ve ASW unsurları.' },
    { id: 'scs-hainan',     name: 'Yulin Deniz Üssü (Hainan)',   country: 'Çin',        side: 'B', type: 'naval_base',      lat: 18.2290, lng: 109.6940, info: 'PLAN Güney Deniz Filosu karargâhı; SSBN sığınakları ve havuzlu yeraltı üssü.' },
  ],

  /* Party order: Moldova (A) / Transdinyester yönetimi + RF (B) */
  'transnistria': [
    { id: 'tn-chisinau',  name: 'Kişinev',                    country: 'Moldova',       side: 'A', type: 'capital',         lat: 47.0105, lng: 28.8638, info: 'Moldova başkenti; merkezi hükümet ve savunma bakanlığı.' },
    { id: 'tn-varnita',   name: 'Varnița Kontrol Noktası',    country: 'Moldova',       side: 'A', type: 'border_crossing', lat: 46.8450, lng: 29.4590, info: 'Tighina\'ya giriş noktasındaki Moldova polis kontrol noktası; periyodik olay bölgesi.' },
    { id: 'tn-tiraspol',  name: 'Tiraspol',                   country: 'Transdinyester',side: 'B', type: 'capital',         lat: 46.8408, lng: 29.6433, info: 'PMR fiili başkenti; idari-askeri komuta yoğunluğu.' },
    { id: 'tn-cobasna',   name: 'Cobasna Cephanelik Deposu',  country: 'Transdinyester',side: 'B', type: 'logistics',       lat: 48.0700, lng: 28.9450, info: 'Sovyet döneminden kalma ~20 bin ton cephane; RF OGRF korumasında, Avrupa\'nın en büyük yığını.' },
    { id: 'tn-bender',    name: 'Tighina (Bender)',           country: 'Transdinyester',side: 'B', type: 'contested_city',  lat: 46.8317, lng: 29.4767, info: 'Nehrin batı yakasında ama PMR kontrolünde olan istisna kent; OGRF devriyeleri aktif.' },
    { id: 'tn-ribnita',   name: 'Rîbnița Garnizonu',          country: 'Transdinyester',side: 'B', type: 'command',         lat: 47.7640, lng: 29.0110, info: 'Kuzey PMR ileri komuta merkezi; çelik fabrikası etrafında yığınak.' },
    { id: 'tn-ogrf-tsp',  name: 'OGRF Tiraspol Garnizonu',    country: 'Rusya',         side: 'B', type: 'command',         lat: 46.8620, lng: 29.6220, info: 'Rusya Federasyonu Operasyonel Gruplaması karargâhı; ~1500 muhafız personeli.' },
  ],

  /* Party order: Mısır+Sudan (A) / Etiyopya (B) — Nil havzası uyuşmazlığı. */
  'gerd-nile': [
    { id: 'gn-cairo',      name: 'Kahire',                      country: 'Mısır',    side: 'A',  type: 'capital',  lat: 30.0444, lng: 31.2357, info: 'Mısır başkenti; Nil su güvenliği politikasının merkez karar noktası.' },
    { id: 'gn-aswan',      name: 'Asvan Yüksek Barajı',         country: 'Mısır',    side: 'A',  type: 'energy',   lat: 23.9710, lng: 32.8770, info: 'Mısır\'ın stratejik su ve enerji tamponu; GERD doluluğuna karşı birincil regülatör.' },
    { id: 'gn-wadikebir',  name: 'Wadi Abu Rish H.Ü.',          country: 'Mısır',    side: 'A',  type: 'airbase',  lat: 24.2100, lng: 32.7500, info: 'Güney Mısır\'ın Nil yukarısına en yakın hava üssü; Rafale ve F-16 konuşlanma seçeneği.' },
    { id: 'gn-addis',      name: 'Addis Ababa',                 country: 'Etiyopya', side: 'B',  type: 'capital',  lat: 9.0300,  lng: 38.7400,  info: 'Etiyopya başkenti; GERD projesinin siyasi karar merkezi.' },
    { id: 'gn-gerd',       name: 'GERD (Hedase Barajı)',        country: 'Etiyopya', side: 'B',  type: 'energy',   lat: 11.2140, lng: 35.0930,  info: 'Afrika\'nın en büyük hidroelektrik barajı (6.45 GW); tüm uyuşmazlığın fiziksel odağı.' },
    { id: 'gn-bahirdar',   name: 'Bahir Dar / Tana Gölü',       country: 'Etiyopya', side: 'B',  type: 'logistics',lat: 11.5950, lng: 37.3900,  info: 'Mavi Nil\'in çıkış bölgesi; GERD lojistiğinin geri sahası.' },
    { id: 'gn-khartoum',   name: 'Hartum (Nil Birleşimi)',      country: 'Sudan',    side: null, type: 'contested_city', lat: 15.5007, lng: 32.5599, info: 'Mavi ve Beyaz Nil\'in birleştiği nokta; Sudan iç savaşı nedeniyle mansap koordinasyonu felç.' },
    { id: 'gn-merowe',     name: 'Merowe Barajı',               country: 'Sudan',    side: null, type: 'energy',   lat: 18.7100, lng: 32.0700,  info: 'Kuzey Sudan\'ın ana hidroelektrik tesisi; GERD salım rejiminden doğrudan etkileniyor.' },
  ],

  /* Party order: Fas (A) / Polisario + SADR (B) — Cezayir destekli. */
  'western-sahara': [
    { id: 'ws-rabat',    name: 'Rabat',                       country: 'Fas',       side: 'A', type: 'capital',         lat: 34.0209, lng: -6.8416, info: 'Fas başkenti; Kraliyet Silahlı Kuvvetleri (FAR) komuta merkezi.' },
    { id: 'ws-laayoune', name: 'El Aaiún (Laayoune)',         country: 'Fas',       side: 'A', type: 'command',         lat: 27.1536, lng: -13.2033, info: 'İhtilaflı toprakların fiili idari merkezi; FAR Güney Bölge Komutanlığı karargâhı.' },
    { id: 'ws-dakhla',   name: 'Dakhla Limanı',               country: 'Fas',       side: 'A', type: 'port',            lat: 23.6850, lng: -15.9570, info: 'Batı Sahra güney kıyı limanı; balıkçılık ve askeri ikmal noktası.' },
    { id: 'ws-berm',     name: 'Kum Duvarı (Berm) – Guelta',  country: 'Fas',       side: 'A', type: 'border_crossing', lat: 26.1000, lng: -12.6500, info: 'FAR\'ın 2700 km\'lik mayınlı kum seddinin orta kesimi; Polisario geçiş girişimlerinin sık hedefi.' },
    { id: 'ws-smara',    name: 'Smara',                       country: 'Fas',       side: 'A', type: 'contested_city',  lat: 26.7394, lng: -11.6725, info: 'İç Batı Sahra\'nın en büyük kenti; Polisario roket saldırıları menzilinde.' },
    { id: 'ws-tindouf',  name: 'Tindouf Kampı (Polisario HQ)',country: 'Cezayir',   side: 'B', type: 'proxy_stronghold',lat: 27.6743, lng: -8.1478,  info: 'Cezayir toprağındaki Polisario siyasi-askeri karargâhı ve mülteci kamp kompleksi.' },
    { id: 'ws-tifariti', name: 'Tifariti (Kurtarılmış Bölge)',country: 'SADR',      side: 'B', type: 'command',         lat: 26.0860, lng: -10.5900, info: 'Berm\'in doğusundaki Polisario ileri komuta noktası; SADR\'ın fiili merkezi.' },
  ],

  /* Party order: Pakistan (A) / TTP + bağlantılı gruplar (B) */
  'pakistan-ttp': [
    { id: 'pk-islamabad',name: 'İslamabad',                 country: 'Pakistan',   side: 'A', type: 'capital',         lat: 33.6844, lng: 73.0479, info: 'Pakistan başkenti; GHQ ve ISI merkezi Ravalpindi\'de, politika karar merkezi burada.' },
    { id: 'pk-peshawar', name: 'Peşaver XI. Kolordu',       country: 'Pakistan',   side: 'A', type: 'command',         lat: 34.0151, lng: 71.5249, info: 'Kuzeybatı Bölge (KPK) ana kara komutası; TTP operasyonlarını yürüten kolordu.' },
    { id: 'pk-bannu',    name: 'Bannu Garnizonu',           country: 'Pakistan',   side: 'A', type: 'command',         lat: 32.9889, lng: 70.6050, info: 'Vaziristan operasyonlarının ileri üs noktası; 2024 CTD baskını sonrası güvenlik pekiştirildi.' },
    { id: 'pk-torkham',  name: 'Torkham Sınır Kapısı',      country: 'Pakistan',   side: 'A', type: 'border_crossing', lat: 34.0928, lng: 71.0870, info: 'Hayber Geçidi ana kara geçiş noktası; Afganistan\'la ticaret ve güvenlik sürtüşme noktası.' },
    { id: 'pk-khyber',   name: 'Hayber Geçidi',             country: 'Pakistan',   side: 'A', type: 'border_crossing', lat: 34.0833, lng: 71.1000, info: 'Tarihi dağ geçidi; TTP geri çekilme koridorlarından biri.' },
    { id: 'pk-miranshah',name: 'Miranshah (Kuzey Vaziristan)',country: 'Pakistan', side: 'B', type: 'contested_city',  lat: 33.0000, lng: 70.0667, info: 'Eski Hakkani/TTP çekirdek bölgesi; Zarb-e-Azb sonrası hücresel aktivite sürüyor.' },
    { id: 'pk-wana',     name: 'Wana (Güney Vaziristan)',   country: 'Pakistan',   side: 'B', type: 'contested_city',  lat: 32.3017, lng: 69.5722, info: 'Mehsud kabile bölgesi merkezi; TTP Güney Vaziristan kolu referans noktası.' },
    { id: 'pk-paktika',  name: 'Paktika Sığınağı (AF tarafı)',country: 'Afganistan',side: 'B', type: 'proxy_stronghold',lat: 32.7000, lng: 68.9500, info: 'Sınırın Afganistan yakasında iddia edilen TTP eğitim ve barınma bölgesi.' },
  ],

  /* Party order: Nijerya + MNJTF (Çad/Nijer/Kamerun) (A) / Boko Haram + ISWAP (B) */
  'nigeria-lakechad': [
    { id: 'ng-abuja',     name: 'Abuja',                       country: 'Nijerya',  side: 'A', type: 'capital',         lat: 9.0579,  lng: 7.4951,  info: 'Nijerya başkenti; federal güvenlik konseyi ve DHQ karar merkezi.' },
    { id: 'ng-maiduguri', name: 'Maiduguri (MNJTF İleri HQ)',  country: 'Nijerya',  side: 'A', type: 'command',         lat: 11.8333, lng: 13.1500, info: 'Nijerya Ordusu 7. Tümen karargâhı; MNJTF operasyonlarının ileri komuta üssü.' },
    { id: 'ng-bosso',     name: 'Bosso (Nijer Tarafı)',        country: 'Nijer',    side: 'A', type: 'command',         lat: 13.7000, lng: 13.3000, info: 'MNJTF Sektör 4 üssü; Diffa bölgesinde ISWAP\'a karşı ileri konuş noktası.' },
    { id: 'ng-ndjamena',  name: 'N\'Djamena (Çad MNJTF HQ)',   country: 'Çad',      side: 'A', type: 'command',         lat: 12.1348, lng: 15.0557, info: 'MNJTF karargâhı; Çad Ordusu\'nun bölgesel komuta-kontrol ağırlık merkezi.' },
    { id: 'ng-baga',      name: 'Baga',                        country: 'Nijerya',  side: 'A', type: 'contested_city',  lat: 13.0940, lng: 13.7740, info: 'Çad Gölü kıyısında tekrar tekrar el değiştiren balıkçı kasabası; 2015 katliamı bölgesi.' },
    { id: 'ng-sambisa',   name: 'Sambisa Ormanı',              country: 'Nijerya',  side: 'B', type: 'proxy_stronghold',lat: 10.9000, lng: 13.4000, info: 'Boko Haram ve ISWAP\'ın tarihsel çekirdek sığınağı; Chibok kaçırma olayının üssü.' },
    { id: 'ng-lakechad',  name: 'Çad Gölü Adaları (ISWAP)',    country: 'Nijerya',  side: 'B', type: 'proxy_stronghold',lat: 13.5000, lng: 14.0000, info: 'ISWAP\'ın hareket kabiliyetinin en yüksek olduğu sulak ada takımadası.' },
    { id: 'ng-gwoza',     name: 'Gwoza (Mandara Dağları)',     country: 'Nijerya',  side: 'B', type: 'contested_city',  lat: 11.0830, lng: 13.6900, info: 'BH tarafından "hilafet başkenti" ilan edilmişti; dağlık bölge hâlâ kısmi kontrol altında.' },
  ],

  /* Party order: Mozambik + Ruanda + SAMIM (A) / Ahl as-Sunna (ISM) (B) */
  'mozambique-cabo-delgado': [
    { id: 'mz-pemba',      name: 'Pemba (İleri Üs)',           country: 'Mozambik', side: 'A', type: 'command',         lat: -12.9740, lng: 40.5177, info: 'Cabo Delgado eyalet başkenti; FADM ve Ruanda/SAMIM operasyonlarının ana destek noktası.' },
    { id: 'mz-mueda',      name: 'Mueda Havaalanı',            country: 'Mozambik', side: 'A', type: 'airbase',         lat: -11.6750, lng: 39.5630, info: 'Platonun üzerindeki pist; hava destek ve medevac için kritik.' },
    { id: 'mz-afungi',     name: 'Afungi LNG Yarımadası',      country: 'Mozambik', side: 'A', type: 'energy',          lat: -10.8700, lng: 40.5700, info: 'TotalEnergies Mozambique LNG sahası; 2021\'den beri kuvvet majör durumunda.' },
    { id: 'mz-montepuez',  name: 'Montepuez Lojistik Üssü',    country: 'Mozambik', side: 'A', type: 'logistics',       lat: -13.1250, lng: 38.9970, info: 'İç kesim ikmal ve eğitim noktası; Ruanda birliklerinin geri bölgesi.' },
    { id: 'mz-mocimboa',   name: 'Mocímboa da Praia',          country: 'Mozambik', side: 'A', type: 'contested_city',  lat: -11.3460, lng: 40.3530, info: '2020-2021\'de ISM tarafından tutuldu; 2021\'de Ruanda destekli harekât ile geri alındı.' },
    { id: 'mz-palma',      name: 'Palma',                      country: 'Mozambik', side: 'A', type: 'contested_city',  lat: -10.7700, lng: 40.4780, info: 'LNG sahasına bitişik kasaba; Mart 2021 saldırısında yüzlerce kayıp yaşandı.' },
    { id: 'mz-macomia',    name: 'Macomia',                    country: 'Mozambik', side: 'A', type: 'contested_city',  lat: -12.2500, lng: 40.1330, info: '2024\'te ISM tarafından geçici olarak tekrar ele geçirildi; bölgenin en kırılgan noktası.' },
    { id: 'mz-ism-forest', name: 'Catupa Ormanı (ISM Geri Sahası)',country: 'Mozambik', side: 'B', type: 'proxy_stronghold',lat: -11.9000, lng: 39.9000, info: 'ISM\'nin (Ahl as-Sunna) kamp ve saklanma sahalarının yoğunlaştığı orman kuşağı.' },
  ],

  /* Party order: Guyana (A) / Venezuela (B) — Essequibo ihtilafı. */
  'venezuela-guyana': [
    { id: 'vg-georgetown',  name: 'Georgetown',                country: 'Guyana',    side: 'A', type: 'capital',         lat: 6.8013,  lng: -58.1551, info: 'Guyana başkenti; GDF Genelkurmay merkezi ve ABD-UK askeri işbirliği koordinasyonu.' },
    { id: 'vg-annaregina',  name: 'Anna Regina',               country: 'Guyana',    side: 'A', type: 'contested_city',  lat: 7.2700,  lng: -58.5100, info: 'Essequibo bölgesinin en büyük kentsel merkezi; referandum sonrası güvenlik takviyesi yapıldı.' },
    { id: 'vg-eteringbang', name: 'Eteringbang Pist',          country: 'Guyana',    side: 'A', type: 'airbase',         lat: 6.0330,  lng: -61.0670, info: 'Cuyuni Nehri kenarında sınıra yakın iniş pisti; GDF ileri ISR noktası.' },
    { id: 'vg-tumatumari',  name: 'Tumatumari Lojistik',       country: 'Guyana',    side: 'A', type: 'logistics',       lat: 5.3600,  lng: -59.0000, info: 'İç bölge ikmal düğümü; Essequibo iç kesimine karayolu aksının başlangıcı.' },
    { id: 'vg-caracas',     name: 'Caracas',                   country: 'Venezuela', side: 'B', type: 'capital',         lat: 10.4806, lng: -66.9036, info: 'Venezuela başkenti; Miraflores\'ten Essequibo operasyonel kararları veriliyor.' },
    { id: 'vg-tumeremo',    name: 'Tumeremo İleri Karargâh',   country: 'Venezuela', side: 'B', type: 'command',         lat: 7.3000,  lng: -61.4700, info: 'Bolívar eyaletinde FANB ileri yığınak noktası; Essequibo sınırına en yakın komuta.' },
    { id: 'vg-santaelena',  name: 'Santa Elena de Uairén',     country: 'Venezuela', side: 'B', type: 'border_crossing', lat: 4.6000,  lng: -61.1130, info: 'Venezuela-Brezilya sınır kapısı; bölgesel kuvvet akışları için ana kara güzergâhı.' },
    { id: 'vg-puntofijo',   name: 'Punto Fijo Rafinerisi',     country: 'Venezuela', side: 'B', type: 'energy',          lat: 11.7000, lng: -70.2100, info: 'Paraguaná yarımadasında dünya\'nın en büyük rafineri komplekslerinden biri.' },
  ],

  /* Party order: Türkiye (A) / Yunanistan (B) — Ege + D. Akdeniz uyuşmazlıkları. */
  'aegean-easternmed': [
    { id: 'ae-ankara',      name: 'Ankara',                    country: 'Türkiye',    side: 'A', type: 'capital',          lat: 39.9334, lng: 32.8597, info: 'TC başkenti; MSB ve Genelkurmay ana komuta merkezi.' },
    { id: 'ae-incirlik',    name: 'İncirlik H.Ü.',             country: 'Türkiye',    side: 'A', type: 'turkish_presence', lat: 37.0017, lng: 35.4260, info: 'NATO ortak kullanımlı TUAF üssü; Doğu Akdeniz operasyon derinliği.' },
    { id: 'ae-dalaman',     name: 'Dalaman / Tepecik Konuşu',  country: 'Türkiye',    side: 'A', type: 'airbase',          lat: 36.7130, lng: 28.7920, info: 'Ege\'ye en yakın TUAF taktik konuşlanma noktası; F-16 rotasyonları.' },
    { id: 'ae-dikili',      name: 'Dikili Sahili',             country: 'Türkiye',    side: 'A', type: 'naval_base',       lat: 39.0700, lng: 26.8900, info: 'Ege\'de Lesvos\'a karşı kıyı devriye ve sahil güvenlik yoğunluğu.' },
    { id: 'ae-athens',      name: 'Atina',                     country: 'Yunanistan', side: 'B', type: 'capital',          lat: 37.9838, lng: 23.7275, info: 'Yunanistan başkenti; GEETHA (Genelkurmay) komuta merkezi.' },
    { id: 'ae-aktion',      name: 'Aktion H.Ü.',               country: 'Yunanistan', side: 'B', type: 'airbase',          lat: 38.9610, lng: 20.7650, info: 'HAF batı Yunanistan üssü; Mirage 2000-5 ve F-16 konuşlanma noktası.' },
    { id: 'ae-souda',       name: 'Souda Körfezi (Girit)',     country: 'Yunanistan', side: 'B', type: 'naval_base',       lat: 35.4940, lng: 24.1450, info: 'NATO/ABD ortak kullanımlı deniz üssü; 6. Filo konuşlanma ve ISR düğümü.' },
    { id: 'ae-meis',        name: 'Meis (Kastellorizo)',       country: 'Yunanistan', side: 'B', type: 'contested_city',   lat: 36.1500, lng: 29.5910, info: 'Türkiye kıyısına 2 km uzaklıkta; 2020 "mavi vatan" krizinin sembol adası.' },
    { id: 'ae-kardak',      name: 'Kardak Kayalıkları',        country: 'EGE',        side: null,type: 'contested_city',   lat: 36.9820, lng: 27.3340, info: '1996 krizinin merkezi; egemenlik belirsizliği statüko ile dondurulmuş küçük kayalıklar.' },
  ],
}

async function main() {
  const raw = await readFile(TARGET, 'utf8')
  const existing = JSON.parse(raw)

  let added = 0
  let skipped = 0
  for (const [conflictId, assets] of Object.entries(NEW_ASSETS)) {
    if (Object.prototype.hasOwnProperty.call(existing, conflictId)) {
      skipped += 1
      continue
    }
    existing[conflictId] = assets
    added += 1
  }

  const serialised = JSON.stringify(existing, null, 2) + '\n'
  await writeFile(TARGET, serialised, 'utf8')

  console.log(`added ${added} new conflict entries, skipped ${skipped} existing`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
