import Image from "next/image";

/**
 * Landing placeholder — fase 0.
 * La landing real se construye con el design system completo
 * (componentes ui/ portados del POS). Esta página solo valida
 * tokens, tipografía y atmósfera del tema por defecto.
 */
export default function LandingPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-10 px-6">
      <Image
        src="/img/ninja-food-dark-mode.webp"
        alt="Ninja Food"
        width={360}
        height={84}
        priority
        className="h-auto w-72 md:w-96"
      />

      <div className="max-w-2xl text-center">
        <p className="font-sans text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Trazabilidad · Planillas · Compliance
        </p>
        <h1 className="mt-4 font-display text-4xl font-black tracking-[-0.04em] md:text-6xl">
          La gestión bromatológica de tu planta,{" "}
          <span className="brand-gradient-text">de punta a punta</span>
        </h1>
        <p className="mt-6 text-base leading-relaxed text-muted-foreground">
          Del ingreso de materia prima al despacho, cada lote trazado, cada
          planilla firmada, cada registro listo para auditoría. Avalado
          técnicamente por Asesoría Bromatológica Rosario.
        </p>
      </div>

      <div className="glass-card flex items-center gap-3 px-6 py-4">
        <span className="size-2 rounded-ninjaFull bg-primary shadow-foodGlow" />
        <p className="font-mono text-sm text-muted-foreground">
          En construcción · fase 0 — ver CLAUDE.md y docs/07-roadmap.md
        </p>
      </div>
    </main>
  );
}
