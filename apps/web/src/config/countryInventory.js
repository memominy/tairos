/**
 * Ülke envanter kataloğu — ülke odağı açıkken CountryInventoryPanel'in
 * tükettiği seed.
 *
 * Niyet:
 *   Sentinel her ülke için aynı şemayla bir "elimizde ne var?" özeti
 *   verebilsin; panel, operatör değişse de ülke odağı değişse de bu
 *   tabloyu okur. Veri açık-kaynak özetlerinden (IISS Military Balance,
 *   FlightGlobal, kamu envanter açıklamaları) derlenmiş TEMSİLİ
 *   rakamlar — gerçek OOB değil, eğitim/demo amaçlı.
 *
 * Şema:
 *   COUNTRY_INVENTORY[ISO]
 *     summary     : { active, reserve, paramilitary? } — toplam personel
 *     branches    : { air, navy, land, sam, space? }
 *       <branch>  : { label, items[] }
 *         items[] : { kind, name, count, status, origin?, note? }
 *           kind  → 'fighter'|'bomber'|'trainer'|'transport'|'helicopter'
 *                  |'uav'|'sam'|'radar'|'tank'|'ifv'|'artillery'|'mlrs'
 *                  |'ssm'|'frigate'|'destroyer'|'submarine'|'corvette'
 *                  |'patrol'|'amphib'|'carrier'|'other'
 *           status→ 'active'|'reserve'|'maintenance'|'order'|'retiring'
 *           origin→ 'domestic'|'imported'|'co-produced'
 *
 * Eksik ülke için panel boş-state fallback'e düşer — bu dosyaya zorunlu
 * değil. Bir ülke eklemek istediğinde: üç branch + birkaç item yeterli.
 * Sayılar yuvarlak ve güncel yılın medyan açık kaynağına göredir.
 */

export const COUNTRY_INVENTORY = {
  TR: {
    summary: { active: 355000, reserve: 380000, paramilitary: 155000 },
    branches: {
      air: { label: 'Hava Kuvvetleri', items: [
        { kind: 'fighter',    name: 'F-16C/D Block 30/40/50', count: 245, status: 'active' },
        { kind: 'fighter',    name: 'F-4E 2020 Terminator',   count: 48,  status: 'retiring' },
        { kind: 'trainer',    name: 'Hürjet',                  count: 4,   status: 'order', origin: 'domestic' },
        { kind: 'uav',        name: 'Bayraktar TB2',           count: 150, status: 'active', origin: 'domestic' },
        { kind: 'uav',        name: 'Bayraktar Akıncı',        count: 24,  status: 'active', origin: 'domestic' },
        { kind: 'uav',        name: 'Anka-S',                  count: 40,  status: 'active', origin: 'domestic' },
        { kind: 'uav',        name: 'Bayraktar Kızılelma',     count: 6,   status: 'order',  origin: 'domestic' },
        { kind: 'helicopter', name: 'T129 ATAK',                count: 70,  status: 'active', origin: 'co-produced' },
        { kind: 'transport',  name: 'A400M Atlas',              count: 10,  status: 'active' },
        { kind: 'transport',  name: 'C-130E/H Hercules',        count: 19,  status: 'active' },
      ]},
      navy: { label: 'Deniz Kuvvetleri', items: [
        { kind: 'frigate',   name: 'İstanbul-sınıfı (I-class)', count: 1,  status: 'active', origin: 'domestic' },
        { kind: 'frigate',   name: 'Barbaros-sınıfı',            count: 4,  status: 'active' },
        { kind: 'frigate',   name: 'Gabya-sınıfı (OHP)',         count: 8,  status: 'active' },
        { kind: 'corvette',  name: 'Ada-sınıfı (MILGEM)',        count: 4,  status: 'active', origin: 'domestic' },
        { kind: 'submarine', name: 'Type 209/1400',              count: 12, status: 'active' },
        { kind: 'amphib',    name: 'TCG Anadolu (LHD)',          count: 1,  status: 'active', origin: 'domestic' },
        { kind: 'patrol',    name: 'Tuzla-sınıfı',                count: 16, status: 'active' },
      ]},
      land: { label: 'Kara Kuvvetleri', items: [
        { kind: 'tank',      name: 'M60T Sabra',           count: 170,  status: 'active' },
        { kind: 'tank',      name: 'Leopard 2A4',          count: 316,  status: 'active' },
        { kind: 'tank',      name: 'M60A3',                count: 750,  status: 'active' },
        { kind: 'tank',      name: 'Altay',                count: 8,    status: 'order', origin: 'domestic' },
        { kind: 'ifv',       name: 'ACV-15 / Tulpar',      count: 1400, status: 'active', origin: 'domestic' },
        { kind: 'artillery', name: 'T-155 Fırtına',        count: 280,  status: 'active', origin: 'domestic' },
        { kind: 'mlrs',      name: 'TRG-300 / Kasırga',    count: 48,   status: 'active', origin: 'domestic' },
        { kind: 'ssm',       name: 'Bora / Khan',          count: 20,   status: 'active', origin: 'domestic' },
      ]},
      sam: { label: 'Hava Savunma', items: [
        { kind: 'sam',   name: 'S-400 Triumf',         count: 4,  status: 'active', note: 'Alaylar, entegre değil' },
        { kind: 'sam',   name: 'Hisar-A+',             count: 36, status: 'active', origin: 'domestic' },
        { kind: 'sam',   name: 'Hisar-O+',             count: 12, status: 'active', origin: 'domestic' },
        { kind: 'sam',   name: 'Siper',                count: 1,  status: 'order',  origin: 'domestic' },
        { kind: 'radar', name: 'Kalkan II / EIRS',     count: 20, status: 'active', origin: 'domestic' },
      ]},
    },
  },

  UA: {
    summary: { active: 900000, reserve: 1200000 },
    branches: {
      air: { label: 'Hava Kuvvetleri', items: [
        { kind: 'fighter',    name: 'MiG-29',            count: 35, status: 'active' },
        { kind: 'fighter',    name: 'Su-27',             count: 26, status: 'active' },
        { kind: 'fighter',    name: 'Su-24M',            count: 14, status: 'active' },
        { kind: 'fighter',    name: 'Su-25',             count: 17, status: 'active' },
        { kind: 'fighter',    name: 'F-16 (bağışlanan)', count: 10, status: 'active' },
        { kind: 'uav',        name: 'Bayraktar TB2',     count: 20, status: 'active' },
        { kind: 'uav',        name: 'Switchblade-300/600', count: 700, status: 'active' },
        { kind: 'uav',        name: 'FPV muharebe (karışık)', count: 2000, status: 'active', note: 'aylık üretim' },
        { kind: 'helicopter', name: 'Mi-8/17',           count: 80, status: 'active' },
      ]},
      navy: { label: 'Deniz Kuvvetleri', items: [
        { kind: 'patrol',    name: 'Island-sınıfı (USCG)', count: 2,  status: 'active' },
        { kind: 'patrol',    name: 'Gyurza-M / Kentavr',    count: 6,  status: 'active' },
        { kind: 'ssm',       name: 'R-360 Neptune',         count: 12, status: 'active', origin: 'domestic' },
        { kind: 'other',     name: 'MAGURA V5 USV',         count: 40, status: 'active', origin: 'domestic' },
      ]},
      land: { label: 'Kara Kuvvetleri', items: [
        { kind: 'tank',      name: 'T-64BV',         count: 700, status: 'active' },
        { kind: 'tank',      name: 'T-72 (karışık)', count: 600, status: 'active' },
        { kind: 'tank',      name: 'Leopard 1/2',    count: 105, status: 'active' },
        { kind: 'tank',      name: 'Challenger 2',   count: 14,  status: 'active' },
        { kind: 'tank',      name: 'M1 Abrams',      count: 31,  status: 'active' },
        { kind: 'ifv',       name: 'BMP-1/2',        count: 900, status: 'active' },
        { kind: 'ifv',       name: 'Bradley / Stryker', count: 300, status: 'active' },
        { kind: 'artillery', name: '2S1/2S3/2S19',   count: 400, status: 'active' },
        { kind: 'artillery', name: 'M109 / PzH2000', count: 180, status: 'active' },
        { kind: 'mlrs',      name: 'BM-21 Grad',     count: 185, status: 'active' },
        { kind: 'mlrs',      name: 'HIMARS / M270',  count: 40,  status: 'active' },
      ]},
      sam: { label: 'Hava Savunma', items: [
        { kind: 'sam',   name: 'S-300P/V',       count: 100, status: 'active' },
        { kind: 'sam',   name: 'Buk-M1',         count: 72,  status: 'active' },
        { kind: 'sam',   name: 'Patriot PAC-3',  count: 5,   status: 'active' },
        { kind: 'sam',   name: 'NASAMS',         count: 8,   status: 'active' },
        { kind: 'sam',   name: 'IRIS-T SLM',     count: 6,   status: 'active' },
      ]},
    },
  },

  US: {
    summary: { active: 1390000, reserve: 820000 },
    branches: {
      air: { label: 'Hava Kuvvetleri + Donanma Havacılığı', items: [
        { kind: 'fighter',    name: 'F-35A/B/C Lightning II', count: 630, status: 'active' },
        { kind: 'fighter',    name: 'F-22A Raptor',            count: 180, status: 'active' },
        { kind: 'fighter',    name: 'F-15C/D/E/EX',            count: 430, status: 'active' },
        { kind: 'fighter',    name: 'F-16C/D',                  count: 780, status: 'active' },
        { kind: 'fighter',    name: 'F/A-18E/F Super Hornet',   count: 530, status: 'active' },
        { kind: 'bomber',     name: 'B-2 Spirit',               count: 19,  status: 'active' },
        { kind: 'bomber',     name: 'B-52H Stratofortress',     count: 76,  status: 'active' },
        { kind: 'bomber',     name: 'B-1B Lancer',              count: 45,  status: 'active' },
        { kind: 'uav',        name: 'MQ-9 Reaper',              count: 260, status: 'active' },
        { kind: 'uav',        name: 'RQ-4 Global Hawk',         count: 32,  status: 'active' },
        { kind: 'transport',  name: 'C-17 Globemaster III',     count: 220, status: 'active' },
      ]},
      navy: { label: 'Deniz Kuvvetleri', items: [
        { kind: 'carrier',   name: 'Ford / Nimitz CVN',        count: 11, status: 'active' },
        { kind: 'destroyer', name: 'Arleigh Burke-sınıfı',     count: 73, status: 'active' },
        { kind: 'frigate',   name: 'Constellation (order)',    count: 2,  status: 'order' },
        { kind: 'submarine', name: 'Virginia-sınıfı SSN',      count: 24, status: 'active' },
        { kind: 'submarine', name: 'Ohio SSBN/SSGN',           count: 18, status: 'active' },
        { kind: 'amphib',    name: 'America/Wasp LHA/LHD',     count: 10, status: 'active' },
      ]},
      land: { label: 'Kara Kuvvetleri + Deniz Piyadesi', items: [
        { kind: 'tank',      name: 'M1A2 SEPv3 Abrams',      count: 2500, status: 'active' },
        { kind: 'ifv',       name: 'M2A3/A4 Bradley',         count: 3700, status: 'active' },
        { kind: 'ifv',       name: 'Stryker',                 count: 4400, status: 'active' },
        { kind: 'artillery', name: 'M109A7 Paladin',          count: 950,  status: 'active' },
        { kind: 'mlrs',      name: 'M142 HIMARS / M270',      count: 600,  status: 'active' },
        { kind: 'helicopter',name: 'AH-64E Apache',           count: 700,  status: 'active' },
      ]},
      sam: { label: 'Hava Savunma', items: [
        { kind: 'sam',   name: 'Patriot PAC-2/3',     count: 500,  status: 'active' },
        { kind: 'sam',   name: 'THAAD',               count: 7,    status: 'active', note: 'batarya' },
        { kind: 'sam',   name: 'Aegis Ashore',        count: 2,    status: 'active' },
        { kind: 'sam',   name: 'NASAMS / SM-6',       count: 'n/a', status: 'active' },
      ]},
    },
  },

  CN: {
    summary: { active: 2035000, reserve: 510000, paramilitary: 660000 },
    branches: {
      air: { label: 'PLAAF + PLANAF', items: [
        { kind: 'fighter', name: 'J-20 Mighty Dragon', count: 195, status: 'active' },
        { kind: 'fighter', name: 'J-16',                count: 300, status: 'active' },
        { kind: 'fighter', name: 'J-10C',               count: 290, status: 'active' },
        { kind: 'fighter', name: 'J-11/Su-27 ailesi',   count: 335, status: 'active' },
        { kind: 'fighter', name: 'J-15 Flying Shark',   count: 60,  status: 'active' },
        { kind: 'bomber',  name: 'H-6K/N',              count: 170, status: 'active' },
        { kind: 'uav',     name: 'Wing Loong II',       count: 95,  status: 'active' },
        { kind: 'uav',     name: 'WZ-7 Soaring Dragon', count: 20,  status: 'active' },
        { kind: 'uav',     name: 'CH-5 Rainbow',        count: 30,  status: 'active' },
      ]},
      navy: { label: 'PLAN', items: [
        { kind: 'carrier',   name: 'Tip 003 Fujian',      count: 1,  status: 'active' },
        { kind: 'carrier',   name: 'Tip 001/002 Liaoning/Shandong', count: 2, status: 'active' },
        { kind: 'destroyer', name: 'Tip 055 (Renhai)',    count: 8,  status: 'active' },
        { kind: 'destroyer', name: 'Tip 052D (Luyang III)', count: 30, status: 'active' },
        { kind: 'frigate',   name: 'Tip 054A (Jiangkai II)', count: 41, status: 'active' },
        { kind: 'corvette',  name: 'Tip 056/056A (Jiangdao)', count: 72, status: 'active' },
        { kind: 'submarine', name: 'Tip 093/094 SSN/SSBN', count: 12, status: 'active' },
      ]},
      land: { label: 'PLAGF + PLARF', items: [
        { kind: 'tank',      name: 'Tip 99A',              count: 600,  status: 'active' },
        { kind: 'tank',      name: 'Tip 96A',              count: 2500, status: 'active' },
        { kind: 'ifv',       name: 'Tip 04A / ZBD-04A',    count: 2200, status: 'active' },
        { kind: 'artillery', name: 'PLZ-05 / PLZ-52',      count: 1700, status: 'active' },
        { kind: 'ssm',       name: 'DF-17 HGV',            count: 'n/a',status: 'active' },
        { kind: 'ssm',       name: 'DF-21D / DF-26 "gemi öldürücü"', count: 'n/a', status: 'active' },
      ]},
      sam: { label: 'Hava Savunma', items: [
        { kind: 'sam',   name: 'HQ-9/9B',     count: 500, status: 'active' },
        { kind: 'sam',   name: 'S-400 Triumf', count: 8,  status: 'active' },
        { kind: 'sam',   name: 'HQ-22',       count: 60,  status: 'active' },
      ]},
    },
  },

  RU: {
    summary: { active: 1320000, reserve: 2000000 },
    branches: {
      air: { label: 'VKS (Hava-Uzay Kuv.)', items: [
        { kind: 'fighter', name: 'Su-57 Felon',   count: 22,  status: 'active' },
        { kind: 'fighter', name: 'Su-35S',        count: 110, status: 'active' },
        { kind: 'fighter', name: 'Su-34',         count: 140, status: 'active' },
        { kind: 'fighter', name: 'Su-30SM',       count: 130, status: 'active' },
        { kind: 'fighter', name: 'MiG-31BM/K',    count: 95,  status: 'active' },
        { kind: 'bomber',  name: 'Tu-160 Blackjack', count: 17, status: 'active' },
        { kind: 'bomber',  name: 'Tu-95MS Bear',  count: 55,  status: 'active' },
        { kind: 'bomber',  name: 'Tu-22M3 Backfire', count: 60, status: 'active' },
        { kind: 'uav',     name: 'Orlan-10',      count: 1000, status: 'active' },
        { kind: 'uav',     name: 'Shahed-136 / Geran-2', count: 600, status: 'active', note: 'aylık üretim' },
      ]},
      navy: { label: 'VMF', items: [
        { kind: 'carrier',   name: 'Amiral Kuznetsov',   count: 1,  status: 'maintenance' },
        { kind: 'destroyer', name: 'Udaloy / Sovremenny', count: 10, status: 'active' },
        { kind: 'frigate',   name: 'Amiral Gorshkov',    count: 4,  status: 'active' },
        { kind: 'submarine', name: 'Borei SSBN',         count: 7,  status: 'active' },
        { kind: 'submarine', name: 'Yasen-M SSGN',        count: 4,  status: 'active' },
      ]},
      land: { label: 'Kara Kuvvetleri', items: [
        { kind: 'tank',      name: 'T-90M Proryv',   count: 350,  status: 'active' },
        { kind: 'tank',      name: 'T-72B3/B3M',      count: 2000, status: 'active' },
        { kind: 'tank',      name: 'T-80BVM',         count: 600,  status: 'active' },
        { kind: 'ifv',       name: 'BMP-2/3',          count: 3500, status: 'active' },
        { kind: 'artillery', name: '2S19 Msta-S',      count: 550,  status: 'active' },
        { kind: 'mlrs',      name: 'Tornado-S / BM-30', count: 100, status: 'active' },
        { kind: 'ssm',       name: '9K720 Iskander-M', count: 160,  status: 'active' },
      ]},
      sam: { label: 'Hava Savunma', items: [
        { kind: 'sam',   name: 'S-400 Triumf',   count: 57, status: 'active', note: 'alay' },
        { kind: 'sam',   name: 'S-300V4',        count: 40, status: 'active' },
        { kind: 'sam',   name: 'Pantsir-S1/S2',  count: 200, status: 'active' },
        { kind: 'sam',   name: 'S-500 Prometey', count: 2,  status: 'active' },
      ]},
    },
  },

  IR: {
    summary: { active: 610000, reserve: 350000, paramilitary: 220000 },
    branches: {
      air: { label: 'IRIAF + IRGC-ASF', items: [
        { kind: 'fighter', name: 'F-14A Tomcat',      count: 25, status: 'active' },
        { kind: 'fighter', name: 'MiG-29A',            count: 21, status: 'active' },
        { kind: 'fighter', name: 'F-4D/E Phantom II',  count: 62, status: 'active' },
        { kind: 'fighter', name: 'Su-24MK',            count: 22, status: 'active' },
        { kind: 'uav',     name: 'Shahed-136',         count: 400, status: 'active', origin: 'domestic' },
        { kind: 'uav',     name: 'Mohajer-6',          count: 60,  status: 'active', origin: 'domestic' },
        { kind: 'uav',     name: 'Shahed-129',         count: 50,  status: 'active', origin: 'domestic' },
      ]},
      navy: { label: 'Donanma (IRIN + IRGC-N)', items: [
        { kind: 'submarine', name: 'Kilo-sınıfı',       count: 3,  status: 'active' },
        { kind: 'submarine', name: 'Fateh / Ghadir',    count: 20, status: 'active', origin: 'domestic' },
        { kind: 'frigate',   name: 'Moudge-sınıfı',     count: 6,  status: 'active', origin: 'domestic' },
        { kind: 'patrol',    name: 'Hızlı saldırı botu', count: 200, status: 'active', note: 'IRGC-N' },
      ]},
      land: { label: 'Kara Kuv. + IRGC-GF', items: [
        { kind: 'tank',      name: 'Zulfiqar-1/3',     count: 230, status: 'active', origin: 'domestic' },
        { kind: 'tank',      name: 'T-72S',            count: 480, status: 'active' },
        { kind: 'artillery', name: 'Fajr-5 / Raad',    count: 250, status: 'active', origin: 'domestic' },
        { kind: 'ssm',       name: 'Shahab-3 / Ghadr', count: 50,  status: 'active', origin: 'domestic' },
        { kind: 'ssm',       name: 'Fateh-110 / Zolfaghar', count: 200, status: 'active', origin: 'domestic' },
      ]},
      sam: { label: 'Hava Savunma', items: [
        { kind: 'sam',   name: 'S-300PMU-2',    count: 4,  status: 'active' },
        { kind: 'sam',   name: 'Bavar-373',     count: 6,  status: 'active', origin: 'domestic' },
        { kind: 'sam',   name: 'Khordad-15',    count: 20, status: 'active', origin: 'domestic' },
      ]},
    },
  },

  IL: {
    summary: { active: 170000, reserve: 465000 },
    branches: {
      air: { label: 'Hava Kuvvetleri', items: [
        { kind: 'fighter', name: 'F-35I Adir',        count: 39,  status: 'active' },
        { kind: 'fighter', name: 'F-15I Ra\'am',      count: 25,  status: 'active' },
        { kind: 'fighter', name: 'F-15C/D',            count: 44,  status: 'active' },
        { kind: 'fighter', name: 'F-16I Sufa',         count: 100, status: 'active' },
        { kind: 'uav',     name: 'Heron / Heron TP',   count: 85,  status: 'active', origin: 'domestic' },
        { kind: 'uav',     name: 'Hermes 450/900',     count: 60,  status: 'active', origin: 'domestic' },
      ]},
      navy: { label: 'Deniz Kuvvetleri', items: [
        { kind: 'corvette',  name: 'Sa\'ar 6',           count: 4,  status: 'active' },
        { kind: 'corvette',  name: 'Sa\'ar 5',           count: 3,  status: 'active' },
        { kind: 'submarine', name: 'Dolphin I/II',       count: 6,  status: 'active' },
      ]},
      land: { label: 'Kara Kuvvetleri', items: [
        { kind: 'tank',      name: 'Merkava Mk IV/V',    count: 490, status: 'active', origin: 'domestic' },
        { kind: 'ifv',       name: 'Namer',              count: 200, status: 'active', origin: 'domestic' },
        { kind: 'artillery', name: 'M109A5 Doher',        count: 250, status: 'active' },
      ]},
      sam: { label: 'Hava Savunma', items: [
        { kind: 'sam',   name: 'Iron Dome',     count: 10, status: 'active', origin: 'domestic', note: 'batarya' },
        { kind: 'sam',   name: 'David\'s Sling', count: 3,  status: 'active', origin: 'domestic' },
        { kind: 'sam',   name: 'Arrow-2/3',     count: 6,  status: 'active', origin: 'domestic' },
        { kind: 'sam',   name: 'Patriot PAC-2', count: 8,  status: 'retiring' },
      ]},
    },
  },

  IN: {
    summary: { active: 1455000, reserve: 1155000 },
    branches: {
      air: { label: 'IAF', items: [
        { kind: 'fighter', name: 'Su-30MKI',        count: 260, status: 'active' },
        { kind: 'fighter', name: 'Rafale',          count: 36,  status: 'active' },
        { kind: 'fighter', name: 'Tejas Mk1/1A',    count: 40,  status: 'active', origin: 'domestic' },
        { kind: 'fighter', name: 'MiG-29 / UPG',    count: 65,  status: 'active' },
        { kind: 'fighter', name: 'Jaguar IS/IB',    count: 115, status: 'active' },
        { kind: 'uav',     name: 'Heron / Searcher', count: 120, status: 'active' },
      ]},
      navy: { label: 'Donanma', items: [
        { kind: 'carrier',   name: 'INS Vikrant / Vikramaditya', count: 2, status: 'active' },
        { kind: 'destroyer', name: 'Kolkata / Visakhapatnam',    count: 10, status: 'active' },
        { kind: 'frigate',   name: 'Shivalik / Talwar',          count: 13, status: 'active' },
        { kind: 'submarine', name: 'Kalvari (Scorpène)',         count: 6,  status: 'active' },
      ]},
      land: { label: 'Kara Kuvvetleri', items: [
        { kind: 'tank',      name: 'T-90S Bhishma',         count: 1250, status: 'active' },
        { kind: 'tank',      name: 'T-72M1 Ajeya',           count: 2400, status: 'active' },
        { kind: 'tank',      name: 'Arjun Mk1/1A',           count: 124,  status: 'active', origin: 'domestic' },
        { kind: 'artillery', name: 'K9 Vajra',               count: 100,  status: 'active' },
        { kind: 'ssm',       name: 'BrahMos',                 count: 'n/a', status: 'active', origin: 'co-produced' },
      ]},
      sam: { label: 'Hava Savunma', items: [
        { kind: 'sam',   name: 'S-400 Triumf',      count: 3,  status: 'active' },
        { kind: 'sam',   name: 'Akash',             count: 25, status: 'active', origin: 'domestic' },
        { kind: 'sam',   name: 'Barak-8 MR-SAM',    count: 12, status: 'active', origin: 'co-produced' },
      ]},
    },
  },

  KP: {
    summary: { active: 1280000, reserve: 600000, paramilitary: 5700000 },
    branches: {
      air: { label: 'KPAF', items: [
        { kind: 'fighter', name: 'MiG-29',     count: 18,  status: 'active' },
        { kind: 'fighter', name: 'MiG-23',     count: 55,  status: 'active' },
        { kind: 'fighter', name: 'MiG-21',     count: 150, status: 'active' },
        { kind: 'fighter', name: 'Su-25',      count: 35,  status: 'active' },
      ]},
      navy: { label: 'KPN', items: [
        { kind: 'submarine', name: 'Romeo / Sinpo',  count: 70, status: 'active' },
        { kind: 'patrol',    name: 'Hızlı saldırı botu', count: 300, status: 'active' },
      ]},
      land: { label: 'KPA + Füze Kuv.', items: [
        { kind: 'tank',      name: 'Pokpung-ho',       count: 1000, status: 'active', origin: 'domestic' },
        { kind: 'tank',      name: 'T-62 / Chonma-ho', count: 3500, status: 'active' },
        { kind: 'artillery', name: 'Koksan 170mm',     count: 500,  status: 'active' },
        { kind: 'mlrs',      name: 'KN-25 600mm',      count: 60,   status: 'active', origin: 'domestic' },
        { kind: 'ssm',       name: 'Hwasong-17/18 ICBM', count: 'n/a', status: 'active', origin: 'domestic' },
        { kind: 'ssm',       name: 'KN-23 (Iskander)',  count: 'n/a', status: 'active', origin: 'domestic' },
      ]},
      sam: { label: 'Hava Savunma', items: [
        { kind: 'sam',   name: 'Pongae-5',  count: 12, status: 'active', origin: 'domestic' },
        { kind: 'sam',   name: 'S-200',     count: 40, status: 'active' },
      ]},
    },
  },

  KR: {
    summary: { active: 555000, reserve: 3100000 },
    branches: {
      air: { label: 'ROKAF', items: [
        { kind: 'fighter', name: 'F-35A Lightning II', count: 40, status: 'active' },
        { kind: 'fighter', name: 'F-15K Slam Eagle',   count: 59, status: 'active' },
        { kind: 'fighter', name: 'KF-16 / F-16C',      count: 169, status: 'active' },
        { kind: 'fighter', name: 'F-5E/F Tiger II',    count: 60, status: 'retiring' },
        { kind: 'fighter', name: 'KF-21 Boramae',      count: 6,  status: 'order', origin: 'domestic' },
      ]},
      navy: { label: 'ROKN', items: [
        { kind: 'destroyer', name: 'Sejong the Great (KDX-III)', count: 3, status: 'active' },
        { kind: 'destroyer', name: 'Chungmugong Yi Sun-sin (KDX-II)', count: 6, status: 'active' },
        { kind: 'submarine', name: 'Dosan Ahn Changho (KSS-III)', count: 3, status: 'active', origin: 'domestic' },
      ]},
      land: { label: 'ROKA', items: [
        { kind: 'tank',      name: 'K2 Black Panther', count: 260, status: 'active', origin: 'domestic' },
        { kind: 'tank',      name: 'K1A1/A2',           count: 1500, status: 'active', origin: 'domestic' },
        { kind: 'artillery', name: 'K9 Thunder',        count: 1100, status: 'active', origin: 'domestic' },
        { kind: 'mlrs',      name: 'K239 Chunmoo',      count: 160,  status: 'active', origin: 'domestic' },
      ]},
      sam: { label: 'Hava Savunma', items: [
        { kind: 'sam',   name: 'KM-SAM (Cheongung-II)', count: 8, status: 'active', origin: 'domestic' },
        { kind: 'sam',   name: 'Patriot PAC-3',         count: 8, status: 'active' },
        { kind: 'sam',   name: 'THAAD (US unsur)',       count: 1, status: 'active', note: 'Seongju' },
      ]},
    },
  },

  FR: {
    summary: { active: 204000, reserve: 41000 },
    branches: {
      air: { label: 'Armée de l\'air', items: [
        { kind: 'fighter', name: 'Rafale B/C/M',       count: 143, status: 'active' },
        { kind: 'fighter', name: 'Mirage 2000-5/D/N',  count: 65,  status: 'active' },
        { kind: 'uav',     name: 'MQ-9A Reaper',        count: 8,   status: 'active' },
      ]},
      navy: { label: 'Marine nationale', items: [
        { kind: 'carrier',   name: 'Charles de Gaulle', count: 1, status: 'active' },
        { kind: 'frigate',   name: 'FREMM / Horizon',    count: 11, status: 'active' },
        { kind: 'submarine', name: 'Triomphant SSBN',    count: 4,  status: 'active' },
        { kind: 'submarine', name: 'Suffren (Barracuda)', count: 3, status: 'active' },
      ]},
      land: { label: 'Armée de terre', items: [
        { kind: 'tank',      name: 'Leclerc',              count: 200, status: 'active' },
        { kind: 'ifv',       name: 'VBCI / Jaguar',        count: 750, status: 'active' },
        { kind: 'artillery', name: 'CAESAR 155mm',         count: 76,  status: 'active', origin: 'domestic' },
      ]},
      sam: { label: 'Hava Savunma', items: [
        { kind: 'sam',   name: 'SAMP/T Aster-30',  count: 10, status: 'active', origin: 'co-produced' },
        { kind: 'sam',   name: 'Crotale NG',       count: 20, status: 'active' },
      ]},
    },
  },

  GR: {
    summary: { active: 142000, reserve: 221000 },
    branches: {
      air: { label: 'Hava Kuvvetleri', items: [
        { kind: 'fighter', name: 'Rafale',             count: 24, status: 'active' },
        { kind: 'fighter', name: 'F-16V Viper',         count: 83, status: 'active' },
        { kind: 'fighter', name: 'Mirage 2000-5EG/BG',  count: 24, status: 'active' },
        { kind: 'fighter', name: 'F-4E AUP',            count: 18, status: 'retiring' },
      ]},
      navy: { label: 'Deniz Kuvvetleri', items: [
        { kind: 'frigate',   name: 'Hydra / Elli',     count: 9, status: 'active' },
        { kind: 'frigate',   name: 'FDI Kimon (Belhara)', count: 1, status: 'order' },
        { kind: 'submarine', name: 'Papanikolis (Type 214)', count: 4, status: 'active' },
      ]},
      land: { label: 'Kara Kuvvetleri', items: [
        { kind: 'tank',      name: 'Leopard 2A6 HEL',  count: 170, status: 'active' },
        { kind: 'tank',      name: 'Leopard 1A5',       count: 380, status: 'active' },
      ]},
      sam: { label: 'Hava Savunma', items: [
        { kind: 'sam',   name: 'S-300PMU-1',   count: 1, status: 'active', note: 'Girit' },
        { kind: 'sam',   name: 'Patriot PAC-2', count: 6, status: 'active' },
      ]},
    },
  },

  SA: {
    summary: { active: 257000, reserve: 25000, paramilitary: 100000 },
    branches: {
      air: { label: 'RSAF', items: [
        { kind: 'fighter', name: 'F-15SA/C/D Eagle',      count: 150, status: 'active' },
        { kind: 'fighter', name: 'Typhoon FGR4',           count: 72,  status: 'active' },
        { kind: 'fighter', name: 'Tornado IDS',            count: 60,  status: 'retiring' },
      ]},
      land: { label: 'Kara Kuvvetleri', items: [
        { kind: 'tank',      name: 'M1A2S Abrams',         count: 370, status: 'active' },
        { kind: 'tank',      name: 'Leclerc (SA unsuru)',   count: 58,  status: 'active' },
      ]},
      sam: { label: 'Hava Savunma', items: [
        { kind: 'sam',   name: 'Patriot PAC-3',      count: 18, status: 'active' },
        { kind: 'sam',   name: 'THAAD',              count: 7,  status: 'order' },
      ]},
    },
  },

  /* ── Orta Doğu çatışma ülkeleri ─────────────────────── */
  SY: {
    summary: { active: 169000, reserve: 50000, paramilitary: 100000 },
    branches: {
      air: { label: 'Suriye Hava Kuvvetleri', items: [
        { kind: 'fighter',    name: 'MiG-21',            count: 60, status: 'active', note: 'Operasyonel oran düşük' },
        { kind: 'fighter',    name: 'MiG-23BN/ML',       count: 90, status: 'active' },
        { kind: 'fighter',    name: 'MiG-29',            count: 17, status: 'active' },
        { kind: 'fighter',    name: 'Su-24MK',           count: 18, status: 'active' },
        { kind: 'helicopter', name: 'Mi-8/17',           count: 80, status: 'active' },
        { kind: 'helicopter', name: 'Mi-25/35',          count: 32, status: 'active' },
      ]},
      land: { label: 'Kara Kuvvetleri', items: [
        { kind: 'tank',      name: 'T-72 (çeşitli)',     count: 1000, status: 'active', note: 'Savaşta yıprandı' },
        { kind: 'tank',      name: 'T-62',                count: 500, status: 'active' },
        { kind: 'tank',      name: 'T-55',                count: 1200, status: 'reserve' },
        { kind: 'ifv',       name: 'BMP-1/2',             count: 1500, status: 'active' },
        { kind: 'artillery', name: 'Menzil toplar (karışık)', count: 1500, status: 'active' },
        { kind: 'ssm',       name: 'SS-21 Scarab',        count: 18, status: 'active' },
        { kind: 'ssm',       name: 'SCUD-B/C/D',          count: 50, status: 'active' },
      ]},
      sam: { label: 'Hava Savunma', items: [
        { kind: 'sam',   name: 'S-200',                   count: 48, status: 'active' },
        { kind: 'sam',   name: 'S-300PMU-2 (Rus)',         count: 3,  status: 'active', note: '2018 teslim' },
        { kind: 'sam',   name: 'Pantsir-S1',              count: 36, status: 'active' },
        { kind: 'sam',   name: 'Buk-M2E',                 count: 8,  status: 'active' },
      ]},
    },
  },

  LB: {
    summary: { active: 60000, reserve: 0, paramilitary: 20000 },
    branches: {
      air: { label: 'Lübnan Hava Kuvvetleri', items: [
        { kind: 'helicopter', name: 'UH-1H Huey II',       count: 21, status: 'active' },
        { kind: 'helicopter', name: 'SA-342L Gazelle',     count: 12, status: 'active' },
        { kind: 'trainer',    name: 'A-29 Super Tucano',   count: 6,  status: 'active' },
      ]},
      land: { label: 'Kara Kuvvetleri', items: [
        { kind: 'tank',      name: 'M60A3',                count: 94, status: 'active' },
        { kind: 'tank',      name: 'T-55',                 count: 62, status: 'reserve' },
        { kind: 'ifv',       name: 'M113',                 count: 1200, status: 'active' },
        { kind: 'artillery', name: 'M198 155mm',           count: 12, status: 'active' },
      ]},
      sam: { label: 'Hava Savunma', items: [
        { kind: 'sam',   name: 'ZU-23-2 (uçak savar)',    count: 36, status: 'active' },
      ]},
    },
  },

  PS: {
    summary: { active: 0, reserve: 0, paramilitary: 30000 },
    branches: {
      land: { label: 'Silahlı Gruplar (Hamas/PIJ tahmini)', items: [
        { kind: 'other',     name: 'Kassam tugayları (personel)', count: 30000, status: 'active' },
        { kind: 'ssm',       name: 'Kassam / Qassam roketleri',    count: 15000, status: 'active', note: '2023 öncesi stok' },
        { kind: 'ssm',       name: 'Grad / Fajr-5 roketleri',      count: 2000,  status: 'active' },
        { kind: 'uav',       name: 'Ababil kamikaze İHA',          count: 200,   status: 'active' },
      ]},
    },
  },

  IQ: {
    summary: { active: 193000, reserve: 30000, paramilitary: 85000 },
    branches: {
      air: { label: 'Irak Hava Kuvvetleri', items: [
        { kind: 'fighter',    name: 'F-16IQ Block 52',    count: 34, status: 'active' },
        { kind: 'trainer',    name: 'T-50IQ',             count: 20, status: 'active' },
        { kind: 'helicopter', name: 'Mi-28NE Havoc',      count: 15, status: 'active' },
        { kind: 'helicopter', name: 'Mi-17V',             count: 26, status: 'active' },
        { kind: 'uav',        name: 'CH-4B (Çin)',        count: 10, status: 'active' },
      ]},
      land: { label: 'Kara Kuvvetleri', items: [
        { kind: 'tank',      name: 'M1A1M Abrams',        count: 140, status: 'active' },
        { kind: 'tank',      name: 'T-72 (modernize)',     count: 120, status: 'active' },
        { kind: 'ifv',       name: 'BMP-1/BMP-3',          count: 900, status: 'active' },
        { kind: 'artillery', name: '2S1 Gvozdika',         count: 120, status: 'active' },
      ]},
      sam: { label: 'Hava Savunma', items: [
        { kind: 'sam',   name: 'Pantsir-S1',              count: 6,  status: 'order' },
      ]},
    },
  },

  YE: {
    summary: { active: 15000, reserve: 0, paramilitary: 100000 },
    branches: {
      land: { label: 'Husi Milis Unsurları (tahmini)', items: [
        { kind: 'other',     name: 'Yaygın milis personel',          count: 100000, status: 'active' },
        { kind: 'ssm',       name: 'Burkan-2/3 balistik füze',       count: 200,    status: 'active', note: 'SCUD türevleri' },
        { kind: 'ssm',       name: 'Quds-1/2 seyir füzesi',          count: 150,    status: 'active' },
        { kind: 'uav',       name: 'Samad-3 uzun menzilli kamikaze', count: 400,    status: 'active' },
        { kind: 'uav',       name: 'Shahed-136 (İran)',              count: 300,    status: 'active' },
        { kind: 'other',     name: 'Deniz kamikaze insansız (USV)',  count: 40,     status: 'active', note: 'Bab el-Mandeb' },
        { kind: 'tank',      name: 'T-55 / T-62 (ele geçirilen)',    count: 200,    status: 'active' },
        { kind: 'artillery', name: '122mm Grad roketatar',           count: 350,    status: 'active' },
      ]},
      sam: { label: 'Hava Savunma', items: [
        { kind: 'sam',   name: 'Saqr-1 (İran 358 türevi)',  count: 60, status: 'active', note: 'Loiter SAM' },
        { kind: 'sam',   name: 'Thaqib-1/2 (İran 2. el)',   count: 24, status: 'active' },
      ]},
      navy: { label: 'Deniz Kuvvetleri', items: [
        { kind: 'other', name: 'USV kamikaze (Toofan)',     count: 20, status: 'active' },
        { kind: 'other', name: 'Limpet mayın (elle bırakma)', count: 0, status: 'active', note: 'operasyonel' },
      ]},
    },
  },

  TW: {
    summary: { active: 169000, reserve: 1657000, paramilitary: 12000 },
    branches: {
      air: { label: 'ROC Hava Kuvvetleri', items: [
        { kind: 'fighter',    name: 'F-16V Block 70',       count: 141, status: 'active', note: '206 upgrade hedefi' },
        { kind: 'fighter',    name: 'Mirage 2000-5EI/DI',    count: 46,  status: 'active' },
        { kind: 'fighter',    name: 'F-CK-1C/D (IDF)',       count: 124, status: 'active', origin: 'domestic' },
        { kind: 'trainer',    name: 'AT-5 Yung Ying',        count: 17,  status: 'order',  origin: 'domestic' },
        { kind: 'uav',        name: 'Tengyun (MALE)',        count: 4,   status: 'order',  origin: 'domestic' },
        { kind: 'uav',        name: 'Chien Hsiang (SEAD)',   count: 100, status: 'active', origin: 'domestic' },
        { kind: 'helicopter', name: 'AH-64E Apache',         count: 29,  status: 'active' },
      ]},
      navy: { label: 'ROC Deniz Kuvvetleri', items: [
        { kind: 'destroyer', name: 'Kidd-sınıfı (Keelung)', count: 4,  status: 'active' },
        { kind: 'frigate',   name: 'Kang Ding (La Fayette)', count: 6, status: 'active' },
        { kind: 'frigate',   name: 'Cheng Kung (OHP)',      count: 8,  status: 'active' },
        { kind: 'corvette',  name: 'Tuo Chiang (Catamaran)', count: 8, status: 'active', origin: 'domestic', note: 'Stealth, HF-3' },
        { kind: 'submarine', name: 'Hai Kun IDS',           count: 1,  status: 'order', origin: 'domestic' },
        { kind: 'ssm',       name: 'Hsiung Feng II/III',    count: 400, status: 'active', origin: 'domestic' },
      ]},
      land: { label: 'ROC Kara Kuvvetleri', items: [
        { kind: 'tank',      name: 'M1A2T Abrams',          count: 108, status: 'order' },
        { kind: 'tank',      name: 'CM-11 Brave Tiger',     count: 450, status: 'active', origin: 'domestic' },
        { kind: 'tank',      name: 'M60A3 TTS',              count: 460, status: 'active' },
        { kind: 'ifv',       name: 'CM-32 Yunpao 8x8',      count: 650, status: 'active', origin: 'domestic' },
        { kind: 'artillery', name: 'M109A6 Paladin',        count: 40,  status: 'order' },
        { kind: 'mlrs',      name: 'Thunderbolt-2000',      count: 57,  status: 'active', origin: 'domestic' },
        { kind: 'mlrs',      name: 'HIMARS',                count: 29,  status: 'order' },
      ]},
      sam: { label: 'Hava Savunma', items: [
        { kind: 'sam',   name: 'Patriot PAC-3 MSE',          count: 7,  status: 'active' },
        { kind: 'sam',   name: 'Sky Bow III (TK-3)',          count: 36, status: 'active', origin: 'domestic' },
        { kind: 'sam',   name: 'Sky Sword II (TC-2N)',        count: 24, status: 'active', origin: 'domestic' },
        { kind: 'sam',   name: 'Avenger / Stinger',           count: 200, status: 'active' },
      ]},
    },
  },
}

/**
 * Ülke kodundan envanteri oku. Yoksa null döner — UI boş-state
 * şeritleri gösterir. Panel kendi içinde getCountry() ile label+flag
 * alır, bu katman saf veriyle uğraşır.
 */
export function inventoryOf(code) {
  if (!code) return null
  return COUNTRY_INVENTORY[code] || null
}

/**
 * Şu ana kadar envanter seed'i olan ülke kodları — CommandPalette
 * ülke-odak listesinde ipucu etiketi için kullanılır. */
export const COUNTRIES_WITH_INVENTORY = Object.keys(COUNTRY_INVENTORY)

/** Branch sırası — panel tutarlılığı için sabit görünüm düzeni. */
export const BRANCH_ORDER = ['air', 'navy', 'land', 'sam', 'space']

/** Kind → okunabilir TR etiketi. Panel rozetlerinde kullanılır. */
export const KIND_LABELS = {
  fighter:    'Savaş uçağı',
  bomber:     'Bombardıman',
  trainer:    'Eğitim',
  transport:  'Nakliye',
  helicopter: 'Helikopter',
  uav:        'İHA',
  sam:        'Hava savunma',
  radar:      'Radar',
  tank:       'Tank',
  ifv:        'Zırhlı araç',
  artillery:  'Top',
  mlrs:       'ÇNRA',
  ssm:        'Füze',
  frigate:    'Fırkateyn',
  destroyer:  'Destroyer',
  submarine:  'Denizaltı',
  corvette:   'Korvet',
  patrol:     'Karakol botu',
  amphib:     'Amfibi',
  carrier:    'Uçak gemisi',
  other:      'Diğer',
}

/** Status → UI renk + label mapping (panel rozeti) */
export const STATUS_STYLE = {
  active:      { label: 'Aktif',      color: '#38BF72' },
  reserve:     { label: 'İhtiyat',    color: '#A8A8A8' },
  maintenance: { label: 'Bakım',      color: '#D4A42C' },
  order:       { label: 'Siparişli',  color: '#5BA4D8' },
  retiring:    { label: 'Hizmet dışı', color: '#C46D5B' },
}
