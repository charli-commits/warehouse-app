# Warehouse App — Gestión de Almacén

Aplicación interna de gestión de inventario de piezas para el almacén secundario de Gym Company Retail. **No conectada a Odoo** — base de datos propia.

---

## Arquitectura

```
[Navegador] ──▶ [Render: warehouse-app] ──▶ [Render: warehouse-db (PostgreSQL)]
                        │
                        ├──▶ [Cloudflare R2] (fotos de piezas)
                        ├──▶ [Supabase Storage] (etiquetas GLS, fotos legacy)
                        ├──▶ [GLS ASM API] (envíos y etiquetas)
                        └──▶ [Odoo] (solo lectura: productos, stock Odoo)
```

### Stack técnico
- **Frontend**: React + Vite + Tailwind CSS
- **Backend**: Node.js + Express
- **Base de datos**: PostgreSQL gestionada por Render (`warehouse-db`)
- **ORM**: Prisma
- **Fotos de piezas**: Cloudflare R2 (sin coste de egress)
- **Etiquetas GLS**: Supabase Storage (generadas en servidor, cacheadas en memoria)
- **Autenticación**: JWT (usuarios en DB propia, no Odoo)
- **Deploy**: Render (auto-deploy desde rama `main` de GitHub)

---

## Servicios externos

### Render
- **URL**: https://dashboard.render.com
- **Cuenta**: charli@mundofitness.es (login con GitHub)
- **Servicios**:
  - `warehouse-app` — servidor web Node.js (plan Free)
  - `warehouse-db` — PostgreSQL (plan Free)
- **Deploy**: automático al hacer push a `main` en GitHub

### Cloudflare R2 (fotos de piezas)
- **URL**: https://dash.cloudflare.com → Storage & databases → R2
- **Cuenta**: charli@mundofitness.es (login con GitHub)
- **Bucket**: `warehouse-parts`
- **Coste**: $0/mes (10 GB gratuitos, sin egress nunca)
- **Cómo funciona**: el servidor descarga la foto de R2 y la cachea en memoria. El cliente nunca accede a R2 directamente.

### Supabase (etiquetas GLS + fotos legacy)
- **URL**: https://supabase.com/dashboard
- **Proyecto**: `wtpaggzdwhpxxtatcpxo`
- **Plan actual**: Pro ($25/mes) — revisar si se puede bajar a Free cuando egress baje
- **Uso actual**: etiquetas GLS en Storage + algunas fotos antiguas que no se migraron
- **Nota**: las fotos nuevas ya van a R2, no a Supabase

### GLS ASM (envíos)
- **API**: https://wsclientes.gls-spain.es/asmsrv/asmsrv.asmx (SOAP)
- **Credenciales**: en variables de entorno `GLS_UID`, `GLS_PASSWORD`
- **Modo test**: `GLS_TEST_MODE=false` en producción

### Odoo
- **URL**: https://odoofitness.com
- **Uso**: **SOLO LECTURA** — sincronización de productos y stock
- **Nunca escribir** a Odoo desde esta app

---

## Variables de entorno

Configuradas en Render → warehouse-app → Environment:

| Variable | Descripción |
|---|---|
| `DATABASE_URL` | Auto-generada por Render desde `warehouse-db` |
| `JWT_SECRET` | Auto-generada por Render |
| `ODOO_URL` | https://odoofitness.com |
| `ODOO_DB` | gymcompany |
| `ODOO_USER` | charli@gymcompany.es |
| `ODOO_PASSWORD` | (ver Render dashboard) |
| `GLS_UID` | UUID de cuenta GLS ASM |
| `GLS_PASSWORD` | Contraseña GLS ASM |
| `GLS_API_URL` | https://wsclientes.gls-spain.es/asmsrv/asmsrv.asmx |
| `GLS_TEST_MODE` | `false` en producción |
| `GLS_SENDER_NAME` | GYM COMPANY RETAIL SL |
| `GLS_SENDER_ADDRESS` | AVDA CORTS CATALANES 8 NAVE 6 |
| `GLS_SENDER_ZIP` | 08173 |
| `GLS_SENDER_CITY` | SANT CUGAT DEL VALLES |
| `GLS_SENDER_COUNTRY` | ES |
| `R2_ACCOUNT_ID` | ID de cuenta Cloudflare |
| `R2_ACCESS_KEY_ID` | Access Key de token R2 |
| `R2_SECRET_ACCESS_KEY` | Secret Key de token R2 |
| `R2_BUCKET` | `warehouse-parts` |
| `MIGRATE_TOKEN` | Token para endpoint de migración (interno) |

---

## Estructura del proyecto

```
warehouse-app/
├── client/                  # Frontend React
│   ├── src/
│   │   ├── pages/           # Páginas principales
│   │   │   ├── Parts.jsx        # Lista de piezas
│   │   │   ├── PartDetail.jsx   # Detalle de pieza (edición, foto, stock)
│   │   │   ├── Deliveries.jsx   # Albaranes y envíos GLS
│   │   │   └── Purchases.jsx    # Pedidos de compra
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   ├── Sidebar.jsx      # Navegación lateral (responsive)
│   │   │   │   └── Header.jsx       # Barra superior con búsqueda
│   │   │   └── PartPanel.jsx        # Panel lateral de detalle de pieza
│   │   └── lib/
│   │       ├── api.js           # Cliente HTTP hacia el servidor
│   │       └── ThemeContext.jsx  # Modo oscuro/claro
│   └── tailwind.config.js   # darkMode: 'class'
│
└── server/                  # Backend Node.js
    ├── src/
    │   ├── index.js         # Entry point, middlewares, rutas
    │   ├── middleware/
    │   │   └── auth.js      # JWT middleware
    │   ├── routes/
    │   │   ├── parts.js     # CRUD piezas + proxy fotos R2/Supabase
    │   │   ├── deliveries.js # Albaranes, envíos GLS, packing lists PDF
    │   │   ├── purchases.js  # Pedidos de compra
    │   │   ├── search.js     # Búsqueda global
    │   │   ├── auth.js       # Login/logout
    │   │   └── odoo.js       # Sync con Odoo (solo lectura)
    │   └── assets/
    │       └── logo.png      # Logo para PDFs
    ├── prisma/
    │   ├── schema.prisma    # Modelo de datos
    │   └── migrations/      # Historial de migraciones DB
    └── scripts/
        └── migrate-to-r2-prod.js  # Script de migración Supabase→R2 (ya ejecutado)
```

---

## Cómo hacer deploy

1. Hacer cambios en rama `dev`
2. Probar localmente (`npm run dev` en `/client` y `/server`)
3. Merge a `main`: `git checkout main && git merge dev && git push origin main`
4. Render detecta el push y hace deploy automático (~5-10 min con Docker)
5. Verificar en Render → warehouse-app → Events que el deploy está "live"

**Para revertir**: en Render → Events → clic en "Rollback" del deploy anterior.

---

## Fotos de piezas — cómo funciona

1. El usuario sube una foto desde la app (PartDetail.jsx)
2. El servidor la recibe y la sube a **Cloudflare R2** (`parts/{id}.jpg`)
3. La DB guarda `r2://parts/{id}.jpg` como `image_url`
4. Cuando se muestra la foto, el cliente pide `/api/parts/image/{id}`
5. El servidor descarga de R2, cachea en memoria, sirve al cliente
6. El egress de Supabase es **cero** para fotos

**Fotos legacy** (image_url empieza por `http://supabase`): el servidor las descarga de Supabase igual — funcionan pero generan egress. Ya hay pocas de estas.

---

## Costes mensuales (agosto 2026)

| Servicio | Coste |
|---|---|
| Render (warehouse-app + warehouse-db) | ~$7/mes |
| Cloudflare R2 | $0/mes |
| Supabase Pro | $25/mes (revisar cancelar cuando egress baje) |
| **Total** | **~$32/mes** |

---

## Contacto y accesos

- **GitHub**: github.com/charli-commits/warehouse-app
- **Email cuenta**: charli@mundofitness.es
- Todas las credenciales están en las variables de entorno de Render
