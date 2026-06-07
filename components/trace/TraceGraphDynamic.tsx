"use client";

import dynamic from "next/dynamic";
import { SpinnerBlock } from "@/components/ui/Spinner";

// React Flow es client-only (mide el DOM, no soporta SSR). Cargamos TraceGraph
// con dynamic(ssr:false) para que el build de Next no intente prerenderizarlo.
// Re-exportamos el tipo de props para los consumidores.
export type { TraceGraphProps } from "./TraceGraph";

const TraceGraph = dynamic(() => import("./TraceGraph"), {
  ssr: false,
  loading: () => (
    <div className="grid h-[clamp(520px,72vh,820px)] place-items-center rounded-ninjaLg border border-border bg-card/40 backdrop-blur-xl">
      <SpinnerBlock />
    </div>
  ),
});

export default TraceGraph;
