import { useState, useEffect, useRef, useMemo } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import {
  FiCamera, FiShield, FiCheckCircle, FiClock, FiRefreshCw, FiUpload,
  FiUser, FiMapPin, FiBriefcase, FiActivity, FiX, FiFileText,
  FiAlertCircle, FiCheck, FiSearch, FiKey, FiLock,
} from 'react-icons/fi'
import { useAuth } from '../context/AuthContext'
import { useRealtimeConnection } from '../context/RealtimeSyncContext'
import { api } from '../lib/api'
import { useRealtimeSync, triggerDataSync, SyncButton } from '../lib/realtimeSync'
import { Btn, Card, StatCard, StatusBadge, showToast } from '../components/ui'

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
  } catch (_) { }
}

const getLocalDateIso = () => {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const formatActionLabel = (action) => {
  const clean = String(action || '').replace(/^ATTENDANCE_/, '').replace(/_/g, ' ').trim()
  return clean || 'ATTENDANCE'
}

const formatScanTimeShort = (value) => {
  if (!value) return '—'
  const str = String(value)
  const parsed = new Date(str.replace(' ', 'T'))
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }
  return str
}

export default function QrScannerPage({ embedded = false }) {
  const { user } = useAuth()
  const { connected: wsConnected } = useRealtimeConnection()
  const isStoreAdmin = Boolean(user && (user.role === 'Store Administrator' || user.role === 'Store Admin'))
  const userBranch = user?.employee?.branch?.name || (typeof user?.employee?.branch === 'string' ? user.employee.branch : '') || 'Assigned Branch'
  const operatorName = user?.employee
    ? `${user.employee.first_name || ''} ${user.employee.last_name || ''}`.trim() || user.username
    : (user?.username || 'Store Administrator')

  const [stationStep, setStationStep] = useState(() => {
    try {
      const saved = sessionStorage.getItem('pace_attendance_station_state')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed.stationStep === 'waiting' && parsed.punchResult?.log_id) {
          return 'waiting'
        }
      }
    } catch (_) { }
    return 'scan'
  })
  const [cameraActive, setCameraActive] = useState(() => {
    try {
      const saved = sessionStorage.getItem('pace_attendance_station_state')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed.stationStep === 'waiting') return false
      }
    } catch (_) { }
    return true
  })
  const [cameraStreaming, setCameraStreaming] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const [cameras, setCameras] = useState([])
  const [selectedCameraId, setSelectedCameraId] = useState('')
  const [manualTokenInput, setManualTokenInput] = useState('')
  const [verifyingQr, setVerifyingQr] = useState(false)

  const [identifiedEmployee, setIdentifiedEmployee] = useState(() => {
    try {
      const saved = sessionStorage.getItem('pace_attendance_station_state')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed.stationStep === 'waiting' && parsed.identifiedEmployee) {
          return parsed.identifiedEmployee
        }
      }
    } catch (_) { }
    return null
  })
  const [scannedQrToken, setScannedQrToken] = useState(() => {
    try {
      const saved = sessionStorage.getItem('pace_attendance_station_state')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed.stationStep === 'waiting' && parsed.scannedQrToken) {
          return parsed.scannedQrToken
        }
      }
    } catch (_) { }
    return ''
  })
  const [punchResult, setPunchResult] = useState(() => {
    try {
      const saved = sessionStorage.getItem('pace_attendance_station_state')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed.stationStep === 'waiting' && parsed.punchResult) {
          return parsed.punchResult
        }
      }
    } catch (_) { }
    return null
  })
  const [countdown, setCountdown] = useState(3)

  const [summary, setSummary] = useState(null)
  const [schedule, setSchedule] = useState({
    labels: {
      time_in: '08:00 AM',
      cutoff: '08:00 AM',
      lunch_out: '12:00 PM',
      lunch_in: '01:00 PM',
      time_out: '05:00 PM',
    },
  })
  const [todayRecords, setTodayRecords] = useState([])
  const [recentScans, setRecentScans] = useState([])
  const [activityTab, setActivityTab] = useState('scans')
  const [activitySearch, setActivitySearch] = useState('')
  const [activityLoading, setActivityLoading] = useState(false)

  const html5QrCodeRef = useRef(null)
  const isScannerRunningRef = useRef(false)
  const isProcessingScan = useRef(false)
  const fileInputRef = useRef(null)
  const countdownTimerRef = useRef(null)
  const isMountedRef = useRef(true)
  const scannerContainerId = 'qr-reader-container'

  const loadTerminalOverview = async (silent = false) => {
    if (!isStoreAdmin) return
    if (!silent) setActivityLoading(true)
    const todayIso = getLocalDateIso()
    try {
      const [dailyRes, logsRes] = await Promise.all([
        api.attendance.getDaily({ date_from: todayIso, date_to: todayIso }, { fresh: true }).catch(() => null),
        api.attendance.getScanLogs({ date: todayIso, page: 1 }, { fresh: true }).catch(() => null),
      ])
      if (!isMountedRef.current) return
      if (dailyRes) {
        setTodayRecords(dailyRes.records || dailyRes.attendance || [])
        if (dailyRes.summary) setSummary(dailyRes.summary)
        if (dailyRes.schedule?.labels) setSchedule(dailyRes.schedule)
      }
      if (logsRes) {
        setRecentScans(logsRes.logs || [])
      }
    } catch (_) {
    } finally {
      if (!silent && isMountedRef.current) setActivityLoading(false)
    }
  }

  useEffect(() => {
    isMountedRef.current = true
    if (isStoreAdmin) {
      loadTerminalOverview(false)
    }
    return () => {
      isMountedRef.current = false
    }
  }, [isStoreAdmin])

  const { sync: syncTerminal, isSyncing: isSyncingTerminal } = useRealtimeSync(
    () => {
      loadTerminalOverview(true)
    },
    [isStoreAdmin],
    { module: 'attendance' }
  )

  const checkCameraPermission = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (window.isSecureContext === false) {
        setCameraError('⚠ INSECURE CONNECTION (HTTP) ⚠\n\nYour browser is blocking camera access because this app is running over HTTP.\n\nTo fix it, restart the terminal/server, reopen the app with the HTTPS URL, and then retry camera access.')
        return false
      }
      setCameraError('Camera API is not supported in this browser. Please ensure you are using HTTPS.')
      return false
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true })
      stream.getTracks().forEach(track => track.stop())
      return true
    } catch (err) {
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

  const stopCamera = async () => {
    if (html5QrCodeRef.current && isScannerRunningRef.current) {
      try {
        await html5QrCodeRef.current.stop()
        html5QrCodeRef.current.clear()
      } catch (_) { }
      isScannerRunningRef.current = false
    }
    if (isMountedRef.current) setCameraStreaming(false)
  }

  const buildAuthModalDetail = (scanRes, forceMode = null) => {
    const emp = scanRes?.employee
    const myEmpId = user?.employee_id || user?.employee?.employee_id
    const isTargetSelf = Boolean(myEmpId && emp?.employee_id && String(myEmpId) === String(emp.employee_id))
    const empFaceImg = emp?.face_biometric_image || scanRes?.face_biometric_image || (isTargetSelf ? user?.face_biometric_image : null)
    const empFaceBase64 = emp?.face_biometric_base64 || scanRes?.face_biometric_base64 || (isTargetSelf ? user?.face_biometric_base64 : null)
    const hasFace = Boolean(empFaceImg)
    return {
      id: scanRes.scan_log_id || scanRes.log_id,
      scan_log_id: scanRes.scan_log_id || scanRes.log_id,
      employee_id: emp?.employee_id,
      employee: emp,
      employee_name: emp?.name,
      employee_code: emp?.employee_code,
      face_biometric_image: empFaceImg,
      face_biometric_base64: empFaceBase64,
      has_registered_face: hasFace,
      initialMode: forceMode || (hasFace ? 'face' : 'pin'),
      scanned_by: {
        user_id: user?.user_id,
        employee: user?.employee || { first_name: 'Store', last_name: 'Admin' },
      },
    }
  }

  const resetStation = () => {
    sessionStorage.removeItem('pace_attendance_station_state')
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current)
    setStationStep('scan')
    setIdentifiedEmployee(null)
    setScannedQrToken('')
    setPunchResult(null)
    setManualTokenInput('')
    setCameraActive(true)
    isProcessingScan.current = false
  }

  const startAutoResetCountdown = () => {
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current)
    setCountdown(3)
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

  const handlePendingScan = async (res, token) => {
    const fullPunchResult = { ...res, log_id: res.scan_log_id }
    setScannedQrToken(token)
    setIdentifiedEmployee(res.employee)
    setPunchResult(fullPunchResult)
    await stopCamera()
    setStationStep('waiting')
    showToast(`Employee Identified: ${res.employee.name}`, 'success')
    loadTerminalOverview(true)

    const myEmpId = user?.employee_id || user?.employee?.employee_id
    const isSelf = Boolean(
      (myEmpId && res.employee?.employee_id && String(myEmpId) === String(res.employee.employee_id)) ||
      (user?.user_id && res.employee?.user_id && String(user.user_id) === String(res.employee.user_id))
    )

    if (isSelf && res.scan_log_id) {
      sessionStorage.setItem('pace_attendance_station_state', JSON.stringify({
        stationStep: 'waiting',
        punchResult: fullPunchResult,
        scannedQrToken: token,
        identifiedEmployee: res.employee,
      }))
      window.dispatchEvent(new CustomEvent('pace:trigger-face-auth', {
        detail: buildAuthModalDetail(res),
      }))
    }
    window.dispatchEvent(new CustomEvent('pace:verifications-sync'))
    const pingPayload = {
      stage: 'pending_verification',
      scan_log_id: res.scan_log_id,
      employee_id: res.employee?.employee_id || null,
      user_id: res.employee?.user_id || null,
      ts: Date.now(),
    }
    try {
      localStorage.setItem('pace_pending_verif_ping', JSON.stringify(pingPayload))
    } catch (_) { }
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        const bc = new BroadcastChannel('pace_attendance_verifications')
        bc.postMessage(pingPayload)
        bc.close()
      }
    } catch (_) { }
  }

  const handleVerifyQr = async (token) => {
    setVerifyingQr(true)
    setCameraError('')
    try {
      const res = await api.attendance.scan({
        qr_token: token,
        device_info: `${navigator.platform} (${navigator.userAgent})`,
      })

      if (res.success && (res.status === 'SUCCESS' || res.action)) {
        playTone('success')
        const actionName = (res.action || '').replace('ATTENDANCE_', '')
        setPunchResult({
          ...res,
          action: actionName,
          time: res.time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          date: res.date || new Date().toLocaleDateString(),
          message: res.message || `✓ ${actionName.replace('_', ' ')} SUCCESSFUL`,
        })
        await stopCamera()
        setStationStep('result')
        startAutoResetCountdown()
        triggerDataSync('attendance')
        loadTerminalOverview(true)
        showToast(res.message || `Attendance Recorded: ${res.employee?.name || 'Employee'}`, 'success')
      } else if (res.success && res.status === 'PENDING') {
        await handlePendingScan(res, token)
      } else {
        playTone('error')
        showToast(res.message || 'Invalid or inactive QR code', 'error')
      }
    } catch (err) {
      playTone('error')
      if (err.status === 423) {
        showToast(err.message || 'Account temporarily locked', 'error')
      } else if (err.status === 403) {
        showToast(err.message || 'Cross-branch scan unauthorized', 'error')
      } else {
        showToast(err.message || 'QR code verification failed', 'error')
      }
      loadTerminalOverview(true)
    } finally {
      setVerifyingQr(false)
    }
  }

  const onQrCodeScanned = async (decodedText) => {
    if (!decodedText || verifyingQr || isProcessingScan.current) return
    isProcessingScan.current = true
    playTone('beep')
    await handleVerifyQr(decodedText.trim())
    isProcessingScan.current = false
  }

  const startCamera = async () => {
    setCameraError('')
    try {
      if (isScannerRunningRef.current) return
      const containerEl = document.getElementById(scannerContainerId)
      if (!containerEl) return

      const hasPermission = await checkCameraPermission()
      if (!hasPermission) return

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
          html5QrCodeRef.current = new Html5Qrcode(scannerContainerId)
        }

        if (!isScannerRunningRef.current) {
          await html5QrCodeRef.current.start(
            cameraId,
            {
              fps: 15,
              qrbox: { width: 240, height: 240 },
              aspectRatio: 1.0,
              disableFlip: false,
            },
            onQrCodeScanned,
            () => { }
          )
          const videoEl = document.querySelector(`#${scannerContainerId} video`)
          if (videoEl) {
            videoEl.style.transform = 'scaleX(-1)'
            videoEl.style.objectFit = 'cover'
          }
          isScannerRunningRef.current = true
          if (isMountedRef.current) setCameraStreaming(true)
        }
      } else {
        setCameraError('No camera found on this device.')
      }
    } catch (_) {
      setCameraError('Unable to start the camera scanner. Please retry or use manual input.')
      isScannerRunningRef.current = false
      if (isMountedRef.current) setCameraStreaming(false)
    }
  }

  useEffect(() => {
    if (!isStoreAdmin) return
    if (stationStep === 'scan' && cameraActive) {
      startCamera()
    } else {
      stopCamera()
    }
    return () => {
      stopCamera()
    }
  }, [stationStep, cameraActive, selectedCameraId, isStoreAdmin])

  useEffect(() => {
    return () => {
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current)
      stopCamera()
    }
  }, [])

  useEffect(() => {
    if (!isStoreAdmin) return
    const handleReturnToQr = async () => {
      sessionStorage.removeItem('pace_attendance_station_state')
      setStationStep('scan')
      setPunchResult(null)
      setScannedQrToken('')
      setIdentifiedEmployee(null)
      setCameraActive(true)
      isProcessingScan.current = false
      try {
        await stopCamera()
      } catch (_) { }
      setTimeout(() => {
        startCamera()
      }, 80)
      loadTerminalOverview(true)
    }
    window.addEventListener('pace:return-to-qr-scan', handleReturnToQr)
    return () => window.removeEventListener('pace:return-to-qr-scan', handleReturnToQr)
  }, [isStoreAdmin])

  useEffect(() => {
    if (stationStep === 'waiting' && punchResult?.log_id) {
      sessionStorage.setItem('pace_attendance_station_state', JSON.stringify({
        stationStep: 'waiting',
        punchResult,
        scannedQrToken,
        identifiedEmployee,
      }))
    } else if (stationStep === 'scan' || stationStep === 'result') {
      sessionStorage.removeItem('pace_attendance_station_state')
    }
  }, [stationStep, punchResult, scannedQrToken, identifiedEmployee])

  useEffect(() => {
    if (!isStoreAdmin || stationStep !== 'waiting' || !punchResult?.log_id) return
    let checkInFlight = false
    let resolved = false
    let fallbackTimer = null
    const targetLogId = Number(punchResult.log_id)

    const clearFallbackTimer = () => {
      if (fallbackTimer) {
        clearTimeout(fallbackTimer)
        fallbackTimer = null
      }
    }

    const completeVerification = (payload = {}) => {
      if (resolved) return
      resolved = true
      clearFallbackTimer()
      sessionStorage.removeItem('pace_attendance_station_state')
      playTone('success')
      const actionName = String(payload.action || '').replace(/^ATTENDANCE_/, '')
      const isPinVerified = payload.verification_type
        ? payload.verification_type === 'PIN'
        : Boolean(payload.log?.pin_verified || payload.face_verified === false)
      setPunchResult(prev => ({
        ...(prev || {}),
        ...payload,
        action: actionName || prev?.available_actions?.[0] || prev?.action || 'ATTENDANCE',
        verification_type: payload.verification_type || (isPinVerified ? 'PIN' : 'FACE_RECOGNITION'),
        face_verified: !isPinVerified,
        time: payload.time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        date: payload.date || getLocalDateIso(),
        message: payload.message || `✓ ${formatActionLabel(actionName || prev?.available_actions?.[0])} SUCCESSFUL`,
      }))
      setStationStep('result')
      startAutoResetCountdown()
      triggerDataSync('attendance')
      loadTerminalOverview(true)
    }

    const rejectVerification = (reason) => {
      if (resolved) return
      resolved = true
      clearFallbackTimer()
      sessionStorage.removeItem('pace_attendance_station_state')
      playTone('error')
      showToast(reason || 'Employee verification failed or rejected.', 'error')
      setStationStep('scan')
      setPunchResult(null)
      setScannedQrToken('')
      setIdentifiedEmployee(null)
      setCameraActive(true)
      startCamera()
      loadTerminalOverview(true)
    }

    const scheduleFallbackCheck = () => {
      clearFallbackTimer()
      if (resolved || wsConnected) return
      fallbackTimer = setTimeout(() => {
        verifyStatusOnce()
      }, 1800)
    }

    const verifyStatusOnce = async () => {
      if (resolved || checkInFlight) return
      checkInFlight = true
      try {
        const res = await api.attendance.checkVerification(targetLogId)
        if (resolved || !res) return
        if (res.status === 'SUCCESS') {
          completeVerification(res)
          return
        }
        if (res.status === 'FAILED' || res.status === 'CANCELLED') {
          rejectVerification(res.log?.failure_reason || 'Employee verification failed or rejected.')
          return
        }
      } catch (_) {
      } finally {
        checkInFlight = false
        if (!resolved && !wsConnected) {
          scheduleFallbackCheck()
        }
      }
    }

    const handleScanBroadcast = (e) => {
      const detail = e?.detail || {}
      if (detail.scan_log_id && Number(detail.scan_log_id) !== targetLogId) return
      if (detail.stage === 'authorized' || detail.status === 'SUCCESS') {
        if (detail.action) {
          completeVerification(detail)
        } else {
          verifyStatusOnce()
        }
      } else if (detail.stage === 'rejected' || detail.status === 'FAILED' || detail.status === 'CANCELLED') {
        rejectVerification(detail.failure_reason || 'Employee verification failed or rejected.')
      }
    }

    const handleAttendanceSync = () => {
      verifyStatusOnce()
    }

    const handleVisibilityOrFocus = () => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        verifyStatusOnce()
      }
    }

    const handleStoragePing = (e) => {
      if (e.key !== 'pace_pending_verif_ping' || !e.newValue) return
      try {
        const msg = JSON.parse(e.newValue)
        if (msg?.scan_log_id && Number(msg.scan_log_id) !== targetLogId) return
        if (msg?.stage === 'authorized' || msg?.status === 'SUCCESS') {
          if (msg.action) {
            completeVerification(msg)
          } else {
            verifyStatusOnce()
          }
        } else if (msg?.stage === 'rejected' || msg?.status === 'FAILED' || msg?.status === 'CANCELLED') {
          rejectVerification(msg.failure_reason || 'Employee verification failed or rejected.')
        }
      } catch (_) { }
    }

    let bc = null
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        bc = new BroadcastChannel('pace_attendance_verifications')
        bc.onmessage = (ev) => {
          const msg = ev?.data
          if (!msg || (msg.scan_log_id && Number(msg.scan_log_id) !== targetLogId)) return
          if (msg.stage === 'authorized' || msg.status === 'SUCCESS') {
            if (msg.action) {
              completeVerification(msg)
            } else {
              verifyStatusOnce()
            }
          } else if (msg.stage === 'rejected' || msg.status === 'FAILED' || msg.status === 'CANCELLED') {
            rejectVerification(msg.failure_reason || 'Employee verification failed or rejected.')
          }
        }
      }
    } catch (_) { }

    window.addEventListener('pace:attendance-scan-update', handleScanBroadcast)
    window.addEventListener('pace:sync:attendance', handleAttendanceSync)
    window.addEventListener('pace:data-sync', handleAttendanceSync)
    window.addEventListener('storage', handleStoragePing)
    window.addEventListener('focus', handleVisibilityOrFocus)
    document.addEventListener('visibilitychange', handleVisibilityOrFocus)
    verifyStatusOnce()

    return () => {
      resolved = true
      clearFallbackTimer()
      if (bc) {
        try { bc.close() } catch (_) { }
      }
      window.removeEventListener('pace:attendance-scan-update', handleScanBroadcast)
      window.removeEventListener('pace:sync:attendance', handleAttendanceSync)
      window.removeEventListener('pace:data-sync', handleAttendanceSync)
      window.removeEventListener('storage', handleStoragePing)
      window.removeEventListener('focus', handleVisibilityOrFocus)
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus)
    }
  }, [isStoreAdmin, stationStep, punchResult?.log_id, wsConnected])

  const handleCancelWaiting = async () => {
    sessionStorage.removeItem('pace_attendance_station_state')
    const logId = punchResult?.log_id
    if (logId) {
      try {
        await api.attendance.rejectVerification({
          scan_log_id: logId,
          reason: 'Attendance authorization cancelled by Store Administrator.',
        })
      } catch (_) { }
    }
    setStationStep('scan')
    setPunchResult(null)
    setScannedQrToken('')
    setIdentifiedEmployee(null)
    setCameraActive(true)
    isProcessingScan.current = false
    try {
      await stopCamera()
    } catch (_) { }
    setTimeout(() => {
      startCamera()
    }, 80)
    loadTerminalOverview(true)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('pace:return-to-qr-scan', {
        detail: { authorized: false, cancelled: true, requestId: logId },
      }))
      window.dispatchEvent(new CustomEvent('pace:verifications-sync'))
      const cancelPing = {
        stage: 'rejected',
        status: 'FAILED',
        scan_log_id: logId,
        failure_reason: 'Attendance authorization cancelled by Store Administrator.',
        ts: Date.now(),
      }
      try {
        localStorage.setItem('pace_pending_verif_ping', JSON.stringify(cancelPing))
      } catch (_) { }
      try {
        if (typeof BroadcastChannel !== 'undefined') {
          const bc = new BroadcastChannel('pace_attendance_verifications')
          bc.postMessage(cancelPing)
          bc.close()
        }
      } catch (_) { }
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

    setVerifyingQr(true)
    setCameraError('')

    try {
      const formData = new FormData()
      formData.append('qr_image', file)
      formData.append('device_info', `${navigator.platform} (${navigator.userAgent})`)

      const res = await api.attendance.scanImage(formData)

      if (res.success && (res.status === 'SUCCESS' || res.action)) {
        playTone('success')
        const actionName = (res.action || '').replace('ATTENDANCE_', '')
        setPunchResult({
          ...res,
          action: actionName,
          time: res.time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          date: res.date || new Date().toLocaleDateString(),
          message: res.message || `✓ ${actionName.replace('_', ' ')} SUCCESSFUL`,
        })
        await stopCamera()
        setStationStep('result')
        startAutoResetCountdown()
        triggerDataSync('attendance')
        loadTerminalOverview(true)
        showToast(res.message || `Attendance Recorded: ${res.employee?.name || 'Employee'}`, 'success')
      } else if (res.success && res.status === 'PENDING') {
        await handlePendingScan(res, res.qr_token || 'IMAGE_SCANNED')
      } else {
        playTone('error')
        showToast(res.message || 'Invalid or inactive QR code', 'error')
      }
    } catch (err) {
      playTone('error')
      if (err.status === 423) {
        showToast(err.message || 'Account temporarily locked', 'error')
      } else if (err.status === 403) {
        showToast(err.message || 'Cross-branch scan unauthorized', 'error')
      } else {
        showToast(err.message || 'Could not decode QR code from the uploaded image.', 'error')
      }
      loadTerminalOverview(true)
    } finally {
      setVerifyingQr(false)
      e.target.value = ''
    }
  }

  const filteredScans = useMemo(() => {
    const q = activitySearch.trim().toLowerCase()
    if (!q) return recentScans
    return recentScans.filter(l =>
      String(l.employee_name || '').toLowerCase().includes(q) ||
      String(l.employee_code || '').toLowerCase().includes(q) ||
      String(l.action_type || '').toLowerCase().includes(q) ||
      String(l.status || '').toLowerCase().includes(q)
    )
  }, [recentScans, activitySearch])

  const filteredRecords = useMemo(() => {
    const q = activitySearch.trim().toLowerCase()
    if (!q) return todayRecords
    return todayRecords.filter(r =>
      String(r.employee_name || '').toLowerCase().includes(q) ||
      String(r.employee_code || '').toLowerCase().includes(q) ||
      String(r.department || '').toLowerCase().includes(q) ||
      String(r.status || '').toLowerCase().includes(q)
    )
  }, [todayRecords, activitySearch])

  const currentStepNumber = stationStep === 'scan' ? 1 : stationStep === 'waiting' ? 2 : 3
  const activeEmployee = punchResult?.employee || identifiedEmployee
  const nextPunchAction = punchResult?.available_actions?.[0] || punchResult?.action || ''
  const hasRegisteredFace = Boolean(
    activeEmployee?.has_registered_face ||
    activeEmployee?.face_biometric_image ||
    punchResult?.has_registered_face ||
    punchResult?.face_biometric_image
  )
  const employeeAvatarSrc = activeEmployee?.face_biometric_base64 || activeEmployee?.face_biometric_image || punchResult?.face_biometric_base64 || punchResult?.face_biometric_image || null
  const employeeInitials = String(activeEmployee?.name || 'EM')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(p => p[0]?.toUpperCase() || '')
    .join('')

  if (!isStoreAdmin) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-500 text-4xl mb-4 shadow-lg shadow-rose-500/10">
          <FiShield />
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-2">403 FORBIDDEN</h1>
        <p className="text-muted-foreground max-w-md mb-6 text-sm">
          Unauthorized access. The Attendance QR Scanner is strictly reserved for authorized Store Administrators.
        </p>
        <div className="px-4 py-2 rounded-xl bg-card border border-border text-xs text-muted-foreground">
          Current Role: <span className="font-semibold text-amber-600 dark:text-amber-400">{user?.role || 'Guest'}</span>
        </div>
      </div>
    )
  }

  return (
    <div className={embedded ? 'space-y-6' : 'max-w-7xl mx-auto space-y-5 pb-12'}>
      {!embedded && (
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-border pb-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-primary text-[11px] font-bold uppercase tracking-wider">
                <FiShield className="w-3.5 h-3.5" /> STORE ADMINISTRATOR TERMINAL
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/25">
                <FiMapPin className="w-3 h-3" /> {userBranch}
              </span>
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${stationStep === 'scan' && cameraStreaming
                ? 'bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/25'
                : stationStep === 'waiting'
                  ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/25'
                  : stationStep === 'result'
                    ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/25'
                    : 'bg-muted text-muted-foreground border-border'
                }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${stationStep === 'scan' && cameraStreaming
                  ? 'bg-sky-500 animate-pulse'
                  : stationStep === 'waiting'
                    ? 'bg-amber-500 animate-ping'
                    : stationStep === 'result'
                      ? 'bg-emerald-500'
                      : 'bg-slate-400'
                  }`} />
                {stationStep === 'scan'
                  ? (cameraStreaming ? 'Scanner Live' : 'Scanner Standby')
                  : stationStep === 'waiting'
                    ? 'Awaiting Employee Auth'
                    : 'Punch Verified'}
              </span>
            </div>
            <h1 className="text-2xl font-bold text-foreground">QR Attendance Terminal</h1>
            <p className="text-xs text-muted-foreground">
              Two-factor attendance capture (Permanent QR Badge + Biometric Face ID / Personal PIN) • Operator: <span className="font-semibold text-foreground">{operatorName}</span>
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <SyncButton sync={syncTerminal} isSyncing={isSyncingTerminal} label="Sync" />
            {stationStep !== 'scan' && (
              <Btn
                variant="primary"
                size="sm"
                onClick={stationStep === 'waiting' ? handleCancelWaiting : resetStation}
                icon={<FiRefreshCw className="w-3.5 h-3.5" />}
              >
                Reset / Scan New
              </Btn>
            )}
          </div>
        </div>
      )}

      {/* Daily Branch Summary Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          title="Present Today"
          value={summary?.present?.toString() || '0'}
          sub="verified branch punches"
          icon={<FiCheckCircle className="w-5 h-5 text-emerald-500" />}
          color="green"
        />
        <StatCard
          title="Late Arrivals"
          value={summary?.late?.toString() || '0'}
          sub={`after ${schedule.labels?.cutoff || '08:00 AM'} cutoff`}
          icon={<FiClock className="w-5 h-5 text-amber-500" />}
          color="yellow"
        />
        <StatCard
          title="Absences"
          value={summary?.absent?.toString() || '0'}
          sub="unrecorded attendance"
          icon={<FiX className="w-5 h-5 text-rose-500" />}
          color="red"
        />
        <StatCard
          title="Half Day / Leave"
          value={summary?.half_day?.toString() || '0'}
          sub="partial shift entries"
          icon={<FiFileText className="w-5 h-5 text-blue-500" />}
          color="blue"
        />
      </div>

      {/* Official Work Schedule Reference */}
      <Card noPad className="border border-border overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border bg-muted/40 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <FiClock className="w-4 h-4 text-primary" />
            <span className="text-xs font-bold uppercase tracking-wider text-foreground">Official Branch Work Schedule</span>
          </div>
          <span className="text-[11px] text-muted-foreground font-medium">
            Auto-detects Time In, Lunch Out, Lunch In &amp; Time Out
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-border text-center">
          {[
            { key: 'time_in', label: 'Time In', color: 'text-emerald-600 dark:text-emerald-400', note: 'Shift start' },
            { key: 'lunch_out', label: 'Lunch Out', color: 'text-amber-600 dark:text-amber-400', note: 'Break start' },
            { key: 'lunch_in', label: 'Lunch In', color: 'text-amber-600 dark:text-amber-400', note: 'Break end' },
            { key: 'time_out', label: 'Time Out', color: 'text-indigo-600 dark:text-indigo-400', note: 'Shift end' },
          ].map(s => (
            <div key={s.key} className="py-3 px-2">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{s.label}</div>
              <div className={`font-mono font-bold text-sm mt-0.5 ${s.color}`}>{schedule.labels?.[s.key]}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">{s.note}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* 3-Step Verification Progress Bar */}
      <Card noPad className="p-3.5 border border-border">
        <div className="grid grid-cols-3 gap-2 sm:gap-4">
          {[
            { num: 1, title: 'Scan QR Badge', desc: 'Camera, token, or image' },
            { num: 2, title: 'Employee Verification', desc: 'Face ID or personal PIN' },
            { num: 3, title: 'Attendance Recorded', desc: 'Synced to branch logs' },
          ].map(stepItem => {
            const isDone = currentStepNumber > stepItem.num
            const isCurrent = currentStepNumber === stepItem.num
            return (
              <div
                key={stepItem.num}
                className={`flex items-center gap-2.5 p-2.5 rounded-xl border transition-all ${isCurrent
                  ? 'bg-primary/10 border-primary/40 text-foreground shadow-xs'
                  : isDone
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-foreground'
                    : 'bg-muted/30 border-border text-muted-foreground'
                  }`}
              >
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black shrink-0 ${isDone
                  ? 'bg-emerald-500 text-white'
                  : isCurrent
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground border border-border'
                  }`}>
                  {isDone ? <FiCheck className="w-4 h-4" /> : stepItem.num}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold truncate">{stepItem.title}</div>
                  <div className="text-[10px] text-muted-foreground truncate hidden sm:block">{stepItem.desc}</div>
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      {/* Main 2-Column Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Column: QR Scanner / Waiting / Verified Receipt */}
        <div className="lg:col-span-7 space-y-5">
          {stationStep === 'scan' && (
            <Card className="p-6 border border-border shadow-xl space-y-5">
              <div className="flex items-start justify-between gap-3 border-b border-border pb-4">
                <div>
                  <span className="text-[10px] uppercase font-bold tracking-wider text-primary">
                    Store Administrator Attendance Terminal • Step 1 of 3
                  </span>
                  <h2 className="text-lg font-bold text-foreground mt-0.5">Scan Employee QR Code</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Position the employee&apos;s permanent attendance QR badge inside the frame, scan via barcode reader, or upload a QR image.
                  </p>
                </div>
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-muted text-[11px] font-semibold text-foreground border border-border shrink-0">
                  <FiCamera className="w-3.5 h-3.5 text-primary" />
                  {cameras.length > 0 ? `${cameras.length} Cam` : 'Auto'}
                </span>
              </div>

              {cameraError && (
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs font-semibold text-center mx-auto max-w-md space-y-3">
                  <div className="flex items-center justify-center gap-1.5 text-sm font-bold">
                    <FiAlertCircle className="w-4 h-4" /> Camera Unavailable
                  </div>
                  <div className="whitespace-pre-line font-normal">{cameraError}</div>
                  <div className="flex items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={startCamera}
                      className="px-4 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-700 dark:text-amber-300 rounded-lg transition-colors flex items-center gap-2 cursor-pointer"
                    >
                      <FiRefreshCw className="w-3.5 h-3.5" />
                      Retry Camera
                    </button>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-4 py-2 bg-primary/20 hover:bg-primary/30 text-primary rounded-lg transition-colors flex items-center gap-2 cursor-pointer"
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

              <div className="w-full max-w-sm mx-auto aspect-square bg-slate-950 rounded-2xl border-2 border-slate-700 overflow-hidden relative shadow-2xl flex items-center justify-center">
                <div
                  id={scannerContainerId}
                  className="w-full h-full [&_video]:-scale-x-100! [&_video]:object-cover [&_#qr-shaded-region>div]:hidden"
                />

                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <div className="w-60 h-60 border-2 border-primary/80 rounded-2xl relative animate-pulse shadow-lg shadow-primary/20">
                    <div className="absolute -top-0.5 -left-0.5 w-6 h-6 border-t-4 border-l-4 border-primary rounded-tl-xl" />
                    <div className="absolute -top-0.5 -right-0.5 w-6 h-6 border-t-4 border-r-4 border-primary rounded-tr-xl" />
                    <div className="absolute -bottom-0.5 -left-0.5 w-6 h-6 border-b-4 border-l-4 border-primary rounded-bl-xl" />
                    <div className="absolute -bottom-0.5 -right-0.5 w-6 h-6 border-b-4 border-r-4 border-primary rounded-br-xl" />
                  </div>
                </div>

                {verifyingQr && (
                  <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-xs flex flex-col items-center justify-center text-primary gap-2 z-20">
                    <FiRefreshCw className="animate-spin text-3xl" />
                    <span className="text-xs font-bold text-white">Verifying Employee QR...</span>
                  </div>
                )}
              </div>

              {cameras.length > 1 && !cameraError && (
                <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                  <FiCamera className="w-3.5 h-3.5" />
                  <span>Active Camera:</span>
                  <select
                    value={selectedCameraId}
                    onChange={(e) => setSelectedCameraId(e.target.value)}
                    className="bg-card border border-border rounded-lg px-2.5 py-1 text-xs outline-none text-foreground font-semibold cursor-pointer"
                  >
                    {cameras.map(c => (
                      <option key={c.id} value={c.id}>{c.label || `Camera ${c.id.slice(0, 5)}`}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="pt-2 border-t border-border space-y-2">
                <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <FiKey className="w-3.5 h-3.5 text-primary" /> Manual Token / Hardware Scanner or Image Upload
                  </span>
                </div>
                <form onSubmit={handleManualTokenSubmit} className="flex flex-wrap sm:flex-nowrap gap-2">
                  <input
                    type="text"
                    value={manualTokenInput}
                    onChange={e => setManualTokenInput(e.target.value)}
                    placeholder="Scan or paste employee QR token..."
                    className="flex-1 min-w-0 px-3 py-2 rounded-xl border border-border bg-muted/30 text-foreground font-mono text-xs focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
                  />
                  <Btn type="submit" size="sm" variant="primary" disabled={verifyingQr || !manualTokenInput.trim()}>
                    Scan Token
                  </Btn>

                  <label className="flex items-center justify-center px-3 py-2 rounded-xl bg-muted hover:bg-muted/80 text-foreground cursor-pointer transition-colors border border-border shadow-xs shrink-0">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleFileUpload}
                      disabled={verifyingQr}
                    />
                    <FiUpload className="w-3.5 h-3.5 text-primary" />
                    <span className="ml-1.5 text-xs font-bold">Upload Image</span>
                  </label>
                </form>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-border text-[11px]">
                <div className="p-2.5 rounded-xl bg-muted/30 border border-border">
                  <div className="text-[10px] font-bold uppercase text-muted-foreground">Branch Lock</div>
                  <div className="font-semibold text-emerald-600 dark:text-emerald-400 truncate mt-0.5">{userBranch}</div>
                </div>
                <div className="p-2.5 rounded-xl bg-muted/30 border border-border">
                  <div className="text-[10px] font-bold uppercase text-muted-foreground">Security Mode</div>
                  <div className="font-semibold text-foreground truncate mt-0.5">QR + Face ID / PIN</div>
                </div>
                <div className="p-2.5 rounded-xl bg-muted/30 border border-border">
                  <div className="text-[10px] font-bold uppercase text-muted-foreground">Terminal Operator</div>
                  <div className="font-semibold text-foreground truncate mt-0.5">{operatorName}</div>
                </div>
              </div>
            </Card>
          )}

          {stationStep === 'waiting' && punchResult && (
            <Card className="p-6 border border-border shadow-xl space-y-5 animate-fadeIn">
              <div className="flex items-start justify-between gap-3 border-b border-border pb-4">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                    Step 1 Complete ✓ • Step 2 of 3
                  </span>
                  <h2 className="text-lg font-black text-foreground uppercase mt-0.5">
                    Waiting for Employee Verification
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    QR badge verified. Confirm identity via Face ID or personal PIN on the employee&apos;s device or this terminal.
                  </p>
                </div>
                <div className="w-11 h-11 rounded-2xl bg-primary/15 text-primary border border-primary/30 flex items-center justify-center text-xl shrink-0">
                  <FiRefreshCw className="animate-spin" />
                </div>
              </div>

              {/* Full Employee Identification Details */}
              <div className="p-4 rounded-2xl bg-muted/30 border border-border space-y-4">
                <div className="flex items-center gap-3.5">
                  <div className="w-14 h-14 rounded-2xl bg-primary/10 border-2 border-primary/30 flex items-center justify-center text-primary font-black text-lg overflow-hidden shrink-0">
                    {employeeAvatarSrc ? (
                      <img src={employeeAvatarSrc} alt={activeEmployee?.name || 'Employee'} className="w-full h-full object-cover" />
                    ) : (
                      <span>{employeeInitials}</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-bold text-foreground truncate">{activeEmployee?.name || 'Employee'}</h3>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
                        <FiCheckCircle className="w-3 h-3" /> QR VERIFIED
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mt-1 text-xs">
                      <span className="font-mono font-bold text-primary">{activeEmployee?.employee_code || 'N/A'}</span>
                      {nextPunchAction && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-primary text-primary-foreground text-[10px] font-black uppercase tracking-wider">
                          Next Punch: {formatActionLabel(nextPunchAction)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                  <div className="p-2.5 rounded-xl bg-card border border-border">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1">
                      <FiBriefcase className="w-3 h-3" /> Position
                    </span>
                    <span className="font-semibold text-foreground block mt-0.5 truncate">{activeEmployee?.position || '—'}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-card border border-border">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1">
                      <FiUser className="w-3 h-3" /> Department
                    </span>
                    <span className="font-semibold text-foreground block mt-0.5 truncate">{activeEmployee?.department || '—'}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-card border border-border">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1">
                      <FiMapPin className="w-3 h-3" /> Branch
                    </span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400 block mt-0.5 truncate">{activeEmployee?.branch || punchResult.branch || userBranch}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-card border border-border">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1">
                      <FiLock className="w-3 h-3" /> Biometrics
                    </span>
                    <span className={`font-semibold block mt-0.5 truncate ${hasRegisteredFace ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                      {hasRegisteredFace ? 'Face ID + PIN' : 'PIN Only'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-primary/5 border border-primary/20 flex items-center justify-between gap-3 text-xs">
                <div className="space-y-0.5">
                  <div className="font-bold text-foreground">Live Verification Request Sent</div>
                  <div className="text-muted-foreground">
                    Scan Reference <span className="font-mono font-bold text-primary">#{punchResult.log_id || punchResult.scan_log_id}</span> • Listening in real time for employee confirmation
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30 shrink-0">
                  PENDING
                </span>
              </div>

              <div className="space-y-2.5 pt-1">
                <Btn
                  variant="primary"
                  size="lg"
                  className="w-full flex items-center justify-center gap-2 font-bold"
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent('pace:trigger-face-auth', {
                      detail: buildAuthModalDetail(punchResult, 'face'),
                    }))
                  }}
                  icon={<FiCheckCircle className="w-4 h-4 text-emerald-300" />}
                >
                  Open Attendance Authorization (Face ID)
                </Btn>

                <Btn variant="outline" size="md" className="w-full" onClick={handleCancelWaiting} icon={<FiCamera />}>
                  Cancel &amp; Scan Next Employee
                </Btn>
              </div>
            </Card>
          )}

          {stationStep === 'result' && punchResult && (
            <Card className="p-6 sm:p-8 border border-border shadow-xl space-y-6 animate-fadeIn">
              <div className="text-center space-y-2">
                <div className="w-16 h-16 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-2 border-emerald-500/40 flex items-center justify-center mx-auto text-3xl shadow-lg">
                  <FiCheckCircle />
                </div>
                <span className="inline-block text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  Step 3 of 3 • Verification Complete
                </span>
                <h2 className="text-xl font-black text-emerald-600 dark:text-emerald-400 uppercase">
                  {punchResult.action
                    ? `✓ ${formatActionLabel(punchResult.action)} SUCCESSFUL`
                    : '✓ ATTENDANCE VERIFIED'}
                </h2>
                <p className="text-xs text-muted-foreground max-w-md mx-auto">
                  {punchResult.message}
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-muted/30 border border-border text-xs space-y-2.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground pb-1 border-b border-border">
                  Attendance Verification Receipt
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                  <div className="flex justify-between py-1 border-b border-border/70">
                    <span className="text-muted-foreground">Employee:</span>
                    <span className="font-bold text-foreground">{activeEmployee?.name || 'Employee'}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/70">
                    <span className="text-muted-foreground">Employee Code:</span>
                    <span className="font-mono font-bold text-primary">{activeEmployee?.employee_code || '—'}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/70">
                    <span className="text-muted-foreground">Department:</span>
                    <span className="font-semibold text-foreground">{activeEmployee?.department || '—'}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/70">
                    <span className="text-muted-foreground">Position:</span>
                    <span className="font-semibold text-foreground">{activeEmployee?.position || '—'}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/70">
                    <span className="text-muted-foreground">Action Type:</span>
                    <span className="font-bold text-primary uppercase">{formatActionLabel(punchResult.action)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/70">
                    <span className="text-muted-foreground">Timestamp:</span>
                    <span className="font-mono font-bold text-foreground">{punchResult.time}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/70">
                    <span className="text-muted-foreground">Date:</span>
                    <span className="font-mono font-semibold text-foreground">{punchResult.date || getLocalDateIso()}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/70">
                    <span className="text-muted-foreground">Authorized Branch:</span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                      {punchResult.branch?.name || (typeof punchResult.branch === 'string' ? punchResult.branch : userBranch)}
                    </span>
                  </div>
                  {punchResult.action === 'TIME_OUT' && (
                    <>
                      <div className="flex justify-between py-1 border-b border-border/70">
                        <span className="text-muted-foreground">Total Hours:</span>
                        <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">{punchResult.total_hours ?? '0'} hrs</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-border/70">
                        <span className="text-muted-foreground">Overtime:</span>
                        <span className="font-mono font-bold text-amber-600 dark:text-amber-400">{punchResult.overtime_hours ?? '0'} hrs</span>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between py-1 border-b border-border/70">
                    <span className="text-muted-foreground">Verification Method:</span>
                    <span className="font-bold text-foreground">
                      {punchResult.verification_type === 'FACE_RECOGNITION' || punchResult.face_verified
                        ? 'QR + Biometric Face ID'
                        : 'QR + PIN'}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/70">
                    <span className="text-muted-foreground">Verified By:</span>
                    <span className="font-semibold text-foreground">{operatorName}</span>
                  </div>
                </div>
              </div>

              <div className="pt-1">
                <Btn variant="primary" size="lg" className="w-full" onClick={resetStation} icon={<FiCamera />}>
                  Scan Next Employee ({countdown}s)
                </Btn>
              </div>
            </Card>
          )}
        </div>

        {/* Right Column: Live Today's Activity & Verification Protocol */}
        <div className="lg:col-span-5 space-y-5">
          <Card noPad className="border border-border overflow-hidden">
            <div className="p-4 border-b border-border space-y-3 bg-muted/20">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <FiActivity className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-bold text-foreground">Today&apos;s Terminal Activity</h3>
                </div>
                <span className="text-[11px] font-mono font-semibold text-muted-foreground">
                  {activityTab === 'scans' ? `${recentScans.length} scans` : `${todayRecords.length} staff`}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-muted border border-border text-xs">
                <button
                  type="button"
                  onClick={() => setActivityTab('scans')}
                  className={`py-1.5 px-2.5 rounded-lg font-semibold transition-all cursor-pointer ${activityTab === 'scans'
                    ? 'bg-card text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                    }`}
                >
                  Recent Scans ({recentScans.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActivityTab('punches')}
                  className={`py-1.5 px-2.5 rounded-lg font-semibold transition-all cursor-pointer ${activityTab === 'punches'
                    ? 'bg-card text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                    }`}
                >
                  Today&apos;s Punches ({todayRecords.length})
                </button>
              </div>

              <div className="relative">
                <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  value={activitySearch}
                  onChange={e => setActivitySearch(e.target.value)}
                  placeholder="Filter by employee name, code, status..."
                  className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-border bg-card text-foreground text-xs outline-none focus:border-primary"
                />
              </div>
            </div>

            <div className="divide-y divide-border max-h-[420px] overflow-y-auto">
              {activityLoading ? (
                <div className="p-8 text-center text-xs text-muted-foreground">
                  Loading today&apos;s branch activity...
                </div>
              ) : activityTab === 'scans' ? (
                filteredScans.length === 0 ? (
                  <div className="p-8 text-center space-y-1">
                    <div className="text-xs font-semibold text-foreground">No QR scans logged today</div>
                    <div className="text-[11px] text-muted-foreground">Scanned employee badges will appear here immediately.</div>
                  </div>
                ) : (
                  filteredScans.slice(0, 15).map((log, idx) => (
                    <div key={log.id || idx} className="p-3.5 hover:bg-muted/30 transition-colors space-y-1.5 text-xs">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-bold text-foreground truncate">{log.employee_name || 'Unidentified'}</div>
                          <div className="text-[11px] text-muted-foreground font-mono">
                            {log.employee_code || 'N/A'} • {log.department || '—'}
                          </div>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border shrink-0 ${log.status === 'SUCCESS'
                          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30'
                          : log.status === 'PENDING'
                            ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30'
                            : 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/30'
                          }`}>
                          {log.status || 'UNKNOWN'}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-1.5 text-[11px]">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="px-2 py-0.5 rounded-md bg-primary/10 text-primary font-bold text-[10px]">
                            {formatActionLabel(log.action_type)}
                          </span>
                          {log.verification_method && (
                            <span className="px-2 py-0.5 rounded-md bg-muted text-muted-foreground font-medium text-[10px] border border-border">
                              {log.verification_method}
                            </span>
                          )}
                        </div>
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {formatScanTimeShort(log.scan_time)}
                        </span>
                      </div>

                      {log.failure_reason && (
                        <div className="text-[11px] text-rose-600 dark:text-rose-400 bg-rose-500/5 border border-rose-500/20 rounded-lg px-2.5 py-1">
                          {log.failure_reason}
                        </div>
                      )}
                    </div>
                  ))
                )
              ) : filteredRecords.length === 0 ? (
                <div className="p-8 text-center space-y-1">
                  <div className="text-xs font-semibold text-foreground">No daily punches recorded today</div>
                  <div className="text-[11px] text-muted-foreground">Completed attendance punches will populate automatically.</div>
                </div>
              ) : (
                filteredRecords.slice(0, 15).map((rec, idx) => (
                  <div key={rec.attendance_id || rec.id || idx} className="p-3.5 hover:bg-muted/30 transition-colors space-y-2 text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-bold text-foreground truncate">{rec.employee_name || 'Employee'}</div>
                        <div className="text-[11px] text-muted-foreground font-mono">
                          {rec.employee_code || '—'} • {rec.department || '—'}
                        </div>
                      </div>
                      <StatusBadge status={rec.status || 'Present'} />
                    </div>
                    <div className="grid grid-cols-4 gap-1.5 text-center text-[10px]">
                      <div className="p-1.5 rounded-lg bg-muted/40 border border-border">
                        <div className="text-muted-foreground font-semibold">IN</div>
                        <div className="font-mono font-bold text-emerald-600 dark:text-emerald-400">{rec.time_in || '—'}</div>
                      </div>
                      <div className="p-1.5 rounded-lg bg-muted/40 border border-border">
                        <div className="text-muted-foreground font-semibold">L-OUT</div>
                        <div className="font-mono font-bold text-amber-600 dark:text-amber-400">{rec.lunch_out || '—'}</div>
                      </div>
                      <div className="p-1.5 rounded-lg bg-muted/40 border border-border">
                        <div className="text-muted-foreground font-semibold">L-IN</div>
                        <div className="font-mono font-bold text-amber-600 dark:text-amber-400">{rec.lunch_in || '—'}</div>
                      </div>
                      <div className="p-1.5 rounded-lg bg-muted/40 border border-border">
                        <div className="text-muted-foreground font-semibold">OUT</div>
                        <div className="font-mono font-bold text-indigo-600 dark:text-indigo-400">{rec.time_out || '—'}</div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>

          {/* Terminal Verification Guidelines */}
          <Card className="p-4 border border-border space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-foreground">
              <FiShield className="w-4 h-4 text-primary" /> Terminal Verification Protocol
            </div>
            <div className="space-y-2 text-xs text-muted-foreground">
              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-md bg-primary/10 text-primary font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">1</span>
                <span>Only active employees assigned to <strong className="text-foreground">{userBranch}</strong> are accepted on this terminal. Cross-branch QR scans are blocked and logged.</span>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-md bg-primary/10 text-primary font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">2</span>
                <span>After scanning, employees complete second-factor confirmation via <strong className="text-foreground">Biometric Face ID</strong> or their <strong className="text-foreground">Personal PIN</strong> on their device or this terminal.</span>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-md bg-primary/10 text-primary font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">3</span>
                <span>Every verified punch automatically calculates shift status, late cutoff, working hours, and overtime in real time.</span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
