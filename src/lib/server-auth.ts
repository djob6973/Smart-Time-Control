import { getRequest } from "@tanstack/react-start/server";
import { queryOne } from "./db";

export interface AuthContext {
  userId: string;
  email: string;
  source: "header" | "env" | "cookie";
}

function parseCookie(header: string, name: string): string | null {
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k?.trim() === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

export async function getAuthContext(): Promise<AuthContext | null> {
  let req: Request | undefined;
  try {
    req = getRequest();
  } catch {
    return null;
  }
  if (!req) return null;

  // Priority 1: Dokku/nginx SSO header (Google SSO enforced at perimeter)
  const forwardedEmail = req.headers.get("X-Forwarded-Email");
  if (forwardedEmail) {
    const profile = await queryOne<{ id: string; email: string }>(
      `SELECT id, email FROM public.user_profiles WHERE email = $1`,
      [forwardedEmail.toLowerCase()],
    );
    if (profile) return { userId: profile.id, email: profile.email, source: "header" };
  }

  // Priority 2: local dev override
  const devEmail = process.env.DEV_USER_EMAIL;
  if (devEmail) {
    const profile = await queryOne<{ id: string; email: string }>(
      `SELECT id, email FROM public.user_profiles WHERE email = $1`,
      [devEmail.toLowerCase()],
    );
    if (profile) return { userId: profile.id, email: profile.email, source: "env" };
  }

  // Priority 3: cookie session
  const cookieHeader = req.headers.get("Cookie") ?? "";
  const token = parseCookie(cookieHeader, "smartpath_session");
  if (!token) return null;

  const session = await queryOne<{ user_id: string; email: string }>(
    `SELECT s.user_id, up.email
     FROM public.sessions s
     JOIN public.user_profiles up ON up.id::text = s.user_id
     WHERE s.token = $1 AND s.expires_at > NOW()`,
    [token],
  );
  if (!session) return null;

  return { userId: session.user_id, email: session.email, source: "cookie" };
}
