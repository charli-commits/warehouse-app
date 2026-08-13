/**
 * Migration script: copy part photos from Supabase Storage to Cloudflare R2
 * - Reads image_url from DB for all parts that have one
 * - Downloads from Supabase
 * - Uploads to R2 under key: parts/{part_id}.jpg (preserving original extension)
 * - Updates DB image_url to R2 public URL (via proxy — no public R2 URL needed)
 * Run: node scripts/migrate-to-r2.js
 */

require('dotenv').config()
const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3')
const { PrismaClient } = require('@prisma/client')

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY
const R2_BUCKET = process.env.R2_BUCKET || 'warehouse-parts'

if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
  console.error('Faltan variables R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY en .env')
  process.exit(1)
}

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
})

const prisma = new PrismaClient()

async function keyExists(key) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }))
    return true
  } catch { return false }
}

async function main() {
  const parts = await prisma.part.findMany({
    where: { image_url: { not: null } },
    select: { id: true, image_url: true },
  })

  console.log(`Encontradas ${parts.length} piezas con foto`)
  let ok = 0, skipped = 0, errors = 0

  for (const part of parts) {
    // Skip if already migrated (URL already points to R2 or is a proxy path)
    if (part.image_url.includes('r2.cloudflarestorage') || part.image_url.startsWith('/api/')) {
      skipped++
      continue
    }

    const ext = part.image_url.split('?')[0].split('.').pop().toLowerCase() || 'jpg'
    const key = `parts/${part.id}.${ext}`

    try {
      // Skip if already in R2
      if (await keyExists(key)) {
        console.log(`  [${part.id}] ya en R2, actualizando DB...`)
      } else {
        // Download from Supabase
        const r = await fetch(part.image_url)
        if (!r.ok) throw new Error(`HTTP ${r.status} descargando foto`)
        const buf = Buffer.from(await r.arrayBuffer())
        const ct = r.headers.get('content-type') || 'image/jpeg'

        // Upload to R2
        await s3.send(new PutObjectCommand({
          Bucket: R2_BUCKET,
          Key: key,
          Body: buf,
          ContentType: ct,
        }))
        console.log(`  [${part.id}] ✓ subida (${Math.round(buf.length / 1024)}KB)`)
      }

      // Update DB: store R2 key as image_url (proxy will use this)
      await prisma.part.update({
        where: { id: part.id },
        data: { image_url: `r2://${key}` },
      })
      ok++
    } catch (err) {
      console.error(`  [${part.id}] ERROR: ${err.message}`)
      errors++
    }
  }

  console.log(`\nMigración completada: ${ok} OK, ${skipped} ya migradas, ${errors} errores`)
  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
