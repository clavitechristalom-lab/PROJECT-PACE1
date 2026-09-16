const API_BASE = import.meta.env.VITE_API_URL || '/api';

const cleanParams = (params) => {
  const cleaned = {};
  for (const [key, val] of Object.entries(params || {})) {
    if (val !== undefined && val !== null && val !== '') {
      cleaned[key] = val;
    }
  }
  return cleaned;
};

async function request(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;

  let token = null;
  try {
    const raw = sessionStorage.getItem('pace_session') || localStorage.getItem('pace_session');
    if (raw) {
      const parsed = JSON.parse(raw);
      token = parsed.token;
    }
  } catch (e) { }

  const headers = {
    'Accept': 'application/json',
    ...(options.body && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...options.headers,
  };

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      if (response.status === 401 && !endpoint.startsWith('/login') && !endpoint.startsWith('/register')) {
        sessionStorage.removeItem('pace_session');
        localStorage.removeItem('pace_session');
        window.dispatchEvent(new CustomEvent('auth:expired'));
      }
      let errorMsg = data?.message || `Request failed with status ${response.status}`;
      if (response.status === 401) {
        errorMsg = 'Your session has expired. Please log in again.';
      }
      if (data?.errors) {
        const errorList = Object.values(data.errors).flat().join(', ');
        if (errorList) errorMsg = `${errorMsg}: ${errorList}`;
      }
      const err = new Error(errorMsg);
      err.status = response.status;
      err.data = data;
      throw err;
    }

    return data;
  } catch (error) {
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      throw new Error(`Unable to connect to backend server at ${API_BASE}. Please ensure Laravel is running.`);
    }
    throw error;
  }
}

export const api = {
  // ─── Branches ───
  branches: {
    getAll: () => request('/branches'),
    create: (data) => request('/branches', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
    update: (id, data) => request(`/branches/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
    uploadImage: (id, formData) => request(`/branches/${id}/image`, {
      method: 'POST',
      body: formData,
    }),
    delete: (id) => request(`/branches/${id}`, {
      method: 'DELETE',
    }),
  },

  // ─── Auth ───
  auth: {
    login: (username, password) =>
      request('/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      }),
    register: (data) =>
      request('/register', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    registrationOptions: () => request('/registration-options'),
    me: (userId) => request(`/me?user_id=${userId}`),
    logout: (userId) =>
      request('/logout', {
        method: 'POST',
        body: JSON.stringify({ user_id: userId }),
      }),
    uploadProfileImage: (formData) =>
      request('/user/profile-image', {
        method: 'POST',
        body: formData,
      }),
  },

  dashboard: {
    getStats: (params = {}) => {
      const qs = new URLSearchParams(cleanParams(params)).toString();
      return request(`/dashboard/stats${qs ? `?${qs}` : ''}`);
    },
    getBusinessPerformance: (params = {}) => {
      const qs = new URLSearchParams(cleanParams(params)).toString();
      return request(`/dashboard/business-performance${qs ? `?${qs}` : ''}`);
    },
    getBranchComparison: () => request('/dashboard/branch-comparison'),
    getAlerts: () => request('/dashboard/alerts'),
    getCharts: () => request('/dashboard/charts'),
    getRecent: () => request('/dashboard/recent'),
  },

  // ─── Products ───
  products: {
    getAll: (params = {}) => {
      const qs = new URLSearchParams(cleanParams(params)).toString();
      return request(`/products${qs ? `?${qs}` : ''}`);
    },
    getById: (id) => request(`/products/${id}`),
    create: (data) =>
      request('/products', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id, data) =>
      request(`/products/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (id) => request(`/products/${id}`, { method: 'DELETE' }),
  },

  // ─── Customers ───
  customers: {
    getAll: (params = {}) => {
      const qs = new URLSearchParams(cleanParams(params)).toString();
      return request(`/customers${qs ? `?${qs}` : ''}`);
    },
    getById: (id) => request(`/customers/${id}`),
    create: (data) =>
      request('/customers', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id, data) =>
      request(`/customers/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (id) => request(`/customers/${id}`, { method: 'DELETE' }),
    // Admin only: assign or unassign a branch (branchId = null to unassign)
    assignBranch: (id, branchId) =>
      request(`/customers/${id}/branch`, {
        method: 'PUT',
        body: JSON.stringify({ branch_id: branchId }),
      }),
  },

  // ─── Transactions (Unified History) ───
  transactions: {
    getAll: (params = {}) => {
      const qs = new URLSearchParams(cleanParams(params)).toString();
      return request(`/transactions${qs ? `?${qs}` : ''}`);
    },
  },

  // ─── Sales ───
  sales: {
    getAll: (params = {}) => {
      const qs = new URLSearchParams(cleanParams(params)).toString();
      return request(`/sales${qs ? `?${qs}` : ''}`);
    },
    getById: (id) => request(`/sales/${id}`),
    create: (data) =>
      request('/sales', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },

  // ─── Installments ───
  installments: {
    getAll: (params = {}) => {
      const qs = new URLSearchParams(cleanParams(params)).toString();
      return request(`/installments${qs ? `?${qs}` : ''}`);
    },
    getOverdue: (params = {}) => {
      const qs = new URLSearchParams(cleanParams(params)).toString();
      return request(`/installments/overdue${qs ? `?${qs}` : ''}`);
    },
    getById: (id) => request(`/installments/${id}`),
    create: (data) =>
      request('/installments', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id, data) =>
      request(`/installments/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (id) => request(`/installments/${id}`, { method: 'DELETE' }),
  },

  // ─── Payments & Schedules ───
  payments: {
    getAll: (params = {}) => {
      const qs = new URLSearchParams(cleanParams(params)).toString();
      return request(`/payments${qs ? `?${qs}` : ''}`);
    },
    getMonitoring: (params = {}) => {
      const qs = new URLSearchParams(cleanParams(params)).toString();
      return request(`/payments/monitoring${qs ? `?${qs}` : ''}`);
    },
    getById: (id) => request(`/payments/${id}`),
    create: (data) =>
      request('/payments', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    getSchedules: (params = {}) => {
      const qs = new URLSearchParams(cleanParams(params)).toString();
      return request(`/payment-schedules${qs ? `?${qs}` : ''}`);
    },
  },

  // ─── Employees ───
  employees: {
    getAll: (params = {}) => {
      const qs = new URLSearchParams(cleanParams(params)).toString();
      return request(`/employees${qs ? `?${qs}` : ''}`);
    },
    getMe: () => request('/employee/me'),
    updateMe: (data) =>
      request('/employee/me', {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    verifyAccount: () =>
      request('/employee/verify-account', {
        method: 'POST',
      }),
    verifyMe: () =>
      request('/employee/verify-account', {
        method: 'POST',
      }),
    getById: (id) => request(`/employees/${id}`),
    create: (data) =>
      request('/employees', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id, data) =>
      request(`/employees/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (id) => request(`/employees/${id}`, { method: 'DELETE' }),
    getQr: (id) => request(`/employees/${id}/qr`),
    generateQr: (id) =>
      request(`/employees/${id}/qr/generate`, {
        method: 'POST',
      }),
    setPin: (id, pin) =>
      request(`/employees/${id}/pin`, {
        method: 'POST',
        body: JSON.stringify({ pin }),
      }),
    revokeQr: (id) =>
      request(`/employees/${id}/qr/revoke`, {
        method: 'POST',
      }),
    reissueQr: (id) =>
      request(`/employees/${id}/qr/reissue`, {
        method: 'POST',
      }),
    regenerateQr: (id) =>
      request(`/employees/${id}/qr/reissue`, {
        method: 'POST',
      }),
    disableQr: (id) =>
      request(`/employees/${id}/qr/revoke`, {
        method: 'POST',
      }),
    enableQr: (id) =>
      request(`/employees/${id}/qr/enable`, {
        method: 'POST',
      }),
    toggleQr: (id, active) =>
      request(`/employees/${id}/qr/toggle`, {
        method: 'POST',
        body: JSON.stringify({ active }),
      }),
    setPin: (id, pin) =>
      request(`/employees/${id}/pin`, {
        method: 'POST',
        body: JSON.stringify({ pin }),
      }),
    verify: (id) =>
      request(`/employees/${id}/verify`, {
        method: 'POST',
      }),
    unverify: (id) =>
      request(`/employees/${id}/unverify`, {
        method: 'POST',
      }),
    
    // Financials
    getFinancials: (id) => request(`/employees/${id}/financials`),
    addAllowance: (id, data) => request(`/employees/${id}/allowances`, { method: 'POST', body: JSON.stringify(data) }),
    deleteAllowance: (itemId) => request(`/employees/allowances/${itemId}`, { method: 'DELETE' }),
    addDeduction: (id, data) => request(`/employees/${id}/deductions`, { method: 'POST', body: JSON.stringify(data) }),
    deleteDeduction: (itemId) => request(`/employees/deductions/${itemId}`, { method: 'DELETE' }),
    addLoan: (id, data) => request(`/employees/${id}/loans`, { method: 'POST', body: JSON.stringify(data) }),
    deleteLoan: (itemId) => request(`/employees/loans/${itemId}`, { method: 'DELETE' }),

    unverify: (id) => request(`/employees/${id}/unverify`, {
      method: 'POST',
    }),
    getMeAttendance: () => request('/employee/me/attendance'),
  },

  // ─── Attendance ───
  attendance: {
    getAll: (params = {}) => {
      const qs = new URLSearchParams(cleanParams(params)).toString();
      return request(`/attendance${qs ? `?${qs}` : ''}`);
    },
    getDaily: async (params = {}) => {
      const qs = new URLSearchParams(cleanParams(params)).toString();
      const [attData, summaryData] = await Promise.all([
        request(`/attendance${qs ? `?${qs}` : ''}`),
        request(`/attendance/summary${params.date ? `?date=${params.date}` : ''}`).catch(() => null),
      ]);
      return {
        records: attData?.attendance || attData?.records || [],
        attendance: attData?.attendance || attData?.records || [],
        total: attData?.total || 0,
        summary: summaryData?.summary || summaryData || null,
        stats: summaryData || null,
      };
    },
    getSummary: (params = {}) => {
      const qs = new URLSearchParams(cleanParams(params)).toString();
      return request(`/attendance/summary${qs ? `?${qs}` : ''}`);
    },
    verifyQr: (data) =>
      request('/attendance/verify-qr', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    pendingVerifications: () => request('/employee/me/pending-verifications'),
    approveVerification: (data) =>
      request('/employee/me/verify-attendance-pin', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    record: (data) =>
      request('/attendance/record', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    getScanLogs: (params = {}) => {
      const qs = new URLSearchParams(cleanParams(params)).toString();
      return request(`/attendance/scan-logs${qs ? `?${qs}` : ''}`);
    },
    scan: (data) =>
      request('/attendance/scan', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },

  // ─── Payroll ───
  payroll: {
    getMePayroll: (params = {}) => {
      const qs = new URLSearchParams(cleanParams(params)).toString();
      return request(`/employee/me/payroll${qs ? `?${qs}` : ''}`);
    },
    getMePayslip: (id) => request(`/employee/me/payslip/${id}`),
    getAll: (params = {}) => {
      const qs = new URLSearchParams(cleanParams(params)).toString();
      return request(`/payroll${qs ? `?${qs}` : ''}`);
    },
    getPayslip: (id) => request(`/payroll/${id}/payslip`),
    generate: (userId, periodId) =>
      request('/payroll/generate', {
        method: 'POST',
        body: JSON.stringify({ user_id: userId, period_id: periodId }),
      }),
    generate13thMonth: (userId) =>
      request('/payroll/generate-13th-month', {
        method: 'POST',
        body: JSON.stringify({ user_id: userId }),
      }),
    approve: (id, userId) =>
      request(`/payroll/${id}/approve`, {
        method: 'PUT',
        body: JSON.stringify({ user_id: userId }),
      }),
    markPaid: (id) =>
      request(`/payroll/${id}/mark-paid`, {
        method: 'PUT',
      }),
    getPeriods: () => request('/payroll-periods'),
    createPeriod: (data) =>
      request('/payroll-periods', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    closePeriod: (id) =>
      request(`/payroll-periods/${id}/close`, {
        method: 'PUT',
      }),
  },

  // ─── Reports ───
  reports: {
    getEmployees: (params = {}) => {
      const qs = new URLSearchParams(cleanParams(params)).toString();
      return request(`/reports/employees${qs ? `?${qs}` : ''}`);
    },
    getSales: (params = {}) => {
      const qs = new URLSearchParams(cleanParams(params)).toString();
      return request(`/reports/sales${qs ? `?${qs}` : ''}`);
    },
    getInventory: () => request('/reports/inventory'),
    getInstallments: () => request('/reports/installments'),
    getPayroll: (params = {}) => {
      const qs = new URLSearchParams(cleanParams(params)).toString();
      return request(`/reports/payroll${qs ? `?${qs}` : ''}`);
    },
    getAttendance: (params = {}) => {
      const qs = new URLSearchParams(cleanParams(params)).toString();
      return request(`/reports/attendance${qs ? `?${qs}` : ''}`);
    },
  },

  // ─── System & Admin ───
  system: {
    getUsers: () => request('/users'),
    getUser: (id) => request(`/users/${id}`),
    createUser: (data) =>
      request('/users', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    updateUser: (id, data) =>
      request(`/users/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    deleteUser: (id) => request(`/users/${id}`, { method: 'DELETE' }),
    verifyUser: (id) =>
      request(`/users/${id}/verify`, {
        method: 'POST',
      }),
    revokeUserVerification: (id) =>
      request(`/users/${id}/revoke-verification`, {
        method: 'POST',
      }),
    getLogs: (params = {}) => {
      const qs = new URLSearchParams(cleanParams(params)).toString();
      return request(`/system-logs${qs ? `?${qs}` : ''}`);
    },
    getBackups: () => request('/backups'),
    createBackup: (userId) =>
      request('/backups/create', {
        method: 'POST',
        body: JSON.stringify({ user_id: userId }),
      }),
    restoreBackup: (id, userId) =>
      request(`/backups/${id}/restore`, {
        method: 'POST',
        body: JSON.stringify({ user_id: userId }),
      }),
    getNotifications: (params = {}) => {
      const qs = new URLSearchParams(cleanParams(params)).toString();
      return request(`/notifications${qs ? `?${qs}` : ''}`);
    },
    getSettings: () => request('/settings'),
    saveSettings: (data) =>
      request('/settings', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    getQrMonitoring: () => request('/admin/qr-monitoring'),
    search: (query) => request(`/search?q=${encodeURIComponent(query)}`),
  },

  // ─── Notifications ───
  notifications: {
    getAll: (params = {}) => {
      const qs = new URLSearchParams(cleanParams(params)).toString();
      return request(`/notifications${qs ? `?${qs}` : ''}`);
    },
    getLatest: (params = {}) => {
      const qs = new URLSearchParams(cleanParams(params)).toString();
      return request(`/notifications/latest${qs ? `?${qs}` : ''}`);
    },
    getUnreadCount: () => request('/notifications/unread-count'),
    getById: (id) => request(`/notifications/${id}`),
    markAsRead: (id) =>
      request(`/notifications/${id}/read`, {
        method: 'POST',
      }),
    markAsUnread: (id) =>
      request(`/notifications/${id}/unread`, {
        method: 'POST',
      }),
    markAllAsRead: () =>
      request('/notifications/read-all', {
        method: 'POST',
      }),
    delete: (id) => request(`/notifications/${id}`, { method: 'DELETE' }),
    clearAllRead: () => request('/notifications/clear-all', { method: 'DELETE' }),
  },

  // ─── QR Requests (Employee & Store Admin Requests, Admin Approvals) ───
  qrRequests: {
    create: (data = {}) =>
      request('/qr-requests', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    getMy: () => request('/qr-requests/my'),
    getAll: (params = {}) => {
      const qs = new URLSearchParams(cleanParams(params)).toString();
      return request(`/admin/qr-requests${qs ? `?${qs}` : ''}`);
    },
    getById: (id) => request(`/admin/qr-requests/${id}`),
    review: (id) =>
      request(`/admin/qr-requests/${id}/review`, {
        method: 'POST',
      }),
    approve: (id, checklist) =>
      request(`/admin/qr-requests/${id}/approve`, {
        method: 'POST',
        body: JSON.stringify(checklist),
      }),
    reject: (id, reason) =>
      request(`/admin/qr-requests/${id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ rejection_reason: reason }),
      }),
  },

  // ─── Customer App ───
  customerApp: {
    getDashboard: () => request('/customer/dashboard'),
    getInstallments: () => request('/customer/installments'),
  },

  search: (query) => request(`/search?q=${encodeURIComponent(query)}`),
};

export default api;

export const downloadCsv = async (endpoint, params = {}) => {
  const qsParams = cleanParams(params);
  qsParams.export_csv = 'true';
  const qs = new URLSearchParams(qsParams).toString();
  const url = `${API_BASE}${endpoint}${qs ? `?${qs}` : ''}`;

  let token = null;
  try {
    const raw = sessionStorage.getItem('pace_session') || localStorage.getItem('pace_session');
    if (raw) {
      const parsed = JSON.parse(raw);
      token = parsed.token;
    }
  } catch (e) { }

  const headers = {
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
  };

  const response = await fetch(url, { headers });

  if (!response.ok) {
    let errorMsg = `Export failed with status ${response.status}`;
    try {
      const data = await response.json();
      if (data?.message) errorMsg = data.message;
    } catch (e) { }
    throw new Error(errorMsg);
  }

  const blob = await response.blob();
  const downloadUrl = window.URL.createObjectURL(blob);

  // Extract filename from Content-Disposition if available
  let filename = 'export.csv';
  const disposition = response.headers.get('content-disposition');
  if (disposition && disposition.includes('attachment')) {
    const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
    const matches = filenameRegex.exec(disposition);
    if (matches != null && matches[1]) {
      filename = matches[1].replace(/['"]/g, '');
    }
  }

  const link = document.createElement('a');
  link.href = downloadUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(downloadUrl);
};