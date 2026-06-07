"use client";

import { Building2, Check, ChevronDown, Factory } from "lucide-react";
import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownLabel,
  DropdownSeparator,
  DropdownTrigger,
} from "@/components/ui/Dropdown";
import { useActiveEstablishment } from "@/modules/establishments/hooks";
import { cn } from "@/lib/utils/cn";

// Selector de planta activa para el header del shell. Filtro de UI (doc 12 §2):
// "Todas las plantas" + cada establecimiento. Con un solo establecimiento NO se
// renderiza nada (cero fricción mono-planta). La selección persiste por tenant.
export function EstablishmentSwitcher({ className }: { className?: string }) {
  const { activeId, active, establishments, isMulti, setActive } =
    useActiveEstablishment();

  // Mono-planta (o aún sin cargar): no mostramos selector.
  if (!isMulti) return null;

  const label = active ? active.name : "Todas las plantas";

  return (
    <Dropdown>
      <DropdownTrigger asChild>
        <button
          className={cn(
            "flex h-9 max-w-[220px] items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm transition hover:bg-muted",
            activeId
              ? "text-foreground"
              : "text-muted-foreground hover:text-foreground",
            className,
          )}
          aria-label="Planta activa"
        >
          {activeId ? (
            <Factory size={15} className="shrink-0 text-primary" />
          ) : (
            <Building2 size={15} className="shrink-0" />
          )}
          <span className="truncate font-medium">{label}</span>
          <ChevronDown size={14} className="shrink-0 text-muted-foreground" />
        </button>
      </DropdownTrigger>
      <DropdownContent align="end" className="w-[240px]">
        <DropdownLabel>Planta activa</DropdownLabel>
        <DropdownItem onSelect={() => setActive(null)}>
          <Building2 size={15} className="shrink-0" />
          <span className="flex-1">Todas las plantas</span>
          {activeId === null && <Check size={15} className="text-primary" />}
        </DropdownItem>
        <DropdownSeparator />
        {establishments.map((e) => (
          <DropdownItem key={e.id} onSelect={() => setActive(e.id)}>
            <Factory size={15} className="shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1">
              <span className="block truncate">{e.name}</span>
              {e.locality && (
                <span className="block truncate text-xs text-muted-foreground">
                  {e.locality}
                </span>
              )}
            </span>
            {activeId === e.id && (
              <Check size={15} className="shrink-0 text-primary" />
            )}
          </DropdownItem>
        ))}
      </DropdownContent>
    </Dropdown>
  );
}
