import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Ingresá un email válido"),
  password: z.string().min(1, "Ingresá tu contraseña"),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const INDUSTRY_OPTIONS = [
  { value: "frigorifico", label: "Frigorífico / cárnicos" },
  { value: "panaderia", label: "Panadería / pastas" },
  { value: "lacteos", label: "Lácteos" },
  { value: "conservas", label: "Conservas / elaborados" },
  { value: "catering", label: "Catering / cocina central" },
  { value: "otro", label: "Otro rubro alimenticio" },
] as const;

// Alta liviana: la empresa y el rubro se completan en /onboarding
// (primer login sin tenant).
export const signupSchema = z.object({
  fullName: z.string().min(2, "Ingresá tu nombre"),
  email: z.string().email("Ingresá un email válido"),
  password: z.string().min(8, "Mínimo 8 caracteres"),
});
export type SignupInput = z.infer<typeof signupSchema>;

export const recoverSchema = z.object({
  email: z.string().email("Ingresá un email válido"),
});
export type RecoverInput = z.infer<typeof recoverSchema>;

export const resetPasswordSchema = z
  .object({
    password: z.string().min(8, "Mínimo 8 caracteres"),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: "Las contraseñas no coinciden",
    path: ["confirm"],
  });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
