# Multi-establecimiento (plan Industria) — diseño

Estado: diseño + migración `00000000000024_multi_establishment.sql` escritos (NO aplicados en cloud).
UI (selector de planta en AppShell, filtros) queda para la fase siguiente.

Objetivo: que un tenant industrial opere N plantas (`establishments`) con **stock y producción
separados por planta**, sin romper a los tenants mono-planta ni a los datos legacy. La tabla
`establishments` ya existe desde 0001; `plans.limits.max_establishments` ya es un tope por plan
(Industria = 5, Corporativo = null/ilimitado). El alta de tenant (`create_tenant`) ya crea un
establecimiento `is_default = true`, así que **todo tenant tiene al menos uno**.

---

## 1. Qué tabla lleva `establishment_id` y por qué

| Tabla | establishment_id | Motivo |
|---|---|---|
| `stock_entries` | **sí** (ya en 0001) | El stock físico vive en una planta. |
| `productions` | **sí** (ya en 0001) | Se produce en una planta. |
| `dispatches` | **sí** (ya en 0001) | Sale de una planta. |
| `form_templates` | **sí** (0024, nullable) | Planilla de una planta o global del tenant (null). |
| `form_submissions` | **sí** (0024, nullable) | Registro firmado en una planta o global (null). |
| `vehicles` | **sí** (0024, nullable) | Del **tenant**; opcionalmente "base" en una planta. |
| `suppliers` | no | Compartidos por el tenant (un proveedor sirve a todas las plantas). |
| `recipes` | no | Catálogo del tenant (la misma fórmula se produce en cualquier planta). |
| `ingredients` / `ingredient_families` | no | Catálogo del tenant. |
| `customers` / `localities` | no | Compartidos por el tenant. |
| `recipe_ingredients` | no | Hijo de `recipes` (catálogo). |
| `production_inputs` / `dispatch_items` | no | Hijos; heredan la planta del padre (`productions` / `dispatches`). |
| `stock_movements` | no | Ledger inmutable; hereda la planta vía `stock_entry_id`. |
| `regulatory_permits` | no | Ya modela `entity_type='establishment'` + `entity_id` (0013). |

Las columnas `establishment_id` de las operativas son **NULLABLE en todas partes**:
- datos legacy (filas creadas antes de 0024) quedan con `null` y siguen funcionando;
- tenants mono-planta operan sin tocar nunca el campo;
- las queries de la app filtran por establecimiento **solo si hay uno seleccionado** (filtro de UI,
  no de seguridad).

---

## 2. Modelo de acceso (v1)

**v1: ningún usuario está restringido a plantas.** Todos los miembros del tenant ven todas las
plantas. Hay un "establecimiento activo" en el shell (patrón del selector del POS) que actúa como
**filtro de UI** sobre stock / producción / despacho / planillas. No se persiste como permiso.

La seguridad sigue siendo **tenant-level**: RLS por `current_tenant_id()`. `establishment_id` NO
participa de RLS — es un filtro de negocio dentro del tenant, no un límite de aislamiento. Que el
tenant A no vea datos del tenant B se mantiene intacto (los tests RLS lo verifican con las columnas
nuevas presentes).

**Camino a v2 (restricción por usuario):** tabla `user_establishments (tenant_id, user_id,
establishment_id, role)` + helper SQL `current_user_establishments()` que lea los establecimientos
permitidos del JWT/tabla, y políticas RLS adicionales del tipo
`establishment_id is null or establishment_id = any(current_user_establishments())` sobre las
operativas con planta. Esto se diseña recién cuando un cliente lo pida; no se anticipa en 0024 para
no agregar superficie de RLS sin caso de uso.

---

## 3. Compatibilidad

- `create_tenant` ya inserta un establecimiento `is_default = true`. Para asociar datos existentes a
  ese default NO se hace backfill en 0024 (riesgo nulo: con `null` ya operan). La app puede ofrecer,
  más adelante, una acción "asignar todo al establecimiento principal" si el cliente lo quiere.
- Selector de UI: cuando NO hay establecimiento activo (mono-planta o "todos"), las queries no
  filtran por planta → comportamiento idéntico al actual.
- Las RPCs aceptan `p_establishment_id` con **default null**: los callers existentes (que no lo pasan)
  se comportan exactamente como hoy.

---

## 4. Impacto en las RPCs

Las RPCs originales están congeladas en sus migraciones. 0024 hace `CREATE OR REPLACE` agregando un
**único parámetro `p_establishment_id uuid default null` al final** de la firma. Decisión clave: es
el **MISMO nombre de función con un parámetro con default**, NO una sobrecarga (overload). Postgres
permite invocar `f(a, b)` y `f(a, b, c default null)` resolviendo a la misma función; PostgREST la
expone una sola vez y la resuelve sin ambigüedad porque solo existe una definición tras el replace.

| RPC | Origen vigente | Cambio en 0024 |
|---|---|---|
| `create_stock_entry` | 0004 | Ya tenía `p_establishment_id` (no se toca; documentado acá por completitud). |
| `complete_production` | **0021** (la vigente; 0021 reemplazó a 0005 agregando `regulatory_labels` al payload) | + `p_establishment_id`; setea `productions.establishment_id`; el consumo de lotes filtra por planta (ver §5). |
| `create_dispatch` | 0008 | + `p_establishment_id`; setea `dispatches.establishment_id`. |

Cuerpo: se copia **exacto** el vigente y se agregan solo las líneas del establecimiento. Para
`complete_production` la base es 0021 (incluye `regulatory_labels`), NO 0005.

---

## 5. FEFO de consumo en `complete_production`

`complete_production` no hace selección FEFO en SQL: recibe los `stock_entry_id` ya elegidos en
`p_inputs` (la selección FEFO ocurre en la app). El riesgo multi-planta es que un input apunte a un
lote de **otra** planta.

Decisión: si `p_establishment_id` viene no-nulo, la validación de consumo exige que el lote sea **de
esa planta o sin planta asignada (legacy)**:

```sql
update public.stock_entries
   set remaining_quantity = remaining_quantity - v_input.taken_qty
 where id = v_input.stock_entry_id
   and tenant_id = v_tenant
   and ingredient_id = v_input.ingredient_id
   and (p_establishment_id is null
        or establishment_id is null
        or establishment_id = p_establishment_id);
```

- `p_establishment_id is null` → comportamiento **idéntico al actual** (consume cualquier lote del
  tenant). No hay regresión para mono-planta ni para callers que no pasan el parámetro.
- Con planta: consume solo lotes de esa planta (o legacy sin planta, para no bloquear datos viejos).
  Si el lote es de otra planta, el `update` no encuentra fila → `entry_not_found` (misma señal que
  hoy para un lote ajeno).

**Regla dura 5 (inmutabilidad):** el `CREATE OR REPLACE` afecta SOLO a producciones NUEVAS. Las
`public_traces` ya escritas y los `productions`/`production_inputs` históricos NO cambian. La planta
queda registrada en `productions.establishment_id` de la producción nueva; el snapshot de la traza no
incluye la planta en esta fase (dato vivo legible desde `productions` si la UI lo necesita).

---

## 6. Índices

Índices parciales `(tenant_id, establishment_id) where deleted_at is null` (y sin `deleted_at` en
las tablas append-only) para el filtro "datos de esta planta" que hará la UI:

- `stock_entries`, `productions`, `dispatches`, `form_templates`, `form_submissions`, `vehicles`.

---

## 7. Pendiente operativo

Tras escribir 0024: `pnpm db:reset && pnpm db:types`, y aplicar en cloud (`supabase db push`) junto
al resto de migraciones pendientes. Types y tests RLS de esta tarea se hicieron a mano siguiendo el
patrón skip-if-missing (la columna/firma puede no estar en cloud hasta el push).
