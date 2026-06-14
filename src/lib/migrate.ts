import { execute } from "./db";

let done = false;

export async function runMigration(): Promise<void> {
  if (done) return;
  done = true;

  await execute(`
    CREATE TABLE IF NOT EXISTS public.sessions (
      token       TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at  TIMESTAMPTZ NOT NULL
    )
  `);

  await execute(`ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS password_hash TEXT`);
  await execute(`ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS reset_token TEXT`);
  await execute(`ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS reset_token_expires_at TIMESTAMPTZ`);
}
