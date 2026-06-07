"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImagePlus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Switch } from "@/components/ui/Switch";
import { useToast } from "@/components/ui/Toast";
import { getTenantId } from "@/lib/utils/tenant";
import { useOperatingProfile } from "@/modules/tenant-profile/hooks";
import { cn } from "@/lib/utils/cn";

type RegulatorySeal = { type: string; enabled: boolean; logo_url?: string | null };

// ¿Está el aval ABR habilitado? Lee regulatory_seals con fallback al booleano
// legacy sello_abr_enabled.
function abrSealEnabled(
  seals: RegulatorySeal[] | null,
  legacy: boolean,
): boolean {
  if (seals && seals.length > 0) {
    const abr = seals.find((s) => s.type === "abr");
    return abr ? abr.enabled : false;
  }
  return legacy;
}

// Marca del negocio — espejo del BrandingCard del POS en clave Food.
// Presets de resalte en tonos alimentarios.
const PRESET_ACCENTS = [
  "#16A34A", "#15803D", "#8CBF2F", "#C6D420", "#C9A227",
  "#8E2A48", "#C95D63", "#14B8A6", "#0EA5E9", "#7C4DFF",
  "#E8456B", "#111827",
];

// Defaults de la paleta de planillas PDF (espejan resolvePalette en lib/utils/pdf):
// primario = food-dark de la banda, secundario = verde marca de acentos.
const PDF_DEFAULT_PRIMARY = "#08120A";
const PDF_DEFAULT_SECONDARY = "#2E7D32";

type Branding = {
  logo_url: string | null;
  accent: string;
  legal_name: string | null;
  cuit: string | null;
  phone: string | null;
  address: string | null;
  abr_enabled: boolean;
  // null → la planilla usa el fallback Ninja Food (no se persiste el default).
  pdf_primary_color: string | null;
  pdf_secondary_color: string | null;
};

const EMPTY: Branding = {
  logo_url: null,
  accent: "#16A34A",
  legal_name: null,
  cuit: null,
  phone: null,
  address: null,
  abr_enabled: true,
  pdf_primary_color: null,
  pdf_secondary_color: null,
};

export function BrandingCard() {
  const supabase = createClient();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: profile } = useOperatingProfile();
  const isAr = (profile?.country ?? "AR").toUpperCase() === "AR";
  const taxIdLabel = profile?.taxIdLabel ?? "CUIT";
  const inputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<Branding | null>(null);
  const [uploading, setUploading] = useState(false);

  const { data } = useQuery({
    queryKey: ["my-branding"],
    queryFn: async () => {
      const tenantId = await getTenantId();
      const { data: b } = await supabase
        .from("tenant_branding")
        .select(
          "logo_url, accent, legal_name, cuit, phone, address, regulatory_seals, sello_abr_enabled, pdf_primary_color, pdf_secondary_color",
        )
        .eq("tenant_id", tenantId)
        .maybeSingle();
      return {
        tenantId,
        branding: (b ?? {}) as {
          logo_url?: string | null;
          accent?: string;
          legal_name?: string | null;
          cuit?: string | null;
          phone?: string | null;
          address?: string | null;
          regulatory_seals?: RegulatorySeal[] | null;
          sello_abr_enabled?: boolean | null;
          pdf_primary_color?: string | null;
          pdf_secondary_color?: string | null;
        },
      };
    },
  });

  useEffect(() => {
    if (!data) return;
    const b = data.branding;
    setForm({
      logo_url: b.logo_url ?? null,
      accent: b.accent ?? EMPTY.accent,
      legal_name: b.legal_name ?? null,
      cuit: b.cuit ?? null,
      phone: b.phone ?? null,
      address: b.address ?? null,
      abr_enabled: abrSealEnabled(
        b.regulatory_seals ?? null,
        b.sello_abr_enabled ?? true,
      ),
      pdf_primary_color: b.pdf_primary_color ?? null,
      pdf_secondary_color: b.pdf_secondary_color ?? null,
    });
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      if (!form || !data) return;
      // Canónico: regulatory_seals (lista de avales). Mantenemos el booleano
      // legacy sello_abr_enabled sincronizado mientras los lectores migran.
      const seals: RegulatorySeal[] = isAr
        ? [{ type: "abr", enabled: form.abr_enabled }]
        : [];
      const { error } = await supabase.from("tenant_branding").upsert(
        {
          tenant_id: data.tenantId,
          logo_url: form.logo_url,
          accent: form.accent,
          legal_name: form.legal_name,
          cuit: form.cuit,
          phone: form.phone,
          address: form.address,
          regulatory_seals: seals,
          sello_abr_enabled: isAr ? form.abr_enabled : false,
          pdf_primary_color: form.pdf_primary_color,
          pdf_secondary_color: form.pdf_secondary_color,
        },
        { onConflict: "tenant_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-branding"] });
      toast({ title: "Marca guardada", variant: "success" });
    },
    onError: (e) =>
      toast({
        title: "Error al guardar",
        description: e instanceof Error ? e.message : undefined,
        variant: "error",
      }),
  });

  async function onPickLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !data) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Imagen muy pesada", description: "Máximo 5 MB", variant: "error" });
      return;
    }
    try {
      setUploading(true);
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `${data.tenantId}/logo-${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from("branding")
        .upload(path, file, { contentType: file.type, upsert: true });
      if (error) throw error;
      const { data: pub } = supabase.storage.from("branding").getPublicUrl(path);
      setForm((f) => (f ? { ...f, logo_url: pub.publicUrl } : f));
      toast({ title: "Logo subido", description: "Guardá para aplicar", variant: "success" });
    } catch (err) {
      toast({
        title: "Error al subir logo",
        description: err instanceof Error ? err.message : undefined,
        variant: "error",
      });
    } finally {
      setUploading(false);
    }
  }

  if (!form) return null;

  return (
    <Card>
      <CardContent className="space-y-6 p-6">
        {/* Logo */}
        <div className="space-y-2">
          <div className="text-sm font-medium">Logo de la empresa</div>
          <p className="text-xs text-muted-foreground">
            Aparece en planillas, exports y en la traza pública del QR.
          </p>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="grid h-20 w-32 shrink-0 place-items-center overflow-hidden rounded-lg border border-dashed border-border bg-muted/40 text-muted-foreground transition hover:border-primary hover:text-primary"
              aria-label="Subir logo"
            >
              {form.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={form.logo_url}
                  alt="Logo"
                  className="h-full w-full object-contain p-1"
                />
              ) : (
                <ImagePlus size={22} />
              )}
            </button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              loading={uploading}
              onClick={() => inputRef.current?.click()}
            >
              {form.logo_url ? "Cambiar logo" : "Subir logo"}
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={onPickLogo}
            />
          </div>
        </div>

        {/* Color de resalte */}
        <div className="space-y-2">
          <div className="text-sm font-medium">Color de resalte</div>
          <p className="text-xs text-muted-foreground">
            Color de la marca en documentos y traza pública.
          </p>
          <div className="flex flex-wrap gap-2">
            {PRESET_ACCENTS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Color ${c}`}
                onClick={() => setForm((f) => (f ? { ...f, accent: c } : f))}
                className={cn(
                  "h-8 w-8 rounded-full border border-black/10 transition",
                  form.accent === c &&
                    "ring-2 ring-primary ring-offset-2 ring-offset-background",
                )}
                style={{ background: c }}
              />
            ))}
            {/* Color personalizado: pill calcada del POS (BrandingCard) — input
                nativo oculto con sr-only, swatch redondo + hex visibles. */}
            <label
              className="flex h-8 cursor-pointer items-center gap-2 rounded-full border border-border px-3 text-xs text-muted-foreground"
              title="Color personalizado"
            >
              <span
                className="h-4 w-4 rounded-full border border-black/10"
                style={{ background: form.accent }}
              />
              {form.accent.toUpperCase()}
              <input
                type="color"
                className="sr-only"
                value={
                  /^#[0-9a-fA-F]{6}$/.test(form.accent)
                    ? form.accent
                    : "#16A34A"
                }
                onChange={(e) =>
                  setForm((f) =>
                    f ? { ...f, accent: e.target.value.toUpperCase() } : f,
                  )
                }
              />
            </label>
          </div>
        </div>

        {/* Colores de planillas PDF (regla 10: configurable por tenant) */}
        <div className="space-y-3">
          <div>
            <div className="text-sm font-medium">Colores de planillas PDF</div>
            <p className="text-xs text-muted-foreground">
              El primario pinta la banda del encabezado; el secundario, los
              títulos y las tablas. Si no los definís, se usa la marca Ninja Food.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <PdfColorPicker
              label="Primario (encabezado)"
              value={form.pdf_primary_color}
              fallback={PDF_DEFAULT_PRIMARY}
              onChange={(c) =>
                setForm((f) => (f ? { ...f, pdf_primary_color: c } : f))
              }
            />
            <PdfColorPicker
              label="Secundario (acentos)"
              value={form.pdf_secondary_color}
              fallback={PDF_DEFAULT_SECONDARY}
              onChange={(c) =>
                setForm((f) => (f ? { ...f, pdf_secondary_color: c } : f))
              }
            />
          </div>
          {/* Preview de la banda de planilla con los colores elegidos. */}
          <div className="overflow-hidden rounded-lg border border-border">
            <div
              className="flex items-center gap-3 px-4 py-3"
              style={{
                background: form.pdf_primary_color ?? PDF_DEFAULT_PRIMARY,
              }}
            >
              <span className="text-sm font-bold text-white">
                {form.legal_name || "Tu empresa"}
              </span>
              <span className="text-xs text-white/70">Planilla de producción</span>
            </div>
            <div
              className="h-1"
              style={{
                background: form.pdf_secondary_color ?? PDF_DEFAULT_SECONDARY,
              }}
            />
            <div className="bg-card px-4 py-2">
              <span
                className="text-xs font-bold uppercase tracking-wide"
                style={{
                  color: form.pdf_secondary_color ?? PDF_DEFAULT_SECONDARY,
                }}
              >
                Producto elaborado
              </span>
            </div>
          </div>
        </div>

        {/* Datos legales */}
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Razón social"
            value={form.legal_name ?? ""}
            onChange={(e) =>
              setForm((f) =>
                f ? { ...f, legal_name: e.target.value || null } : f,
              )
            }
          />
          <Input
            label={taxIdLabel}
            value={form.cuit ?? ""}
            onChange={(e) =>
              setForm((f) => (f ? { ...f, cuit: e.target.value || null } : f))
            }
          />
          <Input
            label="Teléfono"
            value={form.phone ?? ""}
            onChange={(e) =>
              setForm((f) => (f ? { ...f, phone: e.target.value || null } : f))
            }
          />
          <Input
            label="Dirección"
            value={form.address ?? ""}
            onChange={(e) =>
              setForm((f) =>
                f ? { ...f, address: e.target.value || null } : f,
              )
            }
          />
        </div>

        {/* Sellos y avales — ABR solo para tenants de Argentina */}
        {isAr ? (
          <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-4 py-3">
            <div>
              <p className="text-sm font-medium">Sello ABR en traza pública</p>
              <p className="text-xs text-muted-foreground">
                Aval técnico de Asesoría Bromatológica Rosario en el QR
              </p>
            </div>
            <Switch
              checked={form.abr_enabled}
              onCheckedChange={(v) =>
                setForm((f) => (f ? { ...f, abr_enabled: v } : f))
              }
              label="Sello ABR"
            />
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-3">
            <p className="text-sm font-medium">Sellos y avales</p>
            <p className="text-xs text-muted-foreground">
              Tu país no tiene avales configurables todavía. Próximamente vas a
              poder sumar sellos de certificación a la traza pública.
            </p>
          </div>
        )}

        <div className="flex justify-end">
          <Button loading={save.isPending} onClick={() => save.mutate()}>
            Guardar marca
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Color picker de planilla PDF (swatch + hex + reset al default) ────────────
// value=null significa "usar el fallback Ninja Food"; el reset vuelve a null.
function PdfColorPicker({
  label,
  value,
  fallback,
  onChange,
}: {
  label: string;
  value: string | null;
  fallback: string;
  onChange: (color: string | null) => void;
}) {
  const effective = value ?? fallback;
  const valid = /^#[0-9a-fA-F]{6}$/.test(effective);
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <label
          className="flex h-9 flex-1 cursor-pointer items-center gap-2 rounded-lg border border-border px-3 text-xs text-muted-foreground"
          title="Elegir color"
        >
          <span
            className="h-4 w-4 rounded-full border border-black/10"
            style={{ background: effective }}
          />
          <span className="font-price">{effective.toUpperCase()}</span>
          {value === null && (
            <span className="text-[10px] uppercase text-muted-foreground/70">
              · default
            </span>
          )}
          <input
            type="color"
            aria-label={label}
            className="sr-only"
            value={valid ? effective : fallback}
            onChange={(e) => onChange(e.target.value.toUpperCase())}
          />
        </label>
        <button
          type="button"
          onClick={() => onChange(null)}
          disabled={value === null}
          className={cn(
            "rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition hover:text-foreground",
            value === null && "pointer-events-none opacity-40",
          )}
        >
          Reset
        </button>
      </div>
    </div>
  );
}
