import { useEffect, useState, useRef } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { api } from '../lib/api'

export default function LocationQRLabels() {
  const [locations, setLocations] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(new Set())
  const [cols, setCols] = useState(4)
  const [size, setSize] = useState(120)
  const printRef = useRef()

  useEffect(() => {
    api.getLocations()
      .then(locs => {
        setLocations(locs)
        setSelected(new Set(locs.map(l => l.location)))
      })
      .finally(() => setLoading(false))
  }, [])

  const filtered = locations.filter(l =>
    l.location.toLowerCase().includes(search.toLowerCase())
  )

  function toggleAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filtered.map(l => l.location)))
    }
  }

  function toggle(loc) {
    setSelected(s => {
      const n = new Set(s)
      n.has(loc) ? n.delete(loc) : n.add(loc)
      return n
    })
  }

  const toPrint = filtered.filter(l => selected.has(l.location))

  function handlePrint() {
    const content = printRef.current.innerHTML
    const win = window.open('', '_blank')
    win.document.write(`<!DOCTYPE html><html><head>
      <meta charset="utf-8">
      <title>Etiquetas de ubicación</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: monospace; background: white; }
        .grid { display: grid; grid-template-columns: repeat(${cols}, 1fr); gap: 8px; padding: 12px; }
        .label {
          border: 1px solid #ccc;
          border-radius: 6px;
          padding: 10px 8px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          page-break-inside: avoid;
        }
        .label svg { display: block; }
        .loc-name {
          font-size: 13px;
          font-weight: bold;
          letter-spacing: 1px;
          text-align: center;
        }
        .part-count {
          font-size: 10px;
          color: #666;
        }
        @media print {
          @page { margin: 10mm; }
          body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
        }
      </style>
    </head><body>
      <div class="grid">${content}</div>
      <script>window.onload = () => { window.print(); window.close() }<\/script>
    </body></html>`)
    win.document.close()
  }

  if (loading) return <div className="p-8 text-gray-400">Cargando ubicaciones...</div>

  return (
    <div className="p-4 md:p-8">
      <div className="flex items-center justify-between mb-4 md:mb-6">
        <h1 className="text-xl md:text-2xl font-bold text-gray-900">Etiquetas QR</h1>
        <button
          onClick={handlePrint}
          disabled={toPrint.length === 0}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-medium px-4 py-2 rounded-md"
        >
          🖨️ Imprimir {toPrint.length > 0 ? `(${toPrint.length})` : ''}
        </button>
      </div>

      {/* Controls */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 flex flex-wrap gap-3 items-center">
        <input
          type="text"
          placeholder="Filtrar ubicaciones..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border border-gray-300 rounded-md px-3 py-1.5 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button onClick={toggleAll} className="text-xs text-blue-600 hover:text-blue-800 border border-blue-200 rounded px-2 py-1.5">
          {selected.size === filtered.length ? 'Deseleccionar todo' : 'Seleccionar todo'}
        </button>
        <div className="flex items-center gap-2 ml-auto">
          <label className="text-xs text-gray-500">Columnas:</label>
          <select value={cols} onChange={e => setCols(Number(e.target.value))}
            className="border border-gray-300 rounded px-2 py-1 text-sm">
            {[2,3,4,5,6].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <label className="text-xs text-gray-500">Tamaño QR:</label>
          <select value={size} onChange={e => setSize(Number(e.target.value))}
            className="border border-gray-300 rounded px-2 py-1 text-sm">
            <option value={80}>Pequeño</option>
            <option value={120}>Mediano</option>
            <option value={160}>Grande</option>
          </select>
        </div>
      </div>

      {/* Selection list */}
      <div className="bg-white rounded-xl border border-gray-200 mb-4 overflow-hidden">
        <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 text-xs text-gray-500 font-medium">
          {filtered.length} ubicaciones · {selected.size} seleccionadas
        </div>
        <div className="max-h-40 overflow-y-auto divide-y divide-gray-100">
          {filtered.map(l => (
            <label key={l.location} className="flex items-center gap-3 px-4 py-2 hover:bg-gray-50 cursor-pointer">
              <input type="checkbox" checked={selected.has(l.location)} onChange={() => toggle(l.location)}
                className="rounded" />
              <span className="font-mono text-sm text-gray-800">{l.location}</span>
              <span className="text-xs text-gray-400">{l.parts.length} piezas</span>
            </label>
          ))}
        </div>
      </div>

      {/* Preview */}
      {toPrint.length > 0 && (
        <>
          <h2 className="text-sm font-semibold text-gray-600 mb-3">Vista previa</h2>
          <div
            ref={printRef}
            className="bg-white rounded-xl border border-gray-200 p-4"
            style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: '8px' }}
          >
            {toPrint.map(l => (
              <div key={l.location}
                className="border border-gray-200 rounded-lg p-2 flex flex-col items-center gap-1.5"
                data-loc={l.location}
              >
                <QRCodeSVG value={l.location} size={size} level="M" />
                <div className="font-mono font-bold text-center text-xs tracking-wider">{l.location}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
