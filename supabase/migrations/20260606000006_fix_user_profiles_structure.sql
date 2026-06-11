-- =============================================================
-- Smart Shift Pro — Corregir estructura de user_profiles
-- La tabla tiene estructura antigua, necesita actualizarse
-- =============================================================

-- Paso 1: Renombrar columnas a la nueva estructura
DO $$
BEGIN
    -- full_name → nombre
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'user_profiles' AND column_name = 'full_name'
    ) THEN
        ALTER TABLE public.user_profiles RENAME COLUMN full_name TO nombre;
        RAISE NOTICE 'Columna full_name renombrada a nombre';
    END IF;

    -- is_active → activo
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'user_profiles' AND column_name = 'is_active'
    ) THEN
        ALTER TABLE public.user_profiles RENAME COLUMN is_active TO activo;
        RAISE NOTICE 'Columna is_active renombrada a activo';
    END IF;
END $$;

-- Paso 2: Crear tabla user_roles si no existe
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'user_roles'
    ) THEN
        CREATE TABLE public.user_roles (
            user_id     UUID        NOT NULL,
            role_id     TEXT        NOT NULL,
            assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            assigned_by UUID,
            PRIMARY KEY (user_id, role_id)
        );
        RAISE NOTICE 'Tabla user_roles creada';
    END IF;
END $$;

-- Paso 3: Eliminar role_id (ahora está en user_roles)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'user_profiles' AND column_name = 'role_id'
    ) THEN
        -- Primero, migrar datos existentes a user_roles si es necesario
        INSERT INTO public.user_roles (user_id, role_id, assigned_at)
        SELECT id, role_id, NOW()
        FROM public.user_profiles
        WHERE role_id IS NOT NULL
        ON CONFLICT (user_id, role_id) DO NOTHING;
        
        ALTER TABLE public.user_profiles DROP COLUMN role_id;
        RAISE NOTICE 'Columna role_id eliminada y datos migrados a user_roles';
    END IF;
END $$;

-- Paso 4: Asegurar que updated_at existe
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'user_profiles' AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE public.user_profiles ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
        RAISE NOTICE 'Columna updated_at agregada';
    END IF;
END $$;

-- Paso 5: Verificar estructura final
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'user_profiles'
ORDER BY ordinal_position;
