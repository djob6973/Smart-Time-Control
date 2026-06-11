-- =============================================================
-- Smart Shift Pro — Diagnóstico profundo del error updated_at
-- =============================================================

-- 1. Verificar TODOS los triggers en la base de datos
SELECT 
    trigger_name,
    event_object_table,
    event_manipulation,
    action_statement,
    action_timing
FROM information_schema.triggers
WHERE event_object_schema = 'public'
ORDER BY event_object_table, trigger_name;

-- 2. Verificar TODAS las funciones que hacen referencia a updated_at
SELECT 
    routine_name,
    routine_type,
    routine_definition
FROM information_schema.routines 
WHERE routine_schema = 'public'
  AND routine_definition ILIKE '%updated_at%';

-- 3. Verificar si hay RULES en user_profiles
SELECT 
    schemaname,
    tablename,
    rulename,
    definition
FROM pg_rules
WHERE tablename = 'user_profiles';

-- 4. Verificar la estructura completa de user_profiles
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'user_profiles'
ORDER BY ordinal_position;

-- 5. Buscar cualquier referencia a user_profiles en funciones/triggers
SELECT 
    routine_name,
    routine_type,
    routine_definition
FROM information_schema.routines 
WHERE routine_schema = 'public'
  AND routine_definition ILIKE '%user_profiles%';

-- 6. Verificar si hay triggers en la tabla areas (por si afecta a user_profiles)
SELECT 
    trigger_name,
    event_manipulation,
    action_statement
FROM information_schema.triggers
WHERE event_object_schema = 'public'
  AND event_object_table = 'areas';
