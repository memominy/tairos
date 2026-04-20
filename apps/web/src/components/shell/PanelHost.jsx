import React, { useState, useEffect, lazy, Suspense } from 'react'
import {
  ClipboardList, Boxes, Bell, Settings as SettingsIcon,
} from 'lucide-react'
import useStore from '../../store/useStore'
import PanelStub from '../panels/PanelStub'
import { getPanelMeta } from '../../config/panels'

/**
 * Sol-raftaki aktif paneli bulup render eden hub bileşen.
 *
 * Yönlendirme mantığı (F2 yeniden yapılanma sonrası):
 *
 *   activePanelId → SystemsPanel / FieldPanel / WorldPanel   (yeni)
 *                 → AssistantPanel (lazy)
 *                 → PanelStub (placeholder'lı her şey)
 *                 → PanelStub (fallback)
 *
 * Eski Sidebar.jsx tamamen kaldırıldı; "platform/field/intel"
 * id'leri artık dedicated panel dosyalarına çözülüyor. Her panel
 * kendi operatör-scope filtrelemesini uyguluyor (bkz. FieldPanel
 * → useVisibleNodes/useVisibleGroups), böylece operatör değişince
 * sol raf otomatik güncellenir.
 *
 * Performans:
 *   - Paneli aktif değilse hiç mount etmeyiz (activePanelId tek bir
 *     component döner).
 *   - Tüm paneller lazy() ile bölünür — ilk yüklemede sadece aktif
 *     panelin JS'i iner, diğerleri on-demand. Böylece ActivityBar'dan
 *     ilk panel tıklanana kadar 0 panel bundle'ı yüklenmez.
 */

/* Lazy yüklenen paneller — her biri ayrı chunk ─────────── */
const SystemsPanel              = lazy(() => import('../panels/SystemsPanel'))
const FieldPanel                = lazy(() => import('../panels/FieldPanel'))
const WorldPanel                = lazy(() => import('../panels/WorldPanel'))
const CountryBriefPanel         = lazy(() => import('../panels/CountryBriefPanel'))
const CountryInventoryPanel     = lazy(() => import('../panels/CountryInventoryPanel'))
const CountryCriticalSitesPanel = lazy(() => import('../panels/CountryCriticalSitesPanel'))
const CountryRivalsPanel        = lazy(() => import('../panels/CountryRivalsPanel'))
// NOT: AssistantPanel artık panel olarak değil, AssistantBubble floating
// widget içinde mount ediliyor (bkz. src/components/AssistantBubble.jsx
// + App.jsx). Sidebar'a geri koymak istersek burada lazy + map'e ekle.

/* id → component map — PanelHost switch'i bu tabloyu okuyarak karar verir.
 * Yeni panel eklemek: 1) panels/<Name>Panel.jsx yaz, 2) buraya satır ekle. */
const PANEL_COMPONENTS = {
  platform:          SystemsPanel,
  field:             FieldPanel,
  intel:             WorldPanel,
  'country-brief':    CountryBriefPanel,
  'country-inventory': CountryInventoryPanel,
  'country-critical':  CountryCriticalSitesPanel,
  'country-rivals':    CountryRivalsPanel,
}

/* Placeholder panel konfigürasyonları — PanelStub tek dosya; her
 * stub burada başlığı + feature listesi + ilgili panel id'leri ile
 * çağrılır. Bir panel gerçek component olunca bu objeden düşer. */
const STUB_PANELS = {
  operations: {
    icon:     ClipboardList,
    title:    'Operasyon Planlama',
    subtitle: 'Görev, rota ve fazlı kontrol — çatışma odağıyla entegre',
    features: [
      'Görev tanımı: hedef + icracı varlık + zaman penceresi',
      'Rota ve waypoint editörü (drone/tim için)',
      'Faz takibi: hazırlık → infiltrasyon → angajman → dönüş',
      'Lokal (Conflict Focus) workspace içinde başlar, global listede izlenir',
      'Simülasyon önizleme: drone preview, ısı penceresi, jamming maruziyeti',
    ],
    related: ['assets', 'assistant', 'alerts'],
  },
  assets: {
    icon:     Boxes,
    title:    'Varlık Envanteri',
    subtitle: 'Elimizdekilerin sayımı, durumu ve konumu',
    features: [
      'Drone / radar / node miktarları (hazır · bakımda · kayıp)',
      'Mühimmat stoğu ve tüketim oranı izleme',
      'Konum bazlı dağılım (üs / ileri karakol)',
      'Canlı sensör beslemesi: batarya, sinyal, uçuş saati',
      'Eksik / bakım ihtiyacı Uyarılar paneline otomatik düşer',
    ],
    related: ['operations', 'alerts'],
  },
  alerts: {
    icon:     Bell,
    title:    'Uyarılar',
    subtitle: 'Gerçek zamanlı delta bildirimleri',
    features: [
      'Yeni çatışma veya eskalasyon rozetleri',
      'Kapsama kaybı (node/drone düşünce otomatik)',
      'Ops hattı dışı sinyaller: GPS spoof, beacon sessizliği',
      'Sessize alma ve önem seviyesi filtresi',
      'Bildirim → harita odakla tek tıkla',
    ],
    related: ['operations', 'assets'],
  },
  settings: {
    icon:     SettingsIcon,
    title:    'Ayarlar',
    subtitle: 'Uygulama tercihleri ve profil',
    features: [
      'Tema ve kontrast modları',
      'Ses profilleri (muharebe / sessiz / sadece uyarı)',
      'Birim sistemi (km/nm) ve zaman dilimi',
      'Oturumlar arası görünüm hatırlama',
      'Klavye kısayolları referansı',
    ],
    related: [],
  },
}

/* Sidebar width'ini paylaşan shell. Legacy Sidebar.jsx de aynı
 * localStorage anahtarını kullanıyor, böylece operatör paneller arası
 * geçiş yaparken genişlik tutarlı kalır.
 *
 * Sağ kenardaki sürükleme şeridi + çift-tık default geri dönüş. */
const SIDEBAR_LS_KEY = 'tairos:sidebar:width'
function PanelShell({ children }) {
  const [width, setWidth] = useState(() => {
    try {
      const raw = parseInt(localStorage.getItem(SIDEBAR_LS_KEY) || '', 10)
      if (raw >= 220 && raw <= 640) return raw
    } catch {}
    return 288
  })
  useEffect(() => {
    try { localStorage.setItem(SIDEBAR_LS_KEY, String(width)) } catch {}
  }, [width])

  const onResizeStart = (e) => {
    if (e.button !== 0) return
    e.preventDefault()
    const startX = e.clientX
    const startW = width
    const move = (ev) => {
      const delta = ev.clientX - startX
      setWidth(Math.max(220, Math.min(640, startW + delta)))
    }
    const up = () => {
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup',   up)
      document.body.style.userSelect = ''
      document.body.style.cursor     = ''
    }
    document.body.style.userSelect = 'none'
    document.body.style.cursor     = 'ew-resize'
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup',   up)
  }

  return (
    <aside
      className="shrink-0 flex flex-col bg-ops-800 border-r border-ops-600 overflow-hidden relative"
      style={{ zIndex: 1200, width }}
    >
      <div
        onMouseDown={onResizeStart}
        onDoubleClick={() => setWidth(288)}
        className="absolute right-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-accent/60 transition-colors"
        style={{ zIndex: 1250 }}
        title="Sürükle → genişlik · çift-tık → varsayılan"
      />
      {children}
    </aside>
  )
}

function StubFallback({ label }) {
  return (
    <div className="p-5 text-[11px] text-ops-500 font-mono">
      {label || 'Yükleniyor...'}
    </div>
  )
}

/* Ana hub ── App.jsx burada eski `<Sidebar />` yerine `<PanelHost />`
 * mount eder. Panel yönlendirmesi tek nokta — ActivityBar dışardan
 * id değiştirir, burası hangi dosya yükleneceğine karar verir. */
export default function PanelHost() {
  const sidebarOpen   = useStore((s) => s.sidebarOpen)
  const activePanelId = useStore((s) => s.activePanelId)

  // Sidebar tam kapalı (hamburger) veya hiçbir panel seçili değil
  // (ActivityBar ikonunda toggle-off) → hiçbir şey render etme, harita
  // tam genişlikte nefes alsın.
  if (!sidebarOpen || !activePanelId) return null

  // Gerçek component kayıtlı mı?  — tüm üçlü çekirdek panel
  // (platform/field/intel) + assistant bu yol üzerinden gelir.
  const PanelComponent = PANEL_COMPONENTS[activePanelId]
  if (PanelComponent) {
    const meta = getPanelMeta(activePanelId)
    return (
      <PanelShell>
        <div className="flex-1 flex flex-col overflow-hidden">
          <Suspense fallback={<StubFallback label={`${meta?.label || 'Panel'} yükleniyor...`} />}>
            <PanelComponent />
          </Suspense>
        </div>
      </PanelShell>
    )
  }

  // Placeholder panelleri — PanelStub tek dosya, farklı içerikler.
  const stub = STUB_PANELS[activePanelId]
  if (stub) {
    return (
      <PanelShell>
        <div className="flex-1 overflow-y-auto">
          <PanelStub {...stub} />
        </div>
      </PanelShell>
    )
  }

  // Panel registry'de id var ama burada case yok — güvenli fallback.
  const meta = getPanelMeta(activePanelId)
  return (
    <PanelShell>
      <div className="flex-1 overflow-y-auto">
        <PanelStub
          title={meta?.title || activePanelId}
          subtitle="Panel kayıtlı, fakat PanelHost içine bağlanmadı"
        />
      </div>
    </PanelShell>
  )
}
