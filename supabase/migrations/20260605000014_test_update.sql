-- =============================================================
-- Smart Shift Pro — Test de actualización en user_profiles
-- Ejecutar en: Supabase Dashboard > SQL Editor > New query
-- =============================================================

-- Test: Actualizar el full_name de un usuario existente
UPDATE user_profiles 
SET full_name = 'Test Update Name'
WHERE id = (SELECT id FROM user_profiles LIMIT 1);

-- Verificar si la actualización fue exitosa
SELECT id, email, full_name, area_id, updated_at 
FROM user_profiles 
WHERE full_name = 'Test Update Name';
