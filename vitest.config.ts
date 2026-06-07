import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.{ts,tsx}", "modules/**/*.test.{ts,tsx}"],
    exclude: ["node_modules", ".next"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      // `server-only` es un marcador de Next (no es un paquete real instalado):
      // en producción Next lo resuelve a un módulo que lanza si se importa desde
      // un Client Component. En los tests unit (node/jsdom) lo mapeamos al stub
      // vacío que Next trae compilado, para poder importar módulos server-side
      // (lib/ai/config, lib/ai/access) sin que el marcador rompa.
      "server-only": path.resolve(
        __dirname,
        "node_modules/next/dist/compiled/server-only/empty.js",
      ),
    },
  },
});
