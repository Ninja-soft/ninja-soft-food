import Image from "next/image";
import Link from "next/link";

// Layout de autenticación — espejo 1:1 del AuthLayout del POS:
// fondo de marca siempre oscuro + grid de puntos + columna centrada max-w-md.
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="food-dark-bg relative flex min-h-screen items-center justify-center px-4 py-12 text-brand-mist">
      <div className="food-grid pointer-events-none absolute inset-0 opacity-20" />
      <div className="relative z-10 w-full max-w-md">
        <Link href="/" className="mb-8 flex justify-center">
          <Image
            src="/img/ninja-food-login.png"
            alt="Ninja Food"
            width={320}
            height={88}
            priority
            className="h-16 w-auto sm:h-20"
          />
        </Link>
        {children}
        <div className="mt-8 flex items-center justify-center gap-2.5">
          <Image
            src="/img/Logo ABR Back Transparent.png"
            alt="ABR"
            width={44}
            height={27}
            className="h-auto w-10 brightness-0 invert opacity-80"
          />
          <p className="text-xs text-brand-mist">
            Avalado técnicamente por Asesoría Bromatológica Rosario
          </p>
        </div>
      </div>
    </div>
  );
}
