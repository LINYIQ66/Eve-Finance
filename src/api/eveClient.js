/**
 * EVE API Client — self-contained replacement for @base44/sdk
 *
 * All API calls go to the same-origin /api/* endpoints (proxied to FastAPI on port 8001).
 * JWT token is stored in localStorage under 'eve_token' and auto-attached as
 * Authorization: Bearer <token>.
 */

const TOKEN_KEY = 'eve_token';

/* ---------- token helpers ---------- */

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

/* ---------- core fetch wrapper ---------- */

async function request(path, { method = 'GET', body, headers = {}, skipAuth = false } = {}) {
  const finalHeaders = { 'Content-Type': 'application/json', ...headers };

  if (!skipAuth) {
    const token = getToken();
    if (token) {
      finalHeaders['Authorization'] = `Bearer ${token}`;
    }
  }

  const opts = { method, headers: finalHeaders };
  if (body !== undefined && body !== null) {
    opts.body = JSON.stringify(body);
  }

  const res = await fetch(path, opts);

  // Handle 401 — clear stale token
  if (res.status === 401) {
    clearToken();
    const err = new Error('Unauthorized');
    err.status = 401;
    throw err;
  }

  // Try to parse JSON, fall back to text
  let data;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    data = await res.json();
  } else {
    data = await res.text();
  }

  if (!res.ok) {
    const err = new Error(
      (data && (data.detail || data.message)) || `Request failed: ${res.status}`
    );
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

/* convenience verbs */

const get = (path, opts) => request(path, { method: 'GET', ...opts });
const post = (path, body, opts) => request(path, { method: 'POST', body, ...opts });
const put = (path, body, opts) => request(path, { method: 'PUT', body, ...opts });
const patch = (path, body, opts) => request(path, { method: 'PATCH', body, ...opts });
const del = (path, opts) => request(path, { method: 'DELETE', ...opts });

/* ---------- auth namespace ---------- */

const auth = {
  /**
   * GET /api/auth/me — returns the current user object or throws on 401.
   */
  async me() {
    return get('/api/auth/me');
  },

  /**
   * POST /api/auth/login { email, password }
   * Stores token, returns { user, access_token }
   */
  async login(email, password) {
    const data = await post('/api/auth/login', { email, password }, { skipAuth: true });
    if (data.access_token) {
      setToken(data.access_token);
    }
    return data;
  },

  /**
   * POST /api/auth/register { email, password, full_name }
   * Stores token if the backend returns one, returns result.
   */
  async register(email, password, full_name) {
    const data = await post('/api/auth/register', { email, password, full_name }, { skipAuth: true });
    if (data.access_token) {
      setToken(data.access_token);
    }
    return data;
  },

  /**
   * Clear token and optionally redirect to /login.
   */
  logout(returnTo) {
    clearToken();
    if (returnTo) {
      const url = `/login?redirect=${encodeURIComponent(returnTo)}`;
      window.location.href = url;
    }
  },

  /**
   * Redirect to the login page with optional return URL.
   */
  redirectToLogin(returnTo) {
    const target = returnTo
      ? `/login?redirect=${encodeURIComponent(returnTo)}`
      : '/login';
    window.location.href = target;
  },
};

/* ---------- generic entity factory ---------- */

/**
 * Build a CRUD entity class that maps to /api/<resource>.
 *
 * The base44 entity API used static methods: Entity.list(), .filter(query),
 * .create(data), .update(id, data), .get(id), .delete(id).
 *
 * Some entities have custom endpoints — pass overrides in `opts`.
 */
function makeEntity(entityName, resourcePath, opts = {}) {
  const basePath = resourcePath || `/api/${entityName.toLowerCase()}s`;

  return {
    entityName,

    /**
     * GET /<basePath>  — returns an array.
     * sortAndLimit maps to query params: ?sort=-created_date&limit=100
     */
    async list(sort, limit) {
      const params = new URLSearchParams();
      if (sort) params.set('sort', sort);
      if (limit) params.set('limit', String(limit));
      const qs = params.toString();
      return get(`${basePath}${qs ? `?${qs}` : ''}`);
    },

    /**
     * GET /<basePath>?key=value&… — returns filtered array.
     */
    async filter(query = {}) {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null) {
          params.set(k, typeof v === 'string' ? v : JSON.stringify(v));
        }
      }
      const qs = params.toString();
      return get(`${basePath}${qs ? `?${qs}` : ''}`);
    },

    /**
     * GET /<basePath>/:id
     */
    async getById(id) {
      return get(`${basePath}/${id}`);
    },

    /**
     * POST /<basePath>
     */
    async create(data) {
      return post(basePath, data);
    },

    /**
     * PUT /<basePath>/:id
     */
    async update(id, data) {
      return put(`${basePath}/${id}`, data);
    },

    /**
     * DELETE /<basePath>/:id
     */
    async remove(id) {
      return del(`${basePath}/${id}`);
    },

    ...opts, // allow overrides / extra static methods
  };
}

/* ---------- entities ---------- */

// User has special endpoints
const User = {
  entityName: 'User',

  /** GET /api/auth/me */
  async me() {
    return auth.me();
  },

  /** PUT /api/user/wallet  — update the current user's data */
  async updateMyUserData(data) {
    return put('/api/user/wallet', data);
  },

  /** GET /api/users */
  async list(sort, limit) {
    const params = new URLSearchParams();
    if (sort) params.set('sort', sort);
    if (limit) params.set('limit', String(limit));
    const qs = params.toString();
    return get(`/api/users${qs ? `?${qs}` : ''}`);
  },

  /** GET /api/users?key=value */
  async filter(query = {}) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null) {
        params.set(k, typeof v === 'string' ? v : JSON.stringify(v));
      }
    }
    const qs = params.toString();
    return get(`/api/users${qs ? `?${qs}` : ''}`);
  },

  /** PUT /api/users/:id */
  async update(id, data) {
    return put(`/api/users/${id}`, data);
  },

  /** GET /api/users/:id */
  async getById(id) {
    return get(`/api/users/${id}`);
  },
};

const Transaction = makeEntity('Transaction', '/api/transactions');
const Loan = makeEntity('Loan', '/api/loans');
const Stake = makeEntity('Stake', '/api/stakes');
const Company = makeEntity('Company', '/api/companies');
const AuditLog = makeEntity('AuditLog', '/api/audit-logs');
const FundRequest = makeEntity('FundRequest', '/api/fund-requests');
const SystemSetting = makeEntity('SystemSetting', '/api/system-settings');
const PhysicalProduct = makeEntity('PhysicalProduct', '/api/physical-products');
const PhysicalRedemption = makeEntity('PhysicalRedemption', '/api/physical-redemptions');
const SupportTicket = makeEntity('SupportTicket', '/api/support-tickets');

/* ---------- edge-function proxies ---------- */

/**
 * These were Deno edge functions. They now proxy through the Python backend
 * at /api/functions/*.
 *
 * The backend reads the query params and calls the external API (CMC, Alpaca,
 * etc.) server-side, keeping secret keys off the client.
 */

const getStockPrices = (params = {}) =>
  get(`/api/functions/getStockPrices${buildQuery(params)}`);

const getAlpacaPrices = (params = {}) => {
  // params: { symbols: "AAPL,MSFT" }
  const qs = params.symbols ? `?symbols=${encodeURIComponent(params.symbols)}` : '';
  return get(`/api/functions/getAlpacaPrices${qs}`);
};

const getHKStockPrices = (params = {}) => {
  const qs = params.symbols ? `?symbols=${encodeURIComponent(params.symbols)}` : '';
  return get(`/api/functions/getHKStockPrices${qs}`);
};

const searchStocks = (params = {}) =>
  get(`/api/functions/searchStocks${buildQuery(params)}`);

const searchHKStocks = (params = {}) =>
  get(`/api/functions/searchHKStocks${buildQuery(params)}`);

const getMetalPrices = (_params = {}) =>
  get('/api/functions/getMetalPrices');

const getUserTransactions = (params = {}) =>
  get(`/api/user/transactions${buildQuery(params)}`);

const generateReport = (params = {}) =>
  get(`/api/functions/generateReport${buildQuery(params)}`);

const getDailyAgentName = (_params = {}) =>
  get('/api/functions/getDailyAgentName');

const unstakeAndClaim = (params = {}) =>
  post('/api/functions/unstakeAndClaim', params);

/* ---------- utils ---------- */

function buildQuery(params) {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null);
  if (entries.length === 0) return '';
  const sp = new URLSearchParams();
  for (const [k, v] of entries) {
    sp.set(k, typeof v === 'string' ? v : JSON.stringify(v));
  }
  return `?${sp.toString()}`;
}

/* ---------- export singleton ---------- */

export const eve = {
  auth,
  getToken,
  setToken,
  clearToken,
  request,
  get,
  post,
  put,
  patch,
  del,
};

export {
  // entities
  User,
  Transaction,
  Loan,
  Stake,
  Company,
  AuditLog,
  FundRequest,
  SystemSetting,
  PhysicalProduct,
  PhysicalRedemption,
  SupportTicket,
  // functions
  getStockPrices,
  getAlpacaPrices,
  getHKStockPrices,
  searchStocks,
  searchHKStocks,
  getMetalPrices,
  getUserTransactions,
  generateReport,
  getDailyAgentName,
  unstakeAndClaim,
  // backwards compat: some code imports { base44 }
  eve as base44,
};

export default eve;
