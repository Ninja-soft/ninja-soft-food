# Arquitectura técnica — Ninja Food

Regla rectora: **calcar el POS**. Misma organización, mismas librerías, mismos patrones. Lo único propio de Food: dominio, paleta y módulos.

---

## 1. Stack

| Capa         | Elección                                                                           | Justificación                                        |
| ------------ | ---------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Framework    | Next.js 14 App Router + React 18 + TypeScript strict                               | Idéntico al POS                                      |
| Estilos      | **Tailwind CSS 3.4** + CVA + tailwind-merge                                        | Regla dura del proyecto; tokens CSS vars como el POS |
| Server state | TanStack Query 5                                                                   | Idéntico POS                                         |
| Client state | Zustand 5                                                                          | Idéntico POS                                         |
| Forms        | react-hook-form + zod                                                              | Idéntico POS                                         |
| Primitivos   | Radix UI + componentes propios `components/ui`                                     | Idéntico POS                                         |
| Calendarios  | react-day-picker 9 + date-fns 4 (`DateRangePicker` con presets)                    | Componente POS, candidato a paquete compartido       |
| Excel / PDF  | exceljs + jspdf                                                                    | Idéntico POS                                         |
| Backend      | Supabase: Postgres + Auth + Storage + Edge Functions (Deno)                        | Idéntico POS                                         |
| Deploy       | GitHub → Vercel (auto desde `main`), GitHub Actions CI (lint+typecheck+test+build) | Idéntico POS                                         |
| Tests        | Vitest + Testing Library + test RLS de integración                                 | Idéntico POS                                         |
| Tooling      | pnpm 9, Node ≥20, Prettier + prettier-plugin-tailwindcss, ESLint                   | Idéntico POS                                         |

## 2. Estructura de carpetas (calcada del POS)

```
ninja-soft-food/
├── app/
│   ├── (auth)/          login, signup, recover, reset-password
│   ├── (public)/        landing, t/[slug] (traza pública QR — sin auth)
│   ├── (app)/           dashboard, ingredientes, inventario, recetas, produccion,
│   │                    trazabilidad, despacho, informes, analisis, planillas,
│   │                    reportes, configuracion
│   ├── internal/        panel Ninja-Soft: tenants, staff, usuarios, audit, emails, pagos
│   ├── api/             health, mp/oauth/callback, v1/ (API pública)
│   ├── globals.css      tokens + 6 temas
│   └── layout.tsx
├── components/
│   ├── ui/              primitivos (espejo del POS)
│   ├── layout/          AppShell, InternalShell, DashboardHeader
│   └── <dominio>/       traceability/, production/, stock/, quality/, forms/, dispatch/
├── modules/<dominio>/   api.ts, hooks.ts, schemas.ts, store.ts
├── lib/
│   ├── supabase/        server.ts, client.ts, middleware.ts
│   ├── theme/           ThemeProvider (6 temas), AppearanceProvider
│   ├── email/           templates.ts
│   ├── billing/         capa de abstracción de pasarelas (ver §5)
│   └── utils/           cn, format, image, xlsx, pdf, lotCode, qr
├── supabase/
│   ├── migrations/      SQL versionado
│   ├── functions/       send_email, mp_webhook, mp_subscription_checkout, format_with_ai
│   └── config.toml
├── types/database.ts    generado: pnpm db:types
├── .claude/agents/      escuadrón de agentes (doc 08)
├── CLAUDE.md · README.md · .env.example
└── .github/workflows/ci.yml
```

## 3. Design system — 6 temas aprobados

Misma arquitectura del POS: CSS vars semánticas (`--background`, `--card`, `--primary`, `--accent`, `--muted`, `--border`, `--ring`...) bajo `[data-theme]`, mapeadas en `tailwind.config.ts`. Marca fija: degradé del logo `#1F7A33 → #8CBF2F → #C6D420`.

**Mandato de calidad visual (regla dura):** la UI debe verse al nivel del POS — fondos atmosféricos con radial-gradients, cards glass con backdrop-blur, glows de acento, radios ninja (10/14/20/28px), animaciones con cubic-bezier, tipografía Nunito/Inter/JetBrains Mono. **Prohibido el look genérico**: nada de grises shadcn por defecto, ni `rounded-md shadow-sm` plano, ni layouts sin jerarquía. Cada pantalla nueva se contrasta contra una pantalla equivalente del POS antes de darse por terminada.

| Tema                  | Tipo  | background | foreground | primary   | accent           | secondary               | border/input            | Notas                                                                                                          |
| --------------------- | ----- | ---------- | ---------- | --------- | ---------------- | ----------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------- |
| `food-dark` (default) | dark  | `#08120A`  | `#F0F7EE`  | `#3FA34D` | `#C6D420`        | `rgba(255,255,255,.06)` | `rgba(255,255,255,.10)` | Gradiente atmosférico verde: radial verde 18%/lima 82% sobre `linear-gradient(135deg,#07110A,#0C1F10,#15331B)` |
| `food-light`          | light | `#F4F8F2`  | `#13190F`  | `#2E7D32` | `#9BB814`        | `#E8F0E3`               | `#DDE8D6`               | Equivalente a ninja-light en clave verde                                                                       |
| `food-bosque`         | dark  | `#06120A`  | `#EDF7EE`  | `#4CAF50` | `#C6D420`        | `rgba(255,255,255,.05)` | `rgba(255,255,255,.09)` | Dark profundo neutro-verde (rol del ninja-noir)                                                                |
| `food-crema`          | light | `#FBF7EC`  | `#1D1A10`  | `#2E7D32` | `#C9A227` (miel) | `#F3EDDA`               | `#EAE2CC`               | Cálido panadería (rol del ninja-sand)                                                                          |
| `food-remolacha`      | light | `#FAF5F7`  | `#221318`  | `#8E2A48` | `#C95D63`        | `#F2E4EA`               | `#EBD8E0`               | Identidad cárnica/frigorífico                                                                                  |
| `food-mar`            | dark  | `#07171A`  | `#ECFDF5`  | `#14B8A6` | `#99E2B4`        | `rgba(255,255,255,.05)` | `rgba(255,255,255,.09)` | Pescados/frescos                                                                                               |

Cada tema define además `--destructive #FF5A5A` (dark) / `#C62828` (light), sombras `--shadow-soft` por tema, y glows: `foodGlow rgba(63,163,77,.22)`, `limeGlow rgba(198,212,32,.16)`.

**Paquete compartido (fase 2 del roadmap):** extraer `@ninja-soft/ui` (Button, Card, Modal, DateRangePicker, tablas, Typography, tokens base) consumido por POS y Food. Hasta entonces: copiar componentes del POS 1:1 y mantener paridad de API de props para que la extracción sea mecánica.

## 4. Multi-tenancy y auth

Idéntico POS: Supabase Auth → trigger `handle_new_user()` → espejo `public.users` → Edge Function `create_tenant` (tenant + suscripción trial 14 días) → claim `tenant_id` en JWT → middleware refresca sesión → RLS con `current_tenant_id()`.

Preparación SSO POS↔Food desde el día 1 (requisito del roadmap):

- Mismo proyecto convention de claims (`app_metadata.tenant_id`, `app_metadata.products: ['food']`).
- `users.email` como identidad pivote; tabla futura `ninja_accounts` federada.
- No acoplar lógica al nombre del producto en auth; el dominio de login será configurable (`auth.ninja-soft.com` a futuro).

## 5. Billing — capa de abstracción multi-pasarela

Diseño verificado contra docs oficiales (fuentes en doc 09):

```
lib/billing/
├── types.ts          Plan, Subscription, NormalizedEvent, estados canónicos
├── provider.ts       interface BillingProvider { createSubscription, cancel, pause,
│                     parseWebhook, verifySignature }
├── mercadopago.ts    preapproval + preapproval_plan; webhooks subscription_preapproval,
│                     subscription_authorized_payment, payments
├── stripe.ts         (v2 — requiere entidad extranjera vía Atlas) Billing + invoice.paid etc.
├── paypal.ts         (v2 — fallback) Subscriptions API v1 + BILLING.SUBSCRIPTION.*
└── router.ts         país AR/LATAM → MP · internacional → Stripe · preferencia → PayPal
```

Principios:

1. **La app es fuente de verdad** del estado de suscripción; la pasarela solo ejecuta cobros.
2. Webhook = fuente de verdad del pago (nunca el redirect). Patrón thin-payload: re-fetch del recurso al recibir.
3. Idempotencia por `provider_event_id` en `payment_events`.
4. Responder 200 rápido, procesar en cola.
5. Job de reconciliación diario que compara `current_period_end` vs estado del provider.
6. **Payoneer queda fuera de billing** (verificado: no tiene motor de suscripciones; es rail de cobro B2B manual — se documenta como opción de tesorería para enterprise).

## 6. Sistema de emails (calcado POS)

Edge Function `send_email` (Deno + SMTP), `system_email_smtp` solo service_role, `email_templates` por tenant, `system_emails` como log con estados. Convenciones tipográficas duras: sin emojis, sin em-dashes, separador punto medio (·), Inter, layout logo/contenido/footer. Emails del MVP: verificación, recuperación, informe bromatológico notificado, alerta stock bajo, alerta vencimiento (lote/RNE/RNPA/UTA), trial por vencer, pago confirmado/rechazado.

## 7. API pública (v1)

`app/api/v1/` con auth por API key (`api_keys.key_hash`), scopes de lectura primero:
`GET /api/v1/traces/{lot}` · `GET /api/v1/stock` · `GET /api/v1/productions` · `GET /api/v1/recipes`.
Rate limit por tenant/plan. Webhooks salientes firmados (HMAC) para `production.created`, `stock.low`, `lot.expiring`. OpenAPI spec versionada en el repo.

## 8. Jobs / async

- Supabase Cron (pg_cron): alertas de vencimiento (lotes, RNE, RNPA, UTA/URA, planillas vencidas), reconciliación billing, limpieza de reservas TTL.
- Edge Functions para: emails, webhooks MP, formato IA de informes, generación masiva de planillas.

## 9. Storage

Buckets Supabase Storage por dominio: `ingredients`, `recipes`, `invoices`, `attachments` (informes/análisis), `members`, `branding`. Política: archivos namespaced por `tenant_id/` con RLS de Storage; límite 10 MB; tipos JPEG/PNG/WebP/PDF (+DOCX/XLSX en adjuntos).

## 10. Observabilidad

Sentry (DSN en env, patrón POS), `app/api/health`, logs de Edge Functions vía Supabase, `internal_tenant_health` para el panel interno.

## 11. Operacion internacional

La app no debe asumir Argentina en la capa de producto. El tenant conserva un
`country` de onboarding, pero la configuracion real de mercado vive en
`tenant_operating_profiles`: `country`, `locale`, `currency`, `timezone`,
identificador fiscal, impuesto por defecto, sistema de unidades, idiomas de
etiqueta y configuracion de trazabilidad por pais.

El catalogo base esta versionado en `lib/globalization/countries.ts` y cubre
LATAM, Norteamerica, Europa, Oceania, Africa y Asia con defaults para billing,
autoridades alimentarias y frameworks regulatorios. Las pantallas y exports
deben consumir `formatDate`, `formatQty` y `formatMoney` con locale/moneda del
tenant en vez de hardcodear `es-AR` o `ARS`.
