require('dotenv').config()
const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const path = require('path')
const requireAuth = require('./middleware/auth')

const app = express()

// Security headers
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      'img-src': ["'self'", 'data:', 'https://wtpaggzdwhpxxtatcpxo.supabase.co'],
    },
  },
}))

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
app.use('/uploads', express.static(require('path').join(__dirname, '..', 'uploads')))

app.get('/api/health', (req, res) => res.json({ ok: true }))

// Auth routes — login y GET users son públicos, el resto usa el middleware global
app.use('/api/auth', require('./routes/auth'))

// TEMP: bulk image URL update
const { PrismaClient: _PC } = require('@prisma/client')
const _pi = new _PC()
app.post('/api/update-images', async (req, res) => {
  if (req.headers['x-import-secret'] !== 'wh-import-2026') return res.status(403).json({ error: 'forbidden' })
  const updates = req.body
  if (!Array.isArray(updates)) return res.status(400).json({ error: 'expected array' })
  let updated = 0
  for (const { code, image_url } of updates) {
    const r = await _pi.part.updateMany({ where: { code }, data: { image_url } })
    updated += r.count
  }
  res.json({ ok: true, updated })
})

// Middleware JWT para todas las demás rutas /api/*
app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/auth/')) return next()
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
