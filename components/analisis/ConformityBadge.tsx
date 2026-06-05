import { cn } from "@/lib/utils/cn";
import { conformityCategory } from "@/modules/quality/schemas";

// Clases completas por token (Tailwind necesita los nombres literales para el
// purge; nada de concatenación dinámica de tokens).
const TOKEN_CLASSES: Record<string, string> = {
  primary: "bg-primary/15 text-primary",
  accent: "bg-accent/15 text-accent",
  destructive: "bg-destructive/15 text-destructive",
};

// Badge de conformidad: valor 0-100 + etiqueta de categoría con color del token.
export function ConformityBadge({
  value,
  showValue = true,
  className,
}: {
  value: number;
  showValue?: boolean;
  className?: string;
}) {
  const cat = conformityCategory(value);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold",
        TOKEN_CLASSES[cat.token],
        className
      )}
    >
      {showValue && <span className="font-price tabular-nums">{value}</span>}
      {cat.label}
    </span>
  );
}
