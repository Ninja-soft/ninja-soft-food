"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Building2,
  ChevronDown,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  Moon,
  ScrollText,
  Settings,
  Shield,
  Store,
  Sun,
  Tag,
  Users,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils/cn";
import { DARK_THEMES, useTheme } from "@/lib/theme/ThemeProvider";
import { Isotype } from "@/components/brand/Logo";
import { Avatar } from "@/components/ui/Avatar";
import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownLabel,
  DropdownSeparator,
  DropdownTrigger,
} from "@/components/ui/Dropdown";

// Shell del panel staff Ninja-Soft — calcado del InternalShell del POS, con la
// marca/acento de Ninja Food. Sidebar propia (NO el AppShell del tenant) y badge
// "Interno" en verde marca para que nunca se confunda con la app del cliente.

const NAV = [
  { href: "/internal", label: "Inicio", icon: LayoutDashboard },
  { href: "/internal/tenants", label: "Negocios", icon: Building2 },
  { href: "/internal/usuarios", label: "Usuarios", icon: Users },
  { href: "/internal/planes", label: "Planes", icon: Tag },
  { href: "/internal/pagos", label: "Pagos", icon: CreditCard },
  { href: "/internal/emails", label: "Emails", icon: Mail },
  { href: "/internal/audit", label: "Auditoría", icon: ScrollText },
  { href: "/internal/staff", label: "Staff", icon: Shield },
  { href: "/internal/configuracion", label: "Configuración", icon: Settings },
];

const LEVEL_LABELS: Record<string, string> = {
  admin: "Admin",
  editor: "Editor",
  viewer: "Solo lectura",
};

export function InternalShell({
  email,
  name,
  level,
  children,
}: {
  email: string;
  name: string;
  level: string | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const [drawer, setDrawer] = useState(false);
  const isDark = DARK_THEMES.includes(theme);
  const displayName = name || email;

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const nav = (
    <nav className="flex h-full flex-col gap-1 p-3">
      <Link
        href="/internal"
        onClick={() => setDrawer(false)}
        className="mb-1 flex items-center gap-2.5 px-2 py-2"
      >
        <Isotype className="h-8" priority />
        <span className="flex flex-col leading-none">
          <span className="font-display text-sm font-extrabold tracking-tight text-foreground">
            Ninja-Soft
          </span>
          <span className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.22em] text-primary">
            Panel interno
          </span>
        </span>
      </Link>
      <div className="mb-2" />

      {NAV.map((it) => {
        const Icon = it.icon;
        const active =
          it.href === "/internal"
            ? pathname === "/internal"
            : pathname === it.href || pathname.startsWith(`${it.href}/`);
        return (
          <Link
            key={it.href}
            href={it.href}
            onClick={() => setDrawer(false)}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition",
              active
                ? "bg-primary/15 font-medium text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon size={17} />
            {it.label}
          </Link>
        );
      })}

      <div className="mt-auto space-y-3 pt-3">
        <Link
          href="/dashboard"
          onClick={() => setDrawer(false)}
          className="flex items-center gap-2.5 rounded-lg border border-border bg-card p-2 transition hover:border-primary/50 hover:bg-muted"
        >
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-muted text-primary">
            <Store size={16} />
          </span>
          <span className="text-sm font-medium text-foreground">
            Volver a la app
          </span>
        </Link>
        <Dropdown>
          <DropdownTrigger asChild>
            <button className="flex w-full items-center gap-2.5 rounded-lg border border-border bg-card p-2 text-left transition hover:bg-muted">
              <Avatar name={displayName} size={32} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">
                  {displayName}
                </span>
                {displayName !== email && (
                  <span className="block truncate text-xs text-muted-foreground">
                    {email}
                  </span>
                )}
                <span className="mt-0.5 block truncate text-[11px] font-medium text-primary">
                  {level ? LEVEL_LABELS[level] ?? level : "Staff"}
                </span>
              </span>
              <ChevronDown size={15} className="shrink-0 text-muted-foreground" />
            </button>
          </DropdownTrigger>
          <DropdownContent align="start" className="w-[232px]">
            <DropdownLabel>{email}</DropdownLabel>
            <DropdownItem
              onSelect={(e) => {
                e.preventDefault();
                toggleTheme();
              }}
            >
              {isDark ? <Sun size={15} /> : <Moon size={15} />}
              {isDark ? "Modo claro" : "Modo oscuro"}
            </DropdownItem>
            <DropdownSeparator />
            <DropdownItem onSelect={signOut} className="text-destructive">
              <LogOut size={15} /> Cerrar sesión
            </DropdownItem>
          </DropdownContent>
        </Dropdown>
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 border-r border-border bg-background/60 backdrop-blur-xl lg:block">
        {nav}
      </aside>

      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setDrawer(false)}
          />
          <aside className="absolute left-0 top-0 h-full w-64 border-r border-border bg-popover">
            <button
              onClick={() => setDrawer(false)}
              className="absolute right-3 top-3 text-muted-foreground"
              aria-label="Cerrar menú"
            >
              <X size={18} />
            </button>
            {nav}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-border bg-background/70 px-4 backdrop-blur-xl lg:hidden">
          <button onClick={() => setDrawer(true)} aria-label="Abrir menú">
            <Menu size={20} />
          </button>
          <Isotype className="h-6" />
          <span className="text-xs font-bold uppercase tracking-[0.18em] text-primary">
            Interno
          </span>
        </header>

        <main className="app-bg min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-6xl px-4 py-8 md:px-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
