import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AIProviderId } from "./types";

// =============================================================================
// lib/ai/usage.ts — metering best-effort de IA por tenant.
//
// Escribe una fila en ai_usage por cada generación. BEST-EFFORT: cualquier
// fallo (red, RLS, tabla aún no aplicada) se traga — el metering nunca debe
// romper el flujo de negocio que ya generó valor para el cliente. El control de
// costo es importante pero secundario al resultado de la feature.
//
// Writes por service_role (la tabla es solo internal_read para SELECT).
// =============================================================================

export interface AIUsageRecord {
  tenantId: string;
  /** Feature que consumió IA (ej. 'nutrition_table', 'front_labels'). */
  feature: string;
  provider: AIProviderId;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
}

/** Registra un uso de IA. Nunca lanza: loguea y sigue. */
export async function logAIUsage(record: AIUsageRecord): Promise<void> {
  if (!record.tenantId || !record.feature) return;
  try {
    const admin = createAdminClient();
    await admin.from("ai_usage").insert({
      tenant_id: record.tenantId,
      feature: record.feature,
      provider: record.provider,
      model: record.model,
      input_tokens: Math.max(0, Math.round(record.inputTokens ?? 0)),
      output_tokens: Math.max(0, Math.round(record.outputTokens ?? 0)),
    });
  } catch {
    // best-effort: el metering no rompe el flujo.
  }
}
