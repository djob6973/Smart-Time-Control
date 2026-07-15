-- El campo "plan" de organizations nunca tuvo lógica de negocio asociada (solo se mostraba en la UI).
-- Se elimina junto con los campos de edición/creación de organización que lo exponían.
ALTER TABLE public.organizations DROP COLUMN IF EXISTS plan;
