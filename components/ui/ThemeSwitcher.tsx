"use client";

import { Palette } from "lucide-react";
import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownTrigger,
} from "@/components/ui/Dropdown";
import { THEMES, THEME_LABELS, useTheme } from "@/lib/theme/ThemeProvider";
import { cn } from "@/lib/utils/cn";

// Selector de tema (6 temas Food). Equivalente al ThemeToggle del POS,
// extendido a dropdown porque Food tiene más de 2 temas.
export function ThemeSwitcher({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();

  return (
    <Dropdown>
      <DropdownTrigger asChild>
        <button
          type="button"
          aria-label="Cambiar tema"
          className={cn(
            "inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-secondary text-secondary-foreground transition hover:bg-secondary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            className,
          )}
        >
          <Palette size={17} />
        </button>
      </DropdownTrigger>
      <DropdownContent>
        {THEMES.map((t) => (
          <DropdownItem
            key={t}
            onSelect={() => setTheme(t)}
            className={cn(t === theme && "bg-secondary/70 font-semibold")}
          >
            <span
              className="h-3 w-3 rounded-full border border-border"
              style={{ background: `var(--swatch-${t})` }}
              aria-hidden
            />
            {THEME_LABELS[t]}
          </DropdownItem>
        ))}
      </DropdownContent>
    </Dropdown>
  );
}
