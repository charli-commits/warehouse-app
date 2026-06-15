-- CreateTable
CREATE TABLE "Part" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'ud',
    "stock_current" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "stock_min" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "location" TEXT,
    "odoo_product_id" INTEGER,
    "odoo_product_name" TEXT,
    "manufacturer" TEXT,
    "cost_price" DOUBLE PRECISION,
    "image_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Part_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartLocation" (
    "id" SERIAL NOT NULL,
    "part_id" INTEGER NOT NULL,
    "location" TEXT NOT NULL,
    "stock" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "PartLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" SERIAL NOT NULL,
    "part_id" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "reference_type" TEXT,
    "reference_id" INTEGER,
    "notes" TEXT,
    "user_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "contact_name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "lead_time_days" INTEGER,
    "notes" TEXT,
    "odoo_partner_id" INTEGER,
    "manufacturer" TEXT,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" SERIAL NOT NULL,
    "reference" TEXT,
    "supplier_id" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "order_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eta" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrderLine" (
    "id" SERIAL NOT NULL,
    "purchase_order_id" INTEGER NOT NULL,
    "part_id" INTEGER NOT NULL,
    "quantity_ordered" DOUBLE PRECISION NOT NULL,
    "quantity_validated" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "quantity_received" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unit_price" DOUBLE PRECISION,

    CONSTRAINT "PurchaseOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseReceiptLine" (
    "id" SERIAL NOT NULL,
    "purchase_order_line_id" INTEGER NOT NULL,
    "location" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "user_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseReceiptLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "pin" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'operator',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryNote" (
    "id" SERIAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "odoo_partner_id" INTEGER,
    "odoo_partner_name" TEXT,
    "shipping_address" TEXT,
    "notes" TEXT,
    "client_ref" TEXT,
    "carrier" TEXT,
    "gls_tracking" TEXT,
    "gls_label_url" TEXT,
    "created_by_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryNoteEvent" (
    "id" SERIAL NOT NULL,
    "delivery_note_id" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "user_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryNoteEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryNoteLine" (
    "id" SERIAL NOT NULL,
    "delivery_note_id" INTEGER NOT NULL,
    "part_id" INTEGER NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "DeliveryNoteLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PickingLine" (
    "id" SERIAL NOT NULL,
    "delivery_note_line_id" INTEGER NOT NULL,
    "delivery_note_id" INTEGER NOT NULL,
    "verified_by_id" INTEGER,
    "forced" BOOLEAN NOT NULL DEFAULT false,
    "force_reason" TEXT,
    "scanned_location" TEXT,
    "verified_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PickingLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lot" (
    "id" SERIAL NOT NULL,
    "part_id" INTEGER NOT NULL,
    "lot_number" TEXT NOT NULL,
    "purchase_order_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LotLocation" (
    "id" SERIAL NOT NULL,
    "lot_id" INTEGER NOT NULL,
    "location" TEXT NOT NULL,
    "stock" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "LotLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Audit" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),

    CONSTRAINT "Audit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLine" (
    "id" SERIAL NOT NULL,
    "audit_id" INTEGER NOT NULL,
    "part_id" INTEGER NOT NULL,
    "location" TEXT NOT NULL,
    "system_stock" DOUBLE PRECISION NOT NULL,
    "counted_stock" DOUBLE PRECISION,
    "difference" DOUBLE PRECISION,
    "adjusted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "AuditLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Disassembly" (
    "id" SERIAL NOT NULL,
    "reference" TEXT NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Disassembly_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DisassemblyLine" (
    "id" SERIAL NOT NULL,
    "disassembly_id" INTEGER NOT NULL,
    "part_id" INTEGER NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "location" TEXT NOT NULL,

    CONSTRAINT "DisassemblyLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OdooCache" (
    "id" SERIAL NOT NULL,
    "type" TEXT NOT NULL,
    "odoo_id" INTEGER NOT NULL,
    "data" TEXT NOT NULL,
    "last_sync" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OdooCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Part_code_key" ON "Part"("code");

-- CreateIndex
CREATE UNIQUE INDEX "PartLocation_part_id_location_key" ON "PartLocation"("part_id", "location");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_name_key" ON "Supplier"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_odoo_partner_id_key" ON "Supplier"("odoo_partner_id");

-- CreateIndex
CREATE UNIQUE INDEX "User_name_key" ON "User"("name");

-- CreateIndex
CREATE UNIQUE INDEX "PickingLine_delivery_note_line_id_key" ON "PickingLine"("delivery_note_line_id");

-- CreateIndex
CREATE UNIQUE INDEX "Lot_part_id_lot_number_key" ON "Lot"("part_id", "lot_number");

-- CreateIndex
CREATE UNIQUE INDEX "LotLocation_lot_id_location_key" ON "LotLocation"("lot_id", "location");

-- CreateIndex
CREATE UNIQUE INDEX "AuditLine_audit_id_part_id_location_key" ON "AuditLine"("audit_id", "part_id", "location");

-- CreateIndex
CREATE UNIQUE INDEX "OdooCache_type_odoo_id_key" ON "OdooCache"("type", "odoo_id");

-- AddForeignKey
ALTER TABLE "PartLocation" ADD CONSTRAINT "PartLocation_part_id_fkey" FOREIGN KEY ("part_id") REFERENCES "Part"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_part_id_fkey" FOREIGN KEY ("part_id") REFERENCES "Part"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_part_id_fkey" FOREIGN KEY ("part_id") REFERENCES "Part"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceiptLine" ADD CONSTRAINT "PurchaseReceiptLine_purchase_order_line_id_fkey" FOREIGN KEY ("purchase_order_line_id") REFERENCES "PurchaseOrderLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryNote" ADD CONSTRAINT "DeliveryNote_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryNoteEvent" ADD CONSTRAINT "DeliveryNoteEvent_delivery_note_id_fkey" FOREIGN KEY ("delivery_note_id") REFERENCES "DeliveryNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryNoteLine" ADD CONSTRAINT "DeliveryNoteLine_delivery_note_id_fkey" FOREIGN KEY ("delivery_note_id") REFERENCES "DeliveryNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryNoteLine" ADD CONSTRAINT "DeliveryNoteLine_part_id_fkey" FOREIGN KEY ("part_id") REFERENCES "Part"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickingLine" ADD CONSTRAINT "PickingLine_delivery_note_line_id_fkey" FOREIGN KEY ("delivery_note_line_id") REFERENCES "DeliveryNoteLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickingLine" ADD CONSTRAINT "PickingLine_delivery_note_id_fkey" FOREIGN KEY ("delivery_note_id") REFERENCES "DeliveryNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickingLine" ADD CONSTRAINT "PickingLine_verified_by_id_fkey" FOREIGN KEY ("verified_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lot" ADD CONSTRAINT "Lot_part_id_fkey" FOREIGN KEY ("part_id") REFERENCES "Part"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lot" ADD CONSTRAINT "Lot_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LotLocation" ADD CONSTRAINT "LotLocation_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "Lot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLine" ADD CONSTRAINT "AuditLine_audit_id_fkey" FOREIGN KEY ("audit_id") REFERENCES "Audit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLine" ADD CONSTRAINT "AuditLine_part_id_fkey" FOREIGN KEY ("part_id") REFERENCES "Part"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisassemblyLine" ADD CONSTRAINT "DisassemblyLine_disassembly_id_fkey" FOREIGN KEY ("disassembly_id") REFERENCES "Disassembly"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisassemblyLine" ADD CONSTRAINT "DisassemblyLine_part_id_fkey" FOREIGN KEY ("part_id") REFERENCES "Part"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

