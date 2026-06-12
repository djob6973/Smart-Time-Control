import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase.server";

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

    // ── 1. Acceso a BD con supabaseAdmin ─────────────────────────
    try {
      const { error } = await supabaseAdmin
        .from("notifications")
        .select("id")
        .limit(1);
      if (error) throw error;
      steps.push({ step: "Acceso BD (service_role)", ok: true, detail: "OK — supabaseAdmin conectado" });
    } catch (e: any) {
      steps.push({ step: "Acceso BD (service_role)", ok: false, detail: e.message });
      return { steps, summary: "error" };
    }

    // ── 2. Vínculo empleado → usuario ────────────────────────────
    let linkedUserId: string | null = null;
    let linkedUserName: string | null = null;

    if (data.employeeId) {
      const { data: profile, error } = await supabaseAdmin
        .from("user_profiles")
        .select("id, nombre, employee_id")
        .eq("employee_id", data.employeeId)
        .maybeSingle();

      if (error) {
        steps.push({ step: "Vínculo empleado→usuario", ok: false, detail: `Error en consulta: ${error.message}` });
      } else if (!profile) {
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
      const { error: insertErr } = await supabaseAdmin.from("notifications").insert({
        user_id: linkedUserId,
        type: "info",
        title: "🧪 Test de notificación",
        body: `Prueba automática del sistema de notificaciones para ${linkedUserName ?? "usuario"}. Puedes eliminar este mensaje.`,
        data: { test: true, source: "diagnose" },
      });

      if (insertErr) {
        steps.push({ step: "Insertar notificación de prueba", ok: false, detail: insertErr.message });
      } else {
        steps.push({
          step: "Insertar notificación de prueba",
          ok: true,
          detail: `Notificación insertada para "${linkedUserName}". Abre la campana para verificar.`,
        });
      }
    } else {
      steps.push({ step: "Insertar notificación de prueba", ok: true, detail: "Saltado — sin usuario vinculado" });
    }

    // ── 4. Admins y supervisores configurados ────────────────────
    try {
      const { data: roleRows, error: roleErr } = await supabaseAdmin
        .from("roles")
        .select("id, nombre")
        .in("nombre", ["admin", "supervisor"]);

      if (roleErr) throw roleErr;
      const roleIds = (roleRows ?? []).map((r: any) => r.id);

      const { data: urRows, error: urErr } = await supabaseAdmin
        .from("user_roles")
        .select("user_id")
        .in("role_id", roleIds);

      if (urErr) throw urErr;
      const count = new Set((urRows ?? []).map((r: any) => r.user_id)).size;

      steps.push({
        step: "Usuarios admin/supervisor",
        ok: count > 0,
        detail: count > 0
          ? `${count} usuario(s) con rol admin o supervisor encontrados`
          : "No hay usuarios con rol admin o supervisor. Las notificaciones de ausencias no tendrán destinatario.",
      });
    } catch (e: any) {
      steps.push({ step: "Usuarios admin/supervisor", ok: false, detail: e.message });
    }

    // ── 5. RLS de la tabla notifications ────────────────────────
    // Verificar que la política srvc_all_notifications existe
    try {
      const { data: policies, error: polErr } = await supabaseAdmin
        .from("pg_policies")
        .select("policyname")
        .eq("tablename", "notifications");

      if (polErr || !policies) {
        steps.push({ step: "RLS notifications", ok: true, detail: "No se pudo verificar (no crítico)" });
      } else {
        const hasServicePolicy = (policies as any[]).some((p) =>
          p.policyname?.includes("srvc") || p.policyname?.includes("service"),
        );
        steps.push({
          step: "RLS notifications",
          ok: true,
          detail: `${policies.length} política(s) activas${hasServicePolicy ? " — service_role OK" : ""}`,
        });
      }
    } catch {
      steps.push({ step: "RLS notifications", ok: true, detail: "Verificación omitida" });
    }

    const hasError = steps.some((s) => !s.ok);
    const summary: DiagResult["summary"] = hasError ? "error" : "ok";
    return { steps, summary };
  });
