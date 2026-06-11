-- ================================================================
-- Smart Shift Pro — Arreglar tabla user_profiles
-- Ejecutar en: Supabase Dashboard > SQL Editor > New query
-- ================================================================

-- 1. Deshabilitar el trigger temporalmente para evitar errores
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- 2. Verificar si la columna full_name existe, si no, agregarla
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'user_profiles' 
    AND column_name = 'full_name'
  ) THEN
    ALTER TABLE public.user_profiles ADD COLUMN full_name TEXT NOT NULL DEFAULT '';
    RAISE NOTICE 'Columna full_name agregada';
  ELSE
    RAISE NOTICE 'Columna full_name ya existe';
  END IF;
END $$;

-- 3. Verificar si la columna role_id existe, si no, agregarla
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'user_profiles' 
    AND column_name = 'role_id'
  ) THEN
    ALTER TABLE public.user_profiles ADD COLUMN role_id TEXT NOT NULL DEFAULT 'consulta'
    CHECK (role_id IN ('admin','supervisor','lider','gestor','consulta'));
    RAISE NOTICE 'Columna role_id agregada';
  ELSE
    RAISE NOTICE 'Columna role_id ya existe';
  END IF;
END $$;

-- 4. Verificar si la columna is_active existe, si no, agregarla
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'user_profiles' 
    AND column_name = 'is_active'
  ) THEN
    ALTER TABLE public.user_profiles ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true;
    RAISE NOTICE 'Columna is_active agregada';
  ELSE
    RAISE NOTICE 'Columna is_active ya existe';
  END IF;
END $$;

-- 5. Recrear la función handle_new_user con el esquema correcto
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, full_name, role_id, is_active)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    'consulta',
    true
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- 6. Reactivar el trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 7. Verificar estructura final
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'user_profiles'
AND table_schema = 'public'
ORDER BY ordinal_position;
