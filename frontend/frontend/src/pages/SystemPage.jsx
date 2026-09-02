import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  FiUsers, FiUser, FiShield, FiActivity, FiDatabase,
  FiDownload, FiUpload, FiTrash2, FiLock, FiCheckCircle,
  FiAlertTriangle, FiSearch, FiPlus, FiEdit, FiEye,
  FiX, FiSave, FiSettings, FiRotateCcw, FiBriefcase, FiKey
} from 'react-icons/fi'
import {
  Btn, Badge, StatusBadge, Input, Select, Textarea, Modal, ConfirmDialog,
  Table, TR, TD, SearchBar, PageHeader, StatCard, Card, CardHeader, Pagination,
  TabBar, showToast, LoadingState, ErrorAlert, TableSkeleton, EmptyState,
} from '../components/ui'
import { fmtDate, filterBySearch } from '../lib/utils'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'

const MODULES = ['All', 'Auth', 'Customers', 'Products', 'Sales', 'Installments', 'Payroll', 'Attendance', 'System', 'Users', 'Employees']
const ROLES = ['Administrator', 'Store Administrator', 'Employee']

export default function SystemPage({ defaultTab = 'users' }) {
  const [searchParams] = useSearchParams()
  const { user } = useAuth()
  const isAdmin = user?.role === 'Administrator'
  const [activeTab, setActiveTab] = useState(defaultTab)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Users State
  const [users, setUsers] = useState([])
  const [userModal, setUserModal] = useState(false)
  const [editUser, setEditUser] = useState(null)
  const [deleteUser, setDeleteUser] = useState(null)
  const [userForm, setUserForm] = useState({ username: '', password: '', role: 'Employee', is_active: true, employee_id: '' })
  const [userSearch, setUserSearch] = useState('')
  const [employeesList, setEmployeesList] = useState([])

  // User Details & Verification Modals State
  const [selectedUserDetail, setSelectedUserDetail] = useState(null)
  const [verifyConfirmUser, setVerifyConfirmUser] = useState(null)
  const [revokeConfirmUser, setRevokeConfirmUser] = useState(null)
  const [verificationDetailsUser, setVerificationDetailsUser] = useState(null)
  const [isVerifying, setIsVerifying] = useState(false)

  // Logs State
  const [logs, setLogs] = useState([])
  const [logModule, setLogModule] = useState('All')
  const [logSearch, setLogSearch] = useState('')

  // Backups State
  const [backups, setBackups] = useState([])
  const [backingUp, setBackingUp] = useState(false)
  const [restoringItem, setRestoringItem] = useState(null)

  // Settings State
  const [settings, setSettings] = useState({
    company_name: 'Z-LICZ Appliances and Furniture',
    address: 'Cagayan de Oro City',
    phone: '+63 88 856 1234',
    email: 'info@zlicz.com',
    currency: 'PHP',
    date_format: 'YYYY-MM-DD',
    timezone: 'Asia/Manila (GMT+8)',
    attendance_cutoff: '08:00',
  })
  const [savingSettings, setSavingSettings] = useState(false)

  const loadTabData = async (tab) => {
    setLoading(true)
    setError('')
    try {
      if (tab === 'users') {
        const [userData, empData] = await Promise.all([
          api.system.getUsers(),
          api.employees.getAll().catch(() => ({ employees: [] })),
        ])
        setUsers(userData.users || [])
        setEmployeesList(empData.employees || [])
      } else if (tab === 'logs') {
        const data = await api.system.getLogs({
          module: logModule !== 'All' ? logModule : undefined,
        })
        setLogs(data.logs || [])
      } else if (tab === 'backups') {
        const data = await api.system.getBackups()
        setBackups(data.backups || [])
      } else if (tab === 'settings') {
        const data = await api.system.getSettings()
        if (data) setSettings(data)
      }
    } catch (err) {
      console.error(`Failed to load ${tab} data:`, err)
      setError(err.message || `Failed to fetch ${tab}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadTabData(activeTab)
  }, [activeTab, logModule])

  useEffect(() => {
    const id = searchParams.get('id')
    const search = searchParams.get('search')
    if (activeTab === 'users' && id && users.length > 0) {
      const u = users.find(x => String(x.user_id) === String(id))
      if (u) {
        setSelectedUserDetail(u)
      }
    }
    if (activeTab === 'logs' && search) {
      setLogSearch(search)
    }
  }, [searchParams, users.length, activeTab])

  // User Actions
  const handleSaveUser = async (e) => {
    e.preventDefault()
    if (!userForm.username) {
      showToast('Username is required', 'error')
      return
    }
    if (!editUser && !userForm.password) {
      showToast('Password is required for new user', 'error')
      return
    }

    try {
      const payload = {
        ...userForm,
        employee_id: userForm.employee_id || null,
        auth_user_id: user?.user_id || 1,
      }
      if (editUser) {
        const res = await api.system.updateUser(editUser.user_id, payload)
        setUsers(prev => prev.map(u => u.user_id === editUser.user_id ? (res.user || { ...u, ...payload }) : u))
        showToast('User account updated successfully', 'success')
      } else {
        const res = await api.system.createUser(payload)
        if (res.user) {
          setUsers(prev => [res.user, ...prev])
        } else {
          loadTabData('users')
        }
        showToast('User account created successfully', 'success')
      }
      setUserModal(false)
      setEditUser(null)
      setUserForm({ username: '', password: '', role: 'Employee', is_active: true, employee_id: '' })
    } catch (err) {
      showToast(err.message || 'Failed to save user', 'error')
    }
  }

  const handleDeleteUser = async () => {
    if (!deleteUser) return
    try {
      await api.system.deleteUser(deleteUser.user_id)
      setUsers(prev => prev.filter(u => u.user_id !== deleteUser.user_id))
      showToast('User account deleted successfully', 'success')
      setDeleteUser(null)
    } catch (err) {
      showToast(err.message || 'Failed to delete user', 'error')
    }
  }

  const openEditUser = (u) => {
    setEditUser(u)
    setUserForm({
      username: u.username,
      password: '',
      role: u.role,
      is_active: u.is_active,
      employee_id: u.employee_id || '',
    })
    setUserModal(true)
  }

  // Administrator Account Verification
  const handleConfirmVerifyUser = async () => {
    if (!verifyConfirmUser) return
    setIsVerifying(true)
    try {
      const res = await api.system.verifyUser(verifyConfirmUser.user_id)
      showToast(res.message || 'User account verified successfully', 'success')

      const updatedUserPayload = {
        ...verifyConfirmUser,
        account_verified: true,
        account_verified_at: res.user?.account_verified_at || new Date().toISOString(),
        verified_by_name: res.user?.verified_by_name || 'Administrator',
      }

      setUsers(prev => prev.map(u => u.user_id === verifyConfirmUser.user_id ? { ...u, ...updatedUserPayload } : u))
      if (selectedUserDetail && selectedUserDetail.user_id === verifyConfirmUser.user_id) {
        setSelectedUserDetail(prev => ({ ...prev, ...updatedUserPayload }))
      }

      setVerifyConfirmUser(null)
    } catch (err) {
      console.error('Verify user failed:', err)
      showToast(err.message || 'Failed to verify user account', 'error')
    } finally {
      setIsVerifying(false)
    }
  }

  const handleConfirmRevokeUser = async () => {
    if (!revokeConfirmUser) return
    setIsVerifying(true)
    try {
      const res = await api.system.revokeUserVerification(revokeConfirmUser.user_id)
      showToast(res.message || 'Account verification revoked', 'success')

      const updatedUserPayload = {
        ...revokeConfirmUser,
        account_verified: false,
        account_verified_at: null,
        verified_by_name: null,
      }

      setUsers(prev => prev.map(u => u.user_id === revokeConfirmUser.user_id ? { ...u, ...updatedUserPayload } : u))
      if (selectedUserDetail && selectedUserDetail.user_id === revokeConfirmUser.user_id) {
        setSelectedUserDetail(prev => ({ ...prev, ...updatedUserPayload }))
      }

      setRevokeConfirmUser(null)
    } catch (err) {
      console.error('Revoke user failed:', err)
      showToast(err.message || 'Failed to revoke verification', 'error')
    } finally {
      setIsVerifying(false)
    }
  }

  // Backup Actions
  const handleCreateBackup = async () => {
    setBackingUp(true)
    try {
      const res = await api.system.createBackup(user?.user_id || 1)
      showToast(res.message || 'Manual backup completed successfully', 'success')
      loadTabData('backups')
    } catch (err) {
      showToast(err.message || 'Failed to create database backup', 'error')
    } finally {
      setBackingUp(false)
    }
  }

  const handleRestoreBackup = async () => {
    if (!restoringItem) return
    try {
      const res = await api.system.restoreBackup(restoringItem.backup_id, user?.user_id || 1)
      showToast(res.message || 'Database restored successfully', 'success')
      setRestoringItem(null)
      loadTabData('backups')
    } catch (err) {
      showToast(err.message || 'Failed to restore backup', 'error')
    }
  }

  // Settings Action
  const handleSaveSettings = async (e) => {
    e.preventDefault()
    setSavingSettings(true)
    try {
      await api.system.saveSettings({
        ...settings,
        user_id: user?.user_id || 1,
      })
      showToast('System configuration saved successfully', 'success')
    } catch (err) {
      showToast(err.message || 'Failed to save settings', 'error')
    } finally {
      setSavingSettings(false)
    }
  }

  const filteredUsers = useMemo(() => {
    return filterBySearch(users, userSearch, ['username', 'role'])
  }, [users, userSearch])

  const filteredLogs = useMemo(() => {
    return filterBySearch(logs, logSearch, ['user', 'action', 'module', 'description'])
  }, [logs, logSearch])

  const tabs = [
    { id: 'users', label: 'User Accounts & Verification', icon: <FiUsers className="w-3.5 h-3.5" /> },
    { id: 'logs', label: 'Audit & System Logs', icon: <FiActivity className="w-3.5 h-3.5" /> },
    { id: 'backups', label: 'Database Backup & Restore', icon: <FiDatabase className="w-3.5 h-3.5" /> },
    { id: 'settings', label: 'Company Configuration', icon: <FiSettings className="w-3.5 h-3.5" /> },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="System Administration & Settings"
        subtitle="Manage user accounts, audit security trails, database backups, and company settings"
      />

      <TabBar
        tabs={tabs}
        activeTab={activeTab}
        onChange={setActiveTab}
      />

      {error && <ErrorAlert message={error} onRetry={() => loadTabData(activeTab)} />}

      {/* ─── Users Tab ─── */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          <Card noPad className="p-3.5 border border-border flex flex-col sm:flex-row justify-between items-center gap-3">
            <div className="w-full sm:w-80 relative">
              <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                value={userSearch}
                onChange={e => setUserSearch(e.target.value)}
                placeholder="Search user, username, role..."
                className="w-full pl-9 pr-8 py-2 text-xs border border-border rounded-xl bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-muted-foreground/70"
              />
              {userSearch && (
                <button
                  type="button"
                  onClick={() => setUserSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <FiX className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <div className="flex gap-2 w-full sm:w-auto justify-end">
              <button
                onClick={() => { setEditUser(null); setUserForm({ username: '', password: '', role: 'Employee', is_active: true, employee_id: '' }); setUserModal(true) }}
                className="flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer"
              >
                <FiPlus className="w-4 h-4" />
                <span>Add User Account</span>
              </button>
            </div>
          </Card>

          <Card noPad className="border border-border overflow-hidden">
            {loading ? (
              <TableSkeleton rows={5} cols={7} />
            ) : filteredUsers.length === 0 ? (
              <EmptyState
                icon={<FiUsers className="w-12 h-12 text-muted-foreground/30 mx-auto" />}
                title="No user accounts found"
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/50 text-muted-foreground uppercase font-semibold text-[11px]">
                      <th className="py-3 px-4 text-left">User / Name</th>
                      <th className="py-3 px-4 text-left">Username</th>
                      <th className="py-3 px-4 text-left">Role</th>
                      <th className="py-3 px-4 text-left">Linked Employee</th>
                      <th className="py-3 px-4 text-center">Status</th>
                      <th className="py-3 px-4 text-center">Verification</th>
                      <th className="py-3 px-4 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredUsers.map((u, i) => {
                      const empName = u.employee ? trimName(u.employee) : 'System Account'
                      const isVerified = Boolean(u.account_verified)
                      return (
                        <tr key={u.user_id || i} className={`hover:bg-muted/40 transition-colors ${i % 2 === 1 ? 'bg-muted/10' : ''}`}>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2.5">
                              <div className="w-7 h-7 rounded-xl bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0 border border-primary/20">
                                {u.role === 'Administrator' ? <FiShield className="w-3.5 h-3.5" /> : u.role === 'Store Administrator' ? <FiBriefcase className="w-3.5 h-3.5" /> : <FiUser className="w-3.5 h-3.5" />}
                              </div>
                              <div>
                                <div className="font-bold text-foreground text-xs">{empName}</div>
                                <div className="text-[10px] text-muted-foreground font-mono">ID: {u.user_id}</div>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4 font-mono font-bold text-foreground">@{u.username}</td>
                          <td className="py-3 px-4">
                            <Badge
                              text={u.role}
                              variant={u.role === 'Administrator' ? 'info' : u.role === 'Store Administrator' ? 'purple' : 'neutral'}
                            />
                          </td>
                          <td className="py-3 px-4">
                            {u.employee ? (
                              <div className="text-xs">
                                <span className="font-mono font-bold text-primary">{u.employee.employee_code}</span>
                                <span className="text-[11px] text-muted-foreground block truncate max-w-[150px]">{u.employee.position}</span>
                              </div>
                            ) : (
                              <span className="text-[11px] text-muted-foreground italic">Unlinked</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center"><StatusBadge status={u.is_active ? 'Active' : 'Inactive'} /></td>
                          <td className="py-3 px-4 text-center">
                            {isVerified ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 px-2.5 py-0.5 rounded-full">
                                <FiCheckCircle className="w-3 h-3 text-emerald-500" />
                                <span>Verified</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 px-2.5 py-0.5 rounded-full">
                                <FiAlertTriangle className="w-3 h-3 text-amber-500" />
                                <span>Unverified</span>
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => setSelectedUserDetail(u)}
                                title="View details"
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg border border-border hover:bg-muted font-semibold cursor-pointer transition-colors"
                              >
                                <FiEye className="w-3 h-3" />
                                <span>View</span>
                              </button>
                              <button
                                onClick={() => openEditUser(u)}
                                title="Edit user"
                                className="p-1 rounded-lg border border-border hover:bg-muted text-muted-foreground cursor-pointer transition-colors"
                              >
                                <FiEdit className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setDeleteUser(u)}
                                title="Delete user"
                                disabled={u.username === 'admin'}
                                className="p-1 rounded-lg border border-border hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 text-muted-foreground cursor-pointer transition-colors disabled:opacity-40"
                              >
                                <FiTrash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ─── Logs Tab ─── */}
      {activeTab === 'logs' && (
        <div className="space-y-4">
          <Card noPad className="p-3.5 border border-border flex flex-col sm:flex-row justify-between items-center gap-3">
            <div className="w-full sm:w-80 relative">
              <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                value={logSearch}
                onChange={e => setLogSearch(e.target.value)}
                placeholder="Search action, user, details..."
                className="w-full pl-9 pr-8 py-2 text-xs border border-border rounded-xl bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-muted-foreground/70"
              />
              {logSearch && (
                <button
                  type="button"
                  onClick={() => setLogSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <FiX className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              <select
                value={logModule}
                onChange={e => setLogModule(e.target.value)}
                className="border border-border rounded-xl px-3 py-2 text-xs font-semibold bg-card cursor-pointer"
              >
                {MODULES.map(m => <option key={m} value={m}>{m === 'All' ? 'All Modules' : m}</option>)}
              </select>
            </div>
          </Card>

          <Card noPad className="border border-border overflow-hidden">
            {loading ? (
              <TableSkeleton rows={8} cols={6} />
            ) : filteredLogs.length === 0 ? (
              <EmptyState
                icon={<FiActivity className="w-12 h-12 text-muted-foreground/30 mx-auto" />}
                title="No system audit logs recorded"
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/50 text-muted-foreground uppercase font-semibold text-[11px]">
                      <th className="py-3 px-4 text-left">Timestamp</th>
                      <th className="py-3 px-4 text-left">User</th>
                      <th className="py-3 px-4 text-left">Module</th>
                      <th className="py-3 px-4 text-left">Action</th>
                      <th className="py-3 px-4 text-left">Description</th>
                      <th className="py-3 px-4 text-left">IP Address</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredLogs.map((l, i) => (
                      <tr key={l.log_id || i} className={`hover:bg-muted/40 transition-colors ${i % 2 === 1 ? 'bg-muted/10' : ''}`}>
                        <td className="py-3 px-4 font-mono text-muted-foreground">{l.datetime}</td>
                        <td className="py-3 px-4 font-bold text-foreground">{l.user}</td>
                        <td className="py-3 px-4"><Badge text={l.module} variant="neutral" /></td>
                        <td className="py-3 px-4">
                          <Badge
                            text={l.action}
                            variant={l.action === 'DELETE' || l.action === 'REVOKE_VERIFICATION' ? 'danger' : l.action === 'CREATE' || l.action === 'VERIFY_ACCOUNT' ? 'success' : 'info'}
                          />
                        </td>
                        <td className="py-3 px-4 text-foreground">{l.description}</td>
                        <td className="py-3 px-4 font-mono text-muted-foreground">{l.ip_address}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ─── Backups Tab ─── */}
      {activeTab === 'backups' && (
        <div className="space-y-4">
          <Card noPad className="p-4 border border-border flex justify-between items-center">
            <div>
              <h3 className="font-bold text-xs text-foreground uppercase">Database Snapshots & Backups</h3>
              <p className="text-[11px] text-muted-foreground">Create on-demand SQL backups or restore previous system checkpoints</p>
            </div>
            <button
              onClick={handleCreateBackup}
              disabled={backingUp}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50"
            >
              <FiDatabase className="w-4 h-4" />
              <span>{backingUp ? 'Creating Backup...' : 'Create Backup'}</span>
            </button>
          </Card>

          <Card noPad className="border border-border overflow-hidden">
            {loading ? (
              <TableSkeleton rows={4} cols={7} />
            ) : backups.length === 0 ? (
              <EmptyState
                icon={<FiDatabase className="w-12 h-12 text-muted-foreground/30 mx-auto" />}
                title="No backup snapshots found"
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/50 text-muted-foreground uppercase font-semibold text-[11px]">
                      <th className="py-3 px-4 text-left">Backup Name</th>
                      <th className="py-3 px-4 text-left">Type</th>
                      <th className="py-3 px-4 text-left">Size</th>
                      <th className="py-3 px-4 text-left">Created At</th>
                      <th className="py-3 px-4 text-left">Created By</th>
                      <th className="py-3 px-4 text-center">Status</th>
                      <th className="py-3 px-4 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {backups.map((b, i) => (
                      <tr key={b.backup_id || i} className={`hover:bg-muted/40 transition-colors ${i % 2 === 1 ? 'bg-muted/10' : ''}`}>
                        <td className="py-3 px-4 font-mono font-bold text-foreground">{b.backup_name}</td>
                        <td className="py-3 px-4">{b.backup_type}</td>
                        <td className="py-3 px-4 font-mono">{b.file_size}</td>
                        <td className="py-3 px-4 font-mono text-muted-foreground">{b.completed_at || b.started_at}</td>
                        <td className="py-3 px-4">{b.created_by}</td>
                        <td className="py-3 px-4 text-center"><StatusBadge status={b.status} /></td>
                        <td className="py-3 px-4 text-center">
                          <button
                            onClick={() => setRestoringItem(b)}
                            title="Restore database"
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg border border-border hover:bg-muted font-semibold cursor-pointer transition-colors"
                          >
                            <FiRotateCcw className="w-3.5 h-3.5" />
                            <span>Restore</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ─── Settings Tab ─── */}
      {activeTab === 'settings' && (
        <Card noPad className="p-5 border border-border">
          <form onSubmit={handleSaveSettings} className="space-y-4 max-w-2xl text-xs">
            <h3 className="font-bold text-sm text-foreground border-b border-border pb-2">Store & Company Settings</h3>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-muted-foreground mb-1">Company / Business Name *</label>
                <input
                  type="text"
                  value={settings.company_name}
                  onChange={e => setSettings(s => ({ ...s, company_name: e.target.value }))}
                  required
                  className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground"
                />
              </div>
              <div>
                <label className="block font-bold text-muted-foreground mb-1">Contact Phone</label>
                <input
                  type="text"
                  value={settings.phone}
                  onChange={e => setSettings(s => ({ ...s, phone: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-muted-foreground mb-1">Official Email Address</label>
                <input
                  type="email"
                  value={settings.email}
                  onChange={e => setSettings(s => ({ ...s, email: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground"
                />
              </div>
              <div>
                <label className="block font-bold text-muted-foreground mb-1">Currency Symbol / Code</label>
                <input
                  type="text"
                  value={settings.currency}
                  onChange={e => setSettings(s => ({ ...s, currency: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground"
                />
              </div>
            </div>

            <div>
              <label className="block font-bold text-muted-foreground mb-1">Store Address</label>
              <input
                type="text"
                value={settings.address}
                onChange={e => setSettings(s => ({ ...s, address: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-muted-foreground mb-1">Attendance Morning Cutoff</label>
                <input
                  type="time"
                  value={settings.attendance_cutoff}
                  onChange={e => setSettings(s => ({ ...s, attendance_cutoff: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-mono"
                />
              </div>
              <div>
                <label className="block font-bold text-muted-foreground mb-1">System Timezone</label>
                <input
                  type="text"
                  value={settings.timezone}
                  onChange={e => setSettings(s => ({ ...s, timezone: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-border flex justify-end">
              <button
                type="submit"
                disabled={savingSettings}
                className="flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs rounded-xl shadow-xs cursor-pointer disabled:opacity-50"
              >
                <FiSave className="w-4 h-4" />
                <span>{savingSettings ? 'Saving...' : 'Save Settings'}</span>
              </button>
            </div>
          </form>
        </Card>
      )}

      {/* ─── 1. USER DETAILS MODAL ─── */}
      {selectedUserDetail && (
        <Modal
          isOpen={true}
          title="User Account & Verification Details"
          onClose={() => setSelectedUserDetail(null)}
          size="lg"
        >
          <div className="space-y-4 text-xs">
            {/* Account Information Card */}
            <div className="p-3.5 bg-card rounded-xl border border-border space-y-2.5">
              <div className="flex items-center gap-2.5 border-b border-border pb-2">
                <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold text-sm">
                  {selectedUserDetail.role === 'Administrator' ? <FiShield className="w-4 h-4" /> : selectedUserDetail.role === 'Store Administrator' ? <FiBriefcase className="w-4 h-4" /> : <FiUser className="w-4 h-4" />}
                </div>
                <div>
                  <h4 className="text-xs font-bold text-foreground">Account Information</h4>
                  <p className="text-[10px] text-muted-foreground font-mono">System User ID: {selectedUserDetail.user_id}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <span className="text-[10px] uppercase font-bold text-muted-foreground block">Username</span>
                  <span className="font-mono font-bold text-foreground">@{selectedUserDetail.username}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-muted-foreground block">System Role</span>
                  <Badge
                    text={selectedUserDetail.role}
                    variant={selectedUserDetail.role === 'Administrator' ? 'info' : selectedUserDetail.role === 'Store Administrator' ? 'purple' : 'neutral'}
                  />
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-muted-foreground block">Account Status</span>
                  <StatusBadge status={selectedUserDetail.is_active ? 'Active' : 'Inactive'} />
                </div>
              </div>
            </div>

            {/* Employee Information Card */}
            <div className="p-3.5 bg-muted/20 rounded-xl border border-border space-y-2.5">
              <div className="flex items-center justify-between border-b border-border pb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-foreground">Employee Profile</span>
                {selectedUserDetail.employee && (
                  <span className="font-mono font-bold text-xs text-primary bg-primary/10 px-2 py-0.5 rounded-md">
                    {selectedUserDetail.employee.employee_code}
                  </span>
                )}
              </div>

              {selectedUserDetail.employee ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-muted-foreground block">Employee ID</span>
                    <p className="font-mono font-bold text-primary">{selectedUserDetail.employee.employee_code}</p>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-muted-foreground block">Full Name</span>
                    <p className="font-semibold text-foreground">{trimName(selectedUserDetail.employee)}</p>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-muted-foreground block">Department</span>
                    <p className="font-semibold text-foreground">{selectedUserDetail.employee.department || '—'}</p>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-muted-foreground block">Position</span>
                    <p className="font-semibold text-foreground">{selectedUserDetail.employee.position || '—'}</p>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-muted-foreground block">Branch</span>
                    <p className="font-semibold text-foreground">{selectedUserDetail.employee.branch || '—'}</p>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-muted-foreground block">Phone</span>
                    <p className="font-mono font-semibold text-foreground">{selectedUserDetail.employee.phone || '—'}</p>
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 rounded-xl text-xs flex items-center gap-2">
                  <FiAlertTriangle className="w-4 h-4 shrink-0 text-amber-500" />
                  <span>This user account is not linked to an employee profile.</span>
                </div>
              )}
            </div>

            {/* Account Verification Section */}
            <div className="space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-foreground block">
                Verification State
              </span>

              {selectedUserDetail.account_verified ? (
                <div className="p-3.5 bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300 flex items-center justify-center font-bold shrink-0">
                      <FiCheckCircle className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-emerald-900 dark:text-emerald-200">
                        OFFICIALLY VERIFIED
                      </div>
                      <p className="text-[10px] text-emerald-700 dark:text-emerald-400">
                        Verified By: <strong>{selectedUserDetail.verified_by_name || 'Administrator'}</strong>
                        {selectedUserDetail.account_verified_at && (
                          <span> · {fmtDate(selectedUserDetail.account_verified_at)}</span>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    {isAdmin && (
                      <button
                        onClick={() => setRevokeConfirmUser(selectedUserDetail)}
                        className="px-3 py-1.5 text-xs font-bold rounded-xl border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 cursor-pointer transition-colors"
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="p-3.5 bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 flex items-center justify-center font-bold shrink-0">
                      <FiAlertTriangle className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-amber-900 dark:text-amber-200">
                        STATUS: NOT VERIFIED
                      </div>
                      <p className="text-[10px] text-amber-700 dark:text-amber-400">
                        Review employee information and confirm verification.
                      </p>
                    </div>
                  </div>

                  {isAdmin && (
                    <button
                      onClick={() => setVerifyConfirmUser(selectedUserDetail)}
                      className="px-3 py-1.5 text-xs font-bold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer shadow-xs transition-colors"
                    >
                      Verify Account
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setSelectedUserDetail(null)}
                className="flex items-center gap-1 px-4 py-1.5 rounded-xl border border-border hover:bg-muted font-semibold cursor-pointer"
              >
                <FiX className="w-3.5 h-3.5" />
                <span>Close</span>
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ─── 2. ADMIN VERIFICATION CONFIRMATION MODAL ─── */}
      {verifyConfirmUser && (
        <Modal
          isOpen={true}
          title="Verify User Account"
          onClose={() => !isVerifying && setVerifyConfirmUser(null)}
          size="md"
        >
          <div className="space-y-3.5 text-xs">
            <p className="text-muted-foreground leading-relaxed">
              Confirm official verification for user <strong className="text-foreground">@{verifyConfirmUser.username}</strong> ({verifyConfirmUser.role}):
            </p>

            <div className="bg-muted/30 border border-border rounded-xl p-3 space-y-1.5">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Full Name:</span>
                <span className="font-bold text-foreground">
                  {verifyConfirmUser.employee ? trimName(verifyConfirmUser.employee) : verifyConfirmUser.username}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Employee ID:</span>
                <span className="font-mono font-bold text-primary">
                  {verifyConfirmUser.employee ? verifyConfirmUser.employee.employee_code : 'N/A'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Position:</span>
                <span className="font-semibold text-foreground">
                  {verifyConfirmUser.employee ? verifyConfirmUser.employee.position : '—'}
                </span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setVerifyConfirmUser(null)}
                disabled={isVerifying}
                className="px-4 py-1.5 rounded-xl border border-border hover:bg-muted font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmVerifyUser}
                disabled={isVerifying}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-xl cursor-pointer disabled:opacity-50"
              >
                <FiCheckCircle className="w-3.5 h-3.5" />
                <span>{isVerifying ? 'Verifying...' : 'Confirm Verification'}</span>
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ─── 3. ADMIN REVOKE CONFIRMATION MODAL ─── */}
      {revokeConfirmUser && (
        <Modal
          isOpen={true}
          title="Revoke Verification"
          onClose={() => !isVerifying && setRevokeConfirmUser(null)}
          size="sm"
        >
          <div className="space-y-3.5 text-xs">
            <p className="text-muted-foreground">
              Are you sure you want to revoke account verification for <strong className="text-foreground">@{revokeConfirmUser.username}</strong>?
            </p>
            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setRevokeConfirmUser(null)}
                disabled={isVerifying}
                className="px-4 py-1.5 rounded-xl border border-border hover:bg-muted font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRevokeUser}
                disabled={isVerifying}
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl cursor-pointer disabled:opacity-50"
              >
                {isVerifying ? 'Revoking...' : 'Revoke Verification'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Add / Edit User Modal */}
      {userModal && (
        <Modal
          isOpen={true}
          title={editUser ? `Edit User: ${editUser.username}` : 'Add User Account'}
          onClose={() => { setUserModal(false); setEditUser(null) }}
          size="md"
        >
          <form onSubmit={handleSaveUser} className="space-y-3.5 text-xs">
            <div>
              <label className="block font-bold text-muted-foreground mb-1">Username *</label>
              <input
                type="text"
                value={userForm.username}
                onChange={e => setUserForm(f => ({ ...f, username: e.target.value }))}
                placeholder="e.g. j.delacruz"
                required
                className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground"
              />
            </div>

            <div>
              <label className="block font-bold text-muted-foreground mb-1">
                {editUser ? 'New Password (Leave blank to keep existing)' : 'Password *'}
              </label>
              <input
                type="password"
                value={userForm.password}
                onChange={e => setUserForm(f => ({ ...f, password: e.target.value }))}
                placeholder="••••••••"
                required={!editUser}
                className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-mono"
              />
            </div>

            <div>
              <label className="block font-bold text-muted-foreground mb-1">Role Assignment *</label>
              <select
                value={userForm.role}
                onChange={e => setUserForm(f => ({ ...f, role: e.target.value }))}
                className="w-full border border-border rounded-xl px-3 py-2 text-xs font-semibold bg-card text-foreground cursor-pointer"
              >
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>

            <div>
              <label className="block font-bold text-muted-foreground mb-1">Linked Employee Profile</label>
              <select
                value={userForm.employee_id}
                onChange={e => setUserForm(f => ({ ...f, employee_id: e.target.value }))}
                className="w-full border border-border rounded-xl px-3 py-2 text-xs bg-card text-foreground cursor-pointer font-medium"
              >
                <option value="">-- Unlinked / Standalone Account --</option>
                {employeesList.map(e => (
                  <option key={e.employee_id} value={e.employee_id}>
                    {e.employee_code} - {e.first_name} {e.last_name} ({e.position})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-bold text-muted-foreground mb-1">Account Status</label>
              <select
                value={userForm.is_active ? 'Active' : 'Inactive'}
                onChange={e => setUserForm(f => ({ ...f, is_active: e.target.value === 'Active' }))}
                className="w-full border border-border rounded-xl px-3 py-2 text-xs font-semibold bg-card text-foreground cursor-pointer"
              >
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => { setUserModal(false); setEditUser(null) }}
                className="px-4 py-2 rounded-xl border border-border hover:bg-muted font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-xl cursor-pointer"
              >
                <FiCheckCircle className="w-3.5 h-3.5" />
                <span>{editUser ? 'Update User' : 'Create User'}</span>
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete User Confirmation */}
      {deleteUser && (
        <Modal
          isOpen={true}
          title="Delete User Account"
          onClose={() => setDeleteUser(null)}
          size="sm"
        >
          <div className="space-y-3.5 text-xs">
            <p className="text-muted-foreground">
              Are you sure you want to remove user <strong className="text-foreground">@{deleteUser.username}</strong>?
            </p>
            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setDeleteUser(null)}
                className="px-4 py-1.5 rounded-xl border border-border hover:bg-muted font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteUser}
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl cursor-pointer"
              >
                Delete User
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Restore Backup Confirmation */}
      {restoringItem && (
        <Modal
          isOpen={true}
          title="Restore Database Snapshot"
          onClose={() => setRestoringItem(null)}
          size="sm"
        >
          <div className="space-y-3.5 text-xs">
            <p className="text-muted-foreground">
              Are you sure you want to restore the database to <strong className="text-foreground">{restoringItem.backup_name}</strong>?
            </p>
            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setRestoringItem(null)}
                className="px-4 py-1.5 rounded-xl border border-border hover:bg-muted font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRestoreBackup}
                className="px-4 py-1.5 bg-primary text-primary-foreground font-bold rounded-xl cursor-pointer"
              >
                Confirm Restore
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

function trimName(emp) {
  if (!emp) return 'System Account'
  return trim(`${emp.first_name || ''} ${emp.middle_name ? `${emp.middle_name} ` : ''}${emp.last_name || ''}`)
}

function trim(str) {
  return str.replace(/\s+/g, ' ').trim()
}

export function UsersPage() {
  return <SystemPage defaultTab="users" />
}

export function SystemLogsPage() {
  return <SystemPage defaultTab="logs" />
}

export function BackupsPage() {
  return <SystemPage defaultTab="backups" />
}

export function SettingsPage() {
  return <SystemPage defaultTab="settings" />
}
