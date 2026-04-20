import React from 'react'

/**
 * Stackable badge shown in the upper-right for every live overlay.
 * Each overlay passes its own stackIndex (0, 1, 2, …); the badge positions
 * itself 30 px lower for each index so multiple overlays don't overlap.
 *
 * props:
 *   status     — null | 'loading' | 'zoom' | 'empty' | 'done' | 'error'
 *   color      — base hex color (#F5C842 etc.); falls back to red on error
 *   stackIndex — 0-based vertical stack position below the measure bar
 *   texts      — { loading, zoom, empty, done } — plain strings
 *   onRetry    — called when user clicks the retry button on error state
 */
export default function OverpassBadge({ status, color, stackIndex = 0, texts, progress, onRetry }) {
  if (!status) return null

  // Loading text auto-suffixed with cell progress when > 1 cell is pending.
  const loadingBase = texts?.loading || 'yükleniyor…'
  const loadingText = progress && progress.total > 1
    ? `⟳ ${loadingBase} (${progress.done}/${progress.total})`
    : `⟳ ${loadingBase}`

  const resolved =
    status === 'loading' ? { text: loadingText,                             dim: false }
  : status === 'zoom'    ? { text: texts?.zoom  || '🔍 yakınlaştır',         dim: true  }
  : status === 'empty'   ? { text: texts?.empty || 'kayıt yok',             dim: true  }
  : status === 'done'    ? { text: texts?.done  || '',                     dim: false }
  : status === 'error'   ? { text: null,                                   dim: false }
  : null

  if (!resolved) return null

  const displayColor = status === 'error' ? '#F87171'
                     : resolved.dim       ? '#6B7FA0'
                     :                      color
  const border = status === 'error' ? '#F8717133' : (displayColor + '33')
  const marginTop = 48 + stackIndex * 30

  return (
    <div className="leaflet-top leaflet-right" style={{ marginTop, marginRight: 8 }}>
      <div className="leaflet-control" style={{
        background: 'rgba(13,21,38,0.92)', border: `1px solid ${border}`,
        borderRadius: 6, padding: '3px 10px', fontSize: 11, color: displayColor,
        fontFamily: 'monospace', display: 'flex', alignItems: 'center', gap: 6,
        pointerEvents: status === 'error' ? 'auto' : 'none',
      }}>
        {status !== 'error' && resolved.text}
        {status === 'error' && (
          <span style={{ pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>✕ yüklenemedi</span>
            <button
              onClick={onRetry}
              style={{ background: '#F8717122', border: '1px solid #F8717155', borderRadius: 4, color: '#F87171', padding: '0 5px', cursor: 'pointer', fontSize: 10 }}
            >
              ↻ tekrar
            </button>
          </span>
        )}
      </div>
    </div>
  )
}
