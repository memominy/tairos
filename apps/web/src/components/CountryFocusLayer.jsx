import React, { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import useStore from '../store/useStore'
import { getCountry, rivalsOf } from '../config/countries'
import { criticalSitesOf, SITE_KIND_LABELS } from '../config/countryCriticalSites'

/**
 * CountryFocusLayer — ülke odağı aktifken haritaya:
 *
 *   1. Ülkenin bounds kutusunu hafif accent çerçeveyle çizer (outline)
 *   2. Kendi kritik tesislerini accent (turuncu) halkalarla, önem sırasına
 *      göre büyüyen yarıçapla marker'lar
 *   3. Rakip ülkelerin kritik tesislerini kırmızı halkalarla, ayrıca her
 *      rakibin bayrağını ülke-merkezine bayrak etiketi olarak bırakır
 *   4. Bir çatışma da aktifse, CountryRivalsPanel'in seçtiği taraf
 *      doğrultusunda kendi/karşı renklendirmesini otomatik yapar (bugün
 *      ilk iterasyon: sadece rivals listesi gösteriliyor; side-aware
 *      renk bir sonraki adımda)
 *
 * Toggle'lar store.countryFocusView'tan okunur:
 *   outline | ownSites | rivalSites | rivalFlag
 *
 * Bu katman mevcut conflictLayer ve globalSitesLayer'ın ÜZERİNE yerleşir
 * ama onları ezmez — z-order daha yukarı. Her şey interactive=false ile
 * çizilir ki tesis/force tıklamaları altta çalışmaya devam etsin (tesise
 * tıklamak istersen CriticalSitesPanel → row click fly-to edecek).
 */
export default function CountryFocusLayer() {
  const map          = useMap()
  const focusCountry = useStore((s) => s.focusCountry)
  const view         = useStore((s) => s.countryFocusView)
  const layerRef     = useRef(null)

  useEffect(() => {
    // Her render'da eskisini sök — toggle ve ülke değişimleri için temiz.
    if (layerRef.current) {
      layerRef.current.remove()
      layerRef.current = null
    }
    if (!focusCountry) return

    const country = getCountry(focusCountry)
    if (!country) return

    const g = L.layerGroup()

    /* ── 1) Ülke sınır kutusu ────────────────────────────
       bounds her ülkede tanımlı değil; olmayanlara skip. Rectangle
       dashed + hafif dolgu — "bu ülkeye bakıyorum" aurası. */
    if (view.outline && Array.isArray(country.bounds)) {
      L.rectangle(country.bounds, {
        color:        '#D85A30',
        weight:       1.6,
        opacity:      0.55,
        dashArray:    '8 6',
        fillColor:    '#D85A30',
        fillOpacity:  0.03,
        interactive:  false,
      }).addTo(g)
    }

    /* ── 2) Kendi kritik tesisleri (accent) ─────────────── */
    const ownSites = view.ownSites ? (criticalSitesOf(focusCountry)?.sites || []) : []
    ownSites.forEach((site) => drawSiteMarker(g, site, {
      color:  '#D85A30',
      label:  `${country.flag} ${country.label} · Kritik`,
      badge:  'biz',
    }))

    /* ── 3) Rakip ülkelerin kritik tesisleri (kırmızı) ─── */
    if (view.rivalSites) {
      const rivals = rivalsOf(focusCountry)
      rivals.forEach((rival) => {
        const sites = criticalSitesOf(rival.code)?.sites || []
        sites.forEach((site) => drawSiteMarker(g, site, {
          color:  '#EF4444',
          label:  `${rival.flag} ${rival.label} · Kritik`,
          badge:  'rakip',
          altFlag: rival.flag,
        }))

        /* Rakip ülke merkezine bayrak etiketi (bounds varsa). */
        if (view.rivalFlag && Array.isArray(rival.bounds)) {
          const [[sLat, sLng], [nLat, nLng]] = rival.bounds
          const cLat = (sLat + nLat) / 2
          const cLng = (sLng + nLng) / 2
          L.marker([cLat, cLng], {
            interactive: false,
            icon: L.divIcon({
              className: '',
              iconSize:  null,
              iconAnchor:[20, 18],
              html: `<div style="
                display:inline-flex;align-items:center;gap:4px;
                padding:3px 7px;border-radius:10px;white-space:nowrap;
                background:rgba(239,68,68,0.12);
                border:1px solid rgba(239,68,68,0.5);
                color:#FCA5A5;
                font-family:'JetBrains Mono',monospace;
                font-size:10px;font-weight:600;
                box-shadow:0 2px 6px rgba(0,0,0,0.4);
                pointer-events:none;
              ">${rival.flag} ${rival.label.toUpperCase()}</div>`,
            }),
          }).addTo(g)
        }
      })
    }

    g.addTo(map)
    layerRef.current = g
    return () => {
      if (layerRef.current) { layerRef.current.remove(); layerRef.current = null }
    }
  }, [focusCountry, view, map])

  return null
}

/**
 * Tek bir kritik tesis marker'ı çizer — dış halo halkası (önem) + iç
 * solid noktacık. Priority 1 en büyük, 3 en küçük.
 */
function drawSiteMarker(group, site, { color, label, badge, altFlag }) {
  if (typeof site.lat !== 'number' || typeof site.lng !== 'number') return

  const baseRadius = site.priority === 1 ? 14 : site.priority === 2 ? 10 : 7
  const kindLabel  = SITE_KIND_LABELS[site.kind] || site.kind

  /* Pulsing halo — önem katsayısıyla oran */
  const haloHtml = `<div style="
    position:absolute;
    width:${baseRadius * 2.6}px;height:${baseRadius * 2.6}px;
    left:50%;top:50%;transform:translate(-50%,-50%);
    border-radius:50%;
    background:radial-gradient(circle, ${color}45 0%, ${color}00 70%);
    pointer-events:none;
    ${site.priority === 1 ? 'animation: pulse-ring 2.2s infinite ease-out;' : ''}
  "></div>`

  /* İç işaretçi */
  const pinHtml = `<div style="
    position:relative;z-index:2;
    width:${baseRadius}px;height:${baseRadius}px;
    border-radius:50%;
    background:${color}cc;
    border:2px solid ${color};
    box-shadow:0 0 6px ${color}99, inset 0 0 4px rgba(0,0,0,0.3);
  "></div>`

  /* Rakip tesislerinde mini bayrak badge */
  const flagBadge = altFlag
    ? `<div style="
        position:absolute;right:-6px;top:-6px;z-index:3;
        width:14px;height:14px;border-radius:50%;
        background:#0D1526;border:1px solid ${color};
        display:flex;align-items:center;justify-content:center;
        font-size:9px;line-height:1;
        box-shadow:0 0 3px rgba(0,0,0,0.6);
      ">${altFlag}</div>`
    : ''

  const size = baseRadius * 2.8
  const icon = L.divIcon({
    className: '',
    iconSize:  [size, size],
    iconAnchor:[size / 2, size / 2],
    html: `<div style="position:relative;width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;">
             ${haloHtml}${pinHtml}${flagBadge}
           </div>`,
  })

  L.marker([site.lat, site.lng], {
    icon,
    interactive: true,
    keyboard:    false,
    zIndexOffset: site.priority === 1 ? 800 : 500,
  })
    .bindTooltip(
      `<b>${site.name}</b><br/>
       <span style="color:${color}">${label} · ${kindLabel}</span>` +
       (site.note ? `<br/><span style="color:#8A9BBC;font-size:10px">${site.note}</span>` : ''),
      { direction: 'top', offset: [0, -baseRadius] }
    )
    .addTo(group)
}
