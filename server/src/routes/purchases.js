const express = require('express')
const router = express.Router()
const prisma = require('../lib/prisma')
const PDFKit = require('pdfkit')
const path = require('path')
const fs = require('fs')

// --- helpers ---

function getInitials(str) {
  if (!str) return null
  return str.trim().split(/\s+/).map(w => w[0].toUpperCase()).join('')
}

const SUPPLIER_STOPWORDS = new Set([
  'CO', 'LTD', 'INC', 'CORP', 'SL', 'SA', 'SRL', 'BV', 'NV', 'AG', 'GMBH',
  'COMPANY', 'GROUP', 'INTERNATIONAL', 'INDUSTRY', 'INDUSTRIES',
  'TRADING', 'FACTORY', 'MANUFACTURE', 'MANUFACTURING', 'EQUIPMENT',
  'ENTERPRISE', 'ENTERPRISES', 'TECHNOLOGY', 'TECH', 'IMPORT', 'EXPORT',
  'AND', 'THE', 'DE', 'S', 'A', 'E'
])

function supplierInitials(name) {
  if (!name) return 'GEN'
  const words = name
    .toUpperCase()
    .replace(/[.,\-_()]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1 && !SUPPLIER_STOPWORDS.has(w))
  if (words.length === 0) return name.slice(0, 3).toUpperCase()
  // Take first letter of each meaningful word, max 4 chars
  return words.map(w => w[0]).join('').slice(0, 4)
}

async function generateReference(order_id, lines, supplier_id) {
  const supplier = await prisma.supplier.findUnique({ where: { id: supplier_id }, select: { name: true } })
  const initials = supplierInitials(supplier?.name)
  const year = new Date().getFullYear()
  const seq = String(order_id).padStart(3, '0')
  return `OC-${year}-${initials}-${seq}`
}

const INCLUDE_FULL = {
  supplier: true,
  lines: {
    include: {
      part: { select: { id: true, code: true, name: true, unit: true, manufacturer: true } },
      receiptLines: { orderBy: { created_at: 'asc' } }
    }
  }
}

// PDF for a purchase order
function buildOrderPDF(order) {
  return new Promise((resolve, reject) => {
    const M = 50
    const PW = 595.28 - M * 2
    const doc = new PDFKit({ margin: M, size: 'A4' })
    const chunks = []
    doc.on('data', c => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const dateStr = new Date(order.order_date).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
    const ref = order.reference || `OC-${order.id}`

    // Header
    doc.fontSize(22).font('Helvetica-Bold').fillColor('#000').text(ref, M, M)
    doc.fontSize(10).font('Helvetica').fillColor('#666').text(`Fecha: ${dateStr}`, M, M + 28)
    if (order.eta) {
      const etaStr = new Date(order.eta).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
      doc.text(`ETA: ${etaStr}`, M, M + 42)
    }

    // Supplier box
    doc.rect(M, M + 60, PW, 50).fill('#f3f4f6')
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#555').text('PROVEEDOR', M + 10, M + 70)
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#111').text(order.supplier.name, M + 10, M + 82)
    if (order.supplier.email) doc.fontSize(9).font('Helvetica').fillColor('#444').text(order.supplier.email, M + 10, M + 96)

    doc.y = M + 130

    if (order.notes) {
      doc.fontSize(9).font('Helvetica').fillColor('#555').text(`Notas: ${order.notes}`, M, doc.y)
      doc.y += 16
    }

    const COL_CODE = M + 6
    const COL_DESC = M + 115
    const QTY_W    = 75
    const QTY_X    = M + PW - QTY_W - 6
    const DESC_W   = QTY_X - COL_DESC - 8

    // Table header
    doc.rect(M, doc.y, PW, 20).fill('#1e3a5f')
    const th = doc.y + 5
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#fff')
    doc.text('Código',     COL_CODE, th, { width: 105,   lineBreak: false })
    doc.text('Descripción',COL_DESC, th, { width: DESC_W, lineBreak: false })
    doc.text('Cantidad',   QTY_X,    th, { width: QTY_W,  align: 'right', lineBreak: false })
    doc.y = th + 20

    // Lines
    let rowBg = false
    for (const line of order.lines) {
      if (doc.y > 800) doc.addPage()
      if (rowBg) doc.rect(M, doc.y, PW, 18).fill('#f9fafb')
      rowBg = !rowBg
      const ry = doc.y + 4
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#333')
        .text(line.part.code, COL_CODE, ry, { width: 105,   lineBreak: false })
      doc.font('Helvetica').fillColor('#222')
        .text(line.part.name, COL_DESC, ry, { width: DESC_W, lineBreak: false })
      doc.text(`${line.quantity_ordered} ${line.part.unit}`, QTY_X, ry, { width: QTY_W, align: 'right', lineBreak: false })
      doc.y = ry + 18
    }

    // Footer line
    doc.moveTo(M, doc.y + 4).lineTo(M + PW, doc.y + 4).lineWidth(0.5).stroke('#ccc')
    doc.y += 14
    doc.fontSize(8).font('Helvetica').fillColor('#888')
      .text(`Total líneas: ${order.lines.length}  ·  Ref: ${ref}`, M, doc.y, { align: 'center', width: PW })

    doc.end()
  })
}

// --- routes ---

// GET /api/purchases
router.get('/', async (req, res) => {
  const orders = await prisma.purchaseOrder.findMany({
    include: {
      supplier: { select: { id: true, name: true } },
      lines: { include: { part: { select: { id: true, code: true, name: true, unit: true } }, receiptLines: true } }
    },
    orderBy: { created_at: 'desc' }
  })
  res.json(orders)
})

// GET /api/purchases/stats
router.get('/stats', async (req, res) => {
  const pending = await prisma.purchaseOrder.count({
    where: { status: { in: ['DRAFT', 'SENT', 'PARTIAL', 'LOCATING'] } }
  })
  res.json({ pending })
})

// GET /api/purchases/:id
router.get('/:id', async (req, res) => {
  const order = await prisma.purchaseOrder.findUnique({
    where: { id: Number(req.params.id) },
    include: INCLUDE_FULL
  })
  if (!order) return res.status(404).json({ error: 'Order not found' })
  res.json(order)
})

// GET /api/purchases/:id/pdf
router.get('/:id/pdf', async (req, res) => {
  const order = await prisma.purchaseOrder.findUnique({
    where: { id: Number(req.params.id) },
    include: INCLUDE_FULL
  })
  if (!order) return res.status(404).json({ error: 'Order not found' })
  const buf = await buildOrderPDF(order)
  const filename = `${order.reference || `OC-${order.id}`}.pdf`
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  res.send(buf)
})

// POST /api/purchases
router.post('/', async (req, res) => {
  try {
    const { supplier_id, eta, notes, lines = [] } = req.body
    const order = await prisma.purchaseOrder.create({
      data: {
        supplier_id: Number(supplier_id),
        eta: eta ? new Date(eta) : null,
        notes,
        lines: {
          create: lines.map(l => ({
            part_id: Number(l.part_id),
            quantity_ordered: Number(l.quantity_ordered),
            unit_price: l.unit_price != null ? Number(l.unit_price) : null,
          }))
        }
      },
      include: INCLUDE_FULL
    })
    // Generate reference now that we have an id
    const reference = await generateReference(order.id, lines, Number(supplier_id))
    const updated = await prisma.purchaseOrder.update({
      where: { id: order.id },
      data: { reference },
      include: INCLUDE_FULL
    })
    res.status(201).json(updated)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// PUT /api/purchases/:id
router.put('/:id', async (req, res) => {
  const id = Number(req.params.id)
  try {
    const { supplier_id, status, eta, notes, lines } = req.body
    const updateData = {
      ...(supplier_id != null && { supplier_id: Number(supplier_id) }),
      ...(status && { status }),
      ...(eta !== undefined && { eta: eta ? new Date(eta) : null }),
      ...(notes !== undefined && { notes }),
    }
    if (lines) {
      await prisma.purchaseOrderLine.deleteMany({ where: { purchase_order_id: id } })
      updateData.lines = {
        create: lines.map(l => ({
          part_id: Number(l.part_id),
          quantity_ordered: Number(l.quantity_ordered),
          quantity_received: Number(l.quantity_received ?? 0),
          unit_price: l.unit_price != null ? Number(l.unit_price) : null,
        }))
      }
    }
    const order = await prisma.purchaseOrder.update({
      where: { id },
      data: updateData,
      include: INCLUDE_FULL
    })
    res.json(order)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// DELETE /api/purchases/:id
router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id)
  const order = await prisma.purchaseOrder.findUnique({ where: { id } })
  if (!order) return res.status(404).json({ error: 'Order not found' })
  if (order.status !== 'DRAFT') return res.status(409).json({ error: 'Only DRAFT orders can be deleted' })
  await prisma.purchaseOrder.delete({ where: { id } })
  res.json({ ok: true })
})

// POST /api/purchases/:id/validate — step 1: confirm quantities arrived → LOCATING
router.post('/:id/validate', async (req, res) => {
  const id = Number(req.params.id)
  const { lines } = req.body // [{ line_id, quantity_validated }]

  const order = await prisma.purchaseOrder.findUnique({ where: { id }, include: { lines: true } })
  if (!order) return res.status(404).json({ error: 'Order not found' })
  if (['RECEIVED', 'CANCELLED'].includes(order.status)) {
    // Allow re-opening if any line still has unvalidated qty
    const hasRemaining = order.lines.some(l => l.quantity_validated < l.quantity_ordered)
    if (!hasRemaining) return res.status(409).json({ error: 'Todos los artículos ya han sido validados' })
  }

  for (const recv of lines) {
    const qty = Number(recv.quantity_validated)
    if (qty <= 0) continue
    const line = order.lines.find(l => l.id === Number(recv.line_id))
    if (!line) continue
    const maxIncrement = line.quantity_ordered - line.quantity_validated
    if (maxIncrement <= 0) continue
    await prisma.purchaseOrderLine.update({
      where: { id: Number(recv.line_id) },
      data: { quantity_validated: { increment: Math.min(qty, maxIncrement) } }
    })
  }

  const updated = await prisma.purchaseOrder.update({
    where: { id },
    data: { status: 'LOCATING' },
    include: INCLUDE_FULL
  })
  res.json(updated)
})

// POST /api/purchases/:id/locate — step 2: place in location → updates PartLocation + stock
router.post('/:id/locate', async (req, res) => {
  const id = Number(req.params.id)
  const { line_id, location, quantity, user_name } = req.body

  if (!location || !quantity || Number(quantity) <= 0) {
    return res.status(400).json({ error: 'Faltan datos: line_id, location, quantity' })
  }

  const order = await prisma.purchaseOrder.findUnique({ where: { id }, include: { lines: true } })
  if (!order) return res.status(404).json({ error: 'Order not found' })

  const line = order.lines.find(l => l.id === Number(line_id))
  if (!line) return res.status(404).json({ error: 'Línea no encontrada' })

  const qty = Number(quantity)

  const lotNumber = order.reference || `OC-${id}`

  await prisma.$transaction(async (tx) => {
    // Record receipt line
    await tx.purchaseReceiptLine.create({
      data: { purchase_order_line_id: line.id, location, quantity: qty, user_name: user_name || null }
    })
    // Update quantity_received on the line
    await tx.purchaseOrderLine.update({
      where: { id: line.id },
      data: { quantity_received: { increment: qty } }
    })
    // Update PartLocation stock (aggregate total)
    await tx.partLocation.upsert({
      where: { part_id_location: { part_id: line.part_id, location } },
      update: { stock: { increment: qty } },
      create: { part_id: line.part_id, location, stock: qty }
    })
    // Create/update Lot for this OC
    const lot = await tx.lot.upsert({
      where: { part_id_lot_number: { part_id: line.part_id, lot_number: lotNumber } },
      update: {},
      create: { part_id: line.part_id, lot_number: lotNumber, purchase_order_id: id }
    })
    // Update LotLocation stock
    await tx.lotLocation.upsert({
      where: { lot_id_location: { lot_id: lot.id, location } },
      update: { stock: { increment: qty } },
      create: { lot_id: lot.id, location, stock: qty }
    })
    // Recalculate stock_current
    const agg = await tx.partLocation.aggregate({ where: { part_id: line.part_id }, _sum: { stock: true } })
    await tx.part.update({ where: { id: line.part_id }, data: { stock_current: agg._sum.stock || 0 } })
    // Stock movement
    await tx.stockMovement.create({
      data: {
        part_id: line.part_id, type: 'IN', quantity: qty,
        reference_type: 'PURCHASE', reference_id: id,
        notes: `Recepción ${lotNumber} → ${location}`,
        user_name: user_name || null
      }
    })
  })

  // Recalculate order status
  const updatedLines = await prisma.purchaseOrderLine.findMany({ where: { purchase_order_id: id } })
  const allReceived = updatedLines.every(l => l.quantity_received >= l.quantity_ordered)
  const anyReceived = updatedLines.some(l => l.quantity_received > 0)
  const newStatus = allReceived ? 'RECEIVED' : anyReceived ? 'PARTIAL' : 'LOCATING'

  const updated = await prisma.purchaseOrder.update({
    where: { id },
    data: { status: newStatus },
    include: INCLUDE_FULL
  })
  res.json(updated)
})

// POST /api/purchases/:id/receive — legacy: keep for backwards compat, redirects to old logic
router.post('/:id/receive', async (req, res) => {
  const id = Number(req.params.id)
  const { lines, notes } = req.body

  const order = await prisma.purchaseOrder.findUnique({ where: { id }, include: { lines: true } })
  if (!order) return res.status(404).json({ error: 'Order not found' })
  if (['RECEIVED', 'CANCELLED'].includes(order.status)) {
    return res.status(409).json({ error: 'Order already closed' })
  }

  const ops = []
  for (const recv of lines) {
    const line = order.lines.find(l => l.id === Number(recv.line_id))
    if (!line || Number(recv.quantity_received) <= 0) continue
    const qty = Number(recv.quantity_received)
    ops.push(
      prisma.purchaseOrderLine.update({ where: { id: line.id }, data: { quantity_received: { increment: qty } } }),
      prisma.part.update({ where: { id: line.part_id }, data: { stock_current: { increment: qty } } }),
      prisma.stockMovement.create({ data: { part_id: line.part_id, type: 'IN', quantity: qty, reference_type: 'PURCHASE', reference_id: id, notes: notes || `Recepción OC-${id}` } })
    )
  }
  await prisma.$transaction(ops)

  const updatedLines = await prisma.purchaseOrderLine.findMany({ where: { purchase_order_id: id } })
  const allReceived = updatedLines.every(l => l.quantity_received >= l.quantity_ordered)
  const anyReceived = updatedLines.some(l => l.quantity_received > 0)
  const newStatus = allReceived ? 'RECEIVED' : anyReceived ? 'PARTIAL' : order.status

  const updated = await prisma.purchaseOrder.update({
    where: { id }, data: { status: newStatus }, include: INCLUDE_FULL
  })
  res.json(updated)
})

module.exports = router
