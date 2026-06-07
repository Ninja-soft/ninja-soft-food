import { AIError } from "./types";
import type { AIProvider, GenerateJsonInput } from "./types";

// =============================================================================
// lib/ai/gemini.ts — proveedor Google Gemini (generateContent).
//
// SERVER-ONLY: la key (de plataforma) viaja en x-goog-api-key. Fetch directo,
// sin SDK. (Sin `import "server-only"` por el mismo motivo que claude.ts: los
// tests importan la función de parseo.)
//
// Structured output nativo: generationConfig.responseMimeType
// "application/json" + responseSchema fuerza al modelo a devolver JSON puro en
// candidates[0].content.parts[0].text, que parseamos.
// =============================================================================

const GEMINI_API = "https://generativelanguage.googleapis.com/v1beta/models";
export const DEFAULT_GEMINI_MODEL = "gemini-2.0-flash";
const DEFAULT_MAX_TOKENS = 4096;

/**
 * Extrae el objeto estructurado de una respuesta cruda de generateContent.
 * Puro y exportado para test (sin red): junta el texto de las parts del primer
 * candidate y lo parsea como JSON. Lanza AIError si no hay texto o no parsea.
 */
export function parseGeminiResponse(raw: unknown): unknown {
  const body = raw as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
      finishReason?: string;
    }>;
  } | null;

  const parts = body?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts) || parts.length === 0) {
    throw new AIError("gemini", 0, "Gemini no devolvió contenido");
  }

  const text = parts
    .map((p) => p?.text ?? "")
    .join("")
    .trim();
  if (!text) {
    throw new AIError("gemini", 0, "Gemini devolvió contenido vacío");
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new AIError("gemini", 0, "Gemini no devolvió JSON parseable");
  }
}

async function callOnce(
  apiKey: string,
  model: string,
  input: GenerateJsonInput,
): Promise<Response> {
  return fetch(`${GEMINI_API}/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: input.system }] },
      contents: [{ role: "user", parts: [{ text: input.prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: input.schema,
        maxOutputTokens: input.maxTokens ?? DEFAULT_MAX_TOKENS,
      },
    }),
  });
}

/** ¿Conviene reintentar? Solo 429 y 5xx (errores transitorios). */
function isRetryable(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600);
}

export function createGeminiProvider(cfg: {
  apiKey: string;
  model?: string;
}): AIProvider {
  const model = cfg.model?.trim() || DEFAULT_GEMINI_MODEL;

  return {
    providerId: "gemini",

    async generateJson(input: GenerateJsonInput): Promise<unknown> {
      if (!cfg.apiKey) {
        throw new AIError("gemini", 0, "Falta la API key de Gemini");
      }

      let res: Response;
      try {
        res = await callOnce(cfg.apiKey, model, input);
        if (!res.ok && isRetryable(res.status)) {
          // Un solo retry simple ante error transitorio.
          res = await callOnce(cfg.apiKey, model, input);
        }
      } catch (e) {
        throw new AIError(
          "gemini",
          0,
          e instanceof Error ? e.message : "Error de red contra Gemini",
        );
      }

      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new AIError(
          "gemini",
          res.status,
          `Gemini respondió ${res.status}: ${detail.slice(0, 300)}`,
        );
      }

      let body: unknown;
      try {
        body = await res.json();
      } catch {
        throw new AIError("gemini", res.status, "Respuesta de Gemini no es JSON");
      }
      return parseGeminiResponse(body);
    },
  };
}
