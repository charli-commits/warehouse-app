import { Routes, Route, Navigate } from 'react-router-dom'
import Sidebar from './components/layout/Sidebar'
import Header from './components/layout/Header'
import Dashboard from './pages/Dashboard'
import Parts from './pages/Parts'
import PartDetail from './pages/PartDetail'
import Suppliers from './pages/Suppliers'
import Purchases from './pages/Purchases'
import PurchaseDetail from './pages/PurchaseDetail'
import Deliveries from './pages/Deliveries'
import Picking from './pages/Picking'
import Login from './pages/Login'
import Settings from './pages/Settings'
import Locations from './pages/Locations'
import LocationQRLabels from './pages/LocationQRLabels'
import Disassembly from './pages/Disassembly'
import Audit from './pages/Audit'
import AuditDetail from './pages/AuditDetail'
import Reposicion from './pages/Reposicion'
import Movements from './pages/Movements'
import { AuthProvider, useAuth } from './lib/AuthContext'
import { getPermissions } from './lib/permissions'

// Redirige a /parts si el rol no tiene acceso a esa ruta
function Guard({ allowed, children }) {
  if (!allowed) return <Navigate to="/parts" replace />
  return children
}

function AppShell() {
  const { user } = useAuth()
  if (!user) return <Login />

  const p = getPermissions(user.role)

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header />
        <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
          <Routes>
            <Route path="/"                    element={<Guard allowed={p.nav.dashboard}><Dashboard /></Guard>} />
            <Route path="/parts"               element={<Parts />} />
            <Route path="/parts/:id"           element={<PartDetail />} />
            <Route path="/suppliers"           element={<Guard allowed={p.nav.suppliers}><Suppliers /></Guard>} />
            <Route path="/purchases"           element={<Guard allowed={p.nav.purchases}><Purchases /></Guard>} />
            <Route path="/purchases/:id"       element={<Guard allowed={p.nav.purchases}><PurchaseDetail /></Guard>} />
            <Route path="/deliveries"          element={<Deliveries />} />
            <Route path="/deliveries/:id/picking" element={<Picking />} />
            <Route path="/locations"           element={<Guard allowed={p.nav.locations}><Locations /></Guard>} />
            <Route path="/locations/qr"        element={<Guard allowed={p.nav.locations}><LocationQRLabels /></Guard>} />
            <Route path="/desmontaje"          element={<Guard allowed={p.nav.disassembly}><Disassembly /></Guard>} />
            <Route path="/reposicion"          element={<Guard allowed={p.nav.reposicion}><Reposicion /></Guard>} />
            <Route path="/auditoria"           element={<Guard allowed={p.nav.audit}><Audit /></Guard>} />
            <Route path="/auditoria/:id"       element={<Guard allowed={p.nav.audit}><AuditDetail /></Guard>} />
            <Route path="/movements"           element={<Guard allowed={p.nav.movements}><Movements /></Guard>} />
            <Route path="/settings"            element={<Settings />} />
            <Route path="*"                    element={<Navigate to="/parts" />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  )
}
