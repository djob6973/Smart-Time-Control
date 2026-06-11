-- =============================================================
-- Verificar tabla notifications
-- =============================================================

-- Verificar si la tabla existe y su estructura
SELECT 
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'notifications'
ORDER BY ordinal_position;

-- Verificar políticas RLS
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'notifications';

-- Verificar si hay datos
SELECT COUNT(*) as total_notifications FROM notifications;
