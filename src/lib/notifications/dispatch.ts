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

// Obtiene user_ids de managers con los roles dados, filtrando por área.
// Un manager con area_id = null recibe todo; uno con area_id específico solo recibe
// notificaciones del área de ese evento. Si eventAreaId es null, todos reciben.
async function managersForArea(
  eventAreaId: string | null | undefined,
  ...roleNames: string[]
): Promise<string[]> {
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
  const userIds = [...new Set((userRoleRows ?? []).map((r: any) => r.user_id as string))];
  if (userIds.length === 0) return [];

  const { data: profiles } = await supabaseAdmin
    .from("user_profiles")
    .select("id, area_id")
    .in("id", userIds);

  return (profiles ?? [])
    .filter((p: any) =>
      p.area_id === null ||        // usuario con acceso a todas las áreas
      !eventAreaId ||              // evento sin área específica → notificar a todos
      p.area_id === eventAreaId    // área del usuario coincide con la del evento
    )
    .map((p: any) => p.id as string);
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
      areaId:       z.string().nullable().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const period =
      data.startDate === data.endDate
        ? fmtShort(data.startDate)
        : `${fmtShort(data.startDate)} – ${fmtShort(data.endDate)}`;

    if (data.event === "absence_created") {
      const managers = await managersForArea(data.areaId, "admin", "supervisor", "lider");
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
// Todos los eventos → Admin + Supervisor + Líder.

export const dispatchEmployeeEvent = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      event:        z.enum(["employee_added", "employee_deactivated", "employee_reactivated"]),
      employeeName: z.string(),
      areaId:       z.string().nullable().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const managers = await managersForArea(data.areaId, "admin", "supervisor", "lider");

    const templates = {
      employee_added:       { type: "success", title: "Nuevo empleado registrado", body: `${data.employeeName} ha sido añadido al sistema` },
      employee_deactivated: { type: "warning", title: "Empleado desactivado",      body: `${data.employeeName} ha sido desactivado del sistema` },
      employee_reactivated: { type: "success", title: "Empleado reactivado",       body: `${data.employeeName} ha sido reactivado en el sistema` },
    };

    const { type, title, body } = templates[data.event];
    await insertNotifications(managers.map((uid) => ({ user_id: uid, type, title, body, data: { event: data.event } })));
  });

// ── Jornada (movimientos) ─────────────────────────────────────────────────
// entrada / salidas / breaks / almuerzo → Admin + Supervisor + Líder.

export const dispatchJornadaEvent = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      tipo:         z.enum(["entrada", "salida_break", "regreso_break", "salida_almuerzo", "regreso_almuerzo", "salida"]),
      employeeName: z.string(),
      hora:         z.string(),
      areaName:     z.string().optional(),
      areaId:       z.string().nullable().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const managers = await managersForArea(data.areaId, "admin", "supervisor", "lider");
    if (managers.length === 0) return;

    const suffix = data.areaName ? ` · ${data.areaName}` : "";
    const templates: Record<string, { type: string; title: string; body: string }> = {
      entrada:          { type: "success", title: "Entrada registrada",    body: `${data.employeeName} registró entrada a las ${data.hora}${suffix}` },
      salida_break:     { type: "info",    title: "Salida a break",        body: `${data.employeeName} salió a break a las ${data.hora}${suffix}` },
      regreso_break:    { type: "info",    title: "Regreso de break",      body: `${data.employeeName} regresó de break a las ${data.hora}${suffix}` },
      salida_almuerzo:  { type: "info",    title: "Salida a almuerzo",     body: `${data.employeeName} salió a almuerzo a las ${data.hora}${suffix}` },
      regreso_almuerzo: { type: "info",    title: "Regreso de almuerzo",   body: `${data.employeeName} regresó de almuerzo a las ${data.hora}${suffix}` },
      salida:           { type: "success", title: "Salida registrada",     body: `${data.employeeName} registró salida a las ${data.hora}${suffix}` },
    };

    const { type, title, body } = templates[data.tipo];
    await insertNotifications(
      managers.map((uid) => ({ user_id: uid, type, title, body, data: { event: `jornada_${data.tipo}` } })),
    );
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
