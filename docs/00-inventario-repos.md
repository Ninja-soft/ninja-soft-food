# Inventario de repos — La Jamonera + Ninja-Soft POS

Fecha de relevamiento: 2026-06-04. Fuente: exploración exhaustiva de ambos repos locales.

---

## 1. La Jamonera (`C:\Users\Lucas\Documents\GitHub\La-Jamonera`)

### Qué es

PoC funcional de gestión bromatológica y trazabilidad para un frigorífico de Rosario. **Es el catálogo funcional de referencia de Ninja Food: el 100% de sus funcionalidades se conserva** (ver `docs/02-catalogo-funcionalidades.md`).

### Stack actual

| Capa | Tecnología | Veredicto para Ninja Food |
|---|---|---|
| Frontend | Vanilla JS + HTML + Bootstrap 5.3 | **Reescribir** en Next.js + React + Tailwind (stack POS) |
| Backend | Firebase Realtime Database | **Reescribir** en Supabase Postgres multi-tenant |
| Auth | Firebase Auth (email alias hardcodeado) | **Reescribir** en Supabase Auth + RBAC |
| Storage | Firebase Storage | **Migrar** a Supabase Storage |
| Hosting | GitHub Pages | **Migrar** a Vercel |
| Librerías | SweetAlert2, FlatPickr, Chart.js, jsPDF, SheetJS, QRCode.js | Reemplazar por equivalentes del POS (Radix, react-day-picker, exceljs, jspdf se mantiene) |

### Módulos funcionales encontrados (resumen — detalle completo en doc 02)

1. **Auth y sesión**: login, sesión 8h, guard de rutas, gestión de usuarios operativos (nombre, puesto, email, PIN, foto).
2. **Dashboard**: gráfico de producción (barras/línea/dona), último informe, RNE de proveedores pendientes, RNPA de recetas, transporte habilitado (UTA/URA).
3. **Ingredientes**: CRUD con familias jerárquicas, fotos, unidades de medida, flag perecedero, búsqueda, impresión de catálogo.
4. **Inventario/Stock**: ingresos con lote + factura + proveedor + RNE, generador de lotes con tokens configurables, vencimientos automáticos (incl. regla CAA de congelados +60 días), alertas de stock bajo y vencimiento próximo, egresos automáticos al producir, historial, export Excel, planilla semanal configurable, flag uso interno.
5. **Recetas**: fórmula con sustitutos, RNPA (número, vencimiento, PDF, exención mostrador), categorías CAA, vida útil + estacionamiento (aging), congelado pre-envasado, info nutricional, octógonos Ley 27.642, medidas caseras, grupos/carpetas, filtros RNPA por vencimiento, ficha técnica PDF.
6. **Producción**: consumo de lotes con trazabilidad, ID único (PROD-LJ-...), lote del producto auto/manual, responsable, vencimiento calculado, reservas con TTL, borradores, historial filtrable, export Excel, planillas individuales/masivas/semanales en PDF, auditoría de cambios.
7. **Despacho/Reparto**: clientes, vehículos (UTA/URA), localidades, import/export XLSX masivo con reglas por producto, historial de importaciones, índice de producto disponible.
8. **Trazabilidad pública**: URL pública por lote + QR (4 tamaños de impresión), página `produccion_publica.html` sin auth.
9. **Informes bromatológicos**: editor WYSIWYG con colores/emoji, formato con IA, importancia sanitaria 0-100 con categorías, adjuntos múltiples, notificación por email a usuarios elegidos, historial paginado con filtros.
10. **Análisis de laboratorio**: tipos (agua/alimentos/superficies/ambiente/MP/bebidas), ID de muestra, laboratorio, conformidad 0-100, adjuntos, filtros por tipo y fecha.
11. **Notificaciones**: toasts + emails vía Cloudflare Worker.
12. **Utilidades**: cache con TTL, índices, export Excel, PDF, QR.

### Qué reusar vs reescribir

**Reusar (conceptos y reglas de negocio, no código):**
- Modelo de trazabilidad lote-a-lote (ingreso → producción → despacho → QR público). Es el corazón del producto y está validado con cliente real.
- Reglas CAA codificadas: congelados +60 días, octógonos, categorías alimentarias, exención RNPA mostrador, UTA/URA.
- Generador de lotes con tokens configurables.
- Sistema de importancia/conformidad 0-100 con categorías.
- Flujo planillas (individual/masiva/semanal) y export Excel.
- Assets: logos Ninja Food ya diseñados en `img/` (dark/light), logo ABR.

**Reescribir todo el código.** Razones concretas:
- Credenciales Firebase hardcodeadas en `JS/firebase-init.js:6-15`.
- Single-tenant: alias `lajamonera@lajamonera.local` en `JS/login.js`.
- Sin RBAC: todo usuario autenticado ve todo.
- Archivos monolíticos (`JS/produccion.js` ~1200 líneas) que mezclan UI + negocio + persistencia.
- Lógica duplicada (formateo de fechas, validación de imágenes, niveles de importancia repetidos en 3+ módulos).
- HTML por concatenación de strings (riesgo XSS), sin TypeScript, sin tests.
- PIN de usuario en texto plano.

---

## 2. Ninja-Soft POS (`C:\Users\Lucas\Documents\ninja-soft-pos`)

### Qué es

SaaS POS multi-tenant en producción activa. **Fuente de verdad de TODO lo transversal**: stack, convenciones, design system, panel interno, suscripciones, emails. Ante la duda, replicar el POS.

### Stack (a heredar tal cual)

| Capa | Tecnología | Versión |
|---|---|---|
| Framework | Next.js (App Router) | 14.2.21 |
| UI | React | 18.3.1 |
| Estilos | **Tailwind CSS** (regla dura) | 3.4.17 |
| Server state | TanStack Query | 5.62.7 |
| Client state | Zustand | 5.0.2 |
| Forms | react-hook-form + zod | 7.54.2 / 3.24.1 |
| Primitivos | Radix UI (dialog, dropdown, popover, toast) | — |
| Calendario | react-day-picker 9 + date-fns 4 | — |
| Excel / PDF | exceljs 4.4 / jspdf 4.2 | — |
| Backend | Supabase (@supabase/supabase-js 2.106, @supabase/ssr) | Postgres + Auth + Storage + Edge Functions |
| Iconos | lucide-react | — |
| Tests | Vitest + Testing Library | — |
| Package manager | pnpm 9 / Node ≥20 | — |
| Deploy | Vercel + GitHub Actions CI | — |

### Convenciones (a heredar)

- Alias `@/` a raíz del repo (sin `src/`).
- Rutas agrupadas: `(auth)`, `(public)`, `(app)`, `internal/`, `api/`.
- `modules/<dominio>/{api.ts, hooks.ts, schemas.ts, store.ts}` — negocio separado de UI.
- `components/ui/` primitivos + `components/<dominio>/` específicos.
- Componentes PascalCase, hooks `useX`, constantes SCREAMING_SNAKE, CVA para variantes.
- BD: UUID PK, `tenant_id` en toda tabla operativa, `created_at/updated_at` con trigger, `deleted_at` soft delete, RLS en todas las tablas, `audit_logs` con before/after.

### Design system (a heredar con paleta propia)

- Tokens como CSS vars en `globals.css`, mapeados en `tailwind.config.ts`.
- 4 temas POS (`ninja-dark`, `ninja-noir`, `ninja-light`, `ninja-sand`) → Ninja Food define 6 temas propios (ver doc 04) con la misma arquitectura `[data-theme]`.
- Tipografía: Nunito (display), Inter (UI), JetBrains Mono (código). Apariencia configurable por usuario (display font, price font, patrón de fondo).
- Radios `ninjaSm 10px / ninjaMd 14px / ninjaLg 20px / ninjaXl 28px`, sombras y glows por tema, animaciones (fade-in 180ms, modal-in 210ms cubic-bezier).
- Patrones de fondo: dots, grid, crosses, diagonal, mesh.

### Componentes reutilizables (candidatos a paquete compartido)

`Button, Input, Card, Modal, DateRangePicker (con presets), Dropdown, Avatar, Toast, Switch, Spinner, Segmented, ConfirmDialog, Typography` + `AppShell` / `InternalShell`. Tablas: HTML + Tailwind con `divide-y divide-border` y `overflow-x-auto`.

### Panel interno (a calcar)

`/internal`: dashboard de métricas, tenants (lista + detalle con suscripción, auditoría, notas), staff con niveles (viewer/editor/admin), usuarios, audit logs, emails (SMTP + templates + test), pagos MP (webhooks, conciliación, refunds).

### Suscripciones (a calcar)

- Tablas: `plans` (keys start/pro/business/enterprise, límites jsonb), `subscriptions` (1 por tenant, estados trial→active→past_due→suspended→cancelled), `tenant_feature_flags`.
- Mercado Pago: OAuth (`/api/mp/oauth/callback`), Edge Functions `mp_subscription_checkout`, `mp_webhook`, `mp_billing_webhook`, preapproval para recurrencia.
- Trial 14 días, lectura 90 días post-cancelación.

### Sistema de emails (a calcar)

- Edge Function `send_email` (Deno + SMTPClient), config en `system_email_smtp` (solo service_role).
- `email_templates` por tenant + `system_emails` como cola/log con estados pending/sent/failed.
- Convenciones: sin emojis, sin em-dashes, punto medio (·) como separador, Inter, layout logo/contenido/footer.

---

## 3. Assets disponibles en `ninja-soft-food/img/`

| Archivo | Uso |
|---|---|
| `ninja-food-dark-mode.png/.webp` (+ variante "con-garantizado") | Logo dark: "Ninja" blanco + "food" degradé verde |
| `ninja-food-light-mode.png/.webp` (+ variante) | Logo light: "Ninja" negro + "food" degradé verde |
| `Ninja-Foog-Logo.psd` | Fuente editable del logo |
| `Logo ABR Back Transparent.png` | Logo ABR para sello de aval |
| `food.png/.webp`, `foodie.png/.webp` | Ilustraciones |
| `ABR - BrandBook.pdf` (raíz) | BrandBook de ABR (no se pudo rasterizar en este entorno; revisar manualmente para el sello de aval) |

**Identidad extraída del logo:** degradé verde `#1F7A33 → #8CBF2F → #C6D420` (verde bosque → verde manzana → lima). Define la paleta primaria de Ninja Food (reemplaza el naranja flame del POS).
