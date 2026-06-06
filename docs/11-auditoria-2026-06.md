# Auditoría integral — junio 2026

Auditoría completa del producto contra la visión real: SaaS world-ready de trazabilidad bromatológica, no un clon de La Jamonera. Origen: revisión de Lucas (2026-06-06). Este doc es la fuente de los gaps que alimentan el roadmap reescrito (`docs/07-roadmap.md`).

## Veredicto general

El núcleo operativo (trazabilidad, stock, producción, despacho, calidad, planillas, billing MP básico) está sólido y con buena arquitectura (RLS, módulos, design system). Pero el producto hoy es **Argentina-first con disfraz de world-ready**, el **panel interno es un visor, no una consola de operación SaaS**, y faltan los diferenciadores de UX que el mercado espera (diagrama de trazabilidad, barcode, Excel import, IA).

---

## Gap 1 — Internacionalización rota (CRÍTICO)

Existe infraestructura buena (`lib/globalization/countries.ts` con COUNTRY_PROFILES, `tenant_operating_profiles` en migración 0007) pero los puentes a la UI/lógica están incompletos: un tenant de México ve octógonos argentinos, campos RNE/RNPA, sello ABR y paga en ARS.

| Problema | Ubicación | Severidad |
|---|---|---|
| `FRONT_LABELS` solo octógonos Ley 27.642 | `modules/recipes/schemas.ts:27-36` | CRÍTICO |
| `currency_id: "ARS"` hardcodeado en preapproval MP | `lib/billing/mercadopago.ts:135` | CRÍTICO |
| `DEFAULT_COUNTRY_CODE = "AR"` como fallback | `lib/globalization/countries.ts:52` | CRÍTICO |
| `sello_abr_enabled` booleano ARG-only en branding | `tenant_branding` + `components/settings/BrandingCard.tsx` | ALTO |
| RNE/RNPA/RUCA/UTA/URA como columnas fijas | `migrations/0001_core.sql` (establishments, recipes, vehicles, suppliers) | ALTO |
| `Intl.NumberFormat("es-AR")` fijo en PDFs/exports | `modules/planillas/generators.ts:40`, `modules/dispatch/remito.ts:32`, `modules/trace/exports.ts:67` | ALTO |
| `compliance_frameworks` default `['CAA','RNE','RNPA','BPM','POES']` sin override por país | `migrations/0007_global_operations.sql:22` | ALTO |
| `frozen_extra_days` default 60 (regla CAA) sin variante por país | `migrations/0001_core.sql:386` | ALTO |
| `cuit` como columna en vez de `tax_id` genérico | tenants, suppliers, tenant_branding | MEDIO |
| Sistemas de rotulado de otros países (NOM-051 MX, sellos CL Ley 20.606, ANVISA BR, Nutri-Score EU, FDA US): **0% implementados** | — | CRÍTICO |

**Solución de diseño:** motor de compliance por país — `regulatory_labels` (sistema + valores por país), `regulatory_permits` (tabla genérica permit_type/number/expiry/attachment reemplaza columnas RNE/RNPA/UTA/URA), `regulatory_seals` (reemplaza sello_abr_enabled), formatters que leen locale/currency del operating profile, onboarding que OBLIGA país. Esfuerzo estimado: ~74 h.

## Gap 2 — Panel interno: visor, no consola (CRÍTICO comercial)

Food internal hoy: tenants (estado + extender trial), log de pagos, log de emails, editor de precios de planes, audit simple. Contra el POS faltan:

| Falta | Referencia POS | Esfuerzo |
|---|---|---|
| Cobro de suscripciones: generar link de pago MP desde la ficha del tenant | `app/internal/tenants/[id]` POS | M |
| Pago manual por transferencia: registrar pago, activar/extender suscripción a mano | BillingCard POS | M |
| Acceso vitalicio / cortesía (suscripción sin cobro, flag explícito) | no existe en ninguno — diseñar | M |
| Cambiar plan de un tenant desde internal | no existe | M |
| Facturación a suscriptores (ARCA/AFIP; CFDI México a futuro) | no existe en ninguno | L |
| Emails a suscriptores: SMTP UI + editor de templates + envío de prueba + campañas | `app/internal/emails` POS | M |
| Impersonation (magic link para entrar como el dueño) | POS tenants/[id]:327-397 | M |
| Feature flags por tenant | POS tenants/[id]:467-512 | S |
| Gestión de staff interno (niveles support/admin/super_admin) | `app/internal/staff` POS | S |
| Usuarios globales (listar, suspender, membresías) | `app/internal/usuarios` POS | M |
| Notas internas por tenant | POS | S |
| Salud operativa del tenant (último login, actividad, KPIs) | POS | S |
| Audit con filtros avanzados (fecha, entidad, acción) | POS | S |

## Gap 3 — IA: 0%

- Sin config de API keys (Gemini/Claude) en internal.
- Tabla nutricional 100% manual (5 campos JSONB).
- Sin generación de octógonos/sellos/Nutri-Score asistida.
- Decisión (Lucas, 2026-06-06): **API key de PLATAFORMA, nunca del cliente**. Keys de Claude/Gemini se configuran solo desde `/internal` (cifradas, server-side only). El cliente jamás carga su propia key. Comercialmente: IA **incluida en planes altos**, y en planes bajos se vende como **add-on que suma al monto de la suscripción**. Requiere metering de uso por tenant (control de costo) y feature flag `ai_enabled` resuelto por plan + add-on. Abstracción `lib/ai` (interface AIProvider, mismo patrón que `lib/billing`).

## Gap 4 — Trazabilidad sin diagrama

Hoy: vista tabular 3 columnas (correcta regulatoriamente) pero sin grafo. Referencia visual: captura `img/Captura de pantalla 2026-06-06 184549.png` (sistema LJ: grafo de nodos lote → ingredientes → despachos). Sin reactflow/d3/dagre en deps.
**Decisión:** React Flow (`@xyflow/react`) + layout dagre, nodos custom con estética del design system, export PNG/PDF.

## Gap 5 — Excel import: 0%

Solo exports. Sin plantillas descargables, sin upload, sin validación/preview. Crítico: los clientes viven en Excel.
**Diseño:** por módulo (ingredientes, clientes, proveedores, recetas, stock inicial) — descargar plantilla → subir → preview con errores por fila → confirmar import. zod por fila, reporte de rechazos descargable.

## Gap 6 — Builder de planillas: funcional pero duro

- Sin drag & drop (botones ↑↓) → migrar a dnd-kit.
- Tipos de campo: number/text/bool/select/temperature. Faltan: foto, firma touch, hora, checklist múltiple.
- Colores de PDF hardcodeados (`lib/utils/pdf.ts:10-17`) → paleta por tenant (branding ya tiene logo; agregar color primario/secundario de planilla).
- Logo en PDF: ya funciona.

## Gap 7 — Producción incompleta

- Sin foto del producto en producción (schema no tiene photo_url).
- Sin descarga de receta en PDF desde producción ni desde recetas.
- Nutrición manual (ver Gap 3).

## Gap 8 — Barcode: 0%

Solo QR de traza. Falta escaneo de códigos de barra (EAN-13/128) para ingreso de stock y búsqueda rápida. Librería candidata: `html5-qrcode` o ZXing WASM (cámara) — opcional por tenant, debe degradar a tipeo manual.

## Gap 9 — Delivery / ecosistema (fase posterior, confirmado en visión)

PedidosYa, Rappi, **Uber Eats** (agregar — no estaba), MercadoLibre delivery. Mantener en fase de ecosistema, después de robustecer el core.

## Gap 10 — Estética

Paddings inconsistentes en textos, íconos faltantes donde corresponde. Requiere pase de pulido sistemático pantalla por pantalla contra el POS (regla dura 3). Sin inventario detallado aún — hacer sweep dedicado.

---

## Lo que está bien (no tocar, no regresionar)

- RLS multi-tenant + 88 tests de integración verdes.
- RPCs atómicas (create_stock_entry, complete_production, create_dispatch, submit_form).
- Inmutabilidad regulatoria (form_submissions, public_traces) con triple defensa.
- Recall forward/backward con despachos anulados visibles.
- Design system 6 temas, exports Excel con branding, planillas PDF con QR.
- Billing MP: webhook idempotente + reconciliación diaria + límites por plan soft-block.
- Editor de precios de planes en internal (existe — falta el resto de la consola).
