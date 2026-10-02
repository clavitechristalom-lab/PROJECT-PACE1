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
