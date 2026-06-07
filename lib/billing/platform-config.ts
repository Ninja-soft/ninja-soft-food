import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

// =============================================================================
// lib/billing/platform-config.ts — credenciales de pasarela de PLATAFORMA.
//
// SERVER-ONLY. Las credenciales de Mercado Pago de NinjaSoft (access token de
// la cuenta cobradora, secret del webhook, public key) son de la plataforma,
// nunca del cliente. Viven en internal_settings (key 'mp_config', solo
// service_role / staff) con los secretos CIFRADOS con AES-256-GCM, igual que la
// config de IA (lib/ai/config.ts). La clave de cifrado sale del env
// AI_CONFIG_SECRET (32 bytes hex) — el mismo secreto de servidor que ya cifra la
// key de IA. Si falta el env, getPlatformMpConfig() devuelve null (la pasarela
// cae al fallback de env vars) — NUNCA lanza en import.
//
// Formato del blob por secreto: "<iv_hex>:<tag_hex>:<ciphertext_hex>".
// =============================================================================

export const MP_CONFIG_KEY = "mp_config";
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
export function mpEncryptionAvailable(): boolean {
  return getEncryptionKey() !== null;
}

/** Cifra un texto plano a "<iv>:<tag>:<ciphertext>" (todo hex). */
function encryptSecret(plain: string, key: Buffer): string {
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
function decryptSecret(blob: string, key: Buffer): string {
  const parts = blob.split(":");
  if (parts.length !== 3) throw new Error("mp_config blob inválido");
  const [ivHex, tagHex, dataHex] = parts;
  const iv = Buffer.from(ivHex!, "hex");
  const tag = Buffer.from(tagHex!, "hex");
  const data = Buffer.from(dataHex!, "hex");
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString(
    "utf8",
  );
}

/** Credenciales en claro de la cuenta de Mercado Pago de la plataforma. */
export interface PlatformMpConfig {
  accessToken: string | null;
  webhookSecret: string | null;
  publicKey: string | null;
}

/** Metadatos NO sensibles para la UI: qué está configurado (nunca el secreto). */
export interface PlatformMpStatus {
  accessTokenConfigured: boolean;
  webhookSecretConfigured: boolean;
  publicKey: string | null;
  updatedAt: string | null;
}

type StoredValue = {
  // Cada secreto va cifrado por separado para poder actualizarlos individualmente.
  access_token_enc?: string | null;
  webhook_secret_enc?: string | null;
  // La public key NO es secreta (se usa en el front del checkout): se guarda en claro.
  public_key?: string | null;
};

async function readStored(): Promise<{
  value: StoredValue | null;
  updatedAt: string | null;
}> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("internal_settings")
      .select("value, updated_at")
      .eq("key", MP_CONFIG_KEY)
      .maybeSingle();
    return {
      value: (data?.value as StoredValue | null) ?? null,
      updatedAt: (data?.updated_at as string | null) ?? null,
    };
  } catch {
    return { value: null, updatedAt: null };
  }
}

/**
 * Lee las credenciales de MP descifradas. Devuelve null si falta el secreto de
 * cifrado o no hay config; NUNCA lanza. La pasarela (lib/billing/mercadopago)
 * puede preferir esto y caer al env si es null.
 */
export async function getPlatformMpConfig(): Promise<PlatformMpConfig | null> {
  const key = getEncryptionKey();
  if (!key) return null;

  const { value } = await readStored();
  if (!value) return null;

  function dec(blob: string | null | undefined): string | null {
    if (!blob) return null;
    try {
      const plain = decryptSecret(blob, key!);
      return plain || null;
    } catch {
      return null;
    }
  }

  const accessToken = dec(value.access_token_enc);
  const webhookSecret = dec(value.webhook_secret_enc);
  const publicKey =
    typeof value.public_key === "string" && value.public_key.trim()
      ? value.public_key.trim()
      : null;

  if (!accessToken && !webhookSecret && !publicKey) return null;
  return { accessToken, webhookSecret, publicKey };
}

/** Estado NO sensible para la UI (qué hay configurado), nunca los secretos. */
export async function getPlatformMpStatus(): Promise<PlatformMpStatus | null> {
  const { value, updatedAt } = await readStored();
  if (!value) return null;
  return {
    accessTokenConfigured: Boolean(value.access_token_enc),
    webhookSecretConfigured: Boolean(value.webhook_secret_enc),
    publicKey:
      typeof value.public_key === "string" && value.public_key.trim()
        ? value.public_key.trim()
        : null,
    updatedAt,
  };
}

export interface SetPlatformMpInput {
  /** undefined = no cambiar; "" = no cambiar (write-only, vacío no pisa). */
  accessToken?: string;
  webhookSecret?: string;
  /** No secreta: "" sí permite limpiarla. */
  publicKey?: string;
}

/**
 * Guarda las credenciales de MP (cifrando los secretos). Solo pisa los campos
 * provistos no vacíos (write-only): un secreto vacío conserva el guardado. Lanza
 * si falta AI_CONFIG_SECRET (el caller lo traduce a 503/aviso). `updatedBy` es
 * el id del staff (auditoría).
 */
export async function setPlatformMpConfig(
  input: SetPlatformMpInput,
  updatedBy: string | null,
): Promise<void> {
  const key = getEncryptionKey();
  if (!key) throw new Error("missing_encryption_secret");

  const { value: existing } = await readStored();
  const next: StoredValue = { ...(existing ?? {}) };

  if (input.accessToken && input.accessToken.trim()) {
    next.access_token_enc = encryptSecret(input.accessToken.trim(), key);
  }
  if (input.webhookSecret && input.webhookSecret.trim()) {
    next.webhook_secret_enc = encryptSecret(input.webhookSecret.trim(), key);
  }
  // public_key no es secreta: "" la limpia; ausente la conserva.
  if (input.publicKey !== undefined) {
    const pk = input.publicKey.trim();
    next.public_key = pk || null;
  }

  const admin = createAdminClient();
  const { error } = await admin.from("internal_settings").upsert(
    {
      key: MP_CONFIG_KEY,
      value: next,
      updated_by: updatedBy,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );
  if (error) throw new Error("save_failed");
}
