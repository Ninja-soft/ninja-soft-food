# Ninja Food — Plan Maestro

SaaS multi-tenant de trazabilidad y gestión bromatológica para la industria alimenticia. Argentina-first, world-ready. Avalado técnicamente por ABR (Asesoría Bromatológica Rosario).

**Origen:** evolución SaaS de La Jamonera (PoC en producción para un frigorífico de Rosario). Regla fundacional: el 100% de las funcionalidades de La Jamonera se conserva, reordenado y mejorado. **Fuente de convenciones:** Ninja-Soft POS — ante la duda, replicar el POS.

## Decisiones aprobadas (2026-06-04)

1. **Temas:** 6 — `food-dark` (default) y `food-light` base verde logo, + `food-bosque`, `food-crema`, `food-remolacha`, `food-mar`. Paletas hex en `docs/04-arquitectura.md` §3.
2. **Tiers:** keys POS (`start/pro/business/enterprise`) con nombres Inicio / Pyme / Industria / Corporativo. Detalle en `docs/05-planes-suscripcion.md`.
3. **MVP:** paridad Jamonera completa + billing Mercado Pago + panel interno (fases 0-2 del roadmap).

## Índice de documentos

| Doc | Contenido |
|---|---|
| [docs/00-inventario-repos.md](docs/00-inventario-repos.md) | Inventario La Jamonera + POS: qué hay, qué reusar, qué reescribir |
| [docs/01-benchmark-competitivo.md](docs/01-benchmark-competitivo.md) | Trazal (benchmark principal) + competidores AR/LATAM/global + pricing + gaps |
| [docs/02-catalogo-funcionalidades.md](docs/02-catalogo-funcionalidades.md) | 114 features (78 heredadas LJ + 36 nuevas) por módulo, con origen y prioridad |
| [docs/03-modelo-datos.md](docs/03-modelo-datos.md) | Esquema multi-tenant completo + estrategia RLS |
| [docs/04-arquitectura.md](docs/04-arquitectura.md) | Stack, estructura, design system 6 temas, billing abstraído, emails, API |
| [docs/05-planes-suscripcion.md](docs/05-planes-suscripcion.md) | Tiers, límites, ciclo de vida, panel interno |
| [docs/06-kpis-auditoria.md](docs/06-kpis-auditoria.md) | KPIs por dashboard + auditoría inmutable con firma PIN |
| [docs/07-roadmap.md](docs/07-roadmap.md) | Fases 0-5 con criterios de salida; hito SSO POS↔Food en fase 4 |
| [docs/08-agentes.md](docs/08-agentes.md) | Escuadrón de 13 agentes (implementados en `.claude/agents/`) |
| [docs/09-investigacion-integraciones.md](docs/09-investigacion-integraciones.md) | Veredictos verificados: delivery APIs, pasarelas, normativa (con fuentes) |

## Definition of Done del entregable de planificación

- [x] Repos inventariados (LJ + POS)
- [x] Investigación web con fuentes y veredictos de viabilidad
- [x] Modelo de datos multi-tenant coherente
- [x] Roadmap con hito de unificación POS↔Food
- [x] Planes + panel interno definidos (MP + emails calcados del POS)
- [x] Scaffolding React + Supabase + Vercel con CLAUDE.md y README
- [x] Catálogo de agentes ejecutable en `.claude/agents/`

## Supuestos declarados

1. El scaffolding vive en este repo (`ninja-soft-food`); se publica en GitHub y conecta a Vercel al iniciar fase 0.
2. Ninja Food usa un **proyecto Supabase propio** (no el del POS); el ref se completa en `.env` y `package.json` al crearlo.
3. Precios de lanzamiento son referenciales (anclados vs Trazal); se ajustan comercialmente antes del go-live.
4. El BrandBook ABR (PDF) no pudo rasterizarse en este entorno; el sello ABR usa `img/Logo ABR Back Transparent.png` hasta revisión manual del PDF.
5. Stripe internacional queda condicionado a decisión societaria (entidad extranjera vía Atlas) — fase 4.
