// =============================================================================
// lib/ai/types.ts — contrato agnóstico de proveedor de IA.
//
// Mismo patrón que lib/billing/types.ts: el dominio NUNCA conoce el proveedor
// concreto (Claude / Gemini), habla solo con esta interface. La key es de
// PLATAFORMA (Ninja-Soft), se configura cifrada desde /internal; el cliente
// jamás carga su propia key. Doc 07 §"Fase 7", doc 11 Gap 3.
//
// Structured output: cada provider recibe un JSON Schema y DEBE devolver un
// objeto que lo cumpla (Claude vía tool use, Gemini vía responseSchema). El
// dominio valida después con su propio zod — este contrato solo garantiza
// "JSON parseable", no la forma de negocio.
// =============================================================================

/** Proveedor de IA soportado (= valores válidos de AIConfig.provider). */
export type AIProviderId = "gemini" | "claude";

/** Entrada de una generación estructurada. */
export interface GenerateJsonInput {
  /** Instrucción de sistema (rol/comportamiento del modelo). */
  system: string;
  /** Prompt del usuario (el dato concreto a procesar). */
  prompt: string;
  /**
   * JSON Schema que el resultado DEBE cumplir. Se pasa tal cual al provider
   * (input_schema del tool en Claude, responseSchema en Gemini). El dominio
   * revalida con zod: este schema es el contrato con el modelo, no el de negocio.
   */
  schema: object;
  /** Tope de tokens de salida. Default razonable por provider si se omite. */
  maxTokens?: number;
}

/**
 * Contrato que toda implementación de IA cumple. Server-only: las
 * implementaciones usan la key de plataforma (fetch directo, sin SDK).
 */
export interface AIProvider {
  /** Identificador del proveedor (claude | gemini). */
  readonly providerId: AIProviderId;

  /**
   * Genera un objeto JSON que cumple `schema`. Devuelve `unknown`: el caller
   * valida la forma con zod. Lanza AIError tipado ante fallo de la API.
   */
  generateJson(input: GenerateJsonInput): Promise<unknown>;
}

/**
 * Configuración del proveedor activo. Vive cifrada en internal_settings
 * (key 'ai_config'); apiKey es la key de PLATAFORMA. NUNCA se serializa al
 * cliente: solo el flag "configurada" cruza la red.
 */
export interface AIConfig {
  provider: AIProviderId;
  /** Modelo concreto (ej. claude-sonnet-4-6, gemini-2.0-flash). */
  model: string;
  /** API key de plataforma. Se descifra solo server-side al invocar. */
  apiKey: string;
}

/** Error tipado de un proveedor de IA (status HTTP + mensaje legible). */
export class AIError extends Error {
  /** Status HTTP de la respuesta del proveedor (0 si fue error de red/parseo). */
  readonly status: number;
  /** Identificador del proveedor que falló. */
  readonly providerId: AIProviderId;

  constructor(
    providerId: AIProviderId,
    status: number,
    message: string,
  ) {
    super(message);
    this.name = "AIError";
    this.status = status;
    this.providerId = providerId;
  }
}
