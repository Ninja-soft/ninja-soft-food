"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { RegulatorySeal, type SealShape } from "@/components/ui/RegulatorySeal";
import type { LabelSystem, LabelValue } from "@/lib/globalization/labelSystems";

// Selector de rotulado frontal resuelto por país. El sistema (octógonos AR,
// NOM-051 MX, ALTO EN CL, lupa ANVISA BR, Nutri-Score EU, none US) lo decide
// el OperatingProfile del tenant, no la pantalla. Cada opción se dibuja como el
// sello REAL del sistema (componente compartido RegulatorySeal). No seleccionado:
// atenuado en escala de grises; seleccionado: pleno con ring de acento + check.

// Mapea el shape del catálogo (octagon/rect/magnifier/scale) al que dibuja el
// sello compartido. Nutri-Score es kind "grade" -> shape "grade".
function shapeFor(system: LabelSystem): SealShape {
  if (system.kind === "grade") return "grade";
  if (system.seal.shape === "octagon") return "octagon";
  if (system.seal.shape === "magnifier") return "magnifier";
  return "rect";
}

// Texto del octógono/lupa: local cuando difiere del español (NOM-051, ALTO EN,
// ANVISA traen labelLocal en mayúsculas), si no el label base en mayúsculas.
function sealText(v: LabelValue): string {
  return (v.labelLocal ?? v.label).toUpperCase();
}

// Firma chiquita bajo el texto del octógono: solo el sistema chileno "ALTO EN"
// lleva "Ministerio de Salud" en el sello real.
function signatureFor(systemId: string): string | null {
  return systemId === "cl_sellos" ? "Ministerio de Salud" : null;
}

/** Una opción seleccionable: el sello con estados atenuado / pleno + check. */
function SealOption({
  shape,
  text,
  grade,
  signature,
  active,
  onToggle,
  ariaLabel,
}: {
  shape: SealShape;
  text: string;
  grade?: string;
  signature?: string | null;
  active: boolean;
  onToggle: () => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={active}
      aria-label={ariaLabel}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          onToggle();
        }
      }}
      className={cn(
        "group relative rounded-ninjaSm p-1.5 outline-none transition-all duration-200",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        active
          ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
          : "ring-1 ring-transparent hover:bg-muted/40",
      )}
    >
      <span
        className={cn(
          "block transition-all duration-200",
          active
            ? "scale-100 opacity-100 drop-shadow-[0_0_10px_rgba(0,0,0,0.25)]"
            : "scale-95 opacity-40 grayscale group-hover:scale-100 group-hover:opacity-75 group-hover:grayscale-0",
        )}
      >
        <RegulatorySeal
          shape={shape}
          text={text}
          grade={grade}
          signature={signature}
          size="lg"
        />
      </span>
      {/* Check de selección en la esquina */}
      <span
        className={cn(
          "absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-primary text-primary-foreground shadow-sm transition-all duration-200",
          active ? "scale-100 opacity-100" : "scale-50 opacity-0",
        )}
        aria-hidden
      >
        <Check size={12} strokeWidth={3.5} />
      </span>
    </button>
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

  const shape = shapeFor(system);
  const signature = signatureFor(system.id);

  // kind "grade" (Nutri-Score): selección única A..E. Los badges A-E con su
  // color legal; el elegido a tamaño pleno, el resto atenuado.
  if (system.kind === "grade") {
    const selected = values[0] ?? null;
    return (
      <div className="flex flex-wrap items-center gap-2.5">
        {system.values.map((v) => {
          const active = selected === v.id;
          return (
            <SealOption
              key={v.id}
              shape="grade"
              text={v.label}
              grade={v.label}
              active={active}
              ariaLabel={`Nutri-Score ${v.label}`}
              onToggle={() => onChange(active ? [] : [v.id])}
            />
          );
        })}
      </div>
    );
  }

  // kind "multi-seal": 0..N sellos de advertencia.
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
      {system.values.map((v) => {
        const active = values.includes(v.id);
        return (
          <SealOption
            key={v.id}
            shape={shape}
            text={sealText(v)}
            signature={signature}
            active={active}
            ariaLabel={v.label}
            onToggle={() =>
              onChange(
                active ? values.filter((x) => x !== v.id) : [...values, v.id],
              )
            }
          />
        );
      })}
    </div>
  );
}
