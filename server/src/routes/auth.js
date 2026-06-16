const express = require('express')
const router = express.Router()
const bcrypt = require('bcrypt')
const rateLimit = require('express-rate-limit')
const prisma = require('../lib/prisma')
const { sign } = require('../middleware/auth')

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 20,
  message: { error: 'Demasiados intentos. Espera 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
})

const VALID_ROLES = ['admin', 'agente_sat', 'agente_almacen', 'operator']

// POST /api/auth/login — público, con rate limit
router.post('/login', loginLimiter, async (req, res) => {
  const { name, pin } = req.body
  if (!name || !pin) return res.status(400).json({ error: 'Nombre y PIN requeridos' })

  const user = await prisma.user.findUnique({ where: { name } })
  if (!user || !user.active) return res.status(401).json({ error: 'Usuario no encontrado' })

  let match = false
  if (user.pin.startsWith('$2b$')) {
    // PIN ya hasheado
    match = await bcrypt.compare(String(pin), user.pin)
  } else {
    // PIN en texto plano — comparar y migrar automáticamente al hashed
    if (user.pin === String(pin)) {
      match = true
      const hashed = await bcrypt.hash(String(pin), 10)
      await prisma.user.update({ where: { id: user.id }, data: { pin: hashed } })
    }
  }

  if (!match) return res.status(401).json({ error: 'PIN incorrecto' })

  const token = sign({ id: user.id, name: user.name, role: user.role })
  res.json({ id: user.id, name: user.name, role: user.role, token })
})

// GET /api/auth/users — público (pantalla de login necesita la lista)
router.get('/users', async (req, res) => {
  const users = await prisma.user.findMany({
    where: { active: true },
    select: { id: true, name: true, role: true },
    orderBy: { name: 'asc' }
  })
  res.json(users)
})

// POST /api/auth/seed — solo funciona si no hay usuarios (bootstrap inicial)
router.post('/seed', async (req, res) => {
  const count = await prisma.user.count()
  if (count > 0) return res.status(403).json({ error: 'Ya existen usuarios' })
  const { name, pin, role } = req.body
  const hashed = await bcrypt.hash(String(pin), 10)
  const user = await prisma.user.create({ data: { name, pin: hashed, role: role || 'admin', active: true } })
  res.json({ id: user.id, name: user.name, role: user.role })
})

// POST /api/auth/users — crear usuario (requiere auth, verificado por middleware global)
router.post('/users', async (req, res) => {
  const { name, pin, role } = req.body
  if (!name || !pin) return res.status(400).json({ error: 'Nombre y PIN requeridos' })
  if (String(pin).length !== 4 || !/^\d{4}$/.test(String(pin))) {
    return res.status(400).json({ error: 'El PIN debe ser exactamente 4 dígitos' })
  }
  if (role && !VALID_ROLES.includes(role)) return res.status(400).json({ error: 'Rol no válido' })
  try {
    const hashed = await bcrypt.hash(String(pin), 10)
    const user = await prisma.user.create({
      data: { name, pin: hashed, role: role || 'operator' }
    })
    res.status(201).json({ id: user.id, name: user.name, role: user.role })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// PATCH /api/auth/users/:id — actualizar rol
router.patch('/users/:id', async (req, res) => {
  const { role } = req.body
  if (!VALID_ROLES.includes(role)) return res.status(400).json({ error: 'Rol no válido' })
  try {
    const user = await prisma.user.update({
      where: { id: Number(req.params.id) },
      data: { role }
    })
    res.json({ id: user.id, name: user.name, role: user.role })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// DELETE /api/auth/users/:id — desactivar usuario
router.delete('/users/:id', async (req, res) => {
  await prisma.user.update({ where: { id: Number(req.params.id) }, data: { active: false } })
  res.json({ ok: true })
})

module.exports = router
