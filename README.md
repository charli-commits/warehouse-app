# Gestión de Stock e Inventario de Almacén

Aplicación web local para gestionar stock de piezas de almacén con integración de lectura a Odoo v16.

## Stack
- **Backend**: Node.js + Express + Prisma ORM + SQLite
- **Frontend**: React + Vite + TailwindCSS

## Instalación

```bash
# Instalar dependencias de todo el monorepo
npm run install:all

# Configurar variables de entorno del servidor
cp server/.env.example server/.env
# Editar server/.env con tus credenciales Odoo

# Crear base de datos y ejecutar migraciones
cd server
npx prisma migrate dev --name init
npx prisma generate
cd ..
```

## Arranque

```bash
npm run dev
```

Esto arranca en paralelo:
- **Backend**: http://localhost:3001
- **Frontend**: http://localhost:5173

## Variables de entorno (`server/.env`)

| Variable | Descripción |
|---|---|
| `DATABASE_URL` | Ruta SQLite, por defecto `file:./dev.db` |
| `ODOO_URL` | URL base de Odoo (ej: `https://miempresa.odoo.com`) |
| `ODOO_DB` | Nombre de la base de datos Odoo |
| `ODOO_USER` | Email del usuario Odoo |
| `ODOO_API_KEY` | API key (no contraseña) del usuario Odoo |
| `PORT` | Puerto del servidor, por defecto `3001` |

## API Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/parts` | Listado con filtros |
| POST | `/api/parts` | Crear pieza |
| PUT | `/api/parts/:id` | Editar pieza |
| DELETE | `/api/parts/:id` | Eliminar (solo stock=0) |
| POST | `/api/parts/:id/adjust` | Ajuste manual de stock |
| GET | `/api/parts/stats` | KPIs de piezas |
| GET | `/api/suppliers` | Listado proveedores |
| POST | `/api/suppliers` | Crear proveedor |
| PUT | `/api/suppliers/:id` | Editar proveedor |
| DELETE | `/api/suppliers/:id` | Eliminar proveedor |
| POST | `/api/odoo/sync` | Sincronizar productos y clientes desde Odoo |
| GET | `/api/odoo/products` | Productos cacheados |
| GET | `/api/odoo/partners` | Clientes cacheados |
| GET | `/api/odoo/status` | Estado de última sincronización |

## Notas
- La integración Odoo es **solo lectura**. Nunca escribe en Odoo.
- Si Odoo no responde, la app funciona con datos cacheados en SQLite.
- GLS España: estructura de BD reservada para Fase 2.
- Órdenes de compra y albaranes: estructura de BD lista, UI en Fase 2.

## Pendiente / ideas a futuro (lista maestra)

### 🚚 GLS ✅ INTEGRADO
- [x] Webservice doméstico GLS Spain (`ws-customer.gls-spain.es/b2b.asmx`) integrado y funcionando.
- [x] Al pulsar "Marcar enviado": se crea el envío en GLS, se obtiene el tracking y se descarga la etiqueta PDF automáticamente.
- [x] Fallback manual: botón "manual" para introducir tracking a mano + "📎 adjuntar" para subir PDF.
- [x] Flujo acordado: el equipo crea albaranes en la web → almacén confirma y prepara → pulsa "Marcar enviado" → imprime etiqueta → cierra día manualmente en portal ASM de GLS (como siempre).
- [ ] **Futuro posible**: botón "Cerrar Día GLS" en la web (el WSDL ya tiene el método `GetManifiesto`) para no tener que entrar al portal ASM.

### 📦 Piezas
- [ ] **Fotos de piezas**: el Excel solo trae nombres de archivo (`DATOS_Images/...jpg`), no las imágenes — pendiente de que pases la carpeta `DATOS_Images`. Hay una tarea en background creada (`task_ec3249bd`) lista para arrancar en cuanto la tengas.
- [ ] Revisar manualmente los códigos duplicados marcados con sufijo " X"/"X3" tras la importación del catálogo (preservados a propósito para revisión).
- [ ] Decidir si "fabricante" debería incluir también el dato OEM de la hoja `MODELOS` del Excel (ej. "BH"), distinto del brand de Odoo usado ahora.
- [ ] Posible mejora: ordenar también por código (ahora solo por nombre o por demanda).

### 📊 Movimientos de stock
- [x] Importados ~11.700 movimientos del último año desde `TSAPPAGOSTO.xlsx`.
- [ ] 213 movimientos sin vincular (códigos `IDArticulo` sin pieza correspondiente) — revisar si interesa.
- [ ] Backlog histórico: registro de movimientos por **ubicación** (trazabilidad origen/destino dentro del almacén).

### 🧾 Albaranes / Pedidos
- [x] Buscador de cliente por nº de pedido GCSQ/GCSO (lookup de solo lectura contra Odoo).
- [x] Edición local de la dirección de envío (no toca Odoo).
- [ ] Posible: importar histórico de `PEDIDOS`/`LINEAS_PEDIDO`/`ENTRADAS` del Excel para contexto de pedidos pasados.

### ⚡ Rendimiento / general
- [x] Paginación del listado de piezas (resuelto el problema de lentitud con 7.700 piezas).
- [ ] Vigilar si Pedidos/Proveedores necesitarán paginación al crecer.

### 🔒 Recordatorio permanente
- Odoo es **estrictamente de solo lectura** — nunca crear/escribir/borrar ahí, solo `search_read`. Toda edición vive en la base de datos local.
