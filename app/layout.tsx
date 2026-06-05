import type { Metadata } from "next";
import {
  Bricolage_Grotesque,
  IBM_Plex_Mono,
  Inter,
  JetBrains_Mono,
  Outfit,
  Sora,
  Space_Mono,
  Syne,
} from "next/font/google";
import {
  AppearanceProvider,
  appearanceInitScript,
} from "@/lib/theme/AppearanceProvider";
import { ThemeProvider } from "@/lib/theme/ThemeProvider";
import { ToastProvider } from "@/components/ui/Toast";
import "./globals.css";

// Fuentes del sistema de apariencia (mismo set que el POS)
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
});
const sora = Sora({
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
  variable: "--font-sora",
});
const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
  variable: "--font-bricolage",
});
const syne = Syne({
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
  variable: "--font-syne",
});
const outfit = Outfit({
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
  variable: "--font-outfit",
});
const spaceMono = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-spacemono",
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "600"],
  variable: "--font-plexmono",
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "600"],
  variable: "--font-jetbrains",
});

export const metadata: Metadata = {
  title: {
    default: "Ninja Food · Trazabilidad y gestión bromatológica",
    template: "%s · Ninja Food",
  },
  description:
    "SaaS de trazabilidad de punta a punta, planillas BPM/POES y compliance alimentario para la industria alimenticia. Avalado técnicamente por ABR.",
  icons: { icon: "/img/favicon.webp" },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="es-AR"
      data-theme="food-dark"
      data-bg="dots"
      suppressHydrationWarning
      className={`${inter.variable} ${sora.variable} ${bricolage.variable} ${syne.variable} ${outfit.variable} ${spaceMono.variable} ${plexMono.variable} ${jetbrainsMono.variable}`}
    >
      <head>
        {/* Anti-FOUC: tema, fuentes y fondo antes de hidratar (patrón POS) */}
        <script dangerouslySetInnerHTML={{ __html: appearanceInitScript }} />
      </head>
      <body>
        <ThemeProvider>
          <AppearanceProvider>
            <ToastProvider>{children}</ToastProvider>
          </AppearanceProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
