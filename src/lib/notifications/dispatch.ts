import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase.server";

// ── Internal helpers ───────────────────────────────────────────────────────

async function insertNotifications(
  rows: Array<{ user_id: string; type: string; title: string; body: string; data?: Record<string, unknown> }>,
) {
  if (rows.length === 0) return;
  const { error } = await supabaseAdmin.from("notifications").insert(rows.map((r) => ({
    user_id: r.user_id,
    type:    r.type,
    title:   r.title,
    body:    r.body,
    data:    r.data ?? {},
  })));
  if (error) console.error("[dispatch] insert error:", error.message);
}

async function linkedUserId(employeeId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("user_profiles")
    .select("id")
    .eq("employee_id", employeeId)
    .maybeSingle();
  return data?.id ?? null;
}

// Obtiene user_ids de todos los usuarios con alguno de los roles indicados.
async function usersByRole(...roleNames: string[]): Promise<string[]> {
  const { data: roleRows } = await supabaseAdmin
    .from("roles")
    .select("id")
    .in("nombre", roleNames);
  const roleIds = (roleRows ?? []).map((r: any) => r.id);
  if (roleIds.length === 0) return [];

  const { data: userRoleRows } = await supabaseAdmin
    .from("user_roles")
    .select("user_id")
    .in("role_id", roleIds);
  return [...new Set((userRoleRows ?? []).map((r: any) => r.user_id as string))];
}

function fmtDate(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("es-CO", {
    weekday: "long", day: "numeric", month: "long",
  });
}

function fmtShort(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("es-CO", {
    day: "numeric", month: "short",
  });
}

// ── Turnos ─────────────────────────────────────────────────────────────────
// Destinatario: el empleado con turno asignado (si tiene usuario vinculado).

export const dispatchShiftEvent = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      event:      z.enum(["shift_created", "shift_updated", "shift_deleted"]),
      employeeId: z.string(),
      date:       z.string(),
      startHour:  z.number().optional(),
      endHour:    z.number().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const userId = await linkedUserId(data.employeeId);
    if (!userId) return;

    const dia = fmtDate(data.date);
    const horario =
      data.startHour !== undefined
        ? ` de ${String(data.startHour).padStart(2, "0")}:00 a ${String(data.endHour).padStart(2, "0")}:00`
        : "";

    const templates = {
      shift_created: { type: "info",    title: "Nuevo turno asignado", body: `Tienes un turno programado el ${dia}${horario}` },
      shift_updated: { type: "info",    title: "Turno actualizado",     body: `Tu turno del ${dia} fue modificado${horario}` },
      shift_deleted: { type: "warning", title: "Turno eliminado",       body: `Tu turno del ${dia} ha sido eliminado` },
    };

    const { type, title, body } = templates[data.event];
    await insertNotifications([{ user_id: userId, type, title, body, data: { event: data.event, date: data.date } }]);
  });

// ── Ausencias ──────────────────────────────────────────────────────────────
// absence_created → Admin + Supervisor (pendiente de aprobación).
// absence_approved / absence_rejected → el empleado solicitante.

export const dispatchAbsenceEvent = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      event:        z.enum(["absence_created", "absence_approved", "absence_rejected"]),
      employeeId:   z.string(),
      employeeName: z.string(),
      absenceType:  z.string(),
      startDate:    z.string(),
      endDate:      z.string(),
      reason:       z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const period =
      data.startDate === data.endDate
        ? fmtShort(data.startDate)
        : `${fmtShort(data.startDate)} – ${fmtShort(data.endDate)}`;

    if (data.event === "absence_created") {
      const managers = await usersByRole("admin", "supervisor");
      await insertNotifications(
        managers.map((uid) => ({
          user_id: uid,
          type:    "warning",
          title:   "Ausencia pendiente de aprobación",
          body:    `${data.employeeName} solicitó ${data.absenceType} (${period})`,
          data:    { event: data.event, employeeId: data.employeeId },
        })),
      );
      return;
    }

    const userId = await linkedUserId(data.employeeId);
    if (!userId) return;
    const approved = data.event === "absence_approved";
    await insertNotifications([{
      user_id: userId,
      type:    approved ? "success" : "error",
      title:   approved ? "Ausencia aprobada" : "Ausencia rechazada",
      body:    approved
        ? `Tu solicitud de ${data.absenceType} (${period}) fue aprobada`
        : `Tu solicitud de ${data.absenceType} (${period}) fue rechazada${data.reason ? `: ${data.reason}` : ""}`,
      data: { event: data.event },
    }]);
  });

// ── Empleados ──────────────────────────────────────────────────────────────
// employee_added / employee_reactivated → Admin.
// employee_deactivated → Admin + Supervisor.

export const dispatchEmployeeEvent = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      event:        z.enum(["employee_added", "employee_deactivated", "employee_reactivated"]),
      employeeName: z.string(),
    }),
  )
  .handler(async ({ data }) => {
    const roles =
      data.event === "employee_deactivated" ? ["admin", "supervisor"] : ["admin"];
    const managers = await usersByRole(...roles);

    const templates = {
      employee_added:       { type: "success", title: "Nuevo empleado registrado", body: `${data.employeeName} ha sido añadido al sistema` },
      employee_deactivated: { type: "warning", title: "Empleado desactivado",      body: `${data.employeeName} ha sido desactivado del sistema` },
      employee_reactivated: { type: "success", title: "Empleado reactivado",       body: `${data.employeeName} ha sido reactivado en el sistema` },
    };

    const { type, title, body } = templates[data.event];
    await insertNotifications(managers.map((uid) => ({ user_id: uid, type, title, body, data: { event: data.event } })));
  });

// ── Aprobaciones de novedades (reportes) ──────────────────────────────────
// Destinatario: el empleado cuya novedad fue aprobada o rechazada.

export const dispatchApprovalEvent = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      event:        z.enum(["approval_approved", "approval_rejected"]),
      employeeId:   z.string(),
      novedadType:  z.string(),
      fecha:        z.string(),
    }),
  )
  .handler(async ({ data }) => {
    const userId = await linkedUserId(data.employeeId);
    if (!userId) return;
    const approved = data.event === "approval_approved";
    const dia = fmtShort(data.fecha);
    await insertNotifications([{
      user_id: userId,
      type:    approved ? "success" : "error",
      title:   approved ? "Novedad aprobada" : "Novedad rechazada",
      body:    `Tu novedad de ${data.novedadType} del ${dia} fue ${approved ? "aprobada" : "rechazada"}`,
      data:    { event: data.event, fecha: data.fecha },
    }]);
  });
