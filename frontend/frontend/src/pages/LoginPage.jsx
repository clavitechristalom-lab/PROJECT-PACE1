import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  FiSun, FiMoon, FiMail, FiLock, FiUser, FiEye, FiEyeOff,
  FiX, FiAlertTriangle, FiCheckCircle, FiLogIn, FiUserPlus,
  FiShield, FiHome, FiBriefcase, FiUsers, FiEdit3
} from 'react-icons/fi'
import { showSuccess, showError, showLoading, closeLoading } from '../lib/swal'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { Spinner } from '../components/ui'
import { api } from '../lib/api'
import heroImg from '../assets/furniture-hero.png'
import darkLandscape from '../assets/furnatue.webp'

export default function LoginPage() {
  const { login, register, user, checkingAuth } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [remember, setRemember] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({
    username: '',
    password: '',
  })
  const [signUpSuccess, setSignUpSuccess] = useState('')
  const [roleModalOpen, setRoleModalOpen] = useState(false)
  const [registrationOptions, setRegistrationOptions] = useState({ branches: [], departments: [] })

  const [signUpData, setSignUpData] = useState({
    first_name: '',
    middle_name: '',
    last_name: '',
    phone: '',
    address: '',
    email: '',
    username: '',
    employee_id: '',
    branch_id: '',
    department: '',
    password: '',
    confirmPassword: '',
    agree: true,
    role: 'Customer',
  })

  const [signUpErrors, setSignUpErrors] = useState({})

  const { isDark, toggleMode } = useTheme()

  useEffect(() => {
    if (!checkingAuth && user) {
      const from =
        location.state?.from?.pathname ||
        (user.role === 'Employee'
          ? '/employee/dashboard'
          : '/dashboard')

      navigate(from, { replace: true })
    }
  }, [user, checkingAuth, navigate, location])

  useEffect(() => {
    if (isLoginModalOpen && activeTab === 'signup') {
      api.auth.registrationOptions()
        .then((data) => setRegistrationOptions({
          branches: data.branches || [],
          departments: data.departments || [],
        }))
        .catch(() => {})
    }
  }, [isLoginModalOpen, activeTab])

  useEffect(() => {
    if (!roleModalOpen) return undefined
    const handleEscape = (event) => {
      if (event.key === 'Escape') setRoleModalOpen(false)
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [roleModalOpen])


  const handleSubmit = async (e) => {
    e.preventDefault()

    const errors = {
      username: '',
      password: '',
    }

    let hasError = false

    if (!username.trim()) {
      errors.username = 'Username / Email is required'
      hasError = true
    }

    if (!password) {
      errors.password = 'Password is required'
      hasError = true
    }

    setFieldErrors(errors)

    if (hasError) return

    setError('')
    showLoading('Signing in...')

    const res = await login(
      username.trim(),
      password,
      remember
    )

    closeLoading()
    setLoading(false)

    if (res.success) {
      showSuccess('Login Successful', 'Welcome back to Project PACE!')
      const dest =
        res.user?.role === 'Customer'
          ? '/customer/dashboard'
          : res.user?.role === 'Employee'
            ? '/employee/dashboard'
            : '/dashboard'

      navigate(dest, { replace: true })
    } else {
      showError('Login Failed', res.message || 'Invalid username or password. Please try again.')
      setError(
        res.message ||
        'Invalid username or password. Please try again.'
      )
    }
  }

  const handleSignUpSubmit = async (e) => {
    e.preventDefault()

    const errors = {}

    if (!signUpData.first_name.trim()) {
      errors.first_name = 'First name is required'
    }
    if (!signUpData.last_name.trim()) {
      errors.last_name = 'Last name is required'
    }
    if (!signUpData.phone.trim()) {
      errors.phone = 'Phone number is required'
    }
    if (!signUpData.address.trim()) {
      errors.address = 'Complete address is required'
    }

    if (!signUpData.email.trim()) {
      errors.email = 'Email address is required'
    }

    if (signUpData.role !== 'Customer' && !signUpData.username?.trim()) {
      errors.username = 'Username is required'
    }



    if ((signUpData.role === 'Store Admin' || signUpData.role === 'Employee') && !signUpData.branch_id) {
      errors.branch_id = 'Please select a valid branch'
    }



    if (!signUpData.password) {
      errors.password = 'Password is required'
    }

    if (
      signUpData.password !==
      signUpData.confirmPassword
    ) {
      errors.confirmPassword = 'Passwords do not match'
    }

    setSignUpErrors(errors)

    if (Object.keys(errors).length > 0) return

    showLoading('Creating your account...')
    setLoading(true)
    setError('')

    const res = await register({
      ...signUpData,
      username: signUpData.role === 'Customer' ? signUpData.email.trim() : signUpData.username.trim(),
    })

    if (res.success) {
      // Auto-login
      const finalUsername = signUpData.role === 'Customer' ? signUpData.email.trim() : signUpData.username.trim()
      const loginRes = await login(finalUsername, signUpData.password, false)

      closeLoading()
      setLoading(false)

      if (loginRes.success) {
        showSuccess('Welcome!', 'Account created and logged in successfully.')
        
        const dest =
          loginRes.user?.role === 'Customer'
            ? '/customer/dashboard'
            : loginRes.user?.role === 'Employee'
              ? '/employee/dashboard'
              : '/dashboard'

        navigate(dest, { replace: true })
      } else {
        showSuccess('Account Created', 'Your account has been created successfully! You can now log in.')
        setSignUpSuccess('Account created successfully! You can now log in.')
        setActiveTab('login')
        setSignUpSuccess('')
      }
    } else {
      closeLoading()
      setLoading(false)
      
      setSignUpErrors(res.errors || {})
      showError('Registration Failed', res.message || 'Something went wrong during sign up.')
      setError(res.message)
    }
  }


  if (checkingAuth) {
    return (
      <div
        className={`min-h-screen flex flex-col items-center justify-center gap-3 ${isDark
          ? 'bg-[#090d16] text-white'
          : 'bg-card text-neutral-900'
          }`}
      >
        <Spinner
          className={`w-9 h-9 ${isDark
            ? 'text-blue-500'
            : 'text-neutral-900'
            }`}
        />

        <p
          className={`text-sm font-medium ${isDark
            ? 'text-slate-400'
            : 'text-neutral-500'
            }`}
        >
          Checking authentication...
        </p>
      </div>
    )
  }

  return (
    <div
      className={`relative min-h-screen flex flex-col font-sans selection:bg-neutral-900 selection:text-white overflow-hidden transition-colors duration-300 ${isDark
        ? 'bg-[#090d16] text-white'
        : 'bg-card text-neutral-900'
        }`}
    >
      {isDark && (
        <>
          <div className="absolute -top-40 -left-40 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute top-1/3 -right-32 w-96 h-96 bg-amber-500/15 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-40 left-1/3 w-[500px] h-[500px] bg-indigo-600/20 rounded-full blur-3xl pointer-events-none" />
        </>
      )}

      <header
        className={`relative z-20 flex flex-col sm:flex-row items-center justify-between gap-3 px-4 md:px-16 py-4 ${isDark
          ? 'bg-[#090d16]'
          : 'bg-card'
          }`}
      >
        <div className="flex items-center text-center sm:text-left">
          <div
            className={`text-2xl sm:text-3xl md:text-4xl font-semibold tracking-tight ${isDark
              ? 'text-white'
              : 'text-gray-800'
              }`}
          >
            ZLICS Furniture and Appliances
          </div>
        </div>

        <div className="flex items-center">
          <nav
            className={`hidden md:flex items-center gap-10 text-[10px] font-medium ${isDark
              ? 'text-slate-400'
              : 'text-gray-500'
              }`}
          >
            <a href="#home" className="hover:text-black transition">
              HOME
            </a>
            <a href="#about" className="hover:text-black transition">
              ABOUT
            </a>
            <a href="#support" className="hover:text-black transition">
              SUPPORT
            </a>
            <a href="#appliances" className="hover:text-black transition">
              APPLIANCES
            </a>
            <a href="#furniture" className="hover:text-black transition">
              FURNITURE
            </a>
          </nav>

          <button
            type="button"
            onClick={toggleMode}
            className={`ml-4 md:ml-8 flex items-center justify-center w-8 h-8 rounded-full text-sm transition-all cursor-pointer shadow-xs active:scale-95 ${isDark
              ? 'bg-slate-800/90 hover:bg-slate-700 text-amber-300 border border-slate-700'
              : 'bg-neutral-100 hover:bg-neutral-200 text-neutral-800 border border-neutral-300'
              }`}
          >
            {isDark ? <FiSun className="w-4 h-4 text-amber-300" /> : <FiMoon className="w-4 h-4 text-slate-700" />}
          </button>
        </div>
      </header>

      <main className="relative z-10 flex-1 w-full">
        <section
          id="home"
          className="flex flex-col-reverse md:flex-row items-center px-4 md:px-16 py-8 md:py-12 gap-8 md:gap-0"
        >
          <div className="flex-1 w-full md:pr-8 text-center md:text-left">
            <p
              className={`text-sm mb-2 ${isDark
                ? 'text-slate-400'
                : 'text-gray-900'
                }`}
            >
              Project PACE:
            </p>

            <h1
              className={`text-3xl md:text-5xl font-semibold mb-4 leading-tight ${isDark
                ? 'text-white'
                : 'text-gray-900'
                }`}
            >
              ZLICS Furniture
              <br />
              and Appliances
            </h1>

            <p
              className={`mb-6 text-sm sm:text-base ${isDark
                ? 'text-slate-300'
                : 'text-gray-900'
                }`}
            >
              Everything you need is right here. Simple, easy, and ready for you.
            </p>

            <div className="flex gap-3 flex-wrap justify-center md:justify-start">
              <button
                type="button"
                onClick={() => {
                  setError('')
                  setActiveTab('login')
                  setIsLoginModalOpen(true)
                }}
                className={`px-5 py-2 rounded-md transition ${isDark
                  ? 'bg-blue-600 hover:bg-blue-500 text-white'
                  : 'bg-black hover:bg-gray-800 text-white'
                  }`}
              >
                Login
              </button>

              <button
                type="button"
                onClick={() => {
                  setError('')
                  setSignUpSuccess('')
                  setActiveTab('signup')
                  setIsLoginModalOpen(true)
                }}
                className={`px-5 py-2 rounded-md border transition ${isDark
                  ? 'border-slate-600 text-white hover:bg-slate-800'
                  : 'border-gray-400 text-gray-900 hover:bg-gray-100'
                  }`}
              >
                Sign Up
              </button>
            </div>
          </div>

          <div className="relative w-full md:w-auto mb-8 md:mb-0">
            <div className="relative">
              <div
                className={`absolute inset-0 z-10 pointer-events-none bg-gradient-to-r ${isDark
                  ? 'from-[#090d16] via-[#090d16]/50 to-transparent'
                  : 'from-white via-white/40 to-transparent'
                  }`}
              />

              <img
                src="https://images.squarespace-cdn.com/content/v1/56903df91115e0dc632ab13f/93c5fd36-1652-49e0-9ac0-8cd4969d0c55/Madeline+Sofa+by+Rowe+Fine+Furniture"
                alt="Sofa"
                className="border w-full max-h-[300px] sm:max-h-[400px] md:max-h-[500px] object-cover rounded-xl shadow-lg"
              />
            </div>
          </div>
        </section>
      </main>

      {isLoginModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-6 bg-black/50 backdrop-blur-sm animate-[fadeIn_0.15s_ease]">
          <div
            className="absolute inset-0 cursor-pointer"
            onClick={() =>
              setIsLoginModalOpen(false)
            }
          />

          <div className="relative w-full max-w-4xl bg-[#0b131e] rounded-3xl overflow-hidden shadow-2xl border border-slate-800/80 z-10 grid grid-cols-1 md:grid-cols-12 animate-[slideUp_0.2s_ease]">
            <button
              type="button"
              onClick={() =>
                setIsLoginModalOpen(false)
              }
              className="absolute top-5 right-5 text-slate-400 hover:text-white transition-colors cursor-pointer p-1.5 rounded-full hover:bg-card/10 z-20"
              aria-label="Close modal"
            >
              <FiX className="w-5 h-5" />
            </button>

            {activeTab === 'signup' && (
              <button
                type="button"
                onClick={() => setRoleModalOpen(true)}
                className="absolute top-5 right-14 w-8 h-8 rounded-full border-2 border-slate-400 text-slate-300 hover:text-white hover:border-white transition-colors flex items-center justify-center z-20 font-bold text-sm bg-transparent shadow-lg"
                title="Select Account Role"
              >
                {signUpData.role === 'Administrator' ? 'A' : signUpData.role === 'Store Admin' ? 'S' : signUpData.role === 'Employee' ? 'E' : 'C'}
              </button>
            )}

            <div className="hidden md:flex md:col-span-6 relative flex-col justify-between p-8 sm:p-10 overflow-hidden select-none">
              <img src="https://images.squarespace-cdn.com/content/v1/56903df91115e0dc632ab13f/93c5fd36-1652-49e0-9ac0-8cd4969d0c55/Madeline+Sofa+by+Rowe+Fine+Furniture"
                alt="Atmospheric 3D landscape"
                className="absolute inset-0 w-full h-full object-cover object-center pointer-events-none"
              />

              <div className="absolute inset-0 bg-[#070e17]/40 pointer-events-none" />

              <div className="relative z-10 flex items-center gap-2">
                <span className="text-xs font-bold text-white/90 tracking-wider uppercase bg-black/40 backdrop-blur-sm border border-white/10 px-3 py-1.5 rounded-lg">
                  Project PACE: Z-LICZ
                </span>
              </div>

              <div className="relative z-10 mt-12">
                <h2 className="text-3xl font-extrabold text-white leading-tight tracking-tight mb-2">
                  Your Life journey
                  <br />
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-white via-gray-400 to-gray-100">
                    starts here.
                  </span>
                </h2>

                <p className="text-xs text-gray-300 leading-relaxed max-w-sm">
                  Everything you need is right here. Simple, easy, and ready for you.
                </p>
              </div>
            </div>

            <div className="md:col-span-6 bg-gradient-to-br from-black to-white p-5 sm:p-10 flex flex-col justify-between border-t md:border-t-0 md:border-l border-slate-300 max-h-[90vh] overflow-y-auto">
              <div>
                <div className="mb-6">
                  <h3 className="text-2xl sm:text-3xl font-bold text-gray-400 tracking-tight">
                    {activeTab === 'login'
                      ? 'Welcome to ZLICS'
                      : 'Create Account'}
                  </h3>

                  <p className="text-xs sm:text-sm text-slate-400 mt-1">
                    {activeTab === 'login'
                      ? 'Log in and get started!'
                      : 'Join the realm and start your journey.'}
                  </p>
                </div>

                <div className="flex border-b border-slate-800 mb-6">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('login')
                      setError('')
                      setSignUpSuccess('')
                    }}
                    className={`flex-1 pb-3 text-sm font-semibold transition-all relative cursor-pointer ${activeTab === 'login'
                      ? 'text-white'
                      : 'text-slate-500 hover:text-slate-300'
                      }`}
                  >
                    Login

                    {activeTab === 'login' && (
                      <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 rounded-full shadow-[0_0_8px_rgba(59,130,246,0.8)]" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('signup')
                      setError('')
                      setSignUpSuccess('')
                    }}
                    className={`flex-1 pb-3 text-sm font-semibold transition-all relative cursor-pointer ${activeTab === 'signup'
                      ? 'text-white'
                      : 'text-slate-500 hover:text-slate-300'
                      }`}
                  >
                    Sign Up

                    {activeTab === 'signup' && (
                      <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 rounded-full shadow-[0_0_8px_rgba(59,130,246,0.8)]" />
                    )}
                  </button>
                </div>

                {signUpSuccess && (
                  <div className="bg-emerald-950/40 border border-emerald-800/60 text-emerald-300 text-xs px-3.5 py-2.5 rounded-xl mb-4 animate-[fadeIn_0.15s_ease] flex items-center gap-2">
                    <FiCheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>{signUpSuccess}</span>
                  </div>
                )}

                {error && (
                  <div className="bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs px-3.5 py-2.5 rounded-xl mb-4 flex items-start gap-2 animate-[fadeIn_0.15s_ease]">
                    <FiAlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold block text-rose-200">
                        {activeTab === 'login' ? 'Authentication Failed' : 'Registration Failed'}
                      </span>
                      <span>{error}</span>
                    </div>
                  </div>
                )}

                {activeTab === 'login' ? (
                  <form
                    onSubmit={handleSubmit}
                    className="space-y-4"
                    noValidate
                  >
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                        Email Address
                      </label>

                      <div className="relative">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none">
                          <FiMail className="w-4 h-4" />
                        </span>

                        <input
                          type="text"
                          value={username}
                          onChange={(e) => {
                            setUsername(e.target.value)

                            if (fieldErrors.username) {
                              setFieldErrors((fe) => ({
                                ...fe,
                                username: '',
                              }))
                            }
                          }}
                          placeholder="Email"
                          className={`w-full bg-[#121c29] border rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 transition-all ${fieldErrors.username
                            ? 'border-rose-500/80 focus:ring-rose-500/30'
                            : 'border-slate-800 focus:border-blue-500 focus:ring-blue-500/20'
                            }`}
                          autoComplete="username"
                          autoFocus
                        />
                      </div>

                      {fieldErrors.username && (
                        <p className="text-[11px] text-rose-400 mt-1">
                          {fieldErrors.username}
                        </p>
                      )}
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-xs font-semibold text-slate-300">
                          Password
                        </label>

                        <button
                          type="button"
                          onClick={() => {
                            setError(
                              'Please contact system administrator.'
                            )
                          }}
                          className="text-xs text-black hover:text-gray-300 transition-colors cursor-pointer"
                        >
                          Forgot password?
                        </button>
                      </div>

                      <div className="relative">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none">
                          <FiLock className="w-4 h-4" />
                        </span>

                        <input
                          type={
                            showPw
                              ? 'text'
                              : 'password'
                          }
                          value={password}
                          onChange={(e) => {
                            setPassword(e.target.value)

                            if (fieldErrors.password) {
                              setFieldErrors((fe) => ({
                                ...fe,
                                password: '',
                              }))
                            }
                          }}
                          placeholder="••••••••"
                          className={`w-full bg-[#121c29] border rounded-xl pl-10 pr-10 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 transition-all ${fieldErrors.password
                            ? 'border-rose-500/80 focus:ring-rose-500/30'
                            : 'border-slate-800 focus:border-blue-500 focus:ring-blue-500/20'
                            }`}
                          autoComplete="current-password"
                        />

                        <button
                          type="button"
                          onClick={() =>
                            setShowPw((p) => !p)
                          }
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 cursor-pointer p-1 transition-colors"
                          aria-label={
                            showPw
                              ? 'Hide password'
                              : 'Show password'
                          }
                        >
                          {showPw ? (
                            <FiEyeOff className="w-4 h-4" />
                          ) : (
                            <FiEye className="w-4 h-4" />
                          )}
                        </button>
                      </div>

                      {fieldErrors.password && (
                        <p className="text-[11px] text-rose-400 mt-1">
                          {fieldErrors.password}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <label className="flex items-center gap-2.5 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={remember}
                          onChange={(e) =>
                            setRemember(
                              e.target.checked
                            )
                          }
                          className="w-4 h-4 rounded border-slate-700 bg-[#121c29] text-blue-600 accent-blue-600 focus:ring-0 cursor-pointer"
                        />

                        <span className="text-xs text-slate-400">
                          Remember me
                        </span>
                      </label>
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3.5 rounded-xl transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-blue-600/25 active:scale-[0.99] mt-2"
                    >
                      {loading ? (
                        <>
                          <Spinner className="w-4 h-4 text-white" />
                          <span>
                            Logging in...
                          </span>
                        </>
                      ) : (
                        'Login'
                      )}
                    </button>
                  </form>
                ) : (
                  <form
                    onSubmit={handleSignUpSubmit}
                    className="space-y-3.5"
                    noValidate
                  >

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">First Name</label>
                        <input
                          type="text"
                          value={signUpData.first_name}
                          onChange={(e) => {
                            setSignUpData({ ...signUpData, first_name: e.target.value })
                            if (signUpErrors.first_name) setSignUpErrors({ ...signUpErrors, first_name: '' })
                          }}
                          placeholder="First Name"
                          className={`w-full bg-[#121c29] border rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 transition-all ${signUpErrors.first_name ? 'border-rose-500/80 focus:ring-rose-500/30' : 'border-slate-800 focus:border-blue-500 focus:ring-blue-500/20'}`}
                        />
                        {signUpErrors.first_name && <p className="text-[11px] text-rose-400 mt-1">{signUpErrors.first_name}</p>}
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">Last Name</label>
                        <input
                          type="text"
                          value={signUpData.last_name}
                          onChange={(e) => {
                            setSignUpData({ ...signUpData, last_name: e.target.value })
                            if (signUpErrors.last_name) setSignUpErrors({ ...signUpErrors, last_name: '' })
                          }}
                          placeholder="Last Name"
                          className={`w-full bg-[#121c29] border rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 transition-all ${signUpErrors.last_name ? 'border-rose-500/80 focus:ring-rose-500/30' : 'border-slate-800 focus:border-blue-500 focus:ring-blue-500/20'}`}
                        />
                        {signUpErrors.last_name && <p className="text-[11px] text-rose-400 mt-1">{signUpErrors.last_name}</p>}
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">Middle Name (Optional)</label>
                      <input
                        type="text"
                        value={signUpData.middle_name}
                        onChange={(e) => setSignUpData({ ...signUpData, middle_name: e.target.value })}
                        placeholder="Middle Name"
                        className="w-full bg-[#121c29] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">Phone Number</label>
                      <input
                        type="tel"
                        value={signUpData.phone}
                        onChange={(e) => {
                          setSignUpData({ ...signUpData, phone: e.target.value })
                          if (signUpErrors.phone) setSignUpErrors({ ...signUpErrors, phone: '' })
                        }}
                        placeholder="e.g. 09123456789"
                        className={`w-full bg-[#121c29] border rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 transition-all ${signUpErrors.phone ? 'border-rose-500/80 focus:ring-rose-500/30' : 'border-slate-800 focus:border-blue-500 focus:ring-blue-500/20'}`}
                      />
                      {signUpErrors.phone && <p className="text-[11px] text-rose-400 mt-1">{signUpErrors.phone}</p>}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">Complete Address</label>
                      <input
                        type="text"
                        value={signUpData.address}
                        onChange={(e) => {
                          setSignUpData({ ...signUpData, address: e.target.value })
                          if (signUpErrors.address) setSignUpErrors({ ...signUpErrors, address: '' })
                        }}
                        placeholder="Street, Barangay, City, Province"
                        className={`w-full bg-[#121c29] border rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 transition-all ${signUpErrors.address ? 'border-rose-500/80 focus:ring-rose-500/30' : 'border-slate-800 focus:border-blue-500 focus:ring-blue-500/20'}`}
                      />
                      {signUpErrors.address && <p className="text-[11px] text-rose-400 mt-1">{signUpErrors.address}</p>}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Email Address
                      </label>

                      <div className="relative">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none">
                          <FiMail className="w-4 h-4" />
                        </span>

                        <input
                          type="email"
                          value={signUpData.email}
                          onChange={(e) => {
                            setSignUpData({
                              ...signUpData,
                              email: e.target.value,
                            })

                            if (signUpErrors.email) {
                              setSignUpErrors({
                                ...signUpErrors,
                                email: '',
                              })
                            }
                          }}
                          placeholder="Email Address"
                          className={`w-full bg-[#121c29] border rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 transition-all ${signUpErrors.email
                            ? 'border-rose-500/80 focus:ring-rose-500/30'
                            : 'border-slate-800 focus:border-blue-500 focus:ring-blue-500/20'
                            }`}
                        />
                      </div>

                      {signUpErrors.email && (
                        <p className="text-[11px] text-rose-400 mt-1">
                          {signUpErrors.email}
                        </p>
                      )}
                    </div>

                    {signUpData.role !== 'Customer' && (
                      <>
                        <div>
                          <label className="block text-xs font-semibold text-slate-300 mb-1">Username</label>
                          <div className="relative">
                            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none">
                              <FiUser className="w-4 h-4" />
                            </span>
                            <input
                              type="text"
                              value={signUpData.username}
                              onChange={(e) => setSignUpData({ ...signUpData, username: e.target.value })}
                              placeholder="Username"
                              className={`w-full bg-[#121c29] border rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 transition-all ${signUpErrors.username ? 'border-rose-500/80 focus:ring-rose-500/30' : 'border-slate-800 focus:border-blue-500 focus:ring-blue-500/20'}`}
                              autoComplete="username"
                            />
                          </div>
                          {signUpErrors.username && <p className="text-[11px] text-rose-400 mt-1">{signUpErrors.username}</p>}
                        </div>


                        {(signUpData.role === 'Store Admin' || signUpData.role === 'Employee') && (
                          <div>
                            <label className="block text-xs font-semibold text-slate-300 mb-1">Store/Branch</label>
                            <select
                              value={signUpData.branch_id}
                              onChange={(e) => setSignUpData({ ...signUpData, branch_id: e.target.value })}
                              className={`w-full bg-[#121c29] border rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:ring-2 transition-all cursor-pointer ${signUpErrors.branch_id ? 'border-rose-500/80' : 'border-slate-800 focus:border-blue-500'}`}
                            >
                              <option value="">Select a branch</option>
                              {registrationOptions.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                            </select>
                            {signUpErrors.branch_id && <p className="text-[11px] text-rose-400 mt-1">{signUpErrors.branch_id}</p>}
                          </div>
                        )}

                      </>
                    )}



                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">
                          Password
                        </label>

                        <input
                          type="password"
                          value={signUpData.password}
                          onChange={(e) => {
                            setSignUpData({
                              ...signUpData,
                              password:
                                e.target.value,
                            })

                            if (signUpErrors.password) {
                              setSignUpErrors({
                                ...signUpErrors,
                                password: '',
                              })
                            }
                          }}
                          placeholder="••••••••"
                          className={`w-full bg-[#121c29] border rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 transition-all ${signUpErrors.password
                            ? 'border-rose-500/80 focus:ring-rose-500/30'
                            : 'border-slate-800 focus:border-blue-500 focus:ring-blue-500/20'
                            }`}
                        />

                        {signUpErrors.password && (
                          <p className="text-[11px] text-rose-400 mt-1">
                            {signUpErrors.password}
                          </p>
                        )}
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">
                          Confirm Password
                        </label>

                        <input
                          type="password"
                          value={
                            signUpData.confirmPassword
                          }
                          onChange={(e) => {
                            setSignUpData({
                              ...signUpData,
                              confirmPassword:
                                e.target.value,
                            })

                            if (
                              signUpErrors.confirmPassword
                            ) {
                              setSignUpErrors({
                                ...signUpErrors,
                                confirmPassword: '',
                              })
                            }
                          }}
                          placeholder="••••••••"
                          className={`w-full bg-[#121c29] border rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 transition-all ${signUpErrors.confirmPassword
                            ? 'border-rose-500/80 focus:ring-rose-500/30'
                            : 'border-slate-800 focus:border-blue-500 focus:ring-blue-500/20'
                            }`}
                        />

                        {signUpErrors.confirmPassword && (
                          <p className="text-[11px] text-rose-400 mt-1">
                            {
                              signUpErrors.confirmPassword
                            }
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center pt-1">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={signUpData.agree}
                          onChange={(e) =>
                            setSignUpData({
                              ...signUpData,
                              agree: e.target.checked,
                            })
                          }
                          className="w-4 h-4 rounded border-slate-700 bg-[#121c29] text-blue-600 accent-blue-600 focus:ring-0 cursor-pointer"
                        />

                        <span className="text-xs text-slate-400">
                          I agree to the Terms of Service & Guild Rules
                        </span>
                      </label>
                    </div>

                    <button
                      type="submit"
                      disabled={loading || !signUpData.agree}
                      className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 rounded-xl transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-blue-600/25 active:scale-[0.99] mt-2"
                    >
                      {loading ? (
                        <>
                          <Spinner className="w-4 h-4 text-white" />
                          <span>
                            Creating Account...
                          </span>
                        </>
                      ) : (
                        'Create Account'
                      )}
                    </button>
                  </form>
                )}
              </div>

              <div className="text-center mt-6 text-xs text-black font-extrabold">
                {activeTab === 'login' ? (
                  <>
                    Don't have an account yet?{' '}
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab('signup')
                        setError('')
                      }}
                      className="text-black hover:text-gray-300 font-semibold transition-colors cursor-pointer"
                    >
                      Create Account
                    </button>
                  </>
                ) : (
                  <>
                    Already have an account?{' '}
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab('login')
                        setError('')
                      }}
                      className="text-blue-400 hover:text-blue-300 font-semibold transition-colors cursor-pointer"
                    >
                      Sign In
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {roleModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="absolute inset-0" onClick={() => setRoleModalOpen(false)} />
          <div className="relative z-10 w-full max-w-sm rounded-2xl border border-slate-700 bg-[#171923] p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white">SELECT ACCOUNT ROLE</h3>
              <button
                type="button"
                onClick={() => setRoleModalOpen(false)}
                className="rounded-full p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
                aria-label="Close role selection"
              >
                <FiX className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              {[
                { value: 'Administrator', label: 'Administrator', icon: FiShield, description: 'Full system access and user management' },
                { value: 'Store Admin', label: 'Store Admin', icon: FiHome, description: 'Store settings, reports and staff' },
                { value: 'Employee', label: 'Employee', icon: FiBriefcase, description: 'Point of sale and inventory' },
              ].map(({ value, label, icon: Icon, description }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setSignUpData((current) => ({ ...current, role: value, branch_id: '', department: '' }))
                    setSignUpErrors({})
                    setRoleModalOpen(false)
                  }}
                  className="w-full flex items-center gap-3 rounded-xl border border-slate-700 bg-[#121c29] p-3 text-left text-white hover:border-blue-500 hover:bg-blue-500/10 transition-colors"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-300">
                    <Icon className="w-5 h-5" />
                  </span>
                  <span>
                    <span className="block text-sm font-bold">{label}</span>
                    <span className="block text-xs text-slate-400">{description}</span>
                  </span>
                </button>
              ))}
            </div>

            <div className="mt-4">
              <button
                type="button"
                onClick={() => {
                  setRoleModalOpen(false)
                  setActiveTab('login')
                }}
                className="w-full rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-300 hover:bg-white/5 transition-colors"
              >
                CLOSE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
