import { useEffect, useState, useCallback } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../lib/AuthContext'
import { getPermissions } from '../lib/permissions'
import Modal from '../components/ui/Modal'
import StockBadge from '../components/ui/StockBadge'
import PartForm from '../components/PartForm'

export default function Parts() {
  const { user } = useAuth()
  const perm = getPermissions(user?.role)
  const [searchParams, setSearchParams] = useSearchParams()
  const [parts, setParts] = useState([])
  const [total, setTotal] = useState(0)
  const [categories, setCategories] = useState([])
  const [manufacturers, setManufacturers] = useState([])
  const [locations, setLocations] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [searchInput, setSearchInput] = useState(searchParams.get('search') || '')

  const search = searchParams.get('search') || ''
  const category = searchParams.get('category') || ''
  const lowStock = searchParams.get('low_stock') === 'true'
  const manufacturer = searchParams.get('manufacturer') || ''
  const location = searchParams.get('location') || ''
  const sort = searchParams.get('sort') || ''
  const page = Math.max(1, parseInt(searchParams.get('page')) || 1)
  const pageSize = 50

  // Debounce: only push `search` into the URL/query 400ms after typing stops
  useEffect(() => {
    const t = setTimeout(() => {
      setSearchParams(p => {
        const n = new URLSearchParams(p)
        searchInput ? n.set('search', searchInput) : n.delete('search')
        n.delete('page')
        return n
      })
    }, 400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput])

  const load = useCallback(() => {
    setLoading(true)
    const params = { page, page_size: pageSize }
    if (search) params.search = search
    if (category) params.category = category
    if (manufacturer) params.manufacturer = manufacturer
    if (location) params.location = location
    if (lowStock) params.low_stock = 'true'
    if (sort) params.sort = sort
    api.getParts(params)
      .then(res => {
        if (Array.isArray(res)) { setParts(res); setTotal(res.length) }
        else { setParts(res.data); setTotal(res.total) }
      })
      .finally(() => setLoading(false))
  }, [search, category, manufacturer, location, lowStock, sort, page])

  useEffect(() => { load() }, [load])
  useEffect(() => { api.getPartCategories().then(setCategories).catch(() => {}) }, [])
  useEffect(() => { api.getPartManufacturers().then(setManufacturers).catch(() => {}) }, [])
  useEffect(() => { api.getPartLocations().then(setLocations).catch(() => {}) }, [])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  function goToPage(p) {
    setSearchParams(prev => {
      const n = new URLSearchParams(prev)
      p > 1 ? n.set('page', String(p)) : n.delete('page')
      return n
    })
  }

  function openCreate() { setEditing(null); setShowForm(true) }
  function openEdit(p) { setEditing(p); setShowForm(true) }
  function closeForm() { setShowForm(false); setEditing(null) }

  async function handleSave(data) {
    if (editing) {
      await api.updatePart(editing.id, data)
    } else {
      await api.createPart(data)
    }
    closeForm()
    load()
  }

  async function handleDelete(id) {
    if (!confirm('¿Eliminar esta pieza?')) return
    try {
      await api.deletePart(id)
      load()
    } catch (err) {
      alert(err.message)
    }
  }

  return (
    <div className="p-4 md:p-8">
      <div className="flex items-center justify-between mb-4 md:mb-6">
        <h1 className="text-xl md:text-2xl font-bold text-gray-900">Piezas</h1>
        {perm.parts.create && (
          <button onClick={openCreate}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-3 py-2 md:px-4 rounded-md">
            + Nueva
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <input type="text" placeholder="Buscar código, nombre..."
          value={searchInput} onChange={e => setSearchInput(e.target.value)}
          className="border border-gray-300 rounded-md px-3 py-2 text-sm w-full md:w-60 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <div className="flex gap-2 flex-wrap w-full md:w-auto">
          <select value={category}
            onChange={e => setSearchParams(p => { const n = new URLSearchParams(p); e.target.value ? n.set('category', e.target.value) : n.delete('category'); n.delete('page'); return n })}
            className="border border-gray-300 rounded-md px-2 py-2 text-sm flex-1 md:flex-none focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Todas categ.</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={manufacturer}
            onChange={e => setSearchParams(p => { const n = new URLSearchParams(p); e.target.value ? n.set('manufacturer', e.target.value) : n.delete('manufacturer'); n.delete('page'); return n })}
            className="border border-gray-300 rounded-md px-2 py-2 text-sm flex-1 md:flex-none focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Todos fabric.</option>
            {manufacturers.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <input
            type="text" list="locations-filter-list"
            value={location}
            onChange={e => setSearchParams(p => { const n = new URLSearchParams(p); e.target.value ? n.set('location', e.target.value) : n.delete('location'); n.delete('page'); return n })}
            placeholder="Ubicación..."
            className="border border-gray-300 rounded-md px-2 py-2 text-sm flex-1 md:flex-none md:w-36 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <datalist id="locations-filter-list">
            {locations.map(l => <option key={l} value={l} />)}
          </datalist>
          <select value={sort}
            onChange={e => setSearchParams(p => { const n = new URLSearchParams(p); e.target.value ? n.set('sort', e.target.value) : n.delete('sort'); n.delete('page'); return n })}
            className="border border-gray-300 rounded-md px-2 py-2 text-sm flex-1 md:flex-none focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">A-Z</option>
            <option value="most_demanded">Más enviadas</option>
          </select>
          <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer">
            <input type="checkbox" checked={lowStock}
              onChange={e => setSearchParams(p => { const n = new URLSearchParams(p); e.target.checked ? n.set('low_stock', 'true') : n.delete('low_stock'); n.delete('page'); return n })}
              className="rounded" />
            Bajo mínimo
          </label>
        </div>
      </div>

      {/* DESKTOP: tabla */}
      <div className="hidden md:block bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Código</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Nombre</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Categoría</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Ubicación</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Stock</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Entrante</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Mínimo</th>
              {sort === 'most_demanded' && <th className="text-right px-4 py-3 font-medium text-gray-600">Enviadas (12m)</th>}
              <th className="text-left px-4 py-3 font-medium text-gray-600">Estado</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={sort === 'most_demanded' ? 10 : 9} className="px-4 py-8 text-center text-gray-400">Cargando...</td></tr>
            ) : parts.length === 0 ? (
              <tr><td colSpan={sort === 'most_demanded' ? 10 : 9} className="px-4 py-8 text-center text-gray-400">No hay piezas</td></tr>
            ) : parts.map(part => (
              <tr key={part.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-gray-700">{part.code}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    {part.image_url
                      ? <img src={part.image_url} alt="" className="w-10 h-10 object-cover rounded border border-gray-200 shrink-0" />
                      : <div className="w-10 h-10 rounded border border-gray-100 bg-gray-50 shrink-0" />
                    }
                    <div>
                      <Link to={`/parts/${part.id}`} className="font-medium text-blue-600 hover:underline">{part.name}</Link>
                      {part.odoo_product_name && <p className="text-xs text-gray-400 mt-0.5">Odoo: {part.odoo_product_name}</p>}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-600">{part.category || '—'}</td>
                <td className="px-4 py-3 text-gray-600">
                  {part.locations?.length > 0
                    ? <div className="flex flex-wrap gap-1">
                        {part.locations.map(l => (
                          <span key={l.location} className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                            📍{l.location} <span className="font-medium text-gray-800">{l.stock}</span>
                          </span>
                        ))}
                      </div>
                    : <span className="text-gray-400">—</span>
                  }
                </td>
                <td className="px-4 py-3 text-right font-medium">{part.stock_current} {part.unit}</td>
                <td className="px-4 py-3 text-right">
                  {part.stock_incoming > 0
                    ? <span className="text-blue-600 font-medium">+{part.stock_incoming} {part.unit}</span>
                    : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-4 py-3 text-right text-gray-500">{part.stock_min} {part.unit}</td>
                {sort === 'most_demanded' && <td className="px-4 py-3 text-right font-medium text-blue-700">{part.shipped_qty}</td>}
                <td className="px-4 py-3"><StockBadge current={part.stock_current} min={part.stock_min} /></td>
                <td className="px-4 py-3 text-right">
                  {perm.parts.edit && <button onClick={() => openEdit(part)} className="text-gray-400 hover:text-blue-600 mr-3 text-xs font-medium">Editar</button>}
                  {perm.parts.delete && <button onClick={() => handleDelete(part.id)} className="text-gray-400 hover:text-red-600 text-xs font-medium">Eliminar</button>}
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
        ) : parts.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">No hay piezas</div>
        ) : parts.map(part => (
          <Link key={part.id} to={`/parts/${part.id}`}
            className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 p-3 active:bg-gray-50">
            {part.image_url
              ? <img src={part.image_url} alt="" className="w-14 h-14 object-cover rounded-lg border border-gray-200 shrink-0" />
              : <div className="w-14 h-14 rounded-lg border border-gray-100 bg-gray-50 shrink-0 flex items-center justify-center text-gray-300 text-xl">⬡</div>
            }
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-1 mb-0.5">
                <span className="font-mono text-xs text-gray-400 truncate">{part.code}</span>
                <StockBadge current={part.stock_current} min={part.stock_min} />
              </div>
              <div className="font-semibold text-gray-900 text-sm leading-tight">{part.name}</div>
              <div className="text-xs text-gray-400 mt-0.5 truncate">
                {part.category}
                {part.locations?.length > 0 && (
                  <span className="ml-1">{part.locations.map(l => `📍${l.location}`).join(' · ')}</span>
                )}
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-sm font-medium text-gray-700">{part.stock_current} {part.unit}</span>
                <span className="text-xs text-gray-400">mín. {part.stock_min}</span>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
        <span>{total} pieza{total === 1 ? '' : 's'} · p.{page}/{totalPages}</span>
        <div className="flex gap-2">
          <button onClick={() => goToPage(page - 1)} disabled={page <= 1}
            className="px-3 py-1.5 rounded-md border border-gray-300 disabled:opacity-40 hover:bg-gray-50">←</button>
          <button onClick={() => goToPage(page + 1)} disabled={page >= totalPages}
            className="px-3 py-1.5 rounded-md border border-gray-300 disabled:opacity-40 hover:bg-gray-50">→</button>
        </div>
      </div>

      {showForm && (
        <Modal title={editing ? 'Editar pieza' : 'Nueva pieza'} onClose={closeForm} size="lg">
          <PartForm initial={editing} onSave={handleSave} onCancel={closeForm} />
        </Modal>
      )}
    </div>
  )
}
