-- Backfill user_organizations a partir de user_roles
-- Garantiza que todo usuario con un rol asignado también esté vinculado
-- a la organización correspondiente en user_organizations.
INSERT INTO public.user_organizations (user_id, organization_id, activo)
SELECT DISTINCT ur.user_id, ur.organization_id, true
FROM public.user_roles ur
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_organizations uo
  WHERE uo.user_id = ur.user_id
    AND uo.organization_id = ur.organization_id
)
ON CONFLICT (user_id, organization_id) DO NOTHING;
