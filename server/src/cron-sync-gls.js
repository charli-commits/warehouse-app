// Render Cron Job script — runs hourly to sync GLS delivery status
// Set env vars: APP_URL, CRON_SECRET
require('dotenv').config()

const APP_URL = process.env.APP_URL || 'https://warehouse-app-9393.onrender.com'
const CRON_SECRET = process.env.CRON_SECRET || ''

if (!CRON_SECRET) {
  console.error('CRON_SECRET not set')
  process.exit(1)
}

async function run() {
  console.log('[cron] Syncing GLS delivery status...')
  const res = await fetch(`${APP_URL}/api/deliveries/sync-gls-status`, {
    method: 'POST',
    headers: { 'x-cron-secret': CRON_SECRET },
  })
  const data = await res.json()
  if (!res.ok) {
    console.error('[cron] Error:', data)
    process.exit(1)
  }
  console.log(`[cron] Done: ${data.checked} checked, ${data.delivered} delivered, ${data.errors} errors`)
  if (data.firstError) console.log('[cron] First error:', data.firstError)
  if (data.sampleStatus) console.log('[cron] Sample status:', JSON.stringify(data.sampleStatus))
}

run().catch(err => { console.error('[cron] Fatal:', err); process.exit(1) })
