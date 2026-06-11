-- =============================================================
-- Smart Shift Pro — Simplificar políticas de RLS
-- Ejecutar en: Supabase Dashboard > SQL Editor > New query
-- =============================================================

-- Eliminar políticas existentes
DROP POLICY IF EXISTS "auth_read_profiles" ON user_profiles;
DROP POLICY IF EXISTS "admin_manage_profiles" ON user_profiles;

-- Crear política simplificada sin WITH CHECK
CREATE POLICY "auth_read_profiles"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "admin_manage_profiles"
  ON user_profiles FOR ALL
  TO authenticated
  USING (true);
