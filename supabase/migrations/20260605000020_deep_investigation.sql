-- =============================================================
-- Smart Shift Pro — Investigación profunda de updated_at
-- Ejecutar en: Supabase Dashboard > SQL Editor > New query
-- =============================================================

-- 1. Verificar si updated_at realmente fue eliminado
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'user_profiles' AND column_name = 'updated_at';

-- 2. Listar TODOS los triggers en la base de datos nuevamente
SELECT 
  trigger_name,
  event_manipulation,
  event_object_table,
  action_statement
FROM information_schema.triggers
WHERE event_object_schema = 'public'
ORDER BY event_object_table, trigger_name;

-- 3. Buscar cualquier función que haga referencia a updated_at
SELECT routine_name, routine_definition 
FROM information_schema.routines 
WHERE routine_definition ILIKE '%updated_at%';

-- 4. Verificar si hay alguna regla (RULE) en user_profiles
SELECT schemaname, tablename, rulename, definition 
FROM pg_rules 
WHERE tablename = 'user_profiles';
