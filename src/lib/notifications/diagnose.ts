import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { query, queryOne, execute } from "@/lib/db";

export interface DiagStep {
  step: string;
  ok: boolean;
  detail: string;
}

export interface DiagResult {
  steps: DiagStep[];
  summary: "ok" | "warn" | "error";
}

export const runNotificationDiagnostic = createServerFn({ method: "POST" })
  .inputValidator(z.object({ employeeId: z.string().optional() }))
  .handler(async ({ data }): Promise<DiagResult> => {
    const steps: DiagStep[] = [];

    // ── 1. Acceso a BD ───────────────────────────────────────────
    try {
      await query(`SELECT id FROM public.notifications LIMIT 1`);
      steps.push({ step: "Acceso BD (pg pool)", ok: true, detail: "OK — conexión establecida" });
    } catch (e: any) {
      steps.push({ step: "Acceso BD (pg pool)", ok: false, detail: e.message });
      return { steps, summary: "error" };
    }

    // ── 2. Vínculo empleado → usuario ────────────────────────────
    let linkedUserId: string | null = null;
    let linkedUserName: string | null = null;

    if (data.employeeId) {
      const profile = await queryOne<{ id: string; nombre: string; employee_id: string }>(
        `SELECT id, nombre, employee_id FROM public.user_profiles WHERE employee_id = $1`,
        [data.employeeId],
      );

      if (!profile) {
        steps.push({
          step: "Vínculo empleado→usuario",
          ok: false,
          detail: `Ningún usuario tiene employee_id = "${data.employeeId}". Vincula el empleado desde módulo Empleados > columna Acceso.`,
        });
      } else {
        linkedUserId = profile.id;
        linkedUserName = profile.nombre;
        steps.push({
          step: "Vínculo empleado→usuario",
          ok: true,
          detail: `Empleado vinculado a "${profile.nombre}" (user_id: ${profile.id})`,
        });
      }
    } else {
      steps.push({ step: "Vínculo empleado→usuario", ok: true, detail: "Saltado — no se proporcionó employeeId" });
    }

    // ── 3. Insertar notificación de prueba ───────────────────────
    if (linkedUserId) {
      try {
        await execute(
          `INSERT INTO public.notifications (user_id, type, title, body, data)
           VALUES ($1, 'info', $2, $3, $4)`,
          [
            linkedUserId,
            "🧪 Test de notificación",
            `Prueba automática del sistema de notificaciones para ${linkedUserName ?? "usuario"}. Puedes eliminar este mensaje.`,
            JSON.stringify({ test: true, source: "diagnose" }),
          ],
        );
        steps.push({
          step: "Insertar notificación de prueba",
          ok: true,
          detail: `Notificación insertada para "${linkedUserName}". Abre la campana para verificar.`,
        });
      } catch (e: any) {
        steps.push({ step: "Insertar notificación de prueba", ok: false, detail: e.message });
      }
    } else {
      steps.push({ step: "Insertar notificación de prueba", ok: true, detail: "Saltado — sin usuario vinculado" });
    }

    // ── 4. Admins y supervisores configurados ────────────────────
    try {
      const roleRows = await query<{ id: string }>(
        `SELECT id FROM public.roles WHERE nombre IN ('admin', 'supervisor')`,
      );
      const roleIds = roleRows.map((r) => r.id);

      if (roleIds.length === 0) {
        steps.push({ step: "Usuarios admin/supervisor", ok: false, detail: "No se encontraron los roles admin/supervisor en la BD." });
      } else {
        const urRows = await query<{ user_id: string }>(
          `SELECT DISTINCT user_id FROM public.user_roles WHERE role_id = ANY($1)`,
          [roleIds],
        );
        const count = new Set(urRows.map((r) => r.user_id)).size;
        steps.push({
          step: "Usuarios admin/supervisor",
          ok: count > 0,
          detail: count > 0
            ? `${count} usuario(s) con rol admin o supervisor encontrados`
            : "No hay usuarios con rol admin o supervisor. Las notificaciones de ausencias no tendrán destinatario.",
        });
      }
    } catch (e: any) {
      steps.push({ step: "Usuarios admin/supervisor", ok: false, detail: e.message });
    }

    // ── 5. RLS — no aplica en Dokku PostgreSQL ───────────────────
    steps.push({
      step: "Políticas de acceso",
      ok: true,
      detail: "Sin RLS — acceso controlado a nivel de aplicación (pg pool)",
    });

    const hasError = steps.some((s) => !s.ok);
    return { steps, summary: hasError ? "error" : "ok" };
  });
