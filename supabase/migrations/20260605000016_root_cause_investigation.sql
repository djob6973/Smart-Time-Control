-- =============================================================
-- Smart Shift Pro — Investigación de causa raíz
-- Ejecutar en: Supabase Dashboard > SQL Editor > New query
-- =============================================================

-- 1. Verificar todas las tablas que tienen foreign keys a user_profiles
SELECT 
    tc.table_name, 
    kcu.column_name, 
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name 
FROM 
    information_schema.table_constraints AS tc 
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY' 
AND ccu.table_name = 'user_profiles';

-- 2. Verificar todas las vistas que hacen referencia a user_profiles
SELECT table_name, view_definition 
FROM information_schema.views 
WHERE view_definition ILIKE '%user_profiles%';

-- 3. Verificar todas las funciones que hacen referencia a updated_at
SELECT routine_name, routine_definition 
FROM information_schema.routines 
WHERE routine_definition ILIKE '%updated_at%';

-- 4. Verificar la estructura completa de user_profiles
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'user_profiles' 
ORDER BY ordinal_position;
