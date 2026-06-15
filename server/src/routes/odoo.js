const express = require('express')
const router = express.Router()
const prisma = require('../lib/prisma')
const { getProducts, getPartners, getOdooSuppliers, findPartnersByOrderRef } = require('../lib/odooClient')

router.post('/sync', async (req, res) => {
  try {
    const [products, partners, odooSuppliers] = await Promise.all([
      getProducts(),
      getPartners(),
      getOdooSuppliers(),
    ])

    const now = new Date()

    // Delete cached entries so removed/filtered items don't linger
    await prisma.$transaction([
      prisma.odooCache.deleteMany({ where: { type: 'PRODUCT' } }),
      prisma.odooCache.deleteMany({ where: { type: 'PARTNER' } }),
    ])

    // Batch insert cache in chunks to avoid SQLite variable limits
    const chunkSize = 200
    const allRows = [
      ...products.map(p => ({ type: 'PRODUCT', odoo_id: p.id, data: JSON.stringify(p), last_sync: now })),
      ...partners.map(p => ({ type: 'PARTNER', odoo_id: p.id, data: JSON.stringify(p), last_sync: now })),
    ]
    for (let i = 0; i < allRows.length; i += chunkSize) {
      await prisma.odooCache.createMany({ data: allRows.slice(i, i + chunkSize) })
    }

    // Replace Odoo-sourced suppliers (odoo_partner_id != null) with fresh data.
    // Manually created suppliers (odoo_partner_id = null) are never touched.
    const incomingIds = odooSuppliers.map(s => s.id)
    await prisma.supplier.deleteMany({
      where: {
        odoo_partner_id: { not: null },
        NOT: { odoo_partner_id: { in: incomingIds } },
      },
    })

    let suppliersUpserted = 0
    for (const s of odooSuppliers) {
      const name = (s.name || '').trim()
      if (!name) continue
      await prisma.supplier.upsert({
        where: { odoo_partner_id: s.id },
        update: { name, email: s.email || null, phone: s.phone || null },
        create: { name, email: s.email || null, phone: s.phone || null, odoo_partner_id: s.id },
      })
      suppliersUpserted++
    }

    res.json({
      ok: true,
      synced_products: products.length,
      synced_partners: partners.length,
      synced_suppliers: suppliersUpserted,
      synced_at: now.toISOString(),
    })
  } catch (err) {
    res.status(502).json({ ok: false, error: err.message })
  }
})

router.get('/products', async (req, res) => {
  const rows = await prisma.odooCache.findMany({ where: { type: 'PRODUCT' }, orderBy: { odoo_id: 'asc' } })
  res.json(rows.map(r => ({ ...JSON.parse(r.data), _last_sync: r.last_sync })))
})

router.get('/partners', async (req, res) => {
  const rows = await prisma.odooCache.findMany({ where: { type: 'PARTNER' }, orderBy: { odoo_id: 'asc' } })
  res.json(rows.map(r => ({ ...JSON.parse(r.data), _last_sync: r.last_sync })))
})

// GET /api/odoo/partners/by-order?q=GCSQ0118997 — read-only lookup of customer by sale order/quotation ref
router.get('/partners/by-order', async (req, res) => {
  try {
    const results = await findPartnersByOrderRef((req.query.q || '').trim())
    res.json(results)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/status', async (req, res) => {
  const latest = await prisma.odooCache.findFirst({ orderBy: { last_sync: 'desc' } })
  const productCount = await prisma.odooCache.count({ where: { type: 'PRODUCT' } })
  const partnerCount = await prisma.odooCache.count({ where: { type: 'PARTNER' } })
  res.json({
    last_sync: latest?.last_sync ?? null,
    cached_products: productCount,
    cached_partners: partnerCount
  })
})

module.exports = router
