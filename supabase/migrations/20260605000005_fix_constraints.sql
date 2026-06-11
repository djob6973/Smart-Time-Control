-- =============================================================
-- Smart Shift Pro — Eliminar constraints problemáticos
-- Ejecutar en: Supabase Dashboard > SQL Editor > New query
-- =============================================================

-- Eliminar cualquier constraint que haga referencia a updated_at
ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_updated_at_check;
ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS check_updated_at;

-- Verificar estructura actual de la tabla
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'user_profiles' 
ORDER BY ordinal_position;
