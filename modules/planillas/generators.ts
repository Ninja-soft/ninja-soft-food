import QRCode from "qrcode";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import {
  createPlanillaDoc,
  downloadPdf,
  drawFieldGrid,
  drawHeader,
  drawQr,
  drawSectionTitle,
  drawSignatureBlock,
  drawTable,
  finalizePdf,
  type PlanillaMeta,
} from "@/lib/utils/pdf";
import type {
  ProductionDetail,
  ProductionSummaryRow,
  StockSummaryRow,
  TenantBranding,
} from "./api";

// Generadores de planillas PDF (heredan el layout funcional de La Jamonera
// `JS/planilla_produccion.js` como referencia de CONTENIDO, con estética Ninja
// Food). Toda la generación vive acá, nunca en componentes.

// ── Helpers de formato es-AR ─────────────────────────────────────────────────

function fmtDate(value: string | null | undefined): string {
  if (!value) return "-";
  try {
    return format(parseISO(value), "dd/MM/yyyy", { locale: es });
  } catch {
    return "-";
  }
}

function fmtNum(value: number | null | undefined, maxFrac = 3): string {
  if (value === null || value === undefined) return "-";
  return new Intl.NumberFormat("es-AR", {
    maximumFractionDigits: maxFrac,
  }).format(value);
}

function tenantToMeta(
  branding: TenantBranding,
  title: string,
  subtitle?: string,
): PlanillaMeta {
  return {
    title,
    tenantName: branding.legalName || branding.name,
    logoUrl: branding.logoUrl,
    subtitle,
  };
}

/** URL pública de la traza (misma convención que TraceQrModal). */
function traceUrl(slug: string): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ??
    (typeof window !== "undefined" ? window.location.origin : "");
  return `${base}/t/${slug}`;
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

async function qrDataUrl(slug: string): Promise<string | null> {
  try {
    return await QRCode.toDataURL(traceUrl(slug), {
      width: 320,
      margin: 1,
      color: { dark: "#04140A", light: "#FFFFFF" },
    });
  } catch {
    return null;
  }
}

// ── Planilla individual (1 página por producción) ────────────────────────────

/** Pinta una planilla de producción en el doc actual; devuelve la `y` final. */
function renderProductionPlanilla(
  doc: ReturnType<typeof createPlanillaDoc>["doc"],
  startY: number,
  meta: PlanillaMeta,
  prod: ProductionDetail,
  qr: string | null,
): void {
  let y = startY;

  // Encabezado de datos del producto.
  y = drawSectionTitle(doc, "Producto elaborado", y);
  y = drawFieldGrid(
    doc,
    [
      { label: "Código", value: prod.code },
      { label: "Fecha de producción", value: fmtDate(prod.production_date) },
      {
        label: "Producto",
        value: prod.recipe?.commercial_name || prod.recipe?.title || "-",
      },
      {
        label: "RNPA",
        value: prod.recipe?.rnpa_exempt
          ? "Exento"
          : prod.recipe?.rnpa_number || "-",
      },
      {
        label: "Cantidad elaborada",
        value: `${fmtNum(prod.quantity_kg)} kg`,
      },
      { label: "Lote producto", value: prod.product_lot_number || "-" },
      { label: "Fecha de envasado", value: fmtDate(prod.packaging_date) },
      { label: "Vencimiento", value: fmtDate(prod.product_expiry_date) },
    ],
    y,
  );

  y += 4;

  // Tabla de insumos consumidos.
  y = drawSectionTitle(doc, "Insumos consumidos (trazabilidad)", y);
  y = drawTable(doc, {
    startY: y,
    columns: [
      { header: "Ingrediente", width: 48 },
      { header: "Lote", width: 30 },
      { header: "Proveedor" },
      { header: "RNE", width: 26 },
      { header: "Cant.", width: 22, align: "right" },
      { header: "Vence", width: 22, align: "right" },
    ],
    rows: prod.inputs.map((ri) => [
      ri.is_substitute ? `${ri.ingredient_name} (sustituto)` : ri.ingredient_name,
      ri.lot_number || "compra menor",
      ri.supplier_name || "-",
      ri.supplier_rne || "-",
      `${fmtNum(ri.taken_qty)} ${ri.unit}`,
      fmtDate(ri.expiry_date),
    ]),
    onPageBreak: (d) => {
      drawHeader(d, meta);
      return 42;
    },
  });

  if (prod.notes) {
    y += 4;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(90, 107, 88);
    doc.text(`Observaciones: ${prod.notes}`, 14, y, { maxWidth: 182 });
    y += 8;
  }

  // QR de traza (si hay slug) a la derecha.
  if (qr) {
    drawQr(doc, qr, y + 2, "Traza pública · escaneá el QR");
  }

  // Firmas al pie del bloque.
  drawSignatureBlock(doc, y + (qr ? 2 : 6), {
    elaboro: prod.manager?.full_name,
  });
}

export async function generateProductionPlanilla(
  prod: ProductionDetail,
  branding: TenantBranding,
): Promise<void> {
  const meta = tenantToMeta(
    branding,
    "Planilla de producción",
    `Código ${prod.code}`,
  );
  meta.logoUrl = await loadLogoDataUrl(branding.logoUrl);
  const { doc, startY } = createPlanillaDoc(meta);
  const qr = prod.trace_slug ? await qrDataUrl(prod.trace_slug) : null;
  renderProductionPlanilla(doc, startY, meta, prod, qr);
  finalizePdf(doc);
  downloadPdf(doc, `planilla-${prod.code}`);
}

// ── Planilla masiva (una producción por página) ──────────────────────────────

export async function generateBulkProductionPlanillas(
  productions: ProductionDetail[],
  branding: TenantBranding,
): Promise<void> {
  if (productions.length === 0) return;
  const logoDataUrl = await loadLogoDataUrl(branding.logoUrl);
  const baseMeta = tenantToMeta(branding, "Planilla de producción");
  baseMeta.logoUrl = logoDataUrl;

  // La primera página la pinta createPlanillaDoc; las siguientes, drawHeader.
  const firstMeta: PlanillaMeta = {
    ...baseMeta,
    subtitle: `Código ${productions[0].code}`,
  };
  const { doc, startY } = createPlanillaDoc(firstMeta);

  for (let i = 0; i < productions.length; i++) {
    const prod = productions[i];
    const meta: PlanillaMeta = { ...baseMeta, subtitle: `Código ${prod.code}` };
    const pageStartY = i === 0 ? startY : 42;
    if (i > 0) {
      doc.addPage();
      drawHeader(doc, meta);
    }
    const qr = prod.trace_slug ? await qrDataUrl(prod.trace_slug) : null;
    renderProductionPlanilla(doc, pageStartY, meta, prod, qr);
  }

  finalizePdf(doc);
  downloadPdf(doc, `planillas-produccion-${format(new Date(), "yyyyMMdd")}`);
}

// ── Planilla semanal / resumen tabular ───────────────────────────────────────

export function generateWeeklyProductionPlanilla(
  rows: ProductionSummaryRow[],
  range: { from: string; to: string },
  branding: TenantBranding,
): void {
  const subtitle = `${fmtDate(range.from)} al ${fmtDate(range.to)} · ${rows.length} producciones`;
  const meta = tenantToMeta(branding, "Resumen de producción", subtitle);
  const { doc, startY } = createPlanillaDoc(meta);

  const totalKg = rows.reduce((s, r) => s + (r.quantity_kg ?? 0), 0);

  drawTable(doc, {
    startY,
    columns: [
      { header: "Fecha", width: 26 },
      { header: "Código", width: 30 },
      { header: "Receta" },
      { header: "Cant. (kg)", width: 24, align: "right" },
      { header: "Lote", width: 32 },
      { header: "Vence", width: 24, align: "right" },
    ],
    rows: rows.map((r) => [
      fmtDate(r.production_date),
      r.code,
      r.recipe_title,
      fmtNum(r.quantity_kg),
      r.product_lot_number || "-",
      fmtDate(r.product_expiry_date),
    ]),
    onPageBreak: (d) => {
      drawHeader(d, meta);
      return 42;
    },
  });

  // Total general.
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(46, 125, 50);
  doc.text(
    `Total elaborado: ${fmtNum(totalKg)} kg`,
    196,
    doc.internal.pageSize.getHeight() - 20,
    { align: "right" },
  );

  finalizePdf(doc);
  downloadPdf(
    doc,
    `resumen-produccion-${range.from}_${range.to}`,
  );
}

export function generateWeeklyStockPlanilla(
  rows: StockSummaryRow[],
  range: { from: string; to: string },
  branding: TenantBranding,
): void {
  const subtitle = `${fmtDate(range.from)} al ${fmtDate(range.to)} · ${rows.length} ingresos`;
  const meta = tenantToMeta(branding, "Resumen de ingresos de stock", subtitle);
  const { doc, startY } = createPlanillaDoc(meta);

  drawTable(doc, {
    startY,
    columns: [
      { header: "Fecha", width: 26 },
      { header: "Ingrediente" },
      { header: "Lote", width: 32 },
      { header: "Proveedor" },
      { header: "Cant.", width: 24, align: "right" },
      { header: "Vence", width: 24, align: "right" },
    ],
    rows: rows.map((e) => [
      fmtDate(e.created_at),
      e.ingredient_name,
      e.lot_number,
      e.supplier_name || "-",
      `${fmtNum(e.quantity)} ${e.unit}`,
      fmtDate(e.expiry_date),
    ]),
    onPageBreak: (d) => {
      drawHeader(d, meta);
      return 42;
    },
  });

  finalizePdf(doc);
  downloadPdf(doc, `resumen-ingresos-${range.from}_${range.to}`);
}
