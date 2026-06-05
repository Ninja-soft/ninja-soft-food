import Image from "next/image";
import Link from "next/link";
import { ArrowRight, QrCode, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Eyebrow } from "@/components/ui/Typography";

// Hero de la landing — fondo de marca oscuro con glows del design system
// (food-dark-bg + food-grid, espejo de auth). Wordmark, headline, CTAs.
export function Hero() {
  return (
    <section className="relative overflow-hidden pb-20 pt-32 sm:pt-40">
      <div className="food-grid pointer-events-none absolute inset-0 opacity-[0.12]" />
      {/* Glow de acento bajo el hero */}
      <div
        className="pointer-events-none absolute left-1/2 top-24 h-[28rem] w-[28rem] -translate-x-1/2 rounded-full bg-primary/20 blur-[120px]"
        aria-hidden
      />

      <div className="relative z-10 mx-auto flex max-w-4xl flex-col items-center px-4 text-center sm:px-6">
        <div className="animate-fade-in">
          <Eyebrow className="mb-7">Trazabilidad alimentaria · world-ready</Eyebrow>
        </div>

        <Image
          src="/img/ninja-food-dark-mode.webp"
          alt="Ninja Food"
          width={520}
          height={123}
          priority
          className="mb-8 h-16 w-auto animate-slide-up sm:h-20"
        />

        <h1 className="animate-slide-up font-display text-3xl font-extrabold leading-[1.08] tracking-[-0.02em] text-foreground sm:text-5xl md:text-6xl">
          La cadena alimentaria,
          <br className="hidden sm:block" />{" "}
          <span className="brand-gradient-text">trazada de punta a punta</span>
        </h1>

        <p className="mt-6 max-w-2xl animate-slide-up text-base leading-relaxed text-brand-mist sm:text-lg">
          Gestión bromatológica completa para la industria alimentaria argentina:
          del ingreso de materia prima a la producción, el despacho y el QR
          público que el consumidor escanea. Cumplí el CAA sin planillas de papel.
        </p>

        <div className="mt-10 flex w-full animate-slide-up flex-col items-center justify-center gap-3 sm:w-auto sm:flex-row">
          <Link href="/signup" className="w-full sm:w-auto">
            <Button size="lg" className="w-full gap-2 shadow-foodGlow sm:w-auto">
              Probá 14 días gratis
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Button>
          </Link>
          <Link href="/login" className="w-full sm:w-auto">
            <Button
              variant="secondary"
              size="lg"
              className="w-full sm:w-auto"
            >
              Ingresar
            </Button>
          </Link>
        </div>

        <div className="mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" aria-hidden />
            14 días gratis, sin tarjeta
          </span>
          <span className="inline-flex items-center gap-1.5">
            <QrCode className="h-3.5 w-3.5 text-primary" aria-hidden />
            Traza pública con QR incluida
          </span>
        </div>
      </div>
    </section>
  );
}
