import { cn } from "@/lib/utils/cn";

// Badge de estado de tenant/suscripción — usado en todo el panel staff.
// Tokens only: colores semánticos del design system.

const STATUS_LABELS: Record<string, string> = {
  trial: "Prueba",
  active: "Activo",
  past_due: "Pago pendiente",
  suspended: "Suspendido",
  cancelled: "Cancelado",
};

const STATUS_STYLES: Record<string, string> = {
  trial: "border-yellow-400/30 bg-yellow-400/10 text-yellow-300",
  active: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  past_due: "border-orange-400/30 bg-orange-400/10 text-orange-300",
  suspended: "border-red-400/30 bg-red-400/10 text-red-300",
  cancelled: "border-border bg-muted text-muted-foreground",
};

export function StatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        STATUS_STYLES[status] ?? "border-border bg-muted text-muted-foreground",
        className,
      )}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

export const TENANT_STATUS_LABELS = STATUS_LABELS;
