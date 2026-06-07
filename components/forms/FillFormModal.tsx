"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ImagePlus,
  Loader2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils/cn";
import { useFormMembers, useSubmitForm } from "@/modules/forms/hooks";
import {
  removeFormPhoto,
  uploadFormPhoto,
  type FormSubmission,
  type FormTemplate,
} from "@/modules/forms/api";
import {
  buildValuesSchema,
  evaluateSubmission,
  isChecklistValue,
  isPhotoValue,
  type FormField,
  type FormValues,
  type PhotoValue,
} from "@/modules/forms/schemas";

const inputCls =
  "h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20";

// Estado interno: los inputs guardan el valor crudo; al enviar se coacciona y se
// valida con buildValuesSchema. El semáforo se calcula en vivo con los valores
// ya parseados. Los nuevos tipos guardan su shape final ya en el draft:
//  - checklist → string[] (opciones tildadas)
//  - photo     → PhotoValue | null (subida al bucket antes de enviar)
//  - time      → string "HH:mm"
type DraftFieldValue = string | boolean | string[] | PhotoValue | null;
type DraftValues = Record<string, DraftFieldValue>;

function initialDraft(fields: FormField[]): DraftValues {
  const d: DraftValues = {};
  for (const f of fields) {
    if (f.type === "bool") d[f.key] = false;
    else if (f.type === "checklist") d[f.key] = [];
    else if (f.type === "photo") d[f.key] = null;
    else d[f.key] = "";
  }
  return d;
}

/** Coacciona los valores crudos a su tipo definitivo para zod/evaluate. */
function coerce(fields: FormField[], draft: DraftValues): FormValues {
  const out: FormValues = {};
  for (const f of fields) {
    const raw = draft[f.key];
    if (f.type === "bool") {
      out[f.key] = Boolean(raw);
    } else if (f.type === "number" || f.type === "temperature") {
      const s = String(raw ?? "").trim();
      out[f.key] = s === "" ? null : Number(s.replace(",", "."));
    } else if (f.type === "checklist") {
      out[f.key] = isChecklistValue(raw) ? raw : [];
    } else if (f.type === "photo") {
      out[f.key] = isPhotoValue(raw) ? raw : null;
    } else {
      // text / select / time
      const s = String(raw ?? "");
      out[f.key] = s === "" ? null : s;
    }
  }
  return out;
}

// Completar planilla: render dinámico, semáforo en vivo, acción correctiva y firma.
export function FillFormModal({
  open,
  onOpenChange,
  template,
  corrects,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  template: FormTemplate | null;
  /** Si se pasa, este registro corrige otro (status='corrected'). */
  corrects?: FormSubmission | null;
}) {
  const { toast } = useToast();
  const { data: members } = useFormMembers();
  const submitMut = useSubmitForm();

  const fields = useMemo(() => template?.fields ?? [], [template]);
  const [draft, setDraft] = useState<DraftValues>({});
  const [corrective, setCorrective] = useState("");
  const [memberId, setMemberId] = useState("");
  const [pin, setPin] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !template) return;
    setDraft(initialDraft(template.fields));
    setCorrective(
      // Si es corrección, precargamos las instrucciones del template como ayuda.
      template.action_on_fail?.instructions ?? ""
    );
    setMemberId("");
    setPin("");
    setFieldErrors({});
    setFormError(null);
  }, [open, template]);

  // Valores coaccionados + semáforo en vivo.
  const values = useMemo(() => coerce(fields, draft), [fields, draft]);
  const liveStatus = useMemo(
    () => evaluateSubmission(fields, values),
    [fields, values]
  );

  function setValue(key: string, value: DraftFieldValue) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit() {
    if (!template) return;
    setFormError(null);
    setFieldErrors({});

    const schema = buildValuesSchema(fields);
    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const issue of parsed.error.errors) {
        const key = String(issue.path[0] ?? "");
        if (key && !errs[key]) errs[key] = issue.message;
      }
      setFieldErrors(errs);
      setFormError("Revisá los campos marcados.");
      return;
    }

    const status = corrects ? "corrected" : liveStatus;

    // Si hay desvío, la acción correctiva es obligatoria.
    if (status === "fail" && !corrective.trim()) {
      setFormError("Detalle la acción correctiva ante el desvío.");
      return;
    }

    // Firma obligatoria.
    if (template.requires_signature) {
      if (!memberId) {
        setFormError("Elegí el operario que firma.");
        return;
      }
      if (!pin.trim()) {
        setFormError("Ingresá el PIN del operario.");
        return;
      }
    }

    try {
      await submitMut.mutateAsync({
        templateId: template.id,
        values: parsed.data,
        memberId: memberId || null,
        pin: pin || null,
        status,
        correctiveAction:
          status === "fail" || corrects ? corrective.trim() || null : null,
        correctsSubmissionId: corrects?.id ?? null,
      });
      toast({
        title: corrects ? "Corrección registrada" : "Planilla registrada",
        variant: "success",
      });
      onOpenChange(false);
    } catch (e) {
      // El PIN no se loguea nunca. Solo mostramos el mensaje del error.
      setFormError(e instanceof Error ? e.message : "No se pudo registrar");
    }
  }

  if (!template) return null;

  const showCorrective = liveStatus === "fail" || !!corrects;

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={corrects ? "Corregir registro" : template.name}
      description={
        corrects
          ? "Registro de corrección vinculado al original (inmutable)."
          : "Completá la planilla y firmá con el PIN del operario."
      }
      className="max-w-xl"
    >
      <div className="space-y-5">
        {/* Semáforo en vivo */}
        <div
          className={cn(
            "flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium",
            liveStatus === "ok"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
              : "border-destructive/40 bg-destructive/10 text-destructive"
          )}
        >
          {liveStatus === "ok" ? (
            <>
              <CheckCircle2 size={16} />
              Dentro de los rangos
            </>
          ) : (
            <>
              <AlertTriangle size={16} />
              Desvío detectado · valor fuera de rango
            </>
          )}
        </div>

        {/* Campos dinámicos */}
        <div className="space-y-4">
          {fields.map((field) => (
            <FieldInput
              key={field.key}
              field={field}
              value={draft[field.key]}
              error={fieldErrors[field.key]}
              onChange={(v) => setValue(field.key, v)}
            />
          ))}
        </div>

        {/* Acción correctiva (si hay desvío o es corrección) */}
        {showCorrective && (
          <div>
            <label className="mb-2 block text-sm font-medium text-muted-foreground">
              Acción correctiva
              {liveStatus === "fail" && (
                <span className="text-destructive"> *</span>
              )}
            </label>
            <textarea
              value={corrective}
              onChange={(e) => setCorrective(e.target.value)}
              rows={3}
              placeholder="Describí la medida tomada ante el desvío…"
              className="focus:ring-primary/20 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2"
            />
          </div>
        )}

        {/* Firma */}
        {template.requires_signature && (
          <div className="bg-muted/30 rounded-md border border-border p-3">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Firma del operario
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <select
                aria-label="Operario"
                className={inputCls}
                value={memberId}
                onChange={(e) => setMemberId(e.target.value)}
              >
                <option value="">Elegir operario…</option>
                {(members ?? []).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.full_name}
                  </option>
                ))}
              </select>
              <input
                type="password"
                inputMode="numeric"
                autoComplete="off"
                aria-label="PIN"
                placeholder="PIN"
                className={inputCls}
                value={pin}
                onChange={(e) => setPin(e.target.value)}
              />
            </div>
          </div>
        )}

        {formError && (
          <p className="border-destructive/40 bg-destructive/10 rounded-md border px-3 py-2 text-sm text-destructive">
            {formError}
          </p>
        )}

        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} loading={submitMut.isPending}>
            {corrects ? "Registrar corrección" : "Registrar planilla"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ── Input de un campo según su tipo ──────────────────────────────────────────

function FieldInput({
  field,
  value,
  error,
  onChange,
}: {
  field: FormField;
  value: DraftFieldValue | undefined;
  error?: string;
  onChange: (v: DraftFieldValue) => void;
}) {
  const labelEl = (
    <label className="mb-2 block text-sm font-medium text-muted-foreground">
      {field.label}
      {field.required && <span className="text-destructive"> *</span>}
    </label>
  );

  return (
    <div>
      {labelEl}
      {field.type === "bool" ? (
        <div className="flex gap-2">
          <BoolPill
            active={value === true}
            onClick={() => onChange(true)}
            label="Sí"
          />
          <BoolPill
            active={value === false}
            onClick={() => onChange(false)}
            label="No"
          />
        </div>
      ) : field.type === "select" ? (
        <select
          className={inputCls}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Elegir…</option>
          {(field.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : field.type === "text" ? (
        <input
          className={inputCls}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Texto…"
        />
      ) : field.type === "time" ? (
        <input
          type="time"
          className={inputCls}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : field.type === "checklist" ? (
        <ChecklistInput
          options={field.options ?? []}
          value={isChecklistValue(value) ? value : []}
          onChange={onChange}
        />
      ) : field.type === "photo" ? (
        <PhotoInput
          value={isPhotoValue(value) ? value : null}
          onChange={onChange}
        />
      ) : (
        // number / temperature
        <div className="flex items-center gap-2">
          <input
            type="number"
            step="any"
            inputMode="decimal"
            className={cn(inputCls, "text-right")}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={
              field.min != null || field.max != null
                ? `${field.min ?? ""}–${field.max ?? ""}`
                : "0"
            }
          />
          {field.unit && (
            <span className="font-price text-sm text-muted-foreground">
              {field.unit}
            </span>
          )}
        </div>
      )}
      {(field.min != null || field.max != null) &&
        (field.type === "number" || field.type === "temperature") && (
          <p className="mt-1 text-xs text-muted-foreground">
            Rango aceptable: {field.min != null ? field.min : "−∞"} a{" "}
            {field.max != null ? field.max : "∞"}
            {field.unit ? ` ${field.unit}` : ""}
          </p>
        )}
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}

// ── Checklist (opciones tildables) ───────────────────────────────────────────

function ChecklistInput({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  function toggle(opt: string) {
    onChange(
      value.includes(opt) ? value.filter((v) => v !== opt) : [...value, opt]
    );
  }
  return (
    <div className="space-y-1.5">
      {options.map((opt) => (
        <label
          key={opt}
          className="flex cursor-pointer items-center gap-2.5 rounded-md border border-border bg-card px-3 py-2 text-sm transition hover:border-primary/40"
        >
          <input
            type="checkbox"
            checked={value.includes(opt)}
            onChange={() => toggle(opt)}
            className="h-4 w-4 rounded border-input accent-primary"
          />
          {opt}
        </label>
      ))}
    </div>
  );
}

// ── Foto (upload al bucket privado + thumbnail) ──────────────────────────────

function PhotoInput({
  value,
  onChange,
}: {
  value: PhotoValue | null;
  onChange: (v: PhotoValue | null) => void;
}) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  // Preview local (objectURL) mientras la captura está abierta: evita firmar URL.
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      toast({
        title: "Imagen muy pesada",
        description: "Máximo 8 MB",
        variant: "error",
      });
      return;
    }
    try {
      setUploading(true);
      // Si había una foto previa subida, la quitamos del bucket (best-effort).
      if (value?.path) void removeFormPhoto(value.path);
      const uploaded = await uploadFormPhoto(file);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(file));
      onChange(uploaded);
    } catch (err) {
      toast({
        title: "No se pudo subir la foto",
        description: err instanceof Error ? err.message : undefined,
        variant: "error",
      });
    } finally {
      setUploading(false);
    }
  }

  function clear() {
    if (value?.path) void removeFormPhoto(value.path);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    onChange(null);
  }

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        aria-label="Adjuntar foto"
        className="relative grid h-20 w-28 shrink-0 place-items-center overflow-hidden rounded-lg border border-dashed border-border bg-muted/40 text-muted-foreground transition hover:border-primary hover:text-primary disabled:opacity-60"
      >
        {uploading ? (
          <Loader2 size={20} className="animate-spin" />
        ) : previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt={value?.name ?? "Foto"}
            className="h-full w-full object-cover"
          />
        ) : (
          <ImagePlus size={22} />
        )}
      </button>
      <div className="min-w-0 flex-1">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          loading={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {value ? "Cambiar foto" : "Adjuntar foto"}
        </Button>
        {value && (
          <button
            type="button"
            onClick={clear}
            className="ml-2 inline-flex items-center gap-1 text-xs text-muted-foreground transition hover:text-destructive"
          >
            <X size={12} />
            Quitar
          </button>
        )}
        {value?.name && (
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {value.name}
          </p>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onPick}
      />
    </div>
  );
}

function BoolPill({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md border px-5 py-2 text-sm font-medium transition",
        active
          ? "bg-primary/15 border-primary text-primary"
          : "hover:border-primary/40 border-border bg-card text-muted-foreground"
      )}
    >
      {label}
    </button>
  );
}
