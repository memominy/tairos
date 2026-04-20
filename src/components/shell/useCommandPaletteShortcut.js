import { useEffect } from 'react'
import useStore from '../../store/useStore'

/**
 * Ctrl+K / Cmd+K keyboard shortcut that toggles the CommandPalette.
 *
 * Lives in its own tiny module (not inside CommandPalette.jsx) so App.jsx
 * can wire the shortcut eagerly *without* pulling the full 20KB+ palette
 * component into the main bundle. The palette itself is lazy-loaded and
 * only downloads the first time the operator actually opens it.
 *
 * Store contract:
 *   commandPaletteOpen     (boolean) — current open state
 *   setCommandPaletteOpen  (fn)      — setter (passed the new bool)
 */
export function useCommandPaletteShortcut() {
  const setOpen = useStore((s) => s.setCommandPaletteOpen)
  const open    = useStore((s) => s.commandPaletteOpen)
  useEffect(() => {
    const onKey = (e) => {
      const isK = e.key === 'k' || e.key === 'K'
      if (isK && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        setOpen(!open)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setOpen])
}
