import { useState, useEffect, useRef, useMemo } from 'react'
import { useLocation, useSearchParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  FiClock, FiCalendar, FiCheckCircle, FiAlertTriangle, FiAlertCircle,
  FiCamera, FiSmartphone, FiShield, FiLock, FiDownload, FiPrinter,
  FiBarChart2, FiSearch, FiFilter, FiX, FiKey, FiUser, FiFileText,
  FiHome, FiCheck, FiLayers, FiRefreshCw, FiEye, FiEyeOff, FiXCircle, FiInfo, FiUpload
} from 'react-icons/fi'
import {
  Btn, Badge, StatusBadge, Input, Select, Card, PageHeader, StatCard, Table, TR, TD,
  SearchBar, Pagination, TabBar, showToast, LoadingState, ErrorAlert, TableSkeleton, EmptyState, Modal,
} from '../components/ui'
import { fmtDate, filterBySearch } from '../lib/utils'
import { api } from '../lib/api'
import { downloadCsv } from '../lib/api'
import { Html5Qrcode } from 'html5-qrcode'
import { QRCodeSVG } from 'qrcode.react'
import QrMonitoringModal from '../components/attendance/QrMonitoringModal'

const DEPARTMENTS = ['All', 'Operations', 'Sales', 'Finance']
const STATUSES = ['All', 'Present', 'Late', 'Absent', 'Half Day']

// Sound synthesizer using Web Audio API for zero-dependency instant feedback
const playTone = (type) => {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext
    if (!AudioContext) return
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)

    if (type === 'beep') {
      osc.frequency.setValueAtTime(880, ctx.currentTime)
      gain.gain.setValueAtTime(0.15, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12)
      osc.start()
      osc.stop(ctx.currentTime + 0.12)
    } else if (type === 'success') {
      osc.frequency.setValueAtTime(523.25, ctx.currentTime)
      gain.gain.setValueAtTime(0.2, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35)
      osc.start()
      osc.stop(ctx.currentTime + 0.35)
    } else if (type === 'error') {
      osc.type = 'sawtooth'
      osc.frequency.setValueAtTime(220, ctx.currentTime)
      gain.gain.setValueAtTime(0.2, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3)
      osc.start()
      osc.stop(ctx.currentTime + 0.3)
    }
  } catch (e) {
    // AudioContext blocked
  }
}

export default function AttendancePage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const isAdmin = user?.role === 'Administrator'
  const isEmployee = user?.role === 'Employee'
  const isStoreAdmin = user?.role === 'Store Administrator' || user?.role === 'Store Admin'
  const userBranch = user?.employee?.branch || 'Main Branch'

  const location = useLocation()
  const [searchParams] = useSearchParams()
  const [qrMonitoringOpen, setQrMonitoringOpen] = useState(false)
  
  // Default tab based on role
  const [activeTab, setActiveTab] = useState(
    isEmployee ? 'my-qr' : isStoreAdmin ? 'punch' : 'log'
  )
  const [records, setRecords] = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Logs & Filters
  const [search, setSearch] = useState('')
  const [selectedDate, setSelectedDate] = useState('')
  const [deptFilter, setDeptFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')
  const [page, setPage] = useState(1)
  const pageSize = 12

  // Scan Logs Tab State
  const [scanLogs, setScanLogs] = useState([])
  const [scanLogsLoading, setScanLogsLoading] = useState(false)
  const [scanLogsPage, setScanLogsPage] = useState(1)
  const [scanLogsTotal, setScanLogsTotal] = useState(0)
  const [scanLogsStatusFilter, setScanLogsStatusFilter] = useState('All')
  const [scanLogsActionFilter, setScanLogsActionFilter] = useState('All')

  // QR + PIN Attendance Station State
  const [stationStep, setStationStep] = useState('scan') // 'scan' | 'pin' | 'result'
  const [cameraActive, setCameraActive] = useState(true)
  const [cameraError, setCameraError] = useState('')
  const [cameras, setCameras] = useState([])
  const [selectedCameraId, setSelectedCameraId] = useState('')
  const [manualTokenInput, setManualTokenInput] = useState('')
  const [showPin, setShowPin] = useState(false)

  // Identified Employee from Step 1
  const [identifiedEmployee, setIdentifiedEmployee] = useState(null)
  const [availableActions, setAvailableActions] = useState([])
  const [selectedAction, setSelectedAction] = useState('')
  const [scannedQrToken, setScannedQrToken] = useState('')
  const [verifyingQr, setVerifyingQr] = useState(false)

  // PIN Pad state for Step 2
  const [enteredPin, setEnteredPin] = useState('')
  const [verifyingPin, setVerifyingPin] = useState(false)
  const [pinError, setPinError] = useState('')
  const [isLockedOut, setIsLockedOut] = useState(false)

  // Result state for Step 3
  const [punchResult, setPunchResult] = useState(null)
  const [countdown, setCountdown] = useState(8)
  const countdownTimerRef = useRef(null)

  // QR Request Modal State
  const [qrRequestModalOpen, setQrRequestModalOpen] = useState(false)
  const [submittingRequest, setSubmittingRequest] = useState(false)

  // Employee Profile for Employee View
  const [myProfile, setMyProfile] = useState(null)
  const [myProfileLoading, setMyProfileLoading] = useState(false)

  const html5QrCodeRef = useRef(null)
  const isScannerRunningRef = useRef(false)
  const fileInputRef = useRef(null)

  const loadData = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await api.attendance.getDaily({
        date: selectedDate || undefined,
        department: deptFilter !== 'All' ? deptFilter : undefined,
        status: statusFilter !== 'All' ? statusFilter : undefined,
      })
      setRecords(data.records || data.attendance || [])
      setSummary(data.summary || data.stats || null)
    } catch (err) {
      console.error('Failed to load attendance:', err)
      setError(err.message || 'Failed to fetch attendance records')
    } finally {
      setLoading(false)
    }
  }

  const loadScanLogs = async () => {
    setScanLogsLoading(true)
    try {
      const res = await api.attendance.getScanLogs({
        page: scanLogsPage,
        status: scanLogsStatusFilter !== 'All' ? scanLogsStatusFilter : undefined,
        action_type: scanLogsActionFilter !== 'All' ? scanLogsActionFilter : undefined,
      })
      setScanLogs(res.logs || [])
      setScanLogsTotal(res.total || 0)
    } catch (err) {
      console.error('Failed to load scan logs:', err)
    } finally {
      setScanLogsLoading(false)
    }
  }

  const loadMyProfile = async () => {
    if (!isEmployee && !isStoreAdmin) return
    setMyProfileLoading(true)
    try {
      const res = await api.employees.getMe()
      if (res?.employee) {
        setMyProfile(res.employee)
      }
    } catch (err) {
      console.error('Failed to load employee profile:', err)
    } finally {
      setMyProfileLoading(false)
    }
  }

  const handleSubmitQrRequest = async () => {
    setSubmittingRequest(true)
    try {
      const res = await api.qrRequests.create()
      if (res.success) {
        showToast(res.message || 'Your QR code request has been submitted to the Administrator.', 'success')
        setQrRequestModalOpen(false)
        loadMyProfile()
      } else {
        showToast(res.message || 'Failed to submit request', 'error')
      }
    } catch (err) {
      showToast(err.message || 'Failed to submit QR request', 'error')
    } finally {
      setSubmittingRequest(false)
    }
  }

  useEffect(() => {
    if (isEmployee || isStoreAdmin) {
      loadMyProfile()
    }
  }, [isEmployee, isStoreAdmin])

  useEffect(() => {
    if (activeTab === 'log' || activeTab === 'timesheet') {
      loadData()
    } else if (activeTab === 'audit') {
      loadScanLogs()
    }
  }, [activeTab, selectedDate, deptFilter, statusFilter, scanLogsPage, scanLogsStatusFilter, scanLogsActionFilter])

  useEffect(() => {
    const searchParam = searchParams.get('search')
    const dateParam = searchParams.get('date')
    const idParam = searchParams.get('id')
    const tabParam = searchParams.get('tab')
    if (tabParam) {
      setActiveTab(tabParam)
    } else if (idParam || searchParam || dateParam) {
      setActiveTab('log')
      if (searchParam) setSearch(searchParam)
      if (dateParam) setSelectedDate(dateParam)
    }
  }, [searchParams])

  // Camera Scanner Lifecycle
  useEffect(() => {
    if (activeTab === 'punch' && stationStep === 'scan' && cameraActive && isStoreAdmin) {
      startCamera()
    } else {
      stopCamera()
    }

    return () => {
      stopCamera()
    }
  }, [activeTab, stationStep, cameraActive, selectedCameraId, isStoreAdmin])

  const checkCameraPermission = async () => {
    // Check if getUserMedia is supported
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (window.isSecureContext === false) {
        setCameraError('🚨 INSECURE CONNECTION (HTTP) 🚨\nYour browser is permanently blocking the camera because you are not using HTTPS. You MUST restart your terminal (stop npm run dev and start it again) to enable the SSL plugin, then open the https:// URL.')
        return false
      }
      setCameraError('Camera API is not supported in this browser. Please ensure you are using HTTPS.')
      return false
    }

    try {
      // Explicitly request camera permission to catch denied states gracefully
      const stream = await navigator.mediaDevices.getUserMedia({ video: true })
      // Stop the stream immediately, we just needed the permission granted
      stream.getTracks().forEach(track => track.stop())
      return true
    } catch (err) {
      console.error("Permission check failed:", err)
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setCameraError('Camera permission was denied. Please allow camera access in your browser settings and click Retry.')
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setCameraError('No camera device found on this system.')
      } else {
        setCameraError(`Camera initialization failed: ${err.message || 'Unknown error'}`)
      }
      return false
    }
  }

  const startCamera = async () => {
    setCameraError('')
    try {
      if (isScannerRunningRef.current) return;
      
      const hasPermission = await checkCameraPermission()
      if (!hasPermission) return // Error state is already set by checkCameraPermission

      const devices = await Html5Qrcode.getCameras()
      if (devices && devices.length > 0) {
        setCameras(devices)
        const backCam = devices.find(d => 
          d.label.toLowerCase().includes('back') || 
          d.label.toLowerCase().includes('rear') || 
          d.label.toLowerCase().includes('environment')
        )
        const cameraId = selectedCameraId || (backCam ? backCam.id : devices[0].id)

        if (!html5QrCodeRef.current) {
          html5QrCodeRef.current = new Html5Qrcode('qr-reader-container')
        }

        if (!isScannerRunningRef.current) {
          await html5QrCodeRef.current.start(
            cameraId,
            {
              fps: 15,
              qrbox: { width: 240, height: 240 },
              aspectRatio: 1.0,
            },
            onQrCodeScanned,
            () => {} // Ignore continuous frame errors
          )
          isScannerRunningRef.current = true
        }
      } else {
        setCameraError('No camera found on this device.')
      }
    } catch (err) {
      console.error("Camera Start Error:", err)
      setCameraError('Unable to start the camera scanner. Please retry or use manual input.')
      isScannerRunningRef.current = false
    }
  }



  const stopCamera = async () => {
    if (html5QrCodeRef.current && isScannerRunningRef.current) {
      try {
        await html5QrCodeRef.current.stop()
        html5QrCodeRef.current.clear()
      } catch (err) {
        console.error("Error stopping camera:", err)
      }
      isScannerRunningRef.current = false
    }
  }

  const onQrCodeScanned = async (decodedText) => {
    if (!decodedText || verifyingQr) return
    playTone('beep')
    await handleVerifyQr(decodedText.trim())
  }

  const handleVerifyQr = async (token) => {
    setVerifyingQr(true)
    setCameraError('')
    try {
      const res = await api.attendance.scan({
        qr_token: token,
        device_info: `${navigator.platform} (${navigator.userAgent})`,
      })

      if (res.success && res.employee) {
        if (res.available_actions && res.available_actions.includes('COMPLETED')) {
          playTone('error')
          showToast('Attendance already completed for today.', 'error')
          setVerifyingQr(false)
          return
        }
        setScannedQrToken(token)
        setIdentifiedEmployee(res.employee)
        setAvailableActions(res.available_actions || ['TIME_IN'])
        setSelectedAction(res.available_actions ? res.available_actions[0] : 'TIME_IN')
        setEnteredPin('')
        setPinError('')
        setIsLockedOut(false)
        await stopCamera()
        setStationStep('pin')
        showToast(`Employee Identified: ${res.employee.name}`, 'success')
      } else {
        playTone('error')
        showToast(res.message || 'Invalid or inactive QR code', 'error')
      }
    } catch (err) {
      playTone('error')
      if (err.status === 423) {
        setIsLockedOut(true)
        showToast(err.message || 'Account temporarily locked', 'error')
      } else if (err.status === 403) {
        showToast(err.message || 'Cross-branch scan unauthorized', 'error')
      } else {
        showToast(err.message || 'QR code verification failed', 'error')
      }
    } finally {
      setVerifyingQr(false)
    }
  }

  const handleManualTokenSubmit = (e) => {
    e?.preventDefault()
    if (!manualTokenInput.trim()) return
    handleVerifyQr(manualTokenInput.trim())
  }

  const handleFileUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    try {
      if (!html5QrCodeRef.current) {
        html5QrCodeRef.current = new Html5Qrcode('qr-reader-container')
      }
      setVerifyingQr(true)
      const decodedText = await html5QrCodeRef.current.scanFile(file, true)
      if (decodedText) {
        setVerifyingQr(false) // Reset before calling verify since onQrCodeScanned expects it false
        onQrCodeScanned(decodedText)
      }
    } catch (err) {
      setVerifyingQr(false)
      showToast('Could not find a valid QR code in this image. Please try another.', 'error')
    }
    e.target.value = ''
  }

  const handlePinDigit = (digit) => {
    if (enteredPin.length < 6) {
      setEnteredPin(prev => prev + digit)
      setPinError('')
    }
  }

  const handlePinDelete = () => {
    setEnteredPin(prev => prev.slice(0, -1))
    setPinError('')
  }

  const handlePinClear = () => {
    setEnteredPin('')
    setPinError('')
  }

  const handleVerifyPin = async (e) => {
    if (e) e.preventDefault()
    if (!scannedQrToken || enteredPin.length < 4) {
      setPinError('Please enter your 4 to 6 digit employee PIN')
      return
    }

    setVerifyingPin(true)
    setPinError('')
    try {
      const res = await api.attendance.verifyPin({
        qr_token: scannedQrToken,
        pin: enteredPin,
        action: selectedAction,
        device_info: `${navigator.platform} (${navigator.userAgent})`,
      })

      if (res.success) {
        playTone('success')
        setPunchResult(res)
        setStationStep('result')
        startAutoResetCountdown()
        loadData()
        showToast(res.message || 'Attendance verified and recorded!', 'success')
      } else {
        playTone('error')
        setPinError(res.message || 'PIN verification failed')
        setEnteredPin('')
      }
    } catch (err) {
      playTone('error')
      setPinError(err.message || 'PIN verification failed')
      setEnteredPin('')
      if (err.status === 423) {
        setIsLockedOut(true)
      }
    } finally {
      setVerifyingPin(false)
    }
  }

  const startAutoResetCountdown = () => {
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current)
    setCountdown(8)
    countdownTimerRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(countdownTimerRef.current)
          resetStation()
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  const resetStation = () => {
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current)
    setStationStep('scan')
    setIdentifiedEmployee(null)
    setAvailableActions([])
    setSelectedAction('')
    setScannedQrToken('')
    setEnteredPin('')
    setPinError('')
    setIsLockedOut(false)
    setPunchResult(null)
    setManualTokenInput('')
  }

  const handleDownloadMyQr = () => {
    const svgEl = document.getElementById('my-employee-qr')
    if (!svgEl) return
    const svgData = new XMLSerializer().serializeToString(svgEl)
    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `QR_${myProfile?.employee_code || 'Badge'}.svg`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    showToast('QR badge downloaded successfully', 'success')
  }

  const filtered = useMemo(() => {
    return filterBySearch(records, search, ['employee_name', 'employee_code', 'department'])
  }, [records, search])

  const total = filtered.length
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize)

  const [exporting, setExporting] = useState(false)
  const handleExportCSV = async () => {
    setExporting(true)
    try {
      await downloadCsv('/attendance/daily', {
        date: selectedDate || undefined,
        department: deptFilter !== 'All' ? deptFilter : undefined,
        status: statusFilter !== 'All' ? statusFilter : undefined,
      })
      showToast('Attendance exported successfully', 'success')
    } catch (err) {
      showToast(err.message || 'Export failed', 'error')
    } finally {
      setExporting(false)
    }
  }

  const timesheetSummary = useMemo(() => {
    return Object.values(records.reduce((acc, a) => {
      if (!acc[a.employee_id]) {
        acc[a.employee_id] = {
          employee_id: a.employee_id,
          name: a.employee_name,
          code: a.employee_code,
          department: a.department,
          total_hours: 0,
          total_overtime: 0,
          late_count: 0,
          absent_count: 0,
          present_count: 0,
        }
      }
      const emp = acc[a.employee_id]
      emp.total_hours += (a.total_hours || 0)
      emp.total_overtime += (a.overtime_hours || 0)
      if (a.status === 'Late') emp.late_count++
      if (a.status === 'Absent') emp.absent_count++
      if (a.status === 'Present' || a.status === 'Late' || a.status === 'COMPLETE') emp.present_count++
      return acc
    }, {}))
  }, [records])

  // Determine Tab Options
  const tabList = isEmployee
    ? [
        { id: 'my-qr', label: 'My Permanent QR Badge', icon: <FiSmartphone className="w-3.5 h-3.5" /> },
        { id: 'log', label: 'My Attendance Logs', icon: <FiClock className="w-3.5 h-3.5" /> },
        { id: 'timesheet', label: 'My Timesheet Summary', icon: <FiBarChart2 className="w-3.5 h-3.5" /> },
      ]
    : isStoreAdmin
    ? [
        { id: 'punch', label: 'QR Attendance Terminal', icon: <FiCamera className="w-3.5 h-3.5 text-primary" /> },
        { id: 'log', label: 'Branch Attendance Daily Logs', icon: <FiClock className="w-3.5 h-3.5" /> },
        { id: 'timesheet', label: 'Timesheet & Summary', icon: <FiBarChart2 className="w-3.5 h-3.5" /> },
        { id: 'audit', label: 'Security Scan Logs', icon: <FiShield className="w-3.5 h-3.5" /> },
      ]
    : [
        { id: 'log', label: 'Attendance Daily Logs', icon: <FiClock className="w-3.5 h-3.5" /> },
        { id: 'timesheet', label: 'Timesheet & Weekly Summary', icon: <FiBarChart2 className="w-3.5 h-3.5" /> },
        { id: 'audit', label: 'Security Scan Logs', icon: <FiShield className="w-3.5 h-3.5" /> },
      ]

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          isEmployee
            ? "My Attendance & Permanent QR Badge"
            : isStoreAdmin
            ? "QR Attendance Terminal & Branch Logs"
            : "Attendance Logs & Verification Records"
        }
        subtitle={
          isEmployee
            ? "View your permanent QR attendance badge, punch records, and monthly timesheet summary"
            : isStoreAdmin
            ? `Store Administrator Scanner Terminal • Authorized Branch: ${userBranch}`
            : "Monitor organization-wide attendance records, QR + PIN verification methods, and work hours"
        }
        action={
          <div className="flex gap-2 flex-wrap">
            {activeTab === 'log' && (
              <button
                onClick={handleExportCSV}
                disabled={exporting}
                className="flex items-center gap-2 px-4 py-2 bg-muted hover:bg-muted/80 text-foreground font-semibold text-xs rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50"
              >
                {exporting ? <FiAlertTriangle className="w-4 h-4 animate-spin" /> : <FiDownload className="w-4 h-4" />}
                <span>{exporting ? 'Exporting...' : 'Export CSV'}</span>
              </button>
            )}
            {isAdmin && (
              <Btn
                variant="primary"
                size="sm"
                onClick={() => setQrMonitoringOpen(true)}
                icon={<FiCamera className="w-4 h-4" />}
              >
                QR Monitoring
              </Btn>
            )}
            {isStoreAdmin && activeTab !== 'punch' && (
              <Btn
                variant="primary"
                size="sm"
                onClick={() => setActiveTab('punch')}
                icon={<FiCamera className="w-4 h-4" />}
              >
                Open QR Scanner Terminal
              </Btn>
            )}
          </div>
        }
      />

      {/* Daily Summary Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard title="Present Today" value={summary?.present?.toString() || '0'} sub="verified punches" icon={<FiCheckCircle className="w-5 h-5 text-emerald-500" />} color="green" />
        <StatCard title="Late Arrivals" value={summary?.late?.toString() || '0'} sub="after 8:15 AM cutoff" icon={<FiClock className="w-5 h-5 text-amber-500" />} color="yellow" />
        <StatCard title="Absences" value={summary?.absent?.toString() || '0'} sub="unrecorded attendance" icon={<FiX className="w-5 h-5 text-rose-500" />} color="red" />
        <StatCard title="Half Day / Leave" value={summary?.half_day?.toString() || '0'} sub="partial shift entries" icon={<FiFileText className="w-5 h-5 text-blue-500" />} color="blue" />
      </div>

      {error && <ErrorAlert message={error} onRetry={loadData} />}

      <div>
        <TabBar
          tabs={tabList}
          activeTab={activeTab}
          onChange={setActiveTab}
        />
      </div>

      {/* TAB: STORE ADMINISTRATOR QR SCANNER TERMINAL */}
      {isStoreAdmin && activeTab === 'punch' && (
        <div className="max-w-3xl mx-auto space-y-6">
          {/* STEP 1: LIVE CAMERA SCANNER */}
          {stationStep === 'scan' && (
            <Card className="p-6 border border-border shadow-xl space-y-4">
              <div className="text-center space-y-1">
                <span className="text-[10px] uppercase font-bold tracking-wider text-primary">
                  Store Administrator Attendance Terminal • Step 1
                </span>
                <h2 className="text-lg font-bold text-foreground">Scan Employee QR Code</h2>
                <p className="text-xs text-muted-foreground max-w-md mx-auto">
                  Position the employee's permanent attendance QR code in front of the camera.
                </p>
              </div>

              {cameraError && (
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-500 text-xs font-semibold text-center mx-auto max-w-sm mb-4 space-y-3">
                  <div>{cameraError}</div>
                  <div className="flex items-center justify-center gap-3">
                    <button 
                      type="button" 
                      onClick={startCamera} 
                      className="px-4 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-600 rounded-lg transition-colors flex items-center gap-2"
                    >
                      <FiRefreshCw className="w-3.5 h-3.5" />
                      Retry Camera
                    </button>
                    <button 
                      type="button" 
                      onClick={() => fileInputRef.current?.click()} 
                      className="px-4 py-2 bg-primary/20 hover:bg-primary/30 text-primary rounded-lg transition-colors flex items-center gap-2"
                    >
                      <FiUpload className="w-3.5 h-3.5" />
                      Upload Image
                    </button>
                    <input 
                      type="file" 
                      ref={fileInputRef}
                      className="hidden" 
                      accept="image/*" 
                      capture="environment"
                      onChange={handleFileUpload} 
                    />
                  </div>
                </div>
              )}

              {/* Viewport (Always in DOM for Html5Qrcode initialization) */}
              <div className="w-full max-w-sm mx-auto aspect-square bg-slate-950 rounded-2xl border-2 border-slate-700 overflow-hidden relative shadow-2xl flex items-center justify-center">
                <div id="qr-reader-container" className="w-full h-full" />

                {/* Target Overlay */}
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <div className="w-60 h-60 border-2 border-primary/80 rounded-2xl relative animate-pulse shadow-lg shadow-primary/20">
                    <div className="absolute -top-1.5 -left-1.5 w-6 h-6 border-t-4 border-l-4 border-primary rounded-tl" />
                    <div className="absolute -top-1.5 -right-1.5 w-6 h-6 border-t-4 border-r-4 border-primary rounded-tr" />
                    <div className="absolute -bottom-1.5 -left-1.5 w-6 h-6 border-b-4 border-l-4 border-primary rounded-bl" />
                    <div className="absolute -bottom-1.5 -right-1.5 w-6 h-6 border-b-4 border-r-4 border-primary rounded-br" />
                  </div>
                </div>

                {verifyingQr && (
                  <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-xs flex flex-col items-center justify-center text-primary gap-2 z-20">
                    <FiRefreshCw className="animate-spin text-3xl" />
                    <span className="text-xs font-bold text-white">Verifying Employee QR...</span>
                  </div>
                )}
              </div>

              {/* Camera Switcher */}
              {cameras.length > 1 && !cameraError && (
                <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground mt-4">
                  <FiCamera />
                  <select
                    value={selectedCameraId}
                    onChange={(e) => setSelectedCameraId(e.target.value)}
                    className="bg-card border border-border rounded-lg px-2.5 py-1 text-xs outline-none text-foreground font-semibold"
                  >
                    {cameras.map(c => (
                      <option key={c.id} value={c.id}>{c.label || `Camera ${c.id.slice(0, 5)}`}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Manual Barcode / Token Input Fallback */}
              <div className="pt-2 max-w-sm mx-auto">
                <form onSubmit={handleManualTokenSubmit} className="flex gap-2">
                  <input
                    type="text"
                    value={manualTokenInput}
                    onChange={e => setManualTokenInput(e.target.value)}
                    placeholder="Scan or paste token..."
                    className="flex-1 px-3 py-1.5 rounded-xl border border-border bg-card text-foreground font-mono text-xs outline-none"
                  />
                  <Btn type="submit" size="sm" variant="primary" disabled={verifyingQr || !manualTokenInput.trim()}>
                    Scan
                  </Btn>
                  
                  {/* File Upload Button Fallback */}
                  <label className="flex items-center justify-center px-3 py-1.5 rounded-xl bg-muted hover:bg-muted/80 text-foreground cursor-pointer transition-colors border border-border shadow-xs">
                    <input 
                      type="file" 
                      accept="image/*" 
                      className="hidden" 
                      onChange={handleFileUpload} 
                      disabled={verifyingQr}
                    />
                    <FiCamera className="w-4 h-4 text-muted-foreground" />
                    <span className="ml-1.5 text-xs font-bold">Upload Image</span>
                  </label>
                </form>
              </div>
            </Card>
          )}

          {/* STEP 2: EMPLOYEE IDENTIFIED & PERSONAL PIN REQUIRED */}
          {stationStep === 'pin' && identifiedEmployee && (
            <div className="space-y-4 max-w-lg mx-auto">
              {/* Employee Identified Card */}
              <Card className="p-5 border border-border shadow-lg space-y-3">
                <div className="flex items-center justify-between border-b border-border pb-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center font-bold">
                      <FiUser />
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-emerald-500 uppercase">EMPLOYEE IDENTIFIED</span>
                      <h3 className="text-sm font-bold text-foreground">{identifiedEmployee.name}</h3>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-500 border border-emerald-500/30">
                    <FiCheckCircle /> QR: ACTIVE
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2.5 rounded-xl bg-muted/30 border border-border">
                    <span className="text-[10px] text-muted-foreground uppercase font-bold block">Employee Code</span>
                    <span className="font-mono font-bold text-primary">{identifiedEmployee.employee_code}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-muted/30 border border-border">
                    <span className="text-[10px] text-muted-foreground uppercase font-bold block">Branch</span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">{identifiedEmployee.branch || userBranch}</span>
                  </div>
                </div>
              </Card>

              {/* PIN Keypad */}
              <Card className="p-6 border border-border shadow-xl space-y-4 text-center">
                <div>
                  <span className="text-[10px] uppercase font-bold tracking-wider text-amber-500">Step 2 of 2</span>
                  <h3 className="text-base font-bold text-foreground flex items-center justify-center gap-1.5 mt-0.5">
                    <FiLock className="text-primary" /> PERSONAL PIN REQUIRED
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    The employee must enter their 4 to 6 digit security PIN.
                  </p>
                </div>

                {availableActions.length > 0 && (
                  <div className="flex flex-wrap justify-center gap-2 mb-2">
                    {availableActions.map(action => (
                      <button
                        key={action}
                        type="button"
                        onClick={() => setSelectedAction(action)}
                        className={`px-4 py-2 rounded-xl text-xs font-bold border transition-colors ${selectedAction === action ? 'bg-primary text-primary-foreground border-primary shadow-md' : 'bg-card text-foreground border-border hover:bg-muted'}`}
                      >
                        {action.replace('_', ' ')}
                      </button>
                    ))}
                  </div>
                )}

                {pinError && (
                  <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-500 text-xs font-semibold animate-shake">
                    {pinError}
                  </div>
                )}

                {/* PIN Mask Field */}
                <div className="flex items-center justify-center gap-2">
                  <input
                    type={showPin ? 'text' : 'password'}
                    maxLength={6}
                    value={enteredPin}
                    onChange={(e) => setEnteredPin(e.target.value.replace(/\D/g, ''))}
                    placeholder="••••"
                    className="w-48 text-center text-2xl font-mono tracking-widest py-2 px-4 rounded-xl border-2 border-primary/50 bg-card text-foreground font-bold outline-none"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowPin(!showPin)}
                    className="p-2.5 rounded-xl border border-border bg-card text-muted-foreground hover:text-foreground"
                  >
                    {showPin ? <FiEyeOff /> : <FiEye />}
                  </button>
                </div>

                {/* Touch Keypad */}
                <div className="max-w-xs mx-auto grid grid-cols-3 gap-2 pt-1">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => handlePinDigit(num.toString())}
                      className="py-3 bg-muted/40 hover:bg-muted active:scale-95 text-foreground font-bold text-base rounded-xl border border-border transition cursor-pointer"
                    >
                      {num}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={handlePinClear}
                    className="py-3 bg-muted/40 hover:bg-rose-500/10 text-rose-500 font-semibold text-xs rounded-xl border border-border transition cursor-pointer"
                  >
                    CLEAR
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePinDigit('0')}
                    className="py-3 bg-muted/40 hover:bg-muted active:scale-95 text-foreground font-bold text-base rounded-xl border border-border transition cursor-pointer"
                  >
                    0
                  </button>
                  <button
                    type="button"
                    onClick={handlePinDelete}
                    className="py-3 bg-muted/40 hover:bg-muted text-foreground font-semibold text-xs rounded-xl border border-border transition cursor-pointer flex items-center justify-center"
                  >
                    ⌫
                  </button>
                </div>

                <div className="pt-2 flex gap-3 max-w-xs mx-auto">
                  <Btn variant="outline" className="flex-1" onClick={resetStation} disabled={verifyingPin}>
                    Cancel
                  </Btn>
                  <Btn
                    variant="primary"
                    className="flex-1"
                    onClick={handleVerifyPin}
                    disabled={verifyingPin || enteredPin.length < 4}
                    icon={<FiCheck />}
                  >
                    {verifyingPin ? 'Verifying...' : 'VERIFY'}
                  </Btn>
                </div>
              </Card>
            </div>
          )}

          {/* STEP 3: SUCCESS RESULT */}
          {stationStep === 'result' && punchResult && (
            <Card className="p-8 border border-border shadow-2xl max-w-lg mx-auto text-center space-y-5 animate-fadeIn">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-500 border-2 border-emerald-500/40 flex items-center justify-center mx-auto text-3xl shadow-lg">
                <FiCheckCircle />
              </div>

              <div>
                <h2 className="text-xl font-black text-emerald-600 dark:text-emerald-400 uppercase">
                  {punchResult.action === 'TIME_IN'
                    ? '✓ TIME IN SUCCESSFUL'
                    : punchResult.action === 'TIME_OUT'
                    ? '✓ TIME OUT SUCCESSFUL'
                    : '✓ ATTENDANCE VERIFIED'}
                </h2>
                <p className="text-xs text-muted-foreground mt-1">
                  {punchResult.message}
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-muted/30 border border-border text-xs space-y-2 text-left">
                <div className="flex justify-between py-1 border-b border-border">
                  <span className="text-muted-foreground">Employee:</span>
                  <span className="font-bold text-foreground">{punchResult.employee?.name}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-border">
                  <span className="text-muted-foreground">Employee Code:</span>
                  <span className="font-mono font-bold text-primary">{punchResult.employee?.employee_code}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-border">
                  <span className="text-muted-foreground">Timestamp:</span>
                  <span className="font-mono font-bold text-foreground">{punchResult.time}</span>
                </div>
                {punchResult.action === 'TIME_OUT' && (
                  <>
                    <div className="flex justify-between py-1 border-b border-border">
                      <span className="text-muted-foreground">Total Hours:</span>
                      <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">{punchResult.total_hours} hrs</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-border">
                      <span className="text-muted-foreground">Overtime:</span>
                      <span className="font-mono font-bold text-amber-500">{punchResult.overtime_hours} hrs</span>
                    </div>
                  </>
                )}
                <div className="flex justify-between py-1 border-b border-border">
                  <span className="text-muted-foreground">Branch:</span>
                  <span className="font-semibold text-foreground">{punchResult.branch || userBranch}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-muted-foreground">Verification Method:</span>
                  <span className="font-bold text-foreground">QR + PIN</span>
                </div>
              </div>

              <div className="pt-2">
                <Btn variant="primary" size="lg" className="w-full" onClick={resetStation} icon={<FiCamera />}>
                  Scan Next Employee ({countdown}s)
                </Btn>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* TAB: EMPLOYEE PERSONAL ATTENDANCE QR */}
      {isEmployee && activeTab === 'my-qr' && (
        <div className="max-w-2xl mx-auto space-y-6">
          {myProfileLoading ? (
            <LoadingState message="Loading your permanent attendance QR..." />
          ) : (myProfile?.qr_status === 'ACTIVE' && myProfile?.qr_token && myProfile?.qr_active) ? (
            /* STATE 5: ACTIVE */
            <div className="flex flex-col items-center space-y-6">
              {/* Ready Banner */}
              <div className="w-full text-center space-y-1.5 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
                <div className="inline-flex items-center gap-1 text-xs font-mono font-bold px-3 py-0.5 rounded-full bg-emerald-500/20 text-emerald-500 border border-emerald-500/30">
                  <FiCheckCircle className="w-3.5 h-3.5" /> QR Status: ACTIVE
                </div>
                <h3 className="text-base font-bold text-emerald-600 dark:text-emerald-400">Attendance QR Code Ready</h3>
                <p className="text-xs text-muted-foreground">
                  "Your account has been verified and your permanent QR code has been issued by the Administrator."
                </p>
              </div>

              {/* ID Card Badge */}
              <div className="w-80 bg-gradient-to-b from-slate-900 via-slate-800 to-slate-950 text-white rounded-3xl shadow-2xl border border-slate-700 overflow-hidden flex flex-col items-center p-6 text-center relative">
                <div className="w-12 h-1 bg-amber-400 rounded-full mb-3" />
                <span className="text-[10px] uppercase tracking-widest text-amber-300 font-bold">PERMANENT ATTENDANCE BADGE</span>
                <h4 className="text-xs text-slate-400 font-medium mt-0.5">Official Company ID</h4>

                <div className="w-16 h-16 rounded-2xl bg-slate-800 border-2 border-primary/40 flex items-center justify-center text-primary font-bold text-2xl my-3 shadow-inner">
                  {myProfile.first_name?.[0]}{myProfile.last_name?.[0]}
                </div>

                <h3 className="font-bold text-lg text-white leading-tight">
                  {myProfile.first_name} {myProfile.last_name}
                </h3>
                <p className="text-xs text-primary font-semibold mt-0.5">{myProfile.position}</p>
                <p className="text-[11px] text-slate-400">{myProfile.department} · {myProfile.branch || 'Main Branch'}</p>

                <div className="mt-2 font-mono text-xs font-bold text-slate-200 bg-slate-800/80 px-3 py-1 rounded-full border border-slate-700">
                  {myProfile.employee_code}
                </div>

                {/* QR Code Graphic */}
                <div className="mt-4 p-4 bg-white rounded-2xl shadow-xl border-2 border-slate-200">
                  <QRCodeSVG
                    id="my-employee-qr"
                    value={myProfile.qr_token}
                    size={170}
                    level="H"
                    includeMargin={false}
                  />
                </div>

                <div className="mt-4 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-xs uppercase font-bold tracking-wider text-slate-200">
                    Permanent Active QR
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="w-full max-w-sm space-y-3">
                <div className="flex gap-3">
                  <button
                    onClick={handleDownloadMyQr}
                    className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs rounded-xl shadow-xs cursor-pointer transition"
                  >
                    <FiDownload className="w-4 h-4" />
                    <span>Download QR Badge</span>
                  </button>
                  <button
                    onClick={() => window.print()}
                    className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border border-border bg-card hover:bg-muted font-semibold text-xs text-foreground cursor-pointer transition"
                  >
                    <FiPrinter className="w-4 h-4" />
                    <span>Print Badge</span>
                  </button>
                </div>
              </div>
            </div>
          ) : myProfile?.qr_status === 'REQUESTED' ? (
            /* STATE 2: REQUESTED */
            <Card noPad className="p-8 text-center space-y-5 border border-border bg-card shadow-xl max-w-lg mx-auto">
              <div className="w-16 h-16 rounded-2xl bg-blue-500/10 text-blue-500 flex items-center justify-center mx-auto border border-blue-500/20 text-3xl">
                <FiClock />
              </div>
              <div className="space-y-2">
                <div className="inline-flex items-center gap-1.5 text-xs font-mono font-bold px-3 py-1 rounded-full bg-blue-500/10 text-blue-500 border border-blue-500/30">
                  <span className="w-2 h-2 rounded-full bg-blue-500 animate-ping" />
                  QR Status: REQUESTED
                </div>
                <h3 className="text-lg font-bold text-foreground mt-2">QR Request Submitted</h3>
                <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
                  "Your QR code request has been submitted to the Administrator. Your account is currently waiting for verification."
                </p>
              </div>
              <div className="pt-2">
                <Btn variant="outline" size="sm" disabled className="opacity-70 cursor-not-allowed mx-auto" icon={<FiCheckCircle />}>
                  Request Submitted
                </Btn>
              </div>
            </Card>
          ) : myProfile?.qr_status === 'UNDER_REVIEW' ? (
            /* STATE 3: UNDER REVIEW */
            <Card noPad className="p-8 text-center space-y-5 border border-border bg-card shadow-xl max-w-lg mx-auto">
              <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center mx-auto border border-indigo-500/20 text-3xl">
                <FiShield />
              </div>
              <div className="space-y-2">
                <div className="inline-flex items-center gap-1.5 text-xs font-mono font-bold px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-500 border border-indigo-500/30">
                  <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                  QR Status: UNDER REVIEW
                </div>
                <h3 className="text-lg font-bold text-foreground mt-2">Account Verification in Progress</h3>
                <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
                  "An Administrator is currently verifying your account information."
                </p>
              </div>
            </Card>
          ) : myProfile?.qr_status === 'REJECTED' ? (
            /* STATE 4: REJECTED */
            <Card noPad className="p-8 text-center space-y-5 border border-rose-500/30 bg-card shadow-xl max-w-lg mx-auto">
              <div className="w-16 h-16 rounded-2xl bg-rose-500/10 text-rose-500 flex items-center justify-center mx-auto border border-rose-500/20 text-3xl">
                <FiXCircle />
              </div>
              <div className="space-y-2">
                <div className="inline-flex items-center text-xs font-mono font-bold px-3 py-1 rounded-full bg-rose-500/10 text-rose-500 border border-rose-500/30">
                  QR Status: REJECTED
                </div>
                <h3 className="text-lg font-bold text-rose-600 dark:text-rose-400 mt-2">QR Request Rejected</h3>
                {myProfile?.qr_rejection_reason && (
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-500 font-medium max-w-md mx-auto">
                    <span className="font-bold block text-[10px] uppercase">Reason:</span>
                    {myProfile.qr_rejection_reason}
                  </div>
                )}
                <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
                  Please contact the Administrator or submit a new request after checking your details.
                </p>
              </div>
              <div className="pt-2">
                <Btn variant="primary" size="sm" onClick={() => setQrRequestModalOpen(true)} icon={<FiRefreshCw />}>
                  Request Again
                </Btn>
              </div>
            </Card>
          ) : (
            /* STATE 1: NOT GENERATED */
            <Card noPad className="p-8 text-center space-y-5 border border-border bg-card shadow-xl max-w-lg mx-auto">
              <div className="w-16 h-16 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center mx-auto border border-amber-500/20 text-3xl">
                <FiSmartphone />
              </div>
              <div className="space-y-2">
                <div className="inline-flex items-center text-xs font-mono font-bold px-3 py-1 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/30">
                  QR Status: NOT GENERATED
                </div>
                <h3 className="text-lg font-bold text-foreground mt-2">Attendance QR Code Not Yet Issued</h3>
                <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
                  "Your permanent QR code has not been generated by an Administrator yet."
                </p>
              </div>
              <div className="pt-2">
                <Btn variant="primary" size="sm" onClick={() => setQrRequestModalOpen(true)} icon={<FiSmartphone />}>
                  Request QR Code
                </Btn>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* REQUEST ATTENDANCE QR CODE MODAL */}
      {qrRequestModalOpen && myProfile && (
        <Modal
          title="REQUEST ATTENDANCE QR CODE"
          onClose={() => setQrRequestModalOpen(false)}
          size="md"
          footer={
            <div className="flex justify-end gap-2 w-full">
              <Btn variant="outline" size="sm" onClick={() => setQrRequestModalOpen(false)} disabled={submittingRequest}>
                Cancel
              </Btn>
              <Btn
                variant="primary"
                size="sm"
                onClick={handleSubmitQrRequest}
                disabled={submittingRequest}
                icon={<FiCheck />}
              >
                {submittingRequest ? 'Submitting...' : 'Submit Request'}
              </Btn>
            </div>
          }
        >
          <div className="space-y-4 py-1">
            <div className="p-3.5 rounded-2xl bg-primary/10 border border-primary/20 text-xs text-primary font-medium flex items-center gap-2">
              <FiInfo className="text-base shrink-0" />
              <span>
                {isStoreAdmin
                  ? "Your account must be verified by an Administrator before an attendance QR code can be issued."
                  : "Please verify that your employee information is correct before submitting your QR code request."}
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-card border border-border space-y-2.5 text-xs">
              <span className="text-[10px] uppercase font-bold text-muted-foreground block border-b border-border pb-1">
                {isStoreAdmin ? 'Store Administrator Information' : 'Employee Information'}
              </span>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase font-bold block">
                    {isStoreAdmin ? 'Store Admin ID' : 'Employee ID'}
                  </span>
                  <span className="font-mono font-bold text-primary">{myProfile.employee_code}</span>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase font-bold block">
                    {isStoreAdmin ? 'Full Name' : 'Employee Name'}
                  </span>
                  <span className="font-semibold text-foreground">{myProfile.first_name} {myProfile.last_name}</span>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase font-bold block">Position</span>
                  <span className="text-foreground">{myProfile.position}</span>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase font-bold block">Department</span>
                  <span className="text-foreground">{myProfile.department}</span>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase font-bold block">Branch</span>
                  <span className="font-semibold text-foreground">{myProfile.branch || userBranch}</span>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase font-bold block">Phone</span>
                  <span className="text-foreground font-mono">{myProfile.phone || '09XXXXXXXXX'}</span>
                </div>
              </div>
              <div className="pt-1">
                <span className="text-[10px] text-muted-foreground uppercase font-bold block">Email</span>
                <span className="text-foreground">{myProfile.email}</span>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* TAB: ATTENDANCE DAILY LOGS */}
      {activeTab === 'log' && (
        <div className="space-y-4">
          <Card noPad className="p-3.5 border border-border">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 relative">
                <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  value={search}
                  onChange={e => { setSearch(e.target.value); setPage(1); }}
                  placeholder="Search employee name, code, department..."
                  className="w-full pl-9 pr-8 py-2 rounded-xl border border-border bg-card text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-muted-foreground/70"
                />
                {search && (
                  <button
                    onClick={() => setSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    <FiX className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="flex gap-2 flex-wrap sm:flex-nowrap">
                <input
                  type="date"
                  value={selectedDate}
                  onChange={e => { setSelectedDate(e.target.value); setPage(1) }}
                  className="border border-border rounded-xl px-3 py-2 text-xs font-semibold text-foreground bg-card cursor-pointer"
                />
                <select
                  value={deptFilter}
                  onChange={e => { setDeptFilter(e.target.value); setPage(1) }}
                  className="border border-border rounded-xl px-3 py-2 text-xs font-semibold text-foreground bg-card cursor-pointer"
                >
                  {DEPARTMENTS.map(d => <option key={d} value={d}>{d === 'All' ? 'All Departments' : d}</option>)}
                </select>
                <select
                  value={statusFilter}
                  onChange={e => { setStatusFilter(e.target.value); setPage(1) }}
                  className="border border-border rounded-xl px-3 py-2 text-xs font-semibold text-foreground bg-card cursor-pointer"
                >
                  {STATUSES.map(s => <option key={s} value={s}>{s === 'All' ? 'All Statuses' : s}</option>)}
                </select>
              </div>
            </div>
          </Card>

          <Card noPad className="border border-border overflow-hidden">
            {loading ? (
              <TableSkeleton rows={6} cols={11} />
            ) : paginated.length === 0 ? (
              <EmptyState
                icon={<FiClock className="w-12 h-12 text-muted-foreground/30 mx-auto" />}
                title="No attendance records found"
                description={search || selectedDate || deptFilter !== 'All' ? 'Try adjusting your date or filter options' : 'Punches made via the QR terminal will appear here'}
                action={isStoreAdmin ? <Btn size="sm" onClick={() => setActiveTab('punch')}>Open QR Terminal Scanner</Btn> : null}
              />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border bg-muted/50 text-muted-foreground uppercase font-semibold text-[11px]">
                        <th className="py-3 px-4 text-left">Date</th>
                        <th className="py-3 px-4 text-left">Code</th>
                        <th className="py-3 px-4 text-left">Employee Name</th>
                        <th className="py-3 px-4 text-left">Branch</th>
                        <th className="py-3 px-4 text-left">Department</th>
                        <th className="py-3 px-4 text-left">Time In</th>
                        <th className="py-3 px-4 text-left">Break (Out-In)</th>
                        <th className="py-3 px-4 text-left">Lunch (Out-In)</th>
                        <th className="py-3 px-4 text-left">Time Out</th>
                        <th className="py-3 px-4 text-right">Actual Hrs</th>
                        <th className="py-3 px-4 text-center">Verification</th>
                        <th className="py-3 px-4 text-left">Verified By</th>
                        <th className="py-3 px-4 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {paginated.map((a, i) => (
                        <tr key={a.attendance_id || i} className={`hover:bg-muted/40 transition-colors ${i % 2 === 1 ? 'bg-muted/10' : ''}`}>
                          <td className="py-3 px-4 font-mono text-muted-foreground">{a.attendance_date}</td>
                          <td className="py-3 px-4 font-mono font-bold text-foreground">{a.employee_code}</td>
                          <td className="py-3 px-4 font-semibold text-foreground">{a.employee_name}</td>
                          <td className="py-3 px-4 font-medium text-foreground">{a.branch || 'Main Branch'}</td>
                          <td className="py-3 px-4"><Badge text={a.department || 'General'} variant="neutral" /></td>
                          <td className="py-3 px-4">
                            <div className="font-mono">{a.time_in ? a.time_in.substring(0,5) : '—'}</div>
                            {a.status === 'Late' && <div className="text-[10px] text-rose-500 font-bold uppercase tracking-wider mt-0.5">Late Arrival</div>}
                          </td>
                          <td className="py-3 px-4 font-mono text-xs">
                            {a.break_out ? `${a.break_out.substring(0,5)} - ${a.break_in ? a.break_in.substring(0,5) : '?'}` : '—'}
                          </td>
                          <td className="py-3 px-4 font-mono text-xs">
                            {a.lunch_out ? `${a.lunch_out.substring(0,5)} - ${a.lunch_in ? a.lunch_in.substring(0,5) : '?'}` : '—'}
                          </td>
                          <td className="py-3 px-4 font-mono text-muted-foreground">{a.time_out ? a.time_out.substring(0,5) : '—'}</td>
                          <td className="py-3 px-4 text-right font-mono font-bold">{a.total_hours > 0 ? `${a.total_hours}h` : '—'}</td>
                          <td className="py-3 px-4 text-center">
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                              {a.verification_method || 'QR + PIN'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-muted-foreground text-[11px]">{a.verified_by || 'Store Admin'}</td>
                          <td className="py-3 px-4 text-center"><StatusBadge status={a.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination total={total} page={page} pageSize={pageSize} onChange={setPage} />
              </>
            )}
          </Card>
        </div>
      )}

      {/* TAB: TIMESHEET SUMMARY */}
      {activeTab === 'timesheet' && (
        <Card noPad className="border border-border overflow-hidden">
          {loading ? (
            <TableSkeleton rows={5} cols={7} />
          ) : timesheetSummary.length === 0 ? (
            <EmptyState
              icon={<FiBarChart2 className="w-12 h-12 text-muted-foreground/30 mx-auto" />}
              title="No timesheet data"
              description="No attendance records available for the selected period."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/50 text-muted-foreground uppercase font-semibold text-[11px]">
                    <th className="py-3 px-4 text-left">Code</th>
                    <th className="py-3 px-4 text-left">Employee Name</th>
                    <th className="py-3 px-4 text-left">Department</th>
                    <th className="py-3 px-4 text-right">Days Present</th>
                    <th className="py-3 px-4 text-right">Late Incidents</th>
                    <th className="py-3 px-4 text-right">Total Shift Hrs</th>
                    <th className="py-3 px-4 text-right">Total Overtime</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {timesheetSummary.map((ts, i) => (
                    <tr key={ts.employee_id || i} className={`hover:bg-muted/40 transition-colors ${i % 2 === 1 ? 'bg-muted/10' : ''}`}>
                      <td className="py-3 px-4 font-mono font-bold text-foreground">{ts.code}</td>
                      <td className="py-3 px-4 font-semibold text-foreground">{ts.name}</td>
                      <td className="py-3 px-4"><Badge text={ts.department || 'General'} variant="neutral" /></td>
                      <td className="py-3 px-4 text-right font-mono text-emerald-600 font-bold">{ts.present_count}</td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-rose-600">{ts.late_count}</td>
                      <td className="py-3 px-4 text-right font-mono font-bold">{ts.total_hours.toFixed(1)}h</td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-amber-600">{ts.total_overtime.toFixed(1)}h</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* TAB: SECURITY & SCAN AUDIT LOGS */}
      {activeTab === 'audit' && (
        <div className="space-y-4">
          <Card noPad className="p-3.5 border border-border">
            <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
              <div className="flex gap-2 flex-wrap sm:flex-nowrap">
                <select
                  value={scanLogsStatusFilter}
                  onChange={e => { setScanLogsStatusFilter(e.target.value); setScanLogsPage(1) }}
                  className="border border-border rounded-xl px-3 py-2 text-xs font-semibold text-foreground bg-card cursor-pointer"
                >
                  <option value="All">All Results</option>
                  <option value="SUCCESS">Success Only</option>
                  <option value="FAILED">Failed / Rejected Only</option>
                  <option value="PENDING_PIN">Pending PIN Only</option>
                </select>

                <select
                  value={scanLogsActionFilter}
                  onChange={e => { setScanLogsActionFilter(e.target.value); setScanLogsPage(1) }}
                  className="border border-border rounded-xl px-3 py-2 text-xs font-semibold text-foreground bg-card cursor-pointer"
                >
                  <option value="All">All Event Types</option>
                  <option value="ATTENDANCE_CREATED">ATTENDANCE CREATED</option>
                  <option value="QR_SCAN_SUCCESS">QR SCAN SUCCESS</option>
                  <option value="PIN_VERIFICATION_FAILED">PIN FAILED</option>
                  <option value="UNAUTHORIZED_BRANCH_SCAN">CROSS BRANCH</option>
                  <option value="REVOKED_QR_SCAN">REVOKED QR</option>
                </select>
              </div>

              <div className="text-xs text-muted-foreground">
                Total Audit Entries: <span className="font-bold text-foreground font-mono">{scanLogsTotal}</span>
              </div>
            </div>
          </Card>

          <Card noPad className="border border-border overflow-hidden">
            {scanLogsLoading ? (
              <TableSkeleton rows={6} cols={7} />
            ) : scanLogs.length === 0 ? (
              <EmptyState
                icon={<FiShield className="w-12 h-12 text-muted-foreground/30 mx-auto" />}
                title="No scan logs recorded yet"
                description="Live scans from the QR terminal and PIN verification attempts will be audited here."
              />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border bg-muted/50 text-muted-foreground uppercase font-semibold text-[11px]">
                        <th className="py-3 px-4 text-left">Employee</th>
                        <th className="py-3 px-4 text-left">Branch</th>
                        <th className="py-3 px-4 text-left">Action / Event</th>
                        <th className="py-3 px-4 text-center">QR Result</th>
                        <th className="py-3 px-4 text-center">PIN Result</th>
                        <th className="py-3 px-4 text-center">Status</th>
                        <th className="py-3 px-4 text-left">Scanned By</th>
                        <th className="py-3 px-4 text-left">Timestamp</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {scanLogs.map((l, i) => (
                        <tr key={l.id || i} className={`hover:bg-muted/40 transition-colors ${i % 2 === 1 ? 'bg-muted/10' : ''}`}>
                          <td className="py-3 px-4">
                            <div className="font-semibold text-foreground">{l.employee_name}</div>
                            <div className="text-[11px] font-mono text-muted-foreground">{l.employee_code}</div>
                          </td>
                          <td className="py-3 px-4 font-medium text-foreground">{l.branch || 'Main Branch'}</td>
                          <td className="py-3 px-4 font-mono font-bold text-primary">{l.action_type}</td>
                          <td className="py-3 px-4 text-center">
                            {l.qr_verified ? (
                              <span className="text-emerald-500 font-bold">✓ Verified</span>
                            ) : (
                              <span className="text-rose-500 font-bold">✗ Failed</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {l.pin_verified ? (
                              <span className="text-emerald-500 font-bold">✓ Verified</span>
                            ) : l.action_type === 'PIN_VERIFICATION_FAILED' ? (
                              <span className="text-rose-500 font-bold">✗ Failed</span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <Badge
                              variant={
                                l.status === 'SUCCESS'
                                  ? 'success'
                                  : l.status === 'FAILED'
                                  ? 'danger'
                                  : 'warning'
                              }
                            >
                              {l.status}
                            </Badge>
                          </td>
                          <td className="py-3 px-4 text-muted-foreground text-[11px]">{l.scanned_by || 'Store Admin'}</td>
                          <td className="py-3 px-4 font-mono text-muted-foreground text-[11px] whitespace-nowrap">{l.scan_time}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </Card>
        </div>
      )}

      {/* QR ATTENDANCE MONITORING MODAL */}
      <QrMonitoringModal
        open={qrMonitoringOpen}
        isOpen={qrMonitoringOpen}
        onClose={() => setQrMonitoringOpen(false)}
      />
    </div>
  )
}
