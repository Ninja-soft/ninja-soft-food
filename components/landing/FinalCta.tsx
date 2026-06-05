import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";

// CTA de cierre — banda glass con glow de marca antes del footer.
export function FinalCta() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <div className="relative overflow-hidden rounded-lg border border-primary/30 bg-card p-10 text-center backdrop-blur-xl sm:p-14">
        <div
          className="pointer-events-none absolute left-1/2 top-0 h-72 w-72 -translate-x-1/2 -translate-y-1/3 rounded-full bg-primary/25 blur-[110px]"
          aria-hidden
        />
        <div className="food-grid pointer-events-none absolute inset-0 opacity-[0.08]" />

        <div className="relative z-10">
          <h2 className="mx-auto max-w-2xl font-display text-3xl font-extrabold tracking-[-0.02em] text-foreground sm:text-4xl">
            Empezá a trazar tu planta{" "}
            <span className="brand-gradient-text">hoy mismo</span>
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base text-brand-mist">
            Configurás tu primera receta y producción en minutos. 14 días gratis,
            sin tarjeta, sin compromiso.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/signup" className="w-full sm:w-auto">
              <Button size="lg" className="w-full gap-2 shadow-foodGlow sm:w-auto">
                Crear mi cuenta
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Button>
            </Link>
            <Link href="/login" className="w-full sm:w-auto">
              <Button variant="secondary" size="lg" className="w-full sm:w-auto">
                Ya tengo cuenta
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
