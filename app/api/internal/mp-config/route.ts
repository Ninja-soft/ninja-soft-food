import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireInternal } from "@/modules/internal/server";
import {
  getPlatformMpStatus,
  setPlatformMpConfig,
  mpEncryptionAvailable,
  clearMpCredentialsCache,
} from "@/lib/billing/platform-config";

// =============================================================================
// POST /api/internal/mp-config — credenciales de Mercado Pago de PLATAFORMA.
//
// Guarda access token + webhook secret + public key en internal_settings
// (secretos CIFRADOS), igual que /api/internal/ai-config. Los secretos se
// REDACTAN en el audit (regla dura 4), nunca se loguean en claro. Un secreto
// vacío con config existente = "no cambiar" (write-only, no pisa el guardado).
//
// requireInternal({ api: true }) + admin client. Las credenciales son de
// NinjaSoft (cuenta cobradora de las suscripciones), nunca del cliente.
// =============================================================================

export const runtime = "nodejs";

const REDACTED = "***";

export async function POST(req: Request) {
  const actor = await requireInternal({ api: true });
  if (!actor) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  if (!mpEncryptionAvailable()) {
    return NextResponse.json(
      { error: "missing_encryption_secret" },
      { status: 503 },
    );
  }

  let body: {
    accessToken?: string;
    webhookSecret?: string;
    publicKey?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const accessToken = typeof body.accessToken === "string" ? body.accessToken : "";
  const webhookSecret =
    typeof body.webhookSecret === "string" ? body.webhookSecret : "";
  const publicKey = typeof body.publicKey === "string" ? body.publicKey : undefined;

  const before = await getPlatformMpStatus();

  try {
    await setPlatformMpConfig(
      { accessToken, webhookSecret, publicKey },
      actor.userId,
    );
  } catch (e) {
    const reason = e instanceof Error ? e.message : "save_failed";
    const status = reason === "missing_encryption_secret" ? 503 : 500;
    return NextResponse.json({ error: reason }, { status });
  }

  // Invalida el cache de credenciales efectivas de la pasarela: el próximo
  // cobro/webhook toma las nuevas credenciales sin esperar el TTL. (setPlatformMpConfig
  // ya lo invalida; lo reforzamos acá por si la firma cambia o falla a mitad.)
  clearMpCredentialsCache();

  const after = await getPlatformMpStatus();

  // Audit con los secretos SIEMPRE redactados (regla dura 4: nunca texto plano).
  const admin = createAdminClient();
  await admin.from("audit_logs").insert({
    tenant_id: null,
    actor_user_id: actor.userId,
    entity_type: "internal_settings",
    entity_id: null,
    action: "internal_update_mp_config",
    reason: "Staff Ninja-Soft · credenciales de Mercado Pago de plataforma",
    before_data: before
      ? {
          accessTokenConfigured: before.accessTokenConfigured,
          webhookSecretConfigured: before.webhookSecretConfigured,
          publicKey: before.publicKey,
          accessToken: REDACTED,
          webhookSecret: REDACTED,
        }
      : null,
    after_data: after
      ? {
          accessTokenConfigured: after.accessTokenConfigured,
          webhookSecretConfigured: after.webhookSecretConfigured,
          publicKey: after.publicKey,
          accessToken: REDACTED,
          webhookSecret: REDACTED,
        }
      : null,
  });

  return NextResponse.json({ ok: true });
}
