import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClaudeProvider, DEFAULT_CLAUDE_MODEL } from "./claude";
import { createGeminiProvider, DEFAULT_GEMINI_MODEL } from "./gemini";
import type { AIConfig, AIProvider, AIProviderId } from "./types";

// =============================================================================
// lib/ai/config.ts — config cifrada del proveedor de IA de PLATAFORMA.
//
// SERVER-ONLY. La key de IA (Claude/Gemini) es de Ninja-Soft, nunca del cliente
// (decisión de Lucas, doc 11 Gap 3). Vive en internal_settings (key 'ai_config',
// solo service_role / staff) CIFRADA con AES-256-GCM. La clave de cifrado sale
// de env AI_CONFIG_SECRET (32 bytes hex). Si falta el env o el setting,
// getAIConfig() devuelve null (IA deshabilitada) — NUNCA lanza en import.
//
// Formato del blob almacenado en value.enc: "<iv_hex>:<tag_hex>:<ciphertext_hex>".
// =============================================================================

export const AI_CONFIG_KEY = "ai_config";
const ALGO = "aes-256-gcm";
const IV_BYTES = 12; // 96 bits, recomendado para GCM.
const KEY_BYTES = 32; // AES-256.

/** Lee y valida AI_CONFIG_SECRET (32 bytes hex). null si falta o es inválido. */
function getEncryptionKey(): Buffer | null {
  const hex = process.env.AI_CONFIG_SECRET;
  if (!hex) return null;
  let key: Buffer;
  try {
    key = Buffer.from(hex.trim(), "hex");
  } catch {
    return null;
  }
  if (key.length !== KEY_BYTES) return null;
  return key;
}

/** ¿Está disponible el secreto de cifrado? (para gating de UI server-side). */
export function aiEncryptionAvailable(): boolean {
  return getEncryptionKey() !== null;
}

/** Cifra un texto plano a "<iv>:<tag>:<ciphertext>" (todo hex). Exportado para test. */
export function encryptSecret(plain: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plain, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${ciphertext.toString("hex")}`;
}

/** Descifra "<iv>:<tag>:<ciphertext>". Lanza si el blob o la clave no validan. */
export function decryptSecret(blob: string, key: Buffer): string {
  const parts = blob.split(":");
  if (parts.length !== 3) throw new Error("ai_config blob inválido");
  const [ivHex, tagHex, dataHex] = parts;
  const iv = Buffer.from(ivHex!, "hex");
  const tag = Buffer.from(tagHex!, "hex");
  const data = Buffer.from(dataHex!, "hex");
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

function isProviderId(v: unknown): v is AIProviderId {
  return v === "claude" || v === "gemini";
}

/**
 * Lee la config de IA descifrada. Devuelve null (IA deshabilitada) si:
 *  - falta o es inválido AI_CONFIG_SECRET,
 *  - no existe el setting 'ai_config',
 *  - el blob no descifra (clave rotada / dato corrupto).
 * NUNCA lanza: la ausencia de IA no debe romper ningún flujo.
 */
export async function getAIConfig(): Promise<AIConfig | null> {
  const key = getEncryptionKey();
  if (!key) return null;

  let row: { value: unknown } | null = null;
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("internal_settings")
      .select("value")
      .eq("key", AI_CONFIG_KEY)
      .maybeSingle();
    row = data ?? null;
  } catch {
    return null;
  }
  if (!row) return null;

  const value = row.value as {
    provider?: unknown;
    model?: unknown;
    enc?: unknown;
  } | null;
  if (!value || !isProviderId(value.provider) || typeof value.enc !== "string") {
    return null;
  }

  let apiKey: string;
  try {
    apiKey = decryptSecret(value.enc, key);
  } catch {
    return null;
  }
  if (!apiKey) return null;

  const model =
    typeof value.model === "string" && value.model.trim()
      ? value.model.trim()
      : value.provider === "claude"
        ? DEFAULT_CLAUDE_MODEL
        : DEFAULT_GEMINI_MODEL;

  return { provider: value.provider, model, apiKey };
}

/**
 * Guarda la config de IA (cifrando la key). Lanza si falta AI_CONFIG_SECRET
 * (el caller, un route handler de /internal, lo traduce a 500/aviso). El
 * `updatedBy` es el id del staff (auditoría).
 */
export async function setAIConfig(
  cfg: AIConfig,
  updatedBy: string | null,
): Promise<void> {
  const key = getEncryptionKey();
  if (!key) throw new Error("missing_encryption_secret");
  if (!isProviderId(cfg.provider)) throw new Error("invalid_provider");
  if (!cfg.apiKey) throw new Error("missing_api_key");

  const enc = encryptSecret(cfg.apiKey, key);
  const value = { provider: cfg.provider, model: cfg.model, enc };

  const admin = createAdminClient();
  const { error } = await admin.from("internal_settings").upsert(
    {
      key: AI_CONFIG_KEY,
      value,
      updated_by: updatedBy,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );
  if (error) throw new Error("save_failed");
}

/**
 * Metadatos NO sensibles de la config para la UI (nunca la key en claro).
 * Devuelve null si no hay config o no se puede leer.
 */
export async function getAIConfigStatus(): Promise<{
  provider: AIProviderId;
  model: string;
  configured: boolean;
} | null> {
  const cfg = await getAIConfig();
  if (!cfg) return null;
  return { provider: cfg.provider, model: cfg.model, configured: true };
}

/** Construye el AIProvider activo desde una config. Server-side only. */
export function buildProvider(cfg: AIConfig): AIProvider {
  if (cfg.provider === "claude") {
    return createClaudeProvider({ apiKey: cfg.apiKey, model: cfg.model });
  }
  return createGeminiProvider({ apiKey: cfg.apiKey, model: cfg.model });
}

/**
 * Atajo: el proveedor de IA activo de la plataforma, o null si IA no está
 * configurada/habilitada. El caller decide qué hacer ante null (no degradar a
 * features de IA).
 */
export async function getActiveProvider(): Promise<AIProvider | null> {
  const cfg = await getAIConfig();
  if (!cfg) return null;
  return buildProvider(cfg);
}
