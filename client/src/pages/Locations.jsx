import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import StockBadge from '../components/ui/StockBadge'

export default function Locations() {
  const navigate = useNavigate()
  const [locations, setLocations] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState({})

  useEffect(() => {
    api.getLocations()
      .then(setLocations)
      .finally(() => setLoading(false))
  }, [])

  const filtered = locations.filter(l =>
    l.location.toLowerCase().includes(search.toLowerCase()) ||
    l.parts.some(p =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.code.toLowerCase().includes(search.toLowerCase())
    )
  )

  function toggle(loc) {
    setExpanded(e => ({ ...e, [loc]: !e[loc] }))
  }

  function expandAll() {
    const all = {}
    filtered.forEach(l => { all[l.location] = true })
    setExpanded(all)
  }

  function collapseAll() { setExpanded({}) }

  const anyExpanded = filtered.some(l => expanded[l.location])

  return (
    <div className="p-4 md:p-8">
      <div className="flex items-center justify-between mb-4 md:mb-6">
        <h1 className="text-xl md:text-2xl font-bold text-gray-900">Ubicaciones</h1>
        <button onClick={() => navigate('/locations/qr')}
          className="text-sm font-medium text-blue-600 hover:text-blue-800 border border-blue-200 rounded-md px-3 py-1.5">
          🖨️ Etiquetas QR
        </button>
      </div>

      <div className="flex gap-2 mb-4 items-center">
        <input
          type="text"
          placeholder="Buscar ubicación o pieza..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border border-gray-300 rounded-md px-3 py-2 text-sm w-full md:w-72 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={anyExpanded ? collapseAll : expandAll}
          className="shrink-0 text-xs text-gray-500 hover:text-gray-800 border border-gray-300 rounded-md px-3 py-2"
        >
          {anyExpanded ? 'Colapsar todo' : 'Expandir todo'}
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Cargando...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">Sin resultados</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(loc => {
            const isOpen = !!expanded[loc.location]
            const lowCount = loc.parts.filter(p => p.stock <= p.stock_min).length
            return (
              <div key={loc.location} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                {/* Header row */}
                <button
                  onClick={() => toggle(loc.location)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-base">📍</span>
                    <span className="font-mono font-semibold text-gray-900">{loc.location}</span>
                    <span className="text-xs text-gray-400">{loc.parts.length} pieza{loc.parts.length !== 1 ? 's' : ''}</span>
                    {lowCount > 0 && (
                      <span className="text-xs bg-red-100 text-red-600 font-medium px-1.5 py-0.5 rounded">
                        {lowCount} bajo mínimo
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-gray-700">{loc.total_stock.toLocaleString('es-ES', { maximumFractionDigits: 2 })} uds</span>
                    <span className={`text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}>▾</span>
                  </div>
                </button>

                {/* Parts list */}
                {isOpen && (
                  <>
                    {/* Desktop */}
                    <div className="hidden md:block border-t border-gray-100">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="text-left px-4 py-2 font-medium text-gray-500 text-xs">Código</th>
                            <th className="text-left px-4 py-2 font-medium text-gray-500 text-xs">Nombre</th>
                            <th className="text-right px-4 py-2 font-medium text-gray-500 text-xs">Stock aquí</th>
                            <th className="text-left px-4 py-2 font-medium text-gray-500 text-xs">Estado</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {loc.parts.map(p => (
                            <tr key={p.id} className="hover:bg-gray-50">
                              <td className="px-4 py-2 font-mono text-gray-500 text-xs">{p.code}</td>
                              <td className="px-4 py-2">
                                <Link to={`/parts/${p.id}`} className="text-blue-600 hover:underline font-medium">{p.name}</Link>
                              </td>
                              <td className="px-4 py-2 text-right font-semibold text-gray-900">
                                {p.stock} {p.unit}
                              </td>
                              <td className="px-4 py-2">
                                <StockBadge current={p.stock} min={p.stock_min} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile */}
                    <div className="md:hidden border-t border-gray-100 divide-y divide-gray-100">
                      {loc.parts.map(p => (
                        <Link key={p.id} to={`/parts/${p.id}`}
                          className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 active:bg-gray-100">
                          <div>
                            <div className="font-medium text-gray-900 text-sm">{p.name}</div>
                            <div className="text-xs text-gray-400 font-mono">{p.code}</div>
                          </div>
                          <div className="text-right flex flex-col items-end gap-1">
                            <span className="font-semibold text-sm text-gray-900">{p.stock} {p.unit}</span>
                            <StockBadge current={p.stock} min={p.stock_min} />
                          </div>
                        </Link>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
