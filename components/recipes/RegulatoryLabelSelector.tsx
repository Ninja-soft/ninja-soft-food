"use client";

import { cn } from "@/lib/utils/cn";
import type { LabelSystem } from "@/lib/globalization/labelSystems";

// Selector de rotulado frontal resuelto por país. El sistema (octógonos AR,
// NOM-051 MX, ALTO EN CL, lupa ANVISA BR, Nutri-Score EU, none US) lo decide
// el OperatingProfile del tenant, no la pantalla. Estética nivel POS: chips con
// la forma del sello real (octógono/rect/lupa) y glow de selección.

/** Forma visual del sello del sistema, como chip seleccionable. */
function SealShape({
  system,
  active,
  children,
}: {
  system: LabelSystem;
  active: boolean;
  children: React.ReactNode;
}) {
  if (system.seal.shape === "octagon") {
    return (
      <span
        className={cn(
          "grid place-items-center px-3 py-2 text-center text-[10px] font-black uppercase leading-tight tracking-wide transition",
          active
            ? "bg-foreground text-background"
            : "bg-muted text-muted-foreground",
        )}
        style={{
          clipPath:
            "polygon(30% 0, 70% 0, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0 70%, 0 30%)",
        }}
      >
        {children}
      </span>
    );
  }
  if (system.seal.shape === "magnifier") {
    return (
      <span
        className={cn(
          "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-wide transition",
          active
            ? "border-foreground bg-background text-foreground"
            : "border-border text-muted-foreground",
        )}
      >
        <span aria-hidden>🔍</span>
        {children}
      </span>
    );
  }
  // rect (Nutri-Score grade y otros): cápsula sólida.
  return (
    <span
      className={cn(
        "grid place-items-center rounded-md px-3 py-2 text-sm font-black uppercase tracking-wide transition",
        active ? "bg-foreground text-background" : "bg-muted text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

export function RegulatoryLabelSelector({
  system,
  values,
  onChange,
}: {
  system: LabelSystem;
  values: string[];
  onChange: (next: string[]) => void;
}) {
  // kind "none" (FDA): sin sellos frontales — sección oculta por el caller.
  if (system.kind === "none") return null;

  // kind "grade" (Nutri-Score): selección única A..E.
  if (system.kind === "grade") {
    const selected = values[0] ?? null;
    return (
      <div className="flex flex-wrap gap-2">
        {system.values.map((v) => {
          const active = selected === v.id;
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => onChange(active ? [] : [v.id])}
              aria-pressed={active}
              className={cn(
                "transition",
                active && "ring-2 ring-primary ring-offset-2 ring-offset-background",
              )}
            >
              <SealShape system={system} active={active}>
                {v.label}
              </SealShape>
            </button>
          );
        })}
      </div>
    );
  }

  // kind "multi-seal": 0..N sellos de advertencia.
  return (
    <div className="flex flex-wrap gap-2">
      {system.values.map((v) => {
        const active = values.includes(v.id);
        return (
          <button
            key={v.id}
            type="button"
            onClick={() =>
              onChange(
                active ? values.filter((x) => x !== v.id) : [...values, v.id],
              )
            }
            aria-pressed={active}
            className={cn(
              "rounded-md transition",
              active && "ring-2 ring-primary ring-offset-2 ring-offset-background",
            )}
            title={v.label}
          >
            <SealShape system={system} active={active}>
              {v.labelLocal ?? v.label}
            </SealShape>
          </button>
        );
      })}
    </div>
  );
}
