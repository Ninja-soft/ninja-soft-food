import { describe, expect, it } from "vitest";
import {
  validateCustomerRow,
  validateIngredientRow,
  validateSupplierRow,
  nameKey,
} from "@/modules/imports/schemas";
import {
  parseBoolEs,
  parseDateEs,
  parseNumberEs,
  normalizeHeader,
  buildRejectsWorkbook,
  type RawRow,
} from "@/lib/utils/xlsxImport";

// Tests de la lógica PURA de importación (mapping + validación zod por fila).
// Sin Supabase: validateRow recibe el set de claves existentes como argumento.

const NO_EXISTING = new Set<string>();

// ── Parsers es-AR ─────────────────────────────────────────────────────────────

describe("parsers es-AR", () => {
  it("parseBoolEs reconoce Sí/No y variantes", () => {
    expect(parseBoolEs("Sí")).toBe(true);
    expect(parseBoolEs("si")).toBe(true);
    expect(parseBoolEs("X")).toBe(true);
    expect(parseBoolEs("No")).toBe(false);
    expect(parseBoolEs("n")).toBe(false);
    expect(parseBoolEs(null)).toBe(null);
    expect(parseBoolEs("quizás")).toBe(null);
  });

  it("parseNumberEs acepta coma y punto decimal", () => {
    expect(parseNumberEs("12,5")).toBe(12.5);
    expect(parseNumberEs("12.5")).toBe(12.5);
    expect(parseNumberEs("1.234,56")).toBe(1234.56);
    expect(parseNumberEs(null)).toBe(null);
    expect(Number.isNaN(parseNumberEs("abc") as number)).toBe(true);
  });

  it("parseDateEs normaliza dd/mm/aaaa e ISO a ISO; '' si inválida", () => {
    expect(parseDateEs("31/12/2026")).toBe("2026-12-31");
    expect(parseDateEs("1/2/2026")).toBe("2026-02-01");
    expect(parseDateEs("2026-12-31")).toBe("2026-12-31");
    expect(parseDateEs(null)).toBe(null);
    expect(parseDateEs("31/13/2026")).toBe(""); // mes inválido
    expect(parseDateEs("hola")).toBe("");
  });

  it("normalizeHeader es tolerante a acentos, espacios y asterisco", () => {
    expect(normalizeHeader("Razón social *")).toBe("razonsocial");
    expect(normalizeHeader("  UNIDAD ")).toBe("unidad");
    expect(normalizeHeader("Vida útil (días)")).toBe("vidautil(dias)");
  });

  it("nameKey normaliza para detección de duplicados", () => {
    expect(nameKey("  Harina   0000 ")).toBe("harina 0000");
    expect(nameKey("HARINA 0000")).toBe("harina 0000");
  });
});

// ── Ingredientes ──────────────────────────────────────────────────────────────

describe("validateIngredientRow", () => {
  it("acepta una fila válida y mapea tipos es-AR", () => {
    const raw: RawRow = {
      name: "Harina 0000",
      unit: "kg",
      is_perishable: "No",
      default_shelf_days: "180",
      low_stock_threshold: "10,5",
      description: null,
    };
    const r = validateIngredientRow(raw, 1, NO_EXISTING);
    expect(r.status).toBe("ok");
    expect(r.data?.name).toBe("Harina 0000");
    expect(r.data?.unit).toBe("kg");
    expect(r.data?.is_perishable).toBe(false);
    expect(r.data?.default_shelf_days).toBe(180);
    expect(r.data?.low_stock_threshold).toBe(10.5);
    expect(r.data?.description).toBe(null);
  });

  it("rechaza fila sin nombre con mensaje es-AR", () => {
    const raw: RawRow = { name: null, unit: "kg" };
    const r = validateIngredientRow(raw, 2, NO_EXISTING);
    expect(r.status).toBe("error");
    expect(r.error).toContain("Nombre");
  });

  it("rechaza fila sin unidad", () => {
    const raw: RawRow = { name: "Azúcar", unit: null };
    const r = validateIngredientRow(raw, 3, NO_EXISTING);
    expect(r.status).toBe("error");
    expect(r.error).toContain("Unidad");
  });

  it("rechaza vida útil no numérica", () => {
    const raw: RawRow = { name: "Sal", unit: "kg", default_shelf_days: "muchos" };
    const r = validateIngredientRow(raw, 4, NO_EXISTING);
    expect(r.status).toBe("error");
    expect(r.error).toContain("Vida útil");
  });

  it("marca duplicado contra claves existentes", () => {
    const existing = new Set([nameKey("Harina 0000")]);
    const raw: RawRow = { name: "HARINA 0000", unit: "kg" };
    const r = validateIngredientRow(raw, 5, existing);
    expect(r.status).toBe("duplicate");
    expect(r.dupKey).toBe("harina 0000");
  });

  it("perecedero vacío se toma como No", () => {
    const raw: RawRow = { name: "Levadura", unit: "g", is_perishable: null };
    const r = validateIngredientRow(raw, 6, NO_EXISTING);
    expect(r.status).toBe("ok");
    expect(r.data?.is_perishable).toBe(false);
  });
});

// ── Clientes ──────────────────────────────────────────────────────────────────

describe("validateCustomerRow", () => {
  it("acepta fila válida con email", () => {
    const raw: RawRow = {
      name: "Panadería La Esquina",
      locality: "Rosario",
      phone: "3415551234",
      address: "San Martín 123",
      email: "ventas@laesquina.com",
    };
    const r = validateCustomerRow(raw, 1, NO_EXISTING);
    expect(r.status).toBe("ok");
    expect(r.data?.name).toBe("Panadería La Esquina");
    expect(r.data?.email).toBe("ventas@laesquina.com");
    expect(r.data?.locality).toBe("Rosario");
  });

  it("acepta fila con solo nombre (resto opcional -> null)", () => {
    const raw: RawRow = { name: "Cliente mínimo" };
    const r = validateCustomerRow(raw, 2, NO_EXISTING);
    expect(r.status).toBe("ok");
    expect(r.data?.email).toBe(null);
    expect(r.data?.phone).toBe(null);
    expect(r.data?.address).toBe(null);
    expect(r.data?.locality).toBe(null);
  });

  it("rechaza email inválido", () => {
    const raw: RawRow = { name: "Cliente X", email: "no-es-email" };
    const r = validateCustomerRow(raw, 3, NO_EXISTING);
    expect(r.status).toBe("error");
    expect(r.error).toContain("Email");
  });

  it("rechaza fila sin nombre", () => {
    const raw: RawRow = { name: null, locality: "Córdoba" };
    const r = validateCustomerRow(raw, 4, NO_EXISTING);
    expect(r.status).toBe("error");
    expect(r.error).toContain("Nombre");
  });

  it("marca duplicado por nombre", () => {
    const existing = new Set([nameKey("Distribuidora Sur SRL")]);
    const raw: RawRow = { name: "distribuidora sur srl" };
    const r = validateCustomerRow(raw, 5, existing);
    expect(r.status).toBe("duplicate");
  });
});

// ── Proveedores ───────────────────────────────────────────────────────────────

describe("validateSupplierRow", () => {
  it("acepta fila válida con RNE", () => {
    const raw: RawRow = { name: "Molinos del Plata SA", rne_number: "02-031234" };
    const r = validateSupplierRow(raw, 1, NO_EXISTING);
    expect(r.status).toBe("ok");
    expect(r.data?.name).toBe("Molinos del Plata SA");
    expect(r.data?.rne_number).toBe("02-031234");
  });

  it("acepta proveedor sin RNE (opcional -> null)", () => {
    const raw: RawRow = { name: "Proveedor sin RNE", rne_number: null };
    const r = validateSupplierRow(raw, 2, NO_EXISTING);
    expect(r.status).toBe("ok");
    expect(r.data?.rne_number).toBe(null);
  });

  it("rechaza fila sin nombre", () => {
    const raw: RawRow = { name: "", rne_number: "02-1" };
    const r = validateSupplierRow(raw, 3, NO_EXISTING);
    expect(r.status).toBe("error");
    expect(r.error).toContain("Nombre");
  });

  it("marca duplicado por nombre", () => {
    const existing = new Set([nameKey("Lácteos del Centro")]);
    const raw: RawRow = { name: "LÁCTEOS DEL CENTRO" };
    const r = validateSupplierRow(raw, 4, existing);
    expect(r.status).toBe("duplicate");
  });
});

// ── Reporte de rechazos (workbook se construye sin tocar DOM) ──────────────────

describe("buildRejectsWorkbook", () => {
  it("genera un workbook con la hoja Rechazos y las filas malas", () => {
    const columns = [
      { header: "Nombre", key: "name" },
      { header: "Unidad", key: "unit" },
    ];
    const wb = buildRejectsWorkbook(
      columns,
      [
        { rowNumber: 2, values: { name: "Sal", unit: null }, error: "Unidad: requerida" },
      ],
      "Rechazos · Ingredientes",
    );
    const ws = wb.getWorksheet("Rechazos");
    expect(ws).toBeDefined();
    // Fila 1 título, fila 2 headers, fila 3 primer rechazo.
    expect(ws?.getCell(3, 1).value).toBe(2); // número de fila
    expect(ws?.getCell(3, 2).value).toBe("Sal");
    expect(String(ws?.getCell(3, 4).value)).toContain("Unidad");
  });
});
