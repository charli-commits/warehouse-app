const express = require('express')
const router = express.Router()
const prisma = require('../lib/prisma')
const multer = require('multer')
const path = require('path')
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3')

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://wtpaggzdwhpxxtatcpxo.supabase.co'
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || ''

// Cloudflare R2
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID
const R2_BUCKET = process.env.R2_BUCKET || 'warehouse-parts'
const r2 = R2_ACCOUNT_ID ? new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
}) : null

async function supabaseUpload(filename, buffer, mimetype) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/parts/${filename}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': mimetype,
      'x-upsert': 'true',
    },
    body: buffer,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Supabase upload error ${res.status}: ${text}`)
  }
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /image\//.test(file.mimetype))
})

// POST /api/parts/cleanup-supabase-parts — borra archivos del bucket 'parts' de Supabase (ya migrados a R2)
// ?dry=true → solo cuenta, no borra
router.post('/cleanup-supabase-parts', async (req, res) => {
  const token = req.headers['x-migrate-token']
  if (token !== process.env.MIGRATE_TOKEN) return res.status(403).json({ error: 'forbidden' })

  const dry = req.query.dry === 'true'

  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.setHeader('Transfer-Encoding', 'chunked')
  res.flushHeaders()

  // 1. Cuántas piezas aún apuntan a Supabase (riesgo si borramos)
  const supabaseParts = await prisma.part.findMany({
    where: { image_url: { startsWith: 'http' } },
    select: { id: true, code: true, image_url: true }
  })
  res.write(`Piezas con imagen en Supabase (NO migradas a R2): ${supabaseParts.length}\n`)
  if (supabaseParts.length > 0) {
    supabaseParts.slice(0, 20).forEach(p => res.write(`  [${p.id}] ${p.code} → ${p.image_url?.slice(0,80)}\n`))
    if (supabaseParts.length > 20) res.write(`  ... y ${supabaseParts.length - 20} más\n`)
  }
  res.write('\n')

  if (dry) {
    res.write('--- DRY RUN: no se ha borrado nada ---\n')
    res.end()
    return
  }

  // 2. Listar y borrar archivos del bucket 'parts' en lotes de 100
  res.write('Borrando archivos del bucket "parts" en Supabase...\n')
  let totalDeleted = 0
  let errors = 0
  let offset = 0
  const BATCH = 100

  while (true) {
    const listRes = await fetch(
      `${SUPABASE_URL}/storage/v1/object/list/parts?limit=${BATCH}&offset=${offset}&sortBy[column]=name&sortBy[order]=asc`,
      { method: 'POST', headers: { 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ prefix: '', limit: BATCH, offset }) }
    )
    if (!listRes.ok) { res.write(`ERROR listando: ${await listRes.text()}\n`); break }
    const files = await listRes.json()
    if (!files.length) break

    const names = files.map(f => f.name)
    const delRes = await fetch(`${SUPABASE_URL}/storage/v1/object/parts`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefixes: names })
    })
    if (!delRes.ok) {
      errors++
      res.write(`ERROR borrando lote offset=${offset}: ${await delRes.text()}\n`)
    } else {
      totalDeleted += names.length
      res.write(`  Borrados ${totalDeleted} archivos...\n`)
    }

    if (files.length < BATCH) break
    offset += BATCH
  }

  res.write(`\nFIN: ${totalDeleted} archivos borrados, ${errors} errores\n`)
  if (supabaseParts.length > 0) {
    res.write(`AVISO: ${supabaseParts.length} piezas tenían imagen en Supabase — esas fotos ya no son accesibles\n`)
  }
  res.end()
})

// POST /api/parts/migrate-to-r2 — internal migration endpoint (protected by token)
router.post('/migrate-to-r2', async (req, res) => {
  const token = req.headers['x-migrate-token']
  if (token !== process.env.MIGRATE_TOKEN) return res.status(403).json({ error: 'forbidden' })
  if (!r2) return res.status(500).json({ error: 'R2 no configurado' })

  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.setHeader('Transfer-Encoding', 'chunked')
  res.flushHeaders()

  const parts = await prisma.part.findMany({
    where: { image_url: { not: null }, AND: [{ image_url: { startsWith: 'http' } }] },
    select: { id: true, image_url: true },
  })
  res.write(`Encontradas ${parts.length} piezas con foto Supabase\n`)

  let ok = 0, errors = 0
  for (const part of parts) {
    const ext = (part.image_url.split('?')[0].split('.').pop() || 'jpg').toLowerCase().slice(0, 4)
    const key = `parts/${part.id}.${ext}`
    try {
      const r = await fetch(part.image_url)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const buf = Buffer.from(await r.arrayBuffer())
      const ct = r.headers.get('content-type') || 'image/jpeg'
      await r2.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: buf, ContentType: ct }))
      await prisma.part.update({ where: { id: part.id }, data: { image_url: `r2://${key}` } })
      ok++
      if (ok % 50 === 0) res.write(`  ${ok} migradas...\n`)
    } catch (err) {
      errors++
      res.write(`  [${part.id}] ERROR: ${err.message}\n`)
    }
  }
  res.write(`\nFIN: ${ok} OK, ${errors} errores\n`)
  res.end()
})

// Photo proxy cache
const photoCache = new Map()
const PHOTO_CACHE_MAX = 50

// GET /api/parts/:id/image — proxy foto (R2 o Supabase)
router.get('/image/:id', async (req, res) => {
  const id = Number(req.params.id)
  if (!id) return res.status(400).end()

  if (photoCache.has(id)) {
    const { buf, contentType } = photoCache.get(id)
    res.setHeader('Content-Type', contentType)
    res.setHeader('Cache-Control', 'no-cache')
    return res.send(buf)
  }

  const part = await prisma.part.findUnique({ where: { id }, select: { image_url: true } })
  if (!part?.image_url) return res.status(404).end()

  let buf, contentType
  try {
    if (part.image_url.startsWith('r2://') && r2) {
      const key = part.image_url.slice(5)
      const resp = await r2.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }))
      const chunks = []
      for await (const chunk of resp.Body) chunks.push(chunk)
      buf = Buffer.concat(chunks)
      contentType = resp.ContentType || 'image/jpeg'
    } else {
      const r = await fetch(part.image_url)
      if (!r.ok) return res.status(r.status).end()
      buf = Buffer.from(await r.arrayBuffer())
      contentType = r.headers.get('content-type') || 'image/jpeg'
    }
  } catch (e) {
    return res.status(502).end()
  }

  if (photoCache.size >= PHOTO_CACHE_MAX) photoCache.delete(photoCache.keys().next().value)
  photoCache.set(id, { buf, contentType })
  res.setHeader('Content-Type', contentType)
  res.setHeader('Cache-Control', 'no-cache')
  res.send(buf)
})

// GET /api/parts/stats — must come before /:id
router.get('/stats', async (req, res) => {
  const parts = await prisma.part.findMany({
    select: { stock_current: true, stock_min: true, cost_price: true }
  })
  const below = parts.filter(p => p.stock_current <= p.stock_min)
  const totalValue = parts.reduce((acc, p) => acc + (p.stock_current * (p.cost_price || 0)), 0)

  res.json({
    total_parts: parts.length,
    low_stock: below.length,
    total_value: Math.round(totalValue * 100) / 100
  })
})

// GET /api/parts/categories — union of used + predefined categories
router.get('/categories', async (req, res) => {
  const rows = await prisma.part.findMany({
    where: { category: { not: null } },
    select: { category: true },
    distinct: ['category']
  })
  const setting = await prisma.setting.findUnique({ where: { key: 'predefined_categories' } })
  const predefined = setting ? JSON.parse(setting.value) : []
  const all = [...new Set([...rows.map(r => r.category).filter(Boolean), ...predefined])].sort()
  res.json(all)
})

// POST /api/parts/categories — create predefined category
router.post('/categories', async (req, res) => {
  const { name } = req.body
  if (!name?.trim()) return res.status(400).json({ error: 'name requerido' })
  const setting = await prisma.setting.findUnique({ where: { key: 'predefined_categories' } })
  const list = setting ? JSON.parse(setting.value) : []
  if (!list.includes(name.trim())) list.push(name.trim())
  await prisma.setting.upsert({
    where: { key: 'predefined_categories' },
    update: { value: JSON.stringify(list) },
    create: { key: 'predefined_categories', value: JSON.stringify(list) }
  })
  res.json({ ok: true })
})

async function getCatPredefined() {
  const s = await prisma.setting.findUnique({ where: { key: 'predefined_categories' } })
  return s ? JSON.parse(s.value) : []
}
async function setCatPredefined(list) {
  await prisma.setting.upsert({
    where: { key: 'predefined_categories' },
    update: { value: JSON.stringify(list) },
    create: { key: 'predefined_categories', value: JSON.stringify(list) }
  })
}

// PUT /api/parts/categories/rename — { from, to }
router.put('/categories/rename', async (req, res) => {
  const { from, to } = req.body
  if (!from || !to) return res.status(400).json({ error: 'from y to requeridos' })
  const result = await prisma.part.updateMany({ where: { category: from }, data: { category: to.trim() } })
  const list = await getCatPredefined()
  const idx = list.indexOf(from)
  if (idx !== -1) { list[idx] = to.trim(); await setCatPredefined(list) }
  res.json({ updated: result.count })
})

// DELETE /api/parts/categories/:name — clears category from all parts
router.delete('/categories/:name', async (req, res) => {
  const name = decodeURIComponent(req.params.name)
  const result = await prisma.part.updateMany({ where: { category: name }, data: { category: null } })
  const list = await getCatPredefined()
  const filtered = list.filter(c => c !== name)
  if (filtered.length !== list.length) await setCatPredefined(filtered)
  res.json({ updated: result.count })
})

// GET /api/parts/manufacturers — distinct manufacturers (for filter dropdown)
router.get('/manufacturers', async (req, res) => {
  const rows = await prisma.part.findMany({
    where: { manufacturer: { not: null } },
    select: { manufacturer: true },
    distinct: ['manufacturer']
  })
  res.json(rows.map(r => r.manufacturer).filter(Boolean).sort())
})

// GET /api/parts (paginated)
router.get('/', async (req, res) => {
  const { category, low_stock, search, manufacturer, sort, location } = req.query
  const where = {}
  if (category) where.category = category
  if (manufacturer) where.manufacturer = manufacturer
  if (location) where.locations = { some: { location } }
  if (search) {
    const words = search.trim().split(/\s+/).filter(Boolean)
    if (words.length > 1) {
      // Todos los términos deben aparecer en algún campo (AND entre palabras, OR entre campos)
      where.AND = words.map(w => ({
        OR: [
          { name: { contains: w, mode: 'insensitive' } },
          { code: { contains: w, mode: 'insensitive' } },
          { description: { contains: w, mode: 'insensitive' } }
        ]
      }))
    } else {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } }
      ]
    }
  }

  const include = { locations: { orderBy: { location: 'asc' } } }
  const page = Math.max(1, parseInt(req.query.page) || 1)
  const pageSize = Math.min(500, Math.max(1, parseInt(req.query.page_size) || 50))

  if (sort === 'most_demanded') {
    // Aggregate OUT quantity per part, then filter/sort/paginate in memory
    const [parts, agg] = await Promise.all([
      prisma.part.findMany({ where, include }),
      prisma.stockMovement.groupBy({ by: ['part_id'], where: { type: 'OUT' }, _sum: { quantity: true } })
    ])
    const demandMap = {}
    for (const a of agg) demandMap[a.part_id] = a._sum.quantity || 0
    const enriched = parts.map(p => ({ ...p, shipped_qty: demandMap[p.id] || 0 }))
    enriched.sort((a, b) => b.shipped_qty - a.shipped_qty)
    const total = enriched.length
    const start = (page - 1) * pageSize
    return res.json({ data: enriched.slice(start, start + pageSize), total, page, page_size: pageSize })
  }

  if (low_stock === 'true') {
    const all = await prisma.part.findMany({ where, include, orderBy: { code: 'asc' } })
    const filtered = all.filter(p => p.stock_current <= p.stock_min)
    const total = filtered.length
    const start = (page - 1) * pageSize
    return res.json({ data: filtered.slice(start, start + pageSize), total, page, page_size: pageSize })
  }

  const [data, total, incomingAgg] = await Promise.all([
    prisma.part.findMany({ where, include, orderBy: { code: 'asc' }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.part.count({ where }),
    prisma.purchaseOrderLine.groupBy({
      by: ['part_id'],
      where: { order: { status: { in: ['DRAFT', 'SENT', 'LOCATING', 'PARTIAL'] } } },
      _sum: { quantity_ordered: true, quantity_received: true }
    })
  ])
  const incomingMap = {}
  for (const a of incomingAgg) {
    incomingMap[a.part_id] = Math.max(0, (a._sum.quantity_ordered || 0) - (a._sum.quantity_received || 0))
  }
  const naturalSort = (a, b) => a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: 'base' })
  const page_data = data.map(p => ({ ...p, stock_incoming: incomingMap[p.id] || 0 })).sort(naturalSort)
  res.json({ data: page_data, total, page, page_size: pageSize })
})

// GET /api/parts/locations — all distinct location names (for autocomplete)
router.get('/locations/all', async (req, res) => {
  const rows = await prisma.partLocation.findMany({
    select: { location: true },
    distinct: ['location'],
    orderBy: { location: 'asc' }
  })
  res.json(rows.map(r => r.location))
})

// GET /api/parts/:id/image-sign — returns a signed upload URL for direct client→Supabase upload
router.get('/:id/image-sign', async (req, res) => {
  const id = Number(req.params.id)
  const filename = `manual/${id}_${Date.now()}.jpg`
  const signRes = await fetch(`${SUPABASE_URL}/storage/v1/object/upload/sign/parts/${filename}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ upsert: true }),
  })
  if (!signRes.ok) {
    const t = await signRes.text()
    return res.status(500).json({ error: `Supabase sign error: ${t}` })
  }
  const { url } = await signRes.json()
  const signedURL = `${SUPABASE_URL}/storage/v1${url}`
  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/parts/${filename}`
  res.json({ signedURL, publicUrl })
})

// PATCH /api/parts/:id/image — save image_url after direct upload
router.patch('/:id/image', async (req, res) => {
  const id = Number(req.params.id)
  const { image_url } = req.body
  if (!image_url) return res.status(400).json({ error: 'image_url requerido' })
  const part = await prisma.part.update({ where: { id }, data: { image_url } })
  res.json({ image_url: part.image_url })
})

// POST /api/parts/:id/image-upload — receives base64 image from client, uploads to R2
router.post('/:id/image-upload', async (req, res) => {
  const id = Number(req.params.id)
  const { imageBase64 } = req.body
  if (!imageBase64) return res.status(400).json({ error: 'imageBase64 requerido' })
  const matches = imageBase64.match(/^data:([^;]+);base64,(.+)$/)
  if (!matches) return res.status(400).json({ error: 'Formato de imagen inválido' })
  const mimetype = matches[1]
  const buffer = Buffer.from(matches[2], 'base64')
  try {
    let image_url
    if (r2) {
      const ext = mimetype.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg'
      const key = `parts/${id}.${ext}`
      await r2.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: buffer, ContentType: mimetype }))
      image_url = `r2://${key}`
    } else {
      const filename = `manual/${id}_${Date.now()}.jpg`
      await supabaseUpload(filename, buffer, mimetype)
      image_url = `${SUPABASE_URL}/storage/v1/object/public/parts/${filename}`
    }
    await prisma.part.update({ where: { id }, data: { image_url } })
    photoCache.delete(id)
    res.json({ image_url })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
})

// POST /api/parts/:id/image — legacy fallback (kept for compatibility)
router.post('/:id/image', upload.single('image'), async (req, res) => {
  const id = Number(req.params.id)
  if (!req.file) return res.status(400).json({ error: 'No se recibió ninguna imagen' })
  try {
    let image_url
    if (r2) {
      // Subir a R2
      const ext = req.file.mimetype.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg'
      const key = `parts/${id}.${ext}`
      await r2.send(new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        Body: req.file.buffer,
        ContentType: req.file.mimetype,
      }))
      image_url = `r2://${key}`
    } else {
      // Fallback Supabase
      const filename = `manual/${id}_${Date.now()}.jpg`
      await supabaseUpload(filename, req.file.buffer, req.file.mimetype)
      image_url = `${SUPABASE_URL}/storage/v1/object/public/parts/${filename}`
    }
    await prisma.part.update({ where: { id }, data: { image_url } })
    // Invalidar caché en memoria para que la próxima petición descargue la nueva
    photoCache.delete(id)
    res.json({ image_url })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
})

// GET /api/parts/:id
router.get('/:id', async (req, res) => {
  const id = Number(req.params.id)
  const [part, incomingLines] = await Promise.all([
    prisma.part.findUnique({
      where: { id },
      include: {
        movements: { orderBy: { created_at: 'desc' }, take: 20 },
        locations: { orderBy: { location: 'asc' } }
      }
    }),
    prisma.purchaseOrderLine.findMany({
      where: {
        part_id: id,
        order: { status: { in: ['DRAFT', 'SENT', 'LOCATING', 'PARTIAL'] } }
      },
      include: {
        order: { select: { id: true, reference: true, status: true, order_date: true, eta: true, supplier: { select: { name: true } } } }
      },
      orderBy: { order: { order_date: 'asc' } }
    })
  ])
  if (!part) return res.status(404).json({ error: 'Part not found' })

  const incoming = incomingLines.map(l => ({
    order_id: l.order.id,
    reference: l.order.reference,
    status: l.order.status,
    supplier: l.order.supplier?.name,
    order_date: l.order.order_date,
    eta: l.order.eta,
    quantity_ordered: l.quantity_ordered,
    quantity_received: l.quantity_received,
    pending: Math.max(0, l.quantity_ordered - l.quantity_received),
  }))
  const stock_incoming = incoming.reduce((s, l) => s + l.pending, 0)

  res.json({ ...part, stock_incoming, incoming_lines: incoming })
})

// GET /api/parts/:id/lots — stock desglosado por lote (FIFO order)
router.get('/:id/lots', async (req, res) => {
  const part_id = Number(req.params.id)
  const lots = await prisma.lot.findMany({
    where: { part_id },
    include: {
      locations: { where: { stock: { gt: 0 } }, orderBy: { location: 'asc' } },
      order: { select: { id: true, reference: true } }
    },
    orderBy: { created_at: 'asc' }
  })
  // Only return lots that still have stock somewhere
  res.json(lots.filter(l => l.locations.length > 0))
})

// GET /api/parts/:id/fifo — sugerencia FIFO para picking (lista plana lote+ubicación)
router.get('/:id/fifo', async (req, res) => {
  const part_id = Number(req.params.id)
  const lotLocs = await prisma.lotLocation.findMany({
    where: { stock: { gt: 0 }, lot: { part_id } },
    include: { lot: { select: { id: true, lot_number: true, created_at: true } } },
    orderBy: { lot: { created_at: 'asc' } }
  })
  res.json(lotLocs.map(ll => ({
    lot_id: ll.lot.id,
    lot_number: ll.lot.lot_number,
    lot_date: ll.lot.created_at,
    location: ll.location,
    stock: ll.stock
  })))
})

// GET /api/parts/:id/movements?page=1&limit=50 — historial completo de movimientos
router.get('/:id/movements', async (req, res) => {
  const part_id = Number(req.params.id)
  const page = Math.max(1, Number(req.query.page) || 1)
  const limit = Math.min(200, Number(req.query.limit) || 50)
  const [movements, total] = await Promise.all([
    prisma.stockMovement.findMany({
      where: { part_id },
      orderBy: { created_at: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.stockMovement.count({ where: { part_id } })
  ])

  // Enrich with reference names for traceability
  const purchaseIds = [...new Set(movements.filter(m => m.reference_type === 'PURCHASE' && m.reference_id).map(m => m.reference_id))]
  const deliveryIds = [...new Set(movements.filter(m => m.reference_type === 'DELIVERY' && m.reference_id).map(m => m.reference_id))]
  const [purchases, deliveries] = await Promise.all([
    purchaseIds.length ? prisma.purchaseOrder.findMany({ where: { id: { in: purchaseIds } }, select: { id: true, reference: true } }) : [],
    deliveryIds.length ? prisma.deliveryNote.findMany({ where: { id: { in: deliveryIds } }, select: { id: true, odoo_partner_name: true } }) : [],
  ])
  const purchaseMap = Object.fromEntries(purchases.map(p => [p.id, p.reference || `OC-${p.id}`]))
  const deliveryMap = Object.fromEntries(deliveries.map(d => [d.id, d.odoo_partner_name || `ALB-${d.id}`]))

  const enriched = movements.map(m => ({
    ...m,
    reference_name: m.reference_type === 'PURCHASE' ? purchaseMap[m.reference_id] :
                    m.reference_type === 'DELIVERY' ? deliveryMap[m.reference_id] : null
  }))

  res.json({ movements: enriched, total, page, pages: Math.ceil(total / limit) })
})

// GET /api/parts/:id/purchases — historial de OC donde aparece esta pieza
router.get('/:id/purchases', async (req, res) => {
  const part_id = Number(req.params.id)
  const lines = await prisma.purchaseOrderLine.findMany({
    where: { part_id },
    include: {
      order: { select: { id: true, reference: true, status: true, order_date: true, supplier: { select: { name: true } } } },
      receiptLines: { orderBy: { created_at: 'asc' } }
    },
    orderBy: { order: { order_date: 'desc' } }
  })
  res.json(lines)
})

// POST /api/parts/:id/locations — añadir o actualizar stock en una ubicación
router.post('/:id/locations', async (req, res) => {
  const part_id = Number(req.params.id)
  const { location, stock } = req.body
  if (!location) return res.status(400).json({ error: 'location requerida' })

  const part = await prisma.part.findUnique({ where: { id: part_id } })
  if (!part) return res.status(404).json({ error: 'Part not found' })

  const partLoc = await prisma.partLocation.upsert({
    where: { part_id_location: { part_id, location } },
    update: { stock: Number(stock) || 0 },
    create: { part_id, location, stock: Number(stock) || 0 }
  })

  // Recalcular stock_current como suma de todas las ubicaciones
  const agg = await prisma.partLocation.aggregate({ where: { part_id }, _sum: { stock: true } })
  await prisma.part.update({ where: { id: part_id }, data: { stock_current: agg._sum.stock || 0 } })

  res.json(partLoc)
})

// DELETE /api/parts/:id/locations/:location — eliminar una ubicación
router.delete('/:id/locations/:location', async (req, res) => {
  const part_id = Number(req.params.id)
  const location = decodeURIComponent(req.params.location)

  const partLoc = await prisma.partLocation.findUnique({
    where: { part_id_location: { part_id, location } }
  })
  if (!partLoc) return res.status(404).json({ error: 'Ubicación no encontrada' })
  if (partLoc.stock > 0) return res.status(409).json({ error: 'No se puede eliminar una ubicación con stock > 0' })

  await prisma.partLocation.delete({ where: { part_id_location: { part_id, location } } })
  res.json({ ok: true })
})

// POST /api/parts
router.post('/', async (req, res) => {
  try {
    const part = await prisma.part.create({ data: req.body })
    res.status(201).json(part)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// PUT /api/parts/:id
router.put('/:id', async (req, res) => {
  try {
    const { code, name, description, category, unit, stock_min, cost_price, manufacturer, image_url } = req.body
    const part = await prisma.part.update({
      where: { id: Number(req.params.id) },
      data: { code, name, description, category, unit, stock_min, cost_price, manufacturer, image_url }
    })
    res.json(part)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// DELETE /api/parts/:id
router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id)
  const part = await prisma.part.findUnique({ where: { id } })
  if (!part) return res.status(404).json({ error: 'Part not found' })
  if (part.stock_current !== 0) return res.status(409).json({ error: 'Cannot delete part with stock > 0' })

  const refs = await prisma.stockMovement.count({ where: { part_id: id } })
  if (refs > 0) return res.status(409).json({ error: 'Part has stock movement history' })

  await prisma.part.delete({ where: { id } })
  res.json({ ok: true })
})

// POST /api/parts/:id/adjust — manual stock adjustment
// POST /api/parts/:id/scrap — dar de baja por defecto/rotura/caducidad
router.post('/:id/scrap', async (req, res) => {
  const part_id = Number(req.params.id)
  const { location, quantity, reason, user_name } = req.body

  if (!quantity || Number(quantity) <= 0) {
    return res.status(400).json({ error: 'Cantidad inválida' })
  }

  const qty = Number(quantity)

  try {
    await prisma.$transaction(async (tx) => {
      if (location) {
        const src = await tx.partLocation.findUnique({
          where: { part_id_location: { part_id, location } }
        })
        if (!src || src.stock < qty) {
          throw new Error(`Stock insuficiente en "${location}": disponible ${src?.stock ?? 0}`)
        }
        await tx.partLocation.update({
          where: { part_id_location: { part_id, location } },
          data: { stock: { decrement: qty } }
        })
        // Descontar LotLocation FIFO
        const lotLocs = await tx.lotLocation.findMany({
          where: { location, stock: { gt: 0 }, lot: { part_id } },
          include: { lot: true },
          orderBy: { lot: { created_at: 'asc' } }
        })
        let remaining = qty
        for (const ll of lotLocs) {
          if (remaining <= 0) break
          const deduct = Math.min(ll.stock, remaining)
          await tx.lotLocation.update({ where: { id: ll.id }, data: { stock: { decrement: deduct } } })
          remaining -= deduct
        }
      }

      if (!location) {
        // Sin ubicación: descontar de PartLocations (mayor stock primero)
        const locs = await tx.partLocation.findMany({ where: { part_id, stock: { gt: 0 } }, orderBy: { stock: 'desc' } })
        let remaining = qty
        for (const loc of locs) {
          if (remaining <= 0) break
          const deduct = Math.min(loc.stock, remaining)
          await tx.partLocation.update({ where: { id: loc.id }, data: { stock: { decrement: deduct } } })
          remaining -= deduct
        }
      }
      // Recalcular stock_current desde suma de PartLocation (siempre)
      const agg = await tx.partLocation.aggregate({ where: { part_id }, _sum: { stock: true } })
      await tx.part.update({ where: { id: part_id }, data: { stock_current: agg._sum.stock || 0 } })

      await tx.stockMovement.create({
        data: {
          part_id, type: 'OUT', quantity: qty,
          reference_type: 'SCRAP',
          notes: `Baja: ${reason || 'sin motivo'}${location ? ` — desde ${location}` : ''}`,
          user_name: user_name || null
        }
      })
    })

    const part = await prisma.part.findUnique({
      where: { id: part_id },
      include: {
        movements: { orderBy: { created_at: 'desc' }, take: 20 },
        locations: { orderBy: { location: 'asc' } }
      }
    })
    res.json(part)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// POST /api/parts/:id/transfer — mover stock entre ubicaciones
router.post('/:id/transfer', async (req, res) => {
  const part_id = Number(req.params.id)
  const { from_location, to_location, quantity, user_name } = req.body

  if (!from_location || !to_location || !quantity || Number(quantity) <= 0) {
    return res.status(400).json({ error: 'Faltan campos: from_location, to_location, quantity' })
  }
  if (from_location === to_location) {
    return res.status(400).json({ error: 'El origen y destino no pueden ser iguales' })
  }

  const qty = Number(quantity)

  try {
    await prisma.$transaction(async (tx) => {
      const src = await tx.partLocation.findUnique({
        where: { part_id_location: { part_id, location: from_location } }
      })
      if (!src || src.stock < qty) {
        throw new Error(`Stock insuficiente en "${from_location}": disponible ${src?.stock ?? 0}`)
      }

      // Mover PartLocation — eliminar fila si queda a 0
      const newSrcStock = src.stock - qty
      if (newSrcStock === 0) {
        await tx.partLocation.delete({
          where: { part_id_location: { part_id, location: from_location } }
        })
      } else {
        await tx.partLocation.update({
          where: { part_id_location: { part_id, location: from_location } },
          data: { stock: newSrcStock }
        })
      }
      await tx.partLocation.upsert({
        where: { part_id_location: { part_id, location: to_location } },
        update: { stock: { increment: qty } },
        create: { part_id, location: to_location, stock: qty }
      })

      // Mover LotLocation en FIFO desde origen a destino
      const lotLocs = await tx.lotLocation.findMany({
        where: { location: from_location, stock: { gt: 0 }, lot: { part_id } },
        include: { lot: true },
        orderBy: { lot: { created_at: 'asc' } }
      })
      let remaining = qty
      for (const ll of lotLocs) {
        if (remaining <= 0) break
        const move = Math.min(ll.stock, remaining)
        const newLotStock = ll.stock - move
        if (newLotStock === 0) {
          await tx.lotLocation.delete({ where: { id: ll.id } })
        } else {
          await tx.lotLocation.update({
            where: { id: ll.id },
            data: { stock: newLotStock }
          })
        }
        await tx.lotLocation.upsert({
          where: { lot_id_location: { lot_id: ll.lot_id, location: to_location } },
          update: { stock: { increment: move } },
          create: { lot_id: ll.lot_id, location: to_location, stock: move }
        })
        remaining -= move
      }

      await tx.stockMovement.create({
        data: {
          part_id, type: 'OUT', quantity: qty,
          reference_type: 'TRANSFER',
          notes: `Traspaso ${from_location} → ${to_location}`,
          user_name: user_name || null
        }
      })
    })

    const part = await prisma.part.findUnique({
      where: { id: part_id },
      include: {
        movements: { orderBy: { created_at: 'desc' }, take: 20 },
        locations: { orderBy: { location: 'asc' } }
      }
    })
    res.json(part)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

router.post('/:id/adjust', async (req, res) => {
  const { quantity, notes, user_name, location } = req.body
  const id = Number(req.params.id)
  if (typeof quantity !== 'number') return res.status(400).json({ error: 'quantity required' })

  const part = await prisma.part.findUnique({ where: { id } })
  if (!part) return res.status(404).json({ error: 'Part not found' })

  let movement
  await prisma.$transaction(async (tx) => {
    if (location) {
      await tx.partLocation.upsert({
        where: { part_id_location: { part_id: id, location } },
        update: { stock: { increment: quantity } },
        create: { part_id: id, location, stock: quantity }
      })
      const agg = await tx.partLocation.aggregate({ where: { part_id: id }, _sum: { stock: true } })
      await tx.part.update({ where: { id }, data: { stock_current: agg._sum.stock || 0 } })
    } else {
      // Sin ubicación: upsert en ALMACÉN para mantener PartLocation sincronizado
      await tx.partLocation.upsert({
        where: { part_id_location: { part_id: id, location: 'ALMACÉN' } },
        update: { stock: { increment: quantity } },
        create: { part_id: id, location: 'ALMACÉN', stock: quantity }
      })
      const agg = await tx.partLocation.aggregate({ where: { part_id: id }, _sum: { stock: true } })
      await tx.part.update({ where: { id }, data: { stock_current: agg._sum.stock || 0 } })
    }
    movement = await tx.stockMovement.create({
      data: {
        part_id: id,
        type: quantity >= 0 ? 'IN' : 'OUT',
        quantity: Math.abs(quantity),
        reference_type: 'ADJUSTMENT',
        notes,
        user_name: user_name || null
      }
    })
  })

  const updated = await prisma.part.findUnique({
    where: { id },
    include: { locations: { orderBy: { location: 'asc' } } }
  })
  res.json({ part: updated, movement })
})

module.exports = router
