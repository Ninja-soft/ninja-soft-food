import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { Eyebrow, Heading } from "@/components/ui/Typography";

// Dashboard placeholder — fase 1 lo completa con KPIs reales (docs/06).
const UPCOMING = [
  {
    title: "Producción",
    description: "Kilos producidos por período y receta, con gráfico interactivo.",
  },
  {
    title: "Compliance",
    description: "RNE de proveedores, RNPA por vencer y transporte habilitado.",
  },
  {
    title: "Stock",
    description: "Alertas de stock bajo y lotes próximos a vencer.",
  },
  {
    title: "Calidad",
    description: "Último informe bromatológico y conformidad de análisis.",
  },
];

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <Eyebrow>Fase 0 · fundaciones</Eyebrow>
        <Heading as="h1" className="mt-3">
          Dashboard
        </Heading>
        <p className="mt-1 text-sm text-muted-foreground">
          Tu cuenta y tu empresa quedaron creadas. Los módulos operativos se
          construyen en la fase 1 del roadmap.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {UPCOMING.map((item) => (
          <Card key={item.title}>
            <CardHeader>
              <CardTitle>{item.title}</CardTitle>
              <CardDescription>{item.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <span className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
                Próximamente
              </span>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
