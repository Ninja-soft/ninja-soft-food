import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// =============================================================================
// tests/unit/ai.test.ts — fundación de Fase 7 (IA).
// Cubre: cifrado/descifrado roundtrip, gating tenantHasAI por 3 vías,
// parseo de respuesta structured de cada provider (fixtures, sin red).
// =============================================================================

// ── Mock del admin client (compartido por config y access) ───────────────────
// Cada test setea `mockResults` por tabla: from(table).<...>.maybeSingle()
// devuelve { data: mockResults[table] ?? null }.
const mockResults: Record<string, unknown> = {};

function makeBuilder(table: string) {
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "eq", "is", "insert", "upsert"]) {
    builder[m] = () => builder;
  }
  builder.maybeSingle = async () => ({ data: mockResults[table] ?? null, error: null });
  // upsert/insert resuelven como thenable cuando se await-ean directo.
  builder.then = (resolve: (v: unknown) => void) =>
    resolve({ data: null, error: null });
  return builder;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => makeBuilder(table),
  }),
}));

import {
  encryptSecret,
  decryptSecret,
  aiEncryptionAvailable,
  getAIConfig,
} from "@/lib/ai/config";
import { tenantHasAI, planLimitsIncludeAI } from "@/lib/ai/access";
import { parseClaudeResponse } from "@/lib/ai/claude";
import { parseGeminiResponse } from "@/lib/ai/gemini";
import { AIError } from "@/lib/ai/types";

const FAKE_SECRET = randomBytes(32).toString("hex");

beforeEach(() => {
  for (const k of Object.keys(mockResults)) delete mockResults[k];
});

afterEach(() => {
  delete process.env.AI_CONFIG_SECRET;
  vi.restoreAllMocks();
});

// ── Cifrado / descifrado ─────────────────────────────────────────────────────
describe("encryptSecret / decryptSecret", () => {
  const key = Buffer.from(FAKE_SECRET, "hex");

  it("roundtrip: descifra lo que cifró", () => {
    const plain = "sk-ant-platform-key-123456";
    const blob = encryptSecret(plain, key);
    expect(blob).not.toContain(plain);
    expect(blob.split(":")).toHaveLength(3); // iv:tag:ciphertext
    expect(decryptSecret(blob, key)).toBe(plain);
  });

  it("falla al descifrar con otra clave", () => {
    const blob = encryptSecret("hola", key);
    const otherKey = Buffer.from(randomBytes(32));
    expect(() => decryptSecret(blob, otherKey)).toThrow();
  });

  it("falla con un blob manipulado (auth tag GCM)", () => {
    const blob = encryptSecret("hola", key);
    const [iv, tag, data] = blob.split(":");
    // Corromper el ciphertext invalida el tag de autenticación.
    const corrupted = `${iv}:${tag}:${data!.slice(0, -2)}ff`;
    expect(() => decryptSecret(corrupted, key)).toThrow();
  });
});

describe("aiEncryptionAvailable", () => {
  it("false si falta AI_CONFIG_SECRET", () => {
    delete process.env.AI_CONFIG_SECRET;
    expect(aiEncryptionAvailable()).toBe(false);
  });

  it("false si AI_CONFIG_SECRET no es 32 bytes hex", () => {
    process.env.AI_CONFIG_SECRET = "deadbeef"; // 4 bytes
    expect(aiEncryptionAvailable()).toBe(false);
  });

  it("true con un secreto válido (32 bytes hex)", () => {
    process.env.AI_CONFIG_SECRET = FAKE_SECRET;
    expect(aiEncryptionAvailable()).toBe(true);
  });
});

describe("getAIConfig", () => {
  it("devuelve null si falta el env (IA deshabilitada, sin throw)", async () => {
    delete process.env.AI_CONFIG_SECRET;
    mockResults.internal_settings = {
      value: { provider: "claude", model: "x", enc: "irrelevante" },
    };
    await expect(getAIConfig()).resolves.toBeNull();
  });

  it("devuelve null si no hay setting", async () => {
    process.env.AI_CONFIG_SECRET = FAKE_SECRET;
    // sin mockResults.internal_settings -> maybeSingle data null
    await expect(getAIConfig()).resolves.toBeNull();
  });

  it("descifra y devuelve la config cuando todo está", async () => {
    process.env.AI_CONFIG_SECRET = FAKE_SECRET;
    const key = Buffer.from(FAKE_SECRET, "hex");
    const enc = encryptSecret("real-key-987", key);
    mockResults.internal_settings = {
      value: { provider: "gemini", model: "gemini-2.0-flash", enc },
    };
    const cfg = await getAIConfig();
    expect(cfg).toEqual({
      provider: "gemini",
      model: "gemini-2.0-flash",
      apiKey: "real-key-987",
    });
  });
});

// ── Gating tenantHasAI (3 vías) ──────────────────────────────────────────────
describe("planLimitsIncludeAI", () => {
  it("true solo con ai_included === true (gate estricto)", () => {
    expect(planLimitsIncludeAI({ ai_included: true })).toBe(true);
    expect(planLimitsIncludeAI({ ai_included: "true" })).toBe(false);
    expect(planLimitsIncludeAI({ ai_included: 1 })).toBe(false);
    expect(planLimitsIncludeAI({})).toBe(false);
    expect(planLimitsIncludeAI(null)).toBe(false);
  });
});

describe("tenantHasAI", () => {
  it("vía (a): plan con limits.ai_included", async () => {
    mockResults.subscriptions = { plan: { limits: { ai_included: true } } };
    await expect(tenantHasAI("t1")).resolves.toBe(true);
  });

  it("vía (b): add-on activo de IA", async () => {
    mockResults.subscriptions = { plan: { limits: { ai_included: false } } };
    mockResults.subscription_addons = { id: "addon-1" };
    await expect(tenantHasAI("t1")).resolves.toBe(true);
  });

  it("vía (c): tenant_flags ai_enabled", async () => {
    mockResults.subscriptions = { plan: { limits: {} } };
    mockResults.subscription_addons = null;
    mockResults.tenant_flags = { enabled: true };
    await expect(tenantHasAI("t1")).resolves.toBe(true);
  });

  it("false si ninguna vía habilita", async () => {
    mockResults.subscriptions = { plan: { limits: { ai_included: false } } };
    mockResults.subscription_addons = null;
    mockResults.tenant_flags = { enabled: false };
    await expect(tenantHasAI("t1")).resolves.toBe(false);
  });

  it("false con tenantId vacío (sin tocar DB)", async () => {
    await expect(tenantHasAI("")).resolves.toBe(false);
  });
});

// ── Parseo de respuestas structured ──────────────────────────────────────────
describe("parseClaudeResponse", () => {
  it("extrae el input del tool_use 'emit'", () => {
    const raw = {
      content: [
        { type: "text", text: "ignorame" },
        { type: "tool_use", name: "emit", input: { ok: true, value: 42 } },
      ],
      stop_reason: "tool_use",
    };
    expect(parseClaudeResponse(raw)).toEqual({ ok: true, value: 42 });
  });

  it("lanza AIError si no hay tool_use emit", () => {
    const raw = { content: [{ type: "text", text: "solo texto" }] };
    expect(() => parseClaudeResponse(raw)).toThrow(AIError);
  });

  it("lanza AIError si no hay content", () => {
    expect(() => parseClaudeResponse({})).toThrow(AIError);
  });
});

describe("parseGeminiResponse", () => {
  it("parsea el JSON de las parts del primer candidate", () => {
    const raw = {
      candidates: [
        {
          content: { parts: [{ text: '{"ok":true,"items":[1,2]}' }] },
          finishReason: "STOP",
        },
      ],
    };
    expect(parseGeminiResponse(raw)).toEqual({ ok: true, items: [1, 2] });
  });

  it("junta varias parts antes de parsear", () => {
    const raw = {
      candidates: [{ content: { parts: [{ text: '{"a":' }, { text: "1}" }] } }],
    };
    expect(parseGeminiResponse(raw)).toEqual({ a: 1 });
  });

  it("lanza AIError si no hay candidates", () => {
    expect(() => parseGeminiResponse({ candidates: [] })).toThrow(AIError);
  });

  it("lanza AIError si el texto no es JSON", () => {
    const raw = { candidates: [{ content: { parts: [{ text: "no json" }] } }] };
    expect(() => parseGeminiResponse(raw)).toThrow(AIError);
  });
});
