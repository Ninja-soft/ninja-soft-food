"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Heading } from "@/components/ui/Typography";
import { signIn } from "@/modules/auth/api";
import { loginSchema, type LoginInput } from "@/modules/auth/schemas";

export default function LoginPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await signIn(values);
      router.replace("/dashboard");
      router.refresh();
    } catch (e) {
      setServerError(e instanceof Error ? e.message : "Error al ingresar");
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div>
        <Heading as="h1">Ingresar</Heading>
        <p className="mt-1 text-sm text-muted-foreground">
          Gestioná la trazabilidad de tu planta
        </p>
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
        autoComplete="current-password"
        error={errors.password?.message}
        {...register("password")}
      />

      {serverError && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {serverError}
        </p>
      )}

      <Button type="submit" className="w-full" loading={isSubmitting}>
        Ingresar
      </Button>

      <div className="flex items-center justify-between text-sm">
        <Link
          href="/recover"
          className="text-muted-foreground transition hover:text-foreground"
        >
          Olvidé mi contraseña
        </Link>
        <Link
          href="/signup"
          className="font-semibold text-primary transition hover:brightness-110"
        >
          Crear cuenta
        </Link>
      </div>
    </form>
  );
}
