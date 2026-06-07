"use client";

import { useState } from "react";
import { Bot, CheckCircle2, KeyRound, Sparkles, XCircle } from "lucide-react";
import { Eyebrow, Display } from "@/components/ui/Typography";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils/cn";

// =============================================================================
// AIConfigCard — config de IA de PLATAFORMA en /internal (Fase 7).
//
// Selector de proveedor (Claude/Gemini), modelo y API key WRITE-ONLY: la key
// guardada NUNCA se muestra (solo "configurada"). Botón "Probar" hace un
// generateJson trivial. Todo vía /api/internal/ai-config (requireInternal +
// audit con key redactada). Tokens del design system only.
//
// Si encryptionReady=false (falta AI_CONFIG_SECRET en el server), la card avisa
// y deshabilita guardar: la key no se puede cifrar.
// =============================================================================

const PROVIDERS = [
  { id: "claude", label: "Claude", model: "claude-sonnet-4-6", hint: "Anthropic" },
  { id: "gemini", label: "Gemini", model: "gemini-2.0-flash", hint: "Google" },
] as const;

type ProviderId = (typeof PROVIDERS)[number]["id"];

export interface AIConfigInitial {
  provider: ProviderId;
  model: string;
  configured: boolean;
}

export function AIConfigCard({
  initial,
  encryptionReady,
}: {
  initial: AIConfigInitial | null;
  encryptionReady: boolean;
}) {
  const { toast } = useToast();
  const [provider, setProvider] = useState<ProviderId>(
    initial?.provider ?? "claude",
  );
  const [model, setModel] = useState(initial?.model ?? PROVIDERS[0].model);
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<
    { ok: boolean; message: string } | null
  >(null);

  const configured = initial?.configured ?? false;

  function onPickProvider(id: ProviderId) {
    setProvider(id);
    setTestResult(null);
    // Si no hay modelo tipeado o coincide con el default del otro, sugerí el default.
    const def = PROVIDERS.find((p) => p.id === id)!.model;
    const defaults: string[] = PROVIDERS.map((p) => p.model);
    if (!model.trim() || defaults.includes(model.trim())) setModel(def);
  }

  async function post(action: "save" | "test") {
    const res = await fetch("/api/internal/ai-config", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action,
        provider,
        model: model.trim(),
        apiKey,
      }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      status?: number;
    };
    return { res, json };
  }

  async function onSave() {
    if (!encryptionReady) return;
    setSaving(true);
    setTestResult(null);
    try {
      const { res, json } = await post("save");
      if (!res.ok || json.error) {
        toast({
          title: "No se pudo guardar",
          description: json.error,
          variant: "error",
        });
        return;
      }
      toast({ title: "Configuración de IA guardada", variant: "success" });
      setApiKey("");
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

  async function onTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const { json } = await post("test");
      if (json.ok) {
        setTestResult({ ok: true, message: "Conexión correcta." });
      } else {
        setTestResult({
          ok: false,
          message: json.error ?? "Falló la prueba.",
        });
      }
    } catch (e) {
      setTestResult({
        ok: false,
        message: e instanceof Error ? e.message : "Falló la prueba.",
      });
    } finally {
      setTesting(false);
    }
  }

  const canTest = encryptionReady && (apiKey.length > 0 || configured);

  return (
    <>
      <Eyebrow>Plataforma</Eyebrow>
      <Display className="mt-3 text-3xl md:text-4xl">Inteligencia Artificial</Display>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        La API key es de Ninja-Soft (plataforma), nunca del cliente. Se guarda
        cifrada y se usa para el rotulado y la tabla nutricional asistidos. La IA
        se incluye en planes altos y se vende como add-on en planes bajos.
      </p>

      <Card className="mt-6 bg-card shadow-soft backdrop-blur-xl">
        <CardContent className="space-y-5 p-5">
          <div className="flex items-center gap-2 font-semibold text-foreground">
            <Bot size={16} className="text-primary" /> Proveedor de IA
          </div>

          {!encryptionReady && (
            <div className="flex items-start gap-2.5 rounded-ninjaMd border border-orange-400/30 bg-orange-400/5 p-3 text-sm text-orange-300">
              <XCircle size={16} className="mt-0.5 shrink-0" />
              <span>
                Falta <code>AI_CONFIG_SECRET</code> en el servidor. Sin esa
                variable no se puede cifrar la key y la IA queda deshabilitada.
              </span>
            </div>
          )}

          {/* Selector de proveedor */}
          <div className="grid grid-cols-2 gap-3">
            {PROVIDERS.map((p) => {
              const active = provider === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onPickProvider(p.id)}
                  className={cn(
                    "flex flex-col items-start gap-1 rounded-ninjaMd border p-4 text-left transition",
                    active
                      ? "border-primary/60 bg-primary/10 ring-2 ring-primary/20"
                      : "border-border bg-muted/30 hover:border-primary/40 hover:bg-muted",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Sparkles
                      size={16}
                      className={active ? "text-primary" : "text-muted-foreground"}
                    />
                    <span className="font-semibold text-foreground">{p.label}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{p.hint}</span>
                </button>
              );
            })}
          </div>

          <Input
            label="Modelo"
            value={model}
            placeholder={PROVIDERS.find((p) => p.id === provider)!.model}
            onChange={(e) => setModel(e.target.value)}
          />

          <div>
            <Input
              label={configured ? "API key (vacío = no cambiar)" : "API key"}
              type="password"
              placeholder={configured ? "configurada ✓" : "Pegá la key de plataforma"}
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setTestResult(null);
              }}
            />
            <div className="mt-1.5 flex items-center gap-1.5 text-xs">
              <KeyRound size={13} className="text-muted-foreground" />
              {configured ? (
                <span className="text-emerald-400">
                  Hay una key configurada. No se muestra por seguridad.
                </span>
              ) : (
                <span className="text-muted-foreground">
                  Aún no hay key configurada.
                </span>
              )}
            </div>
          </div>

          {/* Resultado de la prueba */}
          {testResult && (
            <div
              className={cn(
                "flex items-start gap-2.5 rounded-ninjaMd border p-3 text-sm",
                testResult.ok
                  ? "border-emerald-400/30 bg-emerald-400/5 text-emerald-300"
                  : "border-destructive/30 bg-destructive/10 text-destructive",
              )}
            >
              {testResult.ok ? (
                <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
              ) : (
                <XCircle size={16} className="mt-0.5 shrink-0" />
              )}
              <span className="break-words">{testResult.message}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              variant="secondary"
              onClick={onTest}
              loading={testing}
              disabled={!canTest}
            >
              Probar
            </Button>
            <Button
              onClick={onSave}
              loading={saving}
              disabled={!encryptionReady}
            >
              Guardar configuración
            </Button>
          </div>
          {!canTest && encryptionReady && (
            <p className="text-right text-xs text-muted-foreground">
              Ingresá una key para probar la conexión.
            </p>
          )}
        </CardContent>
      </Card>
    </>
  );
}
