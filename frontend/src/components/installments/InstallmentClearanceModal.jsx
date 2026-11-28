import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import {
  FiX, FiPrinter, FiAward, FiFileText, FiCheckCircle,
  FiLayers, FiShield, FiAlertCircle,
} from 'react-icons/fi'
import api from '../../lib/api'
import { fmt } from '../../lib/utils'
import { Spinner } from '../ui'
import './installmentPrint.css'

function formatDisplayDate(val) {
  if (!val) return '—'
  const d = new Date(val)
  if (Number.isNaN(d.getTime())) return String(val)
  return d.toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export default function InstallmentClearanceModal({ isOpen, installmentId, initialView = 'both', onClose }) {
  const [docData, setDocData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [activeDoc, setActiveDoc] = useState(initialView)

  useEffect(() => {
    setActiveDoc(initialView)
  }, [initialView, isOpen])

  const loadDocument = useCallback(async () => {
    if (!isOpen || !installmentId) return
    setLoading(true)
    setError('')
    try {
      const res = await api.installments.getClearanceDocument(installmentId)
      if (res?.document) {
        setDocData(res.document)
      } else {
        setError(res?.message || 'Unable to load clearance document.')
      }
    } catch (err) {
      setError(err?.message || 'Failed to load Certificate of Full Payment & Final SOA.')
    } finally {
      setLoading(false)
    }
  }, [isOpen, installmentId])

  useEffect(() => {
    if (isOpen && installmentId) {
      loadDocument()
    } else {
      setDocData(null)
      setError('')
    }
  }, [isOpen, installmentId, loadDocument])

  useEffect(() => {
    if (!isOpen) return
    const onAfterPrint = () => {
      document.body.classList.remove('printing-installment-clearance')
    }
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('afterprint', onAfterPrint)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.classList.remove('printing-installment-clearance')
      window.removeEventListener('afterprint', onAfterPrint)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  const handlePrint = () => {
    document.body.classList.add('printing-installment-clearance')
    setTimeout(() => {
      window.print()
      setTimeout(() => {
        document.body.classList.remove('printing-installment-clearance')
      }, 600)
    }, 60)
  }

  const company = docData?.company || {}
  const contract = docData?.contract || {}
  const customer = docData?.customer || {}
  const items = docData?.items || []
  const ledger = docData?.ledger || []
  const signatory = docData?.signatory || {}

  const showCertificate = activeDoc === 'certificate' || activeDoc === 'both'
  const showSoa = activeDoc === 'soa' || activeDoc === 'both'

  const renderBranchHeader = (docTitle, docRef) => (
    <div className="border-b-2 border-slate-900 pb-4 mb-5 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
      <div>
        <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
          Official Installment Clearance Record
        </div>
        <h2 className="text-lg sm:text-xl font-black tracking-tight text-slate-900 mt-0.5">
          {company.name || 'Z-LICZ Furniture & Appliances Trading'}
        </h2>
        <div className="text-xs font-semibold text-slate-700 mt-0.5">
          Branch: {company.branch_name || 'Main Branch'}
          {company.branch_address ? ` • ${company.branch_address}` : ''}
        </div>
        {(company.branch_contact || company.branch_email) && (
          <div className="text-[11px] text-slate-500 mt-0.5">
            {[company.branch_contact, company.branch_email].filter(Boolean).join(' | ')}
          </div>
        )}
      </div>
      <div className="sm:text-right shrink-0">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-400 text-[11px] font-black uppercase tracking-wider">
          <FiCheckCircle className="w-3.5 h-3.5" />
          <span>Paid in Full</span>
        </div>
        <div className="text-xs font-extrabold uppercase tracking-wider text-slate-900 mt-2">
          {docTitle}
        </div>
        <div className="text-[11px] font-mono text-slate-600 mt-0.5">
          Ref: {docRef}
        </div>
        <div className="text-[11px] text-slate-500">
          Issued: {formatDisplayDate(docData?.issued_at)}
        </div>
      </div>
    </div>
  )

  const renderSignatoryBlock = () => (
    <div className="mt-7 pt-5 border-t border-slate-300 grid grid-cols-1 sm:grid-cols-2 gap-6 text-xs text-slate-800">
      <div>
        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-8">
          Verified &amp; Settled By
        </div>
        <div className="border-t border-slate-900 pt-1.5 font-bold text-slate-900">
          {signatory.verified_by_name || 'Store Administrator'}
        </div>
        <div className="text-[11px] text-slate-600">
          {signatory.verified_by_role || 'Store Administrator'} — {signatory.branch_name || company.branch_name}
        </div>
        <div className="text-[10px] text-slate-500 mt-0.5">
          Completion Date: {formatDisplayDate(contract.completed_at)}
        </div>
      </div>

      <div>
        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-8">
          Store Admin Release / Clearance Signatory
        </div>
        <div className="border-t border-slate-900 pt-1.5 font-bold text-slate-900">
          {signatory.store_admin_name || signatory.verified_by_name || 'Branch Store Administrator'}
        </div>
        <div className="text-[11px] text-slate-600">
          Authorized Branch Release Officer • {company.name}
        </div>
        <div className="text-[10px] text-emerald-700 font-bold mt-0.5 uppercase tracking-wide">
          Account Standing: {contract.customer_standing || 'Cleared / Good Standing'}
        </div>
      </div>
    </div>
  )

  return createPortal(
    <div className="fixed inset-0 z-[100] bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="bg-background border border-border rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">
        <div className="clearance-no-print px-5 py-3.5 border-b border-border bg-card flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <FiAward className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-extrabold text-foreground truncate">
                Installment Clearance Documents {contract.account_no ? `— ${contract.account_no}` : ''}
              </h3>
              <p className="text-[11px] text-muted-foreground truncate">
                Certificate of Full Payment &amp; Final Statement of Account (SOA)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="inline-flex rounded-xl bg-muted/70 border border-border p-0.5 text-[11px]">
              <button
                type="button"
                onClick={() => setActiveDoc('certificate')}
                className={`px-2.5 py-1 rounded-lg font-bold transition-colors cursor-pointer inline-flex items-center gap-1 ${
                  activeDoc === 'certificate' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <FiAward className="w-3.5 h-3.5" />
                <span>Certificate</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveDoc('soa')}
                className={`px-2.5 py-1 rounded-lg font-bold transition-colors cursor-pointer inline-flex items-center gap-1 ${
                  activeDoc === 'soa' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <FiFileText className="w-3.5 h-3.5" />
                <span>Final SOA</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveDoc('both')}
                className={`px-2.5 py-1 rounded-lg font-bold transition-colors cursor-pointer inline-flex items-center gap-1 ${
                  activeDoc === 'both' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <FiLayers className="w-3.5 h-3.5" />
                <span>Both</span>
              </button>
            </div>

            {docData && (
              <button
                type="button"
                onClick={handlePrint}
                className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors"
              >
                <FiPrinter className="w-3.5 h-3.5" />
                <span>Print</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-xl border border-border bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center cursor-pointer"
              aria-label="Close"
            >
              <FiX className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-100 dark:bg-slate-900/70">
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center gap-3">
              <Spinner className="w-8 h-8 text-emerald-600" />
              <p className="text-xs font-semibold text-muted-foreground">Preparing clearance documents...</p>
            </div>
          ) : error ? (
            <div className="p-6 rounded-2xl bg-card border border-rose-500/30 text-center space-y-3 max-w-md mx-auto my-10">
              <FiAlertCircle className="w-8 h-8 text-rose-500 mx-auto" />
              <p className="text-sm font-bold text-foreground">Unable to Load Clearance Documents</p>
              <p className="text-xs text-muted-foreground">{error}</p>
            </div>
          ) : docData ? (
            <div id="installment-clearance-printable" className="space-y-6">
              {showCertificate && (
                <section className="clearance-sheet bg-white text-slate-900 border-2 border-slate-300 rounded-2xl p-6 sm:p-8 shadow-sm">
                  {renderBranchHeader('Certificate of Full Payment', docData.certificate_no)}

                  <div className="text-center py-4 px-4 rounded-xl bg-emerald-50 border border-emerald-200 mb-6">
                    <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-emerald-700">
                      Official Account Clearance &amp; Release
                    </div>
                    <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 mt-1">
                      CERTIFICATE OF FULL PAYMENT
                    </h1>
                    <p className="text-xs text-slate-600 mt-1.5 max-w-2xl mx-auto leading-relaxed">
                      This certifies that <strong className="text-slate-900">{customer.full_name}</strong> has fully
                      settled all financial obligations under Installment Account{' '}
                      <strong className="font-mono text-slate-900">{contract.account_no}</strong> with{' '}
                      <strong className="text-slate-900">{company.name}</strong> ({company.branch_name}).
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5 text-xs">
                    <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 space-y-1">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        Customer Information
                      </div>
                      <div className="font-bold text-sm text-slate-900">
                        {customer.full_name}
                        {customer.customer_code ? ` (${customer.customer_code})` : ''}
                      </div>
                      <div className="text-slate-600">Address: {customer.address || '—'}</div>
                      <div className="text-slate-600">Contact: {customer.phone || '—'}</div>
                      <div className="pt-1 inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700">
                        <FiShield className="w-3.5 h-3.5" />
                        <span>Standing: {contract.customer_standing || 'Cleared / Good Standing'}</span>
                      </div>
                    </div>

                    <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 space-y-1">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        Contract Clearance Summary
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">Account Code:</span>
                        <span className="font-mono font-bold text-slate-900">{contract.account_no}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">Invoice Reference:</span>
                        <span className="font-mono font-semibold text-slate-900">{contract.invoice_no}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">Contract Start Date:</span>
                        <span className="font-mono font-semibold text-slate-900">{formatDisplayDate(contract.start_date)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">Date Fully Paid:</span>
                        <span className="font-mono font-bold text-emerald-700">{formatDisplayDate(contract.completed_at)}</span>
                      </div>
                      {contract.has_agent && (
                        <div className="flex justify-between">
                          <span className="text-slate-600">Agent Contribution:</span>
                          <span className="font-bold text-emerald-700">
                            {contract.agent_contribution_status || 'Settled'}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5 text-xs">
                    <div className="p-3 rounded-xl border border-slate-200 bg-slate-50">
                      <div className="text-[10px] font-bold uppercase text-slate-500">Total Contract Price</div>
                      <div className="font-mono font-black text-sm text-slate-900 mt-0.5">
                        {fmt(contract.total_contract_price)}
                      </div>
                    </div>
                    <div className="p-3 rounded-xl border border-slate-200 bg-slate-50">
                      <div className="text-[10px] font-bold uppercase text-slate-500">Downpayment</div>
                      <div className="font-mono font-black text-sm text-slate-900 mt-0.5">
                        {fmt(contract.down_payment)}
                      </div>
                    </div>
                    <div className="p-3 rounded-xl border border-emerald-200 bg-emerald-50">
                      <div className="text-[10px] font-bold uppercase text-emerald-700">Total Amount Paid</div>
                      <div className="font-mono font-black text-sm text-emerald-800 mt-0.5">
                        {fmt(contract.total_paid)}
                      </div>
                    </div>
                    <div className="p-3 rounded-xl border border-emerald-300 bg-emerald-100/70">
                      <div className="text-[10px] font-bold uppercase text-emerald-800">Remaining Balance</div>
                      <div className="font-mono font-black text-sm text-emerald-900 mt-0.5">
                        {fmt(0)}
                      </div>
                    </div>
                  </div>

                  {items.length > 0 && (
                    <div className="mb-5">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-2">
                        Released / Purchased Item(s)
                      </div>
                      <table className="w-full text-xs border-collapse border border-slate-300">
                        <thead>
                          <tr className="bg-slate-100 text-slate-700 text-[10px] uppercase">
                            <th className="border border-slate-300 py-2 px-2.5 text-left">SKU</th>
                            <th className="border border-slate-300 py-2 px-2.5 text-left">Item Description</th>
                            <th className="border border-slate-300 py-2 px-2.5 text-right">Qty</th>
                            <th className="border border-slate-300 py-2 px-2.5 text-right">Unit Price</th>
                            <th className="border border-slate-300 py-2 px-2.5 text-right">Line Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((it, idx) => (
                            <tr key={`cert-item-${idx}`}>
                              <td className="border border-slate-300 py-1.5 px-2.5 font-mono text-slate-600">{it.product_code}</td>
                              <td className="border border-slate-300 py-1.5 px-2.5 font-semibold text-slate-900">{it.product_name}</td>
                              <td className="border border-slate-300 py-1.5 px-2.5 text-right font-mono">{it.quantity}</td>
                              <td className="border border-slate-300 py-1.5 px-2.5 text-right font-mono">{fmt(it.unit_price)}</td>
                              <td className="border border-slate-300 py-1.5 px-2.5 text-right font-mono font-bold">{fmt(it.line_total)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <p className="text-xs text-slate-700 leading-relaxed bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                    Full ownership and release clearance for the above-listed merchandise is hereby granted to{' '}
                    <strong className="text-slate-900">{customer.full_name}</strong>. No further installment dues,
                    interest charges, or late penalties apply to Account{' '}
                    <strong className="font-mono text-slate-900">{contract.account_no}</strong>.
                  </p>

                  {renderSignatoryBlock()}
                </section>
              )}

              {showSoa && (
                <section
                  className={`clearance-sheet bg-white text-slate-900 border-2 border-slate-300 rounded-2xl p-6 sm:p-8 shadow-sm ${
                    showCertificate ? 'clearance-page-break' : ''
                  }`}
                >
                  {renderBranchHeader('Final Statement of Account (SOA)', docData.soa_no)}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5 text-xs">
                    <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 space-y-1">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Account Holder</div>
                      <div className="font-bold text-sm text-slate-900">
                        {customer.full_name}
                        {customer.customer_code ? ` (${customer.customer_code})` : ''}
                      </div>
                      <div className="text-slate-600">{customer.address || '—'}</div>
                      <div className="text-slate-600">
                        {[customer.phone, customer.email].filter((v) => v && v !== '—').join(' • ') || '—'}
                      </div>
                    </div>

                    <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 space-y-1">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Final Account Status</div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">Account Code:</span>
                        <span className="font-mono font-bold">{contract.account_no}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">Status:</span>
                        <span className="font-bold text-emerald-700 uppercase">Fully Paid</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">Customer Standing:</span>
                        <span className="font-bold text-emerald-700">{contract.customer_standing || 'Cleared / Good Standing'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">Completion Date:</span>
                        <span className="font-mono font-bold">{formatDisplayDate(contract.completed_at)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 mb-5 text-xs">
                    <div className="p-2.5 rounded-xl border border-slate-200 bg-slate-50">
                      <div className="text-[10px] font-bold uppercase text-slate-500">Cash / Principal</div>
                      <div className="font-mono font-bold text-slate-900 mt-0.5">{fmt(contract.principal_amount)}</div>
                    </div>
                    <div className="p-2.5 rounded-xl border border-slate-200 bg-slate-50">
                      <div className="text-[10px] font-bold uppercase text-slate-500">Downpayment</div>
                      <div className="font-mono font-bold text-slate-900 mt-0.5">{fmt(contract.down_payment)}</div>
                    </div>
                    <div className="p-2.5 rounded-xl border border-slate-200 bg-slate-50">
                      <div className="text-[10px] font-bold uppercase text-slate-500">Total Contract</div>
                      <div className="font-mono font-bold text-slate-900 mt-0.5">{fmt(contract.total_contract_price)}</div>
                    </div>
                    <div className="p-2.5 rounded-xl border border-emerald-200 bg-emerald-50">
                      <div className="text-[10px] font-bold uppercase text-emerald-700">Total Paid</div>
                      <div className="font-mono font-bold text-emerald-800 mt-0.5">{fmt(contract.total_paid)}</div>
                    </div>
                    <div className="p-2.5 rounded-xl border border-emerald-300 bg-emerald-100/70">
                      <div className="text-[10px] font-bold uppercase text-emerald-800">Ending Balance</div>
                      <div className="font-mono font-black text-emerald-900 mt-0.5">{fmt(0)}</div>
                    </div>
                  </div>

                  <div className="mb-4">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-2">
                      Chronological Installment Payment Ledger ({ledger.length} Settled Entries)
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-[11px] border-collapse border border-slate-300">
                        <thead>
                          <tr className="bg-slate-100 text-slate-700 text-[10px] uppercase">
                            <th className="border border-slate-300 py-2 px-2 text-left">Date</th>
                            <th className="border border-slate-300 py-2 px-2 text-left">Reference #</th>
                            <th className="border border-slate-300 py-2 px-2 text-left">Method</th>
                            <th className="border border-slate-300 py-2 px-2 text-left">OR #</th>
                            <th className="border border-slate-300 py-2 px-2 text-right">Amount Paid</th>
                            <th className="border border-slate-300 py-2 px-2 text-left">Verified By</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ledger.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="border border-slate-300 py-4 text-center text-slate-500">
                                Settled via initial contract downpayment ({fmt(contract.down_payment)}).
                              </td>
                            </tr>
                          ) : (
                            ledger.map((row, idx) => (
                              <tr key={`soa-pay-${row.payment_id || idx}`} className={idx % 2 === 1 ? 'bg-slate-50/70' : ''}>
                                <td className="border border-slate-300 py-1.5 px-2 font-mono whitespace-nowrap">
                                  {row.payment_date || '—'}
                                </td>
                                <td className="border border-slate-300 py-1.5 px-2 font-mono text-slate-700">
                                  {row.reference_no || '—'}
                                </td>
                                <td className="border border-slate-300 py-1.5 px-2 font-medium text-slate-800">
                                  {row.method_display}
                                </td>
                                <td className="border border-slate-300 py-1.5 px-2 font-mono font-semibold text-slate-900">
                                  {row.official_receipt_no || '—'}
                                </td>
                                <td className="border border-slate-300 py-1.5 px-2 text-right font-mono font-bold text-emerald-700">
                                  {fmt(row.amount)}
                                </td>
                                <td className="border border-slate-300 py-1.5 px-2 text-slate-700">
                                  {row.verified_by || '—'}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                        <tfoot>
                          <tr className="bg-emerald-50 font-bold text-slate-900">
                            <td colSpan={4} className="border border-slate-300 py-2 px-2 text-right uppercase text-[10px] tracking-wider">
                              Total Settled Amount (Ending Balance: {fmt(0)})
                            </td>
                            <td className="border border-slate-300 py-2 px-2 text-right font-mono text-emerald-800">
                              {fmt(contract.total_paid)}
                            </td>
                            <td className="border border-slate-300 py-2 px-2 text-[10px] uppercase text-emerald-800">
                              Paid in Full
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>

                  {renderSignatoryBlock()}
                </section>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>,
    document.body
  )
}
