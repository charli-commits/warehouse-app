const STYLES = {
  DRAFT:      'bg-gray-100 text-gray-600',
  SENT:       'bg-blue-100 text-blue-700',
  PARTIAL:    'bg-orange-100 text-orange-700',
  RECEIVED:   'bg-green-100 text-green-700',
  LOCATING:   'bg-indigo-100 text-indigo-700',
  CANCELLED:  'bg-red-100 text-red-700',
  CONFIRMED:  'bg-blue-100 text-blue-700',
  PICKING:    'bg-yellow-100 text-yellow-700',
  READY:      'bg-teal-100 text-teal-700',
  SHIPPED:    'bg-purple-100 text-purple-700',
  DELIVERED:  'bg-green-100 text-green-700',
}

const LABELS = {
  DRAFT: 'Borrador', SENT: 'Enviado', PARTIAL: 'Parcial',
  RECEIVED: 'Recibido', LOCATING: 'Ubicando', CANCELLED: 'Cancelado',
  CONFIRMED: 'Confirmado', PICKING: 'Picking', READY: 'Listo',
  SHIPPED: 'Enviado', DELIVERED: 'Entregado',
}

export default function StatusBadge({ status }) {
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STYLES[status] || 'bg-gray-100 text-gray-600'}`}>
      {LABELS[status] || status}
    </span>
  )
}
