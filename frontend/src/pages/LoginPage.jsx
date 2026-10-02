import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  FiSun, FiMoon, FiMail, FiLock, FiUser, FiEye, FiEyeOff,
  FiX, FiAlertTriangle, FiCheckCircle, FiLogIn, FiUserPlus,
  FiShield, FiHome, FiBriefcase, FiUsers, FiEdit3, FiMenu
} from 'react-icons/fi'
import { showSuccess, showError, showLoading, closeLoading } from '../lib/swal'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { Spinner, Pagination } from '../components/ui'
import { api } from '../lib/api'
import heroImg from '../assets/furniture-hero.png'


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
    username: '',
    email: '',
    phone: '',
    address: '',
    password: '',
    confirmPassword: '',
    attendance_pin: '',
    confirm_attendance_pin: '',
    role: 'Customer',
    gender: 'Male',
    date_of_birth: '',
    marital_status: 'Single',
    branch_id: '',
    agree: false,
  })

  const [appliances, setAppliances] = useState([])
  const [furniture, setFurniture] = useState([])
  const [loadingProducts, setLoadingProducts] = useState(true)

  const [sysSettings, setSysSettings] = useState(null)
  const companyName = sysSettings?.company_name || ''
  const companyAddress = sysSettings?.address || ''
  const companyEmail = sysSettings?.email || ''
  const companyPhone = sysSettings?.phone || ''
  const companyWebLinks = sysSettings?.web_links || ''
  const companyLogo = sysSettings?.logo || ''

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  // Products pagination
  const [appliancePage, setAppliancePage] = useState(1)
  const appliancePageSize = 8
  const paginatedAppliances = useMemo(() => {
    const start = (appliancePage - 1) * appliancePageSize
    return appliances.slice(start, start + appliancePageSize)
  }, [appliances, appliancePage, appliancePageSize])

  const [furniturePage, setFurniturePage] = useState(1)
  const furniturePageSize = 8
  const paginatedFurniture = useMemo(() => {
    const start = (furniturePage - 1) * furniturePageSize
    return furniture.slice(start, start + furniturePageSize)
  }, [furniture, furniturePage, furniturePageSize])

  useEffect(() => {
    const fetchPublicData = async () => {
      try {
        const appRes = await api.products.getPublicProducts({ category: 'Appliances' })
        setAppliances(appRes.products || [])
        const furnRes = await api.products.getPublicProducts({ category: 'Furniture' })
        setFurniture(furnRes.products || [])
        const sRes = await api.system.getSettings()
        if (sRes) setSysSettings(sRes)
      } catch (err) {
        console.error('Failed to load public data', err)
      } finally {
        setLoadingProducts(false)
      }
    }
    fetchPublicData()
  }, [])


  const [signUpErrors, setSignUpErrors] = useState({})

  const { isDark, toggleMode } = useTheme()

  useEffect(() => {
    if (!checkingAuth && user) {
      const from = location.state?.from?.pathname
      let dest = from
      if (!dest || dest === '/' || dest === '/login') {
        dest = user.role === 'Customer'
          ? '/customer/dashboard'
          : user.role === 'Employee'
            ? '/employee/dashboard'
            : '/dashboard'
      }
      navigate(dest, { replace: true })
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
      showSuccess('Login Successful', 'Welcome back to Z-LICZ!')
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

    if (!signUpData.gender) {
      errors.gender = 'Gender is required'
    }
    if (!signUpData.date_of_birth) {
      errors.date_of_birth = 'Birthday is required'
    }
    if (!signUpData.marital_status) {
      errors.marital_status = 'Status is required'
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

    if (signUpData.role !== 'Customer') {
      if (!signUpData.attendance_pin || signUpData.attendance_pin.length < 4 || signUpData.attendance_pin.length > 6 || !/^\d+$/.test(signUpData.attendance_pin)) {
        errors.attendance_pin = 'A 4-6 digit numerical PIN is required'
      }
      if (signUpData.attendance_pin !== signUpData.confirm_attendance_pin) {
        errors.confirm_attendance_pin = 'Attendance PINs do not match'
      }
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
        className={`sticky top-0 z-40 backdrop-blur-md transition-colors border-b px-4 sm:px-8 lg:px-16 py-3.5 flex items-center justify-between ${
          isDark
            ? 'bg-[#090d16]/95 border-slate-800/80 shadow-md shadow-black/20'
            : 'bg-white/95 border-gray-200/80 shadow-xs'
        }`}
      >
        {/* Brand Logo & Title */}
        <a href="#home" className="flex items-center gap-3 group text-left">
          {companyLogo ? (
            <img
              src={companyLogo.startsWith('blob:') || companyLogo.startsWith('http') ? companyLogo : `http://localhost:8000${companyLogo}`}
              alt={companyName || 'Logo'}
              className="h-9 w-auto max-w-[120px] object-contain rounded-lg shadow-2xs"
            />
          ) : (
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white font-black text-base shadow-md shadow-blue-500/25 shrink-0">
              {(companyName || 'Z').charAt(0).toUpperCase()}
            </div>
          )}
          <div className="flex flex-col">
            <span
              className={`text-lg sm:text-xl font-extrabold tracking-tight transition-colors ${
                isDark ? 'text-white group-hover:text-blue-400' : 'text-gray-900 group-hover:text-blue-600'
              }`}
            >
              {companyName || 'Z-LICZ'}
            </span>
            <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground/80 -mt-0.5">
              Appliances & Furniture
            </span>
          </div>
        </a>

        {/* Desktop Navigation Links */}
        <nav className="hidden md:flex items-center gap-8 text-xs font-bold tracking-wider">
          <a
            href="#home"
            className={`transition-colors ${
              isDark ? 'text-slate-400 hover:text-white' : 'text-gray-600 hover:text-black'
            }`}
          >
            HOME
          </a>
          <a
            href="#about"
            className={`transition-colors ${
              isDark ? 'text-slate-400 hover:text-white' : 'text-gray-600 hover:text-black'
            }`}
          >
            ABOUT
          </a>
          <a
            href="#appliances"
            className={`transition-colors ${
              isDark ? 'text-slate-400 hover:text-white' : 'text-gray-600 hover:text-black'
            }`}
          >
            APPLIANCES
          </a>
          <a
            href="#furniture"
            className={`transition-colors ${
              isDark ? 'text-slate-400 hover:text-white' : 'text-gray-600 hover:text-black'
            }`}
          >
            FURNITURE
          </a>
          <a
            href="#support"
            className={`transition-colors ${
              isDark ? 'text-slate-400 hover:text-white' : 'text-gray-600 hover:text-black'
            }`}
          >
            SUPPORT
          </a>
        </nav>

        {/* Right Action Controls */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          <button
            type="button"
            onClick={toggleMode}
            className={`flex items-center justify-center w-8 h-8 rounded-full text-sm transition-all cursor-pointer shadow-xs active:scale-95 ${
              isDark
                ? 'bg-slate-800/90 hover:bg-slate-700 text-amber-300 border border-slate-700'
                : 'bg-neutral-100 hover:bg-neutral-200 text-neutral-800 border border-neutral-300'
            }`}
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label="Toggle theme"
          >
            {isDark ? <FiSun className="w-4 h-4 text-amber-300" /> : <FiMoon className="w-4 h-4 text-slate-700" />}
          </button>

          {/* Mobile Hamburger Toggle */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className={`md:hidden p-2 rounded-xl border text-sm transition-colors cursor-pointer ${
              isDark
                ? 'border-slate-800 bg-slate-800/60 text-slate-300 hover:text-white hover:bg-slate-800'
                : 'border-gray-200 bg-gray-100/60 text-gray-700 hover:text-black hover:bg-gray-200'
            }`}
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <FiX className="w-5 h-5" /> : <FiMenu className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* Mobile Dropdown Navbar */}
      {mobileMenuOpen && (
        <div
          className={`md:hidden sticky top-[57px] z-30 border-b px-5 py-4 space-y-3 backdrop-blur-xl transition-all animate-[fadeIn_0.15s_ease] ${
            isDark
              ? 'bg-[#090d16]/98 border-slate-800 text-slate-200 shadow-xl'
              : 'bg-white/98 border-gray-200 text-gray-800 shadow-lg'
          }`}
        >
          <div className="flex flex-col space-y-2 text-xs font-bold tracking-wider">
            <a
              href="#home"
              onClick={() => setMobileMenuOpen(false)}
              className="py-2 px-3 rounded-lg hover:bg-primary/10 transition-colors"
            >
              HOME
            </a>
            <a
              href="#about"
              onClick={() => setMobileMenuOpen(false)}
              className="py-2 px-3 rounded-lg hover:bg-primary/10 transition-colors"
            >
              ABOUT
            </a>
            <a
              href="#appliances"
              onClick={() => setMobileMenuOpen(false)}
              className="py-2 px-3 rounded-lg hover:bg-primary/10 transition-colors"
            >
              APPLIANCES
            </a>
            <a
              href="#furniture"
              onClick={() => setMobileMenuOpen(false)}
              className="py-2 px-3 rounded-lg hover:bg-primary/10 transition-colors"
            >
              FURNITURE
            </a>
            <a
              href="#support"
              onClick={() => setMobileMenuOpen(false)}
              className="py-2 px-3 rounded-lg hover:bg-primary/10 transition-colors"
            >
              SUPPORT
            </a>
          </div>
        </div>
      )}

      <main className="relative z-10 flex-1 w-full">
        <section
          id="home"
          className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 md:py-16"
        >
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
            {/* Left Column: Heading, Subtitle & CTAs */}
            <div className="lg:col-span-6 text-center lg:text-left space-y-6">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
                <FiShield className="w-3.5 h-3.5" />
                <span>Z-LICZ • Official Portal</span>
              </div>

              <h1
                className={`text-3xl sm:text-5xl lg:text-5xl font-extrabold tracking-tight leading-[1.2] ${
                  isDark ? 'text-white' : 'text-gray-900'
                }`}
              >
                {companyName ? (
                  <>
                    Welcome to{' '}
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-500 via-indigo-400 to-purple-500">
                      {companyName}
                    </span>
                  </>
                ) : (
                  <>
                    Quality Living,{' '}
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-500 via-indigo-400 to-purple-500">
                      Simplified
                    </span>
                  </>
                )}
              </h1>

              <p
                className={`text-sm sm:text-base leading-relaxed max-w-xl mx-auto lg:mx-0 ${
                  isDark ? 'text-slate-300' : 'text-gray-600'
                }`}
              >
                Discover premium appliances and handcrafted furniture designed for modern Filipino homes. Flexible installment plans, swift delivery, and trusted service.
              </p>

              <div className="flex flex-wrap items-center justify-center lg:justify-start gap-3.5 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setError('')
                    setActiveTab('login')
                    setIsLoginModalOpen(true)
                  }}
                  className="px-6 py-3 rounded-xl font-bold text-sm bg-primary text-primary-foreground hover:bg-primary/90 transition shadow-lg shadow-primary/25 cursor-pointer active:scale-95 flex items-center gap-2"
                >
                  <FiLogIn className="w-4 h-4" />
                  <span>Sign In</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setError('')
                    setSignUpSuccess('')
                    setActiveTab('signup')
                    setIsLoginModalOpen(true)
                  }}
                  className={`px-6 py-3 rounded-xl font-bold text-sm border transition cursor-pointer active:scale-95 flex items-center gap-2 ${
                    isDark
                      ? 'border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-white'
                      : 'border-gray-300 bg-white hover:bg-gray-100 text-gray-800 shadow-xs'
                  }`}
                >
                  <FiUserPlus className="w-4 h-4" />
                  <span>Sign Up</span>
                </button>
              </div>

              {/* Trust Features */}
              <div className="pt-4 grid grid-cols-3 gap-3 border-t border-border/70 max-w-lg mx-auto lg:mx-0 text-center lg:text-left">
                <div>
                  <p className="text-base sm:text-lg font-bold text-foreground">100%</p>
                  <p className="text-[11px] text-muted-foreground font-medium">Original Brands</p>
                </div>
                <div>
                  <p className="text-base sm:text-lg font-bold text-foreground">Flexible</p>
                  <p className="text-[11px] text-muted-foreground font-medium">Payment Terms</p>
                </div>
                <div>
                  <p className="text-base sm:text-lg font-bold text-foreground">Verified</p>
                  <p className="text-[11px] text-muted-foreground font-medium">Customer Support</p>
                </div>
              </div>
            </div>

            {/* Right Column: Hero Image - Plastar, Sharp, Visible without covering overlays */}
            <div className="lg:col-span-6">
              <div className="relative mx-auto max-w-lg lg:max-w-none">
                <div
                  className={`relative rounded-3xl overflow-hidden shadow-2xl border transition-all duration-300 ${
                    isDark
                      ? 'border-slate-800/90 bg-slate-900 shadow-blue-500/5'
                      : 'border-slate-200/90 bg-white shadow-xl'
                  }`}
                >
                  <img
                    src={heroImg}
                    alt="Premium Living and Furniture"
                    className="w-full h-[300px] sm:h-[380px] md:h-[440px] object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent pointer-events-none" />
                  <div className="absolute bottom-4 left-4 right-4 p-3.5 sm:p-4 rounded-2xl bg-black/70 backdrop-blur-md border border-white/10 text-white flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-blue-300">
                        {companyName || 'Featured Collection'}
                      </p>
                      <p className="text-sm font-bold text-white">Modern Home Furniture & Living</p>
                    </div>
                    <span className="text-xs px-2.5 py-1 rounded-full bg-blue-500/25 text-blue-200 border border-blue-400/30 font-medium">
                      Available In-Store
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="about" className={`px-4 md:px-16 py-16 ${isDark ? 'bg-slate-900' : 'bg-gray-50'}`}>
          <div className="max-w-6xl mx-auto text-center">
            <h2 className={`text-3xl font-bold mb-6 ${isDark ? 'text-white' : 'text-gray-900'}`}>About {companyName}</h2>
            <p className={`text-lg max-w-3xl mx-auto leading-relaxed ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
              {companyName} is your one-stop shop for premium quality home essentials. We provide top-of-the-line products ranging from elegant furniture pieces to state-of-the-art appliances, ensuring that your life journey starts with comfort and style. Our commitment is to offer simple, easy, and ready-for-you solutions that transform your house into a home.{companyAddress && <><br /><span className="block mt-2 text-sm">📍 {companyAddress}</span></>}{companyPhone && <><br /><span className="block text-sm">📞 {companyPhone}</span></>}{companyEmail && <><br /><span className="block text-sm">✉️ {companyEmail}</span></>}
            </p>
          </div>
        </section>

        <section id="support" className={`px-4 md:px-16 py-16 ${isDark ? 'bg-[#090d16]' : 'bg-white'}`}>
          <div className="max-w-6xl mx-auto text-center">
            <h2 className={`text-3xl font-bold mb-6 ${isDark ? 'text-white' : 'text-gray-900'}`}>Support & Service</h2>
            <p className={`text-lg max-w-3xl mx-auto leading-relaxed ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
              We are here to help you every step of the way. From product inquiries to after-sales service, our dedicated support team ensures your complete satisfaction. Whether you need assistance with an installment plan, warranty claims, or product maintenance, {companyName} provides reliable and fast customer support.{companyWebLinks && <><br /><a href={companyWebLinks} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm text-blue-400 hover:underline">🌐 {companyWebLinks}</a></>}
            </p>
          </div>
        </section>

        <section id="appliances" className={`px-4 md:px-16 py-16 ${isDark ? 'bg-slate-900' : 'bg-gray-50'}`}>
          <div className="max-w-6xl mx-auto">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className={`text-2xl md:text-3xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Appliances</h2>
                <p className="text-xs sm:text-sm text-muted-foreground mt-1">Energy-efficient and dependable appliances for your everyday home</p>
              </div>
            </div>
            
            {loadingProducts ? (
              <div className="flex justify-center py-12"><Spinner className={`w-8 h-8 ${isDark ? 'text-white' : 'text-gray-900'}`} /></div>
            ) : appliances.length > 0 ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                  {paginatedAppliances.map(product => (
                    <div key={product.id} className={`rounded-xl overflow-hidden border transition-transform hover:-translate-y-1 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200 shadow-sm'}`}>
                      <div className="h-48 bg-gray-200 overflow-hidden relative">
                        {product.image_url ? (
                          <img src={product.image_url} alt={product.product_name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-400 bg-gray-100 dark:bg-slate-700">No Image</div>
                        )}
                      </div>
                      <div className="p-4">
                        <h3 className={`font-semibold mb-1 truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>{product.product_name}</h3>
                        <p className="text-emerald-500 font-bold">₱{Number(product.unit_price).toLocaleString()}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {appliances.length > appliancePageSize && (
                  <div className="mt-8">
                    <Pagination
                      page={appliancePage}
                      total={appliances.length}
                      pageSize={appliancePageSize}
                      onChange={setAppliancePage}
                    />
                  </div>
                )}
              </>
            ) : (
              <p className={`text-center py-10 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>No appliances available at the moment.</p>
            )}
          </div>
        </section>

        <section id="furniture" className={`px-4 md:px-16 py-16 ${isDark ? 'bg-[#090d16]' : 'bg-white'}`}>
          <div className="max-w-6xl mx-auto">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className={`text-2xl md:text-3xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Furniture</h2>
                <p className="text-xs sm:text-sm text-muted-foreground mt-1">Comfortable, elegant, and stylish furniture crafted to elevate your home</p>
              </div>
            </div>
            
            {loadingProducts ? (
              <div className="flex justify-center py-12"><Spinner className={`w-8 h-8 ${isDark ? 'text-white' : 'text-gray-900'}`} /></div>
            ) : furniture.length > 0 ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                  {paginatedFurniture.map(product => (
                    <div key={product.id} className={`rounded-xl overflow-hidden border transition-transform hover:-translate-y-1 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200 shadow-sm'}`}>
                      <div className="h-48 bg-gray-200 overflow-hidden relative">
                        {product.image_url ? (
                          <img src={product.image_url} alt={product.product_name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-400 bg-gray-100 dark:bg-slate-700">No Image</div>
                        )}
                      </div>
                      <div className="p-4">
                        <h3 className={`font-semibold mb-1 truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>{product.product_name}</h3>
                        <p className="text-emerald-500 font-bold">₱{Number(product.unit_price).toLocaleString()}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {furniture.length > furniturePageSize && (
                  <div className="mt-8">
                    <Pagination
                      page={furniturePage}
                      total={furniture.length}
                      pageSize={furniturePageSize}
                      onChange={setFurniturePage}
                    />
                  </div>
                )}
              </>
            ) : (
              <p className={`text-center py-10 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>No furniture available at the moment.</p>
            )}
          </div>
        </section>
      </main>

      {isLoginModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-6 bg-black/60 backdrop-blur-sm animate-[fadeIn_0.15s_ease]">
          <div
            className="absolute inset-0 cursor-pointer"
            onClick={() =>
              setIsLoginModalOpen(false)
            }
          />

          <div className="relative w-full max-w-4xl bg-[#0b131e] rounded-3xl overflow-hidden shadow-2xl border border-slate-800 z-10 grid grid-cols-1 md:grid-cols-12 animate-[slideUp_0.2s_ease]">
            <button
              type="button"
              onClick={() =>
                setIsLoginModalOpen(false)
              }
              className="absolute top-5 right-5 text-slate-400 hover:text-white transition-colors cursor-pointer p-1.5 rounded-full hover:bg-white/10 z-20"
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
              <img
                src={heroImg}
                alt="Atmospheric interior"
                className="absolute inset-0 w-full h-full object-cover object-center pointer-events-none opacity-40"
              />

              <div className="absolute inset-0 bg-gradient-to-t from-[#0b131e] via-[#0b131e]/80 to-[#0b131e]/30 pointer-events-none" />

              <div className="relative z-10 flex items-center gap-2">
                <span className="text-xs font-bold text-white/90 tracking-wider uppercase bg-black/60 backdrop-blur-md border border-white/10 px-3 py-1.5 rounded-lg shadow-sm">
                  {companyName || 'Z-LICZ'}
                </span>
              </div>

              <div className="relative z-10 mt-12">
                <h2 className="text-3xl font-extrabold text-white leading-tight tracking-tight mb-2">
                  Your Life journey
                  <br />
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-300 to-white">
                    starts here.
                  </span>
                </h2>

                <p className="text-xs text-slate-300 leading-relaxed max-w-sm">
                  Everything you need is right here. Simple, easy, and ready for you.
                </p>
              </div>
            </div>

            <div className="md:col-span-6 bg-[#0c1420] p-6 sm:p-10 flex flex-col justify-between border-t md:border-t-0 md:border-l border-slate-800 max-h-[90vh] overflow-y-auto">
              <div>
                <div className="mb-6">
                  <h3 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                    {activeTab === 'login'
                      ? (companyName ? `Welcome to ${companyName}` : 'Welcome Back')
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
                          setSignUpData({ ...signUpData, phone: e.target.value.replace(/\D/g, '') })
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

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">Gender</label>
                        <select
                          value={signUpData.gender}
                          onChange={(e) => setSignUpData({ ...signUpData, gender: e.target.value })}
                          className={`w-full bg-[#121c29] border rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 transition-all ${signUpErrors.gender ? 'border-rose-500/80 focus:ring-rose-500/30' : 'border-slate-800 focus:border-blue-500 focus:ring-blue-500/20'}`}
                        >
                          <option value="Male">Male</option>
                          <option value="Female">Female</option>
                          <option value="Other">Other</option>
                        </select>
                        {signUpErrors.gender && <p className="text-[11px] text-rose-400 mt-1">{signUpErrors.gender}</p>}
                      </div>
                      
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">Birthday</label>
                        <input
                          type="date"
                          value={signUpData.date_of_birth}
                          onChange={(e) => {
                            setSignUpData({ ...signUpData, date_of_birth: e.target.value })
                            if (signUpErrors.date_of_birth) setSignUpErrors({ ...signUpErrors, date_of_birth: '' })
                          }}
                          className={`w-full bg-[#121c29] border rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 transition-all appearance-none [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:right-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:cursor-pointer ${signUpErrors.date_of_birth ? 'border-rose-500/80 focus:ring-rose-500/30' : 'border-slate-800 focus:border-blue-500 focus:ring-blue-500/20'}`}
                        />
                        {signUpErrors.date_of_birth && <p className="text-[11px] text-rose-400 mt-1">{signUpErrors.date_of_birth}</p>}
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">Status</label>
                        <select
                          value={signUpData.marital_status}
                          onChange={(e) => setSignUpData({ ...signUpData, marital_status: e.target.value })}
                          className={`w-full bg-[#121c29] border rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 transition-all ${signUpErrors.marital_status ? 'border-rose-500/80 focus:ring-rose-500/30' : 'border-slate-800 focus:border-blue-500 focus:ring-blue-500/20'}`}
                        >
                          <option value="Single">Single</option>
                          <option value="Married">Married</option>
                          <option value="Widowed">Widowed</option>
                          <option value="Divorced">Divorced</option>
                        </select>
                        {signUpErrors.marital_status && <p className="text-[11px] text-rose-400 mt-1">{signUpErrors.marital_status}</p>}
                      </div>
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

                    {signUpData.role !== 'Customer' && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-1">
                        <div>
                          <label className="block text-xs font-semibold text-slate-300 mb-1">
                            Attendance PIN (4-6 digits)
                          </label>

                          <input
                            type="password"
                            maxLength={6}
                            value={signUpData.attendance_pin}
                            onChange={(e) => {
                              const val = e.target.value.replace(/\D/g, '')
                              setSignUpData({
                                ...signUpData,
                                attendance_pin: val,
                              })

                              if (signUpErrors.attendance_pin) {
                                setSignUpErrors({
                                  ...signUpErrors,
                                  attendance_pin: '',
                                })
                              }
                            }}
                            placeholder="••••"
                            className={`w-full bg-[#121c29] border rounded-xl px-3.5 py-2.5 text-sm font-mono tracking-widest text-center text-white placeholder-slate-500 focus:outline-none focus:ring-2 transition-all ${signUpErrors.attendance_pin
                              ? 'border-rose-500/80 focus:ring-rose-500/30'
                              : 'border-slate-800 focus:border-blue-500 focus:ring-blue-500/20'
                              }`}
                          />

                          {signUpErrors.attendance_pin && (
                            <p className="text-[11px] text-rose-400 mt-1">
                              {signUpErrors.attendance_pin}
                            </p>
                          )}
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-300 mb-1">
                            Confirm PIN
                          </label>

                          <input
                            type="password"
                            maxLength={6}
                            value={signUpData.confirm_attendance_pin}
                            onChange={(e) => {
                              const val = e.target.value.replace(/\D/g, '')
                              setSignUpData({
                                ...signUpData,
                                confirm_attendance_pin: val,
                              })

                              if (signUpErrors.confirm_attendance_pin) {
                                setSignUpErrors({
                                  ...signUpErrors,
                                  confirm_attendance_pin: '',
                                })
                              }
                            }}
                            placeholder="••••"
                            className={`w-full bg-[#121c29] border rounded-xl px-3.5 py-2.5 text-sm font-mono tracking-widest text-center text-white placeholder-slate-500 focus:outline-none focus:ring-2 transition-all ${signUpErrors.confirm_attendance_pin
                              ? 'border-rose-500/80 focus:ring-rose-500/30'
                              : 'border-slate-800 focus:border-blue-500 focus:ring-blue-500/20'
                              }`}
                          />

                          {signUpErrors.confirm_attendance_pin && (
                            <p className="text-[11px] text-rose-400 mt-1">
                              {signUpErrors.confirm_attendance_pin}
                            </p>
                          )}
                        </div>
                      </div>
                    )}

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

              <div className="text-center mt-6 text-xs text-slate-400 font-medium">
                {activeTab === 'login' ? (
                  <>
                    Don't have an account yet?{' '}
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab('signup')
                        setError('')
                      }}
                      className="text-blue-400 hover:text-blue-300 font-bold transition-colors cursor-pointer ml-1"
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
                      className="text-blue-400 hover:text-blue-300 font-bold transition-colors cursor-pointer ml-1"
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
