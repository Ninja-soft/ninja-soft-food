import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireInternal } from "@/modules/internal/server";
import {
  getAIConfig,
  setAIConfig,
  aiEncryptionAvailable,
  buildProvider,
} from "@/lib/ai/config";
import { DEFAULT_CLAUDE_MODEL } from "@/lib/ai/claude";
import { DEFAULT_GEMINI_MODEL } from "@/lib/ai/gemini";
import { AIError } from "@/lib/ai/types";
import type { AIProviderId } from "@/lib/ai/types";

// =============================================================================
// POST /api/internal/ai-config — config de IA de PLATAFORMA (Fase 7).
//
// action = "save":  guarda provider + model + apiKey (CIFRADA en
//          internal_settings). La key se REDACTA en el audit (regla dura 4),
//          nunca se loguea en claro. apiKey vacía con config existente = "no
//          cambiar la key" (no pisa la guardada).
// action = "test":  hace un generateJson trivial con la key provista (o la
//          guardada) y devuelve ok/error — valida la credencial sin persistirla.
//
// requireInternal({ api: true }) + admin client. La key de IA es de Ninja-Soft,
// nunca del cliente (doc 11 Gap 3).
// =============================================================================

export const runtime = "nodejs";

const REDACTED = "***";

function isProviderId(v: unknown): v is AIProviderId {
  return v === "claude" || v === "gemini";
}

function defaultModel(provider: AIProviderId): string {
  return provider === "claude" ? DEFAULT_CLAUDE_MODEL : DEFAULT_GEMINI_MODEL;
}

const TEST_SCHEMA = {
  type: "object",
  properties: { ok: { type: "boolean" } },
  required: ["ok"],
} as const;

export async function POST(req: Request) {
  const actor = await requireInternal({ api: true });
  if (!actor) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  if (!aiEncryptionAvailable()) {
    return NextResponse.json(
      { error: "missing_encryption_secret" },
      { status: 503 },
    );
  }

  let body: {
    action?: string;
    provider?: string;
    model?: string;
    apiKey?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const action = String(body.action ?? "save").trim();
  const provider = body.provider;
  if (!isProviderId(provider)) {
    return NextResponse.json({ error: "invalid_provider" }, { status: 400 });
  }
  const model = String(body.model ?? "").trim() || defaultModel(provider);
  const apiKey = String(body.apiKey ?? "");

  // ── TEST ──────────────────────────────────────────────────────────────────
  if (action === "test") {
    // Usa la key provista; si viene vacía, cae a la guardada del mismo provider.
    let key = apiKey;
    let testModel = model;
    if (!key) {
      const existing = await getAIConfig();
      if (existing && existing.provider === provider) {
        key = existing.apiKey;
        testModel = model || existing.model;
      }
    }
    if (!key) {
      return NextResponse.json(
        { ok: false, error: "missing_api_key" },
        { status: 400 },
      );
    }
    try {
      const result = await buildProvider({
        provider,
        model: testModel,
        apiKey: key,
      }).generateJson({
        system:
          "Sos un verificador de conexión. Respondé únicamente el objeto pedido.",
        prompt: 'Devolvé {"ok": true}.',
        schema: TEST_SCHEMA,
        maxTokens: 64,
      });
      return NextResponse.json({ ok: true, result });
    } catch (e) {
      const status = e instanceof AIError ? e.status : 0;
      const message = e instanceof Error ? e.message : "Error desconocido";
      return NextResponse.json({ ok: false, status, error: message });
    }
  }

  // ── SAVE ──────────────────────────────────────────────────────────────────
  if (action !== "save") {
    return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  }

  const existing = await getAIConfig();
  // apiKey vacía + config existente del mismo provider = conservar la guardada.
  let nextKey = apiKey;
  if (!nextKey) {
    if (existing && existing.provider === provider) {
      nextKey = existing.apiKey;
    } else {
      return NextResponse.json({ error: "missing_api_key" }, { status: 400 });
    }
  }

  try {
    await setAIConfig({ provider, model, apiKey: nextKey }, actor.userId);
  } catch (e) {
    const reason = e instanceof Error ? e.message : "save_failed";
    return NextResponse.json({ error: reason }, { status: 500 });
  }

  // Audit con la key SIEMPRE redactada (regla dura 4: nunca texto plano).
  const admin = createAdminClient();
  await admin.from("audit_logs").insert({
    tenant_id: null,
    actor_user_id: actor.userId,
    entity_type: "internal_settings",
    entity_id: null,
    action: "internal_update_ai_config",
    reason: "Staff Ninja-Soft · config de IA de plataforma",
    before_data: existing
      ? { provider: existing.provider, model: existing.model, apiKey: REDACTED }
      : null,
    after_data: { provider, model, apiKey: REDACTED },
  });

  return NextResponse.json({ ok: true });
}
