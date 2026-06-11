-- =============================================================
-- Smart Shift Pro — Renombrar columnas a nombres correctos
-- Ejecutar en: Supabase Dashboard > SQL Editor > New query
-- =============================================================

-- Renombrar columnas a los nombres correctos
ALTER TABLE user_profiles RENAME COLUMN nombre TO full_name;
ALTER TABLE user_profiles RENAME COLUMN activo TO is_active;

-- Agregar columna role_id si no existe
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'user_profiles' 
        AND column_name = 'role_id'
    ) THEN
        ALTER TABLE user_profiles ADD COLUMN role_id TEXT NOT NULL DEFAULT 'consulta';
    END IF;
END $$;

-- Actualizar el CHECK constraint para role_id si existe
ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_role_id_check;
ALTER TABLE user_profiles 
ADD CONSTRAINT user_profiles_role_id_check 
CHECK (role_id IN ('admin','supervisor','lider','gestor','consulta'));

-- Verificar estructura actual
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'user_profiles' 
ORDER BY ordinal_position;
