-- =============================================================
-- Smart Shift Pro — Agregar campo updated_at a user_profiles
-- Ejecutar en: Supabase Dashboard > SQL Editor > New query
-- =============================================================

-- Agregar campo updated_at a user_profiles
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Crear trigger para actualizar updated_at automáticamente
DROP TRIGGER IF EXISTS update_user_profiles_updated_at ON user_profiles;

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_profiles_updated_at
    BEFORE UPDATE ON user_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
