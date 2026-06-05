import ExcelJS from "exceljs";

// Excel-first (CLAUDE.md §9): helper genérico de export con exceljs.
// Estética del design system: header oscuro verde marca + texto blanco bold,
// bordes sutiles, freeze del header, autofilter, zebra striping suave y fila de
// título opcional con merge. Formato es-AR (fechas dd/mm/yyyy, decimales coma).
// Port de la convención del POS (lib/utils/xlsx.ts) adaptado a Ninja Food.

export type XlsxColumnFormat =
  | "text"
  | "number"
  | "currency"
  | "date"
  | "datetime";

export interface XlsxColumn {
  header: string;
  key: string;
  width?: number;
  format?: XlsxColumnFormat;
}

export interface ExportToExcelOptions {
  filename: string;
  sheetName: string;
  columns: XlsxColumn[];
  rows: Array<Record<string, unknown>>;
  /** Título grande con merge sobre el ancho de la tabla. */
  title?: string;
  /** Subtítulo (fecha de emisión, rango, etc.) bajo el título. */
  subtitle?: string;
}

// Verde marca Ninja Food (oscuro para header) y zebra suave.
const HEADER_FILL = "FF0A1411"; // food-dark background
const BRAND_FILL = "FF2E7D32"; // primary (light theme)
const ZEBRA_FILL = "FFF1F6F0";
const WHITE = "FFFFFFFF";
const BORDER = "FFD8E2D6";

function numFmtFor(format?: XlsxColumnFormat): string | undefined {
  switch (format) {
    case "currency":
      // es-AR: separador de miles "." y decimal ","
      return '#.##0,00 "$"';
    case "number":
      return "#.##0,###";
    case "date":
      return "dd/mm/yyyy";
    case "datetime":
      return "dd/mm/yyyy hh:mm";
    default:
      return undefined;
  }
}

/** Coacciona el valor para que exceljs lo formatee como número/fecha cuando aplique. */
function coerceValue(
  value: unknown,
  format?: XlsxColumnFormat,
): ExcelJS.CellValue {
  if (value === null || value === undefined) return null;
  if (format === "date" || format === "datetime") {
    if (value instanceof Date) return value;
    if (typeof value === "string") {
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? value : d;
    }
  }
  if (format === "number" || format === "currency") {
    if (typeof value === "number") return value;
    const n = Number(value);
    return Number.isNaN(n) ? (value as ExcelJS.CellValue) : n;
  }
  return value as ExcelJS.CellValue;
}

/** Pinta una hoja con la estética del design system dentro de un workbook dado. */
function renderSheet(wb: ExcelJS.Workbook, opts: ExportToExcelOptions): void {
  const ws = wb.addWorksheet(opts.sheetName, {
    views: [{ state: "frozen" }],
  });
  const ncols = opts.columns.length;
  let headerRow = 1;

  // Fila de título (merge) + subtítulo opcional.
  if (opts.title) {
    ws.mergeCells(1, 1, 1, ncols);
    const c = ws.getCell(1, 1);
    c.value = opts.title;
    c.font = { name: "Calibri", bold: true, size: 15, color: { argb: WHITE } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    c.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    ws.getRow(1).height = 30;
    headerRow = 2;

    if (opts.subtitle) {
      ws.mergeCells(2, 1, 2, ncols);
      const s = ws.getCell(2, 1);
      s.value = opts.subtitle;
      s.font = { name: "Calibri", italic: true, size: 10, color: { argb: "FF5A6B58" } };
      s.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
      ws.getRow(2).height = 18;
      headerRow = 3;
    }
  }

  // Header de columnas.
  const hr = ws.getRow(headerRow);
  opts.columns.forEach((col, i) => {
    const cell = hr.getCell(i + 1);
    cell.value = col.header;
    cell.font = { name: "Calibri", bold: true, color: { argb: WHITE } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_FILL } };
    cell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    cell.border = {
      bottom: { style: "thin", color: { argb: BORDER } },
    };
  });
  hr.height = 22;

  // Filas de datos con zebra striping y formato por columna.
  opts.rows.forEach((row, ri) => {
    const r = ws.getRow(headerRow + 1 + ri);
    opts.columns.forEach((col, ci) => {
      const cell = r.getCell(ci + 1);
      cell.value = coerceValue(row[col.key], col.format);
      const fmt = numFmtFor(col.format);
      if (fmt) cell.numFmt = fmt;
      const numeric = col.format === "number" || col.format === "currency";
      cell.alignment = {
        vertical: "middle",
        horizontal: numeric ? "right" : "left",
        indent: numeric ? 0 : 1,
        wrapText: false,
      };
      cell.border = { bottom: { style: "hair", color: { argb: BORDER } } };
    });
    if (ri % 2 === 1) {
      r.eachCell((cell) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: ZEBRA_FILL },
        };
      });
    }
  });

  // Anchos de columna.
  opts.columns.forEach((col, i) => {
    ws.getColumn(i + 1).width =
      col.width ?? Math.max(12, col.header.length + 4);
  });

  // Autofilter + freeze del header.
  ws.autoFilter = {
    from: { row: headerRow, column: 1 },
    to: { row: headerRow, column: ncols },
  };
  ws.views = [{ state: "frozen", ySplit: headerRow }];
}

/** Construye el workbook (separado del download para poder testearlo). */
export function buildWorkbook(opts: ExportToExcelOptions): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Ninja Food";
  wb.created = new Date();
  renderSheet(wb, opts);
  return wb;
}

/** Descarga un workbook ya construido como XLSX (client-side). */
async function downloadWorkbook(
  wb: ExcelJS.Workbook,
  filename: string,
): Promise<void> {
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Construye y descarga el XLSX en el navegador (client-side, sin deps extra). */
export async function exportToExcel(opts: ExportToExcelOptions): Promise<void> {
  await downloadWorkbook(buildWorkbook(opts), opts.filename);
}

/** Exporta varias hojas en un único archivo XLSX (cada `sheet` es una pestaña). */
export async function exportSheetsToExcel(
  filename: string,
  sheets: ExportToExcelOptions[],
): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Ninja Food";
  wb.created = new Date();
  for (const sheet of sheets) renderSheet(wb, sheet);
  await downloadWorkbook(wb, filename);
}
