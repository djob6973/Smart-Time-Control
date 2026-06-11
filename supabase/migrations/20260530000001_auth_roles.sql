-- ================================================================
-- Smart Shift Pro — RBAC: roles, user_profiles (adapted), user_roles
-- Ejecutar DESPUÉS de schema.sql y schema_auth.sql
-- ================================================================

-- ── 1. Tabla roles ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.roles (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      TEXT        UNIQUE NOT NULL,
  descripcion TEXT,
  permisos    JSONB       NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.roles (nombre, descripcion, permisos) VALUES
  ('admin',      'Administrador con acceso completo',
   '{"scheduler":["view","edit","full"],"employees":["view","edit","full"],"areas":["view","edit","full"],"absences":["view","edit","full"],"reports":["view","edit","full"],"settings":["view","edit","full"]}'),
  ('supervisor', 'Supervisor operacional',
   '{"scheduler":["view","edit"],"employees":["view","edit"],"areas":["view"],"absences":["view","edit"],"reports":["view"],"settings":["view"]}'),
  ('lider',      'Líder de área',
   '{"scheduler":["view","edit"],"employees":["view"],"areas":["view"],"absences":["view","edit"],"reports":["view"],"settings":[]}'),
  ('gestor',     'Gestor de turnos',
   '{"scheduler":["view","edit"],"employees":["view"],"areas":["view"],"absences":["view"],"reports":["view"],"settings":[]}'),
  ('consulta',   'Acceso de sólo lectura',
   '{"scheduler":["view"],"employees":["view"],"areas":["view"],"absences":["view"],"reports":["view"],"settings":[]}')
ON CONFLICT (nombre) DO NOTHING;

-- ── 2. Adaptar user_profiles ─────────────────────────────────────
-- Crear si no existe (instalación limpia)
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id         UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre     TEXT        NOT NULL DEFAULT '',
  email      TEXT        NOT NULL DEFAULT '',
  activo     BOOLEAN     NOT NULL DEFAULT true,
  area_id    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Migraciones para base de datos existente con la estructura antigua
DO $$ BEGIN
  -- full_name → nombre
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_profiles' AND column_name = 'full_name'
  ) THEN
    ALTER TABLE public.user_profiles RENAME COLUMN full_name TO nombre;
  END IF;

  -- is_active → activo
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_profiles' AND column_name = 'is_active'
  ) THEN
    ALTER TABLE public.user_profiles RENAME COLUMN is_active TO activo;
  END IF;

  -- Eliminar role_id (ahora en user_roles)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_profiles' AND column_name = 'role_id'
  ) THEN
    ALTER TABLE public.user_profiles DROP COLUMN role_id;
  END IF;

  -- Agregar updated_at si no existe
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_profiles' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.user_profiles ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
  END IF;

  -- Agregar area_id si no existe (por si acaso)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_profiles' AND column_name = 'area_id'
  ) THEN
    ALTER TABLE public.user_profiles ADD COLUMN area_id TEXT;
  END IF;
END $$;

-- Índices
CREATE INDEX IF NOT EXISTS idx_user_profiles_email  ON public.user_profiles(email);
CREATE INDEX IF NOT EXISTS idx_user_profiles_activo ON public.user_profiles(activo);

-- ── 3. Tabla user_roles ──────────────────────────────────────────
-- Eliminar la tabla si existe con esquema antiguo (role_id de tipo enum app_role)
-- Los roles se reasignan manualmente tras la migración.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'user_roles'
      AND column_name  IN ('role_id', 'role')
      AND udt_name     = 'app_role'
  ) THEN
    DROP TABLE public.user_roles CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_id     UUID        NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_by UUID        REFERENCES auth.users(id),
  PRIMARY KEY (user_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id);

-- ── 4. RLS ───────────────────────────────────────────────────────
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "roles_select_auth" ON public.roles;
DROP POLICY IF EXISTS "roles_all_service"  ON public.roles;
CREATE POLICY "roles_select_auth" ON public.roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "roles_all_service"  ON public.roles FOR ALL    TO service_role USING (true);

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_read_profiles"    ON public.user_profiles;
DROP POLICY IF EXISTS "admin_manage_profiles" ON public.user_profiles;
DROP POLICY IF EXISTS "profiles_select_auth"  ON public.user_profiles;
DROP POLICY IF EXISTS "profiles_update_own"   ON public.user_profiles;
DROP POLICY IF EXISTS "profiles_all_service"  ON public.user_profiles;
CREATE POLICY "profiles_select_auth" ON public.user_profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update_own"  ON public.user_profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles_all_service" ON public.user_profiles FOR ALL    TO service_role USING (true);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_roles_select_auth" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_all_service" ON public.user_roles;
CREATE POLICY "user_roles_select_auth" ON public.user_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "user_roles_all_service" ON public.user_roles FOR ALL    TO service_role USING (true);

-- ── 5. Trigger updated_at ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_user_profiles_ts()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS user_profiles_updated_at ON public.user_profiles;
CREATE TRIGGER user_profiles_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_user_profiles_ts();

-- ── 6. Función auxiliar is_admin (compatibilidad) ────────────────
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = auth.uid() AND r.nombre = 'admin'
  )
$$;
