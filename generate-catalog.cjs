/**
 * Tairos ürün kataloğu — Insitu/Integrator tarzı kurumsal ürün kartı.
 * Her ürün: 1 sayfa pazarlama + 1 sayfa teknik özellikler.
 * Kullanım: node generate-catalog.cjs
 */
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// ---- Palet (beyaz zemin, tek aksan) ----
const C = {
  bg:        '#FFFFFF',
  text:      '#0F172A',   // near-black slate
  textDim:   '#475569',   // muted slate
  textMute:  '#94A3B8',
  rule:      '#E2E8F0',   // hairlines
  panel:     '#F8FAFC',   // very light panel
  accent:    '#378ADD',   // marka mavi (TSK_COLOR)
  accentDk:  '#1E5FA0',
};

// ---- Ürün tanımları ----
const PRODUCTS = [
  {
    id: 'nova',
    label: 'Nova',
    category: 'İNSANSIZ HAVA ARACI',
    tagline: 'Sınıfının en çok yönlü uzun menzil\nİHA’sı — entegre SATCOM seçeneğiyle.',
    productColor: '#E06835',
    description:
      'Nova; 100 km operasyonel menzil, uzun süreli görev kapasitesi ve ' +
      '10 montaj noktasında 50 kg’a kadar modüler sensör yükü ile sınıfının ' +
      'en çok yönlü uzun menzil İHA’sıdır. Şifreli C2 ve opsiyonel SATCOM ' +
      'ile görüş ötesi, çok-sensörlü görev profillerini büyük platformlara ' +
      'gerek kalmadan mümkün kılar.',
    features: [
      {
        h: 'Dayanıklı otonomi',
        items: [
          'GPS/GNSS engelli ortamda görsel seyrüsefer',
          'RF otomatik geçiş ile dayanıklı veri bağı',
          'Tek operatörle çoklu İHA yönetimi',
          'Sert hava koşullarına dayanıklı gövde',
        ],
      },
      {
        h: 'SATCOM ve menzil',
        items: [
          'Birden fazla SATCOM seçeneği',
          'GEO ve LEO takımyıldızları ile yüksek veri',
          'Çoklu şifreleme seçenekleri',
          'Nokta-noktaya 2.000 km üzeri erişim',
        ],
      },
      {
        h: 'Her yerden konuşlanma',
        items: [
          'Mobil konteyner / pickup ile taşıma',
          '30 dk içinde kurulum ve hazır olma',
          'Ray fırlatma veya SkyHook geri alma',
          'Sabit üs veya ileri mevzi',
        ],
      },
      {
        h: 'Kanıtlanmış platform',
        items: [
          'Tropik bölgeden arktiğe operasyon zarfı',
          'Olgun yakıt motoru, güvenli ve ekonomik',
          'Yerel üretim + sürdürülebilir tedarik',
          'Entegrasyon ortakları ile hızlı teslimat',
        ],
      },
      {
        h: 'Çoklu görev esnekliği',
        items: [
          '10 montaj noktası, sahada değişebilir',
          'Gerçek MULTI-INT görev setleri',
          'EO/IR, SAR, SIGINT, EW, röle seçenekleri',
          'Müşteriye özel payload entegrasyonu',
        ],
      },
      {
        h: 'Birlikte çalışabilirlik',
        items: [
          'Açık mimari, AI görev kitlerine hazır',
          'Ortak COP — Iris ve Radar ile entegre',
          'NATO uyumlu veri formatları',
          'Mevcut komuta sistemlerine entegrasyon',
        ],
      },
    ],
    specs: {
      'BOYUT VE AĞIRLIK': [
        ['Uzunluk',                '—'],
        ['Kanat açıklığı',         '—'],
        ['Azami kalkış ağırlığı',  '—'],
        ['Azami faydalı yük',      '50 kg'],
      ],
      'PERFORMANS': [
        ['Havada kalma',           'Uzun süreli görev profili'],
        ['Servis tavanı',          '—'],
        ['Azami yatay hız',        '—'],
        ['Seyir hızı',             '—'],
        ['Motor',                  'Ağır yakıt (JP-5 / JP-8)'],
        ['Bağlanabilirlik',        'Ethernet (TCP/IP)'],
      ],
      'SENSÖR VE PAYLOAD': [
        ['EO teleskop (gündüz FMV)',    '✓'],
        ['MWIR/EO çift sensör',         '✓'],
        ['Geniş alan deniz taraması',   'opsiyonel'],
        ['Lazer işaretleyici/menzilölçer','opsiyonel'],
        ['Sentetik açıklıklı radar',    'opsiyonel'],
        ['SIGINT / EW / haberleşme röle','opsiyonel'],
      ],
      'GENİŞLETİLMİŞ MENZİL İÇİN SATCOM': [
        ['Birden fazla SATCOM seçeneği', 'GEO + LEO'],
        ['Nokta-noktaya menzil',         '2.000+ km'],
        ['500 km’de görev süresi',       'uzatılmış'],
        ['Şifreleme',                    'çoklu profil'],
      ],
    },
  },
  {
    id: 'iris',
    label: 'Iris',
    category: 'TAKTİK İNSANSIZ HAVA ARACI',
    tagline: 'Hızlı konuşlanan taktik keşif ve\ngözetleme İHA’sı.',
    productColor: '#20C8A0',
    description:
      'Iris; 50 km menzil, mobil ekiplerle sahada dağıtım ve EO/IR sensör ' +
      'paketi ile taktik keşif, hedef tespiti ve ileri gözlem görevleri için ' +
      'tasarlanmıştır. Hafif lojistik izi ve şifreli taktik veri bağı ile ' +
      'küçük ekiplerin operasyonel farkındalığını büyütür.',
    features: [
      {
        h: 'Taktik çeviklik',
        items: [
          'Küçük ekip, 2 kişilik operatör',
          'Sahada 15 dk içinde kurulum',
          'Hafif taşıma ve depolama çözümleri',
          'Düşük akustik ve termal iz',
        ],
      },
      {
        h: 'Sensör paketi',
        items: [
          'EO/IR stabilize gimbal',
          'Gündüz/gece hedef tespiti ve doğrulama',
          'Opsiyonel lazer işaretleyici',
          'Gerçek zamanlı hedef koordinatları',
        ],
      },
      {
        h: 'Güvenli veri bağı',
        items: [
          'Şifreli taktik veri bağı',
          'Düşük latanslı komuta ve video',
          'RF otomatik geçiş',
          'GNSS-engelli alanda görsel seyrüsefer',
        ],
      },
      {
        h: 'Hafif lojistik',
        items: [
          'Pickup ile mobil komuta ve kontrol',
          'Minimum hazırlık süresi',
          'Sahada sensör değişimi',
          'Düşük bakım yükü',
        ],
      },
      {
        h: 'Görev profili',
        items: [
          'Hedef tespiti ve doğrulama (BDA)',
          'Konvoy koruma ve öncü keşif',
          'Şehir içi / asimetrik operasyon',
          'Sınır ötesi nokta gözetleme',
        ],
      },
      {
        h: 'Birlikte çalışabilirlik',
        items: [
          'Ortak COP — Nova ve Radar ile entegre',
          'Radar izine hızlı yönlendirme',
          'Standart NATO mesaj formatları',
          'Mevcut C4ISR sistemlerine entegrasyon',
        ],
      },
    ],
    specs: {
      'BOYUT VE AĞIRLIK': [
        ['Uzunluk',                '—'],
        ['Kanat açıklığı',         '—'],
        ['Azami kalkış ağırlığı',  '—'],
        ['Faydalı yük',            '—'],
      ],
      'PERFORMANS': [
        ['Havada kalma',           'Taktik görev süresi'],
        ['Servis tavanı',          '—'],
        ['Azami yatay hız',        '—'],
        ['Seyir hızı',             '—'],
        ['Bağlanabilirlik',        'Şifreli taktik veri bağı'],
      ],
      'SENSÖR VE PAYLOAD': [
        ['EO/IR stabilize gimbal',       '✓'],
        ['Gündüz / gece FMV',            '✓'],
        ['Lazer işaretleyici',           'opsiyonel'],
        ['Hedef koordinat çıkışı',       '✓'],
        ['Görsel tabanlı seyrüsefer',    '✓'],
      ],
      'KONUŞLANMA': [
        ['Ekip büyüklüğü',              '2 kişi'],
        ['Kurulum süresi',              '~15 dk'],
        ['Taşıma',                      'Pickup / mobil konteyner'],
        ['Fırlatma',                    'Ray / el fırlatma'],
      ],
    },
  },
  {
    id: 'radar',
    label: 'UAV Radar',
    category: 'YER KONUŞLU HAVA SAVUNMA RADARI',
    tagline: 'Alçak irtifa İHA ve drone tehdidine\nkarşı 360° alan tarama.',
    productColor: '#22D3EE',
    description:
      'Tairos UAV Radar; 60 km tespit menzili ve 1,5–20 saniye arasında ' +
      'konfigüre edilebilir tur hızı ile düşük irtifa hava tehditlerine karşı ' +
      '360° alan taraması yapan yer konuşlu sensördür. Mini/mikro İHA ve ' +
      'sürü saldırılarına karşı havalimanı, kritik tesis ve etkinlik ' +
      'güvenliğinde erken uyarı sağlar.',
    features: [
      {
        h: '360° alan tarama',
        items: [
          'Konfigüre edilebilir tur hızı (1,5–20 s)',
          'Kesintisiz panoramik tarama',
          'Çoklu hedef takibi',
          'Gerçek zamanlı iz üretimi',
        ],
      },
      {
        h: 'Düşük RCS tespiti',
        items: [
          'Mini / mikro drone tespiti',
          'Alçak irtifa süzülen hedefler',
          'Sürü saldırı algoritması',
          'Kuş / drone ayrımı',
        ],
      },
      {
        h: 'Esnek konuşlanma',
        items: [
          'Sabit mevzi veya mobil platform',
          'Araç üstü hızlı kurulum',
          '360° mekanik veya elektronik tarama',
          'Düşük güç tüketim profili',
        ],
      },
      {
        h: 'Entegre COP',
        items: [
          'Nova / Iris ile ortak operasyon tablosu',
          'Otomatik görev emri yönlendirme',
          'Standart NATO iz mesajları',
          'Mevcut hava savunma sistemlerine entegrasyon',
        ],
      },
      {
        h: 'Erken uyarı',
        items: [
          'Havalimanı ve kritik tesis koruma',
          'VIP ve etkinlik güvenliği',
          'Sınır ve sahil hattı izleme',
          'Askeri üs çevre güvenliği',
        ],
      },
      {
        h: 'Operasyonel sadelik',
        items: [
          'Tek operatörlü çalışma',
          'Otomatik tehdit sınıflandırma',
          'Görsel ve sesli ikaz',
          'Uzak komuta merkezinden yönetim',
        ],
      },
    ],
    specs: {
      'BOYUT VE AĞIRLIK': [
        ['Anten çapı',            '—'],
        ['Sistem ağırlığı',       '—'],
        ['Güç tüketimi',          '—'],
        ['Montaj',                'Direk / araç üstü'],
      ],
      'PERFORMANS': [
        ['Tespit menzili',        '60 km'],
        ['Tarama',                '360° dönen'],
        ['Tur hızı',              '1,5 – 20 s (konfigüre edilebilir)'],
        ['İz güncelleme',         'Tur başına'],
        ['Azami yükseklik',       '—'],
      ],
      'HEDEF VE ALGILAMA': [
        ['Mini / mikro İHA',       '✓'],
        ['Alçak irtifa hedefler',  '✓'],
        ['Sürü saldırı tespiti',   '✓'],
        ['Otomatik sınıflandırma', '✓'],
        ['Kuş / drone ayrımı',     '✓'],
      ],
      'ENTEGRASYON': [
        ['Ortak COP',             'Nova / Iris ile'],
        ['Veri formatı',          'NATO uyumlu iz mesajları'],
        ['Arayüz',                'Ethernet (TCP/IP)'],
        ['Operatör',              'Tek operatör + uzak komuta'],
      ],
    },
  },
];

// ---- Ortak ----
const outPath = path.join(__dirname, 'Tairos-Katalog.pdf');
const doc = new PDFDocument({
  size: 'A4',
  margin: 0,
  info: {
    Title: 'Tairos Ürün Kataloğu',
    Author: 'Tairos',
    Subject: 'İHA ve radar ürün ailesi',
  },
});
doc.pipe(fs.createWriteStream(outPath));

// Türkçe karakter için Segoe UI (Windows yerleşik)
doc.registerFont('reg',   'C:/Windows/Fonts/segoeui.ttf');
doc.registerFont('bold',  'C:/Windows/Fonts/segoeuib.ttf');
doc.registerFont('light', 'C:/Windows/Fonts/segoeuil.ttf');

const W = doc.page.width;   // 595.28
const H = doc.page.height;  // 841.89
const M = 36;               // sayfa kenar boşluğu

// ---- Yardımcılar ----
function fillBg() {
  doc.save().rect(0, 0, W, H).fill(C.bg).restore();
}

function drawTopBar(product, pageSubtitle) {
  // Marka + kategori üstte, küçük
  doc.font('bold').fontSize(8).fillColor(C.accent)
     .text('TAIROS', M, M, { characterSpacing: 2.5 });
  doc.font('reg').fontSize(8).fillColor(C.textMute)
     .text(product.category, M + 80, M, { characterSpacing: 1.5 });

  // ince ayırıcı
  doc.moveTo(M, M + 18).lineTo(W - M, M + 18)
     .lineWidth(0.5).strokeColor(C.rule).stroke();

  // Ürün adı (büyük) — sol
  doc.font('bold').fontSize(34).fillColor(C.text)
     .text(product.label, M, M + 32, { characterSpacing: -0.5 });

  // Ürün renk aksanı (alt çizgi)
  const labelW = doc.widthOfString(product.label);
  doc.save().rect(M, M + 74, Math.min(labelW, 160), 3)
     .fill(product.productColor).restore();

  // Sağ: tagline (2 satır)
  doc.font('light').fontSize(15).fillColor(C.text)
     .text(pageSubtitle, M + 200, M + 38, {
       width: W - M - M - 200,
       align: 'right',
       lineGap: 2,
     });
}

function drawFooter(product, pageCode) {
  const y = H - 54;
  doc.moveTo(M, y).lineTo(W - M, y).lineWidth(0.5).strokeColor(C.rule).stroke();

  doc.font('bold').fontSize(8).fillColor(C.text)
     .text('LEARN MORE', M, y + 8, { continued: true })
     .font('reg').fillColor(C.textDim)
     .text(' | İletişim: solutions@tairos.com');
  doc.font('reg').fontSize(8).fillColor(C.accent)
     .text('tairos.com', M, y + 22);

  // Sağ: disclaimer + doc code
  doc.font('reg').fontSize(6).fillColor(C.textMute)
     .text(
       'Bu belge değişikliğe tabi temel pazarlama bilgilerini içerir. Teknik olmayan / idari veri.\n' +
       'Copyright © 2026 Tairos. Tüm hakları saklıdır.',
       W - M - 260, y + 8,
       { width: 260, align: 'right', lineGap: 1 }
     );
  doc.font('bold').fontSize(7).fillColor(C.textMute)
     .text(pageCode, W - M - 60, y + 34, {
       width: 60, align: 'right', characterSpacing: 1,
     });
}

// Stats bar (Insitu’nun alt metrik şeridi gibi)
function drawStatsBar(y) {
  const items = [
    ['3',         'ÜRÜN AİLESİ'],
    ['100 km',    'EN UZUN MENZİL'],
    ['360°',      'ALAN TARAMA'],
    ['ORTAK',     'OPERASYON TABLOSU'],
    ['MODÜLER',   'SENSÖR PAYLOAD'],
  ];
  const totalW = W - 2 * M;
  const cellW = totalW / items.length;

  // üst ve alt ince çizgi
  doc.moveTo(M, y).lineTo(W - M, y).lineWidth(0.5).strokeColor(C.rule).stroke();
  doc.moveTo(M, y + 56).lineTo(W - M, y + 56).lineWidth(0.5).strokeColor(C.rule).stroke();

  items.forEach((it, i) => {
    const x = M + i * cellW;
    if (i > 0) {
      doc.moveTo(x, y + 8).lineTo(x, y + 48)
         .lineWidth(0.5).strokeColor(C.rule).stroke();
    }
    doc.font('bold').fontSize(16).fillColor(C.text)
       .text(it[0], x, y + 12, { width: cellW, align: 'center' });
    doc.font('reg').fontSize(7).fillColor(C.textDim)
       .text(it[1], x, y + 36, {
         width: cellW, align: 'center', characterSpacing: 1.2,
       });
  });
}

// Ürün silueti / görsel yer tutucu (sağ üst, sade)
function drawProductVisual(product, x, y, w, h) {
  // arkaplan panel
  doc.save().rect(x, y, w, h).fill(C.panel).restore();
  doc.save().rect(x, y, w, h).lineWidth(0.5).strokeColor(C.rule).stroke().restore();

  // köşe işaretleri (teknik his)
  const L = 10;
  doc.save().lineWidth(0.75).strokeColor(C.textMute);
  doc.moveTo(x + 6, y + 6 + L).lineTo(x + 6, y + 6).lineTo(x + 6 + L, y + 6).stroke();
  doc.moveTo(x + w - 6 - L, y + 6).lineTo(x + w - 6, y + 6).lineTo(x + w - 6, y + 6 + L).stroke();
  doc.moveTo(x + 6, y + h - 6 - L).lineTo(x + 6, y + h - 6).lineTo(x + 6 + L, y + h - 6).stroke();
  doc.moveTo(x + w - 6 - L, y + h - 6).lineTo(x + w - 6, y + h - 6).lineTo(x + w - 6, y + h - 6 - L).stroke();
  doc.restore();

  const cx = x + w / 2;
  const cy = y + h / 2;

  if (product.id === 'radar') {
    // Radar: iç içe çemberler + tarama kesiti
    doc.save().strokeColor(C.rule).lineWidth(0.5);
    [20, 40, 60, 80].forEach((r) => doc.circle(cx, cy, r).stroke());
    // çapraz
    doc.moveTo(cx - 80, cy).lineTo(cx + 80, cy).stroke();
    doc.moveTo(cx, cy - 80).lineTo(cx, cy + 80).stroke();
    doc.restore();
    // Tarama kesiti
    doc.save().fillOpacity(0.25).fillColor(product.productColor);
    doc.moveTo(cx, cy)
       .lineTo(cx + 80, cy)
       .arc ? null : null;
    // Path-based wedge
    doc.path(`M ${cx} ${cy} L ${cx + 80} ${cy} A 80 80 0 0 0 ${cx + 80 * Math.cos(-Math.PI/3)} ${cy + 80 * Math.sin(-Math.PI/3)} Z`)
       .fill();
    doc.restore();
    // Merkez nokta
    doc.save().circle(cx, cy, 3).fill(product.productColor).restore();
  } else {
    // Nova / Iris: stilize sabit kanat siluet
    const s = product.id === 'nova' ? 1.0 : 0.75;
    doc.save().fillColor(product.productColor);
    // kanat (yatay ince dikdörtgen)
    const wingW = 130 * s, wingH = 6;
    doc.rect(cx - wingW / 2, cy - wingH / 2, wingW, wingH).fill();
    // gövde (dikey uzun)
    const fuseW = 8, fuseH = 70 * s;
    doc.rect(cx - fuseW / 2, cy - fuseH / 2, fuseW, fuseH).fill();
    // burun üçgen
    doc.moveTo(cx - fuseW / 2, cy - fuseH / 2)
       .lineTo(cx + fuseW / 2, cy - fuseH / 2)
       .lineTo(cx, cy - fuseH / 2 - 12 * s).fill();
    // kuyruk V
    doc.rect(cx - 20 * s, cy + fuseH / 2 - 4, 40 * s, 3).fill();
    doc.restore();
  }
}

// ---- SAYFA: Pazarlama ----
function drawMarketingPage(product, pageCode) {
  fillBg();
  const tagline1 = product.tagline.split('\n')[0];
  const tagline2 = product.tagline.split('\n')[1] || '';
  drawTopBar(product, product.tagline);

  // İçerik başlangıcı
  const contentY = M + 96;
  const leftW = 200;
  const rightX = M + leftW + 24;
  const rightW = W - rightX - M;

  // SOL SÜTUN: açıklama + iletişim
  doc.font('reg').fontSize(10).fillColor(C.text)
     .text(product.description, M, contentY, {
       width: leftW, lineGap: 2.5, align: 'justify',
     });

  // SAĞ ÜST: görsel
  const visH = 170;
  drawProductVisual(product, rightX, contentY, rightW, visH);

  // SAĞ ALT: KEY FEATURES & BENEFITS
  const featY = contentY + visH + 20;
  doc.font('bold').fontSize(10).fillColor(C.text)
     .text('TEMEL ÖZELLİKLER VE FAYDALAR', rightX, featY, {
       width: rightW, align: 'center', characterSpacing: 2,
     });
  doc.moveTo(rightX, featY + 18).lineTo(rightX + rightW, featY + 18)
     .lineWidth(0.5).strokeColor(C.rule).stroke();

  // 6 özellik — 2 sütun × 3 satır
  const fStartY = featY + 30;
  const colGap = 16;
  const colW = (rightW - colGap) / 2;
  const rowH = 95;

  product.features.forEach((f, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = rightX + col * (colW + colGap);
    const y = fStartY + row * rowH;

    // Başlık
    doc.font('bold').fontSize(10).fillColor(C.accent)
       .text(f.h, x, y, { width: colW });
    // ince alt çizgi
    doc.moveTo(x, y + 14).lineTo(x + 24, y + 14)
       .lineWidth(1).strokeColor(product.productColor).stroke();

    // Bullets
    let by = y + 22;
    f.items.forEach((it) => {
      // küçük nokta
      doc.save().circle(x + 3, by + 4, 1.2).fill(C.textDim).restore();
      doc.font('reg').fontSize(8).fillColor(C.textDim)
         .text(it, x + 10, by, { width: colW - 10, lineGap: 1 });
      const h = doc.heightOfString(it, { width: colW - 10, lineGap: 1 });
      by += h + 3;
    });
  });

  // Stats bar — en altta (footer üstünde)
  drawStatsBar(H - 54 - 14 - 56);

  drawFooter(product, pageCode);
}

// ---- SAYFA: Specs ----
function drawSpecsPage(product, pageCode) {
  fillBg();
  drawTopBar(product, 'Teknik özellikler ve\nkonfigürasyon seçenekleri.');

  // SPECIFICATIONS header
  const specHdrY = M + 96;
  doc.font('bold').fontSize(11).fillColor(C.text)
     .text('T E K N İ K   Ö Z E L L İ K L E R', M, specHdrY, {
       width: W - 2 * M, align: 'center', characterSpacing: 3,
     });
  doc.moveTo(M, specHdrY + 22).lineTo(W - M, specHdrY + 22)
     .lineWidth(0.5).strokeColor(C.rule).stroke();

  // Büyük görsel
  const visY = specHdrY + 38;
  const visH = 200;
  drawProductVisual(product, M, visY, W - 2 * M, visH);

  // KONFIG KUTUSU — görselin üstünde sol-üst köşe
  const kitY = visY + 12;
  const kitX = M + 16;
  doc.save().rect(kitX, kitY, 200, 52).fill('#FFFFFF').restore();
  doc.save().rect(kitX, kitY, 3, 52).fill(product.productColor).restore();
  doc.font('bold').fontSize(9).fillColor(C.text)
     .text(product.id === 'radar' ? 'MOBİL KONUŞLANMA' :
           product.id === 'iris'  ? 'TAKTİK PAKET' : 'SATCOM KİT',
           kitX + 12, kitY + 8, { characterSpacing: 1 });
  doc.font('reg').fontSize(8).fillColor(C.textDim)
     .text(
       product.id === 'radar' ? 'Araç üstü / direk montajı, hızlı kurulum' :
       product.id === 'iris'  ? '2 kişilik ekip · pickup ile mobil C2' :
                                'Uzun menzil genişletme, GEO+LEO',
       kitX + 12, kitY + 24, { width: 186, lineGap: 1 }
     );

  // 4-SÜTUN SPECS
  const specsY = visY + visH + 24;
  const specEntries = Object.entries(product.specs);
  const nCols = specEntries.length;
  const gap = 14;
  const colW = (W - 2 * M - (nCols - 1) * gap) / nCols;

  specEntries.forEach(([section, rows], i) => {
    const x = M + i * (colW + gap);

    // Bölüm başlığı
    doc.font('bold').fontSize(9).fillColor(C.accent)
       .text(section, x, specsY, { width: colW, characterSpacing: 1.2 });
    doc.moveTo(x, specsY + 16).lineTo(x + 24, specsY + 16)
       .lineWidth(1.2).strokeColor(product.productColor).stroke();

    let ry = specsY + 26;
    rows.forEach(([k, v]) => {
      doc.font('reg').fontSize(8).fillColor(C.textDim)
         .text(k, x, ry, { width: colW, lineGap: 1 });
      const kh = doc.heightOfString(k, { width: colW, lineGap: 1 });
      ry += kh + 1;
      doc.font('bold').fontSize(9).fillColor(C.text)
         .text(v, x, ry, { width: colW, lineGap: 1 });
      const vh = doc.heightOfString(v, { width: colW, lineGap: 1 });
      ry += vh + 8;
    });
  });

  // Stats bar
  drawStatsBar(H - 54 - 14 - 56);

  drawFooter(product, pageCode);
}

// ---- KAPAK ----
function drawCover() {
  fillBg();

  // Üst marka
  doc.font('bold').fontSize(10).fillColor(C.accent)
     .text('TAIROS', M, M, { characterSpacing: 3 });
  doc.font('reg').fontSize(8).fillColor(C.textMute)
     .text('ÜRÜN KATALOĞU · 2026', 0, M, {
       width: W - M, align: 'right', characterSpacing: 1.5,
     });
  doc.moveTo(M, M + 18).lineTo(W - M, M + 18)
     .lineWidth(0.5).strokeColor(C.rule).stroke();

  // Ana başlık
  doc.font('light').fontSize(44).fillColor(C.text)
     .text('Havadan', M, 150, { characterSpacing: -0.5 });
  doc.font('bold').fontSize(44).fillColor(C.text)
     .text('durumsal farkındalık.', M, 200, { characterSpacing: -0.5 });
  // accent bar
  doc.save().rect(M, 258, 80, 4).fill(C.accent).restore();

  // Alt başlık
  doc.font('reg').fontSize(12).fillColor(C.textDim)
     .text(
       'Nova uzun menzilli devriye yapar. Iris taktik keşifle hedef doğrular.\n' +
       'UAV Radar alçak irtifa hava sahasını tarar. Hepsi aynı operasyon tablosunda.',
       M, 282, { width: W - 2 * M, lineGap: 4 }
     );

  // Ürün satırları
  let y = 400;
  PRODUCTS.forEach((p) => {
    // Ürün adı + renk şeridi
    doc.save().rect(M, y, 4, 40).fill(p.productColor).restore();

    doc.font('bold').fontSize(20).fillColor(C.text)
       .text(p.label, M + 16, y + 2);
    doc.font('reg').fontSize(9).fillColor(C.textMute)
       .text(p.category, M + 16, y + 26, { characterSpacing: 1.2 });

    // Sağ: menzil
    const rangeStr = p.id === 'radar'
      ? '60 km · 360°'
      : `${p.id === 'nova' ? '100' : '50'} km`;
    doc.font('bold').fontSize(14).fillColor(p.productColor)
       .text(rangeStr, 0, y + 8, {
         width: W - M, align: 'right',
       });

    // ince alt çizgi
    doc.moveTo(M, y + 50).lineTo(W - M, y + 50)
       .lineWidth(0.5).strokeColor(C.rule).stroke();
    y += 62;
  });

  // Stats bar
  drawStatsBar(H - 54 - 14 - 56);

  // Footer
  const fy = H - 54;
  doc.moveTo(M, fy).lineTo(W - M, fy).lineWidth(0.5).strokeColor(C.rule).stroke();
  doc.font('bold').fontSize(8).fillColor(C.text)
     .text('LEARN MORE', M, fy + 8, { continued: true })
     .font('reg').fillColor(C.textDim)
     .text(' | İletişim: solutions@tairos.com');
  doc.font('reg').fontSize(8).fillColor(C.accent)
     .text('tairos.com', M, fy + 22);
  doc.font('bold').fontSize(7).fillColor(C.textMute)
     .text('DU-TAIROS-2026', W - M - 100, fy + 34, {
       width: 100, align: 'right', characterSpacing: 1,
     });
}

// ---- Oluştur ----
drawCover();
PRODUCTS.forEach((p, i) => {
  doc.addPage({ size: 'A4', margin: 0 });
  drawMarketingPage(p, `DU-${p.id.toUpperCase()}-M`);
  doc.addPage({ size: 'A4', margin: 0 });
  drawSpecsPage(p, `DU-${p.id.toUpperCase()}-S`);
});

doc.end();
doc.on('end', () => console.log('OK ->', outPath));
