"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Mail,
  Plus,
  RotateCcw,
  Send,
  Server,
} from "lucide-react";
import { Eyebrow, Display } from "@/components/ui/Typography";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Switch } from "@/components/ui/Switch";
import { useToast } from "@/components/ui/Toast";
import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownLabel,
  DropdownTrigger,
} from "@/components/ui/Dropdown";
import {
  EMAIL_TEMPLATES,
  EMAIL_TEMPLATES_BY_KEY,
  buildEmailLayout,
  renderTemplate,
  renderTemplateHtml,
} from "@/lib/emails/templates";
import {
  checkTypography,
  typographyMessage,
  sampleVars,
} from "@/modules/internal-emails/schemas";
import {
  useSaveSmtp,
  useSaveTemplate,
  useResetTemplate,
  useSendTestEmail,
} from "@/modules/internal-emails/hooks";
import { cn } from "@/lib/utils/cn";

// =============================================================================
// EmailConsole — consola de emails del panel staff (calcada del POS
// app/internal/emails). Tres bloques: SMTP del remitente, editor de plantillas
// con vista previa en vivo + insercion de variables + guard regla 6, y envio de
// prueba al staff logueado. Lecturas iniciales por server (admin client); las
// escrituras por route handlers auditados. Tokens del design system only.
// =============================================================================

export interface SmtpInitial {
  hostname: string;
  port: number;
  username: string;
  hasPassword: boolean;
  fromEmail: string;
  fromName: string;
  secure: boolean;
}

export interface EmailConsoleProps {
  smtp: SmtpInitial | null;
  /** Overrides globales por key (system_email_templates). */
  overrides: Record<string, { subject: string; html: string }>;
}

export function EmailConsole({ smtp, overrides }: EmailConsoleProps) {
  const { toast } = useToast();
  const saveSmtp = useSaveSmtp();
  const saveTpl = useSaveTemplate();
  const resetTpl = useResetTemplate();
  const sendTest = useSendTestEmail();

  // ── SMTP ───────────────────────────────────────────────────────────────────
  const [host, setHost] = useState(smtp?.hostname ?? "");
  const [port, setPort] = useState(String(smtp?.port ?? 587));
  const [user, setUser] = useState(smtp?.username ?? "");
  const [pass, setPass] = useState("");
  const [fromName, setFromName] = useState(smtp?.fromName ?? "Ninja Food");
  const [fromEmail, setFromEmail] = useState(smtp?.fromEmail ?? "");
  const [secure, setSecure] = useState(smtp?.secure ?? true);
  const hasPassword = smtp?.hasPassword ?? false;

  function onSaveSmtp() {
    saveSmtp.mutate(
      {
        hostname: host.trim(),
        port: Number(port) || 587,
        username: user.trim(),
        password: pass.length > 0 ? pass : undefined,
        from_email: fromEmail.trim(),
        from_name: fromName.trim(),
        secure,
      },
      {
        onSuccess: () => {
          toast({ title: "SMTP guardado", variant: "success" });
          setPass("");
        },
        onError: (e) =>
          toast({
            title: "No se pudo guardar",
            description: e instanceof Error ? e.message : undefined,
            variant: "error",
          }),
      },
    );
  }

  // ── Plantillas ───────────────────────────────────────────────────────────────
  const [selectedKey, setSelectedKey] = useState(EMAIL_TEMPLATES[0]!.key);
  const def = EMAIL_TEMPLATES_BY_KEY[selectedKey]!;
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  // Carga el contenido al cambiar de template: override global o default.
  useEffect(() => {
    const ov = overrides[selectedKey];
    setSubject(ov?.subject ?? def.defaultSubject);
    setBody(ov?.html ?? def.defaultBody);
  }, [selectedKey, overrides, def.defaultSubject, def.defaultBody]);

  const hasOverride = Boolean(overrides[selectedKey]);

  // Insercion de variables en el cursor (asunto o cuerpo).
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [activeField, setActiveField] = useState<"subject" | "body">("body");

  function insertVar(name: string) {
    const token = `{{${name}}}`;
    const isSubject = activeField === "subject";
    const el = isSubject ? subjectRef.current : bodyRef.current;
    const cur = isSubject ? subject : body;
    const setter = isSubject ? setSubject : setBody;
    const start = el?.selectionStart ?? cur.length;
    const end = el?.selectionEnd ?? cur.length;
    setter(cur.slice(0, start) + token + cur.slice(end));
    requestAnimationFrame(() => {
      if (el) {
        const pos = start + token.length;
        el.focus();
        el.setSelectionRange(pos, pos);
      }
    });
  }

  // Guard regla 6 en vivo (sin emojis, sin em-dashes).
  const typoIssues = useMemo(
    () => [
      ...checkTypography(subject, "subject"),
      ...checkTypography(body, "body"),
    ],
    [subject, body],
  );

  const vars = useMemo(() => sampleVars("Ninja Food"), []);
  const previewSubject = renderTemplate(subject, vars);
  const previewHtml = useMemo(
    () => buildEmailLayout(renderTemplateHtml(body, vars), { negocio: "Ninja Food" }),
    [body, vars],
  );

  function onSaveTpl() {
    if (typoIssues.length > 0) {
      toast({ title: typographyMessage(typoIssues[0]!), variant: "error" });
      return;
    }
    saveTpl.mutate(
      { key: selectedKey, subject, html: body },
      {
        onSuccess: () => toast({ title: "Plantilla guardada", variant: "success" }),
        onError: (e) =>
          toast({
            title: "No se pudo guardar",
            description: e instanceof Error ? e.message : undefined,
            variant: "error",
          }),
      },
    );
  }

  function onResetTpl() {
    resetTpl.mutate(selectedKey, {
      onSuccess: () => {
        toast({ title: "Plantilla restaurada al default", variant: "success" });
        setSubject(def.defaultSubject);
        setBody(def.defaultBody);
      },
      onError: (e) =>
        toast({
          title: "No se pudo restaurar",
          description: e instanceof Error ? e.message : undefined,
          variant: "error",
        }),
    });
  }

  function onSendTest() {
    if (typoIssues.length > 0) {
      toast({ title: typographyMessage(typoIssues[0]!), variant: "error" });
      return;
    }
    sendTest.mutate(
      { subject, html: body },
      {
        onSuccess: (r) =>
          toast({
            title: "Email de prueba enviado",
            description: r.to ? `Enviado a ${r.to}` : undefined,
            variant: "success",
          }),
        onError: (e) =>
          toast({
            title: "No se pudo enviar",
            description:
              e instanceof Error ? e.message : "Revisá la configuración SMTP.",
            variant: "error",
          }),
      },
    );
  }

  const smtpReady = host.trim() && fromEmail.trim();

  return (
    <>
      <Eyebrow>Comunicaciones</Eyebrow>
      <Display className="mt-3 text-3xl md:text-4xl">Consola de emails</Display>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        Configurá el remitente, editá las plantillas que Ninja Food envía a los
        negocios y mandate una prueba. Estilo de marca: sin emojis, sin guiones
        largos, separador punto medio (·).
      </p>

      {/* SMTP del remitente */}
      <Card className="mt-6 bg-card shadow-soft backdrop-blur-xl">
        <CardContent className="space-y-4 p-5">
          <div className="flex items-center gap-2 font-semibold text-foreground">
            <Server size={16} className="text-primary" /> Servidor de envío (SMTP)
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Servidor SMTP"
              placeholder="smtp.tudominio.com"
              value={host}
              onChange={(e) => setHost(e.target.value)}
            />
            <Input
              label="Puerto"
              inputMode="numeric"
              placeholder="587"
              value={port}
              onChange={(e) => setPort(e.target.value.replace(/\D/g, ""))}
            />
            <Input
              label="Usuario"
              placeholder="no-reply@ninjasoft.app"
              value={user}
              onChange={(e) => setUser(e.target.value)}
            />
            <Input
              label={hasPassword ? "Contraseña (vacío = no cambiar)" : "Contraseña"}
              type="password"
              placeholder={hasPassword ? "••••••••" : ""}
              value={pass}
              onChange={(e) => setPass(e.target.value)}
            />
            <Input
              label="Nombre del remitente"
              value={fromName}
              onChange={(e) => setFromName(e.target.value)}
            />
            <Input
              label="Email del remitente"
              type="email"
              placeholder="no-reply@ninjasoft.app"
              value={fromEmail}
              onChange={(e) => setFromEmail(e.target.value)}
            />
          </div>
          <div className="flex items-center justify-between rounded-ninjaMd border border-border bg-muted/30 px-4 py-3">
            <div>
              <div className="text-sm font-medium text-foreground">
                Conexión segura (TLS)
              </div>
              <div className="text-xs text-muted-foreground">
                Activá para puerto 465 (SSL/TLS implícito).
              </div>
            </div>
            <Switch checked={secure} onCheckedChange={setSecure} label="TLS" />
          </div>
          <div className="flex justify-end">
            <Button onClick={onSaveSmtp} loading={saveSmtp.isPending}>
              Guardar SMTP
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Plantillas */}
      <Card className="mt-6 bg-card shadow-soft backdrop-blur-xl">
        <CardContent className="space-y-5 p-5">
          <div className="flex items-center gap-2 font-semibold text-foreground">
            <Mail size={16} className="text-primary" /> Plantillas del sistema
          </div>

          {/* Selector de template */}
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {EMAIL_TEMPLATES.map((t) => {
              const edited = Boolean(overrides[t.key]);
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setSelectedKey(t.key)}
                  className={cn(
                    "shrink-0 rounded-ninjaSm px-3 py-1.5 text-sm transition",
                    selectedKey === t.key
                      ? "bg-primary/15 font-medium text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {t.label}
                  {edited && (
                    <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-primary align-middle" />
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">{def.description}</p>
            <Dropdown>
              <DropdownTrigger asChild>
                <Button variant="secondary" size="sm">
                  <Plus size={15} /> Insertar variable
                </Button>
              </DropdownTrigger>
              <DropdownContent align="end" className="w-56">
                <DropdownLabel>
                  En {activeField === "subject" ? "el asunto" : "el contenido"}
                </DropdownLabel>
                {def.variables.map((v) => (
                  <DropdownItem key={v} onSelect={() => insertVar(v)}>
                    <code className="text-xs">{`{{${v}}}`}</code>
                  </DropdownItem>
                ))}
              </DropdownContent>
            </Dropdown>
          </div>

          <Input
            ref={subjectRef}
            label="Asunto"
            value={subject}
            onFocus={() => setActiveField("subject")}
            onChange={(e) => setSubject(e.target.value)}
          />

          <div>
            <label className="mb-2 block text-sm font-medium text-muted-foreground">
              Contenido (HTML del cuerpo, sin el layout)
            </label>
            <textarea
              ref={bodyRef}
              value={body}
              onFocus={() => setActiveField("body")}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              className="w-full rounded-ninjaMd border border-input bg-background p-3 font-mono text-xs text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
              Tocá un campo (asunto o contenido) y luego “Insertar variable”. El
              header con logo y el footer los agrega Ninja Food.
            </p>
          </div>

          {/* Aviso regla 6 */}
          {typoIssues.length > 0 && (
            <div className="flex items-start gap-2.5 rounded-ninjaMd border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <ul className="space-y-1">
                {typoIssues.map((iss, i) => (
                  <li key={i}>{typographyMessage(iss)}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Vista previa en vivo */}
          <div>
            <div className="mb-2 text-sm font-medium text-muted-foreground">
              Vista previa (con variables de ejemplo)
            </div>
            <div className="overflow-hidden rounded-ninjaMd border border-border">
              <div className="border-b border-neutral-200 bg-neutral-50 px-4 py-2 text-xs text-neutral-500">
                Asunto: <span className="text-neutral-800">{previewSubject}</span>
              </div>
              <iframe
                title="Vista previa del email"
                srcDoc={previewHtml}
                className="h-[480px] w-full bg-white"
                sandbox=""
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            {hasOverride && (
              <Button
                variant="ghost"
                onClick={onResetTpl}
                loading={resetTpl.isPending}
              >
                <RotateCcw size={15} /> Volver al default
              </Button>
            )}
            <Button
              variant="secondary"
              onClick={onSendTest}
              loading={sendTest.isPending}
              disabled={!smtpReady || typoIssues.length > 0}
            >
              <Send size={16} /> Enviar prueba
            </Button>
            <Button
              onClick={onSaveTpl}
              loading={saveTpl.isPending}
              disabled={typoIssues.length > 0}
            >
              Guardar plantilla
            </Button>
          </div>
          {!smtpReady && (
            <p className="text-right text-xs text-muted-foreground">
              Configurá el SMTP para habilitar el envío de prueba.
            </p>
          )}
        </CardContent>
      </Card>
    </>
  );
}
