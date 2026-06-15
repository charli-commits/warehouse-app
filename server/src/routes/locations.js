const express = require('express')
const router = express.Router()
const prisma = require('../lib/prisma')

// GET /api/locations — all locations with parts and totals
router.get('/', async (req, res) => {
  const rows = await prisma.partLocation.findMany({
    include: {
      part: { select: { id: true, code: true, name: true, unit: true, stock_min: true } }
    },
    orderBy: { location: 'asc' }
  })

  // Group by location
  const map = {}
  for (const row of rows) {
    if (!map[row.location]) map[row.location] = { location: row.location, total_stock: 0, parts: [] }
    map[row.location].total_stock += row.stock
    map[row.location].parts.push({
      id: row.part.id,
      code: row.part.code,
      name: row.part.name,
      unit: row.part.unit,
      stock: row.stock,
      stock_min: row.part.stock_min
    })
  }

  res.json(Object.values(map))
})

module.exports = router
