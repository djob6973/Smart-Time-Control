-- =============================================================
-- Smart Shift Pro — Verificar vistas y funciones
-- Ejecutar en: Supabase Dashboard > SQL Editor > New query
-- =============================================================

-- Verificar si hay vistas que usan user_profiles
SELECT table_name, view_definition 
FROM information_schema.views 
WHERE table_name LIKE '%user_profile%' OR view_definition ILIKE '%user_profiles%';

-- Verificar todas las funciones que hacen referencia a user_profiles
SELECT routine_name, routine_type 
FROM information_schema.routines 
WHERE routine_definition ILIKE '%user_profiles%';
