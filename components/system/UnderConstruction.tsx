import { Hammer } from "lucide-react";
import { Eyebrow, Heading } from "@/components/ui/Typography";

// Placeholder de módulo en construcción (se reemplaza al implementar la fase).
export function UnderConstruction({
  title,
  phase,
  description,
}: {
  title: string;
  phase: string;
  description: string;
}) {
  return (
    <div className="space-y-6">
      <div>
        <Eyebrow>{phase}</Eyebrow>
        <Heading as="h1" className="mt-3">
          {title}
        </Heading>
      </div>
      <div className="glass-card flex flex-col items-center gap-3 py-16 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-lg bg-accent/15 text-accent">
          <Hammer size={26} />
        </span>
        <div className="max-w-md">
          <p className="font-semibold">En construcción</p>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
    </div>
  );
}
