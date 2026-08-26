// Genera la URL del proxy de imagen con cache buster basado en updated_at
// Así el browser nunca sirve una foto antigua cuando se cambia la imagen
export function partImageUrl(part) {
  if (!part?.id) return null
  const ts = part.updated_at ? new Date(part.updated_at).getTime() : part.id
  return `/api/parts/image/${part.id}?t=${ts}`
}
