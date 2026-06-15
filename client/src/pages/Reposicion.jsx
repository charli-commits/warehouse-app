import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { api } from '../lib/api'

export default function Reposicion() {
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [suppliers, setSuppliers] = useState([])
  const [selected, setSelected] = useState({}) // part_id -> { qty, supplier_id }
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  useEffect(() => {
    Promise.all([
      api.getReposicion().then(setItems),
      api.getSuppliers().then(setSuppliers),
    ]).finally(() => setLoading(false))
  }, [])

  function toggleSelect(item) {
    setSelected(s => {
      if (s[item.id]) {
        const n = { ...s }; delete n[item.id]; return n
      }
      return { ...s, [item.id]: { qty: item.suggested_qty, supplier_id: '' } }
    })
  }

  function selectAll() {
    const all = {}
    items.forEach(item => { all[item.id] = { qty: item.suggested_qty, supplier_id: '' } })
    setSelected(all)
  }

  function updateSelected(part_id, field, value) {
    setSelected(s => ({ ...s, [part_id]: { ...s[part_id], [field]: value } }))
  }

  async function createOrders() {
    setError(null)
    const lines = Object.entries(selected).map(([part_id, v]) => ({ part_id: Number(part_id), qty: Number(v.qty), supplier_id: Number(v.supplier_id) }))
    if (lines.some(l => !l.supplier_id)) return setError('Asigna un proveedor a cada línea seleccionada')
    if (lines.some(l => !l.qty || l.qty <= 0)) return setError('Todas las cantidades deben ser > 0')

    // Group by supplier
    const bySupplier = {}
    lines.forEach(l => {
      if (!bySupplier[l.supplier_id]) bySupplier[l.supplier_id] = []
      bySupplier[l.supplier_id].push(l)
    })

    setCreating(true)
    try {
      const created = []
      for (const [supplier_id, supplierLines] of Object.entries(bySupplier)) {
        const order = await api.createPurchase({
          supplier_id: Number(supplier_id),
          lines: supplierLines.map(l => ({ part_id: l.part_id, quantity_ordered: l.qty }))
        })
        created.push(order)
      }
      setSuccess(`${created.length} orden${created.length !== 1 ? 'es' : ''} de compra creada${created.length !== 1 ? 's' : ''} en borrador`)
      setSelected({})
      api.getReposicion().then(setItems)
    } catch (err) {
      setError(err.message)
    } finally {
      setCreating(false)
    }
  }

  const selectedCount = Object.keys(selected).length

  if (loading) return <div className="p-8 text-gray-400">Cargando…</div>

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reposición de stock</h1>
          <p className="text-sm text-gray-500 mt-1">{items.length} pieza{items.length !== 1 ? 's' : ''} por debajo del mínimo</p>
        </div>
        <div className="flex gap-2">
          {selectedCount < items.length && (
            <button onClick={selectAll} className="px-4 py-2 border rounded text-sm hover:bg-gray-50">Seleccionar todas</button>
          )}
          <button
            onClick={createOrders}
            disabled={selectedCount === 0 || creating}
            className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {creating ? 'Creando…' : `Crear OC${selectedCount > 0 ? ` (${selectedCount})` : ''}`}
          </button>
        </div>
      </div>

      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded text-sm flex justify-between">
          {success} — <Link to="/purchases" className="underline">Ver órdenes</Link>
          <button onClick={() => setSuccess(null)} className="text-green-500 ml-4">×</button>
        </div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm flex justify-between">
          {error}<button onClick={() => setError(null)} className="text-red-400 ml-4">×</button>
        </div>
      )}

      {items.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">✓</p>
          <p className="text-sm">Todo el stock está por encima del mínimo</p>
        </div>
      ) : (
        <div className="bg-white border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-2 w-8"></th>
                <th className="text-left px-4 py-2 font-semibold text-gray-600">Código</th>
                <th className="text-left px-4 py-2 font-semibold text-gray-600">Pieza</th>
                <th className="text-right px-4 py-2 font-semibold text-gray-600">Stock</th>
                <th className="text-right px-4 py-2 font-semibold text-gray-600">Mínimo</th>
                <th className="text-right px-4 py-2 font-semibold text-gray-600">Sugerido</th>
                <th className="text-left px-4 py-2 font-semibold text-gray-600">OC pendiente</th>
                {selectedCount > 0 && <th className="text-left px-4 py-2 font-semibold text-gray-600">Proveedor</th>}
                {selectedCount > 0 && <th className="text-right px-4 py-2 font-semibold text-gray-600">Cantidad</th>}
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map(item => {
                const sel = selected[item.id]
                const deficit = item.stock_min - item.stock_current
                return (
                  <tr key={item.id} className={sel ? 'bg-blue-50' : ''}>
                    <td className="px-4 py-2">
                      <input
                        type="checkbox"
                        checked={!!sel}
                        onChange={() => toggleSelect(item)}
                        className="rounded"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <Link to={`/parts/${item.id}`} className="font-mono text-xs text-blue-600 hover:underline">{item.code}</Link>
                    </td>
                    <td className="px-4 py-2 text-gray-900">{item.name}</td>
                    <td className="px-4 py-2 text-right">
                      <span className="text-red-600 font-medium">{item.stock_current}</span>
                      <span className="text-gray-400 text-xs ml-1">{item.unit}</span>
                    </td>
                    <td className="px-4 py-2 text-right text-gray-500">{item.stock_min} {item.unit}</td>
                    <td className="px-4 py-2 text-right font-medium text-blue-700">+{item.suggested_qty} {item.unit}</td>
                    <td className="px-4 py-2 text-gray-400 text-xs">
                      {item.pending_order
                        ? <Link to={`/purchases/${item.pending_order.id}`} className="text-amber-600 hover:underline">{item.pending_order.reference || `#${item.pending_order.id}`}</Link>
                        : '—'}
                    </td>
                    {selectedCount > 0 && (
                      <td className="px-4 py-2">
                        {sel ? (
                          <select
                            value={sel.supplier_id}
                            onChange={e => updateSelected(item.id, 'supplier_id', e.target.value)}
                            className="border rounded px-2 py-1 text-xs w-36 focus:ring-1 focus:ring-blue-500"
                          >
                            <option value="">— Proveedor —</option>
                            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                          </select>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                    )}
                    {selectedCount > 0 && (
                      <td className="px-4 py-2 text-right">
                        {sel ? (
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={sel.qty}
                            onChange={e => updateSelected(item.id, 'qty', e.target.value)}
                            className="border rounded px-2 py-1 text-xs w-16 text-right focus:ring-1 focus:ring-blue-500"
                          />
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
