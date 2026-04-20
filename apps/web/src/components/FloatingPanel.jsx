import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Minus, Maximize2, X, Move } from 'lucide-react'

const LS_PREFIX = 'tairos:panel:'

/**
 * Reusable floating panel primitive.
 *
 * A generic "holds some UI" chrome that the operator can grab, move and
 * resize. We built this because half a dozen panels (layers island,
 * conflict detail, street view, placement) were all reinventing a fixed
 * wrapper with a header, and every one of them was cramped in exactly
 * the same way.
 *
 * Persists pos+size+collapsed state to localStorage under a stable id so
 * an operator's preferred layout survives reload. Pass `id={null}` for
 * ephemeral panels.
 *
 * Two axes of size control:
 *   • bottom-right grip         → normal resize (both w + h)
 *   • left/top/right/bottom edges (optional, via `edges` prop) → one-axis
 *
 * Collapse is a separate state: body hides, header stays. We accept the
 * collapsed state as a prop so callers can drive it from their own state
 * (e.g. the MapLayersIsland auto-expand-on-toggle behaviour).
 */
export default function FloatingPanel({
  id,
  title,
  icon: Icon,
  accent = '#D85A30',
  defaultPos = { x: 16, y: 16 },
  defaultSize = { w: 300, h: 380 },
  minSize = { w: 220, h: 140 },
  maxSize = { w: 760, h: 900 },
  collapsed = false,
  onCollapsedChange,
  onClose,
  headerExtra,
  children,
  className = '',
  style,
  /** If true, the panel reports its position via callback (used by islands
   * that want to redock on viewport resize). */
  onPosChange,
}) {
  const storageKey = id ? `${LS_PREFIX}${id}` : null

  // ── Initial pos/size resolution ─────────────────────────────────
  // defaultPos may use negative values to mean "offset from right/bottom"
  // — a convention that keeps right-anchored panels feeling stable when
  // the viewport resizes. We resolve to absolute pixels here.
  const initial = useMemo(() => {
    let saved = null
    if (storageKey) {
      try { saved = JSON.parse(localStorage.getItem(storageKey) || 'null') } catch {}
    }
    const size = saved?.size || defaultSize
    let pos = saved?.pos
    if (!pos) {
      const x = typeof defaultPos.x === 'number' && defaultPos.x < 0
        ? Math.max(8, window.innerWidth - size.w + defaultPos.x)
        : (defaultPos.x ?? 16)
      const y = typeof defaultPos.y === 'number' && defaultPos.y < 0
        ? Math.max(8, window.innerHeight - size.h + defaultPos.y)
        : (defaultPos.y ?? 16)
      pos = { x, y }
    }
    return { pos, size }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [pos, setPos]   = useState(initial.pos)
  const [size, setSize] = useState(initial.size)

  useEffect(() => {
    if (!storageKey) return
    try { localStorage.setItem(storageKey, JSON.stringify({ pos, size })) } catch {}
  }, [storageKey, pos, size])

  useEffect(() => { onPosChange?.(pos) }, [pos, onPosChange])

  // Keep the panel on-screen if the window shrinks (responsive survival).
  useEffect(() => {
    const onResize = () => setPos((p) => ({
      x: Math.max(8, Math.min(p.x, window.innerWidth  - 40)),
      y: Math.max(8, Math.min(p.y, window.innerHeight - 40)),
    }))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // ── Drag ────────────────────────────────────────────────────────
  const onDragStart = useCallback((e) => {
    // Ignore clicks on interactive children (buttons etc.).
    if (e.target.closest('[data-no-drag]')) return
    if (e.button !== 0) return
    e.preventDefault()
    const startX = e.clientX, startY = e.clientY
    const start = { ...pos }
    const move = (ev) => {
      setPos({
        x: Math.max(0, Math.min(window.innerWidth  - 40, start.x + (ev.clientX - startX))),
        y: Math.max(0, Math.min(window.innerHeight - 40, start.y + (ev.clientY - startY))),
      })
    }
    const up = () => {
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup',   up)
      document.body.style.userSelect = ''
    }
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup',   up)
  }, [pos])

  // ── Resize (bottom-right corner) ───────────────────────────────
  const onResizeStart = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.button !== 0) return
    const startX = e.clientX, startY = e.clientY
    const start = { ...size }
    const move = (ev) => {
      setSize({
        w: Math.max(minSize.w, Math.min(maxSize.w, start.w + (ev.clientX - startX))),
        h: Math.max(minSize.h, Math.min(maxSize.h, start.h + (ev.clientY - startY))),
      })
    }
    const up = () => {
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup',   up)
      document.body.style.userSelect = ''
    }
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup',   up)
  }, [size, minSize, maxSize])

  const w = collapsed ? 'auto' : size.w
  const h = collapsed ? 'auto' : size.h

  return (
    <div
      className={`fixed rounded-lg border backdrop-blur-sm shadow-2xl overflow-hidden flex flex-col transition-[box-shadow] ${className}`}
      style={{
        left: pos.x,
        top: pos.y,
        width: w,
        height: h,
        minWidth: collapsed ? 'auto' : minSize.w,
        background: 'rgba(13,21,38,0.94)',
        borderColor: `${accent}55`,
        boxShadow: `0 10px 32px rgba(0,0,0,0.55), 0 0 0 1px ${accent}22`,
        zIndex: 1100,
        ...style,
      }}
    >
      {/* ── Header (drag handle) ──────────────────────────────────── */}
      <div
        onMouseDown={onDragStart}
        onDoubleClick={(e) => {
          if (e.target.closest('[data-no-drag]')) return
          onCollapsedChange?.(!collapsed)
        }}
        className="flex items-center gap-1.5 px-2 py-1.5 cursor-move select-none border-b"
        style={{
          background: `linear-gradient(180deg, ${accent}18 0%, ${accent}08 100%)`,
          borderColor: `${accent}22`,
        }}
      >
        <Move size={9} className="text-ops-500 shrink-0" />
        {Icon && <Icon size={11} className="shrink-0" style={{ color: accent }} />}
        <span
          className="text-[10px] font-semibold uppercase tracking-wider flex-1 truncate"
          style={{ color: accent }}
        >
          {title}
        </span>
        {headerExtra && (
          <div data-no-drag className="flex items-center gap-1">{headerExtra}</div>
        )}
        {onCollapsedChange && (
          <button
            data-no-drag
            onClick={() => onCollapsedChange(!collapsed)}
            className="w-5 h-5 flex items-center justify-center rounded hover:bg-ops-700/70 text-ops-400 hover:text-ops-100 transition-colors"
            title={collapsed ? 'Genişlet' : 'Küçült'}
          >
            {collapsed ? <Maximize2 size={9} /> : <Minus size={9} />}
          </button>
        )}
        {onClose && (
          <button
            data-no-drag
            onClick={onClose}
            className="w-5 h-5 flex items-center justify-center rounded hover:bg-red-500/20 text-ops-400 hover:text-red-400 transition-colors"
            title="Kapat"
          >
            <X size={9} />
          </button>
        )}
      </div>

      {/* ── Body ─────────────────────────────────────────────────── */}
      {!collapsed && (
        <>
          <div className="flex-1 overflow-auto">{children}</div>
          {/* Resize grip. Rendered as a tiny triangle in the bottom-right;
              the cursor does the rest of the affordance work. */}
          <div
            onMouseDown={onResizeStart}
            className="absolute right-0 bottom-0 w-3.5 h-3.5 cursor-se-resize"
            title="Boyutlandır"
            style={{
              background: `linear-gradient(135deg, transparent 50%, ${accent}88 50%)`,
            }}
          />
        </>
      )}
    </div>
  )
}
