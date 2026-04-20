import html2canvas from 'html2canvas'

/**
 * Capture the map area as PNG and trigger download.
 * @param {string} filename
 */
export async function exportMapPng(filename = 'tairos-kapsama.png') {
  const mapEl = document.getElementById('map-export-area')
  if (!mapEl) return

  try {
    const canvas = await html2canvas(mapEl, {
      useCORS: true,
      allowTaint: true,
      scale: 2,
      backgroundColor: '#060A14',
      logging: false,
      ignoreElements: (el) => el.classList?.contains('no-export'),
    })

    const link = document.createElement('a')
    link.download = filename
    link.href = canvas.toDataURL('image/png')
    link.click()
  } catch (err) {
    console.error('Export failed:', err)
    alert('PNG dışa aktarma başarısız. Tarayıcınız bu özelliği desteklemiyor olabilir.')
  }
}

/**
 * Copy current URL state to clipboard.
 */
export function copyShareUrl(urlState) {
  const url = `${window.location.origin}${window.location.pathname}?${urlState}`
  navigator.clipboard?.writeText(url).then(() => {
    return true
  })
  return url
}
