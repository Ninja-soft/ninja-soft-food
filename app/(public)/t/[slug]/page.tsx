import Image from "next/image";
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import {
  getLabelSystem,
  type LabelSystem,
  type LabelSystemId,
} from "@/lib/globalization/labelSystems";

export const revalidate = 0;

type RegulatoryLabels = { system: LabelSystemId; values: string[] };

type TracePayload = {
  code: string;
  product_lot: string;
  recipe_title: string;
  commercial_name: string | null;
  category: string;
  production_date: string;
  packaging_date: string;
  expiry_date: string;
  quantity_kg: number;
  rnpa_number: string | null;
  rnpa_exempt: boolean;
  front_labels: string[];
  /** Rotulado resuelto por país (snapshot). Fallback: front_labels (octógonos AR). */
  regulatory_labels?: RegulatoryLabels | null;
  inputs: {
    ingredient: string;
    lot: string | null;
    supplier: string | null;
    no_origin: boolean;
  }[];
};

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

// Resuelve el sistema de rotulado y los valores desde el snapshot inmutable:
// prioriza regulatory_labels; si solo hay front_labels, son octógonos AR legacy.
function resolveLabels(
  p: TracePayload,
): { system: LabelSystem; values: string[] } | null {
  if (p.regulatory_labels && p.regulatory_labels.values?.length) {
    return {
      system: getLabelSystem(p.regulatory_labels.system),
      values: p.regulatory_labels.values,
    };
  }
  if (p.front_labels?.length) {
    return { system: getLabelSystem("ar_octogonos"), values: p.front_labels };
  }
  return null;
}

// Texto del sello en el snapshot: usa el catálogo del sistema (labelLocal si
// existe), con fallback al id si el sello no está en el catálogo.
function sealText(system: LabelSystem, valueId: string): string {
  const v = system.values.find((x) => x.id === valueId);
  return (v?.labelLocal ?? v?.label ?? valueId).toUpperCase();
}

// El aval ABR es argentino: se muestra para tenants AR con el sello habilitado.
// Lee regulatory_seals (nuevo) con fallback al booleano sello_abr_enabled.
//
// Nota RLS: la traza es anónima y tenants/tenant_branding NO tienen política de
// lectura anon, así que `tenant` puede llegar null. Para NO regresionar el
// comportamiento histórico (ABR siempre visible), null => mostrar; solo se
// oculta cuando podemos leer y el país no es AR o el sello está apagado.
function abrEnabled(
  tenant: {
    country: string | null;
    branding:
      | { regulatory_seals: unknown; sello_abr_enabled: boolean | null }
      | { regulatory_seals: unknown; sello_abr_enabled: boolean | null }[]
      | null;
  } | null,
): boolean {
  if (!tenant) return true; // sin datos (RLS anon): preserva el comportamiento previo
  if ((tenant.country ?? "AR").toUpperCase() !== "AR") return false;
  const branding = Array.isArray(tenant.branding)
    ? tenant.branding[0]
    : tenant.branding;
  if (!branding) return true;
  const seals = branding.regulatory_seals;
  if (Array.isArray(seals)) {
    const abr = seals.find(
      (s) => (s as { type?: string }).type === "abr",
    ) as { enabled?: boolean } | undefined;
    if (abr) return abr.enabled !== false;
  }
  // Fallback legacy: tenants sin regulatory_seals migrado todavía.
  return branding.sello_abr_enabled !== false;
}

// Foto del producto y traza pública (decisión de diseño · regla dura 5):
// La foto (productions.photo_url) se captura DESPUÉS de completar la producción
// y NO forma parte del snapshot inmutable public_traces.payload (la RPC 0005
// está congelada y al momento del snapshot la foto ni existe). Para mostrarla
// acá habría que (a) snapshotear -> prohibido por regla 5, o (b) leer el
// registro vivo `productions` -> requiere abrir RLS de productions a anon, lo
// que ampliaría la superficie pública (regla dura 1). Como public_traces es
// inmutable (sin policy UPDATE), tampoco se puede inyectar ahí. Por eso la foto
// es un dato VIVO y COMPLEMENTARIO que vive solo en las vistas internas del
// tenant (listado de producción + planilla PDF). La traza pública queda intacta:
// snapshot regulatorio sin alterar y sin nueva superficie anónima.

// Traza pública (destino del QR): snapshot inmutable, sin autenticación.
export default async function PublicTracePage({
  params,
}: {
  params: { slug: string };
}) {
  // Cliente anónimo sin sesión (página pública)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const { data: trace } = await supabase
    .from("public_traces")
    .select(
      "payload, created_at, tenant:tenants(name, country, branding:tenant_branding(regulatory_seals, sello_abr_enabled))",
    )
    .eq("slug", params.slug)
    .single();

  if (!trace) notFound();

  const p = trace.payload as TracePayload;
  const labels = resolveLabels(p);
  const tenant = trace.tenant as unknown as {
    name: string;
    country: string | null;
    branding:
      | { regulatory_seals: unknown; sello_abr_enabled: boolean | null }
      | { regulatory_seals: unknown; sello_abr_enabled: boolean | null }[]
      | null;
  } | null;
  const tenantName = tenant?.name ?? "";
  const showAbr = abrEnabled(tenant);

  return (
    <main className="food-dark-bg relative min-h-dvh px-4 py-10 text-[#F0F7EE]">
      <div className="food-grid pointer-events-none absolute inset-0 opacity-20" />
      <div className="relative z-10 mx-auto w-full max-w-lg space-y-6">
        {/* Header */}
        <div className="text-center">
          <Image
            src="/img/ninja-food-login.png"
            alt="Ninja Food"
            width={200}
            height={47}
            className="mx-auto h-10 w-auto"
            priority
          />
          <p className="mt-3 text-xs font-medium uppercase tracking-[0.18em] text-[#A9C4A6]">
            Trazabilidad verificada
          </p>
        </div>

        {/* Producto */}
        <div className="rounded-lg border border-white/10 bg-white/5 p-6 shadow-soft backdrop-blur-xl">
          <p className="text-xs text-[#A9C4A6]">{tenantName}</p>
          <h1 className="mt-1 font-display text-2xl font-black">
            {p.commercial_name || p.recipe_title}
          </h1>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <TraceField label="Lote" value={p.product_lot} mono />
            <TraceField label="Producción" value={p.code} mono />
            <TraceField label="Elaborado" value={fmtDate(p.production_date)} />
            <TraceField label="Vencimiento" value={fmtDate(p.expiry_date)} />
            {p.rnpa_number && !p.rnpa_exempt && (
              <TraceField label="RNPA" value={p.rnpa_number} mono />
            )}
            <TraceField
              label="Cantidad elaborada"
              value={`${new Intl.NumberFormat("es-AR").format(p.quantity_kg)} kg`}
            />
          </div>

          {labels && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {labels.values.map((l) => (
                <TraceSeal
                  key={l}
                  shape={labels.system.seal.shape}
                  text={sealText(labels.system, l)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Origen */}
        <div className="rounded-lg border border-white/10 bg-white/5 p-6 shadow-soft backdrop-blur-xl">
          <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-[#A9C4A6]">
            Origen de los ingredientes
          </h2>
          <ul className="mt-3 space-y-2.5">
            {p.inputs.map((input, i) => (
              <li
                key={i}
                className="flex items-baseline justify-between gap-3 border-b border-white/5 pb-2.5 text-sm last:border-0"
              >
                <span className="font-medium">{input.ingredient}</span>
                <span className="text-right text-xs text-[#A9C4A6]">
                  {input.no_origin ? (
                    "compra menor"
                  ) : (
                    <>
                      {input.supplier && <span>{input.supplier} · </span>}
                      <span className="font-mono">{input.lot}</span>
                    </>
                  )}
                </span>
              </li>
            ))}
            {p.inputs.length === 0 && (
              <li className="text-sm text-[#A9C4A6]">
                Sin consumo de lotes registrado.
              </li>
            )}
          </ul>
        </div>

        {/* Sello ABR (solo tenants AR con el aval habilitado) */}
        {showAbr && (
          <div className="flex items-center justify-center gap-2.5">
            <Image
              src="/img/Logo ABR Back Transparent.png"
              alt="ABR"
              width={40}
              height={24}
              className="h-auto w-9 opacity-80 brightness-0 invert"
            />
            <p className="text-xs text-[#A9C4A6]">
              Sistema avalado técnicamente por Asesoría Bromatológica Rosario
            </p>
          </div>
        )}
      </div>
    </main>
  );
}

// Sello de rotulado en la traza pública. Para octógonos mantiene el look actual
// (cápsula negra); otros sistemas adoptan la forma del catálogo (octágono real,
// lupa, rect Nutri-Score) de forma simple y digna sobre el fondo atmosférico.
function TraceSeal({
  shape,
  text,
}: {
  shape: LabelSystem["seal"]["shape"];
  text: string;
}) {
  if (shape === "octagon") {
    return (
      <span
        className="grid place-items-center bg-black px-2.5 py-1.5 text-center text-[9px] font-black uppercase leading-tight tracking-wide text-white"
        style={{
          clipPath:
            "polygon(30% 0, 70% 0, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0 70%, 0 30%)",
        }}
      >
        {text}
      </span>
    );
  }
  if (shape === "magnifier") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-white/40 bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-black">
        <span aria-hidden>🔍</span>
        {text}
      </span>
    );
  }
  // rect (Nutri-Score / genérico)
  return (
    <span className="rounded-md bg-white px-2.5 py-1.5 text-[11px] font-black uppercase tracking-wide text-black">
      {text}
    </span>
  );
}

function TraceField({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-[#A9C4A6]">
        {label}
      </p>
      <p className={mono ? "font-mono text-sm" : "text-sm font-semibold"}>
        {value}
      </p>
    </div>
  );
}
