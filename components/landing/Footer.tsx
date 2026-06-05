import Image from "next/image";
import Link from "next/link";
import { COMPLIANCE } from "./data";

// Footer + banda de compliance regulatorio (credibilidad sectorial).
export function Footer() {
  return (
    <footer className="border-t border-border/60 bg-background/60 backdrop-blur-xl">
      {/* Banda de normativa */}
      <div className="border-b border-border/60">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-4 py-6 sm:flex-row sm:justify-between sm:px-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Diseñado para la normativa argentina
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
            {COMPLIANCE.map((item) => (
              <span
                key={item.abbr}
                className="inline-flex items-baseline gap-1.5 text-xs text-brand-mist"
                title={item.label}
              >
                <span className="font-semibold text-foreground">{item.abbr}</span>
                <span className="hidden text-muted-foreground sm:inline">
                  · {item.label}
                </span>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Pie principal */}
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-[1.5fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-2.5">
            <Image
              src="/img/ninja-soft-isotype.webp"
              alt=""
              width={40}
              height={50}
              className="h-8 w-auto"
            />
            <Image
              src="/img/ninja-food-dark-mode.webp"
              alt="Ninja Food"
              width={180}
              height={42}
              className="h-6 w-auto"
            />
          </div>
          <p className="mt-4 max-w-sm text-sm text-brand-mist">
            Trazabilidad y gestión bromatológica para la industria alimentaria.
            Un producto de{" "}
            <span className="font-semibold text-foreground">Ninja-Soft</span>.
          </p>
          <div className="mt-5 flex items-center gap-2.5">
            <Image
              src="/img/Logo ABR Back Transparent.png"
              alt="ABR"
              width={44}
              height={27}
              className="h-auto w-9 brightness-0 invert opacity-70"
            />
            <p className="text-xs text-muted-foreground">
              Avalado técnicamente por Asesoría Bromatológica Rosario
            </p>
          </div>
        </div>

        <div>
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Producto
          </h3>
          <ul className="mt-4 space-y-2.5 text-sm text-brand-mist">
            <li>
              <a href="#features" className="transition hover:text-foreground">
                Funciones
              </a>
            </li>
            <li>
              <a href="#como-funciona" className="transition hover:text-foreground">
                Cómo funciona
              </a>
            </li>
            <li>
              <a href="#precios" className="transition hover:text-foreground">
                Precios
              </a>
            </li>
          </ul>
        </div>

        <div>
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Cuenta
          </h3>
          <ul className="mt-4 space-y-2.5 text-sm text-brand-mist">
            <li>
              <Link href="/login" className="transition hover:text-foreground">
                Ingresar
              </Link>
            </li>
            <li>
              <Link href="/signup" className="transition hover:text-foreground">
                Crear cuenta
              </Link>
            </li>
            <li>
              <a
                href="mailto:ventas@ninja-soft.com"
                className="transition hover:text-foreground"
              >
                Contacto comercial
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-border/60">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 px-4 py-5 text-xs text-muted-foreground sm:flex-row sm:justify-between sm:px-6">
          <p>© 2026 Ninja-Soft. Todos los derechos reservados.</p>
          <p>Hecho en Argentina · Rosario, Santa Fe</p>
        </div>
      </div>
    </footer>
  );
}
