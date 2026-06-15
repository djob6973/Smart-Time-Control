import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { query, execute } from "@/lib/db";

export type NotificationType = "info" | "success" | "warning" | "error";

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  read: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>;
  created_at: string;
}

const notificationSchema = z.object({
  user_id: z.string(),
  type: z.enum(["info", "success", "warning", "error"]),
  title: z.string(),
  body: z.string(),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: z.record(z.any()).optional(),
});

export const getNotifications = createServerFn({ method: "GET" })
  .inputValidator(z.object({ user_id: z.string() }))
  .handler(async ({ data }) => {
    return query<Notification>(
      `SELECT id, user_id, type, title, body, read, data, created_at
       FROM public.notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [data.user_id],
    );
  });

export const getUnreadCount = createServerFn({ method: "GET" })
  .inputValidator(z.object({ user_id: z.string() }))
  .handler(async ({ data }) => {
    const rows = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM public.notifications WHERE user_id = $1 AND read = false`,
      [data.user_id],
    );
    return parseInt(rows[0]?.count ?? "0", 10);
  });

export const createNotification = createServerFn({ method: "POST" })
  .inputValidator(notificationSchema)
  .handler(async ({ data }) => {
    await execute(
      `INSERT INTO public.notifications (user_id, type, title, body, data)
       VALUES ($1, $2, $3, $4, $5)`,
      [data.user_id, data.type, data.title, data.body, JSON.stringify(data.data ?? {})],
    );
    return { success: true };
  });

export const markAsRead = createServerFn({ method: "POST" })
  .inputValidator(z.object({ notification_id: z.string() }))
  .handler(async ({ data }) => {
    await execute(
      `UPDATE public.notifications SET read = true WHERE id = $1`,
      [data.notification_id],
    );
    return { success: true };
  });

export const markAllAsRead = createServerFn({ method: "POST" })
  .inputValidator(z.object({ user_id: z.string() }))
  .handler(async ({ data }) => {
    await execute(
      `UPDATE public.notifications SET read = true WHERE user_id = $1 AND read = false`,
      [data.user_id],
    );
    return { success: true };
  });

export const deleteNotification = createServerFn({ method: "POST" })
  .inputValidator(z.object({ notification_id: z.string() }))
  .handler(async ({ data }) => {
    await execute(
      `DELETE FROM public.notifications WHERE id = $1`,
      [data.notification_id],
    );
    return { success: true };
  });

export async function notifyUser(params: {
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}): Promise<boolean> {
  await execute(
    `INSERT INTO public.notifications (user_id, type, title, body, data)
     VALUES ($1, $2, $3, $4, $5)`,
    [params.user_id, params.type, params.title, params.body, JSON.stringify(params.data ?? {})],
  );
  return true;
}
