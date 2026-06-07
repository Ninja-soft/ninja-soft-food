"use client";

import { useState } from "react";
import {
  CalendarRange,
  ClipboardList,
  FileStack,
  FileText,
} from "lucide-react";
import { Eyebrow, Heading } from "@/components/ui/Typography";
import { BulkTab } from "@/components/planillas/BulkTab";
import { IndividualTab } from "@/components/planillas/IndividualTab";
import { WeeklyTab } from "@/components/planillas/WeeklyTab";
import { ConfigurableFormsTab } from "@/components/forms/ConfigurableFormsTab";
import { cn } from "@/lib/utils/cn";
import { useTenantBranding } from "@/modules/planillas/hooks";

type Tab = "individual" | "masiva" | "semanal" | "configurables";

const TABS: {
  value: Tab;
  label: string;
  description: string;
  icon: typeof FileText;
}[] = [
  {
    value: "individual",
    label: "Producción individual",
    description: "Planilla imprimible de una producción con su QR de traza.",
    icon: FileText,
  },
  {
    value: "masiva",
    label: "Masiva",
    description: "Varias producciones en un PDF, una planilla por página.",
    icon: FileStack,
  },
  {
    value: "semanal",
    label: "Semanal",
    description: "Resumen por rango de fechas, en PDF y Excel.",
    icon: CalendarRange,
  },
  {
    value: "configurables",
    label: "Configurables",
    description: "Planillas BPM/POES a medida, firmadas con PIN del operario.",
    icon: ClipboardList,
  },
];

// Planillas: generación de PDF (individual/masiva/semanal) y export Excel.
export default function PlanillasPage() {
  const [tab, setTab] = useState<Tab>("individual");
  const { data: branding } = useTenantBranding();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Eyebrow>Documentación</Eyebrow>
        <Heading as="h1" className="mt-3">
          Planillas
        </Heading>
        <p className="mt-1 text-sm text-muted-foreground">
          Generá planillas de producción imprimibles y resúmenes exportables a
          Excel.
        </p>
      </div>

      {/* Selector de tipo (cards) */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {TABS.map((t) => {
          const active = t.value === tab;
          const Icon = t.icon;
          return (
            <button
              key={t.value}
              type="button"
              onClick={() => setTab(t.value)}
              className={cn(
                "group flex flex-col gap-2 rounded-lg border p-4 text-left transition",
                active
                  ? "border-primary bg-primary/10 shadow-foodGlow ring-1 ring-primary/30"
                  : "border-border bg-card hover:border-primary/40"
              )}
            >
              <span
                className={cn(
                  "grid h-10 w-10 place-items-center rounded-lg transition",
                  active
                    ? "bg-primary/20 text-primary"
                    : "bg-muted/60 text-muted-foreground group-hover:text-primary"
                )}
              >
                <Icon size={20} />
              </span>
              <span className="font-semibold">{t.label}</span>
              <span className="text-xs text-muted-foreground">
                {t.description}
              </span>
            </button>
          );
        })}
      </div>

      {/* Panel del tab activo */}
      <div className="glass-card p-5">
        {tab === "individual" && <IndividualTab branding={branding} />}
        {tab === "masiva" && <BulkTab branding={branding} />}
        {tab === "semanal" && <WeeklyTab branding={branding} />}
        {tab === "configurables" && (
          <ConfigurableFormsTab branding={branding} />
        )}
      </div>
    </div>
  );
}
