import { ArrowRight } from "lucide-react";
import { Eyebrow, Money } from "@/components/ui/Typography";
import { STEPS } from "./data";

// Cómo funciona — 3 pasos del flujo del dominio (ingreso → producción → despacho).
export function HowItWorks() {
  return (
    <section
      id="como-funciona"
      className="relative scroll-mt-20 border-y border-border/60 bg-card/30 py-24 backdrop-blur-sm"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <Eyebrow className="mb-5">Cómo funciona</Eyebrow>
          <h2 className="font-display text-3xl font-extrabold tracking-[-0.02em] text-foreground sm:text-4xl">
            Tres pasos, una{" "}
            <span className="brand-gradient-text">cadena trazable</span>
          </h2>
        </div>

        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {STEPS.map((step, i) => (
            <div key={step.number} className="relative">
              <div className="glass-card h-full rounded-ninjaLg p-7">
                <Money className="text-4xl font-bold text-primary/40">
                  {step.number}
                </Money>
                <h3 className="mt-4 font-display text-xl font-bold tracking-tight text-foreground">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-brand-mist">
                  {step.description}
                </p>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className="absolute -right-3 top-1/2 z-10 hidden h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-popover text-primary md:flex"
                  aria-hidden
                >
                  <ArrowRight className="h-4 w-4" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
