import { describe, expect, it } from "vitest";
import {
  type AudienceFilter,
  type AudienceMember,
  CAMPAIGN_PREFIX,
  EMPTY_FILTER,
  MAX_RECIPIENTS,
  campaignVars,
  checkRecipientLimit,
  filterAudience,
  interpolateCampaign,
  matchesFilter,
  parseSend,
  parseAudience,
} from "@/modules/internal-campaigns/schemas";

// -----------------------------------------------------------------------------
// Helpers de test
// -----------------------------------------------------------------------------
function member(over: Partial<AudienceMember> = {}): AudienceMember {
  // Spread DESPUES de los defaults para respetar overrides explícitos (incluido
  // null en planKey/country); un `??` los pisaría con el default.
  return {
    tenantId: "t-1",
    tenantName: "La Jamonera",
    ownerEmail: "owner@negocio.com",
    ownerName: "Lucas",
    status: "active",
    planKey: "pro",
    billingMode: "mercadopago",
    country: "AR",
    ...over,
  };
}
function filter(over: Partial<AudienceFilter> = {}): AudienceFilter {
  return { ...EMPTY_FILTER, ...over };
}

// =============================================================================
describe("interpolateCampaign — variables por destinatario", () => {
  it("reemplaza tenant_name y owner_name", () => {
    const out = interpolateCampaign(
      "Hola {{owner_name}}, novedades para {{tenant_name}}.",
      { tenantName: "La Jamonera", ownerName: "Lucas" },
    );
    expect(out).toBe("Hola Lucas, novedades para La Jamonera.");
  });

  it("usa el nombre del negocio si el owner no tiene nombre", () => {
    const vars = campaignVars({ tenantName: "Frigo SA", ownerName: null });
    expect(vars.owner_name).toBe("Frigo SA");
    expect(
      interpolateCampaign("Hola {{owner_name}}", {
        tenantName: "Frigo SA",
        ownerName: "   ",
      }),
    ).toBe("Hola Frigo SA");
  });

  it("vacía tokens desconocidos (no filtra {{...}} al destinatario)", () => {
    expect(
      interpolateCampaign("Hola {{nombre_raro}} fin", {
        tenantName: "X",
        ownerName: "Y",
      }),
    ).toBe("Hola  fin");
  });

  it("soporta variables repetidas", () => {
    expect(
      interpolateCampaign("{{tenant_name}} {{tenant_name}}", {
        tenantName: "Acme",
        ownerName: "Z",
      }),
    ).toBe("Acme Acme");
  });
});

// =============================================================================
describe("matchesFilter / filterAudience — filtros combinables", () => {
  it("filtro vacío incluye a todos (con email válido)", () => {
    const all = [member(), member({ tenantId: "t-2", status: "trial" })];
    expect(filterAudience(all, EMPTY_FILTER)).toHaveLength(2);
  });

  it("filtra por estado de suscripción", () => {
    expect(matchesFilter(member({ status: "trial" }), filter({ statuses: ["trial"] }))).toBe(true);
    expect(matchesFilter(member({ status: "active" }), filter({ statuses: ["trial"] }))).toBe(false);
  });

  it("filtra por plan", () => {
    expect(matchesFilter(member({ planKey: "pro" }), filter({ planKeys: ["pro"] }))).toBe(true);
    expect(matchesFilter(member({ planKey: "free" }), filter({ planKeys: ["pro"] }))).toBe(false);
    // plan null nunca matchea un filtro de plan explícito
    expect(matchesFilter(member({ planKey: null }), filter({ planKeys: ["pro"] }))).toBe(false);
  });

  it("filtra por modo de cobro", () => {
    expect(
      matchesFilter(member({ billingMode: "manual" }), filter({ billingModes: ["manual"] })),
    ).toBe(true);
    expect(
      matchesFilter(member({ billingMode: "mercadopago" }), filter({ billingModes: ["manual"] })),
    ).toBe(false);
  });

  it("filtra por país (case-insensitive)", () => {
    expect(matchesFilter(member({ country: "ar" }), filter({ countries: ["AR"] }))).toBe(true);
    expect(matchesFilter(member({ country: "MX" }), filter({ countries: ["AR"] }))).toBe(false);
    expect(matchesFilter(member({ country: null }), filter({ countries: ["AR"] }))).toBe(false);
  });

  it("combina filtros con AND (todos deben matchear)", () => {
    const m = member({ status: "active", planKey: "pro", country: "AR" });
    expect(
      matchesFilter(m, filter({ statuses: ["active"], planKeys: ["pro"], countries: ["AR"] })),
    ).toBe(true);
    expect(
      matchesFilter(m, filter({ statuses: ["active"], planKeys: ["pro"], countries: ["MX"] })),
    ).toBe(false);
  });

  it("excluye miembros sin email válido", () => {
    const list = [
      member({ tenantId: "ok" }),
      member({ tenantId: "no-email", ownerEmail: "" }),
      member({ tenantId: "bad", ownerEmail: "no-es-email" }),
    ];
    const res = filterAudience(list, EMPTY_FILTER);
    expect(res.map((m) => m.tenantId)).toEqual(["ok"]);
  });
});

// =============================================================================
describe("checkRecipientLimit — tope de 200", () => {
  it("acepta dentro del límite", () => {
    expect(checkRecipientLimit(0)).toBeNull();
    expect(checkRecipientLimit(MAX_RECIPIENTS)).toBeNull();
  });

  it("rechaza por encima del límite con el conteo exacto", () => {
    const msg = checkRecipientLimit(MAX_RECIPIENTS + 1);
    expect(msg).not.toBeNull();
    expect(msg).toContain(String(MAX_RECIPIENTS));
    expect(msg).toContain(String(MAX_RECIPIENTS + 1));
  });
});

// =============================================================================
describe("parseSend — guard regla 6 + estructura", () => {
  const base = {
    filter: EMPTY_FILTER,
    subject: "Novedades de Ninja Food",
    html: "<p>Hola {{owner_name}}</p>",
  };

  it("acepta una campaña limpia", () => {
    const r = parseSend(base);
    expect(r.ok).toBe(true);
    expect(r.data?.test).toBe(false);
  });

  it("rechaza emojis en el cuerpo", () => {
    expect(parseSend({ ...base, html: "<p>Listo 🎉</p>" }).ok).toBe(false);
  });

  it("rechaza em-dash en el asunto", () => {
    expect(parseSend({ ...base, subject: "Novedades — Ninja Food" }).ok).toBe(false);
  });

  it("acepta el punto medio (·)", () => {
    expect(parseSend({ ...base, subject: "Ninja Food · novedades" }).ok).toBe(true);
  });

  it("rechaza asunto o cuerpo vacíos", () => {
    expect(parseSend({ ...base, subject: "" }).ok).toBe(false);
    expect(parseSend({ ...base, html: "" }).ok).toBe(false);
  });

  it("conserva confirmCount y test", () => {
    const r = parseSend({ ...base, test: true, confirmCount: 42 });
    expect(r.data?.test).toBe(true);
    expect(r.data?.confirmCount).toBe(42);
  });
});

// =============================================================================
describe("parseAudience + CAMPAIGN_PREFIX", () => {
  it("normaliza un filtro vacío", () => {
    const r = parseAudience({ filter: {} });
    expect(r.ok).toBe(true);
    expect(r.data?.filter).toEqual(EMPTY_FILTER);
  });

  it("rechaza códigos de país que no sean ISO-2", () => {
    expect(parseAudience({ filter: { countries: ["ARG"] } }).ok).toBe(false);
  });

  it("rechaza estados desconocidos", () => {
    expect(parseAudience({ filter: { statuses: ["zombie"] } }).ok).toBe(false);
  });

  it("el prefijo de campaña es estable para el historial", () => {
    expect(CAMPAIGN_PREFIX).toBe("[Campaña]");
  });
});
