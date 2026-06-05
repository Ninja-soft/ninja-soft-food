# Ninja Food

SaaS multi-tenant de trazabilidad y gestión bromatológica para la industria alimenticia. Producto de Ninja-Soft, avalado técnicamente por [ABR](https://asesoriabromatologicaros.com.ar/).

Next.js 14 · React 18 · TypeScript · Tailwind CSS · Supabase · Mercado Pago · Vercel

> Para contexto completo del producto y arquitectura: [`PLAN-MAESTRO.md`](PLAN-MAESTRO.md) y [`CLAUDE.md`](CLAUDE.md) (este último es el contrato que leen los agentes de IA).

## Requisitos

- Node ≥ 20
- pnpm 9 (`corepack enable && corepack prepare pnpm@9 --activate`)
- Docker (para Supabase local)
- Supabase CLI (`pnpm dlx supabase --version`)

## Setup local

```bash
# 1. Dependencias
pnpm install

# 2. Variables de entorno
cp .env.example .env.local
# completar con los valores de Supabase local (paso 3) y Mercado Pago sandbox

# 3. Base de datos local
pnpm db:start          # levanta Postgres + Auth + Storage en Docker
                       # copiar URL y anon key que imprime a .env.local
pnpm db:reset          # aplica migraciones de supabase/migrations + seed

# 4. Tipos de la base
pnpm db:types

# 5. Dev server
pnpm dev               # http://localhost:3000
```

## Variables de entorno

Documentadas una por una en [`.env.example`](.env.example). Resumen:

| Variable | Uso |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Cliente Supabase (públicas) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side y Edge Functions (secreta) |
| `MERCADOPAGO_ACCESS_TOKEN` / `MERCADOPAGO_PUBLIC_KEY` | Suscripciones (sandbox en local) |
| `EMAIL_FROM` | Remitente de transaccionales |
| `NEXT_PUBLIC_APP_URL` | URL base (callbacks MP, links de email, QR) |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` | Observabilidad (opcional en local) |

## Tests

```bash
pnpm test         # unitarios (Vitest)
pnpm test:rls     # aislamiento multi-tenant (requiere db local levantada)
pnpm typecheck    # TypeScript
pnpm lint         # ESLint
```

## Deploy (Vercel)

- Repo conectado a Vercel: cada push a `main` despliega producción; cada PR genera preview.
- Env vars de producción se cargan en el dashboard de Vercel (mismas claves que `.env.example`, valores del proyecto Supabase cloud y MP producción).
- Migraciones contra el proyecto cloud: `supabase db push` (o vía CI).
- CI en `.github/workflows/ci.yml`: lint + typecheck + test + build en cada push/PR; bloquea merge en rojo.

## Estructura

```
app/            rutas (App Router): (auth), (public), (app), internal, api
components/     ui/ (primitivos del design system) + por dominio
modules/        lógica de negocio por dominio (api, hooks, schemas, store)
lib/            supabase, theme (6 temas), billing, utils
supabase/       migrations/ + functions/ (Edge Functions Deno) + config.toml
docs/           plan de producto, arquitectura, roadmap, agentes
.claude/agents/ escuadrón de agentes para desarrollo autónomo
```
