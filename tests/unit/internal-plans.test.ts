import { describe, expect, it } from "vitest";
import {
  MAX_PRICE,
  canEditPlans,
  parseUpdatePlan,
} from "@/modules/internal/plans";

const VALID_ID = "11111111-1111-1111-1111-111111111111";

describe("parseUpdatePlan — validación del payload del editor de precios", () => {
  it("acepta precios enteros positivos y is_active opcional", () => {
    const r = parseUpdatePlan({
      plan_id: VALID_ID,
      monthly_price_ars: 59990,
      yearly_price_ars: 599900,
      is_active: true,
    });
    expect(r.ok).toBe(true);
    expect(r.data?.monthly_price_ars).toBe(59990);
    expect(r.data?.yearly_price_ars).toBe(599900);
    expect(r.data?.is_active).toBe(true);
  });

  it("acepta precios null (plan a medida / sin self-service)", () => {
    const r = parseUpdatePlan({
      plan_id: VALID_ID,
      monthly_price_ars: null,
      yearly_price_ars: null,
    });
    expect(r.ok).toBe(true);
    expect(r.data?.monthly_price_ars).toBeNull();
    expect(r.data?.yearly_price_ars).toBeNull();
    expect(r.data?.is_active).toBeUndefined();
  });

  it("acepta el máximo exacto y rechaza por encima", () => {
    expect(
      parseUpdatePlan({
        plan_id: VALID_ID,
        monthly_price_ars: MAX_PRICE,
        yearly_price_ars: null,
      }).ok,
    ).toBe(true);
    expect(
      parseUpdatePlan({
        plan_id: VALID_ID,
        monthly_price_ars: MAX_PRICE + 1,
        yearly_price_ars: null,
      }).ok,
    ).toBe(false);
  });

  it("rechaza cero, negativos y decimales", () => {
    for (const bad of [0, -100, 1500.5]) {
      const r = parseUpdatePlan({
        plan_id: VALID_ID,
        monthly_price_ars: bad,
        yearly_price_ars: null,
      });
      expect(r.ok).toBe(false);
      expect(r.error).toBeTruthy();
    }
  });

  it("rechaza plan_id que no es uuid", () => {
    const r = parseUpdatePlan({
      plan_id: "no-soy-uuid",
      monthly_price_ars: 100,
      yearly_price_ars: null,
    });
    expect(r.ok).toBe(false);
  });

  it("rechaza tipos no numéricos en el precio", () => {
    const r = parseUpdatePlan({
      plan_id: VALID_ID,
      monthly_price_ars: "59990",
      yearly_price_ars: null,
    });
    expect(r.ok).toBe(false);
  });

  it("rechaza payloads basura (null / no objeto)", () => {
    expect(parseUpdatePlan(null).ok).toBe(false);
    expect(parseUpdatePlan("x").ok).toBe(false);
    expect(parseUpdatePlan({}).ok).toBe(false);
  });
});

describe("canEditPlans — gating por internal_level (solo admin)", () => {
  it("solo admin puede editar precios", () => {
    expect(canEditPlans("admin")).toBe(true);
  });

  it("editor y viewer no pueden", () => {
    expect(canEditPlans("editor")).toBe(false);
    expect(canEditPlans("viewer")).toBe(false);
  });

  it("nivel nulo / indefinido / desconocido no puede", () => {
    expect(canEditPlans(null)).toBe(false);
    expect(canEditPlans(undefined)).toBe(false);
    expect(canEditPlans("superuser")).toBe(false);
    expect(canEditPlans("")).toBe(false);
  });
});
