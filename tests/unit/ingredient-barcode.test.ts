import { afterEach, describe, expect, it, vi } from "vitest";

// Tests de la lógica PURA de lookup/búsqueda por código de barras.
// Mockeamos el cliente Supabase con un query builder encadenable que registra
// las llamadas; el componente de cámara (html5-qrcode) NO se testea.

type Resolved = { data: unknown; error: unknown };

// Construye un builder chainable que:
//  - registra cada método invocado en `calls`
//  - devuelve `this` para encadenar
//  - es thenable (await del builder => `resolved`)
//  - maybeSingle/single resuelven directamente a `resolved`
function makeBuilder(resolved: Resolved) {
  const calls: { method: string; args: unknown[] }[] = [];
  const builder: Record<string, unknown> = {};
  const chain = [
    "select",
    "is",
    "eq",
    "or",
    "ilike",
    "order",
    "limit",
    "gt",
  ];
  for (const m of chain) {
    builder[m] = (...args: unknown[]) => {
      calls.push({ method: m, args });
      return builder;
    };
  }
  builder.maybeSingle = (...args: unknown[]) => {
    calls.push({ method: "maybeSingle", args });
    return Promise.resolve(resolved);
  };
  builder.single = (...args: unknown[]) => {
    calls.push({ method: "single", args });
    return Promise.resolve(resolved);
  };
  // Thenable: awaitear el builder (listIngredients no llama single/maybeSingle).
  builder.then = (onFulfilled: (v: Resolved) => unknown) =>
    Promise.resolve(resolved).then(onFulfilled);
  return { builder, calls };
}

// Estado mutable que el mock de createClient leerá en cada test.
let current = makeBuilder({ data: null, error: null });
const fromSpy = vi.fn(() => current.builder);

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ from: fromSpy }),
}));

// getTenantId no se usa en estas funciones, pero lo mockeamos por las dudas.
vi.mock("@/lib/utils/tenant", () => ({
  getTenantId: () => Promise.resolve("tenant-1"),
}));

import {
  findIngredientByBarcode,
  listIngredients,
} from "@/modules/ingredients/api";

function setResult(resolved: Resolved) {
  current = makeBuilder(resolved);
}

afterEach(() => {
  fromSpy.mockClear();
});

const SAMPLE = {
  id: "ing-1",
  name: "Sal fina",
  family_id: null,
  unit: "kg",
  is_perishable: true,
  image_url: null,
  description: null,
  barcode: "7790001112223",
  low_stock_threshold: null,
  default_shelf_days: null,
  family: null,
};

describe("findIngredientByBarcode", () => {
  it("devuelve el ingrediente cuando hay coincidencia exacta", async () => {
    setResult({ data: SAMPLE, error: null });
    const result = await findIngredientByBarcode("7790001112223");
    expect(result).toEqual(SAMPLE);
    expect(fromSpy).toHaveBeenCalledWith("ingredients");
    // matchea por igualdad exacta de barcode
    expect(current.calls).toContainEqual({
      method: "eq",
      args: ["barcode", "7790001112223"],
    });
  });

  it("hace trim del código antes de consultar", async () => {
    setResult({ data: SAMPLE, error: null });
    await findIngredientByBarcode("  7790001112223  ");
    expect(current.calls).toContainEqual({
      method: "eq",
      args: ["barcode", "7790001112223"],
    });
  });

  it("devuelve null cuando no hay coincidencia", async () => {
    setResult({ data: null, error: null });
    const result = await findIngredientByBarcode("0000000000000");
    expect(result).toBeNull();
  });

  it("devuelve null sin consultar si el código viene vacío", async () => {
    setResult({ data: SAMPLE, error: null });
    const result = await findIngredientByBarcode("   ");
    expect(result).toBeNull();
    expect(fromSpy).not.toHaveBeenCalled();
  });

  it("propaga el error del cliente", async () => {
    setResult({ data: null, error: new Error("boom") });
    await expect(findIngredientByBarcode("123")).rejects.toThrow("boom");
  });
});

describe("listIngredients (matcheo por barcode en búsqueda)", () => {
  it("arma un OR de nombre-ilike o barcode-eq cuando hay término", async () => {
    setResult({ data: [SAMPLE], error: null });
    const result = await listIngredients({ search: "7790001112223" });
    expect(result).toEqual([SAMPLE]);
    expect(current.calls).toContainEqual({
      method: "or",
      args: ["name.ilike.%7790001112223%,barcode.eq.7790001112223"],
    });
  });

  it("sanea comas y porcentajes del término para no romper el parser PostgREST", async () => {
    setResult({ data: [], error: null });
    await listIngredients({ search: "ab,c%d" });
    expect(current.calls).toContainEqual({
      method: "or",
      args: ["name.ilike.%ab c d%,barcode.eq.ab c d"],
    });
  });

  it("no agrega cláusula de búsqueda cuando el término está vacío", async () => {
    setResult({ data: [], error: null });
    await listIngredients({ search: "   " });
    expect(current.calls.some((c) => c.method === "or")).toBe(false);
    expect(current.calls.some((c) => c.method === "ilike")).toBe(false);
  });

  it("filtra por familia con eq cuando se provee familyId", async () => {
    setResult({ data: [], error: null });
    await listIngredients({ familyId: "fam-1" });
    expect(current.calls).toContainEqual({
      method: "eq",
      args: ["family_id", "fam-1"],
    });
  });
});
