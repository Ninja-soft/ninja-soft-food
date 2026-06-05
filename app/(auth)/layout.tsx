import Image from "next/image";
import Link from "next/link";

// Layout de autenticación: card glass centrada sobre el fondo atmosférico.
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <Link href="/" className="mb-8">
        <Image
          src="/img/ninja-food-dark-mode.webp"
          alt="Ninja Food"
          width={240}
          height={56}
          priority
          className="wordmark-on-dark h-auto w-52"
        />
        <Image
          src="/img/ninja-food-light-mode.webp"
          alt="Ninja Food"
          width={240}
          height={56}
          priority
          className="wordmark-on-light h-auto w-52"
        />
      </Link>
      <div className="glass-card w-full max-w-md animate-slide-up p-8">
        {children}
      </div>
      <div className="mt-6 flex items-center gap-2.5">
        {/* Logo ABR en blanco (temas oscuros) / oscuro (temas claros) */}
        <Image
          src="/img/Logo ABR Back Transparent.png"
          alt="ABR"
          width={44}
          height={27}
          className="wordmark-on-dark h-auto w-11 brightness-0 invert opacity-80"
        />
        <Image
          src="/img/Logo ABR Back Transparent.png"
          alt="ABR"
          width={44}
          height={27}
          className="wordmark-on-light h-auto w-11 brightness-0 opacity-60"
        />
        <p className="text-xs text-muted-foreground">
          Avalado técnicamente por Asesoría Bromatológica Rosario
        </p>
      </div>
    </main>
  );
}
