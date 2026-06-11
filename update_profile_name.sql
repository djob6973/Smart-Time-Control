-- ================================================================
-- Smart Shift Pro — Actualizar nombre del perfil de usuario
-- Ejecutar en: Supabase Dashboard > SQL Editor > New query
-- ================================================================

-- Actualizar el nombre del usuario david.ortega@dataico.com
UPDATE public.user_profiles
SET full_name = 'David Ortega'
WHERE email = 'david.ortega@dataico.com';

-- Verificar el cambio
SELECT id, email, full_name, role_id, is_active
FROM public.user_profiles
WHERE email = 'david.ortega@dataico.com';
