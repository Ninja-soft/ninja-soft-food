"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Heading } from "@/components/ui/Typography";
import { updatePassword } from "@/modules/auth/api";
import {
  resetPasswordSchema,
  type ResetPasswordInput,
} from "@/modules/auth/schemas";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
  });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await updatePassword(values.password);
      router.replace("/dashboard");
      router.refresh();
    } catch (e) {
      setServerError(e instanceof Error ? e.message : "Error al actualizar");
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div>
        <Heading as="h1">Nueva contraseña</Heading>
        <p className="mt-1 text-sm text-muted-foreground">
          Elegí una contraseña nueva para tu cuenta
        </p>
      </div>

      <Input
        label="Contraseña nueva"
        type="password"
        autoComplete="new-password"
        hint="Mínimo 8 caracteres"
        error={errors.password?.message}
        {...register("password")}
      />
      <Input
        label="Repetir contraseña"
        type="password"
        autoComplete="new-password"
        error={errors.confirm?.message}
        {...register("confirm")}
      />

      {serverError && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {serverError}
        </p>
      )}

      <Button type="submit" className="w-full" loading={isSubmitting}>
        Guardar contraseña
      </Button>
    </form>
  );
}
