import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Nunito } from "next/font/google";
import { ThemeProvider } from "@/lib/theme/ThemeProvider";
import "./globals.css";

const nunito = Nunito({
  subsets: ["latin"],
  weight: ["300", "400", "600", "700", "900"],
  variable: "--font-display",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "600"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: {
    default: "Ninja Food · Trazabilidad y gestión bromatológica",
    template: "%s · Ninja Food",
  },
  description:
    "SaaS de trazabilidad de punta a punta, planillas BPM/POES y compliance alimentario para la industria alimenticia. Avalado técnicamente por ABR.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="es-AR"
      data-theme="food-dark"
      suppressHydrationWarning
      className={`${nunito.variable} ${inter.variable} ${jetbrainsMono.variable}`}
    >
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
