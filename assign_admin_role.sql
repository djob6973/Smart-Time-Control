-- ================================================================
-- Smart Shift Pro — Asignar rol admin al usuario creado
-- Ejecutar en: Supabase Dashboard > SQL Editor > New query
-- ================================================================

-- 1. Crear tabla roles si no existe
CREATE TABLE IF NOT EXISTS public.roles (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      TEXT        UNIQUE NOT NULL,
  descripcion TEXT,
  permisos    JSONB       NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Insertar roles si no existen
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

-- 3. Crear tabla user_roles si no existe
CREATE TABLE IF NOT EXISTS public.user_roles (
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_id     UUID        NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_by UUID        REFERENCES auth.users(id),
  PRIMARY KEY (user_id, role_id)
);

-- 4. Habilitar RLS
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 5. Crear políticas
DROP POLICY IF EXISTS "roles_select_auth" ON public.roles;
DROP POLICY IF EXISTS "roles_all_service"  ON public.roles;
CREATE POLICY "roles_select_auth" ON public.roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "roles_all_service"  ON public.roles FOR ALL    TO service_role USING (true);

DROP POLICY IF EXISTS "user_roles_select_auth" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_all_service" ON public.user_roles;
CREATE POLICY "user_roles_select_auth" ON public.user_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "user_roles_all_service" ON public.user_roles FOR ALL    TO service_role USING (true);

-- 6. Asignar rol admin al usuario david.ortega@dataico.com
DO $$
DECLARE
  v_user_id UUID;
  v_role_id UUID;
BEGIN
  -- Obtener el ID del usuario por email
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = 'david.ortega@dataico.com';
  
  IF v_user_id IS NULL THEN
    RAISE NOTICE 'Usuario no encontrado: david.ortega@dataico.com';
  ELSE
    -- Obtener el ID del rol admin
    SELECT id INTO v_role_id
    FROM public.roles
    WHERE nombre = 'admin';
    
    IF v_role_id IS NULL THEN
      RAISE NOTICE 'Rol admin no encontrado';
    ELSE
      -- Insertar en user_roles
      INSERT INTO public.user_roles (user_id, role_id)
      VALUES (v_user_id, v_role_id)
      ON CONFLICT (user_id, role_id) DO NOTHING;
      
      RAISE NOTICE 'Rol admin asignado al usuario %', v_user_id;
    END IF;
  END IF;
END $$;

-- 7. Verificar
SELECT 'Usuario y rol:' as status;
SELECT 
  u.id as user_id,
  u.email,
  r.nombre as role_nombre,
  ur.assigned_at
FROM auth.users u
LEFT JOIN public.user_roles ur ON u.id = ur.user_id
LEFT JOIN public.roles r ON ur.role_id = r.id
WHERE u.email = 'david.ortega@dataico.com';
