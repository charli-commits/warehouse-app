module.exports = function requireWrite(req, res, next) {
  if (req.user?.role === 'viewer') {
    return res.status(403).json({ error: 'Tu rol no permite realizar esta acción' })
  }
  next()
}
