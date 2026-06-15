export const ROLES = {
  admin:          { label: 'Admin',           color: 'bg-purple-100 text-purple-700' },
  agente_sat:     { label: 'Agente SAT',      color: 'bg-blue-100 text-blue-700' },
  agente_almacen: { label: 'Agente Almacén',  color: 'bg-green-100 text-green-700' },
  operator:       { label: 'Operario',         color: 'bg-gray-100 text-gray-600' },
}

export function getPermissions(role) {
  const isAdmin   = role === 'admin'
  const isSAT     = role === 'agente_sat'
  const isAlmacen = role === 'agente_almacen'

  return {
    nav: {
      dashboard:   isAdmin || isSAT,
      parts:       true,
      suppliers:   isAdmin,
      purchases:   isAdmin || isSAT,
      deliveries:  true,
      locations:   isAdmin || isAlmacen,
      disassembly: isAdmin || isAlmacen,
      reposicion:  isAdmin,
      audit:       isAdmin,
      settings:    isAdmin,
    },
    parts: {
      create: isAdmin,
      edit:   isAdmin,
      delete: isAdmin,
    },
    purchases: {
      create: isAdmin,
      edit:   isAdmin,
    },
    deliveries: {
      create:      isAdmin || isSAT || isAlmacen,
      delete_draft: isAdmin || isSAT || isAlmacen,
      confirm:     isAdmin || isAlmacen,
      picking:     isAdmin || isAlmacen,
      ship:        isAdmin || isAlmacen,
      deliver:     isAdmin || isAlmacen,
    },
    users: {
      manage: isAdmin,
    },
  }
}

export function useRoleLabel(role) {
  return ROLES[role]?.label || role
}
