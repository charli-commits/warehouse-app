import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { useTheme } from '../../lib/ThemeContext'

function PartResultRow({ p, onClick }) {
  const [imgOpen, setImgOpen] = useState(false)
  const imgRef = useRef()

  useEffect(() => {
    if (!imgOpen) return
    function handler(e) {
      if (!imgRef.current?.contains(e.target)) setImgOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [imgOpen])

  return (
    <div className="relative flex items-center gap-3 px-4 py-2.5 hover:bg-blue-50 group">
      {/* Thumbnail / placeholder */}
      <div className="shrink-0 w-8 h-8 rounded border border-gray-200 overflow-hidden bg-gray-100 flex items-center justify-center"
        onClick={e => { e.stopPropagation(); if (p.image_url) setImgOpen(v => !v) }}>
        {p.image_url
          ? <img src={p.image_url} alt="" className="w-full h-full object-cover cursor-zoom-in" />
          : <span className="text-gray-300 text-xs">—</span>}
      </div>

      {/* Popover imagen grande */}
      {imgOpen && p.image_url && (
        <div ref={imgRef}
          className="absolute left-12 top-0 z-[100] bg-white border border-gray-200 rounded-xl shadow-2xl p-1.5"
          onClick={e => e.stopPropagation()}>
          <img src={p.image_url} alt={p.name}
            className="max-w-[280px] max-h-[280px] object-contain rounded-lg" />
        </div>
      )}

      {/* Row clickable area */}
      <button onClick={onClick} className="flex flex-1 items-center gap-3 min-w-0 text-left">
        <span className="font-mono text-xs text-gray-400 w-24 shrink-0 truncate">{p.code}</span>
        <span className="flex-1 text-sm text-gray-900 truncate">{p.name}</span>
        <span className="text-xs text-gray-400 shrink-0">{p.stock_current} {p.unit}</span>
      </button>
    </div>
  )
}

export default function Header() {
  const { dark, toggle } = useTheme()
  const navigate = useNavigate()
  const [status, setStatus] = useState(null)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState(null)

  // Global search
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)
  const [searching, setSearching] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const searchTimer = useRef()
  const searchRef = useRef()

  useEffect(() => {
    api.getOdooStatus().then(setStatus).catch(() => {})
  }, [])

  useEffect(() => {
    function handler(e) {
      if (!searchRef.current?.contains(e.target)) setShowResults(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function handleSearch(q) {
    setQuery(q)
    clearTimeout(searchTimer.current)
    if (!q || q.trim().length < 2) { setResults(null); setShowResults(false); return }
    setSearching(true)
    searchTimer.current = setTimeout(async () => {
      try {
        const data = await api.globalSearch(q.trim())
        setResults(data)
        setShowResults(true)
      } catch {}
      finally { setSearching(false) }
    }, 250)
  }

  function goTo(path) {
    setShowResults(false)
    setQuery('')
    setResults(null)
    navigate(path)
  }

  const STATUS_LABELS = { DRAFT: 'Borrador', SENT: 'Enviada', LOCATING: 'Ubicando', PARTIAL: 'Parcial', RECEIVED: 'Recibida', CONFIRMED: 'Confirmado', PICKING: 'Picking', READY: 'Listo', SHIPPED: 'Enviado', DELIVERED: 'Entregado' }

  const hasResults = results && (results.parts.length + results.purchases.length + results.deliveries.length) > 0

  async function handleSync() {
    setSyncing(true); setError(null)
    try {
      const result = await api.syncOdoo()
      setStatus(s => ({ ...s, last_sync: result.synced_at, cached_products: result.synced_products, cached_partners: result.synced_partners }))
    } catch (err) {
      setError(err.message)
    } finally {
      setSyncing(false) }
  }

  const lastSync = status?.last_sync
    ? new Date(status.last_sync).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })
    : 'Nunca'

  return (
    <header className="hidden md:flex bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-6 py-3 items-center justify-between gap-4">
      {/* Global search */}
      <div className="relative flex-1 max-w-md" ref={searchRef}>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
          <input
            type="text"
            value={query}
            onChange={e => handleSearch(e.target.value)}
            onFocus={() => { if (results && query.length >= 2) setShowResults(true) }}
            placeholder="Buscar pieza, OC, albarán…"
            className="w-full pl-8 pr-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          {searching && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 text-xs">…</span>}
        </div>

        {showResults && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-xl z-50 overflow-hidden max-h-[480px] overflow-y-auto">
            {!hasResults ? (
              <div className="px-4 py-6 text-center text-sm text-gray-400 dark:text-gray-500">Sin resultados para "{query}"</div>
            ) : (
              <>
                {results.parts.length > 0 && (
                  <div>
                    <div className="px-4 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide bg-gray-50 dark:bg-gray-700 dark:text-gray-400 border-b dark:border-gray-600">Piezas</div>
                    {results.parts.map(p => (
                      <PartResultRow key={p.id} p={p} onClick={() => goTo(`/parts/${p.id}`)} />
                    ))}
                  </div>
                )}
                {results.purchases.length > 0 && (
                  <div>
                    <div className="px-4 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide bg-gray-50 dark:bg-gray-700 dark:text-gray-400 border-b dark:border-gray-600">Órdenes de compra</div>
                    {results.purchases.map(o => (
                      <button key={o.id} onClick={() => goTo(`/purchases/${o.id}`)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-blue-50 dark:hover:bg-gray-700 text-left">
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100 w-32 shrink-0">{o.reference || `#${o.id}`}</span>
                        <span className="flex-1 text-xs text-gray-500 dark:text-gray-400 truncate">{o.supplier?.name}</span>
                        <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">{STATUS_LABELS[o.status] || o.status}</span>
                      </button>
                    ))}
                  </div>
                )}
                {results.deliveries.length > 0 && (
                  <div>
                    <div className="px-4 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide bg-gray-50 dark:bg-gray-700 dark:text-gray-400 border-b dark:border-gray-600">Albaranes</div>
                    {results.deliveries.map(d => (
                      <button key={d.id} onClick={() => goTo(`/deliveries`)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-blue-50 dark:hover:bg-gray-700 text-left">
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100 flex-1 truncate">{d.odoo_partner_name || '—'}</span>
                        <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">{d.client_ref || ''}</span>
                        <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">{STATUS_LABELS[d.status] || d.status}</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-4 shrink-0">
        <button onClick={toggle} title={dark ? 'Modo claro' : 'Modo oscuro'}
          className="w-8 h-8 flex items-center justify-center rounded-md text-gray-400 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-base">
          {dark ? '☀️' : '🌙'}
        </button>
        {error && <span className="text-xs text-red-500">{error}</span>}
        <div className="text-xs text-gray-500 dark:text-gray-400">
          Última sync Odoo: <span className="font-medium text-gray-700">{lastSync}</span>
          {status?.cached_products != null && (
            <span className="ml-2 text-gray-400 dark:text-gray-500">({status.cached_products} productos · {status.cached_partners} clientes)</span>
          )}
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium px-4 py-2 rounded-md transition-colors"
        >
          {syncing ? (
            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
          ) : '↺'}
          {syncing ? 'Sincronizando...' : 'Sincronizar Odoo'}
        </button>
      </div>
    </header>
  )
}
