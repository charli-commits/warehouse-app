require('dotenv').config()
const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const path = require('path')
const requireAuth = require('./middleware/auth')

const app = express()

// Security headers
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }))

// CORS — app interna, permitir orígenes localhost/LAN y peticiones sin origin
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true) // apps nativas, Postman, mismo servidor
    const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/
    cb(null, isLocal.test(origin) ? true : new Error('CORS: origen no permitido'))
  },
  credentials: true,
}))

app.use(express.json({ limit: '10mb' }))

// TEMP: importar datos restantes de SQLite (sin albaranes)
app.post('/api/admin/import-all', require('./middleware/auth'), async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Solo admin' })
  const prisma = require('./lib/prisma')
  const { partLocations=[], stockMovements=[], lots=[], lotLocations=[], audits=[], auditLines=[], users=[] } = req.body
  const BATCH = 200
  try {
    // Usuarios adicionales
    for (const u of users) {
      await prisma.user.upsert({ where: { name: u.name }, update: {}, create: { name: u.name, pin: u.pin, role: u.role, active: u.active === 1 || u.active === true } })
    }
    // Ubicaciones de piezas
    for (let i = 0; i < partLocations.length; i += BATCH) {
      await prisma.$transaction(partLocations.slice(i, i+BATCH).map(l => prisma.partLocation.upsert({
        where: { part_id_location: { part_id: l.part_id, location: l.location } },
        update: { stock: l.stock },
        create: { id: l.id, part_id: l.part_id, location: l.location, stock: l.stock }
      })))
    }
    // Movimientos de stock (created_at viene como Unix ms desde SQLite)
    const toDate = v => v ? (typeof v === 'number' ? new Date(v) : new Date(v)) : new Date()
    for (let i = 0; i < stockMovements.length; i += BATCH) {
      await prisma.$transaction(stockMovements.slice(i, i+BATCH).map(m => prisma.stockMovement.upsert({
        where: { id: m.id }, update: {},
        create: { id: m.id, part_id: m.part_id, type: m.type, quantity: m.quantity, reference_type: m.reference_type ?? null, reference_id: m.reference_id ?? null, notes: m.notes ?? null, user_name: m.user_name ?? null, created_at: toDate(m.created_at) }
      })))
    }
    // Lots y LotLocations
    for (const l of lots) {
      await prisma.lot.upsert({ where: { id: l.id }, update: {}, create: { id: l.id, part_id: l.part_id, lot_number: l.lot_number, purchase_order_id: null, created_at: toDate(l.created_at) } })
    }
    for (const l of lotLocations) {
      await prisma.lotLocation.upsert({ where: { id: l.id }, update: {}, create: { id: l.id, lot_id: l.lot_id, location: l.location, stock: l.stock ?? 0 } })
    }
    // Auditorías
    for (const a of audits) {
      await prisma.audit.upsert({ where: { id: a.id }, update: {}, create: { name: a.name, status: a.status, notes: a.notes ?? null, created_at: toDate(a.created_at), closed_at: a.closed_at ? toDate(a.closed_at) : null } })
    }
    for (const a of auditLines) {
      await prisma.auditLine.upsert({ where: { id: a.id }, update: {}, create: { audit_id: a.audit_id, part_id: a.part_id, location: a.location, system_stock: a.system_stock ?? 0, counted_stock: a.counted_stock ?? null, difference: a.difference ?? null, adjusted: a.adjusted === 1 || a.adjusted === true } })
    }
    res.json({ ok: true, partLocations: partLocations.length, stockMovements: stockMovements.length, users: users.length })
  } catch (e) { res.status(500).json({ error: e.message }) }
})
app.use('/uploads', express.static(require('path').join(__dirname, '..', 'uploads')))

app.get('/api/health', (req, res) => res.json({ ok: true }))

// Auth routes — login y GET users son públicos, el resto usa el middleware global
app.use('/api/auth', require('./routes/auth'))

// Middleware JWT para todas las demás rutas /api/*
app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/auth/')) return next() // ya gestionado arriba
  return requireAuth(req, res, next)
})

app.use('/api/parts',       require('./routes/parts'))
app.use('/api/suppliers',   require('./routes/suppliers'))
app.use('/api/purchases',   require('./routes/purchases'))
app.use('/api/deliveries',  require('./routes/deliveries'))
app.use('/api/odoo',        require('./routes/odoo'))
app.use('/api/locations',   require('./routes/locations'))
app.use('/api/dashboard',   require('./routes/dashboard'))
app.use('/api/disassembly', require('./routes/disassembly'))
app.use('/api/audits',      require('./routes/audits'))
app.use('/api/search',      require('./routes/search'))

// En producción, servir el build del cliente React
if (process.env.NODE_ENV === 'production') {
  const clientDist = path.join(__dirname, '..', '..', 'client', 'dist')
  app.use(express.static(clientDist))
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'))
  })
}

const PORT = process.env.PORT || 3001
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`))
