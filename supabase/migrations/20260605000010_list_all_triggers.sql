-- =============================================================
-- Smart Shift Pro — Listar todos los triggers en la base de datos
-- Ejecutar en: Supabase Dashboard > SQL Editor > New query
-- =============================================================

-- Listar todos los triggers
SELECT 
  trigger_name,
  event_manipulation,
  event_object_table,
  action_statement
FROM information_schema.triggers
WHERE event_object_schema = 'public'
ORDER BY event_object_table, trigger_name;
