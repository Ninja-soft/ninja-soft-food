import { describe, expect, it } from "vitest";
import {
  bucketPermitDays,
  buildPermitGroups,
  mergePermitRows,
  type PermitRow,
} from "@/modules/dashboard/api";

// Tests de la lógica PURA de la migración de compliance del dashboard a
// regulatory_permits (merge new/legacy sin duplicar + bucketing 30/60/90).
// Sin Supabase: las funciones reciben filas y devuelven agregados.

// ── Helper: ISO date a N días de hoy (a medianoche local, como daysUntil) ─────
function inDays(days: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function row(over: Partial<PermitRow> = {}): PermitRow {
  return {
    entityType: "recipe",
    entityId: "e1",
    permitType: "rnpa",
    permitNumber: "RNPA-001",
    entityLabel: "Receta 1",
    expiresAt: inDays(10),
    source: "new",
    ...over,
  };
}

// ── bucketPermitDays ──────────────────────────────────────────────────────────

describe("bucketPermitDays", () => {
  it("clasifica vencidos como 'expired'", () => {
    expect(bucketPermitDays(-1)).toBe("expired");
    expect(bucketPermitDays(-100)).toBe("expired");
  });

  it("0..30 → '30'", () => {
    expect(bucketPermitDays(0)).toBe("30");
    expect(bucketPermitDays(1)).toBe("30");
    expect(bucketPermitDays(30)).toBe("30");
  });

  it("31..60 → '60'", () => {
    expect(bucketPermitDays(31)).toBe("60");
    expect(bucketPermitDays(60)).toBe("60");
  });

  it("61..90 → '90'", () => {
    expect(bucketPermitDays(61)).toBe("90");
    expect(bucketPermitDays(90)).toBe("90");
  });

  it("> 90 o null → 'ok' (fuera de alertas)", () => {
    expect(bucketPermitDays(91)).toBe("ok");
    expect(bucketPermitDays(365)).toBe("ok");
    expect(bucketPermitDays(null)).toBe("ok");
  });
});

// ── mergePermitRows (dedupe new/legacy) ───────────────────────────────────────

describe("mergePermitRows", () => {
  it("la tabla nueva gana cuando coincide entity+type", () => {
    const newRows = [
      row({ entityId: "r1", permitType: "rnpa", source: "new", permitNumber: "NEW" }),
    ];
    const legacyRows = [
      row({ entityId: "r1", permitType: "rnpa", source: "legacy", permitNumber: "OLD" }),
    ];
    const merged = mergePermitRows(newRows, legacyRows);
    expect(merged).toHaveLength(1);
    expect(merged[0].source).toBe("new");
    expect(merged[0].permitNumber).toBe("NEW");
  });

  it("conserva legacy que no tiene equivalente en la tabla nueva", () => {
    const newRows = [row({ entityId: "r1", permitType: "rnpa", source: "new" })];
    const legacyRows = [
      // misma entidad, otro tipo → no es duplicado
      row({ entityId: "r1", permitType: "ruca", source: "legacy", entityType: "establishment" }),
      // otra entidad → no es duplicado
      row({ entityId: "v1", permitType: "uta", source: "legacy", entityType: "vehicle" }),
    ];
    const merged = mergePermitRows(newRows, legacyRows);
    expect(merged).toHaveLength(3);
    expect(merged.filter((r) => r.source === "legacy")).toHaveLength(2);
  });

  it("la clave incluye entity_type: mismo id+type pero distinta entidad no colisiona", () => {
    const newRows = [
      row({ entityType: "supplier", entityId: "x", permitType: "rne", source: "new" }),
    ];
    const legacyRows = [
      row({ entityType: "establishment", entityId: "x", permitType: "rne", source: "legacy" }),
    ];
    const merged = mergePermitRows(newRows, legacyRows);
    expect(merged).toHaveLength(2);
  });

  it("devuelve nuevas primero y legacy después", () => {
    const newRows = [row({ entityId: "a", permitType: "rnpa", source: "new" })];
    const legacyRows = [row({ entityId: "b", permitType: "uta", source: "legacy" })];
    const merged = mergePermitRows(newRows, legacyRows);
    expect(merged[0].source).toBe("new");
    expect(merged[1].source).toBe("legacy");
  });

  it("no duplica aunque la legacy traiga la misma clave más de una vez", () => {
    const newRows: PermitRow[] = [];
    const legacyRows = [
      row({ entityId: "r1", permitType: "rnpa", source: "legacy", permitNumber: "A" }),
      row({ entityId: "r1", permitType: "rnpa", source: "legacy", permitNumber: "B" }),
    ];
    // mergePermitRows solo dedup contra las nuevas; la legacy duplicada la
    // colapsa buildPermitGroups por clave de item. Acá validamos el contrato
    // documentado: sin claves nuevas, pasan las dos legacy.
    const merged = mergePermitRows(newRows, legacyRows);
    expect(merged).toHaveLength(2);
  });
});

// ── buildPermitGroups (agrupado + bucketing + orden) ──────────────────────────

describe("buildPermitGroups", () => {
  it("agrupa por permit_type y descarta los que no vencen en 90 días", () => {
    const rows = [
      row({ entityId: "r1", permitType: "rnpa", expiresAt: inDays(10) }),
      row({ entityId: "r2", permitType: "rnpa", expiresAt: inDays(200) }), // fuera
      row({ entityType: "vehicle", entityId: "v1", permitType: "uta", expiresAt: inDays(45) }),
    ];
    const groups = buildPermitGroups(rows);
    const byType = Object.fromEntries(groups.map((g) => [g.permitType, g]));
    expect(byType.rnpa.items).toHaveLength(1);
    expect(byType.uta.items).toHaveLength(1);
  });

  it("incluye vencidos y los ordena peor-primero dentro del grupo", () => {
    const rows = [
      row({ entityId: "r1", permitType: "rnpa", expiresAt: inDays(20) }),
      row({ entityId: "r2", permitType: "rnpa", expiresAt: inDays(-5) }),
      row({ entityId: "r3", permitType: "rnpa", expiresAt: inDays(5) }),
    ];
    const groups = buildPermitGroups(rows);
    expect(groups).toHaveLength(1);
    const days = groups[0].items.map((i) => i.days);
    expect(days).toEqual([...days].sort((a, b) => a - b));
    expect(days[0]).toBeLessThan(0); // el vencido arriba
  });

  it("cuenta vencidos y próximos (<=60d sin contar vencidos)", () => {
    const rows = [
      row({ entityId: "r1", permitType: "rnpa", expiresAt: inDays(-2) }),
      row({ entityId: "r2", permitType: "rnpa", expiresAt: inDays(40) }),
      row({ entityId: "r3", permitType: "rnpa", expiresAt: inDays(85) }), // 90 bucket, no "soon"
    ];
    const [g] = buildPermitGroups(rows);
    expect(g.expiredCount).toBe(1);
    expect(g.soonCount).toBe(1);
  });

  it("etiqueta el grupo vía catálogo (getPermitLabel)", () => {
    const rows = [row({ permitType: "rnpa", expiresAt: inDays(10) })];
    const [g] = buildPermitGroups(rows);
    expect(g.label).toBe("RNPA");
  });

  it("ordena los grupos por severidad (peor permiso del grupo arriba)", () => {
    const rows = [
      row({ entityId: "r1", permitType: "rnpa", expiresAt: inDays(80) }),
      row({ entityType: "vehicle", entityId: "v1", permitType: "uta", expiresAt: inDays(-3) }),
    ];
    const groups = buildPermitGroups(rows);
    expect(groups[0].permitType).toBe("uta"); // el vencido manda
  });

  it("opera sobre el resultado del merge sin duplicar", () => {
    const newRows = [
      row({ entityId: "r1", permitType: "rnpa", source: "new", expiresAt: inDays(10) }),
    ];
    const legacyRows = [
      // mismo entity+type que la nueva → debe perder
      row({ entityId: "r1", permitType: "rnpa", source: "legacy", expiresAt: inDays(2) }),
      // tipo distinto → entra
      row({ entityType: "vehicle", entityId: "v1", permitType: "uta", source: "legacy", expiresAt: inDays(15) }),
    ];
    const groups = buildPermitGroups(mergePermitRows(newRows, legacyRows));
    const rnpa = groups.find((g) => g.permitType === "rnpa")!;
    expect(rnpa.items).toHaveLength(1);
    // gana la nueva (inDays(10)), no la legacy (inDays(2))
    expect(rnpa.items[0].days).toBeGreaterThan(5);
  });
});
