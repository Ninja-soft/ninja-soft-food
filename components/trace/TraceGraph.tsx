"use client";

import { useCallback, useMemo, useState } from "react";
import dagre from "dagre";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  getNodesBounds,
  getViewportForBounds,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { toPng } from "html-to-image";
import "@xyflow/react/dist/style.css";
import {
  AlertTriangle,
  Boxes,
  Building2,
  Camera,
  Factory,
  Truck,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils/cn";
import type {
  TraceGraph as TraceGraphModel,
  TraceGraphNode,
  TraceNodeKind,
} from "@/modules/trace/graph";

// Diagrama de trazabilidad interactivo (React Flow). Toma el grafo PURO de
// modules/trace/graph (nodos/aristas agnósticos), lo dispone left→right con dagre
// y lo monta con nodos custom del design system. Client-only: React Flow toca el
// DOM/medición. La página lo carga vía dynamic(ssr:false).

// ── Acento de color e ícono por tipo de eslabón (tokens del design system) ────

type KindStyle = {
  icon: LucideIcon;
  /** Clases del chip de ícono + borde de acento (solo tokens, sin hex). */
  chip: string;
  ring: string;
  glow: string;
};

const KIND_STYLE: Record<TraceNodeKind, KindStyle> = {
  // MP / proveedor: ámbar (consistente con el TypeBadge MP de la tabla).
  supplier: {
    icon: Building2,
    chip: "bg-amber-500/15 text-amber-500",
    ring: "border-amber-500/40",
    glow: "hover:shadow-[0_0_28px_-4px_rgba(245,158,11,0.45)]",
  },
  input: {
    icon: Boxes,
    chip: "bg-amber-500/15 text-amber-500",
    ring: "border-amber-500/40",
    glow: "hover:shadow-[0_0_28px_-4px_rgba(245,158,11,0.45)]",
  },
  // Producción / PT: primary (marca).
  production: {
    icon: Factory,
    chip: "bg-primary/15 text-primary",
    ring: "border-primary/50",
    glow: "hover:shadow-foodGlow",
  },
  // Despacho: accent (menta).
  dispatch: {
    icon: Truck,
    chip: "bg-accent/15 text-accent",
    ring: "border-accent/40",
    glow: "hover:shadow-[0_0_28px_-4px_rgba(110,231,183,0.4)]",
  },
  // Cliente: secondary neutro con acento primary.
  customer: {
    icon: Users,
    chip: "bg-secondary text-foreground",
    ring: "border-border",
    glow: "hover:shadow-foodGlow",
  },
};

// ── Nodo custom ───────────────────────────────────────────────────────────────

type FlowNodeData = {
  node: TraceGraphNode;
  selected: boolean;
};

function TraceFlowNode({ data }: NodeProps<Node<FlowNodeData>>) {
  const { node, selected } = data;
  const style = KIND_STYLE[node.kind];
  const Icon = style.icon;
  const voided = node.voided;

  return (
    <div
      className={cn(
        "w-[218px] cursor-pointer rounded-ninjaMd border bg-card p-3 text-card-foreground shadow-soft backdrop-blur-xl transition-all duration-200",
        voided ? "border-destructive/50" : style.ring,
        style.glow,
        selected && "ring-2 ring-primary",
        voided && "opacity-90 grayscale-[0.25]",
      )}
    >
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />

      <div className="flex items-start gap-2">
        <span
          className={cn(
            "grid h-8 w-8 shrink-0 place-items-center rounded-ninjaSm",
            voided ? "bg-destructive/15 text-destructive" : style.chip,
          )}
        >
          {voided ? <AlertTriangle size={16} /> : <Icon size={16} />}
        </span>
        <div className="min-w-0 flex-1">
          {node.badge && (
            <p className="truncate font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
              {node.badge}
            </p>
          )}
          <p className="truncate text-sm font-semibold leading-tight">
            {node.title}
          </p>
        </div>
      </div>

      <dl className="mt-2 space-y-0.5">
        {node.fields.slice(0, 4).map((f) => (
          <div
            key={f.label}
            className="flex items-center justify-between gap-2 text-[11px]"
          >
            <dt className="text-muted-foreground">{f.label}</dt>
            <dd
              className={cn(
                "truncate text-right text-foreground",
                f.mono !== false && "font-mono",
              )}
            >
              {f.value}
            </dd>
          </div>
        ))}
      </dl>

      {node.noOriginTrace && (
        <p className="mt-1.5 flex items-center gap-1 text-[10px] text-amber-500">
          <AlertTriangle size={11} /> Sin trazabilidad de origen
        </p>
      )}
      {voided && (
        <p className="mt-1.5 flex items-center gap-1 text-[10px] font-medium text-destructive">
          <AlertTriangle size={11} /> Mercadería salida
        </p>
      )}
    </div>
  );
}

const NODE_TYPES = { trace: TraceFlowNode };

// ── Layout con dagre (left → right) ───────────────────────────────────────────

const NODE_W = 218;
const NODE_H = 150;

function layout(model: TraceGraphModel): {
  nodes: Node<FlowNodeData>[];
  edges: Edge[];
} {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "LR", nodesep: 36, ranksep: 110, marginx: 24, marginy: 24 });

  for (const n of model.nodes) {
    g.setNode(n.id, { width: NODE_W, height: NODE_H });
  }
  for (const e of model.edges) {
    g.setEdge(e.source, e.target);
  }
  dagre.layout(g);

  const nodes: Node<FlowNodeData>[] = model.nodes.map((n) => {
    const pos = g.node(n.id);
    return {
      id: n.id,
      type: "trace",
      position: { x: pos.x - NODE_W / 2, y: pos.y - NODE_H / 2 },
      data: { node: n, selected: false },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    };
  });

  const edges: Edge[] = model.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.label,
    animated: !e.voided,
    className: e.voided ? "is-voided" : undefined,
    markerEnd: { type: "arrowclosed" as const, width: 16, height: 16 },
  }));

  return { nodes, edges };
}

// ── MiniMap: color por tipo (toma del var via clase no aplica en SVG; usamos
//    currentColor mapeado a tokens conocidos vía CSS custom inline-free) ───────

function miniMapColor(node: Node<FlowNodeData>): string {
  const kind = node.data.node.kind;
  if (node.data.node.voided) return "var(--destructive)";
  if (kind === "production") return "var(--primary)";
  if (kind === "dispatch") return "var(--accent)";
  if (kind === "supplier" || kind === "input") return "#f59e0b";
  return "var(--muted-foreground)";
}

// ── Drawer de detalle del eslabón ─────────────────────────────────────────────

function DetailDrawer({
  node,
  onClose,
}: {
  node: TraceGraphNode | null;
  onClose: () => void;
}) {
  if (!node) return null;
  const style = KIND_STYLE[node.kind];
  const Icon = node.voided ? AlertTriangle : style.icon;
  const kindLabel: Record<TraceNodeKind, string> = {
    supplier: "Origen · Materia prima",
    input: "Insumo consumido",
    production: "Producción · Lote PT",
    dispatch: "Despacho",
    customer: "Cliente afectado",
  };

  return (
    <div className="absolute inset-y-0 right-0 z-20 flex w-full max-w-sm flex-col border-l border-border bg-popover/95 shadow-soft backdrop-blur-xl animate-slide-up">
      <div className="flex items-start justify-between gap-3 border-b border-border p-4">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "grid h-10 w-10 place-items-center rounded-ninjaSm",
              node.voided ? "bg-destructive/15 text-destructive" : style.chip,
            )}
          >
            <Icon size={18} />
          </span>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {kindLabel[node.kind]}
            </p>
            <p className="font-semibold">{node.title}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="rounded-ninjaSm p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          <X size={18} />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 slim-scrollbar">
        {node.badge && (
          <span className="inline-block rounded-ninjaFull bg-secondary px-2.5 py-1 font-mono text-xs text-foreground">
            {node.badge}
          </span>
        )}
        <dl className="divide-y divide-border rounded-ninjaMd border border-border bg-card/60">
          {node.fields.map((f) => (
            <div
              key={f.label}
              className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
            >
              <dt className="text-muted-foreground">{f.label}</dt>
              <dd
                className={cn(
                  "truncate text-right font-medium text-foreground",
                  f.mono !== false && "font-mono",
                )}
              >
                {f.value}
              </dd>
            </div>
          ))}
        </dl>
        {node.noOriginTrace && (
          <p className="flex items-center gap-2 rounded-ninjaMd border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-500">
            <AlertTriangle size={14} /> Sin trazabilidad de origen (stock infinito
            / compra menor).
          </p>
        )}
        {node.voided && (
          <p className="flex items-center gap-2 rounded-ninjaMd border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
            <AlertTriangle size={14} /> Despacho anulado o borrado. La mercadería
            igual salió: cuenta para el recall.
          </p>
        )}
      </div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export type TraceGraphProps = {
  graph: TraceGraphModel;
  /** Nombre base para el PNG exportado. */
  exportName?: string;
};

export default function TraceGraph({
  graph,
  exportName = "traza",
}: TraceGraphProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const base = useMemo(() => layout(graph), [graph]);

  const nodes = useMemo(
    () =>
      base.nodes.map((n) => ({
        ...n,
        data: { ...n.data, selected: n.id === selectedId },
      })),
    [base.nodes, selectedId],
  );

  const selectedNode = useMemo(
    () => graph.nodes.find((n) => n.id === selectedId) ?? null,
    [graph.nodes, selectedId],
  );

  const onNodeClick = useCallback((_: unknown, node: Node) => {
    setSelectedId(node.id);
  }, []);

  const handleExportPng = useCallback(async () => {
    const viewport = document.querySelector<HTMLElement>(
      ".trace-flow .react-flow__viewport",
    );
    if (!viewport) return;
    setExporting(true);
    try {
      const bounds = getNodesBounds(base.nodes);
      const width = Math.max(bounds.width + 120, 800);
      const height = Math.max(bounds.height + 120, 500);
      const vp = getViewportForBounds(bounds, width, height, 0.4, 2, 0.08);
      const bg = getComputedStyle(document.body).backgroundColor || "#0a1411";
      const dataUrl = await toPng(viewport, {
        backgroundColor: bg,
        width,
        height,
        style: {
          width: `${width}px`,
          height: `${height}px`,
          transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})`,
        },
      });
      const link = document.createElement("a");
      link.download = `${exportName}.png`;
      link.href = dataUrl;
      link.click();
    } finally {
      setExporting(false);
    }
  }, [base.nodes, exportName]);

  return (
    <div className="trace-flow relative h-[clamp(520px,72vh,820px)] w-full overflow-hidden rounded-ninjaLg border border-border bg-card/40 backdrop-blur-xl">
      {/* Toolbar flotante */}
      <div className="absolute right-3 top-3 z-10">
        <Button
          variant="secondary"
          size="sm"
          onClick={handleExportPng}
          loading={exporting}
        >
          <Camera size={15} />
          Exportar PNG
        </Button>
      </div>

      <ReactFlow
        nodes={nodes}
        edges={base.edges}
        nodeTypes={NODE_TYPES}
        onNodeClick={onNodeClick}
        onPaneClick={() => setSelectedId(null)}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.2}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={22}
          size={1.2}
          color="var(--pattern)"
        />
        <Controls showInteractive={false} />
        <MiniMap
          pannable
          zoomable
          nodeColor={miniMapColor}
          nodeStrokeWidth={2}
          maskColor="transparent"
        />
      </ReactFlow>

      <DetailDrawer node={selectedNode} onClose={() => setSelectedId(null)} />
    </div>
  );
}
