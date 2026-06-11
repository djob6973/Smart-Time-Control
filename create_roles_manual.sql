-- ================================================================
-- Smart Shift Pro — Crear tabla roles manualmente
-- Ejecutar este SQL en el Supabase Dashboard SQL Editor
-- ================================================================

-- 1. Crear tabla roles
CREATE TABLE IF NOT EXISTS public.roles (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      TEXT        UNIQUE NOT NULL,
  descripcion TEXT,
  permisos    JSONB       NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Insertar roles
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

-- 3. Habilitar RLS
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

-- 4. Crear políticas
DROP POLICY IF EXISTS "roles_select_auth" ON public.roles;
DROP POLICY IF EXISTS "roles_all_service"  ON public.roles;

CREATE POLICY "roles_select_auth" ON public.roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "roles_all_service"  ON public.roles FOR ALL    TO service_role USING (true);

-- 5. Recrear tabla user_roles con schema correcto
DROP TABLE IF EXISTS public.user_roles CASCADE;

CREATE TABLE public.user_roles (
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_id     UUID        NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_by UUID        REFERENCES auth.users(id),
  PRIMARY KEY (user_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id);

-- 6. Habilitar RLS en user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_roles_select_auth" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_all_service" ON public.user_roles;

CREATE POLICY "user_roles_select_auth" ON public.user_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "user_roles_all_service" ON public.user_roles FOR ALL    TO service_role USING (true);

-- 7. Verificar
SELECT 'Roles creados:' as status;
SELECT id, nombre, descripcion FROM public.roles;
