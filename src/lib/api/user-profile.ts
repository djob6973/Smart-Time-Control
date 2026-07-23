import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { query, queryOne, execute } from "@/lib/db";
import type { RoleName, AccessLimits } from "@/lib/permissions";
import { DEFAULT_LIMITS, DEFAULT_LIMITS_BY_ROLE } from "@/lib/permissions";
import { requireAuth, requireAdmin } from "@/lib/server-auth";

// ── Tipos ──────────────────────────────────────────────────────────

export interface UserProfileRow {
  id: string;
  email: string;
  nombre: string;
  full_name: string;
  activo: boolean;
  is_active: boolean;
  role_id: string | null;
  area_id: string | null;
  employee_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface RoleRow {
  nombre: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  permisos: Record<string, any>;
}

export interface OrgRow {
  id: string;
  nombre: string;
  slug: string;
  activo: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config: Record<string, any>;
  logo_data?: string | null;
}

export interface UserDataResult {
  role: RoleName | null;
  rolePerms: Record<string, string[]> | null;
  limits: AccessLimits | null;
  organizations: OrgRow[];
}

// ── Consultas de datos del usuario (llamadas desde auth.tsx) ───────

export const getUserRolesAndOrgs = createServerFn({ method: "GET" })
  .inputValidator(z.object({ userId: z.string() }))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  .handler(async (): Promise<any> => {
    // El userId nunca se toma del cliente: se deriva de la sesión real para
    // evitar que un usuario consulte el rol/organización de otro (IDOR).
    const ctx = await requireAuth();
    const userId = ctx.userId;
    const [roleRows, orgRows] = await Promise.all([
      query(
        `SELECT r.nombre, r.permisos
         FROM public.user_roles ur
         JOIN public.roles r ON r.id = ur.role_id
         WHERE ur.user_id = $1
         ORDER BY ur.assigned_at DESC LIMIT 1`,
        [userId],
      ),
      query<OrgRow>(
        `SELECT o.id, o.nombre, o.slug, o.activo, o.config, o.logo_data
         FROM public.user_organizations uo
         JOIN public.organizations o ON o.id = uo.organization_id
         WHERE uo.user_id = $1 AND uo.activo = true`,
        [userId],
      ),
    ]);

    // Backfill: if user has no org membership yet (pre-fix registrations), use the default org
    let resolvedOrgRows = orgRows;
    if (orgRows.length === 0) {
      const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";
      const defaultOrg = await queryOne<OrgRow>(
        `SELECT id, nombre, slug, activo, config, logo_data FROM public.organizations WHERE id = $1`,
        [DEFAULT_ORG_ID],
      );
      if (defaultOrg) resolvedOrgRows = [defaultOrg];
    }

    const roleData = roleRows[0] ?? null;
    const role = (roleData?.nombre as RoleName) ?? null;
    const rawPerms = roleData?.permisos ?? null;

    const limitsFromDb = rawPerms?._limits as Partial<AccessLimits> | undefined;
    const limits: AccessLimits | null = role
      ? { ...(DEFAULT_LIMITS_BY_ROLE[role] ?? DEFAULT_LIMITS), ...(limitsFromDb ?? {}) }
      : null;

    const rolePerms: Record<string, string[]> | null = rawPerms
      ? (Object.fromEntries(
          Object.entries(rawPerms).filter(([k]) => k !== "_limits"),
        ) as Record<string, string[]>)
      : null;

    return { role, rolePerms, limits, organizations: resolvedOrgRows };
  });

export const getUserProfile = createServerFn({ method: "GET" })
  .inputValidator(z.object({ userId: z.string() }))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  .handler(async (): Promise<any> => {
    // Igual que arriba: siempre el propio perfil de la sesión, nunca el de un
    // userId arbitrario enviado por el cliente.
    const ctx = await requireAuth();
    return queryOne(
      `SELECT id, email, nombre, full_name, activo, is_active, area_id, employee_id
       FROM public.user_profiles
       WHERE id = $1`,
      [ctx.userId],
    );
  });

// ── Operaciones administrativas de datos de usuarios ─────────────

export const dbUpsertUserProfile = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      id: z.string(),
      email: z.string(),
      nombre: z.string().optional(),
      full_name: z.string().optional(),
      activo: z.boolean().optional(),
      is_active: z.boolean().optional(),
      role_id: z.string().nullable().optional(),
      area_id: z.string().nullable().optional(),
      employee_id: z.string().nullable().optional(),
    }),
  )
  .handler(async ({ data }) => {
    await requireAdmin();
    const nombre = data.nombre ?? data.full_name ?? "";
    const activo = data.activo ?? data.is_active ?? true;

    await execute(
      `INSERT INTO public.user_profiles (id, email, nombre, full_name, activo, is_active, role_id, area_id, employee_id)
       VALUES ($1, $2, $3, $3, $4, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET
         email        = EXCLUDED.email,
         nombre       = EXCLUDED.nombre,
         full_name    = EXCLUDED.full_name,
         activo       = EXCLUDED.activo,
         is_active    = EXCLUDED.is_active,
         role_id      = COALESCE(EXCLUDED.role_id, user_profiles.role_id),
         area_id      = EXCLUDED.area_id,
         employee_id  = EXCLUDED.employee_id,
         updated_at   = NOW()`,
      [
        data.id,
        data.email,
        nombre,
        activo,
        data.role_id ?? null,
        data.area_id ?? null,
        data.employee_id ?? null,
      ],
    );
    return { success: true };
  });

export const dbUpdateUserProfile = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      id: z.string(),
      nombre: z.string().optional(),
      full_name: z.string().optional(),
      activo: z.boolean().optional(),
      is_active: z.boolean().optional(),
      role_id: z.string().nullable().optional(),
      area_id: z.string().nullable().optional(),
      employee_id: z.string().nullable().optional(),
    }),
  )
  .handler(async ({ data }) => {
    await requireAdmin();
    const fields: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    const add = (col: string, val: unknown) => {
      fields.push(`${col} = $${idx++}`);
      params.push(val);
    };

    if (data.nombre !== undefined || data.full_name !== undefined) {
      const v = data.nombre ?? data.full_name ?? "";
      add("nombre", v);
      add("full_name", v);
    }
    if (data.activo !== undefined || data.is_active !== undefined) {
      const v = data.activo ?? data.is_active ?? true;
      add("activo", v);
      add("is_active", v);
    }
    if (data.role_id !== undefined) add("role_id", data.role_id);
    if (data.area_id !== undefined) add("area_id", data.area_id);
    if (data.employee_id !== undefined) add("employee_id", data.employee_id);

    if (fields.length === 0) return { success: true };

    fields.push(`updated_at = NOW()`);
    params.push(data.id);

    await execute(
      `UPDATE public.user_profiles SET ${fields.join(", ")} WHERE id = $${idx}`,
      params,
    );
    return { success: true };
  });

export const dbListUserProfiles = createServerFn({ method: "GET" })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  .handler(async (): Promise<any> => {
  await requireAdmin();
  return query(
    `SELECT up.*, a.name as area_name
     FROM public.user_profiles up
     LEFT JOIN public.areas a ON a.id = up.area_id
     ORDER BY up.created_at ASC`,
  );
});

export const dbAssignRole = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      userId: z.string(),
      roleNombre: z.string(),
      organizationId: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    await requireAdmin();
    const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";
    const orgId = data.organizationId ?? DEFAULT_ORG_ID;

    const roleRows = await query<{ id: string }>(
      `SELECT id FROM public.roles WHERE nombre = $1`,
      [data.roleNombre],
    );
    if (!roleRows[0]) throw new Error(`Rol no encontrado: ${data.roleNombre}`);
    const roleId = roleRows[0].id;

    // UPSERT atómico sobre UNIQUE(user_id) en vez de DELETE + INSERT: evita que
    // el usuario quede sin rol si el INSERT falla, o con dos roles si dos
    // cambios de rol se solapan.
    await execute(
      `INSERT INTO public.user_roles (user_id, role_id, organization_id, assigned_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         role_id = EXCLUDED.role_id,
         organization_id = EXCLUDED.organization_id,
         assigned_at = NOW()`,
      [data.userId, roleId, orgId],
    );
    return { success: true };
  });

export const dbEnsureUserInOrg = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({ userId: z.string(), organizationId: z.string().optional() }),
  )
  .handler(async ({ data }) => {
    await requireAdmin();
    const orgId = data.organizationId ?? "00000000-0000-0000-0000-000000000001";
    await execute(
      `INSERT INTO public.user_organizations (user_id, organization_id, activo)
       VALUES ($1, $2, true)
       ON CONFLICT (user_id, organization_id) DO UPDATE SET activo = true`,
      [data.userId, orgId],
    );
    return { success: true };
  });

export const dbListRoles = createServerFn({ method: "GET" })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  .handler(async (): Promise<any> => {
  await requireAdmin();
  return query(
    `SELECT id, nombre, descripcion, permisos FROM public.roles ORDER BY created_at ASC`,
  );
});

export const dbUpdateRole = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string(), permisos: z.record(z.unknown()) }))
  .handler(async ({ data }) => {
    await requireAdmin();
    await execute(
      `UPDATE public.roles SET permisos = $1 WHERE id = $2`,
      [JSON.stringify(data.permisos), data.id],
    );
    return { success: true };
  });

export const dbCreateRole = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({ nombre: z.string(), descripcion: z.string(), permisos: z.record(z.unknown()) }),
  )
  .handler(async ({ data }) => {
    await requireAdmin();
    const rows = await query<{ id: string }>(
      `INSERT INTO public.roles (nombre, descripcion, permisos) VALUES ($1, $2, $3) RETURNING id`,
      [data.nombre, data.descripcion, JSON.stringify(data.permisos)],
    );
    return { id: rows[0].id };
  });

export const dbDeleteRole = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    await requireAdmin();
    await execute(`DELETE FROM public.roles WHERE id = $1`, [data.id]);
    return { success: true };
  });

export const dbListOrgMembers = createServerFn({ method: "GET" })
  .inputValidator(z.object({ orgId: z.string() }))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  .handler(async ({ data }): Promise<any> => {
    await requireAdmin();
    return query(
      `SELECT uo.user_id as "userId", up.email, up.nombre, uo.creado_en as "joinedAt"
       FROM public.user_organizations uo
       JOIN public.user_profiles up ON up.id = uo.user_id
       WHERE uo.organization_id = $1 AND uo.activo = true`,
      [data.orgId],
    );
  });

export const dbAddOrgMember = createServerFn({ method: "POST" })
  .inputValidator(z.object({ orgId: z.string(), email: z.string() }))
  .handler(async ({ data }) => {
    await requireAdmin();
    const profile = await queryOne<{ id: string }>(
      `SELECT id FROM public.user_profiles WHERE email = $1`,
      [data.email.trim().toLowerCase()],
    );
    if (!profile) throw new Error("Usuario no encontrado. Debe registrarse primero.");

    await execute(
      `INSERT INTO public.user_organizations (user_id, organization_id, activo)
       VALUES ($1, $2, true)
       ON CONFLICT (user_id, organization_id) DO UPDATE SET activo = true`,
      [profile.id, data.orgId],
    );
    return { success: true };
  });

export const dbRemoveOrgMember = createServerFn({ method: "POST" })
  .inputValidator(z.object({ orgId: z.string(), userId: z.string() }))
  .handler(async ({ data }) => {
    await requireAdmin();
    await execute(
      `UPDATE public.user_organizations SET activo = false
       WHERE user_id = $1 AND organization_id = $2`,
      [data.userId, data.orgId],
    );
    return { success: true };
  });

// ── Auto-asignación del rol Gestor (usuario pendiente) ────────────────────────
// Permite a un usuario recién creado (sin rol) asignarse el rol "gestor" sin
// intervención de un administrador. Solo aplica si el usuario está en estado Pendiente.

export const selfAssignGestorRole = createServerFn({ method: "POST" })
  .inputValidator(z.object({ userId: z.string() }))
  .handler(async () => {
    // Autoservicio: solo puede auto-asignarse el rol quien hizo la llamada,
    // nunca el userId que el cliente envíe (evitaría asignar "gestor" a otro).
    const ctx = await requireAuth();
    const userId = ctx.userId;
    const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";

    // Verifica que el usuario realmente no tiene rol asignado aún
    const existing = await queryOne<{ role_id: string }>(
      `SELECT role_id FROM public.user_roles WHERE user_id = $1 LIMIT 1`,
      [userId],
    );
    if (existing) throw new Error("El usuario ya tiene un rol asignado.");

    const gestorRole = await queryOne<{ id: string }>(
      `SELECT id FROM public.roles WHERE nombre = 'gestor' LIMIT 1`,
    );
    if (!gestorRole) throw new Error("El rol 'gestor' no existe en el sistema.");

    await execute(
      `INSERT INTO public.user_roles (user_id, role_id, organization_id, assigned_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT DO NOTHING`,
      [userId, gestorRole.id, DEFAULT_ORG_ID],
    );

    return { success: true };
  });
