/*
 * One-shot migration that attaches a `forces` block to every conflict
 * entry in src/data/conflicts.json. Rough order-of-magnitude figures
 * drawn from public reporting (IISS Military Balance, SIPRI, ISW / MEMRI /
 * UN-OCHA pressers, think-tank estimates). Intended for the intel panel's
 * "Silahlı Kuvvet Tahmini" card — not an official OOB — so every entry
 * carries a `source` hint and the estimates stay deliberately fuzzy.
 *
 * Safe to re-run: it keys by conflict id and overwrites the `forces`
 * field only for known ids, leaving the rest of the record alone.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataPath  = path.resolve(__dirname, '..', 'src', 'data', 'conflicts.json')

const FORCES = {
  'ukraine-russia': {
    sideA: {
      label: 'Ukrayna SK + Terr. Savunma',
      estimate: '≈900.000',
      breakdown: [
        { kind: 'aktif',    value: '≈600k' },
        { kind: 'terr. sav.', value: '≈250k' },
        { kind: 'yabancı lejyon', value: '≈20k' },
      ],
      note: 'genel seferberlik altında',
    },
    sideB: {
      label: 'Rusya SK + paralı güçler',
      estimate: '≈700.000 teatrede',
      breakdown: [
        { kind: 'teatrede',   value: '≈470k' },
        { kind: 'LDNR / milis', value: '≈40k' },
        { kind: 'PMC (Wagner+)', value: '≈15k' },
      ],
      note: 'rotasyonla beslenen cephe',
    },
    asOf: '2024 Q4',
    source: 'IISS / ISW kamu raporları',
  },

  'gaza-israel': {
    sideA: {
      label: 'IDF (Gazze operasyon grubu)',
      estimate: '≈70.000',
      breakdown: [
        { kind: 'kara tümeni',  value: '4-5' },
        { kind: 'yedek',        value: '≈300k aktif' },
      ],
      note: 'Güney Komutanlığı + rotasyonlu tümenler',
    },
    sideB: {
      label: 'Hamas + PIJ (silahlı kanat)',
      estimate: '≈25.000',
      breakdown: [
        { kind: 'Kassam tugayı', value: '≈20k' },
        { kind: 'Kudüs tugayı (PIJ)', value: '≈5k' },
      ],
      note: 'tünel-tabanlı hücre yapısı',
    },
    asOf: '2024',
    source: 'IDF brifingleri + ISW',
  },

  'lebanon-israel': {
    sideA: {
      label: 'IDF Kuzey Komutanlığı',
      estimate: '≈50.000',
      breakdown: [
        { kind: 'aktif tümen', value: '2-3' },
        { kind: 'yedek çağrılı', value: '≈60k' },
      ],
    },
    sideB: {
      label: 'Hizbullah',
      estimate: '≈40.000-50.000',
      breakdown: [
        { kind: 'Radvan (özel)', value: '≈2.5k' },
        { kind: 'aktif milis',    value: '≈25k' },
        { kind: 'yedek',          value: '≈20k' },
      ],
      note: 'İran destekli / füze arsenali',
    },
    asOf: '2024',
    source: 'IISS + Alma Research',
  },

  'iran-usa': {
    sideA: {
      label: 'CENTCOM bölgesel unsurlar',
      estimate: '≈40.000',
      breakdown: [
        { kind: 'körfez üsleri', value: '≈30k' },
        { kind: 'deniz (5. Filo)', value: '≈7k' },
        { kind: 'müttefik (UK/FR)', value: '≈3k' },
      ],
    },
    sideB: {
      label: 'İran SK + IRGC + vekiller',
      estimate: '≈1.000.000+',
      breakdown: [
        { kind: 'Artesh',   value: '≈420k' },
        { kind: 'IRGC',     value: '≈190k' },
        { kind: 'Besic yedek', value: '≈600k seferber' },
      ],
      note: 'düşük yoğunluklu vekâlet çatışması',
    },
    asOf: '2024',
    source: 'IISS Military Balance',
  },

  'iraq-proxy': {
    sideA: {
      label: 'ABD/koalisyon + Irak Güv. Kuv.',
      estimate: '≈200.000',
      breakdown: [
        { kind: 'Irak ordusu',    value: '≈180k' },
        { kind: 'ABD + koalisyon', value: '≈2.5k' },
      ],
    },
    sideB: {
      label: 'Haşdi Şabi / İran vekilleri',
      estimate: '≈150.000',
      breakdown: [
        { kind: 'PMF aktif', value: '≈100k' },
        { kind: 'radikal gruplar', value: '≈20k' },
      ],
      note: 'Keta\'ib Hizballah, Asa\'ib Ahl al-Haq vd.',
    },
    asOf: '2024',
    source: 'ISW + BBC Monitoring',
  },

  'syria-civil': {
    sideA: {
      label: 'Rejim + müttefikler',
      estimate: '≈170.000',
      breakdown: [
        { kind: 'SAA',          value: '≈130k' },
        { kind: 'NDF milisleri', value: '≈30k' },
        { kind: 'İran/Rusya danışman', value: '≈8k' },
      ],
    },
    sideB: {
      label: 'Muhalefet + SDG + HTŞ',
      estimate: '≈120.000',
      breakdown: [
        { kind: 'SMO (TR destekli)', value: '≈50k' },
        { kind: 'HTŞ (İdlib)',       value: '≈30k' },
        { kind: 'SDG / YPG',         value: '≈60k' },
      ],
      note: 'parçalı cephe — birbirleriyle de çatışıyor',
    },
    asOf: '2024',
    source: 'ISW + Carter Center',
  },

  'sudan-civil': {
    sideA: {
      label: 'SAF (Sudan Silahlı Kuv.)',
      estimate: '≈200.000',
    },
    sideB: {
      label: 'RSF (Hızlı Destek Kuv.)',
      estimate: '≈100.000',
      note: 'Darfur çekirdeği + paralı kaynaklar',
    },
    asOf: '2024',
    source: 'IISS + Sudan War Monitor',
  },

  'yemen': {
    sideA: {
      label: 'Yemen Hükümeti + koalisyon',
      estimate: '≈150.000',
      breakdown: [
        { kind: 'hükümet gücü',  value: '≈70k' },
        { kind: 'S. Geçiş Kons.', value: '≈50k' },
        { kind: 'Suudi destek',   value: 'hava+lojistik' },
      ],
    },
    sideB: {
      label: 'Husi Hareketi (Ensarullah)',
      estimate: '≈200.000',
      breakdown: [
        { kind: 'aktif savaşçı', value: '≈100k' },
        { kind: 'milis rezervi', value: '≈100k' },
      ],
      note: 'Kızıldeniz füze/İHA kapasitesi',
    },
    asOf: '2024',
    source: 'ACLED + UN panel',
  },

  'myanmar': {
    sideA: {
      label: 'Tatmadaw (cunta)',
      estimate: '≈150.000',
    },
    sideB: {
      label: 'PDF + Etnik Direniş Örg.',
      estimate: '≈100.000+',
      breakdown: [
        { kind: 'PDF',  value: '≈65k' },
        { kind: 'KIA / AA / TNLA vd.', value: '≈40k' },
      ],
      note: '1027 Operasyonu sonrası artan koordinasyon',
    },
    asOf: '2024',
    source: 'ISP Myanmar + Reuters',
  },

  'dprk-drc-east': {
    sideA: {
      label: 'FARDC + MONUSCO + SAMIDRC',
      estimate: '≈130.000',
      breakdown: [
        { kind: 'FARDC',     value: '≈120k' },
        { kind: 'SAMIDRC (SADC)', value: '≈5k' },
      ],
    },
    sideB: {
      label: 'M23 + Ruanda destekli',
      estimate: '≈10.000-15.000',
      note: 'BM panelleri: Ruanda birliği de muharebede',
    },
    asOf: '2024',
    source: 'BM DRC Uzman Paneli',
  },

  'libya': {
    sideA: {
      label: 'GNU / Trablus (batı)',
      estimate: '≈40.000',
      note: 'TR + Katar destekli milisler',
    },
    sideB: {
      label: 'LAAF (Hafter / doğu)',
      estimate: '≈25.000',
      note: 'Rus Afrika Kolordusu (eski Wagner) desteği',
    },
    asOf: '2024',
    source: 'UNSMIL + IISS',
  },

  'sahel': {
    sideA: {
      label: 'Cunta yönetimleri + Rus AK',
      estimate: '≈80.000',
      breakdown: [
        { kind: 'Mali FAMa',  value: '≈30k' },
        { kind: 'Burkina',     value: '≈25k' },
        { kind: 'Nijer',       value: '≈20k' },
        { kind: 'Afrika Kolordusu', value: '≈1.5k' },
      ],
    },
    sideB: {
      label: 'JNIM + ISGS (cihatçı)',
      estimate: '≈6.000-10.000',
      note: 'JNIM: el-Kaide bağlantılı · ISGS: IŞİD',
    },
    asOf: '2024',
    source: 'ACLED + ISS Africa',
  },

  'kashmir': {
    sideA: {
      label: 'Hindistan (IA + RR + CRPF)',
      estimate: '≈500.000',
      breakdown: [
        { kind: 'Ordu + Rashtriya Rifles', value: '≈300k' },
        { kind: 'CRPF + paramiliter',      value: '≈200k' },
      ],
    },
    sideB: {
      label: 'Pakistan (PA) + militanlar',
      estimate: '≈250.000',
      breakdown: [
        { kind: 'X Kor + Kuzey',  value: '≈200k' },
        { kind: 'Militan örgütler', value: '≈5-10k' },
      ],
    },
    asOf: '2024',
    source: 'IISS + MoD brifingleri',
  },

  'taiwan-strait': {
    sideA: {
      label: 'Tayvan (ROC)',
      estimate: '≈170.000 aktif',
      breakdown: [
        { kind: 'aktif',  value: '≈170k' },
        { kind: 'yedek',   value: '≈1.65M' },
      ],
    },
    sideB: {
      label: 'ÇHC — PLA Doğu Tiyatro K.',
      estimate: '≈400.000 (tiyatroda)',
      breakdown: [
        { kind: 'tümen/deniz/hava', value: '≈400k' },
        { kind: 'PLA toplam',       value: '≈2M' },
      ],
      note: 'çıkarma için kritik eşik: amfibi kapasite',
    },
    asOf: '2024',
    source: 'US DoD China Report',
  },

  'caucasus': {
    sideA: {
      label: 'Azerbaycan SK',
      estimate: '≈125.000',
    },
    sideB: {
      label: 'Ermenistan SK',
      estimate: '≈45.000',
      note: '2020+2023 sonrası ciddi kayıp/yer değişimi',
    },
    asOf: '2024',
    source: 'IISS Military Balance',
  },

  'somalia-shabaab': {
    sideA: {
      label: 'SNA + ATMIS/AUSSOM + TR',
      estimate: '≈50.000',
      breakdown: [
        { kind: 'Somali ordusu (SNA)', value: '≈30k' },
        { kind: 'ATMIS (AB)',          value: '≈17k' },
        { kind: 'TURKSOM mezunu',      value: '≈5k' },
      ],
      note: 'TURKSOM kampında Gorgor/Haramcad tugayları yetişiyor',
    },
    sideB: {
      label: 'el-Şebab + IŞİD-Somali',
      estimate: '≈7.000-12.000',
      breakdown: [
        { kind: 'el-Şebab',     value: '≈7-12k' },
        { kind: 'IŞİD-Somali',  value: '≈300' },
      ],
    },
    asOf: '2024',
    source: 'UN Panel of Experts + AFRICOM',
  },

  'serbia-kosovo': {
    sideA: {
      label: 'Kosova KGK + KFOR',
      estimate: '≈12.000',
      breakdown: [
        { kind: 'KGK (Kosova)',  value: '≈5k' },
        { kind: 'KFOR (NATO)',   value: '≈4.6k' },
      ],
    },
    sideB: {
      label: 'Sırbistan SK',
      estimate: '≈25.000',
      note: 'sınır birlikleri + hızlı reaksiyon',
    },
    asOf: '2024',
    source: 'NATO KFOR + IISS',
  },

  'cyprus-division': {
    sideA: {
      label: 'Kıbrıs Ulusal Muh. + Yunan birl.',
      estimate: '≈15.000',
      breakdown: [
        { kind: 'GKRY Ulusal Muhafız', value: '≈12k' },
        { kind: 'ELDYK (Yunan)',       value: '≈1k' },
      ],
    },
    sideB: {
      label: 'TSK Kıbrıs Kolordusu + KTBK',
      estimate: '≈40.000',
      breakdown: [
        { kind: 'TSK (KTK)',     value: '≈35k' },
        { kind: 'KKTC Güv. Kuv.', value: '≈3k' },
      ],
    },
    asOf: '2024',
    source: 'IISS + Kıbrıs MoD',
  },

  'korean-dmz': {
    sideA: {
      label: 'Güney Kore + USFK',
      estimate: '≈580.000',
      breakdown: [
        { kind: 'ROKA',  value: '≈555k' },
        { kind: 'USFK',  value: '≈28.5k' },
      ],
    },
    sideB: {
      label: 'Kuzey Kore (KPA)',
      estimate: '≈1.280.000',
      note: 'dünyanın 4. en büyük ordusu · topçu yoğunluklu',
    },
    asOf: '2024',
    source: 'ROK MND + IISS',
  },

  'south-china-sea': {
    sideA: {
      label: 'Filipinler + ABD müttefikleri',
      estimate: '≈150.000',
      breakdown: [
        { kind: 'AFP (Filipinler)', value: '≈145k' },
        { kind: 'ABD rotasyon',     value: '≈5k' },
      ],
    },
    sideB: {
      label: 'ÇHC — Güney Tiyatro K. + CCG',
      estimate: '≈300.000+',
      breakdown: [
        { kind: 'PLA Güney T.',  value: '≈250k' },
        { kind: 'Sahil Güv. (CCG)', value: '≈40k' },
        { kind: 'PAFMM milis',   value: 'belirsiz' },
      ],
      note: 'gri bölge: balıkçı milis gemileri',
    },
    asOf: '2024',
    source: 'CSIS AMTI + DoD',
  },

  'transnistria': {
    sideA: {
      label: 'Moldova SK',
      estimate: '≈6.000',
    },
    sideB: {
      label: 'Transdinyester + Rus OGRF',
      estimate: '≈8.000',
      breakdown: [
        { kind: 'Transd. milisi', value: '≈6.5k' },
        { kind: 'Rus OGRF',       value: '≈1.5k' },
      ],
      note: 'Cobasna mühimmat deposu bekçisi',
    },
    asOf: '2024',
    source: 'IISS + Moldovan MoD',
  },

  'gerd-nile': {
    sideA: {
      label: 'Mısır SK',
      estimate: '≈440.000',
    },
    sideB: {
      label: 'Etiyopya SK (ENDF)',
      estimate: '≈160.000',
      note: 'Tigray sonrası yeniden yapılandırma',
    },
    asOf: '2024',
    source: 'IISS Military Balance',
  },

  'western-sahara': {
    sideA: {
      label: 'Fas Kraliyet SK',
      estimate: '≈200.000',
      note: 'Berm (kum duvarı) boyunca yoğun konuş',
    },
    sideB: {
      label: 'Polisario (SADR)',
      estimate: '≈5.000-6.000',
      note: 'Cezayir Tindouf\'tan desteklenen gerilla',
    },
    asOf: '2024',
    source: 'MINURSO + IISS',
  },

  'pakistan-ttp': {
    sideA: {
      label: 'Pakistan SK + Frontier Corps',
      estimate: '≈200.000',
      breakdown: [
        { kind: 'PA birlikleri', value: '≈150k' },
        { kind: 'Frontier Corps', value: '≈50k' },
      ],
    },
    sideB: {
      label: 'TTP + bağlı örgütler',
      estimate: '≈6.000-8.000',
      note: 'Afganistan sınır boyu hücre yapısı',
    },
    asOf: '2024',
    source: 'Pakistan MoI + UN 1267 raporları',
  },

  'nigeria-lakechad': {
    sideA: {
      label: 'MNJTF (NG/NE/TD/CM/BJ)',
      estimate: '≈10.000',
      breakdown: [
        { kind: 'Nijerya dilimi',  value: '≈3.5k' },
        { kind: 'Çad dilimi',      value: '≈3k' },
        { kind: 'diğer üyeler',    value: '≈3.5k' },
      ],
    },
    sideB: {
      label: 'Boko Haram + ISWAP',
      estimate: '≈8.000-12.000',
      breakdown: [
        { kind: 'ISWAP',    value: '≈5-6k' },
        { kind: 'JAS (BH)', value: '≈3-4k' },
      ],
    },
    asOf: '2024',
    source: 'MNJTF + ICG raporları',
  },

  'mozambique-cabo-delgado': {
    sideA: {
      label: 'FADM + SAMIM + Ruanda RDF',
      estimate: '≈8.000',
      breakdown: [
        { kind: 'Mozambik FADM', value: '≈3k' },
        { kind: 'Ruanda RDF',    value: '≈2.5k' },
        { kind: 'SAMIM (SADC)',  value: '≈1.5k (çekilme)' },
      ],
    },
    sideB: {
      label: 'IŞİD-Mozambik (Ashabah)',
      estimate: '≈1.500-2.500',
      note: 'IŞİD Orta Afrika Vilayeti bayrağı altında',
    },
    asOf: '2024',
    source: 'ACLED + Cabo Ligado',
  },

  'venezuela-guyana': {
    sideA: {
      label: 'Guyana GDF + UK/ABD desteği',
      estimate: '≈5.000',
      note: 'UK Kraliyet Donanması ziyaret + ABD tatbikatları',
    },
    sideB: {
      label: 'Venezuela FANB',
      estimate: '≈125.000',
      breakdown: [
        { kind: 'FANB aktif',  value: '≈125k' },
        { kind: 'milis',       value: '≈220k kayıtlı' },
      ],
    },
    asOf: '2024',
    source: 'IISS + SOUTHCOM',
  },

  'aegean-easternmed': {
    sideA: {
      label: 'Türkiye SK',
      estimate: '≈355.000 aktif',
      breakdown: [
        { kind: 'Ege Ordusu', value: '4. Kor + deniz/hava' },
        { kind: 'yedek',       value: '≈380k' },
      ],
    },
    sideB: {
      label: 'Yunanistan + GKRY + müttefik mev.',
      estimate: '≈130.000',
      breakdown: [
        { kind: 'Yunan SK',  value: '≈110k' },
        { kind: 'GKRY UM',    value: '≈12k' },
      ],
    },
    asOf: '2024',
    source: 'IISS Military Balance',
  },
}

const raw = readFileSync(dataPath, 'utf8')
const conflicts = JSON.parse(raw)

let patched = 0
conflicts.forEach((c) => {
  const f = FORCES[c.id]
  if (!f) return
  c.forces = f
  patched += 1
})

writeFileSync(dataPath, JSON.stringify(conflicts, null, 2) + '\n', 'utf8')
console.log(`patched ${patched}/${conflicts.length} conflict entries with force estimates`)
