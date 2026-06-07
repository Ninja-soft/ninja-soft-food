import { describe, expect, it } from "vitest";
import {
  AI_ADDON_KEY,
  buildAddonExternalReference,
  parseAddonExternalReference,
  isAddonReference,
  resolveAddonPrice,
  deriveAddonCardState,
} from "@/lib/billing/addons";
import { applyAiIncludedToLimits, limitsIncludeAI } from "@/modules/internal/plans";
import { applyAddonUpdate } from "@/lib/billing/addon-sync";
import type { SubscriptionInfo } from "@/lib/billing/types";

// =============================================================================
// tests/unit/addons.test.ts — monetización del add-on IA.
// Cubre: parseo del external_reference (addon:ai:<uuid>), resolución de precio
// por moneda, derivación pura del estado de la card, toggle ai_included sobre
// limits, y el handler del webhook del add-on (idempotencia + activación/cancel).
// =============================================================================

const TENANT = "11111111-2222-3333-4444-555555555555";

// ── external_reference ────────────────────────────────────────────────────────
describe("buildAddonExternalReference / parseAddonExternalReference", () => {
  it("roundtrip: parsea lo que construye", () => {
    const ref = buildAddonExternalReference(AI_ADDON_KEY, TENANT);
    expect(ref).toBe(`addon:ai:${TENANT}`);
    expect(parseAddonExternalReference(ref)).toEqual({
      addonKey: "ai",
      tenantId: TENANT,
    });
  });

  it("rechaza el tenantId pelado (= suscripción principal, no add-on)", () => {
    expect(parseAddonExternalReference(TENANT)).toBeNull();
    expect(isAddonReference(TENANT)).toBe(false);
  });

  it("rechaza prefijo desconocido", () => {
    expect(parseAddonExternalReference(`plan:ai:${TENANT}`)).toBeNull();
  });

  it("rechaza tenantId que no es UUID", () => {
    expect(parseAddonExternalReference("addon:ai:not-a-uuid")).toBeNull();
    expect(parseAddonExternalReference("addon:ai:12345")).toBeNull();
  });

  it("rechaza addonKey vacío", () => {
    expect(parseAddonExternalReference(`addon::${TENANT}`)).toBeNull();
  });

  it("rechaza cantidad de segmentos incorrecta", () => {
    expect(parseAddonExternalReference("addon:ai")).toBeNull();
    expect(parseAddonExternalReference(`addon:ai:${TENANT}:extra`)).toBeNull();
  });

  it("rechaza null / vacío", () => {
    expect(parseAddonExternalReference(null)).toBeNull();
    expect(parseAddonExternalReference("")).toBeNull();
    expect(parseAddonExternalReference(undefined)).toBeNull();
  });

  it("isAddonReference true solo para un ref de add-on válido", () => {
    expect(isAddonReference(buildAddonExternalReference("ai", TENANT))).toBe(true);
  });
});

// ── precio del add-on por moneda ──────────────────────────────────────────────
describe("resolveAddonPrice", () => {
  const prices = { monthly_price_ars: 8000, monthly_price_usd: 9 };

  it("ARS → precio ARS mensual", () => {
    expect(resolveAddonPrice(prices, "ARS")).toEqual({
      currency: "ARS",
      amount: 8000,
    });
  });

  it("no-ARS cae a USD (fallback documentado)", () => {
    expect(resolveAddonPrice(prices, "MXN")).toEqual({
      currency: "USD",
      amount: 9,
    });
  });

  it("normaliza la moneda case-insensitive", () => {
    expect(resolveAddonPrice(prices, "ars")?.currency).toBe("ARS");
  });

  it("null si el add-on no tiene precio cobrable en esa moneda", () => {
    const noArs = { monthly_price_ars: null, monthly_price_usd: 9 };
    expect(resolveAddonPrice(noArs, "ARS")).toBeNull();
    const noUsd = { monthly_price_ars: 8000, monthly_price_usd: null };
    expect(resolveAddonPrice(noUsd, "MXN")).toBeNull();
  });

  it("precio en cero = no cobrable (semilla 'incluido')", () => {
    const zero = { monthly_price_ars: 0, monthly_price_usd: 0 };
    expect(resolveAddonPrice(zero, "ARS")).toBeNull();
    expect(resolveAddonPrice(zero, "MXN")).toBeNull();
  });
});

// ── estado de la card ─────────────────────────────────────────────────────────
describe("deriveAddonCardState", () => {
  it("included gana sobre todo", () => {
    expect(
      deriveAddonCardState({ included: true, addonActive: true, pending: true }),
    ).toBe("included");
  });

  it("active gana sobre pending (webhook ya confirmó)", () => {
    expect(
      deriveAddonCardState({ included: false, addonActive: true, pending: true }),
    ).toBe("active");
  });

  it("pending cuando volvió del checkout y el webhook no confirmó", () => {
    expect(
      deriveAddonCardState({ included: false, addonActive: false, pending: true }),
    ).toBe("pending");
  });

  it("available por defecto", () => {
    expect(
      deriveAddonCardState({ included: false, addonActive: false, pending: false }),
    ).toBe("available");
  });
});

// ── toggle ai_included sobre limits ───────────────────────────────────────────
describe("applyAiIncludedToLimits / limitsIncludeAI", () => {
  it("setea ai_included preservando el resto del jsonb", () => {
    const next = applyAiIncludedToLimits({ max_users: 5, ai_included: false }, true);
    expect(next).toEqual({ max_users: 5, ai_included: true });
  });

  it("tolera limits nulo / no-objeto creando uno nuevo", () => {
    expect(applyAiIncludedToLimits(null, true)).toEqual({ ai_included: true });
    expect(applyAiIncludedToLimits("nope", false)).toEqual({ ai_included: false });
  });

  it("limitsIncludeAI es gate estricto (=== true)", () => {
    expect(limitsIncludeAI({ ai_included: true })).toBe(true);
    expect(limitsIncludeAI({ ai_included: "true" })).toBe(false);
    expect(limitsIncludeAI({})).toBe(false);
    expect(limitsIncludeAI(null)).toBe(false);
  });
});

// ── webhook handler del add-on (mock admin) ───────────────────────────────────

/**
 * Mock minimalista del admin client de Supabase para applyAddonUpdate.
 * `rows[table]` controla qué devuelve `.maybeSingle()`. `calls` registra los
 * insert/update por tabla para las aserciones de idempotencia.
 */
function makeAdmin(rows: Record<string, unknown>) {
  const calls = {
    insert: [] as { table: string; values: unknown }[],
    update: [] as { table: string; values: unknown }[],
  };
  function builder(table: string) {
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "is"]) b[m] = () => b;
    b.maybeSingle = async () => ({ data: rows[table] ?? null, error: null });
    b.insert = (values: unknown) => {
      calls.insert.push({ table, values });
      return { select: () => ({ maybeSingle: async () => ({ data: null }) }) };
    };
    b.update = (values: unknown) => {
      calls.update.push({ table, values });
      return { eq: () => ({ data: null, error: null }) };
    };
    return b;
  }
  const admin = { from: (table: string) => builder(table) };
  return { admin: admin as never, calls };
}

function info(
  status: SubscriptionInfo["status"],
  externalReference: string,
  id = "pre_addon_1",
): SubscriptionInfo {
  return {
    providerSubscriptionId: id,
    status,
    rawStatus: status,
    externalReference,
    frequencyMonths: 1,
  };
}

describe("applyAddonUpdate — webhook del add-on", () => {
  const ref = buildAddonExternalReference("ai", TENANT);

  it("authorized sin add-on previo → crea subscription_addons activo (purchase)", async () => {
    // No hay add-on activo; sí hay subscription para enlazar.
    const { admin, calls } = makeAdmin({
      subscription_addons: null,
      subscriptions: { id: "sub-1" },
    });
    const res = await applyAddonUpdate(admin, "ai", TENANT, info("active", ref));
    expect(res.action).toBe("activated");
    const ins = calls.insert.find((c) => c.table === "subscription_addons");
    expect(ins).toBeTruthy();
    expect(ins?.values).toMatchObject({
      tenant_id: TENANT,
      subscription_id: "sub-1",
      addon_key: "ai",
      status: "active",
      source: "purchase",
      provider_subscription_id: "pre_addon_1",
    });
  });

  it("authorized con add-on YA activo → noop (idempotente, no duplica)", async () => {
    const { admin, calls } = makeAdmin({
      subscription_addons: {
        id: "addon-1",
        provider_subscription_id: "pre_addon_1",
        source: "purchase",
      },
    });
    const res = await applyAddonUpdate(admin, "ai", TENANT, info("active", ref));
    expect(res.action).toBe("noop");
    expect(
      calls.insert.filter((c) => c.table === "subscription_addons"),
    ).toHaveLength(0);
  });

  it("authorized sobre un add-on regalado sin preapproval → adopta el preapproval_id", async () => {
    const { admin, calls } = makeAdmin({
      subscription_addons: {
        id: "addon-granted",
        provider_subscription_id: null,
        source: "granted",
      },
    });
    const res = await applyAddonUpdate(admin, "ai", TENANT, info("active", ref));
    expect(res.action).toBe("noop");
    const upd = calls.update.find((c) => c.table === "subscription_addons");
    expect(upd?.values).toMatchObject({ provider_subscription_id: "pre_addon_1" });
  });

  it("cancelled con la fila del preapproval → la marca cancelled", async () => {
    const { admin, calls } = makeAdmin({
      subscription_addons: { id: "addon-1", status: "active" },
    });
    const res = await applyAddonUpdate(admin, "ai", TENANT, info("cancelled", ref));
    expect(res.action).toBe("cancelled");
    const upd = calls.update.find((c) => c.table === "subscription_addons");
    expect(upd?.values).toMatchObject({ status: "cancelled" });
  });

  it("cancelled sin fila → noop", async () => {
    const { admin } = makeAdmin({ subscription_addons: null });
    const res = await applyAddonUpdate(admin, "ai", TENANT, info("cancelled", ref));
    expect(res.action).toBe("noop");
  });

  it("pending / past_due → noop (espera confirmación final)", async () => {
    const { admin } = makeAdmin({ subscription_addons: null });
    expect(
      (await applyAddonUpdate(admin, "ai", TENANT, info("trial", ref))).action,
    ).toBe("noop");
    expect(
      (await applyAddonUpdate(admin, "ai", TENANT, info("past_due", ref))).action,
    ).toBe("noop");
  });
});
