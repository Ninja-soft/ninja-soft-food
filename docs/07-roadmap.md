# Roadmap — Ninja Food

Reescrito 2026-06-06 tras auditoría integral (`docs/11-auditoria-2026-06.md`). La visión NO es paridad Jamonera: es un producto **mucho mejor** — world-ready de verdad, con consola SaaS completa, IA y UX de planta superior. Cada fase tiene objetivo, contenido, dependencias y criterio de salida.

---

## Fases completadas

### Fase 0 — Fundaciones ✅

Scaffolding Next.js + Tailwind + Supabase + CI/CD Vercel · migración núcleo SaaS (tenants, users, plans, subscriptions, audit, emails) + RLS + 88 tests · design system 6 temas + ui/ portado del POS + AppShell · auth completo (signup → create_tenant → trial) · landing pública.

### Fase 1 — Núcleo trazabilidad ✅

Ingredientes/familias · stock con lotes, vencimientos, alertas, ledger append-only · recetas (fórmula, sustitutos, nutrición manual, aging) · producción (FEFO atómico, PIN, secuencia por tenant) · traza pública QR `t/[slug]` · planillas PDF + exports Excel.

### Fase 2 — MVP ✅ (salvo migración LJ)

Despacho (clientes, vehículos, remito PDF) · calidad (análisis lab + informes bromatológicos) · dashboard tenant · billing MP (preapproval, webhook idempotente, reconciliación diaria, límites por plan) · panel interno básico · sistema de emails (Edge Function send_email, 8 templates, crons de alertas).
**Pendiente:** migración La Jamonera (bloqueado por datos del cliente).

### Fase 3 — v1 diferenciación ✅ (salvo @ninja-soft/ui)

Recall forward/backward con acta PDF · reportes + KPIs de costos · builder de planillas configurables (inmutables, firma PIN) · API pública v1 + webhooks salientes.
**Pendiente:** extracción `@ninja-soft/ui` (movido a Fase 8).

**Deuda operativa de fases cerradas:** aplicar migraciones 0008/0009/0010 en cloud · deploy `send_email` + SMTP + CRON_SECRET · registrar webhook MP.

---

## Fase 4 — Motor de compliance internacional 🌎 ✅ (ejecutada 2026-06-06/07, migraciones 0013+0021)

**Objetivo:** que un tenant de México, Chile, Brasil, España o USA opere SIN ver conceptos argentinos. Hoy el producto es Argentina-first con disfraz (audit Gap 1). Esta fase va primero porque toca schema: todo lo que se construya encima la hereda.

- **`regulatory_labels`**: reemplaza `front_labels` (octógonos-only) por sistema por país — octógonos Ley 27.642 (AR), NOM-051 (MX), sellos Ley 20.606 (CL), ANVISA (BR), Nutri-Score (EU/ES), FDA Nutrition Facts (US). Selector de sistema según país del tenant; render correcto en recetas, traza pública y PDFs.
- **`regulatory_permits`**: tabla genérica (permit_type, number, expiry, attachment, country) que absorbe RNE/RNPA/RUCA/UTA/URA como tipos argentinos y habilita COFEPRIS (MX), RSA (CL), etc. UI de formularios dinámica por país. Migración con backfill de columnas existentes.
- **`regulatory_seals`**: reemplaza `sello_abr_enabled` por sellos configurables (tipo, logo, habilitado). ABR pasa a ser un sello más, solo visible para AR.
- **Moneda y locale reales**: `currency_id` dinámico en MP (MXN/CLP/etc.), formatters `Intl` leyendo el operating profile (hoy es-AR fijo en planillas/remito/trace), precios de planes por moneda.
- **Reglas parametrizadas por país**: `frozen_extra_days` y similares salen del perfil del país, no del default CAA.
- **Onboarding obliga país**; `DEFAULT_COUNTRY_CODE` sin fallback silencioso a AR. `cuit` → `tax_id` con label por país (ya existe `tax_id_label` en operating profile).
- **Tabla nutricional por país**: estructura de campos según formato regulatorio local (base de la Fase 7 de IA).
- Landing/copy: variante internacional (octógonos/SENASA/ABR solo en contexto AR).

**Dependencias:** ninguna. **Criterio de salida:** test de integración "tenant MX" — se registra eligiendo México, no ve RNE/RNPA/octógonos/ABR en ninguna pantalla ni PDF, ve NOM-051 y COFEPRIS, paga en MXN; mismo test para CL. Tests RLS verdes sin regresión.

## Fase 5 — Consola interna SaaS 🛠️ ✅ (ejecutada 2026-06-06/07, migraciones 0014/0015; pendiente: campañas batch, facturación ARCA)

**Objetivo:** operar el negocio desde `/internal` sin tocar SQL, a la altura del panel del POS y más. Hoy es un visor (audit Gap 2).

- **Cobros y suscripciones**: generar link de pago MP desde la ficha del tenant · registrar **pago manual por transferencia** (activa/extiende suscripción con comprobante y audit) · **acceso vitalicio/cortesía** (flag explícito `comp`/`lifetime` en subscriptions, sin cobro, visible en métricas como no-revenue) · **cambiar plan** de un tenant · extender suscripción (no solo trial).
- **Planes configurables de verdad**: el editor de `/internal/planes` pasa a ser fuente única (precios por moneda, límites, features); la landing y el pricing del tenant leen de DB, muere el hardcode de `components/landing/data.ts`.
- **Facturación a suscriptores**: registro de comprobantes por pago, numeración, export; integración ARCA/AFIP (y CFDI MX) en fase posterior, pero el modelo de datos queda listo.
- **Emails a suscriptores**: UI de SMTP + editor de templates con variables y preview (paridad POS) + **campañas** (selección de tenants por estado/plan, envío batch vía cola `system_emails`, log).
- **Operación**: impersonation por magic link (audit obligatorio) · feature flags por tenant · gestión de staff (support/admin/super_admin) · usuarios globales (suspender, membresías) · notas internas · salud del tenant (último login, actividad, KPIs) · audit con filtros avanzados (fecha/entidad/acción).

**Dependencias:** Fase 4 para precios multi-moneda (parcial — se puede arrancar en paralelo). **Criterio de salida:** dar de alta un cliente por transferencia, regalarle acceso vitalicio a otro, cambiarle el plan a un tercero y mandar una campaña de email — todo desde la UI, todo auditado.

## Fase 6 — UX de planta y Excel-first real 🏭 ✅ (ejecutada 2026-06-06/07, migraciones 0016-0018; pendiente: pase estético transversal)

**Objetivo:** los diferenciadores que hacen que el operario y el bromatólogo lo elijan (audit Gaps 4-8).

- **Diagrama de trazabilidad**: grafo interactivo con React Flow (`@xyflow/react`) + layout dagre — lote PT al centro, ingredientes/lotes MP a la izquierda, despachos/clientes a la derecha (referencia: captura LJ `img/Captura de pantalla 2026-06-06 184549.png`, pero con estética Ninja). Nodos custom glass, colores por tipo de eslabón, zoom/pan, click → detalle, export PNG/PDF. Convive con la vista tabular (que es la regulatoria).
- **Excel import**: por módulo (ingredientes, clientes, proveedores, recetas, stock inicial) — descargar plantilla con formato → subir → preview con validación zod por fila → confirmar → reporte de rechazos descargable. Cierra el ciclo Excel-first (regla dura 9).
- **Builder de planillas v2**: drag & drop con dnd-kit · nuevos tipos de campo (foto, firma touch, hora, checklist) · **colores de planilla por tenant** (primario/secundario en branding, aplicados al PDF — hoy hardcodeados en `lib/utils/pdf.ts`) · duplicar template · vista previa en vivo.
- **Producción completa**: foto del producto (photo_url + upload al bucket, visible en traza pública) · descarga de receta en PDF (desde recetas y desde producción) con branding.
- **Barcode**: escaneo EAN-13/128 por cámara (html5-qrcode o ZXing) para ingreso de stock y búsqueda de lotes; campo barcode en ingredientes; siempre con fallback a tipeo manual.
- **Pase estético transversal**: sweep pantalla por pantalla contra el POS — paddings, jerarquía tipográfica, íconos donde corresponde (regla dura 3). Checklist por pantalla en PR.

**Dependencias:** Fase 4 (labels en PDFs de receta). **Criterio de salida:** demo de 10 minutos: escanear un barcode para ingresar stock, importar clientes desde Excel, producir con foto, abrir el grafo de trazabilidad y exportarlo, imprimir planilla con colores del cliente.

## Fase 7 — IA: rotulado y nutrición asistidos 🤖 ✅ (ejecutada 2026-06-07, migraciones 0019/0022 + add-on autocontratable; pendiente: formato IA en informes)

**Objetivo:** lo que ningún competidor regional tiene — compliance de rótulo generado por IA, por país.

- **`lib/ai`**: abstracción AIProvider (mismo patrón que `lib/billing`) con providers **Gemini y Claude**. **Key de PLATAFORMA únicamente** — se configura desde `/internal` (cifrada, server-side only), el cliente nunca carga su propia key. Selector de provider activo y modelo desde internal.
- **IA como producto**: incluida en planes altos; en planes bajos se compra como **add-on que suma al monto de la suscripción** (impacta `lib/billing`: ajuste del preapproval MP o preapproval adicional). Feature flag `ai_enabled` resuelto por plan + add-on en `lib/billing/limits.ts`. **Metering por tenant** (tokens/llamadas por mes, límite por plan, visible en internal) para controlar costo de la key de plataforma.
- **Tabla nutricional con IA**: desde la fórmula de la receta (ingredientes + cantidades), generar la tabla nutricional completa en el formato regulatorio del país del tenant (Fase 4). Editable antes de guardar — la IA propone, el humano confirma; auditado.
- **Sellos frontales automáticos**: octógonos AR / NOM-051 MX / sellos CL / Nutri-Score calculados desde la tabla nutricional según umbrales legales de cada país (cálculo determinístico donde la ley lo define + IA para casos grises, siempre revisable).
- **Rótulo imprimible en alta calidad**: PDF vectorial del rótulo completo (tabla + sellos + ingredientes + alérgenos + datos legales) con branding, guardado y versionado en la receta.
- **Asistencia en informes**: formato/redacción IA en informes bromatológicos (pendiente declarado de Fase 2).

**Dependencias:** Fase 4 (formatos por país). **Criterio de salida:** cargar una receta, apretar "Generar tabla nutricional", revisar, generar sellos y descargar el rótulo print-ready — en AR y en MX con resultados regulatorios correctos.

## Fase 8 — Ecosistema y escala 🌐

**Objetivo:** del PyME al industrial; ingresos por integraciones.

- **Delivery**: MercadoLibre (self-service primero), PedidosYa, Rappi, **Uber Eats** — catálogo de PT publicable, stock sincronizado. (Veredictos de viabilidad: `docs/09-investigacion-integraciones.md`.)
- **SSO Ninja-Soft POS↔Food**: cuenta única `ninja_accounts`, login compartido, navegación cruzada (preparado desde Fase 0).
- Conector Ninja POS: producción de Food como catálogo vendible en POS.
- Multi-establecimiento real (plan Industria) + dashboard multi-planta.
- Billing internacional: Stripe (requiere entidad — decisión societaria) + PayPal fallback, sobre la interface `BillingProvider` ya existente.
- Extracción `@ninja-soft/ui` (tokens, primitivos, DateRangePicker, tablas).
- HACCP digital, NC + CAPA, gestión documental versionada.

**Criterio de salida:** primer pedido de delivery reflejado en stock; un usuario entra con la misma cuenta a POS y Food; primer cobro internacional.

## Fase 9 — Futuro

GS1/EPCIS + FSMA 204 (USA, compliance 2028-07-20) · facturación ARCA/CFDI automática · modo offline (gap de mercado verificado) · app móvil de planta · marketplace de consultoras (modelo ABR replicado por región).

---

## Orden y paralelización

```
Fase 4 (compliance engine)  ──┬──> Fase 7 (IA)
                              └──> Fase 6 (UX planta — solo PDFs de receta dependen de 4)
Fase 5 (consola interna)    — paralelo a 4 casi entera
Fase 8 (ecosistema)         — después de 4-7
```

Migración La Jamonera: se destraba cuando el cliente entregue datos; entra en cualquier punto ≥ Fase 4.

## Hitos transversales

| Hito | Fase |
|---|---|
| Tenant no-argentino operando limpio | 4 |
| Operación comercial 100% desde /internal | 5 |
| Demo "wow" de planta (grafo + barcode + Excel) | 6 |
| Rótulo IA print-ready multi-país | 7 |
| La Jamonera migrada | bloqueado por datos |
| SSO POS↔Food | 8 |
