import { execute } from "./db";

let done = false;

export async function runMigration(): Promise<void> {
  if (done) return;

  // Sessions table
  await execute(`
    CREATE TABLE IF NOT EXISTS public.sessions (
      token       TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at  TIMESTAMPTZ NOT NULL
    )
  `);

  // Auth columns on user_profiles
  await execute(`ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS password_hash TEXT`);
  await execute(`ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS reset_token TEXT`);
  await execute(`ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS reset_token_expires_at TIMESTAMPTZ`);

  // Roles table (RBAC)
  await execute(`
    CREATE TABLE IF NOT EXISTS public.roles (
      id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      nombre      TEXT        UNIQUE NOT NULL,
      descripcion TEXT,
      permisos    JSONB       NOT NULL DEFAULT '{}',
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Seed default roles
  await execute(`
    INSERT INTO public.roles (nombre, descripcion, permisos) VALUES
      ('admin',      'Administrador con acceso completo',
       '{"scheduler":"full","employees":"full","areas":"full","absences":"full","reports":"full","settings":"full","dashboard":"full","jornada":"full","mi_horario":"full"}'),
      ('supervisor', 'Supervisor operacional',
       '{"scheduler":"edit","employees":"edit","areas":"view","absences":"edit","reports":"view","settings":"view","dashboard":"full","jornada":"edit","mi_horario":"full"}'),
      ('lider',      'Líder de área',
       '{"scheduler":"edit","employees":"view","areas":"view","absences":"edit","reports":"view","settings":"none","dashboard":"full","jornada":"view","mi_horario":"full"}'),
      ('gestor',     'Gestor de turnos',
       '{"scheduler":"edit","employees":"view","areas":"view","absences":"view","reports":"view","settings":"none","dashboard":"full","jornada":"view","mi_horario":"full"}'),
      ('consulta',   'Acceso de sólo lectura',
       '{"scheduler":"view","employees":"view","areas":"view","absences":"view","reports":"view","settings":"none","dashboard":"full","jornada":"view","mi_horario":"full"}')
    ON CONFLICT (nombre) DO NOTHING
  `);

  // Default organization
  await execute(`
    CREATE TABLE IF NOT EXISTS public.organizations (
      id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      nombre         TEXT        NOT NULL,
      slug           TEXT        NOT NULL UNIQUE,
      activo         BOOLEAN     NOT NULL DEFAULT true,
      plan           TEXT        NOT NULL DEFAULT 'free',
      config         JSONB       NOT NULL DEFAULT '{}',
      creado_en      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await execute(`
    INSERT INTO public.organizations (id, nombre, slug, plan)
    VALUES ('00000000-0000-0000-0000-000000000001', 'Default Organization', 'default', 'pro')
    ON CONFLICT DO NOTHING
  `);

  // User-role assignments
  await execute(`
    CREATE TABLE IF NOT EXISTS public.user_roles (
      user_id         UUID        NOT NULL,
      role_id         UUID        NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
      organization_id UUID,
      assigned_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      assigned_by     UUID,
      PRIMARY KEY (user_id, role_id)
    )
  `);

  // User-organization memberships
  await execute(`
    CREATE TABLE IF NOT EXISTS public.user_organizations (
      user_id         UUID        NOT NULL,
      organization_id UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
      activo          BOOLEAN     NOT NULL DEFAULT true,
      creado_en       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, organization_id)
    )
  `);

  done = true; // solo se marca como completada si todo tuvo éxito
}
