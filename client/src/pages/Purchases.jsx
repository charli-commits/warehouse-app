import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../lib/AuthContext'
import { getPermissions } from '../lib/permissions'
import Modal from '../components/ui/Modal'
import StatusBadge from '../components/ui/StatusBadge'
import LinesEditor from '../components/LinesEditor'

// ─── Purchase form (create / edit) ───────────────────────────────────────────
function PurchaseForm({ initial, onSave, onCancel }) {
  const [suppliers, setSuppliers] = useState([])
  const [form, setForm] = useState({
    supplier_id: initial?.supplier_id ?? '',
    eta: initial?.eta ? initial.eta.slice(0, 10) : '',
    notes: initial?.notes ?? '',
    lines: initial?.lines?.map(l => ({
      part_id: l.part_id,
      part_code: l.part?.code ?? '',
      part_name: l.part?.name ?? '',
      part_unit: l.part?.unit ?? 'ud',
      quantity_ordered: l.quantity_ordered,
      unit_price: l.unit_price ?? '',
    })) ?? []
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => { api.getSuppliers().then(setSuppliers).catch(() => {}) }, [])

  const selectedSupplier = suppliers.find(s => String(s.id) === String(form.supplier_id)) || null

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.supplier_id) return setError('Selecciona un proveedor')
    if (form.lines.length === 0) return setError('Añade al menos una línea')
    if (form.lines.some(l => !l.part_id)) return setError('Todas las líneas deben tener una pieza')
    setSaving(true); setError(null)
    try {
      await onSave({
        supplier_id: Number(form.supplier_id),
        eta: form.eta || null,
        notes: form.notes || null,
        lines: form.lines.map(l => ({
          part_id: Number(l.part_id),
          quantity_ordered: Number(l.quantity_ordered),
          unit_price: l.unit_price !== '' ? Number(l.unit_price) : null,
        }))
      })
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  return (
    <form onSubmit={handleSubmit} className="p-6 space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Proveedor *</label>
          <select value={form.supplier_id} onChange={e => setForm(f => ({ ...f, supplier_id: e.target.value }))}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">— Seleccionar —</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">ETA (fecha estimada)</label>
          <input type="date" value={form.eta} onChange={e => setForm(f => ({ ...f, eta: e.target.value }))}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Notas</label>
        <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2}
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-2">Líneas <span className="text-gray-400 font-normal">(pieza · cantidad · precio/ud)</span></label>
        <LinesEditor lines={form.lines} onChange={lines => setForm(f => ({ ...f, lines }))} mode="purchase" manufacturer={selectedSupplier?.manufacturer} />
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancelar</button>
        <button type="submit" disabled={saving}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium px-5 py-2 rounded-md">
          {saving ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </form>
  )
}

// ─── Step 1: validate quantities arrived ─────────────────────────────────────
function ValidateModal({ order, onClose, onDone }) {
  const pendingLines = order.lines.filter(l => l.quantity_validated < l.quantity_ordered)
  const [qtys, setQtys] = useState(
    Object.fromEntries(pendingLines.map(l => [l.id, l.quantity_ordered - l.quantity_validated]))
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    const lines = pendingLines
      .map(l => ({ line_id: l.id, quantity_validated: Number(qtys[l.id] ?? 0) }))
      .filter(l => l.quantity_validated > 0)
    if (!lines.length) return setError('Introduce al menos una cantidad')
    setSaving(true); setError(null)
    try {
      await api.validatePurchase(order.id, { lines })
      onDone()
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  return (
    <Modal title={`Validar entrada — ${order.reference || `OC-${order.id}`}`} onClose={onClose} size="md">
      <div className="px-6 pt-4 pb-2">
        <p className="text-sm text-gray-500">Confirma las cantidades que han llegado en esta entrega. El stock sube cuando el operario ubique la mercancía.</p>
      </div>
      <form onSubmit={handleSubmit} className="p-6 pt-3 space-y-3">
        {order.lines.map(l => {
          const pending = l.quantity_ordered - l.quantity_validated
          const alreadyDone = pending <= 0
          return (
            <div key={l.id} className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{l.part?.name}</div>
                <div className="text-xs text-gray-400 font-mono">{l.part?.code}</div>
                {l.quantity_validated > 0 && (
                  <div className="text-xs text-indigo-500 mt-0.5">Ya validado: {l.quantity_validated} {l.part?.unit}</div>
                )}
              </div>
              <div className="text-xs text-gray-400 shrink-0 text-right">
                <div>Pedido: {l.quantity_ordered}</div>
                {!alreadyDone && <div className="text-orange-500">Pendiente: {pending}</div>}
              </div>
              <input type="number" min="0" max={pending} step="0.01"
                value={alreadyDone ? '' : (qtys[l.id] ?? '')}
                onChange={e => setQtys(q => ({ ...q, [l.id]: e.target.value }))}
                disabled={alreadyDone}
                placeholder={alreadyDone ? '✓' : '0'}
                className="w-20 border border-gray-300 rounded px-2 py-1 text-sm disabled:bg-green-50 disabled:text-green-500 text-center focus:outline-none focus:ring-2 focus:ring-blue-500 shrink-0" />
            </div>
          )
        })}
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600">Cancelar</button>
          <button type="submit" disabled={saving}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-medium px-5 py-2 rounded-md">
            {saving ? 'Guardando...' : 'Confirmar entrada'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ─── Step 2: locate in warehouse ─────────────────────────────────────────────
function LocateModal({ order, onClose, onDone }) {
  const { user } = useAuth()
  const [allLocations, setAllLocations] = useState([])
  const [activeLine, setActiveLine] = useState(null)
  const [location, setLocation] = useState('')
  const [quantity, setQuantity] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [scanInput, setScanInput] = useState(null) // ref trick for file input

  useEffect(() => { api.getPartLocations().then(setAllLocations).catch(() => {}) }, [])

  // Lines still pending to locate
  const pendingLines = order.lines.filter(l => l.quantity_received < l.quantity_validated)

  async function handleLocate(e) {
    e.preventDefault()
    if (!activeLine || !location.trim() || !quantity) return setError('Completa todos los campos')
    setSaving(true); setError(null)
    try {
      await api.locatePurchaseLine(order.id, {
        line_id: activeLine.id,
        location: location.trim(),
        quantity: Number(quantity),
        user_name: user?.name
      })
      setLocation(''); setQuantity(''); setActiveLine(null)
      onDone()
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  // QR scan for location
  function handleScanFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    import('jsqr').then(({ default: jsQR }) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = img.width; canvas.height = img.height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0)
        const imageData = ctx.getImageData(0, 0, img.width, img.height)
        const result = jsQR(imageData.data, imageData.width, imageData.height)
        if (result) setLocation(result.data)
        else alert('No se detectó ningún QR')
      }
      img.src = URL.createObjectURL(file)
    })
    e.target.value = ''
  }

  return (
    <Modal title={`Ubicar en almacén — ${order.reference || `OC-${order.id}`}`} onClose={onClose} size="md">
      <div className="p-6 space-y-4">
        {pendingLines.length === 0 ? (
          <div className="text-center py-6">
            <div className="text-4xl mb-2">✅</div>
            <p className="text-gray-600 font-medium">Todo ubicado</p>
            <button onClick={onClose} className="mt-4 bg-green-600 text-white text-sm font-medium px-5 py-2 rounded-md">Cerrar</button>
          </div>
        ) : (
          <>
            {/* Line selector */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-2">Selecciona la pieza a ubicar</label>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {pendingLines.map(l => {
                  const pending = l.quantity_validated - l.quantity_received
                  const isActive = activeLine?.id === l.id
                  return (
                    <button key={l.id} type="button"
                      onClick={() => { setActiveLine(l); setQuantity(pending) }}
                      className={`w-full text-left px-3 py-2.5 rounded-lg border text-sm transition-colors ${isActive ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-medium">{l.part?.name}</span>
                          <span className="text-xs text-gray-400 font-mono ml-2">{l.part?.code}</span>
                        </div>
                        <span className="text-xs font-semibold text-indigo-600">{pending} {l.part?.unit} pendiente</span>
                      </div>
                      {l.receiptLines?.length > 0 && (
                        <div className="text-xs text-gray-400 mt-0.5">
                          Ya ubicado: {l.receiptLines.map(r => `${r.quantity} en ${r.location}`).join(', ')}
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            {activeLine && (
              <form onSubmit={handleLocate} className="space-y-3 border-t border-gray-100 pt-4">
                <div className="font-medium text-sm text-gray-800">Ubicando: {activeLine.part?.name}</div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Ubicación</label>
                  <div className="flex gap-2">
                    <input type="text" list="locate-locations-list" value={location}
                      onChange={e => setLocation(e.target.value)}
                      placeholder="Escanea QR o escribe..."
                      required
                      className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    <datalist id="locate-locations-list">
                      {allLocations.map(l => <option key={l} value={l} />)}
                    </datalist>
                    <label className="border border-gray-300 rounded-md px-3 py-2 text-sm cursor-pointer hover:bg-gray-50">
                      📷
                      <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleScanFile} />
                    </label>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Cantidad</label>
                  <input type="number" min="0.01" step="0.01"
                    value={quantity} onChange={e => setQuantity(e.target.value)} required
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                {error && <p className="text-sm text-red-500">{error}</p>}
                <button type="submit" disabled={saving}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-semibold py-2.5 rounded-md">
                  {saving ? 'Guardando...' : '✓ Confirmar ubicación'}
                </button>
              </form>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}

const ALL_STATUSES = [
  { value: '', label: 'Todos' },
  { value: 'DRAFT', label: 'Borrador' },
  { value: 'SENT', label: 'Enviado' },
  { value: 'LOCATING', label: 'Ubicando' },
  { value: 'PARTIAL', label: 'Parcial' },
  { value: 'RECEIVED', label: 'Recibido' },
  { value: 'CANCELLED', label: 'Cancelado' },
]

// ─── Main page ────────────────────────────────────────────────────────────────
export default function Purchases() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const perm = getPermissions(user?.role)
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [validating, setValidating] = useState(null)
  const [locating, setLocating] = useState(null)
  const [statusFilter, setStatusFilter] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    api.getPurchases().then(setOrders).finally(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])

  async function handleSave(data) {
    if (editing) await api.updatePurchase(editing.id, data)
    else await api.createPurchase(data)
    setShowForm(false); setEditing(null); load()
  }

  async function handleDelete(id) {
    if (!confirm('¿Eliminar esta orden de compra?')) return
    try { await api.deletePurchase(id); load() }
    catch (err) { alert(err.message) }
  }

  async function handleStatusChange(order, newStatus) {
    try { await api.updatePurchase(order.id, { status: newStatus }); load() }
    catch (err) { alert(err.message) }
  }

  const filteredOrders = statusFilter ? orders.filter(o => o.status === statusFilter) : orders

  const total = (order) =>
    order.lines.reduce((acc, l) => acc + (l.quantity_ordered * (l.unit_price || 0)), 0)

  function Actions({ order }) {
    return (
      <div className="flex flex-wrap gap-1.5 justify-end">
        {/* PDF always available */}
        <a href={`/api/purchases/${order.id}/pdf`}
          target="_blank" rel="noreferrer"
          className="text-xs text-gray-500 hover:text-blue-600 border border-gray-200 hover:border-blue-300 px-2.5 py-1 rounded font-medium">
          📄 PDF
        </a>

        {order.status === 'DRAFT' && perm.purchases.edit && (<>
          <button onClick={() => { setEditing(order); setShowForm(true) }}
            className="text-xs text-blue-600 border border-blue-200 px-2.5 py-1 rounded font-medium hover:bg-blue-50">Editar</button>
          <button onClick={() => handleStatusChange(order, 'SENT')}
            className="text-xs text-gray-600 border border-gray-200 px-2.5 py-1 rounded font-medium hover:bg-gray-50">Marcar enviado</button>
          <button onClick={() => handleDelete(order.id)}
            className="text-xs text-red-400 border border-red-100 px-2.5 py-1 rounded font-medium hover:bg-red-50">Eliminar</button>
        </>)}

        {order.lines.some(l => l.quantity_validated < l.quantity_ordered) && perm.purchases.edit && (
          <button onClick={() => setValidating(order)}
            className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1 rounded font-medium">
            ✓ Validar entrada
          </button>
        )}

        {order.status === 'LOCATING' && perm.purchases.edit && (
          <button onClick={() => setLocating(order)}
            className="text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded font-medium">
            📍 Ubicar mercancía
          </button>
        )}

        {order.status === 'PARTIAL' && perm.purchases.edit && (
          <button onClick={() => setLocating(order)}
            className="text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded font-medium">
            📍 Ubicar pendiente
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="p-4 md:p-8">
      <div className="flex items-center justify-between mb-4 md:mb-6">
        <h1 className="text-xl md:text-2xl font-bold text-gray-900">Órdenes de Compra</h1>
        {perm.purchases.create && (
          <button onClick={() => { setEditing(null); setShowForm(true) }}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-3 py-2 md:px-4 rounded-md">
            + Nueva
          </button>
        )}
      </div>

      {/* Filtro estado */}
      <div className="flex gap-2 flex-wrap mb-4">
        {ALL_STATUSES.map(s => (
          <button key={s.value} onClick={() => setStatusFilter(s.value)}
            className={`text-xs px-3 py-1.5 rounded-full font-medium border transition-colors ${
              statusFilter === s.value
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
            }`}>
            {s.label}
          </button>
        ))}
      </div>

      {/* DESKTOP */}
      <div className="hidden md:block bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Referencia</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Proveedor</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Estado</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Fecha</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">ETA</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Total</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Cargando...</td></tr>
            ) : filteredOrders.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No hay órdenes de compra</td></tr>
            ) : filteredOrders.map(order => (
              <tr key={order.id} className="hover:bg-gray-50 cursor-pointer"
                onClick={() => navigate(`/purchases/${order.id}`)}>
                <td className="px-4 py-3 font-mono text-sm font-semibold text-gray-800">
                  {order.reference || `OC-${order.id}`}
                </td>
                <td className="px-4 py-3 font-medium">{order.supplier?.name}</td>
                <td className="px-4 py-3"><StatusBadge status={order.status} /></td>
                <td className="px-4 py-3 text-gray-500">{new Date(order.order_date).toLocaleDateString('es-ES')}</td>
                <td className="px-4 py-3 text-gray-500">{order.eta ? new Date(order.eta).toLocaleDateString('es-ES') : '—'}</td>
                <td className="px-4 py-3 text-right font-medium">{total(order) > 0 ? `${total(order).toFixed(2)} €` : '—'}</td>
                <td className="px-4 py-3" onClick={e => e.stopPropagation()}><Actions order={order} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* MOBILE */}
      <div className="md:hidden space-y-2">
        {loading ? (
          <div className="text-center py-8 text-gray-400 text-sm">Cargando...</div>
        ) : filteredOrders.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">No hay órdenes de compra</div>
        ) : filteredOrders.map(order => (
          <div key={order.id} className="bg-white rounded-xl border border-gray-200 p-4 cursor-pointer"
            onClick={() => navigate(`/purchases/${order.id}`)}>
            <div className="flex items-start justify-between mb-1">
              <span className="font-mono font-semibold text-gray-800 text-sm">{order.reference || `OC-${order.id}`}</span>
              <StatusBadge status={order.status} />
            </div>
            <div className="font-medium text-gray-900">{order.supplier?.name}</div>
            <div className="flex gap-3 mt-1 text-xs text-gray-500">
              <span>{new Date(order.order_date).toLocaleDateString('es-ES')}</span>
              {order.eta && <span>ETA: {new Date(order.eta).toLocaleDateString('es-ES')}</span>}
              {total(order) > 0 && <span className="font-medium text-gray-700">{total(order).toFixed(2)} €</span>}
            </div>
            <div className="mt-3" onClick={e => e.stopPropagation()}>
              <Actions order={order} />
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <Modal title={editing ? `Editar ${editing.reference || `OC-${editing.id}`}` : 'Nueva orden de compra'}
          onClose={() => { setShowForm(false); setEditing(null) }} size="lg">
          <PurchaseForm initial={editing} onSave={handleSave} onCancel={() => { setShowForm(false); setEditing(null) }} />
        </Modal>
      )}
      {validating && (
        <ValidateModal order={validating} onClose={() => setValidating(null)} onDone={() => { setValidating(null); load() }} />
      )}
      {locating && (
        <LocateModal order={locating} onClose={() => setLocating(null)} onDone={() => { load(); api.getPurchase(locating.id).then(setLocating) }} />
      )}
    </div>
  )
}
