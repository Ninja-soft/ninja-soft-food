"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  parseWorkbook,
  type RawRow,
} from "@/lib/utils/xlsxImport";
import * as api from "./api";
import {
  IMPORT_MODULES,
  type ImportModuleId,
  type ValidatedRow,
} from "./schemas";

// Hooks de importación: parsear+validar un archivo (sin tocar DB salvo la lectura
// de claves para duplicados) y confirmar la importación de las filas válidas.

export interface ParseAndValidateResult {
  /** Headers crudos detectados en el archivo (para diagnóstico). */
  headers: string[];
  /** Filas validadas con su semáforo. */
  rows: ValidatedRow<unknown>[];
  /** Conteos por estado. */
  counts: { ok: number; error: number; duplicate: number; total: number };
}

/** Caches de invalidación por módulo (alinea con las query keys de cada dominio). */
const INVALIDATE_KEYS: Record<ImportModuleId, string[]> = {
  ingredients: ["ingredients"],
  customers: ["customers"],
  suppliers: ["suppliers"],
};

/** Parsea un .xlsx, lee claves existentes y valida cada fila (semáforo). */
export function useParseAndValidate(moduleId: ImportModuleId) {
  return useMutation<ParseAndValidateResult, Error, File>({
    mutationFn: async (file: File) => {
      const def = IMPORT_MODULES[moduleId];
      const parsed = await parseWorkbook(file, def.template.columns);
      const existing = await api.fetchExistingKeys(moduleId);

      // Set acumulativo: duplicados contra DB Y contra filas previas del archivo.
      const seen = new Set<string>(existing);
      const rows: ValidatedRow<unknown>[] = parsed.rows.map(
        (raw: RawRow, idx: number) => {
          const validated = def.validateRow(raw, idx + 1, seen) as ValidatedRow<unknown>;
          if (validated.status === "ok" && validated.dupKey) {
            seen.add(validated.dupKey);
          }
          return validated;
        },
      );

      const counts = rows.reduce(
        (acc, r) => {
          acc.total++;
          acc[r.status]++;
          return acc;
        },
        { ok: 0, error: 0, duplicate: 0, total: 0 },
      );

      return { headers: parsed.headers, rows, counts };
    },
  });
}

export interface ConfirmImportResult {
  inserted: number;
  rejected: number;
}

/** Confirma la importación: inserta solo las filas con status "ok". */
export function useConfirmImport(moduleId: ImportModuleId) {
  const qc = useQueryClient();
  return useMutation<ConfirmImportResult, Error, ValidatedRow<unknown>[]>({
    mutationFn: async (rows: ValidatedRow<unknown>[]) => {
      const valid = rows.filter((r) => r.status === "ok" && r.data !== undefined);
      const data = valid.map((r) => r.data);
      const { inserted } = await api.insertRows(moduleId, data);
      const rejected = rows.length - inserted;
      return { inserted, rejected };
    },
    onSuccess: () => {
      for (const key of INVALIDATE_KEYS[moduleId]) {
        void qc.invalidateQueries({ queryKey: [key] });
      }
    },
  });
}
