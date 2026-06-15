import * as React from "react";
import { toast } from "sonner";
import {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  type Notification,
  type NotificationType,
} from "@/lib/api/notifications.server";
import { useAuth } from "@/lib/auth";

export function useNotifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = React.useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = React.useState(0);
  const [isLoading, setIsLoading] = React.useState(false);

  // Fetch notifications
  const fetchNotifications = React.useCallback(async () => {
    if (!user?.id) {
      console.log("No user id available, skipping notification fetch");
      return;
    }
    
    setIsLoading(true);
    try {
      console.log("Fetching notifications for user:", user.id);
      const [data, count] = await Promise.all([
        getNotifications({ data: { user_id: user.id } }),
        getUnreadCount({ data: { user_id: user.id } }),
      ]);
      console.log("Notifications fetched:", data, count);
      setNotifications(data || []);
      setUnreadCount(count || 0);
    } catch (error: any) {
      console.error("Error fetching notifications:", error);
      console.error("Error details:", error.message, error.code, error.hint);
      // No mostrar toast para no molestar al usuario, solo log en consola
      setNotifications([]);
      setUnreadCount(0);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  // Mark notification as read
  const markNotificationAsRead = React.useCallback(async (notificationId: string) => {
    try {
      await markAsRead({ data: { notification_id: notificationId } });
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (error) {
      console.error("Error marking notification as read:", error);
      toast.error("Error al marcar notificación como leída");
    }
  }, []);

  // Mark all notifications as read
  const markAllNotificationsAsRead = React.useCallback(async () => {
    if (!user?.id) return;
    
    try {
      await markAllAsRead({ data: { user_id: user.id } });
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
      toast.success("Todas las notificaciones marcadas como leídas");
    } catch (error) {
      console.error("Error marking all notifications as read:", error);
      toast.error("Error al marcar todas las notificaciones");
    }
  }, [user?.id]);

  // Delete notification
  const removeNotification = React.useCallback(async (notificationId: string) => {
    try {
      await deleteNotification({ data: { notification_id: notificationId } });
      setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
      toast.success("Notificación eliminada");
    } catch (error) {
      console.error("Error deleting notification:", error);
      toast.error("Error al eliminar notificación");
    }
  }, []);

  // Show toast notification
  const showToast = React.useCallback(
    (type: NotificationType, title: string, message: string) => {
      switch (type) {
        case "success":
          toast.success(title, { description: message });
          break;
        case "error":
          toast.error(title, { description: message });
          break;
        case "warning":
          toast.warning(title, { description: message });
          break;
        default:
          toast.info(title, { description: message });
      }
    },
    []
  );

  // Fetch on mount y polling cada 60 s para capturar notificaciones insertadas desde el servidor.
  React.useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60_000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  return {
    notifications,
    unreadCount,
    isLoading,
    fetchNotifications,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    removeNotification,
    showToast,
  };
}
