# Catálogo de funcionalidades — Ninja Food

Regla de oro: **el 100% de lo que hace La Jamonera se conserva**, reordenado y mejorado. Después se suma lo nuevo.

Etiquetas:

- **Origen**: `LJ` (heredada de La Jamonera) · `NUEVA` (no existe en LJ)
- **Prioridad**: `MVP` (fase 1) · `v1` · `v2` · `futuro`

El MVP aprobado = paridad Jamonera completa + billing MP + panel interno.

---

## Módulo 1 — Trazabilidad

| Feature                                                                       | Origen | Prioridad | Rediseño respecto a LJ                                                                                              |
| ----------------------------------------------------------------------------- | ------ | --------- | ------------------------------------------------------------------------------------------------------------------- |
| Trazabilidad lote-a-lote (ingreso → producción → despacho)                    | LJ     | MVP       | De estructura ad-hoc en Firebase a modelo relacional `lots` / `lot_consumptions` con integridad referencial         |
| ID de producción único configurable (prefijo por tenant)                      | LJ     | MVP       | `PROD-LJ-` hardcodeado → secuencia por tenant con prefijo configurable                                              |
| Lote de producto auto/manual con tokens configurables (remito, fecha, siglas) | LJ     | MVP       | Generador de tokens se vuelve entidad `lot_code_templates` por tenant                                               |
| Trazabilidad pública por URL + QR                                             | LJ     | MVP       | `public_traces` con slug por tenant, página pública con branding del tenant + sello ABR                             |
| QR imprimible en 4 tamaños (80x40, 50x25, 80x25, 100x35 mm)                   | LJ     | MVP       | Igual, tamaños configurables por tenant                                                                             |
| Vista de árbol de trazabilidad (visual de punta a punta)                      | NUEVA  | v1        | Grafo navegable: MP → lotes → producción → despachos → clientes                                                     |
| Recall / retiro de mercado (CAA Res. Conj. 2/2023)                            | NUEVA  | v1        | Dado un lote: clientes afectados, cantidades, acta de retiro, export. Obligatorio CAA, nadie local lo resuelve bien |
| Codificación GS1 (GTIN + lote, GS1-128)                                       | NUEVA  | v2        | Para clientes que exportan o venden a retail                                                                        |
| Eventos EPCIS export (world-ready, FSMA 204)                                  | NUEVA  | futuro    | TLC/CTE/KDE para mercado USA (compliance 2028-07-20)                                                                |

## Módulo 2 — Planillas / Documentación (Excel-first)

| Feature                                                                                                                           | Origen | Prioridad | Rediseño                                                                                                                                                                                              |
| --------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Planilla de producción individual (PDF)                                                                                           | LJ     | MVP       | Template engine por tenant (logo, campos), no layout fijo                                                                                                                                             |
| Planillas masivas (varias producciones en un documento)                                                                           | LJ     | MVP       | Igual + cola de generación para volúmenes grandes                                                                                                                                                     |
| Planilla semanal de producción                                                                                                    | LJ     | MVP       | Igual, rango configurable                                                                                                                                                                             |
| Planilla semanal de ingresos configurable                                                                                         | LJ     | MVP       | Se generaliza en el builder de planillas                                                                                                                                                              |
| Export Excel: inventario, ingresos, producciones, despachos                                                                       | LJ     | MVP       | exceljs con estilos del design system, columnas configurables                                                                                                                                         |
| Import XLSX de despachos con reglas por producto                                                                                  | LJ     | MVP       | Wizard de mapeo de columnas + validación con preview de errores                                                                                                                                       |
| Historial de importaciones                                                                                                        | LJ     | MVP       | Igual + diff de qué creó cada import (permite revertir)                                                                                                                                               |
| Impresión de catálogo de ingredientes                                                                                             | LJ     | MVP       | Igual                                                                                                                                                                                                 |
| **Builder de planillas configurables** (campos, frecuencias, responsables, límites, semáforo cumple/no-cumple, acción correctiva) | NUEVA  | v1        | Generaliza todas las planillas BPM/POES: temperatura de cámaras, limpieza por área, plagas (MIP), recepción de MP, capacitaciones. Supera las "planillas personalizadas" limitadas por plan de Trazal |
| Programación de planillas (frecuencia, recordatorios, vencidas)                                                                   | NUEVA  | v1        | Cron + notificaciones email                                                                                                                                                                           |
| Export de toda la trazabilidad a planillas                                                                                        | NUEVA  | v1        | Requisito duro del producto: dump completo navegable en Excel                                                                                                                                         |
| Gestión documental (manuales BPM/HACCP versionados)                                                                               | NUEVA  | v2        | Storage + versiones + vencimiento de documentos                                                                                                                                                       |

## Módulo 3 — BPM / POES / Compliance

| Feature                                                                                                 | Origen | Prioridad | Rediseño                                                             |
| ------------------------------------------------------------------------------------------------------- | ------ | --------- | -------------------------------------------------------------------- |
| RNE del establecimiento (número, vencimiento, adjunto, historial)                                       | LJ     | MVP       | Entidad `establishments` (multi-planta ready) con estados y alertas  |
| RNE de proveedores con panel de pendientes                                                              | LJ     | MVP       | Entidad `suppliers` con compliance score                             |
| RNPA por receta (número, vencimiento, PDF, exención mostrador)                                          | LJ     | MVP       | Igual + cadena de prerequisitos (HM → RNE → RNPA) con bloqueo lógico |
| Filtros RNPA (sin registro, vence <6m, vence <60d)                                                      | LJ     | MVP       | Igual + dashboard de compliance                                      |
| Transporte habilitado UTA/URA                                                                           | LJ     | MVP       | Entidad `vehicles` con vencimientos y alertas                        |
| Regla CAA congelados (+60 días, PDF informativo)                                                        | LJ     | MVP       | Motor de reglas de vencimiento por categoría                         |
| Octógonos Ley 27.642 (exceso azúcar/sodio/grasas/cafeína/edulcorante)                                   | LJ     | MVP       | Igual, en ficha de receta                                            |
| Info nutricional por receta                                                                             | LJ     | MVP       | Igual                                                                |
| Adjuntos BPM/POES por receta                                                                            | LJ     | MVP       | Igual                                                                |
| Matrícula RUCA (establecimientos cárnicos SENASA)                                                       | NUEVA  | v1        | Campo + vencimiento + alerta                                         |
| Generador/validador de rótulo (CAA Cap. V: lote, vencimiento según duración, RNE, RNPA, contenido neto) | NUEVA  | v1        | Gap total del mercado local                                          |
| Plan HACCP digital (peligros, PCC, límites críticos, monitoreo)                                         | NUEVA  | v2        | Compite con FoodDocs/Inoqua                                          |
| No conformidades + CAPA (acciones correctivas/preventivas)                                              | NUEVA  | v2        | Supera la NC básica de Trazal                                        |
| Módulo de auditorías (actas, hallazgos, plan de acción) — alineado ASSAL                                | NUEVA  | v2        | Con ABR como auditor sugerido                                        |
| Sello de aval ABR (en app, trazas públicas y reportes)                                                  | NUEVA  | MVP       | Diferencial comercial: logo + leyenda "Avalado técnicamente por ABR" |

## Módulo 4 — Producción

| Feature                                                          | Origen | Prioridad | Rediseño                                                          |
| ---------------------------------------------------------------- | ------ | --------- | ----------------------------------------------------------------- |
| Iniciar producción desde receta                                  | LJ     | MVP       | Igual                                                             |
| Asignación de lotes por ingrediente con stock visible            | LJ     | MVP       | Igual + sugerencia FEFO (primero lo que vence)                    |
| Sustitutos de ingredientes                                       | LJ     | MVP       | Igual                                                             |
| Stock infinito (caja chica sin trazabilidad)                     | LJ     | MVP       | Igual, marcado visualmente en la traza                            |
| Responsable de producción (con preferidos por receta)            | LJ     | MVP       | Igual                                                             |
| Cantidad producida + rendimiento                                 | LJ     | MVP       | + % de rendimiento vs teórico (Trazal lo tiene, LJ no lo calcula) |
| Vencimiento calculado (envasado + vida útil + aging + congelado) | LJ     | MVP       | Motor de fechas unificado                                         |
| Reservas de ingredientes con TTL                                 | LJ     | MVP       | Igual                                                             |
| Borradores de producción                                         | LJ     | MVP       | Igual                                                             |
| Historial filtrable + búsqueda                                   | LJ     | MVP       | Igual + paginación server-side                                    |
| Mínimos de producción (global y por receta)                      | LJ     | MVP       | Igual                                                             |
| Costos por lote / por producción                                 | NUEVA  | v1        | Trazal lo tiene; requiere precio en ingresos de stock             |
| Órdenes de producción planificadas (calendario)                  | NUEVA  | v2        | Usa el calendario del POS                                         |

## Módulo 5 — Stock / Insumos

| Feature                                                         | Origen | Prioridad | Rediseño                                                    |
| --------------------------------------------------------------- | ------ | --------- | ----------------------------------------------------------- |
| Ingredientes con familias jerárquicas, fotos, unidades          | LJ     | MVP       | Igual (Supabase Storage)                                    |
| Unidades de medida configurables (Kg, gr, ml, lts, un, etc.)    | LJ     | MVP       | Catálogo por tenant con base global                         |
| Flag perecedero / no perecedero                                 | LJ     | MVP       | Igual                                                       |
| Ingresos con lote, factura adjunta, proveedor, RNE, vencimiento | LJ     | MVP       | Igual                                                       |
| Alertas stock bajo (umbral global + por ingrediente)            | LJ     | MVP       | Igual + email                                               |
| Alertas vencimiento próximo (días configurables)                | LJ     | MVP       | Igual + email                                               |
| Egresos automáticos al producir                                 | LJ     | MVP       | Igual, transaccional en Postgres                            |
| Flag uso interno empresa                                        | LJ     | MVP       | Igual                                                       |
| Historial de movimientos con filtros                            | LJ     | MVP       | `stock_movements` append-only (patrón POS)                  |
| Costo de ingreso (precio por lote)                              | NUEVA  | v1        | Habilita módulo de costos                                   |
| Ubicaciones de depósito (cámaras, estanterías)                  | NUEVA  | v2        | Trazal tiene "control por ubicación"                        |
| Lectura de código de barras / QR en planta                      | NUEVA  | v2        | Trazal lo cobra en su tier más caro; acá entra en Industria |
| Pedidos a depósito / órdenes de compra a proveedores            | NUEVA  | v2        | —                                                           |

## Módulo 6 — Ventas / Despacho / Delivery

| Feature                                                          | Origen | Prioridad | Rediseño                                                                                                        |
| ---------------------------------------------------------------- | ------ | --------- | --------------------------------------------------------------------------------------------------------------- |
| Despacho de productos terminados (cliente, vehículo, cantidades) | LJ     | MVP       | Igual, vinculado a lote (recall-ready)                                                                          |
| Clientes (CRUD)                                                  | LJ     | MVP       | Igual + cuenta corriente en v2 (patrón POS)                                                                     |
| Vehículos UTA/URA                                                | LJ     | MVP       | Igual                                                                                                           |
| Localidades de reparto                                           | LJ     | MVP       | Configurable por tenant (no hardcodear Rosario)                                                                 |
| Import/export XLSX de despachos                                  | LJ     | MVP       | Igual                                                                                                           |
| Índice de producto disponible para despacho                      | LJ     | MVP       | Igual                                                                                                           |
| Remito de despacho PDF                                           | NUEVA  | v1        | —                                                                                                               |
| Integración MercadoLibre (publicaciones, stock, Flex)            | NUEVA  | v2        | API pública self-service verificada ([developers.mercadolibre.com.ar](https://developers.mercadolibre.com.ar/)) |
| Integración PedidosYa (catálogo, órdenes, webhooks)              | NUEVA  | v2        | Viable vía partner ([developer.pedidosya.com](https://developer.pedidosya.com/))                                |
| Integración Rappi (menús, órdenes)                               | NUEVA  | v2        | Viable vía alta de ally ([dev-portal.rappi.com](https://dev-portal.rappi.com/))                                 |
| Integración Uber Eats                                            | NUEVA  | futuro    | Acceso restrictivo: NDA + licencia + partner manager                                                            |
| Conexión Ninja POS (vender producción desde el POS)              | NUEVA  | v2        | Ver roadmap: hito POS↔Food                                                                                      |

## Módulo 7 — Calidad (Informes + Análisis)

| Feature                                                              | Origen | Prioridad | Rediseño                                                   |
| -------------------------------------------------------------------- | ------ | --------- | ---------------------------------------------------------- |
| Informes bromatológicos con editor enriquecido                       | LJ     | MVP       | WYSIWYG sobre Tiptap o similar (no contenteditable a mano) |
| Importancia sanitaria 0-100 con categorías                           | LJ     | MVP       | Igual (Excelente → Crítico)                                |
| Formato con IA del informe                                           | LJ     | MVP       | Edge Function con Claude API                               |
| Adjuntos múltiples + visor de imágenes con zoom                      | LJ     | MVP       | Supabase Storage + visor del design system                 |
| Notificación por email a usuarios seleccionados                      | LJ     | MVP       | Sistema de emails del POS                                  |
| Análisis de laboratorio (8 tipos, muestra, laboratorio, conformidad) | LJ     | MVP       | Igual + catálogo de laboratorios por tenant                |
| Filtros por tipo, fecha, búsqueda full-text                          | LJ     | MVP       | Postgres full-text search                                  |
| Comparativa de análisis en el tiempo (tendencias por tipo)           | NUEVA  | v1        | Gráficos de conformidad histórica                          |

## Módulo 8 — Reportes / KPIs

| Feature                                                                          | Origen | Prioridad |
| -------------------------------------------------------------------------------- | ------ | --------- |
| Dashboard: producción en kg por período (barras/línea/dona)                      | LJ     | MVP       |
| Cards de compliance: último informe, RNE pendientes, RNPA por vencer, transporte | LJ     | MVP       |
| KPIs de stock: rotación, mermas, próximos a vencer                               | NUEVA  | v1        |
| KPIs de calidad: conformidad promedio, NC abiertas, tiempo de resolución         | NUEVA  | v1        |
| KPIs de costos: costo por kg producido, por receta                               | NUEVA  | v1        |
| Reportes exportables programados (email semanal)                                 | NUEVA  | v2        |
| Dashboard comparativo multi-planta                                               | NUEVA  | v2        |

## Módulo 9 — Administración / Suscripciones (calcado POS)

| Feature                                                                                   | Origen               | Prioridad |
| ----------------------------------------------------------------------------------------- | -------------------- | --------- |
| Multi-tenant con RLS, tenant switching para staff                                         | NUEVA (patrón POS)   | MVP       |
| Roles por tenant: owner, manager, operator, viewer                                        | NUEVA (POS adaptado) | MVP       |
| Usuarios operativos con foto, puesto, PIN para firma de planillas                         | LJ                   | MVP       |
| Suscripciones MP (preapproval, webhooks, trial 14 días)                                   | NUEVA (POS)          | MVP       |
| Panel interno: tenants, suscripciones, staff, audit, emails, pagos                        | NUEVA (POS)          | MVP       |
| Límites por plan aplicados en app (establecimientos, usuarios, recetas, producciones/mes) | NUEVA (POS)          | MVP       |
| Feature flags por tenant                                                                  | NUEVA (POS)          | MVP       |
| Branding por tenant (logo en planillas, QR público, emails)                               | LJ parcial           | MVP       |
| Billing internacional (Stripe vía entidad extranjera, PayPal fallback)                    | NUEVA                | v2        |
| SSO cuenta única Ninja-Soft (POS↔Food)                                                    | NUEVA                | v2        |

## Módulo 10 — Integraciones / API

| Feature                                                                                 | Origen | Prioridad |
| --------------------------------------------------------------------------------------- | ------ | --------- |
| API pública REST (lectura de trazabilidad, stock, producciones) con API keys por tenant | NUEVA  | v1        |
| Webhooks salientes (producción creada, stock bajo, lote vencido)                        | NUEVA  | v1        |
| API de escritura (ingresos de stock, despachos)                                         | NUEVA  | v2        |
| Integración contable/facturación (ARCA/AFIP factura electrónica)                        | NUEVA  | futuro    |
| i18n completo + multi-moneda                                                            | NUEVA  | v2        |

---

## Resumen de conteo

- **Heredadas de La Jamonera: 78 features — todas conservadas** (67 en MVP, resto v1).
- **Nuevas: 36 features** (5 MVP, 13 v1, 13 v2, 5 futuro).
- El MVP completo = La Jamonera multi-tenant y mejorada + suscripciones + panel interno + sello ABR.

## Actualizacion global

- Configuracion operativa por pais: locale, moneda, zona horaria, impuestos,
  unidades, autoridades alimentarias, idiomas de etiqueta y frameworks
  regulatorios por tenant.
- Base inicial para vender fuera de Argentina: LATAM, Norteamerica, Europa,
  Oceania, Africa y Asia, con billing providers sugeridos por mercado y campos
  de trazabilidad adaptables.
