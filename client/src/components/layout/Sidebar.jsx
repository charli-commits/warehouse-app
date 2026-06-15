import { NavLink } from 'react-router-dom'
import { useAuth } from '../../lib/AuthContext'
import { getPermissions } from '../../lib/permissions'

export default function Sidebar() {
  const { user } = useAuth()
  const p = getPermissions(user?.role)

  const mainLinks = [
    p.nav.dashboard   && { to: '/',            label: 'Dashboard',        icon: '▦', exact: true },
    p.nav.parts       && { to: '/parts',        label: 'Piezas',           icon: '⬡' },
    p.nav.suppliers   && { to: '/suppliers',    label: 'Proveedores',      icon: '🏭' },
    p.nav.purchases   && { to: '/purchases',    label: 'Órdenes de Compra',icon: '📋' },
    p.nav.deliveries  && { to: '/deliveries',   label: 'Albaranes',        icon: '📦' },
    p.nav.locations   && { to: '/locations',    label: 'Ubicaciones',      icon: '📍' },
    p.nav.disassembly && { to: '/desmontaje',   label: 'Desmontaje',       icon: '🔧' },
    p.nav.reposicion  && { to: '/reposicion',   label: 'Reposición',       icon: '🔄' },
    p.nav.audit       && { to: '/auditoria',    label: 'Auditoría',        icon: '📋' },
  ].filter(Boolean)

  const bottomLinks = [
    p.nav.settings && { to: '/settings', label: 'Ajustes', icon: '⚙️' },
  ].filter(Boolean)

  function NavItem({ to, label, icon, exact }) {
    return (
      <NavLink to={to} end={exact}
        className={({ isActive }) =>
          `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
            isActive ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white'
          }`
        }>
        <span>{icon}</span>
        <span>{label}</span>
      </NavLink>
    )
  }

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-56 bg-gray-900 text-gray-100 flex-col min-h-screen shrink-0">
        <div className="px-5 py-5 border-b border-gray-700 flex items-center justify-between">
          <div>
            <h1 className="font-bold text-lg leading-tight">Almacén</h1>
            <p className="text-xs text-gray-400 mt-0.5">{user?.name}</p>
          </div>
          <NavLink to="/settings" title="Mi cuenta"
            className={({ isActive }) =>
              `w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                isActive ? 'bg-blue-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
              }`
            }>
            {user?.name?.charAt(0).toUpperCase()}
          </NavLink>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {mainLinks.map(link => <NavItem key={link.to} {...link} />)}
        </nav>
        <div className="px-3 py-4 border-t border-gray-700 space-y-0.5">
          {bottomLinks.map(link => <NavItem key={link.to} {...link} />)}
          {/* Always show logout-accessible settings for non-admin (just sesión) */}
          {!p.nav.settings && (
            <NavLink to="/settings" end
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                  isActive ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                }`
              }>
              <span>⚙️</span><span>Mi cuenta</span>
            </NavLink>
          )}
        </div>
      </aside>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-gray-900 border-t border-gray-700 flex">
        {[...mainLinks, ...bottomLinks, { to: '/settings', icon: '⚙️', exact: true }].slice(0, 6).map(link => (
          <NavLink key={link.to} to={link.to} end={link.exact}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center py-2 text-xs transition-colors ${
                isActive ? 'text-blue-400' : 'text-gray-400'
              }`
            }>
            <span className="text-lg leading-none mb-0.5">{link.icon}</span>
          </NavLink>
        ))}
      </nav>
    </>
  )
}
