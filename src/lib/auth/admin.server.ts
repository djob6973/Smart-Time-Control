// Funciones de servidor para gestión de usuarios.
// REQUIERE en .env: SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY

import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";

const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";

function getAdminClient() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Faltan variables de entorno: SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY",
    );
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ── Tipos ─────────────────────────────────────────────────────────

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
  const admin = getAdminClient();

  // Intentar con employee_id; si la columna aún no existe (migración pendiente),
  // reintentar sin ella para no bloquear la carga de usuarios.
  let profilesRes: { data: any[] | null; error: any } = await admin
    .from("user_profiles")
    .select(`id, nombre, email, activo, area_id, role_id, employee_id, created_at, areas(name)`)
    .order("created_at", { ascending: true });

  const missingColumn =
    profilesRes.error?.message?.includes("employee_id") ||
    profilesRes.error?.code === "42703";

  if (missingColumn) {
    profilesRes = await admin
      .from("user_profiles")
      .select(`id, nombre, email, activo, area_id, role_id, created_at, areas(name)`)
      .order("created_at", { ascending: true });
  }

  if (profilesRes.error) throw new Error(profilesRes.error.message);

  // Obtener last_sign_in_at desde auth.users via Admin API
  const { data: authData } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const lastSignInMap: Record<string, string | null> = {};
  for (const u of authData?.users ?? []) {
    lastSignInMap[u.id] = u.last_sign_in_at ?? null;
  }

  return (profilesRes.data ?? []).map(
    (r: any): AppUser => ({
      id: r.id,
      email: r.email,
      fullName: r.nombre,
      roleId: r.role_id ?? null,
      areaId: r.area_id,
      areaName: r.areas?.name ?? null,
      isActive: r.activo,
      createdAt: r.created_at,
      employeeId: r.employee_id ?? null,
      lastSignIn: lastSignInMap[r.id] ?? null,
    }),
  );
});

// ── Crear usuario ─────────────────────────────────────────────────

export const adminCreateUser = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => data as CreateUserInput)
  .handler(async ({ data }: { data: CreateUserInput }) => {
    const admin = getAdminClient();

    const email = typeof data?.email === "string" ? data.email.trim() : undefined;
    const password = typeof data?.password === "string" ? data.password : undefined;

    if (!email) {
      throw new Error(
        `Email requerido. Handler recibió: ${JSON.stringify(data)}`
      );
    }

    // 1. Crear en Supabase Auth
    const { data: authData, error: authError } =
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { nombre: data.fullName },
      });
    if (authError || !authData.user) {
      throw new Error(authError?.message ?? "Error al crear el usuario");
    }

    const userId = authData.user.id;

    // 2. Crear perfil en user_profiles (usar upsert por si el trigger ya lo creó)
    const profilePayload: Record<string, any> = {
      id: userId,
      email: email,
      nombre: data.fullName,
      full_name: data.fullName,
      area_id: data.areaId ?? null,
      activo: true,
      is_active: true,
      role_id: data.roleId,
    };
    if (data.employeeId !== undefined) profilePayload.employee_id = data.employeeId ?? null;

    let { error: profileError } = await admin
      .from("user_profiles")
      .upsert(profilePayload, { onConflict: "id", ignoreDuplicates: false });

    // Si falla por columna employee_id inexistente, reintentar sin ella
    if (profileError?.message?.includes("employee_id") || profileError?.code === "42703") {
      delete profilePayload.employee_id;
      ({ error: profileError } = await admin
        .from("user_profiles")
        .upsert(profilePayload, { onConflict: "id", ignoreDuplicates: false }));
    }

    if (profileError) {
      await admin.auth.admin.deleteUser(userId);
      throw new Error(profileError.message);
    }

    // 3. Obtener UUID del rol basado en el nombre
    const { data: roleData, error: roleLookupError } = await admin
      .from("roles")
      .select("id")
      .eq("nombre", data.roleId)
      .single();

    if (roleLookupError || !roleData) {
      await admin.auth.admin.deleteUser(userId);
      throw new Error(`Rol no encontrado: ${data.roleId}`);
    }

    // 4. Asignar rol en user_roles
    const { error: roleError } = await admin
      .from("user_roles")
      .insert({
        user_id: userId,
        role_id: roleData.id,
        organization_id: DEFAULT_ORG_ID,
        assigned_at: new Date().toISOString(),
      });

    if (roleError) {
      await admin.auth.admin.deleteUser(userId);
      throw new Error(roleError.message);
    }

    // 5. Vincular usuario a la organización en user_organizations
    await admin.from("user_organizations").upsert(
      { user_id: userId, organization_id: DEFAULT_ORG_ID, activo: true },
      { onConflict: "user_id,organization_id" },
    );

    return { id: userId, email };
  });

// ── Actualizar usuario ─────────────────────────────────────────────

export const adminUpdateUser = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => data as UpdateUserInput)
  .handler(async ({ data }: { data: UpdateUserInput }) => {
    const admin = getAdminClient();

    const patch: Record<string, any> = {};
    if (data.fullName   !== undefined) { patch.nombre = data.fullName; patch.full_name = data.fullName; }
    if (data.areaId     !== undefined) patch.area_id     = data.areaId;
    if (data.isActive   !== undefined) { patch.activo = data.isActive; patch.is_active = data.isActive; }
    if (data.roleId     !== undefined) patch.role_id     = data.roleId;
    if (data.employeeId !== undefined) patch.employee_id = data.employeeId;

    if (Object.keys(patch).length > 0) {
      let { error } = await admin
        .from("user_profiles")
        .update(patch)
        .eq("id", data.id);

      // Si falla por columna employee_id inexistente, reintentar sin ella
      if (error?.message?.includes("employee_id") || error?.code === "42703") {
        const safePatch = { ...patch };
        delete safePatch.employee_id;
        if (Object.keys(safePatch).length > 0) {
          ({ error } = await admin
            .from("user_profiles")
            .update(safePatch)
            .eq("id", data.id));
        } else {
          error = null;
        }
      }

      if (error) throw new Error(error.message);
    }

    // Handle role update separately in user_roles table
    if (data.roleId !== undefined) {
      // First, delete existing role assignment
      await admin
        .from("user_roles")
        .delete()
        .eq("user_id", data.id);

      // Then insert new role assignment
      if (data.roleId) {
        // Obtener UUID del rol basado en el nombre
        const { data: roleData, error: roleLookupError } = await admin
          .from("roles")
          .select("id")
          .eq("nombre", data.roleId)
          .single();

        if (roleLookupError || !roleData) {
          throw new Error(`Rol no encontrado: ${data.roleId}`);
        }

        const { error: roleError } = await admin
          .from("user_roles")
          .insert({
            user_id: data.id,
            role_id: roleData.id,
            organization_id: DEFAULT_ORG_ID,
            assigned_at: new Date().toISOString(),
          });

        if (roleError) throw new Error(roleError.message);
      }
    }

    return { success: true };
  });

// ── Roles ──────────────────────────────────────────────────────────

export interface DbRole {
  id: string;
  nombre: string;
  descripcion: string | null;
  permisos: Record<string, any>;
}

export interface UpdateRoleInput {
  id: string;
  permisos: Record<string, any>;
}

export interface CreateRoleInput {
  nombre: string;
  descripcion: string;
  permisos: Record<string, any>;
}

export const adminLoadRoles = createServerFn().handler(async () => {
  const admin = getAdminClient();
  const { data, error } = await admin
    .from("roles")
    .select("id, nombre, descripcion, permisos")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as DbRole[];
});

export const adminUpdateRole = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => data as UpdateRoleInput)
  .handler(async ({ data }) => {
    const admin = getAdminClient();
    const { error } = await admin
      .from("roles")
      .update({ permisos: data.permisos })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { success: true };
  });

export const adminCreateRole = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => data as CreateRoleInput)
  .handler(async ({ data }) => {
    const admin = getAdminClient();
    const { data: row, error } = await admin
      .from("roles")
      .insert({ nombre: data.nombre, descripcion: data.descripcion, permisos: data.permisos })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const adminDeleteRole = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => data as { id: string })
  .handler(async ({ data }) => {
    const admin = getAdminClient();
    const { error } = await admin.from("roles").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
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
  plan: string;
}

export interface CreateOrgInput {
  nombre: string;
  plan: string;
  userId: string;
}

function toSlug(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-").slice(0, 40);
}

export const adminListOrgMembers = createServerFn()
  .inputValidator((data: unknown) => data as { orgId: string })
  .handler(async ({ data }) => {
    const admin = getAdminClient();
    const { data: rows, error } = await admin
      .from("user_organizations")
      .select("user_id, creado_en")
      .eq("organization_id", data.orgId)
      .eq("activo", true);
    if (error) throw new Error(error.message);
    if (!rows?.length) return [] as OrgMember[];

    const ids = rows.map((r: any) => r.user_id);
    const { data: profiles, error: pe } = await admin
      .from("user_profiles")
      .select("id, email, nombre")
      .in("id", ids);
    if (pe) throw new Error(pe.message);

    const profileMap = Object.fromEntries((profiles ?? []).map((p: any) => [p.id, p]));
    return rows.map((r: any): OrgMember => ({
      userId: r.user_id,
      email: profileMap[r.user_id]?.email ?? "",
      fullName: profileMap[r.user_id]?.nombre ?? "",
      joinedAt: r.creado_en,
    }));
  });

export const adminUpdateOrg = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => data as UpdateOrgInput)
  .handler(async ({ data }) => {
    const admin = getAdminClient();
    const { error } = await admin
      .from("organizations")
      .update({ nombre: data.nombre, plan: data.plan })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { success: true };
  });

export const adminCreateOrg = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => data as CreateOrgInput)
  .handler(async ({ data }) => {
    const admin = getAdminClient();
    const slug = toSlug(data.nombre) + "-" + Date.now().toString(36);

    const { data: org, error } = await admin
      .from("organizations")
      .insert({ nombre: data.nombre, slug, plan: data.plan, activo: true })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await admin.from("user_organizations").insert({
      user_id: data.userId,
      organization_id: org.id,
      activo: true,
    });

    const { data: adminRole } = await admin
      .from("roles").select("id").eq("nombre", "admin").single();
    if (adminRole) {
      await admin.from("user_roles").insert({
        user_id: data.userId,
        role_id: adminRole.id,
        organization_id: org.id,
        assigned_at: new Date().toISOString(),
      });
    }

    return { id: org.id, slug };
  });

export const adminAddOrgMember = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => data as { orgId: string; email: string })
  .handler(async ({ data }) => {
    const admin = getAdminClient();
    const { data: profile, error: pe } = await admin
      .from("user_profiles")
      .select("id")
      .eq("email", data.email.trim().toLowerCase())
      .maybeSingle();
    if (pe) throw new Error(pe.message);
    if (!profile) throw new Error("Usuario no encontrado. Debe registrarse primero.");

    const { error } = await admin
      .from("user_organizations")
      .upsert(
        { user_id: profile.id, organization_id: data.orgId, activo: true },
        { onConflict: "user_id,organization_id" },
      );
    if (error) throw new Error(error.message);
    return { success: true };
  });

export const adminRemoveOrgMember = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => data as { orgId: string; userId: string })
  .handler(async ({ data }) => {
    const admin = getAdminClient();
    const { error } = await admin
      .from("user_organizations")
      .update({ activo: false })
      .eq("user_id", data.userId)
      .eq("organization_id", data.orgId);
    if (error) throw new Error(error.message);
    return { success: true };
  });

// ── Restablecer contraseña ─────────────────────────────────────────

export const adminResetPassword = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => data as { id: string; newPassword: string })
  .handler(async ({ data }: { data: { id: string; newPassword: string } }) => {
    const admin = getAdminClient();
    const { error } = await admin.auth.admin.updateUserById(data.id, {
      password: data.newPassword,
    });
    if (error) throw new Error(error.message);
    return { success: true };
  });
