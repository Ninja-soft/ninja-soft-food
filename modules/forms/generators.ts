import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import {
  PAGE,
  createPlanillaDoc,
  downloadPdf,
  drawHeader,
  drawSectionTitle,
  drawSignatureBlock,
  finalizePdf,
  resolvePalette,
  type PlanillaMeta,
} from "@/lib/utils/pdf";
import { exportToExcel, type XlsxColumn } from "@/lib/utils/xlsx";
import type { TenantBranding } from "@/modules/planillas/api";
import type { FormSubmission, FormTemplate } from "./api";
import {
  FIELD_TYPE_LABELS,
  FORM_KIND_LABELS,
  FREQUENCY_LABELS,
  isChecklistValue,
  isPhotoValue,
  type FieldValue,
} from "./schemas";

// Generadores de documentos para planillas configurables:
//  1. PDF en blanco de un template (para completar a mano en planta).
//  2. Export Excel del historial de registros (valores aplanados a columnas por
//     field key). Toda la lógica vive acá, nunca en componentes (regla dura).

// ── PDF en blanco (completar a mano) ─────────────────────────────────────────

/** Carga el logo del tenant como dataURL (mismo patrón que planillas/generators). */
async function loadLogoDataUrl(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function tenantToMeta(
  branding: TenantBranding,
  title: string,
  subtitle?: string
): PlanillaMeta {
  return {
    title,
    tenantName: branding.legalName || branding.name,
    logoUrl: branding.logoUrl,
    subtitle,
    palette: resolvePalette({
      primary: branding.pdfPrimaryColor,
      secondary: branding.pdfSecondaryColor,
    }),
  };
}

/** Descripción legible del rango aceptable de un campo numérico. */
function rangeHint(min?: number | null, max?: number | null): string {
  if (min != null && max != null) return `${min} a ${max}`;
  if (min != null) return `≥ ${min}`;
  if (max != null) return `≤ ${max}`;
  return "";
}

export async function generateBlankFormPdf(
  template: FormTemplate,
  branding: TenantBranding
): Promise<void> {
  const meta = tenantToMeta(
    branding,
    "Planilla para completar",
    FORM_KIND_LABELS[template.kind]
  );
  meta.logoUrl = await loadLogoDataUrl(branding.logoUrl);
  const { doc, startY } = createPlanillaDoc(meta);

  const accent = (meta.palette ?? resolvePalette()).accent;
  const CONTENT_W = PAGE.width - PAGE.margin * 2;
  const MUTED: [number, number, number] = [90, 107, 88];
  const TEXT: [number, number, number] = [19, 25, 15];
  const HAIRLINE: [number, number, number] = [160, 178, 158];

  let y = startY;

  // Encabezado de la planilla: nombre + frecuencia.
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...TEXT);
  doc.text(template.name, PAGE.margin, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  doc.text(
    `Frecuencia: ${FREQUENCY_LABELS[template.frequency.type]} · Fecha: ____ / ____ / ________`,
    PAGE.margin,
    y
  );
  y += 8;

  y = drawSectionTitle(doc, "Datos a registrar", y, accent);

  // Cada campo: etiqueta + casilla/línea vacía para completar a mano.
  for (const field of template.fields) {
    // El checklist ocupa una fila por opción; el resto, una fila base.
    const checklistOpts =
      field.type === "checklist"
        ? (field.options ?? []).filter((o) => o.length > 0)
        : [];
    const rowH =
      field.type === "checklist"
        ? 8 + checklistOpts.length * 5.5
        : field.type === "photo"
          ? 24
          : 11;

    if (y + rowH > PAGE.height - 40) {
      doc.addPage();
      drawHeader(doc, meta);
      y = 42;
      y = drawSectionTitle(doc, "Datos a registrar (continuación)", y, accent);
    }

    // Etiqueta + tipo/unidad/rango.
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(...TEXT);
    const reqMark = field.required ? " *" : "";
    doc.text(`${field.label}${reqMark}`, PAGE.margin, y);

    const meta2: string[] = [FIELD_TYPE_LABELS[field.type]];
    if (field.unit) meta2.push(field.unit);
    const range = rangeHint(field.min, field.max);
    if (range) meta2.push(`rango ${range}`);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(`(${meta2.join(" · ")})`, PAGE.margin, y + 3.5);

    // Zona para escribir el valor.
    if (field.type === "bool") {
      // Casillas Sí / No.
      const bx = PAGE.margin + CONTENT_W - 60;
      doc.setDrawColor(...HAIRLINE);
      doc.setLineWidth(0.3);
      doc.rect(bx, y - 3, 4, 4);
      doc.text("Sí", bx + 6, y);
      doc.rect(bx + 22, y - 3, 4, 4);
      doc.text("No", bx + 28, y);
    } else if (field.type === "select") {
      const opts = (field.options ?? []).join("   /   ");
      doc.setFontSize(8);
      doc.setTextColor(...MUTED);
      doc.text(opts || "____________", PAGE.margin + CONTENT_W - 90, y, {
        maxWidth: 90,
        align: "left",
      });
    } else if (field.type === "checklist") {
      // Una casilla tildable + etiqueta por opción, debajo del label.
      let cy = y + 6;
      doc.setFontSize(8);
      for (const opt of checklistOpts.length ? checklistOpts : ["____________"]) {
        doc.setDrawColor(...HAIRLINE);
        doc.setLineWidth(0.3);
        doc.rect(PAGE.margin + 2, cy - 3, 3.5, 3.5);
        doc.setTextColor(...MUTED);
        doc.text(opt, PAGE.margin + 8, cy);
        cy += 5.5;
      }
    } else if (field.type === "photo") {
      // Recuadro para pegar/grapar la foto impresa.
      const bw = 50;
      const bh = 18;
      const bx = PAGE.margin + CONTENT_W - bw;
      doc.setDrawColor(...HAIRLINE);
      doc.setLineWidth(0.3);
      doc.rect(bx, y - 2, bw, bh);
      doc.setFontSize(7);
      doc.setTextColor(...MUTED);
      doc.text("Foto", bx + bw / 2, y + bh / 2, { align: "center" });
    } else {
      // Línea para escribir (number / temperature / text / time).
      const lx = PAGE.margin + CONTENT_W - 70;
      doc.setDrawColor(...HAIRLINE);
      doc.setLineWidth(0.3);
      doc.line(lx, y, lx + 60, y);
      const suffix = field.unit || (field.type === "time" ? "hs" : "");
      if (suffix) {
        doc.setFontSize(8);
        doc.setTextColor(...MUTED);
        doc.text(suffix, lx + 62, y);
      }
    }

    // Hairline separador.
    doc.setDrawColor(216, 226, 214);
    doc.setLineWidth(0.1);
    doc.line(PAGE.margin, y + rowH - 6, PAGE.width - PAGE.margin, y + rowH - 6);
    y += rowH;
  }

  // Acción correctiva (si el template define instrucciones ante falla).
  const instructions = template.action_on_fail?.instructions;
  if (instructions) {
    y += 4;
    y = drawSectionTitle(doc, "Acción ante desvío", y, accent);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    doc.text(instructions, PAGE.margin, y, { maxWidth: CONTENT_W });
    y += 14;
  }

  // Firma.
  if (y > PAGE.height - 40) {
    doc.addPage();
    drawHeader(doc, meta);
    y = 42;
  }
  y += 6;
  drawSignatureBlock(doc, y);

  finalizePdf(doc);
  downloadPdf(
    doc,
    `planilla-${template.name.replace(/\s+/g, "-").toLowerCase()}`
  );
}

// ── Export Excel del historial (valores aplanados por field key) ─────────────

function fmtDateTime(value: string): string {
  try {
    return format(parseISO(value), "dd/MM/yyyy HH:mm", { locale: es });
  } catch {
    return value;
  }
}

const STATUS_LABELS: Record<string, string> = {
  ok: "OK",
  fail: "Desvío",
  corrected: "Corregido",
};

/** Representa un valor de campo como texto plano para la celda de Excel. */
function valueToCell(value: FieldValue | undefined): string | number {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "Sí" : "No";
  // checklist → opciones tildadas separadas por coma.
  if (isChecklistValue(value)) return value.join(", ");
  // photo → nombre del archivo (el path/URL no se vuelca al Excel plano).
  if (isPhotoValue(value)) return value.name || "Foto adjunta";
  return value;
}

export async function exportSubmissionsToExcel(
  template: FormTemplate,
  submissions: FormSubmission[]
): Promise<void> {
  // Columnas fijas + una columna por cada field del template.
  const fieldColumns: XlsxColumn[] = template.fields.map((f) => ({
    header: f.unit ? `${f.label} (${f.unit})` : f.label,
    key: `field_${f.key}`,
    width: 16,
    format: f.type === "number" || f.type === "temperature" ? "number" : "text",
  }));

  const columns: XlsxColumn[] = [
    { header: "Fecha y hora", key: "datetime", width: 18 },
    { header: "Operario", key: "member", width: 24 },
    { header: "Estado", key: "status", width: 12 },
    ...fieldColumns,
    { header: "Acción correctiva", key: "corrective", width: 32 },
  ];

  const rows = submissions.map((s) => {
    const row: Record<string, unknown> = {
      datetime: fmtDateTime(s.submitted_at),
      member: s.member?.full_name ?? "",
      status: STATUS_LABELS[s.status] ?? s.status,
      corrective: s.corrective_action ?? "",
    };
    for (const f of template.fields) {
      row[`field_${f.key}`] = valueToCell(s.values?.[f.key]);
    }
    return row;
  });

  await exportToExcel({
    filename: `registros-${template.name.replace(/\s+/g, "-").toLowerCase()}`,
    sheetName: "Registros",
    title: template.name,
    subtitle: `${FORM_KIND_LABELS[template.kind]} · ${submissions.length} registros`,
    columns,
    rows,
  });
}
