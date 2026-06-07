import { jsPDF } from "jspdf";
import { format } from "date-fns";
import { es } from "date-fns/locale";

// Planillas imprimibles (CLAUDE.md §9): helper PDF con jspdf, sin jspdf-autotable.
// Layout funcional heredado de La Jamonera (planilla_produccion.js) con estética
// Ninja Food: header de marca con logo del tenant, footer paginado y tabla propia
// con salto de página + repetición de header. Todo en español rioplatense.

// ── Paleta de marca (RGB) ───────────────────────────────────────────────────
// Los acentos (primario = banda del header / secundario = títulos y tablas) ya
// NO son constantes fijas: cada tenant define sus colores en tenant_branding
// (regla 10 — nada hardcodeado al cliente). DEFAULT_* son el fallback Ninja Food.
type RGB = [number, number, number];

const DEFAULT_BRAND_DARK: RGB = [8, 18, 10]; // food-dark · #08120A
const DEFAULT_BRAND_GREEN: RGB = [46, 125, 50]; // primary · #2E7D32
const MUTED: RGB = [90, 107, 88];
const HAIRLINE: RGB = [216, 226, 214];
const ZEBRA: RGB = [241, 246, 240];
const TEXT: RGB = [19, 25, 15];
const WHITE: RGB = [255, 255, 255];

/** Hex válido de 6 dígitos (#RRGGBB), con o sin almohadilla. */
export function hexToRgb(hex: string | null | undefined, fallback: RGB): RGB {
  if (!hex) return fallback;
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return fallback;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Paleta resuelta de una planilla: el color PRIMARIO pinta la banda oscura del
 * header; el SECUNDARIO (acento) pinta el header de tablas, títulos de sección y
 * la regla bajo ellos. Construir con resolvePalette(branding) para aplicar el
 * fallback Ninja Food cuando el tenant no definió colores.
 */
export interface PlanillaPalette {
  primary: RGB;
  accent: RGB;
}

export const DEFAULT_PALETTE: PlanillaPalette = {
  primary: DEFAULT_BRAND_DARK,
  accent: DEFAULT_BRAND_GREEN,
};

/** Resuelve la paleta de la planilla desde dos hex (con fallback al default). */
export function resolvePalette(colors?: {
  primary?: string | null;
  secondary?: string | null;
}): PlanillaPalette {
  return {
    primary: hexToRgb(colors?.primary, DEFAULT_BRAND_DARK),
    accent: hexToRgb(colors?.secondary, DEFAULT_BRAND_GREEN),
  };
}

// A4 en mm.
export const PAGE = {
  width: 210,
  height: 297,
  margin: 14,
};
const CONTENT_W = PAGE.width - PAGE.margin * 2;
const HEADER_BOTTOM = 34; // y donde termina la banda de marca
const FOOTER_TOP = PAGE.height - 14; // y de la línea de footer

export interface PlanillaMeta {
  title: string;
  tenantName: string;
  /** dataURL (png/jpg) del logo del tenant; opcional. */
  logoUrl?: string | null;
  subtitle?: string;
  /** Paleta del tenant; si falta se usa DEFAULT_PALETTE (Ninja Food). */
  palette?: PlanillaPalette;
}

/** Documento A4 con header de marca; el footer se pinta al final con finalizePdf. */
export function createPlanillaDoc(meta: PlanillaMeta): {
  doc: jsPDF;
  startY: number;
  meta: PlanillaMeta;
} {
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  drawHeader(doc, meta);
  return { doc, startY: HEADER_BOTTOM + 8, meta };
}

/** Pinta la banda de marca en la página actual. */
export function drawHeader(doc: jsPDF, meta: PlanillaMeta): void {
  const palette = meta.palette ?? DEFAULT_PALETTE;
  // Banda de fondo (color primario del tenant).
  doc.setFillColor(...palette.primary);
  doc.rect(0, 0, PAGE.width, HEADER_BOTTOM, "F");
  // Acento inferior (color secundario del tenant).
  doc.setFillColor(...palette.accent);
  doc.rect(0, HEADER_BOTTOM, PAGE.width, 1.2, "F");

  let textX = PAGE.margin;
  // Logo del tenant (si hay), a la izquierda.
  if (meta.logoUrl) {
    try {
      const fmt = meta.logoUrl.includes("image/png") ? "PNG" : "JPEG";
      doc.addImage(meta.logoUrl, fmt, PAGE.margin, 7, 20, 20, undefined, "FAST");
      textX = PAGE.margin + 25;
    } catch {
      // Si el logo no se puede decodificar, seguimos sin él.
    }
  }

  // Nombre del tenant.
  doc.setTextColor(...WHITE);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(meta.tenantName, textX, 14);

  // Título de la planilla.
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(180, 200, 178);
  doc.text(meta.title, textX, 20);

  // Fecha de emisión (derecha).
  const issued = `Emitido ${format(new Date(), "dd/MM/yyyy HH:mm", { locale: es })}`;
  doc.setFontSize(8);
  doc.setTextColor(150, 175, 150);
  doc.text(issued, PAGE.width - PAGE.margin, 12, { align: "right" });

  if (meta.subtitle) {
    doc.setFontSize(8);
    doc.text(meta.subtitle, PAGE.width - PAGE.margin, 18, { align: "right" });
  }
}

// ── Tabla propia (sin jspdf-autotable) ───────────────────────────────────────

export interface PdfTableColumn {
  header: string;
  /** Ancho en mm; si falta se reparte el espacio restante en partes iguales. */
  width?: number;
  align?: "left" | "right" | "center";
}

export interface DrawTableOptions {
  columns: PdfTableColumn[];
  rows: string[][];
  startY: number;
  /** Repite el header de la tabla tras cada salto de página. Default true. */
  repeatHeader?: boolean;
  /** Callback de header de página tras un salto (para repintar la banda). */
  onPageBreak?: (doc: jsPDF) => number;
  fontSize?: number;
  /** Color del header de la tabla (acento del tenant). Default Ninja Food. */
  accent?: RGB;
}

const ROW_PAD_Y = 2.4;
const CELL_PAD_X = 2;

function resolveWidths(columns: PdfTableColumn[]): number[] {
  const fixed = columns.reduce((s, c) => s + (c.width ?? 0), 0);
  const autoCount = columns.filter((c) => c.width == null).length;
  const autoW = autoCount > 0 ? (CONTENT_W - fixed) / autoCount : 0;
  return columns.map((c) => c.width ?? autoW);
}

/** Mide la altura de una fila considerando wrap de texto multi-línea. */
function rowHeight(
  doc: jsPDF,
  cells: string[],
  widths: number[],
  lineH: number,
): { lines: string[][]; height: number } {
  let maxLines = 1;
  const lines = cells.map((text, i) => {
    const wrapped = doc.splitTextToSize(
      text ?? "",
      widths[i] - CELL_PAD_X * 2,
    ) as string[];
    if (wrapped.length > maxLines) maxLines = wrapped.length;
    return wrapped;
  });
  return { lines, height: maxLines * lineH + ROW_PAD_Y * 2 };
}

/**
 * Dibuja una tabla con header verde, zebra y salto de página automático.
 * Devuelve la `y` final tras la última fila.
 */
export function drawTable(doc: jsPDF, opts: DrawTableOptions): number {
  const fontSize = opts.fontSize ?? 8.5;
  const lineH = fontSize * 0.42; // mm aprox.
  const widths = resolveWidths(opts.columns);
  const repeatHeader = opts.repeatHeader ?? true;
  const accent = opts.accent ?? DEFAULT_BRAND_GREEN;
  let y = opts.startY;

  const drawTableHeader = () => {
    doc.setFillColor(...accent);
    doc.rect(PAGE.margin, y, CONTENT_W, lineH + ROW_PAD_Y * 2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(fontSize);
    doc.setTextColor(...WHITE);
    let x = PAGE.margin;
    opts.columns.forEach((col, i) => {
      const align = col.align ?? "left";
      const tx =
        align === "right"
          ? x + widths[i] - CELL_PAD_X
          : align === "center"
            ? x + widths[i] / 2
            : x + CELL_PAD_X;
      doc.text(col.header, tx, y + ROW_PAD_Y + lineH * 0.8, { align });
      x += widths[i];
    });
    y += lineH + ROW_PAD_Y * 2;
  };

  drawTableHeader();

  doc.setFont("helvetica", "normal");
  doc.setTextColor(...TEXT);
  opts.rows.forEach((cells, ri) => {
    const { lines, height } = rowHeight(doc, cells, widths, lineH);

    // Salto de página si la fila no entra.
    if (y + height > FOOTER_TOP - 6) {
      doc.addPage();
      y = opts.onPageBreak ? opts.onPageBreak(doc) : PAGE.margin;
      if (repeatHeader) drawTableHeader();
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...TEXT);
    }

    // Zebra.
    if (ri % 2 === 1) {
      doc.setFillColor(...ZEBRA);
      doc.rect(PAGE.margin, y, CONTENT_W, height, "F");
    }

    let x = PAGE.margin;
    opts.columns.forEach((col, i) => {
      const align = col.align ?? "left";
      const tx =
        align === "right"
          ? x + widths[i] - CELL_PAD_X
          : align === "center"
            ? x + widths[i] / 2
            : x + CELL_PAD_X;
      lines[i].forEach((ln, li) => {
        doc.text(ln, tx, y + ROW_PAD_Y + lineH * 0.8 + li * lineH, { align });
      });
      x += widths[i];
    });

    // Hairline inferior.
    doc.setDrawColor(...HAIRLINE);
    doc.setLineWidth(0.1);
    doc.line(PAGE.margin, y + height, PAGE.width - PAGE.margin, y + height);

    y += height;
  });

  return y;
}

// ── Bloques reutilizables ────────────────────────────────────────────────────

/** Título de sección con regla bajo el texto (acento del tenant). */
export function drawSectionTitle(
  doc: jsPDF,
  text: string,
  y: number,
  accent: RGB = DEFAULT_BRAND_GREEN,
): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...accent);
  doc.text(text.toUpperCase(), PAGE.margin, y);
  doc.setDrawColor(...accent);
  doc.setLineWidth(0.4);
  doc.line(PAGE.margin, y + 1.5, PAGE.margin + 24, y + 1.5);
  return y + 7;
}

/** Grilla de pares etiqueta/valor en dos columnas. */
export function drawFieldGrid(
  doc: jsPDF,
  fields: { label: string; value: string }[],
  startY: number,
): number {
  const colW = CONTENT_W / 2;
  const rowH = 9;
  let y = startY;
  fields.forEach((f, i) => {
    const col = i % 2;
    const x = PAGE.margin + col * colW;
    if (col === 0 && i > 0) y += rowH;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(f.label.toUpperCase(), x, y);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(...TEXT);
    doc.text(f.value || "-", x, y + 4.5);
  });
  return y + rowH + 2;
}

/** Bloque de firmas Elaboró / Controló con línea de firma. */
export function drawSignatureBlock(
  doc: jsPDF,
  y: number,
  opts?: { elaboro?: string; controlo?: string },
): number {
  const colW = CONTENT_W / 2;
  const lineY = y + 14;
  const cols: { label: string; name?: string }[] = [
    { label: "Elaboró", name: opts?.elaboro },
    { label: "Controló", name: opts?.controlo },
  ];
  doc.setDrawColor(...MUTED);
  doc.setLineWidth(0.3);
  cols.forEach((c, i) => {
    const x = PAGE.margin + i * colW;
    const lineW = colW - 14;
    doc.line(x, lineY, x + lineW, lineY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(c.label, x, lineY + 5);
    if (c.name) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...TEXT);
      doc.text(c.name, x, lineY - 1.5);
    }
  });
  return lineY + 8;
}

/** Pega un QR (dataURL) con leyenda a la derecha de la página. */
export function drawQr(
  doc: jsPDF,
  dataUrl: string,
  y: number,
  caption?: string,
): void {
  const size = 30;
  const x = PAGE.width - PAGE.margin - size;
  try {
    doc.addImage(dataUrl, "PNG", x, y, size, size, undefined, "FAST");
  } catch {
    return;
  }
  if (caption) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...MUTED);
    doc.text(caption, x + size / 2, y + size + 3, {
      align: "center",
      maxWidth: size + 6,
    });
  }
}

/**
 * Pinta el footer paginado en todas las páginas y devuelve el doc.
 * Llamar una sola vez, al final, antes de guardar/descargar.
 */
export function finalizePdf(doc: jsPDF): jsPDF {
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setDrawColor(...HAIRLINE);
    doc.setLineWidth(0.2);
    doc.line(PAGE.margin, FOOTER_TOP, PAGE.width - PAGE.margin, FOOTER_TOP);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(`Página ${i} de ${total}`, PAGE.margin, FOOTER_TOP + 4);
    doc.text("Generado por Ninja Food", PAGE.width - PAGE.margin, FOOTER_TOP + 4, {
      align: "right",
    });
  }
  return doc;
}

/** Descarga el PDF en el navegador. */
export function downloadPdf(doc: jsPDF, filename: string): void {
  doc.save(filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
}
