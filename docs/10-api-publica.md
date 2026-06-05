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

El tenant registra endpoints en Ajustes → API. Eventos disponibles:
`production.completed`, `dispatch.created`, `stock.low`.

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

El `secret` de firma se muestra una sola vez al crear el webhook. Reintentos con
backoff: anotado para una fase posterior. El disparo real de eventos se conectará
vía database webhook / `pg_net` (no desde el flujo client-side de completar
producción); por ahora la función `emitWebhookEvent` queda expuesta y testeada.

## Ejemplo curl

```bash
curl -s "https://ninja-soft-food.vercel.app/api/v1/productions?limit=20&from=2026-05-01" \
  -H "Authorization: Bearer nf_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

## Implementación

- Auth + helpers de error: `lib/api/auth.ts`
- Data-access (admin client + scoping por tenant + paginación): `lib/api/data.ts`
- Dispatcher de webhooks firmados: `lib/api/webhooks.ts`
- Handlers: `app/api/v1/**`
- Gestión de credenciales (UI): `components/settings/ApiKeysCard.tsx` +
  `modules/api-keys/`
- Spec OpenAPI versionada: `docs/api/openapi.yaml` (pendiente de crear; mantener
  en el mismo PR que cambie un endpoint).
