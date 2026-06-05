"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Heading } from "@/components/ui/Typography";
import { requestPasswordReset } from "@/modules/auth/api";
import { recoverSchema, type RecoverInput } from "@/modules/auth/schemas";

export default function RecoverPage() {
  const [sent, setSent] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RecoverInput>({ resolver: zodResolver(recoverSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await requestPasswordReset(values.email);
      setSent(true);
    } catch (e) {
      setServerError(e instanceof Error ? e.message : "Error al enviar");
    }
  });

  if (sent) {
    return (
      <div className="space-y-4 text-center">
        <Heading as="h1">Revisá tu email</Heading>
        <p className="text-sm text-muted-foreground">
          Si existe una cuenta con ese email, te enviamos un link para
          restablecer la contraseña.
        </p>
        <Link
          href="/login"
          className="inline-block text-sm font-semibold text-primary transition hover:brightness-110"
        >
          Volver a ingresar
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div>
        <Heading as="h1">Recuperar contraseña</Heading>
        <p className="mt-1 text-sm text-muted-foreground">
          Te enviamos un link para restablecerla
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

      {serverError && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {serverError}
        </p>
      )}

      <Button type="submit" className="w-full" loading={isSubmitting}>
        Enviar link
      </Button>

      <p className="text-center text-sm">
        <Link
          href="/login"
          className="text-muted-foreground transition hover:text-foreground"
        >
          Volver a ingresar
        </Link>
      </p>
    </form>
  );
}
