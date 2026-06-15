const express = require('express')
const router = express.Router()
const prisma = require('../lib/prisma')

const lineInclude = {
  part: { select: { id: true, code: true, name: true, unit: true, category: true } }
}

// GET /api/audits
router.get('/', async (req, res) => {
  try {
    const audits = await prisma.audit.findMany({
      orderBy: { created_at: 'desc' },
      include: { _count: { select: { lines: true } } }
    })
    res.json(audits)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/audits — create new audit session
// Body: { name, notes, location_filter? }
// If location_filter provided, pre-loads all parts in that location
router.post('/', async (req, res) => {
  const { name, notes, location_filter } = req.body
  if (!name?.trim()) return res.status(400).json({ error: 'Nombre requerido' })
  try {
    const audit = await prisma.$transaction(async (tx) => {
      const created = await tx.audit.create({
        data: { name: name.trim(), notes: notes?.trim() || null }
      })
      // Pre-load lines from a location if specified
      if (location_filter) {
        const partLocs = await tx.partLocation.findMany({
          where: { location: location_filter },
          include: { part: true }
        })
        for (const pl of partLocs) {
          await tx.auditLine.create({
            data: {
              audit_id: created.id,
              part_id: pl.part_id,
              location: pl.location,
              system_stock: pl.stock,
            }
          })
        }
      }
      return tx.audit.findUnique({
        where: { id: created.id },
        include: { lines: { include: lineInclude } }
      })
    })
    res.json(audit)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/audits/:id
router.get('/:id', async (req, res) => {
  try {
    const audit = await prisma.audit.findUnique({
      where: { id: Number(req.params.id) },
      include: { lines: { include: lineInclude, orderBy: [{ location: 'asc' }, { part: { code: 'asc' } }] } }
    })
    if (!audit) return res.status(404).json({ error: 'Not found' })
    res.json(audit)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/audits/:id/lines — add or update a counted line
// Body: { part_id, location, counted_stock }
router.post('/:id/lines', async (req, res) => {
  const id = Number(req.params.id)
  const { part_id, location, counted_stock } = req.body
  if (!part_id || !location) return res.status(400).json({ error: 'part_id y location requeridos' })

  try {
    const audit = await prisma.audit.findUnique({ where: { id } })
    if (!audit) return res.status(404).json({ error: 'Auditoría no encontrada' })
    if (audit.status === 'CLOSED') return res.status(409).json({ error: 'La auditoría está cerrada' })

    // Get current system stock for this part+location
    const partLoc = await prisma.partLocation.findUnique({
      where: { part_id_location: { part_id: Number(part_id), location } }
    })
    const system_stock = partLoc?.stock ?? 0
    const counted = Number(counted_stock)
    const difference = counted - system_stock

    const line = await prisma.auditLine.upsert({
      where: { audit_id_part_id_location: { audit_id: id, part_id: Number(part_id), location } },
      update: { counted_stock: counted, difference, system_stock },
      create: { audit_id: id, part_id: Number(part_id), location, system_stock, counted_stock: counted, difference },
      include: lineInclude
    })
    res.json(line)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// DELETE /api/audits/:id/lines/:lineId — remove a line from audit
router.delete('/:id/lines/:lineId', async (req, res) => {
  try {
    const audit = await prisma.audit.findUnique({ where: { id: Number(req.params.id) } })
    if (audit?.status === 'CLOSED') return res.status(409).json({ error: 'La auditoría está cerrada' })
    await prisma.auditLine.delete({ where: { id: Number(req.params.lineId) } })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/audits/:id/close — apply all counted adjustments and close
router.post('/:id/close', async (req, res) => {
  const id = Number(req.params.id)
  try {
    const audit = await prisma.audit.findUnique({
      where: { id },
      include: { lines: { include: { part: true } } }
    })
    if (!audit) return res.status(404).json({ error: 'Not found' })
    if (audit.status === 'CLOSED') return res.status(409).json({ error: 'Ya está cerrada' })

    const toAdjust = audit.lines.filter(l => l.counted_stock != null && l.difference !== 0)

    await prisma.$transaction(async (tx) => {
      for (const line of toAdjust) {
        const diff = line.difference // counted - system
        const location = line.location
        const partId = line.part_id

        // Adjust PartLocation
        await tx.partLocation.upsert({
          where: { part_id_location: { part_id: partId, location } },
          update: { stock: { increment: diff } },
          create: { part_id: partId, location, stock: line.counted_stock }
        })

        // Adjust Part.stock_current
        await tx.part.update({
          where: { id: partId },
          data: { stock_current: { increment: diff } }
        })

        // Stock movement for traceability
        await tx.stockMovement.create({
          data: {
            part_id: partId,
            type: diff > 0 ? 'IN' : 'OUT',
            quantity: Math.abs(diff),
            reference_type: 'ADJUSTMENT',
            reference_id: id,
            notes: `Auditoría: ${audit.name} · ${location} · sistema ${line.system_stock} → contado ${line.counted_stock}`,
          }
        })

        // Mark line as adjusted
        await tx.auditLine.update({ where: { id: line.id }, data: { adjusted: true } })
      }

      // Close audit
      await tx.audit.update({
        where: { id },
        data: { status: 'CLOSED', closed_at: new Date() }
      })
    })

    const closed = await prisma.audit.findUnique({
      where: { id },
      include: { lines: { include: lineInclude } }
    })
    res.json(closed)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/audits/:id/export?format=csv
router.get('/:id/export', async (req, res) => {
  const id = Number(req.params.id)
  const format = req.query.format || 'csv'
  try {
    const audit = await prisma.audit.findUnique({
      where: { id },
      include: { lines: { include: lineInclude, orderBy: [{ location: 'asc' }, { part: { code: 'asc' } }] } }
    })
    if (!audit) return res.status(404).json({ error: 'Not found' })

    if (format === 'csv') {
      const rows = [
        ['Código', 'Pieza', 'Categoría', 'Ubicación', 'Stock sistema', 'Stock contado', 'Diferencia', 'Ajustado'],
        ...audit.lines.map(l => [
          l.part?.code ?? '',
          l.part?.name ?? '',
          l.part?.category ?? '',
          l.location,
          l.system_stock,
          l.counted_stock ?? '',
          l.difference ?? '',
          l.adjusted ? 'Sí' : 'No',
        ])
      ]
      const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
      const filename = `auditoria-${audit.name.replace(/[^a-zA-Z0-9]/g, '-')}-${new Date().toISOString().slice(0, 10)}.csv`
      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
      res.send('﻿' + csv) // BOM for Excel
    } else {
      res.status(400).json({ error: 'Formato no soportado' })
    }
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
