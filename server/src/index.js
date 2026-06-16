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

// TEMP: importar proveedores y piezas desde SQLite
app.post('/api/admin/import', require('./middleware/auth'), async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Solo admin' })
  const prisma = require('./lib/prisma')
  const { suppliers = [], parts = [] } = req.body
  try {
    for (const s of suppliers) {
      await prisma.supplier.upsert({ where: { id: s.id }, update: {}, create: { id: s.id, name: s.name, email: s.email, phone: s.phone, address: s.address, notes: s.notes } })
    }
    const BATCH = 200
    for (let i = 0; i < parts.length; i += BATCH) {
      await prisma.$transaction(parts.slice(i, i + BATCH).map(p => prisma.part.upsert({
        where: { id: p.id }, update: {},
        create: { id: p.id, code: p.code, name: p.name, description: p.description, category: p.category, unit: p.unit ?? 'ud', stock_current: p.stock_current ?? 0, stock_min: p.stock_min ?? 0, location: p.location, odoo_product_id: p.odoo_product_id, odoo_product_name: p.odoo_product_name, manufacturer: p.manufacturer, cost_price: p.cost_price, image_url: p.image_url }
      })))
    }
    res.json({ ok: true, suppliers: suppliers.length, parts: parts.length })
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
