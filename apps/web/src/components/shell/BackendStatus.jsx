/**
 * Tiny badge in the TopBar that shows whether the FastAPI backend is
 * reachable. Zero effect on app functionality today — the frontend
 * still reads/writes via Zustand + localStorage — it's a scout for
 * the inventory-migration work: when the dot turns green, the data
 * flip is safe to attempt.
 *
 * Visual contract
 * ---------------
 * - Online:   green pulse + "sunucu" label on md+ screens
 * - Offline:  red dot + "sunucu yok" label
 * - Loading:  hidden entirely on first poll so the bar doesn't
 *             flicker while the initial fetch resolves
 *
 * The label is explicitly muted; the map is the user's attention
 * sink, the status dot shouldn't compete for it.
 */
import React from 'react'
import { Server, ServerOff } from 'lucide-react'
import { useBackendHealth } from '../../hooks/api/useBackendHealth'

export default function BackendStatus() {
  const { online, offline, loading } = useBackendHealth()

  if (loading) return null

  if (online) {
    return (
      <div
        className="flex items-center gap-1.5 text-emerald-400 text-xs font-mono"
        title="Backend bağlantısı açık"
      >
        <Server size={12} />
        <span className="inline-block w-1.5 h-1.5 bg-emerald-400 rounded-full pulse-ring" />
        <span className="hidden md:block">sunucu</span>
      </div>
    )
  }

  if (offline) {
    return (
      <div
        className="flex items-center gap-1.5 text-ops-500 text-xs font-mono"
        title="Backend erişilemiyor (lokal state kullanılıyor)"
      >
        <ServerOff size={12} />
        <span className="inline-block w-1.5 h-1.5 bg-rose-500/70 rounded-full" />
        <span className="hidden md:block">sunucu yok</span>
      </div>
    )
  }

  return null
}
