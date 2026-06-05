import { describe, expect, it } from "vitest";
import {
  getCountryProfile,
  getDefaultOperatingProfile,
} from "@/lib/globalization/countries";
import { cn } from "@/lib/utils/cn";
import { formatMoney, formatQty } from "@/lib/utils/format";

describe("scaffolding smoke", () => {
  it("cn merges tailwind classes", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
    expect(cn("text-foreground", false && "hidden")).toBe("text-foreground");
  });

  it("resolves country operating defaults", () => {
    expect(getCountryProfile("US").currency).toBe("USD");
    expect(getCountryProfile("BR").taxIdLabel).toBe("CNPJ");
    expect(getCountryProfile("missing").code).toBe("AR");
    expect(getDefaultOperatingProfile("ES").compliance_frameworks).toContain(
      "EU 178/2002",
    );
  });

  it("formats values with tenant locale and currency", () => {
    expect(formatQty(1234.5, { locale: "en-US" })).toBe("1,234.5");
    expect(formatMoney(12, { locale: "en-US", currency: "USD" })).toBe(
      "$12.00",
    );
  });
});
