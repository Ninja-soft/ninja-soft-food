import {
  Apple,
  Beef,
  Carrot,
  ChefHat,
  Citrus,
  Croissant,
  Egg,
  Fish,
  Flame,
  Grape,
  Leaf,
  Milk,
  Salad,
  Snowflake,
  Sparkles,
  Star,
  Wheat,
  Wine,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";

// Avatares de operarios/usuarios: iconos (lucide) o iniciales con color
// determinístico. Port del POS con set de iconos y paleta food. Sin emojis.
export const AVATAR_ICONS: Record<string, LucideIcon> = {
  apple: Apple,
  beef: Beef,
  carrot: Carrot,
  chef: ChefHat,
  citrus: Citrus,
  croissant: Croissant,
  egg: Egg,
  fish: Fish,
  flame: Flame,
  grape: Grape,
  leaf: Leaf,
  milk: Milk,
  salad: Salad,
  snowflake: Snowflake,
  sparkles: Sparkles,
  star: Star,
  wheat: Wheat,
  wine: Wine,
};

export const AVATAR_PRESETS = Object.keys(AVATAR_ICONS);

// Paleta determinística en tonos alimentarios (verdes, lima, miel, berry, teal)
const COLORS = [
  "#15803d", "#16a34a", "#8cbf2f", "#9bb814", "#c9a227",
  "#8e2a48", "#c95d63", "#14b8a6", "#0ea5e9", "#7c4dff",
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0] ?? "";
  if (!first) return "?";
  if (parts.length === 1) return first.slice(0, 2).toUpperCase();
  const last = parts[parts.length - 1] ?? "";
  return ((first[0] ?? "") + (last[0] ?? "")).toUpperCase();
}

export function Avatar({
  name,
  avatar,
  size = 36,
  loading = false,
  className,
}: {
  name: string;
  avatar?: string | null;
  size?: number;
  loading?: boolean;
  className?: string;
}) {
  if (loading) {
    return (
      <span
        className={cn(
          "inline-grid shrink-0 place-items-center rounded-full bg-muted",
          className,
        )}
        style={{ width: size, height: size }}
        aria-label="Cargando"
      >
        <span
          className="animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary"
          style={{ width: size * 0.5, height: size * 0.5 }}
        />
      </span>
    );
  }
  const isUrl = !!avatar && /^https?:\/\//.test(avatar);
  const Icon = avatar && !isUrl ? AVATAR_ICONS[avatar] : undefined;
  const color = COLORS[hash(name || avatar || "?") % COLORS.length];

  if (isUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatar!}
        alt={name}
        className={cn("shrink-0 rounded-full object-cover", className)}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      className={cn(
        "inline-grid shrink-0 place-items-center rounded-full font-semibold text-white",
        className,
      )}
      style={{ width: size, height: size, fontSize: size * 0.4, background: color }}
      aria-hidden
    >
      {Icon ? <Icon size={Math.round(size * 0.5)} /> : initials(name)}
    </span>
  );
}
