-- Check user_roles table structure
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'user_roles'
ORDER BY ordinal_position;

-- Check if marthaortegabarr@gmail.com has a role assigned
SELECT 
    ur.user_id,
    ur.role_id,
    ur.assigned_at,
    r.nombre as role_name,
    up.email,
    up.nombre as user_name
FROM public.user_roles ur
LEFT JOIN public.roles r ON ur.role_id = r.id
LEFT JOIN public.user_profiles up ON ur.user_id = up.id
WHERE up.email = 'marthaortegabarr@gmail.com';

-- Check all user_roles data
SELECT 
    ur.user_id,
    ur.role_id,
    ur.assigned_at,
    r.nombre as role_name,
    up.email
FROM public.user_roles ur
LEFT JOIN public.roles r ON ur.role_id::text = r.id::text
LEFT JOIN public.user_profiles up ON ur.user_id = up.id
LIMIT 10;
