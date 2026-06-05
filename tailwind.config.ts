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
        // Marca fija (degradé del logo) — no cambia con el tema
        brand: {
          forest: "#1F7A33",
          apple: "#8CBF2F",
          lime: "#C6D420",
          ink: "#04140A",
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
        display: ["var(--font-display)", "Nunito", "sans-serif"],
        sans: ["var(--font-sans)", "Inter", "sans-serif"],
        mono: ["var(--font-mono)", "JetBrains Mono", "monospace"],
      },
      boxShadow: {
        soft: "var(--shadow-soft)",
        foodGlow: "0 0 24px rgba(63, 163, 77, 0.22)",
        limeGlow: "0 0 24px rgba(198, 212, 32, 0.16)",
        berryGlow: "0 0 24px rgba(142, 42, 72, 0.20)",
      },
      backgroundImage: {
        "brand-gradient":
          "linear-gradient(135deg, #1F7A33 0%, #8CBF2F 48%, #C6D420 100%)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "modal-in": {
          from: { opacity: "0", transform: "scale(0.96) translateY(8px)" },
          to: { opacity: "1", transform: "scale(1) translateY(0)" },
        },
      },
      animation: {
        "fade-in": "fade-in 180ms ease-out",
        "slide-up": "slide-up 240ms cubic-bezier(0.22, 1, 0.36, 1)",
        "modal-in": "modal-in 210ms cubic-bezier(0.22, 1, 0.36, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
