-- =============================================================
-- Smart Shift Pro — Re-habilitar RLS en user_profiles
-- Ejecutar en: Supabase Dashboard > SQL Editor > New query
-- =============================================================

-- Re-habilitar RLS en user_profiles
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Asegurar que las políticas existan
DROP POLICY IF EXISTS "auth_read_profiles" ON user_profiles;
DROP POLICY IF EXISTS "admin_manage_profiles" ON user_profiles;

CREATE POLICY "auth_read_profiles"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "admin_manage_profiles"
  ON user_profiles FOR ALL
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());
