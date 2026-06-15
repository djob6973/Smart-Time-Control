import { notifyUser } from "@/lib/api/notifications";
import type { NotificationType } from "@/lib/api/notifications";

// ── Notification Types for Events ─────────────────────────────────────

export type NotificationEvent =
  | "shift_created"
  | "shift_updated"
  | "shift_deleted"
  | "shift_locked"
  | "shift_unlocked"
  | "absence_created"
  | "absence_approved"
  | "absence_rejected"
  | "employee_added"
  | "employee_updated"
  | "employee_deactivated"
  | "employee_reactivated"
  | "overtime_warning"
  | "schedule_conflict"
  | "reminder_clock_in"
  | "reminder_clock_out";

// ── Notification Templates ──────────────────────────────────────────────

const notificationTemplates: Record<
  NotificationEvent,
  (data: any) => { type: NotificationType; title: string; body: string }
> = {
  shift_created: (data) => ({
    type: "info",
    title: "Nuevo turno asignado",
    body: `Se te ha asignado un turno para el ${data.date} de ${data.start_hour}:00 a ${data.end_hour}:00`,
  }),
  shift_updated: (data) => ({
    type: "info",
    title: "Turno actualizado",
    body: `Tu turno del ${data.date} ha sido actualizado`,
  }),
  shift_deleted: (data) => ({
    type: "warning",
    title: "Turno eliminado",
    body: `Tu turno del ${data.date} ha sido eliminado`,
  }),
  shift_locked: (data) => ({
    type: "info",
    title: "Turno bloqueado",
    body: `El turno del ${data.date} ha sido bloqueado para ediciones`,
  }),
  shift_unlocked: (data) => ({
    type: "info",
    title: "Turno desbloqueado",
    body: `El turno del ${data.date} ahora puede ser editado`,
  }),
  absence_created: (data) => ({
    type: "info",
    title: "Solicitud de ausencia creada",
    body: `Tu solicitud de ${data.type} del ${data.start_date} al ${data.end_date} ha sido creada`,
  }),
  absence_approved: (data) => ({
    type: "success",
    title: "Ausencia aprobada",
    body: `Tu solicitud de ${data.type} ha sido aprobada`,
  }),
  absence_rejected: (data) => ({
    type: "error",
    title: "Ausencia rechazada",
    body: `Tu solicitud de ${data.type} ha sido rechazada: ${data.reason}`,
  }),
  employee_added: (data) => ({
    type: "success",
    title: "Nuevo empleado",
    body: `${data.full_name} ha sido añadido al sistema`,
  }),
  employee_updated: (data) => ({
    type: "info",
    title: "Empleado actualizado",
    body: `Los datos de ${data.full_name} han sido actualizados`,
  }),
  employee_deactivated: (data) => ({
    type: "warning",
    title: "Empleado desactivado",
    body: `${data.full_name} ha sido desactivado del sistema`,
  }),
  employee_reactivated: (data) => ({
    type: "success",
    title: "Empleado reactivado",
    body: `${data.full_name} ha sido reactivado en el sistema`,
  }),
  overtime_warning: (data) => ({
    type: "warning",
    title: "Alerta de horas extra",
    body: `Has acumulado ${data.hours} horas extra esta semana. El límite es ${data.limit}h`,
  }),
  schedule_conflict: (data) => ({
    type: "error",
    title: "Conflicto de horario",
    body: `Hay un conflicto en tu horario para el ${data.date}`,
  }),
  reminder_clock_in: (data) => ({
    type: "info",
    title: "Recordatorio de fichada",
    body: `No olvides fichar tu entrada a las ${data.time}`,
  }),
  reminder_clock_out: (data) => ({
    type: "info",
    title: "Recordatorio de fichada",
    body: `No olvides fichar tu salida a las ${data.time}`,
  }),
};

// ── Main Notification Function ─────────────────────────────────────────

export async function sendAutoNotification(params: {
  user_id: string;
  event: NotificationEvent;
  data?: any;
}) {
  const template = notificationTemplates[params.event];
  if (!template) {
    console.error(`Unknown notification event: ${params.event}`);
    return null;
  }

  const { type, title, body } = template(params.data || {});

  return await notifyUser({
    user_id: params.user_id,
    type,
    title,
    body,
    data: {
      event: params.event,
    },
  });
}

// ── Convenience Functions for Common Events ──────────────────────────

export async function notifyShiftCreated(user_id: string, data: { date: string; start_hour: number; end_hour: number }) {
  return sendAutoNotification({ user_id, event: "shift_created", data });
}

export async function notifyShiftUpdated(user_id: string, data: { date: string }) {
  return sendAutoNotification({ user_id, event: "shift_updated", data });
}

export async function notifyAbsenceApproved(user_id: string, data: { type: string }) {
  return sendAutoNotification({ user_id, event: "absence_approved", data });
}

export async function notifyAbsenceRejected(user_id: string, data: { type: string; reason: string }) {
  return sendAutoNotification({ user_id, event: "absence_rejected", data });
}

export async function notifyOvertimeWarning(user_id: string, data: { hours: number; limit: number }) {
  return sendAutoNotification({ user_id, event: "overtime_warning", data });
}

export async function notifyScheduleConflict(user_id: string, data: { date: string }) {
  return sendAutoNotification({ user_id, event: "schedule_conflict", data });
}
