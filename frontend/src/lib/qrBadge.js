/**
 * Shared QR Badge download (large, centered PNG) & isolated single-badge print helper.
 */

function serializeQrSvg(svgEl, targetSize = 800) {
  const clone = svgEl.cloneNode(true)
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('width', String(targetSize))
  clone.setAttribute('height', String(targetSize))
  return new XMLSerializer().serializeToString(clone)
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * Downloads the QR code as a crisp 1024x1024 high-resolution PNG with the QR
 * code large (760x760) and centered cleanly on a white canvas.
 */
export async function downloadCenteredQrPng(svgElementId, filenameBase = 'QR_Badge', caption = {}) {
  const svgEl = document.getElementById(svgElementId)
  if (!svgEl) return false

  const canvasSize = 1024
  const qrSize = caption.code || caption.name ? 740 : 820
  const svgString = serializeQrSvg(svgEl, qrSize)
  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
  const svgUrl = URL.createObjectURL(svgBlob)

  try {
    const img = await new Promise((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = reject
      image.src = svgUrl
    })

    const canvas = document.createElement('canvas')
    canvas.width = canvasSize
    canvas.height = canvasSize
    const ctx = canvas.getContext('2d')

    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvasSize, canvasSize)

    const qrX = Math.round((canvasSize - qrSize) / 2)
    const qrY = caption.code || caption.name
      ? Math.round((canvasSize - qrSize) / 2 - 44)
      : Math.round((canvasSize - qrSize) / 2)

    ctx.drawImage(img, qrX, qrY, qrSize, qrSize)

    if (caption.name || caption.code) {
      ctx.textAlign = 'center'
      ctx.fillStyle = '#0f172a'
      if (caption.name) {
        ctx.font = '700 32px Inter, system-ui, -apple-system, sans-serif'
        ctx.fillText(String(caption.name), canvasSize / 2, qrY + qrSize + 52)
      }
      if (caption.code) {
        ctx.font = '700 26px "DM Mono", monospace'
        ctx.fillStyle = '#475569'
        ctx.fillText(String(caption.code), canvasSize / 2, qrY + qrSize + (caption.name ? 92 : 56))
      }
    }

    const pngBlob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png', 1.0))
    if (!pngBlob) return false

    const pngUrl = URL.createObjectURL(pngBlob)
    const link = document.createElement('a')
    link.href = pngUrl
    link.download = `${filenameBase}.png`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(pngUrl)
    return true
  } finally {
    URL.revokeObjectURL(svgUrl)
  }
}

/**
 * Prints ONLY a single centered employee QR badge card via an isolated hidden iframe,
 * avoiding duplicate elements or printing surrounding modal chrome.
 */
export function printSingleBadge({
  svgElementId,
  name = 'Employee',
  position = '',
  department = '',
  branch = '',
  code = '',
  statusLabel = 'Active QR Badge',
}) {
  const svgEl = document.getElementById(svgElementId)
  if (!svgEl) return false

  const svgMarkup = serializeQrSvg(svgEl, 180)
  const subtitle = [department, branch].filter(Boolean).join(' · ')

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Employee Badge - ${escapeHtml(code || name)}</title>
  <style>
    @page { size: auto; margin: 12mm; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      background: #ffffff;
      font-family: Inter, system-ui, -apple-system, "Segoe UI", sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .badge-card {
      width: 310px;
      border-radius: 18px;
      background: linear-gradient(180deg, #0f172a 0%, #1e293b 55%, #020617 100%);
      color: #ffffff;
      padding: 24px 20px;
      text-align: center;
      border: 1px solid #334155;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .accent-bar {
      width: 52px;
      height: 4px;
      border-radius: 999px;
      background: #fbbf24;
      margin: 0 auto 12px;
    }
    .brand {
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: #fcd34d;
    }
    .title {
      font-size: 12px;
      color: #cbd5e1;
      margin-top: 2px;
      font-weight: 500;
    }
    .name {
      font-size: 18px;
      font-weight: 700;
      margin: 14px 0 3px;
      color: #ffffff;
    }
    .position {
      font-size: 12px;
      font-weight: 600;
      color: #fcd34d;
      margin: 0;
    }
    .meta {
      font-size: 11px;
      color: #94a3b8;
      margin: 3px 0 0;
    }
    .code-pill {
      display: inline-block;
      margin-top: 8px;
      padding: 3px 12px;
      border-radius: 999px;
      font-family: "DM Mono", ui-monospace, monospace;
      font-size: 12px;
      font-weight: 700;
      background: #1e293b;
      color: #e2e8f0;
      border: 1px solid #475569;
    }
    .qr-box {
      margin: 16px auto 0;
      padding: 12px;
      background: #ffffff;
      border-radius: 14px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 2px solid #e2e8f0;
    }
    .status {
      margin-top: 14px;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: #cbd5e1;
    }
  </style>
</head>
<body>
  <div class="badge-card">
    <div class="accent-bar"></div>
    <div class="brand">Z-LICZ STORE</div>
    <div class="title">Official Employee Badge</div>
    <div class="name">${escapeHtml(name)}</div>
    ${position ? `<div class="position">${escapeHtml(position)}</div>` : ''}
    ${subtitle ? `<div class="meta">${escapeHtml(subtitle)}</div>` : ''}
    ${code ? `<div class="code-pill">${escapeHtml(code)}</div>` : ''}
    <div class="qr-box">${svgMarkup}</div>
    <div class="status">${escapeHtml(statusLabel)}</div>
  </div>
</body>
</html>`

  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  iframe.style.visibility = 'hidden'
  document.body.appendChild(iframe)

  const doc = iframe.contentWindow?.document
  if (!doc) {
    document.body.removeChild(iframe)
    return false
  }

  doc.open()
  doc.write(html)
  doc.close()

  const triggerPrint = () => {
    try {
      iframe.contentWindow.focus()
      iframe.contentWindow.print()
    } finally {
      setTimeout(() => {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe)
      }, 1500)
    }
  }

  setTimeout(triggerPrint, 120)
  return true
}

