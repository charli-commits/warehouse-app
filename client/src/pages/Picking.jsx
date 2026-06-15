import { useRef, useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../lib/AuthContext'

export default function Picking() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [note, setNote] = useState(null)
  const [loading, setLoading] = useState(true)
  const [scanTarget, setScanTarget] = useState(null)
  const [decoding, setDecoding] = useState(false)
  const [forceModal, setForceModal] = useState(null)
  const [forceReason, setForceReason] = useState('')
  const [fifoMap, setFifoMap] = useState({}) // part_id → [{lot_number, location, stock}]
  const fileInputRef = useRef(null)

  useEffect(() => { load() }, [id])

  async function loadFifo(lines) {
    const partIds = [...new Set(lines.filter(l => !l.pickingLine).map(l => l.part_id))]
    const entries = await Promise.all(partIds.map(pid => api.getPartFifo(pid).then(r => [pid, r])))
    setFifoMap(Object.fromEntries(entries))
  }

  async function load() {
    setLoading(true)
    try {
      const data = await api.getDelivery(Number(id))
      let noteData = data
      if (data.status === 'CONFIRMED') {
        noteData = await api.startPicking(Number(id))
      }
      setNote(noteData)
      loadFifo(noteData.lines)
    } catch (err) {
      alert(err.message)
    } finally {
      setLoading(false)
    }
  }

  function startScan(line) {
    setScanTarget(line)
    // Trigger native camera via file input
    fileInputRef.current.value = ''
    fileInputRef.current.click()
  }

  async function handleFileCapture(e) {
    const file = e.target.files?.[0]
    if (!file || !scanTarget) return
    setDecoding(true)
    try {
      const jsQR = (await import('jsqr')).default
      const bitmap = await createImageBitmap(file)
      const canvas = document.createElement('canvas')
      canvas.width = bitmap.width
      canvas.height = bitmap.height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(bitmap, 0, 0)
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const result = jsQR(imageData.data, imageData.width, imageData.height)
      if (result) {
        handleScanResult(scanTarget, result.data)
      } else {
        alert('No se detectó ningún código QR en la imagen. Inténtalo de nuevo con mejor iluminación.')
      }
    } catch (err) {
      alert('Error al procesar la imagen: ' + err.message)
    } finally {
      setDecoding(false)
      setScanTarget(null)
    }
  }

  function handleScanResult(line, scannedText) {
    if (!line) return
    verifyLine(line, false, null, scannedText.trim())
  }

  async function verifyLine(line, forced, reason, scannedLocation = null) {
    try {
      const updated = await api.verifyLine(Number(id), {
        line_id: line.id,
        user_id: user?.id || null,
        forced,
        force_reason: reason || null,
        scanned_location: scannedLocation,
      })
      setNote(updated)
      loadFifo(updated.lines)
    } catch (err) {
      alert(err.message)
    }
  }

  async function handleClosePicking() {
    if (!confirm('¿Cerrar el picking y marcar como LISTO para etiquetar?')) return
    try {
      const updated = await api.closePicking(Number(id))
      setNote(updated)
    } catch (err) {
      alert(err.message)
    }
  }

  async function handleForce() {
    if (!forceReason.trim()) return
    await verifyLine(forceModal.line, true, forceReason, forceModal.scannedLocation)
    setForceModal(null)
    setForceReason('')
  }

  if (loading) return <div className="p-8 text-center text-gray-400">Cargando...</div>
  if (!note) return null

  const allVerified = note.lines.every(l => l.pickingLine)
  const verifiedCount = note.lines.filter(l => l.pickingLine).length

  return (
    <div className="min-h-screen bg-gray-50 pb-36">
      {/* Hidden file input — triggers native iOS camera */}
      <input ref={fileInputRef} type="file" accept="image/*" capture="environment"
        className="hidden" onChange={handleFileCapture} />
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => navigate('/deliveries')} className="text-gray-400 hover:text-gray-600 text-xl px-1">←</button>
        <div className="flex-1">
          <div className="font-semibold text-gray-900">ALB-{note.id} — Picking</div>
          <div className="text-xs text-gray-500">{note.odoo_partner_name} · {verifiedCount}/{note.lines.length} líneas</div>
        </div>
        {note.status === 'READY' && (
          <span className="text-xs font-medium bg-teal-100 text-teal-700 px-2 py-1 rounded-full">✓ Listo</span>
        )}
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-gray-200">
        <div className="h-1 bg-blue-500 transition-all"
          style={{ width: `${note.lines.length ? (verifiedCount / note.lines.length) * 100 : 0}%` }} />
      </div>

      {/* Lines */}
      <div className="p-4 space-y-3">
        {note.lines.map(line => {
          const verified = !!line.pickingLine
          const forced = line.pickingLine?.forced
          const fifo = fifoMap[line.part_id] || []
          return (
            <div key={line.id} className={`bg-white rounded-xl border p-4 ${
              verified ? (forced ? 'border-orange-200 bg-orange-50' : 'border-green-200 bg-green-50') : 'border-gray-200'
            }`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-mono text-xs text-gray-400">{line.part?.code}</span>
                    {forced && <span className="text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded">Forzado</span>}
                  </div>
                  <div className="font-semibold text-gray-900">{line.part?.name}</div>
                  <div className="flex gap-3 mt-1 text-xs text-gray-500">
                    <span className="font-medium text-gray-700 text-sm">{line.quantity} {line.part?.unit}</span>
                  </div>
                  {/* FIFO suggestion — only when not yet verified */}
                  {!verified && fifo.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {fifo.slice(0, 3).map((f, i) => (
                        <div key={i} className={`flex items-center gap-2 text-xs rounded-lg px-2 py-1.5 ${i === 0 ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50 border border-gray-100'}`}>
                          {i === 0 && <span className="text-blue-600 font-semibold shrink-0">FIFO</span>}
                          {i > 0 && <span className="text-gray-400 shrink-0">#{i + 1}</span>}
                          <span className="font-mono text-gray-600 shrink-0">{f.lot_number}</span>
                          <span className="text-gray-400">·</span>
                          <span className="font-medium text-gray-700">📍 {f.location}</span>
                          <span className="text-gray-400 ml-auto shrink-0">{f.stock} uds</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {!verified && fifo.length === 0 && (
                    <div className="mt-1.5 text-xs text-gray-400 italic">Sin lote asignado</div>
                  )}
                  {verified && line.pickingLine?.scanned_location && (
                    <div className="text-xs text-gray-500 mt-1">📍 {line.pickingLine.scanned_location}</div>
                  )}
                  {forced && line.pickingLine?.force_reason && (
                    <div className="text-xs text-orange-600 mt-1">Motivo: {line.pickingLine.force_reason}</div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2">
                  {verified ? (
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xl ${
                      forced ? 'bg-orange-100' : 'bg-green-100'
                    }`}>
                      {forced ? '⚠️' : '✓'}
                    </div>
                  ) : (
                    <button onClick={() => startScan(line)} disabled={decoding}
                      className="bg-blue-600 active:bg-blue-800 disabled:opacity-50 text-white text-sm font-medium px-4 py-2.5 rounded-xl">
                      {decoding && scanTarget?.id === line.id ? '...' : '📷 Escanear'}
                    </button>
                  )}
                  {!verified && (
                    <button onClick={() => verifyLine(line, false, null)}
                      className="text-xs text-gray-400 underline">
                      Sin escanear
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Bottom CTA — above mobile nav bar (pb-16 = 64px nav height) */}
      <div className="fixed bottom-16 left-0 right-0 px-4 pb-3 pt-2 bg-white border-t border-gray-200 md:bottom-0">
        {note.status === 'PICKING' && (
          <>
            {allVerified
              ? <p className="text-sm text-green-700 font-medium text-center mb-2">✓ Todas las líneas verificadas</p>
              : <p className="text-sm text-gray-500 text-center mb-2">{verifiedCount}/{note.lines.length} líneas verificadas</p>
            }
            <button onClick={handleClosePicking}
              className={`w-full font-semibold py-3.5 rounded-xl text-white text-base ${
                allVerified ? 'bg-green-600 active:bg-green-800' : 'bg-yellow-500 active:bg-yellow-700'
              }`}>
              {allVerified ? 'Cerrar picking — marcar Listo' : 'Cerrar picking igualmente'}
            </button>
          </>
        )}
        {note.status === 'READY' && (
          <>
            <p className="text-sm text-teal-700 font-medium text-center mb-2">✓ Pedido listo para etiquetar</p>
            <button onClick={() => navigate('/deliveries')}
              className="w-full bg-teal-600 active:bg-teal-800 text-white font-semibold py-3.5 rounded-xl text-base">
              Volver a albaranes
            </button>
          </>
        )}
      </div>

      {/* Force modal */}
      {forceModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end">
          <div className="bg-white w-full rounded-t-2xl p-6 pb-10">
            <h3 className="font-semibold text-gray-900 mb-2">Ubicación no coincide</h3>
            <div className="text-sm text-gray-500 mb-1">Esperado: <span className="font-medium text-gray-800">{forceModal.line.part?.location || '—'}</span></div>
            <div className="text-sm text-gray-500 mb-4">Escaneado: <span className="font-medium text-orange-600">{forceModal.scannedLocation}</span></div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Motivo (obligatorio)</label>
            <input type="text" value={forceReason} onChange={e => setForceReason(e.target.value)}
              placeholder="Ej: ubicación reorganizada, pieza movida..."
              className="w-full border border-gray-300 rounded-xl px-3 py-3 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-orange-400" />
            <div className="flex gap-3">
              <button onClick={() => { setForceModal(null); setForceReason('') }}
                className="flex-1 border border-gray-300 text-gray-600 py-3 rounded-xl text-sm font-medium">
                Cancelar
              </button>
              <button onClick={handleForce} disabled={!forceReason.trim()}
                className="flex-1 bg-orange-500 disabled:opacity-40 text-white py-3 rounded-xl text-sm font-medium">
                Forzar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
