import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'

export default function AuditDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [audit, setAudit] = useState(null)
  const [loading, setLoading] = useState(true)
  const [filterLoc, setFilterLoc] = useState('')
  const [filterCat, setFilterCat] = useState('')
  const [filterStatus, setFilterStatus] = useState('ALL')
  const [pendingCounts, setPendingCounts] = useState({})
  const [saving, setSaving] = useState({})

  // Add-part state
  const [addSearch, setAddSearch] = useState('')
  const [addResults, setAddResults] = useState([])
  const [addPart, setAddPart] = useState(null)           // selected part object
  const [addLocation, setAddLocation] = useState('')
  const [addLocSearch, setAddLocSearch] = useState('')
  const [showAddLocs, setShowAddLocs] = useState(false)
  const [addPartLocs, setAddPartLocs] = useState([])     // existing locations for selected part
  const [allLocations, setAllLocations] = useState([])   // all warehouse locations

  const [closing, setClosing] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)
  const [error, setError] = useState(null)
  const searchTimer = useRef()
  const locBlurTimer = useRef()

  useEffect(() => {
    load()
    api.getPartLocations().then(locs => {
      setAllLocations([...new Set(locs.map(l => l.location).filter(Boolean))].sort())
    }).catch(() => {})
  }, [id])

  async function load() {
    try {
      const a = await api.getAudit(Number(id))
      setAudit(a)
    } catch { navigate('/auditoria') }
    finally { setLoading(false) }
  }

  function lineKey(l) { return `${l.part_id}_${l.location}` }

  async function submitCount(line, rawValue) {
    const val = parseFloat(rawValue)
    if (isNaN(val) || val < 0) return
    const key = lineKey(line)
    setSaving(s => ({ ...s, [key]: true }))
    try {
      const updated = await api.upsertAuditLine(Number(id), {
        part_id: line.part_id,
        location: line.location,
        counted_stock: val,
      })
      setAudit(a => ({
        ...a,
        lines: a.lines.map(l => lineKey(l) === key ? { ...l, ...updated } : l)
      }))
      setPendingCounts(p => { const n = { ...p }; delete n[key]; return n })
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(s => { const n = { ...s }; delete n[key]; return n })
    }
  }

  function searchAdd(q) {
    clearTimeout(searchTimer.current)
    if (!q || q.length < 2) { setAddResults([]); return }
    searchTimer.current = setTimeout(async () => {
      const res = await api.getParts({ search: q }).catch(() => ({ data: [] }))
      setAddResults(res.data || [])
    }, 200)
  }

  async function selectAddPart(part) {
    setAddPart(part)
    setAddSearch(`${part.code} — ${part.name}`)
    setAddResults([])
    // Pre-load part's existing locations
    try {
      const detail = await api.getPart(part.id)
      const locs = (detail.locations || []).map(l => l.location).filter(Boolean)
      setAddPartLocs(locs)
      if (locs.length === 1) {
        setAddLocation(locs[0])
        setAddLocSearch(locs[0])
      } else {
        setAddLocation('')
        setAddLocSearch('')
      }
    } catch {
      setAddPartLocs([])
    }
  }

  async function handleAddLine() {
    if (!addPart) return setError('Selecciona una pieza')
    if (!addLocation.trim()) return setError('Introduce una ubicación')
    setError(null)
    try {
      await api.upsertAuditLine(Number(id), {
        part_id: addPart.id,
        location: addLocation.trim(),
        counted_stock: null,
      })
      await load()
      setAddSearch('')
      setAddPart(null)
      setAddLocation('')
      setAddLocSearch('')
      setAddPartLocs([])
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleClose() {
    setClosing(true); setError(null)
    try {
      const closed = await api.closeAudit(Number(id))
      setAudit(closed)
      setConfirmClose(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setClosing(false)
    }
  }

  if (loading) return <div className="p-8 text-gray-400">Cargando…</div>
  if (!audit) return null

  const auditLocations = [...new Set(audit.lines.map(l => l.location))].sort()
  const auditCategories = [...new Set(audit.lines.map(l => l.part?.category).filter(Boolean))].sort()

  const filtered = audit.lines.filter(l => {
    if (filterLoc && l.location !== filterLoc) return false
    if (filterCat && l.part?.category !== filterCat) return false
    if (filterStatus === 'PENDING' && l.counted_stock != null) return false
    if (filterStatus === 'OK' && (l.counted_stock == null || l.difference !== 0)) return false
    if (filterStatus === 'DIFF' && (l.counted_stock == null || l.difference === 0)) return false
    return true
  })

  const totalLines = audit.lines.length
  const countedLines = audit.lines.filter(l => l.counted_stock != null).length
  const diffLines = audit.lines.filter(l => l.counted_stock != null && l.difference !== 0).length
  const pendingLines = totalLines - countedLines
  const isClosed = audit.status === 'CLOSED'

  // Location suggestions for add-part field: part's own locs first, then all others
  const locSuggestions = (() => {
    const q = addLocSearch.toLowerCase()
    const own = addPartLocs.filter(l => !q || l.toLowerCase().includes(q))
    const others = allLocations.filter(l => !addPartLocs.includes(l) && (!q || l.toLowerCase().includes(q)))
    return [...own, ...others]
  })()

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <button onClick={() => navigate('/auditoria')} className="text-sm text-gray-400 hover:text-gray-600 mb-1">← Auditorías</button>
          <h1 className="text-2xl font-bold text-gray-900">{audit.name}</h1>
          {audit.notes && <p className="text-sm text-gray-500 mt-0.5">{audit.notes}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${isClosed ? 'bg-gray-100 text-gray-600' : 'bg-blue-100 text-blue-700'}`}>
            {isClosed ? 'Cerrada' : 'En curso'}
          </span>
          <a
            href={`/api/audits/${id}/export?format=csv`}
            download
            className="px-4 py-2 border rounded text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            ↓ CSV
          </a>
          {!isClosed && (
            <button onClick={() => setConfirmClose(true)} className="px-4 py-2 bg-green-600 text-white rounded text-sm font-medium hover:bg-green-700">
              Cerrar y ajustar
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total líneas', value: totalLines, color: 'text-gray-900' },
          { label: 'Contadas', value: countedLines, color: 'text-blue-600' },
          { label: 'Con diferencia', value: diffLines, color: diffLines > 0 ? 'text-red-600' : 'text-green-600' },
          { label: 'Pendientes', value: pendingLines, color: pendingLines > 0 ? 'text-amber-600' : 'text-green-600' },
        ].map(s => (
          <div key={s.label} className="bg-white border rounded-lg p-3 text-center">
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {totalLines > 0 && (
        <div className="bg-gray-200 rounded-full h-2 overflow-hidden">
          <div className="bg-blue-500 h-2 rounded-full transition-all" style={{ width: `${(countedLines / totalLines) * 100}%` }} />
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <select
          value={filterLoc}
          onChange={e => setFilterLoc(e.target.value)}
          className="border rounded px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Todas las ubicaciones{auditLocations.length > 0 ? ` (${auditLocations.length})` : ''}</option>
          {auditLocations.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        <select
          value={filterCat}
          onChange={e => setFilterCat(e.target.value)}
          className="border rounded px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Todas las categorías{auditCategories.length > 0 ? ` (${auditCategories.length})` : ''}</option>
          {auditCategories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        {['ALL', 'PENDING', 'DIFF', 'OK'].map(s => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${filterStatus === s ? 'bg-blue-600 text-white' : 'bg-white border text-gray-600 hover:bg-gray-50'}`}
          >
            {{ ALL: 'Todas', PENDING: 'Pendientes', DIFF: 'Con diferencia', OK: 'Sin diferencia' }[s]}
          </button>
        ))}
        <span className="text-sm text-gray-400 ml-auto">{filtered.length} líneas</span>
      </div>

      {/* Lines table */}
      <div className="bg-white border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-2 font-semibold text-gray-600">Código</th>
              <th className="text-left px-4 py-2 font-semibold text-gray-600">Pieza</th>
              <th className="text-left px-4 py-2 font-semibold text-gray-600">Ubicación</th>
              <th className="text-right px-4 py-2 font-semibold text-gray-600">Sistema</th>
              <th className="text-right px-4 py-2 font-semibold text-gray-600">Contado</th>
              <th className="text-right px-4 py-2 font-semibold text-gray-600">Diferencia</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Sin líneas</td></tr>
            )}
            {filtered.map(line => {
              const key = lineKey(line)
              const pending = pendingCounts[key]
              const hasDiff = line.counted_stock != null && line.difference !== 0
              const isOk = line.counted_stock != null && line.difference === 0
              return (
                <tr key={key} className={hasDiff ? 'bg-red-50' : isOk ? 'bg-green-50' : ''}>
                  <td className="px-4 py-2 font-mono text-xs text-gray-500">{line.part?.code}</td>
                  <td className="px-4 py-2 text-gray-900">{line.part?.name}</td>
                  <td className="px-4 py-2 text-gray-500">{line.location}</td>
                  <td className="px-4 py-2 text-right text-gray-700">{line.system_stock} {line.part?.unit}</td>
                  <td className="px-4 py-2 text-right">
                    {isClosed ? (
                      <span className="font-medium">{line.counted_stock ?? '—'}</span>
                    ) : (
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={pending ?? (line.counted_stock ?? '')}
                        onChange={e => setPendingCounts(p => ({ ...p, [key]: e.target.value }))}
                        onBlur={e => { if (pending !== undefined) submitCount(line, e.target.value) }}
                        onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }}
                        placeholder="—"
                        className={`w-20 border rounded px-2 py-1 text-right text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent ${saving[key] ? 'opacity-50' : ''}`}
                      />
                    )}
                  </td>
                  <td className="px-4 py-2 text-right font-medium">
                    {line.counted_stock == null ? (
                      <span className="text-gray-300">—</span>
                    ) : line.difference === 0 ? (
                      <span className="text-green-600">✓</span>
                    ) : (
                      <span className={line.difference > 0 ? 'text-blue-600' : 'text-red-600'}>
                        {line.difference > 0 ? '+' : ''}{line.difference} {line.part?.unit}
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Add part (only when open) */}
      {!isClosed && (
        <div className="bg-white border rounded-lg p-4 space-y-3">
          <h3 className="text-sm font-semibold text-gray-700">Añadir pieza al recuento</h3>
          <div className="flex gap-2 items-start">
            {/* Part search */}
            <div className="relative flex-1">
              <input
                type="text"
                value={addSearch}
                onChange={e => {
                  setAddSearch(e.target.value)
                  if (!e.target.value) { setAddPart(null); setAddPartLocs([]) }
                  searchAdd(e.target.value)
                }}
                placeholder="Buscar pieza por código o nombre…"
                className={`w-full border rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 ${addPart ? 'border-green-400 bg-green-50' : ''}`}
              />
              {addResults.length > 0 && (
                <ul className="absolute z-30 bg-white border rounded shadow-lg mt-1 w-full max-h-48 overflow-y-auto text-sm">
                  {addResults.map(p => (
                    <li
                      key={p.id}
                      className="px-3 py-2 hover:bg-blue-50 cursor-pointer flex gap-2"
                      onMouseDown={() => selectAddPart(p)}
                    >
                      <span className="font-mono text-xs text-gray-400 shrink-0">{p.code}</span>
                      <span className="truncate">{p.name}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Location */}
            <div className="relative w-56">
              <input
                type="text"
                value={addLocSearch}
                onChange={e => { setAddLocSearch(e.target.value); setAddLocation(e.target.value); setShowAddLocs(true) }}
                onFocus={() => setShowAddLocs(true)}
                onBlur={() => { locBlurTimer.current = setTimeout(() => setShowAddLocs(false), 150) }}
                placeholder="Ubicación"
                className="w-full border rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
              />
              {addPartLocs.length > 0 && !addLocSearch && (
                <p className="text-xs text-blue-600 mt-0.5">
                  Ubicaciones: {addPartLocs.join(', ')}
                </p>
              )}
              {showAddLocs && locSuggestions.length > 0 && (
                <ul className="absolute z-30 bg-white border rounded shadow-lg mt-1 w-full max-h-48 overflow-y-auto text-sm">
                  {addPartLocs.length > 0 && (
                    <li className="px-3 py-1 text-xs text-blue-600 font-semibold bg-blue-50">Ubicaciones actuales</li>
                  )}
                  {addPartLocs.filter(l => !addLocSearch || l.toLowerCase().includes(addLocSearch.toLowerCase())).map(loc => (
                    <li
                      key={`own-${loc}`}
                      className="px-3 py-2 hover:bg-blue-50 cursor-pointer flex items-center gap-2"
                      onMouseDown={() => { clearTimeout(locBlurTimer.current); setAddLocation(loc); setAddLocSearch(loc); setShowAddLocs(false) }}
                    >
                      <span className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
                      {loc}
                    </li>
                  ))}
                  {addPartLocs.length > 0 && allLocations.filter(l => !addPartLocs.includes(l)).length > 0 && (
                    <li className="px-3 py-1 text-xs text-gray-400 font-semibold bg-gray-50">Otras ubicaciones</li>
                  )}
                  {allLocations
                    .filter(l => !addPartLocs.includes(l) && (!addLocSearch || l.toLowerCase().includes(addLocSearch.toLowerCase())))
                    .map(loc => (
                      <li
                        key={`all-${loc}`}
                        className="px-3 py-2 hover:bg-blue-50 cursor-pointer"
                        onMouseDown={() => { clearTimeout(locBlurTimer.current); setAddLocation(loc); setAddLocSearch(loc); setShowAddLocs(false) }}
                      >
                        {loc}
                      </li>
                    ))}
                </ul>
              )}
            </div>

            <button
              onClick={handleAddLine}
              disabled={!addPart || !addLocation.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-40 shrink-0"
            >
              Añadir
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm flex justify-between">
          {error}
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 ml-4">×</button>
        </div>
      )}

      {/* Confirm close modal */}
      {confirmClose && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
            <h2 className="text-lg font-bold text-gray-900">Cerrar auditoría</h2>
            <p className="text-sm text-gray-600">
              Se aplicarán los ajustes de las <strong>{diffLines}</strong> líneas con diferencia.
              {pendingLines > 0 && <span className="text-amber-600 block mt-1">⚠ Quedan {pendingLines} líneas sin contar — no se ajustarán.</span>}
              Esta acción no se puede deshacer.
            </p>
            {error && <p className="text-red-600 text-sm">{error}</p>}
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmClose(false)} className="px-4 py-2 border rounded text-sm hover:bg-gray-50">Cancelar</button>
              <button onClick={handleClose} disabled={closing} className="px-4 py-2 bg-green-600 text-white rounded text-sm hover:bg-green-700 disabled:opacity-50">
                {closing ? 'Cerrando…' : 'Confirmar y ajustar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
