# Warehouse app — almacén de piezas (EN PRODUCCIÓN)

Inventario de piezas (solo recambios) de un almacén secundario. No es ESBO.
Toda la arquitectura, servicios y despliegue están en README.md: leerlo primero.

## Regla
Está en producción: solo se modifica si Charli lo pide expresamente en esa sesión.
Render publica automáticamente cada push a `main` en GitHub: nunca hacer push sin ok.

## Resumen
- React + Vite + Tailwind (client/) · Node + Express + Prisma (server/).
- Producción: Render (warehouse-app + PostgreSQL warehouse-db). En local: SQLite (server/prisma/dev.db).
- Fotos en Cloudflare R2; etiquetas GLS en Supabase Storage; envíos con la API de GLS.
- Odoo solo lectura (productos y stock). Las altas y movimientos de piezas viven en su propia base de datos.

## Arrancar en local
`npm run dev` (server + client). Solo el cliente: preview `warehouse-client` (vite :5173).

## Ojo
- Supabase está en plan Pro ($25/mes); revisar si se puede bajar a Free (ver README).
- odoo-purchasing es otra app: solo de referencia, no tocarla desde aquí.
