"use client";

import { useState } from "react";
import { CreditCard, Globe2, Mail, Palette, Plug, Store } from "lucide-react";
import { Card, CardContent } from "@/components/ui/Card";
import { Segmented } from "@/components/ui/Segmented";
import { Display, Eyebrow } from "@/components/ui/Typography";
import { ApiKeysCard } from "@/components/settings/ApiKeysCard";
import { BrandingCard } from "@/components/settings/BrandingCard";
import { EmailCard } from "@/components/settings/EmailCard";
import { GlobalizationCard } from "@/components/settings/GlobalizationCard";
import { SubscriptionCard } from "@/components/settings/SubscriptionCard";
import { cn } from "@/lib/utils/cn";
import {
  THEMES,
  THEME_LABELS,
  useTheme,
  type Theme,
} from "@/lib/theme/ThemeProvider";
import {
  BG_STYLES,
  DISPLAY_FONTS,
  PRICE_ACCENTS,
  PRICE_FONTS,
  useAppearance,
  type BgStyle,
  type DisplayFont,
  type PriceAccent,
  type PriceFont,
} from "@/lib/theme/AppearanceProvider";
import { formatQty } from "@/lib/utils/format";

// Configuración — espejo de la página del POS: menú lateral de secciones,
// Apariencia (tema / fuentes / resalte / fondo) y Marca del negocio.

type Section =
  | "apariencia"
  | "marca"
  | "email"
  | "global"
  | "api"
  | "suscripcion";
const SECTIONS: { key: Section; label: string; icon: React.ElementType }[] = [
  { key: "apariencia", label: "Apariencia", icon: Palette },
  { key: "marca", label: "Marca del negocio", icon: Store },
  { key: "email", label: "Email", icon: Mail },
  { key: "global", label: "Operacion global", icon: Globe2 },
  { key: "api", label: "API e integraciones", icon: Plug },
  { key: "suscripcion", label: "Suscripción", icon: CreditCard },
];

// Swatch por tema: fondo + primary + accent (patrón POS)
const THEME_SWATCH: Record<Theme, { bg: string; a: string; b: string }> = {
  "food-dark": { bg: "#0a1411", a: "#22c55e", b: "#6ee7b7" },
  "food-light": { bg: "#f4f8f2", a: "#15803d", b: "#9bb814" },
  "food-bosque": { bg: "#06120a", a: "#4caf50", b: "#c6d420" },
  "food-crema": { bg: "#fbf7ec", a: "#2e7d32", b: "#c9a227" },
  "food-remolacha": { bg: "#faf5f7", a: "#8e2a48", b: "#c95d63" },
  "food-mar": { bg: "#07171a", a: "#14b8a6", b: "#99e2b4" },
};

// Preview del patrón de fondo sobre un mini tile oscuro (patrón POS)
const BG_PREVIEW: Record<BgStyle, React.CSSProperties> = {
  dots: {
    backgroundImage:
      "radial-gradient(rgba(255,255,255,0.35) 1px, transparent 1px)",
    backgroundSize: "9px 9px",
  },
  grid: {
    backgroundImage:
      "linear-gradient(rgba(255,255,255,0.28) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.28) 1px, transparent 1px)",
    backgroundSize: "12px 12px",
  },
  crosses: {
    backgroundImage:
      "linear-gradient(rgba(255,255,255,0.2) 1.5px, transparent 1.5px), linear-gradient(90deg, rgba(255,255,255,0.2) 1.5px, transparent 1.5px), linear-gradient(rgba(63,163,77,0.6) 1.5px, transparent 1.5px), linear-gradient(90deg, rgba(63,163,77,0.6) 1.5px, transparent 1.5px)",
    backgroundSize: "14px 14px, 14px 14px, 42px 42px, 42px 42px",
  },
  diagonal: {
    backgroundImage:
      "repeating-linear-gradient(45deg, rgba(255,255,255,0.28) 0, rgba(255,255,255,0.28) 1px, transparent 1px, transparent 8px)",
  },
  mesh: {
    backgroundImage:
      "radial-gradient(circle at 25% 20%, rgba(63,163,77,0.55), transparent 45%), radial-gradient(circle at 80% 30%, rgba(198,212,32,0.5), transparent 50%)",
  },
};

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">{label}</div>
      {children}
    </div>
  );
}

export default function ConfiguracionPage() {
  const { theme, setTheme } = useTheme();
  const {
    display,
    price,
    bg,
    priceAccent,
    setDisplay,
    setPrice,
    setBg,
    setPriceAccent,
  } = useAppearance();
  const [section, setSection] = useState<Section>("apariencia");

  return (
    <div className="mx-auto max-w-5xl">
      <Eyebrow>Preferencias</Eyebrow>
      <Display className="mt-3">Configuración</Display>
      <p className="mt-2 text-muted-foreground">
        Ajustá Ninja Food a tu medida. Los cambios se aplican al instante y
        quedan guardados en tu cuenta.
      </p>

      <div className="mt-8 grid gap-6 md:grid-cols-[210px_1fr]">
        {/* Menú de secciones */}
        <nav className="flex gap-2 overflow-x-auto md:flex-col md:overflow-visible">
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            const active = section === s.key;
            return (
              <button
                key={s.key}
                onClick={() => setSection(s.key)}
                className={cn(
                  "flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm transition md:w-full",
                  active
                    ? "bg-primary/[0.12] font-medium text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Icon size={17} />
                {s.label}
              </button>
            );
          })}
        </nav>

        {/* Contenido */}
        <div className="min-w-0">
          {section === "apariencia" && (
            <Card>
              <CardContent className="space-y-7 p-6">
                <Field label="Tema">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {THEMES.map((t) => {
                      const sw = THEME_SWATCH[t];
                      const active = theme === t;
                      return (
                        <button
                          key={t}
                          onClick={() => setTheme(t)}
                          className={cn(
                            "rounded-lg border p-2 text-left transition",
                            active
                              ? "ring-primary/30 border-primary ring-2"
                              : "hover:border-primary/40 border-border"
                          )}
                        >
                          <div
                            className="relative h-16 w-full overflow-hidden rounded-lg border border-black/5"
                            style={{ background: sw.bg }}
                          >
                            <span
                              className="absolute bottom-2 left-2 h-3.5 w-3.5 rounded-full"
                              style={{ background: sw.a }}
                            />
                            <span
                              className="absolute bottom-2 left-7 h-3.5 w-3.5 rounded-full"
                              style={{ background: sw.b }}
                            />
                          </div>
                          <div className="mt-2 flex items-center gap-1.5 text-xs font-medium">
                            <span
                              className={cn(
                                "h-1.5 w-1.5 rounded-full",
                                active ? "bg-primary" : "bg-transparent"
                              )}
                            />
                            {THEME_LABELS[t]}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </Field>

                <Field label="Fuente de títulos">
                  <Segmented
                    value={display}
                    onChange={(v) => setDisplay(v as DisplayFont)}
                    options={Object.entries(DISPLAY_FONTS).map(([k, v]) => ({
                      value: k,
                      label: v.label,
                      preview: (
                        <span style={{ fontFamily: `var(${v.var})` }}>
                          {v.label}
                        </span>
                      ),
                    }))}
                  />
                  <p
                    className="pt-1 text-2xl font-extrabold tracking-tight"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    Ninja Food traza de punta a punta
                  </p>
                </Field>

                <Field label="Fuente de números">
                  <Segmented
                    value={price}
                    onChange={(v) => setPrice(v as PriceFont)}
                    options={Object.entries(PRICE_FONTS).map(([k, v]) => ({
                      value: k,
                      label: v.label,
                      preview: (
                        <span style={{ fontFamily: `var(${v.var})` }}>
                          {v.label}
                        </span>
                      ),
                    }))}
                  />
                  <p className="price-hl pt-1 font-price text-2xl font-bold tabular-nums">
                    {formatQty(1234.567)} kg · L260604-0001
                  </p>
                </Field>

                <Field label="Resalte de números">
                  <div className="flex flex-wrap gap-2">
                    {(Object.keys(PRICE_ACCENTS) as PriceAccent[]).map((k) => {
                      const active = priceAccent === k;
                      const grad = PRICE_ACCENTS[k].gradient;
                      return (
                        <button
                          key={k}
                          onClick={() => setPriceAccent(k)}
                          className={cn(
                            "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition",
                            active
                              ? "ring-primary/30 border-primary ring-2"
                              : "hover:border-primary/40 border-border"
                          )}
                        >
                          <span
                            className="h-5 w-5 rounded-full border border-black/10"
                            style={{
                              background: grad || "var(--foreground)",
                            }}
                          />
                          {PRICE_ACCENTS[k].label}
                        </button>
                      );
                    })}
                  </div>
                  <p className="price-hl pt-2 font-price text-2xl font-bold tabular-nums">
                    {formatQty(98765.43)} kg
                  </p>
                </Field>

                <Field label="Fondo">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                    {(Object.keys(BG_STYLES) as BgStyle[]).map((k) => {
                      const active = bg === k;
                      return (
                        <button
                          key={k}
                          onClick={() => setBg(k)}
                          className={cn(
                            "rounded-lg border p-2 transition",
                            active
                              ? "ring-primary/30 border-primary ring-2"
                              : "hover:border-primary/40 border-border"
                          )}
                        >
                          <div
                            className="h-12 w-full rounded-lg border border-black/10"
                            style={{
                              backgroundColor: "#0c1f10",
                              ...BG_PREVIEW[k],
                            }}
                          />
                          <div className="mt-1.5 truncate text-xs font-medium">
                            {BG_STYLES[k]}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </Field>
              </CardContent>
            </Card>
          )}

          {section === "marca" && <BrandingCard />}

          {section === "email" && <EmailCard />}

          {section === "global" && <GlobalizationCard />}

          {section === "api" && (
            <ApiKeysCard onUpgrade={() => setSection("suscripcion")} />
          )}

          {section === "suscripcion" && <SubscriptionCard />}
        </div>
      </div>
    </div>
  );
}
