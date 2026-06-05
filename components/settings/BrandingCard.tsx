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
import { cn } from "@/lib/utils/cn";

// Marca del negocio — espejo del BrandingCard del POS en clave Food.
// Presets de resalte en tonos alimentarios.
const PRESET_ACCENTS = [
  "#16A34A", "#15803D", "#8CBF2F", "#C6D420", "#C9A227",
  "#8E2A48", "#C95D63", "#14B8A6", "#0EA5E9", "#7C4DFF",
  "#E8456B", "#111827",
];

type Branding = {
  logo_url: string | null;
  accent: string;
  legal_name: string | null;
  cuit: string | null;
  phone: string | null;
  address: string | null;
  sello_abr_enabled: boolean;
};

const EMPTY: Branding = {
  logo_url: null,
  accent: "#16A34A",
  legal_name: null,
  cuit: null,
  phone: null,
  address: null,
  sello_abr_enabled: true,
};

export function BrandingCard() {
  const supabase = createClient();
  const qc = useQueryClient();
  const { toast } = useToast();
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
          "logo_url, accent, legal_name, cuit, phone, address, sello_abr_enabled",
        )
        .eq("tenant_id", tenantId)
        .maybeSingle();
      return { tenantId, branding: (b ?? {}) as Partial<Branding> };
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
      sello_abr_enabled: b.sello_abr_enabled ?? true,
    });
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      if (!form || !data) return;
      const { error } = await supabase
        .from("tenant_branding")
        .upsert(
          { tenant_id: data.tenantId, ...form },
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
            label="CUIT"
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

        {/* Sello ABR */}
        <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-4 py-3">
          <div>
            <p className="text-sm font-medium">Sello ABR en traza pública</p>
            <p className="text-xs text-muted-foreground">
              Aval técnico de Asesoría Bromatológica Rosario en el QR
            </p>
          </div>
          <Switch
            checked={form.sello_abr_enabled}
            onCheckedChange={(v) =>
              setForm((f) => (f ? { ...f, sello_abr_enabled: v } : f))
            }
            label="Sello ABR"
          />
        </div>

        <div className="flex justify-end">
          <Button loading={save.isPending} onClick={() => save.mutate()}>
            Guardar marca
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
