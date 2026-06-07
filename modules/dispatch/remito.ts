import { parseISO } from "date-fns";
import {
  createPlanillaDoc,
  downloadPdf,
  drawFieldGrid,
  drawHeader,
  drawSectionTitle,
  drawTable,
  finalizePdf,
  PAGE,
  type PlanillaMeta,
} from "@/lib/utils/pdf";
import type { TenantBranding } from "@/modules/planillas/api";
import type { DispatchDetail } from "./api";

// Remito de despacho (PDF imprimible). Reusa los helpers de lib/utils/pdf con la
// estética de marca Ninja Food. Toda la generación vive acá, nunca en componentes.
// Español rioplatense.

// Formatters por locale del tenant (operating profile, branding.locale). NUNCA
// hardcodear es-AR: el remito de un tenant de México se imprime con es-MX.
type Formatters = {
  fmtDate: (value: string | null | undefined) => string;
  fmtNum: (value: number | null | undefined, maxFrac?: number) => string;
};

function makeFormatters(locale: string): Formatters {
  const dateFmt = new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  return {
    fmtDate(value) {
      if (!value) return "-";
      try {
        return dateFmt.format(parseISO(value));
      } catch {
        return "-";
      }
    },
    fmtNum(value, maxFrac = 3) {
      if (value === null || value === undefined) return "-";
      return new Intl.NumberFormat(locale, {
        maximumFractionDigits: maxFrac,
      }).format(value);
    },
  };
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
  };
}

/** Carga el logo del tenant como dataURL para incrustarlo en el PDF. */
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

/** Bloque de firmas Entregó / Recibió con línea de firma (estilo remito). */
function drawDispatchSignatures(
  doc: ReturnType<typeof createPlanillaDoc>["doc"],
  y: number
): void {
  const contentW = PAGE.width - PAGE.margin * 2;
  const colW = contentW / 2;
  const lineY = y + 14;
  const labels = ["Entregó", "Recibió"];
  doc.setDrawColor(90, 107, 88);
  doc.setLineWidth(0.3);
  labels.forEach((label, i) => {
    const x = PAGE.margin + i * colW;
    const lineW = colW - 14;
    doc.line(x, lineY, x + lineW, lineY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(90, 107, 88);
    doc.text(label, x, lineY + 5);
    doc.text("Aclaración / firma", x, lineY + 9);
  });
}

/** Genera y descarga el remito PDF de un despacho. */
export async function generateRemito(
  dispatch: DispatchDetail,
  branding: TenantBranding
): Promise<void> {
  const { fmtDate, fmtNum } = makeFormatters(branding.locale);
  const meta = tenantToMeta(
    branding,
    "Remito de despacho",
    `Fecha ${fmtDate(dispatch.dispatch_date)}`
  );
  meta.logoUrl = await loadLogoDataUrl(branding.logoUrl);
  const { doc, startY } = createPlanillaDoc(meta);
  let y = startY;

  // Datos del cliente.
  y = drawSectionTitle(doc, "Cliente", y);
  y = drawFieldGrid(
    doc,
    [
      { label: "Razón social / Nombre", value: dispatch.customer?.name || "-" },
      { label: "Localidad", value: dispatch.customer?.locality || "-" },
      { label: "Domicilio", value: dispatch.customer?.address || "-" },
      { label: "Teléfono", value: dispatch.customer?.phone || "-" },
    ],
    y
  );

  y += 4;

  // Datos del transporte (vehículo + habilitaciones UTA/URA).
  y = drawSectionTitle(doc, "Transporte", y);
  y = drawFieldGrid(
    doc,
    [
      { label: "Patente", value: dispatch.vehicle?.plate || "Sin vehículo" },
      {
        label: "UTA",
        value: dispatch.vehicle?.uta_number
          ? `${dispatch.vehicle.uta_number} · vence ${fmtDate(dispatch.vehicle.uta_expiry)}`
          : "-",
      },
      {
        label: "URA",
        value: dispatch.vehicle?.ura_number
          ? `${dispatch.vehicle.ura_number} · vence ${fmtDate(dispatch.vehicle.ura_expiry)}`
          : "-",
      },
      {
        label: "Capacidad",
        value: dispatch.vehicle?.capacity_kg
          ? `${fmtNum(dispatch.vehicle.capacity_kg)} kg`
          : "-",
      },
    ],
    y
  );

  y += 4;

  // Tabla de ítems despachados (producto, RNPA, lote, cantidad).
  const totalKg = dispatch.items.reduce(
    (s, it) => s + (it.quantity_kg ?? 0),
    0
  );
  y = drawSectionTitle(doc, "Productos despachados", y);
  y = drawTable(doc, {
    startY: y,
    columns: [
      { header: "Producto" },
      { header: "RNPA", width: 30 },
      { header: "Lote", width: 34 },
      { header: "Vence", width: 24, align: "right" },
      { header: "Cant. (kg)", width: 26, align: "right" },
    ],
    rows: dispatch.items.map((it) => [
      it.recipe?.commercial_name || it.recipe?.title || "-",
      it.recipe?.rnpa_number || "-",
      it.production?.product_lot_number || "sin lote",
      fmtDate(it.production?.product_expiry_date),
      fmtNum(it.quantity_kg),
    ]),
    onPageBreak: (d) => {
      drawHeader(d, meta);
      return 42;
    },
  });

  // Total general.
  y += 5;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(46, 125, 50);
  doc.text(`Total despachado: ${fmtNum(totalKg)} kg`, 196, y, {
    align: "right",
  });
  y += 6;

  // Bloque de firmas (Entregó / Recibió) propio del remito.
  drawDispatchSignatures(doc, y + 8);

  finalizePdf(doc);
  downloadPdf(
    doc,
    `remito-${dispatch.customer?.name?.replace(/\s+/g, "-").toLowerCase() ?? "despacho"}-${dispatch.dispatch_date}`
  );
}
