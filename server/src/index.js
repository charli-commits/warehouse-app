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

app.use(express.json())
app.use('/uploads', express.static(require('path').join(__dirname, '..', 'uploads')))

app.get('/api/health', (req, res) => res.json({ ok: true }))

// Auth routes — login y GET users son públicos, el resto usa el middleware global
app.use('/api/auth', require('./routes/auth'))

// Middleware JWT para todas las demás rutas /api/*
app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/auth/')) return next()
  return requireAuth(req, res, next)
})

// TEMP: stock import endpoint — remove after use
const { PrismaClient } = require('@prisma/client')
const _prismaImport = new PrismaClient()
app.post('/api/import-stock', async (req, res) => {
  const secret = req.headers['x-import-secret']
  if (secret !== 'wh-import-2026') return res.status(403).json({ error: 'forbidden' })
  const parts = req.body
  if (!Array.isArray(parts)) return res.status(400).json({ error: 'expected array' })
  try {
    await _prismaImport.partLocation.deleteMany()
    await _prismaImport.stockMovement.deleteMany()
    await _prismaImport.part.deleteMany()
    let inserted = 0
    for (const d of parts) {
      const part = await _prismaImport.part.create({
        data: { code: d.code, name: d.name, category: d.category, image_url: d.image_url, stock_current: d.stock_current, stock_min: 0, unit: 'ud' }
      })
      for (const [loc, qty] of Object.entries(d.locations || {})) {
        await _prismaImport.partLocation.create({ data: { part_id: part.id, location: loc, stock: qty } })
      }
      inserted++
    }
    // Reset sequences
    await _prismaImport.$executeRawUnsafe(`SELECT setval('"Part_id_seq"', (SELECT MAX(id) FROM "Part"))`)
    await _prismaImport.$executeRawUnsafe(`SELECT setval('"PartLocation_id_seq"', (SELECT MAX(id) FROM "PartLocation"))`)
    res.json({ ok: true, inserted })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
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
