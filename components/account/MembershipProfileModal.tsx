"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/Toast";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Avatar } from "@/components/ui/Avatar";
import { resizeToWebp } from "@/lib/utils/image";

// Perfil del usuario en Food = su membresía (tenant_users.display_name/avatar),
// patrón calcado del POS. La foto va al bucket público `members`, carpeta del
// tenant (regla storage 0003: primer folder = tenant_id).
export function MembershipProfileModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const supabase = createClient();
  const qc = useQueryClient();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      setTenantId(
        ((user.app_metadata as { tenant_id?: string } | null)?.tenant_id) ??
          null,
      );
      const { data } = await supabase
        .from("tenant_users")
        .select("display_name, avatar")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();
      setName(data?.display_name ?? "");
      setAvatar(data?.avatar ?? null);
    })();
  }, [open, supabase]);

  async function onPhoto(file: File | undefined) {
    if (!file || !tenantId) return;
    setBusy(true);
    try {
      const webp = await resizeToWebp(file, 256, 0.85);
      const path = `${tenantId}/profile/${crypto.randomUUID()}.webp`;
      const up = await supabase.storage
        .from("members")
        .upload(path, webp, { contentType: "image/webp", upsert: false });
      if (up.error) throw up.error;
      const { data: pub } = supabase.storage.from("members").getPublicUrl(path);
      setAvatar(pub.publicUrl);
    } catch {
      toast({ title: "No se pudo subir la foto", variant: "error" });
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const save = useMutation({
    mutationFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Sin sesión");
      const { error } = await supabase
        .from("tenant_users")
        .update({ display_name: name.trim() || null, avatar })
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Perfil actualizado", variant: "success" });
      qc.invalidateQueries({ queryKey: ["my-membership-profile"] });
      onOpenChange(false);
    },
    onError: () => toast({ title: "No se pudo guardar", variant: "error" }),
  });

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Mi perfil">
      <div className="space-y-5">
        <div className="flex items-center gap-4">
          <Avatar name={name || "?"} avatar={avatar} size={56} />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {avatar ? "Cambiar foto" : "Subir foto"}
          </Button>
          {avatar && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive"
              onClick={() => setAvatar(null)}
            >
              Quitar
            </Button>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => onPhoto(e.target.files?.[0])}
          />
        </div>
        <Input
          label="Nombre"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <div className="flex justify-end">
          <Button onClick={() => save.mutate()} disabled={save.isPending || busy}>
            {save.isPending ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
