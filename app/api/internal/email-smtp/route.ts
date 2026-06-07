import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireInternal } from "@/modules/internal/server";
import { parseSmtp } from "@/modules/internal-emails/schemas";

// =============================================================================
// POST /api/internal/email-smtp — guarda la config SMTP del sistema (id=1).
//
// system_email_smtp es SOLO service_role: la escritura va por admin client tras
// requireInternal({ api: true }) (defensa server-side). Audita before/after en
// audit_logs (regla dura 4) REDACTANDO la password: nunca se loguea en claro.
// password vacia = "no cambiar" (no pisa el valor guardado).
// =============================================================================

export const runtime = "nodejs";

const REDACTED = "***";

export async function POST(req: Request) {
  const actor = await requireInternal({ api: true });
  if (!actor) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = parseSmtp(raw);
  if (!parsed.ok || !parsed.data) {
    return NextResponse.json(
      { error: parsed.error ?? "invalid_input" },
      { status: 400 },
    );
  }
  const input = parsed.data;

  const admin = createAdminClient();

  // Snapshot previo para el before/after (password redactada).
  const { data: current } = await admin
    .from("system_email_smtp")
    .select("hostname, port, username, password, from_email, from_name, secure")
    .eq("id", 1)
    .maybeSingle();

  // password vacia -> conservar la guardada. Si no hay fila y viene vacia, queda
  // string vacio (la columna es not null): el envio fallara con smtp credentials
  // si el server las exige, pero no rompemos la escritura.
  const nextPassword =
    input.password && input.password.length > 0
      ? input.password
      : (current?.password ?? "");

  const row = {
    id: 1,
    hostname: input.hostname,
    port: input.port,
    username: input.username ?? "",
    password: nextPassword,
    from_email: input.from_email,
    from_name: input.from_name,
    secure: input.secure,
    updated_at: new Date().toISOString(),
  };

  const { error: upErr } = await admin
    .from("system_email_smtp")
    .upsert(row, { onConflict: "id" });
  if (upErr) {
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }

  // Audit con password REDACTADA en ambos lados (nunca texto plano).
  const before = current
    ? {
        hostname: current.hostname,
        port: current.port,
        username: current.username,
        password: current.password ? REDACTED : null,
        from_email: current.from_email,
        from_name: current.from_name,
        secure: current.secure,
      }
    : null;
  const after = {
    hostname: row.hostname,
    port: row.port,
    username: row.username,
    password: row.password ? REDACTED : null,
    from_email: row.from_email,
    from_name: row.from_name,
    secure: row.secure,
  };

  await admin.from("audit_logs").insert({
    tenant_id: null,
    actor_user_id: actor.userId,
    entity_type: "system_email_smtp",
    entity_id: null,
    action: "internal_update_smtp",
    reason: "Staff Ninja-Soft · config SMTP del sistema",
    before_data: before,
    after_data: after,
  });

  return NextResponse.json({ ok: true });
}
