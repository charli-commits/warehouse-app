import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../../lib/AuthContext'
import { getPermissions } from '../../lib/permissions'

export default function Sidebar() {
  const { user } = useAuth()
  const p = getPermissions(user?.role)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const mainLinks = [
    p.nav.dashboard   && { to: '/',            label: 'Dashboard',         icon: '▦', exact: true },
    p.nav.parts       && { to: '/parts',        label: 'Piezas',            icon: '⬡' },
    p.nav.suppliers   && { to: '/suppliers',    label: 'Proveedores',       icon: '🏭' },
    p.nav.purchases   && { to: '/purchases',    label: 'Órdenes de Compra', icon: '📋' },
    p.nav.deliveries  && { to: '/deliveries',   label: 'Albaranes',         icon: '📦' },
    p.nav.locations   && { to: '/locations',    label: 'Ubicaciones',       icon: '📍' },
    p.nav.disassembly && { to: '/desmontaje',   label: 'Desmontaje',        icon: '🔧' },
    p.nav.reposicion  && { to: '/reposicion',   label: 'Reposición',        icon: '🔄' },
    p.nav.audit       && { to: '/auditoria',    label: 'Auditoría',         icon: '📋' },
    p.nav.movements   && { to: '/movements',    label: 'Movimientos',       icon: '↕' },
  ].filter(Boolean)

  const bottomLinks = [
    p.nav.settings && { to: '/settings', label: 'Ajustes', icon: '⚙️' },
    !p.nav.settings && { to: '/settings', label: 'Mi cuenta', icon: '⚙️' },
  ].filter(Boolean)

  const allLinks = [...mainLinks, ...bottomLinks]

  function NavItem({ to, label, icon, exact, collapsed, onClick }) {
    return (
      <NavLink to={to} end={exact} onClick={onClick}
        title={collapsed ? label : undefined}
        className={({ isActive }) =>
          `flex items-center gap-3 rounded-md text-sm transition-colors
           ${collapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2'}
           ${isActive ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white'}`
        }>
        <span className="text-base leading-none shrink-0">{icon}</span>
        {!collapsed && <span className="truncate">{label}</span>}
      </NavLink>
    )
  }

  // Sidebar content shared between desktop and drawer
  function SidebarContent({ collapsed = false, onNavClick }) {
    return (
      <>
        <div className={`border-b border-gray-700 flex items-center ${collapsed ? 'px-2 py-4 justify-center' : 'px-4 py-4 justify-between'}`}>
          {!collapsed && (
            <div>
              <h1 className="font-bold text-lg leading-tight">Almacén</h1>
              <p className="text-xs text-gray-400 mt-0.5">{user?.name}</p>
            </div>
          )}
          <NavLink to="/settings" title="Mi cuenta" onClick={onNavClick}
            className={({ isActive }) =>
              `w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors shrink-0 ${
                isActive ? 'bg-blue-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
              }`
            }>
            {user?.name?.charAt(0).toUpperCase()}
          </NavLink>
        </div>
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          {mainLinks.map(link => <NavItem key={link.to} {...link} collapsed={collapsed} onClick={onNavClick} />)}
        </nav>
        <div className="px-2 py-3 border-t border-gray-700 space-y-0.5">
          {bottomLinks.map(link => <NavItem key={link.to} {...link} collapsed={collapsed} onClick={onNavClick} />)}
        </div>
      </>
    )
  }

  return (
    <>
      {/* Mobile hamburger button */}
      <button
        onClick={() => setDrawerOpen(true)}
        className="md:hidden fixed top-3 left-3 z-40 w-9 h-9 flex items-center justify-center bg-gray-900 text-white rounded-md shadow-lg"
        aria-label="Abrir menú">
        ☰
      </button>

      {/* Mobile drawer overlay */}
      {drawerOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDrawerOpen(false)} />
          <aside className="relative w-64 bg-gray-900 text-gray-100 flex flex-col min-h-screen shadow-2xl">
            <button
              onClick={() => setDrawerOpen(false)}
              className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center text-gray-400 hover:text-white rounded">
              ✕
            </button>
            <SidebarContent onNavClick={() => setDrawerOpen(false)} />
          </aside>
        </div>
      )}

      {/* Medium screens (md–lg): icon-only sidebar */}
      <aside className="hidden md:flex lg:hidden w-14 bg-gray-900 text-gray-100 flex-col min-h-screen shrink-0">
        <SidebarContent collapsed />
      </aside>

      {/* Large screens (lg+): full sidebar with labels */}
      <aside className="hidden lg:flex w-56 bg-gray-900 text-gray-100 flex-col min-h-screen shrink-0">
        <SidebarContent />
      </aside>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-gray-900 border-t border-gray-700 flex">
        {allLinks.slice(0, 6).map(link => (
          <NavLink key={link.to} to={link.to} end={link.exact}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center py-2 text-xs transition-colors ${
                isActive ? 'text-blue-400' : 'text-gray-400 hover:text-gray-200'
              }`
            }>
            <span className="text-lg leading-none mb-0.5">{link.icon}</span>
            <span className="text-[10px] truncate max-w-full px-0.5">{link.label}</span>
          </NavLink>
        ))}
        {allLinks.length > 6 && (
          <button onClick={() => setDrawerOpen(true)}
            className="flex-1 flex flex-col items-center justify-center py-2 text-xs text-gray-400 hover:text-gray-200">
            <span className="text-lg leading-none mb-0.5">☰</span>
            <span className="text-[10px]">Más</span>
          </button>
        )}
      </nav>
    </>
  )
}
