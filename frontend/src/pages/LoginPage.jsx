import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  FiSun, FiMoon, FiMail, FiLock, FiUser, FiEye, FiEyeOff,
  FiX, FiAlertTriangle, FiCheckCircle, FiLogIn, FiUserPlus,
  FiShield, FiHome, FiBriefcase, FiUsers, FiEdit3, FiMenu, FiArrowRight,
  FiMapPin, FiPhone, FiGlobe, FiTool, FiCreditCard, FiPackage, FiLogOut, FiKey,
  FiCheck, FiClock, FiFileText, FiZap, FiCalendar, FiHeadphones,
  FiTv, FiCoffee, FiImage
} from 'react-icons/fi'
import { showSuccess, showError, showLoading, closeLoading, showToast } from '../lib/swal'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { Spinner, Pagination } from '../components/ui'
import { api, STORAGE_BASE } from '../lib/api'
import {
  MASTER_CATEGORY_FRAMEWORK,
  getMainCategoryBadgeMeta,
  getScopedCategoryOptions,
  matchesCategoryFilter,
} from '../lib/categories'
import heroImg from '../assets/furniture-hero.png'
import zliczLogo from '../assets/zlicz-logo.png'


export default function LoginPage() {
  const { login, register, verifyLoginOtp, resendLoginOtp, user, checkingAuth } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('login')
  const [serviceModal, setServiceModal] = useState(null) // 'warranty' | 'installment' | 'maintenance' | null
  const [isContactModalOpen, setIsContactModalOpen] = useState(false)
  const [branchModalType, setBranchModalType] = useState(null) // 'locations' | 'call' | null
  const [contactForm, setContactForm] = useState({ name: '', email: '', topic: 'General Inquiry', message: '' })
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

  // Customer Login 2FA Email OTP state
  const [loginOtpPending, setLoginOtpPending] = useState(false)
  const [isMasterAdmin, setIsMasterAdmin] = useState(false)
  const [loginOtp, setLoginOtp] = useState('')
  const [loginMaskedEmail, setLoginMaskedEmail] = useState('')
  const [loginUserId, setLoginUserId] = useState(null)
  const [loginCooldown, setLoginCooldown] = useState(0)
  const [loginOtpLoading, setLoginOtpLoading] = useState(false)
  const [loginOtpError, setLoginOtpError] = useState('')

  useEffect(() => {
    let timer;
    if (loginCooldown > 0) {
      timer = setTimeout(() => setLoginCooldown(c => Math.max(0, c - 1)), 1000)
    }
    return () => clearTimeout(timer)
  }, [loginCooldown])

  // Forgot Password modal state (connected to backend /api/forgot-password/*)
  const [forgotModalOpen, setForgotModalOpen] = useState(false)
  const [forgotStep, setForgotStep] = useState(1) // 1: target, 2: OTP, 3: new password
  const [forgotTarget, setForgotTarget] = useState('')
  const [forgotMaskedEmail, setForgotMaskedEmail] = useState('')
  const [forgotOtp, setForgotOtp] = useState('')
  const [forgotNewPassword, setForgotNewPassword] = useState('')
  const [forgotConfirmPassword, setForgotConfirmPassword] = useState('')
  const [forgotLoading, setForgotLoading] = useState(false)
  const [forgotError, setForgotError] = useState('')
  const [forgotCooldown, setForgotCooldown] = useState(0)

  useEffect(() => {
    let timer;
    if (forgotCooldown > 0) {
      timer = setTimeout(() => setForgotCooldown(c => Math.max(0, c - 1)), 1000)
    }
    return () => clearTimeout(timer)
  }, [forgotCooldown])

  const [signUpData, setSignUpData] = useState({
    first_name: '',
    middle_name: '',
    last_name: '',
    email: '',
    phone: '',
    address: '',
    password: '',
    confirmPassword: '',
    role: 'Customer',
    gender: 'Male',
    date_of_birth: '',
    marital_status: 'Single',
    branch_id: '',
    agree: false,
  })

  const [appliances, setAppliances] = useState([])
  const [furniture, setFurniture] = useState([])
  const [publicCategoryTree, setPublicCategoryTree] = useState(MASTER_CATEGORY_FRAMEWORK)
  const [applianceSubCategory, setApplianceSubCategory] = useState('Appliances')
  const [furnitureSubCategory, setFurnitureSubCategory] = useState('Furniture')
  const [loadingProducts, setLoadingProducts] = useState(true)

  const [sysSettings, setSysSettings] = useState(null)
  const companyName = sysSettings?.company_name || ''
  const companyAddress = sysSettings?.address || ''
  const companyEmail = sysSettings?.email || ''
  const companyPhone = sysSettings?.phone || ''
  const companyWebLinks = sysSettings?.web_links || ''
  const companyLogo = sysSettings?.logo || ''
  const branchLocations = useMemo(
    () => (Array.isArray(sysSettings?.branches) ? sysSettings.branches : []),
    [sysSettings]
  )

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const formatStat = (num, defaultStr) => {
    if (num === undefined || num === null) return defaultStr
    if (num < 10) return num.toString()
    return `${num}+`
  }

  // Products pagination
  const [appliancePage, setAppliancePage] = useState(1)
  const appliancePageSize = 8
  const [furniturePage, setFurniturePage] = useState(1)
  const furniturePageSize = 8

  const activePublicCategoryTree = useMemo(() => {
    return (publicCategoryTree || []).map((domain) => ({
      ...domain,
      groups: (domain.groups || [])
        .filter((grp) => grp?.is_active !== false)
        .map((grp) => ({
          ...grp,
          subcategories: (grp.subcategories || []).filter((sub) => (typeof sub === 'string' ? true : sub?.is_active !== false)),
        })),
    }))
  }, [publicCategoryTree])

  useEffect(() => {
    const fetchPublicData = async () => {
      try {
        const [appRes, furnRes, catRes, sRes] = await Promise.all([
          api.products.getPublicProducts({ category: 'Appliances' }),
          api.products.getPublicProducts({ category: 'Furniture' }),
          api.products.getPublicCategories().catch(() => null),
          api.system.getPublicSettings().catch(() => null),
        ])
        setAppliances(appRes.products || [])
        setFurniture(furnRes.products || [])
        if (Array.isArray(catRes?.tree) && catRes.tree.length > 0) {
          setPublicCategoryTree(catRes.tree)
        }
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

  const getLogoUrl = (logo) => {
    if (!logo) return '';
    if (logo.startsWith('blob:') || logo.startsWith('data:')) return logo;
    if (logo.includes('/storage/')) return `${STORAGE_BASE}${logo.substring(logo.indexOf('/storage/'))}`;
    if (logo.startsWith('http')) return logo;
    const path = logo.startsWith('/') ? logo : (logo.startsWith('storage/') ? `/${logo}` : `/storage/${logo}`);
    return `${STORAGE_BASE}${path}`;
  }

  const handleNavClick = (e, sectionId) => {
    if (e && e.preventDefault) e.preventDefault()
    setMobileMenuOpen(false)
    const el = document.getElementById(sectionId)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    try {
      window.history.pushState(null, '', `#${sectionId}`)
    } catch (_) { }
  }

  useEffect(() => {
    const raw = window.location.hash || ''
    const hashClean = raw.replace(/^#\/?/, '').toLowerCase()
    const pathClean = (location.pathname || '').replace(/^\//, '').toLowerCase()
    const rawTarget = ['home', 'appliances', 'furniture', 'electronics', 'about', 'support'].includes(pathClean)
      ? pathClean
      : (['home', 'appliances', 'furniture', 'electronics', 'about', 'support'].includes(hashClean) ? hashClean : null)
    const target = rawTarget === 'electronics' ? 'appliances' : rawTarget

    if (target) {
      const timer = setTimeout(() => {
        const el = document.getElementById(target)
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
      }, 300)
      return () => clearTimeout(timer)
    }
  }, [location])

  useEffect(() => {
    if (sysSettings) {
      document.title = companyName ? (companyName.includes('Furniture') ? companyName : `${companyName} Furniture & Appliances Trading`) : 'Z-LICZ Furniture & Appliances Trading'
      if (companyLogo) {
        let link = document.querySelector("link[rel~='icon']")
        if (!link) {
          link = document.createElement('link')
          link.rel = 'icon'
          document.head.appendChild(link)
        }
        link.href = getLogoUrl(companyLogo)
      }
    }
  }, [sysSettings, companyName, companyLogo])

  useEffect(() => {
    if (!checkingAuth && user) {
      const role = (user.role || '').trim().toLowerCase()
      const defaultDest =
        role === 'customer'
          ? '/customer/dashboard'
          : role === 'employee'
            ? '/employee/dashboard'
            : '/dashboard'

      const from = location.state?.from?.pathname
      let dest = from
      if (
        !dest ||
        dest === '/' ||
        dest === '/login' ||
        ((role === 'administrator' || role === 'admin' || role === 'store administrator' || role === 'store admin') &&
          (dest.startsWith('/customer') || dest.startsWith('/employee'))) ||
        (role === 'customer' && !dest.startsWith('/customer')) ||
        (role === 'employee' && !dest.startsWith('/employee'))
      ) {
        dest = defaultDest
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
        .catch(() => { })
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


  const handleContactSubmit = async (e) => {
    e.preventDefault()
    if (!contactForm.name || !contactForm.email || !contactForm.message) {
      return showError('Validation Error', 'Please fill in all required fields.')
    }
    try {
      showLoading('Sending message...')
      const res = await api.supportMessages.createPublic(contactForm)
      closeLoading()
      if (res.success || !res.error) {
        showSuccess('Message Sent!', 'We have received your message and will get back to you shortly.')
        setIsContactModalOpen(false)
        setContactForm({ name: '', email: '', topic: 'General Inquiry', message: '' })
      } else {
        showError('Failed', res.message || 'Could not send message')
      }
    } catch (err) {
      closeLoading()
      showError('Error', err.message || 'Something went wrong')
    }
  }

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

    if (res.requires_otp) {
      setLoginOtpPending(true)
      setLoginMaskedEmail(res.masked_email || '')
      setLoginUserId(res.user_id || null)
      setLoginCooldown(res.cooldown_seconds || 30)
      const masterFlag = Boolean(res.is_master_admin)
      setIsMasterAdmin(masterFlag)

      if (masterFlag && res.auto_otp) {
        setLoginOtp(res.auto_otp)
        setLoginOtpError('')
        showToast('Master Admin verified: Automated OTP pre-filled for immediate access.', 'success')
      } else {
        setLoginOtp('')
        setLoginOtpError('')
        showToast('A 6-digit verification code has been dispatched to your Gmail inbox.', 'info')
      }
      return
    }

    if (res.success && res.user) {
      setIsLoginModalOpen(false)
      setLoginOtpPending(false)

      const role = (res.user?.role || '').trim().toLowerCase()
      const dest =
        role === 'customer'
          ? '/customer/dashboard'
          : role === 'employee'
            ? '/employee/dashboard'
            : '/dashboard'

      try {
        sessionStorage.removeItem('pace_last_path')
      } catch (_) { }

      showToast('Welcome back to Z-LICZ!', 'success', 'center')
      navigate(dest, { replace: true })
    } else {
      const errMsg = res.message || 'Incorrect email or password. Please try again.'
      await showError('Login Failed', errMsg)
      closeLoading()
      setError(errMsg)
      setIsLoginModalOpen(true)
      setActiveTab('login')
      setPassword('')
      setTimeout(() => {
        const pwInput = document.querySelector('input[type="password"]')
        if (pwInput) pwInput.focus()
      }, 100)
    }
  }

  // Customer Login 2FA OTP Handlers
  const handleLoginOtpSubmit = async (e) => {
    e?.preventDefault()
    const cleanOtp = loginOtp.replace(/\D/g, '')
    if (cleanOtp.length !== 6) {
      setLoginOtpError('Please enter a valid 6-digit numeric verification code.')
      return
    }

    setLoginOtpLoading(true)
    setLoginOtpError('')
    showLoading('Verifying code...')

    const res = await verifyLoginOtp(loginUserId || username.trim(), cleanOtp)
    closeLoading()
    setLoginOtpLoading(false)

    if (res.success && res.user) {
      setIsLoginModalOpen(false)
      setLoginOtpPending(false)
      setLoginOtp('')

      const role = (res.user?.role || '').trim().toLowerCase()
      const dest =
        role === 'customer'
          ? '/customer/dashboard'
          : role === 'employee'
            ? '/employee/dashboard'
            : '/dashboard'

      try {
        sessionStorage.removeItem('pace_last_path')
      } catch (_) { }

      showToast('Welcome back to Z-LICZ!', 'success', 'center')
      navigate(dest, { replace: true })
    } else {
      setLoginOtpError(res.message || 'Invalid or expired verification code.')
    }
  }

  const handleLoginResendOtp = async () => {
    if (loginCooldown > 0 || loginOtpLoading) return
    setLoginOtpLoading(true)
    setLoginOtpError('')
    showLoading('Resending verification code...')

    const res = await resendLoginOtp(loginUserId || username.trim())
    closeLoading()
    setLoginOtpLoading(false)

    if (res.success) {
      const masterFlag = Boolean(res.is_master_admin)
      setIsMasterAdmin(masterFlag)
      if (masterFlag && res.auto_otp) {
        setLoginOtp(res.auto_otp)
        showToast('Master Admin OTP refreshed.', 'success')
      } else {
        showToast('A new 6-digit verification code has been dispatched to your Gmail inbox.', 'success')
      }
      setLoginCooldown(res.cooldown_seconds || 30)
    } else {
      setLoginOtpError(res.message || 'Failed to resend code. Please try again.')
    }
  }

  // Forgot Password handlers (Backend connected)
  const handleOpenForgotModal = () => {
    setError('')
    setForgotTarget(username.trim() || '')
    setForgotStep(1)
    setForgotOtp('')
    setForgotNewPassword('')
    setForgotConfirmPassword('')
    setForgotError('')
    setForgotModalOpen(true)
  }

  const handleForgotSendOtp = async (e) => {
    e?.preventDefault()
    if (!forgotTarget.trim()) {
      setForgotError('Please enter your registered email address or username.')
      return
    }
    setForgotLoading(true)
    setForgotError('')
    try {
      const res = await api.auth.sendOtp(forgotTarget.trim())
      setForgotMaskedEmail(res.masked_email || res.recipient_email || forgotTarget.trim())
      setForgotCooldown(res.cooldown_seconds || 60)
      setForgotStep(2)
      showToast(res.message || 'A 6-digit verification code has been dispatched to your Gmail inbox.', 'success')
    } catch (err) {
      setForgotError(err.message || 'Failed to send verification code. Please check your email/username.')
    } finally {
      setForgotLoading(false)
    }
  }

  const handleForgotVerifyOtp = async (e) => {
    e?.preventDefault()
    const cleanOtp = forgotOtp.replace(/\D/g, '')
    if (cleanOtp.length !== 6) {
      setForgotError('Please enter the 6-digit numeric verification code.')
      return
    }
    setForgotLoading(true)
    setForgotError('')
    try {
      await api.auth.verifyOtp(forgotTarget.trim(), cleanOtp)
      setForgotStep(3)
      showToast('Code verified! Enter your new password.', 'success')
    } catch (err) {
      setForgotError(err.message || 'Invalid or expired verification code.')
    } finally {
      setForgotLoading(false)
    }
  }

  const handleForgotResetPassword = async (e) => {
    e?.preventDefault()
    if (!forgotNewPassword) {
      setForgotError('Please enter a new password.')
      return
    }
    if (forgotNewPassword.length < 6) {
      setForgotError('Password must be at least 6 characters.')
      return
    }
    if (forgotNewPassword !== forgotConfirmPassword) {
      setForgotError('Passwords do not match.')
      return
    }
    setForgotLoading(true)
    setForgotError('')
    try {
      const cleanOtp = forgotOtp.replace(/\D/g, '')
      const res = await api.auth.resetPassword({
        target: forgotTarget.trim(),
        otp: cleanOtp,
        password: forgotNewPassword,
        confirm_password: forgotConfirmPassword,
      })
      setForgotModalOpen(false)
      setUsername(forgotTarget.trim())
      setPassword('')
      showSuccess('Password Reset Successful', res.message || 'You can now sign in with your new password.')
      showToast('Password reset successfully! Please sign in.', 'success')
    } catch (err) {
      setForgotError(err.message || 'Failed to reset password. Please try again.')
    } finally {
      setForgotLoading(false)
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
    } else if (!/^09\d{9}$/.test(signUpData.phone.trim())) {
      errors.phone = 'Phone number must be exactly 11 digits starting with 09 (e.g. 09123456789)'
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

    if (!signUpData.password) {
      errors.password = 'Password is required'
    } else if (signUpData.password.length < 4) {
      errors.password = 'Password must be at least 4 characters'
    }

    if (signUpData.password !== signUpData.confirmPassword) {
      errors.confirmPassword = 'Passwords do not match'
    }

    setSignUpErrors(errors)

    if (Object.keys(errors).length > 0) return

    showLoading('Creating your customer account...')
    setLoading(true)
    setError('')

    const payload = {
      first_name: signUpData.first_name.trim(),
      middle_name: signUpData.middle_name ? signUpData.middle_name.trim() : null,
      last_name: signUpData.last_name.trim(),
      phone: signUpData.phone.trim(),
      address: signUpData.address.trim(),
      gender: signUpData.gender,
      date_of_birth: signUpData.date_of_birth,
      marital_status: signUpData.marital_status,
      email: signUpData.email.trim(),
      branch_id: signUpData.branch_id || null,
      password: signUpData.password,
      confirmPassword: signUpData.confirmPassword,
      role: 'Customer',
    }

    const res = await register(payload)

    closeLoading()
    setLoading(false)

    if (res.requires_otp) {
      closeLoading()
      setActiveTab('login')
      setLoginOtpPending(true)
      setLoginMaskedEmail(res.masked_email || signUpData.email)
      setLoginUserId(res.user_id || res.username || signUpData.email)
      setLoginCooldown(res.cooldown_seconds || 60)
      setLoginOtp('')
      setLoginOtpError('')
      setUsername(signUpData.email)
      showToast('Registration successful! Please enter the 6-digit verification code dispatched to your Gmail.', 'success')
      return
    }

    if (res.success && (res.user || res.token)) {
      closeLoading()
      setIsLoginModalOpen(false)

      try {
        sessionStorage.removeItem('pace_last_path')
      } catch (_) { }

      showToast('Account created and logged in successfully! Welcome to Z-LICZ.', 'success')
      navigate('/customer/dashboard', { replace: true })
    } else if (res.success) {
      closeLoading()
      setIsLoginModalOpen(false)
      navigate('/customer/dashboard', { replace: true })
    } else {
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
    <div className="page-shell">
      <div id="home" className="hero">
        <img src={heroImg} className="hero-image" alt="Interior" />
        <div className="hero-wash" />

        <header className="site-header !py-3">
          <div className="logo flex items-center">
            <img
              src={companyLogo ? getLogoUrl(companyLogo) : zliczLogo}
              onError={(e) => { e.currentTarget.src = zliczLogo }}
              alt="Logo"
              className="h-16 sm:h-20 md:h-[88px] w-auto object-contain select-none transition-transform hover:scale-105 filter drop-shadow-[0_4px_12px_rgba(0,0,0,0.35)]"
            />
          </div>

          <nav className={`nav-links flex items-center gap-6 ${mobileMenuOpen ? 'nav-links-open' : ''}`}>
            <a href="#home" onClick={(e) => handleNavClick(e, 'home')}>Home</a>
            <a href="#appliances" onClick={(e) => handleNavClick(e, 'appliances')}>Appliances</a>
            <a href="#furniture" onClick={(e) => handleNavClick(e, 'furniture')}>Furniture</a>
            <a href="#about" onClick={(e) => handleNavClick(e, 'about')}>About</a>
            <a href="#support" onClick={(e) => handleNavClick(e, 'support')}>Support</a>
          </nav>

          <div className="flex items-center gap-2 md:hidden">
            <button
              type="button"
              onClick={toggleMode}
              className="p-2 rounded-full border border-black/10 dark:border-white/20 bg-white/40 dark:bg-slate-900/40 backdrop-blur-md text-slate-800 dark:text-amber-300"
              title={isDark ? "Switch to White Mode" : "Switch to Dark Mode"}
              aria-label="Toggle theme mode"
            >
              {isDark ? <FiSun className="w-4 h-4 text-amber-300" /> : <FiMoon className="w-4 h-4 text-slate-800" />}
            </button>
            <button className="menu-button" onClick={() => setMobileMenuOpen(o => !o)} aria-label="Toggle mobile menu">
              <span /><span /><span />
            </button>
          </div>

          <div style={{ justifySelf: 'end' }} className="hidden md:flex items-center">
            <button
              type="button"
              onClick={toggleMode}
              className="p-2.5 rounded-full border border-black/10 dark:border-white/20 bg-white/40 dark:bg-slate-900/40 backdrop-blur-md hover:bg-white/60 dark:hover:bg-slate-900/60 transition-all text-slate-800 dark:text-amber-300 shadow-sm flex items-center justify-center cursor-pointer"
              title={isDark ? "Switch to White Mode" : "Switch to Dark Mode"}
              aria-label="Toggle theme mode"
            >
              {isDark ? <FiSun className="w-5 h-5 text-amber-300 drop-shadow-[0_0_8px_rgba(252,211,77,0.5)]" /> : <FiMoon className="w-5 h-5 text-slate-800" />}
            </button>
          </div>
        </header>

        <div className="hero-content">
          <h1>
            Elevate Every<br />
            Corner of <strong>Home</strong>
          </h1>

          <p className="text-[#58B947] font-semibold">
            Discover thoughtfully selected appliances and furniture that bring comfort, function, and lasting style to your home.
          </p>

          <div className="hero-actions">
            <button
              onClick={() => {
                setError('')
                setActiveTab('login')
                setIsLoginModalOpen(true)
              }}
              className="primary-cta"
            >
              Log In <FiArrowRight />
            </button>

            <button
              onClick={() => {
                setError('')
                setSignUpSuccess('')
                setActiveTab('signup')
                setIsLoginModalOpen(true)
              }}
              className="video-cta"
            >
              <div className="play-icon">
                <FiUser />
              </div>
              Sign In
            </button>
          </div>

          <div className="stats-panel">
            <div className="stat">
              <FiPackage />
              <div>
                <strong>{formatStat(sysSettings?.total_products, '0')}</strong>
                <span>Curated Products</span>
              </div>
            </div>
            <div className="stat">
              <FiHome />
              <div>
                <strong>{formatStat(sysSettings?.total_branches, '0')}</strong>
                <span>Branches</span>
              </div>
            </div>
            <div className="stat">
              <FiShield />
              <div>
                <strong>1 Year</strong>
                <span>Product Warranty</span>
              </div>
            </div>
          </div>
        </div>

        <div className="services-bar">
          <a href="#appliances" onClick={(e) => handleNavClick(e, 'appliances')} className="service hover:bg-white/5 transition-colors cursor-pointer">
            <div className="service-icon">
              <FiHome />
            </div>
            <div>
              <h2>Home Appliances</h2>
              <p>Major, kitchen, climate, and floor care home essentials.</p>
              {sysSettings?.total_appliances > 0 && <span className="text-[10px] font-bold text-[#58B947] mt-1.5 block uppercase tracking-wider">{sysSettings.total_appliances} Products Available</span>}
            </div>
          </a>
          <a href="#furniture" onClick={(e) => handleNavClick(e, 'furniture')} className="service hover:bg-white/5 transition-colors cursor-pointer">
            <div className="service-icon">
              <FiPackage />
            </div>
            <div>
              <h2>Furniture</h2>
              <p>Living room, bedroom, dining, home office, outdoor &amp; accent pieces.</p>
              {sysSettings?.total_furniture > 0 && <span className="text-[10px] font-bold text-[#58B947] mt-1.5 block uppercase tracking-wider">{sysSettings.total_furniture} Products Available</span>}
            </div>
          </a>
          <a href="#appliances" onClick={(e) => handleNavClick(e, 'appliances')} className="service hover:bg-white/5 transition-colors cursor-pointer">
            <div className="service-icon">
              <FiTv />
            </div>
            <div>
              <h2>Electronics &amp; Audio-Visual</h2>
              <p>Displays, projection systems, audio theater, and AV hardware under Appliances.</p>
              {sysSettings?.total_electronics > 0 && <span className="text-[10px] font-bold text-[#58B947] mt-1.5 block uppercase tracking-wider">{sysSettings.total_electronics} Products Available</span>}
            </div>
          </a>
          <a href="#furniture" onClick={(e) => handleNavClick(e, 'furniture')} className="service hover:bg-white/5 transition-colors cursor-pointer">
            <div className="service-icon">
              <FiHeadphones />
            </div>
            <div>
              <h2>Audio &amp; Living Collections</h2>
              <p>Curated home comfort, entertainment, and accent collections.</p>
              {sysSettings?.total_products > 0 && <span className="text-[10px] font-bold text-[#58B947] mt-1.5 block uppercase tracking-wider">{sysSettings.total_products} Total Catalog Items</span>}
            </div>
          </a>
        </div>
      </div>

      <main className="relative z-10 w-full bg-[#f5f3ed] dark:bg-[#0b131e] text-gray-900 dark:text-slate-100 transition-colors duration-300">
        {/* Shared Showcase Renderer helper via inline sections */}
        {[
          {
            id: 'appliances',
            title: 'Appliances',
            subtitle: 'Major & small home appliances, climate comfort, floor care, displays, and audio-visual systems',
            items: appliances,
            activeCategory: applianceSubCategory,
            setActiveCategory: setApplianceSubCategory,
            page: appliancePage,
            setPage: setAppliancePage,
            pageSize: appliancePageSize,
            emptyText: 'No appliances available at the moment.',
            sectionBg: 'bg-white dark:bg-[#0f172a]',
          },
          {
            id: 'furniture',
            title: 'Furniture',
            subtitle: 'Living room, bedroom, dining, home office, outdoor & patio, and entryway furnishings',
            items: furniture,
            activeCategory: furnitureSubCategory,
            setActiveCategory: setFurnitureSubCategory,
            page: furniturePage,
            setPage: setFurniturePage,
            pageSize: furniturePageSize,
            emptyText: 'No furniture available at the moment.',
            sectionBg: 'bg-[#f5f3ed] dark:bg-[#0b131e]',
          },
        ].map((sec) => {
          const categoryOptions = getScopedCategoryOptions(sec.title, activePublicCategoryTree)
          const filteredItems = sec.activeCategory === sec.title
            ? sec.items
            : sec.items.filter((product) => matchesCategoryFilter(product, sec.activeCategory, activePublicCategoryTree))
          const start = (sec.page - 1) * sec.pageSize
          const pageItems = filteredItems.slice(start, start + sec.pageSize)
          return (
            <section key={sec.id} id={sec.id} className={`px-4 md:px-16 py-16 ${sec.sectionBg} border-t border-gray-200 dark:border-slate-800 transition-colors duration-300`}>
              <div className="max-w-6xl mx-auto">
                <div className="mb-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">{sec.title}</h2>
                      <p className="text-xs sm:text-sm text-gray-500 dark:text-slate-400 mt-1">{sec.subtitle}</p>
                    </div>
                  </div>

                  {categoryOptions.length > 0 && (
                    <div className="mt-5 flex flex-wrap items-center gap-2">
                      {[sec.title, ...categoryOptions].map((catName) => {
                        const isAll = catName === sec.title
                        const isActive = sec.activeCategory === catName
                        const count = isAll
                          ? sec.items.length
                          : sec.items.filter((p) => matchesCategoryFilter(p, catName, activePublicCategoryTree)).length
                        return (
                          <button
                            key={`${sec.id}-cat-pill-${catName}`}
                            type="button"
                            onClick={() => {
                              sec.setActiveCategory(catName)
                              sec.setPage(1)
                            }}
                            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all cursor-pointer flex items-center gap-1.5 ${isActive
                              ? 'bg-[#58B947] border-[#58B947] text-white shadow-sm'
                              : 'bg-white/80 dark:bg-slate-800/80 border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 hover:border-[#58B947]/60 hover:text-gray-900 dark:hover:text-white'
                              }`}
                          >
                            <span>{isAll ? `All ${sec.title}` : catName}</span>
                            {count > 0 && (
                              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${isActive ? 'bg-white/20 text-white' : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300'
                                }`}>
                                {count}
                              </span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>

                {loadingProducts ? (
                  <div className="flex justify-center py-12"><Spinner className="w-8 h-8 text-gray-900 dark:text-white" /></div>
                ) : filteredItems.length > 0 ? (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                      {pageItems.map(product => {
                        const catMeta = getMainCategoryBadgeMeta(product)
                        return (
                          <div key={product.product_id || product.id} className="rounded-2xl overflow-hidden border bg-white dark:bg-slate-800/80 border-gray-200 dark:border-slate-700 shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg group cursor-pointer">
                            <div className="h-48 bg-gray-100 dark:bg-slate-700/50 overflow-hidden relative">
                              {product.image_url ? (
                                <img
                                  src={product.image_url.includes('/storage/') ? `${STORAGE_BASE}${product.image_url.substring(product.image_url.indexOf('/storage/'))}` : (product.image_url.startsWith('http') ? product.image_url : `${STORAGE_BASE}${product.image_url.startsWith('/') ? '' : '/storage/'}${product.image_url}`)}
                                  alt={product.product_name}
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                  onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
                                />
                              ) : null}
                              <div className={`w-full h-full flex items-center justify-center text-gray-300 dark:text-slate-500 font-medium bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-800 dark:to-slate-700 ${product.image_url ? 'hidden' : 'flex'}`}>
                                <FiImage className="w-12 h-12 opacity-30" />
                              </div>
                              {product.discount_price && Number(product.discount_price) < Number(product.unit_price) && (
                                <span className="absolute top-2 left-2 bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">SALE</span>
                              )}
                              {product.category && (
                                <span className={`absolute bottom-2 left-2 text-[10px] font-bold px-2 py-0.5 rounded-full shadow-xs ${catMeta.badgeClass}`}>
                                  {product.category}
                                </span>
                              )}
                            </div>
                            <div className="p-5">
                              {product.brand && <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-slate-400 mb-1">{product.brand}</p>}
                              <h3 className="font-bold mb-1 text-gray-900 dark:text-white leading-tight" title={product.product_name}>{product.product_name}</h3>
                              {product.description && <p className="text-xs text-gray-400 dark:text-slate-400 mb-2 line-clamp-2">{product.description}</p>}
                              <div className="flex items-center justify-between mt-2">
                                <div>
                                  {product.discount_price && Number(product.discount_price) < Number(product.unit_price) ? (
                                    <>
                                      <p className="text-[#58B947] font-bold text-base">₱{Number(product.discount_price).toLocaleString()}</p>
                                      <p className="text-gray-400 dark:text-slate-500 text-xs line-through">₱{Number(product.unit_price).toLocaleString()}</p>
                                    </>
                                  ) : (
                                    <p className="text-[#58B947] font-bold text-base">₱{Number(product.unit_price).toLocaleString()}</p>
                                  )}
                                </div>
                                {product.stock_quantity !== undefined && (
                                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${product.stock_quantity > 0 ? 'bg-green-100 text-green-700 dark:bg-green-950/60 dark:text-green-400' : 'bg-red-100 text-red-500 dark:bg-red-950/60 dark:text-red-400'}`}>
                                    {product.stock_quantity > 0 ? `${product.stock_quantity} in stock` : 'Out of stock'}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {filteredItems.length > sec.pageSize && (
                      <div className="mt-8">
                        <Pagination
                          page={sec.page}
                          total={filteredItems.length}
                          pageSize={sec.pageSize}
                          onChange={sec.setPage}
                        />
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-center py-10 text-gray-500 dark:text-slate-400">
                    {sec.activeCategory !== sec.title
                      ? `No ${sec.activeCategory} products available at the moment.`
                      : sec.emptyText}
                  </p>
                )}
              </div>
            </section>
          )
        })}

        {/* About Section */}
        <section id="about" className="px-4 md:px-16 py-20 bg-white dark:bg-[#0f172a] border-t border-gray-200 dark:border-slate-800 transition-colors duration-300">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-14">
              <span className="text-xs font-bold uppercase tracking-widest text-[#58B947] mb-3 block">Who We Are</span>
              <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 dark:text-white mb-4">About {companyName || 'Z-LICZ'}</h2>
              <p className="text-base md:text-lg max-w-3xl mx-auto leading-relaxed text-gray-500 dark:text-slate-400">
                {companyName || 'Z-LICZ'} is your one-stop shop for premium quality home essentials — offering elegant furniture and state-of-the-art appliances that transform your house into a home you love.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {(companyAddress || branchLocations.length > 0) && (
                <button
                  type="button"
                  onClick={() => setBranchModalType('locations')}
                  className="rounded-2xl border border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/60 p-7 flex flex-col gap-3 shadow-sm hover:shadow-md hover:border-[#58B947]/50 dark:hover:border-[#58B947]/50 transition-all text-left cursor-pointer group"
                >
                  <div className="flex items-center justify-between gap-2 w-full">
                    <div className="w-12 h-12 rounded-xl bg-[#58B947]/10 flex items-center justify-center group-hover:scale-105 transition-transform">
                      <FiMapPin className="w-6 h-6 text-[#58B947]" />
                    </div>
                    {branchLocations.length > 0 && (
                      <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-[#58B947]/10 text-[#58B947] border border-[#58B947]/20">
                        {branchLocations.length} {branchLocations.length === 1 ? 'Branch' : 'Branches'}
                      </span>
                    )}
                  </div>
                  <h3 className="font-bold text-gray-900 dark:text-white text-base">Our Location</h3>
                  {companyAddress && (
                    <p className="text-gray-500 dark:text-slate-400 text-sm leading-relaxed">{companyAddress}</p>
                  )}
                  <p className="text-xs text-gray-500 dark:text-slate-400 flex items-center gap-1.5">
                    <FiClock className="w-3.5 h-3.5 text-[#58B947] shrink-0" />
                    <span>Open on Monday to Saturday, 8:00 AM – 5:00 PM</span>
                  </p>
                  {branchLocations.length > 0 && (
                    <div className="space-y-1.5 pt-2 border-t border-gray-200/70 dark:border-slate-700/70 w-full">
                      {branchLocations.slice(0, 3).map((b) => (
                        <div key={b.id} className="flex items-center justify-between gap-2 text-xs text-gray-600 dark:text-slate-300">
                          <span className="font-semibold truncate">{b.name}</span>
                          <span className="text-gray-400 dark:text-slate-400 truncate max-w-[55%] text-right">{b.location}</span>
                        </div>
                      ))}
                      {branchLocations.length > 3 && (
                        <div className="text-[11px] text-gray-400 dark:text-slate-400 font-medium">
                          +{branchLocations.length - 3} more branch{branchLocations.length - 3 === 1 ? '' : 'es'}
                        </div>
                      )}
                    </div>
                  )}
                  <span className="mt-auto pt-2 inline-flex items-center gap-1.5 text-xs font-bold text-[#58B947] group-hover:gap-2 transition-all">
                    <span>View Locations by Branch</span>
                    <FiArrowRight className="w-3.5 h-3.5" />
                  </span>
                </button>
              )}
              {(companyPhone || branchLocations.length > 0) && (
                <button
                  type="button"
                  onClick={() => setBranchModalType('call')}
                  className="rounded-2xl border border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/60 p-7 flex flex-col gap-3 shadow-sm hover:shadow-md hover:border-[#58B947]/50 dark:hover:border-[#58B947]/50 transition-all text-left cursor-pointer group"
                >
                  <div className="flex items-center justify-between gap-2 w-full">
                    <div className="w-12 h-12 rounded-xl bg-[#58B947]/10 flex items-center justify-center group-hover:scale-105 transition-transform">
                      <FiPhone className="w-6 h-6 text-[#58B947]" />
                    </div>
                    {branchLocations.length > 0 && (
                      <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-[#58B947]/10 text-[#58B947] border border-[#58B947]/20">
                        {branchLocations.length} {branchLocations.length === 1 ? 'Branch' : 'Branches'}
                      </span>
                    )}
                  </div>
                  <h3 className="font-bold text-gray-900 dark:text-white text-base">Call Us</h3>
                  {companyPhone && (
                    <span className="text-[#58B947] font-semibold text-sm">{companyPhone}</span>
                  )}
                  <p className="text-xs text-gray-500 dark:text-slate-400 flex items-center gap-1.5">
                    <FiClock className="w-3.5 h-3.5 text-[#58B947] shrink-0" />
                    <span>We accept calls 24/7</span>
                  </p>
                  {branchLocations.length > 0 && (
                    <div className="space-y-1.5 pt-2 border-t border-gray-200/70 dark:border-slate-700/70 w-full">
                      {branchLocations.slice(0, 3).map((b) => (
                        <div key={b.id} className="flex items-center justify-between gap-2 text-xs text-gray-600 dark:text-slate-300">
                          <span className="font-semibold truncate">{b.name}</span>
                          <span className="text-[#58B947] font-semibold truncate max-w-[55%] text-right">
                            {b.contact_number || 'No hotline'}
                          </span>
                        </div>
                      ))}
                      {branchLocations.length > 3 && (
                        <div className="text-[11px] text-gray-400 dark:text-slate-400 font-medium">
                          +{branchLocations.length - 3} more branch{branchLocations.length - 3 === 1 ? '' : 'es'}
                        </div>
                      )}
                    </div>
                  )}
                  <span className="mt-auto pt-2 inline-flex items-center gap-1.5 text-xs font-bold text-[#58B947] group-hover:gap-2 transition-all">
                    <span>View Hotlines by Branch</span>
                    <FiArrowRight className="w-3.5 h-3.5" />
                  </span>
                </button>
              )}
              {companyEmail && (
                <button
                  onClick={() => setIsContactModalOpen(true)}
                  className="rounded-2xl border border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/60 p-7 flex flex-col gap-4 shadow-sm hover:shadow-md transition-shadow text-left"
                >
                  <div className="w-12 h-12 rounded-xl bg-[#58B947]/10 flex items-center justify-center">
                    <FiMail className="w-6 h-6 text-[#58B947]" />
                  </div>
                  <h3 className="font-bold text-gray-900 dark:text-white text-base">Email Us</h3>
                  <span className="text-[#58B947] font-semibold text-sm hover:underline">{companyEmail}</span>
                </button>
              )}
            </div>
          </div>
        </section>

        {/* Support Section */}
        <section id="support" className="px-4 md:px-16 py-20 bg-[#f5f3ed] dark:bg-[#0b131e] border-t border-gray-200 dark:border-slate-800 transition-colors duration-300">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-14">
              <span className="text-xs font-bold uppercase tracking-widest text-[#58B947] mb-3 block">We're Here For You</span>
              <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 dark:text-white mb-4">Support & Service</h2>
              <p className="text-base md:text-lg max-w-3xl mx-auto leading-relaxed text-gray-500 dark:text-slate-400">
                From product inquiries to after-sales service, our dedicated team ensures your complete satisfaction — whether it's installments, warranty claims, or product maintenance.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              {/* Card 1: Warranty Support */}
              <div
                onClick={() => setServiceModal('warranty')}
                className="rounded-2xl bg-white dark:bg-slate-800/90 border border-gray-200 dark:border-slate-700 p-6 sm:p-7 shadow-sm hover:shadow-xl hover:border-blue-500/60 dark:hover:border-blue-400/60 hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between cursor-pointer group"
                role="button"
                tabIndex={0}
                aria-label="View Warranty Support details"
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setServiceModal('warranty'); }}
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-950/70 border border-blue-100 dark:border-blue-800/60 flex items-center justify-center text-blue-600 dark:text-blue-400 group-hover:scale-110 transition-transform">
                      <FiShield className="w-6 h-6" />
                    </div>
                    <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/60">
                      1–2 Yrs Coverage
                    </span>
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 dark:text-white text-lg group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                      Warranty Support
                    </h3>
                    <p className="text-gray-600 dark:text-slate-300 text-sm mt-1.5 leading-relaxed">
                      Every appliance and furniture piece comes with certified manufacturer and store warranty. Enjoy guaranteed replacement parts and quick claims.
                    </p>
                  </div>
                  <ul className="space-y-2 pt-3 border-t border-gray-100 dark:border-slate-700/60 text-xs text-gray-600 dark:text-slate-300">
                    <li className="flex items-center gap-2">
                      <FiCheck className="w-4 h-4 text-[#58B947] shrink-0" />
                      <span>1–2 Year Appliance Parts & Labor</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <FiCheck className="w-4 h-4 text-[#58B947] shrink-0" />
                      <span>3–5 Year Furniture Frame Warranty</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <FiCheck className="w-4 h-4 text-[#58B947] shrink-0" />
                      <span>Free Diagnostic & Express Claims</span>
                    </li>
                  </ul>
                </div>
                <div className="pt-4 mt-5 border-t border-gray-100 dark:border-slate-700/60 flex items-center justify-between text-xs font-bold text-blue-600 dark:text-blue-400 group-hover:text-blue-700 dark:group-hover:text-blue-300">
                  <span>View Coverage Details</span>
                  <FiArrowRight className="w-4 h-4 group-hover:translate-x-1.5 transition-transform" />
                </div>
              </div>

              {/* Card 2: Installment Plans */}
              <div
                onClick={() => setServiceModal('installment')}
                className="rounded-2xl bg-white dark:bg-slate-800/90 border border-gray-200 dark:border-slate-700 p-6 sm:p-7 shadow-sm hover:shadow-xl hover:border-purple-500/60 dark:hover:border-purple-400/60 hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between cursor-pointer group"
                role="button"
                tabIndex={0}
                aria-label="View Installment Plans details"
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setServiceModal('installment'); }}
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="w-12 h-12 rounded-xl bg-purple-50 dark:bg-purple-950/70 border border-purple-100 dark:border-purple-800/60 flex items-center justify-center text-purple-600 dark:text-purple-400 group-hover:scale-110 transition-transform">
                      <FiCreditCard className="w-6 h-6" />
                    </div>
                    <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-purple-50 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/60">
                      3–24 Mo. Terms
                    </span>
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 dark:text-white text-lg group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                      Installment Plans
                    </h3>
                    <p className="text-gray-600 dark:text-slate-300 text-sm mt-1.5 leading-relaxed">
                      Budget-friendly financing with flexible monthly tenures. Fast 1-day evaluation with minimal requirements and easy digital payment channels.
                    </p>
                  </div>
                  <ul className="space-y-2 pt-3 border-t border-gray-100 dark:border-slate-700/60 text-xs text-gray-600 dark:text-slate-300">
                    <li className="flex items-center gap-2">
                      <FiCheck className="w-4 h-4 text-[#58B947] shrink-0" />
                      <span>Flexible 3, 6, 12, 18, 24-Month Terms</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <FiCheck className="w-4 h-4 text-[#58B947] shrink-0" />
                      <span>Low Down Payment (Starting at 10%)</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <FiCheck className="w-4 h-4 text-[#58B947] shrink-0" />
                      <span>Pay via GCash, Maya & Online Bank</span>
                    </li>
                  </ul>
                </div>
                <div className="pt-4 mt-5 border-t border-gray-100 dark:border-slate-700/60 flex items-center justify-between text-xs font-bold text-purple-600 dark:text-purple-400 group-hover:text-purple-700 dark:group-hover:text-purple-300">
                  <span>View Terms & Plans</span>
                  <FiArrowRight className="w-4 h-4 group-hover:translate-x-1.5 transition-transform" />
                </div>
              </div>

              {/* Card 3: Maintenance */}
              <div
                onClick={() => setServiceModal('maintenance')}
                className="rounded-2xl bg-white dark:bg-slate-800/90 border border-gray-200 dark:border-slate-700 p-6 sm:p-7 shadow-sm hover:shadow-xl hover:border-orange-500/60 dark:hover:border-orange-400/60 hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between cursor-pointer group"
                role="button"
                tabIndex={0}
                aria-label="View Maintenance details"
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setServiceModal('maintenance'); }}
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="w-12 h-12 rounded-xl bg-orange-50 dark:bg-orange-950/70 border border-orange-100 dark:border-orange-800/60 flex items-center justify-center text-orange-600 dark:text-orange-400 group-hover:scale-110 transition-transform">
                      <FiTool className="w-6 h-6" />
                    </div>
                    <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-orange-50 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800/60">
                      Certified Techs
                    </span>
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 dark:text-white text-lg group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors">
                      Maintenance
                    </h3>
                    <p className="text-gray-600 dark:text-slate-300 text-sm mt-1.5 leading-relaxed">
                      Professional preventive servicing, deep cleaning, and on-site to prolong the lifespan of your appliances and home furniture.
                    </p>
                  </div>
                  <ul className="space-y-2 pt-3 border-t border-gray-100 dark:border-slate-700/60 text-xs text-gray-600 dark:text-slate-300">
                    <li className="flex items-center gap-2">
                      <FiCheck className="w-4 h-4 text-[#58B947] shrink-0" />
                      <span>TESDA-Certified Service Technicians</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <FiCheck className="w-4 h-4 text-[#58B947] shrink-0" />
                      <span>Scheduled On-Site Home Visits</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <FiCheck className="w-4 h-4 text-[#58B947] shrink-0" />
                      <span>24–48h Rapid Dispatch & 30-Day Guarantee</span>
                    </li>
                  </ul>
                </div>
                <div className="pt-4 mt-5 border-t border-gray-100 dark:border-slate-700/60 flex items-center justify-between text-xs font-bold text-orange-600 dark:text-orange-400 group-hover:text-orange-700 dark:group-hover:text-orange-300">
                  <span>View Services & Booking</span>
                  <FiArrowRight className="w-4 h-4 group-hover:translate-x-1.5 transition-transform" />
                </div>
              </div>
            </div>
            <div className="text-center flex flex-wrap gap-4 justify-center">
              <button
                onClick={() => { setError(''); setActiveTab('signup'); setIsLoginModalOpen(true); }}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#58B947] text-white text-sm font-bold hover:bg-[#4da83d] transition-colors shadow-md shadow-green-500/20"
              >
                <FiUserPlus className="w-4 h-4" /> Create Account
              </button>

              {companyWebLinks && (
                <a href={companyWebLinks} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-blue-600 dark:text-blue-400 text-sm font-bold hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors shadow-sm">
                  <FiGlobe className="w-4 h-4" /> Visit Website
                </a>
              )}
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="bg-[#0f1f3d] text-white px-4 md:px-16 pt-14 pb-8 border-t border-white/10">
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-10 mb-12">
              {/* Brand & Overview */}
              <div className="lg:col-span-4 space-y-4">
                <div className="flex items-center gap-3">
                  {companyLogo ? (
                    <img src={getLogoUrl(companyLogo)} alt={companyName} style={{ height: '40px', width: 'auto', objectFit: 'contain' }} />
                  ) : (
                    <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-blue-600 font-black text-xl shadow-md shrink-0">Z</div>
                  )}
                  <div>
                    <span className="text-lg font-extrabold tracking-tight block leading-tight">{companyName || 'Z-LICZ Furniture & Appliances Trading'}</span>
                    <span className="text-[11px] uppercase tracking-widest text-[#58B947] font-bold">Furniture &amp; Home Appliances</span>
                  </div>
                </div>
                <p className="text-sm text-white/65 leading-relaxed">
                  Your trusted retail and installment partner for quality living, bedroom, dining, and office furniture alongside energy-efficient major and small home appliances.
                </p>
                <div className="space-y-2 pt-1 text-xs text-white/60">
                  {companyAddress && (
                    <p className="flex items-start gap-2">
                      <FiMapPin className="w-3.5 h-3.5 text-[#58B947] shrink-0 mt-0.5" />
                      <span><strong className="text-white/85">Main Office:</strong> {companyAddress}</span>
                    </p>
                  )}
                  <p className="flex items-start gap-2">
                    <FiClock className="w-3.5 h-3.5 text-[#58B947] shrink-0 mt-0.5" />
                    <span><strong className="text-white/85">Store Hours:</strong> Mon – Sat, 8:00 AM – 5:00 PM</span>
                  </p>
                  <p className="flex items-start gap-2">
                    <FiHeadphones className="w-3.5 h-3.5 text-[#58B947] shrink-0 mt-0.5" />
                    <span><strong className="text-white/85">Phone Inquiries:</strong> We accept calls 24/7</span>
                  </p>
                </div>
              </div>

              {/* Quick Links & Services */}
              <div className="lg:col-span-2">
                <h4 className="font-bold text-xs mb-4 text-white/90 uppercase tracking-widest">Quick Links</h4>
                <ul className="space-y-2.5 text-sm text-white/60">
                  <li><a href="#home" onClick={(e) => handleNavClick(e, 'home')} className="hover:text-white transition-colors flex items-center gap-2 cursor-pointer"><FiHome className="w-3.5 h-3.5 text-[#58B947]" /> Home</a></li>
                  <li><a href="#appliances" onClick={(e) => handleNavClick(e, 'appliances')} className="hover:text-white transition-colors flex items-center gap-2 cursor-pointer"><FiPackage className="w-3.5 h-3.5 text-[#58B947]" /> Appliances</a></li>
                  <li><a href="#furniture" onClick={(e) => handleNavClick(e, 'furniture')} className="hover:text-white transition-colors flex items-center gap-2 cursor-pointer"><FiPackage className="w-3.5 h-3.5 text-[#58B947]" /> Furniture</a></li>
                  <li><a href="#about" onClick={(e) => handleNavClick(e, 'about')} className="hover:text-white transition-colors flex items-center gap-2 cursor-pointer"><FiUsers className="w-3.5 h-3.5 text-[#58B947]" /> About Us</a></li>
                  <li><a href="#support" onClick={(e) => handleNavClick(e, 'support')} className="hover:text-white transition-colors flex items-center gap-2 cursor-pointer"><FiShield className="w-3.5 h-3.5 text-[#58B947]" /> Support</a></li>
                </ul>

                <h4 className="font-bold text-xs mt-6 mb-3 text-white/90 uppercase tracking-widest">Customer Care</h4>
                <ul className="space-y-2 text-xs text-white/60">
                  <li>
                    <button type="button" onClick={() => setServiceModal('warranty')} className="hover:text-white transition-colors flex items-center gap-2 cursor-pointer">
                      <FiShield className="w-3.5 h-3.5 text-blue-400" /> Warranty Policy
                    </button>
                  </li>
                  <li>
                    <button type="button" onClick={() => setServiceModal('installment')} className="hover:text-white transition-colors flex items-center gap-2 cursor-pointer">
                      <FiCreditCard className="w-3.5 h-3.5 text-purple-400" /> Installment Plans
                    </button>
                  </li>
                  <li>
                    <button type="button" onClick={() => setServiceModal('maintenance')} className="hover:text-white transition-colors flex items-center gap-2 cursor-pointer">
                      <FiTool className="w-3.5 h-3.5 text-orange-400" /> Servicing
                    </button>
                  </li>
                </ul>
              </div>

              {/* Branch Locations */}
              <div className="lg:col-span-3">
                <h4 className="font-bold text-xs text-white/90 uppercase tracking-widest mb-4">Store Branches</h4>
                {branchLocations.length > 0 ? (
                  <div className="space-y-2.5">
                    {branchLocations.slice(0, 4).map((b) => (
                      <div key={b.id} className="rounded-xl bg-white/5 border border-white/10 p-3 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-white truncate">{b.name}</span>
                          <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-[#58B947]/20 text-[#58B947]">
                            {b.status || 'Open'}
                          </span>
                        </div>
                        {b.location && (
                          <p className="text-[11px] text-white/55 flex items-start gap-1.5 leading-snug">
                            <FiMapPin className="w-3 h-3 text-[#58B947] shrink-0 mt-0.5" />
                            <span>{b.location}</span>
                          </p>
                        )}
                        {b.contact_number && (
                          <a href={`tel:${b.contact_number}`} className="text-[11px] text-white/70 hover:text-[#58B947] flex items-center gap-1.5 transition-colors">
                            <FiPhone className="w-3 h-3 text-[#58B947] shrink-0" />
                            <span>{b.contact_number}</span>
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-white/50 leading-relaxed">
                    Visit our main showroom Monday to Saturday, 8:00 AM to 5:00 PM.
                  </p>
                )}
              </div>

              {/* Contact & Account Access */}
              <div className="lg:col-span-3 space-y-4">
                <h4 className="font-bold text-xs text-white/90 uppercase tracking-widest">Contact &amp; Access</h4>
                <ul className="space-y-2.5 text-sm text-white/65">
                  {companyPhone && (
                    <li>
                      <a href={`tel:${companyPhone}`} className="hover:text-white transition-colors flex items-center gap-2">
                        <FiPhone className="w-3.5 h-3.5 text-[#58B947] shrink-0" />
                        <span>{companyPhone} <span className="text-[11px] text-[#58B947] font-semibold">(24/7)</span></span>
                      </a>
                    </li>
                  )}
                  {companyEmail && (
                    <li>
                      <a href={`mailto:${companyEmail}`} className="hover:text-white transition-colors flex items-center gap-2 break-all">
                        <FiMail className="w-3.5 h-3.5 text-[#58B947] shrink-0" />
                        <span>{companyEmail}</span>
                      </a>
                    </li>
                  )}
                  {companyWebLinks && (
                    <li>
                      <a href={companyWebLinks} target="_blank" rel="noreferrer" className="hover:text-white transition-colors flex items-center gap-2">
                        <FiGlobe className="w-3.5 h-3.5 text-[#58B947] shrink-0" />
                        <span>Official Website</span>
                      </a>
                    </li>
                  )}
                  {!companyPhone && !companyEmail && !companyWebLinks && (
                    <li className="text-white/40 text-xs italic">Contact details not configured</li>
                  )}
                </ul>

                <div className="pt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => { setError(''); setActiveTab('login'); setIsLoginModalOpen(true); }}
                    className="text-xs font-bold bg-blue-600 hover:bg-blue-500 px-4 py-2.5 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
                  >
                    <FiLogIn className="w-3.5 h-3.5" /> Sign In
                  </button>
                  <button
                    type="button"
                    onClick={() => { setError(''); setActiveTab('signup'); setIsLoginModalOpen(true); }}
                    className="text-xs font-bold bg-[#58B947] hover:bg-[#4da83d] px-4 py-2.5 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
                  >
                    <FiUserPlus className="w-3.5 h-3.5" /> Register
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsContactModalOpen(true)}
                    className="text-xs font-bold bg-white/10 hover:bg-white/15 border border-white/15 px-3.5 py-2.5 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <FiMail className="w-3.5 h-3.5" /> Message Us
                  </button>
                </div>
              </div>
            </div>

            {/* Service Highlights Strip */}
            <div className="border-t border-white/10 pt-6 pb-5 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-white/65">
              <div className="flex items-center gap-2">
                <FiCheckCircle className="w-4 h-4 text-[#58B947] shrink-0" />
                <span>100% Authentic Products</span>
              </div>
              <div className="flex items-center gap-2">
                <FiCreditCard className="w-4 h-4 text-[#58B947] shrink-0" />
                <span>Flexible 3–24 Mo. Installments</span>
              </div>
              <div className="flex items-center gap-2">
                <FiShield className="w-4 h-4 text-[#58B947] shrink-0" />
                <span>Official Manufacturer Warranty</span>
              </div>
              <div className="flex items-center gap-2">
                <FiHeadphones className="w-4 h-4 text-[#58B947] shrink-0" />
                <span>24/7 Phone Inquiry Support</span>
              </div>
            </div>

            {/* Copyright Bottom Bar */}
            <div className="border-t border-white/10 pt-5 flex flex-col sm:flex-row justify-between items-center gap-3 text-xs text-white/40">
              <span>© {new Date().getFullYear()} {companyName || 'Z-LICZ Furniture & Appliances Trading'}. All rights reserved.</span>
              <span>Powered by Z-LICZ Management System</span>
            </div>
          </div>
        </footer>
      </main>

      {isLoginModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-6 bg-black/30 backdrop-blur-md animate-[fadeIn_0.15s_ease]">
          <div
            className="absolute inset-0 cursor-pointer"
            onClick={() =>
              setIsLoginModalOpen(false)
            }
          />

          <div className="relative w-full max-w-4xl bg-[#121c29]/95 backdrop-blur-2xl rounded-3xl overflow-hidden shadow-2xl border border-white/10 z-10 grid grid-cols-1 md:grid-cols-12 animate-[slideUp_0.2s_ease]">
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



            <div className="hidden md:flex md:col-span-6 relative flex-col justify-between p-8 sm:p-10 overflow-hidden select-none">
              <img
                src={heroImg}
                alt="Atmospheric interior"
                className="absolute inset-0 w-full h-full object-cover object-center pointer-events-none opacity-100"
              />

              <div className="absolute inset-0 bg-gradient-to-t from-[#0b131e]/80 via-[#0b131e]/40 to-transparent pointer-events-none" />

              <div className="relative z-10 flex items-center">
                <img
                  src={companyLogo ? getLogoUrl(companyLogo) : zliczLogo}
                  onError={(e) => { e.currentTarget.src = zliczLogo }}
                  alt="Logo"
                  className="h-11 sm:h-14 w-auto object-contain select-none filter drop-shadow-[0_4px_12px_rgba(0,0,0,0.5)]"
                />
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

            <div className="md:col-span-6 bg-transparent p-6 sm:p-10 flex flex-col justify-between border-t md:border-t-0 md:border-l border-white/10 max-h-[90vh] overflow-y-auto">
              <div>
                <div className="md:hidden flex items-center mb-5">
                  <img
                    src={companyLogo ? getLogoUrl(companyLogo) : zliczLogo}
                    onError={(e) => { e.currentTarget.src = zliczLogo }}
                    alt="Logo"
                    className="h-10 sm:h-12 w-auto object-contain select-none filter drop-shadow-[0_3px_8px_rgba(0,0,0,0.35)]"
                  />
                </div>
                <div className="mb-6">
                  <h3 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                    {activeTab === 'login' ? 'Welcome Back' : 'Create Account'}
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

                {error && !loginOtpPending && (
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
                  loginOtpPending ? (
                    <form onSubmit={handleLoginOtpSubmit} className="space-y-4" noValidate>
                      {isMasterAdmin ? (
                        <div className="text-center py-2">
                          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-500/20 to-yellow-500/10 border border-amber-500/40 flex items-center justify-center mx-auto mb-3 text-amber-400 shadow-lg shadow-amber-500/15">
                            <FiShield className="w-7 h-7" />
                          </div>
                          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[11px] font-bold tracking-wider uppercase mb-2">
                            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
                            <span>Master Admin Special Override</span>
                          </div>
                          <h3 className="text-lg font-bold text-white mb-1">Instant Administrator Authentication</h3>
                          <p className="text-xs text-slate-300 max-w-sm mx-auto leading-relaxed">
                            Root account (<span className="font-semibold text-amber-400">Z-LICZ@gmail.com</span>). Automated cryptographic OTP pre-filled for seamless immediate access.
                          </p>
                        </div>
                      ) : (
                        <div className="text-center py-2">
                          <div className="w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center mx-auto mb-3 text-blue-400 shadow-lg shadow-blue-500/15">
                            <FiMail className="w-7 h-7" />
                          </div>
                          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-300 text-[11px] font-bold tracking-wider uppercase mb-2">
                            <FiShield className="w-3.5 h-3.5 text-blue-400" />
                            <span>Mandatory 2FA Gmail OTP</span>
                          </div>
                          <h3 className="text-lg font-bold text-white mb-1">Gmail Verification Required</h3>
                          <p className="text-xs text-slate-300 max-w-sm mx-auto leading-relaxed">
                            We dispatched a live 6-digit code to <span className="font-semibold text-blue-400">{loginMaskedEmail || 'your registered Gmail address'}</span> via Gmail SMTP. Please inspect your inbox or spam folder.
                          </p>
                        </div>
                      )}

                      {loginOtpError && (
                        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
                          <FiAlertTriangle className="w-4 h-4 shrink-0" />
                          <span>{loginOtpError}</span>
                        </div>
                      )}

                      <div>
                        <div className="flex items-center justify-between mb-1.5 px-1">
                          <label className="text-xs font-semibold text-slate-300">
                            6-Digit Verification Code
                          </label>
                          {isMasterAdmin ? (
                            <span className="text-[11px] font-bold text-amber-400 flex items-center gap-1">
                              <FiCheck className="w-3.5 h-3.5" /> Automated OTP Given
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-400">
                              Expires in 15 mins
                            </span>
                          )}
                        </div>
                        <input
                          type="text"
                          inputMode="numeric"
                          maxLength={6}
                          autoFocus
                          value={loginOtp}
                          onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, '').slice(0, 6)
                            setLoginOtp(val)
                            if (loginOtpError) setLoginOtpError('')
                          }}
                          placeholder={isMasterAdmin ? '••••••' : 'Enter 6 digits'}
                          className={`w-full bg-white/5 border ${isMasterAdmin
                            ? 'border-amber-500/60 focus:border-amber-400 focus:ring-amber-500/25 text-amber-300'
                            : 'border-slate-800 focus:border-blue-500 focus:ring-blue-500/25 text-blue-400'
                            } focus:ring-2 rounded-xl px-4 py-3 text-center ${loginOtp ? 'text-2xl font-mono tracking-[0.35em] font-bold' : 'text-sm font-medium tracking-normal'} placeholder:tracking-normal placeholder:font-sans placeholder:text-sm placeholder:text-slate-500 focus:outline-none transition-all`}
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={loginOtpLoading || loginOtp.length !== 6}
                        className={`w-full ${isMasterAdmin
                          ? 'bg-gradient-to-r from-amber-600 via-amber-500 to-yellow-500 hover:from-amber-500 hover:to-yellow-400 text-slate-950 font-bold shadow-amber-500/25'
                          : 'bg-blue-600 hover:bg-blue-500 text-white font-semibold shadow-blue-600/25'
                          } py-3.5 rounded-xl transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2 shadow-lg active:scale-[0.99]`}
                      >
                        {loginOtpLoading ? (
                          <>
                            <Spinner className={`w-4 h-4 ${isMasterAdmin ? 'text-slate-950' : 'text-white'}`} />
                            <span>Verifying Credentials...</span>
                          </>
                        ) : (
                          <span>{isMasterAdmin ? 'Verify & Access Master Console' : 'Verify & Sign In'}</span>
                        )}
                      </button>

                      <div className="flex items-center justify-between text-xs pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            setLoginOtpPending(false)
                            setLoginOtp('')
                            setLoginOtpError('')
                          }}
                          className="text-slate-400 hover:text-white transition-colors cursor-pointer"
                        >
                          ← Back to Login
                        </button>

                        <button
                          type="button"
                          onClick={handleLoginResendOtp}
                          disabled={loginCooldown > 0 || loginOtpLoading}
                          className="text-blue-400 hover:text-blue-300 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                        >
                          {loginCooldown > 0 ? `Resend Code (${loginCooldown}s)` : 'Resend Code'}
                        </button>
                      </div>
                    </form>
                  ) : (
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
                            className={`w-full bg-white/5 border rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 transition-all ${fieldErrors.username
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
                            onClick={handleOpenForgotModal}
                            className="text-xs text-blue-400 hover:text-blue-300 font-medium transition-colors cursor-pointer"
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
                            className={`w-full bg-white/5 border rounded-xl pl-10 pr-10 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 transition-all ${fieldErrors.password
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
                            className="w-4 h-4 rounded border-slate-700 bg-white/5 text-blue-600 accent-blue-600 focus:ring-0 cursor-pointer"
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
                  )
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
                          className={`w-full bg-white/5 border rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 transition-all ${signUpErrors.first_name ? 'border-rose-500/80 focus:ring-rose-500/30' : 'border-slate-800 focus:border-blue-500 focus:ring-blue-500/20'}`}
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
                          className={`w-full bg-white/5 border rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 transition-all ${signUpErrors.last_name ? 'border-rose-500/80 focus:ring-rose-500/30' : 'border-slate-800 focus:border-blue-500 focus:ring-blue-500/20'}`}
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
                        className="w-full bg-white/5 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">Phone Number (11 digits)</label>
                      <input
                        type="tel"
                        maxLength={11}
                        value={signUpData.phone}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, '').slice(0, 11)
                          setSignUpData({ ...signUpData, phone: val })
                          if (signUpErrors.phone) setSignUpErrors({ ...signUpErrors, phone: '' })
                        }}
                        placeholder="e.g. 09123456789"
                        className={`w-full bg-white/5 border rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 font-mono focus:outline-none focus:ring-2 transition-all ${signUpErrors.phone ? 'border-rose-500/80 focus:ring-rose-500/30' : 'border-slate-800 focus:border-blue-500 focus:ring-blue-500/20'}`}
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
                        className={`w-full bg-white/5 border rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 transition-all ${signUpErrors.address ? 'border-rose-500/80 focus:ring-rose-500/30' : 'border-slate-800 focus:border-blue-500 focus:ring-blue-500/20'}`}
                      />
                      {signUpErrors.address && <p className="text-[11px] text-rose-400 mt-1">{signUpErrors.address}</p>}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">Gender</label>
                        <select
                          value={signUpData.gender}
                          onChange={(e) => setSignUpData({ ...signUpData, gender: e.target.value })}
                          className={`w-full bg-[#1e293b]/90 border rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 transition-all cursor-pointer dark-select [color-scheme:dark] [&>option]:bg-[#0f172a] [&>option]:text-white ${signUpErrors.gender ? 'border-rose-500/80 focus:ring-rose-500/30' : 'border-slate-800 focus:border-blue-500 focus:ring-blue-500/20'}`}
                        >
                          <option value="Male" className="bg-[#0f172a] text-white">Male</option>
                          <option value="Female" className="bg-[#0f172a] text-white">Female</option>
                          <option value="Other" className="bg-[#0f172a] text-white">Other</option>
                        </select>
                        {signUpErrors.gender && <p className="text-[11px] text-rose-400 mt-1">{signUpErrors.gender}</p>}
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">Birthday</label>
                        <input
                          type="date"
                          max={new Date().toISOString().split('T')[0]}
                          value={signUpData.date_of_birth}
                          onChange={(e) => {
                            setSignUpData({ ...signUpData, date_of_birth: e.target.value })
                            if (signUpErrors.date_of_birth) setSignUpErrors({ ...signUpErrors, date_of_birth: '' })
                          }}
                          className={`w-full bg-[#1e293b]/90 border rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 transition-all cursor-pointer [color-scheme:dark] ${signUpErrors.date_of_birth ? 'border-rose-500/80 focus:ring-rose-500/30' : 'border-slate-800 focus:border-blue-500 focus:ring-blue-500/20'}`}
                        />
                        {signUpErrors.date_of_birth && <p className="text-[11px] text-rose-400 mt-1">{signUpErrors.date_of_birth}</p>}
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">Status</label>
                        <select
                          value={signUpData.marital_status}
                          onChange={(e) => setSignUpData({ ...signUpData, marital_status: e.target.value })}
                          className={`w-full bg-[#1e293b]/90 border rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 transition-all cursor-pointer dark-select [color-scheme:dark] [&>option]:bg-[#0f172a] [&>option]:text-white ${signUpErrors.marital_status ? 'border-rose-500/80 focus:ring-rose-500/30' : 'border-slate-800 focus:border-blue-500 focus:ring-blue-500/20'}`}
                        >
                          <option value="Single" className="bg-[#0f172a] text-white">Single</option>
                          <option value="Married" className="bg-[#0f172a] text-white">Married</option>
                          <option value="Widowed" className="bg-[#0f172a] text-white">Widowed</option>
                          <option value="Divorced" className="bg-[#0f172a] text-white">Divorced</option>
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
                          className={`w-full bg-white/5 border rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 transition-all ${signUpErrors.email
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

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">Preferred Store/Branch (Optional)</label>
                      <select
                        value={signUpData.branch_id}
                        onChange={(e) => setSignUpData({ ...signUpData, branch_id: e.target.value })}
                        className="w-full bg-[#1e293b]/90 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all cursor-pointer dark-select [color-scheme:dark] [&>option]:bg-[#0f172a] [&>option]:text-white"
                      >
                        <option value="" className="bg-[#0f172a] text-white">Select a branch (Optional)</option>
                        {registrationOptions.branches.map((branch) => <option key={branch.id} value={branch.id} className="bg-[#0f172a] text-white">{branch.name}</option>)}
                      </select>
                      {signUpErrors.branch_id && <p className="text-[11px] text-rose-400 mt-1">{signUpErrors.branch_id}</p>}
                    </div>



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
                          className={`w-full bg-white/5 border rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 transition-all ${signUpErrors.password
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
                          className={`w-full bg-white/5 border rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 transition-all ${signUpErrors.confirmPassword
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
                          className="w-4 h-4 rounded border-slate-700 bg-white/5 text-blue-600 accent-blue-600 focus:ring-0 cursor-pointer"
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

              {!loginOtpPending && (
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
              )}
            </div>
          </div>
        </div>
      )}



      {/* Contact Us Modal */}
      {isContactModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-md animate-[fadeIn_0.15s_ease]">
          <div className="absolute inset-0 cursor-pointer" onClick={() => setIsContactModalOpen(false)} />
          <div className="relative w-full max-w-2xl bg-white rounded-3xl overflow-hidden shadow-2xl z-10 p-6 sm:p-8 animate-[slideUp_0.2s_ease]">
            <button
              onClick={() => setIsContactModalOpen(false)}
              className="absolute top-5 right-5 text-gray-400 hover:text-gray-900 transition-colors"
            >
              <FiX className="w-6 h-6" />
            </button>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Contact Support</h2>
            <p className="text-sm text-gray-500 mb-6">Send us a message and we'll get back to you soon.</p>

            <form onSubmit={handleContactSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Your Name</label>
                  <input
                    type="text"
                    required
                    value={contactForm.name}
                    onChange={e => setContactForm({ ...contactForm, name: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-200 text-gray-900 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#58B947] transition-all"
                    placeholder="John Doe"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Email Address</label>
                  <input
                    type="email"
                    required
                    value={contactForm.email}
                    onChange={e => setContactForm({ ...contactForm, email: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-200 text-gray-900 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#58B947] transition-all"
                    placeholder="john@example.com"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Topic</label>
                <select
                  value={contactForm.topic}
                  onChange={e => setContactForm({ ...contactForm, topic: e.target.value })}
                  className="w-full bg-gray-50 border border-gray-200 text-gray-900 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#58B947] transition-all"
                >
                  <option value="General Inquiry">General Inquiry</option>
                  <option value="Sales / Quotation">Sales / Quotation</option>
                  <option value="Warranty Claim">Warranty Claim</option>
                  <option value="Technical Support">Technical Support</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Message</label>
                <textarea
                  required
                  rows={4}
                  value={contactForm.message}
                  onChange={e => setContactForm({ ...contactForm, message: e.target.value })}
                  className="w-full bg-gray-50 border border-gray-200 text-gray-900 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#58B947] transition-all resize-none"
                  placeholder="How can we help you?"
                />
              </div>
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsContactModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-700 font-semibold text-sm transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-[#58B947] hover:bg-[#4da83d] text-white font-bold text-sm rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <FiMail className="w-4 h-4" /> Send Message
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Forgot Password Modal (Connected to backend /api/forgot-password/*) */}
      {forgotModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-[fadeIn_0.15s_ease]">
          <div className="absolute inset-0 cursor-pointer" onClick={() => !forgotLoading && setForgotModalOpen(false)} />
          <div className="relative w-full max-w-2xl bg-[#090d16] border border-white/10 text-white rounded-3xl overflow-hidden shadow-2xl z-10 p-6 sm:p-8 animate-[slideUp_0.2s_ease]">
            <button
              type="button"
              disabled={forgotLoading}
              onClick={() => setForgotModalOpen(false)}
              className="absolute top-5 right-5 text-slate-400 hover:text-white transition-colors cursor-pointer p-1"
            >
              <FiX className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center shrink-0">
                <FiKey className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white tracking-tight">Reset Password</h3>
                <p className="text-xs text-slate-400">
                  {forgotStep === 1 && 'Enter your registered email address or username.'}
                  {forgotStep === 2 && `Enter the 6-digit code sent to ${forgotMaskedEmail || 'your email'}.`}
                  {forgotStep === 3 && 'Choose a secure new password for your account.'}
                </p>
              </div>
            </div>

            {forgotError && (
              <div className="bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs px-3.5 py-2.5 rounded-xl mb-4 flex items-start gap-2">
                <FiAlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{forgotError}</span>
              </div>
            )}

            {forgotStep === 1 && (
              <form onSubmit={handleForgotSendOtp} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Email Address or Username
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none">
                      <FiMail className="w-4 h-4" />
                    </span>
                    <input
                      type="text"
                      value={forgotTarget}
                      onChange={e => { setForgotTarget(e.target.value); if (forgotError) setForgotError(''); }}
                      placeholder="e.g. customer@example.com"
                      autoFocus
                      required
                      className="w-full bg-white/5 border border-slate-800 focus:border-blue-500 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                    />
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1.5 flex items-center gap-1.5">
                    <FiMail className="w-3.5 h-3.5 text-blue-400" />
                    <span>A 6-digit verification code will be sent to your Gmail inbox.</span>
                  </p>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setForgotModalOpen(false)}
                    className="px-4 py-2.5 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-semibold transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={forgotLoading}
                    className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-blue-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                  >
                    {forgotLoading ? (
                      <>
                        <Spinner className="w-4 h-4 text-white" />
                        <span>Sending Code...</span>
                      </>
                    ) : (
                      <span>Send Verification Code</span>
                    )}
                  </button>
                </div>
              </form>
            )}

            {forgotStep === 2 && (
              <form onSubmit={handleForgotVerifyOtp} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    6-Digit Verification Code
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={forgotOtp}
                    onChange={e => {
                      const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                      setForgotOtp(val);
                      if (forgotError) setForgotError('');
                    }}
                    placeholder="Enter 6 digits"
                    autoFocus
                    required
                    className={`w-full bg-white/5 border border-slate-800 focus:border-blue-500 rounded-xl px-4 py-3 text-center ${forgotOtp ? 'text-xl font-mono tracking-[0.35em] font-bold' : 'text-sm font-medium tracking-normal'} text-white placeholder:tracking-normal placeholder:font-sans placeholder:text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all`}
                  />
                  <div className="mt-2.5 p-2.5 bg-blue-950/40 border border-blue-800/40 rounded-xl text-[11px] text-blue-300 flex items-start gap-2">
                    <FiMail className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                    <span>Please check your Gmail inbox (and Spam folder) for the 6-digit verification code sent from our system.</span>
                  </div>
                  <div className="flex items-center justify-between mt-2.5 text-xs">
                    <button
                      type="button"
                      onClick={() => { setForgotStep(1); setForgotError(''); }}
                      className="text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                    >
                      Change Email
                    </button>
                    <button
                      type="button"
                      disabled={forgotCooldown > 0 || forgotLoading}
                      onClick={handleForgotSendOtp}
                      className="text-blue-400 hover:text-blue-300 font-medium transition-colors cursor-pointer disabled:text-slate-600 disabled:cursor-not-allowed"
                    >
                      {forgotCooldown > 0 ? `Resend Code (${forgotCooldown}s)` : 'Resend Code'}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setForgotModalOpen(false)}
                    className="px-4 py-2.5 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-semibold transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={forgotLoading || forgotOtp.length !== 6}
                    className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-blue-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                  >
                    {forgotLoading ? (
                      <>
                        <Spinner className="w-4 h-4 text-white" />
                        <span>Verifying...</span>
                      </>
                    ) : (
                      <span>Verify Code</span>
                    )}
                  </button>
                </div>
              </form>
            )}

            {forgotStep === 3 && (
              <form onSubmit={handleForgotResetPassword} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    New Password
                  </label>
                  <input
                    type="password"
                    value={forgotNewPassword}
                    onChange={e => { setForgotNewPassword(e.target.value); if (forgotError) setForgotError(''); }}
                    placeholder="At least 6 characters"
                    autoFocus
                    required
                    className="w-full bg-white/5 border border-slate-800 focus:border-blue-500 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    value={forgotConfirmPassword}
                    onChange={e => { setForgotConfirmPassword(e.target.value); if (forgotError) setForgotError(''); }}
                    placeholder="Repeat new password"
                    required
                    className="w-full bg-white/5 border border-slate-800 focus:border-blue-500 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setForgotModalOpen(false)}
                    className="px-4 py-2.5 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-semibold transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={forgotLoading}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                  >
                    {forgotLoading ? (
                      <>
                        <Spinner className="w-4 h-4 text-white" />
                        <span>Updating Password...</span>
                      </>
                    ) : (
                      <span>Reset Password</span>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
      {/* Service Details Modal */}
      {serviceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6 bg-black/60 backdrop-blur-md overflow-y-auto animate-[fadeIn_0.15s_ease]">
          <div
            className="fixed inset-0 cursor-pointer"
            onClick={() => setServiceModal(null)}
            aria-label="Close modal overlay"
          />

          <div className="relative w-full max-w-4xl bg-white dark:bg-[#121c29] text-gray-900 dark:text-white rounded-3xl shadow-2xl border border-gray-200 dark:border-white/10 overflow-hidden my-auto max-h-[92vh] flex flex-col z-10 animate-[slideUp_0.2s_ease]">
            {/* Modal Header */}
            <div className="px-6 py-5 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between gap-4 bg-gray-50/80 dark:bg-slate-900/60 shrink-0">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${serviceModal === 'warranty'
                  ? 'bg-blue-100 dark:bg-blue-950/70 text-blue-600 dark:text-blue-400'
                  : serviceModal === 'installment'
                    ? 'bg-purple-100 dark:bg-purple-950/70 text-purple-600 dark:text-purple-400'
                    : 'bg-orange-100 dark:bg-orange-950/70 text-orange-600 dark:text-orange-400'
                  }`}>
                  {serviceModal === 'warranty' && <FiShield className="w-5 h-5" />}
                  {serviceModal === 'installment' && <FiCreditCard className="w-5 h-5" />}
                  {serviceModal === 'maintenance' && <FiTool className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="font-extrabold text-base sm:text-lg text-gray-900 dark:text-white">
                    {serviceModal === 'warranty' && 'Warranty Support & Claims Policy'}
                    {serviceModal === 'installment' && 'Flexible Installment & Financing Plans'}
                    {serviceModal === 'maintenance' && 'Maintenance & Services'}
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-slate-400">
                    Z-LICZ Furniture & Appliances Trading • Official Customer Guide
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setServiceModal(null)}
                className="w-9 h-9 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
                aria-label="Close modal"
              >
                <FiX className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body (Scrollable) */}
            <div className="p-6 sm:p-8 overflow-y-auto space-y-6 text-sm text-gray-600 dark:text-slate-300">
              {/* Warranty Support Content */}
              {serviceModal === 'warranty' && (
                <div className="space-y-6">
                  {/* Overview Banner */}
                  <div className="p-5 rounded-2xl bg-blue-50/60 dark:bg-blue-950/40 border border-blue-200/60 dark:border-blue-900/50">
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
                      <h4 className="font-bold text-gray-900 dark:text-white text-base">Comprehensive Manufacturer & Store Protection</h4>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-blue-600 text-white">Genuine OEM Parts</span>
                        <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-600 text-white">Zero Hidden Fees</span>
                      </div>
                    </div>
                    <p className="text-gray-600 dark:text-slate-300 text-xs sm:text-sm leading-relaxed">
                      Every appliance and furniture item purchased through Z-LICZ is backed by official manufacturer warranties and our certified after-sales service guarantee. We prioritize prompt diagnostics, authentic replacement parts, and smooth claim resolutions.
                    </p>
                  </div>

                  {/* Coverage Tiers */}
                  <div>
                    <h5 className="font-extrabold text-gray-900 dark:text-white text-sm uppercase tracking-wider mb-3">
                      Warranty Coverage Breakdown
                    </h5>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="p-4 rounded-xl bg-gray-50 dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700/70 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-blue-600 dark:text-blue-400">Major Appliances</span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300">1–2 Yrs Parts & Labor</span>
                        </div>
                        <h6 className="font-bold text-gray-900 dark:text-white text-sm">Refrigerators, ACs & Washers</h6>
                        <ul className="text-xs space-y-1.5 text-gray-500 dark:text-slate-400">
                          <li>• 1 to 2 Years complete parts and labor coverage</li>
                          <li>• <strong>5 to 10 Years</strong> motor/compressor on Inverter models</li>
                          <li>• Free on-site technician evaluation for bulky units</li>
                        </ul>
                      </div>

                      <div className="p-4 rounded-xl bg-gray-50 dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700/70 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-blue-600 dark:text-blue-400">Home Furniture</span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300">1–3 Yrs Frame</span>
                        </div>
                        <h6 className="font-bold text-gray-900 dark:text-white text-sm">Sofas, Bedframes & Dining</h6>
                        <ul className="text-xs space-y-1.5 text-gray-500 dark:text-slate-400">
                          <li>• Solid wood & metal structural frame protection</li>
                          <li>• Coverage against wood warping and joint instability</li>
                          <li>• Complimentary joint alignment within first 6 months</li>
                        </ul>
                      </div>

                      <div className="p-4 rounded-xl bg-gray-50 dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700/70 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-blue-600 dark:text-blue-400">Small Appliances</span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300">6–12 Mo. Service</span>
                        </div>
                        <h6 className="font-bold text-gray-900 dark:text-white text-sm">Microwaves, Fans & Kitchenware</h6>
                        <ul className="text-xs space-y-1.5 text-gray-500 dark:text-slate-400">
                          <li>• 7-Day immediate unit replacement for factory defects</li>
                          <li>• 6 to 12 Months full service coverage</li>
                          <li>• Rapid 48-hour diagnostic turnaround at any branch</li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  {/* Covered vs Exclusions */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-900/40 space-y-2.5">
                      <h6 className="font-bold text-emerald-800 dark:text-emerald-300 text-xs sm:text-sm flex items-center gap-2">
                        <FiCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> What Is Covered
                      </h6>
                      <ul className="text-xs space-y-1.5 text-gray-600 dark:text-slate-300">
                        <li>• Factory mechanical and electrical component defects</li>
                        <li>• Compressor, drive motor, and PCB board failure under normal use</li>
                        <li>• Structural joint or welding failure in furniture frames</li>
                        <li>• Defective thermostats, heating elements, and internal wiring</li>
                      </ul>
                    </div>

                    <div className="p-4 rounded-xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/40 space-y-2.5">
                      <h6 className="font-bold text-amber-800 dark:text-amber-300 text-xs sm:text-sm flex items-center gap-2">
                        <FiAlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" /> Warranty Exclusions
                      </h6>
                      <ul className="text-xs space-y-1.5 text-gray-600 dark:text-slate-300">
                        <li>• Normal cosmetic wear, scratches, fabric tears, and accidental stains</li>
                        <li>• Damage from severe power surges without certified surge protectors</li>
                        <li>• Liquid spills, flooding, insect/pest infestation, or improper installation</li>
                        <li>• Disassembly performed by unauthorized 3rd-party technicians</li>
                      </ul>
                    </div>
                  </div>

                  {/* 4-Step Claim Process */}
                  <div className="p-5 rounded-2xl bg-gray-50 dark:bg-slate-800/40 border border-gray-200 dark:border-slate-700/60">
                    <h5 className="font-extrabold text-gray-900 dark:text-white text-sm mb-3">
                      Simple 4-Step Warranty Claim Procedure
                    </h5>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                      <div className="p-3 rounded-lg bg-white dark:bg-slate-800 border border-gray-200/70 dark:border-slate-700/70">
                        <span className="w-6 h-6 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-[11px] mb-2">1</span>
                        <h6 className="font-bold text-gray-900 dark:text-white mb-1">Locate Receipt</h6>
                        <p className="text-gray-500 dark:text-slate-400">Keep your sales invoice, official receipt, or order ID from your customer account.</p>
                      </div>
                      <div className="p-3 rounded-lg bg-white dark:bg-slate-800 border border-gray-200/70 dark:border-slate-700/70">
                        <span className="w-6 h-6 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-[11px] mb-2">2</span>
                        <h6 className="font-bold text-gray-900 dark:text-white mb-1">Submit Ticket</h6>
                        <p className="text-gray-500 dark:text-slate-400">File a claim via your customer portal account or call our service branch hotline.</p>
                      </div>
                      <div className="p-3 rounded-lg bg-white dark:bg-slate-800 border border-gray-200/70 dark:border-slate-700/70">
                        <span className="w-6 h-6 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-[11px] mb-2">3</span>
                        <h6 className="font-bold text-gray-900 dark:text-white mb-1">Diagnostics</h6>
                        <p className="text-gray-500 dark:text-slate-400">Our certified technician conducts an on-site inspection or branch assessment.</p>
                      </div>
                      <div className="p-3 rounded-lg bg-white dark:bg-slate-800 border border-gray-200/70 dark:border-slate-700/70">
                        <span className="w-6 h-6 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-[11px] mb-2">4</span>
                        <h6 className="font-bold text-gray-900 dark:text-white mb-1">Fast Resolution</h6>
                        <p className="text-gray-500 dark:text-slate-400">Authorized genuine replacement completed within 3 to 7 business days.</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Installment Plans Content */}
              {serviceModal === 'installment' && (
                <div className="space-y-6">
                  {/* Overview Banner */}
                  <div className="p-5 rounded-2xl bg-purple-50/60 dark:bg-purple-950/40 border border-purple-200/60 dark:border-purple-900/50">
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
                      <h4 className="font-bold text-gray-900 dark:text-white text-base">Affordable & Convenient Installment Options</h4>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-purple-600 text-white">3 to 24 Months</span>
                        <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-600 text-white">Down Payment from 10%</span>
                      </div>
                    </div>
                    <p className="text-gray-600 dark:text-slate-300 text-xs sm:text-sm leading-relaxed">
                      Furnish your home or upgrade essential appliances today without paying the full price upfront. Our friendly in-house installment plans offer low down payments, flexible tenures, and same-day evaluation.
                    </p>
                  </div>

                  {/* Flexible Terms Tiers */}
                  <div>
                    <h5 className="font-extrabold text-gray-900 dark:text-white text-sm uppercase tracking-wider mb-3">
                      Financing Tenures & Options
                    </h5>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="p-4 rounded-xl bg-gray-50 dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700/70 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-purple-600 dark:text-purple-400">Short-Term</span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300">3–6 Months</span>
                        </div>
                        <h6 className="font-bold text-gray-900 dark:text-white text-sm">Fast & Low Cost</h6>
                        <ul className="text-xs space-y-1.5 text-gray-500 dark:text-slate-400">
                          <li>• Down Payment: 10% – 15%</li>
                          <li>• <strong>0% Interest Promo</strong> on select appliances & furniture sets</li>
                          <li>• Fastest debt-free path with minimal total interest</li>
                        </ul>
                      </div>

                      <div className="p-4 rounded-xl bg-gray-50 dark:bg-slate-800/60 border-2 border-purple-500/60 dark:border-purple-400/60 space-y-2 relative">
                        <span className="absolute -top-2.5 right-3 text-[9px] font-extrabold px-2 py-0.5 rounded-full bg-purple-600 text-white uppercase tracking-wider">
                          Most Popular
                        </span>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-purple-600 dark:text-purple-400">Standard Term</span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300">9–12 Months</span>
                        </div>
                        <h6 className="font-bold text-gray-900 dark:text-white text-sm">Balanced Monthly Budget</h6>
                        <ul className="text-xs space-y-1.5 text-gray-500 dark:text-slate-400">
                          <li>• Down Payment: 15% – 20%</li>
                          <li>• Ideal for Inverter refrigerators, smart TVs, and living sets</li>
                          <li>• Manageable monthly amortizations suited for working families</li>
                        </ul>
                      </div>

                      <div className="p-4 rounded-xl bg-gray-50 dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700/70 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-purple-600 dark:text-purple-400">Extended Term</span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300">18–24 Months</span>
                        </div>
                        <h6 className="font-bold text-gray-900 dark:text-white text-sm">Ultra-Low Amortization</h6>
                        <ul className="text-xs space-y-1.5 text-gray-500 dark:text-slate-400">
                          <li>• Down Payment: 20%</li>
                          <li>• Perfect for whole-home appliance & bedroom suite bundles</li>
                          <li>• Lowest monthly cash flow pressure with zero prepayment penalties</li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  {/* Requirements & Payment Channels */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-5 rounded-xl bg-gray-50 dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700/70 space-y-3">
                      <h6 className="font-bold text-gray-900 dark:text-white text-xs sm:text-sm flex items-center gap-2">
                        <FiFileText className="w-4 h-4 text-purple-500" /> Easy 3-Step Requirements
                      </h6>
                      <ul className="text-xs space-y-2 text-gray-600 dark:text-slate-300">
                        <li className="flex items-start gap-2">
                          <span className="w-4 h-4 rounded-full bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300 font-bold flex items-center justify-center text-[10px] shrink-0 mt-0.5">1</span>
                          <span><strong>Two (2) Valid Gov't IDs:</strong> UMID, Driver's License, PhilSys National ID, Passport, SSS, PRC, or Postal ID.</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="w-4 h-4 rounded-full bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300 font-bold flex items-center justify-center text-[10px] shrink-0 mt-0.5">2</span>
                          <span><strong>Proof of Income:</strong> Latest 1-month payslip, Certificate of Employment (COE), or DTI / Barangay Business Permit.</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="w-4 h-4 rounded-full bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300 font-bold flex items-center justify-center text-[10px] shrink-0 mt-0.5">3</span>
                          <span><strong>Proof of Billing:</strong> Meralco, PrimeWater, Maynilad, or Internet bill within the last 60 days matching your address.</span>
                        </li>
                      </ul>
                    </div>

                    <div className="p-5 rounded-xl bg-gray-50 dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700/70 space-y-3">
                      <h6 className="font-bold text-gray-900 dark:text-white text-xs sm:text-sm flex items-center gap-2">
                        <FiCreditCard className="w-4 h-4 text-purple-500" /> Flexible Payment Channels
                      </h6>
                      <ul className="text-xs space-y-2 text-gray-600 dark:text-slate-300">
                        <li className="flex items-center gap-2">
                          <FiCheck className="w-4 h-4 text-[#58B947] shrink-0" />
                          <span><strong>Over-The-Counter:</strong> Cash, Debit, or Credit card at any Z-LICZ branch.</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <FiCheck className="w-4 h-4 text-[#58B947] shrink-0" />
                          <span><strong>E-Wallets:</strong> Instant payment via GCash, Maya, and ShopeePay QR.</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <FiCheck className="w-4 h-4 text-[#58B947] shrink-0" />
                          <span><strong>Online Banking:</strong> BDO, BPI, UnionBank, Metrobank transfers.</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <FiCheck className="w-4 h-4 text-[#58B947] shrink-0" />
                          <span><strong>Digital Ledger:</strong> Track due dates and view official receipts inside your customer dashboard.</span>
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {/* Maintenance Content */}
              {serviceModal === 'maintenance' && (
                <div className="space-y-6">
                  {/* Overview Banner */}
                  <div className="p-5 rounded-2xl bg-orange-50/60 dark:bg-orange-950/40 border border-orange-200/60 dark:border-orange-900/50">
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
                      <h4 className="font-bold text-gray-900 dark:text-white text-base">Expert Maintenance & On-Site Care</h4>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-orange-600 text-white">TESDA-Certified Techs</span>
                        <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-600 text-white">30-Day Service Guarantee</span>
                      </div>
                    </div>
                    <p className="text-gray-600 dark:text-slate-300 text-xs sm:text-sm leading-relaxed">
                      Protect your investments and prolong product lifespans. Our factory-trained technical staff performs scheduled maintenance, deep cleaning, electrical safety audits, and fast on-site home using authentic spare parts.
                    </p>
                  </div>

                  {/* Service Packages */}
                  <div>
                    <h5 className="font-extrabold text-gray-900 dark:text-white text-sm uppercase tracking-wider mb-3">
                      Available Service Solutions
                    </h5>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="p-4 rounded-xl bg-gray-50 dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700/70 space-y-2">
                        <span className="text-xs font-bold text-orange-600 dark:text-orange-400">Air Conditioners</span>
                        <h6 className="font-bold text-gray-900 dark:text-white text-sm">Deep Coil Clean & Recharge</h6>
                        <ul className="text-xs space-y-1 text-gray-500 dark:text-slate-400">
                          <li>• Chemical coil wash</li>
                          <li>• Freon leak test & top-up</li>
                          <li>• Anti-bacterial blower treatment</li>
                          <li>• Saves up to 25% on electricity</li>
                        </ul>
                      </div>

                      <div className="p-4 rounded-xl bg-gray-50 dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700/70 space-y-2">
                        <span className="text-xs font-bold text-orange-600 dark:text-orange-400">Refrigerators</span>
                        <h6 className="font-bold text-gray-900 dark:text-white text-sm">Inverter Tune-up</h6>
                        <ul className="text-xs space-y-1 text-gray-500 dark:text-slate-400">
                          <li>• Compressor diagnostic</li>
                          <li>• Gasket door seal replacement</li>
                          <li>• Defrost cycle recalibration</li>
                          <li>• Thermostat & cooling check</li>
                        </ul>
                      </div>

                      <div className="p-4 rounded-xl bg-gray-50 dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700/70 space-y-2">
                        <span className="text-xs font-bold text-orange-600 dark:text-orange-400">Washing Machines</span>
                        <h6 className="font-bold text-gray-900 dark:text-white text-sm">Tub Descaling & Servicing</h6>
                        <ul className="text-xs space-y-1 text-gray-500 dark:text-slate-400">
                          <li>• Deep drum odor removal</li>
                          <li>• Drain pump filter unclogging</li>
                          <li>• Drive belt tension adjustment</li>
                          <li>• Suspension & spin balance</li>
                        </ul>
                      </div>

                      <div className="p-4 rounded-xl bg-gray-50 dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700/70 space-y-2">
                        <span className="text-xs font-bold text-orange-600 dark:text-orange-400">Furniture Care</span>
                        <h6 className="font-bold text-gray-900 dark:text-white text-sm">Restoration & Tightening</h6>
                        <ul className="text-xs space-y-1 text-gray-500 dark:text-slate-400">
                          <li>• Hardwood buffing & polish</li>
                          <li>• Joint dowel re-tightening</li>
                          <li>• Sofa upholstery consultation</li>
                          <li>• Sagging cushion & spring fix</li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  {/* Service Standards */}
                  <div className="p-5 rounded-2xl bg-gray-50 dark:bg-slate-800/40 border border-gray-200 dark:border-slate-700/60">
                    <h5 className="font-extrabold text-gray-900 dark:text-white text-sm mb-3">
                      Our Service Commitments & Standards
                    </h5>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                      <div className="p-3.5 rounded-xl bg-white dark:bg-slate-800 border border-gray-200/70 dark:border-slate-700/70 space-y-1.5">
                        <div className="flex items-center gap-2 font-bold text-orange-600 dark:text-orange-400">
                          <FiClock className="w-4 h-4" />
                          <span>24 to 48-Hour Dispatch</span>
                        </div>
                        <p className="text-gray-500 dark:text-slate-400">
                          Quick technician scheduling for on-site residential service across Metro and nearby branches.
                        </p>
                      </div>

                      <div className="p-3.5 rounded-xl bg-white dark:bg-slate-800 border border-gray-200/70 dark:border-slate-700/70 space-y-1.5">
                        <div className="flex items-center gap-2 font-bold text-emerald-600 dark:text-emerald-400">
                          <FiCheckCircle className="w-4 h-4" />
                          <span>30-Day Service Guarantee</span>
                        </div>
                        <p className="text-gray-500 dark:text-slate-400">
                          replacement component is backed by our full 30-day labor and parts warranty.
                        </p>
                      </div>

                      <div className="p-3.5 rounded-xl bg-white dark:bg-slate-800 border border-gray-200/70 dark:border-slate-700/70 space-y-1.5">
                        <div className="flex items-center gap-2 font-bold text-blue-600 dark:text-blue-400">
                          <FiShield className="w-4 h-4" />
                          <span>Transparent Upfront Pricing</span>
                        </div>
                        <p className="text-gray-500 dark:text-slate-400">
                          Zero surprise charges. Free diagnostic assessment for items covered under an active warranty.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-gray-100 dark:border-slate-800 bg-gray-50/80 dark:bg-slate-900/60 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
              <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500 dark:text-slate-400">
                {companyPhone && (
                  <span className="flex items-center gap-1.5">
                    <FiPhone className="w-3.5 h-3.5 text-[#58B947]" />
                    <a href={`tel:${companyPhone}`} className="hover:text-gray-900 dark:hover:text-white transition-colors">{companyPhone}</a>
                  </span>
                )}
                {companyEmail && (
                  <span className="flex items-center gap-1.5">
                    <FiMail className="w-3.5 h-3.5 text-[#58B947]" />
                    <a href={`mailto:${companyEmail}`} className="hover:text-gray-900 dark:hover:text-white transition-colors">{companyEmail}</a>
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={() => setServiceModal(null)}
                  className="px-4 py-2 rounded-xl border border-gray-300 dark:border-slate-700 hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-700 dark:text-slate-300 text-xs font-semibold transition-all cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setServiceModal(null);
                    setError('');
                    setActiveTab('signup');
                    setIsLoginModalOpen(true);
                  }}
                  className="px-5 py-2 bg-[#58B947] hover:bg-[#4da83d] text-white text-xs font-bold rounded-xl shadow-md shadow-green-500/20 transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <FiUserPlus className="w-3.5 h-3.5" />
                  <span>Create Account</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Branch Directory Modal (Locations & Call Us by Branch) */}
      {branchModalType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6 bg-black/60 backdrop-blur-md overflow-y-auto animate-[fadeIn_0.15s_ease]">
          <div
            className="fixed inset-0 cursor-pointer"
            onClick={() => setBranchModalType(null)}
            aria-label="Close modal overlay"
          />

          <div className="relative w-full max-w-3xl bg-white dark:bg-[#121c29] text-gray-900 dark:text-white rounded-3xl shadow-2xl border border-gray-200 dark:border-white/10 overflow-hidden my-auto max-h-[90vh] flex flex-col z-10 animate-[slideUp_0.2s_ease]">
            {/* Modal Header */}
            <div className="px-6 py-5 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between gap-4 bg-gray-50/80 dark:bg-slate-900/60 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#58B947]/15 text-[#58B947] flex items-center justify-center shrink-0">
                  {branchModalType === 'call' ? (
                    <FiPhone className="w-5 h-5" />
                  ) : (
                    <FiMapPin className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <h3 className="font-extrabold text-base sm:text-lg text-gray-900 dark:text-white">
                    {branchModalType === 'call' ? 'Call Us by Branch' : 'Our Locations by Branch'}
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-slate-400">
                    {branchModalType === 'call'
                      ? 'We accept calls 24/7 — direct store contact numbers by branch'
                      : 'Open on Monday to Saturday • Time: 8:00 AM to 5:00 PM'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setBranchModalType(null)}
                className="w-9 h-9 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
                aria-label="Close modal"
              >
                <FiX className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-5 flex-1">
              <div className="px-4 py-3 rounded-2xl bg-slate-100/80 dark:bg-slate-800/70 border border-gray-200/80 dark:border-slate-700/70 flex items-center gap-2.5 text-xs font-semibold text-gray-700 dark:text-slate-200">
                <FiClock className="w-4 h-4 text-[#58B947] shrink-0" />
                <span>
                  {branchModalType === 'call'
                    ? 'We accept calls 24/7 — reach out anytime for inquiries, orders, or support.'
                    : 'Open on Monday to Saturday, 8:00 AM to 5:00 PM.'}
                </span>
              </div>
              {branchModalType === 'locations' && companyAddress && (
                <div className="p-4 rounded-2xl bg-[#58B947]/10 border border-[#58B947]/25 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-[#58B947]/20 text-[#58B947] flex items-center justify-center shrink-0 mt-0.5">
                      <FiHome className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-[11px] font-bold uppercase tracking-wider text-[#58B947] block">
                        Main Office / Primary Address
                      </span>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white mt-0.5">
                        {companyAddress}
                      </p>
                    </div>
                  </div>
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${companyName || 'Z-LICZ'} ${companyAddress}`)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-[#58B947] hover:underline shrink-0"
                  >
                    <FiMapPin className="w-3.5 h-3.5" /> View on Map
                  </a>
                </div>
              )}

              {branchModalType === 'call' && companyPhone && (
                <div className="p-4 rounded-2xl bg-[#58B947]/10 border border-[#58B947]/25 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-[#58B947]/20 text-[#58B947] flex items-center justify-center shrink-0 mt-0.5">
                      <FiPhone className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-[11px] font-bold uppercase tracking-wider text-[#58B947] block">
                        Main Office Hotline
                      </span>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white mt-0.5">
                        {companyPhone}
                      </p>
                    </div>
                  </div>
                  <a
                    href={`tel:${companyPhone}`}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#58B947] hover:bg-[#4da83d] text-white text-xs font-bold transition-colors shrink-0"
                  >
                    <FiPhone className="w-3.5 h-3.5" /> Call Main Office
                  </a>
                </div>
              )}

              {branchLocations.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {branchLocations.map((branch) => {
                    const isOpen = (branch.status || 'open').toLowerCase() === 'open'
                    const mapQuery = encodeURIComponent(
                      [branch.name, branch.location].filter(Boolean).join(' ')
                    )
                    return (
                      <div
                        key={branch.id}
                        className="rounded-2xl border border-gray-200 dark:border-slate-700/80 bg-gray-50/80 dark:bg-slate-800/60 p-4 flex flex-col justify-between gap-4 hover:border-[#58B947]/50 transition-colors"
                      >
                        <div className="space-y-3">
                          <div className="flex items-start gap-3">
                            {branch.image_url ? (
                              <img
                                src={getLogoUrl(branch.image_url)}
                                alt={branch.name}
                                className="w-12 h-12 rounded-xl object-cover border border-gray-200 dark:border-slate-700 shrink-0"
                              />
                            ) : (
                              <div
                                className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-base shrink-0 shadow-sm"
                                style={{ backgroundColor: branch.color || '#58B947' }}
                              >
                                {branchModalType === 'call' ? (
                                  <FiPhone className="w-5 h-5" />
                                ) : (
                                  <FiMapPin className="w-5 h-5" />
                                )}
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <h4 className="font-bold text-sm text-gray-900 dark:text-white truncate">
                                  {branch.name}
                                </h4>
                                <span
                                  className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0 ${isOpen
                                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60'
                                    : 'bg-gray-200 text-gray-600 dark:bg-slate-700 dark:text-slate-300'
                                    }`}
                                >
                                  {branch.status || 'Open'}
                                </span>
                              </div>
                              {branchModalType === 'call' ? (
                                <>
                                  <p className="text-sm font-bold text-[#58B947] mt-1 flex items-center gap-1.5">
                                    <FiPhone className="w-3.5 h-3.5 shrink-0" />
                                    <span>{branch.contact_number || 'No hotline listed'}</span>
                                  </p>
                                  {branch.location && (
                                    <p className="text-[11px] text-gray-500 dark:text-slate-400 mt-1 flex items-start gap-1.5">
                                      <FiMapPin className="w-3 h-3 shrink-0 mt-0.5" />
                                      <span>{branch.location}</span>
                                    </p>
                                  )}
                                </>
                              ) : (
                                <p className="text-xs text-gray-600 dark:text-slate-300 mt-1 flex items-start gap-1.5 leading-relaxed">
                                  <FiMapPin className="w-3.5 h-3.5 text-[#58B947] shrink-0 mt-0.5" />
                                  <span>{branch.location || 'Location not specified'}</span>
                                </p>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="pt-3 border-t border-gray-200/80 dark:border-slate-700/70 flex items-center justify-end gap-2 text-xs">
                          {branchModalType === 'call' ? (
                            branch.contact_number ? (
                              <a
                                href={`tel:${branch.contact_number}`}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#58B947] hover:bg-[#4da83d] text-white font-bold transition-colors shrink-0"
                              >
                                <FiPhone className="w-3.5 h-3.5" />
                                <span>Call Branch</span>
                              </a>
                            ) : (
                              <span className="text-gray-400 dark:text-slate-500 italic">Unavailable</span>
                            )
                          ) : (
                            branch.location ? (
                              <a
                                href={`https://www.google.com/maps/search/?api=1&query=${mapQuery}`}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 font-bold text-[#58B947] hover:underline shrink-0"
                              >
                                <span>Directions</span>
                                <FiArrowRight className="w-3 h-3" />
                              </a>
                            ) : null
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-sm text-gray-500 dark:text-slate-400">
                  No individual branch details have been configured yet.
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-gray-100 dark:border-slate-800 bg-gray-50/80 dark:bg-slate-900/60 flex items-center justify-between gap-3 shrink-0">
              <span className="text-xs text-gray-500 dark:text-slate-400">
                {companyName || 'Z-LICZ'} Store Directory
              </span>
              <button
                type="button"
                onClick={() => setBranchModalType(null)}
                className="px-5 py-2 rounded-xl bg-[#58B947] hover:bg-[#4da83d] text-white text-xs font-bold transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
