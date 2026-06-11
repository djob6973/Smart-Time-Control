-- =============================================================
-- Smart Shift Pro — Autenticación y Perfiles de Usuario
-- Ejecutar en: Supabase Dashboard > SQL Editor > New query
-- IMPORTANTE: ejecutar DESPUÉS de schema.sql
-- =============================================================

-- ── TABLA: user_profiles ──────────────────────────────────────
-- Vincula auth.users con roles y datos del sistema WFM

CREATE TABLE IF NOT EXISTS user_profiles (
  id          UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT        NOT NULL,
  full_name   TEXT        NOT NULL DEFAULT '',
  role_id     TEXT        NOT NULL DEFAULT 'consulta'
                CHECK (role_id IN ('admin','supervisor','lider','gestor','consulta')),
  area_id     TEXT        REFERENCES areas(id) ON DELETE SET NULL,
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_profiles_email_idx ON user_profiles(email);
CREATE INDEX IF NOT EXISTS user_profiles_role_idx  ON user_profiles(role_id);

-- ── FUNCIÓN AUXILIAR: verificar rol del usuario actual ────────
-- SECURITY DEFINER → se ejecuta con privilegios del propietario
-- (no del llamador), necesario para evitar recursión en RLS.

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT COALESCE(
    (SELECT is_active AND role_id = 'admin'
     FROM user_profiles
     WHERE id = auth.uid()),
    false
  )
$$;

-- ── RLS: USER_PROFILES ────────────────────────────────────────
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_read_profiles"   ON user_profiles;
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

-- ── ACTUALIZAR POLÍTICAS DE LAS TABLAS EXISTENTES ─────────────
-- Reemplazar políticas anon (desarrollo) por políticas de usuario
-- autenticado. Todos los usuarios del sistema pueden leer y escribir
-- en estas tablas; la restricción por rol se aplica en la capa UI.

-- Areas
DROP POLICY IF EXISTS "anon_all_areas"  ON areas;
DROP POLICY IF EXISTS "auth_all_areas"  ON areas;
CREATE POLICY "auth_all_areas"
  ON areas FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Employees
DROP POLICY IF EXISTS "anon_all_employees" ON employees;
DROP POLICY IF EXISTS "auth_all_employees" ON employees;
CREATE POLICY "auth_all_employees"
  ON employees FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Shifts
DROP POLICY IF EXISTS "anon_all_shifts" ON shifts;
DROP POLICY IF EXISTS "auth_all_shifts" ON shifts;
CREATE POLICY "auth_all_shifts"
  ON shifts    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Absences
DROP POLICY IF EXISTS "anon_all_absences" ON absences;
DROP POLICY IF EXISTS "auth_all_absences" ON absences;
CREATE POLICY "auth_all_absences"
  ON absences  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── PRIMER USUARIO ADMINISTRADOR ──────────────────────────────
-- Crear el primer admin desde: Supabase Dashboard > Authentication > Users > Add user
-- Luego insertar su perfil manualmente (reemplaza el UUID y email):
--
-- INSERT INTO user_profiles (id, email, full_name, role_id)
-- VALUES (
--   '<uuid-del-usuario-de-auth>',
--   'admin@tuempresa.com',
--   'Administrador',
--   'admin'
-- );
