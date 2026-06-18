const BASE = '/api'

function getToken() {
  try { return JSON.parse(localStorage.getItem('wh_user'))?.token } catch { return null }
}

async function request(path, options = {}) {
  const token = getToken()
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  if (res.status === 401) {
    localStorage.removeItem('wh_user')
    window.location.href = '/'
    return
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}

export const api = {
  // Parts
  getParts: (params = {}) => request('/parts?' + new URLSearchParams(params)),
  getPartCategories: () => request('/parts/categories'),
  getPartManufacturers: () => request('/parts/manufacturers'),
  getPartStats: () => request('/parts/stats'),
  getPart: (id) => request(`/parts/${id}`),
  getPartPurchases: (id) => request(`/parts/${id}/purchases`),
  getPartMovements: (id, page = 1) => request(`/parts/${id}/movements?page=${page}&limit=50`),
  getPartLots: (id) => request(`/parts/${id}/lots`),
  getPartFifo: (id) => request(`/parts/${id}/fifo`),
  createPart: (data) => request('/parts', { method: 'POST', body: data }),
  updatePart: (id, data) => request(`/parts/${id}`, { method: 'PUT', body: data }),
  deletePart: (id) => request(`/parts/${id}`, { method: 'DELETE' }),
  adjustStock: (id, quantity, notes, user_name) => request(`/parts/${id}/adjust`, { method: 'POST', body: { quantity, notes, user_name } }),
  getPartLocations: () => request('/parts/locations/all'),
  addPartLocation: (id, location, stock) => request(`/parts/${id}/locations`, { method: 'POST', body: { location, stock } }),
  transferStock: (id, from_location, to_location, quantity, user_name) => request(`/parts/${id}/transfer`, { method: 'POST', body: { from_location, to_location, quantity, user_name } }),
  scrapStock: (id, location, quantity, reason, user_name) => request(`/parts/${id}/scrap`, { method: 'POST', body: { location, quantity, reason, user_name } }),
  deletePartLocation: (id, location) => request(`/parts/${id}/locations/${encodeURIComponent(location)}`, { method: 'DELETE' }),

  // Suppliers
  getSuppliers: () => request('/suppliers'),
  getSupplier: (id) => request(`/suppliers/${id}`),
  createSupplier: (data) => request('/suppliers', { method: 'POST', body: data }),
  updateSupplier: (id, data) => request(`/suppliers/${id}`, { method: 'PUT', body: data }),
  deleteSupplier: (id) => request(`/suppliers/${id}`, { method: 'DELETE' }),

  // Purchases
  getPurchases: () => request('/purchases'),
  getPurchase: (id) => request(`/purchases/${id}`),
  createPurchase: (data) => request('/purchases', { method: 'POST', body: data }),
  updatePurchase: (id, data) => request(`/purchases/${id}`, { method: 'PUT', body: data }),
  deletePurchase: (id) => request(`/purchases/${id}`, { method: 'DELETE' }),
  receivePurchase: (id, data) => request(`/purchases/${id}/receive`, { method: 'POST', body: data }),
  validatePurchase: (id, data) => request(`/purchases/${id}/validate`, { method: 'POST', body: data }),
  locatePurchaseLine: (id, data) => request(`/purchases/${id}/locate`, { method: 'POST', body: data }),
  getPurchasePdfUrl: (id) => `${BASE}/purchases/${id}/pdf`,

  // Deliveries
  getDeliveries: (params) => request('/deliveries' + (params ? '?' + new URLSearchParams(params).toString() : '')),
  getDelivery: (id) => request(`/deliveries/${id}`),
  createDelivery: (data) => request('/deliveries', { method: 'POST', body: data }),
  updateDelivery: (id, data) => request(`/deliveries/${id}`, { method: 'PUT', body: data }),
  deleteDelivery: (id, force = false) => request(`/deliveries/${id}${force ? '?force=1' : ''}`, { method: 'DELETE' }),
  confirmDelivery: (id) => request(`/deliveries/${id}/confirm`, { method: 'POST' }),
  shipDelivery: (id, data) => request(`/deliveries/${id}/ship`, { method: 'POST', body: data }),
  updateDeliveryTracking: (id, tracking) => request(`/deliveries/${id}/tracking`, { method: 'PATCH', body: { gls_tracking: tracking } }),
  uploadDeliveryLabel: async (id, file) => {
    const res = await fetch(`${BASE}/deliveries/${id}/label`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/pdf' },
      body: file
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
    return data
  },
  deliverDelivery: (id) => request(`/deliveries/${id}/deliver`, { method: 'POST' }),
  cierreJornada: () => request('/deliveries/cierre-jornada', { method: 'POST' }),
  resumenCierre: () => `${BASE}/deliveries/resumen-cierre`,
  startPicking: (id) => request(`/deliveries/${id}/start-picking`, { method: 'POST' }),
  verifyLine: (id, data) => request(`/deliveries/${id}/verify-line`, { method: 'POST', body: data }),
  closePicking: (id) => request(`/deliveries/${id}/close-picking`, { method: 'POST' }),

  // Auth
  login: (name, pin) => request('/auth/login', { method: 'POST', body: { name, pin } }),
  getUsers: () => request('/auth/users'),
  createUser: (data) => request('/auth/users', { method: 'POST', body: data }),
  deleteUser: (id) => request(`/auth/users/${id}`, { method: 'DELETE' }),
  updateUserRole: (id, role) => request(`/auth/users/${id}`, { method: 'PATCH', body: { role } }),

  // Locations
  getLocations: () => request('/locations'),
  renameLocation: (from, to) => request('/locations/rename', { method: 'PUT', body: { from, to } }),
  deleteLocation: (name) => request(`/locations/${encodeURIComponent(name)}`, { method: 'DELETE' }),
  createLocation: (name) => request('/locations/predefined', { method: 'POST', body: { name } }),

  // Categories
  getCategories: () => request('/parts/categories'),
  renameCategory: (from, to) => request('/parts/categories/rename', { method: 'PUT', body: { from, to } }),
  deleteCategory: (name) => request(`/parts/categories/${encodeURIComponent(name)}`, { method: 'DELETE' }),
  createCategory: (name) => request('/parts/categories', { method: 'POST', body: { name } }),

  // Search
  globalSearch: (q) => request(`/search?q=${encodeURIComponent(q)}`),

  // Reposición
  getReposicion: () => request('/dashboard/reposicion'),

  // Audits
  getAudits: () => request('/audits'),
  getAudit: (id) => request(`/audits/${id}`),
  createAudit: (data) => request('/audits', { method: 'POST', body: data }),
  upsertAuditLine: (id, data) => request(`/audits/${id}/lines`, { method: 'POST', body: data }),
  deleteAuditLine: (id, lineId) => request(`/audits/${id}/lines/${lineId}`, { method: 'DELETE' }),
  closeAudit: (id) => request(`/audits/${id}/close`, { method: 'POST' }),
  exportAudit: (id) => `${BASE}/audits/${id}/export?format=csv`,

  // Disassembly
  getDisassemblies: () => request('/disassembly'),
  getDisassembly: (id) => request(`/disassembly/${id}`),
  createDisassembly: (data) => request('/disassembly', { method: 'POST', body: data }),

  // Odoo
  getOdooStatus: () => request('/odoo/status'),
  getDashboard: () => request('/dashboard'),
  getEfficiency: (days = 30) => request(`/dashboard/efficiency?days=${days}`),
  syncOdoo: () => request('/odoo/sync', { method: 'POST' }),
  getOdooProducts: () => request('/odoo/products'),
  getOdooPartners: () => request('/odoo/partners'),
  findOdooPartnersByOrder: (q) => request('/odoo/partners/by-order?q=' + encodeURIComponent(q)),
}
