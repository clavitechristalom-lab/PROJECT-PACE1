import { useState, useEffect, useRef, useMemo, useDeferredValue } from 'react'
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
import { fmtDate, filterBySearch, fastDeepEqual } from '../lib/utils'
import { api, downloadCsv } from '../lib/api'
import { useRealtimeSync, triggerDataSync, SyncButton } from '../lib/realtimeSync'
import { downloadCenteredQrPng, printSingleBadge } from '../lib/qrBadge'
import { QRCodeSVG } from 'qrcode.react'
import FaceRecognitionEnrollment from '../components/biometrics/FaceRecognitionEnrollment'

const DEPARTMENTS = ['All', 'Store Admin', 'Employee']
const STATUSES = ['All', 'Present', 'Late', 'Absent', 'Half Day']
const DEFAULT_PERIOD_START = '2026-10-12'
const DEFAULT_PERIOD_END = '2026-11-20'

export default function AttendancePage({ branchFilter: propBranchFilter, embedded }) {
  const { user, verifySession } = useAuth()
  const navigate = useNavigate()
  const isAdmin = user?.role === 'Administrator'
  const isEmployee = user?.role === 'Employee'
  const isStoreAdmin = user?.role === 'Store Administrator' || user?.role === 'Store Admin'
  const userBranch = user?.employee?.branch?.name || (typeof user?.employee?.branch === 'string' ? user.employee.branch : '') || 'All Branches'

  const location = useLocation()
  const [searchParams] = useSearchParams()
  const [faceAuthModalOpen, setFaceAuthModalOpen] = useState(false)

  // Branch Selection & Filter
  const [branches, setBranches] = useState([])
  const [localBranchFilter, setLocalBranchFilter] = useState(() => {
    if (propBranchFilter) return propBranchFilter
    if (isStoreAdmin && userBranch && userBranch !== 'All Branches') return userBranch
    return 'All'
  })
  const branchFilter = propBranchFilter || localBranchFilter

  const [activeTab, setActiveTab] = useState(
    isEmployee ? 'my-qr' : 'log'
  )

  useEffect(() => {
    if (isEmployee || isStoreAdmin || branches.length > 0) return
    if (activeTab !== 'log' && activeTab !== 'timesheet' && activeTab !== 'audit') return
    api.branches.getAll()
      .then(res => {
        if (res) {
          const list = Array.isArray(res) ? res : (res?.branches || [])
          setBranches(list)
        }
      })
      .catch(err => console.error('Failed to load branches in AttendancePage:', err))
  }, [activeTab, isEmployee, isStoreAdmin, branches.length])
  const [records, setRecords] = useState(() => {
    try {
      const saved = sessionStorage.getItem('pace_cached_attendance_records')
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })
  const [summary, setSummary] = useState(() => {
    try {
      const saved = sessionStorage.getItem('pace_cached_attendance_summary')
      return saved ? JSON.parse(saved) : null
    } catch { return null }
  })
  const [loading, setLoading] = useState(() => {
    return !sessionStorage.getItem('pace_cached_attendance_records')
  })
  const [error, setError] = useState('')
  const [schedule, setSchedule] = useState({
    labels: { time_in: '08:00 AM', cutoff: '08:00 AM', lunch_out: '12:00 PM', lunch_in: '01:00 PM', time_out: '05:00 PM' },
  })

  // Branch Options List
  const branchOptions = useMemo(() => {
    const names = new Set()
    branches.forEach(b => {
      const n = b.name || b.branch_name
      if (n) names.add(n)
    })
    records.forEach(r => {
      const n = r.branch?.name || (typeof r.branch === 'string' ? r.branch : '')
      if (n && n !== '—') names.add(n)
    })
    if (names.size === 0) {
      names.add('Z-LICS / ILIGAN')
      names.add('C-LICZ / C.D.O')
    }
    return Array.from(names)
  }, [branches, records])

  // Logs & Filters
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [deptFilter, setDeptFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')
  const [page, setPage] = useState(1)
  const pageSize = 12

  // Period Analytics & Simulation State (Oct 12 - Nov 20)
  const [periodStart, setPeriodStart] = useState(DEFAULT_PERIOD_START)
  const [periodEnd, setPeriodEnd] = useState(DEFAULT_PERIOD_END)
  const [periodRoleFilter, setPeriodRoleFilter] = useState('All')
  const [periodSearch, setPeriodSearch] = useState('')
  const deferredPeriodSearch = useDeferredValue(periodSearch)
  const [periodMetrics, setPeriodMetrics] = useState(null)
  const [periodLoading, setPeriodLoading] = useState(false)
  const [selectedStaffMetrics, setSelectedStaffMetrics] = useState(null)

  // Scan Logs Tab State
  const [scanLogs, setScanLogs] = useState([])
  const [scanLogsLoading, setScanLogsLoading] = useState(false)
  const [scanLogsPage, setScanLogsPage] = useState(1)
  const [scanLogsTotal, setScanLogsTotal] = useState(0)
  const [scanLogsStatusFilter, setScanLogsStatusFilter] = useState('All')
  const [scanLogsActionFilter, setScanLogsActionFilter] = useState('All')

  // QR Request Modal State
  const [qrRequestModalOpen, setQrRequestModalOpen] = useState(false)
  const [submittingRequest, setSubmittingRequest] = useState(false)

  // Employee Profile for Employee View
  const [myProfile, setMyProfile] = useState(null)
  const [myProfileLoading, setMyProfileLoading] = useState(false)

  const inFlightRef = useRef(false)
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const loadData = async (silent = false) => {
    if (inFlightRef.current) return
    inFlightRef.current = true

    const isBg = silent || records.length > 0
    if (!isBg) setLoading(true)
    if (!isBg) setError('')
    try {
      const data = await api.attendance.getDaily({
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        department: deptFilter !== 'All' ? deptFilter : undefined,
        status: statusFilter !== 'All' ? statusFilter : undefined,
        branch: branchFilter !== 'All' ? branchFilter : undefined,
      })
      if (!isMountedRef.current) return
      const newRecords = data.records || data.attendance || []
      const newSummary = data.summary || data.stats || null
      setRecords(prev => (fastDeepEqual(prev, newRecords) ? prev : newRecords))
      setSummary(prev => (fastDeepEqual(prev, newSummary) ? prev : newSummary))
      if (data.schedule?.labels) {
        setSchedule(prev => (fastDeepEqual(prev, data.schedule) ? prev : data.schedule))
      }
      try {
        if (!dateFrom && !dateTo && deptFilter === 'All' && statusFilter === 'All' && branchFilter === 'All') {
          sessionStorage.setItem('pace_cached_attendance_records', JSON.stringify(newRecords))
          if (newSummary) {
            sessionStorage.setItem('pace_cached_attendance_summary', JSON.stringify(newSummary))
          }
        }
      } catch (e) { }
    } catch (err) {
      if (!isMountedRef.current) return
      console.error('Failed to load attendance:', err)
      if (!isBg) setError(err.message || 'Failed to fetch attendance records')
    } finally {
      inFlightRef.current = false
      if (!isBg && isMountedRef.current) setLoading(false)
    }
  }

  const loadPeriodMetrics = async (silent = false) => {
    if (!silent) setPeriodLoading(true)
    try {
      const res = await api.attendance.getPeriodMetrics({
        start_date: periodStart || DEFAULT_PERIOD_START,
        end_date: periodEnd || DEFAULT_PERIOD_END,
        branch: branchFilter !== 'All' ? branchFilter : undefined,
        role: periodRoleFilter !== 'All' ? periodRoleFilter : undefined,
      })
      if (!isMountedRef.current) return
      if (res?.success) {
        setPeriodMetrics(prev => (fastDeepEqual(prev, res) ? prev : res))
      }
    } catch (err) {
      console.error('Failed to load period metrics:', err)
      if (!silent) showToast(err.message || 'Failed to load period attendance metrics', 'error')
    } finally {
      if (!silent && isMountedRef.current) setPeriodLoading(false)
    }
  }

  const loadScanLogs = async (silent = false) => {
    if (!silent) setScanLogsLoading(true)
    try {
      const res = await api.attendance.getScanLogs({
        page: scanLogsPage,
        status: scanLogsStatusFilter !== 'All' ? scanLogsStatusFilter : undefined,
        action_type: scanLogsActionFilter !== 'All' ? scanLogsActionFilter : undefined,
        branch: branchFilter !== 'All' ? branchFilter : undefined,
      })
      const newLogs = res.logs || []
      setScanLogs(prev => (fastDeepEqual(prev, newLogs) ? prev : newLogs))
      setScanLogsTotal(res.total || 0)
    } catch (err) {
      console.error('Failed to load scan logs:', err)
    } finally {
      if (!silent) setScanLogsLoading(false)
    }
  }

  const loadMyProfile = async (silent = false) => {
    if (!isEmployee && !isStoreAdmin) return
    if (!silent) setMyProfileLoading(true)
    try {
      const res = await api.employees.getMe()
      if (res?.employee) {
        setMyProfile(prev => (fastDeepEqual(prev, res.employee) ? prev : res.employee))
      }
    } catch (err) {
      console.error('Failed to load employee profile:', err)
    } finally {
      if (!silent) setMyProfileLoading(false)
    }
  }

  const handleSubmitQrRequest = async () => {
    setSubmittingRequest(true)
    try {
      const res = await api.qrRequests.create()
      if (res.success) {
        showToast(res.message || 'Your QR code request has been submitted to the Administrator.', 'success')
        setQrRequestModalOpen(false)
        loadMyProfile(true)
        triggerDataSync('qr_requests')
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
    if (isEmployee && activeTab === 'my-qr') {
      loadMyProfile()
    }
  }, [isEmployee, activeTab])

  useEffect(() => {
    if (activeTab === 'log') {
      loadData()
    } else if (activeTab === 'timesheet') {
      loadData()
      loadPeriodMetrics()
    } else if (activeTab === 'audit') {
      loadScanLogs()
    }
  }, [activeTab, dateFrom, dateTo, deptFilter, statusFilter, branchFilter, scanLogsPage, scanLogsStatusFilter, scanLogsActionFilter, periodStart, periodEnd, periodRoleFilter])

  // On-demand click-driven synchronization strictly scoped to active tab
  const { sync: syncAttendance, isSyncing: isSyncingAttendance } = useRealtimeSync(
    () => {
      if (activeTab === 'log') {
        loadData(false)
      } else if (activeTab === 'timesheet') {
        loadData(false)
        loadPeriodMetrics(false)
      } else if (activeTab === 'audit') {
        loadScanLogs(false)
      } else if (isEmployee && activeTab === 'my-qr') {
        loadMyProfile(false)
      }
    },
    [activeTab, isEmployee],
    { module: 'attendance' }
  )

  useEffect(() => {
    const searchParam = searchParams.get('search')
    const dateParam = searchParams.get('date')
    const dateFromParam = searchParams.get('date_from')
    const dateToParam = searchParams.get('date_to')
    const idParam = searchParams.get('id')
    const tabParam = searchParams.get('tab')
    if (tabParam && tabParam !== 'punch') {
      setActiveTab(tabParam)
    } else if (idParam || searchParam || dateParam || dateFromParam || dateToParam) {
      setActiveTab('log')
      if (searchParam) setSearch(searchParam)
      if (dateParam) {
        setDateFrom(dateParam)
        setDateTo(dateParam)
      }
      if (dateFromParam) setDateFrom(dateFromParam)
      if (dateToParam) setDateTo(dateToParam)
    }
  }, [searchParams])

  const handleDownloadMyQr = async () => {
    const ok = await downloadCenteredQrPng(
      'my-employee-qr',
      `QR_${myProfile?.employee_code || 'Badge'}`,
      {
        name: `${myProfile?.first_name || ''} ${myProfile?.last_name || ''}`.trim(),
        code: myProfile?.employee_code || '',
      }
    )
    if (ok) showToast('High-resolution centered QR badge downloaded!', 'success')
  }

  const handlePrintMyBadge = () => {
    if (!myProfile?.qr_token) return
    const branchLabel = myProfile.branch?.name || (typeof myProfile.branch === 'string' ? myProfile.branch : '')
    printSingleBadge({
      svgElementId: 'my-employee-qr',
      name: `${myProfile.first_name || ''} ${myProfile.last_name || ''}`.trim(),
      position: myProfile.position,
      department: myProfile.department,
      branch: branchLabel,
      code: myProfile.employee_code,
      statusLabel: 'Permanent Active QR',
    })
  }

  const filtered = useMemo(() => {
    let result = filterBySearch(records, deferredSearch, ['employee_name', 'employee_code', 'department'])
    if (branchFilter && branchFilter !== 'All') {
      result = result.filter(r => {
        const b = r.branch?.name || (typeof r.branch === 'string' ? r.branch : '')
        return b.toLowerCase() === branchFilter.toLowerCase()
      })
    }
    if (dateFrom) {
      result = result.filter(r => String(r.attendance_date || '').slice(0, 10) >= dateFrom)
    }
    if (dateTo) {
      result = result.filter(r => String(r.attendance_date || '').slice(0, 10) <= dateTo)
    }
    return result
  }, [records, deferredSearch, branchFilter, dateFrom, dateTo])

  const total = filtered.length
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize)

  const [exporting, setExporting] = useState(false)
  const handleExportCSV = async () => {
    setExporting(true)
    try {
      await downloadCsv('/attendance', {
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        department: deptFilter !== 'All' ? deptFilter : undefined,
        status: statusFilter !== 'All' ? statusFilter : undefined,
        branch: branchFilter !== 'All' ? branchFilter : undefined,
      })
      showToast('Attendance exported successfully', 'success')
    } catch (err) {
      showToast(err.message || 'Export failed', 'error')
    } finally {
      setExporting(false)
    }
  }

  const timesheetSummary = useMemo(() => {
    let sourceRecords = records
    if (branchFilter && branchFilter !== 'All') {
      sourceRecords = sourceRecords.filter(r => {
        const b = r.branch?.name || (typeof r.branch === 'string' ? r.branch : '')
        return b.toLowerCase() === branchFilter.toLowerCase()
      })
    }
    if (dateFrom) {
      sourceRecords = sourceRecords.filter(r => String(r.attendance_date || '').slice(0, 10) >= dateFrom)
    }
    if (dateTo) {
      sourceRecords = sourceRecords.filter(r => String(r.attendance_date || '').slice(0, 10) <= dateTo)
    }
    return Object.values(sourceRecords.reduce((acc, a) => {
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
  }, [records, branchFilter, dateFrom, dateTo])

  const filteredPeriodStaff = useMemo(() => {
    const list = periodMetrics?.staff || []
    const q = deferredPeriodSearch.trim().toLowerCase()
    if (!q) return list
    return list.filter(s =>
      String(s.employee_name || '').toLowerCase().includes(q) ||
      String(s.employee_code || '').toLowerCase().includes(q) ||
      String(s.role || '').toLowerCase().includes(q) ||
      String(s.branch || '').toLowerCase().includes(q)
    )
  }, [periodMetrics, deferredPeriodSearch])

  // Determine Tab Options
  const tabList = isEmployee
    ? [
      { id: 'my-qr', label: 'My Permanent QR Badge', icon: <FiSmartphone className="w-3.5 h-3.5" /> },
      { id: 'log', label: 'My Attendance Logs', icon: <FiClock className="w-3.5 h-3.5" /> },
      { id: 'timesheet', label: 'My Timesheet Summary', icon: <FiBarChart2 className="w-3.5 h-3.5" /> },
    ]
    : isStoreAdmin
      ? [
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
              ? "Branch Attendance Logs"
              : "Attendance Logs & Verification Records"
        }
        subtitle={
          isEmployee
            ? "View your permanent QR attendance badge, punch records, and monthly timesheet summary"
            : isStoreAdmin
              ? `Branch Attendance Records & Verification Logs • Authorized Branch: ${userBranch}`
              : "Monitor organization-wide attendance records, QR + PIN verification methods, and work hours"
        }
        action={
          <div className="flex gap-2 flex-wrap">
            <SyncButton sync={syncAttendance} isSyncing={isSyncingAttendance} label="Sync" />
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
            {isEmployee && (
              <Btn
                variant="outline"
                size="sm"
                onClick={() => setFaceAuthModalOpen(true)}
                icon={<FiCamera className="w-4 h-4 text-emerald-500" />}
                className="border-emerald-500/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"
              >
                Face Recognition
              </Btn>
            )}
          </div>
        }
      />

      {/* Daily Summary Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard title="Present Today" value={summary?.present?.toString() || '0'} sub="verified punches" icon={<FiCheckCircle className="w-5 h-5 text-emerald-500" />} color="green" />
        <StatCard title="Late Arrivals" value={summary?.late?.toString() || '0'} sub="after 8:00 AM cutoff" icon={<FiClock className="w-5 h-5 text-amber-500" />} color="yellow" />
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

      {/* TAB: EMPLOYEE PERSONAL ATTENDANCE QR */}
      {isEmployee && activeTab === 'my-qr' && (
        <div className="max-w-2xl mx-auto space-y-6">
          {myProfileLoading ? (
            <LoadingState message="Loading your permanent attendance QR..." />
          ) : (myProfile?.qr_status === 'ACTIVE' && myProfile?.qr_token && myProfile?.qr_active) ? (
            <div className="flex flex-col items-center space-y-6">
              <div className="w-full text-center space-y-1.5 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
                <div className="inline-flex items-center gap-1 text-xs font-mono font-bold px-3 py-0.5 rounded-full bg-emerald-500/20 text-emerald-500 border border-emerald-500/30">
                  <FiCheckCircle className="w-3.5 h-3.5" /> QR Status: ACTIVE
                </div>
                <h3 className="text-base font-bold text-emerald-600 dark:text-emerald-400">Attendance QR Code Ready</h3>
                <p className="text-xs text-muted-foreground">
                  Your account has been verified and your permanent QR code has been issued by the Administrator.
                </p>
              </div>

              <div className="w-80 bg-gradient-to-b from-slate-900 via-slate-800 to-slate-950 text-white rounded-3xl shadow-2xl border border-slate-700 overflow-hidden flex flex-col items-center p-6 text-center relative">
                <div className="w-12 h-1 bg-amber-400 rounded-full mb-3" />
                <span className="text-[10px] uppercase tracking-widest text-amber-300 font-bold">PERMANENT ATTENDANCE BADGE</span>
                <h4 className="text-xs text-slate-400 font-medium mt-0.5">Official Company ID</h4>

                <div className="w-20 h-20 rounded-2xl bg-slate-800 border-2 border-primary/40 flex items-center justify-center text-primary font-bold text-2xl my-3 shadow-inner overflow-hidden">
                  {myProfile.profile_image ? (
                    <img src={myProfile.profile_image} alt={`${myProfile.first_name} ${myProfile.last_name}`} className="w-full h-full object-cover" />
                  ) : (
                    <span>{myProfile.first_name?.[0]}{myProfile.last_name?.[0]}</span>
                  )}
                </div>

                <h3 className="font-bold text-lg text-white leading-tight">
                  {myProfile.first_name} {myProfile.last_name}
                </h3>
                <p className="text-xs text-primary font-semibold mt-0.5">{myProfile.position}</p>
                <p className="text-[11px] text-slate-400">{myProfile.department}{myProfile.branch?.name || (typeof myProfile.branch === 'string' ? myProfile.branch : '') ? ` · ${myProfile.branch?.name || (typeof myProfile.branch === 'string' ? myProfile.branch : '')}` : ''}</p>

                <div className="mt-2 font-mono text-xs font-bold text-slate-200 bg-slate-800/80 px-3 py-1 rounded-full border border-slate-700">
                  {myProfile.employee_code}
                </div>

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

              <div className="w-full max-w-sm space-y-3">
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={handleDownloadMyQr}
                    className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs rounded-xl shadow-xs cursor-pointer transition"
                  >
                    <FiDownload className="w-4 h-4" />
                    <span>Download QR Badge</span>
                  </button>
                  <button
                    type="button"
                    onClick={handlePrintMyBadge}
                    className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border border-border bg-card hover:bg-muted font-semibold text-xs text-foreground cursor-pointer transition"
                  >
                    <FiPrinter className="w-4 h-4" />
                    <span>Print Badge</span>
                  </button>
                </div>
                <button
                  onClick={() => setFaceAuthModalOpen(true)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 font-bold text-xs text-emerald-600 dark:text-emerald-400 cursor-pointer transition"
                >
                  <FiCamera className="w-4 h-4" />
                  <span>Face Recognition</span>
                </button>
              </div>
            </div>
          ) : myProfile?.qr_status === 'REQUESTED' ? (
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
                  Your QR code request has been submitted to the Administrator. Your account is currently waiting for verification.
                </p>
              </div>
              <div className="pt-2">
                <Btn variant="outline" size="sm" disabled className="opacity-70 cursor-not-allowed mx-auto" icon={<FiCheckCircle />}>
                  Request Submitted
                </Btn>
              </div>
            </Card>
          ) : myProfile?.qr_status === 'UNDER_REVIEW' ? (
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
                  An Administrator is currently verifying your account information.
                </p>
              </div>
            </Card>
          ) : myProfile?.qr_status === 'REJECTED' ? (
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
          size="lg"
          footer={
            <div className="flex justify-end gap-3 w-full">
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

            <div className="p-4 rounded-2xl bg-card border border-border space-y-3 text-xs">
              <span className="text-[10px] uppercase font-bold text-muted-foreground block border-b border-border pb-1.5">
                {isStoreAdmin ? 'Store Administrator Information' : 'Employee Information'}
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5">
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
                  <span className="font-semibold text-foreground">{myProfile.branch?.name || (typeof myProfile.branch === 'string' ? myProfile.branch : userBranch)}</span>
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
          <Card noPad className="border border-border overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border bg-muted/40 flex items-center gap-2">
              <FiClock className="w-4 h-4 text-primary" />
              <span className="text-xs font-bold uppercase tracking-wider text-foreground">Official Work Schedule</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-border text-center">
              {[
                { key: 'time_in', label: 'Time In', color: 'text-emerald-600' },
                { key: 'lunch_out', label: 'Lunch Out', color: 'text-amber-600' },
                { key: 'lunch_in', label: 'Lunch In', color: 'text-amber-600' },
                { key: 'time_out', label: 'Time Out', color: 'text-indigo-600' },
              ].map(s => (
                <div key={s.key} className="py-3 px-2">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{s.label}</div>
                  <div className={`font-mono font-bold text-sm mt-0.5 ${s.color}`}>{schedule.labels?.[s.key]}</div>
                </div>
              ))}
            </div>
          </Card>

          <Card noPad className="p-3.5 border border-border">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-row gap-3 items-end">
              <div className="sm:col-span-2 lg:flex-1 min-w-0 flex flex-col">
                <label className="text-[11px] font-bold text-muted-foreground uppercase leading-none mb-1.5 block">Employee Search</label>
                <div className="relative">
                  <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  <input
                    type="text"
                    value={search}
                    onChange={e => { setSearch(e.target.value); setPage(1); }}
                    placeholder="Search employee name, code, department..."
                    className="w-full h-9 pl-9 pr-8 rounded-xl border border-border bg-card text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-muted-foreground/70"
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
              </div>

              <div className="w-full lg:w-[150px] shrink-0 flex flex-col">
                <label className="text-[11px] font-bold text-muted-foreground uppercase leading-none mb-1.5 block">From Days</label>
                <input
                  type="date"
                  value={dateFrom}
                  max={dateTo || undefined}
                  onChange={e => { setDateFrom(e.target.value); setPage(1) }}
                  className="w-full h-9 border border-border rounded-xl px-3 text-xs font-semibold text-foreground bg-card cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div className="w-full lg:w-[150px] shrink-0 flex flex-col">
                <label className="text-[11px] font-bold text-muted-foreground uppercase leading-none mb-1.5 block">To Days</label>
                <input
                  type="date"
                  value={dateTo}
                  min={dateFrom || undefined}
                  onChange={e => { setDateTo(e.target.value); setPage(1) }}
                  className="w-full h-9 border border-border rounded-xl px-3 text-xs font-semibold text-foreground bg-card cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div className="w-full lg:w-[165px] shrink-0 flex flex-col">
                <label className="text-[11px] font-bold text-muted-foreground uppercase leading-none mb-1.5 block">Branch</label>
                <select
                  value={branchFilter}
                  disabled={isStoreAdmin || !!propBranchFilter}
                  onChange={e => { setLocalBranchFilter(e.target.value); setPage(1) }}
                  className="w-full h-9 border border-border rounded-xl px-3 text-xs font-semibold text-foreground bg-card cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="All">All Branches</option>
                  {branchOptions.map(bName => (
                    <option key={bName} value={bName}>
                      {bName}
                    </option>
                  ))}
                </select>
              </div>

              <div className="w-full lg:w-[150px] shrink-0 flex flex-col">
                <label className="text-[11px] font-bold text-muted-foreground uppercase leading-none mb-1.5 block">Department</label>
                <select
                  value={deptFilter}
                  onChange={e => { setDeptFilter(e.target.value); setPage(1) }}
                  className="w-full h-9 border border-border rounded-xl px-3 text-xs font-semibold text-foreground bg-card cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  {DEPARTMENTS.map(d => <option key={d} value={d}>{d === 'All' ? 'All Departments' : d}</option>)}
                </select>
              </div>

              <div className="w-full lg:w-[130px] shrink-0 flex flex-col">
                <label className="text-[11px] font-bold text-muted-foreground uppercase leading-none mb-1.5 block">Status</label>
                <select
                  value={statusFilter}
                  onChange={e => { setStatusFilter(e.target.value); setPage(1) }}
                  className="w-full h-9 border border-border rounded-xl px-3 text-xs font-semibold text-foreground bg-card cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  {STATUSES.map(s => <option key={s} value={s}>{s === 'All' ? 'All Statuses' : s}</option>)}
                </select>
              </div>
            </div>
            <div className="mt-2.5 pt-2.5 border-t border-border/60 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
              <div className="flex flex-wrap items-center gap-2">
                <span>
                  {dateFrom || dateTo
                    ? `Showing records ${dateFrom ? `from ${dateFrom}` : ''}${dateFrom && dateTo ? ' ' : ''}${dateTo ? `to ${dateTo}` : ''}`
                    : 'Filter by date or load the Oct 12 – Nov 20 evaluation period'}
                </span>
                {(dateFrom !== DEFAULT_PERIOD_START || dateTo !== DEFAULT_PERIOD_END) && (
                  <button
                    type="button"
                    onClick={() => {
                      setDateFrom(DEFAULT_PERIOD_START)
                      setDateTo(DEFAULT_PERIOD_END)
                      setPage(1)
                    }}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 text-primary font-semibold hover:bg-primary/20 cursor-pointer transition-colors"
                  >
                    <FiCalendar className="w-3 h-3" />
                    <span>Oct 12 – Nov 20 Period</span>
                  </button>
                )}
              </div>
              {(dateFrom || dateTo || search || deptFilter !== 'All' || statusFilter !== 'All' || (!isStoreAdmin && !propBranchFilter && branchFilter !== 'All')) && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('')
                    setDateFrom('')
                    setDateTo('')
                    if (!isStoreAdmin && !propBranchFilter) setLocalBranchFilter('All')
                    setDeptFilter('All')
                    setStatusFilter('All')
                    setPage(1)
                  }}
                  className="inline-flex items-center gap-1 font-semibold text-primary hover:underline cursor-pointer"
                >
                  <FiX className="w-3 h-3" />
                  <span>Reset Filters</span>
                </button>
              )}
            </div>
          </Card>

          <Card noPad className="border border-border overflow-hidden">
            {loading ? (
              <TableSkeleton rows={6} cols={11} />
            ) : paginated.length === 0 ? (
              <EmptyState
                icon={<FiClock className="w-12 h-12 text-muted-foreground/30 mx-auto" />}
                title="No attendance records found"
                description={search || dateFrom || dateTo || deptFilter !== 'All' || branchFilter !== 'All' ? 'Try adjusting your date or filter options' : 'Punches made via the QR terminal will appear here'}
                action={isStoreAdmin ? <Btn size="sm" onClick={() => setActiveTab('punch')}>Open QR Terminal Scanner</Btn> : null}
              />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs min-w-[1200px]">
                    <thead>
                      <tr className="border-b border-border bg-muted/50 text-muted-foreground uppercase font-semibold text-[11px] whitespace-nowrap">
                        <th className="py-3 px-3 text-left">Date</th>
                        <th className="py-3 px-3 text-left">Code</th>
                        <th className="py-3 px-3 text-left">Employee Name</th>
                        <th className="py-3 px-3 text-left">Branch</th>
                        <th className="py-3 px-3 text-left">Department</th>
                        <th className="py-3 px-3 text-left">Time In</th>
                        <th className="py-3 px-3 text-left">Lunch Out</th>
                        <th className="py-3 px-3 text-left">Lunch In</th>
                        <th className="py-3 px-3 text-left">Time Out</th>
                        <th className="py-3 px-3 text-right">Regular</th>
                        <th className="py-3 px-3 text-right">OT</th>
                        <th className="py-3 px-3 text-center">Verification</th>
                        <th className="py-3 px-3 text-left">Verified By</th>
                        <th className="py-3 px-3 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {paginated.map((a, i) => (
                        <tr key={a.attendance_id || i} className={`hover:bg-muted/40 transition-colors ${i % 2 === 1 ? 'bg-muted/10' : ''}`}>
                          <td className="py-3 px-3 font-mono text-muted-foreground whitespace-nowrap">{a.attendance_date}</td>
                          <td className="py-3 px-3 font-mono font-bold text-foreground whitespace-nowrap">{a.employee_code}</td>
                          <td className="py-3 px-3 font-semibold text-foreground whitespace-nowrap">{a.employee_name}</td>
                          <td className="py-3 px-3 font-medium text-foreground whitespace-nowrap">{a.branch?.name || (typeof a.branch === 'string' && a.branch ? a.branch : '—')}</td>
                          <td className="py-3 px-3 whitespace-nowrap"><Badge text={a.department || 'General'} variant="neutral" /></td>
                          <td className="py-3 px-3 whitespace-nowrap">
                            <div className={`font-mono ${a.late_minutes > 0 ? 'text-rose-600 font-bold' : ''}`}>{a.time_in || '—'}</div>
                            {a.late_minutes > 0 && <div className="text-[10px] text-rose-500 font-bold uppercase tracking-wider mt-0.5">Late {a.late_minutes} min</div>}
                          </td>
                          <td className="py-3 px-3 font-mono whitespace-nowrap">{a.lunch_out || '—'}</td>
                          <td className="py-3 px-3 font-mono whitespace-nowrap">{a.lunch_in || (a.lunch_out ? <span className="text-amber-600 text-[10px] font-bold uppercase">On Lunch</span> : '—')}</td>
                          <td className="py-3 px-3 whitespace-nowrap">
                            <div className="font-mono">{a.time_out || (a.time_in ? <span className="text-emerald-600 text-[10px] font-bold uppercase">On Duty</span> : '—')}</div>
                            {a.undertime_minutes > 0 && <div className="text-[10px] text-amber-600 font-bold uppercase tracking-wider mt-0.5">Undertime {a.undertime_minutes} min</div>}
                          </td>
                          <td className="py-3 px-3 text-right font-mono font-bold whitespace-nowrap">{a.time_out ? `${Number(a.regular_hours || 0).toFixed(2)}h` : '—'}</td>
                          <td className="py-3 px-3 text-right font-mono font-bold text-amber-600 whitespace-nowrap">{Number(a.overtime_hours) > 0 ? `${Number(a.overtime_hours).toFixed(2)}h` : '—'}</td>
                          <td className="py-3 px-3 text-center whitespace-nowrap">
                            <span className="inline-flex items-center justify-center whitespace-nowrap text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-700">
                              {String(a.verification_method || 'QR + PIN').replace(/\s*\(Authorized by Employee\)/gi, '').trim()}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-muted-foreground text-[11px] whitespace-nowrap">{a.verified_by || 'Store Admin'}</td>
                          <td className="py-3 px-3 text-center whitespace-nowrap">
                            <div className="flex flex-col items-center gap-1">
                              <StatusBadge status={a.status} />
                              {a.status === 'Absent' && (a.reason_code || a.absence_status) && (
                                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ${a.absence_status === 'Excused'
                                  ? 'bg-sky-50 text-sky-700 border border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800'
                                  : 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800'
                                  }`}>
                                  {a.reason_code ? `[${a.reason_code}] ` : ''}{a.absence_status || 'Unexcused'}
                                </span>
                              )}
                              {a.status === 'Half Day' && a.shift_type && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800">
                                  {a.shift_type} Shift ({Number(a.regular_hours || 4).toFixed(1)}h)
                                </span>
                              )}
                            </div>
                          </td>
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

      {/* TAB: TIMESHEET & PERIOD ATTENDANCE METRICS (OCT 12 - NOV 20) */}
      {activeTab === 'timesheet' && (
        <div className="space-y-4">
          {/* Period Filter & Simulator Controls */}
          <Card noPad className="p-4 border border-border">
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-wrap items-end gap-3 flex-1">
                <div className="min-w-[180px] flex-1">
                  <label className="text-[11px] font-bold text-muted-foreground uppercase leading-none mb-1.5 block">Staff Search</label>
                  <div className="relative">
                    <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                    <input
                      type="text"
                      value={periodSearch}
                      onChange={e => setPeriodSearch(e.target.value)}
                      placeholder="Search Store Admin or Employee..."
                      className="w-full h-9 pl-8 pr-7 rounded-xl border border-border bg-card text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                    {periodSearch && (
                      <button
                        type="button"
                        onClick={() => setPeriodSearch('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                      >
                        <FiX className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="w-full sm:w-[145px]">
                  <label className="text-[11px] font-bold text-muted-foreground uppercase leading-none mb-1.5 block">Period From</label>
                  <input
                    type="date"
                    value={periodStart}
                    max={periodEnd || undefined}
                    onChange={e => setPeriodStart(e.target.value)}
                    className="w-full h-9 border border-border rounded-xl px-3 text-xs font-semibold text-foreground bg-card cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>

                <div className="w-full sm:w-[145px]">
                  <label className="text-[11px] font-bold text-muted-foreground uppercase leading-none mb-1.5 block">Period To</label>
                  <input
                    type="date"
                    value={periodEnd}
                    min={periodStart || undefined}
                    onChange={e => setPeriodEnd(e.target.value)}
                    className="w-full h-9 border border-border rounded-xl px-3 text-xs font-semibold text-foreground bg-card cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>

                <div className="w-full sm:w-[155px]">
                  <label className="text-[11px] font-bold text-muted-foreground uppercase leading-none mb-1.5 block">Staff Role</label>
                  <select
                    value={periodRoleFilter}
                    onChange={e => setPeriodRoleFilter(e.target.value)}
                    className="w-full h-9 border border-border rounded-xl px-3 text-xs font-semibold text-foreground bg-card cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="All">All Staff Roles</option>
                    <option value="Store Admin">Store Admin</option>
                    <option value="Employee">Employees (General Staff)</option>
                  </select>
                </div>

                {!isStoreAdmin && !propBranchFilter && !isEmployee && (
                  <div className="w-full sm:w-[165px]">
                    <label className="text-[11px] font-bold text-muted-foreground uppercase leading-none mb-1.5 block">Branch</label>
                    <select
                      value={branchFilter}
                      onChange={e => setLocalBranchFilter(e.target.value)}
                      className="w-full h-9 border border-border rounded-xl px-3 text-xs font-semibold text-foreground bg-card cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/20"
                    >
                      <option value="All">All Branches</option>
                      {branchOptions.map(bName => (
                        <option key={bName} value={bName}>{bName}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {(periodStart !== DEFAULT_PERIOD_START || periodEnd !== DEFAULT_PERIOD_END || periodRoleFilter !== 'All' || periodSearch) && (
                  <Btn
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setPeriodStart(DEFAULT_PERIOD_START)
                      setPeriodEnd(DEFAULT_PERIOD_END)
                      setPeriodRoleFilter('All')
                      setPeriodSearch('')
                    }}
                  >
                    <FiCalendar className="w-3.5 h-3.5 mr-1" />
                    Oct 12 – Nov 20
                  </Btn>
                )}
              </div>
            </div>

            {periodMetrics?.period && (
              <div className="mt-3 pt-2.5 border-t border-border/60 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
                <span className="font-medium">
                  Evaluation Period: <strong className="text-foreground">{periodMetrics.period.label}</strong> ({periodMetrics.period.scheduled_days} Scheduled Days · {periodMetrics.period.scheduled_shift})
                </span>
                <span>
                  Coverage: <strong className="text-foreground">{filteredPeriodStaff.length}</strong> Store Admin & General Staff
                </span>
              </div>
            )}
          </Card>

          {/* Period Totals Summary Cards */}
          {periodMetrics?.totals && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <Card className="p-3.5 border border-border">
                <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Regular Days Worked</div>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-xl font-black font-mono text-emerald-600">{periodMetrics.totals.total_regular_full_days}</span>
                  <span className="text-xs text-muted-foreground font-semibold">/ {periodMetrics.totals.staff_count * periodMetrics.totals.scheduled_days_per_staff} scheduled</span>
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  {periodMetrics.totals.total_equivalent_days} Equivalent Days · {periodMetrics.totals.scheduled_days_per_staff} Scheduled Days/Staff
                </div>
              </Card>

              <Card className="p-3.5 border border-border">
                <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Total Absences</div>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-xl font-black font-mono text-rose-600">{periodMetrics.totals.total_absences}</span>
                  <span className="text-xs text-muted-foreground font-semibold">
                    total days{periodMetrics.totals.staff_count ? ` (${(periodMetrics.totals.total_absences / periodMetrics.totals.staff_count).toFixed(0)} per staff)` : ''}
                  </span>
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  <span className="text-sky-600 font-semibold">{periodMetrics.totals.total_excused_absences} Excused</span> ·{' '}
                  <span className="text-rose-600 font-semibold">{periodMetrics.totals.total_unexcused_absences} Unexcused</span>
                </div>
              </Card>

              <Card className="p-3.5 border border-border">
                <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Lates / Tardiness</div>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-xl font-black font-mono text-amber-600">{periodMetrics.totals.total_late_frequency}</span>
                  <span className="text-xs text-muted-foreground font-semibold">late incidents</span>
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  {periodMetrics.totals.total_late_minutes} Total Minutes Late (Scheduled In: 08:00 AM)
                </div>
              </Card>

              <Card className="p-3.5 border border-border">
                <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Undertime (Early Logouts)</div>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-xl font-black font-mono text-orange-600">{periodMetrics.totals.total_undertime_frequency}</span>
                  <span className="text-xs text-muted-foreground font-semibold">early logouts</span>
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  {periodMetrics.totals.total_undertime_minutes} Total Lost Minutes (Before 05:00 PM)
                </div>
              </Card>

              <Card className="p-3.5 border border-border">
                <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Half-Day Shifts (AM / PM)</div>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-xl font-black font-mono text-indigo-600">{periodMetrics.totals.total_half_days}</span>
                  <span className="text-xs text-muted-foreground font-semibold">half-day shifts</span>
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  {(periodMetrics.totals.total_half_days * 4).toFixed(1)} Total Hours Rendered (4.0 hrs/shift)
                </div>
              </Card>
            </div>
          )}

          {/* Individual Staff Metrics Matrix */}
          <Card noPad className="border border-border overflow-hidden">
            <div className="px-4 py-3 border-b border-border bg-muted/30 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-foreground">
                  Individual Staff Attendance Breakdown ({periodMetrics?.period?.label || `${periodStart} to ${periodEnd}`})
                </h3>
                <p className="text-[11px] text-muted-foreground">
                  Per-staff summary of Absences (Dates, Reason Code &amp; Excused vs. Unexcused), Lates, Undertime, Half-Day Shifts (AM/PM) &amp; Regular Days Worked vs. Scheduled Days.
                </p>
              </div>
              <span className="text-[11px] text-muted-foreground">Click any staff row or <strong>Details</strong> to inspect full date logs</span>
            </div>

            {periodLoading ? (
              <TableSkeleton rows={6} cols={8} />
            ) : filteredPeriodStaff.length === 0 ? (
              <EmptyState
                icon={<FiBarChart2 className="w-12 h-12 text-muted-foreground/30 mx-auto" />}
                title="No period attendance data"
                description="No attendance metrics were found for the selected date range and filters."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[1220px]">
                  <thead>
                    <tr className="border-b border-border bg-muted/50 text-muted-foreground uppercase font-semibold text-[11px]">
                      <th className="py-3 px-3 text-left">Staff Member</th>
                      <th className="py-3 px-3 text-left">Role &amp; Branch</th>
                      <th className="py-3 px-3 text-left">Regular Days vs. Scheduled</th>
                      <th className="py-3 px-3 text-left">Absences (Excused vs. Unexcused)</th>
                      <th className="py-3 px-3 text-left">Lates / Tardiness (vs. 08:00 AM)</th>
                      <th className="py-3 px-3 text-left">Undertime (Early Logouts)</th>
                      <th className="py-3 px-3 text-left">Half-Day Shifts (AM / PM)</th>
                      <th className="py-3 px-3 text-right">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredPeriodStaff.map((s, i) => (
                      <tr
                        key={s.employee_id || i}
                        onClick={() => setSelectedStaffMetrics(s)}
                        className={`hover:bg-muted/40 transition-colors cursor-pointer ${i % 2 === 1 ? 'bg-muted/10' : ''}`}
                      >
                        <td className="py-3 px-3 align-top whitespace-nowrap">
                          <div className="font-mono text-[11px] font-bold text-muted-foreground">{s.employee_code}</div>
                          <div className="font-bold text-foreground text-xs">{s.employee_name}</div>
                          <div className="text-[10px] text-muted-foreground">{s.position || s.department}</div>
                        </td>
                        <td className="py-3 px-3 align-top whitespace-nowrap">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${s.role === 'Store Admin'
                            ? 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800'
                            : 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
                            }`}>
                            {s.role}
                          </span>
                          <div className="text-[11px] text-muted-foreground mt-1">{s.branch || '—'}</div>
                        </td>
                        <td className="py-3 px-3 align-top whitespace-nowrap">
                          <div className="font-mono font-bold text-emerald-600 text-xs">
                            {s.regular_days_worked} / {s.scheduled_days} <span className="font-normal text-muted-foreground">Regular Days</span>
                          </div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">
                            {s.equivalent_days_worked} Equivalent Days ({s.attendance_rate}%) · {s.on_time_days} On-Time
                          </div>
                          <div className="text-[10px] font-mono text-muted-foreground">
                            {Number(s.total_hours_rendered || 0).toFixed(1)} hrs Total Rendered
                          </div>
                        </td>
                        <td className="py-3 px-3 align-top whitespace-nowrap">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800 font-bold text-[10px]">
                              {s.absences?.total || 0} Total Absences
                            </span>
                          </div>
                          <div className="text-[11px] flex items-center gap-2">
                            <span className="text-sky-600 font-semibold">{s.absences?.excused || 0} Excused</span>
                            <span className="text-muted-foreground">·</span>
                            <span className="text-rose-600 font-semibold">{s.absences?.unexcused || 0} Unexcused</span>
                          </div>
                        </td>
                        <td className="py-3 px-3 align-top whitespace-nowrap">
                          <div className="font-mono font-bold text-amber-600">
                            {s.lates?.frequency || 0} Late{(s.lates?.frequency || 0) === 1 ? '' : 's'}
                          </div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">
                            {s.lates?.total_minutes || 0} Total Mins Late
                          </div>
                        </td>
                        <td className="py-3 px-3 align-top whitespace-nowrap">
                          <div className="font-mono font-bold text-orange-600">
                            {s.undertime?.frequency || 0} Early Out{(s.undertime?.frequency || 0) === 1 ? '' : 's'}
                          </div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">
                            {s.undertime?.total_lost_minutes || 0} Lost Mins
                          </div>
                        </td>
                        <td className="py-3 px-3 align-top whitespace-nowrap">
                          <div className="font-mono font-bold text-indigo-600">
                            {s.half_days?.count || 0} Shift{(s.half_days?.count || 0) === 1 ? '' : 's'} · {Number(s.half_days?.total_hours || 0).toFixed(1)} hrs
                          </div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">
                            {s.half_days?.am_count || 0} AM · {s.half_days?.pm_count || 0} PM
                          </div>
                        </td>
                        <td className="py-3 px-3 align-top text-right whitespace-nowrap">
                          <Btn
                            size="sm"
                            variant="outline"
                            onClick={e => {
                              e.stopPropagation()
                              setSelectedStaffMetrics(s)
                            }}
                          >
                            <FiEye className="w-3.5 h-3.5 mr-1" />
                            Details
                          </Btn>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Secondary Quick Timesheet Reference (from loaded Daily Logs) */}
          {timesheetSummary.length > 0 && (
            <Card noPad className="border border-border overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border bg-muted/30 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Timesheet Totals Snapshot (Filtered Daily Logs)
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[700px]">
                  <thead>
                    <tr className="border-b border-border bg-muted/50 text-muted-foreground uppercase font-semibold text-[11px]">
                      <th className="py-2.5 px-4 text-left">Code</th>
                      <th className="py-2.5 px-4 text-left">Employee Name</th>
                      <th className="py-2.5 px-4 text-left">Department</th>
                      <th className="py-2.5 px-4 text-right">Days Present</th>
                      <th className="py-2.5 px-4 text-right">Late Incidents</th>
                      <th className="py-2.5 px-4 text-right">Total Shift Hrs</th>
                      <th className="py-2.5 px-4 text-right">Total Overtime</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {timesheetSummary.map((ts, i) => (
                      <tr key={ts.employee_id || i} className={`hover:bg-muted/40 transition-colors ${i % 2 === 1 ? 'bg-muted/10' : ''}`}>
                        <td className="py-2.5 px-4 font-mono font-bold text-foreground">{ts.code}</td>
                        <td className="py-2.5 px-4 font-semibold text-foreground">{ts.name}</td>
                        <td className="py-2.5 px-4"><Badge text={ts.department || 'General'} variant="neutral" /></td>
                        <td className="py-2.5 px-4 text-right font-mono text-emerald-600 font-bold">{ts.present_count}</td>
                        <td className="py-2.5 px-4 text-right font-mono font-bold text-rose-600">{ts.late_count}</td>
                        <td className="py-2.5 px-4 text-right font-mono font-bold">{ts.total_hours.toFixed(1)}h</td>
                        <td className="py-2.5 px-4 text-right font-mono font-bold text-amber-600">{ts.total_overtime.toFixed(1)}h</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* TAB: SECURITY & SCAN AUDIT LOGS */}
      {activeTab === 'audit' && (
        <div className="space-y-4">
          <Card noPad className="p-3.5 border border-border">
            <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
              <div className="flex gap-2 flex-wrap sm:flex-nowrap">
                <select
                  value={branchFilter}
                  disabled={isStoreAdmin || !!propBranchFilter}
                  onChange={e => { setLocalBranchFilter(e.target.value); setScanLogsPage(1) }}
                  className="border border-border rounded-xl px-3 py-2 text-xs font-semibold text-foreground bg-card cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <option value="All">All Branches</option>
                  {branchOptions.map(bName => (
                    <option key={bName} value={bName}>
                      {bName}
                    </option>
                  ))}
                </select>

                <select
                  value={scanLogsStatusFilter}
                  onChange={e => { setScanLogsStatusFilter(e.target.value); setScanLogsPage(1) }}
                  className="border border-border rounded-xl px-3 py-2 text-xs font-semibold text-foreground bg-card cursor-pointer"
                >
                  <option value="All">All Results</option>
                  <option value="SUCCESS">Success Only</option>
                  <option value="FAILED">Failed / Rejected Only</option>
                </select>

                <select
                  value={scanLogsActionFilter}
                  onChange={e => { setScanLogsActionFilter(e.target.value); setScanLogsPage(1) }}
                  className="border border-border rounded-xl px-3 py-2 text-xs font-semibold text-foreground bg-card cursor-pointer"
                >
                  <option value="All">All Event Types</option>
                  <option value="ATTENDANCE_TIME_IN">ATTENDANCE TIME IN</option>
                  <option value="ATTENDANCE_TIME_OUT">ATTENDANCE TIME OUT</option>
                  <option value="FACE_RECOGNITION">FACE RECOGNITION</option>
                  <option value="FACE_VERIFICATION_FAILED">FACE FAILED</option>
                  <option value="PENDING_VERIFICATION">PENDING VERIFICATION</option>
                  <option value="PIN_VERIFICATION_FAILED">PIN FAILED</option>
                  <option value="UNAUTHORIZED_BRANCH_SCAN">CROSS BRANCH</option>
                  <option value="REVOKED_QR_SCAN">REVOKED QR</option>
                  <option value="INVALID_QR">INVALID QR</option>
                  <option value="REJECTED">REJECTED ACCOUNT</option>
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
                description="Live scans from the QR terminal and Face/PIN verification attempts will be audited here."
              />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs min-w-[750px]">
                    <thead>
                      <tr className="border-b border-border bg-muted/50 text-muted-foreground uppercase font-semibold text-[11px]">
                        <th className="py-3 px-4 text-left">Employee</th>
                        <th className="py-3 px-4 text-left">Branch</th>
                        <th className="py-3 px-4 text-left">Action / Event</th>
                        <th className="py-3 px-4 text-center">QR Result</th>
                        <th className="py-3 px-4 text-center">Face / PIN Auth</th>
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
                          <td className="py-3 px-4 font-medium text-foreground">{l.branch?.name || (typeof l.branch === 'string' ? l.branch : '') || '—'}</td>
                          <td className="py-3 px-4 font-mono font-bold text-primary">{l.action_type}</td>
                          <td className="py-3 px-4 text-center">
                            {l.qr_verified ? (
                              <span className="text-emerald-500 font-bold">✓ Verified</span>
                            ) : (
                              <span className="text-rose-500 font-bold">✗ Failed</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {l.face_verified || String(l.verification_method || '').includes('Face Recognition') ? (
                              <span className="text-emerald-500 font-bold">✓ Face Recognition</span>
                            ) : l.action_type === 'FACE_VERIFICATION_FAILED' || (l.status === 'FAILED' && String(l.failure_reason || '').toLowerCase().includes('face')) ? (
                              <span className="text-rose-500 font-bold">✗ Face Failed</span>
                            ) : l.pin_verified ? (
                              <span className="text-emerald-500 font-bold">✓ PIN Verified</span>
                            ) : (l.action_type === 'PIN_VERIFICATION_FAILED' || (l.status === 'FAILED' && String(l.failure_reason || '').toLowerCase().includes('pin'))) ? (
                              <span className="text-rose-500 font-bold">✗ PIN Failed</span>
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

      {/* EMPLOYEE FACE RECOGNITION ENROLLMENT MODAL ("Add a face") */}
      {isEmployee && faceAuthModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200 overflow-y-auto">
          <div className="relative w-full max-w-3xl my-auto">
            <button
              type="button"
              onClick={() => setFaceAuthModalOpen(false)}
              className="absolute top-4 right-4 z-30 p-2 rounded-xl bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300/70 hover:text-white border border-emerald-500/20 transition-colors cursor-pointer"
              title="Close"
            >
              <FiX className="w-4 h-4" />
            </button>
            <FaceRecognitionEnrollment
              existingImage={myProfile?.face_biometric_image || user?.face_biometric_image}
              faceBiometricImage={myProfile?.face_biometric_image || user?.face_biometric_image}
              employee={myProfile || user?.employee || user}
              onSuccess={async (payload) => {
                const biometricUrl = payload?.face_biometric_image || payload?.imageUrl
                if (biometricUrl) {
                  setMyProfile(prev => prev ? ({ ...prev, face_biometric_image: biometricUrl }) : prev)
                }
                if (typeof verifySession === 'function') {
                  await verifySession()
                }
                loadMyProfile(true)
              }}
            />
          </div>
        </div>
      )}

      {/* STAFF PERIOD METRICS DRILLDOWN MODAL */}
      {selectedStaffMetrics && (
        <Modal
          open={!!selectedStaffMetrics}
          onClose={() => setSelectedStaffMetrics(null)}
          title={`${selectedStaffMetrics.employee_code} — ${selectedStaffMetrics.employee_name} (${selectedStaffMetrics.role})`}
          size="xl"
        >
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
              <div className="p-2.5 rounded-xl border border-border bg-muted/20">
                <div className="text-[10px] font-bold uppercase text-muted-foreground">Regular vs. Scheduled</div>
                <div className="text-sm font-black font-mono text-emerald-600 mt-0.5">
                  {selectedStaffMetrics.regular_days_worked} / {selectedStaffMetrics.scheduled_days} Days
                </div>
                <div className="text-[10px] text-muted-foreground">{selectedStaffMetrics.equivalent_days_worked} Equivalent Days</div>
              </div>
              <div className="p-2.5 rounded-xl border border-border bg-muted/20">
                <div className="text-[10px] font-bold uppercase text-muted-foreground">Total Absences</div>
                <div className="text-sm font-black font-mono text-rose-600 mt-0.5">
                  {selectedStaffMetrics.absences?.total || 0} Days
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {selectedStaffMetrics.absences?.excused || 0} Excused · {selectedStaffMetrics.absences?.unexcused || 0} Unexcused
                </div>
              </div>
              <div className="p-2.5 rounded-xl border border-border bg-muted/20">
                <div className="text-[10px] font-bold uppercase text-muted-foreground">Lates / Tardiness</div>
                <div className="text-sm font-black font-mono text-amber-600 mt-0.5">
                  {selectedStaffMetrics.lates?.frequency || 0} Lates · {selectedStaffMetrics.lates?.total_minutes || 0} mins
                </div>
                <div className="text-[10px] text-muted-foreground">Scheduled In: 08:00 AM</div>
              </div>
              <div className="p-2.5 rounded-xl border border-border bg-muted/20">
                <div className="text-[10px] font-bold uppercase text-muted-foreground">Undertime</div>
                <div className="text-sm font-black font-mono text-orange-600 mt-0.5">
                  {selectedStaffMetrics.undertime?.frequency || 0} Early Outs · {selectedStaffMetrics.undertime?.total_lost_minutes || 0} mins
                </div>
                <div className="text-[10px] text-muted-foreground">Scheduled Out: 05:00 PM</div>
              </div>
              <div className="p-2.5 rounded-xl border border-border bg-muted/20">
                <div className="text-[10px] font-bold uppercase text-muted-foreground">Half-Day Shifts</div>
                <div className="text-sm font-black font-mono text-indigo-600 mt-0.5">
                  {selectedStaffMetrics.half_days?.count || 0} Shifts · {Number(selectedStaffMetrics.half_days?.total_hours || 0).toFixed(1)} hrs
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {selectedStaffMetrics.half_days?.am_count || 0} AM · {selectedStaffMetrics.half_days?.pm_count || 0} PM
                </div>
              </div>
            </div>

            {/* 4 Absences Table */}
            <div className="border border-border rounded-xl overflow-hidden">
              <div className="px-3 py-2 bg-rose-50/70 dark:bg-rose-950/20 border-b border-border font-bold text-rose-700 dark:text-rose-300">
                Absences ({selectedStaffMetrics.absences?.total || 0} Total — Dates, Reason Code &amp; Excused vs Unexcused)
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-[10px] uppercase text-muted-foreground">
                    <th className="py-2 px-3 text-left">Date</th>
                    <th className="py-2 px-3 text-left">Reason Code</th>
                    <th className="py-2 px-3 text-left">Status</th>
                    <th className="py-2 px-3 text-left">Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(selectedStaffMetrics.absences?.records || []).map((ab, idx) => (
                    <tr key={idx}>
                      <td className="py-2 px-3 font-mono font-bold whitespace-nowrap">{ab.date}</td>
                      <td className="py-2 px-3 font-mono font-bold whitespace-nowrap">{ab.reason_code} — {ab.reason_label}</td>
                      <td className="py-2 px-3 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${ab.status === 'Excused'
                          ? 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800'
                          : 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800'
                          }`}>{ab.status}</span>
                      </td>
                      <td className="py-2 px-3 text-muted-foreground">{ab.remarks || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Lates & Undertime Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="border border-border rounded-xl overflow-hidden">
                <div className="px-3 py-2 bg-amber-50/70 dark:bg-amber-950/20 border-b border-border font-bold text-amber-700 dark:text-amber-300">
                  Lates / Tardiness ({selectedStaffMetrics.lates?.frequency || 0} Late{(selectedStaffMetrics.lates?.frequency || 0) === 1 ? '' : 's'} · {selectedStaffMetrics.lates?.total_minutes || 0} mins)
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-[10px] uppercase text-muted-foreground">
                      <th className="py-2 px-3 text-left">Date</th>
                      <th className="py-2 px-3 text-left">Sched In</th>
                      <th className="py-2 px-3 text-left">Check-In</th>
                      <th className="py-2 px-3 text-right">Mins Late</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {(selectedStaffMetrics.lates?.records || []).length === 0 ? (
                      <tr><td colSpan={4} className="py-3 text-center text-muted-foreground">No lates logged</td></tr>
                    ) : (selectedStaffMetrics.lates?.records || []).map((lt, idx) => (
                      <tr key={idx}>
                        <td className="py-2 px-3 font-mono font-bold">{lt.date}</td>
                        <td className="py-2 px-3 font-mono text-muted-foreground">{lt.scheduled_in}</td>
                        <td className="py-2 px-3 font-mono font-bold text-rose-600">{lt.actual_in}</td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-amber-600">+{lt.minutes_late}m</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="border border-border rounded-xl overflow-hidden">
                <div className="px-3 py-2 bg-orange-50/70 dark:bg-orange-950/20 border-b border-border font-bold text-orange-700 dark:text-orange-300">
                  Undertime / Early Logouts ({selectedStaffMetrics.undertime?.frequency || 0} Early Out{(selectedStaffMetrics.undertime?.frequency || 0) === 1 ? '' : 's'} · {selectedStaffMetrics.undertime?.total_lost_minutes || 0} lost mins)
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-[10px] uppercase text-muted-foreground">
                      <th className="py-2 px-3 text-left">Date</th>
                      <th className="py-2 px-3 text-left">Sched Out</th>
                      <th className="py-2 px-3 text-left">Logout</th>
                      <th className="py-2 px-3 text-right">Lost Mins</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {(selectedStaffMetrics.undertime?.records || []).length === 0 ? (
                      <tr><td colSpan={4} className="py-3 text-center text-muted-foreground">No undertime logged</td></tr>
                    ) : (selectedStaffMetrics.undertime?.records || []).map((ut, idx) => (
                      <tr key={idx}>
                        <td className="py-2 px-3 font-mono font-bold">{ut.date}</td>
                        <td className="py-2 px-3 font-mono text-muted-foreground">{ut.scheduled_out}</td>
                        <td className="py-2 px-3 font-mono font-bold text-orange-600">{ut.actual_out}</td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-orange-600">-{ut.lost_minutes}m</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Half-Day Shifts Table */}
            <div className="border border-border rounded-xl overflow-hidden">
              <div className="px-3 py-2 bg-indigo-50/70 dark:bg-indigo-950/20 border-b border-border font-bold text-indigo-700 dark:text-indigo-300">
                Half-Day Shifts ({selectedStaffMetrics.half_days?.count || 0} Shifts · {Number(selectedStaffMetrics.half_days?.total_hours || 0).toFixed(1)}h Rendered)
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-[10px] uppercase text-muted-foreground">
                    <th className="py-2 px-3 text-left">Date</th>
                    <th className="py-2 px-3 text-left">Shift Type</th>
                    <th className="py-2 px-3 text-left">Time In</th>
                    <th className="py-2 px-3 text-left">Time Out</th>
                    <th className="py-2 px-3 text-right">Hours Rendered</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(selectedStaffMetrics.half_days?.records || []).length === 0 ? (
                    <tr><td colSpan={5} className="py-3 text-center text-muted-foreground">No half-day shifts logged</td></tr>
                  ) : (selectedStaffMetrics.half_days?.records || []).map((hd, idx) => (
                    <tr key={idx}>
                      <td className="py-2 px-3 font-mono font-bold">{hd.date}</td>
                      <td className="py-2 px-3">
                        <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800 font-bold text-[10px]">
                          {hd.shift_type} Half-Day
                        </span>
                      </td>
                      <td className="py-2 px-3 font-mono">{hd.time_in}</td>
                      <td className="py-2 px-3 font-mono">{hd.time_out}</td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-indigo-600">{Number(hd.hours_rendered || 4).toFixed(2)}h</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
