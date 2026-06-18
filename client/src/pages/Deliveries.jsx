import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../lib/AuthContext'
import { getPermissions } from '../lib/permissions'
import Modal from '../components/ui/Modal'
import StatusBadge from '../components/ui/StatusBadge'
import LinesEditor from '../components/LinesEditor'

function PartnerSearch({ value, valueName, valueAddress, onSelect }) {
  const [query, setQuery] = useState(valueName || '')
  const [open, setOpen] = useState(false)
  const [partners, setPartners] = useState([])
  const [orderResults, setOrderResults] = useState([])
  const [searchingOrder, setSearchingOrder] = useState(false)

  useEffect(() => { api.getOdooPartners().then(setPartners).catch(() => {}) }, [])
  useEffect(() => { setQuery(valueName || '') }, [valueName])

  useEffect(() => {
    const el = document.getElementById('partner-search-container')
    const h = (e) => { if (el && !el.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  useEffect(() => {
    const looksLikeOrderRef = /^(GCS[QO]|G\d|S\d)/i.test(query.trim())
    if (!looksLikeOrderRef || query.trim().length < 4) { setOrderResults([]); return }
    setSearchingOrder(true)
    const t = setTimeout(() => {
      api.findOdooPartnersByOrder(query.trim())
        .then(setOrderResults)
        .catch(() => setOrderResults([]))
        .finally(() => setSearchingOrder(false))
    }, 350)
    return () => clearTimeout(t)
  }, [query])

  // Only show results when user has typed at least 2 chars
  const q = query.toLowerCase().trim()
  const filteredByName = q.length < 2 ? [] : partners.filter(p =>
    (p.name || '').toLowerCase().includes(q)
  ).slice(0, 40)

  const seen = new Set()
  const filtered = []
  for (const p of [...orderResults, ...filteredByName]) {
    if (seen.has(p.id)) continue
    seen.add(p.id)
    filtered.push(p)
  }

  function clean(v) { return v && v !== false ? v : null }

  function select(p) {
    setQuery(p?.name || '')
    // If matched via order ref, pass back the order ref too
    const orderRef = p?.matched_orders?.[0] || null
    onSelect(p ? { ...p, _orderRef: orderRef } : null)
    setOpen(false)
  }

  return (
    <div id="partner-search-container" className="relative">
      <input
        type="text"
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true); if (!e.target.value) onSelect(null) }}
        onFocus={() => { if (q.length >= 2) setOpen(true) }}
        placeholder="Escribe al menos 2 letras para buscar..."
        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        autoComplete="off"
      />
      {open && (filtered.length > 0 || searchingOrder) && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-64 overflow-y-auto">
          {searchingOrder && (
            <div className="px-3 py-2 text-xs text-gray-400">Buscando pedido en Odoo...</div>
          )}
          {filtered.map(p => (
            <button key={p.id} type="button" onMouseDown={() => select(p)}
              className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50">
              <div className="font-medium">{p.name}</div>
              <div className="text-xs text-gray-400 flex gap-1.5">
                {clean(p.street) && <span>{p.street}</span>}
                {clean(p.zip) && <span className="font-mono">{p.zip}</span>}
                {clean(p.city) && <span>{p.city}</span>}
                {!clean(p.zip) && <span className="text-amber-500">⚠ sin CP</span>}
              </div>
              {p.matched_orders?.length > 0 && (
                <div className="text-xs text-blue-500 mt-0.5">📄 {p.matched_orders.join(', ')}</div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function DeliveryForm({ initial, onSave, onCancel }) {
  const isManualInitial = !initial?.odoo_partner_id && !!initial?.odoo_partner_name
  const [manualClient, setManualClient] = useState(isManualInitial)
  const [form, setForm] = useState({
    odoo_partner_id: initial?.odoo_partner_id ?? null,
    odoo_partner_name: initial?.odoo_partner_name ?? '',
    client_ref: initial?.client_ref ?? '',
    shipping_address: initial?.shipping_address ? JSON.parse(initial.shipping_address) : null,
    notes: initial?.notes ?? '',
    lines: initial?.lines?.map(l => ({
      part_id: l.part_id,
      part_code: l.part?.code ?? '',
      part_name: l.part?.name ?? '',
      part_unit: l.part?.unit ?? 'ud',
      quantity: l.quantity,
    })) ?? []
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [editingAddr, setEditingAddr] = useState(false)

  function handlePartnerSelect(p) {
    setEditingAddr(false)
    const f2v = v => (v && v !== false) ? v : ''
    setForm(f => ({
      ...f,
      odoo_partner_id: p?.id ?? null,
      odoo_partner_name: p?.name ?? '',
      client_ref: p?._orderRef || f.client_ref || '',
      shipping_address: p ? {
        street: f2v(p.street),
        city: f2v(p.city),
        zip: f2v(p.zip),
        country: Array.isArray(p.country_id) ? p.country_id[1] : (f2v(p.country_id) || 'España'),
        phone: f2v(p.phone),
        mobile: f2v(p.mobile),
        email: f2v(p.email),
      } : null
    }))
  }

  function updateAddr(field, value) {
    setForm(f => ({ ...f, shipping_address: { ...(f.shipping_address || {}), [field]: value } }))
  }

  function switchToManual() {
    setManualClient(true)
    setForm(f => ({ ...f, odoo_partner_id: null, shipping_address: f.shipping_address || { street: '', city: '', zip: '', country: 'España' } }))
  }

  function switchToOdoo() {
    setManualClient(false)
    setForm(f => ({ ...f, odoo_partner_id: null, odoo_partner_name: '', shipping_address: null }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.odoo_partner_name?.trim()) return setError('El nombre del cliente es obligatorio')
    if (manualClient && !form.client_ref?.trim()) return setError('La referencia cliente es obligatoria para albaranes manuales')
    if (form.lines.some(l => !l.part_id)) return setError('Todas las líneas deben tener una pieza seleccionada')
    setSaving(true); setError(null)
    try {
      await onSave({
        odoo_partner_id: form.odoo_partner_id,
        odoo_partner_name: form.odoo_partner_name || null,
        client_ref: form.client_ref || null,
        shipping_address: form.shipping_address,
        notes: form.notes || null,
        lines: form.lines.map(l => ({ part_id: Number(l.part_id), quantity: Number(l.quantity) }))
      })
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  const addr = form.shipping_address
  const addrStr = addr ? [addr.street, addr.city, addr.zip, addr.country].filter(Boolean).join(', ') : null

  const addrWarnings = []
  if (addr) {
    if (!addr.street?.trim()) addrWarnings.push('Falta la calle')
    if (!addr.zip?.trim()) addrWarnings.push('Falta el código postal')
    else if (addr.zip.trim().length < 4) addrWarnings.push('El código postal parece incorrecto')
    if (!addr.city?.trim()) addrWarnings.push('Falta la ciudad')
  } else if (form.odoo_partner_name) {
    addrWarnings.push('Sin dirección de envío')
  }

  return (
    <form onSubmit={handleSubmit} className="p-6 space-y-4">
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-xs font-medium text-gray-600">
            {manualClient ? 'Cliente manual' : 'Cliente (Odoo)'}
          </label>
          <button type="button"
            onClick={manualClient ? switchToOdoo : switchToManual}
            className="text-xs text-blue-500 hover:text-blue-700 font-medium">
            {manualClient ? '← Buscar en Odoo' : '+ Crear cliente manual'}
          </button>
        </div>

        {!manualClient && (
          <>
            <PartnerSearch
              value={form.odoo_partner_id}
              valueName={form.odoo_partner_name}
              onSelect={handlePartnerSelect}
            />
            {addr && !editingAddr && (
              <div className="flex items-center gap-2 mt-1">
                <p className="text-xs text-gray-400">📍 {addrStr || '(sin dirección)'}</p>
                <button type="button" onClick={() => setEditingAddr(true)}
                  className="text-xs text-blue-500 hover:text-blue-700 font-medium">Editar dirección</button>
              </div>
            )}
            {addr && editingAddr && (
              <div className="mt-2 grid grid-cols-2 gap-2 bg-gray-50 border border-gray-200 rounded-md p-3">
                <div className="col-span-2">
                  <label className="block text-xs text-gray-500 mb-0.5">Calle</label>
                  <input type="text" value={addr.street || ''} onChange={e => updateAddr('street', e.target.value)}
                    className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-0.5">Ciudad</label>
                  <input type="text" value={addr.city || ''} onChange={e => updateAddr('city', e.target.value)}
                    className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-0.5">C.P.</label>
                  <input type="text" value={addr.zip || ''} onChange={e => updateAddr('zip', e.target.value)}
                    className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-gray-500 mb-0.5">País</label>
                  <input type="text" value={addr.country || ''} onChange={e => updateAddr('country', e.target.value)}
                    className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-0.5">Teléfono</label>
                  <input type="text" value={addr.phone || ''} onChange={e => updateAddr('phone', e.target.value)}
                    placeholder="Ej: 612345678"
                    className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-0.5">Móvil <span className="text-gray-400">(requerido internacional)</span></label>
                  <input type="text" value={addr.mobile || ''} onChange={e => updateAddr('mobile', e.target.value)}
                    placeholder="Ej: +4917612345678"
                    className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-gray-500 mb-0.5">Email</label>
                  <input type="email" value={addr.email || ''} onChange={e => updateAddr('email', e.target.value)}
                    placeholder="Ej: cliente@email.com"
                    className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="col-span-2 flex justify-end">
                  <button type="button" onClick={() => setEditingAddr(false)}
                    className="text-xs text-gray-500 hover:text-gray-800 font-medium">Listo</button>
                </div>
                <p className="col-span-2 text-[11px] text-gray-400">Este cambio solo afecta a este albarán local; no modifica nada en Odoo.</p>
              </div>
            )}
          </>
        )}

        {manualClient && (
          <div className="grid grid-cols-2 gap-2 bg-gray-50 border border-gray-200 rounded-md p-3">
            <div className="col-span-2">
              <label className="block text-xs text-gray-500 mb-0.5">Nombre *</label>
              <input type="text" value={form.odoo_partner_name} onChange={e => setForm(f => ({ ...f, odoo_partner_name: e.target.value }))}
                placeholder="Ej: CLIENTE TEST"
                className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-gray-500 mb-0.5">Calle *</label>
              <input type="text" value={addr?.street || ''} onChange={e => updateAddr('street', e.target.value)}
                placeholder="Ej: Calle Mayor 1"
                className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-0.5">Ciudad *</label>
              <input type="text" value={addr?.city || ''} onChange={e => updateAddr('city', e.target.value)}
                placeholder="Ej: Barcelona"
                className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-0.5">C.P. *</label>
              <input type="text" value={addr?.zip || ''} onChange={e => updateAddr('zip', e.target.value)}
                placeholder="Ej: 08001"
                className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-0.5">Teléfono</label>
              <input type="text" value={addr?.phone || ''} onChange={e => updateAddr('phone', e.target.value)}
                placeholder="Ej: 612345678"
                className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-0.5">Móvil <span className="text-gray-400">(requerido internacional)</span></label>
              <input type="text" value={addr?.mobile || ''} onChange={e => updateAddr('mobile', e.target.value)}
                placeholder="Ej: +4917612345678"
                className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-0.5">País</label>
              <input type="text" value={addr?.country || 'España'} onChange={e => updateAddr('country', e.target.value)}
                className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-gray-500 mb-0.5">Email</label>
              <input type="email" value={addr?.email || ''} onChange={e => updateAddr('email', e.target.value)}
                placeholder="Ej: cliente@email.com"
                className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
        )}
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          Referencia cliente {manualClient && <span className="text-red-500">*</span>}
          <span className="text-gray-400 font-normal ml-1">(nº pedido Odoo u otro)</span>
        </label>
        <input type="text" value={form.client_ref} onChange={e => setForm(f => ({ ...f, client_ref: e.target.value }))}
          placeholder="Ej: GCSQ-00123"
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Notas</label>
        <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2}
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-2">Líneas <span className="text-gray-400 font-normal">(pieza · cantidad)</span></label>
        <LinesEditor lines={form.lines} onChange={lines => setForm(f => ({ ...f, lines }))} mode="delivery" />
      </div>
      {addrWarnings.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-md px-3 py-2 space-y-0.5">
          {addrWarnings.map((w, i) => (
            <p key={i} className="text-xs text-amber-700 flex items-center gap-1.5">
              <span>⚠️</span>{w}
            </p>
          ))}
        </div>
      )}
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

export default function Deliveries() {
  const { user: currentUser } = useAuth()
  const perm = getPermissions(currentUser?.role)
  const [notes, setNotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [shippingId, setShippingId] = useState(null)
  const [shipCarrier, setShipCarrier] = useState('')
  const [shipParcels, setShipParcels] = useState(1)
  const [editTrackingId, setEditTrackingId] = useState(null)
  const [editTrackingVal, setEditTrackingVal] = useState('')
  const [users, setUsers] = useState([])
  const [filterUser, setFilterUser] = useState('')
  const [expandedLines, setExpandedLines] = useState(new Set())
  function toggleLines(id) {
    setExpandedLines(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }

  const load = useCallback(() => {
    setLoading(true)
    const params = filterUser ? { created_by: filterUser } : undefined
    api.getDeliveries(params).then(setNotes).finally(() => setLoading(false))
  }, [filterUser])

  useEffect(() => { api.getUsers().then(setUsers).catch(() => {}) }, [])
  useEffect(() => { load() }, [load])

  async function handleSave(data) {
    if (editing) await api.updateDelivery(editing.id, data)
    else await api.createDelivery({ ...data, created_by_id: currentUser?.id || null })
    setShowForm(false); setEditing(null); load()
  }

  async function handleDelete(id, force = false) {
    const msg = force
      ? '⚠️ Este albarán ya fue procesado. ¿Seguro que quieres eliminarlo? Esta acción no se puede deshacer.'
      : '¿Eliminar este albarán?'
    if (!confirm(msg)) return
    try { await api.deleteDelivery(id, force); load() }
    catch (err) { alert(err.message) }
  }

  async function handleConfirm(id) {
    if (!confirm('¿Confirmar albarán? Se descontará el stock.')) return
    try { await api.confirmDelivery(id); load() }
    catch (err) { alert(err.message) }
  }

  async function handleShip(id, carrier) {
    try {
      if (shipParcels > 1) await api.updateDelivery(id, { parcels: shipParcels })
      await api.shipDelivery(id, { carrier })
      setShippingId(null); setShipCarrier(''); setShipParcels(1)
      load()
    }
    catch (err) { alert(err.message) }
  }

  async function handleSaveTracking(id) {
    try {
      await api.updateDeliveryTracking(id, editTrackingVal)
      setEditTrackingId(null); setEditTrackingVal('')
      load()
    }
    catch (err) { alert(err.message) }
  }

  async function handleUploadLabel(id, file) {
    try { await api.uploadDeliveryLabel(id, file); load() }
    catch (err) { alert(err.message) }
  }

  async function handleDeliver(id) {
    try { await api.deliverDelivery(id); load() }
    catch (err) { alert(err.message) }
  }

  const [detailNote, setDetailNote] = useState(null)
  const [clientHistory, setClientHistory] = useState([])
  const [showHistory, setShowHistory] = useState(false)
  const [activeTab, setActiveTab] = useState('ALL')
  const [search, setSearch] = useState('')

  async function handleEtiquetasPdf() {
    try {
      const token = JSON.parse(localStorage.getItem('wh_user') || '{}')?.token
      const res = await fetch('/api/deliveries/etiquetas-pdf', { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) { const e = await res.json().catch(() => ({})); alert('Error al generar PDF: ' + (e.error || res.status)); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank')
    } catch (err) { alert('Error: ' + err.message) }
  }

  async function handleResumenCierre() {
    try {
      const token = JSON.parse(localStorage.getItem('wh_user') || '{}')?.token
      const res = await fetch('/api/deliveries/resumen-cierre', { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) { alert('Error al generar resumen'); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank')
    } catch (err) { alert('Error: ' + err.message) }
  }

  const navigate = useNavigate()

  const TABS = [
    { key: 'ALL',       label: 'Todos' },
    { key: 'DRAFT',     label: 'Borrador' },
    { key: 'CONFIRMED', label: 'Confirmado' },
    { key: 'PICKING',   label: 'Picking' },
    { key: 'READY',     label: 'Listo' },
    { key: 'SHIPPED',   label: 'Enviado' },
    { key: 'DELIVERED', label: 'Entregado' },
  ]

  const visibleNotes = notes
    .filter(n => activeTab === 'ALL' || n.status === activeTab)
    .filter(n => {
      if (!search.trim()) return true
      const q = search.toLowerCase()
      return (n.odoo_partner_name || '').toLowerCase().includes(q)
          || (n.client_ref || '').toLowerCase().includes(q)
          || String(n.id).includes(q)
    })

  function openDetail(note) {
    setDetailNote(note)
    setShowHistory(false)
    setClientHistory([])
    if (note.odoo_partner_id) {
      api.getDeliveries({ partner_id: note.odoo_partner_id })
        .then(all => setClientHistory(all.filter(n => n.id !== note.id).slice(0, 10)))
        .catch(() => {})
    }
  }

  function renderNoteRow(note) {
    const addr = note.shipping_address ? JSON.parse(note.shipping_address) : null
    const addrStr = addr ? [addr.street, addr.zip, addr.city].filter(Boolean).join(', ') : null
    return (
      <tr key={note.id} onClick={() => openDetail(note)}
        className="hover:bg-blue-50 cursor-pointer transition-colors">
        <td className="px-4 py-2.5 whitespace-nowrap">
          <span className="font-mono text-xs font-semibold text-gray-600">ALB-{note.id}</span>
          <div className="text-xs text-gray-400">{new Date(note.created_at).toLocaleDateString('es-ES')}</div>
        </td>
        <td className="px-4 py-2.5 max-w-[220px]">
          <div className="font-medium text-gray-800 truncate">{note.odoo_partner_name || '—'}</div>
          {addrStr && <div className="text-xs text-gray-400 truncate">{addrStr}</div>}
        </td>
        <td className="px-4 py-2.5"><StatusBadge status={note.status} /></td>
        <td className="px-4 py-2.5 text-xs text-gray-500">
          {note.createdBy?.name || <span className="text-gray-300">—</span>}
        </td>
        <td className="px-4 py-2.5 text-xs text-gray-600">
          {note.carrier
            ? <div><span className="font-medium">{note.carrier}</span>{note.gls_tracking && <a href={`https://gls-group.eu/ES/es/seguimiento-de-envios?match=${note.gls_tracking}`} target="_blank" rel="noreferrer" className="ml-1 font-mono text-blue-500 hover:underline">{note.gls_tracking}</a>}</div>
            : <span className="text-gray-300">—</span>}
        </td>
        <td className="px-4 py-2.5 text-xs text-gray-500">
          {note.lines.length} pieza{note.lines.length !== 1 ? 's' : ''}
        </td>
        <td className="px-4 py-2.5 text-right" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-end gap-3">
            {!['PICKING','SHIPPED','DELIVERED'].includes(note.status) && (
              <button onClick={() => handleDelete(note.id, note.status !== 'DRAFT')}
                className="text-gray-200 hover:text-red-400 transition-colors" title="Eliminar">🗑</button>
            )}
            <div className="flex items-center gap-1.5">
              {(note.status === 'DRAFT' || note.status === 'READY') && (<>
                <button onClick={() => { setEditing(note); setShowForm(true) }}
                  className="text-gray-400 hover:text-blue-600 text-xs font-medium">Editar</button>
                {perm.deliveries.confirm && <button onClick={() => handleConfirm(note.id)}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium px-3 py-1.5 rounded-md">Confirmar</button>}
              </>)}
              {note.status === 'CONFIRMED' && perm.deliveries.picking && (
                <button onClick={() => navigate(`/deliveries/${note.id}/picking`)}
                  className="bg-yellow-500 hover:bg-yellow-600 text-white text-xs font-medium px-3 py-1.5 rounded-md">Iniciar picking</button>
              )}
              {note.status === 'PICKING' && perm.deliveries.picking && (
                <button onClick={() => navigate(`/deliveries/${note.id}/picking`)}
                  className="bg-yellow-500 hover:bg-yellow-600 text-white text-xs font-medium px-3 py-1.5 rounded-md">Continuar picking</button>
              )}
              {note.status === 'READY' && perm.deliveries.ship && shippingId !== note.id && (
                <button onClick={() => setShippingId(note.id)}
                  className="bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium px-3 py-1.5 rounded-md">Marcar enviado</button>
              )}
              {note.status === 'READY' && perm.deliveries.ship && shippingId === note.id && (
                <div className="flex flex-col gap-1.5 items-end">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-gray-500">Bultos:</span>
                    <input type="number" min="1" max="20" value={shipParcels}
                      onChange={e => setShipParcels(Math.max(1, Number(e.target.value)))}
                      className="w-12 border border-gray-300 rounded px-1.5 py-1 text-xs text-center" />
                  </div>
                  <div className="flex gap-1.5 items-center">
                    <button onClick={() => handleShip(note.id, 'GLS')}
                      className="bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold px-3 py-1.5 rounded-md">GLS</button>
                    <button onClick={() => handleShip(note.id, 'DACHSER')}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-3 py-1.5 rounded-md">DACHSER</button>
                    <button onClick={() => { setShippingId(null); setShipParcels(1) }} className="text-gray-400 text-xs">✕</button>
                  </div>
                </div>
              )}
              {note.status === 'SHIPPED' && perm.deliveries.deliver && (
                <button onClick={() => handleDeliver(note.id)}
                  className="bg-green-600 hover:bg-green-700 text-white text-xs font-medium px-3 py-1.5 rounded-md">Marcar entregado</button>
              )}
              {note.status === 'DELIVERED' && <span className="text-xs text-gray-400">Entregado</span>}
            </div>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <div className="p-4 md:p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 md:mb-6">
        <h1 className="text-xl md:text-2xl font-bold text-gray-900">Albaranes</h1>
        <div className="flex items-center gap-2">
          <button onClick={handleEtiquetasPdf}
            className="hidden md:block border border-gray-300 hover:border-blue-400 hover:text-blue-600 text-gray-600 text-sm font-medium px-4 py-2 rounded-md">
            🖨 Imprimir etiquetas
          </button>
          <button onClick={handleResumenCierre}
            className="hidden md:block border border-gray-300 hover:border-green-400 hover:text-green-600 text-gray-600 text-sm font-medium px-4 py-2 rounded-md">
            📄 Resumen envíos
          </button>
          <a href="https://gls-group.eu/ES/es/extranet" target="_blank" rel="noreferrer"
            className="hidden md:block border border-gray-300 hover:border-orange-400 hover:text-orange-600 text-gray-600 text-sm font-medium px-4 py-2 rounded-md">
            🚚 Cerrar jornada GLS
          </a>
          <button onClick={() => { setEditing(null); setShowForm(true) }}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-3 py-2 md:px-4 rounded-md">
            + Nuevo
          </button>
        </div>
      </div>

      {/* Mobile: fila de acciones GLS */}
      <div className="flex gap-2 mb-3 md:hidden">
        <button onClick={handleEtiquetasPdf}
          className="flex-1 text-center border border-gray-300 text-gray-600 text-sm font-medium px-3 py-2 rounded-md active:bg-gray-50">
          🖨 Etiquetas
        </button>
        <button onClick={handleResumenCierre}
          className="flex-1 text-center border border-gray-300 text-gray-600 text-sm font-medium px-3 py-2 rounded-md active:bg-gray-50">
          📄 Resumen
        </button>
        <a href="https://gls-group.eu/ES/es/extranet" target="_blank" rel="noreferrer"
          className="flex-1 text-center border border-gray-300 text-gray-600 text-sm font-medium px-3 py-2 rounded-md active:bg-gray-50">
          🚚 Cerrar jornada
        </a>
      </div>

      {/* Search + filters */}
      <div className="flex flex-wrap gap-2 mb-3">
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar cliente, referencia..."
          className="flex-1 min-w-0 md:max-w-sm border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <select value={filterUser} onChange={e => setFilterUser(e.target.value)}
          className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Todos los usuarios</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        {filterUser && (
          <button onClick={() => setFilterUser('')}
            className="text-xs text-gray-400 hover:text-gray-700 px-2">✕ Limpiar</button>
        )}
      </div>

      {/* Tabs — scrollable on mobile */}
      <div className="flex gap-1 mb-4 bg-gray-100 p-1 rounded-lg overflow-x-auto">
        {TABS.map(tab => {
          const count = tab.key === 'ALL' ? notes.length : notes.filter(n => n.status === tab.key).length
          return (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`px-3 md:px-4 py-1.5 rounded-md text-xs md:text-sm font-medium transition-colors flex items-center gap-1 whitespace-nowrap ${
                activeTab === tab.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {tab.label}
              {count > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                  activeTab === tab.key ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-500'
                }`}>{count}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* DESKTOP: tabla */}
      <div className="hidden md:block bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200 text-xs font-medium text-gray-500 uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-2">Ref.</th>
              <th className="text-left px-4 py-2">Cliente</th>
              <th className="text-left px-4 py-2">Estado</th>
              <th className="text-left px-4 py-2">Creado por</th>
              <th className="text-left px-4 py-2">Transportista</th>
              <th className="text-left px-4 py-2">Piezas</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Cargando...</td></tr>
            ) : visibleNotes.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No hay albaranes en este estado</td></tr>
            ) : (() => {
              // When showing READY, group by carrier for queue view
              const rows = []
              if (activeTab === 'READY') {
                const groups = {}
                visibleNotes.forEach(n => { const k = n.carrier || '(Sin transportista)'; if (!groups[k]) groups[k] = []; groups[k].push(n) })
                Object.entries(groups).forEach(([carrier, groupNotes]) => {
                  rows.push(
                    <tr key={`group-${carrier}`}>
                      <td colSpan={7} className="px-4 py-2 bg-gray-50 border-b border-gray-200">
                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">🚚 {carrier}</span>
                        <span className="ml-2 text-xs text-gray-400">{groupNotes.length} envío{groupNotes.length !== 1 ? 's' : ''}</span>
                      </td>
                    </tr>
                  )
                  groupNotes.forEach(note => rows.push(renderNoteRow(note)))
                })
              } else {
                visibleNotes.forEach(note => rows.push(renderNoteRow(note)))
              }
              return rows
            })()}
          </tbody>
        </table>
      </div>


      {/* MOBILE: tarjetas */}
      <div className="md:hidden space-y-2">
        {loading ? (
          <div className="text-center py-8 text-gray-400 text-sm">Cargando...</div>
        ) : visibleNotes.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">No hay albaranes en este estado</div>
        ) : visibleNotes.map(note => {
          const addr = note.shipping_address ? JSON.parse(note.shipping_address) : null
          const addrStr = addr ? [addr.street, addr.zip, addr.city].filter(Boolean).join(', ') : null
          return (
            <div key={note.id} onClick={() => openDetail(note)}
              className="bg-white rounded-xl border border-gray-200 p-4 active:bg-blue-50 cursor-pointer">
              <div className="flex items-start justify-between mb-1">
                <div>
                  <span className="font-mono text-xs text-gray-400">ALB-{note.id}</span>
                  {note.client_ref && <span className="ml-2 text-xs text-blue-500 font-medium">{note.client_ref}</span>}
                </div>
                <StatusBadge status={note.status} />
              </div>
              <div className="font-semibold text-gray-900 mb-0.5">{note.odoo_partner_name || '—'}</div>
              {addrStr && <div className="text-xs text-gray-400 mb-2">{addrStr}</div>}
              <div className="flex items-center justify-between">
                <div className="text-xs text-gray-400">
                  {note.lines.length} pieza{note.lines.length !== 1 ? 's' : ''}
                  {note.carrier && <span className="ml-2 font-medium text-gray-600">{note.carrier}</span>}
                  {note.gls_tracking && <a href={`https://gls-group.eu/ES/es/seguimiento-de-envios?match=${note.gls_tracking}`} target="_blank" rel="noreferrer" className="ml-1 font-mono text-blue-400 text-[11px] hover:underline">{note.gls_tracking}</a>}
                </div>
                <div onClick={e => e.stopPropagation()}>
                  {note.status === 'DRAFT' && perm.deliveries.confirm && (
                    <button onClick={() => handleConfirm(note.id)}
                      className="bg-blue-600 text-white text-xs font-medium px-3 py-1.5 rounded-md">
                      Confirmar
                    </button>
                  )}
                  {note.status === 'CONFIRMED' && perm.deliveries.picking && (
                    <button onClick={() => navigate(`/deliveries/${note.id}/picking`)}
                      className="bg-yellow-500 text-white text-xs font-medium px-3 py-1.5 rounded-md">
                      Picking
                    </button>
                  )}
                  {note.status === 'PICKING' && perm.deliveries.picking && (
                    <button onClick={() => navigate(`/deliveries/${note.id}/picking`)}
                      className="bg-yellow-500 text-white text-xs font-medium px-3 py-1.5 rounded-md">
                      Continuar
                    </button>
                  )}
                  {note.status === 'READY' && perm.deliveries.ship && shippingId !== note.id && (
                    <button onClick={() => setShippingId(note.id)}
                      className="bg-purple-600 text-white text-xs font-medium px-3 py-1.5 rounded-md">
                      Marcar enviado
                    </button>
                  )}
                  {note.status === 'READY' && perm.deliveries.ship && shippingId === note.id && (
                    <div className="flex flex-col gap-1.5 items-end">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-gray-500">Bultos:</span>
                        <input type="number" min="1" max="20" value={shipParcels}
                          onChange={e => setShipParcels(Math.max(1, Number(e.target.value)))}
                          className="w-12 border border-gray-300 rounded px-1.5 py-1 text-xs text-center" />
                      </div>
                      <div className="flex gap-1.5">
                        <button onClick={() => handleShip(note.id, 'GLS')}
                          className="bg-purple-600 text-white text-xs font-bold px-2.5 py-1.5 rounded-md">GLS</button>
                        <button onClick={() => handleShip(note.id, 'DACHSER')}
                          className="bg-indigo-600 text-white text-xs font-bold px-2.5 py-1.5 rounded-md">DACHSER</button>
                        <button onClick={() => { setShippingId(null); setShipParcels(1) }} className="text-gray-400 text-xs px-1">✕</button>
                      </div>
                    </div>
                  )}
                  {note.status === 'SHIPPED' && perm.deliveries.deliver && (
                    <button onClick={() => handleDeliver(note.id)}
                      className="bg-green-600 text-white text-xs font-medium px-3 py-1.5 rounded-md">
                      Entregado
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Detail side panel */}
      {detailNote && (() => {
        const n = notes.find(x => x.id === detailNote.id) || detailNote
        const addr = n.shipping_address ? JSON.parse(n.shipping_address) : null
        return (
          <div className="fixed inset-0 z-40 flex justify-end" onClick={() => setDetailNote(null)}>
            <div className="fixed inset-0 bg-black/20" />
            <div className="relative z-50 w-[420px] bg-white h-full shadow-2xl flex flex-col overflow-y-auto"
              onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div className="flex items-start justify-between p-6 border-b border-gray-100">
                <div>
                  <div className="text-xs font-mono text-gray-400 mb-0.5">ALB-{n.id} · {new Date(n.created_at).toLocaleDateString('es-ES')}{n.client_ref && <span className="ml-2 text-blue-400">{n.client_ref}</span>}{n.createdBy && <span className="ml-2 text-gray-400">· {n.createdBy.name}</span>}</div>
                  <h2 className="text-lg font-bold text-gray-900">{n.odoo_partner_name || '—'}</h2>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge status={n.status} />
                  <button onClick={() => setDetailNote(null)} className="text-gray-400 hover:text-gray-700 text-xl leading-none">✕</button>
                </div>
              </div>

              <div className="p-6 space-y-6 flex-1">
                {/* Address */}
                <section>
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Dirección de envío</h3>
                  {addr ? (
                    <div className="text-sm text-gray-700 space-y-0.5">
                      {addr.street && <div>{addr.street}</div>}
                      {(addr.zip || addr.city) && <div>{[addr.zip, addr.city].filter(Boolean).join(' ')}</div>}
                      {addr.country && <div className="text-gray-400">{addr.country}</div>}
                      {addr.phone && <div className="text-gray-500">📞 {addr.phone}</div>}
                    </div>
                  ) : <p className="text-sm text-gray-400">Sin dirección</p>}
                </section>

                {/* Transporte */}
                <section>
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Transporte</h3>
                  <div className="space-y-1.5">
                    {n.carrier
                      ? <div className="text-sm font-medium text-gray-700">🚚 {n.carrier}</div>
                      : <p className="text-sm text-gray-400">Sin transportista asignado</p>}
                    {n.gls_tracking && <a href={`https://gls-group.eu/ES/es/seguimiento-de-envios?match=${n.gls_tracking}`} target="_blank" rel="noreferrer" className="font-mono text-sm text-blue-600 hover:underline">{n.gls_tracking}</a>}
                    {n.gls_label_url && (
                      <a href={`${n.gls_label_url}`} target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-medium px-3 py-1.5 rounded-md">
                        📄 Ver etiqueta PDF
                      </a>
                    )}
                    {n.status !== 'DRAFT' && (
                      <label className="inline-flex items-center gap-1.5 bg-gray-50 hover:bg-gray-100 text-gray-600 text-xs font-medium px-3 py-1.5 rounded-md cursor-pointer">
                        📎 {n.gls_label_url ? 'Reemplazar PDF' : 'Adjuntar PDF'}
                        <input type="file" accept="application/pdf" className="hidden"
                          onChange={e => { const f = e.target.files?.[0]; if (f) { handleUploadLabel(n.id, f); setDetailNote(null) }; e.target.value = '' }} />
                      </label>
                    )}
                  </div>
                </section>

                {/* Lines */}
                <section>
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Piezas ({n.lines.length})</h3>
                  {n.lines.length === 0
                    ? <p className="text-sm text-gray-400">Sin piezas</p>
                    : <div className="space-y-1.5">
                        {n.lines.map((l, i) => (
                          <div key={i} className="flex items-center gap-3 py-1.5 border-b border-gray-50 last:border-0">
                            <span className="text-sm font-semibold text-blue-700 w-6 text-right shrink-0">{l.quantity}×</span>
                            <span className="font-mono text-xs text-gray-400 shrink-0 w-20 truncate">{l.part?.code}</span>
                            <span className="text-sm text-gray-700 flex-1">{l.part?.name}</span>
                          </div>
                        ))}
                      </div>
                  }
                </section>

                {n.notes && (
                  <section>
                    <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Notas</h3>
                    <p className="text-sm text-gray-700">{n.notes}</p>
                  </section>
                )}

                {/* Historial del cliente */}
                {n.odoo_partner_id && (
                  <section>
                    <button onClick={() => setShowHistory(v => !v)}
                      className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide hover:text-gray-600">
                      Historial cliente
                      <span className="text-gray-300">{showHistory ? '▲' : '▼'}</span>
                      {clientHistory.length > 0 && <span className="bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">{clientHistory.length}</span>}
                    </button>
                    {showHistory && (
                      <div className="mt-2 space-y-1.5">
                        {clientHistory.length === 0
                          ? <p className="text-sm text-gray-400">Sin envíos anteriores</p>
                          : clientHistory.map(h => (
                            <div key={h.id} className="flex items-center justify-between text-xs bg-gray-50 rounded-lg px-3 py-2">
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-semibold text-gray-500">ALB-{h.id}</span>
                                <span className="text-gray-400">{new Date(h.created_at).toLocaleDateString('es-ES')}</span>
                                {h.carrier && <span className="text-gray-500">{h.carrier}</span>}
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-gray-400">{h.lines.length} pz</span>
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                  h.status === 'DELIVERED' ? 'bg-green-100 text-green-700' :
                                  h.status === 'SHIPPED' ? 'bg-blue-100 text-blue-700' :
                                  'bg-gray-100 text-gray-600'
                                }`}>{h.status}</span>
                              </div>
                            </div>
                          ))
                        }
                      </div>
                    )}
                  </section>
                )}
              </div>

              {/* Footer actions */}
              <div className="p-6 border-t border-gray-100 space-y-2">
                {n.status === 'DRAFT' && (
                  <div className="flex gap-2">
                    <button onClick={() => { setDetailNote(null); setEditing(n); setShowForm(true) }}
                      className="flex-1 border border-gray-300 hover:border-blue-400 text-gray-600 hover:text-blue-600 text-sm font-medium py-2 rounded-md">
                      Editar
                    </button>
                    <button onClick={() => { handleConfirm(n.id); setDetailNote(null) }}
                      className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 rounded-md">
                      Confirmar
                    </button>
                  </div>
                )}
                {(n.status === 'CONFIRMED' || n.status === 'READY') && (
                  <div className="space-y-2">
                    <p className="text-xs text-gray-500">Selecciona el transportista para marcar como enviado:</p>
                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={() => { handleShip(n.id, 'GLS'); setDetailNote(null) }}
                        className="bg-purple-600 hover:bg-purple-700 text-white text-sm font-bold py-2.5 rounded-md">
                        GLS
                      </button>
                      <button onClick={() => { handleShip(n.id, 'DACHSER'); setDetailNote(null) }}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold py-2.5 rounded-md">
                        DACHSER
                      </button>
                    </div>
                  </div>
                )}
                {n.status === 'SHIPPED' && n.carrier === 'DACHSER' && (
                  <div className="space-y-1.5">
                    <p className="text-xs text-gray-500 font-medium">Tracking DACHSER</p>
                    {editTrackingId === n.id ? (
                      <div className="flex gap-2">
                        <input type="text" value={editTrackingVal} onChange={e => setEditTrackingVal(e.target.value)}
                          placeholder="Nº tracking" autoFocus
                          className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                        <button onClick={() => handleSaveTracking(n.id)}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-3 py-1.5 rounded-md">Guardar</button>
                        <button onClick={() => setEditTrackingId(null)} className="text-gray-400 text-sm">✕</button>
                      </div>
                    ) : (
                      <button onClick={() => { setEditTrackingId(n.id); setEditTrackingVal(n.gls_tracking || '') }}
                        className="w-full text-left border border-dashed border-gray-300 hover:border-indigo-400 rounded px-3 py-2 text-sm text-gray-500 hover:text-indigo-600">
                        {n.gls_tracking || '+ Añadir tracking'}
                      </button>
                    )}
                  </div>
                )}
                {n.status === 'SHIPPED' && (
                  <button onClick={() => { handleDeliver(n.id); setDetailNote(null) }}
                    className="w-full bg-green-600 hover:bg-green-700 text-white text-sm font-medium py-2 rounded-md">
                    Marcar entregado
                  </button>
                )}
                {!['SHIPPED','DELIVERED'].includes(n.status) && (
                  <button onClick={() => { handleDelete(n.id, n.status !== 'DRAFT'); setDetailNote(null) }}
                    className="w-full text-red-400 hover:text-red-600 text-xs font-medium py-1">
                    Eliminar albarán
                  </button>
                )}
              </div>
            </div>
          </div>
        )
      })()}

      {showForm && (
        <Modal title={editing ? `Editar ALB-${editing.id}` : 'Nuevo albarán'}
          onClose={() => { setShowForm(false); setEditing(null) }} size="lg">
          <DeliveryForm initial={editing} onSave={handleSave} onCancel={() => { setShowForm(false); setEditing(null) }} />
        </Modal>
      )}
    </div>
  )
}
