"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Apple,
  BarChart3,
  Beaker,
  ClipboardList,
  FileText,
  Home,
  LogOut,
  Menu,
  Package,
  QrCode,
  Settings,
  Soup,
  Truck,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownSeparator,
  DropdownTrigger,
} from "@/components/ui/Dropdown";
import { ThemeSwitcher } from "@/components/ui/ThemeSwitcher";
import { signOut } from "@/modules/auth/api";
import { cn } from "@/lib/utils/cn";

// Shell de la app del tenant: sidebar + topbar (patrón AppShell del POS).
const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/ingredientes", label: "Ingredientes", icon: Apple },
  { href: "/inventario", label: "Inventario", icon: Package },
  { href: "/recetas", label: "Recetas", icon: UtensilsCrossed },
  { href: "/produccion", label: "Producción", icon: Soup },
  { href: "/trazabilidad", label: "Trazabilidad", icon: QrCode },
  { href: "/despacho", label: "Despacho", icon: Truck },
  { href: "/informes", label: "Informes", icon: FileText },
  { href: "/analisis", label: "Análisis", icon: Beaker },
  { href: "/planillas", label: "Planillas", icon: ClipboardList },
  { href: "/reportes", label: "Reportes", icon: BarChart3 },
  { href: "/configuracion", label: "Configuración", icon: Settings },
] as const;

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
  const [mobileOpen, setMobileOpen] = useState(false);

  async function handleSignOut() {
    await signOut();
    router.replace("/login");
    router.refresh();
  }

  const nav = (
    <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
      {NAV.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setMobileOpen(false)}
            className={cn(
              "flex items-center gap-3 rounded-ninjaSm px-3 py-2.5 text-sm transition",
              active
                ? "bg-primary/15 font-semibold text-primary shadow-foodGlow"
                : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
            )}
          >
            <Icon size={17} className="shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  const sidebarHeader = (
    <div className="flex h-16 shrink-0 items-center gap-2 border-b border-border px-5">
      <Link href="/dashboard" className="flex items-center">
        <Image
          src="/img/ninja-food-dark-mode.webp"
          alt="Ninja Food"
          width={140}
          height={33}
          className="wordmark-on-dark h-auto w-32"
          priority
        />
        <Image
          src="/img/ninja-food-light-mode.webp"
          alt="Ninja Food"
          width={140}
          height={33}
          className="wordmark-on-light h-auto w-32"
          priority
        />
      </Link>
    </div>
  );

  return (
    <div className="flex min-h-dvh">
      {/* Sidebar desktop */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-border bg-card/60 backdrop-blur-xl lg:flex">
        {sidebarHeader}
        {nav}
      </aside>

      {/* Sidebar mobile (overlay) */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/55 backdrop-blur-[3px] animate-overlay-in"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute left-0 top-0 flex h-full w-64 flex-col border-r border-border bg-popover animate-slide-up">
            <div className="flex items-center justify-between border-b border-border pr-3">
              {sidebarHeader}
              <button
                type="button"
                aria-label="Cerrar menú"
                onClick={() => setMobileOpen(false)}
                className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X size={18} />
              </button>
            </div>
            {nav}
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-3 border-b border-border bg-background/70 px-4 backdrop-blur-xl md:px-6">
          <button
            type="button"
            aria-label="Abrir menú"
            onClick={() => setMobileOpen(true)}
            className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden"
          >
            <Menu size={20} />
          </button>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{tenantName}</p>
          </div>

          <ThemeSwitcher />

          <Dropdown>
            <DropdownTrigger asChild>
              <button
                type="button"
                aria-label="Cuenta"
                className="rounded-full ring-offset-background transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <Avatar name={userName} size={36} />
              </button>
            </DropdownTrigger>
            <DropdownContent>
              <div className="px-3 py-2">
                <p className="truncate text-sm font-semibold">{userName}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {userEmail}
                </p>
              </div>
              <DropdownSeparator />
              <DropdownItem onSelect={handleSignOut} className="text-destructive">
                <LogOut size={15} />
                Cerrar sesión
              </DropdownItem>
            </DropdownContent>
          </Dropdown>
        </header>

        <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
