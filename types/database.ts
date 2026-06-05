/**
 * Placeholder hasta la primera generación real:
 *   pnpm db:start && pnpm db:reset && pnpm db:types
 * No editar a mano: este archivo se sobreescribe con el esquema generado.
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: Record<string, { Row: Record<string, unknown> }>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
};
