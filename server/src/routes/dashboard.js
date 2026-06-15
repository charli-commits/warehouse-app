const express = require('express')
const router = express.Router()
const prisma = require('../lib/prisma')

// GET /api/dashboard
router.get('/', async (req, res) => {
  const [parts, lowStockParts, pendingOrders, activeDeliveries] = await Promise.all([
    prisma.part.count(),
    prisma.part.findMany({
      where: { stock_min: { gt: 0 }, stock_current: { lte: prisma.part.fields.stock_min } },
      select: { id: true, code: true, name: true, unit: true, stock_current: true, stock_min: true }
    }).catch(() => []),
    prisma.purchaseOrder.findMany({
      where: { status: { in: ['DRAFT', 'SENT', 'LOCATING', 'PARTIAL'] } },
      select: { id: true, reference: true, status: true, order_date: true, supplier: { select: { name: true } } },
      orderBy: { order_date: 'desc' },
      take: 10
    }),
    prisma.deliveryNote.findMany({
      where: { status: { in: ['DRAFT', 'CONFIRMED', 'PICKING', 'READY'] } },
      select: { id: true, status: true, odoo_partner_name: true, created_at: true, client_ref: true },
      orderBy: { created_at: 'desc' },
      take: 10
    })
  ])

  const lowStock = await prisma.part.findMany({
    where: { stock_min: { gt: 0 } },
    select: { id: true, code: true, name: true, unit: true, stock_current: true, stock_min: true },
    orderBy: { stock_current: 'asc' },
    take: 20
  }).then(parts => parts.filter(p => p.stock_current <= p.stock_min))

  res.json({
    total_parts: parts,
    low_stock: lowStock,
    pending_orders: pendingOrders,
    active_deliveries: activeDeliveries,
  })
})

// GET /api/dashboard/reposicion — piezas por debajo del mínimo con sugerencia de cantidad
router.get('/reposicion', async (req, res) => {
  try {
    const parts = await prisma.part.findMany({
      where: { stock_min: { gt: 0 } },
      include: {
        locations: { orderBy: { stock: 'desc' } },
        purchaseLines: {
          where: { order: { status: { in: ['DRAFT', 'SENT', 'LOCATING', 'PARTIAL'] } } },
          include: { order: { select: { id: true, reference: true, status: true } } },
          orderBy: { order: { order_date: 'desc' } },
          take: 1
        }
      },
      orderBy: { stock_current: 'asc' }
    })
    const lowStock = parts.filter(p => p.stock_current <= p.stock_min)
    res.json(lowStock.map(p => ({
      id: p.id,
      code: p.code,
      name: p.name,
      unit: p.unit,
      stock_current: p.stock_current,
      stock_min: p.stock_min,
      suggested_qty: Math.max(1, p.stock_min * 2 - p.stock_current),
      pending_order: p.purchaseLines[0]?.order || null,
    })))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/dashboard/efficiency — tiempos medios entre estados
router.get('/efficiency', async (req, res) => {
  const { days = 30 } = req.query
  const since = new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000)

  // Get all delivered notes with their events in the period
  const notes = await prisma.deliveryNote.findMany({
    where: {
      status: 'DELIVERED',
      created_at: { gte: since }
    },
    include: {
      events: { orderBy: { created_at: 'asc' } },
      lines: { select: { quantity: true } }
    }
  })

  // Also include notes with events in period even if created earlier
  const recentEvents = await prisma.deliveryNoteEvent.findMany({
    where: { created_at: { gte: since } },
    include: {
      delivery: {
        include: {
          events: { orderBy: { created_at: 'asc' } },
          lines: { select: { quantity: true } }
        }
      }
    },
    distinct: ['delivery_note_id']
  })

  const allNotes = [...notes]
  for (const ev of recentEvents) {
    if (!allNotes.find(n => n.id === ev.delivery.id)) allNotes.push(ev.delivery)
  }

  // Phases to measure (from → to)
  const phases = [
    { key: 'draft_to_confirmed', from: 'DRAFT', to: 'CONFIRMED', label: 'Creación → Confirmación' },
    { key: 'confirmed_to_picking', from: 'CONFIRMED', to: 'PICKING', label: 'Confirmación → Inicio picking' },
    { key: 'picking_to_ready', from: 'PICKING', to: 'READY', label: 'Picking' },
    { key: 'ready_to_shipped', from: 'READY', to: 'SHIPPED', label: 'Listo → Enviado' },
    { key: 'shipped_to_delivered', from: 'SHIPPED', to: 'DELIVERED', label: 'Enviado → Entregado' },
    { key: 'total', from: 'DRAFT', to: 'DELIVERED', label: 'Total (creación → entrega)' },
  ]

  const stats = {}
  for (const phase of phases) {
    const durations = []
    for (const note of allNotes) {
      const fromEv = note.events.find(e => e.status === phase.from)
      const toEv = note.events.find(e => e.status === phase.to)
      if (fromEv && toEv) {
        const mins = (new Date(toEv.created_at) - new Date(fromEv.created_at)) / 60000
        if (mins >= 0) durations.push(mins)
      }
    }
    stats[phase.key] = {
      label: phase.label,
      count: durations.length,
      avg_minutes: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null,
      min_minutes: durations.length ? Math.round(Math.min(...durations)) : null,
      max_minutes: durations.length ? Math.round(Math.max(...durations)) : null,
    }
  }

  // Volume by day
  res.json({ stats, total_notes: allNotes.length, days: Number(days) })
})

module.exports = router
