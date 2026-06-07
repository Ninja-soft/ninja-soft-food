"use client";

import { Search } from "lucide-react";
import { cn } from "@/lib/utils/cn";

// =============================================================================
// RegulatorySeal — el sello de rotulado frontal dibujado como el sello REAL de
// cada sistema (octógono negro AR/MX/CL, lupa ANVISA BR, badge de grado
// Nutri-Score EU). Componente visual PURO: no sabe de selección ni de formularios,
// solo pinta el sello a un tamaño dado. Lo comparten el selector de recetas
// (edición), las cards del catálogo (lectura) y la traza pública (lectura).
//
// Por qué los hex literales acá: los colores del Nutri-Score (verde oscuro -> rojo)
// y el negro/blanco de los octógonos son COLORES LEGALES del sistema regulatorio,
// no decisiones de diseño del producto. Mapearlos a tokens del tema los rompería
// (un octógono "negro" debe verse negro en los 6 temas). Por eso van fijos.
// =============================================================================

export type SealShape = "octagon" | "magnifier" | "grade" | "rect";

const SIZE_PX = { sm: 24, md: 56, lg: 88, xl: 96 } as const;
export type SealSize = keyof typeof SIZE_PX;

/** Tamaño de fuente del octógono según el largo del texto y el tamaño del sello. */
function octagonFontClass(size: SealSize, text: string): string {
  const long = text.length > 18;
  const med = text.length > 11;
  if (size === "sm") return "text-[5px]";
  if (size === "md") return long ? "text-[7px]" : med ? "text-[8px]" : "text-[9px]";
  // lg / xl
  if (long) return "text-[9px]";
  if (med) return "text-[10px]";
  return "text-[11px]";
}

// clip-path octagonal regular (relación 1:1). Coordenadas en % de la caja.
const OCTAGON_CLIP =
  "polygon(29.3% 0, 70.7% 0, 100% 29.3%, 100% 70.7%, 70.7% 100%, 29.3% 100%, 0 70.7%, 0 29.3%)";

// -----------------------------------------------------------------------------
// Octógono negro real: dos capas con clip-path. La capa externa es el borde
// blanco; la interna (inset) es el sello negro con el texto. Así el "borde"
// sigue la diagonal del octágono (un border CSS sería rectangular y se vería mal).
// -----------------------------------------------------------------------------
function OctagonSeal({
  text,
  size,
  signature,
}: {
  text: string;
  size: SealSize;
  signature?: string | null;
}) {
  const px = SIZE_PX[size];
  return (
    <span
      className="relative inline-grid shrink-0 place-items-center bg-black"
      style={{ width: px, height: px, clipPath: OCTAGON_CLIP }}
      aria-hidden
    >
      {/* Anillo blanco fino: octógono blanco con inset que deja ver el negro */}
      <span
        className="absolute bg-white"
        style={{
          inset: size === "sm" ? 1 : Math.round(px * 0.06),
          clipPath: OCTAGON_CLIP,
        }}
      />
      {/* Cara negra interior */}
      <span
        className="absolute bg-black"
        style={{
          inset: size === "sm" ? 2 : Math.round(px * 0.1),
          clipPath: OCTAGON_CLIP,
        }}
      />
      {/* Texto del sello */}
      <span
        className={cn(
          "relative z-10 px-1 text-center font-black uppercase leading-[1.05] tracking-tight text-white",
          octagonFontClass(size, text),
        )}
      >
        {text}
        {signature && size !== "sm" && (
          <span className="mt-0.5 block font-semibold normal-case leading-none tracking-normal text-white/85 [font-size:0.62em]">
            {signature}
          </span>
        )}
      </span>
    </span>
  );
}

// -----------------------------------------------------------------------------
// Lupa ANVISA (BR): rótulo rectangular negro horizontal con ícono de lupa.
// Versión simplificada y digna del rótulo oficial brasileño.
// -----------------------------------------------------------------------------
function MagnifierSeal({ text, size }: { text: string; size: SealSize }) {
  if (size === "sm") {
    return (
      <span
        className="inline-grid h-6 w-6 shrink-0 place-items-center rounded-[3px] bg-black text-white"
        aria-hidden
      >
        <Search size={12} strokeWidth={3} />
      </span>
    );
  }
  const icon = size === "md" ? 14 : 18;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-[4px] border-2 border-black bg-black text-white",
        size === "md" ? "px-2 py-1" : "px-2.5 py-1.5",
      )}
      aria-hidden
    >
      <Search size={icon} strokeWidth={3} className="shrink-0" />
      <span
        className={cn(
          "font-black uppercase leading-[1.05] tracking-tight",
          size === "md" ? "text-[8px]" : "text-[9px]",
        )}
      >
        {text}
      </span>
    </span>
  );
}

// -----------------------------------------------------------------------------
// Nutri-Score (EU): badge de grado A..E con su color legal. Acentúa el grade
// activo. Colores oficiales del esquema Nutri-Score (verde oscuro -> rojo):
// son colores LEGALES, no de diseño (justificación arriba).
// -----------------------------------------------------------------------------
const NUTRISCORE_COLORS: Record<string, string> = {
  A: "#038141", // verde oscuro
  B: "#85bb2f", // verde claro
  C: "#fecb02", // amarillo
  D: "#ee8100", // naranja
  E: "#e63e11", // rojo
};

function GradeSeal({ grade, size }: { grade: string; size: SealSize }) {
  const px = SIZE_PX[size];
  const color = NUTRISCORE_COLORS[grade.toUpperCase()] ?? "#888888";
  const font =
    size === "sm" ? "text-sm" : size === "md" ? "text-2xl" : "text-4xl";
  return (
    <span
      className="inline-grid shrink-0 place-items-center rounded-[6px] font-black leading-none text-white"
      style={{
        width: px,
        height: Math.round(px * 0.82),
        // Color legal del Nutri-Score (no token de tema)
        backgroundColor: color,
      }}
      aria-hidden
    >
      <span className={cn("font-display", font)}>{grade.toUpperCase()}</span>
    </span>
  );
}

/**
 * Sello regulatorio visual puro. `shape` define el dibujo; `text` el contenido
 * (ya resuelto/uppercase por el caller); `size` el tamaño en una escala fija.
 */
export function RegulatorySeal({
  shape,
  text,
  size = "lg",
  grade,
  signature,
  className,
}: {
  shape: SealShape;
  text: string;
  size?: SealSize;
  /** Para shape "grade": la letra A..E (si falta, usa `text`). */
  grade?: string;
  /** Firma chica bajo el texto del octógono (ej: "Ministerio de Salud" CL). */
  signature?: string | null;
  className?: string;
}) {
  const inner =
    shape === "magnifier" ? (
      <MagnifierSeal text={text} size={size} />
    ) : shape === "grade" ? (
      <GradeSeal grade={grade ?? text} size={size} />
    ) : shape === "octagon" ? (
      <OctagonSeal text={text} size={size} signature={signature} />
    ) : (
      // rect genérico (fallback)
      <span className="inline-grid shrink-0 place-items-center rounded-[4px] bg-black px-2.5 py-1.5 text-[10px] font-black uppercase tracking-tight text-white">
        {text}
      </span>
    );

  if (!className) return inner;
  return <span className={className}>{inner}</span>;
}
