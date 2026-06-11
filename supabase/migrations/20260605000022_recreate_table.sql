-- =============================================================
-- Smart Shift Pro — Recrear tabla user_profiles desde cero
-- Ejecutar en: Supabase Dashboard > SQL Editor > New query
-- =============================================================

-- Guardar los datos existentes
CREATE TEMP TABLE user_profiles_backup AS SELECT * FROM user_profiles;

-- Eliminar la tabla existente
DROP TABLE IF EXISTS user_profiles CASCADE;

-- Recrear la tabla con la estructura correcta
CREATE TABLE user_profiles (
  id          UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT        NOT NULL,
  full_name   TEXT        NOT NULL DEFAULT '',
  role_id     TEXT        NOT NULL DEFAULT 'consulta'
                CHECK (role_id IN ('admin','supervisor','lider','gestor','consulta')),
  area_id     TEXT        REFERENCES areas(id) ON DELETE SET NULL,
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Restaurar los datos
INSERT INTO user_profiles (id, email, full_name, role_id, area_id, is_active, created_at)
SELECT id, email, full_name, role_id, area_id, is_active, created_at 
FROM user_profiles_backup;

-- Crear índices
CREATE INDEX IF NOT EXISTS user_profiles_email_idx ON user_profiles(email);
CREATE INDEX IF NOT EXISTS user_profiles_role_idx  ON user_profiles(role_id);

-- Limpiar tabla temporal
DROP TABLE IF EXISTS user_profiles_backup;

-- Verificar la estructura
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'user_profiles' 
ORDER BY ordinal_position;
