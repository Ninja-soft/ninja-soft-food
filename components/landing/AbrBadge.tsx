import Image from "next/image";

// Aval técnico de ABR — banda glass discreta debajo del hero.
export function AbrBadge() {
  return (
    <section className="relative z-10 mx-auto -mt-4 max-w-3xl px-4 sm:px-6">
      <div className="glass-card flex flex-col items-center gap-4 rounded-lg px-6 py-5 text-center sm:flex-row sm:gap-5 sm:text-left">
        <Image
          src="/img/Logo ABR Back Transparent.png"
          alt="ABR · Asesoría Bromatológica Rosario"
          width={88}
          height={54}
          className="h-11 w-auto shrink-0"
        />
        <div className="hidden h-10 w-px bg-border sm:block" aria-hidden />
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
            Aval técnico
          </p>
          <p className="mt-1 text-sm text-brand-mist">
            Avalado técnicamente por{" "}
            <span className="font-semibold text-foreground">
              Asesoría Bromatológica Rosario
            </span>
            . Cada función nace de la práctica profesional, no de un checklist.
          </p>
        </div>
      </div>
    </section>
  );
}
