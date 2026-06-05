"use client";

import { cn } from "@/lib/utils/cn";

// Gráfico de barras CSS puro, sin librerías (mismo enfoque que DayBars del POS):
// flex items-end + alturas en %, degradé de marca y tooltip nativo. Lo usan el
// dashboard del tenant y la página de reportes para mantener consistencia visual
// (colores de serie heredados de los tokens del tema activo vía bg-brand-gradient).

export type BarPoint = {
  /** Clave estable para React. */
  key: string;
  /** Etiqueta del eje X (mes corto, día, semana…). */
  label: string;
  /** Valor de la barra (altura relativa al máximo). */
  value: number;
  /** Tooltip nativo de la barra (title). */
  title?: string;
  /** Texto al tope de la barra cuando se hace hover (ya formateado). */
  hoverLabel?: string;
};

export function BarsChart({
  points,
  className,
  /** Alto del área de barras (clase Tailwind, p. ej. "h-44"). */
  heightClass = "h-44",
  /** Capitaliza la etiqueta del eje (meses). */
  capitalizeLabels = false,
}: {
  points: BarPoint[];
  className?: string;
  heightClass?: string;
  capitalizeLabels?: boolean;
}) {
  const max = Math.max(1, ...points.map((p) => p.value));

  return (
    <div className={cn("flex items-end gap-2 sm:gap-4", heightClass, className)}>
      {points.map((p) => {
        const h = p.value > 0 ? Math.max(4, (p.value / max) * 100) : 1.5;
        return (
          <div
            key={p.key}
            className="group flex min-w-0 flex-1 flex-col items-center gap-1.5"
          >
            <span className="text-[10px] font-medium tabular-nums text-muted-foreground opacity-0 transition group-hover:opacity-100">
              {p.value > 0 ? (p.hoverLabel ?? "") : ""}
            </span>
            <div className="flex w-full flex-1 items-end">
              <div
                className="w-full rounded-t-md bg-brand-gradient shadow-foodGlow transition-all duration-300 group-hover:opacity-90"
                style={{ height: `${h}%` }}
                title={p.title}
              />
            </div>
            <span
              className={cn(
                "text-[11px] text-muted-foreground",
                capitalizeLabels && "capitalize",
              )}
            >
              {p.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
