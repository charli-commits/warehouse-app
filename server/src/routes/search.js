const express = require('express')
const router = express.Router()
const prisma = require('../lib/prisma')

// GET /api/search?q=...
router.get('/', async (req, res) => {
  const { q } = req.query
  if (!q || q.trim().length < 2) return res.json({ parts: [], purchases: [], deliveries: [] })

  const query = q.trim()

  const [parts, purchases, deliveries] = await Promise.all([
    prisma.part.findMany({
      where: {
        OR: [
          { code: { contains: query } },
          { name: { contains: query } },
          { description: { contains: query } },
        ]
      },
      select: { id: true, code: true, name: true, category: true, stock_current: true, unit: true },
      take: 8,
    }),
    prisma.purchaseOrder.findMany({
      where: {
        OR: [
          { reference: { contains: query } },
          { supplier: { name: { contains: query } } },
        ]
      },
      select: { id: true, reference: true, status: true, order_date: true, supplier: { select: { name: true } } },
      orderBy: { order_date: 'desc' },
      take: 5,
    }),
    prisma.deliveryNote.findMany({
      where: {
        OR: [
          { odoo_partner_name: { contains: query } },
          { client_ref: { contains: query } },
        ]
      },
      select: { id: true, odoo_partner_name: true, client_ref: true, status: true, created_at: true },
      orderBy: { created_at: 'desc' },
      take: 5,
    }),
  ])

  res.json({ parts, purchases, deliveries })
})

module.exports = router
