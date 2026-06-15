import { useState, useEffect, useRef } from 'react'
import { api } from '../lib/api'

// Inline part search for order lines
function PartSearch({ value, valueName, onChange, manufacturer }) {
  const [query, setQuery] = useState(valueName || '')
  const [open, setOpen] = useState(false)
  const [parts, setParts] = useState([])
  const ref = useRef(null)

  useEffect(() => { setQuery(valueName || '') }, [valueName])

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  useEffect(() => {
    const params = { page_size: 60 }
    if (query) params.search = query
    if (manufacturer) params.manufacturer = manufacturer
    const t = setTimeout(() => {
      api.getParts(params)
        .then(res => setParts(Array.isArray(res) ? res : (res.data || [])))
        .catch(() => {})
    }, 250)
    return () => clearTimeout(t)
  }, [query, manufacturer])

  const filtered = parts

  function select(p) {
    setQuery(p ? `[${p.code}] ${p.name}` : '')
    onChange(p)
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative">
      <input
        type="text"
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true); if (!e.target.value) onChange(null) }}
        onFocus={() => setOpen(true)}
        placeholder="Buscar pieza..."
        className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 mt-1 min-w-full w-[34rem] max-w-[90vw] bg-white border border-gray-200 rounded shadow-lg max-h-72 overflow-y-auto">
          {filtered.map(p => (
            <button key={p.id} type="button" onMouseDown={() => select(p)}
              className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 flex flex-col gap-0.5 border-b border-gray-50 last:border-0">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-gray-400 shrink-0">{p.code}</span>
                <span className="ml-auto text-xs text-gray-400 shrink-0">{p.stock_current} {p.unit}</span>
              </div>
              <span className="text-gray-800 leading-snug">{p.name}</span>
              {p.odoo_product_name && <span className="text-xs text-gray-400 leading-snug">{p.odoo_product_name}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// lines: [{ part_id, part_code, part_name, part_unit, quantity_ordered, quantity_received, unit_price }]
// for deliveries: quantity instead of quantity_ordered
export default function LinesEditor({ lines, onChange, mode = 'purchase', manufacturer }) {
  function addLine() {
    onChange([...lines, { part_id: null, part_code: '', part_name: '', part_unit: 'ud', quantity_ordered: 1, quantity: 1, unit_price: '' }])
  }

  function removeLine(i) {
    onChange(lines.filter((_, idx) => idx !== i))
  }

  function updateLine(i, field, value) {
    onChange(lines.map((l, idx) => idx === i ? { ...l, [field]: value } : l))
  }

  function selectPart(i, part) {
    if (!part) {
      updateLine(i, 'part_id', null)
      updateLine(i, 'part_name', '')
      updateLine(i, 'part_code', '')
      updateLine(i, 'part_unit', 'ud')
    } else {
      onChange(lines.map((l, idx) => idx === i ? {
        ...l,
        part_id: part.id,
        part_code: part.code,
        part_name: part.name,
        part_unit: part.unit,
      } : l))
    }
  }

  const qtyField = mode === 'purchase' ? 'quantity_ordered' : 'quantity'
  const qtyLabel = mode === 'purchase' ? 'Cantidad' : 'Cantidad'

  return (
    <div>
      <div className="space-y-2">
        {lines.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-3">Sin líneas. Añade una pieza.</p>
        )}
        {lines.map((line, i) => (
          <div key={i} className="flex gap-2 items-start">
            <div className="flex-1">
              <PartSearch
                value={line.part_id}
                valueName={line.part_id ? `[${line.part_code}] ${line.part_name}` : ''}
                onChange={(p) => selectPart(i, p)}
                manufacturer={manufacturer}
              />
            </div>
            <div className="w-24">
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={line[qtyField]}
                onChange={e => updateLine(i, qtyField, e.target.value)}
                placeholder={qtyLabel}
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {mode === 'purchase' && (
              <div className="w-28">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={line.unit_price}
                  onChange={e => updateLine(i, 'unit_price', e.target.value)}
                  placeholder="Precio/ud"
                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}
            <div className="w-10 text-center text-xs text-gray-400 pt-2">
              {line.part_unit || 'ud'}
            </div>
            <button type="button" onClick={() => removeLine(i)}
              className="text-gray-300 hover:text-red-500 pt-1 text-lg leading-none">×</button>
          </div>
        ))}
      </div>
      <button type="button" onClick={addLine}
        className="mt-3 text-sm text-blue-600 hover:text-blue-800 font-medium">
        + Añadir línea
      </button>
    </div>
  )
}
