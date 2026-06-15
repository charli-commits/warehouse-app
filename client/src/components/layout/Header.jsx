import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'

export default function Header() {
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
    <header className="hidden md:flex bg-white border-b border-gray-200 px-6 py-3 items-center justify-between gap-4">
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
            className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          {searching && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 text-xs">…</span>}
        </div>

        {showResults && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-50 overflow-hidden max-h-[480px] overflow-y-auto">
            {!hasResults ? (
              <div className="px-4 py-6 text-center text-sm text-gray-400">Sin resultados para "{query}"</div>
            ) : (
              <>
                {results.parts.length > 0 && (
                  <div>
                    <div className="px-4 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide bg-gray-50 border-b">Piezas</div>
                    {results.parts.map(p => (
                      <button
                        key={p.id}
                        onClick={() => goTo(`/parts/${p.id}`)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-blue-50 text-left"
                      >
                        <span className="font-mono text-xs text-gray-400 w-24 shrink-0 truncate">{p.code}</span>
                        <span className="flex-1 text-sm text-gray-900 truncate">{p.name}</span>
                        <span className="text-xs text-gray-400 shrink-0">{p.stock_current} {p.unit}</span>
                      </button>
                    ))}
                  </div>
                )}
                {results.purchases.length > 0 && (
                  <div>
                    <div className="px-4 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide bg-gray-50 border-b">Órdenes de compra</div>
                    {results.purchases.map(o => (
                      <button
                        key={o.id}
                        onClick={() => goTo(`/purchases/${o.id}`)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-blue-50 text-left"
                      >
                        <span className="text-sm font-medium text-gray-900 w-32 shrink-0">{o.reference || `#${o.id}`}</span>
                        <span className="flex-1 text-xs text-gray-500 truncate">{o.supplier?.name}</span>
                        <span className="text-xs text-gray-400 shrink-0">{STATUS_LABELS[o.status] || o.status}</span>
                      </button>
                    ))}
                  </div>
                )}
                {results.deliveries.length > 0 && (
                  <div>
                    <div className="px-4 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide bg-gray-50 border-b">Albaranes</div>
                    {results.deliveries.map(d => (
                      <button
                        key={d.id}
                        onClick={() => goTo(`/deliveries`)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-blue-50 text-left"
                      >
                        <span className="text-sm font-medium text-gray-900 flex-1 truncate">{d.odoo_partner_name || '—'}</span>
                        <span className="text-xs text-gray-400 shrink-0">{d.client_ref || ''}</span>
                        <span className="text-xs text-gray-400 shrink-0">{STATUS_LABELS[d.status] || d.status}</span>
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
        {error && <span className="text-xs text-red-500">{error}</span>}
        <div className="text-xs text-gray-500">
          Última sync Odoo: <span className="font-medium text-gray-700">{lastSync}</span>
          {status?.cached_products != null && (
            <span className="ml-2 text-gray-400">({status.cached_products} productos · {status.cached_partners} clientes)</span>
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
