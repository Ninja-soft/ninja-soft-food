import { describe, expect, it } from "vitest";
import {
  buildValuesSchema,
  evaluateSubmission,
  isChecklistValue,
  isPhotoValue,
  type FormField,
} from "@/modules/forms/schemas";
import {
  DEFAULT_PALETTE,
  hexToRgb,
  resolvePalette,
} from "@/lib/utils/pdf";

// =============================================================================
// tests/unit/forms — validación dinámica (buildValuesSchema) y semáforo
// (evaluateSubmission) de los NUEVOS tipos de campo (time, photo, checklist),
// más el fallback de colores de planilla (hexToRgb / resolvePalette). Estos
// tipos son aditivos: las submissions viejas deben seguir validando (regla 5).
// =============================================================================

function field(over: Partial<FormField> & { key: string }): FormField {
  return {
    label: over.label ?? over.key,
    type: over.type ?? "text",
    required: over.required ?? false,
    min: over.min ?? null,
    max: over.max ?? null,
    options: over.options,
    unit: over.unit ?? null,
    options_required: over.options_required ?? null,
    ...over,
  };
}

// ── time ──────────────────────────────────────────────────────────────────────

describe("buildValuesSchema · time", () => {
  const fields = [field({ key: "hora", type: "time", required: true })];

  it("acepta HH:mm válido", () => {
    const r = buildValuesSchema(fields).safeParse({ hora: "08:30" });
    expect(r.success).toBe(true);
  });

  it("rechaza formato inválido", () => {
    const r = buildValuesSchema(fields).safeParse({ hora: "8.30" });
    expect(r.success).toBe(false);
  });

  it("opcional admite null/vacío y lo normaliza a null", () => {
    const opt = [field({ key: "hora", type: "time", required: false })];
    const r = buildValuesSchema(opt).safeParse({ hora: "" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.hora).toBeNull();
  });
});

// ── photo ─────────────────────────────────────────────────────────────────────

describe("buildValuesSchema · photo", () => {
  it("acepta PhotoValue { path, name }", () => {
    const fields = [field({ key: "foto", type: "photo", required: true })];
    const r = buildValuesSchema(fields).safeParse({
      foto: { path: "t/forms/abc.jpg", name: "abc.jpg" },
    });
    expect(r.success).toBe(true);
  });

  it("requerida rechaza null", () => {
    const fields = [field({ key: "foto", type: "photo", required: true })];
    expect(buildValuesSchema(fields).safeParse({ foto: null }).success).toBe(
      false
    );
  });

  it("opcional admite null", () => {
    const fields = [field({ key: "foto", type: "photo", required: false })];
    expect(buildValuesSchema(fields).safeParse({ foto: null }).success).toBe(
      true
    );
  });
});

// ── checklist ───────────────────────────────────────────────────────────────

describe("buildValuesSchema · checklist", () => {
  const opts = ["Pisos", "Mesadas", "Utensilios"];

  it("acepta un subconjunto de las opciones definidas", () => {
    const fields = [field({ key: "tareas", type: "checklist", options: opts })];
    const r = buildValuesSchema(fields).safeParse({ tareas: ["Pisos"] });
    expect(r.success).toBe(true);
  });

  it("rechaza una opción que no pertenece al checklist", () => {
    const fields = [field({ key: "tareas", type: "checklist", options: opts })];
    const r = buildValuesSchema(fields).safeParse({ tareas: ["Techos"] });
    expect(r.success).toBe(false);
  });

  it("requerido exige al menos una opción tildada", () => {
    const fields = [
      field({ key: "tareas", type: "checklist", options: opts, required: true }),
    ];
    expect(
      buildValuesSchema(fields).safeParse({ tareas: [] }).success
    ).toBe(false);
    expect(
      buildValuesSchema(fields).safeParse({ tareas: ["Pisos"] }).success
    ).toBe(true);
  });
});

// ── semáforo (evaluateSubmission) ─────────────────────────────────────────────

describe("evaluateSubmission · nuevos tipos", () => {
  it("photo y time NUNCA marcan desvío", () => {
    const fields = [
      field({ key: "hora", type: "time" }),
      field({ key: "foto", type: "photo", required: true }),
    ];
    const status = evaluateSubmission(fields, {
      hora: "23:59",
      foto: null,
    });
    expect(status).toBe("ok");
  });

  it("checklist con todas obligatorias: fail si falta una", () => {
    const fields = [
      field({
        key: "tareas",
        type: "checklist",
        options: ["A", "B", "C"],
        options_required: true,
      }),
    ];
    expect(evaluateSubmission(fields, { tareas: ["A", "B"] })).toBe("fail");
    expect(evaluateSubmission(fields, { tareas: ["A", "B", "C"] })).toBe("ok");
  });

  it("checklist sin todas obligatorias: nunca fail aunque falte", () => {
    const fields = [
      field({
        key: "tareas",
        type: "checklist",
        options: ["A", "B"],
        options_required: false,
      }),
    ];
    expect(evaluateSubmission(fields, { tareas: [] })).toBe("ok");
  });

  it("numérico fuera de rango sigue marcando desvío (no regresión)", () => {
    const fields = [
      field({ key: "temp", type: "temperature", min: 0, max: 5 }),
    ];
    expect(evaluateSubmission(fields, { temp: 8 })).toBe("fail");
    expect(evaluateSubmission(fields, { temp: 3 })).toBe("ok");
  });

  it("combina checklist + numérico: cualquiera dispara el fail", () => {
    const fields = [
      field({ key: "temp", type: "temperature", min: 0, max: 5 }),
      field({
        key: "tareas",
        type: "checklist",
        options: ["A"],
        options_required: true,
      }),
    ];
    expect(evaluateSubmission(fields, { temp: 3, tareas: [] })).toBe("fail");
    expect(evaluateSubmission(fields, { temp: 3, tareas: ["A"] })).toBe("ok");
  });
});

// ── compat de submissions viejas (regla 5: shape aditivo) ─────────────────────

describe("buildValuesSchema · compat tipos previos", () => {
  it("number/text/bool/select siguen validando como antes", () => {
    const fields = [
      field({ key: "n", type: "number", required: true, min: 0 }),
      field({ key: "t", type: "text" }),
      field({ key: "b", type: "bool" }),
      field({ key: "s", type: "select", options: ["x", "y"], required: true }),
    ];
    const r = buildValuesSchema(fields).safeParse({
      n: 10,
      t: "hola",
      b: true,
      s: "x",
    });
    expect(r.success).toBe(true);
  });
});

// ── type guards ───────────────────────────────────────────────────────────────

describe("type guards", () => {
  it("isChecklistValue solo true para array de strings", () => {
    expect(isChecklistValue(["a", "b"])).toBe(true);
    expect(isChecklistValue([])).toBe(true);
    expect(isChecklistValue([1, 2])).toBe(false);
    expect(isChecklistValue("a")).toBe(false);
    expect(isChecklistValue(null)).toBe(false);
  });

  it("isPhotoValue solo true para { path, name }", () => {
    expect(isPhotoValue({ path: "p", name: "n" })).toBe(true);
    expect(isPhotoValue({ name: "n" })).toBe(false);
    expect(isPhotoValue(["p"])).toBe(false);
    expect(isPhotoValue(null)).toBe(false);
    expect(isPhotoValue("x")).toBe(false);
  });
});

// ── colores de planilla (fallback) ────────────────────────────────────────────

describe("hexToRgb", () => {
  it("convierte hex con y sin almohadilla", () => {
    expect(hexToRgb("#2E7D32", [0, 0, 0])).toEqual([46, 125, 50]);
    expect(hexToRgb("2e7d32", [0, 0, 0])).toEqual([46, 125, 50]);
  });

  it("cae al fallback con hex inválido, null o vacío", () => {
    const fb: [number, number, number] = [9, 9, 9];
    expect(hexToRgb(null, fb)).toEqual(fb);
    expect(hexToRgb(undefined, fb)).toEqual(fb);
    expect(hexToRgb("", fb)).toEqual(fb);
    expect(hexToRgb("#zzz", fb)).toEqual(fb);
    expect(hexToRgb("#12345", fb)).toEqual(fb); // 5 dígitos
  });
});

describe("resolvePalette", () => {
  it("sin colores usa la paleta Ninja Food por defecto", () => {
    expect(resolvePalette()).toEqual(DEFAULT_PALETTE);
    expect(resolvePalette({ primary: null, secondary: null })).toEqual(
      DEFAULT_PALETTE
    );
  });

  it("usa los colores del tenant cuando son válidos", () => {
    const p = resolvePalette({ primary: "#101010", secondary: "#20A040" });
    expect(p.primary).toEqual([16, 16, 16]);
    expect(p.accent).toEqual([32, 160, 64]);
  });

  it("cada color cae a su propio fallback de forma independiente", () => {
    const p = resolvePalette({ primary: "bad", secondary: "#20A040" });
    expect(p.primary).toEqual(DEFAULT_PALETTE.primary);
    expect(p.accent).toEqual([32, 160, 64]);
  });
});
