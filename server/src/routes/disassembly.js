const express = require('express')
const router = express.Router()
const prisma = require('../lib/prisma')

// GET /api/disassembly — list all disassembly records
router.get('/', async (req, res) => {
  try {
    const records = await prisma.disassembly.findMany({
      orderBy: { created_at: 'desc' },
      include: {
        lines: { include: { part: { select: { id: true, code: true, name: true, unit: true } } } }
      }
    })
    res.json(records)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/disassembly/:id
router.get('/:id', async (req, res) => {
  try {
    const record = await prisma.disassembly.findUnique({
      where: { id: Number(req.params.id) },
      include: {
        lines: { include: { part: { select: { id: true, code: true, name: true, unit: true } } } }
      }
    })
    if (!record) return res.status(404).json({ error: 'Not found' })
    res.json(record)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/disassembly — create and apply stock adjustments
// Body: { reference, notes, lines: [{part_id, quantity, location}] }
router.post('/', async (req, res) => {
  const { reference, notes, lines } = req.body
  if (!reference || !reference.trim()) return res.status(400).json({ error: 'Referencia requerida' })
  if (!Array.isArray(lines) || lines.length === 0) return res.status(400).json({ error: 'Sin líneas' })

  for (const l of lines) {
    if (!l.part_id || !l.quantity || l.quantity <= 0 || !l.location?.trim()) {
      return res.status(400).json({ error: 'Cada línea debe tener pieza, cantidad > 0 y ubicación' })
    }
  }

  try {
    const record = await prisma.$transaction(async (tx) => {
      const disassembly = await tx.disassembly.create({
        data: {
          reference: reference.trim(),
          notes: notes?.trim() || null,
          lines: {
            create: lines.map(l => ({
              part_id: Number(l.part_id),
              quantity: Number(l.quantity),
              location: l.location.trim(),
            }))
          }
        },
        include: { lines: true }
      })

      for (const l of lines) {
        const partId = Number(l.part_id)
        const qty = Number(l.quantity)
        const location = l.location.trim()
        const lotNumber = reference.trim()

        // Upsert Lot (one per part per reference)
        const lot = await tx.lot.upsert({
          where: { part_id_lot_number: { part_id: partId, lot_number: lotNumber } },
          update: {},
          create: { part_id: partId, lot_number: lotNumber }
        })

        // Upsert LotLocation
        await tx.lotLocation.upsert({
          where: { lot_id_location: { lot_id: lot.id, location } },
          update: { stock: { increment: qty } },
          create: { lot_id: lot.id, location, stock: qty }
        })

        // Upsert PartLocation
        await tx.partLocation.upsert({
          where: { part_id_location: { part_id: partId, location } },
          update: { stock: { increment: qty } },
          create: { part_id: partId, location, stock: qty }
        })

        // Update Part.stock_current
        await tx.part.update({
          where: { id: partId },
          data: { stock_current: { increment: qty } }
        })

        // Stock movement
        await tx.stockMovement.create({
          data: {
            part_id: partId,
            type: 'IN',
            quantity: qty,
            reference_type: 'DISASSEMBLY',
            reference_id: disassembly.id,
            notes: `Desmontaje: ${lotNumber} → ${location}`,
          }
        })
      }

      return disassembly
    })

    res.json(record)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
