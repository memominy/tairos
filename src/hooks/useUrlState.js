import { useEffect, useRef } from 'react'
import useStore from '../store/useStore'

export function useUrlState() {
  const getUrlState      = useStore((s) => s.getUrlState)
  const activeCategories = useStore((s) => s.activeCategories)
  const activeDrones     = useStore((s) => s.activeDrones)
  const tileStyle        = useStore((s) => s.tileStyle)
  const mapCenter        = useStore((s) => s.mapCenter)
  const mapZoom          = useStore((s) => s.mapZoom)
  const timerRef = useRef(null)

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      const qs = getUrlState()
      window.history.replaceState(null, '', `${window.location.pathname}?${qs}`)
    }, 500)
    return () => clearTimeout(timerRef.current)
  }, [activeCategories, activeDrones, tileStyle, mapCenter, mapZoom]) // eslint-disable-line
}
