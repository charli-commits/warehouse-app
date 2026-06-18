import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../lib/AuthContext'
import StockBadge from '../components/ui/StockBadge'
import Modal from '../components/ui/Modal'

export default function PartDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const [part, setPart] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showAdjust, setShowAdjust] = useState(false)
  const [adjustQty, setAdjustQty] = useState('')
  const [adjustNotes, setAdjustNotes] = useState('')
  const [adjusting, setAdjusting] = useState(false)

  const [uploadingImg, setUploadingImg] = useState(false)

  // Locations
  const [allLocations, setAllLocations] = useState([])
  const [showAddLoc, setShowAddLoc] = useState(false)
  const [newLoc, setNewLoc] = useState('')
  const [newLocStock, setNewLocStock] = useState('0')
  const [savingLoc, setSavingLoc] = useState(false)
  const [showTransfer, setShowTransfer] = useState(false)
  const [transferFrom, setTransferFrom] = useState('')
  const [transferTo, setTransferTo] = useState('')
  const [transferQty, setTransferQty] = useState('')
  const [transferring, setTransferring] = useState(false)

  const [showScrap, setShowScrap] = useState(false)
  const [scrapLocation, setScrapLocation] = useState('')
  const [scrapQty, setScrapQty] = useState('')
  const [scrapReason, setScrapReason] = useState('')
  const [scrapping, setScrapping] = useState(false)

  // Purchase history
  const [purchases, setPurchases] = useState([])
  const [lots, setLots] = useState([])

  // Movements pagination
  const [movementsData, setMovementsData] = useState(null) // { movements, total, pages }
  const [movPage, setMovPage] = useState(1)
  const [loadingMov, setLoadingMov] = useState(false)

  useEffect(() => {
    load()
    api.getPartLocations().then(setAllLocations).catch(() => {})
    api.getPartPurchases(id).then(setPurchases).catch(() => {})
    api.getPartLots(id).then(setLots).catch(() => {})
    loadMovements(1)
  }, [id])

  async function loadMovements(page) {
    setLoadingMov(true)
    try {
      const data = await api.getPartMovements(id, page)
      setMovementsData(data)
      setMovPage(page)
    } catch {}
    finally { setLoadingMov(false) }
  }

  async function load() {
    setLoading(true)
    api.getPart(id).then(setPart).finally(() => setLoading(false))
  }

  async function handleAdjust(e) {
    e.preventDefault()
    setAdjusting(true)
    try {
      const result = await api.adjustStock(id, Number(adjustQty), adjustNotes, user?.name)
      setPart(p => ({ ...p, stock_current: result.part.stock_current, movements: [result.movement, ...p.movements] }))
      setShowAdjust(false)
      setAdjustQty('')
      setAdjustNotes('')
    } catch (err) {
      alert(err.message)
    } finally {
      setAdjusting(false)
    }
  }

  async function handleAddLocation(e) {
    e.preventDefault()
    if (!newLoc.trim()) return
    setSavingLoc(true)
    try {
      await api.addPartLocation(id, newLoc.trim(), Number(newLocStock) || 0)
      setShowAddLoc(false)
      setNewLoc('')
      setNewLocStock('0')
      await load()
      api.getPartLocations().then(setAllLocations)
    } catch (err) {
      alert(err.message)
    } finally {
      setSavingLoc(false)
    }
  }

  function compressImage(file, maxPx = 1200, quality = 0.82) {
    return new Promise((resolve) => {
      const img = new Image()
      const url = URL.createObjectURL(file)
      img.onload = () => {
        URL.revokeObjectURL(url)
        let { width, height } = img
        if (width > maxPx || height > maxPx) {
          if (width > height) { height = Math.round(height * maxPx / width); width = maxPx }
          else { width = Math.round(width * maxPx / height); height = maxPx }
        }
        const canvas = document.createElement('canvas')
        canvas.width = width; canvas.height = height
        canvas.getContext('2d').drawImage(img, 0, 0, width, height)
        canvas.toBlob(resolve, 'image/jpeg', quality)
      }
      img.src = url
    })
  }

  async function handleImageUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingImg(true)
    try {
      const compressed = await compressImage(file)
      const fd = new FormData()
      fd.append('image', compressed, 'photo.jpg')
      const token = JSON.parse(localStorage.getItem('wh_user') || '{}')?.token
      const res = await fetch(`/api/parts/${id}/image`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setPart(p => ({ ...p, image_url: data.image_url + '?t=' + Date.now() }))
    } catch (err) {
      alert(err.message)
    } finally {
      setUploadingImg(false)
      e.target.value = ''
    }
  }

  async function handleDeleteLocation(location) {
    if (!confirm(`¿Eliminar la ubicación "${location}"?`)) return
    try {
      await api.deletePartLocation(id, location)
      load()
    } catch (err) {
      alert(err.message)
    }
  }

  async function handleScrap(e) {
    e.preventDefault()
    if (!scrapQty || !scrapReason) return
    if (!confirm(`¿Dar de baja ${scrapQty} ${part.unit} por "${scrapReason}"? Esta acción no se puede deshacer.`)) return
    setScrapping(true)
    try {
      const updated = await api.scrapStock(id, scrapLocation || null, Number(scrapQty), scrapReason, user?.name)
      setPart(updated)
      api.getPartLots(id).then(setLots).catch(() => {})
      setShowScrap(false); setScrapLocation(''); setScrapQty(''); setScrapReason('')
    } catch (err) {
      alert(err.message)
    } finally {
      setScrapping(false)
    }
  }

  async function handleTransfer(e) {
    e.preventDefault()
    if (!transferFrom || !transferTo || !transferQty) return
    setTransferring(true)
    try {
      const updated = await api.transferStock(id, transferFrom, transferTo, Number(transferQty), user?.name)
      setPart(updated)
      api.getPartLots(id).then(setLots).catch(() => {})
      setShowTransfer(false); setTransferFrom(''); setTransferTo(''); setTransferQty('')
    } catch (err) {
      alert(err.message)
    } finally {
      setTransferring(false)
    }
  }

  if (loading) return <div className="p-8 text-gray-400">Cargando...</div>
  if (!part) return <div className="p-8 text-red-500">Pieza no encontrada</div>

  const locations = part.locations || []

  return (
    <div className="p-4 md:p-8 max-w-4xl">
      <div className="flex items-center gap-3 mb-6">
        <Link to="/parts" className="text-gray-400 hover:text-gray-700 text-sm">← Piezas</Link>
        <span className="text-gray-300">/</span>
        <span className="font-medium">{part.code}</span>
      </div>

      {/* Info card */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-6 mb-4">
        <div className="flex items-start gap-4">
          <div className="relative shrink-0 group">
            {part.image_url
              ? <img src={part.image_url} alt={part.name}
                  onError={e => { e.target.style.display = 'none' }}
                  className="w-24 h-24 md:w-32 md:h-32 object-cover rounded-lg border border-gray-200 cursor-pointer"
                  onClick={() => window.open(part.image_url.split('?')[0], '_blank')} />
              : <div className="w-24 h-24 md:w-32 md:h-32 rounded-lg border-2 border-dashed border-gray-200 bg-gray-50 flex items-center justify-center text-gray-300 text-3xl">📷</div>
            }
            <label className={`absolute inset-0 flex items-center justify-center rounded-lg cursor-pointer bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity ${uploadingImg ? 'opacity-100' : ''}`}>
              <span className="text-white text-xs font-medium">{uploadingImg ? 'Subiendo...' : part.image_url ? '🔄 Cambiar' : '📷 Subir'}</span>
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleImageUpload} disabled={uploadingImg} />
            </label>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h1 className="text-xl md:text-2xl font-bold text-gray-900">{part.name}</h1>
                <p className="text-gray-500 mt-0.5 font-mono text-sm">{part.code}</p>
                {part.description && <p className="text-gray-600 mt-2 text-sm">{part.description}</p>}
              </div>
              <StockBadge current={part.stock_current} min={part.stock_min} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 pt-4 border-t border-gray-100">
          <Stat label="Stock total" value={`${part.stock_current} ${part.unit}`} large />
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-gray-500">Entrante</span>
            {part.stock_incoming > 0
              ? <span className="text-lg font-bold text-blue-600">+{part.stock_incoming} {part.unit}</span>
              : <span className="text-lg font-bold text-gray-300">—</span>}
          </div>
          <Stat label="Stock mínimo" value={`${part.stock_min} ${part.unit}`} />
          <Stat label="Precio coste" value={part.cost_price != null ? `${Number(part.cost_price).toFixed(2)} €` : '—'} />
          <Stat label="Categoría" value={part.category || '—'} />
          <Stat label="Unidad" value={part.unit} />
          {part.manufacturer && <Stat label="Fabricante" value={part.manufacturer} />}
          {part.odoo_product_name && <Stat label="Producto Odoo" value={part.odoo_product_name} />}
        </div>

        {/* Incoming detail */}
        {part.incoming_lines?.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">En camino · OCs abiertas</p>
            <div className="space-y-1.5">
              {part.incoming_lines.map(l => {
                const STATUS = { DRAFT: 'Borrador', SENT: 'Enviada', LOCATING: 'Ubicando', PARTIAL: 'Parcial' }
                const STATUS_COLOR = { DRAFT: 'text-gray-400', SENT: 'text-blue-500', LOCATING: 'text-amber-500', PARTIAL: 'text-orange-500' }
                return (
                  <div key={l.order_id} className="flex items-center justify-between text-sm bg-blue-50 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-3">
                      <span className={`text-xs font-medium ${STATUS_COLOR[l.status]}`}>{STATUS[l.status]}</span>
                      <span className="font-medium text-gray-800">{l.reference || `#${l.order_id}`}</span>
                      <span className="text-gray-500 text-xs">{l.supplier}</span>
                    </div>
                    <div className="flex items-center gap-3 text-right">
                      {l.eta && (
                        <span className="text-xs text-emerald-600 font-medium">
                          ETA {new Date(l.eta).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
                        </span>
                      )}
                      <span className="text-xs text-gray-400">
                        {l.quantity_received > 0 ? `${l.quantity_received}/${l.quantity_ordered} recibidas` : `${l.quantity_ordered} pedidas`}
                      </span>
                      <span className="font-bold text-blue-700">+{l.pending} {part.unit}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <div className="mt-4 flex gap-2">
          <button onClick={() => { setShowScrap(true); setScrapLocation(part.locations?.[0]?.location || '') }}
            className="border border-red-200 hover:border-red-400 hover:text-red-600 text-red-500 text-sm font-medium px-4 py-2 rounded-md">
            Dar de baja
          </button>
          <button onClick={() => setShowAdjust(true)}
            className="border border-gray-300 hover:border-blue-400 hover:text-blue-600 text-gray-600 text-sm font-medium px-4 py-2 rounded-md">
            Ajuste manual
          </button>
        </div>
      </div>

      {/* Ubicaciones */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Ubicaciones</h2>
          <div className="flex items-center gap-3">
            {part.locations?.some(l => l.stock > 0) && (
              <button onClick={() => { setShowTransfer(true); setTransferFrom(part.locations.find(l => l.stock > 0)?.location || ''); setTransferQty('') }}
                className="text-xs font-medium text-blue-600 hover:text-blue-800 border border-blue-200 px-2 py-1 rounded">
                ⇄ Traspasar
              </button>
            )}
            <button onClick={() => setShowAddLoc(s => !s)}
              className="text-xs font-medium text-blue-600 hover:text-blue-800">
              {showAddLoc ? 'Cancelar' : '+ Añadir ubicación'}
            </button>
          </div>
        </div>

        {showAddLoc && (
          <form onSubmit={handleAddLocation} className="px-4 py-3 bg-gray-50 border-b border-gray-100">
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-600 mb-1">Ubicación</label>
                <input
                  type="text" value={newLoc} onChange={e => setNewLoc(e.target.value)}
                  placeholder="Ej: ESTANTERÍA-A3"
                  list="locations-list" required
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <datalist id="locations-list">
                  {allLocations.map(l => <option key={l} value={l} />)}
                </datalist>
              </div>
              <div className="w-24">
                <label className="block text-xs font-medium text-gray-600 mb-1">Stock inicial</label>
                <input
                  type="number" min="0" step="0.01" value={newLocStock}
                  onChange={e => setNewLocStock(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <button type="submit" disabled={savingLoc}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-md">
                {savingLoc ? '...' : 'Guardar'}
              </button>
            </div>
          </form>
        )}

        {locations.length === 0 ? (
          <div className="px-4 py-6 text-center text-gray-400 text-sm">
            Sin ubicaciones asignadas
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {locations.map(loc => (
              <div key={loc.location} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="text-lg">📍</span>
                  <div>
                    <div className="font-medium text-gray-900 text-sm">{loc.location}</div>
                    <div className="text-xs text-gray-500">{loc.stock} {part.unit}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`text-sm font-semibold ${loc.stock > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                    {loc.stock} {part.unit}
                  </div>
                  {loc.stock === 0 && (
                    <button onClick={() => handleDeleteLocation(loc.location)}
                      className="text-xs text-red-400 hover:text-red-600">Eliminar</button>
                  )}
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between px-4 py-2 bg-gray-50">
              <span className="text-xs font-medium text-gray-500">Total</span>
              <span className="text-sm font-bold text-gray-900">{part.stock_current} {part.unit}</span>
            </div>
          </div>
        )}
      </div>

      {/* Historial de movimientos */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Historial de movimientos</h2>
          {movementsData && <span className="text-xs text-gray-400">{movementsData.total} total</span>}
        </div>
        {(() => {
          const REF_LABELS = { PURCHASE: 'Compra', DELIVERY: 'Albarán', ADJUSTMENT: 'Ajuste', DISASSEMBLY: 'Desmontaje', SCRAP: 'Baja', TRANSFER: 'Traspaso' }
          const movs = movementsData?.movements || []
          return (
            <>
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Fecha</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Tipo</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-600">Cantidad</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Origen</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Usuario</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Notas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {loadingMov ? (
                      <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">Cargando…</td></tr>
                    ) : movs.length === 0 ? (
                      <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">Sin movimientos</td></tr>
                    ) : movs.map(m => (
                      <tr key={m.id}>
                        <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{new Date(m.created_at).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${m.type === 'IN' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {m.type === 'IN' ? 'Entrada' : 'Salida'}
                          </span>
                        </td>
                        <td className={`px-4 py-3 text-right font-medium ${m.type === 'IN' ? 'text-green-600' : 'text-red-600'}`}>{m.type === 'IN' ? '+' : '-'}{m.quantity}</td>
                        <td className="px-4 py-3 text-gray-500">
                          {m.reference_type === 'PURCHASE' && m.reference_id ? (
                            <a href={`/purchases/${m.reference_id}`} className="text-blue-600 hover:underline text-xs">{m.reference_name || `OC-${m.reference_id}`}</a>
                          ) : m.reference_type === 'DELIVERY' && m.reference_id ? (
                            <span className="text-xs">{REF_LABELS[m.reference_type]} · {m.reference_name || `ALB-${m.reference_id}`}</span>
                          ) : REF_LABELS[m.reference_type] || m.reference_type || '—'}
                        </td>
                        <td className="px-4 py-3 text-gray-500">{m.user_name || '—'}</td>
                        <td className="px-4 py-3 text-gray-400 text-xs max-w-xs truncate">{m.notes || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Mobile */}
              <div className="md:hidden divide-y divide-gray-100">
                {movs.length === 0 ? (
                  <div className="px-4 py-6 text-center text-gray-400 text-sm">Sin movimientos</div>
                ) : movs.map(m => (
                  <div key={m.id} className="px-4 py-3 flex items-center justify-between">
                    <div>
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium mr-2 ${m.type === 'IN' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {m.type === 'IN' ? 'Entrada' : 'Salida'}
                      </span>
                      {m.reference_type === 'PURCHASE' && m.reference_id ? (
                        <a href={`/purchases/${m.reference_id}`} className="text-xs text-blue-600 hover:underline">{m.reference_name || `OC-${m.reference_id}`}</a>
                      ) : (
                        <span className="text-xs text-gray-500">{REF_LABELS[m.reference_type] || m.reference_type || ''}</span>
                      )}
                      {m.notes && <div className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">{m.notes}</div>}
                    </div>
                    <div className="text-right">
                      <div className={`font-semibold text-sm ${m.type === 'IN' ? 'text-green-600' : 'text-red-600'}`}>{m.type === 'IN' ? '+' : '-'}{m.quantity}</div>
                      <div className="text-xs text-gray-400">{new Date(m.created_at).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}</div>
                    </div>
                  </div>
                ))}
              </div>
              {/* Pagination */}
              {movementsData && movementsData.pages > 1 && (
                <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
                  <span className="text-xs text-gray-400">Página {movPage} de {movementsData.pages}</span>
                  <div className="flex gap-2">
                    <button onClick={() => loadMovements(movPage - 1)} disabled={movPage <= 1 || loadingMov} className="px-3 py-1 text-xs border rounded hover:bg-gray-50 disabled:opacity-40">← Anterior</button>
                    <button onClick={() => loadMovements(movPage + 1)} disabled={movPage >= movementsData.pages || loadingMov} className="px-3 py-1 text-xs border rounded hover:bg-gray-50 disabled:opacity-40">Siguiente →</button>
                  </div>
                </div>
              )}
            </>
          )
        })()}
      </div>

      {/* Lotes en stock */}
      {lots.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">Lotes en stock</h2>
            <span className="text-xs text-gray-400">FIFO — más antiguo primero</span>
          </div>
          <div className="divide-y divide-gray-100">
            {lots.map((lot, i) => (
              <div key={lot.id} className={`px-4 py-3 ${i === 0 ? 'bg-blue-50' : ''}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {i === 0 && <span className="text-xs bg-blue-600 text-white px-1.5 py-0.5 rounded font-medium">FIFO</span>}
                    <span className="text-sm font-mono font-medium text-gray-800">{lot.lot_number}</span>
                  </div>
                  <span className="text-xs text-gray-400">{new Date(lot.created_at).toLocaleDateString('es-ES')}</span>
                </div>
                <div className="flex flex-wrap gap-2 mt-1.5">
                  {lot.locations.map(ll => (
                    <span key={ll.id} className="text-xs bg-white border border-gray-200 rounded px-2 py-1">
                      📍 {ll.location} · <span className="font-semibold">{ll.stock}</span> uds
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Historial de compras */}
      {purchases.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-900">Historial de compras</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {purchases.map(line => (
              <div key={line.id} className="px-4 py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium text-gray-900">{line.order.reference || `OC-${line.order.id}`}</span>
                    <span className="text-xs text-gray-500 ml-2">{line.order.supplier.name}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-semibold text-gray-800">{line.quantity_ordered} ud</span>
                    <span className={`ml-2 text-xs px-1.5 py-0.5 rounded font-medium ${
                      line.order.status === 'RECEIVED' ? 'bg-green-100 text-green-700' :
                      line.order.status === 'LOCATING' || line.order.status === 'PARTIAL' ? 'bg-indigo-100 text-indigo-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>{line.order.status}</span>
                  </div>
                </div>
                <div className="text-xs text-gray-400 mt-0.5">
                  {new Date(line.order.order_date).toLocaleDateString('es-ES')}
                  {line.receiptLines.length > 0 && (
                    <span className="ml-2">· Ubicado: {line.receiptLines.map(r => `${r.quantity} en ${r.location}`).join(', ')}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showAdjust && (
        <Modal title="Ajuste de stock" onClose={() => setShowAdjust(false)} size="sm">
          <form onSubmit={handleAdjust} className="p-6 space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Cantidad (positivo = entrada, negativo = salida)
              </label>
              <input type="number" step="0.01" required value={adjustQty}
                onChange={e => setAdjustQty(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Ej: 10 o -5" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Notas</label>
              <input type="text" value={adjustNotes} onChange={e => setAdjustNotes(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Motivo del ajuste" />
            </div>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setShowAdjust(false)} className="px-4 py-2 text-sm text-gray-600">Cancelar</button>
              <button type="submit" disabled={adjusting}
                className="bg-blue-600 text-white text-sm font-medium px-5 py-2 rounded-md disabled:bg-blue-400">
                {adjusting ? 'Guardando...' : 'Confirmar'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {showScrap && (
        <Modal title="Dar de baja" onClose={() => { setShowScrap(false); setScrapLocation(''); setScrapQty(''); setScrapReason('') }}>
          <form onSubmit={handleScrap} className="p-6 space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Ubicación (opcional)</label>
              <select value={scrapLocation} onChange={e => setScrapLocation(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400">
                <option value="">— Sin ubicación específica —</option>
                {part.locations?.filter(l => l.stock > 0).map(l => (
                  <option key={l.location} value={l.location}>{l.location} ({l.stock} {part.unit})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Cantidad
                {scrapLocation && (() => {
                  const src = part.locations?.find(l => l.location === scrapLocation)
                  return src ? <span className="text-gray-400 font-normal ml-1">(máx {src.stock} {part.unit})</span> : null
                })()}
              </label>
              <input type="number" min="0.01"
                max={scrapLocation ? part.locations?.find(l => l.location === scrapLocation)?.stock : part.stock_current}
                step="0.01" value={scrapQty} onChange={e => setScrapQty(e.target.value)} required
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Motivo *</label>
              <input type="text" list="scrap-reasons" value={scrapReason} onChange={e => setScrapReason(e.target.value)}
                placeholder="Ej: Defectuoso, Roto, Caducado..."
                required
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
              <datalist id="scrap-reasons">
                <option value="Defectuoso" />
                <option value="Roto" />
                <option value="Caducado" />
                <option value="Perdido" />
                <option value="Error de inventario" />
              </datalist>
            </div>
            <div className="flex justify-end gap-3 pt-1">
              <button type="button" onClick={() => { setShowScrap(false); setScrapLocation(''); setScrapQty(''); setScrapReason('') }}
                className="px-4 py-2 text-sm text-gray-600">Cancelar</button>
              <button type="submit" disabled={scrapping}
                className="bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white text-sm font-medium px-5 py-2 rounded-md">
                {scrapping ? 'Dando de baja...' : 'Confirmar baja'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {showTransfer && (
        <Modal title="Traspaso de ubicación" onClose={() => { setShowTransfer(false); setTransferFrom(''); setTransferTo(''); setTransferQty('') }}>
          <form onSubmit={handleTransfer} className="p-6 space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Ubicación origen</label>
              <select value={transferFrom} onChange={e => { setTransferFrom(e.target.value); setTransferQty('') }} required
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">— Seleccionar —</option>
                {part.locations?.filter(l => l.stock > 0).map(l => (
                  <option key={l.location} value={l.location}>{l.location} ({l.stock} {part.unit})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Ubicación destino</label>
              <input type="text" list="transfer-dest-list" value={transferTo}
                onChange={e => setTransferTo(e.target.value)}
                placeholder="Escanea QR o escribe..."
                required
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <datalist id="transfer-dest-list">
                {allLocations.filter(l => l !== transferFrom).map(l => <option key={l} value={l} />)}
              </datalist>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Cantidad
                {transferFrom && (() => {
                  const src = part.locations?.find(l => l.location === transferFrom)
                  return src ? <span className="text-gray-400 font-normal ml-1">(máx {src.stock} {part.unit})</span> : null
                })()}
              </label>
              <input type="number" min="0.01"
                max={part.locations?.find(l => l.location === transferFrom)?.stock}
                step="0.01"
                value={transferQty} onChange={e => setTransferQty(e.target.value)}
                required
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="flex justify-end gap-3 pt-1">
              <button type="button" onClick={() => { setShowTransfer(false); setTransferFrom(''); setTransferTo(''); setTransferQty('') }}
                className="px-4 py-2 text-sm text-gray-600">Cancelar</button>
              <button type="submit" disabled={transferring}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium px-5 py-2 rounded-md">
                {transferring ? 'Traspasando...' : 'Confirmar traspaso'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

function Stat({ label, value, large }) {
  return (
    <div>
      <p className="text-xs text-gray-500 font-medium">{label}</p>
      <p className={`font-semibold text-gray-900 mt-0.5 ${large ? 'text-xl' : 'text-sm'}`}>{value}</p>
    </div>
  )
}
