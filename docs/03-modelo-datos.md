# Modelo de datos multi-tenant — Ninja Food

Convenciones heredadas del POS (reglas duras):
- UUID PK en todas las entidades.
- `tenant_id uuid NOT NULL` en **toda** tabla operativa.
- `created_at` / `updated_at` (trigger `set_updated_at()`), `deleted_at` para soft delete.
- RLS activo en todas las tablas; aislamiento por `current_tenant_id()` (claim del JWT).
- `audit_logs` con before/after para cambios críticos.
- Nombres de tabla en inglés snake_case (consistencia POS), labels de UI en español.

---

## 1. Núcleo SaaS (calcado del POS)

```
tenants               id, name, slug, cuit, industry(frigorifico|panaderia|lacteos|conservas|catering|otro),
                      country='AR', status(trial|active|past_due|suspended|cancelled), trial_ends_at
users                 espejo de auth.users + is_internal, internal_level(viewer|editor|admin), settings jsonb
tenant_users          tenant_id, user_id, role(owner|manager|operator|viewer)
plans                 key(start|pro|business|enterprise), name, monthly_price_ars, yearly_price_ars,
                      monthly_price_usd, limits jsonb {max_establishments, max_users, max_recipes,
                      max_productions_per_month, max_form_templates, api_access bool, integrations bool}
subscriptions         tenant_id UNIQUE, plan_id, status, billing_cycle, current_period_start/end,
                      cancel_at_period_end, provider(mercadopago|stripe|paypal|manual),
                      provider_subscription_id
feature_flags         key, default_enabled
tenant_feature_flags  tenant_id, feature_flag_id, enabled
payment_events        webhook log idempotente: provider, provider_event_id UNIQUE, payload, processed_at
audit_logs            tenant_id, action, entity_type, entity_id, actor_user_id, before_data, after_data,
                      ip_address, user_agent, reason
email_templates       tenant_id, key, subject, html, enabled
system_emails         cola/log: tenant_id, recipient, subject, html_content, status, error_message
system_email_smtp     config SMTP (solo service_role)
tenant_branding       tenant_id, logo_url, trace_page_config jsonb, sello_abr_enabled
```

### Modelo de suscripción agnóstico a la pasarela

El estado canónico vive en `subscriptions.status`; cada pasarela mapea a él (investigación verificada, doc 09):

| Canónico | Mercado Pago (preapproval) | Stripe | PayPal |
|---|---|---|---|
| trial | (gestionado en app) | trialing | — |
| active | authorized | active | ACTIVE |
| past_due | pago rechazado | past_due/unpaid | PAYMENT.FAILED |
| paused | paused | paused | SUSPENDED |
| cancelled | cancelled | canceled | CANCELLED |

---

## 2. Dominio operativo (núcleo Jamonera generalizado)

### Establecimientos y compliance

```
establishments        tenant_id, name, address, locality, rne_number, rne_expiry, rne_attachment_url,
                      ruca_number, ruca_expiry, municipal_permit_status, is_default
suppliers             tenant_id, name, cuit, rne_number, rne_expiry, rne_attachment_url, contact jsonb
vehicles              tenant_id, plate, uta_number, uta_expiry, ura_number, ura_expiry, capacity_kg
laboratories          tenant_id, name, contact jsonb
```

### Catálogo

```
ingredient_families   tenant_id, name, image_url, sort
ingredients           tenant_id, family_id, name, unit, is_perishable, image_url, description,
                      low_stock_threshold (nullable → usa global), default_shelf_days
measure_units         tenant_id nullable (global + por tenant): name, abbr
recipe_groups         tenant_id, name, image_url, sort
recipes               tenant_id, group_id, title, commercial_name, category(carnes|lacteos|panificados|
                      conservas|bebidas|aditivos|otros), product_type(solido|liquido|semisolido|polvo|
                      concentrado), description, shelf_life_days, aging_days,
                      packaging_delay_type(none|aging|freeze), rnpa_number, rnpa_expiry, rnpa_exempt,
                      rnpa_exempt_reason, rnpa_attachment_url, bpm_attachment_url, image_url,
                      nutrition jsonb {calories, proteins, fats, carbs, sodium},
                      front_labels text[] (octógonos Ley 27.642),
                      declaration_unit, household_measure
recipe_ingredients    recipe_id, ingredient_id, quantity, unit, is_substitute, source_ingredient_id
```

### Stock y lotes (corazón de la trazabilidad)

```
stock_entries         tenant_id, establishment_id, ingredient_id, supplier_id, quantity, unit,
                      remaining_quantity, lot_number, expiry_date, manufacture_date, is_frozen,
                      frozen_extra_days, invoice_url, unit_cost, currency, is_internal_use,
                      no_traceability bool
stock_movements       append-only: tenant_id, ingredient_id, stock_entry_id, type(purchase|production|
                      adjustment|loss|return|internal), quantity (+/-), production_id nullable,
                      actor_user_id
lot_code_templates    tenant_id, name, tokens jsonb (remito|fecha_fab|siglas|secuencia), is_default
```

### Producción y trazabilidad

```
productions           tenant_id, establishment_id, recipe_id, code (PROD-<prefijo>-NNN por tenant),
                      status(draft|completed|voided), production_date, packaging_date,
                      manager_member_id, quantity_kg, product_lot_number, product_expiry_date,
                      shelf_life_snapshot, aging_snapshot, notes, total_cost (calculado v1)
production_inputs     production_id, ingredient_id, required_qty, stock_entry_id nullable
                      (null = stock infinito), taken_qty, is_substitute, source_ingredient_id
production_reserves   tenant_id, ingredient_id, stock_entry_id, quantity, expires_at, created_by
public_traces         tenant_id, production_id, slug UNIQUE, payload jsonb (snapshot inmutable),
                      qr_config jsonb, views_count
members               tenant_id, full_name, position, email, pin_hash, photo_url
                      (operarios de planta: firman planillas y producciones; ≠ users con login)
```

### Despacho

```
customers             tenant_id, name, address, locality, phone, email
localities            tenant_id, name
dispatches            tenant_id, establishment_id, customer_id, vehicle_id, dispatch_date, status
dispatch_items        dispatch_id, production_id, recipe_id, quantity_kg
                      (vínculo despacho↔lote = recall-ready)
xlsx_imports          tenant_id, kind(dispatch), file_url, rows_total, rows_ok, rows_error,
                      result jsonb, actor_user_id
product_rules         tenant_id, recipe_id, rules jsonb, disabled bool (config import XLSX)
```

### Calidad

```
reports               (informes bromatológicos) tenant_id, member_id, content_html, importance 0-100,
                      importance_label(excelente|muy_bueno|bueno|normal|atencion|importante|critico),
                      notify_member_ids uuid[], report_date
report_attachments    report_id, url, name, mime, size
analyses              tenant_id, type(agua|alimentos|productos|superficies|ambiente|materia_prima|
                      bebidas|otro), sample_code, laboratory_id, observations_html, conformity 0-100,
                      conformity_label, analysis_date, member_id
analysis_attachments  analysis_id, url, name, mime, size
```

### Planillas configurables (migración 0009)

```
form_templates        tenant_id, name, kind(temperatura|limpieza|plagas|recepcion_mp|capacitacion|
                      pcc|custom), fields jsonb (builder: [{key,label,type,required,min,max,
                      options[],unit}]), frequency jsonb (cron-like {type:daily|weekly|monthly|none,
                      time?, days?}), requires_signature bool, action_on_fail jsonb, is_active bool
                      — editable, soft delete (deleted_at) + triggers como el resto.
form_submissions      tenant_id, template_id, submitted_by_member_id (firma con PIN), values jsonb,
                      status(ok|fail|corrected), corrective_action text, evidence_urls text[],
                      corrects_submission_id (correcciones = fila nueva vinculada), submitted_at,
                      created_at — INMUTABLE post-firma (auditoría). SIN updated_at, SIN deleted_at.
```

Inmutabilidad de `form_submissions` (defensa en profundidad, regla §4):
- RLS: solo políticas INSERT + SELECT (por tenant) e `internal_read`; sin UPDATE/DELETE para
  `authenticated` (mismo patrón que `stock_movements` / `public_traces`).
- Trigger `BEFORE UPDATE OR DELETE` que hace `raise exception 'immutable_submission'` — frena
  también a `service_role` (que bypassa RLS). El DELETE solo se permite en el cascade de baja del
  tenant (cuando el tenant dueño ya no existe).

RPC `submit_form(p_template_id, p_values, p_member_id?, p_pin?, p_status='ok',
p_corrective_action?, p_corrects?)` — `security invoker` (como 0004/0005/0008): valida tenant del
JWT, template activo del tenant, y si `requires_signature` exige `member`+`PIN` validados con
`crypt(pin, members.pin_hash)` (bcrypt, pgcrypto). Devuelve `{submission_id, signed}`.
Pendiente anotado: rate-limit de intentos de PIN. Templates default por rubro: app-side (regla 10).

### API pública (v1) — migración 0010

```
api_keys              tenant_id, name, key_hash (sha256 hex, UNIQUE), key_prefix (visible, ej
                      "nf_live_a1b2"), scopes text[] ('read:productions'|'read:stock'|
                      'read:traces'|'read:dispatches'), last_used_at, revoked_at, created_at
                      — el SECRET en claro NUNCA se guarda: solo el sha256; se muestra una vez al
                      crear. Revocación = soft (revoked_at), nunca DELETE. SIN updated_at/deleted_at.
outbound_webhooks     tenant_id, url, events text[] ('production.completed'|'dispatch.created'|
                      'stock.low'), secret (firma HMAC los payloads salientes → se guarda en claro,
                      a diferencia de api_keys), is_active, last_delivery_at, last_delivery_status,
                      created_at/updated_at + trigger, deleted_at — editable.
```

RLS: ambas con `tenant_isolation` (for all, authenticated) + `internal_read`. El SELECT del tenant
sobre `api_keys` no expone secreto alguno (no se persiste). Gated por plan: `limits.api_access` /
`tenant_operating_profiles.enabled_modules.public_api`.

**RPC `verify_api_key(p_key_hash text)` → jsonb {tenant_id, scopes, key_id} | null.** Decisión de
seguridad (arquitecto de datos): **SECURITY DEFINER + GRANT a anon**, mismo patrón con que el POS
expone datos por slug sin sesión (`public_catalog(text)`). La API pública v1 entra SIN JWT
(`Authorization: Bearer nf_live_...`), por lo que dentro del request no existe `current_tenant_id()`;
resolver el tenant a partir del hash es el trabajo de la función. Es seguro porque `key_hash` es un
sha256 hex de 64 chars (espacio no enumerable), la función no lista nada (recibe el hash ya calculado
y devuelve solo la fila exacta o null), y `search_path=''` evita secuestro. `last_used_at` se
actualiza con throttle de 60s (una escritura por minuto por key, no por request). Una key revocada
(`revoked_at`) devuelve null. El secreto en claro se genera y muestra una vez en el handler de
creación (app-side): allí se calcula sha256(secret)→key_hash y se deriva key_prefix.

### Compliance engine (migración 0013)

```
regulatory_permits    tenant_id, entity_type ('tenant'|'establishment'|'supplier'|'vehicle'|
                      'recipe'), entity_id, permit_type (catálogo en lib/globalization),
                      permit_number, issued_at, expires_at, attachment_url, notes + estándar.
                      Absorbe RNE/RNPA/RUCA/UTA/URA y permisos de cualquier país. Unique parcial
                      (tenant, entity_type, entity_id, permit_type) entre los no borrados.
recipes.regulatory_labels        jsonb {"system":"ar_octogonos|mx_nom051|...","values":[...]}.
tenant_branding.regulatory_seals jsonb [{"type":"abr","enabled":true}]. tenants/suppliers.tax_id.
```

RLS: `tenant_isolation` + `internal_read`. Columnas viejas (rne_*, rnpa_*, uta_*, ura_*,
front_labels, sello_abr_enabled, cuit) quedan deprecated hasta drop futuro.

### Consola interna SaaS (migración 0014)

Base de datos de la consola de operación SaaS (Fase 5) + modelo IA add-on (Fase 7). Cubre los
gaps 2 y 3 de la auditoría.

```
subscriptions         + billing_mode ('automatic'|'manual'|'comp'), + is_lifetime bool.
                      (current_period_end ya existía en 0001 — no se duplicó.)
manual_payments       tenant_id, subscription_id, amount, currency, method ('transfer'|'cash'|
                      'other'), reference, receipt_url, paid_at, period_months, notes, created_by
                      (staff) + estándar. SOLO staff lee; tenant NO la ve; writes service_role.
plan_addons           key PK ('ai' primero), name, description, monthly_price_ars/usd, is_active +
                      timestamps. Catálogo de lectura pública authenticated (como plans).
subscription_addons   tenant_id, subscription_id, addon_key→plan_addons, status ('active'|
                      'cancelled'), source ('purchase'|'included'|'granted'),
                      provider_subscription_id + estándar. Unique parcial (tenant, addon_key)
                      activo. El tenant ve los suyos (saber si tiene IA); writes service_role.
tenant_flags          tenant_id, flag (string libre, ej 'ai_enabled'), enabled, note, set_by +
                      timestamps, unique(tenant, flag). Independiente del catálogo feature_flags
                      de 0001. Tenant lee los suyos; writes service_role.
internal_notes        tenant_id, author_id, body + estándar. CRM del staff: SOLO staff lee;
                      tenant sin acceso; writes service_role.
subscription_invoices tenant_id, subscription_id, number, amount, currency, status ('draft'|
                      'issued'|'paid'|'voided'), issued_at, due_date, pdf_url, external_ref
                      (CAE/CFDI futuro), notes, created_by + estándar, unique(tenant, number).
                      El tenant ve las suyas; writes service_role.
internal_settings     key PK, value jsonb, updated_by, updated_at. Config global de plataforma.
                      Keys sensibles (API keys de IA, Fase 7) cifradas por la app server-side,
                      nunca texto plano. SOLO staff lee; writes service_role.
```

RLS: tablas que el tenant ve (`subscription_addons`, `tenant_flags`, `subscription_invoices`) →
policy `tenant_read` (solo SELECT, NO `for all`) + `internal_read`; writes nunca por authenticated
→ service_role desde los route handlers de `/internal`. Tablas solo-staff (`manual_payments`,
`internal_notes`, `internal_settings`) → solo `internal_read`. `plan_addons` → lectura pública
authenticated. La tabla se llama `tenant_flags` (no `tenant_feature_flags`) para no chocar con la
tabla homónima de 0001 ligada al catálogo `feature_flags`.

### Plantillas de email globales (migración 0015)

```
system_email_templates  key PK, subject, html, updated_by, updated_at. Overrides GLOBALES de
                        plataforma de las plantillas del sistema (editables desde /internal sin
                        tocar código). SOLO service_role (sin políticas anon/authenticated, como
                        system_email_smtp / system_emails).
```

Cadena de resolución de subject/html en la Edge Function `send_email`:
`email_templates` (override por TENANT) → `system_email_templates` (override GLOBAL) →
`DEFAULT_TEMPLATES` en código (fallback). Writes vía route handler
`/api/internal/email-templates` con `requireInternal()` + admin client + audit.

### Foto de producción (migración 0016)

```
productions.photo_url   text null. Foto del producto terminado, capturada DESPUÉS de completar la
                        producción (la RPC complete_production 0005 está congelada). Dato vivo: NO
                        entra en el snapshot inmutable de public_traces.payload (regla 5) — la traza
                        pública la lee del registro vivo (public_traces.production_id → productions).
                        Bucket público `recipes` (0003), path <tenant_id>/productions/...
```

### Colores de planillas PDF (migración 0017)

```
tenant_branding.pdf_primary_color   text null (hex #RRGGBB): banda del header del PDF.
tenant_branding.pdf_secondary_color text null (hex #RRGGBB): títulos de sección, headers de tabla,
                                    acentos. Ambos NULL → fallback de marca Ninja Food (#08120A /
                                    #2E7D32) vía resolvePalette() en lib/utils/pdf.ts.
```

Regla dura 10 (nada hardcodeado al cliente). Aditivo: no toca RLS (tenant_branding ya scoped por
`current_tenant_id()` desde 0001/0006). Validación de formato hex en la app, no en SQL.

### Barcode de ingredientes (migración 0018)

```
ingredients.barcode   text null. Código de barras comercial (EAN-13/EAN-8/Code-128/QR) para escaneo
                      por cámara en ingreso de stock y búsqueda del catálogo. Dato de conveniencia,
                      NO regulatorio (identifica el producto comercial, no el lote). NO unique a
                      propósito (datos sucios pueden compartir EAN entre proveedores). Índice parcial
                      ingredients_tenant_barcode_idx (tenant_id, barcode) where deleted_at is null
                      and barcode is not null para el lookup por código escaneado.
```

### Metering de IA (migración 0019)

```
ai_usage   tenant_id, feature (texto libre: 'nutrition_table'|'front_labels'|'report_format'|...),
           provider, model, input_tokens, output_tokens, created_at. Registra cada generación de IA
           para controlar el costo de la key de PLATAFORMA (de Ninja-Soft, no del cliente) y aplicar
           límites por plan. Índice (tenant_id, created_at) para uso mensual. SOLO staff lee
           (internal_read SELECT); writes por service_role (lib/ai/usage.logAIUsage, best-effort,
           nunca rompe el flujo). El tenant NO ve esta tabla.
```

### Identidad de remitente del tenant (migración 0020)

```
tenant_branding.email_from_name   text null. Nombre que firma los envíos manuales del tenant
                                  (planillas, remitos, recetas, recall, informes vía /api/emails/send).
                                  Null → tenants.name → marca de plataforma.
tenant_branding.email_reply_to    text null. Reply-To del cliente (el From sigue siendo no-reply de
                                  plataforma; el SMTP real es system_email_smtp, no propio del tenant).
tenant_branding.email_signature   text null. Pie/firma opcional (texto plano, escapado). Regla 6: sin
                                  emojis ni em-dashes (validado en cliente/route handler con zod).
```

Cuelga de `tenant_branding` (1:1 con tenant, hogar natural de la identidad visible): hereda su RLS.

### Traza con regulatory_labels (migración 0021)

`CREATE OR REPLACE complete_production` con el MISMO cuerpo de 0005 (0016 solo agregó
`productions.photo_url`, no tocó la función) + un único agregado al payload de la traza:
`'regulatory_labels'` (rotulado frontal resuelto por país, `recipes.regulatory_labels` de 0013).
Sin esto, un tenant NO argentino producía y su traza pública quedaba SIN sellos (el snapshot solo
copiaba `front_labels`, octógonos AR-only). Solo afecta producciones NUEVAS (regla 5: las
public_traces ya escritas no se tocan). La traza pública (`app/(public)/t/[slug]`) lee
`payload.regulatory_labels` con fallback a `payload.front_labels` para trazas viejas. SECURITY
INVOKER (RLS con el JWT del usuario, igual que 0005).

### Rótulo legal de recetas (migración 0022)

```
recipes.allergens       text[] null. Alérgenos declarados del producto (gluten, leche, huevo, soja,
                        maní, frutos_secos, pescado, mariscos, sésamo, sulfitos, ...). Se resaltan en
                        negrita en el rótulo print-ready. Catálogo de chips en modules/recipes/
                        schemas.ts (set común CAA/ANVISA/FDA). NO hardcodeado al país (regla 11).
recipes.label_versions  jsonb not null default '[]'. Historial APPEND-ONLY de rótulos print-ready:
                        [{version, path (bucket recipes <tenant>/labels/<recipeId>/v<N>.pdf),
                        created_at, created_by}]. Índice de los PDF en Storage (el PDF es el artefacto
                        inmutable). Dato vivo de trabajo, NO registro firmado (regla 5): append-only
                        por convención del cliente (appendLabelVersion), no por trigger.
```

Aditivo: ambas columnas nullable/default-vacío (recetas viejas validan sin backfill). RLS sin
cambios (recipes ya tenant-scoped en 0001; el bucket `recipes` restringe escritura a la carpeta del
propio tenant en 0003).

### Multi-establecimiento (migración 0024)

Plan Industria: un tenant opera N plantas (`establishments`, ya existe desde 0001) con stock y
producción separados. `stock_entries`/`productions`/`dispatches` ya traían `establishment_id` (0001)
y `create_stock_entry` ya aceptaba `p_establishment_id` (0004). 0024 agrega:

```
vehicles.establishment_id          uuid null → fk establishments (planta base; del tenant si null)
form_templates.establishment_id    uuid null → fk establishments (null = planilla global del tenant)
form_submissions.establishment_id  uuid null → fk establishments (null = global; inmutable, set en INSERT)
```

+ índices parciales `(tenant_id, establishment_id)` en stock_entries / productions / dispatches /
form_templates / form_submissions / vehicles para el filtro "datos de esta planta".

`complete_production` (CREATE OR REPLACE sobre la base de 0021) y `create_dispatch` (sobre 0008)
agregan `p_establishment_id uuid default null` al final de la firma (MISMO nombre + default, no
overload; PostgREST lo resuelve sin ambigüedad). Con null = comportamiento idéntico al previo
(compatible con callers existentes). En producción, si hay planta, el consumo de lotes se limita a esa
planta o a lotes legacy sin planta. `suppliers`/`recipes`/`ingredients`/`customers` siguen siendo del
TENANT (compartidos entre plantas). `regulatory_permits` ya modela `entity_type='establishment'`.

establishment_id es NULLABLE en todas partes (datos legacy y tenants mono-planta operan sin
fricción) y es un FILTRO de negocio dentro del tenant, **no un límite de RLS** — el aislamiento sigue
siendo tenant-level por `current_tenant_id()`. Acceso v1: todos los miembros ven todas las plantas;
selector de "establecimiento activo" como filtro de UI. Restricción por usuario (tabla
`user_establishments`) queda para v2. Diseño completo: `docs/12-multi-establecimiento.md`.

---

## 3. RLS — estrategia

```sql
-- Función base (idéntico patrón POS)
create function current_tenant_id() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb
    -> 'app_metadata' ->> 'tenant_id', '')::uuid
$$;

-- Política tipo para toda tabla operativa
create policy tenant_isolation on <tabla>
  for all using (tenant_id = current_tenant_id());

-- Staff interno bypassa vía políticas adicionales is_internal()
-- public_traces: SELECT público por slug (anon), escritura solo tenant
-- payment_secrets / system_email_smtp: solo service_role, sin políticas anon/authenticated
```

Reglas:
1. Ninguna tabla operativa sin RLS. Test de integración `tests/integration/rls.test.ts` (patrón POS: `pnpm test:rls`).
2. `members` (operarios sin login) pertenecen al tenant; firman con PIN hasheado (bcrypt) — corrige el PIN en texto plano de LJ.
3. `public_traces.payload` es snapshot inmutable: la traza pública no cambia si se edita la receta después.
4. `form_submissions` inmutable post-firma: UPDATE bloqueado por política, correcciones = nueva fila vinculada.
5. Multi-establecimiento: plan Industria habilita N `establishments`; el resto opera con el default.

---

## 4. Diagrama de relaciones (núcleo)

```
tenants ─┬─ tenant_users ─ users
         ├─ subscriptions ─ plans
         ├─ establishments ─┬─ stock_entries ─ stock_movements
         │                  └─ productions ─┬─ production_inputs ─→ stock_entries
         ├─ suppliers ──→ stock_entries     ├─ public_traces (QR)
         ├─ ingredients ─ ingredient_families└─ dispatch_items ─ dispatches ─┬─ customers
         ├─ recipes ─ recipe_ingredients ─→ ingredients                      └─ vehicles
         ├─ members ──→ productions / reports / analyses / form_submissions
         ├─ reports / analyses (+ attachments)
         └─ form_templates ─ form_submissions
```

Cadena de trazabilidad completa: `supplier → stock_entry(lote MP) → production_input → production(lote PT) → dispatch_item → customer`, expuesta en `public_traces` y reconstruible en minutos para recall (exigencia CAA Art. 1415).
