import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabase } from "../supabase";
import { supabaseAdmin } from "../supabase.server";

// Types
export type NotificationType = "info" | "success" | "warning" | "error";

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  read: boolean;
  data: Record<string, any>;
  created_at: string;
}

// Schemas
const notificationSchema = z.object({
  user_id: z.string(),
  type: z.enum(["info", "success", "warning", "error"]),
  title: z.string(),
  body: z.string(),
  data: z.record(z.any()).optional(),
});

const markAsReadSchema = z.object({
  notification_id: z.string(),
});

const markAllAsReadSchema = z.object({
  user_id: z.string(),
});

// Get notifications for a user
export const getNotifications = createServerFn({ method: "GET" })
  .inputValidator(z.object({ user_id: z.string() }))
  .handler(async ({ data }) => {
    const { data: notifications, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", data.user_id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw error;
    return notifications as Notification[];
  });

// Get unread notifications count
export const getUnreadCount = createServerFn({ method: "GET" })
  .inputValidator(z.object({ user_id: z.string() }))
  .handler(async ({ data }) => {
    const { count, error } = await supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", data.user_id)
      .eq("read", false);

    if (error) throw error;
    return count || 0;
  });

// Create a notification (server-side)
export const createNotification = createServerFn({ method: "POST" })
  .inputValidator(notificationSchema)
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin
      .from("notifications")
      .insert({
        ...data,
        data: data.data || {},
      });

    if (error) throw error;
    return { success: true };
  });

// Mark notification as read
export const markAsRead = createServerFn({ method: "POST" })
  .inputValidator(markAsReadSchema)
  .handler(async ({ data }) => {
    const { error } = await supabase
      .from("notifications")
      .update({ read: true })
      .eq("id", data.notification_id);

    if (error) throw error;
    return { success: true };
  });

// Mark all notifications as read for a user
export const markAllAsRead = createServerFn({ method: "POST" })
  .inputValidator(markAllAsReadSchema)
  .handler(async ({ data }) => {
    const { error } = await supabase
      .from("notifications")
      .update({ read: true })
      .eq("user_id", data.user_id)
      .eq("read", false);

    if (error) throw error;
    return { success: true };
  });

// Delete a notification
export const deleteNotification = createServerFn({ method: "POST" })
  .inputValidator(z.object({ notification_id: z.string() }))
  .handler(async ({ data }) => {
    const { error } = await supabase
      .from("notifications")
      .delete()
      .eq("id", data.notification_id);

    if (error) throw error;
    return { success: true };
  });

// Helper function to create notifications from server-side code
export async function notifyUser(params: {
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, any>;
}) {
  const { error } = await supabaseAdmin.from("notifications").insert({
    user_id: params.user_id,
    type: params.type,
    title: params.title,
    body: params.body,
    data: params.data || {},
  });

  if (error) {
    console.error("Error creating notification:", error);
    throw error;
  }

  return true;
}
