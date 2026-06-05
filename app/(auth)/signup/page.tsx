"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
import { signUp } from "@/modules/auth/api";
import {
  INDUSTRY_OPTIONS,
  signupSchema,
  type SignupInput,
} from "@/modules/auth/schemas";

// Alta de cuenta — espejo del signup del POS.
export default function SignupPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
    defaultValues: { industry: "otro" },
  });

  async function onSubmit(values: SignupInput) {
    setServerError(null);
    try {
      await signUp(values);
      router.push("/dashboard");
      router.refresh();
    } catch (e) {
      setServerError(
        e instanceof Error ? e.message : "Error al crear la cuenta.",
      );
    }
  }

  return (
    <Card>
      <CardHeader>
        <Eyebrow className="mb-2">Alta</Eyebrow>
        <CardTitle>
          Crear <Accent>cuenta</Accent>
        </CardTitle>
        <CardDescription>14 días de prueba, sin tarjeta.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <Input
            label="Tu nombre"
            autoComplete="name"
            error={errors.fullName?.message}
            {...register("fullName")}
          />
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

          <Input
            label="Email"
            type="email"
            autoComplete="email"
            error={errors.email?.message}
            {...register("email")}
          />
          <Input
            label="Contraseña"
            type="password"
            autoComplete="new-password"
            hint="Mínimo 8 caracteres"
            error={errors.password?.message}
            {...register("password")}
          />

          {serverError && (
            <p className="text-sm text-destructive">{serverError}</p>
          )}

          <Button type="submit" loading={isSubmitting} className="w-full">
            Crear cuenta y empezar
          </Button>
        </form>

        <div className="mt-6 text-center text-sm text-muted-foreground">
          <p>
            ¿Ya tenés cuenta?{" "}
            <Link href="/login" className="text-brand-apple hover:underline">
              Iniciar sesión
            </Link>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
