import { Eyebrow, Display } from "@/components/ui/Typography";
import { PaymentEventsTable } from "@/components/internal/PaymentEventsTable";
import { listPaymentEvents } from "@/modules/internal/server";

export const dynamic = "force-dynamic";

// payment_events solo es legible con service_role: la página es server component
// y lee con el admin client (modules/internal/server). El guard del layout ya
// exigió staff; la tabla cliente solo recibe los datos ya resueltos.

export default async function InternalPagosPage() {
  const events = await listPaymentEvents(100);

  return (
    <>
      <Eyebrow>Cobros</Eyebrow>
      <Display className="mt-3 text-3xl md:text-4xl">Eventos de pago</Display>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        Webhooks recibidos de las pasarelas (Mercado Pago). Idempotentes por
        event id. Tocá una fila para ver el payload crudo.
      </p>

      <div className="mt-6">
        <PaymentEventsTable events={events} />
      </div>
    </>
  );
}
