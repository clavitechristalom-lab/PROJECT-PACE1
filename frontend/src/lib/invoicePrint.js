import { fmt } from './utils'

/**
 * Formats line-item quantities cleanly (e.g., 1 instead of 1.000).
 */
export function formatQty(q) {
  const n = Number(q || 0)
  if (!Number.isFinite(n)) return '0'
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '')
}

/**
 * Escapes HTML entities before embedding dynamic text into a print window.
 */
export function escapeHtml(val) {
  return String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Separates an explicit or note-embedded Ref # token from freeform remarks,
 * preventing warranty/pickup notes from masquerading as a bank/e-wallet trace #
 * when stale or cached records carry notes inside `reference_no`.
 */
export function extractDigitalRefAndNotes(notes, explicitRef = '', channel = '', category = 'sales') {
  const rawNotes = String(notes ?? '').trim()
  const rawExplicit = String(explicitRef ?? '').trim()

  let refNo = rawExplicit
  const match = rawNotes.match(/(?:^|\|)\s*Ref\s*#?\s*:\s*([^|\r\n]+)/i)

  if (match) {
    if (!refNo) refNo = match[1].trim()
  } else if (
    category === 'sales' &&
    refNo &&
    rawNotes &&
    refNo === rawNotes &&
    channel !== 'ewallet' &&
    channel !== 'online_bank'
  ) {
    refNo = ''
  }

  let cleanNotes = rawNotes
  if (match) {
    cleanNotes = rawNotes
      .replace(/(?:^|\|)\s*Ref\s*#?\s*:\s*[^|\r\n]+/gi, '')
      .replace(/^\s*\|\s*|\s*\|\s*$/g, '')
      .replace(/\s*\|\s*\|\s*/g, ' | ')
      .trim()
  }

  return { refNo, cleanNotes }
}

/**
 * Opens a dedicated standalone print window formatted as an Official Sales Invoice
 * or Official Collection Receipt.
 */
export function printOfficialInvoice({
  sale,
  items = [],
  installmentAccount = null,
  paymentSchedule = null,
  isCollection = false,
  defaultBranch = 'Main Branch',
  onPopupBlocked,
}) {
  if (!sale) return

  const printWindow = window.open('', '_blank')
  if (!printWindow) {
    if (onPopupBlocked) onPopupBlocked()
    return
  }

  const lineItems = Array.isArray(items) ? items : []
  const inst = installmentAccount || null
  const schedules = inst?.payment_schedules || inst?.paymentSchedules || []
  const totalUnits = lineItems.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0)

  const docNo = sale.invoice_no || sale.reference_code || ''
  const docTag = isCollection ? 'Official Collection Receipt' : 'Official Sales Invoice'
  const docTitle = isCollection ? `Collection Receipt - ${docNo}` : `Sales Invoice - ${docNo}`
  const companyTitle = escapeHtml(sale.company_name || 'Z-LICZ APPLIANCES')
  const branchLabel = escapeHtml(sale.branch_name || defaultBranch || 'Main Branch')
  const branchAddress = escapeHtml(sale.branch_location || '')
  const branchContact = escapeHtml(sale.branch_contact || '')
  const taxId = escapeHtml(sale.company_tax_id || '')

  const { refNo, cleanNotes } = extractDigitalRefAndNotes(
    sale.notes,
    sale.reference_no,
    sale.channel,
    isCollection ? 'payment' : 'sales'
  )

  const statusVal = sale.status || 'Completed'
  const statusBadgeStyle = statusVal === 'Completed' || statusVal === 'Paid'
    ? 'background:#dcfce7;color:#166534;border:1px solid #86efac;'
    : statusVal === 'Partially Paid' || statusVal === 'Pending' || statusVal === 'Pending Verification'
      ? 'background:#fef3c7;color:#92400e;border:1px solid #fcd34d;'
      : 'background:#fee2e2;color:#991b1b;border:1px solid #fca5a5;'

  const itemRowsHtml = lineItems.map((it, idx) => {
    const meta = [it.product_code, it.brand, it.category].filter(Boolean).map(escapeHtml).join(' • ')
    const disc = Number(it.discount_amount ?? it.discount ?? 0)
    const lineTot = Number(it.line_total ?? it.total_price ?? 0)
    return `
      <tr>
        <td style="padding:9px 8px;border-bottom:1px solid #e2e8f0;text-align:center;color:#64748b;font-family:monospace;">${idx + 1}</td>
        <td style="padding:9px 8px;border-bottom:1px solid #e2e8f0;">
          <div style="font-weight:700;color:#0f172a;">${escapeHtml(it.product_name)}</div>
          ${meta ? `<div style="font-size:11px;color:#64748b;margin-top:2px;font-family:monospace;">${meta}</div>` : ''}
        </td>
        <td style="padding:9px 8px;border-bottom:1px solid #e2e8f0;text-align:right;font-family:monospace;">${fmt(it.unit_price)}</td>
        <td style="padding:9px 8px;border-bottom:1px solid #e2e8f0;text-align:center;font-family:monospace;font-weight:700;">${formatQty(it.quantity)}</td>
        <td style="padding:9px 8px;border-bottom:1px solid #e2e8f0;text-align:right;font-family:monospace;color:${disc > 0 ? '#e11d48' : '#64748b'};">
          ${disc > 0 ? `- ${fmt(disc)}` : '₱0.00'}
        </td>
        <td style="padding:9px 8px;border-bottom:1px solid #e2e8f0;text-align:right;font-family:monospace;font-weight:700;color:#0f172a;">${fmt(lineTot)}</td>
      </tr>
    `
  }).join('')

  const installmentHtml = inst ? `
    <div style="margin-top:18px;border:1px solid #fcd34d;background:#fffbeb;border-radius:10px;padding:12px 14px;">
      <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.6px;color:#92400e;margin-bottom:8px;">
        Installment Financing Contract (${escapeHtml(inst.account_no || 'Active')})
      </div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;font-size:11px;">
        <div><span style="color:#64748b;display:block;">Financed Principal</span><strong style="font-family:monospace;">${fmt(inst.principal_amount)}</strong></div>
        <div><span style="color:#64748b;display:block;">Interest (${Number(inst.interest_rate || 0)}%)</span><strong style="font-family:monospace;">${fmt(inst.interest_amount)}</strong></div>
        <div><span style="color:#64748b;display:block;">Total Financed Payable</span><strong style="font-family:monospace;">${fmt(inst.total_payable)}</strong></div>
        <div><span style="color:#64748b;display:block;">Amortization (${escapeHtml(inst.frequency || 'Monthly')})</span><strong style="font-family:monospace;color:#1d4ed8;">${fmt(inst.installment_amount)} &times; ${inst.number_of_installments || 0}</strong></div>
      </div>
      ${paymentSchedule ? `
        <div style="margin-top:10px;padding:8px 10px;background:#ffffff;border:1px solid #fde68a;border-radius:6px;font-size:11px;display:flex;justify-content:space-between;gap:12px;">
          <span><strong>Applied Schedule:</strong> Installment #${paymentSchedule.installment_no}</span>
          <span><strong>Due Date:</strong> <span style="font-family:monospace;">${escapeHtml(paymentSchedule.due_date)}</span></span>
          <span><strong>Schedule Status:</strong> ${escapeHtml(paymentSchedule.status)}</span>
        </div>
      ` : ''}
      ${schedules.length > 0 ? `
        <table style="width:100%;border-collapse:collapse;margin-top:10px;font-size:11px;background:#ffffff;border-radius:6px;overflow:hidden;">
          <thead>
            <tr style="background:#fef3c7;color:#78350f;">
              <th style="padding:6px 8px;text-align:center;">#</th>
              <th style="padding:6px 8px;text-align:left;">Due Date</th>
              <th style="padding:6px 8px;text-align:right;">Amount Due</th>
              <th style="padding:6px 8px;text-align:right;">Paid</th>
              <th style="padding:6px 8px;text-align:right;">Balance</th>
              <th style="padding:6px 8px;text-align:center;">Status</th>
            </tr>
          </thead>
          <tbody>
            ${schedules.slice(0, 12).map(sc => `
              <tr>
                <td style="padding:5px 8px;border-top:1px solid #fde68a;text-align:center;font-family:monospace;">${sc.installment_no}</td>
                <td style="padding:5px 8px;border-top:1px solid #fde68a;font-family:monospace;">${escapeHtml(sc.due_date)}</td>
                <td style="padding:5px 8px;border-top:1px solid #fde68a;text-align:right;font-family:monospace;">${fmt(sc.amount_due)}</td>
                <td style="padding:5px 8px;border-top:1px solid #fde68a;text-align:right;font-family:monospace;">${fmt(sc.amount_paid)}</td>
                <td style="padding:5px 8px;border-top:1px solid #fde68a;text-align:right;font-family:monospace;font-weight:700;">${fmt(sc.balance_due)}</td>
                <td style="padding:5px 8px;border-top:1px solid #fde68a;text-align:center;">${escapeHtml(sc.status)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      ` : ''}
    </div>
  ` : ''

  const paymentChannelLabel = sale.provider && sale.payment_method && sale.provider !== sale.payment_method
    ? `${sale.payment_method} (${sale.provider})`
    : (sale.provider || sale.payment_method || 'Cash')

  const subtotalVal = Number(sale.subtotal ?? sale.total_amount ?? sale.amount ?? 0)
  const discountVal = Number(sale.discount_amount ?? 0)
  const totalVal = Number(sale.total_amount ?? sale.amount ?? 0)
  const paidVal = Number(sale.amount_paid ?? sale.amount ?? 0)
  const balanceVal = Number(sale.balance_due ?? 0)

  const breakdownHtml = isCollection ? `
    <div class="totals-box">
      <div class="box-label">Collection Summary</div>
      ${inst ? `<div class="total-line"><span>Contract Total Payable</span><strong style="font-family:monospace;color:#0f172a;">${fmt(inst.total_payable)}</strong></div>` : ''}
      ${inst ? `<div class="total-line"><span>Total Paid To Date</span><strong style="font-family:monospace;color:#059669;">${fmt(inst.total_paid)}</strong></div>` : ''}
      <div class="grand-total"><span>AMOUNT COLLECTED</span><span style="font-family:monospace;color:#1d4ed8;">${fmt(paidVal)}</span></div>
      ${inst ? `<div class="total-line"><span>Remaining Contract Balance</span><strong style="font-family:monospace;color:${Number(inst.balance) > 0 ? '#e11d48' : '#059669'};">${fmt(inst.balance)}</strong></div>` : ''}
    </div>
  ` : `
    <div class="totals-box">
      <div class="box-label">Payment Breakdown</div>
      <div class="total-line"><span>Gross Subtotal (${formatQty(totalUnits)} unit${totalUnits !== 1 ? 's' : ''})</span><strong style="font-family:monospace;color:#0f172a;">${fmt(subtotalVal)}</strong></div>
      <div class="total-line"><span>Total Discount</span><strong style="font-family:monospace;color:#e11d48;">- ${fmt(discountVal)}</strong></div>
      <div class="grand-total"><span>TOTAL AMOUNT</span><span style="font-family:monospace;color:#1d4ed8;">${fmt(totalVal)}</span></div>
      <div class="total-line"><span>Amount Paid</span><strong style="font-family:monospace;color:#059669;">${fmt(paidVal)}</strong></div>
      <div class="total-line"><span>Balance Due</span><strong style="font-family:monospace;color:${balanceVal > 0 ? '#e11d48' : '#059669'};">${fmt(balanceVal)}</strong></div>
    </div>
  `

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(docTitle)}</title>
        <style>
          @page { size: auto; margin: 14mm; }
          * { box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            margin: 0;
            padding: 24px;
            color: #0f172a;
            background: #ffffff;
            font-size: 12px;
            line-height: 1.45;
          }
          .invoice-shell { max-width: 820px; margin: 0 auto; }
          .top-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 16px;
            border-bottom: 2px solid #1d4ed8;
            padding-bottom: 14px;
            margin-bottom: 18px;
          }
          .brand { font-size: 20px; font-weight: 900; letter-spacing: 0.4px; color: #0f172a; }
          .meta-sub { font-size: 11px; color: #475569; margin-top: 2px; }
          .doc-tag {
            display: inline-block;
            font-size: 10px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.8px;
            color: #1d4ed8;
            background: #eff6ff;
            border: 1px solid #bfdbfe;
            padding: 3px 9px;
            border-radius: 999px;
          }
          .info-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 14px;
            margin-bottom: 18px;
          }
          .info-box {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 10px;
            padding: 12px 14px;
          }
          .box-label {
            font-size: 10px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.7px;
            color: #64748b;
            margin-bottom: 6px;
          }
          .info-row { display: flex; justify-content: space-between; gap: 10px; font-size: 11.5px; margin-top: 3px; }
          table.items { width: 100%; border-collapse: collapse; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; }
          table.items th {
            background: #f1f5f9;
            color: #334155;
            font-size: 10.5px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            padding: 9px 8px;
            border-bottom: 1px solid #cbd5e1;
          }
          .bottom-grid { display: grid; grid-template-columns: 1.15fr 0.85fr; gap: 14px; margin-top: 18px; align-items: start; }
          .totals-box { border: 1px solid #cbd5e1; border-radius: 10px; padding: 12px 14px; background: #ffffff; }
          .total-line { display: flex; justify-content: space-between; padding: 4px 0; font-size: 12px; color: #475569; }
          .grand-total {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-top: 1.5px solid #cbd5e1;
            border-bottom: 1px solid #e2e8f0;
            margin: 8px 0;
            padding: 8px 0;
            font-size: 14px;
            font-weight: 900;
            color: #0f172a;
          }
          .signatures {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 36px;
            margin-top: 36px;
            padding-top: 12px;
          }
          .sig-line { border-top: 1px solid #94a3b8; padding-top: 5px; text-align: center; font-size: 11px; color: #475569; }
          @media print {
            body { padding: 0; }
            * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          }
        </style>
      </head>
      <body>
        <div class="invoice-shell">
          <div class="top-header">
            <div>
              <div class="brand">${companyTitle}</div>
              <div class="meta-sub"><strong>Branch:</strong> ${branchLabel}${branchAddress ? ` &bull; ${branchAddress}` : ''}</div>
              ${branchContact || sale.company_email ? `<div class="meta-sub">${[branchContact ? `Tel: ${branchContact}` : '', sale.company_email ? escapeHtml(sale.company_email) : ''].filter(Boolean).join(' • ')}</div>` : ''}
              ${taxId ? `<div class="meta-sub">TIN: <span style="font-family:monospace;">${taxId}</span></div>` : ''}
            </div>
            <div style="text-align:right;">
              <div class="doc-tag">${escapeHtml(docTag)}</div>
              <div style="font-size:18px;font-weight:900;font-family:monospace;margin-top:6px;">${escapeHtml(docNo)}</div>
              <div style="font-size:11px;color:#475569;font-family:monospace;margin-top:2px;">${escapeHtml(sale.sale_datetime || sale.sale_date || sale.date)}</div>
              <div style="margin-top:6px;">
                <span style="display:inline-block;padding:2px 10px;border-radius:999px;font-size:10.5px;font-weight:800;${statusBadgeStyle}">
                  ${escapeHtml(statusVal)}
                </span>
              </div>
            </div>
          </div>

          <div class="info-grid">
            <div class="info-box">
              <div class="box-label">Billed To (Customer)</div>
              <div style="font-size:14px;font-weight:800;color:#0f172a;">${escapeHtml(sale.customer_name)}</div>
              ${sale.customer_code && sale.customer_code !== '—' ? `<div class="info-row"><span>Customer Code:</span><strong style="font-family:monospace;">${escapeHtml(sale.customer_code)}</strong></div>` : ''}
              ${sale.customer_phone ? `<div class="info-row"><span>Contact No:</span><strong style="font-family:monospace;">${escapeHtml(sale.customer_phone)}</strong></div>` : ''}
              ${sale.customer_email ? `<div class="info-row"><span>Email:</span><span>${escapeHtml(sale.customer_email)}</span></div>` : ''}
              ${sale.customer_address ? `<div class="info-row"><span>Address:</span><span style="text-align:right;">${escapeHtml(sale.customer_address)}</span></div>` : ''}
            </div>

            <div class="info-box">
              <div class="box-label">Transaction Details</div>
              <div class="info-row"><span>Payment Method:</span><strong>${escapeHtml(paymentChannelLabel)}</strong></div>
              ${refNo ? `<div class="info-row"><span>Digital Ref / Trace #:</span><strong style="font-family:monospace;">${escapeHtml(refNo)}</strong></div>` : ''}
              ${isCollection && sale.account_no && sale.account_no !== 'N/A' ? `<div class="info-row"><span>Installment Account:</span><strong style="font-family:monospace;">${escapeHtml(sale.account_no)}</strong></div>` : ''}
              ${isCollection && sale.invoice_no ? `<div class="info-row"><span>Linked Invoice:</span><strong style="font-family:monospace;">${escapeHtml(sale.invoice_no)}</strong></div>` : ''}
              <div class="info-row"><span>Store Branch:</span><strong>${branchLabel}</strong></div>
              <div class="info-row"><span>Processed By:</span><strong>${escapeHtml(sale.processed_by || 'Staff')}</strong></div>
              ${lineItems.length > 0 ? `<div class="info-row"><span>Items Count:</span><strong style="font-family:monospace;">${lineItems.length} line(s) / ${formatQty(totalUnits)} unit(s)</strong></div>` : ''}
              <div class="info-row"><span>Currency:</span><strong style="font-family:monospace;">PHP (&#8369;)</strong></div>
            </div>
          </div>

          ${(!isCollection || lineItems.length > 0) ? `
            <table class="items">
              <thead>
                <tr>
                  <th style="width:36px;text-align:center;">#</th>
                  <th style="text-align:left;">${isCollection ? 'Financed Item / SKU' : 'Item Description / SKU'}</th>
                  <th style="text-align:right;">Unit Price</th>
                  <th style="width:60px;text-align:center;">Qty</th>
                  <th style="text-align:right;">Discount</th>
                  <th style="text-align:right;">Line Total</th>
                </tr>
              </thead>
              <tbody>
                ${itemRowsHtml || '<tr><td colspan="6" style="padding:18px;text-align:center;color:#94a3b8;">No items recorded</td></tr>'}
              </tbody>
            </table>
          ` : ''}

          ${installmentHtml}

          <div class="bottom-grid">
            <div class="info-box" style="min-height:110px;">
              <div class="box-label">Notes &amp; Warranty Remarks</div>
              <div style="font-size:11.5px;color:#334155;white-space:pre-wrap;">${escapeHtml(cleanNotes || 'Standard store warranty applies. Retain this invoice for warranty claims and account verification.')}</div>
            </div>
            ${breakdownHtml}
          </div>

          <div class="signatures">
            <div class="sig-line"><strong>Customer Signature Over Printed Name</strong></div>
            <div class="sig-line"><strong>${escapeHtml(sale.processed_by || 'Authorized Representative')}</strong><br />Cashier / Store Representative</div>
          </div>

          <div style="margin-top:24px;border-top:1px dashed #cbd5e1;padding-top:10px;font-size:10.5px;color:#64748b;display:flex;justify-content:space-between;">
            <span>This document serves as an official sales transaction record.</span>
            <span>Printed on ${escapeHtml(new Date().toLocaleString('en-PH'))}</span>
          </div>
        </div>
      </body>
    </html>
  `)
  printWindow.document.close()
  printWindow.focus()
  setTimeout(() => {
    printWindow.print()
  }, 350)
}

