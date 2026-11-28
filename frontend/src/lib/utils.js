export const fmt = (n) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 2 }).format(n || 0)

export const fmtDate = (d) =>
  new Date(d).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })

export const fmtTime = (t) => t

export const fmtDateTime = (d) =>
  new Date(d).toLocaleString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

export function filterBySearch(items, query, fields) {
  if (!query || !items) return items || []
  const q = query.toLowerCase().trim()
  return items.filter(item => {
    return fields.some(f => {
      const val = item[f]
      return val ? String(val).toLowerCase().includes(q) : false
    })
  })
}

export function exportCSV(filename, headers, rows) {
  const escape = (v) => {
    const s = String(v ?? '')
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = [headers, ...rows].map(r => r.map(escape).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export { fastDeepEqual, setIfChanged } from './diff'

export const PRODUCT_UNIT_OPTIONS = ['unit', 'pcs', 'set', 'box', 'pair']
export const DIMENSION_UNITS = ['cm', 'mm', 'm', 'in', 'ft']
export const WEIGHT_UNITS = ['kg', 'g', 'lbs']

function trimDecimal(val) {
  if (val === null || val === undefined || val === '') return null
  const num = Number(val)
  if (!Number.isFinite(num)) return null
  return Number.isInteger(num) ? String(num) : String(parseFloat(num.toFixed(2)))
}

export function formatProductMeasurements(product) {
  if (!product) {
    return { hasAny: false, lengthLabel: null, widthLabel: null, heightLabel: null, weightLabel: null, dimensionsSummary: '', summary: '' }
  }
  const dimUnit = product.dimension_unit || 'cm'
  const weightUnit = product.weight_unit || 'kg'
  const l = trimDecimal(product.length)
  const w = trimDecimal(product.width)
  const h = trimDecimal(product.height)
  const wt = trimDecimal(product.weight)

  const lengthLabel = l ? `${l} ${dimUnit}` : null
  const widthLabel = w ? `${w} ${dimUnit}` : null
  const heightLabel = h ? `${h} ${dimUnit}` : null
  const weightLabel = wt ? `${wt} ${weightUnit}` : null

  const dimParts = [
    l ? `L ${l}` : null,
    w ? `W ${w}` : null,
    h ? `H ${h}` : null,
  ].filter(Boolean)

  const dimensionsSummary = dimParts.length > 0 ? `${dimParts.join(' × ')} ${dimUnit}` : ''
  const summaryParts = [dimensionsSummary || null, weightLabel].filter(Boolean)
  const summary = summaryParts.join(' · ')

  return {
    hasAny: summaryParts.length > 0,
    lengthLabel,
    widthLabel,
    heightLabel,
    weightLabel,
    dimensionsSummary,
    summary,
  }
}

export function summarizePaymentNotes(rawNotes) {
  const text = String(rawNotes ?? '').trim()
  if (!text) return ''
  if (!text.includes('|') && !/collected (?:in field )?by collector:/i.test(text) && !/received by cashier:/i.test(text)) {
    return text
  }

  const segments = text.split('|').map(s => s.trim()).filter(Boolean)
  let collector = ''
  let cashier = ''
  let approver = ''
  let orNumber = ''
  let method = ''
  let customRemark = ''

  const cleanPerson = (val) =>
    String(val || '')
      .replace(/\s*[—-]\s*sent to store admin.*$/i, '')
      .replace(/\s*\(EMP-\d+\)/gi, '')
      .trim()

  const formatMethod = (val) => {
    const clean = String(val || '').trim()
    if (!clean) return ''
    if (clean.toLowerCase() === 'gcash') return 'GCash'
    if (clean.toLowerCase() === 'maya') return 'Maya'
    if (clean.toLowerCase() === 'online bank') return 'Online Bank'
    if (clean.toLowerCase() === 'cash') return 'Cash'
    return clean.charAt(0).toUpperCase() + clean.slice(1)
  }

  for (const seg of segments) {
    let m
    if ((m = seg.match(/^Collected(?:\s+in\s+field)?\s+by\s+Collector:\s*(.+)$/i))) {
      collector = cleanPerson(m[1])
    } else if ((m = seg.match(/^(?:Received\s+by\s+)?Cashier:\s*(.+)$/i))) {
      cashier = cleanPerson(m[1])
    } else if ((m = seg.match(/^Approved\s+by\s+Store\s+Admin:\s*(.+)$/i))) {
      approver = cleanPerson(m[1])
    } else if ((m = seg.match(/^(?:Cashier\s+)?OR\s*#:\s*(.+)$/i))) {
      orNumber = m[1].trim()
    } else if ((m = seg.match(/^Method:\s*(.+)$/i))) {
      method = formatMethod(m[1])
    } else if ((m = seg.match(/^(?:Remarks|Note|Cashier\s+Note):\s*(.+)$/i))) {
      const rem = m[1].trim()
      if (!/^Door-to-door\s+.+\s+collected\s+for\s+/i.test(rem)) {
        customRemark = rem
      } else if (!method) {
        const mm = rem.match(/^Door-to-door\s+(.+?)\s+payment/i)
        if (mm) method = formatMethod(mm[1])
      }
    }
  }

  const parts = []
  const channelLabel = collector
    ? `Field ${method || 'Cash'}`
    : cashier
      ? `Store ${method || 'Cash'}`
      : (method || 'Payment')
  parts.push(orNumber ? `${channelLabel} (${orNumber})` : channelLabel)
  if (collector) parts.push(`Collector: ${collector}`)
  if (cashier) parts.push(`Cashier: ${cashier}`)
  if (approver) parts.push(`Approved: ${approver}`)
  if (customRemark) parts.push(customRemark)

  return parts.length > 1 ? parts.join(' • ') : text
}

