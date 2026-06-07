# CLAUDE.md — Ninja Food

SaaS multi-tenant de **trazabilidad y gestión bromatológica** para la industria alimenticia argentina (world-ready). Producto de Ninja-Soft, avalado técnicamente por ABR. Hermano del POS: `C:\Users\Lucas\Documents\ninja-soft-pos` es la **fuente de verdad de convenciones** — ante cualquier duda de estructura, estilo o patrón, mirá cómo lo hace el POS y replicalo.

## Stack

Next.js 14 (App Router) · React 18 · TypeScript strict · **Tailwind CSS 3.4** (regla dura) · TanStack Query 5 · Zustand 5 · react-hook-form + zod · Radix UI · react-day-picker 9 + date-fns 4 · exceljs + jspdf · Supabase (Postgres + Auth + Storage + Edge Functions) · Mercado Pago (suscripciones preapproval) · Vercel + GitHub Actions · pnpm 9 / Node ≥20.

## Comandos

```bash
pnpm install              # deps
pnpm dev                  # dev server (http://localhost:3000)
pnpm build                # build de producción
pnpm lint && pnpm typecheck && pnpm test   # gate de CI (correr antes de commit)
pnpm test:rls             # tests de aislamiento multi-tenant (OBLIGATORIO tras tocar SQL)
pnpm db:start             # Supabase local (Docker)
pnpm db:reset             # aplica migraciones + seed
pnpm db:types             # regenera types/database.ts (correr tras cada migración)
pnpm format               # prettier
```

Deploy: push a `main` → Vercel auto-deploy. PRs generan preview. CI bloquea merge si falla lint/typecheck/test/build.

## Arquitectura (resumen — detalle en docs/)

- `app/(auth)` login/signup/recover · `app/(public)` landing + `t/[slug]` traza pública QR (sin auth) · `app/(app)` la aplicación del tenant · `app/internal` panel staff Ninja-Soft · `app/api` health, webhooks MP, API pública v1.
- `modules/<dominio>/{api,hooks,schemas,store}.ts` — la lógica de negocio NUNCA vive en componentes.
- `components/ui` primitivos portados del POS · `components/<dominio>` específicos.
- `lib/supabase` clients server/client/middleware · `lib/theme` 6 temas · `lib/billing` abstracción de pasarelas · `lib/utils` cn/format/xlsx/pdf/lotCode.
- `supabase/migrations` SQL versionado · `supabase/functions` Edge Functions (Deno).

## Reglas duras (no negociables)

1. **Multi-tenant:** toda tabla operativa lleva `tenant_id` + RLS con `current_tenant_id()`. Toda migración nueva incluye sus políticas y un caso en `tests/integration/rls.test.ts`. Sin excepciones.
2. **Tailwind + tokens:** solo clases Tailwind mapeadas a CSS vars del design system (`bg-background`, `text-foreground`, `border-border`, `bg-primary`...). Prohibido hex suelto en componentes y prohibido `style={{}}` salvo casos dinámicos justificados.
3. **Estética premium nivel POS:** cada pantalla se compara contra su equivalente del POS antes de darse por terminada. Fondos atmosféricos, cards glass (`bg-card` + backdrop-blur), radios `rounded-ninjaMd/Lg`, glows de acento, animaciones del design system. **Prohibido el look genérico de IA**: nada de grises planos por defecto, `shadow-sm` sin intención, ni layouts sin jerarquía tipográfica (Nunito display / Inter UI / JetBrains Mono datos).
4. **Soft delete** (`deleted_at`), `created_at/updated_at` con trigger, UUID PK, auditoría en cambios críticos (`audit_logs` before/after).
5. **Inmutabilidad regulatoria:** `form_submissions` y `public_traces.payload` no se editan jamás — correcciones crean registros nuevos. La firma de operario usa PIN hasheado (bcrypt), nunca texto plano.
6. **Emails:** sin emojis, sin em-dashes, separador punto medio (·). Templates en `email_templates`, envío vía Edge Function `send_email`, log en `system_emails`.
7. **Billing:** el estado canónico vive en `subscriptions.status`; los webhooks (idempotentes por `provider_event_id`) son la fuente de verdad del cobro, nunca el redirect. Pasarelas solo a través de `lib/billing` (interface `BillingProvider`).
8. **Idioma:** UI y docs en español rioplatense; código, tablas y commits en inglés.
9. **Excel-first:** todo listado significativo debe poder exportarse a Excel; toda planilla debe poder imprimirse.
10. **Nada hardcodeado al cliente:** localidades, prefijos de lote, logos, umbrales — todo configurable por tenant (lección de La Jamonera).
11. **Nada hardcodeado al país:** normativa (RNE/RNPA/octógonos/CAA), moneda, locale, sellos y pasarelas se resuelven SIEMPRE vía el perfil de país del tenant (`lib/globalization` + `tenant_operating_profiles`). Prohibido asumir Argentina en UI, schemas, PDFs o billing — un tenant de México no debe ver jamás un concepto regulatorio argentino (auditoría: `docs/11-auditoria-2026-06.md`).

## Dominio (vocabulario)

Ingrediente → ingreso de stock con **lote** (proveedor + RNE + vencimiento; congelados +60 días por CAA) → **receta** (fórmula + RNPA + octógonos Ley 27.642) → **producción** (consume lotes, genera lote de producto terminado, firmada por operario con PIN) → **despacho** (cliente + vehículo UTA/URA) → **traza pública** (QR, snapshot inmutable). Paralelo: **informes bromatológicos** y **análisis de laboratorio** (importancia/conformidad 0-100), **planillas** BPM/POES configurables. Compliance: RNE (establecimiento/proveedor), RNPA (producto), RUCA (cárnicos), UTA/URA (transporte).

## Estado del roadmap

- [x] Planificación completa (`PLAN-MAESTRO.md` + `docs/`)
- [x] **Fase 0 — Fundaciones**: repo GitHub (`Ninja-soft/ninja-soft-food`), Supabase cloud (`skitcpzszonyybeqymzd`, São Paulo) con migraciones 0001-0002 aplicadas, componentes `ui/` portados del POS, auth completo (signup → Edge Function `create_tenant` → trial + claim `tenant_id`, smoke test `scripts/smoke-auth.mjs` verde), AppShell, deploy Vercel producción: https://ninja-soft-food.vercel.app
  - GitHub App de Vercel instalada en la org Ninja-soft: push a `main` → deploy producción automático, PRs → preview (verificado). Pendiente menor de fase 0: desactivar `mailer_autoconfirm` cuando haya SMTP propio.
  - Landing comercial: HECHA — `app/(public)/page.tsx` + `components/landing/` (hero dark, aval ABR, 6 features, pricing con toggle, strip normativa). `/` ya NO redirige a /login: anónimo ve landing, logueado → /dashboard u /onboarding server-side.
  - Tests RLS de integración: FORMALES y verdes — `tests/integration/rls.test.ts` (88 tests contra cloud: aislamiento A/B en 11 tablas + hijas vía parent, staff internal_read solo-SELECT, anon sin fugas, public_traces legible por slug, RPCs tenant-scoped; skipIf sin credenciales para CI). Correr con `pnpm test:rls`.
- [x] **Fase 1 — Núcleo trazabilidad** (completa):
  - [x] Ingredientes (familias, fotos, búsqueda, CRUD) — smoke verde
  - [x] Inventario (lotes con RPC atómica `create_stock_entry`/`adjust_stock_entry`, ledger append-only, alertas, regla congelados CAA, proveedores, facturas privadas) — smoke verde
  - [x] Recetas (fórmula con sustitutos, RNPA + filtros, octógonos Ley 27.642, nutrición, aging) — smoke verde
  - [x] Producción (RPC `complete_production`: consume lotes FEFO en una transacción, vencimiento con aging, secuencia PROD-NNNNN por tenant, snapshot inmutable) + traza pública `/t/[slug]` con QR — smoke 7/7 verde
  - [x] Planillas PDF (individual/masiva/semanal con QR de traza, firma Elaboró/Controló, branding por tenant) + exports Excel en ingredientes/inventario/recetas/produccion (`lib/utils/{xlsx,pdf}.ts`, `modules/planillas/*`) — gate CI verde
  - Nota de flujo: signup liviano (nombre/email/pass) → `/onboarding` completa empresa/rubro; raíz `/` muestra la landing (logueados → /dashboard)
- [~] Fase 2 — MVP completo:
  - [x] Despacho (clientes, vehículos UTA/URA con alerta de vencimiento, RPC `create_dispatch` atómica, remito PDF con branding, export Excel) — ⚠️ migración 0008 pendiente de aplicar en cloud (permiso denegado en sesión autónoma): correr `supabase db push` y luego `pnpm db:types`; smoke clientes/vehículos verde, RPC valida tras aplicar
  - [x] Calidad: análisis de laboratorio (8 tipos, conformidad 0-100 con categorías, laboratorios por tenant, adjuntos en bucket privado `attachments`, smoke 10/10) + informes bromatológicos (editor Tiptap `components/ui/RichTextEditor.tsx`, importancia 0-100, notificados persistidos, adjuntos, smoke 8/8) — pendientes de otra fase: formato IA y envío real de emails
  - [x] Dashboard del tenant (KPIs del mes con delta, chart barras 6 meses estilo POS sin deps, cards compliance RNPA/UTA-URA/RNE, alertas stock reutilizando modules/stock, actividad reciente) — agregación client-side, views SQL como optimización futura
  - [x] Billing MP (`lib/billing` BillingProvider + provider MP fetch puro, preapproval, webhook `/api/webhooks/mp` con firma x-signature HMAC + idempotencia por unique provider_event_id + re-fetch del recurso, `lib/supabase/admin.ts` service role, card Suscripción en configuración, seed precios ARS, 17 tests unit) — pendiente: registrar webhook URL en panel MP. Reconciliación diaria: HECHA (`app/api/cron/reconcile-billing`, helpers compartidos `lib/billing/sync*.ts`)
  - [x] Panel interno staff (`app/internal` con guard `requireInternal()` por `users.is_internal`, InternalShell propia, overview, tenants con detalle + extender trial / cambiar estado vía route handlers con audit, pagos, emails, audit logs, exports Excel, smoke 5/5 con verificación RLS staff/no-staff)
  - [x] Sistema de emails (Edge Function `send_email` calcada del POS con denomailer + SMTP desde `system_email_smtp`, catálogo 8 templates regla 6, `lib/emails` con `sendSystemEmail` best-effort, wiring: notificación de informes + payment_failed en webhook MP, 22 tests) — pendientes: `supabase functions deploy send_email`, cargar SMTP en `system_email_smtp` id=1, setear `CRON_SECRET` en Vercel, redeploy de `create_tenant` (ya encola welcome best-effort). Crons de alertas: HECHOS (`vercel.json` + `app/api/cron/{stock-alerts,trial-ending}` con anti-spam por system_emails)
  - [ ] Migración La Jamonera — BLOQUEADO: requiere datos reales del cliente (export de su sistema actual), coordinar con Lucas
- [~] Fase 3 — v1 diferenciación:
  - [x] Recall / trazabilidad inversa (`modules/trace`: traceForward lote MP → clientes afectados con contacto, traceBackward lote PT → proveedores, búsqueda unificada de lotes, despachos anulados/borrados SIEMPRE visibles en recall por requisito regulatorio, acta PDF + Excel multi-hoja, smoke 5/5) — UI en /trazabilidad
  - [x] Reportes + KPIs de costos (`modules/reports-kpi`: producción por día/semana con presets estilo POS, costos por receta con $/kg y % cobertura de unit_cost, top clientes por kg, export Excel multi-hoja, chart compartido `components/charts/BarsChart.tsx`, 17 tests) — app sin placeholders
  - [x] Builder de planillas configurables (migración 0009: `form_templates` + `form_submissions` INMUTABLES con triple defensa policy/trigger/diseño, RPC `submit_form` con firma PIN bcrypt vía pgcrypto; `modules/forms` con zod dinámico por campos, semáforo ok/fail, acción correctiva, correcciones encadenadas; 4to tab en /planillas con builder visual, captura firmada, historial, PDF en blanco + Excel aplanado) — ⚠️ migración 0009 pendiente de aplicar junto a 0008
  - [x] API pública v1 (migración 0010: `api_keys` sha256+prefix+scopes y `outbound_webhooks` con secret HMAC, RPC `verify_api_key` DEFINER grant anon; `lib/api` auth/data/webhooks, endpoints GET `/api/v1/{productions,stock,dispatches,traces}` con cursor y scoping explícito por tenant, ApiKeysCard en configuración con gating por plan, firma saliente `X-NinjaFood-Signature`, 19 tests, docs/10-api-publica.md) — ⚠️ migración 0010 pendiente junto a 0008/0009; wiring de eventos salientes va vía pg_net en fase posterior
  - [ ] `@ninja-soft/ui` (extracción multi-repo — requiere coordinación manual)
- **Roadmap reescrito 2026-06-06 tras auditoría integral** (`docs/11-auditoria-2026-06.md`); **Fases 4-7 ejecutadas 2026-06-06/07** (migraciones 0013-0022 aplicadas en cloud, ~20k líneas, review profundo sin hallazgos altos):
- [x] **Fase 4 — Motor de compliance internacional**: `regulatory_permits` genérico + `regulatory_labels` por país (6 sistemas: octógonos AR, NOM-051 MX, sellos CL, ANVISA BR, Nutri-Score EU, FDA US) + `regulatory_seals` + `tax_id` + frameworks por país (migración 0013, trigger de operating profile), `lib/globalization/{labelSystems,permitTypes,labelThresholds}`, moneda dinámica MP + formatters por locale, onboarding obliga país, UI completa gateada por país (PermitsSection dinámica, RegulatorySeal real compartido, dashboard por permit_type), RPC de traza snapshotea regulatory_labels (0021). Tests tenant MX unit + RLS 118 verdes.
- [x] **Fase 5 — Consola interna SaaS**: billing ops en ficha del tenant (link MP, transferencia manual, vitalicio/cortesía `billing_mode`+`is_lifetime` con guard de reconciliación, cambio de plan, extender), add-ons + flags + notas + invoices base (0014), impersonation auditada, usuarios globales con suspensión, staff mgmt, salud del tenant, audit con filtros, SMTP UI + editor de templates global (0015) + envío de prueba, credenciales MP de plataforma cifradas en internal_settings (DB-first con fallback env), paridad visual POS (logo Food conservado; bloque replicado en POS working tree SIN commitear). Pendiente menor: campañas batch de email a suscriptores, facturación ARCA.
- [x] **Fase 6 — UX de planta y Excel-first real**: grafo de trazabilidad React Flow + dagre con export PNG (vista Diagrama default, tabla regulatoria queda), Excel import (ingredientes/clientes/proveedores: plantilla brandeada → preview zod → reporte de rechazos) + SuppliersModal, builder planillas v2 (dnd-kit, campos time/photo/checklist aditivos a submissions inmutables, colores de PDF por tenant 0017), foto en producción (0016, fuera del snapshot por regla 5), receta PDF, barcode scanner html5-qrcode (0018, EAN en alta/ingreso/búsqueda). Pendiente: pase estético transversal sistemático.
- [x] **Fase 7 — IA** (núcleo completo): `lib/ai` (AIProvider Claude/Gemini fetch puros con structured output, key de PLATAFORMA cifrada AES-256-GCM en internal_settings vía `AI_CONFIG_SECRET`, card en /internal/configuracion write-only con Probar), gating `tenantHasAI` 3 vías (plan `limits.ai_included` / addon / flag) + metering `ai_usage` (0019), tabla nutricional generada por IA (propuesta editable, auditada), sellos automáticos determinísticos por umbrales legales citados (`labelThresholds`, TODO-LEGAL marcados), rótulo print-ready vectorial por país (FDA/LATAM/EU layouts, alérgenos, marcas de corte, versionado en bucket + `label_versions` 0022), **add-on IA autocontratable** (preapproval MP separado discriminado por external_reference `addon:ai:<tenantId>`, webhook materializa, precio editable en /internal/planes + toggle IA incluida), asistente de redacción en informes (improve/structure/summarize con confirmación, sanitización en 3 capas). Fase 7 COMPLETA.
- [ ] **Fase 8 — Ecosistema**: delivery (MercadoLibre, PedidosYa, Rappi, Uber Eats), SSO POS↔Food, conector Ninja POS, multi-planta, Stripe/PayPal, `@ninja-soft/ui`.
- **Extra fuera de roadmap (pedidos directos)**: emails salientes del tenant (identidad de remitente en branding 0020, send_email con adjuntos deployada, SendEmailModal en 8 flujos: planillas×3, receta, remito, informes, análisis, recall masivo con confirmación).
- **Operativo pendiente (Lucas)**: cargar SMTP en `/internal/emails` · registrar webhook MP en panel (URL `/api/webhooks/mp`) · cargar API key de IA en `/internal/configuracion` · setear precio del add-on 'ai' en `/internal/planes` · commit del bloque de logo en repo POS (working tree).

Detalle y criterios de salida: `docs/07-roadmap.md`. Auditoría de gaps: `docs/11-auditoria-2026-06.md`. Catálogo funcional completo (no perder NINGUNA feature de La Jamonera): `docs/02-catalogo-funcionalidades.md`.

## Agentes

`.claude/agents/` define el escuadrón (arquitecto-datos, backend-supabase, frontend-design, trazabilidad, planillas-excel, billing, emails, integraciones-api, calidad-compliance, kpis-reportes, devops-repo, qa, revisor). Fichas y dependencias: `docs/08-agentes.md`. Regla: quien cambie arquitectura actualiza este archivo y docs/ en el mismo PR.

## Referencias rápidas

- Paletas de los 6 temas: `docs/04-arquitectura.md` §3 · implementación: `app/globals.css` + `lib/theme/ThemeProvider.tsx`
- Modelo de datos completo: `docs/03-modelo-datos.md`
- Veredictos de APIs externas (MP, ML, PedidosYa, Rappi, normativa): `docs/09-investigacion-integraciones.md`
- Assets de marca: `img/` (logos dark/light, ABR)
