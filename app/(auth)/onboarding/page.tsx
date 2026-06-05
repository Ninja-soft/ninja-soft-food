"use client";

import { useState } from "react";
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

// Onboarding de rescate: usuario autenticado sin tenant
// (ej. falló create_tenant durante el signup). Mismo patrón visual POS.
const onboardingSchema = z.object({
  businessName: z.string().min(2, "Ingresá el nombre de tu empresa"),
  industry: z.enum([
    "frigorifico",
    "panaderia",
    "lacteos",
    "conservas",
    "catering",
    "otro",
  ]),
});
type OnboardingInput = z.infer<typeof onboardingSchema>;

export default function OnboardingPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<OnboardingInput>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: { industry: "otro" },
  });

  async function onSubmit(values: OnboardingInput) {
    setServerError(null);
    try {
      await createTenant(values.businessName, values.industry);
      // Starter pack de planillas por rubro (BPM/POES) best-effort: no bloquea
      // la navegación al dashboard ni rompe el onboarding si falla (regla 10:
      // son un punto de partida editable).
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
              htmlFor="industry"
              className="mb-2 block text-sm font-medium text-muted-foreground"
            >
              Rubro
            </label>
            <select
              id="industry"
              className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              {...register("industry")}
            >
              {INDUSTRY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
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
