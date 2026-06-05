import { createClient } from "@/lib/supabase/client";
import type { LoginInput, SignupInput } from "./schemas";

/** Login con email/contraseña. */
export async function signIn(input: LoginInput) {
  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword(input);
  if (error) throw new Error(translateAuthError(error.message));
}

/**
 * Alta completa: usuario + tenant + trial.
 * 1. signUp (autoconfirm en fase 0)
 * 2. Edge Function create_tenant (tenant + owner + suscripción + claim)
 * 3. refreshSession para que el JWT traiga app_metadata.tenant_id
 */
export async function signUp(input: SignupInput) {
  const supabase = createClient();

  const { error: signUpError } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: { data: { full_name: input.fullName } },
  });
  if (signUpError) throw new Error(translateAuthError(signUpError.message));

  const { error: fnError } = await supabase.functions.invoke("create_tenant", {
    body: {
      businessName: input.businessName,
      industry: input.industry,
    },
  });
  if (fnError) {
    throw new Error(
      "Tu cuenta se creó pero falló la creación de la empresa. Reintentá desde el onboarding.",
    );
  }

  // El claim tenant_id se setea server-side: refrescar para obtener el JWT nuevo
  await supabase.auth.refreshSession();
}

/** Reintento de creación de tenant (onboarding post-signup fallido). */
export async function createTenant(businessName: string, industry: string) {
  const supabase = createClient();
  const { error } = await supabase.functions.invoke("create_tenant", {
    body: { businessName, industry },
  });
  if (error) throw new Error("No pudimos crear la empresa. Reintentá.");
  await supabase.auth.refreshSession();
}

export async function signOut() {
  const supabase = createClient();
  await supabase.auth.signOut();
}

export async function requestPasswordReset(email: string) {
  const supabase = createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/reset-password`,
  });
  if (error) throw new Error(translateAuthError(error.message));
}

export async function updatePassword(password: string) {
  const supabase = createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw new Error(translateAuthError(error.message));
}

function translateAuthError(message: string): string {
  const map: Record<string, string> = {
    "Invalid login credentials": "Email o contraseña incorrectos",
    "User already registered": "Ya existe una cuenta con ese email",
    "Email not confirmed": "Confirmá tu email antes de ingresar",
    "Password should be at least 8 characters":
      "La contraseña debe tener al menos 8 caracteres",
  };
  return map[message] ?? message;
}
