const jwt = require('jsonwebtoken')

const JWT_SECRET = process.env.JWT_SECRET || 'warehouse-dev-secret-change-in-production'

module.exports = function requireAuth(req, res, next) {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autorizado' })
  }
  try {
    req.user = jwt.verify(header.slice(7), JWT_SECRET)
    next()
  } catch {
    return res.status(401).json({ error: 'Sesión expirada, vuelve a iniciar sesión' })
  }
}

module.exports.JWT_SECRET = JWT_SECRET
module.exports.sign = (payload) => jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' })
