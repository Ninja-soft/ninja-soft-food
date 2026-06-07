import { parseISO } from "date-fns";
import {
  createPlanillaDoc,
  downloadPdf,
  drawFieldGrid,
  drawHeader,
  drawSectionTitle,
  drawSignatureBlock,
  drawTable,
  finalizePdf,
  PAGE,
  type PlanillaMeta,
} from "@/lib/utils/pdf";
import { exportSheetsToExcel } from "@/lib/utils/xlsx";
import type { TenantBranding } from "@/modules/planillas/api";
import type {
  AffectedCustomer,
  BackwardTrace,
  ForwardTrace,
  TraceDispatch,
} from "./api";

// Exportables del recall: acta PDF + planilla Excel. Toda la generación vive acá,
// nunca en componentes (regla dura del proyecto). El branding sale del tenant.

// ── Modelo unificado para los exportables ─────────────────────────────────────

/** Eslabón de cadena aplanado para la tabla del acta (origen → producción → despacho). */
export type ChainRow = {
  origin: string;
  originLot: string;
  production: string;
  productionLot: string;
  customer: string;
  locality: string;
  dispatchDate: string;
  quantityKg: number;
  flag: string;
};

export type RecallExportData = {
  /** Lote afectado (MP o PT) que origina el recall. */
  affectedLabel: string;
  affectedType: "MP" | "PT";
  affectedLot: string;
  /** Datos del origen para el bloque de cabecera del acta. */
  headerFields: { label: string; value: string }[];
  chain: ChainRow[];
  affectedCustomers: AffectedCustomer[];
  totalDispatchedKg: number;
};

// ── Helpers de formato por locale del tenant ─────────────────────────────────
// El locale viaja como parámetro desde el caller (operating profile del tenant);
// NUNCA se hardcodea es-AR. Default es-AR solo como red de seguridad histórica
// (los callers de la app siempre pasan el locale real).
const DEFAULT_LOCALE = "es-AR";

type Formatters = {
  fmtDate: (value: string | null | undefined) => string;
  fmtNum: (value: number | null | undefined, maxFrac?: number) => string;
};

function makeFormatters(locale: string = DEFAULT_LOCALE): Formatters {
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

function dispatchFlag(d: TraceDispatch): string {
  if (d.deleted) return "BORRADO (mercadería salida)";
  if (d.voided) return "ANULADO (mercadería salida)";
  return "Vigente";
}

function contactLine(c: AffectedCustomer): string {
  return (
    [c.phone, c.email, c.address].filter(Boolean).join(" · ") ||
    "Sin datos de contacto"
  );
}

// ── Aplanado desde forward / backward al modelo de export ─────────────────────

export function forwardToExport(
  trace: ForwardTrace,
  locale?: string,
): RecallExportData {
  const { fmtDate, fmtNum } = makeFormatters(locale);
  const chain: ChainRow[] = [];
  for (const p of trace.productions) {
    if (p.dispatches.length === 0) {
      chain.push({
        origin: trace.origin.ingredientName,
        originLot: trace.origin.lotNumber,
        production: p.code,
        productionLot: p.productLotNumber ?? "-",
        customer: "(sin despacho registrado)",
        locality: "-",
        dispatchDate: "-",
        quantityKg: 0,
        flag: "-",
      });
      continue;
    }
    for (const d of p.dispatches) {
      chain.push({
        origin: trace.origin.ingredientName,
        originLot: trace.origin.lotNumber,
        production: p.code,
        productionLot: p.productLotNumber ?? "-",
        customer: d.customer?.name ?? "(cliente sin datos)",
        locality: d.customer?.locality ?? "-",
        dispatchDate: d.dispatchDate,
        quantityKg: d.quantityKg,
        flag: dispatchFlag(d),
      });
    }
  }

  return {
    affectedLabel: trace.origin.ingredientName,
    affectedType: "MP",
    affectedLot: trace.origin.lotNumber,
    headerFields: [
      { label: "Tipo de lote", value: "Materia prima (MP)" },
      { label: "Ingrediente", value: trace.origin.ingredientName },
      { label: "Lote", value: trace.origin.lotNumber },
      { label: "Proveedor", value: trace.origin.supplier?.name ?? "-" },
      { label: "RNE proveedor", value: trace.origin.supplier?.rneNumber ?? "-" },
      { label: "Vencimiento", value: fmtDate(trace.origin.expiryDate) },
      {
        label: "Ingresado",
        value: `${fmtNum(trace.origin.quantity)} ${trace.origin.unit}`,
      },
      {
        label: "Despachado a clientes",
        value: `${fmtNum(trace.totalDispatchedKg)} kg`,
      },
    ],
    chain,
    affectedCustomers: trace.affectedCustomers,
    totalDispatchedKg: trace.totalDispatchedKg,
  };
}

export function backwardToExport(
  trace: BackwardTrace,
  locale?: string,
): RecallExportData {
  const { fmtDate, fmtNum } = makeFormatters(locale);
  const chain: ChainRow[] = trace.dispatches.map((d) => ({
    origin: trace.production.recipeTitle,
    originLot: trace.production.productLotNumber ?? "-",
    production: trace.production.code,
    productionLot: trace.production.productLotNumber ?? "-",
    customer: d.customer?.name ?? "(cliente sin datos)",
    locality: d.customer?.locality ?? "-",
    dispatchDate: d.dispatchDate,
    quantityKg: d.quantityKg,
    flag: dispatchFlag(d),
  }));

  return {
    affectedLabel: trace.production.recipeTitle,
    affectedType: "PT",
    affectedLot: trace.production.productLotNumber ?? trace.production.code,
    headerFields: [
      { label: "Tipo de lote", value: "Producto terminado (PT)" },
      { label: "Producto", value: trace.production.recipeTitle },
      {
        label: "Lote producto",
        value: trace.production.productLotNumber ?? "-",
      },
      { label: "Producción", value: trace.production.code },
      { label: "RNPA", value: trace.production.rnpaNumber ?? "-" },
      {
        label: "Fecha de producción",
        value: fmtDate(trace.production.productionDate),
      },
      { label: "Vencimiento", value: fmtDate(trace.production.productExpiryDate) },
      {
        label: "Despachado a clientes",
        value: `${fmtNum(trace.totalDispatchedKg)} kg`,
      },
    ],
    chain,
    affectedCustomers: trace.affectedCustomers,
    totalDispatchedKg: trace.totalDispatchedKg,
  };
}

// ── Export Excel (clientes afectados + detalle de cadena) ──────────────────────

export async function exportRecallExcel(
  data: RecallExportData,
  locale?: string,
): Promise<void> {
  const { fmtNum } = makeFormatters(locale);
  const subtitle = `Lote ${data.affectedLot} (${data.affectedType}) · ${data.affectedLabel} · ${fmtNum(
    data.totalDispatchedKg,
  )} kg despachados`;

  // Un único archivo con dos pestañas: clientes afectados (acta) + cadena completa.
  await exportSheetsToExcel(`recall-${data.affectedLot}`, [
    {
      filename: `recall-${data.affectedLot}`,
      sheetName: "Clientes afectados",
      title: "Recall · Clientes afectados",
      subtitle,
      columns: [
        { header: "Cliente", key: "name", width: 30 },
        { header: "Localidad", key: "locality", width: 20 },
        { header: "Dirección", key: "address", width: 30 },
        { header: "Teléfono", key: "phone", width: 18 },
        { header: "Email", key: "email", width: 26 },
        {
          header: "Despachos",
          key: "dispatchCount",
          format: "number",
          width: 12,
        },
        { header: "Total (kg)", key: "totalKg", format: "number", width: 14 },
        { header: "Observación", key: "note", width: 30 },
      ],
      rows: data.affectedCustomers.map((c) => ({
        name: c.name,
        locality: c.locality ?? "",
        address: c.address ?? "",
        phone: c.phone ?? "",
        email: c.email ?? "",
        dispatchCount: c.dispatchCount,
        totalKg: c.totalKg,
        note: c.hasVoidedOrDeleted
          ? "Incluye despacho anulado/borrado: mercadería salida"
          : "",
      })),
    },
    {
      filename: `recall-${data.affectedLot}`,
      sheetName: "Cadena de trazabilidad",
      title: "Recall · Detalle de cadena",
      subtitle,
      columns: [
        { header: "Origen", key: "origin", width: 28 },
        { header: "Lote origen", key: "originLot", width: 20 },
        { header: "Producción", key: "production", width: 16 },
        { header: "Lote producto", key: "productionLot", width: 20 },
        { header: "Cliente", key: "customer", width: 28 },
        { header: "Localidad", key: "locality", width: 18 },
        {
          header: "Fecha despacho",
          key: "dispatchDate",
          format: "date",
          width: 16,
        },
        {
          header: "Cantidad (kg)",
          key: "quantityKg",
          format: "number",
          width: 14,
        },
        { header: "Estado", key: "flag", width: 26 },
      ],
      rows: data.chain.map((r) => ({
        origin: r.origin,
        originLot: r.originLot,
        production: r.production,
        productionLot: r.productionLot,
        customer: r.customer,
        locality: r.locality,
        dispatchDate: r.dispatchDate === "-" ? null : r.dispatchDate,
        quantityKg: r.quantityKg,
        flag: r.flag,
      })),
    },
  ]);
}

// ── Acta de recall PDF (cadena + clientes con contacto + firma) ───────────────

export function generateRecallPdf(
  data: RecallExportData,
  branding: TenantBranding,
): void {
  const { fmtDate, fmtNum } = makeFormatters(branding.locale);
  const meta: PlanillaMeta = {
    title: "Acta de recall / retiro de mercado",
    tenantName: branding.legalName || branding.name,
    logoUrl: branding.logoUrl,
    subtitle: `Lote ${data.affectedLot} (${data.affectedType})`,
  };
  const { doc, startY } = createPlanillaDoc(meta);
  let y = startY;

  // Bloque legal de cabecera.
  y = drawSectionTitle(doc, "Lote afectado", y);
  y = drawFieldGrid(doc, data.headerFields, y);
  y += 4;

  // Nota regulatoria.
  doc.setFont("helvetica", "italic");
  doc.setFontSize(7.5);
  doc.setTextColor(90, 107, 88);
  doc.text(
    "Reconstrucción de trazabilidad conforme CAA Art. 1415. Los despachos anulados o borrados se incluyen: la mercadería ya salió de planta.",
    PAGE.margin,
    y,
    { maxWidth: PAGE.width - PAGE.margin * 2 },
  );
  y += 9;

  // Tabla de cadena completa.
  y = drawSectionTitle(doc, "Cadena de trazabilidad", y);
  y = drawTable(doc, {
    startY: y,
    fontSize: 8,
    columns: [
      { header: "Producción", width: 24 },
      { header: "Lote PT", width: 26 },
      { header: "Cliente" },
      { header: "Localidad", width: 24 },
      { header: "Fecha", width: 20, align: "right" },
      { header: "Kg", width: 16, align: "right" },
      { header: "Estado", width: 30 },
    ],
    rows: data.chain.map((r) => [
      r.production,
      r.productionLot,
      r.customer,
      r.locality,
      fmtDate(r.dispatchDate === "-" ? null : r.dispatchDate),
      fmtNum(r.quantityKg),
      r.flag,
    ]),
    onPageBreak: (d) => {
      drawHeader(d, meta);
      return 42;
    },
  });
  y += 4;

  // Clientes afectados con contacto.
  if (y > PAGE.height - 70) {
    doc.addPage();
    drawHeader(doc, meta);
    y = 42;
  }
  y = drawSectionTitle(doc, "Clientes afectados (contacto para retiro)", y);
  y = drawTable(doc, {
    startY: y,
    fontSize: 8,
    columns: [
      { header: "Cliente" },
      { header: "Contacto", width: 78 },
      { header: "Total kg", width: 20, align: "right" },
    ],
    rows: data.affectedCustomers.map((c) => [
      c.name,
      contactLine(c),
      fmtNum(c.totalKg),
    ]),
    onPageBreak: (d) => {
      drawHeader(d, meta);
      return 42;
    },
  });
  y += 2;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(46, 125, 50);
  doc.text(
    `Total despachado a clientes: ${fmtNum(data.totalDispatchedKg)} kg`,
    PAGE.width - PAGE.margin,
    y + 4,
    { align: "right" },
  );
  y += 14;

  // Bloque de firma del responsable.
  if (y > PAGE.height - 40) {
    doc.addPage();
    drawHeader(doc, meta);
    y = 42;
  }
  y = drawSectionTitle(doc, "Responsable del retiro", y);
  drawSignatureBlock(doc, y + 2, {});

  finalizePdf(doc);
  downloadPdf(doc, `acta-recall-${data.affectedLot}`);
}
