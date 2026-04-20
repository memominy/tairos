import React, { useEffect, useState, lazy, Suspense } from 'react'
import { Bot, X, Minimize2, Loader2 } from 'lucide-react'
import useStore from '../store/useStore'

/**
 * AssistantPanel lazy — FAB açılana kadar chat UI + agent araçları +
 * JSON veri yükleri inmez. İlk tıklama ~50kB (gz ~16kB) chunk'ı çeker,
 * Suspense fallback'i kısa bir spinner. Bubble'ın kendisi (FAB) minimal
 * kalır, App ilk yüklenişinde performansı etkilemez.
 */
const AssistantPanel = lazy(() => import('./panels/AssistantPanel'))

/* ── Right-side panel geometrisi ───────────────────────────────────
 * Harita alanının sağ kenarına yapışan detay panelleri. Hepsi
 * `absolute right-0` olduğu için üst üste bineri — genişlikleri
 * toplamak yanlış; en geniş olan kazanır.
 *
 *   selectedFacility   → DetailPanel             : w-72 (288px sabit)
 *   selectedDeployUnit → ForceDeployDetailPanel  : 340px (index.css)
 *   selectedConflict   → ConflictDetailPanel     : 320–820px (dynamic,
 *       localStorage 'tairos:conflict-panel:width', default 380)
 *
 * Bubble/pencerenin sağ kenar boşluğu = max(aktif panel genişlikleri)
 * + BASE_EDGE (kenar-panel arası nefes). BASE_EDGE 16px (panel yokken
 * orijinal right-4 ile eşdeğer). Transition ile yumuşak kaydırma. */
const BASE_EDGE_PX          = 16      // right-4 → 16px
const FACILITY_PANEL_W_PX   = 288     // Tailwind w-72
const DEPLOY_PANEL_W_PX     = 340     // index.css .tairos-force-detail
const CONFLICT_PANEL_LS_KEY = 'tairos:conflict-panel:width'
const CONFLICT_PANEL_DEFAULT_W_PX = 380

/**
 * Sentinel AI — yüzen chat widget'ı.
 *
 * Sidebar panellerinden ayrı, sağ-alt köşede asılı kalan FAB + chat
 * penceresi. Kapalıyken küçük yuvarlak bir buton, tıklayınca ~420×640
 * boyutunda modal-olmayan bir pencere açılır ve AssistantPanel'i olduğu
 * gibi içine gömer. Kullanıcı haritayla/panellerle etkileşime devam
 * edebilir — bu bir overlay değil, pointer-events kendi kutusunda.
 *
 * State: store'daki `chatbotDockOpen` (eskiden dead code'du, burada
 * yeniden hayata döndü). Toggle oturumlar arası localStorage'a kaydolmaz
 * — her açılışta kapalı başlar, kullanıcı tıklayınca açılır.
 *
 * Klavye:
 *   Esc — açıkken kapat
 *
 * Z-index: 1210 — ActivityBar (1260) altında, PanelHost (1200) üstünde.
 * CommandPalette (9998) çağrıldığında onun altında kalır, böylece
 * Ctrl+K widget'ın önüne geçer.
 */
export default function AssistantBubble() {
  const open   = useStore((s) => s.chatbotDockOpen)
  const setOpen = useStore((s) => s.setChatbotDockOpen)

  // Detay panelleri — hangisi aktifse bubble onun kenarına kaçar
  const selectedFacility   = useStore((s) => s.selectedFacility)
  const selectedDeployUnit = useStore((s) => s.selectedDeployUnit)
  const selectedConflict   = useStore((s) => s.selectedConflict)

  // Conflict panelin genişliği dinamik — resize'da localStorage'a yazılır
  // ama bu component otomatik re-render olmaz. Panel açıkken canlı
  // takip etmek için ResizeObserver + localStorage fallback kullanıyoruz.
  const [conflictPanelWidth, setConflictPanelWidth] = useState(() => {
    try {
      const raw = parseInt(localStorage.getItem(CONFLICT_PANEL_LS_KEY) || '', 10)
      if (raw >= 320 && raw <= 820) return raw
    } catch {}
    return CONFLICT_PANEL_DEFAULT_W_PX
  })

  // Conflict panel DOM'a girip çıkarken ve içinde resize olurken
  // genişliği takip et. Panel kapanınca observer temizlenir.
  useEffect(() => {
    if (!selectedConflict) return
    // İlk senkron okuma — localStorage genelde güncel
    try {
      const raw = parseInt(localStorage.getItem(CONFLICT_PANEL_LS_KEY) || '', 10)
      if (raw >= 320 && raw <= 820) setConflictPanelWidth(raw)
    } catch {}

    // Element mount'u biraz gecikebilir (conditional render). rAF ile
    // bir sonraki frame'de DOM'u ara, bulduğumuzda ResizeObserver kur.
    let ro = null
    let rafId = null
    const attach = () => {
      // ConflictDetailPanel = .absolute.right-0 + inline style width.
      // Biraz gevşek bir seçici; birden fazla aday varsa width'i en
      // büyüğünü alırız.
      const candidates = Array.from(document.querySelectorAll(
        '.absolute.right-0.top-0.bottom-0.bg-ops-800.border-l'
      ))
      const target = candidates.find((el) => {
        const w = el.getBoundingClientRect().width
        return w >= 300 && w <= 900
      })
      if (!target) {
        rafId = requestAnimationFrame(attach)
        return
      }
      ro = new ResizeObserver((entries) => {
        for (const e of entries) {
          const w = Math.round(e.contentRect.width)
          if (w >= 300 && w <= 900) setConflictPanelWidth(w)
        }
      })
      ro.observe(target)
    }
    rafId = requestAnimationFrame(attach)

    return () => {
      if (rafId) cancelAnimationFrame(rafId)
      if (ro) ro.disconnect()
    }
  }, [selectedConflict])

  // Aktif panellerin en genişini seç — hepsi `right-0` olduğundan
  // üst üste biner, toplamak yanlış olur.
  const activePanelWidth = Math.max(
    selectedFacility    ? FACILITY_PANEL_W_PX   : 0,
    selectedDeployUnit  ? DEPLOY_PANEL_W_PX     : 0,
    selectedConflict    ? conflictPanelWidth    : 0,
  )
  const rightOffsetPx = BASE_EDGE_PX + activePanelWidth

  // Esc = kapat (açıkken)
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); setOpen(false) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  return (
    <>
      {/* FAB — her zaman görünür; açıkken küçük "minimize" moduna geçer.
          Sağdaki detay panelleri açılınca `right` değeri dinamikleşir
          ki bubble paneli kapatmasın; 200ms transition ile yumuşak
          kaydırma. */}
      <button
        onClick={() => setOpen(!open)}
        style={{ right: `${rightOffsetPx}px`, transition: 'right 200ms ease, transform 150ms, box-shadow 150ms' }}
        className={`fixed bottom-4 z-[1210] w-12 h-12 rounded-full flex items-center justify-center shadow-lg shadow-black/40 border ${
          open
            ? 'bg-ops-800 border-ops-600 text-ops-300 hover:text-ops-100'
            : 'bg-accent border-accent/60 text-ops-900 hover:scale-105 hover:shadow-accent/20'
        }`}
        title={open ? 'Sentinel\'i gizle' : 'Sentinel AI aç'}
        aria-label={open ? 'Asistanı gizle' : 'Asistanı aç'}
      >
        {open ? <Minimize2 size={18} /> : <Bot size={22} />}
        {/* Küçük "agent" gösterge rozeti — kapalıyken küçük bir accent nokta */}
        {!open && (
          <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-ops-900" />
        )}
      </button>

      {/* Chat penceresi — FAB'ın üstünde, alt-sağ köşede asılı.
          pointer-events-auto kutunun kendisinde; dışarı boş pixel yok,
          o yüzden haritayla etkileşim engellenmiyor. */}
      {open && (
        <div
          className="fixed bottom-20 z-[1210] flex flex-col rounded-lg border border-ops-700 bg-ops-900 shadow-2xl shadow-black/60 overflow-hidden"
          style={{
            right:      `${rightOffsetPx}px`,
            width:      `min(420px, calc(100vw - ${rightOffsetPx + BASE_EDGE_PX}px))`,
            height:     'min(640px, calc(100vh - 7rem))',
            transition: 'right 200ms ease, width 200ms ease',
          }}
          role="dialog"
          aria-label="Sentinel AI"
        >
          {/* Kapama butonu — AssistantPanel'in kendi header'ı zaten çok
              dolu, ben sadece üst-sağ köşeye absolute bir X koyuyorum. */}
          <button
            onClick={() => setOpen(false)}
            className="absolute top-2 right-2 z-10 p-1 rounded text-ops-500 hover:text-ops-100 hover:bg-ops-800/80"
            title="Kapat (Esc)"
            aria-label="Kapat"
          >
            <X size={14} />
          </button>
          <Suspense fallback={
            <div className="flex-1 flex items-center justify-center text-ops-500">
              <Loader2 size={18} className="animate-spin text-accent" />
            </div>
          }>
            <AssistantPanel />
          </Suspense>
        </div>
      )}
    </>
  )
}
