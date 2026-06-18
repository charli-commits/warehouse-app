const express = require('express')
const router = express.Router()
const prisma = require('../lib/prisma')

// GET /api/locations/all-names — union of used + predefined location names
router.get('/all-names', async (req, res) => {
  const used = await prisma.partLocation.findMany({ distinct: ['location'], select: { location: true } })
  const setting = await prisma.setting.findUnique({ where: { key: 'predefined_locations' } })
  const predefined = setting ? JSON.parse(setting.value) : []
  const all = [...new Set([...used.map(r => r.location), ...predefined])].sort()
  res.json(all)
})

// POST /api/locations/predefined — create a predefined location name
router.post('/predefined', async (req, res) => {
  const { name } = req.body
  if (!name?.trim()) return res.status(400).json({ error: 'name requerido' })
  const setting = await prisma.setting.findUnique({ where: { key: 'predefined_locations' } })
  const list = setting ? JSON.parse(setting.value) : []
  if (!list.includes(name.trim())) list.push(name.trim())
  await prisma.setting.upsert({
    where: { key: 'predefined_locations' },
    update: { value: JSON.stringify(list) },
    create: { key: 'predefined_locations', value: JSON.stringify(list) }
  })
  res.json({ ok: true })
})

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

async function getPredefined() {
  const s = await prisma.setting.findUnique({ where: { key: 'predefined_locations' } })
  return s ? JSON.parse(s.value) : []
}
async function setPredefined(list) {
  await prisma.setting.upsert({
    where: { key: 'predefined_locations' },
    update: { value: JSON.stringify(list) },
    create: { key: 'predefined_locations', value: JSON.stringify(list) }
  })
}

// PUT /api/locations/rename — { from, to }
router.put('/rename', async (req, res) => {
  const { from, to } = req.body
  if (!from || !to) return res.status(400).json({ error: 'from y to requeridos' })
  const result = await prisma.partLocation.updateMany({ where: { location: from }, data: { location: to.trim() } })
  const list = await getPredefined()
  const idx = list.indexOf(from)
  if (idx !== -1) { list[idx] = to.trim(); await setPredefined(list) }
  res.json({ updated: result.count })
})

// DELETE /api/locations/:name — removes all partLocation entries for that location
router.delete('/:name', async (req, res) => {
  const name = decodeURIComponent(req.params.name)
  const affected = await prisma.partLocation.findMany({ where: { location: name }, select: { part_id: true } })
  const partIds = [...new Set(affected.map(r => r.part_id))]
  const result = await prisma.partLocation.deleteMany({ where: { location: name } })
  for (const part_id of partIds) {
    const locs = await prisma.partLocation.findMany({ where: { part_id }, select: { stock: true } })
    const total = locs.reduce((s, l) => s + l.stock, 0)
    await prisma.part.update({ where: { id: part_id }, data: { stock_current: total } })
  }
  const list = await getPredefined()
  const filtered = list.filter(l => l !== name)
  if (filtered.length !== list.length) await setPredefined(filtered)
  res.json({ deleted: result.count })
})

module.exports = router
