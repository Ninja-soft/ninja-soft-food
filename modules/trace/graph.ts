import type { BackwardTrace, ForwardTrace } from "./api";

// Transformación PURA de una traza (forward o backward) a un grafo de nodos y
// aristas, independiente de React Flow. Vive acá (no en el componente) para ser
// testeable sin la librería de UI. El componente TraceGraph toma este modelo,
// le aplica layout con dagre y lo monta en React Flow.
//
// Cadena modelada (left → right):
//   supplier/MP → producción/PT → despacho → cliente
//
// REGLA REGULATORIA: los despachos anulados/borrados (voided/deleted) viajan con
// su flag intacto desde modules/trace/api y se marcan como nodo "voided" — SIEMPRE
// visibles en el grafo de recall (mercadería que ya salió).

// ── Modelo de grafo (agnóstico de React Flow) ─────────────────────────────────

/** Tipo de eslabón — define el acento de color y el ícono del nodo. */
export type TraceNodeKind =
  | "supplier" // proveedor / origen MP (forward)
  | "input" // insumo consumido (backward)
  | "production" // producción / lote PT
  | "dispatch" // despacho
  | "customer"; // cliente afectado

/** Una fila clave:valor que se muestra en el cuerpo del nodo (datos en mono). */
export type TraceNodeField = {
  label: string;
  /** Valor ya formateado para mostrar (string), o "-" si falta. */
  value: string;
  /** Resalta en mono (lote, kg, fechas). Default true para datos duros. */
  mono?: boolean;
};

/** Nodo del grafo de trazabilidad. */
export type TraceGraphNode = {
  /** Id estable y único dentro del grafo (prefijo por tipo + id de dominio). */
  id: string;
  kind: TraceNodeKind;
  /** Título principal (nombre de proveedor, código de producción, cliente…). */
  title: string;
  /** Badge/etiqueta corta sobre el título (MP, PT, lote, etc.). */
  badge: string | null;
  fields: TraceNodeField[];
  /** Despacho anulado o borrado: render "voided" (requisito regulatorio). */
  voided: boolean;
  /** Sin trazabilidad de origen (stock infinito / compra menor). */
  noOriginTrace: boolean;
};

/** Arista dirigida entre dos nodos. */
export type TraceGraphEdge = {
  id: string;
  source: string;
  target: string;
  /** Etiqueta opcional sobre la arista (p.ej. kg consumidos). */
  label?: string;
  /** Arista que toca un despacho voided: render atenuado/destructivo. */
  voided?: boolean;
};

export type TraceGraph = {
  nodes: TraceGraphNode[];
  edges: TraceGraphEdge[];
};

// ── Helpers de id ─────────────────────────────────────────────────────────────

const supplierId = (id: string) => `supplier:${id}`;
const inputId = (id: string) => `input:${id}`;
const productionId = (id: string) => `production:${id}`;
const dispatchId = (id: string) => `dispatch:${id}`;
const customerId = (id: string | null) => `customer:${id ?? "__sin_cliente__"}`;

function fmtDate(value: string | null | undefined): string {
  return value ?? "-";
}
function fmtQty(value: number | null | undefined): string {
  if (value === null || value === undefined) return "-";
  return String(value);
}

// ── FORWARD: lote MP → producciones → despachos → clientes ────────────────────

export function buildForwardGraph(trace: ForwardTrace): TraceGraph {
  const nodes: TraceGraphNode[] = [];
  const edges: TraceGraphEdge[] = [];
  // De-dup: un mismo cliente puede recibir varias producciones del lote; debe
  // existir UN solo nodo cliente, con varias aristas entrando.
  const seen = new Set<string>();
  const push = (node: TraceGraphNode) => {
    if (seen.has(node.id)) return;
    seen.add(node.id);
    nodes.push(node);
  };

  // 1. Origen: proveedor + lote MP (un solo nodo de origen).
  const o = trace.origin;
  const originNodeId = supplierId(o.stockEntryId);
  push({
    id: originNodeId,
    kind: "supplier",
    title: o.supplier?.name ?? o.ingredientName,
    badge: "MP",
    fields: [
      { label: "Ingrediente", value: o.ingredientName, mono: false },
      { label: "Lote", value: o.lotNumber },
      { label: "RNE", value: o.supplier?.rneNumber ?? "-" },
      { label: "Ingresado", value: `${fmtQty(o.quantity)} ${o.unit}` },
      { label: "Vence", value: fmtDate(o.expiryDate) },
    ],
    voided: false,
    noOriginTrace: o.noTraceability,
  });

  // 2. Producciones que consumieron el lote.
  for (const p of trace.productions) {
    const prodNodeId = productionId(p.productionId);
    push({
      id: prodNodeId,
      kind: "production",
      title: p.recipeTitle,
      badge: p.code,
      fields: [
        { label: "Lote PT", value: p.productLotNumber ?? "-" },
        { label: "Producido", value: `${fmtQty(p.producedKg)} kg` },
        { label: "Fecha", value: fmtDate(p.productionDate) },
        { label: "Vence", value: fmtDate(p.productExpiryDate) },
      ],
      voided: false,
      noOriginTrace: false,
    });
    edges.push({
      id: `e:${originNodeId}->${prodNodeId}`,
      source: originNodeId,
      target: prodNodeId,
      label: `${fmtQty(p.consumedQty)} ${p.consumedUnit}`,
    });

    // 3. Despachos de la producción → 4. clientes.
    for (const d of p.dispatches) {
      const dispNodeId = dispatchId(d.dispatchItemId);
      const flagged = d.voided || d.deleted;
      push({
        id: dispNodeId,
        kind: "dispatch",
        title: flagged
          ? d.deleted
            ? "Despacho borrado"
            : "Despacho anulado"
          : "Despacho",
        badge: `${fmtQty(d.quantityKg)} kg`,
        fields: [
          { label: "Fecha", value: fmtDate(d.dispatchDate) },
          { label: "Estado", value: d.status, mono: false },
        ],
        voided: flagged,
        noOriginTrace: false,
      });
      edges.push({
        id: `e:${prodNodeId}->${dispNodeId}`,
        source: prodNodeId,
        target: dispNodeId,
        voided: flagged,
      });

      const custNodeId = customerId(d.customer?.id ?? null);
      push({
        id: custNodeId,
        kind: "customer",
        title: d.customer?.name ?? "(cliente sin datos)",
        badge: null,
        fields: [
          { label: "Localidad", value: d.customer?.locality ?? "-", mono: false },
          { label: "Tel", value: d.customer?.phone ?? "-" },
          { label: "Email", value: d.customer?.email ?? "-", mono: false },
        ],
        voided: false,
        noOriginTrace: false,
      });
      edges.push({
        id: `e:${dispNodeId}->${custNodeId}`,
        source: dispNodeId,
        target: custNodeId,
        voided: flagged,
      });
    }
  }

  return { nodes, edges };
}

// ── BACKWARD: insumos → producción/PT → despachos → clientes ──────────────────

export function buildBackwardGraph(trace: BackwardTrace): TraceGraph {
  const nodes: TraceGraphNode[] = [];
  const edges: TraceGraphEdge[] = [];
  const seen = new Set<string>();
  const push = (node: TraceGraphNode) => {
    if (seen.has(node.id)) return;
    seen.add(node.id);
    nodes.push(node);
  };

  // Centro: la producción (lote PT).
  const p = trace.production;
  const prodNodeId = productionId(p.productionId);
  push({
    id: prodNodeId,
    kind: "production",
    title: p.recipeTitle,
    badge: p.code,
    fields: [
      { label: "Lote PT", value: p.productLotNumber ?? "-" },
      { label: "RNPA", value: p.rnpaNumber ?? "-" },
      { label: "Producido", value: `${fmtQty(p.quantityKg)} kg` },
      { label: "Fecha", value: fmtDate(p.productionDate) },
      { label: "Vence", value: fmtDate(p.productExpiryDate) },
    ],
    voided: false,
    noOriginTrace: false,
  });

  // Insumos consumidos (origen, a la izquierda) → producción.
  for (const i of trace.inputs) {
    const inNodeId = inputId(i.inputId);
    push({
      id: inNodeId,
      kind: "input",
      title: i.ingredientName,
      badge: i.supplier?.name ?? (i.noOriginTrace ? "Sin origen" : "MP"),
      fields: i.noOriginTrace
        ? [{ label: "Origen", value: "Sin trazabilidad", mono: false }]
        : [
            { label: "Lote", value: i.lotNumber ?? "-" },
            { label: "RNE", value: i.supplier?.rneNumber ?? "-" },
            { label: "Vence", value: fmtDate(i.expiryDate) },
          ],
      voided: false,
      noOriginTrace: i.noOriginTrace,
    });
    edges.push({
      id: `e:${inNodeId}->${prodNodeId}`,
      source: inNodeId,
      target: prodNodeId,
      label: `${fmtQty(i.takenQty)} ${i.unit}`,
    });
  }

  // Despachos del PT → clientes.
  for (const d of trace.dispatches) {
    const dispNodeId = dispatchId(d.dispatchItemId);
    const flagged = d.voided || d.deleted;
    push({
      id: dispNodeId,
      kind: "dispatch",
      title: flagged
        ? d.deleted
          ? "Despacho borrado"
          : "Despacho anulado"
        : "Despacho",
      badge: `${fmtQty(d.quantityKg)} kg`,
      fields: [
        { label: "Fecha", value: fmtDate(d.dispatchDate) },
        { label: "Estado", value: d.status, mono: false },
      ],
      voided: flagged,
      noOriginTrace: false,
    });
    edges.push({
      id: `e:${prodNodeId}->${dispNodeId}`,
      source: prodNodeId,
      target: dispNodeId,
      voided: flagged,
    });

    const custNodeId = customerId(d.customer?.id ?? null);
    push({
      id: custNodeId,
      kind: "customer",
      title: d.customer?.name ?? "(cliente sin datos)",
      badge: null,
      fields: [
        { label: "Localidad", value: d.customer?.locality ?? "-", mono: false },
        { label: "Tel", value: d.customer?.phone ?? "-" },
        { label: "Email", value: d.customer?.email ?? "-", mono: false },
      ],
      voided: false,
      noOriginTrace: false,
    });
    edges.push({
      id: `e:${dispNodeId}->${custNodeId}`,
      source: dispNodeId,
      target: custNodeId,
      voided: flagged,
    });
  }

  return { nodes, edges };
}

/** Punto de entrada único: arma el grafo según la dirección de la traza. */
export function buildTraceGraph(
  trace:
    | { direction: "forward"; data: ForwardTrace }
    | { direction: "backward"; data: BackwardTrace },
): TraceGraph {
  return trace.direction === "forward"
    ? buildForwardGraph(trace.data)
    : buildBackwardGraph(trace.data);
}
