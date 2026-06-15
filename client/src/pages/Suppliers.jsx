import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import Modal from '../components/ui/Modal'

const empty = { name: '', contact_name: '', email: '', phone: '', lead_time_days: '', notes: '', manufacturer: '' }

function SupplierForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState({ ...empty, ...initial })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const data = { ...form, lead_time_days: form.lead_time_days !== '' ? Number(form.lead_time_days) : null }
      await onSave(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const field = (label, key, type = 'text', props = {}) => (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input
        type={type}
        value={form[key]}
        onChange={e => set(key, e.target.value)}
        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        {...props}
      />
    </div>
  )

  return (
    <form onSubmit={handleSubmit} className="p-6 space-y-4">
      {field('Nombre *', 'name', 'text', { required: true })}
      <div className="grid grid-cols-2 gap-4">
        {field('Persona de contacto', 'contact_name')}
        {field('Días de entrega', 'lead_time_days', 'number', { min: 0, placeholder: '5' })}
      </div>
      <div className="grid grid-cols-2 gap-4">
        {field('Email', 'email', 'email')}
        {field('Teléfono', 'phone', 'tel')}
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Fabricante / Marca</label>
        <input type="text" list="supplier-mfr-list" value={form.manufacturer || ''}
          onChange={e => set('manufacturer', e.target.value)}
          placeholder="Ej: Titanium Strength"
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <datalist id="supplier-mfr-list">
          <option value="Titanium Strength" />
          <option value="Force USA" />
        </datalist>
        <p className="text-xs text-gray-400 mt-1">Piezas de esta marca aparecerán al crear una orden de compra para este proveedor.</p>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Notas</label>
        <textarea
          value={form.notes}
          onChange={e => set('notes', e.target.value)}
          rows={2}
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancelar</button>
        <button type="submit" disabled={saving} className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium px-5 py-2 rounded-md">
          {saving ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </form>
  )
}

export default function Suppliers() {
  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)

  const load = () => api.getSuppliers().then(setSuppliers).finally(() => setLoading(false))
  useEffect(() => { load() }, [])

  function openCreate() { setEditing(null); setShowForm(true) }
  function openEdit(s) { setEditing(s); setShowForm(true) }
  function closeForm() { setShowForm(false); setEditing(null) }

  async function handleSave(data) {
    if (editing) await api.updateSupplier(editing.id, data)
    else await api.createSupplier(data)
    closeForm()
    load()
  }

  async function handleDelete(id) {
    if (!confirm('¿Eliminar este proveedor?')) return
    try {
      await api.deleteSupplier(id)
      load()
    } catch (err) {
      alert(err.message)
    }
  }

  return (
    <div className="p-4 md:p-8">
      <div className="flex items-center justify-between mb-4 md:mb-6">
        <h1 className="text-xl md:text-2xl font-bold text-gray-900">Proveedores</h1>
        <button onClick={openCreate} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-3 py-2 md:px-4 rounded-md">
          + Nuevo
        </button>
      </div>

      {/* DESKTOP: tabla */}
      <div className="hidden md:block bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Nombre</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Contacto</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Email</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Teléfono</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Entrega</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Cargando...</td></tr>
            ) : suppliers.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No hay proveedores</td></tr>
            ) : suppliers.map(s => (
              <tr key={s.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{s.name}</td>
                <td className="px-4 py-3 text-gray-600">{s.contact_name || '—'}</td>
                <td className="px-4 py-3 text-gray-600">
                  {s.email ? <a href={`mailto:${s.email}`} className="text-blue-600 hover:underline">{s.email}</a> : '—'}
                </td>
                <td className="px-4 py-3 text-gray-600">{s.phone || '—'}</td>
                <td className="px-4 py-3 text-gray-600">{s.lead_time_days != null ? `${s.lead_time_days} días` : '—'}</td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => openEdit(s)} className="text-gray-400 hover:text-blue-600 mr-3 text-xs font-medium">Editar</button>
                  <button onClick={() => handleDelete(s.id)} className="text-gray-400 hover:text-red-600 text-xs font-medium">Eliminar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* MOBILE: tarjetas */}
      <div className="md:hidden space-y-2">
        {loading ? (
          <div className="text-center py-8 text-gray-400 text-sm">Cargando...</div>
        ) : suppliers.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">No hay proveedores</div>
        ) : suppliers.map(s => (
          <div key={s.id} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-start justify-between">
              <div className="font-semibold text-gray-900">{s.name}</div>
              <button onClick={() => openEdit(s)} className="text-xs text-blue-600 font-medium">Editar</button>
            </div>
            {s.contact_name && <div className="text-xs text-gray-500 mt-0.5">{s.contact_name}</div>}
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-gray-500">
              {s.phone && <a href={`tel:${s.phone}`} className="text-blue-600">📞 {s.phone}</a>}
              {s.email && <a href={`mailto:${s.email}`} className="text-blue-600 truncate">✉ {s.email}</a>}
              {s.lead_time_days != null && <span>⏱ {s.lead_time_days} días</span>}
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <Modal title={editing ? 'Editar proveedor' : 'Nuevo proveedor'} onClose={closeForm}>
          <SupplierForm initial={editing} onSave={handleSave} onCancel={closeForm} />
        </Modal>
      )}
    </div>
  )
}
