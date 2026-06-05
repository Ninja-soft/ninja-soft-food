"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  Apple,
  BarChart3,
  Beaker,
  ChevronDown,
  ClipboardList,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Package,
  QrCode,
  Settings,
  ShieldCheck,
  Soup,
  Sun,
  Truck,
  UserCog,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils/cn";
import { DARK_THEMES, useTheme } from "@/lib/theme/ThemeProvider";
import { Isotype, WordmarkFood } from "@/components/brand/Logo";
import { Avatar } from "@/components/ui/Avatar";
import { MembershipProfileModal } from "@/components/account/MembershipProfileModal";
import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownLabel,
  DropdownSeparator,
  DropdownTrigger,
} from "@/components/ui/Dropdown";

// Shell de la app del tenant — espejo 1:1 del AppShell del POS:
// sidebar con grupos colapsables, menú de usuario al pie, card de panel interno.

type Item = { href: string; label: string; icon: React.ElementType };
type Group = { label: string; items: Item[] };

const ROLE_LABELS: Record<string, string> = {
  owner: "Dueño",
  manager: "Encargado",
  operator: "Operario",
  viewer: "Solo lectura",
};

const NAV: { top: Item[]; groups: Group[] } = {
  top: [{ href: "/dashboard", label: "Inicio", icon: LayoutDashboard }],
  groups: [
    {
      label: "Operación",
      items: [
        { href: "/inventario", label: "Inventario", icon: Package },
        { href: "/produccion", label: "Producción", icon: Soup },
        { href: "/trazabilidad", label: "Trazabilidad", icon: QrCode },
        { href: "/despacho", label: "Despacho", icon: Truck },
      ],
    },
    {
      label: "Catálogo",
      items: [
        { href: "/ingredientes", label: "Ingredientes", icon: Apple },
        { href: "/recetas", label: "Recetas", icon: UtensilsCrossed },
      ],
    },
    {
      label: "Calidad",
      items: [
        { href: "/informes", label: "Informes", icon: FileText },
        { href: "/analisis", label: "Análisis", icon: Beaker },
        { href: "/planillas", label: "Planillas", icon: ClipboardList },
      ],
    },
    {
      label: "Gestión",
      items: [
        { href: "/reportes", label: "Reportes", icon: BarChart3 },
        { href: "/configuracion", label: "Configuración", icon: Settings },
      ],
    },
  ],
};

function NavLink({
  item,
  active,
  onNavigate,
}: {
  item: Item;
  active: boolean;
  onNavigate: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition",
        active
          ? "bg-primary/15 font-medium text-primary"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <Icon size={17} />
      {item.label}
    </Link>
  );
}

function UserMenu({
  name,
  email,
  role,
  tenantName,
  onEditProfile,
  onSignOut,
}: {
  name: string;
  email: string;
  role: string | null;
  tenantName: string;
  onEditProfile: () => void;
  onSignOut: () => void;
}) {
  const { theme, toggleTheme } = useTheme();
  const isDark = DARK_THEMES.includes(theme);

  // Perfil de la membresía (display_name/avatar), patrón POS: lo que el
  // usuario edita en "Mi perfil" pisa el nombre que vino del server.
  const { data: me, isLoading: meLoading } = useQuery({
    queryKey: ["my-membership-profile"],
    queryFn: async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase
        .from("tenant_users")
        .select("display_name, avatar")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();
      return {
        display_name: data?.display_name ?? null,
        avatar: data?.avatar ?? null,
      };
    },
  });
  const displayName = me?.display_name || name;

  return (
    <Dropdown>
      <DropdownTrigger asChild>
        <button className="flex w-full items-center gap-2.5 rounded-lg border border-border bg-card p-2 text-left transition hover:bg-muted">
          <Avatar
            name={displayName}
            avatar={me?.avatar}
            size={32}
            loading={meLoading}
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-foreground">
              {displayName}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {tenantName}
            </span>
            {role && (
              <span className="mt-0.5 block truncate text-[11px] font-medium text-primary">
                {ROLE_LABELS[role] ?? role}
              </span>
            )}
          </span>
          <ChevronDown size={15} className="shrink-0 text-muted-foreground" />
        </button>
      </DropdownTrigger>
      <DropdownContent align="start" className="w-[232px]">
        <DropdownLabel>Cuenta</DropdownLabel>
        <div className="px-3 pb-1.5 text-xs text-muted-foreground">{email}</div>
        <DropdownItem onSelect={onEditProfile}>
          <UserCog size={15} /> Editar mi perfil
        </DropdownItem>
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
        <DropdownItem onSelect={onSignOut} className="text-destructive">
          <LogOut size={15} /> Cerrar sesión
        </DropdownItem>
      </DropdownContent>
    </Dropdown>
  );
}

export function AppShell({
  userName,
  userEmail,
  tenantName,
  children,
}: {
  userName: string;
  userEmail: string;
  tenantName: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [drawer, setDrawer] = useState(false);
  const [pfOpen, setPfOpen] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({
    Operación: true,
    Catálogo: true,
    Calidad: true,
    Gestión: true,
  });

  // Contexto: staff interno + rol en el tenant (gatea menú, patrón POS)
  const { data: shell } = useQuery({
    queryKey: ["shell-ctx"],
    queryFn: async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return { isInternal: false, role: null as string | null };
      const { data: me } = await supabase
        .from("users")
        .select("is_internal")
        .eq("id", user.id)
        .maybeSingle();
      const { data: mem } = await supabase
        .from("tenant_users")
        .select("role")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();
      return {
        isInternal: Boolean(me?.is_internal),
        role: (mem?.role as string | null) ?? null,
      };
    },
  });
  const isInternal = shell?.isInternal ?? false;

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const nav = (
    <nav className="flex h-full flex-col p-3">
      {/* Logo fijo arriba — fuera del área scrolleable */}
      <Link
        href="/dashboard"
        onClick={() => setDrawer(false)}
        className="mb-3 flex shrink-0 items-center gap-2.5 px-2 py-2"
      >
        <Isotype className="h-9" priority />
        <WordmarkFood className="h-7" priority />
      </Link>

      {/* Navegación scrolleable */}
      <div className="slim-scrollbar -mr-1 min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
        {NAV.top.map((it) => (
          <NavLink
            key={it.href}
            item={it}
            active={pathname === it.href}
            onNavigate={() => setDrawer(false)}
          />
        ))}

        {NAV.groups.map((g) => {
          const isOpen = open[g.label] ?? true;
          return (
            <div key={g.label} className="pt-3">
              <button
                onClick={() => setOpen((s) => ({ ...s, [g.label]: !isOpen }))}
                className="flex w-full items-center justify-between rounded-md px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground transition hover:text-foreground"
              >
                {g.label}
                <ChevronDown
                  size={14}
                  className={cn("transition", isOpen ? "" : "-rotate-90")}
                />
              </button>
              {isOpen && (
                <div className="mt-1 space-y-1">
                  {g.items.map((it) => (
                    <NavLink
                      key={it.href}
                      item={it}
                      active={
                        pathname === it.href ||
                        pathname.startsWith(`${it.href}/`)
                      }
                      onNavigate={() => setDrawer(false)}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Pie fijo: panel interno + usuario */}
      <div className="mt-3 shrink-0 space-y-3 border-t border-border pt-3">
        {isInternal && (
          <Link
            href="/internal"
            onClick={() => setDrawer(false)}
            className="group flex items-center gap-2.5 rounded-lg border border-border bg-card p-2 transition hover:border-primary/50 hover:bg-muted"
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-gradient text-brand-ink shadow-foodGlow">
              <ShieldCheck size={16} />
            </span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block text-sm font-semibold text-foreground">
                Panel NinjaSoft
              </span>
              <span className="block text-xs text-muted-foreground">
                Modo interno
              </span>
            </span>
          </Link>
        )}
        <UserMenu
          name={userName}
          email={userEmail}
          role={shell?.role ?? null}
          tenantName={tenantName}
          onEditProfile={() => setPfOpen(true)}
          onSignOut={signOut}
        />
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
        </header>

        <main className="app-bg slim-scrollbar min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
          {children}
        </main>
      </div>

      <MembershipProfileModal open={pfOpen} onOpenChange={setPfOpen} />
    </div>
  );
}
