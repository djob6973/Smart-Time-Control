-- ================================================================
-- Smart Shift Pro — Multi-tenancy: organizations + user_organizations
-- Ejecutar DESPUÉS de 20260530000001_auth_roles.sql
-- ================================================================

-- ── 1. Tabla organizations ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.organizations (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre          TEXT        NOT NULL,
  slug            TEXT        NOT NULL UNIQUE,
  activo          BOOLEAN     NOT NULL DEFAULT true,
  plan            TEXT        NOT NULL DEFAULT 'free',
  config          JSONB       NOT NULL DEFAULT '{}',
  creado_en       TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 2. Tabla user_organizations ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_organizations (
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  activo          BOOLEAN     NOT NULL DEFAULT true,
  creado_en       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, organization_id)
);

CREATE INDEX IF NOT EXISTS idx_user_orgs_user ON public.user_organizations(user_id);
CREATE INDEX IF NOT EXISTS idx_user_orgs_org  ON public.user_organizations(organization_id);

-- ── 3. Agregar organization_id a user_roles ──────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_roles' AND column_name = 'organization_id'
  ) THEN
    ALTER TABLE public.user_roles ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ── 4. Organización por defecto ──────────────────────────────────
INSERT INTO public.organizations (id, nombre, slug, plan)
VALUES ('00000000-0000-0000-0000-000000000001', 'Default Organization', 'default', 'pro')
ON CONFLICT DO NOTHING;

-- Asignar org por defecto a los user_roles que no tengan organización
UPDATE public.user_roles
SET organization_id = '00000000-0000-0000-0000-000000000001'
WHERE organization_id IS NULL;

-- Hacer organization_id NOT NULL una vez relleno
ALTER TABLE public.user_roles ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_roles_org ON public.user_roles(organization_id);

-- ── 5. Permisos y RLS ────────────────────────────────────────────
GRANT SELECT ON public.organizations      TO authenticated;
GRANT SELECT ON public.user_organizations TO authenticated;
GRANT ALL    ON public.organizations      TO service_role;
GRANT ALL    ON public.user_organizations TO service_role;

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_members_select" ON public.organizations;
DROP POLICY IF EXISTS "org_service_all"    ON public.organizations;
CREATE POLICY "org_members_select" ON public.organizations FOR SELECT TO authenticated
  USING (id IN (
    SELECT organization_id FROM public.user_organizations
    WHERE user_id = auth.uid() AND activo = true
  ));
CREATE POLICY "org_service_all" ON public.organizations FOR ALL TO service_role USING (true);

ALTER TABLE public.user_organizations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_orgs_select_own"  ON public.user_organizations;
DROP POLICY IF EXISTS "user_orgs_service_all" ON public.user_organizations;
CREATE POLICY "user_orgs_select_own"  ON public.user_organizations FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "user_orgs_service_all" ON public.user_organizations FOR ALL    TO service_role USING (true);

-- Actualizar política user_roles para filtrar por organización
DROP POLICY IF EXISTS "user_roles_select_auth"  ON public.user_roles;
DROP POLICY IF EXISTS "org_user_roles_select"   ON public.user_roles;
CREATE POLICY "org_user_roles_select" ON public.user_roles FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.user_organizations
      WHERE user_id = auth.uid() AND activo = true
    )
    OR user_id = auth.uid()
  );

-- ── 6. Trigger updated_at en organizations ───────────────────────
CREATE OR REPLACE FUNCTION public.touch_organization()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.actualizado_en = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS organizations_touch ON public.organizations;
CREATE TRIGGER organizations_touch
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.touch_organization();
