import { useState, useEffect } from 'react'
import { FiLock, FiEye, FiEyeOff, FiCheck, FiX, FiAlertCircle, FiUser } from 'react-icons/fi'
import { Card, Btn, showToast } from '../ui'
import { api } from '../../lib/api'

// Sound synthesizer using Web Audio API
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

export default function EmployeePinVerificationModal({ request, onClose, onSuccess }) {
  const [enteredPin, setEnteredPin] = useState('')
  const [showPin, setShowPin] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    // Reset state when request changes
    setEnteredPin('')
    setError('')
    setShowPin(false)
  }, [request])

  if (!request) return null

  const handlePinDigit = (digit) => {
    if (enteredPin.length < 6) {
      playTone('beep')
      setEnteredPin(prev => prev + digit)
      setError('')
    }
  }

  const handlePinDelete = () => {
    playTone('beep')
    setEnteredPin(prev => prev.slice(0, -1))
    setError('')
  }

  const handleVerify = async () => {
    if (enteredPin.length < 4) return
    
    setVerifying(true)
    setError('')
    
    try {
      const res = await api.attendance.approveVerification({
        scan_log_id: request.id,
        pin: enteredPin
      })
      
      if (res.success) {
        playTone('success')
        showToast(res.message || 'Attendance Authorized Successfully', 'success')
        onSuccess(request.id)
      } else {
        throw new Error(res.message || 'Verification failed')
      }
    } catch (err) {
      playTone('error')
      if (err.status === 423) {
        setError('Account temporarily locked due to too many failed attempts.')
      } else {
        setError(err.message || 'Incorrect PIN')
      }
    } finally {
      setVerifying(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <Card className="w-full max-w-sm overflow-hidden bg-card border-border shadow-2xl relative animate-in zoom-in-95 duration-200">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 via-primary to-emerald-500 animate-gradient-x"></div>
        
        <div className="p-6 space-y-5">
          <div className="text-center space-y-1">
            <h2 className="text-lg font-black text-foreground flex items-center justify-center gap-2 uppercase tracking-wide">
              <FiLock className="text-primary" /> Attendance Authorization
            </h2>
            <p className="text-xs text-muted-foreground">
              A Store Admin is requesting your attendance authorization. Enter your PIN to confirm.
            </p>
          </div>

          <div className="p-3 bg-muted/40 rounded-xl border border-border flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/20 text-primary flex items-center justify-center shrink-0">
              <FiUser className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold text-muted-foreground uppercase">Requested By</p>
              <p className="text-sm font-bold text-foreground truncate">
                {request.scanned_by?.employee ? 
                  `${request.scanned_by.employee.first_name} ${request.scanned_by.employee.last_name}` : 
                  'Store Admin'}
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex flex-col items-center">
              <div className="relative group w-48">
                <input
                  type={showPin ? "text" : "password"}
                  value={enteredPin}
                  readOnly
                  className="w-full text-center text-3xl font-mono tracking-[0.5em] font-black bg-muted/40 border-2 border-primary/50 rounded-xl py-3 px-4 outline-none text-primary"
                  placeholder="••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPin(!showPin)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors p-1"
                >
                  {showPin ? <FiEyeOff size={16} /> : <FiEye size={16} />}
                </button>
              </div>
              {error && (
                <span className="text-[10px] font-bold text-rose-500 mt-2 block animate-in fade-in slide-in-from-top-1 flex items-center gap-1">
                  <FiAlertCircle /> {error}
                </span>
              )}
            </div>

            {/* Touch Keypad */}
            <div className="grid grid-cols-3 gap-2 w-64 mx-auto pt-2">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                <button
                  key={num}
                  onClick={() => handlePinDigit(num.toString())}
                  className="h-12 text-lg font-bold bg-muted/30 hover:bg-muted/80 active:bg-primary/20 rounded-xl transition-all border border-border/50 text-foreground"
                >
                  {num}
                </button>
              ))}
              <button
                onClick={() => {
                  playTone('beep')
                  setEnteredPin('')
                  setError('')
                }}
                className="h-12 text-xs font-bold text-rose-500 bg-rose-500/5 hover:bg-rose-500/10 active:bg-rose-500/20 rounded-xl transition-all border border-rose-500/10 uppercase tracking-wider"
              >
                Clear
              </button>
              <button
                onClick={() => handlePinDigit('0')}
                className="h-12 text-lg font-bold bg-muted/30 hover:bg-muted/80 active:bg-primary/20 rounded-xl transition-all border border-border/50 text-foreground"
              >
                0
              </button>
              <button
                onClick={handlePinDelete}
                className="h-12 text-xs font-bold text-amber-500 bg-amber-500/5 hover:bg-amber-500/10 active:bg-amber-500/20 rounded-xl transition-all border border-amber-500/10 flex items-center justify-center uppercase tracking-wider"
              >
                Del
              </button>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-border bg-muted/20 flex gap-3">
          <Btn variant="outline" className="flex-1" onClick={onClose} disabled={verifying}>
            Ignore
          </Btn>
          <Btn 
            variant="primary" 
            className="flex-1" 
            onClick={handleVerify} 
            disabled={enteredPin.length < 4 || verifying}
            icon={verifying ? null : <FiCheck />}
          >
            {verifying ? 'Authorizing...' : 'Authorize'}
          </Btn>
        </div>
      </Card>
    </div>
  )
}
