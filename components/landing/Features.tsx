import { Eyebrow } from "@/components/ui/Typography";
import { FEATURES } from "./data";

// Grilla de 6 cards glass con las funciones clave del producto.
export function Features() {
  return (
    <section id="features" className="relative mx-auto max-w-6xl scroll-mt-20 px-4 py-24 sm:px-6">
      <div className="mx-auto max-w-2xl text-center">
        <Eyebrow className="mb-5">Qué resuelve</Eyebrow>
        <h2 className="font-display text-3xl font-extrabold tracking-[-0.02em] text-foreground sm:text-4xl">
          Todo el ciclo bromatológico,{" "}
          <span className="brand-gradient-text">en un solo lugar</span>
        </h2>
        <p className="mt-4 text-base text-brand-mist">
          Pensado con bromatólogos para plantas reales: lo que antes vivía en
          carpetas, planillas sueltas y memoria, ahora queda registrado y
          auditable.
        </p>
      </div>

      <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((feature) => {
          const Icon = feature.icon;
          return (
            <div
              key={feature.title}
              className="group glass-card rounded-lg p-6 transition duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-foodGlow"
            >
              <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary transition group-hover:bg-primary/15">
                <Icon className="h-6 w-6" aria-hidden />
              </div>
              <h3 className="font-display text-lg font-bold tracking-tight text-foreground">
                {feature.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-brand-mist">
                {feature.description}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
