// URL pública de Cloudflare R2 — sin pasar por Render, sin bandwidth cost
const R2_PUBLIC_URL = 'https://pub-e5c6eedc35e84d119e316774c64d5c65.r2.dev'

// Genera la URL de imagen con cache buster basado en updated_at
export function partImageUrl(part) {
  if (!part?.id) return null
  const ts = part.updated_at ? new Date(part.updated_at).getTime() : part.id
  // Si la imagen está en R2 (r2://parts/ID.jpg), servir directamente desde Cloudflare
  if (part.image_url?.startsWith('r2://')) {
    const key = part.image_url.slice(5) // quita "r2://"
    return `${R2_PUBLIC_URL}/${key}?t=${ts}`
  }
  // Fallback: proxy del servidor (fotos legacy en Supabase)
  return `/api/parts/image/${part.id}?t=${ts}`
}
