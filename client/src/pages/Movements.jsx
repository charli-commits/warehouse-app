import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'

const TYPE_LABELS = {
  IN:         { label: 'Entrada',  color: 'bg-green-100 text-green-700' },
  OUT:        { label: 'Salida',   color: 'bg-red-100 text-red-700' },
  ADJUSTMENT: { label: 'Ajuste',   color: 'bg-blue-100 text-blue-700' },
  TRANSFER:   { label: 'Traspaso', color: 'bg-purple-100 text-purple-700' },
  SCRAP:      { label: 'Baja',     color: 'bg-orange-100 text-orange-700' },
}

function fmt(dateStr) {
  const d = new Date(dateStr)
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' }) +
    ', ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}

export default function Movements() {
  const [data, setData] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [loading, setLoading] = useState(false)
  const LIMIT = 50

  const load = useCallback(async (p, s, t) => {
    setLoading(true)
    try {
      const token = JSON.parse(localStorage.getItem('wh_user') || '{}')?.token
      const params = new URLSearchParams({ page: p, limit: LIMIT })
      if (s) params.set('search', s)
      if (t) params.set('type', t)
      const res = await fetch(`/api/movements?${params}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      })
      const json = await res.json()
      setData(json.data || [])
      setTotal(json.total || 0)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(page, search, typeFilter) }, [page, search, typeFilter])

  function handleSearch(e) {
    e.preventDefault()
    setPage(1)
    setSearch(searchInput)
  }

  function handleType(t) {
    setTypeFilter(t)
    setPage(1)
  }

  const pages = Math.ceil(total / LIMIT)

  return (
    <div className="p-4 md:p-8 max-w-5xl">
      <h1 className="text-xl md:text-2xl font-bold text-gray-900 mb-6">Movimientos de stock</h1>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2 mb-4">
        <form onSubmit={handleSearch} className="flex gap-2 flex-1 min-w-48">
          <input value={searchInput} onChange={e => setSearchInput(e.target.value)}
            placeholder="Buscar por código o nombre..."
            className="flex-1 border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <button type="submit" className="bg-blue-600 text-white text-sm px-3 py-1.5 rounded-md">Buscar</button>
        </form>
        <div className="flex gap-1">
          {[['', 'Todos'], ['IN', 'Entradas'], ['OUT', 'Salidas'], ['ADJUSTMENT', 'Ajustes'], ['SCRAP', 'Bajas']].map(([val, label]) => (
            <button key={val} onClick={() => handleType(val)}
              className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${typeFilter === val ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 bg-gray-50">
          <span className="text-xs text-gray-500">{total} movimiento{total !== 1 ? 's' : ''}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 uppercase tracking-wide border-b border-gray-100">
                <th className="px-4 py-2.5 text-left">Fecha</th>
                <th className="px-4 py-2.5 text-left">Tipo</th>
                <th className="px-4 py-2.5 text-left">Pieza</th>
                <th className="px-4 py-2.5 text-right">Cantidad</th>
                <th className="px-4 py-2.5 text-left hidden md:table-cell">Origen</th>
                <th className="px-4 py-2.5 text-left hidden md:table-cell">Usuario</th>
                <th className="px-4 py-2.5 text-left hidden lg:table-cell">Notas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Cargando...</td></tr>
              )}
              {!loading && data.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Sin movimientos</td></tr>
              )}
              {!loading && data.map(m => {
                const t = TYPE_LABELS[m.reference_type] || TYPE_LABELS[m.type] || { label: m.type, color: 'bg-gray-100 text-gray-600' }
                return (
                  <tr key={m.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap text-xs">{fmt(m.created_at)}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${t.color}`}>{t.label}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      {m.part
                        ? <Link to={`/parts/${m.part.id}`} className="text-blue-600 hover:underline font-mono text-xs">{m.part.code}</Link>
                        : <span className="text-gray-400">—</span>}
                    </td>
                    <td className={`px-4 py-2.5 text-right font-medium tabular-nums ${m.type === 'IN' ? 'text-green-600' : 'text-red-600'}`}>
                      {m.type === 'IN' ? '+' : '-'}{m.quantity}
                    </td>
                    <td className="px-4 py-2.5 text-gray-500 hidden md:table-cell">{m.reference_type || '—'}</td>
                    <td className="px-4 py-2.5 text-gray-500 hidden md:table-cell">{m.user_name || '—'}</td>
                    <td className="px-4 py-2.5 text-gray-400 hidden lg:table-cell max-w-xs truncate">{m.notes || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        {pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="text-sm text-gray-600 disabled:text-gray-300 hover:text-gray-900">← Anterior</button>
            <span className="text-xs text-gray-500">Página {page} de {pages}</span>
            <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages}
              className="text-sm text-gray-600 disabled:text-gray-300 hover:text-gray-900">Siguiente →</button>
          </div>
        )}
      </div>
    </div>
  )
}
