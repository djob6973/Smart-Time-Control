-- =============================================================
-- Smart Shift Pro — Función para configurar nuevo usuario
-- Ejecutar en: Supabase Dashboard > SQL Editor > New query
-- IMPORTANTE: ejecutar DESPUÉS de schema_auth.sql
-- =============================================================

-- ── FUNCIÓN: admin_setup_new_user ───────────────────────────────
-- Crea el perfil de usuario en user_profiles después de crear
-- el usuario en auth.users. Se ejecuta con SECURITY DEFINER para
-- tener los privilegios necesarios.

DROP FUNCTION IF EXISTS admin_setup_new_user CASCADE;

CREATE OR REPLACE FUNCTION admin_setup_new_user(
  p_user_id UUID,
  p_email TEXT,
  p_nombre TEXT,
  p_role_name TEXT,
  p_area_id TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Insertar perfil en user_profiles
  INSERT INTO user_profiles (
    id,
    email,
    full_name,
    role_id,
    area_id,
    is_active
  ) VALUES (
    p_user_id,
    p_email,
    p_nombre,
    p_role_name,
    p_area_id,
    true
  );
END;
$$;

-- ── COMENTARIOS ───────────────────────────────────────────────────

COMMENT ON FUNCTION admin_setup_new_user IS 'Crea el perfil de usuario en user_profiles después de crear el usuario en auth.users';
