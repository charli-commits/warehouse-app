/**
 * Script de migración: SQLite → PostgreSQL
 * Uso: SQLITE_PATH=./prisma/dev.db node scripts/migrate-sqlite-to-pg.js
 * (con DATABASE_URL apuntando al PostgreSQL de Render)
 */
const { PrismaClient } = require('@prisma/client')
const Database = require('better-sqlite3')
const path = require('path')

const sqlitePath = process.env.SQLITE_PATH || path.join(__dirname, '../prisma/dev.db')
const pg = new PrismaClient()

function toDate(v) { return v ? new Date(v) : new Date() }
function toBool(v) { return v === 1 || v === true }

async function main() {
  console.log('📂 SQLite:', sqlitePath)
  const db = new Database(sqlitePath, { readonly: true })
  const all = t => db.prepare(`SELECT * FROM "${t}"`).all()

  // Reset sequences after bulk inserts
  async function resetSeq(table, field = 'id') {
    await pg.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence('"${table}"', '${field}'), MAX("${field}")) FROM "${table}"`)
  }

  console.log('👤 Usuarios...')
  for (const u of all('User')) {
    await pg.user.upsert({ where: { id: u.id }, update: {}, create: { id: u.id, name: u.name, pin: u.pin, role: u.role || 'operator', active: toBool(u.active), created_at: toDate(u.created_at) } })
  }
  await resetSeq('User')

  console.log('⬡ Piezas...')
  for (const p of all('Part')) {
    await pg.part.upsert({ where: { id: p.id }, update: {}, create: { ...p, created_at: toDate(p.created_at), updated_at: toDate(p.updated_at) } })
  }
  await resetSeq('Part')

  console.log('📍 Ubicaciones de piezas...')
  for (const l of all('PartLocation')) {
    await pg.partLocation.upsert({ where: { id: l.id }, update: {}, create: l })
  }
  await resetSeq('PartLocation')

  console.log('📦 Movimientos de stock...')
  for (const m of all('StockMovement')) {
    await pg.stockMovement.upsert({ where: { id: m.id }, update: {}, create: { ...m, created_at: toDate(m.created_at) } })
  }
  await resetSeq('StockMovement')

  console.log('🏭 Proveedores...')
  for (const s of all('Supplier')) {
    await pg.supplier.upsert({ where: { id: s.id }, update: {}, create: { ...s, hidden: toBool(s.hidden), created_at: toDate(s.created_at) } })
  }
  await resetSeq('Supplier')

  console.log('📋 Órdenes de compra...')
  for (const o of all('PurchaseOrder')) {
    await pg.purchaseOrder.upsert({ where: { id: o.id }, update: {}, create: { ...o, order_date: toDate(o.order_date), eta: o.eta ? new Date(o.eta) : null, created_at: toDate(o.created_at) } })
  }
  await resetSeq('PurchaseOrder')

  for (const l of all('PurchaseOrderLine')) {
    await pg.purchaseOrderLine.upsert({ where: { id: l.id }, update: {}, create: l })
  }
  await resetSeq('PurchaseOrderLine')

  for (const l of all('PurchaseReceiptLine')) {
    await pg.purchaseReceiptLine.upsert({ where: { id: l.id }, update: {}, create: { ...l, created_at: toDate(l.created_at) } })
  }
  await resetSeq('PurchaseReceiptLine')

  console.log('📦 Albaranes...')
  for (const n of all('DeliveryNote')) {
    await pg.deliveryNote.upsert({ where: { id: n.id }, update: {}, create: { ...n, created_at: toDate(n.created_at) } })
  }
  await resetSeq('DeliveryNote')

  for (const l of all('DeliveryNoteLine')) {
    await pg.deliveryNoteLine.upsert({ where: { id: l.id }, update: {}, create: l })
  }
  await resetSeq('DeliveryNoteLine')

  for (const e of all('DeliveryNoteEvent')) {
    await pg.deliveryNoteEvent.upsert({ where: { id: e.id }, update: {}, create: { ...e, created_at: toDate(e.created_at) } })
  }
  await resetSeq('DeliveryNoteEvent')

  for (const p of all('PickingLine')) {
    await pg.pickingLine.upsert({ where: { id: p.id }, update: {}, create: { ...p, forced: toBool(p.forced), verified_at: toDate(p.verified_at) } })
  }
  await resetSeq('PickingLine')

  console.log('🔍 Auditorías, lotes, desmontaje, caché Odoo...')
  for (const a of all('Audit')) {
    await pg.audit.upsert({ where: { id: a.id }, update: {}, create: { ...a, created_at: toDate(a.created_at), closed_at: a.closed_at ? new Date(a.closed_at) : null } })
  }
  for (const l of all('AuditLine')) {
    await pg.auditLine.upsert({ where: { id: l.id }, update: {}, create: { ...l, adjusted: toBool(l.adjusted) } })
  }
  for (const l of all('Lot')) {
    await pg.lot.upsert({ where: { id: l.id }, update: {}, create: { ...l, created_at: toDate(l.created_at) } })
  }
  for (const l of all('LotLocation')) {
    await pg.lotLocation.upsert({ where: { id: l.id }, update: {}, create: l })
  }
  for (const d of all('Disassembly')) {
    await pg.disassembly.upsert({ where: { id: d.id }, update: {}, create: { ...d, created_at: toDate(d.created_at) } })
  }
  for (const l of all('DisassemblyLine')) {
    await pg.disassemblyLine.upsert({ where: { id: l.id }, update: {}, create: l })
  }
  for (const c of all('OdooCache')) {
    await pg.odooCache.upsert({ where: { id: c.id }, update: {}, create: { ...c, last_sync: toDate(c.last_sync) } })
  }

  db.close()
  await pg.$disconnect()
  console.log('✅ Migración completada')
}

main().catch(e => { console.error('❌', e.message); process.exit(1) })
