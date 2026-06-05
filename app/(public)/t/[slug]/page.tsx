import Image from "next/image";
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

export const revalidate = 0;

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

const FRONT_LABEL_TEXT: Record<string, string> = {
  exceso_azucares: "EXCESO EN AZÚCARES",
  exceso_sodio: "EXCESO EN SODIO",
  exceso_grasas_totales: "EXCESO EN GRASAS TOTALES",
  exceso_grasas_saturadas: "EXCESO EN GRASAS SATURADAS",
  exceso_calorias: "EXCESO EN CALORÍAS",
  contiene_cafeina: "CONTIENE CAFEÍNA",
  contiene_edulcorantes: "CONTIENE EDULCORANTES",
};

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
    .select("payload, created_at, tenant:tenants(name)")
    .eq("slug", params.slug)
    .single();

  if (!trace) notFound();

  const p = trace.payload as TracePayload;
  const tenantName =
    (trace.tenant as unknown as { name: string } | null)?.name ?? "";

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

          {p.front_labels?.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {p.front_labels.map((l) => (
                <span
                  key={l}
                  className="rounded-md border border-white/20 bg-black/60 px-2 py-1 text-[10px] font-bold tracking-wide text-white"
                >
                  {FRONT_LABEL_TEXT[l] ?? l}
                </span>
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

        {/* Sello ABR */}
        <div className="flex items-center justify-center gap-2.5">
          <Image
            src="/img/Logo ABR Back Transparent.png"
            alt="ABR"
            width={40}
            height={24}
            className="h-auto w-9 brightness-0 invert opacity-80"
          />
          <p className="text-xs text-[#A9C4A6]">
            Sistema avalado técnicamente por Asesoría Bromatológica Rosario
          </p>
        </div>
      </div>
    </main>
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
