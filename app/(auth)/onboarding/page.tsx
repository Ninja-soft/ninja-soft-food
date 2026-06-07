"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { Accent, Eyebrow } from "@/components/ui/Typography";
import { createTenant } from "@/modules/auth/api";
import { INDUSTRY_OPTIONS } from "@/modules/auth/schemas";
import { seedStarterTemplates } from "@/modules/forms/api";
import { setTenantCountry } from "@/modules/tenant-profile/api";
import {
  COUNTRY_OPTIONS,
  getCountryProfile,
} from "@/lib/globalization/countries";

// Onboarding de rescate: usuario autenticado sin tenant (ej. falló create_tenant
// durante el signup). El país es OBLIGATORIO: resuelve compliance, moneda,
// unidades y rotulado de todo el producto (un tenant MX no ve octógonos AR).
const onboardingSchema = z.object({
  businessName: z.string().min(2, "Ingresá el nombre de tu empresa"),
  country: z.string().min(2, "Elegí el país"),
  industry: z.enum([
    "frigorifico",
    "panaderia",
    "lacteos",
    "conservas",
    "catering",
    "otro",
  ]),
  taxId: z.string().max(40).optional(),
});
type OnboardingInput = z.infer<typeof onboardingSchema>;

const selectCls =
  "h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20";

// Bandera por ISO-2 vía regional indicator symbols (sin assets).
function flagEmoji(code: string): string {
  return code
    .toUpperCase()
    .replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
}

export default function OnboardingPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<OnboardingInput>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: { industry: "otro", country: "AR" },
  });

  const country = watch("country");
  const taxIdLabel = useMemo(
    () => getCountryProfile(country).taxIdLabel,
    [country],
  );

  async function onSubmit(values: OnboardingInput) {
    setServerError(null);
    try {
      // El país se conoce en este punto: lo pasamos a create_tenant para que el
      // trigger 0013 cree el operating profile correcto de una (sin paso AR→país).
      await createTenant(values.businessName, values.industry, values.country);
      // Refinamos el operating profile con los defaults completos del país
      // (unidades, rotulado, traceability) y guardamos el identificador fiscal.
      await setTenantCountry(values.country, values.taxId ?? null);
      // Starter pack de planillas por rubro (BPM/POES) best-effort.
      void seedStarterTemplates(values.industry).catch((err) =>
        console.warn("seedStarterTemplates", err),
      );
      router.push("/dashboard");
      router.refresh();
    } catch (e) {
      setServerError(
        e instanceof Error ? e.message : "Error al crear la empresa.",
      );
    }
  }

  return (
    <Card>
      <CardHeader>
        <Eyebrow className="mb-2">Onboarding</Eyebrow>
        <CardTitle>
          Tu <Accent>empresa</Accent>
        </CardTitle>
        <CardDescription>
          Un paso más: contanos sobre tu planta para configurar el espacio de
          trabajo.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <Input
            label="Empresa"
            error={errors.businessName?.message}
            {...register("businessName")}
          />

          <div className="w-full">
            <label
              htmlFor="country"
              className="mb-2 block text-sm font-medium text-muted-foreground"
            >
              País de operación
            </label>
            <select id="country" className={selectCls} {...register("country")}>
              {COUNTRY_OPTIONS.map((c) => (
                <option key={c.code} value={c.code}>
                  {flagEmoji(c.code)} {c.name} · {c.currency}
                </option>
              ))}
            </select>
            {errors.country?.message && (
              <p className="mt-1 text-sm text-destructive">
                {errors.country.message}
              </p>
            )}
            <p className="mt-1.5 text-xs text-muted-foreground">
              Define moneda, unidades, marcos regulatorios y rotulado frontal.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="w-full">
              <label
                htmlFor="industry"
                className="mb-2 block text-sm font-medium text-muted-foreground"
              >
                Rubro
              </label>
              <select id="industry" className={selectCls} {...register("industry")}>
                {INDUSTRY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            <Input
              label={taxIdLabel}
              placeholder="Opcional"
              error={errors.taxId?.message}
              {...register("taxId")}
            />
          </div>

          {serverError && (
            <p className="text-sm text-destructive">{serverError}</p>
          )}

          <Button type="submit" loading={isSubmitting} className="w-full">
            Crear empresa
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
