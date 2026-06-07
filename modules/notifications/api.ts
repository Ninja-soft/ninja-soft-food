import { createClient } from "@/lib/supabase/client";

// TODO tipos regenerados: las tablas notifications / notification_reads no están
// aún en types/database.ts (las regenera el controller con `pnpm db:types`).
// Hasta entonces tipamos a mano la fila y usamos `as` en las queries.
export interface NotificationRow {
  id: string;
  target_tenant_id: string | null;
  target_role: string | null;
  target_user_id: string | null;
  type: string;
  severity: string;
  title: string;
  body: string | null;
  action_label: string | null;
  action_url: string | null;
  requires_ack: boolean;
  expires_at: string | null;
  created_by: string | null;
  created_at: string;
  deleted_at: string | null;
}

export type NotificationSeverity =
  | "info"
  | "success"
  | "warning"
  | "critical"
  | "blocking";

export type NotificationType =
  | "news"
  | "plan"
  | "billing"
  | "usage"
  | "security"
  | "afip"
  | "maintenance"
  | "support";

/** Notificación con el estado de lectura propio del usuario resuelto. */
export type Notification = NotificationRow & {
  read: boolean;
  archived: boolean;
  acked: boolean;
};

type ReadState = {
  read_at: string | null;
  archived_at: string | null;
  acked_at: string | null;
};

async function currentUserId(): Promise<string> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No hay sesión activa");
  return user.id;
}

export const notificationsApi = {
  /**
   * Lista las notificaciones visibles para el usuario (la RLS las acota) junto
   * con su estado de lectura propio. notification_reads embebido devuelve 0..1
   * filas por RLS, así que mapeamos el primer elemento.
   */
  list: async (includeArchived = false): Promise<Notification[]> => {
    const supabase = createClient();
    const { data, error } = await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("notifications" as any)
      .select("*, notification_reads(read_at, archived_at, acked_at)")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;

    const rows = (data ?? []) as unknown as (NotificationRow & {
      notification_reads: ReadState[] | null;
    })[];

    const mapped: Notification[] = rows.map((n) => {
      const r = n.notification_reads?.[0];
      const { notification_reads: _ignored, ...rest } = n;
      return {
        ...rest,
        read: !!r?.read_at,
        archived: !!r?.archived_at,
        acked: !!r?.acked_at,
      };
    });

    return includeArchived ? mapped : mapped.filter((n) => !n.archived);
  },

  markRead: async (notificationId: string): Promise<void> => {
    const supabase = createClient();
    const user_id = await currentUserId();
    const { error } = await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("notification_reads" as any)
      .upsert(
        { notification_id: notificationId, user_id, read_at: new Date().toISOString() },
        { onConflict: "notification_id,user_id" },
      );
    if (error) throw error;
  },

  markAllRead: async (notificationIds: string[]): Promise<void> => {
    if (notificationIds.length === 0) return;
    const supabase = createClient();
    const user_id = await currentUserId();
    const now = new Date().toISOString();
    const { error } = await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("notification_reads" as any)
      .upsert(
        notificationIds.map((notification_id) => ({
          notification_id,
          user_id,
          read_at: now,
        })),
        { onConflict: "notification_id,user_id" },
      );
    if (error) throw error;
  },

  archive: async (notificationId: string): Promise<void> => {
    const supabase = createClient();
    const user_id = await currentUserId();
    const now = new Date().toISOString();
    const { error } = await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("notification_reads" as any)
      .upsert(
        { notification_id: notificationId, user_id, read_at: now, archived_at: now },
        { onConflict: "notification_id,user_id" },
      );
    if (error) throw error;
  },

  ack: async (notificationId: string): Promise<void> => {
    const supabase = createClient();
    const user_id = await currentUserId();
    const now = new Date().toISOString();
    const { error } = await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("notification_reads" as any)
      .upsert(
        { notification_id: notificationId, user_id, read_at: now, acked_at: now },
        { onConflict: "notification_id,user_id" },
      );
    if (error) throw error;
  },
};
