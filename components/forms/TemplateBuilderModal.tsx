"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Eye, GripVertical, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Switch } from "@/components/ui/Switch";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils/cn";
import { useCreateTemplate, useUpdateTemplate } from "@/modules/forms/hooks";
import type { FormTemplate } from "@/modules/forms/api";
import {
  FIELD_TYPES,
  FIELD_TYPE_LABELS,
  FORM_KINDS,
  FORM_KIND_LABELS,
  FREQUENCY_LABELS,
  FREQUENCY_TYPES,
  isNumericField,
  slugifyFieldKey,
  templateSchema,
  type FieldType,
  type FormField,
  type FrequencyType,
  type FormKind,
} from "@/modules/forms/schemas";

const selectCls =
  "h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20";
const labelCls = "mb-2 block text-sm font-medium text-muted-foreground";

// Estado de un campo en el builder (los rangos se manejan como string para
// permitir el campo vacío en los inputs; se parsean al guardar).
type DraftField = {
  uid: string;
  key: string;
  // keyTouched: si el usuario editó la clave a mano, dejamos de derivarla del label.
  keyTouched: boolean;
  label: string;
  type: FieldType;
  required: boolean;
  min: string;
  max: string;
  unit: string;
  // options: usado por `select` (lista) y por `checklist` (ítems tildables).
  options: string[];
  // checklist: todas las opciones deben estar tildadas para no marcar desvío.
  optionsRequired: boolean;
};

const WEEKDAYS = [
  { value: 1, label: "Lun" },
  { value: 2, label: "Mar" },
  { value: 3, label: "Mié" },
  { value: 4, label: "Jue" },
  { value: 5, label: "Vie" },
  { value: 6, label: "Sáb" },
  { value: 0, label: "Dom" },
];

let draftCounter = 0;
function newDraftField(): DraftField {
  draftCounter += 1;
  return {
    uid: `f${draftCounter}-${Date.now()}`,
    key: "",
    keyTouched: false,
    label: "",
    type: "number",
    required: true,
    min: "",
    max: "",
    unit: "",
    options: [],
    optionsRequired: true,
  };
}

function templateToDrafts(t: FormTemplate): DraftField[] {
  return t.fields.map((f, i) => ({
    uid: `f-${i}-${f.key}`,
    key: f.key,
    keyTouched: true,
    label: f.label,
    type: f.type,
    required: f.required,
    min: f.min != null ? String(f.min) : "",
    max: f.max != null ? String(f.max) : "",
    unit: f.unit ?? "",
    options: f.options ?? [],
    optionsRequired: f.options_required ?? true,
  }));
}

function parseNum(v: string): number | null {
  const t = v.trim();
  if (t === "") return null;
  const n = Number(t.replace(",", "."));
  return Number.isNaN(n) ? null : n;
}

/** Convierte los drafts a FormField (sin validar; lo valida zod al guardar). */
function draftsToFields(drafts: DraftField[]): FormField[] {
  return drafts.map((d) => {
    const numeric = isNumericField(d.type);
    const hasOptions = d.type === "select" || d.type === "checklist";
    return {
      key: d.key || slugifyFieldKey(d.label),
      label: d.label,
      type: d.type,
      required: d.required,
      min: numeric ? parseNum(d.min) : null,
      max: numeric ? parseNum(d.max) : null,
      unit: d.type === "temperature" || numeric ? d.unit.trim() || null : null,
      options: hasOptions
        ? d.options.map((o) => o.trim()).filter((o) => o.length > 0)
        : undefined,
      options_required: d.type === "checklist" ? d.optionsRequired : null,
    };
  });
}

// Builder de planillas configurables: metadatos + campos reordenables + preview.
export function TemplateBuilderModal({
  open,
  onOpenChange,
  template,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  template?: FormTemplate | null;
}) {
  const { toast } = useToast();
  const createMut = useCreateTemplate();
  const updateMut = useUpdateTemplate();
  const editing = !!template;

  const [name, setName] = useState("");
  const [kind, setKind] = useState<FormKind>("custom");
  const [freqType, setFreqType] = useState<FrequencyType>("none");
  const [freqTime, setFreqTime] = useState("");
  const [freqDays, setFreqDays] = useState<number[]>([]);
  const [requiresSignature, setRequiresSignature] = useState(true);
  const [failInstructions, setFailInstructions] = useState("");
  const [drafts, setDrafts] = useState<DraftField[]>([newDraftField()]);
  const [error, setError] = useState<string | null>(null);

  // Sensores de drag&drop: puntero + teclado (accesible). El de teclado usa la
  // estrategia de listas verticales para mover con flechas tras tomar el handle.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (template) {
      setName(template.name);
      setKind(template.kind);
      setFreqType(template.frequency.type);
      setFreqTime(template.frequency.time ?? "");
      setFreqDays(template.frequency.days ?? []);
      setRequiresSignature(template.requires_signature);
      setFailInstructions(template.action_on_fail?.instructions ?? "");
      setDrafts(templateToDrafts(template));
    } else {
      setName("");
      setKind("custom");
      setFreqType("none");
      setFreqTime("");
      setFreqDays([]);
      setRequiresSignature(true);
      setFailInstructions("");
      setDrafts([newDraftField()]);
    }
  }, [open, template]);

  const previewFields = useMemo(() => draftsToFields(drafts), [drafts]);

  function patchField(uid: string, patch: Partial<DraftField>) {
    setDrafts((prev) =>
      prev.map((d) => {
        if (d.uid !== uid) return d;
        const next = { ...d, ...patch };
        // Derivar la clave del label mientras el usuario no la haya tocado.
        if (patch.label !== undefined && !next.keyTouched) {
          next.key = slugifyFieldKey(patch.label);
        }
        return next;
      })
    );
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setDrafts((prev) => {
      const from = prev.findIndex((d) => d.uid === active.id);
      const to = prev.findIndex((d) => d.uid === over.id);
      if (from === -1 || to === -1) return prev;
      return arrayMove(prev, from, to);
    });
  }

  function removeField(uid: string) {
    setDrafts((prev) =>
      prev.length === 1 ? prev : prev.filter((d) => d.uid !== uid)
    );
  }

  function toggleDay(day: number) {
    setFreqDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    );
  }

  async function handleSubmit() {
    setError(null);
    const fields = draftsToFields(drafts);
    // Claves duplicadas: la regla de unicidad la chequeamos acá (zod valida forma).
    const keys = fields.map((f) => f.key);
    if (new Set(keys).size !== keys.length) {
      setError("Hay campos con la misma clave. Cambiá las etiquetas.");
      return;
    }

    const parsed = templateSchema.safeParse({
      name,
      kind,
      fields,
      frequency: {
        type: freqType,
        time: freqType === "none" ? null : freqTime || null,
        days: freqType === "weekly" ? freqDays : undefined,
      },
      requires_signature: requiresSignature,
      action_on_fail: failInstructions.trim()
        ? { instructions: failInstructions }
        : null,
    });

    if (!parsed.success) {
      const first = parsed.error.errors[0];
      setError(first?.message ?? "Revisá los datos del formulario");
      return;
    }

    try {
      if (editing && template) {
        await updateMut.mutateAsync({ id: template.id, input: parsed.data });
        toast({ title: "Planilla actualizada", variant: "success" });
      } else {
        await createMut.mutateAsync(parsed.data);
        toast({ title: "Planilla creada", variant: "success" });
      }
      onOpenChange(false);
    } catch (e) {
      toast({
        title: editing
          ? "No se pudo actualizar la planilla"
          : "No se pudo crear la planilla",
        description: e instanceof Error ? e.message : undefined,
        variant: "error",
      });
    }
  }

  const pending = createMut.isPending || updateMut.isPending;

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? "Editar planilla" : "Nueva planilla configurable"}
      description="Definí los campos, la frecuencia y la firma. La vista previa muestra el formulario que verá el operario."
      className="max-w-4xl"
    >
      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        {/* ── Editor ── */}
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Nombre"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Control de cámara de frío"
            />
            <div>
              <label className={labelCls}>Tipo</label>
              <select
                className={selectCls}
                value={kind}
                onChange={(e) => setKind(e.target.value as FormKind)}
              >
                {FORM_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {FORM_KIND_LABELS[k]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Frecuencia */}
          <div>
            <label className={labelCls}>Frecuencia</label>
            <div className="grid gap-2 sm:grid-cols-2">
              <select
                className={selectCls}
                value={freqType}
                onChange={(e) => setFreqType(e.target.value as FrequencyType)}
              >
                {FREQUENCY_TYPES.map((f) => (
                  <option key={f} value={f}>
                    {FREQUENCY_LABELS[f]}
                  </option>
                ))}
              </select>
              {freqType !== "none" && (
                <input
                  type="time"
                  aria-label="Hora sugerida"
                  className={selectCls}
                  value={freqTime}
                  onChange={(e) => setFreqTime(e.target.value)}
                />
              )}
            </div>
            {freqType === "weekly" && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {WEEKDAYS.map((d) => {
                  const active = freqDays.includes(d.value);
                  return (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => toggleDay(d.value)}
                      className={cn(
                        "rounded-md border px-2.5 py-1 text-xs font-medium transition",
                        active
                          ? "bg-primary/15 border-primary text-primary"
                          : "hover:border-primary/40 border-border bg-card text-muted-foreground"
                      )}
                    >
                      {d.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Firma */}
          <div className="bg-muted/30 flex items-center justify-between rounded-md border border-border px-4 py-3">
            <div>
              <p className="text-sm font-medium">Requiere firma del operario</p>
              <p className="text-xs text-muted-foreground">
                Se valida con el PIN del operario al registrar.
              </p>
            </div>
            <Switch
              checked={requiresSignature}
              onCheckedChange={setRequiresSignature}
              label="Requiere firma"
            />
          </div>

          {/* Acción ante falla */}
          <div>
            <label className={labelCls}>Acción ante desvío (opcional)</label>
            <textarea
              value={failInstructions}
              onChange={(e) => setFailInstructions(e.target.value)}
              rows={2}
              placeholder="Instrucciones a seguir si un valor sale fuera de rango…"
              className="focus:ring-primary/20 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2"
            />
          </div>

          {/* Campos */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Campos de la planilla
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setDrafts((p) => [...p, newDraftField()])}
              >
                <Plus size={14} />
                Agregar campo
              </Button>
            </div>

            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={drafts.map((d) => d.uid)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-3">
                  {drafts.map((d) => (
                    <SortableFieldEditor
                      key={d.uid}
                      field={d}
                      total={drafts.length}
                      onChange={(patch) => patchField(d.uid, patch)}
                      onRemove={() => removeField(d.uid)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>

          {error && (
            <p className="border-destructive/40 bg-destructive/10 rounded-md border px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} loading={pending}>
              {editing ? "Guardar cambios" : "Crear planilla"}
            </Button>
          </div>
        </div>

        {/* ── Preview ── */}
        <div className="lg:sticky lg:top-0">
          <div className="bg-muted/20 rounded-lg border border-border p-4">
            <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              <Eye size={13} />
              Vista previa
            </p>
            <p className="text-base font-bold">{name || "Sin título"}</p>
            <p className="mb-3 text-xs text-muted-foreground">
              {FORM_KIND_LABELS[kind]} · {FREQUENCY_LABELS[freqType]}
            </p>
            <div className="space-y-3">
              {previewFields.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Agregá campos para ver el formulario.
                </p>
              ) : (
                previewFields.map((f, i) => (
                  <PreviewField key={`${f.key}-${i}`} field={f} />
                ))
              )}
            </div>
            {requiresSignature && (
              <div className="mt-4 border-t border-dashed border-border pt-3">
                <p className="text-xs text-muted-foreground">
                  Firma: operario + PIN
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ── Editor de un campo (sortable con dnd-kit) ─────────────────────────────────

function SortableFieldEditor({
  field,
  total,
  onChange,
  onRemove,
}: {
  field: DraftField;
  total: number;
  onChange: (patch: Partial<DraftField>) => void;
  onRemove: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: field.uid });

  const numeric = isNumericField(field.type);
  const isTemp = field.type === "temperature";
  const isSelect = field.type === "select";
  const isChecklist = field.type === "checklist";

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={cn(
        "rounded-md border border-border bg-card p-3",
        isDragging && "relative z-10 opacity-80 shadow-lg"
      )}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          aria-label="Reordenar campo (arrastrá o usá flechas)"
          className="mt-1 grid h-7 w-6 cursor-grab touch-none place-items-center rounded text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/40 active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical size={15} />
        </button>

        <div className="min-w-0 flex-1 space-y-2">
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <input
              aria-label="Etiqueta del campo"
              value={field.label}
              onChange={(e) => onChange({ label: e.target.value })}
              placeholder="Etiqueta (ej. Temperatura cámara)"
              className="focus:ring-primary/20 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2"
            />
            <select
              aria-label="Tipo de campo"
              value={field.type}
              onChange={(e) => onChange({ type: e.target.value as FieldType })}
              className="focus:ring-primary/20 h-10 rounded-lg border border-input bg-background px-2 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2"
            >
              {FIELD_TYPES.map((t) => (
                <option key={t} value={t}>
                  {FIELD_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>

          {/* Clave (slug) */}
          <input
            aria-label="Clave del campo"
            value={field.key}
            onChange={(e) =>
              onChange({ key: e.target.value, keyTouched: true })
            }
            placeholder="clave"
            className="focus:ring-primary/20 h-8 w-full rounded-lg border border-input bg-background px-3 font-price text-xs text-muted-foreground outline-none transition focus:border-primary focus:ring-2"
          />

          {/* Numéricos: min / max / unidad */}
          {numeric && (
            <div className="grid grid-cols-3 gap-2">
              <input
                aria-label="Mínimo"
                type="number"
                step="any"
                value={field.min}
                onChange={(e) => onChange({ min: e.target.value })}
                placeholder="Mín."
                className="focus:ring-primary/20 h-9 w-full rounded-lg border border-input bg-background px-2 text-right text-sm text-foreground outline-none transition focus:border-primary focus:ring-2"
              />
              <input
                aria-label="Máximo"
                type="number"
                step="any"
                value={field.max}
                onChange={(e) => onChange({ max: e.target.value })}
                placeholder="Máx."
                className="focus:ring-primary/20 h-9 w-full rounded-lg border border-input bg-background px-2 text-right text-sm text-foreground outline-none transition focus:border-primary focus:ring-2"
              />
              <input
                aria-label="Unidad"
                value={field.unit}
                onChange={(e) => onChange({ unit: e.target.value })}
                placeholder={isTemp ? "°C" : "unidad"}
                className="focus:ring-primary/20 h-9 w-full rounded-lg border border-input bg-background px-2 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2"
              />
            </div>
          )}

          {/* Select / Checklist: opciones */}
          {(isSelect || isChecklist) && (
            <OptionsEditor
              options={field.options}
              label={isChecklist ? "Ítems del checklist" : undefined}
              onChange={(options) => onChange({ options })}
            />
          )}

          {/* Foto: ayuda */}
          {field.type === "photo" && (
            <p className="text-xs text-muted-foreground">
              El operario adjunta una foto desde la cámara o galería. Se guarda en
              el bucket privado de la empresa.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-4">
            <label className="flex w-fit items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={field.required}
                onChange={(e) => onChange({ required: e.target.checked })}
                className="h-4 w-4 rounded border-input accent-primary"
              />
              Obligatorio
            </label>

            {/* Checklist: ¿todas las opciones son obligatorias para no marcar desvío? */}
            {isChecklist && (
              <label className="flex w-fit items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={field.optionsRequired}
                  onChange={(e) =>
                    onChange({ optionsRequired: e.target.checked })
                  }
                  className="h-4 w-4 rounded border-input accent-primary"
                />
                Todas obligatorias (marca desvío si falta alguna)
              </label>
            )}
          </div>
        </div>

        <button
          type="button"
          aria-label="Quitar campo"
          onClick={onRemove}
          disabled={total === 1}
          className="hover:bg-destructive/10 grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted-foreground transition hover:text-destructive disabled:pointer-events-none disabled:opacity-40"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
}

function OptionsEditor({
  options,
  onChange,
  label,
}: {
  options: string[];
  onChange: (opts: string[]) => void;
  label?: string;
}) {
  const list = options.length > 0 ? options : [""];
  return (
    <div className="space-y-1.5">
      {label && (
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
      )}
      {list.map((opt, i) => (
        <div key={i} className="flex gap-1.5">
          <input
            aria-label={`Opción ${i + 1}`}
            value={opt}
            onChange={(e) => {
              const next = [...list];
              next[i] = e.target.value;
              onChange(next);
            }}
            placeholder={`Opción ${i + 1}`}
            className="focus:ring-primary/20 h-9 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2"
          />
          <button
            type="button"
            aria-label="Quitar opción"
            onClick={() => onChange(list.filter((_, j) => j !== i))}
            disabled={list.length === 1}
            className="hover:bg-destructive/10 grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted-foreground transition hover:text-destructive disabled:opacity-40"
          >
            <X size={14} />
          </button>
        </div>
      ))}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => onChange([...list, ""])}
      >
        <Plus size={13} />
        Opción
      </Button>
    </div>
  );
}

// ── Preview de un campo (solo lectura) ───────────────────────────────────────

function PreviewField({ field }: { field: FormField }) {
  const reqMark = field.required ? " *" : "";
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">
        {field.label || "Campo sin etiqueta"}
        {reqMark}
      </label>
      {field.type === "bool" ? (
        <div className="flex gap-2">
          <span className="rounded-md border border-border px-3 py-1.5 text-xs">
            Sí
          </span>
          <span className="rounded-md border border-border px-3 py-1.5 text-xs">
            No
          </span>
        </div>
      ) : field.type === "select" ? (
        <div className="h-9 rounded-lg border border-input bg-background px-3 text-sm leading-9 text-muted-foreground">
          {(field.options ?? [])[0] ?? "Elegir…"}
        </div>
      ) : field.type === "checklist" ? (
        <div className="space-y-1">
          {((field.options ?? []).length > 0
            ? field.options ?? []
            : ["Ítem…"]
          ).map((o, i) => (
            <div
              key={`${o}-${i}`}
              className="flex items-center gap-2 text-xs text-muted-foreground"
            >
              <span className="h-4 w-4 rounded border border-input" />
              {o}
            </div>
          ))}
        </div>
      ) : field.type === "photo" ? (
        <div className="grid h-16 w-full place-items-center rounded-lg border border-dashed border-input text-xs text-muted-foreground">
          Adjuntar foto
        </div>
      ) : field.type === "time" ? (
        <div className="h-9 rounded-lg border border-input bg-background px-3 text-sm leading-9 text-muted-foreground">
          --:--
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <div className="h-9 flex-1 rounded-lg border border-input bg-background px-3 text-sm leading-9 text-muted-foreground">
            {field.type === "temperature" || field.type === "number"
              ? "0"
              : "Texto…"}
          </div>
          {field.unit && (
            <span className="font-price text-xs text-muted-foreground">
              {field.unit}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
