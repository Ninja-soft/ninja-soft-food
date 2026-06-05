"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Eyebrow, Money } from "@/components/ui/Typography";
import { cn } from "@/lib/utils/cn";
import { PLANS } from "./data";

type Cycle = "monthly" | "yearly";

const ARS = new Intl.NumberFormat("es-AR", {
  maximumFractionDigits: 0,
});

// Pricing — 3 planes self-service (datos estáticos del seed) + Enterprise a
// medida. Toggle mensual/anual (yearly = 10 meses, espejado del seed).
export function Pricing() {
  const [cycle, setCycle] = useState<Cycle>("monthly");

  return (
    <section id="precios" className="relative mx-auto max-w-6xl scroll-mt-20 px-4 py-24 sm:px-6">
      <div className="mx-auto max-w-2xl text-center">
        <Eyebrow className="mb-5">Planes</Eyebrow>
        <h2 className="font-display text-3xl font-extrabold tracking-[-0.02em] text-foreground sm:text-4xl">
          Precios claros,{" "}
          <span className="brand-gradient-text">sin sorpresas</span>
        </h2>
        <p className="mt-4 text-base text-brand-mist">
          Empezás con 14 días gratis y sin tarjeta. Cambiás o cancelás cuando
          quieras.
        </p>

        {/* Toggle mensual / anual */}
        <div className="mt-8 inline-flex items-center gap-1 rounded-ninjaFull border border-border bg-card/60 p-1 backdrop-blur-xl">
          <button
            type="button"
            onClick={() => setCycle("monthly")}
            aria-pressed={cycle === "monthly"}
            className={cn(
              "rounded-ninjaFull px-4 py-1.5 text-sm font-semibold transition",
              cycle === "monthly"
                ? "bg-primary-gradient text-white shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Mensual
          </button>
          <button
            type="button"
            onClick={() => setCycle("yearly")}
            aria-pressed={cycle === "yearly"}
            className={cn(
              "inline-flex items-center gap-2 rounded-ninjaFull px-4 py-1.5 text-sm font-semibold transition",
              cycle === "yearly"
                ? "bg-primary-gradient text-white shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Anual
            <span
              className={cn(
                "rounded-ninjaFull px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                cycle === "yearly"
                  ? "bg-white/20 text-white"
                  : "bg-accent/15 text-accent",
              )}
            >
              2 meses gratis
            </span>
          </button>
        </div>
      </div>

      <div className="mt-14 grid items-stretch gap-6 lg:grid-cols-3">
        {PLANS.map((plan) => {
          const price = cycle === "monthly" ? plan.monthlyArs : plan.yearlyArs;
          const suffix = cycle === "monthly" ? "/mes" : "/año";
          return (
            <div
              key={plan.key}
              className={cn(
                "relative flex flex-col rounded-ninjaLg border bg-card p-7 backdrop-blur-xl transition",
                plan.highlight
                  ? "border-primary/50 shadow-foodGlow lg:-translate-y-3 lg:scale-[1.02]"
                  : "border-border shadow-soft hover:border-primary/30",
              )}
            >
              {plan.highlight && (
                <div className="absolute -top-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-ninjaFull bg-primary-gradient px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white shadow-foodGlow">
                  <Sparkles className="h-3 w-3" aria-hidden />
                  Más elegido
                </div>
              )}

              <h3 className="font-display text-xl font-bold tracking-tight text-foreground">
                {plan.name}
              </h3>
              <p className="mt-1 text-sm text-brand-mist">{plan.tagline}</p>

              <div className="mt-6 flex items-baseline gap-1.5">
                <Money className="text-4xl font-extrabold text-foreground">
                  ${ARS.format(price)}
                </Money>
                <span className="text-sm text-muted-foreground">{suffix}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                ARS · + IVA
              </p>

              <Link href="/signup" className="mt-6 block">
                <Button
                  variant={plan.highlight ? "primary" : "secondary"}
                  className="w-full"
                >
                  Probá 14 días gratis
                </Button>
              </Link>

              <ul className="mt-7 space-y-3 border-t border-border pt-7">
                {plan.features.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-start gap-2.5 text-sm text-brand-mist"
                  >
                    <Check
                      className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                      aria-hidden
                    />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      {/* Enterprise / Corporativo a medida */}
      <div className="glass-card mt-6 flex flex-col items-center justify-between gap-4 rounded-ninjaLg p-7 text-center sm:flex-row sm:text-left">
        <div>
          <h3 className="font-display text-lg font-bold tracking-tight text-foreground">
            Corporativo
          </h3>
          <p className="mt-1 text-sm text-brand-mist">
            Multi-planta, marca blanca y volumen sin límites. Lo armamos a tu
            medida.
          </p>
        </div>
        <a href="mailto:ventas@ninja-soft.com?subject=Plan%20Corporativo%20Ninja%20Food">
          <Button variant="secondary" size="lg">
            Enterprise: hablemos
          </Button>
        </a>
      </div>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        14 días de prueba, sin tarjeta · El plan anual equivale a 10 meses.
      </p>
    </section>
  );
}
