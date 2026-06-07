"use client";

import { useState } from "react";
import { Check, CreditCard, KeyRound, XCircle } from "lucide-react";
import { Eyebrow, Display } from "@/components/ui/Typography";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

// =============================================================================
// PlatformMpCard — credenciales de Mercado Pago de PLATAFORMA en /internal.
//
// Calcada en patrón de AIConfigCard: secretos WRITE-ONLY (el access token y el
// webhook secret guardados NUNCA se muestran, solo "configurado"), guardado vía
// /api/internal/mp-config (requireInternal + audit con secretos redactados,
// internal_settings cifrado — NO env). La public key NO es secreta. Estructura
// visual del PlatformMpCard del POS. Tokens del design system only.
//
// Si encryptionReady=false (falta AI_CONFIG_SECRET en el server), avisa y
// deshabilita guardar: los secretos no se pueden cifrar.
// =============================================================================

export interface MpConfigInitial {
  accessTokenConfigured: boolean;
  webhookSecretConfigured: boolean;
  publicKey: string | null;
  updatedAt: string | null;
}

export function PlatformMpCard({
  initial,
  encryptionReady,
}: {
  initial: MpConfigInitial | null;
  encryptionReady: boolean;
}) {
  const { toast } = useToast();
  const [accessToken, setAccessToken] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [publicKey, setPublicKey] = useState(initial?.publicKey ?? "");
  const [saving, setSaving] = useState(false);

  const accessTokenConfigured = initial?.accessTokenConfigured ?? false;
  const webhookSecretConfigured = initial?.webhookSecretConfigured ?? false;

  async function onSave() {
    if (!encryptionReady) return;
    setSaving(true);
    try {
      const res = await fetch("/api/internal/mp-config", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accessToken, webhookSecret, publicKey }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || json.error) {
        toast({
          title: "No se pudo guardar",
          description: json.error,
          variant: "error",
        });
        return;
      }
      toast({ title: "Credenciales guardadas", variant: "success" });
      setAccessToken("");
      setWebhookSecret("");
    } catch (e) {
      toast({
        title: "No se pudo guardar",
        description: e instanceof Error ? e.message : undefined,
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Eyebrow>Plataforma</Eyebrow>
      <Display className="mt-3 text-3xl md:text-4xl">Medio de pago</Display>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        Credenciales de la cuenta de Mercado Pago de Ninja-Soft. El{" "}
        <strong className="text-foreground">Access Token</strong> y el{" "}
        <strong className="text-foreground">Public Key</strong> son de la cuenta
        cobradora y se usan para cobrar las suscripciones. El{" "}
        <strong className="text-foreground">Webhook Secret</strong> valida la
        firma de los avisos de pago. Se guardan cifrados, nunca del cliente.
      </p>

      <Card className="mt-6 bg-card shadow-soft backdrop-blur-xl">
        <CardContent className="grid max-w-2xl gap-5 p-5">
          <div className="flex items-center gap-2 font-semibold text-foreground">
            <CreditCard size={16} className="text-primary" /> Mercado Pago
            (plataforma)
          </div>

          {!encryptionReady && (
            <div className="flex items-start gap-2.5 rounded-ninjaMd border border-orange-400/30 bg-orange-400/5 p-3 text-sm text-orange-300">
              <XCircle size={16} className="mt-0.5 shrink-0" />
              <span>
                Falta <code>AI_CONFIG_SECRET</code> en el servidor. Sin esa
                variable no se pueden cifrar los secretos y el medio de pago
                queda deshabilitado.
              </span>
            </div>
          )}

          <div>
            <Input
              label={
                accessTokenConfigured
                  ? "Access Token (vacío = no cambiar)"
                  : "Access Token (cuenta Ninja-Soft)"
              }
              type="password"
              autoComplete="off"
              placeholder={accessTokenConfigured ? "configurado ✓" : "APP_USR-..."}
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
            />
            <SecretHint configured={accessTokenConfigured} />
          </div>

          <div>
            <Input
              label={
                webhookSecretConfigured
                  ? "Webhook Secret (vacío = no cambiar)"
                  : "Webhook Secret"
              }
              type="password"
              autoComplete="off"
              placeholder={
                webhookSecretConfigured ? "configurado ✓" : "Pegá el secret del webhook"
              }
              value={webhookSecret}
              onChange={(e) => setWebhookSecret(e.target.value)}
            />
            <SecretHint configured={webhookSecretConfigured} />
          </div>

          <Input
            label="Public Key"
            autoComplete="off"
            placeholder="APP_USR-..."
            value={publicKey}
            onChange={(e) => setPublicKey(e.target.value)}
          />
          <p className="-mt-2 text-xs text-muted-foreground">
            La Public Key no es secreta (va en el checkout del cliente): se
            guarda y se muestra en claro.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={onSave} loading={saving} disabled={!encryptionReady}>
              Guardar credenciales
            </Button>
            {initial?.updatedAt && (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
                <Check size={13} /> Actualizado {fmtDateTime(initial.updatedAt)}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </>
  );
}

function SecretHint({ configured }: { configured: boolean }) {
  return (
    <div className="mt-1.5 flex items-center gap-1.5 text-xs">
      <KeyRound size={13} className="text-muted-foreground" />
      {configured ? (
        <span className="text-emerald-400">
          Hay un secreto configurado. No se muestra por seguridad.
        </span>
      ) : (
        <span className="text-muted-foreground">Aún no hay secreto configurado.</span>
      )}
    </div>
  );
}
