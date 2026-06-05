# Catálogo de agentes de trabajo — Ninja Food

Escuadrón para construcción autónoma. Cada agente existe como archivo ejecutable en `.claude/agents/<nombre>.md` (formato subagente de Claude Code). Este doc es la ficha de equipo; los `.md` de `.claude/agents/` son la implementación.

Flujo general: `arquitecto` diseña → especialistas construyen → `qa` y `revisor` validan → `devops` despliega. `CLAUDE.md` es el contrato compartido que todos leen primero.

---

## 1. arquitecto-datos
- **Rol:** Arquitectura y modelo de datos.
- **Misión:** mantener el esquema multi-tenant coherente, seguro (RLS) y fiel a las convenciones del POS.
- **Responsabilidades:** diseñar/revisar migraciones; garantizar `tenant_id` + RLS + triggers + soft delete en toda tabla; mantener doc 03 sincronizado; aprobar cambios de esquema de otros agentes; regenerar `types/database.ts`.
- **Inputs:** specs de features, doc 03, migraciones POS de referencia. **Outputs:** migraciones SQL, tipos, actualización de docs.
- **Stack:** Supabase CLI, SQL, pg_cron. **Dependencias:** ninguna (es raíz); todos dependen de él.

## 2. backend-supabase
- **Rol:** Backend y Edge Functions.
- **Misión:** implementar la lógica server-side: funciones, jobs, storage policies, API interna de módulos.
- **Responsabilidades:** `modules/*/api.ts`; Edge Functions (send_email, mp_webhook, format_with_ai, create_tenant); cron de alertas; buckets y políticas de Storage; transaccionalidad de stock/producción.
- **Inputs:** esquema del arquitecto, schemas zod. **Outputs:** api.ts + functions + tests.
- **Stack:** Supabase JS, Deno, zod. **Dependencias:** arquitecto-datos.

## 3. frontend-design
- **Rol:** Frontend React y design system.
- **Misión:** UI premium nivel POS — cero estética genérica de IA.
- **Responsabilidades:** portar componentes `ui/` del POS; implementar los 6 temas; construir pantallas de módulos con AppShell; calendarios (`DateRangePicker`) y patrones de tabla idénticos al POS; revisar cada pantalla contra su equivalente POS antes de cerrar; accesibilidad.
- **Inputs:** tokens (doc 04 §3), componentes POS, schemas. **Outputs:** componentes, páginas, hooks de UI.
- **Stack:** Next.js, React, **Tailwind**, Radix, CVA, TanStack Query, Zustand, react-day-picker. **Dependencias:** arquitecto-datos (tipos), backend-supabase (api).

## 4. trazabilidad
- **Rol:** Dominio de trazabilidad (especialista de producto).
- **Misión:** la cadena MP→lote→producción→despacho→QR siempre íntegra y reconstruible en segundos.
- **Responsabilidades:** stock_entries/movements, productions/inputs, reservas TTL, generador de códigos de lote, public_traces inmutables, QR, recall (v1), árbol visual (v1).
- **Inputs:** reglas de negocio LJ (doc 02), esquema. **Outputs:** módulos stock/produccion/trazabilidad completos.
- **Stack:** el del repo + qrcode. **Dependencias:** arquitecto-datos, backend-supabase, frontend-design.

## 5. planillas-excel
- **Rol:** Excel-first y documentos.
- **Misión:** todo dato entra y sale por planilla: import robusto, export configurable, PDF imprimible masivo.
- **Responsabilidades:** exports exceljs con estilos de marca; import XLSX con wizard de mapeo y preview de errores; planillas PDF individual/masiva/semanal; builder de planillas configurables (v1); impresión.
- **Inputs:** templates LJ como referencia funcional. **Outputs:** lib/utils/xlsx, lib/utils/pdf, módulo planillas.
- **Stack:** exceljs, jspdf. **Dependencias:** trazabilidad (datos), frontend-design (UI).

## 6. billing
- **Rol:** Suscripciones multi-pasarela.
- **Misión:** el estado canónico de suscripción gobierna los límites del plan, sin importar la pasarela.
- **Responsabilidades:** `lib/billing/*` (abstracción + estados canónicos); MP preapproval + webhooks idempotentes (MVP); Stripe/PayPal (v2); reconciliación diaria; enforcement de límites; pantalla de suscripción del tenant y de pagos del panel interno.
- **Inputs:** doc 04 §5, doc 05, código MP del POS. **Outputs:** lib/billing, Edge Functions mp_*, UI de planes.
- **Stack:** MP API (preapproval), Stripe Billing, PayPal Subscriptions v1. **Dependencias:** arquitecto-datos, backend-supabase.

## 7. emails
- **Rol:** Sistema de emails (calcado POS).
- **Misión:** transaccionales consistentes con las convenciones Ninja-Soft (sin emojis, sin em-dashes, punto medio).
- **Responsabilidades:** Edge Function send_email; templates por tenant; cola system_emails; emails del MVP (doc 04 §6); previews en panel interno.
- **Inputs:** templates POS. **Outputs:** functions + templates + UI interna de emails.
- **Stack:** Deno SMTP, HTML email. **Dependencias:** backend-supabase.

## 8. integraciones-api
- **Rol:** API pública y conectores externos.
- **Misión:** Ninja Food expone y consume APIs (API-first).
- **Responsabilidades:** API v1 con api_keys + scopes + rate limit; OpenAPI; webhooks salientes HMAC; conectores MercadoLibre → PedidosYa → Rappi (v2) según veredictos de viabilidad (doc 09); conector Ninja POS (v2).
- **Inputs:** doc 09 (veredictos API), esquema. **Outputs:** app/api/v1, conectores, OpenAPI spec.
- **Stack:** Next.js route handlers, OAuth de cada plataforma. **Dependencias:** arquitecto-datos, backend-supabase, billing (límites por plan).

## 9. calidad-compliance
- **Rol:** Dominio bromatológico (alineado ABR).
- **Misión:** que ABR pueda avalar técnicamente: registros atribuibles, inmutables y mapeados a normativa.
- **Responsabilidades:** informes + análisis; RNE/RNPA/RUCA con cadena de prerequisitos y alertas; checklist de compliance (doc 09 normativa) como referencia de producto; firma PIN; inmutabilidad de form_submissions; sello ABR; rótulos (v1), HACCP/NC/CAPA (v2).
- **Inputs:** doc 09 sección normativa, módulos LJ de informes/análisis. **Outputs:** módulos calidad y compliance.
- **Stack:** el del repo + Tiptap (editor). **Dependencias:** arquitecto-datos, frontend-design, emails.

## 10. kpis-reportes
- **Rol:** Métricas y dashboards.
- **Misión:** datos accionables para el tenant y para Ninja-Soft.
- **Responsabilidades:** dashboard tenant (MVP + v1), views/funciones SQL de agregación, dashboard interno SaaS, reportes programados (v2).
- **Inputs:** doc 06. **Outputs:** módulo reportes, views SQL.
- **Stack:** SQL views, charts (lib del POS). **Dependencias:** trazabilidad, calidad-compliance, billing.

## 11. devops-repo
- **Rol:** GitHub + Vercel + mantenimiento del contrato.
- **Misión:** main siempre deployable; `CLAUDE.md` siempre fiel al estado real.
- **Responsabilidades:** CI (lint+typecheck+test+build); deploy Vercel + env vars documentadas; previews por PR; migraciones aplicadas en orden; **actualizar CLAUDE.md y docs/ en cada merge que cambie arquitectura**; versionado.
- **Inputs:** todo merge. **Outputs:** pipelines, releases, CLAUDE.md actualizado.
- **Stack:** GitHub Actions, Vercel CLI, Supabase CLI. **Dependencias:** transversal.

## 12. qa
- **Rol:** Calidad de software.
- **Misión:** nada se declara terminado sin evidencia verificada.
- **Responsabilidades:** tests unitarios (Vitest) y de integración (RLS obligatorio por tabla nueva); tests E2E del flujo crítico (signup→stock→producción→QR→despacho); regresión de paridad contra checklist LJ; smoke test post-deploy.
- **Inputs:** features terminadas. **Outputs:** suites de test, reportes de regresión.
- **Stack:** Vitest, Testing Library, Playwright (E2E). **Dependencias:** todos.

## 13. revisor
- **Rol:** Code review.
- **Misión:** consistencia con convenciones POS y seguridad multi-tenant en cada PR.
- **Responsabilidades:** revisar PRs contra CLAUDE.md (convenciones, RLS, tokens de diseño, sin hardcodes de tenant); bloquear estética genérica; verificar que ninguna query salte el aislamiento.
- **Inputs:** diffs. **Outputs:** findings accionables `archivo:línea`.
- **Stack:** lectura de código. **Dependencias:** transversal.

---

## Matriz de dependencias (orden de construcción)

```
arquitecto-datos → backend-supabase → { trazabilidad, calidad-compliance, billing, emails }
                 → frontend-design ──┘
trazabilidad → planillas-excel → kpis-reportes
billing → integraciones-api
qa + revisor + devops-repo: transversales en cada fase
```
