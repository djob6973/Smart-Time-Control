// Funciones de servidor para gestión de usuarios.
// Auth: manejo directo en PostgreSQL (password_hash, sessions)
// Datos: Dokku PostgreSQL via pg pool
//
// REQUIERE en .env:
//   DATABASE_URL → para todos los datos y autenticación

import { createServerFn } from "@tanstack/react-start";
import { query, queryOne, execute, withTransaction } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { requireAdmin } from "@/lib/server-auth";

const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";

// ── Tipos ──────────────────────────────────────────────────────────

export interface AppUser {
  id: string;
  email: string;
  fullName: string;
  roleId: string | null;
  areaId: string | null;
  areaName: string | null;
  isActive: boolean;
  createdAt: string;
  employeeId: string | null;
  lastSignIn: string | null;
}

export interface CreateUserInput {
  email: string;
  password: string;
  fullName: string;
  roleId: string;
  areaId?: string | null;
  employeeId?: string | null;
}

export interface UpdateUserInput {
  id: string;
  fullName?: string;
  roleId?: string;
  areaId?: string | null;
  isActive?: boolean;
  employeeId?: string | null;
}

// ── Listar todos los usuarios ──────────────────────────────────────

export const adminListUsers = createServerFn().handler(async () => {
  await requireAdmin();
  const [profileRows, sessionRows] = await Promise.all([
    query<{
      id: string;
      nombre: string;
      email: string;
      activo: boolean;
      area_id: string | null;
      role_id: string | null;
      employee_id: string | null;
      created_at: string;
      area_name: string | null;
    }>(
      `SELECT up.id, up.nombre, up.email, up.activo, up.area_id, up.role_id,
              up.employee_id, up.created_at, a.name as area_name
       FROM public.user_profiles up
       LEFT JOIN public.areas a ON a.id = up.area_id
       ORDER BY up.created_at ASC`,
    ),
    query<{ user_id: string; last_sign_in: string }>(
      `SELECT DISTINCT ON (user_id) user_id, created_at as last_sign_in
       FROM public.sessions
       ORDER BY user_id, created_at DESC`,
    ),
  ]);

  const lastSignInMap: Record<string, string | null> = {};
  for (const s of sessionRows) {
    lastSignInMap[s.user_id] = s.last_sign_in;
  }

  return profileRows.map(
    (r): AppUser => ({
      id: r.id,
      email: r.email,
      fullName: r.nombre,
      roleId: r.role_id ?? null,
      areaId: r.area_id,
      areaName: r.area_name,
      isActive: r.activo,
      createdAt: r.created_at,
      employeeId: r.employee_id ?? null,
      lastSignIn: lastSignInMap[r.id] ?? null,
    }),
  );
});

// ── Crear usuario ─────────────────────────────────────────────────

import { randomUUID } from "node:crypto";

export const adminCreateUser = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => data as CreateUserInput)
  .handler(async ({ data }: { data: CreateUserInput }) => {
    await requireAdmin();
    const email = typeof data?.email === "string" ? data.email.trim().toLowerCase() : undefined;
    const password = typeof data?.password === "string" ? data.password : undefined;

    if (!email) {
      throw new Error(`Email requerido. Handler recibió: ${JSON.stringify(data)}`);
    }

    const existing = await queryOne(`SELECT id FROM public.user_profiles WHERE email = $1`, [email]);
    if (existing) throw new Error(`El email ${email} ya está registrado`);

    const userId = randomUUID();
    const passwordHash = password ? hashPassword(password) : null;

    // Buscar UUID del rol por nombre
    const roleRows = await query<{ id: string }>(
      `SELECT id FROM public.roles WHERE nombre = $1`,
      [data.roleId],
    );
    if (!roleRows[0]) throw new Error(`Rol no encontrado: ${data.roleId}`);
    const roleUUID = roleRows[0].id;

    // Perfil + rol + membresía de organización deben crearse juntos: si alguno
    // falla a mitad de camino, un usuario huérfano (sin rol u organización)
    // queda inutilizable. Una sola transacción evita ese estado parcial.
    await withTransaction(async (tx) => {
      await tx.execute(
        `INSERT INTO public.user_profiles
           (id, email, nombre, full_name, activo, is_active, password_hash, role_id, area_id, employee_id)
         VALUES ($1, $2, $3, $3, true, true, $4, $5, $6, $7)`,
        [userId, email, data.fullName, passwordHash, roleUUID, data.areaId ?? null, data.employeeId ?? null],
      );

      await tx.execute(
        `INSERT INTO public.user_roles (user_id, role_id, organization_id, assigned_at)
         VALUES ($1, $2, $3, NOW()) ON CONFLICT (user_id) DO UPDATE SET
           role_id = EXCLUDED.role_id, organization_id = EXCLUDED.organization_id, assigned_at = NOW()`,
        [userId, roleUUID, DEFAULT_ORG_ID],
      );

      await tx.execute(
        `INSERT INTO public.user_organizations (user_id, organization_id, activo)
         VALUES ($1, $2, true) ON CONFLICT (user_id, organization_id) DO UPDATE SET activo = true`,
        [userId, DEFAULT_ORG_ID],
      );
    });

    return { id: userId, email };
  });

// ── Actualizar usuario ─────────────────────────────────────────────

export const adminUpdateUser = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => data as UpdateUserInput)
  .handler(async ({ data }: { data: UpdateUserInput }) => {
    await requireAdmin();
    const fields: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    const add = (col: string, val: unknown) => {
      fields.push(`${col} = $${idx++}`);
      params.push(val);
    };

    if (data.fullName   !== undefined) { add("nombre", data.fullName); add("full_name", data.fullName); }
    if (data.areaId     !== undefined) add("area_id", data.areaId);
    if (data.isActive   !== undefined) { add("activo", data.isActive); add("is_active", data.isActive); }
    if (data.roleId     !== undefined) add("role_id", data.roleId);
    if (data.employeeId !== undefined) add("employee_id", data.employeeId);

    if (fields.length > 0) {
      fields.push(`updated_at = NOW()`);
      params.push(data.id);
      await execute(
        `UPDATE public.user_profiles SET ${fields.join(", ")} WHERE id = $${idx}`,
        params,
      );
    }

    // Actualizar asignación de rol en user_roles — UPSERT atómico sobre
    // UNIQUE(user_id) en vez de DELETE + INSERT, para no dejar al usuario sin
    // rol si el INSERT falla, ni con dos roles si dos cambios se solapan.
    if (data.roleId !== undefined) {
      if (data.roleId) {
        const roleRows = await query<{ id: string }>(
          `SELECT id FROM public.roles WHERE nombre = $1`,
          [data.roleId],
        );
        if (!roleRows[0]) throw new Error(`Rol no encontrado: ${data.roleId}`);

        await execute(
          `INSERT INTO public.user_roles (user_id, role_id, organization_id, assigned_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (user_id) DO UPDATE SET
             role_id = EXCLUDED.role_id,
             organization_id = EXCLUDED.organization_id,
             assigned_at = NOW()`,
          [data.id, roleRows[0].id, DEFAULT_ORG_ID],
        );
      } else {
        await execute(`DELETE FROM public.user_roles WHERE user_id = $1`, [data.id]);
      }
    }

    return { success: true };
  });

export const adminDeleteUser = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => data as { id: string })
  .handler(async ({ data }) => {
    await requireAdmin();
    await execute(`DELETE FROM public.sessions WHERE user_id = $1`, [data.id]);
    await execute(`DELETE FROM public.user_roles WHERE user_id = $1`, [data.id]);
    await execute(`DELETE FROM public.user_organizations WHERE user_id = $1`, [data.id]);
    await execute(`DELETE FROM public.user_profiles WHERE id = $1`, [data.id]);
    return { success: true };
  });

// ── Roles ──────────────────────────────────────────────────────────

export interface DbRole {
  id: string;
  nombre: string;
  descripcion: string | null;
  permisos: Record<string, unknown>;
}

export interface UpdateRoleInput {
  id: string;
  permisos: Record<string, unknown>;
}

export interface CreateRoleInput {
  nombre: string;
  descripcion: string;
  permisos: Record<string, unknown>;
}

export const adminLoadRoles = createServerFn()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  .handler(async (): Promise<any> => {
    await requireAdmin();
    return query(
      `SELECT id, nombre, descripcion, permisos FROM public.roles ORDER BY created_at ASC`,
    );
  });

export const adminUpdateRole = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => data as UpdateRoleInput)
  .handler(async ({ data }) => {
    await requireAdmin();
    await execute(
      `UPDATE public.roles SET permisos = $1 WHERE id = $2`,
      [JSON.stringify(data.permisos), data.id],
    );
    return { success: true };
  });

export const adminCreateRole = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => data as CreateRoleInput)
  .handler(async ({ data }) => {
    await requireAdmin();
    const rows = await query<{ id: string }>(
      `INSERT INTO public.roles (nombre, descripcion, permisos) VALUES ($1, $2, $3) RETURNING id`,
      [data.nombre, data.descripcion, JSON.stringify(data.permisos)],
    );
    return { id: rows[0].id };
  });

export const adminDeleteRole = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => data as { id: string })
  .handler(async ({ data }) => {
    await requireAdmin();
    await execute(`DELETE FROM public.roles WHERE id = $1`, [data.id]);
    return { success: true };
  });

// ── Organizaciones ────────────────────────────────────────────────

export interface OrgMember {
  userId: string;
  email: string;
  fullName: string;
  joinedAt: string;
}

export interface UpdateOrgInput {
  id: string;
  nombre: string;
}

export interface CreateOrgInput {
  nombre: string;
  userId: string;
}

function toSlug(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .slice(0, 40);
}

export const adminListOrgMembers = createServerFn()
  .inputValidator((data: unknown) => data as { orgId: string })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  .handler(async ({ data }): Promise<any> => {
    await requireAdmin();
    return query(
      `SELECT uo.user_id as "userId", up.email, up.nombre as "fullName", uo.creado_en as "joinedAt"
       FROM public.user_organizations uo
       JOIN public.user_profiles up ON up.id = uo.user_id
       WHERE uo.organization_id = $1 AND uo.activo = true`,
      [data.orgId],
    );
  });

export const adminUpdateOrg = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => data as UpdateOrgInput)
  .handler(async ({ data }) => {
    await requireAdmin();
    await execute(
      `UPDATE public.organizations SET nombre = $1, actualizado_en = NOW() WHERE id = $2`,
      [data.nombre, data.id],
    );
    return { success: true };
  });

export const adminCreateOrg = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => data as CreateOrgInput)
  .handler(async ({ data }) => {
    await requireAdmin();
    const slug = toSlug(data.nombre) + "-" + Math.random().toString(36).slice(2, 8);

    const orgRows = await query<{ id: string }>(
      `INSERT INTO public.organizations (nombre, slug, activo)
       VALUES ($1, $2, true) RETURNING id`,
      [data.nombre, slug],
    );
    const orgId = orgRows[0].id;

    await execute(
      `INSERT INTO public.user_organizations (user_id, organization_id, activo)
       VALUES ($1, $2, true)`,
      [data.userId, orgId],
    );

    const adminRoleRows = await query<{ id: string }>(
      `SELECT id FROM public.roles WHERE nombre = 'admin'`,
    );
    if (adminRoleRows[0]) {
      await execute(
        `INSERT INTO public.user_roles (user_id, role_id, organization_id, assigned_at)
         VALUES ($1, $2, $3, NOW()) ON CONFLICT DO NOTHING`,
        [data.userId, adminRoleRows[0].id, orgId],
      );
    }

    return { id: orgId, slug };
  });

export const adminAddOrgMember = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => data as { orgId: string; email: string })
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

export const adminRemoveOrgMember = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => data as { orgId: string; userId: string })
  .handler(async ({ data }) => {
    await requireAdmin();
    await execute(
      `UPDATE public.user_organizations SET activo = false
       WHERE user_id = $1 AND organization_id = $2`,
      [data.userId, data.orgId],
    );
    return { success: true };
  });

// ── Restablecer contraseña (actualiza password_hash directamente) ──

export const adminResetPassword = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => data as { id: string; newPassword: string })
  .handler(async ({ data }: { data: { id: string; newPassword: string } }) => {
    await requireAdmin();
    if (!data.newPassword || data.newPassword.length < 8) {
      throw new Error("La contraseña debe tener al menos 8 caracteres");
    }
    const hash = hashPassword(data.newPassword);
    await execute(
      `UPDATE public.user_profiles
       SET password_hash = $1, reset_token = NULL, reset_token_expires_at = NULL
       WHERE id = $2`,
      [hash, data.id],
    );
    // Invalidate all existing sessions for this user
    await execute(`DELETE FROM public.sessions WHERE user_id = $1`, [data.id]);
    return { success: true };
  });
