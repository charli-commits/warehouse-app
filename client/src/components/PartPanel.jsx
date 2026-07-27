import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import StockBadge from './ui/StockBadge'

export default function PartPanel({ partId, onClose }) {
  const [part, setPart] = useState(null)
  const [loading, setLoading] = useState(true)
  const [imgZoom, setImgZoom] = useState(false)

  useEffect(() => {
    if (!partId) return
    setLoading(true)
    setPart(null)
    api.getPart(partId).then(setPart).finally(() => setLoading(false))
  }, [partId])

  // Close on Escape
  useEffect(() => {
    function handler(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />

      {/* Panel */}
      <div className="fixed right-0 top-0 h-full z-50 w-full max-w-sm bg-white shadow-2xl flex flex-col animate-slide-in-right">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <span className="font-mono text-sm text-gray-400">{part?.code || '—'}</span>
          <div className="flex items-center gap-3">
            {part && (
              <Link to={`/parts/${part.id}`} onClick={onClose}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium border border-blue-200 px-2.5 py-1 rounded-md">
                Ver detalle completo →
              </Link>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">✕</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-40 text-gray-400 text-sm">Cargando…</div>
          ) : !part ? (
            <div className="flex items-center justify-center h-40 text-gray-400 text-sm">No encontrado</div>
          ) : (
            <div className="p-5 space-y-5">
              {/* Foto */}
              {part.image_url ? (
                <div className="relative">
                  <img
                    src={part.image_url}
                    alt={part.name}
                    onClick={() => setImgZoom(true)}
                    className="w-full max-h-64 object-contain rounded-xl border border-gray-100 bg-gray-50 cursor-zoom-in"
                  />
                </div>
              ) : (
                <div className="w-full h-40 rounded-xl border border-gray-100 bg-gray-50 flex items-center justify-center text-gray-300 text-4xl">⬡</div>
              )}

              {/* Nombre + badge */}
              <div>
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h2 className="font-semibold text-gray-900 text-base leading-snug">{part.name}</h2>
                  <StockBadge current={part.stock_current} min={part.stock_min} />
                </div>
                {part.odoo_product_name && <p className="text-xs text-gray-400">{part.odoo_product_name}</p>}
                <div className="flex flex-wrap gap-2 mt-2">
                  {part.category && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{part.category}</span>}
                  {part.manufacturer && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{part.manufacturer}</span>}
                  {part.unit && <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded">Unidad: {part.unit}</span>}
                </div>
              </div>

              {/* Stock total */}
              <div className="bg-gray-50 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">Stock total</p>
                  <p className="text-2xl font-bold text-gray-900">{part.stock_current} <span className="text-base font-medium text-gray-500">{part.unit}</span></p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500 mb-0.5">Mínimo</p>
                  <p className="text-lg font-semibold text-gray-600">{part.stock_min} <span className="text-sm text-gray-400">{part.unit}</span></p>
                </div>
              </div>

              {/* Ubicaciones */}
              {part.locations?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Ubicaciones</p>
                  <div className="space-y-1.5">
                    {part.locations.map(l => (
                      <div key={l.location} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                        <span className="text-sm text-gray-700 font-medium">📍 {l.location}</span>
                        <span className={`text-sm font-semibold ${l.stock > 0 ? 'text-green-700' : 'text-gray-400'}`}>
                          {l.stock} {part.unit}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Stock entrante */}
              {part.stock_incoming > 0 && (
                <div className="flex items-center gap-2 text-sm text-blue-600 bg-blue-50 rounded-lg px-3 py-2">
                  <span>📦</span>
                  <span><span className="font-semibold">+{part.stock_incoming} {part.unit}</span> entrante en pedidos</span>
                </div>
              )}

              {/* Notas */}
              {part.notes && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Notas</p>
                  <p className="text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2">{part.notes}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Zoom imagen */}
      {imgZoom && part?.image_url && (
        <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-6" onClick={() => setImgZoom(false)}>
          <img src={part.image_url} alt={part.name} className="max-w-full max-h-full object-contain rounded-xl" />
          <button onClick={() => setImgZoom(false)} className="absolute top-4 right-4 text-white text-3xl leading-none">✕</button>
        </div>
      )}
    </>
  )
}
