import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'

const EMPTY_LINE = () => ({ part: null, partSearch: '', quantity: '', location: '', locSearch: '', showLocs: false })

export default function Disassembly() {
  const navigate = useNavigate()
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState([EMPTY_LINE()])
  const [locations, setLocations] = useState([])
  const [partSuggestions, setPartSuggestions] = useState({}) // lineIndex -> suggestions
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [history, setHistory] = useState([])
  const [showHistory, setShowHistory] = useState(false)
  const searchTimers = useRef({})
  const containerRef = useRef()

  useEffect(() => {
    api.getPartLocations().then(locs => {
      const unique = [...new Set(locs.map(l => l.location).filter(Boolean))].sort()
      setLocations(unique)
    }).catch(() => {})
    api.getDisassemblies().then(setHistory).catch(() => {})
  }, [])

  // Close location dropdowns on outside click
  useEffect(() => {
    function handler(e) {
      if (!containerRef.current?.contains(e.target)) {
        setLines(prev => prev.map(l => ({ ...l, showLocs: false })))
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function searchParts(idx, query) {
    clearTimeout(searchTimers.current[idx])
    if (!query || query.length < 2) {
      setPartSuggestions(s => ({ ...s, [idx]: [] }))
      return
    }
    searchTimers.current[idx] = setTimeout(async () => {
      try {
        const res = await api.getParts({ search: query })
        setPartSuggestions(s => ({ ...s, [idx]: res.data || [] }))
      } catch {}
    }, 200)
  }

  function setLine(idx, field, value) {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l))
  }

  function selectPart(idx, part) {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, part, partSearch: `${part.code} — ${part.name}` } : l))
    setPartSuggestions(s => ({ ...s, [idx]: [] }))
  }

  function selectLocation(idx, loc) {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, location: loc, locSearch: loc, showLocs: false } : l))
  }

  function addLine() {
    setLines(prev => [...prev, EMPTY_LINE()])
  }

  function removeLine(idx) {
    setLines(prev => prev.filter((_, i) => i !== idx))
  }

  function duplicateLine(idx) {
    setLines(prev => {
      const src = prev[idx]
      const copy = { ...src, quantity: '', location: '', locSearch: '', showLocs: false }
      const next = [...prev]
      next.splice(idx + 1, 0, copy)
      return next
    })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    if (!reference.trim()) return setError('Introduce una referencia')
    const validLines = lines.filter(l => l.part && Number(l.quantity) > 0 && l.location.trim())
    if (validLines.length === 0) return setError('Añade al menos una línea completa (pieza, cantidad, ubicación)')

    setSubmitting(true)
    try {
      await api.createDisassembly({
        reference,
        notes,
        lines: validLines.map(l => ({ part_id: l.part.id, quantity: Number(l.quantity), location: l.location.trim() }))
      })
      navigate('/parts')
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const validCount = lines.filter(l => l.part && Number(l.quantity) > 0 && l.location.trim()).length

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6" ref={containerRef}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Entrada por desmontaje</h1>
          <p className="text-sm text-gray-500 mt-1">Alta masiva de piezas procedentes de máquinas desmontadas</p>
        </div>
        <button onClick={() => setShowHistory(h => !h)} className="text-sm text-blue-600 hover:underline">
          {showHistory ? 'Ocultar historial' : 'Ver historial'}
        </button>
      </div>

      {showHistory && (
        <div className="border rounded-lg overflow-hidden">
          <div className="bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-600 uppercase tracking-wide border-b">Historial de desmontajes</div>
          {history.length === 0 ? (
            <p className="text-sm text-gray-400 p-4">Sin registros</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-2">Referencia</th>
                  <th className="text-left px-4 py-2">Piezas</th>
                  <th className="text-left px-4 py-2">Fecha</th>
                  <th className="text-left px-4 py-2">Notas</th>
                </tr>
              </thead>
              <tbody>
                {history.map(h => (
                  <tr key={h.id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium">{h.reference}</td>
                    <td className="px-4 py-2 text-gray-600">{h.lines.length} líneas</td>
                    <td className="px-4 py-2 text-gray-500">{new Date(h.created_at).toLocaleDateString('es-ES')}</td>
                    <td className="px-4 py-2 text-gray-400">{h.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Header */}
        <div className="bg-white border rounded-lg p-4 grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Referencia <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={reference}
              onChange={e => setReference(e.target.value)}
              placeholder="Ej: DEV-2026-001, Devolución cliente García"
              className="w-full border rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Opcional"
              className="w-full border rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Lines */}
        <div className="bg-white border rounded-lg overflow-visible">
          <div className="bg-gray-50 px-4 py-2 grid grid-cols-[1fr_90px_160px_64px] gap-2 text-xs font-semibold text-gray-600 uppercase tracking-wide border-b">
            <span>Pieza</span>
            <span>Cantidad</span>
            <span>Ubicación</span>
            <span></span>
          </div>
          <div className="divide-y">
            {lines.map((line, idx) => {
              const filteredLocs = line.locSearch
                ? locations.filter(l => l.toLowerCase().includes(line.locSearch.toLowerCase()))
                : locations
              return (
                <div key={idx} className="px-4 py-3 grid grid-cols-[1fr_90px_160px_64px] gap-2 items-start">
                  {/* Part search */}
                  <div className="relative">
                    <input
                      type="text"
                      value={line.partSearch}
                      onChange={e => {
                        setLine(idx, 'partSearch', e.target.value)
                        if (!e.target.value) setLine(idx, 'part', null)
                        searchParts(idx, e.target.value)
                      }}
                      placeholder="Buscar por código o nombre…"
                      className={`w-full border rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent ${line.part ? 'border-green-400 bg-green-50' : ''}`}
                    />
                    {(partSuggestions[idx]?.length > 0) && (
                      <ul className="absolute z-30 bg-white border rounded shadow-lg mt-1 w-full max-h-48 overflow-y-auto text-sm">
                        {partSuggestions[idx].map(p => (
                          <li
                            key={p.id}
                            className="px-3 py-2 hover:bg-blue-50 cursor-pointer flex items-center gap-2"
                            onMouseDown={() => selectPart(idx, p)}
                          >
                            <span className="font-mono text-xs text-gray-500 shrink-0">{p.code}</span>
                            <span className="truncate">{p.name}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* Quantity */}
                  <input
                    type="number"
                    min="0.01"
                    step="any"
                    value={line.quantity}
                    onChange={e => setLine(idx, 'quantity', e.target.value)}
                    placeholder="0"
                    className="border rounded px-3 py-2 text-sm text-right focus:ring-2 focus:ring-blue-500 focus:border-transparent w-full"
                  />

                  {/* Location custom dropdown */}
                  <div className="relative">
                    <input
                      type="text"
                      value={line.locSearch}
                      onChange={e => {
                        setLine(idx, 'locSearch', e.target.value)
                        setLine(idx, 'location', e.target.value)
                        setLine(idx, 'showLocs', true)
                      }}
                      onFocus={() => setLine(idx, 'showLocs', true)}
                      placeholder="Ubicación"
                      className="w-full border rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    {line.showLocs && filteredLocs.length > 0 && (
                      <ul className="absolute z-30 bg-white border rounded shadow-lg mt-1 w-full max-h-40 overflow-y-auto text-sm">
                        {filteredLocs.map(loc => (
                          <li
                            key={loc}
                            className="px-3 py-2 hover:bg-blue-50 cursor-pointer"
                            onMouseDown={() => selectLocation(idx, loc)}
                          >
                            {loc}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 pt-1.5">
                    <button
                      type="button"
                      onClick={() => duplicateLine(idx)}
                      title="Duplicar fila"
                      className="text-gray-400 hover:text-blue-500 px-1 text-lg leading-none"
                    >⧉</button>
                    <button
                      type="button"
                      onClick={() => removeLine(idx)}
                      disabled={lines.length === 1}
                      className="text-gray-400 hover:text-red-500 disabled:opacity-30 px-1 text-lg leading-none"
                    >×</button>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="px-4 py-3 border-t bg-gray-50">
            <button type="button" onClick={addLine} className="text-sm text-blue-600 hover:text-blue-800 font-medium">
              + Añadir pieza
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">{error}</div>
        )}

        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            {validCount > 0 ? `${validCount} línea${validCount !== 1 ? 's' : ''} lista${validCount !== 1 ? 's' : ''}` : 'Completa las líneas para continuar'}
          </p>
          <div className="flex gap-3">
            <button type="button" onClick={() => navigate(-1)} className="px-4 py-2 border rounded text-sm hover:bg-gray-50">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting || validCount === 0}
              className="px-6 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? 'Guardando…' : `Dar de alta${validCount > 0 ? ` (${validCount})` : ''}`}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
