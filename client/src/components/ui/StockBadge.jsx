export default function StockBadge({ current, min }) {
  const ratio = min > 0 ? current / min : current > 0 ? 2 : 0

  if (current <= 0) {
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">● Sin stock</span>
  }
  if (ratio <= 1) {
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">● Bajo mínimo</span>
  }
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">● OK</span>
}
