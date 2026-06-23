import { randomUUID } from "node:crypto";
import { query, queryOne, execute } from "./db";
import { hashPassword, verifyPassword } from "./password";

const COOKIE_NAME = "smartpath_session";
const SESSION_DAYS = 30;
const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";

const IS_PROD = process.env.NODE_ENV === "production";
const SECURE = IS_PROD ? "; Secure" : "";

function sessionCookie(token: string): string {
  const maxAge = SESSION_DAYS * 24 * 60 * 60;
  return `${COOKIE_NAME}=${token}; HttpOnly; SameSite=Lax; Max-Age=${maxAge}; Path=/${SECURE}`;
}

function clearCookie(): string {
  return `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Max-Age=0; Path=/${SECURE}`;
}

function json(data: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}

async function parseBody(req: Request): Promise<Record<string, unknown>> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

function parseCookie(header: string, name: string): string | null {
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k?.trim() === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

async function createSession(userId: string): Promise<string> {
  const token = randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await execute(
    `INSERT INTO public.sessions (token, user_id, expires_at) VALUES ($1, $2, $3)`,
    [token, userId, expiresAt.toISOString()],
  );
  return token;
}

// POST /api/auth/login
async function handleLogin(req: Request): Promise<Response> {
  const { email, password } = await parseBody(req);
  if (typeof email !== "string" || typeof password !== "string") {
    return json({ error: "Email y contraseña requeridos" }, 400);
  }

  const user = await queryOne<{
    id: string; email: string; nombre: string;
    password_hash: string | null; activo: boolean;
  }>(
    `SELECT id, email, nombre, password_hash, activo FROM public.user_profiles WHERE email = $1`,
    [email.trim().toLowerCase()],
  );

  if (!user || !user.password_hash || !verifyPassword(password, user.password_hash)) {
    return json({ error: "Credenciales inválidas" }, 401);
  }
  if (!user.activo) {
    return json({ error: "Cuenta desactivada. Contacta al administrador." }, 403);
  }

  const token = await createSession(user.id);
  return json(
    { id: user.id, email: user.email, nombre: user.nombre },
    200,
    { "Set-Cookie": sessionCookie(token) },
  );
}

// POST /api/auth/register
async function handleRegister(req: Request): Promise<Response> {
  const { email, password, nombre } = await parseBody(req);
  if (typeof email !== "string" || typeof password !== "string" || typeof nombre !== "string") {
    return json({ error: "Email, contraseña y nombre requeridos" }, 400);
  }
  if (password.length < 8) {
    return json({ error: "La contraseña debe tener al menos 8 caracteres" }, 400);
  }

  const normalizedEmail = email.trim().toLowerCase();
  const existing = await queryOne(
    `SELECT id FROM public.user_profiles WHERE email = $1`,
    [normalizedEmail],
  );
  if (existing) return json({ error: "Email ya registrado" }, 409);

  // Only assign admin if no admin user exists yet in the system.
  // This prevents any new registration from getting admin when one already exists.
  const existingAdmin = await queryOne(
    `SELECT ur.user_id FROM public.user_roles ur
     JOIN public.roles r ON r.id = ur.role_id
     WHERE r.nombre = 'admin'
     LIMIT 1`,
  );
  const noAdminYet = !existingAdmin;

  const adminRoleRow = noAdminYet
    ? await queryOne<{ id: string }>(`SELECT id FROM public.roles WHERE nombre = 'admin'`)
    : null;

  const userId = randomUUID();
  const hash = hashPassword(password);

  await execute(
    `INSERT INTO public.user_profiles (id, email, nombre, full_name, activo, is_active, password_hash, role_id)
     VALUES ($1, $2, $3, $3, true, true, $4, $5)`,
    [userId, normalizedEmail, nombre.trim(), hash, adminRoleRow?.id ?? null],
  );

  if (noAdminYet && adminRoleRow) {
    await execute(
      `INSERT INTO public.user_roles (user_id, role_id, organization_id, assigned_at)
       VALUES ($1, $2, $3, NOW()) ON CONFLICT DO NOTHING`,
      [userId, adminRoleRow.id, DEFAULT_ORG_ID],
    ).catch((e) => console.error("[register] user_roles insert failed:", e.message));

    await execute(
      `INSERT INTO public.user_organizations (user_id, organization_id, activo)
       VALUES ($1, $2, true) ON CONFLICT DO NOTHING`,
      [userId, DEFAULT_ORG_ID],
    ).catch((e) => console.error("[register] user_organizations insert failed:", e.message));
  }

  const token = await createSession(userId);
  return json(
    { id: userId, email: normalizedEmail, nombre: nombre.trim() },
    201,
    { "Set-Cookie": sessionCookie(token) },
  );
}

// GET /api/auth/me
async function handleMe(req: Request): Promise<Response> {
  const cookieHeader = req.headers.get("Cookie") ?? "";
  const token = parseCookie(cookieHeader, COOKIE_NAME);
  if (!token) return json({ user: null });

  const session = await queryOne<{ user_id: string; email: string; nombre: string }>(
    `SELECT s.user_id, up.email, up.nombre
     FROM public.sessions s
     JOIN public.user_profiles up ON up.id::text = s.user_id
     WHERE s.token = $1 AND s.expires_at > NOW()`,
    [token],
  );
  if (!session) return json({ user: null });

  return json({ user: { id: session.user_id, email: session.email, nombre: session.nombre } });
}

// POST /api/auth/signout
async function handleSignout(req: Request): Promise<Response> {
  const cookieHeader = req.headers.get("Cookie") ?? "";
  const token = parseCookie(cookieHeader, COOKIE_NAME);
  if (token) {
    await execute(`DELETE FROM public.sessions WHERE token = $1`, [token]).catch(() => {});
  }
  return json({ ok: true }, 200, { "Set-Cookie": clearCookie() });
}

// POST /api/auth/reset-request
async function handleResetRequest(req: Request): Promise<Response> {
  const { email } = await parseBody(req);
  if (typeof email !== "string") return json({ error: "Email requerido" }, 400);

  const user = await queryOne<{ id: string }>(
    `SELECT id FROM public.user_profiles WHERE email = $1`,
    [email.trim().toLowerCase()],
  );
  // Always respond the same way to avoid email enumeration
  if (!user) {
    return json({ message: "Si el email existe, se generará un enlace de recuperación", resetUrl: null });
  }

  const token = randomUUID();
  const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
  await execute(
    `UPDATE public.user_profiles SET reset_token = $1, reset_token_expires_at = $2 WHERE id = $3`,
    [token, expires.toISOString(), user.id],
  );

  const resetUrl = IS_PROD ? null : `/auth/reset-password?token=${token}`;
  return json({ message: "Enlace de recuperación generado", resetUrl });
}

// POST /api/auth/reset-password (token-based, no session required)
async function handleResetPassword(req: Request): Promise<Response> {
  const { token, newPassword } = await parseBody(req);
  if (typeof token !== "string" || typeof newPassword !== "string") {
    return json({ error: "Token y contraseña requeridos" }, 400);
  }
  if (newPassword.length < 8) {
    return json({ error: "La contraseña debe tener al menos 8 caracteres" }, 400);
  }

  const user = await queryOne<{ id: string }>(
    `SELECT id FROM public.user_profiles
     WHERE reset_token = $1 AND reset_token_expires_at > NOW()`,
    [token],
  );
  if (!user) return json({ error: "El enlace ha expirado o es inválido. Solicita uno nuevo." }, 400);

  const hash = hashPassword(newPassword);
  await execute(
    `UPDATE public.user_profiles
     SET password_hash = $1, reset_token = NULL, reset_token_expires_at = NULL
     WHERE id = $2`,
    [hash, user.id],
  );

  return json({ ok: true });
}

// POST /api/auth/change-password (requires active session)
async function handleChangePassword(req: Request): Promise<Response> {
  const cookieHeader = req.headers.get("Cookie") ?? "";
  const sessionToken = parseCookie(cookieHeader, COOKIE_NAME);
  if (!sessionToken) return json({ error: "No autenticado" }, 401);

  const session = await queryOne<{ user_id: string }>(
    `SELECT user_id FROM public.sessions WHERE token = $1 AND expires_at > NOW()`,
    [sessionToken],
  );
  if (!session) return json({ error: "Sesión expirada. Inicia sesión nuevamente." }, 401);

  const { currentPassword, newPassword } = await parseBody(req);
  if (typeof currentPassword !== "string") {
    return json({ error: "La contraseña actual es requerida" }, 400);
  }
  if (typeof newPassword !== "string" || newPassword.length < 8) {
    return json({ error: "La nueva contraseña debe tener al menos 8 caracteres" }, 400);
  }

  const user = await queryOne<{ password_hash: string | null }>(
    `SELECT password_hash FROM public.user_profiles WHERE id = $1`,
    [session.user_id],
  );
  if (!user?.password_hash || !verifyPassword(currentPassword, user.password_hash)) {
    return json({ error: "La contraseña actual es incorrecta" }, 400);
  }

  const hash = hashPassword(newPassword);
  await execute(
    `UPDATE public.user_profiles SET password_hash = $1 WHERE id = $2`,
    [hash, session.user_id],
  );

  return json({ ok: true });
}

export async function handleAuthRoute(req: Request): Promise<Response | null> {
  const url = new URL(req.url);
  const path = url.pathname;

  let handler: ((r: Request) => Promise<Response>) | null = null;

  if (path === "/api/auth/login"           && req.method === "POST") handler = handleLogin;
  else if (path === "/api/auth/register"   && req.method === "POST") handler = handleRegister;
  else if (path === "/api/auth/signout")                              handler = handleSignout;
  else if (path === "/api/auth/me"         && req.method === "GET")  handler = handleMe;
  else if (path === "/api/auth/reset-request"  && req.method === "POST") handler = handleResetRequest;
  else if (path === "/api/auth/reset-password" && req.method === "POST") handler = handleResetPassword;
  else if (path === "/api/auth/change-password" && req.method === "POST") handler = handleChangePassword;

  if (!handler) return null;

  try {
    return await handler(req);
  } catch (err) {
    console.error("[auth-handler]", err);
    return json({ error: "Error interno del servidor" }, 500);
  }
}

// ── Settings routes (/api/settings/*) ────────────────────────────────────────

export async function handleSettingsRoute(req: Request): Promise<Response | null> {
  const url = new URL(req.url);
  if (!url.pathname.startsWith("/api/settings/")) return null;

  // Public: no auth required — serves logo as binary for use as favicon/img src
  if (url.pathname === "/api/settings/favicon" && req.method === "GET") {
    try {
      const row = await queryOne<{ logo_data: string | null }>(
        `SELECT logo_data FROM public.organizations WHERE id = $1`,
        [DEFAULT_ORG_ID],
      );
      if (row?.logo_data) {
        const match = row.logo_data.match(/^data:([^;]+);base64,(.+)$/s);
        if (match) {
          const mime = match[1];
          const buf  = Buffer.from(match[2], "base64");
          return new Response(buf, {
            status: 200,
            headers: {
              "Content-Type": mime,
              "Cache-Control": "public, max-age=300, stale-while-revalidate=60",
            },
          });
        }
      }
    } catch (err) {
      console.error("[settings/favicon]", err);
    }
    // Fallback to static file
    return new Response(null, { status: 302, headers: { Location: "/favicon.svg" } });
  }

  const token = parseCookie(req.headers.get("cookie") ?? "", COOKIE_NAME);
  if (!token) return json({ error: "No autenticado" }, 401);

  const session = await queryOne<{ user_id: string }>(
    `SELECT user_id FROM public.sessions WHERE token = $1 AND expires_at > NOW()`,
    [token],
  );
  if (!session) return json({ error: "Sesión inválida" }, 401);

  const roleRow = await queryOne<{ nombre: string }>(
    `SELECT r.nombre FROM public.user_roles ur
     JOIN public.roles r ON r.id = ur.role_id
     WHERE ur.user_id = $1 LIMIT 1`,
    [session.user_id],
  );
  if (!roleRow || roleRow.nombre !== "admin") return json({ error: "Acceso denegado" }, 403);

  try {
    if (url.pathname === "/api/settings/logo") {
      if (req.method === "GET") {
        const row = await queryOne<{ logo_data: string | null }>(
          `SELECT logo_data FROM public.organizations WHERE id = $1`,
          [DEFAULT_ORG_ID],
        );
        return json({ logoDataUrl: row?.logo_data ?? null });
      }

      if (req.method === "POST") {
        const body = await parseBody(req);
        const logoDataUrl = body.logoDataUrl as string | undefined;
        if (!logoDataUrl || !logoDataUrl.startsWith("data:image/")) {
          return json({ error: "Archivo de imagen inválido" }, 400);
        }
        if (logoDataUrl.length > 700_000) {
          return json({ error: "La imagen es demasiado grande (máx 500 KB)" }, 400);
        }
        await execute(
          `UPDATE public.organizations SET logo_data = $1, actualizado_en = NOW() WHERE id = $2`,
          [logoDataUrl, DEFAULT_ORG_ID],
        );
        return json({ logoDataUrl });
      }

      if (req.method === "DELETE") {
        await execute(
          `UPDATE public.organizations SET logo_data = NULL, actualizado_en = NOW() WHERE id = $1`,
          [DEFAULT_ORG_ID],
        );
        return json({ ok: true });
      }
    }

    return null;
  } catch (err) {
    console.error("[settings-handler]", err);
    return json({ error: "Error interno del servidor" }, 500);
  }
}
