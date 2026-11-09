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

## Decisiones de negocio (no tocar sin confirmar)
- Albaranes con stock ya descontado (READY/SHIPPED/DELIVERED o con movimientos de salida)
  no se pueden borrar, ni con ?force=1. Decisión explícita, no un bug.
- Con stock descontado: no se cambian piezas ni cantidades; sí la cabecera y el precio
  aduanero (se actualiza sin recrear líneas para conservar el picking).

## Infraestructura clave
- server/src/lib/inFlightLock.js — bloqueo en memoria por documento para acciones de
  albaranes y validar/ubicar compras. Solo funciona con una instancia en Render.
  Si se escala a varias instancias habrá que migrar a Redis u otro lock distribuido.

## Antes de trabajar en local
- Hacer `git pull` en main (dev puede quedar muy por detrás de main).
- Regenerar cliente Prisma si el schema cambió: `cd server && npx prisma generate`.

## Ojo
- Supabase está en plan Free (bajado de Pro en oct-2026); proyectos pausan tras 1 sem. inactivos.
- odoo-purchasing es otra app: solo de referencia, no tocarla desde aquí.
