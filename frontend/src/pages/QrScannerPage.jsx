import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Html5Qrcode } from 'html5-qrcode'
import {
  FiCamera, FiShield, FiUser, FiCheckCircle, FiAlertCircle,
  FiLock, FiClock, FiMapPin, FiRefreshCw, FiArrowRight,
  FiXCircle, FiSliders, FiEye, FiEyeOff, FiKey, FiSmartphone,
  FiCheck, FiX
} from 'react-icons/fi'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import { triggerDataSync } from '../lib/realtimeSync'
import { Btn, Card, Badge, StatusBadge, showToast } from '../components/ui'

// Web Audio API feedback
const playSound = (type) => {
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
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4)
      osc.start()
      osc.stop(ctx.currentTime + 0.4)
    } else if (type === 'error') {
      osc.type = 'sawtooth'
      osc.frequency.setValueAtTime(220, ctx.currentTime)
      gain.gain.setValueAtTime(0.2, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3)
      osc.start()
      osc.stop(ctx.currentTime + 0.3)
    }
  } catch (e) {}
}

export default function QrScannerPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const isStoreAdmin = user && (user.role === 'Store Administrator' || user.role === 'Store Admin')
  const userBranch = user?.employee?.branch?.name || (typeof user?.employee?.branch === 'string' ? user.employee.branch : '') || 'Assigned Branch'

  // Scanner state
  const [cameraActive, setCameraActive] = useState(false)
  const [cameras, setCameras] = useState([])
  const [selectedCamera, setSelectedCamera] = useState('')
  const [manualToken, setManualToken] = useState('')

  // Flow step: 'scan' | 'pin' | 'confirm_action' | 'result'
  const [step, setStep] = useState('scan')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Identified employee data from Step 1
  const [identifiedEmp, setIdentifiedEmp] = useState(null)
  const [scannedToken, setScannedToken] = useState('')
  const [availableActions, setAvailableActions] = useState([])

  // PIN pad state
  const [pin, setPin] = useState('')
  const [showPin, setShowPin] = useState(false)
  const [pinError, setPinError] = useState('')

  // Result data
  const [resultData, setResultData] = useState(null)
  const [autoResetSeconds, setAutoResetSeconds] = useState(8)

  const html5QrCodeRef = useRef(null)
  const scannerContainerId = 'qr-terminal-camera-box'
  const resetTimerRef = useRef(null)
  const isProcessingScan = useRef(false) // Debouncing lock

  // Real-time Clock
  const [currentTime, setCurrentTime] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date())
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  // STRICT ACCESS RESTRICTION: Non-store-admin gets 403 Forbidden screen
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

  // Camera enumeration
  useEffect(() => {
    Html5Qrcode.getCameras()
      .then(devices => {
        if (devices && devices.length) {
          setCameras(devices)
          const backCam = devices.find(d => 
            d.label.toLowerCase().includes('back') || 
            d.label.toLowerCase().includes('rear') || 
            d.label.toLowerCase().includes('environment')
          )
          setSelectedCamera(backCam ? backCam.id : devices[0].id)
        }
      })
      .catch(err => {
        console.warn('Unable to enumerate cameras:', err)
      })

    return () => {
      stopCamera()
    }
  }, [])

  // Auto-start camera when on 'scan' step
  useEffect(() => {
    if (step === 'scan') {
      startCamera(selectedCamera)
    } else {
      stopCamera()
    }

    return () => {
      stopCamera()
    }
  }, [step, selectedCamera])

  const startCamera = async (cameraId) => {
    setError('')
    try {
      if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
        await html5QrCodeRef.current.stop()
      }

      const qrScanner = new Html5Qrcode(scannerContainerId)
      html5QrCodeRef.current = qrScanner

      const config = {
        fps: 15,
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0,
        disableFlip: false,
      }

      await qrScanner.start(
        cameraId || { facingMode: 'environment' },
        config,
        (decodedText) => {
          handleQrScanned(decodedText)
        },
        () => {}
      )

      const videoEl = document.querySelector(`#${scannerContainerId} video`)
      if (videoEl) {
        videoEl.style.transform = 'scaleX(-1)'
        videoEl.style.objectFit = 'cover'
      }

      setCameraActive(true)
    } catch (err) {
      console.warn('Failed to start camera:', err)
      setCameraActive(false)
    }
  }

  const stopCamera = async () => {
    if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
      try {
        await html5QrCodeRef.current.stop()
        await html5QrCodeRef.current.clear()
      } catch (err) {}
    }
    setCameraActive(false)
  }

  // Handle scanned QR token
  const handleQrScanned = async (token) => {
    if (loading || !token || isProcessingScan.current) return
    
    // Lock the scanner immediately
    isProcessingScan.current = true
    
    const cleanToken = token.trim()
    playSound('beep')
    setScannedToken(cleanToken)
    await stopCamera()

    setLoading(true)
    setError('')
    try {
      const res = await api.attendance.scan({
        qr_token: cleanToken,
        device_info: `${navigator.platform} (${navigator.userAgent})`,
      })

      if (res.success && (res.status === 'SUCCESS' || res.action)) {
        playSound('success')
        const actionName = (res.action || '').replace('ATTENDANCE_', '')
        setPunchResult({
          ...res,
          action: actionName,
          time: res.time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          date: res.date || new Date().toLocaleDateString(),
        })
        setStep('result')
        triggerDataSync('attendance')
        showToast(res.message || `Attendance Recorded: ${res.employee?.name || 'Employee'}`, 'success')
      } else if (res.success && res.employee) {
        setIdentifiedEmp(res.employee)
        setAvailableActions(res.available_actions || [])
        setStep('pin')
        setPin('')
        setPinError('')
        showToast(`Employee Identified: ${res.employee.name}`, 'success')

        const isSelf = (user?.employee_id && String(user.employee_id) === String(res.employee.employee_id))
          || (user?.employee?.employee_id && String(user.employee.employee_id) === String(res.employee.employee_id))
          || (user?.user_id && String(user.user_id) === String(res.employee.user_id))
          || (user?.role && (user.role.includes('Store Admin') || user.role.includes('Store Administrator')) && (res.employee?.position?.includes('Manager') || res.employee?.position?.includes('Store Admin') || String(user.branch_id) === String(res.employee?.branch_id)))

        if (isSelf && res.scan_log_id) {
          sessionStorage.setItem('pace_attendance_station_state', JSON.stringify({
            stationStep: 'waiting',
            punchResult: { ...res, log_id: res.scan_log_id },
            scannedQrToken: decodedText,
            identifiedEmployee: res.employee
          }))

          window.dispatchEvent(new CustomEvent('pace:trigger-face-auth', {
            detail: {
              id: res.scan_log_id,
              scan_log_id: res.scan_log_id,
              employee_id: res.employee.employee_id,
              employee: res.employee,
              employee_name: res.employee.name,
              employee_code: res.employee.employee_code,
              face_biometric_image: user?.face_biometric_image || res.employee?.face_biometric_image,
              face_biometric_base64: user?.face_biometric_base64 || res.employee?.face_biometric_base64,
              has_registered_face: !!(user?.face_biometric_image || res.employee?.face_biometric_image),
              scanned_by: {
                user_id: user?.user_id,
                employee: user?.employee || { first_name: 'Store', last_name: 'Admin' }
              }
            }
          }))

          navigate('/store-admin/profile')
        }
        window.dispatchEvent(new CustomEvent('pace:verifications-sync'))
      } else {
        playSound('error')
        setError(res.message || 'QR code verification failed.')
        setStep('scan')
      }
    } catch (err) {
      playSound('error')
      setError(err.message || 'Employee QR verification failed.')
      setStep('scan')
    } finally {
      setLoading(false)
      // Release the lock after backend processing completes
      isProcessingScan.current = false
    }
  }

  // Manual Token Scan (backup)
  const handleManualScan = (e) => {
    e?.preventDefault()
    if (!manualToken.trim()) return
    handleQrScanned(manualToken.trim())
  }

  // Handle PIN verification & record attendance
  const handleVerifyPin = async (e) => {
    if (e) e.preventDefault()
    if (!pin || pin.length < 4) {
      setPinError('Please enter your 4 to 6 digit employee PIN')
      return
    }

    setLoading(true)
    setPinError('')
    setError('')
    try {
      const res = await api.attendance.verifyPin({
        qr_token: scannedToken,
        pin: pin,
        device_info: `${navigator.platform} (${navigator.userAgent})`,
      })

      if (res.success) {
        playSound('success')
        setResultData(res)
        setStep('result')
        showToast(res.message || 'Attendance recorded successfully!', 'success')
        startAutoResetTimer()
        triggerDataSync('attendance')
      } else {
        playSound('error')
        setPinError(res.message || 'EMPLOYEE VERIFICATION FAILED. Attendance was not recorded.')
        setPin('')
      }
    } catch (err) {
      playSound('error')
      setPinError(err.message || 'EMPLOYEE VERIFICATION FAILED. Attendance was not recorded.')
      setPin('')
    } finally {
      setLoading(false)
    }
  }

  const startAutoResetTimer = () => {
    if (resetTimerRef.current) clearInterval(resetTimerRef.current)
    setAutoResetSeconds(8)
    resetTimerRef.current = setInterval(() => {
      setAutoResetSeconds(prev => {
        if (prev <= 1) {
          clearInterval(resetTimerRef.current)
          handleReset()
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  const handleReset = () => {
    if (resetTimerRef.current) clearInterval(resetTimerRef.current)
    stopCamera()
    setStep('scan')
    setIdentifiedEmp(null)
    setScannedToken('')
    setPin('')
    setError('')
    setPinError('')
    setResultData(null)
    setManualToken('')
  }

  // Keypad Helper for PIN
  const handleKeypadPress = (val) => {
    if (val === 'backspace') {
      setPin(prev => prev.slice(0, -1))
      setPinError('')
    } else if (val === 'clear') {
      setPin('')
      setPinError('')
    } else {
      if (pin.length < 6) {
        setPin(prev => prev + val)
        setPinError('')
      }
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-2 text-primary text-xs font-semibold uppercase tracking-wider mb-1">
            <FiShield className="text-sm" /> STORE ADMINISTRATOR TERMINAL
          </div>
          <h1 className="text-2xl font-bold text-foreground">QR Attendance Terminal</h1>
          <p className="text-xs text-muted-foreground">
            Scan Employee QR Code • Authorized Branch: <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{userBranch}</span>
          </p>
        </div>

        {step !== 'scan' ? (
          <Btn variant="outline" size="sm" onClick={handleReset} icon={<FiRefreshCw />}>
            Reset / Scan New
          </Btn>
        ) : (
          <div className="flex flex-col items-end">
            <div className="flex items-center gap-1.5 text-muted-foreground text-[10px] font-bold uppercase tracking-widest mb-1">
              <FiClock className="text-emerald-500" /> REAL-TIME CLOCK
            </div>
            <div className="text-3xl font-mono font-bold text-emerald-600 dark:text-emerald-400 bg-card px-4 py-1.5 rounded-xl border border-border shadow-inner">
              {currentTime.toLocaleTimeString('en-US', { hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </div>
            <div className="text-xs text-muted-foreground font-semibold mt-1">
              {currentTime.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-3 text-rose-600 dark:text-rose-400 text-sm animate-shake">
          <FiAlertCircle className="text-lg shrink-0 mt-0.5" />
          <div className="flex-1 font-medium">{error}</div>
          <button onClick={() => setError('')} className="text-rose-600 dark:text-rose-400 hover:text-rose-500 dark:hover:text-rose-300">
            <FiXCircle />
          </button>
        </div>
      )}

      {/* STEP 1: CAMERA SCANNER (SCAN EMPLOYEE QR CODE) */}
      {step === 'scan' && (
        <div className="space-y-6">
          <Card className="p-6">
            <div className="flex flex-col items-center justify-center space-y-4">
              <div className="text-center space-y-1">
                <span className="text-xs uppercase font-bold tracking-wider text-primary">
                  Step 1 of 2
                </span>
                <h2 className="text-lg font-bold text-foreground">Scan Employee QR Code</h2>
                <p className="text-xs text-muted-foreground max-w-sm">
                  Point the camera at the employee's permanent attendance QR badge displayed on their phone.
                </p>
              </div>

              {/* Camera Video Viewport */}
              <div className="w-full max-w-sm aspect-square bg-slate-950 rounded-2xl border-2 border-border dark:border-slate-700 overflow-hidden relative shadow-2xl flex items-center justify-center">
                <div
                  id={scannerContainerId}
                  className="w-full h-full [&_video]:-scale-x-100! [&_video]:object-cover [&_#qr-shaded-region>div]:hidden"
                />
                
                {/* Target Overlay */}
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <div className="w-[250px] h-[250px] border-2 border-primary/80 rounded-2xl relative animate-pulse shadow-lg shadow-primary/10">
                    <div className="absolute -top-0.5 -left-0.5 w-6 h-6 border-t-4 border-l-4 border-primary rounded-tl-xl" />
                    <div className="absolute -top-0.5 -right-0.5 w-6 h-6 border-t-4 border-r-4 border-primary rounded-tr-xl" />
                    <div className="absolute -bottom-0.5 -left-0.5 w-6 h-6 border-b-4 border-l-4 border-primary rounded-bl-xl" />
                    <div className="absolute -bottom-0.5 -right-0.5 w-6 h-6 border-b-4 border-r-4 border-primary rounded-br-xl" />
                  </div>
                </div>

                {loading && (
                  <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-xs flex flex-col items-center justify-center text-primary gap-2 z-20">
                    <FiRefreshCw className="animate-spin text-3xl" />
                    <span className="text-xs font-semibold">Identifying employee...</span>
                  </div>
                )}
              </div>

              {/* Camera Selector */}
              {cameras.length > 1 && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <FiCamera /> Camera:
                  </span>
                  <select
                    value={selectedCamera}
                    onChange={(e) => setSelectedCamera(e.target.value)}
                    className="bg-card border border-border text-foreground rounded-lg px-2.5 py-1 text-xs outline-none cursor-pointer"
                  >
                    {cameras.map(c => (
                      <option key={c.id} value={c.id}>{c.label || `Camera ${c.id.slice(0, 5)}`}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </Card>

          {/* Backup Manual Scanner Input */}
          <Card className="p-4 max-w-sm mx-auto text-xs space-y-2">
            <div className="text-muted-foreground font-semibold flex items-center gap-1">
              <FiKey /> Barcode / Token Scanner Input:
            </div>
            <form onSubmit={handleManualScan} className="flex gap-2">
              <input
                type="text"
                value={manualToken}
                onChange={e => setManualToken(e.target.value)}
                placeholder="Paste or scan token..."
                className="flex-1 px-3 py-1.5 rounded-lg border border-border bg-muted/40 text-foreground font-mono text-xs focus:ring-1 focus:ring-primary outline-none"
              />
              <Btn type="submit" size="sm" variant="primary" disabled={loading || !manualToken.trim()}>
                Verify
              </Btn>
            </form>
          </Card>
        </div>
      )}

      {/* STEP 2: EMPLOYEE IDENTIFIED & PERSONAL PIN REQUIRED */}
      {step === 'pin' && identifiedEmp && (
        <div className="space-y-6 max-w-xl mx-auto">
          {/* Employee Identified Card */}
          <Card className="p-6 space-y-4">
            <div className="border-b border-border pb-3 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  Step 1 Complete ✓
                </span>
                <h2 className="text-base font-bold text-foreground">EMPLOYEE IDENTIFIED</h2>
              </div>
              <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
                <FiCheckCircle /> QR Status: ACTIVE
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-muted/40 border border-border">
                <span className="text-muted-foreground block text-[10px] uppercase font-bold">Employee Name</span>
                <span className="font-bold text-foreground text-sm">{identifiedEmp.name}</span>
              </div>
              <div className="p-3 rounded-xl bg-muted/40 border border-border">
                <span className="text-muted-foreground block text-[10px] uppercase font-bold">Employee ID</span>
                <span className="font-mono font-bold text-primary text-sm">{identifiedEmp.employee_code}</span>
              </div>
              <div className="p-3 rounded-xl bg-muted/40 border border-border">
                <span className="text-muted-foreground block text-[10px] uppercase font-bold">Position</span>
                <span className="font-semibold text-foreground">{identifiedEmp.position}</span>
              </div>
              <div className="p-3 rounded-xl bg-muted/40 border border-border">
                <span className="text-muted-foreground block text-[10px] uppercase font-bold">Authorized Branch</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">{identifiedEmp.branch || userBranch}</span>
              </div>
            </div>
          </Card>

          {/* Personal PIN Verification Card */}
          <Card className="p-6 space-y-4">
            <div className="text-center space-y-1">
              <span className="text-xs uppercase font-bold tracking-wider text-amber-600 dark:text-amber-400">
                Step 2 of 2
              </span>
              <h3 className="text-base font-bold text-foreground flex items-center justify-center gap-1.5">
                <FiLock className="text-primary" /> PERSONAL PIN REQUIRED
              </h3>
              <p className="text-xs text-muted-foreground">
                The employee must enter their own secure PIN to confirm attendance.
              </p>
            </div>

            {pinError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs font-semibold text-center animate-shake">
                {pinError}
              </div>
            )}

            {availableActions.length > 0 && (
              <div className="flex justify-center my-2">
                <span className="px-5 py-2 bg-primary text-primary-foreground text-sm font-black rounded-xl uppercase tracking-wider shadow-md">
                  {availableActions[0].replace('_', ' ')}
                </span>
              </div>
            )}

            {/* PIN Display Field */}
            <div className="flex items-center justify-center gap-3">
              <div className="relative w-48">
                <input
                  type={showPin ? 'text' : 'password'}
                  maxLength={6}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••"
                  className="w-full text-center text-2xl font-mono tracking-widest py-2.5 px-4 bg-muted/40 border-2 border-border rounded-xl text-foreground focus:border-primary outline-none"
                  autoFocus
                />
              </div>
              <button
                type="button"
                onClick={() => setShowPin(!showPin)}
                className="p-2.5 text-muted-foreground hover:text-foreground border border-border rounded-xl bg-muted/40 cursor-pointer"
                title={showPin ? "Hide PIN" : "Show PIN"}
              >
                {showPin ? <FiEyeOff /> : <FiEye />}
              </button>
            </div>

            {/* Touch Keypad */}
            <div className="max-w-xs mx-auto grid grid-cols-3 gap-2 pt-2">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => handleKeypadPress(num.toString())}
                  className="py-3 bg-muted/50 hover:bg-muted active:scale-95 text-foreground font-bold text-base rounded-xl border border-border transition cursor-pointer"
                >
                  {num}
                </button>
              ))}
              <button
                type="button"
                onClick={() => handleKeypadPress('clear')}
                className="py-3 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 font-semibold text-xs rounded-xl border border-rose-500/25 transition cursor-pointer"
              >
                CLEAR
              </button>
              <button
                type="button"
                onClick={() => handleKeypadPress('0')}
                className="py-3 bg-muted/50 hover:bg-muted active:scale-95 text-foreground font-bold text-base rounded-xl border border-border transition cursor-pointer"
              >
                0
              </button>
              <button
                type="button"
                onClick={() => handleKeypadPress('backspace')}
                className="py-3 bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground font-semibold text-xs rounded-xl border border-border transition cursor-pointer flex items-center justify-center"
              >
                ⌫
              </button>
            </div>

            {/* Verify Action Button */}
            <div className="pt-3 flex gap-3 max-w-xs mx-auto">
              <Btn variant="outline" className="flex-1" onClick={handleReset} disabled={loading}>
                Cancel
              </Btn>
              <Btn
                variant="primary"
                className="flex-1"
                onClick={handleVerifyPin}
                disabled={loading || pin.length < 4}
                icon={<FiCheck />}
              >
                {loading ? 'Verifying...' : 'VERIFY'}
              </Btn>
            </div>
          </Card>
        </div>
      )}

      {/* STEP 3: ATTENDANCE VERIFIED RESULT (TIME IN / TIME OUT) */}
      {step === 'result' && resultData && (
        <Card className="p-8 max-w-xl mx-auto text-center space-y-6 animate-fadeIn">
          {/* Success Banner */}
          <div className="w-16 h-16 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-2 border-emerald-500/40 flex items-center justify-center mx-auto text-3xl shadow-lg shadow-emerald-500/10">
            <FiCheckCircle />
          </div>

          <div className="space-y-1">
            <h2 className="text-xl font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">
              {resultData.action === 'TIME_IN'
                ? '✓ TIME IN SUCCESSFUL'
                : resultData.action === 'TIME_OUT'
                ? '✓ TIME OUT SUCCESSFUL'
                : '✓ ATTENDANCE VERIFIED'}
            </h2>
            <p className="text-xs text-muted-foreground">
              {resultData.message}
            </p>
          </div>

          {/* Detailed Verification Summary */}
          <div className="p-4 rounded-2xl bg-muted/40 border border-border text-xs space-y-2 text-left">
            <div className="flex justify-between py-1 border-b border-border">
              <span className="text-muted-foreground">Employee:</span>
              <span className="font-bold text-foreground">{resultData.employee?.name}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-border">
              <span className="text-muted-foreground">Employee ID:</span>
              <span className="font-mono font-bold text-primary">{resultData.employee?.employee_code}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-border">
              <span className="text-muted-foreground">Timestamp:</span>
              <span className="font-mono font-bold text-foreground">{resultData.time}</span>
            </div>
            {resultData.action === 'TIME_OUT' && (
              <>
                <div className="flex justify-between py-1 border-b border-border">
                  <span className="text-muted-foreground">Total Hours:</span>
                  <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">{resultData.total_hours} hrs</span>
                </div>
                <div className="flex justify-between py-1 border-b border-border">
                  <span className="text-muted-foreground">Overtime:</span>
                  <span className="font-mono font-bold text-amber-600 dark:text-amber-400">{resultData.overtime_hours} hrs</span>
                </div>
              </>
            )}
            <div className="flex justify-between py-1 border-b border-border">
              <span className="text-muted-foreground">Branch:</span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">{resultData.branch || userBranch}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-border">
              <span className="text-muted-foreground">Verification:</span>
              <span className="font-bold text-foreground">QR + PIN</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-muted-foreground">Verified By:</span>
              <span className="font-semibold text-foreground">{resultData.verified_by || `Store Administrator (${user?.username})`}</span>
            </div>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-center">
            <Btn variant="primary" size="lg" onClick={handleReset} icon={<FiCamera />}>
              Scan Next Employee ({autoResetSeconds}s)
            </Btn>
          </div>
        </Card>
      )}
    </div>
  )
}
