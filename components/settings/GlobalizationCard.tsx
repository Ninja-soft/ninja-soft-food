"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Globe2, Landmark, Languages, Scale, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Segmented } from "@/components/ui/Segmented";
import { useToast } from "@/components/ui/Toast";
import {
  COUNTRY_OPTIONS,
  getCountryProfile,
  getDefaultOperatingProfile,
  type CountryCode,
} from "@/lib/globalization/countries";
import { createClient } from "@/lib/supabase/client";
import { formatMoney, formatQty } from "@/lib/utils/format";
import { getTenantId } from "@/lib/utils/tenant";

type OperatingProfile = ReturnType<typeof getDefaultOperatingProfile>;

function SelectField({
  label,
  value,
  children,
  onChange,
}: {
  label: string;
  value: string;
  children: React.ReactNode;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-muted-foreground">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full rounded-lg border border-input bg-background px-4 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
      >
        {children}
      </select>
    </label>
  );
}

function SummaryItem({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase text-muted-foreground">
        <Icon size={14} />
        {label}
      </div>
      <div className="text-sm font-semibold text-foreground">{value}</div>
    </div>
  );
}

export function GlobalizationCard() {
  const supabase = createClient();
  const db = supabase as any;
  const qc = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState<OperatingProfile | null>(null);

  const { data } = useQuery({
    queryKey: ["operating-profile"],
    queryFn: async () => {
      const tenantId = await getTenantId();
      const { data: tenant } = await supabase
        .from("tenants")
        .select("country")
        .eq("id", tenantId)
        .maybeSingle();
      const { data: profile } = await db
        .from("tenant_operating_profiles")
        .select("*")
        .eq("tenant_id", tenantId)
        .maybeSingle();

      return {
        tenantId,
        country: (tenant?.country as string | null) ?? "AR",
        profile: profile as Partial<OperatingProfile> | null,
      };
    },
  });

  useEffect(() => {
    if (!data) return;
    const base = getDefaultOperatingProfile(data.profile?.country ?? data.country);
    setForm({
      ...base,
      ...data.profile,
      compliance_frameworks:
        data.profile?.compliance_frameworks ?? base.compliance_frameworks,
      label_languages: data.profile?.label_languages ?? base.label_languages,
      traceability_config:
        data.profile?.traceability_config ?? base.traceability_config,
    });
  }, [data]);

  const activeCountry = useMemo(
    () => getCountryProfile(form?.country),
    [form?.country],
  );

  const save = useMutation({
    mutationFn: async () => {
      if (!form || !data) return;
      const payload = {
        tenant_id: data.tenantId,
        country: form.country,
        locale: form.locale,
        currency: form.currency,
        timezone: form.timezone,
        tax_id_label: form.tax_id_label,
        tax_id_value: form.tax_id_value || null,
        tax_label: form.tax_label,
        default_tax_rate: Number(form.default_tax_rate) || 0,
        measurement_system: form.measurement_system,
        weight_unit: form.weight_unit,
        volume_unit: form.volume_unit,
        temperature_unit: form.temperature_unit,
        date_format: form.date_format,
        compliance_frameworks: form.compliance_frameworks,
        label_languages: form.label_languages,
        traceability_config: form.traceability_config,
      };
      const { error } = await db
        .from("tenant_operating_profiles")
        .upsert(payload, { onConflict: "tenant_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["operating-profile"] });
      toast({ title: "Configuracion global guardada", variant: "success" });
    },
    onError: (e) =>
      toast({
        title: "Error al guardar",
        description: e instanceof Error ? e.message : undefined,
        variant: "error",
      }),
  });

  function setCountry(country: string) {
    const next = getDefaultOperatingProfile(country);
    setForm((current) => ({
      ...next,
      tax_id_value: current?.tax_id_value ?? "",
    }));
  }

  if (!form) return null;

  const previewAmount = formatMoney(1234.56, {
    locale: form.locale,
    currency: form.currency,
  });
  const previewQty = formatQty(42.75, { locale: form.locale });

  return (
    <Card>
      <CardContent className="space-y-6 p-6">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Globe2 size={17} className="text-primary" />
            Perfil internacional del tenant
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Define mercado, impuestos, unidades, idioma de etiquetas y reglas de
            trazabilidad para operar fuera de un solo pais.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField label="Pais operativo" value={form.country} onChange={setCountry}>
            {COUNTRY_OPTIONS.map((country) => (
              <option key={country.code} value={country.code}>
                {country.name} · {country.currency}
              </option>
            ))}
          </SelectField>
          <Input
            label="Zona horaria"
            value={form.timezone}
            onChange={(e) =>
              setForm((f) => (f ? { ...f, timezone: e.target.value } : f))
            }
          />
          <Input
            label="Locale"
            value={form.locale}
            onChange={(e) =>
              setForm((f) => (f ? { ...f, locale: e.target.value } : f))
            }
          />
          <Input
            label="Moneda"
            value={form.currency}
            maxLength={3}
            onChange={(e) =>
              setForm((f) =>
                f ? { ...f, currency: e.target.value.toUpperCase() } : f,
              )
            }
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <SummaryItem icon={Landmark} label="Autoridades" value={activeCountry.foodAuthorities.join(", ")} />
          <SummaryItem icon={ShieldCheck} label="Frameworks" value={form.compliance_frameworks.slice(0, 3).join(", ")} />
          <SummaryItem icon={Languages} label="Etiquetas" value={form.label_languages.join(", ").toUpperCase()} />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Input
            label="Identificador fiscal"
            value={form.tax_id_label}
            onChange={(e) =>
              setForm((f) => (f ? { ...f, tax_id_label: e.target.value } : f))
            }
          />
          <Input
            label={`Numero ${form.tax_id_label}`}
            value={form.tax_id_value}
            onChange={(e) =>
              setForm((f) => (f ? { ...f, tax_id_value: e.target.value } : f))
            }
          />
          <Input
            label={`${form.tax_label} %`}
            type="number"
            value={String(form.default_tax_rate)}
            onChange={(e) =>
              setForm((f) =>
                f ? { ...f, default_tax_rate: Number(e.target.value) } : f,
              )
            }
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Scale size={16} className="text-primary" />
            Unidades por defecto
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <SelectField
              label="Peso"
              value={form.weight_unit}
              onChange={(value) =>
                setForm((f) =>
                  f ? { ...f, weight_unit: value as "kg" | "lb" } : f,
                )
              }
            >
              <option value="kg">Kilogramos</option>
              <option value="lb">Libras</option>
            </SelectField>
            <SelectField
              label="Volumen"
              value={form.volume_unit}
              onChange={(value) =>
                setForm((f) =>
                  f ? { ...f, volume_unit: value as "l" | "gal" } : f,
                )
              }
            >
              <option value="l">Litros</option>
              <option value="gal">Galones</option>
            </SelectField>
            <SelectField
              label="Temperatura"
              value={form.temperature_unit}
              onChange={(value) =>
                setForm((f) =>
                  f
                    ? {
                        ...f,
                        temperature_unit: value as "celsius" | "fahrenheit",
                      }
                    : f,
                )
              }
            >
              <option value="celsius">Celsius</option>
              <option value="fahrenheit">Fahrenheit</option>
            </SelectField>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-muted/30 p-4">
          <div className="text-sm font-medium">Vista previa comercial</div>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div>
              <div className="text-xs text-muted-foreground">Importe</div>
              <div className="font-price text-xl font-bold tabular-nums">
                {previewAmount}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Cantidad</div>
              <div className="font-price text-xl font-bold tabular-nums">
                {previewQty} {form.weight_unit}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Lote publico</div>
              <div className="font-mono text-sm text-foreground">
                {activeCountry.traceabilityFields.slice(0, 3).join(" / ")}
              </div>
            </div>
          </div>
        </div>

        <div>
          <div className="mb-2 text-sm font-medium">Formato de fecha</div>
          <Segmented
            value={form.date_format}
            onChange={(value) =>
              setForm((f) =>
                f
                  ? {
                      ...f,
                      date_format: value as OperatingProfile["date_format"],
                    }
                  : f,
              )
            }
            options={[
              { value: "DD/MM/YYYY", label: "DD/MM/YYYY" },
              { value: "MM/DD/YYYY", label: "MM/DD/YYYY" },
              { value: "YYYY-MM-DD", label: "YYYY-MM-DD" },
            ]}
          />
        </div>

        <div className="flex justify-end">
          <Button loading={save.isPending} onClick={() => save.mutate()}>
            Guardar perfil global
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
