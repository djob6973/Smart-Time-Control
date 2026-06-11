-- =============================================================
-- Smart Shift Pro — FIX DEFINITIVO: eliminar todos los triggers
-- en user_profiles que causan "record new has no field updated_at"
-- Ejecutar en: Supabase Dashboard > SQL Editor > New query
-- =============================================================

-- Paso 1: Eliminar TODOS los triggers en user_profiles dinámicamente
-- (no asumimos el nombre — atrapamos cualquier trigger que exista)
DO $$
DECLARE
    rec RECORD;
BEGIN
    FOR rec IN
        SELECT trigger_name
        FROM information_schema.triggers
        WHERE event_object_schema = 'public'
          AND event_object_table  = 'user_profiles'
    LOOP
        EXECUTE 'DROP TRIGGER IF EXISTS ' || quote_ident(rec.trigger_name) || ' ON public.user_profiles';
        RAISE NOTICE 'Trigger eliminado: %', rec.trigger_name;
    END LOOP;
END $$;

-- Paso 2: Eliminar las funciones de trigger que solo sirven para updated_at
-- CASCADE también elimina cualquier trigger restante que las use
DROP FUNCTION IF EXISTS public.update_updated_at_column() CASCADE;
DROP FUNCTION IF EXISTS public.update_user_profiles_ts()  CASCADE;

-- Paso 3: Asegurarse de que la columna updated_at existe con valor por defecto
-- (sin trigger — se actualiza manualmente cuando se necesite)
ALTER TABLE public.user_profiles
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Paso 4: Verificar que no quede ningún trigger
SELECT
    trigger_name,
    event_manipulation,
    action_statement
FROM information_schema.triggers
WHERE event_object_schema = 'public'
  AND event_object_table  = 'user_profiles';
