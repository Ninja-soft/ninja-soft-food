"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ShieldPlus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Eyebrow, Display } from "@/components/ui/Typography";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { SpinnerBlock } from "@/components/ui/Spinner";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import {
  useStaff,
  useSetStaff,
  type StaffMemberDTO,
} from "@/modules/internal-ops/hooks";

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export default function InternalStaffPage() {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [revoke, setRevoke] = useState<StaffMemberDTO | null>(null);
  const { data: staff, isLoading } = useStaff();
  const setStaff = useSetStaff();

  const { data: meId } = useQuery({
    queryKey: ["internal", "my-id"],
    queryFn: async () => {
      const {
        data: { user },
      } = await createClient().auth.getUser();
      return user?.id ?? null;
    },
  });

  function onAdd(e: React.FormEvent) {
    e.preventDefault();
    const value = email.trim().toLowerCase();
    if (!value) return;
    setStaff.mutate(
      { email: value, isInternal: true },
      {
        onSuccess: () => {
          toast({ title: "Staff agregado", variant: "success" });
          setEmail("");
        },
        onError: (err) =>
          toast({
            title: "No se pudo agregar",
            description: err instanceof Error ? err.message : undefined,
            variant: "error",
          }),
      },
    );
  }

  function onRevoke(s: StaffMemberDTO) {
    setStaff.mutate(
      { userId: s.id, isInternal: false },
      {
        onSuccess: () => {
          toast({ title: "Staff dado de baja", variant: "success" });
          setRevoke(null);
        },
        onError: (err) =>
          toast({
            title: "No se pudo dar de baja",
            description: err instanceof Error ? err.message : undefined,
            variant: "error",
          }),
      },
    );
  }

  return (
    <>
      <Eyebrow>Operaciones</Eyebrow>
      <Display className="mt-3 text-3xl md:text-4xl">Staff Ninja-Soft</Display>
      <p className="mt-2 text-muted-foreground">
        Quién puede operar el panel interno. El acceso es un permiso único de
        staff; alta y baja quedan auditadas. No podés quitarte el acceso a vos
        mismo.
      </p>

      <Card className="mt-6">
        <CardContent className="p-5">
          <div className="font-semibold text-foreground">Agregar staff</div>
          <form
            className="mt-3 flex flex-wrap items-end gap-3"
            onSubmit={onAdd}
          >
            <div className="min-w-[240px] flex-1">
              <Input
                label="Email (cuenta existente)"
                type="email"
                required
                placeholder="persona@ninja-soft.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={setStaff.isPending}>
              <ShieldPlus size={16} /> Dar acceso
            </Button>
          </form>
          <p className="mt-2 text-xs text-muted-foreground">
            La persona ya debe tener una cuenta en Ninja Food (haberse
            registrado).
          </p>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-muted text-left text-xs uppercase tracking-[0.14em] text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Persona</th>
                <th className="px-4 py-3">Alta</th>
                <th className="px-4 py-3">Último acceso</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-foreground">
              {isLoading && (
                <tr>
                  <td colSpan={4} className="px-4 py-10">
                    <SpinnerBlock />
                  </td>
                </tr>
              )}
              {!isLoading && (staff?.length ?? 0) === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-10 text-center text-muted-foreground"
                  >
                    Sin staff.
                  </td>
                </tr>
              )}
              {staff?.map((s) => {
                const isSelf = s.id === meId;
                return (
                  <tr key={s.id} className="transition hover:bg-muted/40">
                    <td className="px-4 py-3">
                      <div className="font-medium">
                        {s.fullName || s.email}
                        {isSelf && (
                          <span className="ml-2 rounded-full bg-primary/12 px-2 py-0.5 text-[11px] font-semibold text-primary">
                            Vos
                          </span>
                        )}
                      </div>
                      {s.fullName && (
                        <div className="text-xs text-muted-foreground">
                          {s.email}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {fmtDateTime(s.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {fmtDateTime(s.lastSignInAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!isSelf && (
                        <button
                          onClick={() => setRevoke(s)}
                          className="rounded-md p-1.5 text-muted-foreground transition hover:bg-red-400/15 hover:text-red-300"
                          title="Quitar del staff"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={revoke !== null}
        onOpenChange={(o) => !o && setRevoke(null)}
        title="Quitar del staff"
        description={`${revoke?.email} va a perder el acceso al panel interno. La acción queda registrada en auditoría.`}
        confirmLabel="Quitar acceso"
        danger
        loading={setStaff.isPending}
        onConfirm={() => revoke && onRevoke(revoke)}
      />
    </>
  );
}
