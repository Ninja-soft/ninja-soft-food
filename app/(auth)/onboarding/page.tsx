"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Heading } from "@/components/ui/Typography";
import { createTenant } from "@/modules/auth/api";
import { INDUSTRY_OPTIONS } from "@/modules/auth/schemas";

// Onboarding de rescate: usuario autenticado sin tenant
// (ej. falló create_tenant durante el signup).
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

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await createTenant(values.businessName, values.industry);
      router.replace("/dashboard");
      router.refresh();
    } catch (e) {
      setServerError(e instanceof Error ? e.message : "Error al crear la empresa");
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div>
        <Heading as="h1">Tu empresa</Heading>
        <p className="mt-1 text-sm text-muted-foreground">
          Un paso más: contanos sobre tu planta para configurar el espacio de
          trabajo.
        </p>
      </div>

      <Input
        label="Empresa"
        placeholder="Nombre de tu empresa o planta"
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
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {serverError}
        </p>
      )}

      <Button type="submit" className="w-full" loading={isSubmitting}>
        Crear empresa
      </Button>
    </form>
  );
}
