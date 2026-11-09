// Evita que una misma acción se procese dos veces a la vez sobre el mismo documento
// (doble clic, doble escaneo, reintento del navegador). Bloqueo en memoria:
// vale porque la app corre en una sola instancia de Render.
const held = new Set()

function inFlightLock(scope) {
  return (req, res, next) => {
    const key = `${scope}:${req.params.id}`
    if (held.has(key)) {
      return res.status(409).json({ error: 'Esta acción ya se está procesando, espera un momento' })
    }
    held.add(key)
    let released = false
    const release = () => { if (!released) { released = true; held.delete(key) } }
    res.on('finish', release)
    res.on('close', release)
    next()
  }
}

module.exports = inFlightLock
