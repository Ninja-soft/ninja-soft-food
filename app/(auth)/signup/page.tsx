"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Heading } from "@/components/ui/Typography";
import { signUp } from "@/modules/auth/api";
import {
  INDUSTRY_OPTIONS,
  signupSchema,
  type SignupInput,
} from "@/modules/auth/schemas";

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

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await signUp(values);
      router.replace("/dashboard");
      router.refresh();
    } catch (e) {
      setServerError(e instanceof Error ? e.message : "Error al crear la cuenta");
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div>
        <Heading as="h1">Crear cuenta</Heading>
        <p className="mt-1 text-sm text-muted-foreground">
          14 días de prueba · sin tarjeta
        </p>
      </div>

      <Input
        label="Tu nombre"
        autoComplete="name"
        placeholder="Nombre y apellido"
        error={errors.fullName?.message}
        {...register("fullName")}
      />
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

      <Input
        label="Email"
        type="email"
        autoComplete="email"
        placeholder="nombre@empresa.com"
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
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {serverError}
        </p>
      )}

      <Button type="submit" className="w-full" loading={isSubmitting}>
        Crear cuenta y empezar
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        ¿Ya tenés cuenta?{" "}
        <Link
          href="/login"
          className="font-semibold text-primary transition hover:brightness-110"
        >
          Ingresar
        </Link>
      </p>
    </form>
  );
}
