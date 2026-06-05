# modules/billing

Lectura del estado de suscripción del tenant y catálogo de planes (TanStack
Query). Las mutaciones de cobro NO viven acá: la UI nunca toca la pasarela.

- `api.ts` — `getMySubscription()` (suscripción + plan + trial del tenant),
  `listPlans()`, y wrappers `startCheckout()` / `cancelSubscription()` que llaman
  a los route handlers `/api/billing/*`.
- `hooks.ts` — `useMySubscription`, `usePlans`, `useStartCheckout`,
  `useCancelSubscription`.

## Arquitectura de billing (regla dura 7)

- **Pasarelas solo vía `lib/billing/`** (interface `BillingProvider`). MVP:
  Mercado Pago preapproval. v2 (decisión societaria previa): Stripe, PayPal.
  - `lib/billing/types.ts` — contrato + tipos de dominio.
  - `lib/billing/mercadopago.ts` — fetch directo a la API MP (sin SDK, patrón
    POS), preapproval crear/obtener/cancelar, firma x-signature (HMAC-SHA256).
  - `lib/billing/index.ts` — `getBillingProvider(provider)`.
  - `lib/billing/limits.ts` — `parsePlanLimits` + `checkPlanLimit` (soft-block).
- **Estado canónico** en `subscriptions.status` (= `tenant_status`). Mapeo MP:
  `authorized→active`, `paused→past_due`, `cancelled→cancelled`, `pending→trial`.
- **Webhook = fuente de verdad del cobro** (`app/api/webhooks/mp/route.ts`),
  NUNCA el redirect. Thin payload → re-fetch del preapproval; idempotencia por
  `payment_events.provider_event_id` (unique en migración 0001); 200 rápido.
- **Route handlers** de cobro: `POST /api/billing/subscribe` (init_point),
  `POST /api/billing/cancel`. Solo el owner del tenant.
- **UI**: `components/settings/SubscriptionCard.tsx` en `/configuracion`.

Precios ARS de los planes: `supabase/seed.sql` (volátiles, fuera de migración).
