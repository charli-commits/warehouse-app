const express = require('express')
const router = express.Router()
const prisma = require('../lib/prisma')
const fs = require('fs')
const path = require('path')
const glsClient = require('../lib/glsClient')
const { PDFDocument } = require('pdf-lib')
const PDFKit = require('pdfkit')

const LABELS_DIR = path.join(__dirname, '..', '..', 'uploads', 'gls_labels')
fs.mkdirSync(LABELS_DIR, { recursive: true })

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://wtpaggzdwhpxxtatcpxo.supabase.co'
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || ''

async function uploadLabelToSupabase(filename, buffer) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/labels/${filename}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/pdf',
      'x-upsert': 'true',
    },
    body: buffer,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Supabase upload error ${res.status}: ${text}`)
  }
  return `${SUPABASE_URL}/storage/v1/object/public/labels/${filename}`
}

// Map Spanish/Odoo country names → ISO 2-letter codes
const COUNTRY_NAME_TO_ISO = {
  'españa': 'ES', 'spain': 'ES',
  'alemania': 'DE', 'germany': 'DE', 'deutschland': 'DE',
  'francia': 'FR', 'france': 'FR',
  'italia': 'IT', 'italy': 'IT',
  'portugal': 'PT',
  'países bajos': 'NL', 'holanda': 'NL', 'netherlands': 'NL',
  'bélgica': 'BE', 'belgica': 'BE', 'belgium': 'BE',
  'reino unido': 'GB', 'united kingdom': 'GB', 'gran bretaña': 'GB',
  'suiza': 'CH', 'switzerland': 'CH',
  'austria': 'AT',
  'polonia': 'PL', 'poland': 'PL',
  'suecia': 'SE', 'sweden': 'SE',
  'noruega': 'NO', 'norway': 'NO',
  'dinamarca': 'DK', 'denmark': 'DK',
  'finlandia': 'FI', 'finland': 'FI',
  'república checa': 'CZ', 'republica checa': 'CZ', 'czech republic': 'CZ',
  'hungría': 'HU', 'hungria': 'HU', 'hungary': 'HU',
  'rumanía': 'RO', 'rumania': 'RO', 'romania': 'RO',
  'bulgaria': 'BG',
  'croacia': 'HR', 'croatia': 'HR',
  'eslovaquia': 'SK', 'slovakia': 'SK',
  'eslovenia': 'SI', 'slovenia': 'SI',
  'grecia': 'GR', 'greece': 'GR',
  'irlanda': 'IE', 'ireland': 'IE',
  'luxemburgo': 'LU', 'luxembourg': 'LU',
  'lituania': 'LT', 'lithuania': 'LT',
  'letonia': 'LV', 'latvia': 'LV',
  'estonia': 'EE', 'estonia': 'EE',
  'chipre': 'CY', 'cyprus': 'CY',
  'malta': 'MT',
  'marruecos': 'MA', 'morocco': 'MA',
  'estados unidos': 'US', 'united states': 'US', 'usa': 'US',
}

function resolveCountryIso(countryName) {
  if (!countryName) return 'ES'
  if (countryName.length === 2) return countryName.toUpperCase()
  return COUNTRY_NAME_TO_ISO[countryName.toLowerCase().trim()] || 'ES'
}

async function logEvent(delivery_note_id, status, user_name = null, tx = prisma) {
  return tx.deliveryNoteEvent.create({ data: { delivery_note_id, status, user_name } })
}

// GET /api/deliveries
router.get('/', async (req, res) => {
  const where = {}
  if (req.query.created_by) where.created_by_id = Number(req.query.created_by)
  if (req.query.partner_id) where.odoo_partner_id = Number(req.query.partner_id)
  const notes = await prisma.deliveryNote.findMany({
    where,
    include: {
      lines: { include: { part: { select: { id: true, code: true, name: true, unit: true } } } },
      createdBy: { select: { id: true, name: true } }
    },
    orderBy: { created_at: 'desc' }
  })
  res.json(notes)
})

// GET /api/deliveries/resumen-cierre — PDF resumen de albaranes SHIPPED
router.get('/resumen-cierre', async (req, res) => {
  try {
    const { date } = req.query
    let where = { status: 'SHIPPED' }
    if (date) {
      const start = new Date(date)
      start.setHours(0, 0, 0, 0)
      const end = new Date(date)
      end.setHours(23, 59, 59, 999)
      where.shipped_at = { gte: start, lte: end }
    }
    const notes = await prisma.deliveryNote.findMany({
      where,
      include: { lines: { include: { part: { select: { code: true, name: true, unit: true } } } } },
      orderBy: { created_at: 'desc' }
    })
    if (notes.length === 0) return res.status(404).json({ error: date ? `No hay albaranes enviados el ${date}` : 'No hay albaranes enviados' })
    const pdfBuf = await buildResumenPDF(notes)
    const filename = `resumen-${new Date().toISOString().slice(0, 10)}.pdf`
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.send(pdfBuf)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/deliveries/etiquetas-pdf?date=YYYY-MM-DD — merged PDF of labels for a given date (shipped_at)
router.get('/etiquetas-pdf', async (req, res) => {
  try {
    const { date } = req.query
    let where = { status: { in: ['READY', 'SHIPPED'] }, gls_label_url: { not: null } }
    if (date) {
      const start = new Date(date); start.setHours(0, 0, 0, 0)
      where.shipped_at = { gte: start }
    }

    const notes = await prisma.deliveryNote.findMany({ where })
    if (notes.length === 0)
      return res.status(404).json({ error: date ? `No hay etiquetas desde el ${date}` : 'No hay etiquetas disponibles' })

    const merged = await PDFDocument.create()
    for (const note of notes) {
      try {
        let pdfBytes
        if (note.gls_label_url.startsWith('http')) {
          const r = await fetch(note.gls_label_url)
          if (!r.ok) continue
          pdfBytes = Buffer.from(await r.arrayBuffer())
        } else {
          const localPath = path.join(__dirname, '..', '..', note.gls_label_url)
          if (!fs.existsSync(localPath)) continue
          pdfBytes = fs.readFileSync(localPath)
        }
        const doc = await PDFDocument.load(pdfBytes)
        const pages = await merged.copyPages(doc, doc.getPageIndices())
        pages.forEach(p => merged.addPage(p))
      } catch { /* skip unreadable labels */ }
    }

    if (merged.getPageCount() === 0)
      return res.status(404).json({ error: 'No se pudieron cargar las etiquetas' })

    const mergedBytes = await merged.save()
    const suffix = date || new Date().toISOString().slice(0, 10)
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="etiquetas-${suffix}.pdf"`)
    res.send(Buffer.from(mergedBytes))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/deliveries/:id
router.get('/:id', async (req, res) => {
  const note = await prisma.deliveryNote.findUnique({
    where: { id: Number(req.params.id) },
    include: {
      lines: { include: { part: { select: { id: true, code: true, name: true, unit: true } } } }
    }
  })
  if (!note) return res.status(404).json({ error: 'Delivery note not found' })
  res.json(note)
})

// POST /api/deliveries
router.post('/', async (req, res) => {
  try {
    const { odoo_partner_id, odoo_partner_name, shipping_address, notes, client_ref, lines = [], created_by_id } = req.body
    const note = await prisma.deliveryNote.create({
      data: {
        odoo_partner_id: odoo_partner_id ? Number(odoo_partner_id) : null,
        odoo_partner_name: odoo_partner_name || null,
        shipping_address: shipping_address ? JSON.stringify(shipping_address) : null,
        notes,
        client_ref: client_ref || null,
        created_by_id: created_by_id ? Number(created_by_id) : null,
        lines: {
          create: lines.map(l => ({
            part_id: Number(l.part_id),
            quantity: Number(l.quantity),
          }))
        }
      },
      include: {
        lines: { include: { part: { select: { id: true, code: true, name: true, unit: true } } } }
      }
    })
    await prisma.deliveryNoteEvent.create({ data: { delivery_note_id: note.id, status: 'DRAFT' } })
    res.status(201).json(note)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// PUT /api/deliveries/:id — update header + replace lines (only DRAFT)
router.put('/:id', async (req, res) => {
  const id = Number(req.params.id)
  try {
    const { odoo_partner_id, odoo_partner_name, shipping_address, notes, client_ref, parcels, lines } = req.body
    const updateData = {
      ...(odoo_partner_id !== undefined && { odoo_partner_id: odoo_partner_id ? Number(odoo_partner_id) : null }),
      ...(odoo_partner_name !== undefined && { odoo_partner_name }),
      ...(shipping_address !== undefined && { shipping_address: shipping_address ? JSON.stringify(shipping_address) : null }),
      ...(notes !== undefined && { notes }),
      ...(client_ref !== undefined && { client_ref: client_ref || null }),
      ...(parcels !== undefined && { parcels: Math.max(1, Number(parcels)) }),
    }

    if (lines) {
      await prisma.deliveryNoteLine.deleteMany({ where: { delivery_note_id: id } })
      updateData.lines = {
        create: lines.map(l => ({
          part_id: Number(l.part_id),
          quantity: Number(l.quantity),
        }))
      }
    }

    const note = await prisma.deliveryNote.update({
      where: { id },
      data: updateData,
      include: {
        lines: { include: { part: { select: { id: true, code: true, name: true, unit: true } } } }
      }
    })
    res.json(note)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// DELETE /api/deliveries/:id — DRAFT always; others only with ?force=1
router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id)
  const force = req.query.force === '1'
  const note = await prisma.deliveryNote.findUnique({ where: { id } })
  if (!note) return res.status(404).json({ error: 'Delivery note not found' })
  if (note.status !== 'DRAFT' && !force) return res.status(409).json({ error: 'Only DRAFT notes can be deleted' })
  await prisma.deliveryNoteLine.deleteMany({ where: { delivery_note_id: id } })
  await prisma.deliveryNote.delete({ where: { id } })
  res.json({ ok: true })
})

// POST /api/deliveries/:id/confirm — DRAFT → CONFIRMED (stock NOT decremented here, happens at picking/ship)
router.post('/:id/confirm', async (req, res) => {
  const id = Number(req.params.id)
  const note = await prisma.deliveryNote.findUnique({
    where: { id },
    include: { lines: true }
  })
  if (!note) return res.status(404).json({ error: 'Delivery note not found' })
  if (note.status !== 'DRAFT') return res.status(409).json({ error: 'Only DRAFT notes can be confirmed' })
  if (note.lines.length === 0) return res.status(409).json({ error: 'No se puede confirmar un albarán sin piezas' })

  // Check stock availability
  for (const line of note.lines) {
    const part = await prisma.part.findUnique({ where: { id: line.part_id } })
    if (part.stock_current < line.quantity) {
      return res.status(409).json({
        error: `Stock insuficiente para "${part.name}": disponible ${part.stock_current} ${part.unit}, solicitado ${line.quantity}`
      })
    }
  }

  await prisma.$transaction([
    prisma.deliveryNote.update({ where: { id }, data: { status: 'CONFIRMED' } }),
    prisma.deliveryNoteEvent.create({ data: { delivery_note_id: id, status: 'CONFIRMED' } }),
  ])

  const updated = await prisma.deliveryNote.findUnique({
    where: { id },
    include: {
      lines: { include: { part: { select: { id: true, code: true, name: true, unit: true } } } }
    }
  })
  res.json(updated)
})

// POST /api/deliveries/:id/start-picking — CONFIRMED → PICKING
router.post('/:id/start-picking', async (req, res) => {
  const id = Number(req.params.id)
  const note = await prisma.deliveryNote.findUnique({ where: { id }, include: { lines: true } })
  if (!note) return res.status(404).json({ error: 'Delivery note not found' })
  if (note.status !== 'CONFIRMED') return res.status(409).json({ error: 'Solo albaranes CONFIRMED pueden iniciar picking' })
  await prisma.deliveryNoteEvent.create({ data: { delivery_note_id: id, status: 'PICKING' } })
  const updated = await prisma.deliveryNote.update({
    where: { id }, data: { status: 'PICKING' },
    include: { lines: { include: { part: { select: { id: true, code: true, name: true, unit: true } }, pickingLine: true } } }
  })
  res.json(updated)
})

// POST /api/deliveries/:id/verify-line — marca una línea como verificada
// body: { line_id, user_id, forced, force_reason, scanned_location }
router.post('/:id/verify-line', async (req, res) => {
  const id = Number(req.params.id)
  const { line_id, user_id, forced = false, force_reason, scanned_location } = req.body
  const note = await prisma.deliveryNote.findUnique({
    where: { id },
    include: { lines: { include: { part: true, pickingLine: true } } }
  })
  if (!note) return res.status(404).json({ error: 'Delivery note not found' })
  if (!['PICKING'].includes(note.status)) return res.status(409).json({ error: 'El albarán no está en estado PICKING' })

  const line = note.lines.find(l => l.id === Number(line_id))
  if (!line) return res.status(404).json({ error: 'Línea no encontrada' })

  const wasAlreadyVerified = !!line.pickingLine

  await prisma.$transaction(async (tx) => {
    await tx.pickingLine.upsert({
      where: { delivery_note_line_id: Number(line_id) },
      update: {
        verified_by_id: user_id ? Number(user_id) : null,
        forced, force_reason: force_reason || null,
        scanned_location: scanned_location || null,
        verified_at: new Date()
      },
      create: {
        delivery_note_line_id: Number(line_id),
        delivery_note_id: id,
        verified_by_id: user_id ? Number(user_id) : null,
        forced, force_reason: force_reason || null,
        scanned_location: scanned_location || null
      }
    })

    // Descuento de stock solo si es la primera verificación
    if (!wasAlreadyVerified) {
      const qty = line.quantity
      const part_id = line.part_id

      if (scanned_location) {
        // Descontar de la ubicación escaneada en PartLocation
        await tx.partLocation.updateMany({
          where: { part_id, location: scanned_location },
          data: { stock: { decrement: qty } }
        })

        // Descontar de LotLocation en orden FIFO (más antiguo primero)
        // Solo afecta lotes que tengan stock en esa ubicación
        const lotLocs = await tx.lotLocation.findMany({
          where: { location: scanned_location, stock: { gt: 0 }, lot: { part_id } },
          include: { lot: { select: { id: true, created_at: true } } },
          orderBy: { lot: { created_at: 'asc' } }
        })
        let remaining = qty
        for (const ll of lotLocs) {
          if (remaining <= 0) break
          const deduct = Math.min(ll.stock, remaining)
          await tx.lotLocation.update({
            where: { id: ll.id },
            data: { stock: { decrement: deduct } }
          })
          remaining -= deduct
        }
      }

      if (scanned_location) {
        // Con ubicación: recalcular stock_current desde PartLocation (ya decrementado arriba)
        const agg = await tx.partLocation.aggregate({ where: { part_id }, _sum: { stock: true } })
        await tx.part.update({ where: { id: part_id }, data: { stock_current: agg._sum.stock || 0 } })
      } else {
        // Sin ubicación: decrementar stock_current directamente
        await tx.part.update({ where: { id: part_id }, data: { stock_current: { decrement: qty } } })
      }

      await tx.stockMovement.create({
        data: {
          part_id, type: 'OUT', quantity: qty,
          reference_type: 'DELIVERY', reference_id: id,
          notes: `Albarán #${id}${scanned_location ? ` desde ${scanned_location}` : ''}`,
          user_name: user_id ? String(user_id) : null
        }
      })
    }
  })

  const updated = await prisma.deliveryNote.findUnique({
    where: { id },
    include: { lines: { include: { part: { select: { id: true, code: true, name: true, unit: true } }, pickingLine: true } } }
  })
  res.json(updated)
})

// POST /api/deliveries/:id/close-picking — PICKING → READY (manual)
router.post('/:id/close-picking', async (req, res) => {
  const id = Number(req.params.id)
  const note = await prisma.deliveryNote.findUnique({ where: { id } })
  if (!note) return res.status(404).json({ error: 'Delivery note not found' })
  if (note.status !== 'PICKING') return res.status(409).json({ error: 'Solo albaranes en PICKING pueden cerrarse' })
  await prisma.deliveryNoteEvent.create({ data: { delivery_note_id: id, status: 'READY' } })
  const updated = await prisma.deliveryNote.update({
    where: { id }, data: { status: 'READY' },
    include: { lines: { include: { part: { select: { id: true, code: true, name: true, unit: true } }, pickingLine: true } } }
  })
  res.json(updated)
})

// POST /api/deliveries/:id/ship — READY → SHIPPED
// carrier=GLS: auto-generates label via GLS integration
// carrier=DACHSER (or other): marks shipped immediately, tracking can be added later
router.post('/:id/ship', async (req, res) => {
  const id = Number(req.params.id)
  const { carrier, retorno } = req.body
  const note = await prisma.deliveryNote.findUnique({ where: { id } })
  if (!note) return res.status(404).json({ error: 'Delivery note not found' })
  if (!['CONFIRMED', 'READY'].includes(note.status)) return res.status(409).json({ error: 'Solo albaranes CONFIRMED o READY pueden enviarse' })

  let gls_tracking = null
  let gls_codbarras = null
  let gls_label_url = note.gls_label_url || null

  if (carrier === 'GLS' && glsClient.isConfigured()) {
    try {
      const addr = note.shipping_address ? JSON.parse(note.shipping_address) : {}
      const result = await glsClient.createShipment({
        ref: `${note.client_ref || `ALB-${note.id}`}-${Date.now()}`,
        parcels: note.parcels || 1,
        retorno: retorno ? 1 : 0,
        recipient: {
          name: note.odoo_partner_name || 'Cliente',
          address: addr.street || '',
          zip: addr.zip || '',
          city: addr.city || '',
          country: resolveCountryIso(addr.country),
          phone: addr.phone || '',
          mobile: addr.mobile || addr.phone || '',
          email: addr.email || '',
        }
      })
      gls_tracking = result.tracking
      gls_codbarras = result.codbarras || null
      if (result.labelPdfBuffer) {
        const filename = `ALB-${note.id}-${result.tracking}.pdf`
        try {
          gls_label_url = await uploadLabelToSupabase(filename, result.labelPdfBuffer)
        } catch {
          // fallback to local if Supabase fails
          fs.writeFileSync(path.join(LABELS_DIR, filename), result.labelPdfBuffer)
          gls_label_url = `/uploads/gls_labels/${filename}`
        }
      }
    } catch (err) {
      return res.status(422).json({ error: 'Error GLS: ' + err.message })
    }
  }

  // Si viene de CONFIRMED (sin picking), descontar stock ahora
  if (note.status === 'CONFIRMED') {
    const lines = await prisma.deliveryNoteLine.findMany({ where: { delivery_note_id: id } })
    await prisma.$transaction([
      ...lines.flatMap(line => [
        prisma.part.update({ where: { id: line.part_id }, data: { stock_current: { decrement: line.quantity } } }),
        prisma.stockMovement.create({
          data: {
            part_id: line.part_id, type: 'OUT', quantity: line.quantity,
            reference_type: 'DELIVERY', reference_id: id,
            notes: `Albarán ALB-${id}`,
          }
        })
      ])
    ])
  }

  await prisma.deliveryNoteEvent.create({ data: { delivery_note_id: id, status: 'SHIPPED' } })
  const updated = await prisma.deliveryNote.update({
    where: { id },
    data: {
      status: 'SHIPPED',
      shipped_at: new Date(),
      carrier: carrier || null,
      gls_tracking,
      gls_codbarras,
      gls_label_url,
    },
    include: {
      lines: { include: { part: { select: { id: true, code: true, name: true, unit: true } } } }
    }
  })
  res.json(updated)
})

// POST /api/deliveries/:id/cancel-gls — cancel GLS shipment via BorraServicios, revert to READY
// POST /api/deliveries/:id/force-ready — admin: force status back to READY without calling GLS
router.post('/:id/force-ready', async (req, res) => {
  const id = Number(req.params.id)
  const note = await prisma.deliveryNote.findUnique({ where: { id } })
  if (!note) return res.status(404).json({ error: 'Albarán no encontrado' })
  const updated = await prisma.deliveryNote.update({
    where: { id },
    data: { status: 'READY', gls_tracking: null, gls_codbarras: null },
    include: { lines: { include: { part: { select: { id: true, code: true, name: true, unit: true } } } } }
  })
  await prisma.deliveryNoteEvent.create({ data: { delivery_note_id: id, status: 'READY' } })
  res.json(updated)
})

router.post('/:id/cancel-gls', async (req, res) => {
  const id = Number(req.params.id)
  const note = await prisma.deliveryNote.findUnique({ where: { id } })
  if (!note) return res.status(404).json({ error: 'Albarán no encontrado' })
  if (note.status !== 'SHIPPED') return res.status(409).json({ error: 'Solo se pueden anular albaranes en estado SHIPPED' })
  if (!note.gls_codbarras) return res.status(409).json({ error: 'Este albarán no tiene codbarras GLS guardado — no se puede anular por API' })

  try {
    const codes = note.gls_codbarras.split(',').map(s => s.trim()).filter(Boolean)
    await glsClient.borraServicios(codes)
  } catch (err) {
    return res.status(422).json({ error: 'GLS rechazó la anulación: ' + err.message })
  }

  const updated = await prisma.deliveryNote.update({
    where: { id },
    data: { status: 'READY', gls_tracking: null, gls_codbarras: null },
    include: { lines: { include: { part: { select: { id: true, code: true, name: true, unit: true } } } } }
  })
  await prisma.deliveryNoteEvent.create({ data: { delivery_note_id: id, status: 'READY' } })
  res.json(updated)
})

// PATCH /api/deliveries/:id/tracking — update tracking number on a shipped note (e.g. DACHSER)
router.patch('/:id/tracking', async (req, res) => {
  const id = Number(req.params.id)
  const { gls_tracking } = req.body
  const note = await prisma.deliveryNote.findUnique({ where: { id } })
  if (!note) return res.status(404).json({ error: 'Delivery note not found' })
  const updated = await prisma.deliveryNote.update({
    where: { id },
    data: { gls_tracking: gls_tracking || null },
    include: { lines: { include: { part: { select: { id: true, code: true, name: true, unit: true } } } } }
  })
  res.json(updated)
})

// POST /api/deliveries/:id/label — upload a PDF label manually (e.g. generated in the GLS portal)
router.post('/:id/label', express.raw({ type: 'application/pdf', limit: '10mb' }), async (req, res) => {
  const id = Number(req.params.id)
  const note = await prisma.deliveryNote.findUnique({ where: { id } })
  if (!note) return res.status(404).json({ error: 'Delivery note not found' })
  if (!req.body || !req.body.length) return res.status(400).json({ error: 'PDF vacío' })

  const filename = `ALB-${id}-manual-${Date.now()}.pdf`
  let gls_label_url
  try {
    gls_label_url = await uploadLabelToSupabase(filename, req.body)
  } catch {
    fs.writeFileSync(path.join(LABELS_DIR, filename), req.body)
    gls_label_url = `/uploads/gls_labels/${filename}`
  }

  const updated = await prisma.deliveryNote.update({
    where: { id },
    data: { gls_label_url },
    include: { lines: { include: { part: { select: { id: true, code: true, name: true, unit: true } } } } }
  })
  res.json(updated)
})

// POST /api/deliveries/:id/deliver — SHIPPED → DELIVERED
// GET /api/deliveries/:id/packing-list — generate packing list PDF
router.get('/:id/packing-list', async (req, res) => {
  const id = Number(req.params.id)
  const note = await prisma.deliveryNote.findUnique({
    where: { id },
    include: {
      lines: { include: { part: { select: { id: true, code: true, name: true, unit: true } } } },
      createdBy: { select: { name: true } }
    }
  })
  if (!note) return res.status(404).json({ error: 'Albarán no encontrado' })

  // FIFO location for each part: oldest lot with stock > 0
  const partIds = note.lines.map(l => l.part_id).filter(Boolean)
  const fifoLocs = {}
  if (partIds.length) {
    const lotLocs = await prisma.lotLocation.findMany({
      where: { stock: { gt: 0 }, lot: { part_id: { in: partIds } } },
      include: { lot: { select: { part_id: true, created_at: true } } },
      orderBy: { lot: { created_at: 'asc' } }
    })
    for (const ll of lotLocs) {
      if (!fifoLocs[ll.lot.part_id]) fifoLocs[ll.lot.part_id] = ll.location
    }
    // fallback: parts with no lots — use PartLocation with most stock
    const noLot = partIds.filter(pid => !fifoLocs[pid])
    if (noLot.length) {
      const partLocs = await prisma.partLocation.findMany({
        where: { part_id: { in: noLot }, stock: { gt: 0 } },
        orderBy: { stock: 'desc' }
      })
      for (const pl of partLocs) {
        if (!fifoLocs[pl.part_id]) fifoLocs[pl.part_id] = pl.location
      }
    }
  }

  const addr = note.shipping_address ? JSON.parse(note.shipping_address) : {}
  const dateStr = new Date(note.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const ref = `ALB-${note.id}`

  const buf = await new Promise((resolve, reject) => {
    const M = 50
    const PW = 595.28 - M * 2
    const doc = new PDFKit({ margin: M, size: 'A4' })
    const chunks = []
    doc.on('data', c => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    // Header
    doc.fontSize(20).font('Helvetica-Bold').fillColor('#000').text('ALBARÁN DE SALIDA', M, M)
    doc.fontSize(10).font('Helvetica').fillColor('#666').text(`${ref}  ·  ${dateStr}`, M, M + 28)
    if (note.client_ref) doc.text(`Ref. pedido: ${note.client_ref}`, M, M + 42)
    if (note.carrier) doc.text(`Transportista: ${note.carrier}${note.gls_tracking ? `  ·  ${note.gls_tracking}` : ''}`, M, M + (note.client_ref ? 56 : 42))

    // Sender box (left)
    const boxY = M + 80
    doc.rect(M, boxY, PW / 2 - 6, 90).fill('#f3f4f6')
    doc.fontSize(7).font('Helvetica-Bold').fillColor('#888').text('REMITENTE', M + 10, boxY + 8)
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#111').text('GYM COMPANY RETAIL SL', M + 10, boxY + 20)
    doc.fontSize(8).font('Helvetica').fillColor('#444')
      .text('AVDA CORTS CATALANES 8 NAVE 6', M + 10, boxY + 34)
      .text('08173 SANT CUGAT DEL VALLÈS', M + 10, boxY + 46)

    // Recipient box (right)
    const rx = M + PW / 2 + 6
    const rw = PW / 2 - 6
    doc.rect(rx, boxY, rw, 90).fill('#f3f4f6')
    doc.fontSize(7).font('Helvetica-Bold').fillColor('#888').text('DESTINATARIO', rx + 10, boxY + 8)
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#111').text(note.odoo_partner_name || '—', rx + 10, boxY + 20, { width: rw - 20 })
    doc.fontSize(8).font('Helvetica').fillColor('#444')
    let ay = boxY + 34
    if (addr.street) { doc.text(addr.street, rx + 10, ay, { width: rw - 20 }); ay += 12 }
    if (addr.zip || addr.city) { doc.text(`${addr.zip || ''} ${addr.city || ''}`.trim(), rx + 10, ay, { width: rw - 20 }); ay += 12 }
    if (addr.country && addr.country !== 'España') { doc.text(addr.country, rx + 10, ay, { width: rw - 20 }); ay += 12 }
    if (addr.phone) doc.text(`Tel: ${addr.phone}`, rx + 10, ay, { width: rw - 20 })

    doc.y = boxY + 106

    if (note.notes) {
      doc.fontSize(8).font('Helvetica').fillColor('#555').text(`Notas: ${note.notes}`, M, doc.y, { width: PW })
      doc.y += 16
    }

    // Table header
    const COL_CODE = M + 6
    const COL_DESC = M + 110
    const LOC_W = 100
    const QTY_W = 55
    const QTY_X = M + PW - QTY_W - 6
    const LOC_X = QTY_X - LOC_W - 6
    const DESC_W = LOC_X - COL_DESC - 8

    doc.rect(M, doc.y, PW, 20).fill('#1e3a5f')
    const th = doc.y + 5
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#fff')
      .text('Código',      COL_CODE, th, { width: 100,    lineBreak: false })
      .text('Descripción', COL_DESC, th, { width: DESC_W, lineBreak: false })
      .text('Ubicación',   LOC_X,    th, { width: LOC_W,  lineBreak: false })
      .text('Cant.',       QTY_X,    th, { width: QTY_W,  align: 'right', lineBreak: false })
    doc.y = th + 20

    let rowBg = false
    for (const line of note.lines) {
      if (doc.y > 760) doc.addPage()
      if (rowBg) doc.rect(M, doc.y, PW, 18).fill('#f9fafb')
      rowBg = !rowBg
      const ry = doc.y + 4
      const locs = fifoLocs[line.part_id] || '—'
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#333')
        .text(line.part?.code || '—', COL_CODE, ry, { width: 100, lineBreak: false })
      doc.font('Helvetica').fillColor('#222')
        .text(line.part?.name || '—', COL_DESC, ry, { width: DESC_W, lineBreak: false })
      doc.fillColor('#1e3a5f').font('Helvetica-Bold')
        .text(locs, LOC_X, ry, { width: LOC_W, lineBreak: false })
      doc.font('Helvetica').fillColor('#222')
        .text(`${line.quantity} ${line.part?.unit || ''}`, QTY_X, ry, { width: QTY_W, align: 'right', lineBreak: false })
      doc.y = ry + 18
    }

    // Footer
    doc.moveTo(M, doc.y + 6).lineTo(M + PW, doc.y + 6).lineWidth(0.5).stroke('#ccc')
    doc.y += 16
    doc.fontSize(8).font('Helvetica').fillColor('#888')
      .text(`Total bultos: ${note.parcels || 1}  ·  ${note.lines.length} línea(s)  ·  Generado ${new Date().toLocaleDateString('es-ES')}`, M, doc.y, { align: 'center', width: PW })

    // Signature boxes
    doc.y += 30
    doc.rect(M, doc.y, PW / 2 - 10, 50).stroke('#ccc')
    doc.rect(M + PW / 2 + 10, doc.y, PW / 2 - 10, 50).stroke('#ccc')
    doc.fontSize(7).font('Helvetica').fillColor('#aaa')
      .text('Firma remitente', M + 5, doc.y + 3)
      .text('Firma destinatario', M + PW / 2 + 15, doc.y + 3)

    doc.end()
  })

  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename="${ref}-packing-list.pdf"`)
  res.send(buf)
})

router.post('/:id/deliver', async (req, res) => {
  const id = Number(req.params.id)
  const note = await prisma.deliveryNote.findUnique({ where: { id } })
  if (!note) return res.status(404).json({ error: 'Delivery note not found' })
  if (note.status !== 'SHIPPED') return res.status(409).json({ error: 'Only SHIPPED notes can be marked delivered' })

  await prisma.deliveryNoteEvent.create({ data: { delivery_note_id: id, status: 'DELIVERED' } })
  const updated = await prisma.deliveryNote.update({
    where: { id },
    data: { status: 'DELIVERED' },
    include: {
      lines: { include: { part: { select: { id: true, code: true, name: true, unit: true } } } }
    }
  })
  res.json(updated)
})

// Helper: genera PDF resumen de albaranes
function buildResumenPDF(notes) {
  return new Promise((resolve, reject) => {
    const M = 50  // margin
    const PW = 595.28 - M * 2  // usable width (A4)
    const PH = 841.89
    const doc = new PDFKit({ margin: M, size: 'A4', autoFirstPage: true })
    const chunks = []
    doc.on('data', c => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    // Col positions (relative to left margin)
    const C0 = M          // código
    const C1 = M + 100    // nombre
    const C2 = M + PW     // cant (right-align from here)

    function checkPage(neededH = 60) {
      if (doc.y + neededH > PH - M) doc.addPage()
    }

    const QTY_W = 70
    const NAME_W = PW - 100 - QTY_W  // name col width
    const QTY_X = M + PW - QTY_W     // qty col start

    function row(code, name, qty, unit, isHeader) {
      checkPage(16)
      const y = doc.y
      if (isHeader) {
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#555')
      } else {
        doc.font('Helvetica').fontSize(8).fillColor('#222')
      }
      doc.text(code, C0, y, { width: 95, lineBreak: false })
      doc.text(name, C1, y, { width: NAME_W, lineBreak: false })
      doc.text(qty + (unit ? ' ' + unit : ''), QTY_X, y, { width: QTY_W, align: 'right', lineBreak: false })
      doc.y = y + 13
    }

    const dateStr = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
    const totalLines = notes.reduce((s, n) => s + n.lines.length, 0)

    // Page header
    doc.font('Helvetica-Bold').fontSize(18).fillColor('#000').text('Resumen de envíos', M, M)
    doc.font('Helvetica').fontSize(10).fillColor('#666')
      .text(`Fecha: ${dateStr}   ·   Total albaranes: ${notes.length}   ·   Total líneas: ${totalLines}`, M, M + 24)
    doc.y = M + 52
    doc.moveTo(M, doc.y).lineTo(M + PW, doc.y).lineWidth(1).stroke('#ccc')
    doc.y += 10

    for (const note of notes) {
      const addr = note.shipping_address ? (() => { try { return JSON.parse(note.shipping_address) } catch { return {} } })() : {}
      const clientName = note.odoo_partner_name || '—'
      const ref = note.client_ref || `ALB-${note.id}`
      const tracking = note.gls_tracking || '—'
      const addrStr = [addr.street, addr.zip, addr.city].filter(Boolean).join(', ')

      checkPage(80)

      // Header bar
      const barY = doc.y
      doc.rect(M, barY, PW, 20).fill('#1e3a5f')
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#fff')
        .text(ref, M + 6, barY + 5, { width: 120, lineBreak: false })
      doc.text(clientName, M + 130, barY + 5, { width: PW - 140, lineBreak: false })
      doc.y = barY + 26

      // Metadata
      doc.font('Helvetica').fontSize(8.5).fillColor('#444')
      if (tracking !== '—') {
        doc.text(`Tracking GLS: ${tracking}`, M, doc.y, { lineBreak: false })
        doc.y += 13
      }
      if (addrStr) {
        doc.text(`Dirección: ${addrStr}`, M, doc.y, { lineBreak: false })
        doc.y += 13
      }
      doc.y += 4

      // Table
      row('Código', 'Nombre', 'Cant.', '', true)
      doc.moveTo(M, doc.y).lineTo(M + PW, doc.y).lineWidth(0.5).stroke('#ddd')
      doc.y += 3

      for (const line of note.lines) {
        row(line.part.code, line.part.name, line.quantity, line.part.unit, false)
      }

      doc.y += 14
      doc.moveTo(M, doc.y).lineTo(M + PW, doc.y).lineWidth(0.5).stroke('#eee')
      doc.y += 10
    }

    doc.end()
  })
}


// POST /api/deliveries/cierre-jornada — cierre del día GLS
router.post('/cierre-jornada', async (req, res) => {
  try {
    const result = await glsClient.cierreJornada()
    let pdf_url = null
    if (result.pdfBuffer) {
      const filename = `cierre-${new Date().toISOString().slice(0,10)}.pdf`
      fs.writeFileSync(path.join(LABELS_DIR, filename), result.pdfBuffer)
      pdf_url = `/uploads/gls_labels/${filename}`
    }
    res.json({ ok: true, pdf_url })
  } catch (err) {
    res.status(422).json({ error: err.message })
  }
})

module.exports = router
