-- =============================================================
-- Smart Shift Pro — FIX DEFINITIVO para user_profiles updated_at
-- Problema: "record new has no field updated_at"
-- =============================================================

-- Paso 1: Asegurarse de que la columna updated_at existe
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name   = 'user_profiles' 
          AND column_name  = 'updated_at'
    ) THEN
        ALTER TABLE public.user_profiles 
        ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
        RAISE NOTICE 'Columna updated_at agregada a user_profiles';
    ELSE
        RAISE NOTICE 'Columna updated_at ya existe en user_profiles';
    END IF;
END $$;

-- Paso 2: Eliminar el trigger problemático si existe
DROP TRIGGER IF EXISTS user_profiles_updated_at ON public.user_profiles;

-- Paso 3: Eliminar la función asociada
DROP FUNCTION IF EXISTS public.update_user_profiles_ts() CASCADE;

-- Paso 4: Eliminar cualquier otra función de updated_at
DROP FUNCTION IF EXISTS public.update_updated_at_column() CASCADE;

-- Paso 5: Verificar el estado final
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name   = 'user_profiles'
  AND column_name  = 'updated_at';

-- Verificar que no quedan triggers
SELECT 
    trigger_name,
    event_manipulation,
    action_statement
FROM information_schema.triggers
WHERE event_object_schema = 'public'
  AND event_object_table  = 'user_profiles';
