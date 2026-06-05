# Roadmap — Ninja Food

MVP aprobado: **paridad Jamonera completa + billing MP + panel interno**. Cada fase tiene objetivo, contenido, dependencias y criterio de salida.

---

## Fase 0 — Fundaciones (≈2-3 semanas de agente)

**Objetivo:** repo ejecutable con identidad visual y multi-tenancy operativos.

- Scaffolding (este repo): Next.js + Tailwind + Supabase + CI/CD Vercel.
- Migración inicial: núcleo SaaS (tenants, users, plans, subscriptions, audit, emails) + RLS + tests RLS.
- Design system: 6 temas, componentes ui/ portados del POS, AppShell.
- Auth completo: signup → create_tenant → trial, login, recover, roles.
- Landing pública con identidad Ninja Food + sello ABR.

**Dependencias:** acceso al repo POS para portar componentes. **Criterio de salida:** `pnpm dev` levanta, signup crea tenant aislado (test RLS verde), deploy automático en Vercel funcionando, UI con calidad visual POS.

## Fase 1 — MVP operativo (paridad Jamonera, parte 1)

**Objetivo:** cadena de trazabilidad completa usable por un cliente real.

- Ingredientes + familias + unidades.
- Stock: ingresos con lotes, vencimientos (regla congelados CAA), alertas, movimientos append-only.
- Recetas completas (RNPA, octógonos, nutrición, sustitutos, vida útil/aging).
- Producción: consumo de lotes, reservas, borradores, ID configurable, responsable con PIN.
- Trazabilidad pública QR + página `t/[slug]` con branding + sello ABR.
- Planillas PDF (individual/masiva/semanal) + exports Excel.

**Dependencias:** Fase 0. **Criterio de salida:** flujo MP→producción→QR demo-able de punta a punta; export Excel de cada módulo; paridad verificada contra checklist de LJ (doc 02 módulos 1, 2, 4, 5).

## Fase 2 — MVP completo (paridad Jamonera, parte 2 + billing)

**Objetivo:** producto vendible. La Jamonera puede migrar.

- Despacho: clientes, vehículos UTA/URA, import/export XLSX, vínculo lote-despacho.
- Calidad: informes bromatológicos (editor + IA + adjuntos + notificación email) y análisis de laboratorio.
- Dashboard del tenant (KPIs MVP).
- Compliance: RNE establecimiento/proveedores, panel de vencimientos.
- Billing MP: checkout preapproval, webhooks, estados, límites por plan.
- Panel interno completo (tenants, staff, audit, emails, pagos).
- Sistema de emails (templates + cola + SMTP).
- **Hito comercial: migración de La Jamonera como tenant 1** + 2-3 clientes ABR como early adopters.

**Dependencias:** Fase 1. **Criterio de salida:** Definition of Done del MVP — un cliente se registra, paga con MP, opera todo el ciclo y La Jamonera está migrada sin pérdida funcional.

## Fase 3 — v1: diferenciación

**Objetivo:** superar a Trazal en features, no solo igualarlo.

- Builder de planillas configurables (BPM/POES/PCC/custom) con firma PIN, semáforo y acción correctiva + programación/recordatorios.
- Recall/retiro de mercado (CAA Res. 2/2023).
- Árbol visual de trazabilidad.
- Costos por lote/producción + KPIs v1.
- Rótulo generador/validador (CAA Cap. V) + RUCA.
- API pública v1 (lectura) + webhooks salientes + OpenAPI.
- Auditoría visible para el owner.
- **Extracción de `@ninja-soft/ui`** (paquete compartido POS↔Food): tokens, primitivos, DateRangePicker, tablas.

**Criterio de salida:** tabla comparativa vs Trazal (doc 01) con ventaja en ≥6 filas; primer cliente usando API.

## Fase 4 — v2: escala y ecosistema

**Objetivo:** del PyME al industrial; primeros pasos internacionales.

- Multi-establecimiento real (plan Industria) + dashboard multi-planta.
- Integraciones: MercadoLibre (primera: API self-service), luego PedidosYa y Rappi (partner).
- **SSO Ninja-Soft (hito POS↔Food):** cuenta única, `ninja_accounts` federada, login compartido, navegación cruzada POS↔Food, tenant linkeable entre productos. Preparado desde Fase 0 (claims y convención de identidad — doc 04 §4).
- Conector Ninja POS: producción de Food visible como catálogo vendible en POS.
- Billing internacional: Stripe (entidad vía Atlas — decisión societaria previa) + PayPal fallback.
- HACCP digital, NC + CAPA, auditorías, gestión documental versionada.
- i18n + multi-moneda; código de barras/QR en planta; ubicaciones de depósito.

**Criterio de salida:** un usuario entra con la misma cuenta a POS y Food; primer cobro internacional; primer tenant multi-planta.

## Fase 5 — futuro

GS1/EPCIS + FSMA 204 (mercado USA, compliance 2028-07-20), facturación ARCA/AFIP, Uber Eats, modo offline (gap de mercado verificado: solo SafetyCulture lo tiene), app móvil de planta, marketplace de consultoras (modelo ABR replicado por región).

---

## Hitos transversales

| Hito | Fase |
|---|---|
| Identidad visual + design system compartido | 0 (temas) → 3 (paquete) |
| Preparación SSO (claims, identidad pivote) | 0 |
| SSO POS↔Food operativo | 4 |
| Aval ABR visible en producto | 0 (sello) → 3 (auditorías) |
| La Jamonera migrada | 2 |
