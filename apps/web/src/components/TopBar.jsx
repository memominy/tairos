import React, { useState, useRef, useEffect } from 'react'
import {
  Search, Map, Download, Maximize2, Minimize2,
  Share2, Menu, X, Volume2, VolumeX
} from 'lucide-react'
import useStore from '../store/useStore'
import { TILE_PROVIDERS } from '../utils/tiles'
import { exportMapPng, copyShareUrl } from '../utils/export'
import { soundsEnabled, setSoundsEnabled, onSoundsToggled, playSound } from '../utils/sounds'
import allFacilities from '../data/facilities.json'
import FocusBar    from './shell/FocusBar'

export default function TopBar({ isComputing }) {
  const tileStyle      = useStore((s) => s.tileStyle)
  const setTile        = useStore((s) => s.setTile)
  const setSidebarOpen = useStore((s) => s.setSidebarOpen)
  const sidebarOpen    = useStore((s) => s.sidebarOpen)
  const setSearch      = useStore((s) => s.setSearch)
  const setSearchResults = useStore((s) => s.setSearchResults)
  const selectFacility = useStore((s) => s.selectFacility)
  const getUrlState    = useStore((s) => s.getUrlState)
  const searchQuery    = useStore((s) => s.searchQuery)

  const [tileOpen, setTileOpen] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [shareMsg, setShareMsg] = useState('')
  const [audioOn, setAudioOn] = useState(soundsEnabled())
  const searchRef = useRef(null)

  // Keep the speaker icon synced even if another panel flips the preference.
  useEffect(() => onSoundsToggled(setAudioOn), [])

  const handleSearch = (q) => {
    setSearch(q)
    if (!q.trim()) { setSearchResults([]); return }
    const lower = q.toLowerCase()
    const results = allFacilities.filter(
      (f) => f.name.toLowerCase().includes(lower) || f.city?.toLowerCase().includes(lower)
    ).slice(0, 8)
    setSearchResults(results)
  }

  const handleSelect = (f) => {
    selectFacility(f)
    setSearch('')
    setSearchResults([])
  }

  const handleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.()
      setIsFullscreen(true)
    } else {
      document.exitFullscreen?.()
      setIsFullscreen(false)
    }
  }

  const handleShare = async () => {
    const qs = getUrlState()
    copyShareUrl(qs)
    playSound('success')
    setShareMsg('Kopyalandı!')
    setTimeout(() => setShareMsg(''), 2000)
  }

  const handleToggleAudio = () => {
    // setSoundsEnabled internally plays a confirmation beep when turning on.
    setSoundsEnabled(!audioOn)
  }

  const searchResults = useStore((s) => s.searchResults)

  return (
    <div className="flex items-center gap-2 px-3 h-12 shrink-0 bg-ops-800 border-b border-ops-600 relative" style={{ zIndex: 1300 }}>
      {/* Hamburger */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="p-1.5 rounded hover:bg-ops-700 text-ops-200 transition-colors"
        title="Menü"
      >
        {sidebarOpen ? <X size={16} /> : <Menu size={16} />}
      </button>

      {/* Logo */}
      <div className="flex items-center gap-2 mr-2 select-none">
        <svg width="20" height="20" viewBox="0 0 64 64" fill="none">
          <path d="M32 6 L58 32 L32 58 L6 32 Z" stroke="#D85A30" strokeWidth="4" fill="none"/>
          <circle cx="32" cy="32" r="6" fill="#D85A30"/>
          <line x1="32" y1="6" x2="32" y2="18" stroke="#D85A30" strokeWidth="3"/>
          <line x1="58" y1="32" x2="46" y2="32" stroke="#D85A30" strokeWidth="3"/>
          <line x1="32" y1="58" x2="32" y2="46" stroke="#D85A30" strokeWidth="3"/>
          <line x1="6" y1="32" x2="18" y2="32" stroke="#D85A30" strokeWidth="3"/>
        </svg>
        <span className="font-bold text-sm tracking-widest text-ops-50 uppercase">
          TAIROS <span style={{ color: '#D85A30' }}>SENTINEL</span>
        </span>
        <span className="hidden sm:block text-ops-400 text-xs font-mono">// Taktik · İzleme · Savunma · Saldırı</span>
      </div>

      {/* FocusBar — "BEN / ODAK / TARAF" üçlü kontrol adası.
          Eski OperatorChip + Breadcrumb yerine tek, aranabilir kart:
          operatörü ve ülke odağını büyük bir dropdown'dan seç, çatışma
          aktifse taraf chip'ini üstten tek tıkla değiştir. */}
      <FocusBar />

      {/* Spacer + Search */}
      <div className="flex-1 relative max-w-xs">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ops-400 pointer-events-none" />
        <input
          ref={searchRef}
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') { setSearch(''); setSearchResults([]) } }}
          placeholder="Varlık ara..."
          className="w-full bg-ops-900 border border-ops-600 rounded-md pl-7 pr-3 py-1 text-xs text-ops-100 placeholder-ops-400 focus:outline-none focus:border-accent transition-colors"
        />
        {/* Autocomplete dropdown */}
        {searchResults.length > 0 && (
          <div className="absolute top-full mt-1 left-0 right-0 bg-ops-800 border border-ops-600 rounded-md shadow-xl z-50 overflow-hidden fade-in">
            {searchResults.map((f) => (
              <button
                key={f.id}
                onClick={() => handleSelect(f)}
                className="w-full text-left px-3 py-2 text-xs hover:bg-ops-700 border-b border-ops-700 last:border-0 transition-colors"
              >
                <span className="text-ops-100 font-medium">{f.name}</span>
                <span className="text-ops-400 ml-2">{f.city}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Computing indicator */}
      {isComputing && (
        <div className="flex items-center gap-1.5 text-accent text-xs font-mono">
          <span className="inline-block w-1.5 h-1.5 bg-accent rounded-full pulse-ring" />
          <span className="hidden sm:block">hesaplıyor...</span>
        </div>
      )}

      {/* Tile quick-cycle: click = next tile, hover shows label */}
      <div className="relative">
        <button
          onClick={() => setTileOpen(!tileOpen)}
          className={`flex items-center gap-1.5 px-2 py-1 rounded border text-xs transition-all ${
            tileOpen
              ? 'bg-ops-700 border-ops-500 text-ops-100'
              : 'border-ops-600 text-ops-300 hover:border-ops-400 hover:text-ops-100'
          }`}
          title="Harita görünümü değiştir"
        >
          <Map size={13} />
          <span className="hidden md:block">
            {TILE_PROVIDERS[tileStyle]?.label?.split(' ')[0] || 'Harita'}
          </span>
        </button>
        {tileOpen && (
          <div className="absolute right-0 top-full mt-1 bg-ops-800 border border-ops-600 rounded-md shadow-xl z-[2000] py-1 min-w-[180px] fade-in">
            {Object.entries(TILE_PROVIDERS).map(([key, val]) => (
              <button
                key={key}
                onClick={() => { setTile(key); setTileOpen(false) }}
                className={`w-full text-left px-3 py-2 text-xs transition-colors hover:bg-ops-700 flex items-center gap-2 ${
                  tileStyle === key ? 'text-accent' : 'text-ops-200'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${tileStyle === key ? 'bg-accent' : 'bg-ops-600'}`} />
                {val.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Export PNG */}
      <button
        onClick={() => { playSound('success'); exportMapPng() }}
        className="p-1.5 rounded hover:bg-ops-700 text-ops-300 hover:text-ops-100 transition-colors"
        title="PNG olarak dışa aktar"
      >
        <Download size={15} />
      </button>

      {/* Share URL */}
      <button
        onClick={handleShare}
        className="relative p-1.5 rounded hover:bg-ops-700 text-ops-300 hover:text-ops-100 transition-colors"
        title="Bağlantıyı paylaş"
      >
        <Share2 size={15} />
        {shareMsg && (
          <span className="absolute -bottom-7 right-0 bg-ops-700 text-ops-100 text-xs px-2 py-0.5 rounded whitespace-nowrap">
            {shareMsg}
          </span>
        )}
      </button>

      {/* Audio on/off */}
      <button
        onClick={handleToggleAudio}
        className={`p-1.5 rounded hover:bg-ops-700 transition-colors ${
          audioOn ? 'text-ops-300 hover:text-ops-100' : 'text-ops-500 hover:text-ops-300'
        }`}
        title={audioOn ? 'Sesleri kapat' : 'Sesleri aç'}
        aria-pressed={audioOn}
      >
        {audioOn ? <Volume2 size={15} /> : <VolumeX size={15} />}
      </button>

      {/* Fullscreen */}
      <button
        onClick={handleFullscreen}
        className="p-1.5 rounded hover:bg-ops-700 text-ops-300 hover:text-ops-100 transition-colors"
        title="Tam ekran"
      >
        {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
      </button>
    </div>
  )
}
