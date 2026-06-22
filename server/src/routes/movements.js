const express = require('express')
const router = express.Router()
const prisma = require('../lib/prisma')

// GET /api/movements?page=1&limit=50&type=IN&search=...
router.get('/', async (req, res) => {
  const { type, search, page: pageStr, limit: limitStr } = req.query
  const page = Math.max(1, parseInt(pageStr) || 1)
  const limit = Math.min(200, Math.max(1, parseInt(limitStr) || 50))

  const where = {}
  if (type) where.type = type
  if (search) {
    where.part = {
      OR: [
        { code: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
      ]
    }
  }

  const [data, total] = await Promise.all([
    prisma.stockMovement.findMany({
      where,
      include: { part: { select: { id: true, code: true, name: true } } },
      orderBy: { created_at: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.stockMovement.count({ where }),
  ])

  res.json({ data, total, page, limit })
})

module.exports = router
