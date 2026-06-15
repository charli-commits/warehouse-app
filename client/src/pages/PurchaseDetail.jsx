import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../lib/AuthContext'
import StatusBadge from '../components/ui/StatusBadge'

const PENDING_STATUSES = ['DRAFT', 'SENT', 'LOCATING', 'PARTIAL']

export default function PurchaseDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [order, setOrder] = useState(null)
  const [loading, setLoading] = useState(true)
  const [locations, setLocations] = useState([])

  // Receiving state: { [lineId]: { qty: '', location: '', saving: false, open: false } }
  const [receiving, setReceiving] = useState({})

  useEffect(() => {
    load()
    api.getPartLocations().then(setLocations).catch(() => {})
  }, [id])

  function load() {
    setLoading(true)
    api.getPurchase(Number(id)).then(setOrder).finally(() => setLoading(false))
  }

  function openReceive(lineId, defaultLoc) {
    setReceiving(prev => ({ ...prev, [lineId]: { qty: '1', location: defaultLoc || '', saving: false, open: true } }))
  }

  function closeReceive(lineId) {
    setReceiving(prev => { const n = { ...prev }; delete n[lineId]; return n })
  }

  async function handleLocate(lineId) {
    const r = receiving[lineId]
    if (!r.location.trim() || !r.qty || Number(r.qty) <= 0) return
    setReceiving(prev => ({ ...prev, [lineId]: { ...prev[lineId], saving: true } }))
    try {
      const updated = await api.locatePurchaseLine(Number(id), {
        line_id: lineId,
        location: r.location.trim(),
        quantity: Number(r.qty),
        user_name: user?.name || null
      })
      setOrder(updated)
      closeReceive(lineId)
    } catch (err) {
      alert(err.message)
      setReceiving(prev => ({ ...prev, [lineId]: { ...prev[lineId], saving: false } }))
    }
  }

  if (loading) return <div className="p-8 text-center text-gray-400">Cargando...</div>
  if (!order) return <div className="p-8 text-center text-gray-400">Orden no encontrada</div>

  const total = order.lines.reduce((acc, l) => acc + (l.quantity_ordered * (l.unit_price || 0)), 0)
  const canReceive = PENDING_STATUSES.includes(order.status)

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/purchases')} className="text-gray-400 hover:text-gray-600 text-xl px-1">←</button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900">{order.reference || `OC-${order.id}`}</h1>
          <div className="text-sm text-gray-500">{order.supplier?.name}</div>
        </div>
        <StatusBadge status={order.status} />
        <a href={`/api/purchases/${order.id}/pdf`} target="_blank" rel="noreferrer"
          className="text-xs text-gray-500 hover:text-blue-600 border border-gray-200 px-3 py-1.5 rounded font-medium">
          📄 PDF
        </a>
      </div>

      {/* Meta */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-3">
          <div className="text-xs text-gray-500">Fecha pedido</div>
          <div className="text-sm font-medium mt-0.5">{new Date(order.order_date).toLocaleDateString('es-ES')}</div>
        </div>
        {order.eta && (
          <div className="bg-white rounded-xl border border-gray-200 p-3">
            <div className="text-xs text-gray-500">ETA</div>
            <div className="text-sm font-medium mt-0.5">{new Date(order.eta).toLocaleDateString('es-ES')}</div>
          </div>
        )}
        {total > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-3">
            <div className="text-xs text-gray-500">Total estimado</div>
            <div className="text-sm font-medium mt-0.5">{total.toFixed(2)} €</div>
          </div>
        )}
        {order.notes && (
          <div className="bg-white rounded-xl border border-gray-200 p-3 col-span-2 md:col-span-3">
            <div className="text-xs text-gray-500">Notas</div>
            <div className="text-sm mt-0.5">{order.notes}</div>
          </div>
        )}
      </div>

      {/* Lines */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Líneas del pedido</h2>
          <span className="text-xs text-gray-400">{order.lines.length} referencias</span>
        </div>

        <div className="divide-y divide-gray-100">
          {order.lines.map(l => {
            const pending = Math.max(0, l.quantity_ordered - l.quantity_received)
            const r = receiving[l.id]
            return (
              <div key={l.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-mono text-xs text-gray-400">{l.part?.code}</span>
                      {l.quantity_validated > 0 && (
                        <span className="text-xs bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded">
                          Validado: {l.quantity_validated}
                        </span>
                      )}
                    </div>
                    <div className="text-sm font-medium text-gray-800">{l.part?.name}</div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                      <span>Pedido: <b className="text-gray-700">{l.quantity_ordered} {l.part?.unit}</b></span>
                      {l.quantity_received > 0 && (
                        <span className="text-green-600 font-medium">Ubicado: {l.quantity_received}</span>
                      )}
                      {pending > 0 && <span className="text-amber-600">Pendiente: {pending}</span>}
                      {l.unit_price ? <span>{l.unit_price} €/ud</span> : null}
                    </div>
                    {l.receiptLines?.length > 0 && (
                      <div className="text-xs text-gray-400 mt-1">
                        {l.receiptLines.map(r => `${r.quantity} ud → ${r.location}`).join(' · ')}
                      </div>
                    )}
                  </div>
                  {canReceive && pending > 0 && !r?.open && (
                    <button onClick={() => openReceive(l.id, l.receiptLines?.[0]?.location || '')}
                      className="shrink-0 bg-green-600 hover:bg-green-700 text-white text-xs font-medium px-3 py-1.5 rounded-md">
                      + Ubicar
                    </button>
                  )}
                </div>

                {/* Inline receiving form */}
                {r?.open && (
                  <div className="mt-3 bg-green-50 border border-green-200 rounded-lg p-3 space-y-2">
                    <div className="text-xs font-medium text-green-800">Ubicar en almacén</div>
                    <div className="flex gap-2 flex-wrap">
                      <div>
                        <label className="block text-xs text-gray-500 mb-0.5">Cantidad</label>
                        <input type="number" value={r.qty}
                          onChange={e => setReceiving(prev => ({ ...prev, [l.id]: { ...prev[l.id], qty: e.target.value } }))}
                          min="0.01" step="1" max={pending}
                          className="w-20 border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                      </div>
                      <div className="flex-1 min-w-[140px]">
                        <label className="block text-xs text-gray-500 mb-0.5">Ubicación</label>
                        <input type="text" list="locations-receive-list"
                          value={r.location}
                          onChange={e => setReceiving(prev => ({ ...prev, [l.id]: { ...prev[l.id], location: e.target.value } }))}
                          placeholder="Ej: A1-01"
                          className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                        <datalist id="locations-receive-list">
                          {locations.map(loc => <option key={loc} value={loc} />)}
                        </datalist>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => handleLocate(l.id)} disabled={r.saving}
                        className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs font-medium px-4 py-1.5 rounded-md">
                        {r.saving ? 'Guardando...' : 'Confirmar'}
                      </button>
                      <button onClick={() => closeReceive(l.id)} className="text-gray-500 text-xs hover:text-gray-800">
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
