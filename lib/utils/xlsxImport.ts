import ExcelJS from "exceljs";

// Excel-first (CLAUDE.md §9): helpers genéricos de IMPORTACIÓN con exceljs.
// El parseo es client-side (en el navegador): exceljs ya corre en browser para
// los exports (writeBuffer); para importar usamos workbook.xlsx.load(buffer).
// Los volúmenes de estos módulos (ingredientes, clientes, proveedores) son
// chicos, así que no hace falta una Edge Function ni route handler — la
// validación reactiva del preview se beneficia de tener las filas en memoria.
// Estética de las plantillas: reusa la paleta del export (header verde marca).

// ── Paleta (compartida con lib/utils/xlsx.ts) ─────────────────────────────────
const HEADER_FILL = "FF0A1411"; // food-dark
const BRAND_FILL = "FF2E7D32"; // primary
const NOTE_FILL = "FFEFF6EE"; // verde muy claro para filas de ejemplo
const WHITE = "FFFFFFFF";
const BORDER = "FFD8E2D6";
const MUTED = "FF5A6B58";

// ── Spec de columnas de la plantilla ──────────────────────────────────────────

export interface TemplateColumn {
  /** Encabezado visible en la hoja (es-AR). */
  header: string;
  /** Clave lógica con la que se referencia la celda al parsear. */
  key: string;
  /** Ancho de columna. */
  width?: number;
  /** true => se marca con asterisco y se documenta como obligatorio. */
  required?: boolean;
  /** Nota de formato (ej. "dd/mm/aaaa", "Sí / No", "kg, l, un"). */
  hint?: string;
  /** Valores de ejemplo (uno por fila de ejemplo). */
  examples?: Array<string | number>;
}

export interface TemplateSpec {
  /** Nombre de la pestaña de datos. */
  sheetName: string;
  /** Título grande (ej. "Plantilla de importación · Ingredientes"). */
  title: string;
  columns: TemplateColumn[];
  /** Líneas de instrucciones para la hoja 2. */
  instructions: string[];
}

/** Fila parseada cruda: clave de columna -> valor de celda (string trim o null). */
export type RawRow = Record<string, string | null>;

export interface ParsedSheet {
  /** Headers tal como aparecen en la fila de encabezado del archivo. */
  headers: string[];
  /** Filas de datos (sin la fila de encabezado, sin filas totalmente vacías). */
  rows: RawRow[];
}

// ── Plantilla descargable ─────────────────────────────────────────────────────

/** Construye el workbook de plantilla (hoja datos + hoja instrucciones). */
export function buildTemplateWorkbook(spec: TemplateSpec): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Ninja Food";
  wb.created = new Date();

  // ── Hoja 1: datos ──────────────────────────────────────────────────────────
  const ws = wb.addWorksheet(spec.sheetName);
  const ncols = spec.columns.length;

  // Título (merge).
  ws.mergeCells(1, 1, 1, ncols);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = spec.title;
  titleCell.font = { name: "Calibri", bold: true, size: 14, color: { argb: WHITE } };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
  titleCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ws.getRow(1).height = 28;

  // Nota (merge) sobre obligatorios.
  ws.mergeCells(2, 1, 2, ncols);
  const noteCell = ws.getCell(2, 1);
  noteCell.value =
    "Completá una fila por registro. Las columnas con * son obligatorias. Borrá las filas de ejemplo antes de subir. Ver la hoja Instrucciones.";
  noteCell.font = { name: "Calibri", italic: true, size: 10, color: { argb: MUTED } };
  noteCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ws.getRow(2).height = 20;

  // Header de columnas (fila 3).
  const headerRowIdx = 3;
  const hr = ws.getRow(headerRowIdx);
  spec.columns.forEach((col, i) => {
    const cell = hr.getCell(i + 1);
    cell.value = col.required ? `${col.header} *` : col.header;
    cell.font = { name: "Calibri", bold: true, color: { argb: WHITE } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_FILL } };
    cell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    cell.border = { bottom: { style: "thin", color: { argb: BORDER } } };
    if (col.hint) {
      cell.note = {
        texts: [{ text: col.hint }],
      };
    }
  });
  hr.height = 22;

  // Filas de ejemplo (cuántas haya en examples — usamos 2 por convención).
  const exampleCount = Math.max(
    0,
    ...spec.columns.map((c) => c.examples?.length ?? 0),
  );
  for (let r = 0; r < exampleCount; r++) {
    const row = ws.getRow(headerRowIdx + 1 + r);
    spec.columns.forEach((col, ci) => {
      const cell = row.getCell(ci + 1);
      const ex = col.examples?.[r];
      cell.value = ex === undefined ? null : ex;
      cell.font = { name: "Calibri", italic: true, color: { argb: MUTED } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NOTE_FILL } };
      cell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    });
  }

  // Anchos.
  spec.columns.forEach((col, i) => {
    ws.getColumn(i + 1).width = col.width ?? Math.max(14, col.header.length + 6);
  });
  ws.views = [{ state: "frozen", ySplit: headerRowIdx }];

  // ── Hoja 2: instrucciones ────────────────────────────────────────────────────
  const ins = wb.addWorksheet("Instrucciones");
  ins.getColumn(1).width = 4;
  ins.getColumn(2).width = 100;

  ins.mergeCells(1, 1, 1, 2);
  const insTitle = ins.getCell(1, 1);
  insTitle.value = "Instrucciones";
  insTitle.font = { name: "Calibri", bold: true, size: 14, color: { argb: WHITE } };
  insTitle.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
  insTitle.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ins.getRow(1).height = 28;

  let rowIdx = 3;
  for (const line of spec.instructions) {
    const cell = ins.getCell(rowIdx, 2);
    cell.value = line;
    cell.font = { name: "Calibri", size: 11, color: { argb: "FF1A1A1A" } };
    cell.alignment = { vertical: "top", horizontal: "left", wrapText: true };
    ins.getRow(rowIdx).height = 18;
    rowIdx++;
  }

  // Tabla de columnas (referencia de cada campo).
  rowIdx += 1;
  const colsHeader = ins.getCell(rowIdx, 2);
  colsHeader.value = "Columnas";
  colsHeader.font = { name: "Calibri", bold: true, size: 12, color: { argb: BRAND_FILL } };
  rowIdx += 1;
  for (const col of spec.columns) {
    const cell = ins.getCell(rowIdx, 2);
    const label = col.required ? `${col.header} (obligatorio)` : `${col.header} (opcional)`;
    cell.value = col.hint ? `${label}: ${col.hint}` : label;
    cell.font = { name: "Calibri", size: 11, color: { argb: "FF1A1A1A" } };
    cell.alignment = { vertical: "top", horizontal: "left", wrapText: true };
    rowIdx++;
  }

  return wb;
}

// ── Descarga (client-side) ────────────────────────────────────────────────────

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

/** Genera y descarga la plantilla de importación. */
export async function downloadTemplate(
  spec: TemplateSpec,
  filename: string,
): Promise<void> {
  await downloadWorkbook(buildTemplateWorkbook(spec), filename);
}

// ── Parseo de archivo subido ──────────────────────────────────────────────────

/** Convierte un valor de celda exceljs a string normalizado (o null). */
export function cellToString(value: ExcelJS.CellValue): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    const t = value.trim();
    return t === "" ? null : t;
  }
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value instanceof Date) {
    // Fecha de Excel -> ISO yyyy-mm-dd (sin hora).
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, "0");
    const d = String(value.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  // Celdas ricas (formula / hyperlink / richText): tomamos el texto resultante.
  if (typeof value === "object") {
    const v = value as { text?: unknown; result?: unknown; richText?: Array<{ text: string }> };
    if (typeof v.text === "string") return v.text.trim() || null;
    if (typeof v.result === "string") return v.result.trim() || null;
    if (typeof v.result === "number") return String(v.result);
    if (Array.isArray(v.richText)) {
      const t = v.richText.map((r) => r.text).join("").trim();
      return t === "" ? null : t;
    }
  }
  return null;
}

/**
 * Parsea un workbook ya cargado mapeando headers -> keys de la spec.
 * El match de header es flexible: ignora mayúsculas, acentos, espacios y el
 * asterisco de obligatorio, de modo que la plantilla descargada calce siempre.
 */
export function parseWorksheet(
  ws: ExcelJS.Worksheet,
  columns: TemplateColumn[],
): ParsedSheet {
  // Localizar la fila de header: la primera fila cuyas celdas matcheen >= 1 columna.
  const headerKeyByNorm = new Map<string, string>();
  for (const col of columns) headerKeyByNorm.set(normalizeHeader(col.header), col.key);

  let headerRowNumber = 0;
  let colKeyByIndex = new Map<number, string>();
  const rawHeaders: string[] = [];

  ws.eachRow((row, rowNumber) => {
    if (headerRowNumber) return;
    const map = new Map<number, string>();
    const headersInRow: string[] = [];
    let matches = 0;
    row.eachCell((cell, colNumber) => {
      const text = cellToString(cell.value);
      if (text === null) return;
      headersInRow[colNumber - 1] = text;
      const key = headerKeyByNorm.get(normalizeHeader(text));
      if (key) {
        map.set(colNumber, key);
        matches++;
      }
    });
    if (matches >= 1) {
      headerRowNumber = rowNumber;
      colKeyByIndex = map;
      for (const h of headersInRow) if (h !== undefined) rawHeaders.push(h);
    }
  });

  const rows: RawRow[] = [];
  if (!headerRowNumber) return { headers: rawHeaders, rows };

  ws.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRowNumber) return;
    const obj: RawRow = {};
    let hasValue = false;
    for (const [colNumber, key] of colKeyByIndex) {
      const val = cellToString(row.getCell(colNumber).value);
      obj[key] = val;
      if (val !== null) hasValue = true;
    }
    if (hasValue) rows.push(obj);
  });

  return { headers: rawHeaders, rows };
}

/** Parsea un File .xlsx (browser) tomando la primera hoja con datos. */
export async function parseWorkbook(
  file: File,
  columns: TemplateColumn[],
): Promise<ParsedSheet> {
  const buffer = await file.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  // Primera hoja distinta de "Instrucciones" con al menos una fila.
  const ws =
    wb.worksheets.find(
      (s) => normalizeHeader(s.name) !== "instrucciones" && s.rowCount > 0,
    ) ?? wb.worksheets[0];
  if (!ws) return { headers: [], rows: [] };
  return parseWorksheet(ws, columns);
}

/** Normaliza un header para matching tolerante (sin acentos/espacios/asterisco). */
export function normalizeHeader(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\*/g, "")
    .replace(/\s+/g, "")
    .trim()
    .toLowerCase();
}

// ── Parsers de valores es-AR (reutilizables por los specs de módulo) ──────────

/** Sí/No (y variantes) -> boolean. Devuelve null si no se reconoce. */
export function parseBoolEs(v: string | null): boolean | null {
  if (v === null) return null;
  const t = normalizeHeader(v);
  if (["si", "s", "true", "verdadero", "x", "1"].includes(t)) return true;
  if (["no", "n", "false", "falso", "0"].includes(t)) return false;
  return null;
}

/** Número con coma o punto decimal -> number. null si vacío, NaN si inválido. */
export function parseNumberEs(v: string | null): number | null {
  if (v === null) return null;
  // es-AR: "1.234,56" o "1234,56" o "1234.56". Quitamos miles, coma -> punto.
  const cleaned = v.replace(/\s/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  const n = Number(cleaned);
  return n;
}

/** Fecha dd/mm/aaaa o yyyy-mm-dd -> ISO yyyy-mm-dd. null si vacío, "" si inválida. */
export function parseDateEs(v: string | null): string | null | "" {
  if (v === null) return null;
  // Ya viene ISO (de celda Date o tipeo directo).
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (iso) {
    const [, y, m, d] = iso;
    return isValidYmd(+y, +m, +d) ? `${y}-${m}-${d}` : "";
  }
  // dd/mm/aaaa o dd-mm-aaaa.
  const dmy = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/.exec(v);
  if (dmy) {
    const [, d, m, y] = dmy;
    const dd = d.padStart(2, "0");
    const mm = m.padStart(2, "0");
    return isValidYmd(+y, +m, +d) ? `${y}-${mm}-${dd}` : "";
  }
  return "";
}

function isValidYmd(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}

// ── Reporte de rechazos ───────────────────────────────────────────────────────

export interface RejectRow {
  /** Número de fila en el archivo original (1-based, fila de datos). */
  rowNumber: number;
  /** Valores crudos por key de columna. */
  values: RawRow;
  /** Mensaje de error es-AR. */
  error: string;
}

/** Construye el workbook del reporte de rechazos (filas malas + columna Error). */
export function buildRejectsWorkbook(
  columns: TemplateColumn[],
  rejects: RejectRow[],
  title: string,
): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Ninja Food";
  wb.created = new Date();
  const ws = wb.addWorksheet("Rechazos");

  const headers = [
    { header: "Fila", key: "__row" },
    ...columns.map((c) => ({ header: c.header, key: c.key })),
    { header: "Error", key: "__error" },
  ];
  const ncols = headers.length;

  ws.mergeCells(1, 1, 1, ncols);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = title;
  titleCell.font = { name: "Calibri", bold: true, size: 13, color: { argb: WHITE } };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
  titleCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ws.getRow(1).height = 26;

  const hr = ws.getRow(2);
  headers.forEach((h, i) => {
    const cell = hr.getCell(i + 1);
    cell.value = h.header;
    cell.font = { name: "Calibri", bold: true, color: { argb: WHITE } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_FILL } };
    cell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  });
  hr.height = 22;

  rejects.forEach((rej, ri) => {
    const row = ws.getRow(3 + ri);
    row.getCell(1).value = rej.rowNumber;
    columns.forEach((col, ci) => {
      row.getCell(ci + 2).value = rej.values[col.key] ?? null;
    });
    const errCell = row.getCell(ncols);
    errCell.value = rej.error;
    errCell.font = { color: { argb: "FFB00020" } };
    row.eachCell((cell) => {
      cell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    });
  });

  headers.forEach((h, i) => {
    const col = columns.find((c) => c.key === h.key);
    ws.getColumn(i + 1).width =
      h.key === "__error" ? 50 : h.key === "__row" ? 8 : col?.width ?? 20;
  });
  ws.views = [{ state: "frozen", ySplit: 2 }];

  return wb;
}

/** Descarga el reporte de rechazos como .xlsx (client-side). */
export async function downloadRejectsReport(
  columns: TemplateColumn[],
  rejects: RejectRow[],
  title: string,
  filename: string,
): Promise<void> {
  await downloadWorkbook(buildRejectsWorkbook(columns, rejects, title), filename);
}
