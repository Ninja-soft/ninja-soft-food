"use client";

import { useState } from "react";
import Link from "next/link";
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
import { requestPasswordReset } from "@/modules/auth/api";
import { recoverSchema, type RecoverInput } from "@/modules/auth/schemas";

// Recupero de contraseña — espejo del recover del POS.
export default function RecoverPage() {
  const [sent, setSent] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RecoverInput>({ resolver: zodResolver(recoverSchema) });

  async function onSubmit(values: RecoverInput) {
    setServerError(null);
    try {
      await requestPasswordReset(values.email);
      setSent(true);
    } catch (e) {
      setServerError(e instanceof Error ? e.message : "Error al enviar.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <Eyebrow className="mb-2">Recuperación</Eyebrow>
        <CardTitle>
          Recuperar <Accent>contraseña</Accent>
        </CardTitle>
        <CardDescription>
          {sent
            ? "Si existe una cuenta con ese email, te enviamos un link para restablecerla."
            : "Te enviamos un link para restablecerla."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!sent && (
          <form
            onSubmit={handleSubmit(onSubmit)}
            className="space-y-4"
            noValidate
          >
            <Input
              label="Email"
              type="email"
              autoComplete="email"
              error={errors.email?.message}
              {...register("email")}
            />
            {serverError && (
              <p className="text-sm text-destructive">{serverError}</p>
            )}
            <Button type="submit" loading={isSubmitting} className="w-full">
              Enviar link
            </Button>
          </form>
        )}

        <div className="mt-6 text-center text-sm text-muted-foreground">
          <p>
            <Link href="/login" className="text-brand-apple hover:underline">
              Volver a iniciar sesión
            </Link>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
