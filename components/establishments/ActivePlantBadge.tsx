"use client";

import { Factory } from "lucide-react";
import { useActiveEstablishment } from "@/modules/establishments/hooks";
import { cn } from "@/lib/utils/cn";

// Indicador sutil "Planta: Nombre" para el header de las pantallas filtradas
// (inventario / producción / despacho / dashboard). Hace visible que estás
// viendo un subconjunto. Si no hay planta activa ("Todas"), no renderiza nada.
export function ActivePlantBadge({ className }: { className?: string }) {
  const { active } = useActiveEstablishment();
  if (!active) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary",
        className,
      )}
    >
      <Factory size={12} />
      Planta: <span className="font-semibold">{active.name}</span>
    </span>
  );
}
