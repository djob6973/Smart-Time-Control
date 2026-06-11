-- =============================================================
-- Smart Shift Pro — Verificar schema auth y test directo
-- =============================================================

-- 1. Verificar triggers en el schema auth
SELECT 
    trigger_name,
    event_object_table,
    event_manipulation,
    action_statement
FROM information_schema.triggers
WHERE event_object_schema = 'auth'
ORDER BY event_object_table, trigger_name;

-- 2. Verificar funciones en auth que hagan referencia a updated_at
SELECT 
    routine_name,
    routine_type,
    routine_definition
FROM information_schema.routines 
WHERE routine_schema = 'auth'
  AND routine_definition ILIKE '%updated_at%';

-- 3. Test directo: intentar actualizar un user_profile
-- (esto debería reproducir el error si es de base de datos)
DO $$
DECLARE
    test_user_id UUID;
BEGIN
    -- Obtener un user_id de prueba
    SELECT id INTO test_user_id 
    FROM public.user_profiles 
    LIMIT 1;
    
    IF test_user_id IS NOT NULL THEN
        -- Intentar actualizar el area_id
        UPDATE public.user_profiles 
        SET area_id = 'test_area_id' 
        WHERE id = test_user_id;
        
        RAISE NOTICE 'Actualización exitosa para user_id: %', test_user_id;
    ELSE
        RAISE NOTICE 'No hay users en user_profiles para test';
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Error durante test: %', SQLERRM;
END $$;
