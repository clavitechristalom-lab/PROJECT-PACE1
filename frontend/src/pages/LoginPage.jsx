import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  FiSun, FiMoon, FiMail, FiLock, FiUser, FiEye, FiEyeOff,
  FiX, FiAlertTriangle, FiCheckCircle, FiLogIn, FiUserPlus,
  FiShield, FiHome, FiBriefcase, FiUsers, FiEdit3, FiMenu, FiArrowRight,
  FiMapPin, FiPhone, FiGlobe, FiTool, FiCreditCard, FiPackage, FiLogOut
} from 'react-icons/fi'
import { showSuccess, showError, showLoading, closeLoading } from '../lib/swal'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { Spinner, Pagination } from '../components/ui'
import { api, STORAGE_BASE } from '../lib/api'
import heroImg from '../assets/furniture-hero.png'


export default function LoginPage() {
  const { login, register, user, checkingAuth } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('login')
  const [isContactModalOpen, setIsContactModalOpen] = useState(false)
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

  const formatStat = (num, defaultStr) => {
    if (num === undefined || num === null) return defaultStr
    if (num < 10) return num.toString()
    return `${num}+`
  }

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
        const sRes = await api.system.getPublicSettings()
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
    if (logo.startsWith('blob:') || logo.startsWith('http')) return logo;
    const path = logo.startsWith('/') ? logo : (logo.startsWith('storage/') ? `/${logo}` : `/storage/${logo}`);
    return `${STORAGE_BASE || 'http://localhost:8000'}${path}`;
  }

  useEffect(() => {
    if (sysSettings) {
      document.title = companyName ? `${companyName} Appliances and Furniture` : 'Z-LICZ Operations'
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
    <div className="page-shell">
      <div id="home" className="hero">
        <img src={heroImg} className="hero-image" alt="Interior" />
        <div className="hero-wash" />

        <header className="site-header">
          <div className="logo flex items-center gap-3">
            {companyLogo ? (
              <img src={getLogoUrl(companyLogo)} alt={companyName || 'Logo'} style={{ height: '36px', width: 'auto', objectFit: 'contain' }} />
            ) : (
              <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center text-blue-600 font-black text-xl shadow-md shrink-0">
                Z
              </div>
            )}
            <div className="flex flex-col justify-center">
              <span className="text-xl font-extrabold tracking-tight text-black ">
                {companyName || 'Z-LICZ'}
              </span>
            </div>
          </div>

          <nav className={`nav-links flex items-center gap-6 ${mobileMenuOpen ? 'nav-links-open' : ''}`}>
            <a href="#home" onClick={() => setMobileMenuOpen(false)}>Home</a>
            <a href="#appliances" onClick={() => setMobileMenuOpen(false)}>Appliances</a>
            <a href="#furniture" onClick={() => setMobileMenuOpen(false)}>Furniture</a>
            <a href="#about" onClick={() => setMobileMenuOpen(false)}>About</a>
            <a href="#support" onClick={() => setMobileMenuOpen(false)}>Support</a>
            <button
              onClick={toggleMode}
              className="p-2 rounded-full hover:bg-black/5 :bg-white/10 transition-colors text-black "
              title="Toggle Theme"
            >
              {isDark ? <FiSun className="w-5 h-5" /> : <FiMoon className="w-5 h-5" />}
            </button>
          </nav>

          <button className="menu-button" onClick={() => setMobileMenuOpen(o => !o)} aria-label="Toggle mobile menu">
            <span /><span /><span />
          </button>
          <div style={{ justifySelf: 'end' }} className="hidden md:block"></div>
        </header>

        <div className="hero-content">
          <h1>
            Elevate Every<br />
            Corner of <strong>Home</strong>
          </h1>

          <p>
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
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
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
          <a href="#appliances" className="service hover:bg-white/5 transition-colors cursor-pointer">
            <div className="service-icon">
              <svg viewBox="0 0 24 24" fill="none"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect><circle cx="12" cy="12" r="3"></circle><line x1="12" y1="18" x2="12" y2="18"></line></svg>
            </div>
            <div>
              <h2>Home Appliances</h2>
              <p>Smart essentials that make everyday living effortless.</p>
              {sysSettings?.total_appliances > 0 && <span className="text-[10px] font-bold text-[#58B947] mt-1.5 block uppercase tracking-wider">{sysSettings.total_appliances} Products Available</span>}
            </div>
          </a>
          <a href="#furniture" className="service hover:bg-white/5 transition-colors cursor-pointer">
            <div className="service-icon">
              <svg viewBox="0 0 24 24" fill="none"><path d="M20 9V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v2"></path><path d="M22 13v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"></path></svg>
            </div>
            <div>
              <h2>Living Room</h2>
              <p>Comfortable furniture designed for gathering and relaxing.</p>
              {sysSettings?.total_furniture > 0 && <span className="text-[10px] font-bold text-[#58B947] mt-1.5 block uppercase tracking-wider">{sysSettings.total_furniture} Products Available</span>}
            </div>
          </a>
          <a href="#furniture" className="service hover:bg-white/5 transition-colors cursor-pointer">
            <div className="service-icon">
              <svg viewBox="0 0 24 24" fill="none"><path d="M2 4v16"></path><path d="M2 8h18a2 2 0 0 1 2 2v10"></path><path d="M2 17h20"></path><path d="M6 8v9"></path></svg>
            </div>
            <div>
              <h2>Bedroom</h2>
              <p>Restful pieces created for calm, beautifully layered spaces.</p>
              {sysSettings?.total_furniture > 0 && <span className="text-[10px] font-bold text-[#58B947] mt-1.5 block uppercase tracking-wider">{sysSettings.total_furniture} Products Available</span>}
            </div>
          </a>
          <a href="#furniture" className="service hover:bg-white/5 transition-colors cursor-pointer">
            <div className="service-icon">
              <svg viewBox="0 0 24 24" fill="none"><rect x="3" y="10" width="18" height="4" rx="1"></rect><line x1="7" y1="14" x2="7" y2="21"></line><line x1="17" y1="14" x2="17" y2="21"></line><line x1="12" y1="3" x2="12" y2="10"></line></svg>
            </div>
            <div>
              <h2>Dining & Decor</h2>
              <p>Finishing touches that bring warmth and character home.</p>
              {sysSettings?.total_furniture > 0 && <span className="text-[10px] font-bold text-[#58B947] mt-1.5 block uppercase tracking-wider">{sysSettings.total_furniture} Products Available</span>}
            </div>
          </a>
        </div>
      </div>

      <main className="relative z-10 w-full bg-[#f5f3ed]">
        <section id="about" className="px-4 md:px-16 py-20 bg-white border-t border-gray-200">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-14">
              <span className="text-xs font-bold uppercase tracking-widest text-[#58B947] mb-3 block">Who We Are</span>
              <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 mb-4">About {companyName || 'Z-LICZ'}</h2>
              <p className="text-base md:text-lg max-w-3xl mx-auto leading-relaxed text-gray-500">
                {companyName || 'Z-LICZ'} is your one-stop shop for premium quality home essentials — offering elegant furniture and state-of-the-art appliances that transform your house into a home you love.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {companyAddress && (
                <div className="rounded-2xl border border-gray-100 bg-gray-50 p-7 flex flex-col gap-4 shadow-sm hover:shadow-md transition-shadow">
                  <div className="w-12 h-12 rounded-xl bg-[#58B947]/10 flex items-center justify-center">
                    <FiMapPin className="w-6 h-6 text-[#58B947]" />
                  </div>
                  <h3 className="font-bold text-gray-900 text-base">Our Location</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">{companyAddress}</p>
                </div>
              )}
              {companyPhone && (
                <div className="rounded-2xl border border-gray-100 bg-gray-50 p-7 flex flex-col gap-4 shadow-sm hover:shadow-md transition-shadow">
                  <div className="w-12 h-12 rounded-xl bg-[#58B947]/10 flex items-center justify-center">
                    <FiPhone className="w-6 h-6 text-[#58B947]" />
                  </div>
                  <h3 className="font-bold text-gray-900 text-base">Call Us</h3>
                  <a href={`tel:${companyPhone}`} className="text-[#58B947] font-semibold text-sm hover:underline">{companyPhone}</a>
                </div>
              )}
              {companyEmail && (
                <button
                  onClick={() => setIsContactModalOpen(true)}
                  className="rounded-2xl border border-gray-100 bg-gray-50 p-7 flex flex-col gap-4 shadow-sm hover:shadow-md transition-shadow text-left"
                >
                  <div className="w-12 h-12 rounded-xl bg-[#58B947]/10 flex items-center justify-center">
                    <FiMail className="w-6 h-6 text-[#58B947]" />
                  </div>
                  <h3 className="font-bold text-gray-900 text-base">Email Us</h3>
                  <span className="text-[#58B947] font-semibold text-sm hover:underline">{companyEmail}</span>
                </button>
              )}
              {!companyAddress && !companyPhone && !companyEmail && (
                <div className="md:col-span-3 rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-10 text-center text-gray-400 text-sm">
                  Contact details will appear here once configured in system settings.
                </div>
              )}
            </div>
          </div>
        </section>

        <section id="support" className="px-4 md:px-16 py-20 bg-[#f5f3ed]">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-14">
              <span className="text-xs font-bold uppercase tracking-widest text-[#58B947] mb-3 block">We're Here For You</span>
              <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 mb-4">Support & Service</h2>
              <p className="text-base md:text-lg max-w-3xl mx-auto leading-relaxed text-gray-500">
                From product inquiries to after-sales service, our dedicated team ensures your complete satisfaction — whether it's installments, warranty claims, or product maintenance.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="rounded-2xl bg-white border border-gray-100 p-7 shadow-sm hover:shadow-md transition-shadow flex flex-col gap-4">
                <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center">
                  <FiShield className="w-6 h-6 text-blue-500" />
                </div>
                <h3 className="font-bold text-gray-900">Warranty Support</h3>
                <p className="text-gray-500 text-sm">All products come with a standard warranty. Contact us for claims and assistance.</p>
              </div>
              <div className="rounded-2xl bg-white border border-gray-100 p-7 shadow-sm hover:shadow-md transition-shadow flex flex-col gap-4">
                <div className="w-12 h-12 rounded-xl bg-purple-50 flex items-center justify-center">
                  <FiCreditCard className="w-6 h-6 text-purple-500" />
                </div>
                <h3 className="font-bold text-gray-900">Installment Plans</h3>
                <p className="text-gray-500 text-sm">Flexible payment options available. Manage your installments easily through our system.</p>
              </div>
              <div className="rounded-2xl bg-white border border-gray-100 p-7 shadow-sm hover:shadow-md transition-shadow flex flex-col gap-4">
                <div className="w-12 h-12 rounded-xl bg-orange-50 flex items-center justify-center">
                  <FiTool className="w-6 h-6 text-orange-500" />
                </div>
                <h3 className="font-bold text-gray-900">Maintenance</h3>
                <p className="text-gray-500 text-sm">Need servicing? We'll connect you with our expert technicians for fast repairs.</p>
              </div>
            </div>
            <div className="text-center flex flex-wrap gap-4 justify-center">
              <button
                onClick={() => { setError(''); setActiveTab('signup'); setIsLoginModalOpen(true); }}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#58B947] text-white text-sm font-bold hover:bg-[#4da83d] transition-colors shadow-md shadow-green-500/20"
              >
                <FiUserPlus className="w-4 h-4" /> Create Account
              </button>
              {companyEmail && (
                <button
                  onClick={() => setIsContactModalOpen(true)}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white border border-gray-200 text-gray-700 text-sm font-bold hover:bg-gray-50 transition-colors shadow-sm"
                >
                  <FiMail className="w-4 h-4" /> Email Support
                </button>
              )}
              {companyWebLinks && (
                <a href={companyWebLinks} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white border border-gray-200 text-blue-600 text-sm font-bold hover:bg-gray-50 transition-colors shadow-sm">
                  <FiGlobe className="w-4 h-4" /> Visit Website
                </a>
              )}
            </div>
          </div>
        </section>

        <section id="appliances" className="px-4 md:px-16 py-16 bg-white">
          <div className="max-w-6xl mx-auto">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-2xl md:text-3xl font-bold text-gray-900">Appliances</h2>
                <p className="text-xs sm:text-sm text-gray-500 mt-1">Energy-efficient and dependable appliances for your everyday home</p>
              </div>
            </div>

            {loadingProducts ? (
              <div className="flex justify-center py-12"><Spinner className="w-8 h-8 text-gray-900" /></div>
            ) : appliances.length > 0 ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                  {paginatedAppliances.map(product => (
                    <div key={product.product_id || product.id} className="rounded-2xl overflow-hidden border bg-white border-gray-200 shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg group cursor-pointer">
                      <div className="h-48 bg-gray-100 overflow-hidden relative">
                        {product.image_url ? (
                          <img
                            src={product.image_url.startsWith('http') ? product.image_url : `${STORAGE_BASE || 'http://localhost:8000'}${product.image_url.startsWith('/') ? '' : '/storage/'}${product.image_url}`}
                            alt={product.product_name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
                          />
                        ) : null}
                        <div className={`w-full h-full flex items-center justify-center text-gray-300 font-medium bg-gradient-to-br from-gray-50 to-gray-100 ${product.image_url ? 'hidden' : 'flex'}`}>
                          <svg viewBox="0 0 24 24" fill="none" className="w-12 h-12 opacity-30" stroke="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"></rect><circle cx="12" cy="12" r="3"></circle></svg>
                        </div>
                        {product.discount_price && Number(product.discount_price) < Number(product.unit_price) && (
                          <span className="absolute top-2 left-2 bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">SALE</span>
                        )}
                      </div>
                      <div className="p-5">
                        {product.brand && <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">{product.brand}</p>}
                        <h3 className="font-bold mb-1 text-gray-900 leading-tight" title={product.product_name}>{product.product_name}</h3>
                        {product.description && <p className="text-xs text-gray-400 mb-2 line-clamp-2">{product.description}</p>}
                        <div className="flex items-center justify-between mt-2">
                          <div>
                            {product.discount_price && Number(product.discount_price) < Number(product.unit_price) ? (
                              <>
                                <p className="text-[#58B947] font-bold text-base">₱{Number(product.discount_price).toLocaleString()}</p>
                                <p className="text-gray-400 text-xs line-through">₱{Number(product.unit_price).toLocaleString()}</p>
                              </>
                            ) : (
                              <p className="text-[#58B947] font-bold text-base">₱{Number(product.unit_price).toLocaleString()}</p>
                            )}
                          </div>
                          {product.stock_quantity !== undefined && (
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${product.stock_quantity > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-500'}`}>
                              {product.stock_quantity > 0 ? `${product.stock_quantity} in stock` : 'Out of stock'}
                            </span>
                          )}
                        </div>
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
              <p className="text-center py-10 text-gray-500">No appliances available at the moment.</p>
            )}
          </div>
        </section>

        <section id="furniture" className="px-4 md:px-16 py-16 bg-[#f5f3ed]">
          <div className="max-w-6xl mx-auto">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-2xl md:text-3xl font-bold text-gray-900">Furniture</h2>
                <p className="text-xs sm:text-sm text-gray-500 mt-1">Comfortable, elegant, and stylish furniture crafted to elevate your home</p>
              </div>
            </div>

            {loadingProducts ? (
              <div className="flex justify-center py-12"><Spinner className="w-8 h-8 text-gray-900" /></div>
            ) : furniture.length > 0 ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                  {paginatedFurniture.map(product => (
                    <div key={product.product_id || product.id} className="rounded-2xl overflow-hidden border bg-white border-gray-200 shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg group cursor-pointer">
                      <div className="h-48 bg-gray-100 overflow-hidden relative">
                        {product.image_url ? (
                          <img
                            src={product.image_url.startsWith('http') ? product.image_url : `${STORAGE_BASE || 'http://localhost:8000'}${product.image_url.startsWith('/') ? '' : '/storage/'}${product.image_url}`}
                            alt={product.product_name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
                          />
                        ) : null}
                        <div className={`w-full h-full flex items-center justify-center text-gray-300 font-medium bg-gradient-to-br from-gray-50 to-gray-100 ${product.image_url ? 'hidden' : 'flex'}`}>
                          <svg viewBox="0 0 24 24" fill="none" className="w-12 h-12 opacity-30" stroke="currentColor"><path d="M20 9V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v2"></path><path d="M22 13v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"></path></svg>
                        </div>
                        {product.discount_price && Number(product.discount_price) < Number(product.unit_price) && (
                          <span className="absolute top-2 left-2 bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">SALE</span>
                        )}
                      </div>
                      <div className="p-5">
                        {product.brand && <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">{product.brand}</p>}
                        <h3 className="font-bold mb-1 text-gray-900 leading-tight" title={product.product_name}>{product.product_name}</h3>
                        {product.description && <p className="text-xs text-gray-400 mb-2 line-clamp-2">{product.description}</p>}
                        <div className="flex items-center justify-between mt-2">
                          <div>
                            {product.discount_price && Number(product.discount_price) < Number(product.unit_price) ? (
                              <>
                                <p className="text-[#58B947] font-bold text-base">₱{Number(product.discount_price).toLocaleString()}</p>
                                <p className="text-gray-400 text-xs line-through">₱{Number(product.unit_price).toLocaleString()}</p>
                              </>
                            ) : (
                              <p className="text-[#58B947] font-bold text-base">₱{Number(product.unit_price).toLocaleString()}</p>
                            )}
                          </div>
                          {product.stock_quantity !== undefined && (
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${product.stock_quantity > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-500'}`}>
                              {product.stock_quantity > 0 ? `${product.stock_quantity} in stock` : 'Out of stock'}
                            </span>
                          )}
                        </div>
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
              <p className="text-center py-10 text-gray-500">No furniture available at the moment.</p>
            )}
          </div>
        </section>

        {/* Footer */}
        <footer className="bg-[#0f1f3d] text-white px-4 md:px-16 py-12">
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-10 mb-10">
              <div className="md:col-span-2">
                <div className="flex items-center gap-3 mb-4">
                  {companyLogo ? (
                    <img src={getLogoUrl(companyLogo)} alt={companyName} style={{ height: '36px', width: 'auto', objectFit: 'contain' }} />
                  ) : (
                    <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center text-blue-600 font-black text-xl shadow-md shrink-0">Z</div>
                  )}
                  <span className="text-xl font-extrabold tracking-tight">{companyName || 'Z-LICZ'}</span>
                </div>
                <p className="text-sm text-white/50 leading-relaxed max-w-sm">
                  Your trusted destination for premium home appliances and furniture. Elevate every corner of your home.
                </p>
                {companyAddress && (
                  <p className="text-xs text-white/40 mt-4 flex items-center gap-1.5">
                    <FiMapPin className="w-3 h-3 flex-shrink-0" /> {companyAddress}
                  </p>
                )}
              </div>
              <div>
                <h4 className="font-bold text-sm mb-4 text-white/80 uppercase tracking-widest">Quick Links</h4>
                <ul className="space-y-2 text-sm text-white/50">
                  <li><a href="#home" className="hover:text-white transition-colors flex items-center gap-2"><FiHome className="w-3 h-3" /> Home</a></li>
                  <li><a href="#appliances" className="hover:text-white transition-colors flex items-center gap-2"><FiPackage className="w-3 h-3" /> Appliances</a></li>
                  <li><a href="#furniture" className="hover:text-white transition-colors flex items-center gap-2"><FiUsers className="w-3 h-3" /> Furniture</a></li>
                  <li><a href="#about" className="hover:text-white transition-colors flex items-center gap-2"><FiUsers className="w-3 h-3" /> About Us</a></li>
                  <li><a href="#support" className="hover:text-white transition-colors flex items-center gap-2"><FiShield className="w-3 h-3" /> Support</a></li>
                </ul>
              </div>
              <div>
                <h4 className="font-bold text-sm mb-4 text-white/80 uppercase tracking-widest">Contact</h4>
                <ul className="space-y-2 text-sm text-white/50">
                  {companyPhone && <li><a href={`tel:${companyPhone}`} className="hover:text-white transition-colors flex items-center gap-2"><FiPhone className="w-3 h-3" /> {companyPhone}</a></li>}
                  {companyEmail && <li><a href={`mailto:${companyEmail}`} className="hover:text-white transition-colors flex items-center gap-2"><FiMail className="w-3 h-3" /> {companyEmail}</a></li>}
                  {companyWebLinks && <li><a href={companyWebLinks} target="_blank" rel="noreferrer" className="hover:text-white transition-colors flex items-center gap-2"><FiGlobe className="w-3 h-3" /> Website</a></li>}
                  {!companyPhone && !companyEmail && !companyWebLinks && <li className="text-white/30 text-xs italic">Contact details not configured</li>}
                </ul>
                <div className="mt-6">
                  <button
                    onClick={() => { setError(''); setActiveTab('login'); setIsLoginModalOpen(true); }}
                    className="text-xs font-bold bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
                  >
                    <FiLogIn className="w-3.5 h-3.5" /> Sign In
                  </button>
                </div>
              </div>
            </div>
            <div className="border-t border-white/10 pt-6 flex flex-col sm:flex-row justify-between items-center gap-3 text-xs text-white/30">
              <span>© {new Date().getFullYear()} {companyName || 'Z-LICZ'}. All rights reserved.</span>
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

            <div className="md:col-span-6 bg-transparent p-6 sm:p-10 flex flex-col justify-between border-t md:border-t-0 md:border-l border-white/10 max-h-[90vh] overflow-y-auto">
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
                          onClick={() => {
                            setError(
                              'Please contact system administrator.'
                            )
                          }}
                          className="text-xs text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
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
                      <label className="block text-xs font-semibold text-slate-300 mb-1">Phone Number</label>
                      <input
                        type="tel"
                        value={signUpData.phone}
                        onChange={(e) => {
                          setSignUpData({ ...signUpData, phone: e.target.value.replace(/\D/g, '') })
                          if (signUpErrors.phone) setSignUpErrors({ ...signUpErrors, phone: '' })
                        }}
                        placeholder="e.g. 09123456789"
                        className={`w-full bg-white/5 border rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 transition-all ${signUpErrors.phone ? 'border-rose-500/80 focus:ring-rose-500/30' : 'border-slate-800 focus:border-blue-500 focus:ring-blue-500/20'}`}
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
                          className={`w-full bg-white/5 border rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 transition-all ${signUpErrors.gender ? 'border-rose-500/80 focus:ring-rose-500/30' : 'border-slate-800 focus:border-blue-500 focus:ring-blue-500/20'}`}
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
                          className={`w-full bg-white/5 border rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 transition-all appearance-none [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:right-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:cursor-pointer ${signUpErrors.date_of_birth ? 'border-rose-500/80 focus:ring-rose-500/30' : 'border-slate-800 focus:border-blue-500 focus:ring-blue-500/20'}`}
                        />
                        {signUpErrors.date_of_birth && <p className="text-[11px] text-rose-400 mt-1">{signUpErrors.date_of_birth}</p>}
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">Status</label>
                        <select
                          value={signUpData.marital_status}
                          onChange={(e) => setSignUpData({ ...signUpData, marital_status: e.target.value })}
                          className={`w-full bg-white/5 border rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 transition-all ${signUpErrors.marital_status ? 'border-rose-500/80 focus:ring-rose-500/30' : 'border-slate-800 focus:border-blue-500 focus:ring-blue-500/20'}`}
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
                              className={`w-full bg-white/5 border rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 transition-all ${signUpErrors.username ? 'border-rose-500/80 focus:ring-rose-500/30' : 'border-slate-800 focus:border-blue-500 focus:ring-blue-500/20'}`}
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
                              className={`w-full bg-white/5 border rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:ring-2 transition-all cursor-pointer ${signUpErrors.branch_id ? 'border-rose-500/80' : 'border-slate-800 focus:border-blue-500'}`}
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
                            className={`w-full bg-white/5 border rounded-xl px-3.5 py-2.5 text-sm font-mono tracking-widest text-center text-white placeholder-slate-500 focus:outline-none focus:ring-2 transition-all ${signUpErrors.attendance_pin
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
                            className={`w-full bg-white/5 border rounded-xl px-3.5 py-2.5 text-sm font-mono tracking-widest text-center text-white placeholder-slate-500 focus:outline-none focus:ring-2 transition-all ${signUpErrors.confirm_attendance_pin
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



      {/* Contact Us Modal */}
      {isContactModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-md animate-[fadeIn_0.15s_ease]">
          <div className="absolute inset-0 cursor-pointer" onClick={() => setIsContactModalOpen(false)} />
          <div className="relative w-full max-w-md bg-white rounded-3xl overflow-hidden shadow-2xl z-10 p-8 animate-[slideUp_0.2s_ease]">
            <button
              onClick={() => setIsContactModalOpen(false)}
              className="absolute top-5 right-5 text-gray-400 hover:text-gray-900 transition-colors"
            >
              <FiX className="w-6 h-6" />
            </button>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Contact Support</h2>
            <p className="text-sm text-gray-500 mb-6">Send us a message and we'll get back to you soon.</p>

            <form onSubmit={handleContactSubmit} className="space-y-4">
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
              <button
                type="submit"
                className="w-full bg-[#58B947] hover:bg-[#4da83d] text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 mt-2"
              >
                <FiMail className="w-5 h-5" /> Send Message
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
