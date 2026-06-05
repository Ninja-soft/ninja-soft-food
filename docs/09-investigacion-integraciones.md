# Investigación web — integraciones, pagos y normativa (con fuentes)

Fecha: 2026-06-04. Resumen ejecutivo con veredictos; cada afirmación verificada en la URL citada.

---

## 1. APIs de delivery / venta — veredictos de viabilidad

| Plataforma | Veredicto | Acceso | Capacidades | Doc oficial |
|---|---|---|---|---|
| **MercadoLibre / Envíos / Flex** | ✅ VIABLE — API pública self-service | Crear app en DevCenter, validar titular. Sin partner manager | Publicar items, stock/variaciones, precios, ME2, Flex (same/next-day), webhooks por topics. OAuth code + refresh (token 6h) | https://developers.mercadolibre.com.ar/ |
| **PedidosYa** | ✅ VIABLE — API partner (gated) | API keys vía account manager / Partner Portal ("Shop Integrations Plugin") | Catálogo (bulk async), órdenes en tiempo real vía webhook, promos, estado del local, picking. OAuth client credentials | https://developer.pedidosya.com/ |
| **Rappi** | ✅ VIABLE — alta como "ally" (gated) | Contacto directo → credenciales dev → prod | Menús, órdenes (aceptar/rechazar/tomar/listo), stores, availability, webhooks, scheduling | https://dev-portal.rappi.com/ |
| **Uber Eats** | ⚠️ VIABLE pero restrictivo | **NDA + licencia de API + partner manager** + acuerdo comercial | Stores, menús jerárquicos, órdenes (accept/deny, BYOC), reportes; scopes eats.* | https://developer.uber.com/docs/eats/introduction |
| **Deliverect** (agregador) | ⚠️ Posible atajo Rappi+PeYa — **cobertura AR a confirmar** con su comercial | Contrato Deliverect | Two-way Rappi/PedidosYa/UberEats → un solo conector | https://www.deliverect.com/integrations |
| **Otter** (agregador) | ❌ NO confirmado para AR (sin PedidosYa/Rappi listados) | — | — | https://www.tryotter.com/ |

**Orden recomendado (fase 4):** MercadoLibre → PedidosYa → Rappi → (evaluar Deliverect) → Uber Eats último.

## 2. Pasarelas de pago — veredictos de recurrencia

| Pasarela | Recurrencia nativa | Empresa AR cobra | Rol en Ninja Food | Doc |
|---|---|---|---|---|
| **Mercado Pago** | ✅ preapproval / preapproval_plan | ✅ ARS nativo | **Rail principal (MVP)**. Webhooks: `subscription_preapproval`, `subscription_authorized_payment`, `payments` (thin payload → re-fetch) | https://www.mercadopago.com.ar/developers/en/docs/subscriptions/landing |
| **Stripe** | ✅ Billing (el mejor) | ❌ AR no es país de cuenta → requiere entidad extranjera (Atlas ~USD 500 + banco como cuello de botella) | Rail internacional (v2, decisión societaria previa) | https://stripe.com/global · https://docs.stripe.com/atlas |
| **PayPal** | ✅ Subscriptions API v1 | ⚠️ Cuenta AR limitada a cobros internacionales, sin conversión a ARS, retiro con fricción | Fallback internacional (v2) | https://developer.paypal.com/docs/api/subscriptions/v1/ |
| **Payoneer** | ❌ NO es gestor de suscripciones (su "recurring" es scheduling manual; Checkout es one-time con primitivas MIT sin motor de planes/dunning) | — | Fuera de billing. Solo tesorería/cobro B2B manual enterprise | https://checkoutdocs.payoneer.com/ |

Arquitectura resultante (implementada en `lib/billing/` — doc 04 §5): modelo agnóstico, estados canónicos, normalizador de webhooks, idempotencia por `provider_event_id`, reconciliación diaria, webhook como fuente de verdad del cobro.

## 3. Marco normativo — síntesis con implicancia de producto

| Norma | Exigencia clave | Feature que la cubre | Fuente |
|---|---|---|---|
| **CAA Art. 1415 (Res. Conj. 2/2023)** | Trazabilidad planificada y documentada en todas las etapas + plan de retiro secuenciado | Cadena lote-a-lote + módulo recall (v1) | https://www.boletinoficial.gob.ar/detalleAviso/primera/281798/20230228 |
| **CAA Cap. II (BPM)** | BPM obligatorias; establecimientos deben garantizar trazabilidad y sistema de retiro | Checklist BPM + planillas configurables | https://www.argentina.gob.ar/anmat/codigoalimentario |
| **CAA Cap. V (rotulación)** | Lote + vencimiento (día/mes ≤3m; mes/año >3m) + RNE + RNPA en rótulo | Generador/validador de rótulo (v1) + octógonos Ley 27.642 (MVP, heredado LJ) | https://alimentosargentinos.magyp.gob.ar/contenido/marco/CAA/capitulospdf/Capitulo_V.pdf |
| **RNE / RNPA (ANMAT/INAL, SIFeGA)** | Cadena HM→RNE→RNPA antes de operar/comercializar; monografía DDJJ, protocolos, rótulo | Entidades establishments/recipes con estados, bloqueo lógico de prerequisitos y alertas de vencimiento | https://www.argentina.gob.ar/anmat/regulados/alimentos/alimentos-autorizados-establecimientos-habilitados |
| **ASSAL (Santa Fe — cliente PoC)** | Registro vía SEG (Disp. 15/2018); auditoría obligatoria para RNE | Adaptador jurisdiccional + módulo auditorías (v2) | https://www.assal.gov.ar/ |
| **SENASA (Dec. 4238/68 + RUCA)** | Matrícula RUCA, manuales BPM/HACCP, plan de trazabilidad, one-up/one-down | Campo RUCA (v1) + repositorio documental (v2) + trazabilidad (MVP) | https://digesto.senasa.gob.ar/ |
| **BPM/POES/MIP/HACCP (práctica)** | Planillas: temperaturas, limpieza por área, plagas, recepción MP, capacitación, PCC | Builder de planillas (v1) con firma, semáforo y acción correctiva | https://alimentosargentinos.magyp.gob.ar/bpa/bibliografia/Gestion_Calidad_Agroalimentaria_2016.pdf |
| **Codex CAC/GL 60-2006** | one-step-back / one-step-forward | Modelo de datos ya lo cumple | https://www.fao.org/fao-who-codexalimentarius/ |
| **GS1 (GTIN/GLN/SSCC, EPCIS)** | Identificación estándar de lotes para retail/export | v2/futuro | https://www.gs1.org/standards/gs1-global-traceability-standard/current-standard |
| **FDA FSMA 204** | TLC + CTE/KDE, plan de trazabilidad, registros 2 años, entrega a FDA ≤24h. **Compliance 2028-07-20** | Modo world-ready (futuro) | https://www.fda.gov/food/food-safety-modernization-act-fsma/fsma-final-rule-requirements-additional-traceability-records-certain-foods |
| **ISO 22000 / FSSC 22000 v6** | PRP + HACCP + trazabilidad de lote, retención definida, producto no conforme | HACCP (v2) + retención configurable | https://www.iso.org/standard/65464.html |

### Checklist de aval ABR (resumen — el software debe cubrir)

- [x] (MVP) RNE/RNPA con vencimientos y cadena de prerequisitos · trazabilidad one-up/one-down · lote en todo el ciclo · registros atribuibles (firma PIN) e inmutables · alertas de vencimiento · export para inspección
- [ ] (v1) Recall documentado · rótulo CAA Cap. V · RUCA · planillas BPM/POES/MIP/PCC programadas con acción correctiva
- [ ] (v2) Auditorías con actas y plan de acción · HACCP completo · NC+CAPA · gestión documental versionada

> Investigación completa de cada agente (texto íntegro con todas las fuentes) disponible en los reportes de exploración de la sesión 2026-06-04. Este doc es la síntesis operativa.
