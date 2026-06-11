-- =============================================================
-- Smart Shift Pro — Función personalizada para actualizar user_profiles
-- Ejecutar en: Supabase Dashboard > SQL Editor > New query
-- =============================================================

-- Crear función personalizada para actualizar user_profiles sin triggers
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
