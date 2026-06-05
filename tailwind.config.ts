import type { Config } from "tailwindcss";

/**
 * Design system Ninja Food — misma arquitectura que el POS:
 * los valores viven como CSS vars por tema en app/globals.css,
 * acá solo se mapean a utilidades. Prohibido hex suelto en componentes.
 */
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./modules/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--card-foreground)",
        },
        popover: {
          DEFAULT: "var(--popover)",
          foreground: "var(--popover-foreground)",
        },
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)",
        },
        secondary: {
          DEFAULT: "var(--secondary)",
          foreground: "var(--secondary-foreground)",
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          foreground: "var(--accent-foreground)",
        },
        destructive: {
          DEFAULT: "var(--destructive)",
          foreground: "var(--destructive-foreground)",
        },
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
        // Marca fija — ramp esmeralda saturado (soft/base/deep), espejo del
        // ramp flame del POS (flameSoft/flame/flameDeep). No cambia con el tema.
        brand: {
          emeraldSoft: "#22C55E", // stop brillante: ring, glow, top de gradientes
          emerald: "#16A34A", // base: identidad primaria
          emeraldDeep: "#15803D", // forest: bottom de gradientes y primary en light
          apple: "#8CBF2F",
          lime: "#C6D420",
          ink: "#04140A",
          // Texto secundario sobre fondos de marca oscuros
          // (equivalente del ninja-lavender del POS)
          mist: "#A9C4A6",
        },
      },
      borderRadius: {
        ninjaSm: "10px",
        ninjaMd: "14px",
        ninjaLg: "20px",
        ninjaXl: "28px",
        ninjaFull: "999px",
      },
      fontFamily: {
        // Configurables por el usuario en Apariencia (patrón POS)
        display: ["var(--font-display)", "sans-serif"],
        price: ["var(--font-price)", "ui-monospace", "monospace"],
        sans: ["var(--font-inter)", "sans-serif"],
        mono: ["var(--font-jetbrains)", "monospace"],
      },
      boxShadow: {
        soft: "var(--shadow-soft)",
        // Glow del stop esmeralda brillante (espejo del ninjaGlow del POS)
        foodGlow: "0 0 24px rgba(34, 197, 94, 0.28)",
        limeGlow: "0 0 24px rgba(198, 212, 32, 0.16)",
        berryGlow: "0 0 24px rgba(142, 42, 72, 0.20)",
      },
      backgroundImage: {
        // Degradé de marca (logo): esmeralda base -> apple -> lime
        "brand-gradient":
          "linear-gradient(135deg, #16A34A 0%, #8CBF2F 48%, #C6D420 100%)",
        // CTA primario: brillante arriba -> forest abajo (espejo del flame POS,
        // que va #ff6a2c -> #ec3f17)
        "primary-gradient":
          "linear-gradient(180deg, #1FBD63 0%, #15803D 100%)",
      },
      keyframes: {
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "overlay-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "overlay-out": { from: { opacity: "1" }, to: { opacity: "0" } },
        "modal-in": {
          from: { opacity: "0", transform: "translate(-50%, -50%) scale(0.95)" },
          to: { opacity: "1", transform: "translate(-50%, -50%) scale(1)" },
        },
        "modal-out": {
          from: { opacity: "1", transform: "translate(-50%, -50%) scale(1)" },
          to: { opacity: "0", transform: "translate(-50%, -50%) scale(0.97)" },
        },
      },
      animation: {
        "fade-in": "fade-in 180ms ease-out",
        "slide-up": "slide-up 240ms cubic-bezier(0.22, 1, 0.36, 1)",
        "overlay-in": "overlay-in 160ms ease-out",
        "overlay-out": "overlay-out 130ms ease-in forwards",
        "modal-in": "modal-in 210ms cubic-bezier(0.22, 1, 0.36, 1)",
        "modal-out": "modal-out 130ms ease-in forwards",
      },
    },
  },
  plugins: [],
};

export default config;
