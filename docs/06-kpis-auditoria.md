# KPIs y auditoría — Ninja Food

---

## 1. KPIs por dashboard

### Dashboard del tenant (MVP — hereda y mejora el panel de LJ)

| KPI | Origen | Visualización |
|---|---|---|
| Producción en kg por período (por receta) | LJ | Barras / línea / dona + DateRangePicker con presets |
| Último informe bromatológico + importancia | LJ | Card con semáforo |
| Proveedores con RNE pendiente/vencido | LJ | Card lista |
| RNPA por vencer (<6m, <60d) | LJ | Card lista |
| Transporte habilitado (UTA/URA vigentes) | LJ | Card |
| Stock bajo + lotes próximos a vencer | LJ (alertas) | Card accionable |

### KPIs v1

| KPI | Cálculo |
|---|---|
| Rendimiento de producción | kg producidos / kg teóricos por receta |
| Rotación de stock | consumo período / stock promedio |
| Mermas | movimientos `loss` / total ingresado |
| Conformidad de análisis | promedio `conformity` por tipo, tendencia temporal |
| Cumplimiento de planillas | submissions a tiempo / programadas |
| Costo por kg producido | suma `unit_cost` consumido / kg (requiere costos en ingresos) |
| Tiempo de respuesta de trazabilidad | medido: segundos para reconstruir un lote (argumento de venta: CAA exige rapidez en recall) |

### Dashboard interno Ninja-Soft (calcado POS)

MRR, tenants por estado (trial/active/past_due/suspended), churn, conversión trial→pago, uso por módulo, salud por tenant (`internal_tenant_health`).

## 2. Auditoría (quién hizo qué y cuándo)

Patrón POS calcado: tabla `audit_logs` (action, entity_type, entity_id, actor, before/after jsonb, ip, user_agent, reason) con triggers automáticos en:

- `productions` (creación, anulación — crítico para trazabilidad)
- `stock_entries` / `stock_movements` (ajustes manuales con `reason` obligatorio)
- `recipes` (cambios de fórmula y de RNPA)
- `form_submissions` (inmutables: todo intento de edición queda logueado y rechazado)
- `reports` / `analyses` (edición y borrado)
- `subscriptions` / `tenant_users` (cambios de plan y de rol)
- `dispatches` (modificaciones post-despacho)

Reglas:
1. **Firma de operario con PIN** (hash bcrypt) en producciones y planillas → el registro queda atribuido a la persona física, no solo a la cuenta logueada. Esto es lo que ABR necesita para avalar: registros atribuibles e inmutables.
2. Visor de auditoría en el panel interno (staff) y versión filtrada para `owner` del tenant (v1).
3. Retención: ≥2 años (alineado FSMA 204; configurable por tenant para ISO 22000).
4. Export de auditoría a Excel para inspecciones (ASSAL/SENASA).
