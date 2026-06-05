import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  API_KEY_REGEX,
  apiError,
  deriveKeyPrefix,
  hashApiSecret,
  isValidKeyFormat,
  requireScope,
  unauthorized,
  type ApiAuth,
} from "@/lib/api/auth";
import {
  buildSignatureHeader,
  signPayload,
  verifySignatureHeader,
} from "@/lib/api/webhooks";

// =============================================================================
// API pública v1 — tests unitarios de las partes puras / verificables:
//   - formato de key, sha256 estable
//   - shape de error uniforme
//   - requireScope
//   - firma HMAC de webhooks salientes (verificable lado receptor)
// =============================================================================

describe("formato de API key", () => {
  it("acepta nf_live_ + >=32 chars base62", () => {
    expect(isValidKeyFormat("nf_live_" + "a".repeat(40))).toBe(true);
    expect(isValidKeyFormat("nf_live_" + "A1b2".repeat(8))).toBe(true);
    expect(API_KEY_REGEX.test("nf_live_" + "x".repeat(32))).toBe(true);
  });

  it("rechaza prefijo/longitud/charset inválidos", () => {
    expect(isValidKeyFormat("nf_test_" + "a".repeat(40))).toBe(false);
    expect(isValidKeyFormat("nf_live_short")).toBe(false);
    expect(isValidKeyFormat("nf_live_" + "a".repeat(31))).toBe(false);
    expect(isValidKeyFormat("nf_live_" + "a".repeat(20) + "!!!!!!!!!!!!")).toBe(
      false,
    );
    expect(isValidKeyFormat(null)).toBe(false);
    expect(isValidKeyFormat(undefined)).toBe(false);
    expect(isValidKeyFormat("")).toBe(false);
    expect(isValidKeyFormat("Bearer nf_live_" + "a".repeat(40))).toBe(false);
  });
});

describe("hashApiSecret", () => {
  const secret = "nf_live_" + "a".repeat(40);

  it("produce un sha256 hex de 64 chars", () => {
    const hash = hashApiSecret(secret);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("es estable y determinístico para el mismo input", () => {
    expect(hashApiSecret(secret)).toBe(hashApiSecret(secret));
  });

  it("coincide con el sha256 esperado del estándar", () => {
    // sha256("abc") conocido — sanity check del algoritmo.
    expect(hashApiSecret("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("cambia con cualquier diferencia en el secreto", () => {
    expect(hashApiSecret(secret)).not.toBe(
      hashApiSecret(secret.slice(0, -1) + "b"),
    );
  });
});

describe("deriveKeyPrefix", () => {
  it("toma los primeros 12 chars (nf_live_ + 4)", () => {
    const secret = "nf_live_ABCDxyz" + "0".repeat(33);
    expect(deriveKeyPrefix(secret)).toBe("nf_live_ABCD");
    expect(deriveKeyPrefix(secret)).toHaveLength(12);
  });
});

describe("shape de error uniforme", () => {
  it("apiError devuelve { error: { code, message } } con el status mapeado", async () => {
    const res = apiError("missing_scope", "falta scope");
    expect(res.status).toBe(403);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body).toEqual({ error: { code: "missing_scope", message: "falta scope" } });
  });

  it("unauthorized() es 401 invalid_key", async () => {
    const res = unauthorized();
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("invalid_key");
  });

  it("mapea not_found a 404", () => {
    expect(apiError("not_found", "x").status).toBe(404);
  });
});

describe("requireScope", () => {
  const auth: ApiAuth = {
    tenantId: "t1",
    scopes: ["read:productions", "read:stock"],
    keyId: "k1",
  };

  it("devuelve null cuando el scope está presente", () => {
    expect(requireScope(auth, "read:productions")).toBeNull();
    expect(requireScope(auth, "read:stock")).toBeNull();
  });

  it("devuelve un 403 cuando falta el scope", async () => {
    const res = requireScope(auth, "read:dispatches");
    expect(res).not.toBeNull();
    expect(res?.status).toBe(403);
    const body = (await res!.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("missing_scope");
    expect(body.error.message).toContain("read:dispatches");
  });
});

describe("firma de webhook saliente (HMAC-SHA256 sobre ts.body)", () => {
  const secret = "whsec_test_secret_123";
  const body = JSON.stringify({ event: "production.completed", data: { id: "p1" } });
  const ts = 1_700_000_000;

  it("buildSignatureHeader produce ts=...,v1=<hmac> verificable", () => {
    const header = buildSignatureHeader(body, secret, ts);
    expect(header).toMatch(/^ts=1700000000,v1=[0-9a-f]{64}$/);

    // Verificación independiente con el algoritmo crudo (lo que haría el receptor).
    const expected = createHmac("sha256", secret)
      .update(`${ts}.${body}`)
      .digest("hex");
    expect(header).toBe(`ts=${ts},v1=${expected}`);
  });

  it("signPayload coincide con HMAC de ts.body", () => {
    const expected = createHmac("sha256", secret)
      .update(`${ts}.${body}`)
      .digest("hex");
    expect(signPayload(body, secret, ts)).toBe(expected);
  });

  it("verifySignatureHeader acepta una firma válida", () => {
    const header = buildSignatureHeader(body, secret, ts);
    expect(verifySignatureHeader(header, body, secret)).toBe(true);
  });

  it("rechaza body manipulado", () => {
    const header = buildSignatureHeader(body, secret, ts);
    expect(verifySignatureHeader(header, body + " ", secret)).toBe(false);
  });

  it("rechaza secret incorrecto", () => {
    const header = buildSignatureHeader(body, secret, ts);
    expect(verifySignatureHeader(header, body, "otro_secret")).toBe(false);
  });

  it("rechaza header ausente o malformado", () => {
    expect(verifySignatureHeader(null, body, secret)).toBe(false);
    expect(verifySignatureHeader("v1=deadbeef", body, secret)).toBe(false);
    expect(verifySignatureHeader("ts=1700000000", body, secret)).toBe(false);
  });

  it("rechaza si falta el secret", () => {
    const header = buildSignatureHeader(body, secret, ts);
    expect(verifySignatureHeader(header, body, "")).toBe(false);
  });
});
