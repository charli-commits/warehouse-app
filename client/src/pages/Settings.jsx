import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useAuth } from '../lib/AuthContext'
import { ROLES } from '../lib/permissions'

const ROLE_OPTIONS = [
  { value: 'admin',          label: 'Admin' },
  { value: 'agente_sat',     label: 'Agente SAT' },
  { value: 'agente_almacen', label: 'Agente Almacén' },
  { value: 'operator',       label: 'Operario' },
]

function RoleBadge({ role }) {
  const r = ROLES[role]
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${r?.color || 'bg-gray-100 text-gray-500'}`}>
      {r?.label || role}
    </span>
  )
}

function ManageList({ title, items, onRename, onDelete, emptyText, hint }) {
  const [editing, setEditing] = useState(null)
  const [editVal, setEditVal] = useState('')

  function startEdit(item) { setEditing(item); setEditVal(item) }

  async function saveEdit(original) {
    if (!editVal.trim() || editVal.trim() === original) { setEditing(null); return }
    await onRename(original, editVal.trim())
    setEditing(null)
  }

  async function handleDelete(item) {
    if (!confirm(`¿Eliminar "${item}"? Se quitará de todas las piezas.`)) return
    await onDelete(item)
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
      <div className="px-4 py-3 border-b border-gray-100">
        <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">{title}</div>
        {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
      </div>
      <div className="divide-y divide-gray-100 max-h-72 overflow-y-auto">
        {items.length === 0 && <p className="px-4 py-3 text-sm text-gray-400">{emptyText}</p>}
        {items.map(item => (
          <div key={item} className="flex items-center justify-between px-4 py-2.5">
            {editing === item ? (
              <input autoFocus value={editVal} onChange={e => setEditVal(e.target.value)}
                onBlur={() => saveEdit(item)}
                onKeyDown={e => { if (e.key === 'Enter') saveEdit(item); if (e.key === 'Escape') setEditing(null) }}
                className="flex-1 border border-blue-400 rounded px-2 py-1 text-sm focus:outline-none mr-2" />
            ) : (
              <span className="text-sm text-gray-800 flex-1">{item}</span>
            )}
            <div className="flex gap-3">
              <button onClick={() => startEdit(item)} className="text-xs text-blue-500 hover:text-blue-700">Renombrar</button>
              <button onClick={() => handleDelete(item)} className="text-xs text-red-400 hover:text-red-600">Eliminar</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Settings() {
  const { user, logout } = useAuth()
  const [users, setUsers] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', pin: '', role: 'agente_sat' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [editingRole, setEditingRole] = useState(null)
  const [locations, setLocations] = useState([])
  const [categories, setCategories] = useState([])

  const loadLocations = () => api.getLocations().then(ls => setLocations(ls.map(l => l.location).sort()))
  const loadCategories = () => api.getCategories().then(setCategories)

  const load = () => api.getUsers().then(setUsers).catch(() => {})
  useEffect(() => { load(); loadLocations(); loadCategories() }, [])

  async function handleCreate(e) {
    e.preventDefault()
    if (form.pin.length !== 4 || !/^\d{4}$/.test(form.pin)) {
      setError('El PIN debe ser exactamente 4 dígitos'); return
    }
    setSaving(true); setError(null)
    try {
      await api.createUser(form)
      setForm({ name: '', pin: '', role: 'agente_sat' })
      setShowForm(false)
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleChangeRole(userId, newRole) {
    try {
      await api.updateUserRole(userId, newRole)
      setEditingRole(null)
      load()
    } catch (err) {
      alert(err.message)
    }
  }

  async function handleDelete(id, name) {
    if (!confirm(`¿Desactivar al usuario "${name}"? No podrá iniciar sesión.`)) return
    await api.deleteUser(id)
    load()
  }

  return (
    <div className="p-4 md:p-8 max-w-xl">
      <h1 className="text-xl md:text-2xl font-bold text-gray-900 mb-6">Ajustes</h1>

      {/* Sesión actual */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Sesión actual</div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold">
              {user?.name?.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="font-medium text-gray-900">{user?.name}</div>
              <RoleBadge role={user?.role} />
            </div>
          </div>
          <button onClick={logout}
            className="text-sm text-red-500 hover:text-red-700 font-medium border border-red-200 px-3 py-1.5 rounded-lg">
            Cerrar sesión
          </button>
        </div>
      </div>

      {/* Ubicaciones */}
      {user?.role === 'admin' && (
        <ManageList
          title="Ubicaciones"
          items={locations}
          emptyText="No hay ubicaciones"
          hint="Las ubicaciones se crean al asignar stock a una pieza."
          onRename={async (from, to) => { await api.renameLocation(from, to); loadLocations() }}
          onDelete={async (name) => { await api.deleteLocation(name); loadLocations() }}
        />
      )}

      {/* Categorías */}
      {user?.role === 'admin' && (
        <ManageList
          title="Categorías"
          items={categories}
          emptyText="No hay categorías"
          hint="Las categorías se asignan al editar una pieza."
          onRename={async (from, to) => { await api.renameCategory(from, to); loadCategories() }}
          onDelete={async (name) => { await api.deleteCategory(name); loadCategories() }}
        />
      )}

      {/* Gestión de usuarios — solo admin */}
      {user?.role === 'admin' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Usuarios</div>
            <button onClick={() => setShowForm(s => !s)}
              className="text-xs font-medium text-blue-600 hover:text-blue-800">
              {showForm ? 'Cancelar' : '+ Nuevo usuario'}
            </button>
          </div>

          {showForm && (
            <form onSubmit={handleCreate} className="p-4 border-b border-gray-100 bg-gray-50 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Nombre</label>
                  <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    required placeholder="Juan"
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">PIN (4 dígitos)</label>
                  <input type="text" inputMode="numeric" maxLength={4} value={form.pin}
                    onChange={e => setForm(f => ({ ...f, pin: e.target.value.replace(/\D/g, '').slice(0,4) }))}
                    required placeholder="1234"
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Rol</label>
                <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              {error && <p className="text-sm text-red-500">{error}</p>}
              <button type="submit" disabled={saving}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium py-2 rounded-md">
                {saving ? 'Creando...' : 'Crear usuario'}
              </button>
            </form>
          )}

          <div className="divide-y divide-gray-100">
            {users.map(u => (
              <div key={u.id} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-sm font-bold text-gray-600">
                    {u.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-900">{u.name}</div>
                    {editingRole === u.id ? (
                      <select value={u.role} autoFocus
                        onChange={e => handleChangeRole(u.id, e.target.value)}
                        onBlur={() => setEditingRole(null)}
                        className="mt-0.5 border border-gray-300 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500">
                        {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                      </select>
                    ) : (
                      <button onClick={() => u.id !== user.id && setEditingRole(u.id)}
                        className={`mt-0.5 ${u.id !== user.id ? 'hover:opacity-70 cursor-pointer' : 'cursor-default'}`}
                        title={u.id !== user.id ? 'Cambiar rol' : ''}>
                        <RoleBadge role={u.role} />
                      </button>
                    )}
                  </div>
                </div>
                {u.id !== user.id && (
                  <button onClick={() => handleDelete(u.id, u.name)}
                    className="text-xs text-red-400 hover:text-red-600 font-medium">
                    Desactivar
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Leyenda de roles */}
          <div className="px-4 py-3 bg-gray-50 border-t border-gray-100">
            <p className="text-xs text-gray-400 font-medium mb-2">Permisos por rol</p>
            <div className="space-y-1.5 text-xs text-gray-500">
              <div><RoleBadge role="admin" /> — Acceso completo</div>
              <div><RoleBadge role="agente_sat" /> — Ver stock y OCs · Crear/eliminar albaranes (borrador) · Sin almacén</div>
              <div><RoleBadge role="agente_almacen" /> — Gestión completa de albaranes · Sin OCs ni auditoría</div>
              <div><RoleBadge role="operator" /> — Solo lectura</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
