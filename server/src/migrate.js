// Custom migration runner — applies SQL migrations idempotently using IF NOT EXISTS.
// Replaces `prisma migrate deploy` so a previously-failed migration state doesn't
// block server startup. Safe to run on every boot.
require('dotenv').config()
const { Client } = require('pg')

const MIGRATIONS = [
  {
    name: '0002_add_parcels',
    sql: `ALTER TABLE "DeliveryNote" ADD COLUMN IF NOT EXISTS "parcels" INTEGER NOT NULL DEFAULT 1;`,
  },
  {
    name: '0003_add_setting_table',
    sql: `CREATE TABLE IF NOT EXISTS "Setting" ("key" TEXT NOT NULL PRIMARY KEY, "value" TEXT NOT NULL);`,
  },
  {
    name: '0004_add_gls_codbarras',
    sql: `ALTER TABLE "DeliveryNote" ADD COLUMN IF NOT EXISTS "gls_codbarras" TEXT;
          ALTER TABLE "DeliveryNote" ADD COLUMN IF NOT EXISTS "gls_label_url" TEXT;`,
  },
  {
    name: '0005_add_shipped_at',
    sql: `ALTER TABLE "DeliveryNote" ADD COLUMN IF NOT EXISTS "shipped_at" TIMESTAMP(3);`,
  },
  {
    name: '0006_add_gls_retorno',
    sql: `ALTER TABLE "DeliveryNote" ADD COLUMN IF NOT EXISTS "gls_retorno" BOOLEAN NOT NULL DEFAULT false;`,
  },
  {
    name: '0007_add_gls_horario',
    sql: `ALTER TABLE "DeliveryNote" ADD COLUMN IF NOT EXISTS "gls_horario" INTEGER;`,
  },
]

async function runMigrations() {
  const client = new Client({ connectionString: process.env.DATABASE_URL })
  try {
    await client.connect()
    console.log('[migrate] Connected to database')

    for (const { name, sql } of MIGRATIONS) {
      try {
        await client.query(sql)
        console.log(`[migrate] ✓ ${name}`)
      } catch (err) {
        console.error(`[migrate] ✗ ${name}: ${err.message}`)
        // Non-fatal — column may already exist with different constraint etc.
        // Log and continue so one bad migration doesn't block the rest.
      }
    }

    console.log('[migrate] Done')
  } finally {
    await client.end()
  }
}

// Never exit(1) — if migrations fail, log the warning and let the server
// start anyway. A genuine DB problem will surface on the first query.
runMigrations().catch(err => {
  console.warn('[migrate] Warning — could not run migrations:', err.message)
  console.warn('[migrate] Server will start anyway; manual intervention may be needed.')
})
