const express = require('express')
const router = express.Router()
const prisma = require('../lib/prisma')

router.get('/', async (req, res) => {
  const suppliers = await prisma.supplier.findMany({
    where: { hidden: false },
    orderBy: { name: 'asc' }
  })
  res.json(suppliers)
})

router.get('/:id', async (req, res) => {
  const supplier = await prisma.supplier.findUnique({ where: { id: Number(req.params.id) } })
  if (!supplier) return res.status(404).json({ error: 'Supplier not found' })
  res.json(supplier)
})

router.post('/', async (req, res) => {
  try {
    const supplier = await prisma.supplier.create({ data: req.body })
    res.status(201).json(supplier)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

router.put('/:id', async (req, res) => {
  try {
    const supplier = await prisma.supplier.update({
      where: { id: Number(req.params.id) },
      data: req.body
    })
    res.json(supplier)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id)
  const orders = await prisma.purchaseOrder.count({ where: { supplier_id: id } })
  if (orders > 0) return res.status(409).json({ error: 'Supplier has purchase orders' })

  const supplier = await prisma.supplier.findUnique({ where: { id } })
  if (!supplier) return res.status(404).json({ error: 'Supplier not found' })

  if (supplier.odoo_partner_id) {
    // Odoo-sourced: hide instead of delete so sync doesn't re-import it
    await prisma.supplier.update({ where: { id }, data: { hidden: true } })
  } else {
    await prisma.supplier.delete({ where: { id } })
  }
  res.json({ ok: true })
})

module.exports = router
