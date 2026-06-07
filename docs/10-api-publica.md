# API pública v1 — Ninja Food

Referencia corta para integradores. Producto API-first (Fase 3). Veredictos de
viabilidad de conectores externos: `docs/09-investigacion-integraciones.md` §1.

Modelo de datos y decisiones de seguridad de la credencial: `docs/03-modelo-datos.md`
§"API pública (v1) — migración 0010". Migración: `supabase/migrations/00000000000010_public_api.sql`.

> Estado: la migración 0010 aún no está aplicada en cloud. Mientras tanto, los
> endpoints responden 401 (key inexistente) y la UI de Ajustes → API muestra
> "Pendiente de migración 0010".

## Base

```
https://ninja-soft-food.vercel.app/api/v1
```

Todas las respuestas son JSON. `Cache-Control: no-store` (datos del tenant).

## Autenticación

Cada request lleva la API key del tenant como Bearer token:

```
Authorization: Bearer nf_live_<secret>
```

- Formato del secreto: `nf_live_` + ≥32 chars base62 (`/^nf_live_[A-Za-z0-9]{32,}$/`).
- El secreto se genera y se muestra **una sola vez** al crear la key (Ajustes →
  API). En la base solo vive su `sha256` (`api_keys.key_hash`) + un prefijo
  visible (`key_prefix`, ej. `nf_live_a1b2`). El secreto en claro **nunca** se
  persiste ni se loguea.
- Revocar una key (Ajustes → API) la invalida de inmediato (soft, `revoked_at`).
- La key resuelve el `tenant_id`; toda lectura queda acotada a ese tenant.

### Errores

Forma uniforme:

```json
{ "error": { "code": "missing_scope", "message": "..." } }
```

| HTTP | code | cuándo |
|---|---|---|
| 401 | `invalid_key` | key ausente, mal formada, inexistente o revocada |
| 403 | `missing_scope` | la key no tiene el scope que pide el endpoint |
| 404 | `not_found` | recurso inexistente o de otro tenant |
| 500 | `internal_error` | error al leer (transitorio) |

Rate limiting por plan: no implementado todavía (anotado en la migración 0010 y
en `plans.limits.api_access`).

## Scopes

Solo lectura en esta versión:

| scope | habilita |
|---|---|
| `read:productions` | `GET /productions`, `GET /productions/:id` |
| `read:stock` | `GET /stock` |
| `read:dispatches` | `GET /dispatches` |
| `read:traces` | `GET /traces/:slug` |

## Paginación

Por cursor sobre `created_at` (descendente).

- `limit`: 1–100 (default 50).
- `cursor`: el `next_cursor` de la página anterior (un `created_at` ISO). En la
  primera página se omite.
- Respuesta de lista: `{ "data": [...], "next_cursor": "<iso|null>" }`. Cuando
  `next_cursor` es `null`, no hay más páginas.

## Endpoints

### `GET /productions` — scope `read:productions`

Producciones completadas del tenant. Filtros query: `from`, `to` (YYYY-MM-DD,
sobre `production_date`), `lot` (coincidencia parcial sobre el lote de PT).

```json
{
  "data": [
    {
      "id": "uuid",
      "code": "PROD-LJ-00012",
      "production_date": "2026-05-30",
      "quantity_kg": 120.5,
      "product_lot_number": "L260530-0012",
      "product_expiry_date": "2026-07-29",
      "recipe": { "title": "Jamón cocido", "rnpa_number": "01-123456" },
      "trace_slug": "abc123"
    }
  ],
  "next_cursor": "2026-05-30T10:00:00.000Z"
}
```

### `GET /productions/:id` — scope `read:productions`

Detalle + insumos (cadena hacia atrás): ingrediente, lote de MP, proveedor y RNE.

```json
{
  "id": "uuid",
  "code": "PROD-LJ-00012",
  "status": "completed",
  "production_date": "2026-05-30",
  "packaging_date": null,
  "quantity_kg": 120.5,
  "product_lot_number": "L260530-0012",
  "product_expiry_date": "2026-07-29",
  "notes": null,
  "recipe": { "title": "Jamón cocido", "rnpa_number": "01-123456" },
  "trace_slug": "abc123",
  "inputs": [
    {
      "ingredient": "Pernil de cerdo",
      "unit": "kg",
      "taken_qty": 100,
      "is_substitute": false,
      "lot_number": "MP-7781",
      "lot_expiry_date": "2026-06-10",
      "supplier": "Frigorífico Sur",
      "supplier_rne": "02-009988"
    }
  ]
}
```

### `GET /stock` — scope `read:stock`

Lotes de materia prima con stock disponible (`remaining_quantity > 0`). Filtro:
`lot`.

```json
{
  "data": [
    {
      "id": "uuid",
      "ingredient": "Pernil de cerdo",
      "lot_number": "MP-7781",
      "quantity": 200,
      "remaining_quantity": 100,
      "unit": "kg",
      "expiry_date": "2026-06-10",
      "manufacture_date": "2026-05-01",
      "is_frozen": false,
      "supplier": "Frigorífico Sur",
      "supplier_rne": "02-009988"
    }
  ],
  "next_cursor": null
}
```

### `GET /dispatches` — scope `read:dispatches`

Despachos con cliente e ítems (receta, lote de PT, kg). Filtros: `from`, `to`
(sobre `dispatch_date`).

```json
{
  "data": [
    {
      "id": "uuid",
      "dispatch_date": "2026-06-01",
      "status": "delivered",
      "customer": { "name": "Almacén Central", "locality": "Rosario" },
      "items": [
        {
          "quantity_kg": 30,
          "recipe": { "title": "Jamón cocido", "rnpa_number": "01-123456" },
          "product_lot_number": "L260530-0012",
          "product_expiry_date": "2026-07-29",
          "production_code": "PROD-LJ-00012"
        }
      ]
    }
  ],
  "next_cursor": null
}
```

### `GET /traces/:slug` — scope `read:traces`

Snapshot inmutable de la traza pública por slug (el mismo JSON que respalda
`/t/:slug`). Se scopea por tenant.

```json
{
  "slug": "abc123",
  "created_at": "2026-05-30T10:00:00.000Z",
  "views_count": 42,
  "payload": { "...snapshot inmutable de la producción..." }
}
```

## Webhooks salientes

El tenant registra endpoints en Ajustes → API y elige a qué eventos suscribirse.

### Catálogo de eventos (v1)

| evento | se dispara cuando | datos clave del payload |
|---|---|---|
| `production.completed` | se completa una producción (`productions.status='completed'`) | `id, code, status, production_date, packaging_date, quantity_kg, product_lot_number, product_expiry_date, recipe_id` |
| `dispatch.created` | se da de alta un despacho | `id, dispatch_date, status, customer_id, vehicle_id` |
| `dispatch.voided` | un despacho pasa a `voided` | `id, dispatch_date, status, customer_id, voided_at` |
| `stock.entry_created` | ingreso de stock con trazabilidad (no aplica a ingresos `no_traceability`) | `id, ingredient_id, lot_number, quantity, unit, expiry_date, is_frozen, supplier_id` |
| `stock.low` | un ingrediente cae bajo su umbral (evento de UMBRAL, ver nota) | — |

Todo payload incluye además `id` del recurso, `tenant_id` y `created_at`. Nunca
contiene datos de otro tenant (cada fila se filtra por `tenant_id` antes de
construir el payload).

### Mecanismo de entrega (outbox + cron)

El disparo es **outbox-style por cron**, no `pg_net` ni emisión client-side.
Razón de diseño: las acciones que generan eventos corren vía RPC *frozen*
(`complete_production`, `create_dispatch`, `create_stock_entry`) llamadas **desde
el cliente del tenant**; no hay route handler server en el medio donde colgar la
emisión, y disparar desde el browser se perdería si la pestaña se cierra.

- El cron `app/api/cron/emit-webhooks` (cada 5 min, `vercel.json`, auth
  `CRON_SECRET`) detecta recursos nuevos por **cursor**: para cada
  `(webhook, evento)` toma `MAX(resource_created_at)` ya encolado y trae solo lo
  posterior.
- Encola una fila en `webhook_deliveries` por `(webhook, evento, recurso)` con
  `ON CONFLICT DO NOTHING`: re-correr el cron **nunca duplica** una entrega
  (idempotencia garantizada por el índice único).
- Entrega con `POST` firmado y hasta **3 intentos** (uno por corrida; el
  espaciado real lo da la cadencia de 5 min). Tras agotarlos queda `failed`.
- El `payload` que se firma es el **snapshot** guardado al encolar: un reintento
  no recalcula datos.

El tenant ve el estado de sus entregas (evento, estado, fecha, error) en
Ajustes → API → "Últimas entregas" (lee `webhook_deliveries`, RLS solo-lectura
del tenant; los writes son service_role desde el cron).

> Nota `stock.low`: es un evento de **umbral**, no de creación de fila, así que no
> entra en el outbox por cursor; lo cubre el cron de alertas de stock por su
> propio criterio. Se mantiene suscribible para fases siguientes.

> Migración: el outbox vive en `webhook_deliveries`
> (`supabase/migrations/00000000000023_webhook_deliveries.sql`), pendiente de
> aplicar junto al resto de migraciones acumuladas.

### Firma de cada entrega

Cada entrega es un `POST` JSON firmado:

```
X-NinjaFood-Signature: ts=<unix_seconds>,v1=<hex hmac_sha256(`${ts}.${body}`, secret)>
```

Cuerpo:

```json
{
  "event": "production.completed",
  "created_at": "2026-06-01T12:00:00.000Z",
  "data": { "...payload del evento..." }
}
```

Verificación (lado receptor, pseudocódigo):

```
parts = parse("ts=...,v1=...")
expected = hmac_sha256(`${parts.ts}.${rawBody}`, webhook_secret)
ok = constant_time_equals(expected, parts.v1)
```

El `secret` de firma se muestra una sola vez al crear el webhook.

## Ejemplo curl

```bash
curl -s "https://ninja-soft-food.vercel.app/api/v1/productions?limit=20&from=2026-05-01" \
  -H "Authorization: Bearer nf_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

## Implementación

- Auth + helpers de error: `lib/api/auth.ts`
- Data-access (admin client + scoping por tenant + paginación): `lib/api/data.ts`
- Dispatcher de webhooks firmados: `lib/api/webhooks.ts`
- Lógica pura del outbox (catálogo, cursor, payload builders): `lib/api/webhook-emit.ts`
- Cron emisor (encola + entrega): `app/api/cron/emit-webhooks/route.ts`
- Handlers: `app/api/v1/**`
- Gestión de credenciales (UI): `components/settings/ApiKeysCard.tsx` +
  `modules/api-keys/`
- Spec OpenAPI versionada: `docs/api/openapi.yaml` (mantener en el mismo PR que
  cambie un endpoint).
