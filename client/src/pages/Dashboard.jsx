import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import StatusBadge from '../components/ui/StatusBadge'

function KpiCard({ label, value, sub, color, to }) {
  const content = (
    <div className={`bg-white rounded-xl border border-gray-200 p-4 md:p-6 hover:shadow-md transition-shadow ${to ? 'cursor-pointer' : ''}`}>
      <p className="text-sm text-gray-500 font-medium">{label}</p>
      <p className={`text-3xl font-bold mt-2 ${color}`}>{value ?? '—'}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )
  return to ? <Link to={to}>{content}</Link> : content
}

function fmtDuration(mins) {
  if (mins === null) return '—'
  if (mins < 60) return `${mins}m`
  if (mins < 1440) return `${Math.round(mins / 60)}h`
  return `${(mins / 1440).toFixed(1)}d`
}

function PhaseBar({ label, avg, max, highlight }) {
  return (
    <div className={`rounded-lg p-3 border ${highlight ? 'border-red-200 bg-red-50' : 'border-gray-100 bg-gray-50'}`}>
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-xl font-bold ${highlight ? 'text-red-600' : 'text-gray-900'}`}>{fmtDuration(avg)}</div>
      {max !== null && <div className="text-xs text-gray-400 mt-0.5">máx {fmtDuration(max)}</div>}
    </div>
  )
}

export default function Dashboard() {
  const [dash, setDash] = useState(null)
  const [stats, setStats] = useState(null)
  const [supplierCount, setSupplierCount] = useState(null)
  const [efficiency, setEfficiency] = useState(null)
  const [effDays, setEffDays] = useState(30)
  const [monthly, setMonthly] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    api.getDashboard().then(setDash).catch(() => {})
    api.getPartStats().then(setStats).catch(() => {})
    api.getSuppliers().then(s => setSupplierCount(s.length)).catch(() => {})
    api.getMonthlyDeliveries(12).then(setMonthly).catch(() => {})
  }, [])

  useEffect(() => {
    api.getEfficiency(effDays).then(setEfficiency).catch(() => {})
  }, [effDays])

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      <h1 className="text-xl md:text-2xl font-bold text-gray-900">Inicio</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-5">
        <KpiCard label="Referencias" value={stats?.total_parts} sub="en catálogo" color="text-gray-900" to="/parts" />
        <KpiCard label="Stock bajo" value={stats?.low_stock} sub="por debajo del mínimo"
          color={stats?.low_stock > 0 ? 'text-red-600' : 'text-green-600'} to="/parts?low_stock=true" />
        <KpiCard label="OC pendientes" value={dash?.pending_orders?.length ?? '—'} sub="en curso o borrador"
          color={dash?.pending_orders?.length > 0 ? 'text-orange-600' : 'text-gray-900'} to="/purchases" />
        <KpiCard label="Proveedores" value={supplierCount} sub="activos" color="text-gray-900" to="/suppliers" />
      </div>

      {/* Low stock list */}
      {dash?.low_stock?.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Piezas con stock bajo</h2>
            <Link to="/parts?low_stock=true" className="text-xs text-blue-600 hover:underline">Ver todas →</Link>
          </div>
          <div className="bg-white rounded-xl border border-red-200 divide-y divide-gray-100">
            {dash.low_stock.map(p => (
              <button key={p.id} onClick={() => navigate(`/parts/${p.id}`)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 text-left">
                <div>
                  <span className="font-mono text-xs text-gray-400 mr-2">{p.code}</span>
                  <span className="text-sm text-gray-800">{p.name}</span>
                </div>
                <div className="shrink-0 ml-4 text-right">
                  <span className="text-sm font-bold text-red-600">{p.stock_current}</span>
                  <span className="text-xs text-gray-400"> / {p.stock_min} {p.unit}</span>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Pending purchase orders */}
      {dash?.pending_orders?.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Órdenes de compra pendientes</h2>
            <Link to="/purchases" className="text-xs text-blue-600 hover:underline">Ver todas →</Link>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {dash.pending_orders.map(o => (
              <button key={o.id} onClick={() => navigate('/purchases')}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 text-left">
                <div>
                  <div className="text-sm font-medium text-gray-900">{o.reference || `OC-${o.id}`}</div>
                  <div className="text-xs text-gray-500">{o.supplier.name}</div>
                </div>
                <StatusBadge status={o.status} />
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Active deliveries */}
      {dash?.active_deliveries?.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Albaranes en curso</h2>
            <Link to="/deliveries" className="text-xs text-blue-600 hover:underline">Ver todos →</Link>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {dash.active_deliveries.map(d => (
              <button key={d.id} onClick={() => navigate('/deliveries')}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 text-left">
                <div>
                  <div className="text-sm font-medium text-gray-900">ALB-{d.id}</div>
                  <div className="text-xs text-gray-500">{d.odoo_partner_name || d.client_ref || '—'}</div>
                </div>
                <StatusBadge status={d.status} />
              </button>
            ))}
          </div>
        </section>
      )}

      {dash && dash.pending_orders?.length === 0 && dash.active_deliveries?.length === 0 && dash.low_stock?.length === 0 && (
        <div className="text-center py-12 text-gray-400 text-sm">Todo en orden</div>
      )}

      {/* Monthly deliveries chart */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Albaranes enviados por mes</h2>
          {monthly && (
            <span className="text-xs text-gray-400">
              Total 12m: {monthly.reduce((s, m) => s + m.count, 0)}
            </span>
          )}
        </div>
        {!monthly ? (
          <div className="text-center py-6 text-gray-400 text-sm">Cargando...</div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            {(() => {
              const max = Math.max(...monthly.map(m => m.count), 1)
              const currentMonth = new Date().toLocaleDateString('es-ES', { month: 'short', year: '2-digit' })
              return (
                <div className="flex items-end gap-1.5 h-32">
                  {monthly.map(m => {
                    const pct = (m.count / max) * 100
                    const isCurrent = m.label === currentMonth
                    return (
                      <div key={m.key} className="flex-1 flex flex-col items-center gap-1 h-full justify-end group relative">
                        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-xs rounded px-1.5 py-0.5 opacity-0 group-hover:opacity-100 whitespace-nowrap z-10 pointer-events-none">
                          {m.count} albarán{m.count !== 1 ? 'es' : ''}
                        </div>
                        <div
                          className={`w-full rounded-t transition-all ${isCurrent ? 'bg-blue-500' : 'bg-blue-200'}`}
                          style={{ height: `${Math.max(pct, m.count > 0 ? 4 : 1)}%` }}
                        />
                        <span className="text-[10px] text-gray-400 truncate w-full text-center">{m.label}</span>
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </div>
        )}
      </section>

      {/* Efficiency */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Eficiencia de albaranes</h2>
          <div className="flex gap-1">
            {[7, 30, 90].map(d => (
              <button key={d} onClick={() => setEffDays(d)}
                className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-colors ${
                  effDays === d ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
                }`}>
                {d}d
              </button>
            ))}
          </div>
        </div>

        {!efficiency ? (
          <div className="text-center py-6 text-gray-400 text-sm">Cargando...</div>
        ) : efficiency.total_notes === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-gray-400 text-sm">
            Sin datos en los últimos {effDays} días.<br />
            <span className="text-xs">Los tiempos se registran a partir de ahora en cada cambio de estado.</span>
          </div>
        ) : (
          <>
            <div className="text-xs text-gray-400 mb-3">{efficiency.total_notes} albaranes en los últimos {effDays} días</div>
            {(() => {
              const phases = Object.values(efficiency.stats).filter(p => p.key !== 'total')
              const maxAvg = Math.max(...Object.values(efficiency.stats).filter(p => p.avg_minutes !== null).map(p => p.avg_minutes))
              return (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {['draft_to_confirmed','confirmed_to_picking','picking_to_ready','ready_to_shipped'].map(key => {
                      const p = efficiency.stats[key]
                      return <PhaseBar key={key} label={p.label} avg={p.avg_minutes} max={p.max_minutes}
                        highlight={p.avg_minutes !== null && p.avg_minutes === maxAvg && p.avg_minutes > 60} />
                    })}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {efficiency.stats.draft_to_shipped && (
                      <div className="bg-white rounded-xl border border-blue-200 p-4 flex items-center justify-between">
                        <div>
                          <div className="text-xs text-gray-500">Creación → Enviado</div>
                          <div className="text-2xl font-bold text-blue-700 mt-0.5">{fmtDuration(efficiency.stats.draft_to_shipped.avg_minutes)}</div>
                          <div className="text-xs text-gray-400 mt-0.5">tiempo medio de gestión interna</div>
                        </div>
                        <div className="text-right text-xs text-gray-400">
                          <div>Mín: {fmtDuration(efficiency.stats.draft_to_shipped.min_minutes)}</div>
                          <div>Máx: {fmtDuration(efficiency.stats.draft_to_shipped.max_minutes)}</div>
                          <div className="mt-1">{efficiency.stats.draft_to_shipped.count} albaranes</div>
                        </div>
                      </div>
                    )}
                    {efficiency.stats.shipped_to_delivered && (
                      <div className="bg-white rounded-xl border border-green-200 p-4 flex items-center justify-between">
                        <div>
                          <div className="text-xs text-gray-500">Enviado → Entregado</div>
                          <div className="text-2xl font-bold text-green-700 mt-0.5">{fmtDuration(efficiency.stats.shipped_to_delivered.avg_minutes)}</div>
                          <div className="text-xs text-gray-400 mt-0.5">tiempo medio de tránsito GLS</div>
                        </div>
                        <div className="text-right text-xs text-gray-400">
                          <div>Mín: {fmtDuration(efficiency.stats.shipped_to_delivered.min_minutes)}</div>
                          <div>Máx: {fmtDuration(efficiency.stats.shipped_to_delivered.max_minutes)}</div>
                          <div className="mt-1">{efficiency.stats.shipped_to_delivered.count} albaranes</div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )
            })()}
          </>
        )}
      </section>
    </div>
  )
}
