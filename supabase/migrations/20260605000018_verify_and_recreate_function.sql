-- =============================================================
-- Smart Shift Pro — Verificar y recrear función admin_update_user_profile
-- Ejecutar en: Supabase Dashboard > SQL Editor > New query
-- =============================================================

-- Verificar si la función existe
SELECT routine_name, routine_definition 
FROM information_schema.routines 
WHERE routine_name = 'admin_update_user_profile';

-- Si no existe o hay error, recrearla
DROP FUNCTION IF EXISTS admin_update_user_profile CASCADE;

CREATE OR REPLACE FUNCTION admin_update_user_profile(
  p_id UUID,
  p_full_name TEXT DEFAULT NULL,
  p_email TEXT DEFAULT NULL,
  p_area_id TEXT DEFAULT NULL,
  p_is_active BOOLEAN DEFAULT NULL,
  p_role_id TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Construir dinámicamente el UPDATE
  IF p_full_name IS NOT NULL THEN
    UPDATE user_profiles SET full_name = p_full_name WHERE id = p_id;
  END IF;
  
  IF p_email IS NOT NULL THEN
    UPDATE user_profiles SET email = p_email WHERE id = p_id;
  END IF;
  
  IF p_area_id IS NOT NULL THEN
    UPDATE user_profiles SET area_id = p_area_id WHERE id = p_id;
  END IF;
  
  IF p_is_active IS NOT NULL THEN
    UPDATE user_profiles SET is_active = p_is_active WHERE id = p_id;
  END IF;
  
  IF p_role_id IS NOT NULL THEN
    UPDATE user_profiles SET role_id = p_role_id WHERE id = p_id;
  END IF;
END;
$$;

-- Verificar que se creó correctamente
SELECT routine_name, routine_definition 
FROM information_schema.routines 
WHERE routine_name = 'admin_update_user_profile';
