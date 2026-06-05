import { describe, expect, it } from "vitest";
import {
  STARTER_RUBROS,
  getStarterTemplates,
} from "@/modules/forms/starterTemplates";
import { templateSchema } from "@/modules/forms/schemas";

// =============================================================================
// tests/unit/starter-templates — el starter pack de planillas por rubro debe
// validar contra templateSchema (mismo contrato que el builder), los críticos
// requieren firma, rubro desconocido devuelve solo comunes y no hay keys de
// field duplicadas dentro de un mismo template.
// =============================================================================

// Kinds críticos: registros que exigen firma de operario (atribuibles).
const CRITICAL_KINDS = new Set(["temperatura", "pcc", "recepcion_mp"]);

// Todos los rubros + un par de desconocidos para el caso fallback.
const ALL_RUBROS = [...STARTER_RUBROS, "inexistente", ""];

describe("getStarterTemplates — catálogo válido", () => {
  for (const rubro of ALL_RUBROS) {
    describe(`rubro "${rubro || "(vacío)"}"`, () => {
      const templates = getStarterTemplates(rubro);

      it("devuelve al menos los comunes", () => {
        expect(templates.length).toBeGreaterThanOrEqual(5);
      });

      it("cada template parsea con templateSchema sin errores", () => {
        for (const t of templates) {
          const parsed = templateSchema.safeParse(t);
          expect(parsed.success, `${rubro} · ${t.name}`).toBe(true);
        }
      });

      it("no hay keys de field duplicadas dentro de un template", () => {
        for (const t of templates) {
          const keys = t.fields.map((f) => f.key);
          expect(new Set(keys).size, `${rubro} · ${t.name}`).toBe(keys.length);
        }
      });

      it("los templates de kind crítico requieren firma", () => {
        for (const t of templates) {
          if (CRITICAL_KINDS.has(t.kind)) {
            expect(t.requires_signature, `${rubro} · ${t.name}`).toBe(true);
          }
        }
      });
    });
  }
});

describe("getStarterTemplates — fallback de rubro", () => {
  it("rubro desconocido devuelve exactamente los comunes (= rubro 'otro')", () => {
    const desconocido = getStarterTemplates("rubro_que_no_existe");
    const otro = getStarterTemplates("otro");
    expect(desconocido.map((t) => t.name)).toEqual(otro.map((t) => t.name));
  });

  it("'otro' no agrega templates específicos sobre los comunes", () => {
    // El base de comunes es la longitud de 'otro' (sin específicos).
    const otro = getStarterTemplates("otro");
    expect(otro).toHaveLength(5);
  });

  it("frigorífico agrega templates específicos sobre los comunes", () => {
    const frig = getStarterTemplates("frigorifico");
    const otro = getStarterTemplates("otro");
    expect(frig.length).toBeGreaterThan(otro.length);
  });
});

describe("getStarterTemplates — contenido de dominio", () => {
  it("incluye el control de temperatura de cámaras en todo rubro", () => {
    for (const rubro of STARTER_RUBROS) {
      const names = getStarterTemplates(rubro).map((t) => t.name);
      expect(names).toContain("Control de temperatura de cámaras");
    }
  });

  it("frigorífico incluye PCC de cocción con mínimo 70°C", () => {
    const pcc = getStarterTemplates("frigorifico").find((t) => t.kind === "pcc");
    expect(pcc).toBeDefined();
    const interna = pcc?.fields.find((f) => f.type === "temperature");
    expect(interna?.min).toBe(70);
  });

  it("no hay nombres de template duplicados dentro de un rubro", () => {
    for (const rubro of STARTER_RUBROS) {
      const names = getStarterTemplates(rubro).map((t) => t.name);
      expect(new Set(names).size, rubro).toBe(names.length);
    }
  });
});
