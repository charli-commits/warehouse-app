import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'

export default function Audit() {
  const navigate = useNavigate()
  const [audits, setAudits] = useState([])
  const [locations, setLocations] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', notes: '', location_filter: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    api.getAudits().then(setAudits).catch(() => {})
    api.getPartLocations().then(locs => {
      setLocations([...new Set(locs.map(l => l.location).filter(Boolean))].sort())
    }).catch(() => {})
  }, [])

  async function handleCreate(e) {
    e.preventDefault()
    if (!form.name.trim()) return setError('Nombre requerido')
    setSaving(true); setError(null)
    try {
      const audit = await api.createAudit(form)
      navigate(`/auditoria/${audit.id}`)
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  const statusLabel = { OPEN: 'En curso', CLOSED: 'Cerrada' }
  const statusColor = { OPEN: 'bg-blue-100 text-blue-700', CLOSED: 'bg-gray-100 text-gray-600' }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Auditorías de inventario</h1>
          <p className="text-sm text-gray-500 mt-1">Recuento físico y ajuste de stock</p>
        </div>
        <button
          onClick={() => setShowForm(f => !f)}
          className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700"
        >
          + Nueva auditoría
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white border rounded-lg p-4 space-y-4">
          <h2 className="font-semibold text-gray-800">Nueva auditoría</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Ej: Auditoría anual 2026, Recuento zona A"
                className="w-full border rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Pre-cargar ubicación</label>
              <select
                value={form.location_filter}
                onChange={e => setForm(f => ({ ...f, location_filter: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Sin filtro (auditoría en blanco)</option>
                {locations.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
              <p className="text-xs text-gray-400 mt-1">Carga automáticamente todas las piezas de esa ubicación</p>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
            <input
              type="text"
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Opcional"
              className="w-full border rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 border rounded text-sm hover:bg-gray-50">Cancelar</button>
            <button type="submit" disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Creando…' : 'Crear y abrir'}
            </button>
          </div>
        </form>
      )}

      {audits.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">📋</p>
          <p className="text-sm">Sin auditorías. Crea la primera.</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Nombre</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Estado</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Líneas</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {audits.map(a => (
                <tr
                  key={a.id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => navigate(`/auditoria/${a.id}`)}
                >
                  <td className="px-4 py-3 font-medium text-gray-900">{a.name}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor[a.status]}`}>
                      {statusLabel[a.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{a._count.lines} líneas</td>
                  <td className="px-4 py-3 text-gray-400">{new Date(a.created_at).toLocaleDateString('es-ES')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
