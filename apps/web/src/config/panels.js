/**
 * Panel kayıt merkezi — Activity Bar'da hangi panellerin göründüğünün,
 * her birinin kimliği / simgesi / etiketi ne olduğunun TEK kaynağı.
 *
 * Katmanlı IA:
 *
 *   ┌─ GLOBAL  (ülke/çatışma seçilmemiş) ──────────────────────────
 *   │    PRIMARY   : Dünya
 *   │    SECONDARY : Sistemler, Saha, Operasyon, Envanter,
 *   │                Asistan, Uyarılar, Ayarlar
 *   │
 *   ├─ COUNTRY (ülke odağı aktif) ─────────────────────────────────
 *   │    PRIMARY   : Durum, Envanter (ülke), Kritik (ülke),
 *   │                Rakipler (ülke), Dünya
 *   │    SECONDARY : Sistemler, Saha, Asistan, Uyarılar, Ayarlar
 *   │
 *   └─ CONFLICT (çatışma odağı aktif) ─────────────────────────────
 *        PRIMARY   : Durum, Kuvvetler, Tehditler, Haberler, Zaman
 *        SECONDARY : Asistan, Uyarılar, Ayarlar
 *
 * Tasarım kararı (kullanıcı geri bildirimi):
 *   "genel halde sistemlerin yeri yok mesela" — Sistemler/Saha artık
 *   secondary. Ülke/çatışma seçince contextual panel'ler primary'ye
 *   çıkar; dünya katmanı her yerde elaltı kalsın diye "Dünya"
 *   country ve conflict'te de primary listelerinde tutulur.
 *
 * Şema (tek panel girdisi):
 *   id           : string — store.activePanelId bu değeri set eder
 *   icon         : lucide component
 *   label        : kısa TR ad (8 karakterden kısa)
 *   title        : TopBar altlık açıklaması
 *   section      : 'primary' | 'secondary'
 *   placeholder? : true → PanelStub fallback
 *   subPanels?   : [{id,label}, ...] — panel içi sekmeler
 *   scope        : 'global' | 'country' | 'conflict' (hangi katmanda gösterilir)
 *
 * resolvePanels(appMode, countryFocus):
 *   ActivityBar bu yardımcıyı çağırır — moda göre doğru listeyi verir.
 */
import {
  Cpu, Globe2, Flame,
  Target, Shield, Radio, Newspaper, Clock,
  ClipboardList, Boxes, Bell, Settings,
  Building2, Swords, AlertTriangle,
  Bot,
} from 'lucide-react'

/* ═══════════════════════════════════════════════════════════════════
 * GLOBAL katman — hiçbir odak yokken (pure world view)
 * ═══════════════════════════════════════════════════════════════════ */
export const GLOBAL_PANELS = [
  /* PRIMARY — ana çalışma */
  {
    id:      'intel',
    icon:    Flame,
    label:   'Dünya',
    title:   'Çatışmalar, küresel üsler, kuvvetler',
    section: 'primary',
    scope:   'global',
  },

  /* SECONDARY — destek araçları */
  {
    id:      'platform',
    icon:    Cpu,
    label:   'Sistemler',
    title:   'Tairos sistemleri ve yerleştirme',
    section: 'secondary',
    scope:   'global',
  },
  {
    id:      'field',
    icon:    Globe2,
    label:   'Saha',
    title:   'Varlıklar, nodes, gruplar',
    section: 'secondary',
    scope:   'global',
  },
  {
    id:          'operations',
    icon:        ClipboardList,
    label:       'Operasyon',
    title:       'Görev planlama ve kontrol',
    section:     'secondary',
    scope:       'global',
    placeholder: true,
  },
  {
    id:          'assets',
    icon:        Boxes,
    label:       'Envanter',
    title:       'Asset envanteri ve durumu',
    section:     'secondary',
    scope:       'global',
    placeholder: true,
  },
  // NOT: 'assistant' eski panel olarak buradaydı. Sentinel AI artık
  // AssistantBubble (sağ-alt yüzen widget) üzerinden açılıyor, sidebar
  // slotunu kaplamıyor. Geri getirmek istersek panel tanımı + PanelHost
  // kaydı + ActivityBar ikonu birlikte canlanır.
  {
    id:      'agents',
    icon:    Bot,
    label:   'Ajanlar',
    title:   'Ajan konsolu — inventory_analyst + gelecek LLM ajanları',
    section: 'secondary',
    scope:   'global',
  },
  {
    id:          'alerts',
    icon:        Bell,
    label:       'Uyarılar',
    title:       'Delta bildirimleri',
    section:     'secondary',
    scope:       'global',
    placeholder: true,
  },
  {
    id:          'settings',
    icon:        Settings,
    label:       'Ayarlar',
    title:       'Uygulama ayarları',
    section:     'secondary',
    scope:       'global',
    placeholder: true,
  },
]

/* ═══════════════════════════════════════════════════════════════════
 * COUNTRY katman — ülke odağı aktifken eklenen contextual paneller
 * ═══════════════════════════════════════════════════════════════════ */
export const COUNTRY_PANELS = [
  /* PRIMARY — ülke odaklı iş alanları */
  {
    id:      'country-brief',
    icon:    Target,
    label:   'Durum',
    title:   'Ülke özeti ve temel göstergeler',
    section: 'primary',
    scope:   'country',
  },
  {
    id:      'country-inventory',
    icon:    Boxes,
    label:   'Envanter',
    title:   'Ülke envanteri — hava/deniz/kara/hava savunma',
    section: 'primary',
    scope:   'country',
  },
  {
    id:      'country-critical',
    icon:    Building2,
    label:   'Kritik',
    title:   'Ülkenin kritik tesisleri ve stratejik düğümler',
    section: 'primary',
    scope:   'country',
  },
  {
    id:      'country-rivals',
    icon:    Swords,
    label:   'Rakipler',
    title:   'Rakip ülkeler, çatışma tarafları, düşman üsleri',
    section: 'primary',
    scope:   'country',
  },
  {
    id:      'intel',
    icon:    Flame,
    label:   'Dünya',
    title:   'Dünya katmanına dön',
    section: 'primary',
    scope:   'country',
  },

  /* SECONDARY — ülke odağında da elaltı araçlar */
  {
    id:      'platform',
    icon:    Cpu,
    label:   'Sistemler',
    title:   'Tairos sistemleri ve yerleştirme',
    section: 'secondary',
    scope:   'country',
  },
  {
    id:      'field',
    icon:    Globe2,
    label:   'Saha',
    title:   'Varlıklar, nodes, gruplar',
    section: 'secondary',
    scope:   'country',
  },
  // assistant → AssistantBubble (yüzen widget) — panel sekmesi yok
  {
    id:      'agents',
    icon:    Bot,
    label:   'Ajanlar',
    title:   'Ajan konsolu — ülke odağında da elaltı',
    section: 'secondary',
    scope:   'country',
  },
  {
    id:          'alerts',
    icon:        Bell,
    label:       'Uyarılar',
    title:       'Delta bildirimleri',
    section:     'secondary',
    scope:       'country',
    placeholder: true,
  },
  {
    id:          'settings',
    icon:        Settings,
    label:       'Ayarlar',
    title:       'Uygulama ayarları',
    section:     'secondary',
    scope:       'country',
    placeholder: true,
  },
]

/* ═══════════════════════════════════════════════════════════════════
 * CONFLICT katman — çatışma odağı aktifken (Conflict Focus workspace)
 * ═══════════════════════════════════════════════════════════════════ */
export const LOCAL_PANELS = [
  {
    id:          'situation',
    icon:        Target,
    label:       'Durum',
    title:       'Çatışma özeti',
    section:     'primary',
    scope:       'conflict',
    placeholder: true,
  },
  {
    id:          'forces',
    icon:        Shield,
    label:       'Kuvvetler',
    title:       'A vs B savaş düzeni',
    section:     'primary',
    scope:       'conflict',
    placeholder: true,
  },
  {
    id:          'threats',
    icon:        Radio,
    label:       'Tehditler',
    title:       'Düşman envanteri',
    section:     'primary',
    scope:       'conflict',
    placeholder: true,
    subPanels: [
      { id: 'strike',   label: 'Strike Package' },
      { id: 'sead',     label: 'SEAD / EW' },
      { id: 'coverage', label: 'Kapsama' },
    ],
  },
  {
    id:          'news',
    icon:        Newspaper,
    label:       'Haberler',
    title:       'Olaylar ve haberler',
    section:     'primary',
    scope:       'conflict',
    placeholder: true,
  },
  {
    id:          'timeline',
    icon:        Clock,
    label:       'Zaman',
    title:       'Zaman çizelgesi',
    section:     'primary',
    scope:       'conflict',
    placeholder: true,
  },

  /* Conflict'te de elaltı araçlar (assistant yerine global bubble) */
  {
    id:          'alerts',
    icon:        Bell,
    label:       'Uyarılar',
    title:       'Delta bildirimleri',
    section:     'secondary',
    scope:       'conflict',
    placeholder: true,
  },
  {
    id:          'settings',
    icon:        Settings,
    label:       'Ayarlar',
    title:       'Uygulama ayarları',
    section:     'secondary',
    scope:       'conflict',
    placeholder: true,
  },
]

/* ═══════════════════════════════════════════════════════════════════
 * TÜM PANEL META — id → meta hızlı sorgulaması için flatten
 * ═══════════════════════════════════════════════════════════════════ */
const ALL_PANELS = [...GLOBAL_PANELS, ...COUNTRY_PANELS, ...LOCAL_PANELS]

/** İki listedeki tüm panelleri id → meta olarak hızlı sorgulamak için.
 *  Aynı id birden fazla katmanda varsa (örn. 'intel', 'platform'),
 *  ilk bulunanı döner — iki yerde de aynı meta olduğu için güvenli. */
export function getPanelMeta(id) {
  if (!id) return null
  return ALL_PANELS.find((p) => p.id === id) || null
}

/** Panel id'sinin hangi moda ait olduğunu söyler.
 *  Birden fazla katmanda varsa mevcut modu tercih eder. */
export function getPanelMode(id) {
  if (!id) return null
  if (LOCAL_PANELS.some((p) => p.id === id)) return 'local'
  if (COUNTRY_PANELS.some((p) => p.id === id)) return 'country'
  if (GLOBAL_PANELS.some((p) => p.id === id)) return 'global'
  return null
}

/** Panellere section'a göre hızlı erişim — ActivityBar üst/alt bloklarını
 *  bu yardımcıyla beslerken config okuma mantığını tek yerde tutar. */
export function splitPanelsBySection(list) {
  const primary   = []
  const secondary = []
  for (const p of list) {
    if (p.section === 'secondary') secondary.push(p)
    else primary.push(p)
  }
  return { primary, secondary }
}

/**
 * Mevcut store state'ine göre hangi panel listesini render edeceğini
 * çözer. ActivityBar ve CommandPalette bu yardımcıyı çağırarak
 * katman mantığını tek noktada tutar.
 *
 * Öncelik:
 *   1. appMode === 'local' → conflict paneli (en spesifik)
 *   2. focusCountry        → country paneli
 *   3. default             → global paneli
 */
export function resolvePanels({ appMode, focusCountry }) {
  if (appMode === 'local')       return LOCAL_PANELS
  if (focusCountry)              return COUNTRY_PANELS
  return GLOBAL_PANELS
}

/** Aktif katmanın ismini verir — UI'da "Ülke katmanı" etiketi gibi. */
export function resolveLayer({ appMode, focusCountry }) {
  if (appMode === 'local')       return 'conflict'
  if (focusCountry)              return 'country'
  return 'global'
}
