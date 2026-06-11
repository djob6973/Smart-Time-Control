-- =============================================================
-- Smart Shift Pro — Eliminar triggers problemáticos en user_profiles
-- Ejecutar en: Supabase Dashboard > SQL Editor > New query
-- =============================================================

-- Eliminar todos los triggers en user_profiles
DROP TRIGGER IF EXISTS update_user_profiles_updated_at ON user_profiles;
DROP TRIGGER IF EXISTS set_updated_at ON user_profiles;
DROP TRIGGER IF EXISTS handle_updated_at ON user_profiles;

-- Verificar si el campo updated_at existe, si no, agregarlo
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'user_profiles' 
        AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE user_profiles ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
END $$;
