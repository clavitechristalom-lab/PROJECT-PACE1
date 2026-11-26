const API_BASE = import.meta.env.VITE_API_URL || '/api';
export const STORAGE_BASE = import.meta.env.VITE_STORAGE_URL || '';

export const normalizeStorageUrls = (val) => {
  if (typeof val === 'string') {
    if (val.includes('/storage/') && /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/storage\//i.test(val)) {
      return `${STORAGE_BASE}${val.substring(val.indexOf('/storage/'))}`;
    }
    return val;
  }
  if (Array.isArray(val)) return val.map(normalizeStorageUrls);
  if (val && typeof val === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(val)) {
      out[k] = normalizeStorageUrls(v);
    }
    return out;
  }
  return val;
};


const cleanParams = (params) => {
  const cleaned = {};
  const keys = Object.keys(params || {}).sort();
  for (const key of keys) {
    const val = params[key];
    if (val !== undefined && val !== null && val !== '') {
      cleaned[key] = val;
    }
  }
  return cleaned;
};

const inFlightGets = new Map();
const inFlightControllers = new Map();
const inFlightWaiters = new Map();
const responseCache = new Map();
const CACHE_TTL_MS = 60000; // 1-minute response cache across route transitions
const MAX_CACHE_ENTRIES = 200;

export const RELATED_MODULE_INVALIDATIONS = {
  sales: ['sales', 'products', 'customers', 'installments', 'dashboard', 'reports', 'transactions'],
  payments: ['payments', 'installments', 'customers', 'dashboard', 'reports', 'transactions', 'customer_installments'],
  installments: ['installments', 'customers', 'dashboard', 'reports', 'customer_installments', 'payment_schedules'],
  customer_installments: ['customer_installments', 'installments', 'payments', 'customers', 'dashboard'],
  payment_schedules: ['payment_schedules', 'installments', 'customer_installments', 'dashboard'],
  branches: ['branches', 'dashboard', 'settings', 'employees', 'customers', 'products'],
  products: ['products', 'categories', 'sales', 'dashboard', 'reports', 'settings'],
  categories: ['categories', 'products', 'settings'],
  customers: ['customers', 'installments', 'sales', 'dashboard', 'reports', 'settings', 'customer_installments'],
  employees: ['employees', 'attendance', 'payroll', 'dashboard', 'reports', 'qr_requests', 'qr_monitoring', 'profile'],
  employee_financials: ['employee_financials', 'employees', 'payroll', 'dashboard'],
  employee_letters: ['employee_letters', 'employees', 'attendance', 'notifications'],
  attendance: ['attendance', 'employees', 'payroll', 'dashboard', 'reports', 'profile'],
  payroll: ['payroll', 'dashboard', 'reports', 'profile'],
  qr_requests: ['qr_requests', 'qr_monitoring', 'employees', 'notifications'],
  qr_monitoring: ['qr_monitoring', 'qr_requests', 'employees'],
  settings: ['settings', 'system', 'dashboard'],
  users: ['users', 'system', 'employees', 'customers', 'settings', 'dashboard'],
  system: ['system', 'settings', 'users', 'dashboard', 'storage'],
  notifications: ['notifications'],
};

export function clearSessionCaches(prefix = 'pace_cached_') {
  try {
    if (typeof sessionStorage === 'undefined') return;
    const keys = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith(prefix)) keys.push(k);
    }
    keys.forEach((k) => sessionStorage.removeItem(k));
  } catch (_) { }
}

function pruneResponseCache() {
  const now = Date.now();
  for (const [k, entry] of responseCache.entries()) {
    if (!entry || now - entry.timestamp >= CACHE_TTL_MS) {
      responseCache.delete(k);
    }
  }
  while (responseCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = responseCache.keys().next().value;
    if (oldestKey === undefined) break;
    responseCache.delete(oldestKey);
  }
}

export const ENDPOINT_MODULE_MAP = {
  branches: ['/branches', '/dashboard/branch-comparison'],
  customers: ['/customers', '/customer/wallet', '/customer/dashboard'],
  customer_installments: ['/customer/installments', '/customer/statements', '/customer/request-installment', '/customer/product-requests'],
  employees: ['/employees', '/employee/verify-account'],
  employee_financials: ['/employees/allowances', '/employees/deductions', '/employees/loans'],
  qr_requests: ['/qr-requests', '/admin/qr-requests'],
  qr_monitoring: ['/admin/qr-monitoring'],
  employee_letters: ['/employee-letters'],
  attendance: [
    '/attendance',
    '/employee/me/attendance',
    '/employee/me/pending-verifications',
    '/employee/me/face-template',
    '/employee/me/verify-attendance-pin',
    '/employee/me/cancel-attendance-verification',
  ],
  products: ['/products', '/categories', '/public/categories', '/public/products'],
  sales: ['/sales'],
  transactions: ['/transactions'],
  installments: ['/installments', '/payment-schedules', '/statements'],
  payment_schedules: ['/payment-schedules'],
  payments: ['/payments', '/collector/collections', '/collector/installment-accounts', '/collector/customer-pay', '/cashier/walk-in-payments'],
  payroll: ['/payroll', '/payroll-periods', '/payslips'],
  dashboard: ['/dashboard'],
  store_dashboard: ['/dashboard'],
  employee_dashboard: ['/dashboard'],
  reports: ['/reports'],
  carousels: ['/carousel-images'],
  carousel: ['/carousel-images'],
  support: ['/support-messages'],
  notifications: ['/notifications'],
  storage: ['/system/storage'],
  users: ['/users'],
  settings: ['/settings', '/public/settings'],
  system: ['/system', '/system-logs', '/system-stats', '/backups', '/users', '/settings', '/sync/status'],
  profile: ['/user/profile-image', '/user/face-biometric-image', '/employee/me', '/employee/me/pin'],
};

const extractCleanPath = (endpoint) => String(endpoint || '').split('?')[0].toLowerCase();

const matchesPrefixBoundary = (cleanPath, prefix) => {
  const p = prefix.toLowerCase();
  return cleanPath === p || cleanPath.startsWith(`${p}/`);
};

export function clearApiCache(endpointPrefix = null) {
  if (!endpointPrefix) {
    responseCache.clear();
    return;
  }
  const needle = String(endpointPrefix).toLowerCase();
  for (const key of responseCache.keys()) {
    if (extractCleanPath(key).includes(needle)) {
      responseCache.delete(key);
    }
  }
}

export function peekApiCache(endpoint) {
  if (!endpoint || !responseCache.has(endpoint)) return null;
  const cached = responseCache.get(endpoint);
  if (!cached || Date.now() - cached.timestamp >= CACHE_TTL_MS) {
    responseCache.delete(endpoint);
    return null;
  }
  return cached.data;
}

export function clearApiCacheForModule(module, targetId = null) {
  if (!module) return;
  const modLower = String(module).toLowerCase();
  const prefixes = ENDPOINT_MODULE_MAP[modLower] || [`/${modLower}`];

  for (const key of responseCache.keys()) {
    const cleanPath = extractCleanPath(key);
    const keyLower = key.toLowerCase();
    const matchesPrefix = prefixes.some(p => matchesPrefixBoundary(cleanPath, p));
    const matchesParam = keyLower.includes(`module=${modLower}`);

    if (matchesPrefix || matchesParam) {
      if (
        targetId === null ||
        targetId === undefined ||
        cleanPath.endsWith(`/${String(targetId).toLowerCase()}`) ||
        keyLower.includes(`/${String(targetId).toLowerCase()}/`) ||
        keyLower.includes(`id=${String(targetId).toLowerCase()}`)
      ) {
        responseCache.delete(key);
      }
    }
  }
}

export function clearApiCacheForEndpoint(endpoint) {
  if (!endpoint) return;
  const cleanEndpoint = extractCleanPath(endpoint);

  // Match the single most specific (longest prefix) module, then expand across all dependent modules
  let bestModule = null;
  let bestLength = 0;

  for (const [mod, prefixes] of Object.entries(ENDPOINT_MODULE_MAP)) {
    for (const prefix of prefixes) {
      if (matchesPrefixBoundary(cleanEndpoint, prefix) && prefix.length > bestLength) {
        bestLength = prefix.length;
        bestModule = mod;
      }
    }
  }

  // Handle nested employee financial subroutes (e.g. /employees/{id}/allowances) individually
  if (/^\/employees\/[^/]+\/(financials|allowances|deductions|loans)(\/|$)/.test(cleanEndpoint)) {
    bestModule = 'employee_financials';
  }

  if (bestModule) {
    const modulesToClear = RELATED_MODULE_INVALIDATIONS[bestModule] || [bestModule];
    modulesToClear.forEach((mod) => clearApiCacheForModule(mod));
    return;
  }

  // Fallback: clear only keys sharing the first URL segment
  const segments = cleanEndpoint.split('/').filter(Boolean);
  if (segments.length > 0) {
    const base = `/${segments[0]}`;
    for (const key of responseCache.keys()) {
      if (matchesPrefixBoundary(extractCleanPath(key), base)) {
        responseCache.delete(key);
      }
    }
  }
}

async function request(endpoint, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const isGet = method === 'GET';
  const bypassCache = options.fresh === true || options.cache === 'no-cache';

  // Targeted cache invalidation on mutations (POST, PUT, PATCH, DELETE)
  if (!isGet) {
    clearApiCacheForEndpoint(endpoint);
  }

  // Return from high-speed cache if still warm
  if (isGet && !bypassCache && responseCache.has(endpoint)) {
    const cached = responseCache.get(endpoint);
    if (Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return Promise.resolve(cached.data);
    } else {
      responseCache.delete(endpoint);
    }
  }

  // Deduplicate identical in-flight GET requests (never let one unmounting caller cancel another's shared wait)
  const existingCtrl = inFlightControllers.get(endpoint);
  if (isGet && inFlightGets.has(endpoint) && !options.fresh && !existingCtrl?.signal?.aborted) {
    const sharedPromise = inFlightGets.get(endpoint);
    if (!options.signal) {
      inFlightWaiters.set(endpoint, (inFlightWaiters.get(endpoint) || 1) + 1);
      return sharedPromise;
    }
    if (options.signal.aborted) {
      return Promise.resolve(null);
    }
    inFlightWaiters.set(endpoint, (inFlightWaiters.get(endpoint) || 1) + 1);
    return new Promise((resolve, reject) => {
      let settled = false;
      const onCallerAbort = () => {
        if (settled) return;
        settled = true;
        const left = Math.max(0, (inFlightWaiters.get(endpoint) || 1) - 1);
        inFlightWaiters.set(endpoint, left);
        if (left === 0 && inFlightControllers.get(endpoint) === existingCtrl) {
          inFlightControllers.delete(endpoint);
          inFlightGets.delete(endpoint);
          try { existingCtrl.abort(); } catch (_) { }
        }
        resolve(null);
      };
      options.signal.addEventListener('abort', onCallerAbort, { once: true });
      sharedPromise.then(
        (res) => {
          options.signal.removeEventListener('abort', onCallerAbort);
          if (!settled) { settled = true; resolve(res); }
        },
        (err) => {
          options.signal.removeEventListener('abort', onCallerAbort);
          if (!settled) { settled = true; reject(err); }
        }
      );
    });
  }

  // Cancel prior in-flight GET for the same endpoint if requested or during background refreshes
  if (isGet && options.cancelPrevious && inFlightControllers.has(endpoint)) {
    try {
      inFlightControllers.get(endpoint).abort();
    } catch (_) { }
    inFlightControllers.delete(endpoint);
    inFlightGets.delete(endpoint);
    inFlightWaiters.delete(endpoint);
  }

  const controller = new AbortController();
  if (isGet) {
    inFlightControllers.set(endpoint, controller);
    inFlightWaiters.set(endpoint, 1);
  }

  const abortAndRelease = () => {
    if (isGet) {
      const left = Math.max(0, (inFlightWaiters.get(endpoint) || 1) - 1);
      inFlightWaiters.set(endpoint, left);
      if (left > 0) {
        // Other active tabs/components are still awaiting this GET; keep it running for them
        return;
      }
      if (inFlightControllers.get(endpoint) === controller) {
        inFlightControllers.delete(endpoint);
      }
      inFlightGets.delete(endpoint);
      inFlightWaiters.delete(endpoint);
    }
    controller.abort();
  };

  if (options.signal) {
    if (options.signal.aborted) {
      abortAndRelease();
    } else {
      options.signal.addEventListener('abort', abortAndRelease, { once: true });
    }
  }

  const promise = (async () => {
    const url = `${API_BASE}${endpoint}`;

    let token = null;
    try {
      const raw = sessionStorage.getItem('pace_session');
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
        signal: controller.signal,
      });

      const rawData = await response.json().catch(() => null);
      const data = normalizeStorageUrls(rawData);

      if (response.headers?.get('X-Debug-Mode') === 'enabled') {
        const ms = response.headers.get('X-Response-Time-Ms');
        console.debug(`[PACE DEBUG] ${method} ${endpoint} -> ${response.status}${ms ? ` (${ms}ms)` : ''}`, data);
      }

      if (!response.ok) {
        if (response.status === 503 && data?.maintenance_mode) {
          window.dispatchEvent(new CustomEvent('system:maintenanceMode', {
            detail: { active: true, message: data.message, site_name: data.site_name },
          }));
        }
        if (response.status === 401 && !endpoint.startsWith('/login') && !endpoint.startsWith('/register')) {
          clearApiCache();
          clearSessionCaches();
          sessionStorage.removeItem('pace_session');
          window.dispatchEvent(new CustomEvent('auth:expired'));
        }
        let errorMsg = data?.message || data?.error || `Request failed with status ${response.status}`;
        if (response.status === 401 && !endpoint.startsWith('/login') && !endpoint.startsWith('/register')) {
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

      if (isGet && !bypassCache && data) {
        pruneResponseCache();
        if (responseCache.has(endpoint)) responseCache.delete(endpoint);
        responseCache.set(endpoint, { data, timestamp: Date.now() });
      }

      return data;
    } catch (error) {
      if (error.name === 'AbortError') {
        // Cleanly handle aborted request without throwing unhandled exceptions
        return null;
      }
      if (error.name === 'TypeError' && /fetch|networkerror|load failed/i.test(error.message || '')) {
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
          throw new Error('Browser is offline (ERR_INTERNET_DISCONNECTED). Check your Wi-Fi or DevTools Offline mode.');
        }
        throw new Error(`Unable to reach backend server at ${API_BASE}. Please ensure Laravel is running and your network is connected.`);
      }
      throw error;
    } finally {
      if (isGet && inFlightControllers.get(endpoint) === controller) {
        inFlightControllers.delete(endpoint);
      }
    }
  })();

  if (isGet && !controller.signal.aborted) {
    inFlightGets.set(endpoint, promise);
    // Attach .catch() on cleanup chain so rejected GETs don't trigger Uncaught (in promise)
    promise
      .finally(() => {
        if (inFlightGets.get(endpoint) === promise) {
          inFlightGets.delete(endpoint);
          inFlightWaiters.delete(endpoint);
        }
      })
      .catch(() => { });
  }

  return promise;
}

export const api = {
  branches: {
    getAll: (options = {}) => request('/branches', options),
    getById: (id, options = {}) => request(`/branches/${id}`, options),
    create: (data) => request('/branches', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
    update: (id, data) => {
      const isForm = data instanceof FormData;
      if (isForm && !data.has('_method')) data.append('_method', 'PUT');
      return request(`/branches/${id}`, {
        method: isForm ? 'POST' : 'PUT',
        body: isForm ? data : JSON.stringify(data),
      });
    },
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
    loginVerifyOtp: (userIdOrTarget, otp) =>
      request('/login/verify-otp', {
        method: 'POST',
        body: JSON.stringify(
          typeof userIdOrTarget === 'number' || /^\d+$/.test(userIdOrTarget)
            ? { user_id: Number(userIdOrTarget), otp }
            : { target: userIdOrTarget, otp }
        ),
      }),
    loginResendOtp: (userIdOrTarget) =>
      request('/login/resend-otp', {
        method: 'POST',
        body: JSON.stringify(
          typeof userIdOrTarget === 'number' || /^\d+$/.test(userIdOrTarget)
            ? { user_id: Number(userIdOrTarget) }
            : { target: userIdOrTarget }
        ),
      }),
    register: (data) =>
      request('/register', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    createUser: (data) =>
      request('/create_user', {
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
    uploadFaceBiometricImage: (formData) =>
      request('/user/face-biometric-image', {
        method: 'POST',
        body: formData,
      }),
    deleteFaceBiometricImage: () =>
      request('/user/face-biometric-image', {
        method: 'DELETE',
      }),
    sendOtp: (targetOrType, maybeTarget) => {
      const target = maybeTarget !== undefined ? maybeTarget : targetOrType;
      return request('/forgot-password/send-otp', {
        method: 'POST',
        body: JSON.stringify({ target }),
      });
    },
    verifyOtp: (arg1, arg2, arg3) => {
      const target = arg3 !== undefined ? arg2 : arg1;
      const otp = arg3 !== undefined ? arg3 : arg2;
      return request('/forgot-password/verify-otp', {
        method: 'POST',
        body: JSON.stringify({ target, otp }),
      });
    },
    resetPassword: (payload) =>
      request('/forgot-password/reset-password', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
  },

  // ─── Realtime Sync ───
  sync: {
    getStatus: (options = {}) => request('/sync/status', { fresh: true, ...options }),
    triggerSync: (module = 'System') =>
      request('/sync/trigger', {
        method: 'POST',
        body: JSON.stringify({ module }),
      }),
  },

  dashboard: {
    getOverview: (params = {}, options = {}) => {
      const qs = new URLSearchParams(cleanParams(params)).toString();
      return request(`/dashboard/overview${qs ? `?${qs}` : ''}`, options);
    },
    getStats: (params = {}, options = {}) => {
      const qs = new URLSearchParams(cleanParams(params)).toString();
      return request(`/dashboard/stats${qs ? `?${qs}` : ''}`, options);
    },
    getBusinessPerformance: (params = {}, options = {}) => {
      const qs = new URLSearchParams(cleanParams(params)).toString();
      return request(`/dashboard/business-performance${qs ? `?${qs}` : ''}`, options);
    },
    getBranchComparison: (options = {}) => request('/dashboard/branch-comparison', options),
    getAlerts: (options = {}) => request('/dashboard/alerts', options),
    getCharts: (options = {}) => request('/dashboard/charts', options),
    getRecent: (options = {}) => request('/dashboard/recent', options),
  },

  // ─── Products & Categories ───
  products: {
    getPublicCategories: (params = {}, options = {}) => {
      const qs = new URLSearchParams(cleanParams(params)).toString();
      return request(`/public/categories${qs ? `?${qs}` : ''}`, options);
    },
    getCategories: (params = {}, options = {}) => {
      const qs = new URLSearchParams(cleanParams(params)).toString();
      return request(`/categories${qs ? `?${qs}` : ''}`, options);
    },
    createCategory: (data) =>
      request('/categories', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    updateCategory: (id, data) =>
      request(`/categories/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    toggleCategoryStatus: (id) =>
      request(`/categories/${id}/toggle-status`, {
        method: 'PATCH',
      }),
    deleteCategory: (id) =>
      request(`/categories/${id}`, {
        method: 'DELETE',
      }),
    getPublicProducts: (params = {}, options = {}) => {
      const qs = new URLSearchParams(cleanParams(params)).toString();
      return request(`/public/products${qs ? `?${qs}` : ''}`, options);
    },
    getAll: (params = {}, options = {}) => {
      const qs = new URLSearchParams(cleanParams(params)).toString();
      return request(`/products${qs ? `?${qs}` : ''}`, options);
    },
    getById: (id, options = {}) => request(`/products/${id}`, options),
    create: (data) => {
      const isForm = data instanceof FormData;
      return request('/products', {
        method: 'POST',
        body: isForm ? data : JSON.stringify(data),
      });
    },
    update: (id, data) => {
      const isForm = data instanceof FormData;
      if (isForm) data.append('_method', 'PUT');
      return request(`/products/${id}`, {
        method: isForm ? 'POST' : 'PUT',
        body: isForm ? data : JSON.stringify(data),
      });
    },
    delete: (id) => request(`/products/${id}`, { method: 'DELETE' }),
  },

  // ─── Customers ───
  customers: {
    getAll: (params = {}, options = {}) => {
      const qs = new URLSearchParams(cleanParams(params)).toString();
      return request(`/customers${qs ? `?${qs}` : ''}`, options);
    },
    getById: (id, options = {}) => request(`/customers/${id}`, options),
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
    // Store Admin only: allow or disallow customer to undergo installment process
    toggleInstallment: (id, data) =>
      request(`/customers/${id}/allow-installment`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
  },



  // ─── Transactions (Unified History) ───
  transactions: {
    getAll: (params = {}, options = {}) => {
      const qs = new URLSearchParams(cleanParams(params)).toString();
      return request(`/transactions${qs ? `?${qs}` : ''}`, options);
    },
    exportCsv: async (params = {}) => {
      const qs = new URLSearchParams(cleanParams(params)).toString();
      let token = null;
      try {
        const raw = sessionStorage.getItem('pace_session');
        if (raw) token = JSON.parse(raw)?.token || null;
      } catch (_) { }
      if (!token) token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/transactions/export${qs ? `?${qs}` : ''}`, {
        headers: {
          Authorization: token ? `Bearer ${token}` : '',
          Accept: 'text/csv, application/json',
        },
      });
      if (!res.ok) {
        throw new Error(`Export failed: ${res.statusText}`);
      }
      return res.blob();
    },
  },

  // ─── Sales ───
  sales: {
    getAgents: (params = {}, options = {}) => {
      const qs = new URLSearchParams(cleanParams(params)).toString();
      return request(`/sales-agents${qs ? `?${qs}` : ''}`, options);
    },
    getAll: (params = {}, options = {}) => {
      const qs = new URLSearchParams(cleanParams(params)).toString();
      return request(`/sales${qs ? `?${qs}` : ''}`, options);
    },
    getById: (id, options = {}) => request(`/sales/${id}`, options),
    create: (data) =>
      request('/sales', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },

  // ─── Installments ───
  installments: {
    getAll: (params = {}, options = {}) => {
      const qs = new URLSearchParams(cleanParams(params)).toString();
      return request(`/installments${qs ? `?${qs}` : ''}`, options);
    },
    getOverdue: (params = {}, options = {}) => {
      const qs = new URLSearchParams(cleanParams(params)).toString();
      return request(`/installments/overdue${qs ? `?${qs}` : ''}`, options);
    },
    getById: (id, options = {}) => request(`/installments/${id}`, options),
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
    getAll: (params = {}, options = {}) => {
      const qs = new URLSearchParams(cleanParams(params)).toString();
      return request(`/payments${qs ? `?${qs}` : ''}`, options);
    },
    getMonitoring: (params = {}, options = {}) => {
      const qs = new URLSearchParams(cleanParams(params)).toString();
      return request(`/payments/monitoring${qs ? `?${qs}` : ''}`, options);
    },
    getById: (id, options = {}) => request(`/payments/${id}`, options),
    create: (data) =>
      request('/payments', {
        method: 'POST',
        body: data instanceof FormData ? data : JSON.stringify(data),
      }),
    delete: (id) => request(`/payments/${id}`, { method: 'DELETE' }),
    receive: (id) => request(`/payments/${id}/receive`, { method: 'POST' }),
    reject: (id, data = {}) => request(`/payments/${id}/reject`, { method: 'POST', body: JSON.stringify(data) }),
    logPrint: (id) => request(id ? `/payments/${id}/log-print` : '/payments/log-print', { method: 'POST' }),
    getSchedules: (params = {}, options = {}) => {
      const qs = new URLSearchParams(cleanParams(params)).toString();
      return request(`/payment-schedules${qs ? `?${qs}` : ''}`, options);
    },
  },

  // ─── E-Wallet & Payment Gateway ───
  ewallet: {
    getCashCollectors: (params = {}, options = {}) => {
      const qs = new URLSearchParams(cleanParams(params)).toString();
      return request(`/payments/cash/collectors${qs ? `?${qs}` : ''}`, options);
    },
    createCheckout: (data) =>
      request('/payments/ewallet/checkout', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    checkStatus: (reference, options = {}) =>
      request(`/payments/ewallet/status/${encodeURIComponent(reference)}`, { fresh: true, ...options }),
    simulateWebhook: (payload) => {
      const isFormData = payload instanceof FormData;
      return request('/payments/ewallet/simulate-webhook', {
        method: 'POST',
        body: isFormData
          ? payload
          : JSON.stringify(typeof payload === 'string' ? { reference: payload } : payload),
      });
    },
    getWalletInfo: () =>
      request('/customer/wallet'),
  },

  collectorCollections: {
    getAll: (params = {}, options = {}) => {
      const qs = new URLSearchParams(cleanParams(params)).toString();
      return request(`/collector/collections${qs ? `?${qs}` : ''}`, options);
    },
    getInstallmentAccounts: (params = {}, options = {}) => {
      const qs = new URLSearchParams(cleanParams(params)).toString();
      return request(`/collector/installment-accounts${qs ? `?${qs}` : ''}`, options);
    },
    customerPay: (data) =>
      request('/collector/customer-pay', {
        method: 'POST',
        body: data instanceof FormData ? data : JSON.stringify(data),
      }),
    collect: (id, data) =>
      request(`/collector/collections/${id}/collect`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },

  cashierPayments: {
    getAll: (params = {}, options = {}) => {
      const qs = new URLSearchParams(cleanParams(params)).toString();
      return request(`/cashier/walk-in-payments${qs ? `?${qs}` : ''}`, options);
    },
    confirm: (id, data) =>
      request(`/cashier/walk-in-payments/${id}/confirm`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },

  // ─── Employees ───
  employees: {
    getAll: (params = {}, options = {}) => {
      const qs = new URLSearchParams(cleanParams(params)).toString();
      return request(`/employees${qs ? `?${qs}` : ''}`, options);
    },
    getMe: (options = {}) => request('/employee/me', options),
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
    getById: (id, options = {}) => request(`/employees/${id}`, options),
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
    getQr: (id, options = {}) => request(`/employees/${id}/qr`, options),
    generateQr: (id) =>
      request(`/employees/${id}/qr/generate`, {
        method: 'POST',
      }),
    updateMyPin: (data) =>
      request('/employee/me/pin', {
        method: 'PUT',
        body: JSON.stringify(data),
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
    deleteQr: (id) =>
      request(`/employees/${id}/qr`, {
        method: 'DELETE',
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
    getFinancials: (id, options = {}) => request(`/employees/${id}/financials`, options),
    addAllowance: (id, data) => request(`/employees/${id}/allowances`, { method: 'POST', body: JSON.stringify(data) }),
    deleteAllowance: (itemId) => request(`/employees/allowances/${itemId}`, { method: 'DELETE' }),
    addDeduction: (id, data) => request(`/employees/${id}/deductions`, { method: 'POST', body: JSON.stringify(data) }),
    deleteDeduction: (itemId) => request(`/employees/deductions/${itemId}`, { method: 'DELETE' }),
    addLoan: (id, data) => request(`/employees/${id}/loans`, { method: 'POST', body: JSON.stringify(data) }),
    deleteLoan: (itemId) => request(`/employees/loans/${itemId}`, { method: 'DELETE' }),

    getMeAttendance: (options = {}) => request('/employee/me/attendance', options),
  },

  // ─── Attendance ───
  attendance: {
    getAll: (params = {}, options = {}) => {
      const qs = new URLSearchParams(cleanParams(params)).toString();
      return request(`/attendance${qs ? `?${qs}` : ''}`, options);
    },
    getDaily: async (params = {}, options = {}) => {
      const qs = new URLSearchParams(cleanParams(params)).toString();
      const sumQs = new URLSearchParams(cleanParams({
        date: params.date,
        date_from: params.date_from,
        date_to: params.date_to,
        branch: params.branch,
      })).toString();
      const [attData, summaryData] = await Promise.all([
        request(`/attendance${qs ? `?${qs}` : ''}`, options),
        request(`/attendance/summary${sumQs ? `?${sumQs}` : ''}`, options).catch(() => null),
      ]);
      return {
        records: attData?.attendance || attData?.records || [],
        attendance: attData?.attendance || attData?.records || [],
        total: attData?.total || 0,
        schedule: attData?.schedule || null,
        summary: summaryData?.summary || summaryData || null,
        stats: summaryData || null,
      };
    },
    getSchedule: (options = {}) => request('/attendance/schedule', options),
    getSummary: (params = {}, options = {}) => {
      const qs = new URLSearchParams(cleanParams(params)).toString();
      return request(`/attendance/summary${qs ? `?${qs}` : ''}`, options);
    },
    getPeriodMetrics: (params = {}, options = {}) => {
      const qs = new URLSearchParams(cleanParams(params)).toString();
      return request(`/attendance/period-metrics${qs ? `?${qs}` : ''}`, options);
    },
    simulatePeriod: (data = {}) =>
      request('/attendance/simulate-period', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    verifyQr: (data) =>
      request('/attendance/verify-qr', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    scanImage: (formData) =>
      request('/attendance/scan-image', {
        method: 'POST',
        body: formData,
      }),
    verifyPin: (data) =>
      request('/attendance/verify-pin', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    checkVerification: (id, options = {}) => request(`/attendance/check-verification/${id}`, { fresh: true, ...options }),
    pendingVerifications: (options = {}) => request('/employee/me/pending-verifications', { fresh: true, ...options }),
    getMyFaceTemplate: (params) => {
      const qs = params && Object.keys(cleanParams(params)).length
        ? `?${new URLSearchParams(cleanParams(params)).toString()}`
        : '';
      return request(`/employee/me/face-template${qs}`);
    },
    updateMyPin: (data) =>
      request('/employee/me/pin', {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    approveVerification: (data) =>
      request('/employee/me/verify-attendance-pin', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    rejectVerification: (data) =>
      request('/employee/me/cancel-attendance-verification', {
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
    getMePayroll: (params = {}, options = {}) => {
      const qs = new URLSearchParams(cleanParams(params)).toString();
      return request(`/employee/me/payroll${qs ? `?${qs}` : ''}`, options);
    },
    getMePayslip: (id, options = {}) => request(`/employee/me/payslip/${id}`, options),
    getAll: (params = {}, options = {}) => {
      const qs = new URLSearchParams(cleanParams(params)).toString();
      return request(`/payroll${qs ? `?${qs}` : ''}`, options);
    },
    getPayslip: (id, options = {}) => request(`/payroll/${id}/payslip`, options),
    getDailyMatrix: (employeeId, params = {}, options = {}) => {
      const qs = new URLSearchParams(cleanParams(params)).toString();
      return request(`/payroll/daily-matrix/${employeeId}${qs ? `?${qs}` : ''}`, options);
    },
    getEligibleEmployees: (params = {}, options = {}) => {
      const qs = new URLSearchParams(cleanParams(params)).toString();
      return request(`/payroll/eligible-employees${qs ? `?${qs}` : ''}`, options);
    },
    calculatePreview: (data) =>
      request('/payroll/calculate-preview', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    calculateAndApprove: (data) =>
      request('/payroll/calculate-and-approve', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    approveContributions: (data) =>
      request('/payroll/approve-contributions', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    generate: (userId, periodId, options = {}) =>
      request('/payroll/generate', {
        method: 'POST',
        body: JSON.stringify({
          user_id: userId,
          period_id: periodId,
          ...(typeof options === 'object' ? options : {}),
        }),
      }),
    generate13thMonth: (userId, options = {}) =>
      request('/payroll/generate-13th-month', {
        method: 'POST',
        body: JSON.stringify({
          user_id: userId,
          ...(typeof options === 'object' ? options : {}),
        }),
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
    getPeriods: (options = {}) => request('/payroll-periods', options),
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

  // ─── Payslips (Table CRUD) ───
  payslips: {
    getAll: (params = {}, options = {}) => {
      const qs = new URLSearchParams(cleanParams(params)).toString();
      return request(`/payslips${qs ? `?${qs}` : ''}`, options);
    },
    getById: (id, options = {}) => request(`/payslips/${id}`, options),
    create: (data) =>
      request('/payslips', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id, data) =>
      request(`/payslips/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (id) =>
      request(`/payslips/${id}`, {
        method: 'DELETE',
      }),
  },

  // ─── Statements (Table CRUD) ───
  statements: {
    getAll: (params = {}, options = {}) => {
      const qs = new URLSearchParams(cleanParams(params)).toString();
      return request(`/statements${qs ? `?${qs}` : ''}`, options);
    },
    getById: (id, options = {}) => request(`/statements/${id}`, options),
    create: (data) =>
      request('/statements', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id, data) =>
      request(`/statements/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (id) =>
      request(`/statements/${id}`, {
        method: 'DELETE',
      }),
  },

  // ─── Reports ───
  reports: {
    getEmployees: (params = {}, options = {}) => {
      const qs = new URLSearchParams(cleanParams(params)).toString();
      return request(`/reports/employees${qs ? `?${qs}` : ''}`, options);
    },
    getSales: (params = {}, options = {}) => {
      const qs = new URLSearchParams(cleanParams(params)).toString();
      return request(`/reports/sales${qs ? `?${qs}` : ''}`, options);
    },
    getInventory: (params = {}, options = {}) => {
      const qs = new URLSearchParams(cleanParams(params)).toString();
      return request(`/reports/inventory${qs ? `?${qs}` : ''}`, options);
    },
    getInstallments: (params = {}, options = {}) => {
      const qs = new URLSearchParams(cleanParams(params)).toString();
      return request(`/reports/installments${qs ? `?${qs}` : ''}`, options);
    },
    getPayroll: (params = {}, options = {}) => {
      const qs = new URLSearchParams(cleanParams(params)).toString();
      return request(`/reports/payroll${qs ? `?${qs}` : ''}`, options);
    },
    getAttendance: (params = {}, options = {}) => {
      const qs = new URLSearchParams(cleanParams(params)).toString();
      return request(`/reports/attendance${qs ? `?${qs}` : ''}`, options);
    },
  },

  // ─── System & Admin ───
  system: {
    getUsers: (options = {}) => request('/users', options),
    getUser: (id, options = {}) => request(`/users/${id}`, options),
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
    getSystemStats: (options = {}) => request('/system-stats', options),
    getLogs: (params = {}, options = {}) => {
      const qs = new URLSearchParams(cleanParams(params)).toString();
      return request(`/system-logs${qs ? `?${qs}` : ''}`, options);
    },
    clearLogs: () => request('/system-logs/clear', { method: 'DELETE' }),
    getBackups: (options = {}) => request('/backups', options),
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
    getNotifications: (params = {}, options = {}) => {
      const qs = new URLSearchParams(cleanParams(params)).toString();
      return request(`/notifications${qs ? `?${qs}` : ''}`, options);
    },
    getSettings: (options = {}) => request('/settings', options),
    getStorage: (options = {}) => {
      const qs = options?.refresh ? '?refresh=1' : '';
      return request(`/system/storage${qs}`, options);
    },
    cleanStorage: (action = 'cache') =>
      request('/system/storage/clean', {
        method: 'POST',
        body: JSON.stringify({ action }),
      }),
    deleteStorageFile: (relativePath) =>
      request('/system/storage/delete-file', {
        method: 'POST',
        body: JSON.stringify({ relative_path: relativePath }),
      }),
    deleteStorageFiles: (relativePaths) =>
      request('/system/storage/delete-file', {
        method: 'POST',
        body: JSON.stringify({ relative_paths: relativePaths }),
      }),
    getPublicSettings: (options = {}) => request('/public/settings', options),
    getPublicBootstrap: (options = {}) => request('/public/bootstrap', options),
    saveSettings: (data) => {
      const isFormData = data instanceof FormData;
      return request('/settings', {
        method: 'POST',
        body: isFormData ? data : JSON.stringify(data),
      });
    },
    getQrMonitoring: (options = {}) => request('/admin/qr-monitoring', options),
    search: (query, options = {}) => request(`/search?q=${encodeURIComponent(query)}`, options),
  },

  // ─── Notifications ───
  notifications: {
    getAll: (params = {}, options = {}) => {
      const qs = new URLSearchParams(cleanParams(params)).toString();
      return request(`/notifications${qs ? `?${qs}` : ''}`, options);
    },
    getLatest: (params = {}, options = {}) => {
      const qs = new URLSearchParams(cleanParams(params)).toString();
      return request(`/notifications/latest${qs ? `?${qs}` : ''}`, { fresh: true, ...options });
    },
    getUnreadCount: (options = {}) => request('/notifications/unread-count', { fresh: true, ...options }),
    getById: (id, options = {}) => request(`/notifications/${id}`, options),
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
    getMy: (options = {}) => request('/qr-requests/my', options),
    getAll: (params = {}, options = {}) => {
      const qs = new URLSearchParams(cleanParams(params)).toString();
      return request(`/admin/qr-requests${qs ? `?${qs}` : ''}`, options);
    },
    getById: (id, options = {}) => request(`/admin/qr-requests/${id}`, options),
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
    delete: (id) =>
      request(`/admin/qr-requests/${id}`, {
        method: 'DELETE',
      }),
  },

  // ─── Customer App ───
  customerApp: {
    getDashboard: (options = {}) => request('/customer/dashboard', options),
    getInstallments: (options = {}) => request('/customer/installments', options),
    getStatements: (options = {}) => request('/customer/statements', options),
    requestProduct: (data) => request('/customer/product-requests', { method: 'POST', body: data }),
    requestInstallment: (data = {}) => request('/customer/request-installment', { method: 'POST', body: JSON.stringify(data) }),
  },

  // ─── Support Messages ───
  supportMessages: {
    getAll: (options = {}) => request('/support-messages', options),
    create: (data) => request('/support-messages', { method: 'POST', body: JSON.stringify(data) }),
    createPublic: (data) => request('/public/support-messages', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => request(`/support-messages/${id}`, { method: 'PUT', body: JSON.stringify(typeof data === 'string' ? { status: data } : data) }),
    delete: (id) => request(`/support-messages/${id}`, { method: 'DELETE' }),
  },

  // ─── Carousel Images ───
  carouselImages: {
    getAll: (options = {}) => request('/carousel-images', options),
    getActive: (options = {}) => request('/carousel-images/active', options),
    create: (data) => {
      return request('/carousel-images', { method: 'POST', body: data }); // FormData
    },
    update: (id, data) => {
      data.append('_method', 'PUT'); // For FormData with PUT
      return request(`/carousel-images/${id}`, { method: 'POST', body: data });
    },
    delete: (id) => request(`/carousel-images/${id}`, { method: 'DELETE' }),
  },

  // ─── Employee Excuse & Leave Letters ───
  employeeLetters: {
    getAll: (params = {}, options = {}) => {
      const qs = new URLSearchParams(cleanParams(params)).toString();
      return request(`/employee-letters${qs ? `?${qs}` : ''}`, options);
    },
    getSummary: (options = {}) => request('/employee-letters/summary', options),
    getById: (id, options = {}) => request(`/employee-letters/${id}`, options),
    create: (data) => {
      const isFormData = data instanceof FormData;
      return request('/employee-letters', {
        method: 'POST',
        body: isFormData ? data : JSON.stringify(data),
      });
    },
    update: (id, data) => {
      return request(`/employee-letters/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    },
    archive: (id) => request(`/employee-letters/${id}/archive`, { method: 'POST' }),
    unarchive: (id) => request(`/employee-letters/${id}/unarchive`, { method: 'POST' }),
    delete: (id) => request(`/employee-letters/${id}`, { method: 'DELETE' }),
  },

  search: (query, options = {}) => request(`/search?q=${encodeURIComponent(query)}`, options),
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