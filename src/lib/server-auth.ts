import { getRequest } from "@tanstack/react-start/server";
import { randomUUID } from "node:crypto";
import { query, queryOne, execute } from "./db";

export interface AuthContext {
  userId: string;
  email: string;
  nombre: string;
}

const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";

function getAdminEmails(): Set<string> {
  const raw = process.env.ADMIN_EMAILS ?? "";
  return new Set(
    raw.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean),
  );
}

/**
 * Resuelve la identidad desde el request actual (X-Forwarded-Email → DEV_USER_EMAIL).
 * Crea o actualiza el usuario automáticamente en user_profiles.
 * Aplica el bootstrap de ADMIN_EMAILS en cada llamada (sin riesgo de auto-bloqueo).
 */
export async function getAuthContext(): Promise<AuthContext | null> {
  let req: Request | undefined;
  try { req = getRequest(); } catch { return null; }
  if (!req) return null;

  const email = resolveEmail(req);
  if (!email) return null;

  return upsertUser(email);
}

/** Lee la identidad del header de perímetro o del fallback de desarrollo local. */
export function resolveEmail(req: Request): string | null {
  const header = req.headers.get("x-forwarded-email");
  if (header?.trim()) return header.trim().toLowerCase();
  const env = process.env.DEV_USER_EMAIL;
  if (env?.trim()) return env.trim().toLowerCase();
  return null;
}

/**
 * Crea o actualiza el usuario en user_profiles y aplica roles de ADMIN_EMAILS.
 * Idempotente — se puede llamar en cada request sin efectos secundarios.
 */
export async function upsertUser(email: string): Promise<AuthContext> {
  const nombre = email.split("@")[0];
  const adminEmails = getAdminEmails();
  const isAdmin = adminEmails.has(email);

  // Upsert del perfil — preserva el nombre si ya fue personalizado
  const rows = await query<{ id: string; nombre: string }>(
    `INSERT INTO public.user_profiles (id, email, nombre, full_name, activo, is_active)
     VALUES ($1, $2, $3, $3, true, true)
     ON CONFLICT (email) DO UPDATE SET
       nombre    = CASE WHEN user_profiles.nombre = '' THEN EXCLUDED.nombre ELSE user_profiles.nombre END,
       full_name = CASE WHEN user_profiles.full_name = '' THEN EXCLUDED.full_name ELSE user_profiles.full_name END,
       activo    = true,
       is_active = true,
       updated_at = NOW()
     RETURNING id, nombre`,
    [randomUUID(), email, nombre],
  );
  const user = rows[0];

  // Bootstrap ADMIN_EMAILS — fuerza el rol admin en cada request (anti auto-bloqueo)
  if (isAdmin) {
    const adminRole = await queryOne<{ id: string }>(
      `SELECT id FROM public.roles WHERE nombre = 'admin' LIMIT 1`,
    );
    if (adminRole) {
      // Reemplaza cualquier rol existente por admin para garantizar el acceso
      await execute(
        `DELETE FROM public.user_roles WHERE user_id = $1`,
        [user.id],
      ).catch(() => {});
      await execute(
        `INSERT INTO public.user_roles (user_id, role_id, organization_id, assigned_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT DO NOTHING`,
        [user.id, adminRole.id, DEFAULT_ORG_ID],
      ).catch(() => {});
    }
  }

  // Garantiza membresía en la organización por defecto
  await execute(
    `INSERT INTO public.user_organizations (user_id, organization_id, activo)
     VALUES ($1, $2, true)
     ON CONFLICT (user_id, organization_id) DO UPDATE SET activo = true`,
    [user.id, DEFAULT_ORG_ID],
  ).catch(() => {});

  return { userId: user.id, email, nombre: user.nombre };
}
