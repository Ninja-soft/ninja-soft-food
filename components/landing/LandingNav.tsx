import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/Button";

// Barra superior de la landing — fija, glass, siempre oscura (la landing es
// dark fija como auth). Wordmark a la izquierda, anclas + CTAs a la derecha.
export function LandingNav() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-border/60 bg-background/70 backdrop-blur-xl">
      <nav className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5" aria-label="Ninja Food">
          <Image
            src="/img/ninja-soft-isotype.webp"
            alt=""
            width={40}
            height={50}
            priority
            className="h-8 w-auto"
          />
          <Image
            src="/img/ninja-food-dark-mode.webp"
            alt="Ninja Food"
            width={200}
            height={47}
            priority
            className="hidden h-6 w-auto sm:block"
          />
        </Link>

        <div className="hidden items-center gap-7 text-sm font-medium text-brand-mist md:flex">
          <a href="#features" className="transition hover:text-foreground">
            Funciones
          </a>
          <a href="#como-funciona" className="transition hover:text-foreground">
            Cómo funciona
          </a>
          <a href="#precios" className="transition hover:text-foreground">
            Precios
          </a>
        </div>

        <div className="flex items-center gap-2.5">
          <Link href="/login">
            <Button variant="ghost" size="sm" className="text-brand-mist hover:text-foreground">
              Ingresar
            </Button>
          </Link>
          <Link href="/signup" className="hidden sm:block">
            <Button size="sm">Probá gratis</Button>
          </Link>
        </div>
      </nav>
    </header>
  );
}
