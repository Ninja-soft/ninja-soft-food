import { cn } from "@/lib/utils/cn";

// Sistema tipográfico Ninja Food — port del POS.
//   - Texto y títulos: Inter (font-sans).
//   - Destacados (eyebrows, acentos): Nunito (font-display).
//   - Números/códigos (lotes, kg, fechas): <Money> (font-price tabular-nums).

export function Eyebrow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-border bg-muted/50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground",
        className,
      )}
    >
      <span
        className="h-1.5 w-1.5 rounded-full bg-brand-gradient shadow-foodGlow"
        aria-hidden
      />
      {children}
    </span>
  );
}

type AccentTone = "muted" | "gradient";

export function Accent({
  children,
  tone = "gradient",
  className,
}: {
  children: React.ReactNode;
  tone?: AccentTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "font-display",
        tone === "gradient"
          ? "bg-brand-gradient bg-clip-text text-transparent"
          : "text-primary",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Display({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h1
      className={cn(
        "font-sans text-3xl font-extrabold leading-[1.1] tracking-[-0.02em] md:text-5xl",
        className,
      )}
    >
      {children}
    </h1>
  );
}

export function Heading({
  as: Tag = "h2",
  children,
  className,
}: {
  as?: "h1" | "h2" | "h3";
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Tag
      className={cn(
        "font-sans text-xl font-bold tracking-[-0.01em] md:text-2xl",
        className,
      )}
    >
      {children}
    </Tag>
  );
}

/** Número/código con fuente mono tabular (kg, lotes, fechas, montos). */
export function Money({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("font-price tabular-nums", className)}>{children}</span>
  );
}
