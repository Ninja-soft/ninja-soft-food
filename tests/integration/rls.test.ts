import { describe, it } from "vitest";

/**
 * Tests de aislamiento multi-tenant (OBLIGATORIOS — regla dura CLAUDE.md §1).
 *
 * Patrón POS: por cada tabla operativa se verifica que un usuario del
 * tenant A no puede leer ni escribir filas del tenant B.
 *
 * Requiere Supabase local levantado (pnpm db:start && pnpm db:reset).
 * Se implementan en fase 0 junto con el flujo de signup/create_tenant:
 *   1. crear 2 tenants + 1 usuario en cada uno (service_role)
 *   2. firmar JWT con app_metadata.tenant_id de cada usuario
 *   3. para cada tabla: SELECT/INSERT cruzado debe fallar o devolver 0 filas
 */
describe.todo("RLS multi-tenant isolation — implementar en fase 0");

it.skip("placeholder hasta fase 0", () => {});
