import { queryOne, execute } from "./db";
import { resolveEmail, upsertUser } from "./server-auth";

const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";

function json(data: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...extraHeaders },
  });
}

async function parseBody(req: Request): Promise<Record<string, unknown>> {
  try { return await req.json(); } catch { return {}; }
}

// GET /api/auth/me
// Lee la identidad del header de perímetro (X-Forwarded-Email) o DEV_USER_EMAIL.
// Crea el usuario automáticamente si es la primera vez que accede.
async function handleMe(req: Request): Promise<Response> {
  const email = resolveEmail(req);
  if (!email) return json({ user: null });

  try {
    const ctx = await upsertUser(email);
    return json({ user: { id: ctx.userId, email: ctx.email, nombre: ctx.nombre } });
  } catch (err) {
    console.error("[auth/me]", err);
    return json({ user: null });
  }
}

export async function handleAuthRoute(req: Request): Promise<Response | null> {
  const url = new URL(req.url);
  if (url.pathname === "/api/auth/me" && req.method === "GET") {
    try { return await handleMe(req); }
    catch (err) { console.error("[auth-handler]", err); return json({ error: "Error interno" }, 500); }
  }
  return null;
}

// ── Settings routes (/api/settings/*) ────────────────────────────────────────

export async function handleSettingsRoute(req: Request): Promise<Response | null> {
  const url = new URL(req.url);
  if (!url.pathname.startsWith("/api/settings/")) return null;

  // Público: favicon/logo sin auth
  if (url.pathname === "/api/settings/favicon" && req.method === "GET") {
    try {
      const row = await queryOne<{ logo_data: string | null }>(
        `SELECT logo_data FROM public.organizations WHERE id = $1`,
        [DEFAULT_ORG_ID],
      );
      if (row?.logo_data) {
        const match = row.logo_data.match(/^data:([^;]+);base64,(.+)$/s);
        if (match) {
          const buf = Buffer.from(match[2], "base64");
          return new Response(buf, {
            status: 200,
            headers: {
              "Content-Type": match[1],
              "Cache-Control": "public, max-age=300, stale-while-revalidate=60",
            },
          });
        }
      }
    } catch (err) { console.error("[settings/favicon]", err); }
    return new Response(null, { status: 302, headers: { Location: "/favicon.svg" } });
  }

  // El resto de /api/settings/* requiere admin
  const email = resolveEmail(req);
  if (!email) return json({ error: "No autenticado" }, 401);

  const profile = await queryOne<{ id: string }>(
    `SELECT id FROM public.user_profiles WHERE email = $1`,
    [email],
  );
  if (!profile) return json({ error: "Usuario no encontrado" }, 401);

  const roleRow = await queryOne<{ nombre: string }>(
    `SELECT r.nombre FROM public.user_roles ur
     JOIN public.roles r ON r.id = ur.role_id
     WHERE ur.user_id = $1 LIMIT 1`,
    [profile.id],
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
        if (!logoDataUrl || !logoDataUrl.startsWith("data:image/"))
          return json({ error: "Archivo de imagen inválido" }, 400);
        if (logoDataUrl.length > 700_000)
          return json({ error: "La imagen es demasiado grande (máx 500 KB)" }, 400);
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
