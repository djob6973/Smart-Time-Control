-- Vincula un usuario del sistema con un registro de empleado mediante employee_id
-- Esto permite filtrar turnos y registrar asistencia para el empleado vinculado

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name   = 'user_profiles'
          AND column_name  = 'employee_id'
    ) THEN
        ALTER TABLE public.user_profiles
            ADD COLUMN employee_id TEXT
                REFERENCES public.employees(id)
                ON DELETE SET NULL;

        RAISE NOTICE 'Columna employee_id agregada a user_profiles';
    ELSE
        RAISE NOTICE 'Columna employee_id ya existe en user_profiles';
    END IF;
END $$;
