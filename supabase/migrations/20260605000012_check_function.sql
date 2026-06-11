-- =============================================================
-- Smart Shift Pro — Verificar función update_user_profiles_ts
-- Ejecutar en: Supabase Dashboard > SQL Editor > New query
-- =============================================================

-- Verificar si la función existe y su definición
SELECT routine_name, routine_definition 
FROM information_schema.routines 
WHERE routine_name = 'update_user_profiles_ts';
