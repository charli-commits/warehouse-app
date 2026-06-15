const https = require('https')
const http = require('http')

const ODOO_URL      = process.env.ODOO_URL || ''
const ODOO_DB       = process.env.ODOO_DB || ''
const ODOO_USER     = process.env.ODOO_USER || ''
const ODOO_PASSWORD = process.env.ODOO_PASSWORD || ''

let _uid = null

// ── JSON-RPC transport (same endpoint as odoo-purchasing: /jsonrpc) ───────────

function rpc(service, method, args) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      jsonrpc: '2.0',
      method: 'call',
      id: 1,
      params: { service, method, args },
    })
    const url = new URL('/jsonrpc', ODOO_URL)
    const isHttps = url.protocol === 'https:'
    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }
    const lib = isHttps ? https : http
    const req = lib.request(options, (res) => {
      let data = ''
      res.on('data', chunk => (data += chunk))
      res.on('end', () => {
        try {
          const json = JSON.parse(data)
          if (json.error) {
            const msg = json.error?.data?.message || json.error?.message || 'RPC error'
            return reject(new Error(msg))
          }
          resolve(json.result)
        } catch (e) {
          reject(e)
        }
      })
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

async function getUid() {
  if (_uid) return _uid
  const uid = await rpc('common', 'login', [ODOO_DB, ODOO_USER, ODOO_PASSWORD])
  if (!uid) throw new Error('Credenciales de Odoo inválidas')
  _uid = uid
  return _uid
}

async function odoo(model, method, domain = [], fields = [], opts = {}) {
  const uid = await getUid()
  const kwargs = { fields, ...opts }
  return rpc('object', 'execute_kw', [
    ODOO_DB, uid, ODOO_PASSWORD,
    model, method,
    [domain],
    kwargs,
  ])
}

// ── BOM / Pack filtering (same logic as odoo-purchasing) ──────────────────────

const BUNDLE_KEYWORDS = ['PACK', 'KIT', 'SET', 'BUNDLE', 'COMBO']

async function fetchBomParentIds(productIds) {
  // Exclude products that are true bundle-kits (phantom BoM + bundle keyword in name).
  // Keeps phantom BoMs used only for shipping boxes (no bundle keyword).
  try {
    const variants = await odoo(
      'product.product', 'search_read',
      [['id', 'in', productIds]],
      ['id', 'product_tmpl_id'],
      { limit: productIds.length + 1 }
    )
    const tmplToPid = {}
    for (const r of variants) {
      if (r.product_tmpl_id) tmplToPid[r.product_tmpl_id[0]] = r.id
    }
    const tmplIds = Object.keys(tmplToPid).map(Number)
    if (!tmplIds.length) return new Set()

    const phantomBoms = await odoo(
      'mrp.bom', 'search_read',
      [['product_tmpl_id', 'in', tmplIds], ['type', '=', 'phantom']],
      ['product_tmpl_id'],
      { limit: tmplIds.length + 1 }
    )
    if (!phantomBoms.length) return new Set()

    const phantomTmplIds = phantomBoms.map(b => b.product_tmpl_id[0])
    const tmplNames = await odoo(
      'product.template', 'search_read',
      [['id', 'in', phantomTmplIds]],
      ['id', 'name'],
      { limit: phantomTmplIds.length + 1 }
    )
    const nameMap = {}
    for (const t of tmplNames) nameMap[t.id] = (t.name || '').toUpperCase()

    const kitTmplIds = phantomTmplIds.filter(tid =>
      BUNDLE_KEYWORDS.some(kw => (nameMap[tid] || '').includes(kw))
    )
    return new Set(kitTmplIds.map(t => tmplToPid[t]).filter(Boolean))
  } catch {
    return new Set()
  }
}

async function fetchBomComponentIds(productIds) {
  // Exclude components of non-separable BoMs.
  // Keeps components of PACK/DISC/SET parents (individually purchasable).
  // Keeps products that are themselves BoM parents.
  try {
    const allLines = await odoo(
      'mrp.bom.line', 'search_read',
      [['product_id', 'in', productIds]],
      ['product_id', 'bom_id'],
      { limit: productIds.length * 5 }
    )
    if (!allLines.length) return new Set()

    const allBomIds = [...new Set(allLines.map(l => l.bom_id[0]).filter(Boolean))]

    const separableBoms = await odoo(
      'mrp.bom', 'search_read',
      [
        ['id', 'in', allBomIds],
        '|', '|',
        ['product_tmpl_id.name', 'ilike', 'PACK'],
        ['product_tmpl_id.name', 'ilike', 'DISC'],
        ['product_tmpl_id.name', 'ilike', 'SET'],
      ],
      ['id'],
      { limit: allBomIds.length + 1 }
    )
    const separableBomIds = new Set(separableBoms.map(b => b.id))

    let candidates = new Set(
      allLines
        .filter(l => l.product_id && !separableBomIds.has(l.bom_id[0]))
        .map(l => l.product_id[0])
    )
    if (!candidates.size) return new Set()

    // Never exclude a product that is itself a BoM parent
    const candidateArr = [...candidates]
    const tmplRows = await odoo(
      'product.product', 'search_read',
      [['id', 'in', candidateArr]],
      ['id', 'product_tmpl_id'],
      { limit: candidateArr.length + 1 }
    )
    const tmplMap = {}
    for (const r of tmplRows) {
      if (r.product_tmpl_id) tmplMap[r.id] = r.product_tmpl_id[0]
    }
    const tmplValues = [...new Set(Object.values(tmplMap))]
    const parentBoms = await odoo(
      'mrp.bom', 'search_read',
      [['product_tmpl_id', 'in', tmplValues]],
      ['product_tmpl_id'],
      { limit: tmplValues.length + 1 }
    )
    const bomParentTmplIds = new Set(parentBoms.map(b => b.product_tmpl_id[0]))

    candidates = new Set(
      candidateArr.filter(pid => !bomParentTmplIds.has(tmplMap[pid]))
    )
    return candidates
  } catch {
    return new Set()
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

const ALLOWED_BRANDS = ['Titanium Strength', 'Force USA', 'Waterrower']

async function getProducts() {
  // Resolve brand IDs for the allowed brands
  const brands = await odoo(
    'product.brand', 'search_read',
    [['name', 'in', ALLOWED_BRANDS]],
    ['id', 'name'],
    { limit: 10 }
  )
  const brandIds = brands.map(b => b.id)

  const products = await odoo(
    'product.product', 'search_read',
    [
      ['active', '=', true],
      ['detailed_type', 'in', ['product', 'consu']],
      ['product_brand_id', 'in', brandIds],
    ],
    ['id', 'name', 'default_code', 'categ_id', 'uom_id', 'standard_price', 'detailed_type', 'product_tmpl_id', 'product_brand_id'],
    { limit: 5000 }
  )

  const productIds = products.map(p => p.id)

  const [bomComponents, bomParents] = await Promise.all([
    fetchBomComponentIds(productIds),
    fetchBomParentIds(productIds),
  ])

  const excluded = new Set([...bomComponents, ...bomParents])
  return products.filter(p => !excluded.has(p.id))
}

async function getPartners() {
  // Fetch customer partners and their delivery-address children
  const customers = await odoo(
    'res.partner', 'search_read',
    [['active', '=', true], ['customer_rank', '>', 0]],
    ['id', 'name', 'street', 'city', 'zip', 'country_id', 'email', 'phone', 'type', 'parent_id', 'child_ids'],
    { limit: 5000 }
  )
  // Also fetch delivery-address children of those customers
  const customerIds = customers.map(p => p.id)
  const deliveryAddresses = await odoo(
    'res.partner', 'search_read',
    [['active', '=', true], ['type', '=', 'delivery'], ['parent_id', 'in', customerIds]],
    ['id', 'name', 'street', 'city', 'zip', 'country_id', 'email', 'phone', 'type', 'parent_id'],
    { limit: 5000 }
  )
  // Merge: delivery addresses override their parent's address for display
  const deliveryByParent = {}
  for (const d of deliveryAddresses) {
    const pid = d.parent_id?.[0]
    if (pid) deliveryByParent[pid] = d
  }
  return customers.map(p => {
    const delivery = deliveryByParent[p.id]
    if (delivery) {
      // Return the partner with the delivery address fields merged in
      return {
        ...p,
        delivery_address_id: delivery.id,
        street: delivery.street || p.street,
        city: delivery.city || p.city,
        zip: delivery.zip || p.zip,
        country_id: delivery.country_id || p.country_id,
      }
    }
    return p
  })
}

async function getOdooSuppliers() {
  // Get only suppliers that appear in supplierinfo for Titanium Strength / Force USA products
  const brands = await odoo(
    'product.brand', 'search_read',
    [['name', 'in', ALLOWED_BRANDS]],
    ['id'],
    { limit: 10 }
  )
  const brandIds = brands.map(b => b.id)

  // Get product templates for those brands
  const templates = await odoo(
    'product.template', 'search_read',
    [['product_brand_id', 'in', brandIds], ['active', '=', true]],
    ['id'],
    { limit: 5000 }
  )
  const tmplIds = templates.map(t => t.id)
  if (!tmplIds.length) return []

  // Get unique partner IDs from supplierinfo for those templates
  const supplierInfos = await odoo(
    'product.supplierinfo', 'search_read',
    [['product_tmpl_id', 'in', tmplIds]],
    ['partner_id'],
    { limit: 5000 }
  )
  const partnerIds = [...new Set(supplierInfos.map(s => s.partner_id?.[0]).filter(Boolean))]
  if (!partnerIds.length) return []

  return odoo(
    'res.partner', 'search_read',
    [['id', 'in', partnerIds], ['active', '=', true]],
    ['id', 'name', 'email', 'phone'],
    { limit: 500 }
  )
}

// Read-only lookup: resolve a sale order / quotation reference (e.g. GCSQ0118997, GCSO0109531)
// to the customer(s) that placed it. Used so the user can find a partner by "documento de origen".
async function findPartnersByOrderRef(query) {
  if (!query || query.length < 3) return []
  const orders = await odoo(
    'sale.order', 'search_read',
    [['name', 'ilike', query]],
    ['id', 'name', 'partner_id', 'partner_shipping_id'],
    { limit: 20 }
  )
  // Use partner_shipping_id (delivery address) falling back to partner_id (billing)
  const shippingIds = [...new Set(
    orders.map(o => (o.partner_shipping_id?.[0] || o.partner_id?.[0])).filter(Boolean)
  )]
  if (!shippingIds.length) return []
  const partners = await odoo(
    'res.partner', 'search_read',
    [['id', 'in', shippingIds]],
    ['id', 'name', 'street', 'city', 'zip', 'country_id', 'email', 'phone'],
    { limit: 20 }
  )
  // attach matched order refs for display
  const ordersByPartner = {}
  for (const o of orders) {
    const pid = o.partner_shipping_id?.[0] || o.partner_id?.[0]
    if (!pid) continue
    ;(ordersByPartner[pid] = ordersByPartner[pid] || []).push(o.name)
  }
  return partners.map(p => ({ ...p, matched_orders: ordersByPartner[p.id] || [] }))
}

function resetAuth() { _uid = null }

module.exports = { authenticate: getUid, getProducts, getPartners, getOdooSuppliers, findPartnersByOrderRef, resetAuth }
