# Planes de suscripción — Ninja Food

Decisión aprobada: **keys internas del POS** (`start`, `pro`, `business`, `enterprise`) para reusar el panel interno sin modificaciones, con nombres comerciales propios.

---

## 1. Tiers

| | **Inicio** (`start`) | **Pyme** (`pro`) | **Industria** (`business`) | **Corporativo** (`enterprise`) |
|---|---|---|---|---|
| Target | Elaborador chico / emprendedor | PyME alimenticia | Industrial / multi-planta | Grandes cuentas |
| Precio ARS (referencia lanzamiento)* | ~USD 25 eq. | ~USD 59 eq. | ~USD 119 eq. | A medida |
| Precio USD (internacional, v2) | 29 | 69 | 139 | A medida |
| Establecimientos | 1 | 1 | 5 | Ilimitado |
| Usuarios con login | 3 | 10 | 30 | Ilimitado |
| Operarios (members) | 10 | Ilimitado | Ilimitado | Ilimitado |
| Recetas | 30 | Ilimitado | Ilimitado | Ilimitado |
| Producciones/mes | 100 | 1.000 | Ilimitado | Ilimitado |
| Trazabilidad + QR público | ✅ | ✅ | ✅ | ✅ |
| Planillas y export Excel | ✅ base | ✅ configurables ilimitadas | ✅ + impresión masiva | ✅ |
| Informes bromatológicos + análisis | — | ✅ | ✅ | ✅ |
| RNE/RNPA/RUCA + alertas | ✅ | ✅ | ✅ | ✅ |
| KPIs avanzados + costos | — | ✅ | ✅ | ✅ |
| API pública + webhooks | — | — | ✅ | ✅ |
| Integraciones delivery/ML | — | — | ✅ | ✅ |
| Multi-establecimiento | — | — | ✅ | ✅ |
| Sello ABR en traza pública | ✅ | ✅ | ✅ | ✅ |
| White-label / SLA / soporte prioritario | — | — | — | ✅ |
| Trial | 14 días | 14 días | 14 días | Demo guiada |

*Precios finales a definir comercialmente; estos anclan contra Trazal (29/66/49-129 USD) con ventaja: usuarios nombrados (no concurrentes), trial self-service y más features por tier.

## 2. Aplicación de límites

`plans.limits` jsonb (patrón POS): `{max_establishments, max_users, max_members, max_recipes, max_productions_per_month, configurable_forms, api_access, integrations, advanced_kpis, quality_module}`. Enforcement en `modules/*/api.ts` antes de mutaciones + indicador de consumo en configuración del tenant. Soft-block: al exceder, banner de upgrade, nunca pérdida de datos.

## 3. Ciclo de vida (calcado POS)

```
signup → trial (14d) → active → past_due → suspended → cancelled (lectura 90 días)
                          ↑________renovación_______|
```

Cobro: Mercado Pago preapproval (AR/LATAM, MVP) → webhooks `subscription_preapproval` + `subscription_authorized_payment` actualizan el estado canónico. Internacional (v2): Stripe vía entidad extranjera (Atlas), PayPal como fallback. Detalle técnico en doc 04 §5 y doc 09.

## 4. Panel interno (calcado POS)

Mismas pantallas del POS adaptadas: dashboard de métricas SaaS, tenants (alta manual, suspensión, cambio de plan, notas), staff con niveles, audit, emails, pagos MP con conciliación. El panel ya sabe operar `plans/subscriptions/tenant_feature_flags` — al reutilizar las keys, el código se porta casi sin cambios.

## 5. Adaptación por perfil de cliente

- **Onboarding por rubro**: al crear tenant se elige `industry` (frigorífico, panadería, láctos, conservas, catering, otro) → seeds de familias de ingredientes, unidades, plantillas de planillas y categorías típicas del rubro.
- **Feature flags por tenant** para pilotos (ej. habilitar HACCP beta a un cliente Pyme).
- **Perfil chico** (Inicio): UI simplificada, menos módulos visibles, defaults agresivos.
- **Perfil industrial** (Industria+): multi-planta, API, impresión masiva, integraciones.
