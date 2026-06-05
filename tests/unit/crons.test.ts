import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildSubscriptionPatch,
  statusDiffers,
} from "@/lib/billing/sync-decisions";
import {
  TRIAL_ENDING_COOLDOWN_HOURS,
  TRIAL_ENDING_MAX_DAYS,
  TRIAL_ENDING_MIN_DAYS,
  daysBetween,
  isWithinTrialEndingWindow,
  isoHoursAgo,
  shouldSendEmail,
} from "@/lib/crons/decisions";
import { isAuthorizedCron } from "@/lib/crons/auth";

// =============================================================================
// tests/unit/crons.test.ts — decisiones puras de los jobs programados.
// Lógica de reconciliación (patch + diff), ventana de trial_ending y anti-spam.
// =============================================================================

describe("buildSubscriptionPatch — patch canónico de reconciliación", () => {
  const sub = { id: "s1", tenant_id: "t1", billing_cycle: "monthly" };
  const NOW = new Date("2026-06-05T12:00:00.000Z");

  it("active: recalcula período (+1 mes mensual) y limpia cancel_at_period_end", () => {
    const patch = buildSubscriptionPatch(
      sub,
      {
        providerSubscriptionId: "pre_1",
        status: "active",
        frequencyMonths: 1,
      },
      NOW
    );
    expect(patch.status).toBe("active");
    expect(patch.provider).toBe("mercadopago");
    expect(patch.provider_subscription_id).toBe("pre_1");
    expect(patch.cancel_at_period_end).toBe(false);
    expect(patch.billing_cycle).toBe("monthly");
    expect(patch.current_period_start).toBe(NOW.toISOString());
    expect(patch.current_period_end).toBe(
      new Date("2026-07-05T12:00:00.000Z").toISOString()
    );
  });

  it("active anual: +12 meses y billing_cycle yearly", () => {
    const patch = buildSubscriptionPatch(
      { id: "s1", tenant_id: "t1", billing_cycle: "yearly" },
      {
        providerSubscriptionId: "pre_y",
        status: "active",
        frequencyMonths: 12,
      },
      NOW
    );
    expect(patch.billing_cycle).toBe("yearly");
    expect(patch.current_period_end).toBe(
      new Date("2027-06-05T12:00:00.000Z").toISOString()
    );
  });

  it("active sin frequencyMonths: cae al billing_cycle local", () => {
    const monthly = buildSubscriptionPatch(
      sub,
      { providerSubscriptionId: "p", status: "active", frequencyMonths: null },
      NOW
    );
    expect(monthly.billing_cycle).toBe("monthly");
    const yearly = buildSubscriptionPatch(
      { id: "s1", tenant_id: "t1", billing_cycle: "yearly" },
      { providerSubscriptionId: "p", status: "active", frequencyMonths: null },
      NOW
    );
    expect(yearly.billing_cycle).toBe("yearly");
  });

  it("past_due / cancelled: solo status, sin tocar el período", () => {
    for (const status of ["past_due", "cancelled"] as const) {
      const patch = buildSubscriptionPatch(
        sub,
        { providerSubscriptionId: "pre_2", status, frequencyMonths: 1 },
        NOW
      );
      expect(patch.status).toBe(status);
      expect(patch.current_period_start).toBeUndefined();
      expect(patch.current_period_end).toBeUndefined();
      expect(patch.cancel_at_period_end).toBeUndefined();
    }
  });
});

describe("statusDiffers — ¿el estado local quedó desactualizado?", () => {
  it("true cuando difieren", () => {
    expect(statusDiffers("trial", "active")).toBe(true);
    expect(statusDiffers("active", "past_due")).toBe(true);
    expect(statusDiffers(null, "active")).toBe(true);
  });
  it("false cuando coinciden (evita churn de fechas)", () => {
    expect(statusDiffers("active", "active")).toBe(false);
    expect(statusDiffers("cancelled", "cancelled")).toBe(false);
  });
});

describe("isWithinTrialEndingWindow — ventana 5-9 días", () => {
  const now = new Date("2026-06-05T00:00:00.000Z");
  const inDays = (n: number) =>
    new Date(now.getTime() + n * 24 * 60 * 60 * 1000).toISOString();

  it("acepta el borde inferior y superior de la ventana", () => {
    expect(isWithinTrialEndingWindow(inDays(TRIAL_ENDING_MIN_DAYS), now)).toBe(
      true
    );
    expect(isWithinTrialEndingWindow(inDays(TRIAL_ENDING_MAX_DAYS), now)).toBe(
      true
    );
    expect(isWithinTrialEndingWindow(inDays(7), now)).toBe(true);
  });

  it("rechaza fuera de la ventana (muy cerca o muy lejos)", () => {
    expect(isWithinTrialEndingWindow(inDays(4), now)).toBe(false);
    expect(isWithinTrialEndingWindow(inDays(10), now)).toBe(false);
    expect(isWithinTrialEndingWindow(inDays(0), now)).toBe(false);
    expect(isWithinTrialEndingWindow(inDays(-3), now)).toBe(false);
  });

  it("rechaza null / fecha inválida", () => {
    expect(isWithinTrialEndingWindow(null, now)).toBe(false);
    expect(isWithinTrialEndingWindow(undefined, now)).toBe(false);
    expect(isWithinTrialEndingWindow("no-es-fecha", now)).toBe(false);
  });
});

describe("shouldSendEmail — predicado anti-spam", () => {
  const now = new Date("2026-06-05T12:00:00.000Z");
  const hoursAgo = (h: number) =>
    new Date(now.getTime() - h * 60 * 60 * 1000).toISOString();

  it("envía si nunca se mandó", () => {
    expect(shouldSendEmail(null, 20, now)).toBe(true);
    expect(shouldSendEmail(undefined, 20, now)).toBe(true);
  });

  it("no reenvía dentro de la ventana de cooldown", () => {
    expect(shouldSendEmail(hoursAgo(5), 20, now)).toBe(false);
    expect(shouldSendEmail(hoursAgo(19), 20, now)).toBe(false);
  });

  it("reenvía pasada la ventana", () => {
    expect(shouldSendEmail(hoursAgo(20), 20, now)).toBe(true);
    expect(shouldSendEmail(hoursAgo(48), 20, now)).toBe(true);
  });

  it("ventana de trial (10 días) bloquea reenvíos cercanos", () => {
    expect(
      shouldSendEmail(hoursAgo(24), TRIAL_ENDING_COOLDOWN_HOURS, now)
    ).toBe(false);
    expect(
      shouldSendEmail(hoursAgo(11 * 24), TRIAL_ENDING_COOLDOWN_HOURS, now)
    ).toBe(true);
  });

  it("fecha inválida se trata como nunca enviado", () => {
    expect(shouldSendEmail("basura", 20, now)).toBe(true);
  });
});

describe("daysBetween / isoHoursAgo — utilidades de tiempo", () => {
  const now = new Date("2026-06-05T12:00:00.000Z");

  it("daysBetween redondea hacia arriba", () => {
    const target = new Date("2026-06-12T00:00:00.000Z"); // 6.5 días
    expect(daysBetween(now, target)).toBe(7);
  });

  it("isoHoursAgo resta horas correctamente", () => {
    expect(isoHoursAgo(20, now)).toBe(
      new Date("2026-06-04T16:00:00.000Z").toISOString()
    );
  });
});

describe("isAuthorizedCron — bearer de Vercel Cron", () => {
  const ORIGINAL = process.env.CRON_SECRET;
  beforeEach(() => {
    process.env.CRON_SECRET = "super-secret";
  });
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = ORIGINAL;
  });

  const reqWith = (auth: string | null) =>
    new Request("https://x/api/cron/x", {
      headers: auth ? { authorization: auth } : {},
    });

  it("acepta el bearer correcto", () => {
    expect(isAuthorizedCron(reqWith("Bearer super-secret"))).toBe(true);
  });

  it("rechaza bearer incorrecto, ausente o sin prefijo", () => {
    expect(isAuthorizedCron(reqWith("Bearer otro"))).toBe(false);
    expect(isAuthorizedCron(reqWith(null))).toBe(false);
    expect(isAuthorizedCron(reqWith("super-secret"))).toBe(false);
  });

  it("fail-closed: sin CRON_SECRET en el entorno rechaza todo", () => {
    delete process.env.CRON_SECRET;
    expect(isAuthorizedCron(reqWith("Bearer super-secret"))).toBe(false);
  });
});
