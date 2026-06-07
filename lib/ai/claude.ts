import { AIError } from "./types";
import type { AIProvider, GenerateJsonInput } from "./types";

// =============================================================================
// lib/ai/claude.ts — proveedor Anthropic (Messages API).
//
// SERVER-ONLY: la key (de plataforma) viaja en x-api-key. Fetch directo a la
// API, sin SDK (mismo criterio que lib/billing/mercadopago.ts). Sin
// `import "server-only"` a propósito: los tests unit de vitest importan la
// función de parseo, y ese package lanza fuera de react-server. La garantía
// real: solo se invoca con la AIConfig descifrada server-side.
//
// Structured output: la Messages API no tiene "response_format", así que se
// fuerza vía TOOL USE — se declara un único tool `emit` cuyo input_schema es el
// JSON Schema pedido y se obliga al modelo a llamarlo con
// tool_choice {type:"tool", name:"emit"}. El resultado sale en
// content[].input del tool_use block.
// =============================================================================

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
export const DEFAULT_CLAUDE_MODEL = "claude-sonnet-4-6";
const DEFAULT_MAX_TOKENS = 4096;
const EMIT_TOOL = "emit";

/**
 * Extrae el objeto estructurado de una respuesta cruda de la Messages API.
 * Puro y exportado para test (sin red): busca el bloque tool_use del tool
 * `emit` y devuelve su `input`. Lanza AIError si la respuesta no trae el tool.
 */
export function parseClaudeResponse(raw: unknown): unknown {
  const body = raw as {
    content?: Array<{ type?: string; name?: string; input?: unknown }>;
    stop_reason?: string;
  } | null;

  const blocks = body?.content;
  if (!Array.isArray(blocks)) {
    throw new AIError("claude", 0, "Respuesta de Claude sin content");
  }

  const toolBlock = blocks.find(
    (b) => b?.type === "tool_use" && b?.name === EMIT_TOOL,
  );
  if (!toolBlock || toolBlock.input === undefined) {
    throw new AIError(
      "claude",
      0,
      "Claude no devolvió el resultado estructurado (tool emit)",
    );
  }
  return toolBlock.input;
}

async function callOnce(
  apiKey: string,
  model: string,
  input: GenerateJsonInput,
): Promise<Response> {
  return fetch(ANTHROPIC_API, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: input.maxTokens ?? DEFAULT_MAX_TOKENS,
      system: input.system,
      tools: [
        {
          name: EMIT_TOOL,
          description:
            "Emite el resultado estructurado. Llamá a este tool con el objeto pedido.",
          input_schema: input.schema,
        },
      ],
      tool_choice: { type: "tool", name: EMIT_TOOL },
      messages: [{ role: "user", content: input.prompt }],
    }),
  });
}

/** ¿Conviene reintentar? Solo 429 y 5xx (errores transitorios). */
function isRetryable(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600);
}

export function createClaudeProvider(cfg: {
  apiKey: string;
  model?: string;
}): AIProvider {
  const model = cfg.model?.trim() || DEFAULT_CLAUDE_MODEL;

  return {
    providerId: "claude",

    async generateJson(input: GenerateJsonInput): Promise<unknown> {
      if (!cfg.apiKey) {
        throw new AIError("claude", 0, "Falta la API key de Claude");
      }

      let res: Response;
      try {
        res = await callOnce(cfg.apiKey, model, input);
        if (!res.ok && isRetryable(res.status)) {
          // Un solo retry simple ante error transitorio (sin backoff complejo).
          res = await callOnce(cfg.apiKey, model, input);
        }
      } catch (e) {
        throw new AIError(
          "claude",
          0,
          e instanceof Error ? e.message : "Error de red contra Claude",
        );
      }

      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new AIError(
          "claude",
          res.status,
          `Claude respondió ${res.status}: ${detail.slice(0, 300)}`,
        );
      }

      let body: unknown;
      try {
        body = await res.json();
      } catch {
        throw new AIError("claude", res.status, "Respuesta de Claude no es JSON");
      }
      return parseClaudeResponse(body);
    },
  };
}
