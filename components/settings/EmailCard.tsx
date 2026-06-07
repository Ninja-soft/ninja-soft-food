"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Heading } from "@/components/ui/Typography";
import { useToast } from "@/components/ui/Toast";
import { getTenantId } from "@/lib/utils/tenant";
import { cn } from "@/lib/utils/cn";
import {
  enforceTypography,
  isTypographyClean,
  isValidEmail,
} from "@/modules/outbound-email/schemas";

// =============================================================================
// components/settings/EmailCard — identidad de remitente del tenant.
//
// Espejo en clave Food de la card de email del POS (TenantEmailCard), pero
// SIMPLIFICADA por decision de producto: el tenant NO configura SMTP propio (el
// servidor de envio es el de plataforma, para entregabilidad). Solo define como
// se presenta en los envios manuales (planillas, remitos, recetas, recall,
// informes): nombre que firma, email de respuesta y pie opcional.
//
// Persistencia en tenant_branding (1:1 con el tenant): email_from_name,
// email_reply_to, email_signature. Regla 6: el pie no admite emojis ni em-dash
// (se normaliza al tipear, igual que en SendEmailModal).
//
// Nota POS: el POS SI permite SMTP propio por tenant (set_tenant_smtp +
// send_receipt_email). Aca NO se implementa a proposito; ver el SQL de la
// migracion 0020 para el razonamiento.
// =============================================================================

type EmailSettings = {
  email_from_name: string;
  email_reply_to: string;
  email_signature: string;
};

const EMPTY: EmailSettings = {
  email_from_name: "",
  email_reply_to: "",
  email_signature: "",
};

export function EmailCard() {
  const supabase = createClient();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState<EmailSettings | null>(null);

  const { data } = useQuery({
    queryKey: ["my-email-settings"],
    queryFn: async () => {
      const tenantId = await getTenantId();
      const { data: b } = await supabase
        .from("tenant_branding")
        .select("email_from_name, email_reply_to, email_signature")
        .eq("tenant_id", tenantId)
        .maybeSingle();
      return { tenantId, settings: (b ?? {}) as Partial<EmailSettings> };
    },
  });

  useEffect(() => {
    if (!data) return;
    setForm({
      email_from_name: data.settings.email_from_name ?? "",
      email_reply_to: data.settings.email_reply_to ?? "",
      email_signature: data.settings.email_signature ?? "",
    });
  }, [data]);

  const replyToInvalid = !!form?.email_reply_to && !isValidEmail(form.email_reply_to);
  const signatureDirty =
    !!form?.email_signature && !isTypographyClean(form.email_signature);

  const save = useMutation({
    mutationFn: async () => {
      if (!form || !data) return;
      const { error } = await supabase.from("tenant_branding").upsert(
        {
          tenant_id: data.tenantId,
          email_from_name: form.email_from_name.trim() || null,
          email_reply_to: form.email_reply_to.trim() || null,
          email_signature: form.email_signature.trim() || null,
        },
        { onConflict: "tenant_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-email-settings"] });
      toast({ title: "Email guardado", variant: "success" });
    },
    onError: (e) =>
      toast({
        title: "Error al guardar",
        description: e instanceof Error ? e.message : undefined,
        variant: "error",
      }),
  });

  if (!form) return null;

  return (
    <Card>
      <CardContent className="space-y-6 p-6">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-primary/12 text-primary">
            <Mail size={18} />
          </span>
          <div>
            <Heading as="h3" className="text-base">
              Email del negocio
            </Heading>
            <p className="text-sm text-muted-foreground">
              Identidad de tus envíos: planillas, remitos, recetas, recall e
              informes. El correo sale desde los servidores de Ninja Food; vos
              definís cómo se presenta.
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Nombre del remitente"
            placeholder={data?.settings.email_from_name ? undefined : "Mi negocio"}
            value={form.email_from_name}
            onChange={(e) =>
              setForm((f) => (f ? { ...f, email_from_name: e.target.value } : f))
            }
            hint="Cómo firma tus envíos. Si lo dejás vacío, usa el nombre del negocio."
            maxLength={120}
          />
          <Input
            label="Email de respuesta (Reply-To)"
            type="email"
            placeholder="contacto@minegocio.com"
            value={form.email_reply_to}
            onChange={(e) =>
              setForm((f) => (f ? { ...f, email_reply_to: e.target.value } : f))
            }
            error={replyToInvalid ? "Email inválido" : undefined}
            hint={
              replyToInvalid
                ? undefined
                : "Cuando el cliente responde, su respuesta llega acá."
            }
            maxLength={160}
          />
        </div>

        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-muted-foreground">
            Firma / pie (opcional)
          </label>
          <textarea
            value={form.email_signature}
            onChange={(e) =>
              setForm((f) =>
                f ? { ...f, email_signature: enforceTypography(e.target.value) } : f,
              )
            }
            rows={3}
            placeholder="Datos de contacto, dirección, horario de atención…"
            className={cn(
              "w-full rounded-lg border bg-background p-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/20",
              signatureDirty
                ? "border-destructive focus:border-destructive"
                : "border-input focus:border-primary",
            )}
            maxLength={600}
          />
          <p
            className={cn(
              "text-xs",
              signatureDirty ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {signatureDirty
              ? "Sin emojis ni guiones largos (usá guion simple o el punto medio ·)."
              : "Se agrega al final de cada email que envíes. Separador recomendado: ·"}
          </p>
        </div>

        <div className="flex justify-end">
          <Button
            loading={save.isPending}
            disabled={replyToInvalid || signatureDirty}
            onClick={() => save.mutate()}
          >
            Guardar email
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
