import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LandingNav } from "@/components/landing/LandingNav";
import { Hero } from "@/components/landing/Hero";
import { AbrBadge } from "@/components/landing/AbrBadge";
import { Features } from "@/components/landing/Features";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Pricing } from "@/components/landing/Pricing";
import { FinalCta } from "@/components/landing/FinalCta";
import { Footer } from "@/components/landing/Footer";

export const metadata: Metadata = {
  // Absoluto para no heredar el template "%s · Ninja Food" del layout raíz.
  title: { absolute: "Ninja Food · Trazabilidad y gestión bromatológica" },
  description:
    "SaaS de trazabilidad de punta a punta para la industria alimentaria argentina: stock con lotes, recetas con octógonos, producción firmada, despacho con remito y traza pública por QR. Planillas BPM/POES configurables y recall en minutos. Avalado por ABR. 14 días gratis.",
  openGraph: {
    title: "Ninja Food · Trazabilidad y gestión bromatológica",
    description:
      "La cadena alimentaria trazada de punta a punta. Del ingreso de materia prima al QR público. Cumplí el CAA sin planillas de papel.",
    type: "website",
  },
};

// Landing comercial (raíz pública). Es SIEMPRE oscura (igual que auth):
// el data-theme/fondo de marca se fijan acá, no heredan el tema del usuario.
export default async function LandingPage() {
  // Si ya hay sesión, evitamos mostrar la landing al usuario logueado.
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const tenantId = (user.app_metadata as Record<string, unknown>)?.tenant_id;
    redirect(typeof tenantId === "string" && tenantId ? "/dashboard" : "/onboarding");
  }

  return (
    <div
      data-theme="food-dark"
      className="food-dark-bg relative min-h-screen text-foreground"
    >
      <LandingNav />
      <main>
        <Hero />
        <AbrBadge />
        <Features />
        <HowItWorks />
        <Pricing />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}
