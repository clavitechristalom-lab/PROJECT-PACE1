import { useState, useEffect, useMemo, useRef } from 'react'
import {
  FiSearch, FiCheckCircle, FiPackage, FiPhone, FiShield, FiX, FiCamera, FiImage,
  FiTrash2, FiMapPin, FiCalendar, FiUser, FiClock, FiAlertTriangle, FiFileText, FiMail,
  FiRefreshCw, FiSmartphone, FiCreditCard,
} from 'react-icons/fi'
import { TbCurrencyPeso } from 'react-icons/tb'
import { StatusBadge, Modal, showToast, showLoading, closeLoading } from '../ui'
import { fmt, fmtDate } from '../../lib/utils'
import { api } from '../../lib/api'

const PAYMENT_METHODS = [
  { id: 'Cash', label: 'Cash', sub: 'Physical cash', accent: 'emerald' },
  { id: 'GCash', label: 'GCash', sub: 'E-Wallet', accent: 'blue' },
  { id: 'Maya', label: 'Maya', sub: 'E-Wallet', accent: 'teal' },
  { id: 'Online Bank', label: 'Online Bank', sub: 'InstaPay / Transfer', accent: 'indigo' },
]

function generateOfficialReceiptNo() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  const rand = String(Math.floor(1000 + Math.random() * 9000))
  return `OR-${y}${m}${d}-${rand}`
}

function buildAutoRemarks(acc, amountVal, method = 'Cash') {
  if (!acc) return ''
  const amtNum = Number(amountVal)
  const amtText = !Number.isNaN(amtNum) && amtNum > 0 ? ` of ${fmt(amtNum)}` : ''
  const itemText = acc.product_name ? ` — ${acc.product_name}` : ''
  return `Door-to-door ${method} payment${amtText} collected for ${acc.account_no} (${acc.customer_name}${itemText}). Sent to Cashier & Store Admin for approval.`
}

export default function CollectorCustomerPayModal({ isOpen, onClose, onSuccess }) {
  const [accounts, setAccounts] = useState([])
  const [branchInfo, setBranchInfo] = useState(null)
  const [accountsLoading, setAccountsLoading] = useState(false)
  const [accountSearch, setAccountSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [detailTab, setDetailTab] = useState('schedule')
  const [paymentMethod, setPaymentMethod] = useState('Cash')
  const [payReferenceNo, setPayReferenceNo] = useState('')
  const [payAmount, setPayAmount] = useState('')
  const [payTendered, setPayTendered] = useState('')
  const [tenderedAuto, setTenderedAuto] = useState(true)
  const [payOfficialReceipt, setPayOfficialReceipt] = useState('')
  const [payDate, setPayDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [payRemarks, setPayRemarks] = useState('')
  const [remarksAuto, setRemarksAuto] = useState(true)
  const [proofFile, setProofFile] = useState(null)
  const [proofPreviewUrl, setProofPreviewUrl] = useState('')
  const [cameraOpen, setCameraOpen] = useState(false)
  const [cameraStarting, setCameraStarting] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const [facingMode, setFacingMode] = useState('environment')
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)

  const stopProofCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try { track.stop() } catch (_) { }
      })
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setCameraOpen(false)
    setCameraStarting(false)
  }

  const clearProof = () => {
    stopProofCamera()
    setCameraError('')
    setProofPreviewUrl((prev) => {
      if (prev) {
        try { URL.revokeObjectURL(prev) } catch (_) { }
      }
      return ''
    })
    setProofFile(null)
  }

  const startProofCamera = async (requestedFacing = facingMode) => {
    setCameraError('')
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError(
        window.isSecureContext === false
          ? 'Camera access requires a secure connection (HTTPS or localhost).'
          : 'Camera API is not supported in this browser.'
      )
      return
    }

    stopProofCamera()
    setCameraOpen(true)
    setCameraStarting(true)

    try {
      let stream = null
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: requestedFacing }, width: { ideal: 1280 }, height: { ideal: 960 } },
          audio: false,
        })
      } catch (_) {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      }

      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => { })
      }

      try {
        const devices = await navigator.mediaDevices.enumerateDevices()
        const videoInputs = devices.filter((d) => d.kind === 'videoinput')
        setHasMultipleCameras(videoInputs.length > 1)
      } catch (_) { }
    } catch (err) {
      stopProofCamera()
      if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
        setCameraError('Camera permission was denied. Please allow camera access and try again.')
      } else if (err?.name === 'NotFoundError' || err?.name === 'DevicesNotFoundError') {
        setCameraError('No camera device found on this device.')
      } else {
        setCameraError(err?.message || 'Unable to start camera.')
      }
    } finally {
      setCameraStarting(false)
    }
  }

  useEffect(() => {
    if (cameraOpen && streamRef.current && videoRef.current && videoRef.current.srcObject !== streamRef.current) {
      videoRef.current.srcObject = streamRef.current
      videoRef.current.play().catch(() => { })
    }
  }, [cameraOpen, cameraStarting])

  const handleSwitchCamera = () => {
    const nextFacing = facingMode === 'environment' ? 'user' : 'environment'
    setFacingMode(nextFacing)
    startProofCamera(nextFacing)
  }

  const handleCapturePhoto = () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || !video.videoWidth || !video.videoHeight) {
      showToast('Camera is still initializing. Please wait a moment.', 'warning')
      return
    }

    const maxDim = 1600
    let w = video.videoWidth
    let h = video.videoHeight
    if (w > maxDim || h > maxDim) {
      const scale = Math.min(maxDim / w, maxDim / h)
      w = Math.round(w * scale)
      h = Math.round(h * scale)
    }

    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    ctx.drawImage(video, 0, 0, w, h)

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          showToast('Failed to capture photo. Please try again.', 'error')
          return
        }
        const ts = new Date().toISOString().replace(/[:.]/g, '-')
        const file = new File([blob], `proof-of-payment-${ts}.jpg`, { type: 'image/jpeg' })
        setProofPreviewUrl((prev) => {
          if (prev) {
            try { URL.revokeObjectURL(prev) } catch (_) { }
          }
          return URL.createObjectURL(blob)
        })
        setProofFile(file)
        stopProofCamera()
      },
      'image/jpeg',
      0.88
    )
  }

  useEffect(() => {
    if (!isOpen) {
      stopProofCamera()
      return
    }
    let active = true
    setAccountSearch('')
    setStatusFilter('All')
    setSelectedAccountId('')
    setDetailTab('schedule')
    setPaymentMethod('Cash')
    setPayReferenceNo('')
    setPayAmount('')
    setPayTendered('')
    setTenderedAuto(true)
    setPayOfficialReceipt(generateOfficialReceiptNo())
    setPayDate(new Date().toISOString().slice(0, 10))
    setPayRemarks('')
    setRemarksAuto(true)
    clearProof()
    setAccountsLoading(true)

    api.collectorCollections.getInstallmentAccounts({}, { fresh: true })
      .then((res) => {
        if (active) {
          setAccounts(res?.accounts || [])
          setBranchInfo(res?.branch || null)
        }
      })
      .catch((err) => {
        if (active) {
          showToast(err.message || 'Failed to load branch customer accounts.', 'error')
          setAccounts([])
        }
      })
      .finally(() => {
        if (active) setAccountsLoading(false)
      })

    return () => {
      active = false
      stopProofCamera()
    }
  }, [isOpen])

  useEffect(() => {
    return () => {
      if (proofPreviewUrl) {
        try { URL.revokeObjectURL(proofPreviewUrl) } catch (_) { }
      }
    }
  }, [proofPreviewUrl])

  const portfolioStats = useMemo(() => {
    let overdueAccounts = 0
    let totalBalance = 0
    let totalNextDue = 0
    accounts.forEach((acc) => {
      if (acc.status === 'Overdue' || Number(acc.overdue_count || 0) > 0) overdueAccounts += 1
      totalBalance += Number(acc.balance || 0)
      totalNextDue += Number(acc.next_amount_due || 0)
    })
    return {
      totalAccounts: accounts.length,
      overdueAccounts,
      totalBalance: Math.round(totalBalance * 100) / 100,
      totalNextDue: Math.round(totalNextDue * 100) / 100,
    }
  }, [accounts])

  const filteredAccounts = useMemo(() => {
    const q = accountSearch.trim().toLowerCase()
    return accounts.filter((acc) => {
      if (statusFilter === 'Overdue' && acc.status !== 'Overdue' && Number(acc.overdue_count || 0) === 0) {
        return false
      }
      if (statusFilter === 'Active' && acc.status !== 'Active') {
        return false
      }
      if (!q) return true
      return [
        acc.account_no,
        acc.invoice_no,
        acc.customer_name,
        acc.customer_code,
        acc.customer_phone,
        acc.customer_address,
        acc.product_name,
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    })
  }, [accounts, accountSearch, statusFilter])

  const selectedAccount = useMemo(
    () => accounts.find((acc) => String(acc.installment_id) === String(selectedAccountId)) || null,
    [accounts, selectedAccountId]
  )

  const handleSelectAccount = (acc) => {
    setSelectedAccountId(String(acc.installment_id))
    setDetailTab('schedule')
    const defaultAmt = acc.next_amount_due > 0 ? acc.next_amount_due : acc.balance
    const defaultAmtStr = defaultAmt ? String(Number(defaultAmt).toFixed(2)) : ''
    setPayAmount(defaultAmtStr)
    setPayTendered(defaultAmtStr)
    setTenderedAuto(true)
    setPayOfficialReceipt(generateOfficialReceiptNo())
    setPayRemarks(buildAutoRemarks(acc, defaultAmt, paymentMethod))
    setRemarksAuto(true)
  }

  const handleAmountChange = (val) => {
    setPayAmount(val)
    if (tenderedAuto) {
      setPayTendered(val)
    }
    if (remarksAuto && selectedAccount) {
      setPayRemarks(buildAutoRemarks(selectedAccount, val, paymentMethod))
    }
  }

  const handlePaymentMethodChange = (method) => {
    setPaymentMethod(method)
    if (method === 'Cash') {
      setPayReferenceNo('')
      if (tenderedAuto) setPayTendered(payAmount)
    }
    if (remarksAuto && selectedAccount) {
      setPayRemarks(buildAutoRemarks(selectedAccount, payAmount, method))
    }
  }

  const isCashMethod = paymentMethod === 'Cash'
  const payAmountNum = parseFloat(payAmount)
  const payTenderedNum = isCashMethod && payTendered !== '' ? parseFloat(payTendered) : null
  const isPayOverBalance = Boolean(
    selectedAccount && !Number.isNaN(payAmountNum) && payAmountNum > Number(selectedAccount.balance) + 0.01
  )
  const isPayUnderTendered = Boolean(
    isCashMethod && payTenderedNum !== null && !Number.isNaN(payTenderedNum) && !Number.isNaN(payAmountNum) && payTenderedNum < payAmountNum
  )
  const payChangeDue = isCashMethod && payTenderedNum !== null && !Number.isNaN(payTenderedNum) && !Number.isNaN(payAmountNum)
    ? Math.max(0, Math.round((payTenderedNum - payAmountNum) * 100) / 100)
    : 0
  const projectedBalance = selectedAccount
    ? Math.max(0, Math.round((Number(selectedAccount.balance || 0) - (!Number.isNaN(payAmountNum) && payAmountNum > 0 ? payAmountNum : 0)) * 100) / 100)
    : 0
  const paidPercent = selectedAccount && Number(selectedAccount.total_payable || 0) > 0
    ? Math.min(100, Math.round((Number(selectedAccount.total_paid || 0) / Number(selectedAccount.total_payable)) * 100))
    : 0

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!selectedAccount) {
      showToast('Please select an active customer installment account.', 'warning')
      return
    }
    if (Number.isNaN(payAmountNum) || payAmountNum <= 0) {
      showToast('Please enter a valid payment amount.', 'warning')
      return
    }
    if (isPayOverBalance) {
      showToast(`Amount cannot exceed remaining balance of ${fmt(selectedAccount.balance)}.`, 'error')
      return
    }
    if (isPayUnderTendered) {
      showToast('Cash tendered cannot be less than the collected amount.', 'error')
      return
    }
    if (!payOfficialReceipt.trim()) {
      showToast('Please enter the Official Receipt #.', 'warning')
      return
    }
    if (!proofFile) {
      showToast('Please take a picture for Proof of Payment.', 'warning')
      return
    }

    setSubmitting(true)
    showLoading(`Recording customer ${paymentMethod} payment...`)
    try {
      const formData = new FormData()
      formData.append('installment_id', String(selectedAccount.installment_id))
      formData.append('amount', String(Math.round(payAmountNum * 100) / 100))
      formData.append('payment_method', paymentMethod)
      formData.append('official_receipt_no', payOfficialReceipt.trim())
      formData.append('payment_date', payDate)
      if (!isCashMethod && payReferenceNo.trim()) {
        formData.append('reference_no', payReferenceNo.trim())
      }
      if (payRemarks.trim()) {
        formData.append('remarks', payRemarks.trim())
      }
      if (isCashMethod && payTenderedNum !== null && !Number.isNaN(payTenderedNum) && payTenderedNum > 0) {
        formData.append('cash_tendered', String(Math.round(payTenderedNum * 100) / 100))
      }
      formData.append('proof_of_payment', proofFile)

      const res = await api.collectorCollections.customerPay(formData)
      closeLoading()
      showToast(res?.message || `Customer ${paymentMethod} payment recorded and sent to Cashier.`, 'success')
      if (onSuccess) await onSuccess(res)
      if (onClose) onClose()
    } catch (err) {
      closeLoading()
      showToast(err.message || `Failed to record customer ${paymentMethod} payment.`, 'error')
    } finally {
      setSubmitting(false)
    }
  }

  if (!isOpen) return null

  return (
    <Modal
      isOpen={true}
      onClose={() => { if (!submitting && onClose) onClose() }}
      title={`Customer Pay${branchInfo?.branch_name ? ` — ${branchInfo.branch_name}` : ''}`}
      size="xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        {/* Branch Collectible Overview Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="p-2.5 rounded-xl bg-muted/30 border border-border">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Active Accounts</div>
            <div className="text-sm font-mono font-black text-foreground mt-0.5">{portfolioStats.totalAccounts}</div>
            <div className="text-[10px] text-muted-foreground">In your assigned branch</div>
          </div>
          <div className="p-2.5 rounded-xl bg-rose-500/5 border border-rose-500/20">
            <div className="text-[10px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">With Overdue</div>
            <div className="text-sm font-mono font-black text-rose-600 dark:text-rose-400 mt-0.5">{portfolioStats.overdueAccounts}</div>
            <div className="text-[10px] text-muted-foreground">Priority follow-ups</div>
          </div>
          <div className="p-2.5 rounded-xl bg-amber-500/5 border border-amber-500/20">
            <div className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">Next Due Total</div>
            <div className="text-sm font-mono font-black text-amber-600 dark:text-amber-400 mt-0.5">{fmt(portfolioStats.totalNextDue)}</div>
            <div className="text-[10px] text-muted-foreground">Current installment cycle</div>
          </div>
          <div className="p-2.5 rounded-xl bg-primary/5 border border-primary/20">
            <div className="text-[10px] font-bold uppercase tracking-wider text-primary">Total Receivables</div>
            <div className="text-sm font-mono font-black text-primary mt-0.5">{fmt(portfolioStats.totalBalance)}</div>
            <div className="text-[10px] text-muted-foreground">Outstanding branch balance</div>
          </div>
        </div>

        {/* Account Selector */}
        <div className="p-3.5 rounded-2xl bg-muted/30 border border-border space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-[11px] font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
              <FiSearch className="w-3.5 h-3.5 text-primary" />
              <span>Select Active Customer Installment Account *</span>
            </span>
            <div className="flex items-center gap-1.5">
              {['All', 'Active', 'Overdue'].map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setStatusFilter(tab)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-colors cursor-pointer border ${
                    statusFilter === tab
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-card text-muted-foreground border-border hover:text-foreground'
                  }`}
                >
                  {tab}
                </button>
              ))}
              <span className="text-[11px] text-muted-foreground font-medium ml-1">
                {filteredAccounts.length} shown
              </span>
            </div>
          </div>

          <div className="relative">
            <FiSearch className="w-4 h-4 text-muted-foreground absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={accountSearch}
              onChange={(e) => setAccountSearch(e.target.value)}
              placeholder="Search by customer name, code, account #, invoice #, phone, address, or product..."
              className="w-full pl-10 pr-4 py-2 text-xs rounded-xl bg-background border border-border focus:border-primary text-foreground outline-none transition-colors"
            />
          </div>

          {accountsLoading ? (
            <div className="py-6 text-center text-muted-foreground">Loading branch customer accounts...</div>
          ) : filteredAccounts.length === 0 ? (
            <div className="py-6 text-center text-muted-foreground">
              No active installment accounts match your search for this branch.
            </div>
          ) : (
            <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
              {filteredAccounts.map((acc) => {
                const isSelected = String(acc.installment_id) === String(selectedAccountId)
                const pct = Number(acc.total_payable || 0) > 0
                  ? Math.min(100, Math.round((Number(acc.total_paid || 0) / Number(acc.total_payable)) * 100))
                  : 0
                return (
                  <button
                    key={acc.installment_id}
                    type="button"
                    onClick={() => handleSelectAccount(acc)}
                    className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer space-y-2 ${
                      isSelected
                        ? 'border-primary bg-primary/10 ring-1 ring-primary/30'
                        : 'border-border bg-card hover:bg-muted/40'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-bold text-primary">{acc.account_no}</span>
                          <span className="font-bold text-foreground">{acc.customer_name}</span>
                          {acc.customer_code && (
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                              {acc.customer_code}
                            </span>
                          )}
                          <StatusBadge status={acc.status} />
                          {Number(acc.overdue_count || 0) > 0 && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30">
                              <FiAlertTriangle className="w-2.5 h-2.5" />
                              {acc.overdue_count} Overdue ({fmt(acc.overdue_amount)})
                            </span>
                          )}
                          {Number(acc.pending_amount || 0) > 0 && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                              Pending Verification: {fmt(acc.pending_amount)}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
                          <span className="inline-flex items-center gap-1 truncate max-w-[280px]">
                            <FiPackage className="w-3 h-3 shrink-0 text-primary" />
                            <span className="truncate font-medium text-foreground">{acc.product_name}</span>
                          </span>
                          {acc.customer_phone && (
                            <span className="inline-flex items-center gap-1">
                              <FiPhone className="w-3 h-3 shrink-0" />
                              <span className="font-mono">{acc.customer_phone}</span>
                            </span>
                          )}
                          {acc.next_due_date && (
                            <span className="inline-flex items-center gap-1">
                              <FiCalendar className="w-3 h-3 shrink-0" />
                              <span>Next Due: <strong className="text-foreground">{fmtDate(acc.next_due_date)}</strong></span>
                            </span>
                          )}
                        </div>

                        {acc.customer_address && (
                          <div className="flex items-center gap-1 text-[11px] text-muted-foreground truncate">
                            <FiMapPin className="w-3 h-3 shrink-0 text-emerald-600 dark:text-emerald-400" />
                            <span className="truncate">{acc.customer_address}</span>
                          </div>
                        )}
                      </div>

                      <div className="text-right shrink-0 space-y-0.5">
                        <div className="text-[10px] font-bold uppercase text-muted-foreground">Outstanding Balance</div>
                        <div className="font-mono font-black text-rose-500 text-sm">{fmt(acc.balance)}</div>
                        <div className="text-[11px] font-mono text-foreground font-semibold">
                          Next Due: {fmt(acc.next_amount_due)}
                        </div>
                        <div className="text-[10px] font-mono text-muted-foreground">
                          {acc.terms_paid ?? 0}/{acc.total_terms || '—'} terms • {pct}% paid
                        </div>
                      </div>
                    </div>

                    <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-primary transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Full Detailed Selected Account & Collection Form */}
        {selectedAccount && (
          <div className="p-4 rounded-2xl bg-muted/20 border border-border space-y-4">
            {/* 1. Full Customer & Contract Profile */}
            <div className="p-3.5 rounded-xl bg-primary/5 border border-primary/20 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap border-b border-primary/15 pb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-primary">
                    Customer &amp; Installment Contract Details
                  </span>
                  <StatusBadge status={selectedAccount.status} />
                </div>
                <div className="flex items-center gap-2 text-[11px] font-mono">
                  <span className="font-bold text-primary">{selectedAccount.account_no}</span>
                  {selectedAccount.invoice_no && (
                    <span className="text-muted-foreground">• {selectedAccount.invoice_no}</span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 text-[11px]">
                <div className="p-2 rounded-lg bg-card/80 border border-border">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1">
                    <FiUser className="w-3 h-3" /> Customer
                  </span>
                  <span className="font-bold text-foreground block mt-0.5">
                    {selectedAccount.customer_name}
                  </span>
                  {selectedAccount.customer_code && (
                    <span className="font-mono text-[10px] text-muted-foreground">{selectedAccount.customer_code}</span>
                  )}
                </div>

                <div className="p-2 rounded-lg bg-card/80 border border-border">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1">
                    <FiPhone className="w-3 h-3" /> Contact
                  </span>
                  <span className="font-mono font-semibold text-foreground block mt-0.5">
                    {selectedAccount.customer_phone || 'No phone on file'}
                  </span>
                  {selectedAccount.customer_email && (
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1 truncate" title={selectedAccount.customer_email}>
                      <FiMail className="w-2.5 h-2.5 shrink-0" />
                      <span className="truncate">{selectedAccount.customer_email}</span>
                    </span>
                  )}
                </div>

                <div className="p-2 rounded-lg bg-card/80 border border-border col-span-2">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1">
                    <FiMapPin className="w-3 h-3 text-emerald-500" /> Door-to-Door Address &amp; Branch
                  </span>
                  <span className="font-semibold text-foreground block mt-0.5">
                    {selectedAccount.customer_address || 'No address recorded'}
                  </span>
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">
                    Branch: {selectedAccount.branch_name || branchInfo?.branch_name || 'Assigned Branch'}
                    {selectedAccount.agent_name ? ` • Agent: ${selectedAccount.agent_name}${selectedAccount.agent_code ? ` (${selectedAccount.agent_code})` : ''}` : ''}
                  </span>
                </div>
              </div>

              {/* Financial Breakdown Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-[11px]">
                <div className="p-2 rounded-lg bg-card border border-border">
                  <span className="text-[10px] text-muted-foreground block">Principal</span>
                  <span className="font-mono font-bold text-foreground">{fmt(selectedAccount.principal_amount || 0)}</span>
                </div>
                <div className="p-2 rounded-lg bg-card border border-border">
                  <span className="text-[10px] text-muted-foreground block">Down Payment</span>
                  <span className="font-mono font-bold text-foreground">{fmt(selectedAccount.down_payment || 0)}</span>
                </div>
                <div className="p-2 rounded-lg bg-card border border-border">
                  <span className="text-[10px] text-muted-foreground block">
                    Interest{selectedAccount.interest_rate ? ` (${selectedAccount.interest_rate}%)` : ''}
                  </span>
                  <span className="font-mono font-bold text-foreground">{fmt(selectedAccount.interest_amount || 0)}</span>
                </div>
                <div className="p-2 rounded-lg bg-card border border-border">
                  <span className="text-[10px] text-muted-foreground block">Total Payable</span>
                  <span className="font-mono font-bold text-foreground">{fmt(selectedAccount.total_payable || 0)}</span>
                </div>
                <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/25">
                  <span className="text-[10px] text-emerald-700 dark:text-emerald-400 block font-semibold">Total Paid ({paidPercent}%)</span>
                  <span className="font-mono font-black text-emerald-600 dark:text-emerald-400">{fmt(selectedAccount.total_paid || 0)}</span>
                </div>
                <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/25">
                  <span className="text-[10px] text-rose-700 dark:text-rose-400 block font-semibold">Remaining Balance</span>
                  <span className="font-mono font-black text-rose-600 dark:text-rose-400">{fmt(selectedAccount.balance || 0)}</span>
                </div>
              </div>

              {/* Repayment Progress Bar & Terms */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px] flex-wrap gap-2">
                  <span className="text-muted-foreground">
                    Terms Progress: <strong className="text-foreground font-mono">{selectedAccount.terms_paid ?? 0}/{selectedAccount.total_terms || '—'} paid</strong>
                    {' '}• {selectedAccount.frequency || 'Monthly'}: <strong className="text-foreground font-mono">{fmt(selectedAccount.installment_amount || 0)}</strong>
                    {selectedAccount.start_date ? ` • Started ${fmtDate(selectedAccount.start_date)}` : ''}
                  </span>
                  <span className="font-mono font-bold text-primary">
                    Next Due{selectedAccount.next_installment_no ? ` (Term #${selectedAccount.next_installment_no})` : ''}: {fmt(selectedAccount.next_amount_due)}
                    {selectedAccount.next_due_date ? ` • ${fmtDate(selectedAccount.next_due_date)}` : ''}
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-primary transition-all"
                    style={{ width: `${paidPercent}%` }}
                  />
                </div>
                {Number(selectedAccount.pending_amount || 0) > 0 && (
                  <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                    <FiClock className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      There {selectedAccount.pending_count === 1 ? 'is' : 'are'} <strong>{selectedAccount.pending_count || 1} pending payment(s)</strong> totaling <strong className="font-mono">{fmt(selectedAccount.pending_amount)}</strong> awaiting Cashier / Store Admin verification.
                    </span>
                  </div>
                )}
              </div>

              {/* Financed Items Table */}
              {Array.isArray(selectedAccount.items) && selectedAccount.items.length > 0 && (
                <div className="rounded-xl border border-border bg-card overflow-hidden">
                  <div className="px-3 py-1.5 bg-muted/40 border-b border-border text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <FiPackage className="w-3 h-3 text-primary" />
                    <span>Financed Product(s) ({selectedAccount.items.length})</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[11px]">
                      <thead>
                        <tr className="border-b border-border text-[10px] uppercase text-muted-foreground bg-muted/20">
                          <th className="py-1.5 px-3 text-left">Item</th>
                          <th className="py-1.5 px-2 text-left">Category</th>
                          <th className="py-1.5 px-2 text-center">Qty</th>
                          <th className="py-1.5 px-2 text-right">Unit Price</th>
                          <th className="py-1.5 px-3 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {selectedAccount.items.map((it, idx) => (
                          <tr key={it.sale_item_id || idx}>
                            <td className="py-1.5 px-3">
                              <span className="font-semibold text-foreground">{it.product_name}</span>
                              {it.product_code && <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">({it.product_code})</span>}
                            </td>
                            <td className="py-1.5 px-2 text-muted-foreground">{it.category || '—'}</td>
                            <td className="py-1.5 px-2 text-center font-mono font-bold">{it.quantity}</td>
                            <td className="py-1.5 px-2 text-right font-mono">{fmt(it.unit_price)}</td>
                            <td className="py-1.5 px-3 text-right font-mono font-bold text-foreground">{fmt(it.line_total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Payment Schedule & Recent Payments Tabs */}
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="px-3 py-2 bg-muted/40 border-b border-border flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setDetailTab('schedule')}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-colors cursor-pointer ${
                        detailTab === 'schedule'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-card text-muted-foreground hover:text-foreground border border-border'
                      }`}
                    >
                      Payment Schedule ({selectedAccount.schedules?.length || 0})
                    </button>
                    <button
                      type="button"
                      onClick={() => setDetailTab('history')}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-colors cursor-pointer ${
                        detailTab === 'history'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-card text-muted-foreground hover:text-foreground border border-border'
                      }`}
                    >
                      Recent Payments ({selectedAccount.recent_payments?.length || 0})
                    </button>
                  </div>
                  {detailTab === 'schedule' && (
                    <span className="text-[10px] text-muted-foreground">Click any unpaid term to fill amount</span>
                  )}
                </div>

                {detailTab === 'schedule' ? (
                  <div className="max-h-36 overflow-y-auto">
                    {(!selectedAccount.schedules || selectedAccount.schedules.length === 0) ? (
                      <div className="p-3 text-center text-[11px] text-muted-foreground">No schedule entries found.</div>
                    ) : (
                      <table className="w-full text-[11px]">
                        <thead className="sticky top-0 bg-card border-b border-border text-[10px] uppercase text-muted-foreground">
                          <tr>
                            <th className="py-1.5 px-3 text-left">Term</th>
                            <th className="py-1.5 px-2 text-left">Due Date</th>
                            <th className="py-1.5 px-2 text-right">Due</th>
                            <th className="py-1.5 px-2 text-right">Paid</th>
                            <th className="py-1.5 px-2 text-right">Balance</th>
                            <th className="py-1.5 px-3 text-right">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {selectedAccount.schedules.map((sch) => {
                            const isUnpaid = Number(sch.balance_due) > 0.01
                            return (
                              <tr
                                key={sch.schedule_id || sch.installment_no}
                                onClick={() => { if (isUnpaid) handleAmountChange(Number(sch.balance_due).toFixed(2)) }}
                                className={`${isUnpaid ? 'cursor-pointer hover:bg-primary/5' : 'opacity-65'} ${sch.is_overdue ? 'bg-rose-500/5' : ''}`}
                              >
                                <td className="py-1.5 px-3 font-mono font-bold text-foreground">#{sch.installment_no}</td>
                                <td className="py-1.5 px-2 font-mono">{sch.due_date ? fmtDate(sch.due_date) : '—'}</td>
                                <td className="py-1.5 px-2 text-right font-mono">{fmt(sch.amount_due)}</td>
                                <td className="py-1.5 px-2 text-right font-mono text-emerald-600 dark:text-emerald-400">{fmt(sch.amount_paid)}</td>
                                <td className="py-1.5 px-2 text-right font-mono font-bold text-rose-500">{fmt(sch.balance_due)}</td>
                                <td className="py-1.5 px-3 text-right">
                                  <StatusBadge status={sch.status} />
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                ) : (
                  <div className="max-h-36 overflow-y-auto">
                    {(!selectedAccount.recent_payments || selectedAccount.recent_payments.length === 0) ? (
                      <div className="p-3 text-center text-[11px] text-muted-foreground">No payments recorded yet on this account.</div>
                    ) : (
                      <table className="w-full text-[11px]">
                        <thead className="sticky top-0 bg-card border-b border-border text-[10px] uppercase text-muted-foreground">
                          <tr>
                            <th className="py-1.5 px-3 text-left">Receipt / OR #</th>
                            <th className="py-1.5 px-2 text-left">Date</th>
                            <th className="py-1.5 px-2 text-left">Method</th>
                            <th className="py-1.5 px-2 text-right">Amount</th>
                            <th className="py-1.5 px-3 text-right">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {selectedAccount.recent_payments.map((pm) => (
                            <tr key={pm.payment_id}>
                              <td className="py-1.5 px-3 font-mono font-bold text-foreground">
                                {pm.receipt_no}
                                {pm.receipt_reference ? <span className="ml-1 text-[10px] text-primary">({pm.receipt_reference})</span> : null}
                              </td>
                              <td className="py-1.5 px-2 font-mono text-muted-foreground">{pm.payment_date ? fmtDate(pm.payment_date) : '—'}</td>
                              <td className="py-1.5 px-2">{pm.payment_method}</td>
                              <td className="py-1.5 px-2 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">{fmt(pm.amount)}</td>
                              <td className="py-1.5 px-3 text-right">
                                <StatusBadge status={pm.status} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* 2. Payment Method Selector & Collection Form */}
            <div className="space-y-1.5">
              <label className="font-bold uppercase tracking-wide text-[11px] text-foreground block">
                Payment Method *
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {PAYMENT_METHODS.map((m) => {
                  const active = paymentMethod === m.id
                  const activeClasses =
                    m.accent === 'blue'
                      ? 'border-blue-500 bg-blue-500/10 text-blue-700 dark:text-blue-300 ring-1 ring-blue-500/30'
                      : m.accent === 'teal'
                        ? 'border-teal-500 bg-teal-500/10 text-teal-700 dark:text-teal-300 ring-1 ring-teal-500/30'
                        : m.accent === 'indigo'
                          ? 'border-indigo-500 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 ring-1 ring-indigo-500/30'
                          : 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-500/30'
                  const MethodIcon =
                    m.id === 'Cash'
                      ? TbCurrencyPeso
                      : m.id === 'Online Bank'
                        ? FiCreditCard
                        : FiSmartphone
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => handlePaymentMethodChange(m.id)}
                      className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-2.5 ${
                        active
                          ? activeClasses
                          : 'border-border bg-card hover:bg-muted/50 text-foreground'
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        active ? 'bg-background/80' : 'bg-muted/70 text-muted-foreground'
                      }`}>
                        <MethodIcon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-xs truncate">{m.label}</div>
                        <div className="text-[10px] text-muted-foreground truncate">{m.sub}</div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="font-bold uppercase tracking-wide text-[11px] text-foreground flex items-center justify-between gap-2 flex-wrap">
                  <span>Amount Collected (₱) *</span>
                  <div className="flex items-center gap-1.5 normal-case">
                    {selectedAccount.next_amount_due > 0 && (
                      <button
                        type="button"
                        onClick={() => handleAmountChange(Number(selectedAccount.next_amount_due).toFixed(2))}
                        className="px-1.5 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20 font-bold text-[10px] cursor-pointer"
                      >
                        Next Due
                      </button>
                    )}
                    {Number(selectedAccount.overdue_amount || 0) > 0 && (
                      <button
                        type="button"
                        onClick={() => handleAmountChange(Math.min(Number(selectedAccount.balance), Number(selectedAccount.overdue_amount)).toFixed(2))}
                        className="px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-500/20 font-bold text-[10px] cursor-pointer"
                      >
                        Overdue
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleAmountChange(Number(selectedAccount.balance).toFixed(2))}
                      className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 font-bold text-[10px] cursor-pointer"
                    >
                      Full Balance
                    </button>
                  </div>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={selectedAccount.balance}
                  required
                  value={payAmount}
                  onChange={(e) => handleAmountChange(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-background border border-border focus:border-primary text-foreground font-mono font-bold text-sm outline-none"
                />
                {isPayOverBalance && (
                  <p className="text-[11px] text-rose-500 font-semibold">
                    Cannot exceed remaining balance of {fmt(selectedAccount.balance)}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="font-bold uppercase tracking-wide text-[11px] text-foreground flex items-center justify-between">
                  <span>Official Receipt # *</span>
                  <button
                    type="button"
                    onClick={() => setPayOfficialReceipt(generateOfficialReceiptNo())}
                    className="text-primary hover:underline font-bold cursor-pointer normal-case"
                  >
                    Auto
                  </button>
                </label>
                <input
                  type="text"
                  required
                  value={payOfficialReceipt}
                  onChange={(e) => setPayOfficialReceipt(e.target.value)}
                  placeholder="e.g. OR-20261125-4821"
                  className="w-full px-3 py-2 rounded-xl bg-background border border-border focus:border-primary text-foreground font-mono font-bold text-xs outline-none"
                />
              </div>

              {isCashMethod ? (
                <div className="space-y-1.5">
                  <label className="font-bold uppercase tracking-wide text-[11px] text-foreground flex items-center justify-between">
                    <span>Cash Tendered (₱) (Optional)</span>
                    <button
                      type="button"
                      onClick={() => {
                        setPayTendered(payAmount)
                        setTenderedAuto(true)
                      }}
                      className="text-primary hover:underline font-bold cursor-pointer normal-case"
                    >
                      Auto Exact
                    </button>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={payTendered}
                    onChange={(e) => {
                      setPayTendered(e.target.value)
                      setTenderedAuto(false)
                    }}
                    placeholder="Auto-filled from amount"
                    className="w-full px-3 py-2 rounded-xl bg-background border border-border focus:border-primary text-foreground font-mono text-xs outline-none"
                  />
                  {payTenderedNum !== null && !Number.isNaN(payTenderedNum) && !Number.isNaN(payAmountNum) && (
                    <p className={`text-[11px] font-mono font-bold ${isPayUnderTendered ? 'text-rose-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
                      {isPayUnderTendered
                        ? `Short by ${fmt(Math.round((payAmountNum - payTenderedNum) * 100) / 100)}`
                        : `Change Due: ${fmt(payChangeDue)}`}
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label className="font-bold uppercase tracking-wide text-[11px] text-foreground flex items-center justify-between">
                    <span>{paymentMethod} Reference # (Optional)</span>
                  </label>
                  <input
                    type="text"
                    value={payReferenceNo}
                    onChange={(e) => setPayReferenceNo(e.target.value)}
                    placeholder={
                      paymentMethod === 'GCash'
                        ? 'e.g. GCash Ref # 901234567890'
                        : paymentMethod === 'Maya'
                          ? 'e.g. Maya Ref # 8841209341'
                          : 'e.g. InstaPay / Bank Ref #'
                    }
                    className="w-full px-3 py-2 rounded-xl bg-background border border-border focus:border-primary text-foreground font-mono text-xs outline-none"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Leave blank to auto-generate a reference code.
                  </p>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="font-bold uppercase tracking-wide text-[11px] text-foreground">
                  Collection Date *
                </label>
                <input
                  type="date"
                  required
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-background border border-border focus:border-primary text-foreground font-mono text-xs outline-none"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="font-bold uppercase tracking-wide text-[11px] text-foreground flex items-center justify-between">
                <span>Collection Remarks (Optional)</span>
                <button
                  type="button"
                  onClick={() => {
                    setPayRemarks(buildAutoRemarks(selectedAccount, payAmount, paymentMethod))
                    setRemarksAuto(true)
                  }}
                  className="text-primary hover:underline font-bold cursor-pointer normal-case"
                >
                  Auto
                </button>
              </label>
              <textarea
                rows={2}
                value={payRemarks}
                onChange={(e) => {
                  setPayRemarks(e.target.value)
                  setRemarksAuto(false)
                }}
                placeholder="Auto-filled from selected customer installment..."
                className="w-full px-3 py-2 rounded-xl bg-background border border-border focus:border-primary text-foreground text-xs outline-none resize-none"
              />
            </div>

            {/* 3. Proof of Payment Camera Capture */}
            <div className="space-y-1.5">
              <label className="font-bold uppercase tracking-wide text-[11px] text-foreground flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5">
                  <FiImage className="w-3.5 h-3.5 text-primary" />
                  <span>Proof of Payment (Receipt / Cash Photo) *</span>
                </span>
                <span className="text-[10px] font-medium text-muted-foreground normal-case">
                  Live Camera Photo Required
                </span>
              </label>

              <canvas ref={canvasRef} className="hidden" />

              {cameraError && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-[11px] flex items-center justify-between gap-2 flex-wrap">
                  <span>{cameraError}</span>
                  <button
                    type="button"
                    onClick={() => startProofCamera()}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 font-bold text-[11px] cursor-pointer"
                  >
                    <FiRefreshCw className="w-3 h-3" />
                    <span>Retry Camera</span>
                  </button>
                </div>
              )}

              {cameraOpen ? (
                <div className="p-3 rounded-xl border border-primary/40 bg-card space-y-2.5">
                  <div className="relative rounded-xl overflow-hidden bg-slate-950 border border-border aspect-video flex items-center justify-center">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover"
                    />
                    {cameraStarting && (
                      <div className="absolute inset-0 bg-slate-950/75 flex flex-col items-center justify-center gap-1.5 text-white text-xs font-semibold">
                        <FiRefreshCw className="w-5 h-5 animate-spin text-primary" />
                        <span>Starting camera...</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={stopProofCamera}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border hover:bg-muted text-xs font-semibold text-foreground cursor-pointer"
                      >
                        <FiX className="w-3.5 h-3.5" />
                        <span>Close Camera</span>
                      </button>
                      {hasMultipleCameras && (
                        <button
                          type="button"
                          onClick={handleSwitchCamera}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border hover:bg-muted text-xs font-semibold text-foreground cursor-pointer"
                        >
                          <FiRefreshCw className="w-3.5 h-3.5" />
                          <span>Switch Camera</span>
                        </button>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={handleCapturePhoto}
                      disabled={cameraStarting}
                      className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold shadow-xs cursor-pointer disabled:opacity-50"
                    >
                      <FiCamera className="w-3.5 h-3.5" />
                      <span>Capture Photo</span>
                    </button>
                  </div>
                </div>
              ) : proofPreviewUrl && proofFile ? (
                <div className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 space-y-2.5">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="min-w-0">
                      <div className="font-semibold text-foreground truncate">Captured Proof Photo</div>
                      <div className="text-[10px] text-muted-foreground font-mono">
                        {(proofFile.size / 1024).toFixed(1)} KB • Ready to submit
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => startProofCamera()}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-border bg-card hover:bg-muted text-[11px] font-semibold text-foreground cursor-pointer"
                      >
                        <FiCamera className="w-3 h-3 text-primary" />
                        <span>Retake Picture</span>
                      </button>
                      <button
                        type="button"
                        onClick={clearProof}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-[11px] font-semibold text-rose-600 dark:text-rose-400 cursor-pointer"
                      >
                        <FiTrash2 className="w-3 h-3" />
                        <span>Remove</span>
                      </button>
                    </div>
                  </div>
                  <div className="rounded-lg border border-border bg-background/80 p-2 flex justify-center">
                    <img
                      src={proofPreviewUrl}
                      alt="Captured Proof of Payment"
                      className="max-h-48 object-contain rounded-md"
                    />
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => startProofCamera()}
                  className="w-full p-5 rounded-xl border-2 border-dashed border-border hover:border-primary/60 bg-background/60 hover:bg-primary/5 transition-colors flex flex-col items-center justify-center gap-1.5 text-center cursor-pointer"
                >
                  <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                    <FiCamera className="w-5 h-5" />
                  </div>
                  <div className="font-bold text-foreground text-xs">Take a Picture</div>
                  <div className="text-[11px] text-muted-foreground">
                    {isCashMethod
                      ? 'Open camera to capture the signed receipt or cash collection photo'
                      : `Open camera to capture the ${paymentMethod} payment confirmation or receipt photo`}
                  </div>
                </button>
              )}
            </div>

            {/* 4. Live Remittance Summary Preview */}
            <div className="p-3.5 rounded-xl bg-card border border-border space-y-2">
              <div className="flex items-center justify-between border-b border-border pb-1.5 flex-wrap gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                  <FiFileText className="w-3.5 h-3.5 text-primary" />
                  <span>Live Collection &amp; Remittance Summary</span>
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold border bg-primary/10 text-primary border-primary/30">
                    {paymentMethod}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                    proofFile
                      ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30'
                      : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30'
                  }`}>
                    {proofFile ? 'Proof Attached ✓' : 'Proof Required'}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                <div>
                  <span className="text-muted-foreground block">Collecting Now</span>
                  <span className="font-mono font-black text-emerald-600 dark:text-emerald-400 text-sm">
                    {!Number.isNaN(payAmountNum) && payAmountNum > 0 ? fmt(payAmountNum) : '₱0.00'}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Projected Balance</span>
                  <span className="font-mono font-black text-primary text-sm">{fmt(projectedBalance)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Official Receipt #</span>
                  <span className="font-mono font-bold text-foreground">{payOfficialReceipt || '—'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">
                    {isCashMethod ? 'Change Due' : `${paymentMethod} Ref #`}
                  </span>
                  <span className="font-mono font-bold text-foreground truncate block">
                    {isCashMethod ? fmt(payChangeDue) : (payReferenceNo.trim() || 'Auto-generated')}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="p-3 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 flex items-start gap-2.5 text-[11px] text-amber-800 dark:text-amber-200">
          <FiShield className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
          <span>
            Submitting sends this collected payment with full <strong>Customer Installment details</strong> and <strong>Proof of Payment</strong> to the branch <strong>Cashier</strong>. After Cashier confirmation, it is forwarded to the <strong>Store Admin</strong> for final approval.
          </span>
        </div>

        <div className="flex justify-between items-center pt-3 border-t border-border">
          <button
            type="button"
            onClick={() => { if (!submitting && onClose) onClose() }}
            disabled={submitting}
            className="inline-flex items-center gap-1 px-4 py-2 rounded-xl border border-border hover:bg-muted font-semibold text-xs cursor-pointer"
          >
            <FiX className="w-3.5 h-3.5" />
            <span>Cancel</span>
          </button>
          <button
            type="submit"
            disabled={
              submitting
              || !selectedAccount
              || Number.isNaN(payAmountNum)
              || payAmountNum <= 0
              || isPayOverBalance
              || isPayUnderTendered
              || !payOfficialReceipt.trim()
              || !proofFile
            }
            className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FiCheckCircle className="w-4 h-4" />
            <span>{submitting ? 'Sending...' : 'Collect & Send to Cashier'}</span>
          </button>
        </div>
      </form>
    </Modal>
  )
}
