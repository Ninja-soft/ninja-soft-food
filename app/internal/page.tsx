import Link from "next/link";
import {
  AlertTriangle,
  Building2,
  CreditCard,
  Mail,
  ScrollText,
  TrendingUp,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/Card";
import { Eyebrow, Display } from "@/components/ui/Typography";
import { getOverviewStats } from "@/modules/internal/server";

export const dynamic = "force-dynamic";

export default async function InternalOverviewPage() {
  const stats = await getOverviewStats();
  const problems = stats.pastDue + stats.suspended;

  return (
    <>
      <Eyebrow>Panel interno</Eyebrow>
      <Display className="mt-3 text-3xl md:text-4xl">Ninja-Soft</Display>
      <p className="mt-2 text-muted-foreground">
        Operá el SaaS: negocios, suscripciones, pagos y comunicaciones.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard
          label="Total negocios"
          value={stats.totalTenants}
          icon={<Building2 size={18} />}
        />
        <KpiCard
          label="Activos"
          value={stats.active}
          icon={<TrendingUp size={18} />}
          color="text-emerald-400"
        />
        <KpiCard
          label="En prueba"
          value={stats.trial}
          icon={<TrendingUp size={18} />}
          color="text-yellow-400"
        />
        <KpiCard
          label="Con problemas"
          value={problems}
          icon={<AlertTriangle size={18} />}
          color={problems > 0 ? "text-orange-400" : undefined}
          sub={
            problems > 0
              ? `${stats.pastDue} pago pend. · ${stats.suspended} susp.`
              : undefined
          }
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard
          label="Cancelados"
          value={stats.cancelled}
          icon={<Building2 size={18} />}
        />
        <KpiCard
          label="Eventos de pago (24h)"
          value={stats.paymentEvents24h}
          icon={<CreditCard size={18} />}
          color="text-primary"
        />
        <KpiCard
          label="Emails fallidos"
          value={stats.failedEmails}
          icon={<Mail size={18} />}
          color={stats.failedEmails > 0 ? "text-red-400" : undefined}
        />
        <div className="hidden sm:block" />
      </div>

      {problems > 0 && (
        <div className="mt-4 flex items-start gap-3 rounded-ninjaMd border border-orange-400/30 bg-orange-400/5 p-4 text-sm text-orange-300">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <div>
            <span className="font-semibold">
              {problems} negocio{problems > 1 ? "s" : ""} con problemas de
              facturación.
            </span>{" "}
            {stats.pastDue > 0 && `${stats.pastDue} con pago pendiente. `}
            {stats.suspended > 0 &&
              `${stats.suspended} suspendido${stats.suspended > 1 ? "s" : ""}. `}
            <Link
              href="/internal/tenants"
              className="underline hover:text-orange-200"
            >
              Ver negocios
            </Link>
          </div>
        </div>
      )}

      <div className="mt-8 flex flex-wrap gap-2">
        {(
          [
            [
              "/internal/tenants",
              <Building2 key="b" size={15} />,
              `Negocios (${stats.totalTenants})`,
            ],
            ["/internal/pagos", <CreditCard key="p" size={15} />, "Pagos"],
            ["/internal/emails", <Mail key="m" size={15} />, "Emails"],
            ["/internal/audit", <ScrollText key="a" size={15} />, "Auditoría"],
          ] as const
        ).map(([href, icon, label]) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium transition hover:border-primary/50 hover:bg-muted"
          >
            {icon} {label}
          </Link>
        ))}
      </div>
    </>
  );
}

function KpiCard({
  label,
  value,
  icon,
  color,
  sub,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  color?: string;
  sub?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          {icon}
          <span className="text-xs">{label}</span>
        </div>
        <p
          className={`mt-1 font-price text-2xl font-black tabular-nums ${color ?? "text-foreground"}`}
        >
          {value}
        </p>
        {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}
