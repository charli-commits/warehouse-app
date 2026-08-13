/**
 * Migration script for PRODUCTION PostgreSQL DB → Cloudflare R2
 * Usage: DATABASE_URL="postgresql://..." node scripts/migrate-to-r2-prod.js
 */
require('dotenv').config()
const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3')
const { Client } = require('pg')

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY
const R2_BUCKET = process.env.R2_BUCKET || 'warehouse-parts'
const DATABASE_URL = process.env.DATABASE_URL

if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
  console.error('Faltan variables R2 en .env')
  process.exit(1)
}
if (!DATABASE_URL || !DATABASE_URL.startsWith('postgresql')) {
  console.error('DATABASE_URL debe ser una URL PostgreSQL')
  process.exit(1)
}

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
})

const db = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } })

async function keyExists(key) {
  try { await s3.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key })); return true }
  catch { return false }
}

async function main() {
  await db.connect()
  const { rows } = await db.query(
    `SELECT id, image_url FROM "Part" WHERE image_url IS NOT NULL AND image_url NOT LIKE 'r2://%' AND image_url LIKE 'http%'`
  )
  console.log(`Encontradas ${rows.length} piezas con foto Supabase a migrar`)
  let ok = 0, skipped = 0, errors = 0

  for (const part of rows) {
    const ext = part.image_url.split('?')[0].split('.').pop().toLowerCase() || 'jpg'
    const key = `parts/${part.id}.${ext}`

    try {
      if (await keyExists(key)) {
        console.log(`  [${part.id}] ya en R2`)
        skipped++
      } else {
        const r = await fetch(part.image_url)
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const buf = Buffer.from(await r.arrayBuffer())
        const ct = r.headers.get('content-type') || 'image/jpeg'
        await s3.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: buf, ContentType: ct }))
        console.log(`  [${part.id}] ✓ subida (${Math.round(buf.length / 1024)}KB)`)
      }
      await db.query(`UPDATE "Part" SET image_url = $1 WHERE id = $2`, [`r2://${key}`, part.id])
      ok++
    } catch (err) {
      console.error(`  [${part.id}] ERROR: ${err.message}`)
      errors++
    }
  }

  console.log(`\nMigración completada: ${ok} OK, ${skipped} ya en R2, ${errors} errores`)
  await db.end()
}

main().catch(e => { console.error(e); process.exit(1) })
