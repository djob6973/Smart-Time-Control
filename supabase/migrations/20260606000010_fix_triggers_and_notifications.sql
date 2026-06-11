-- =============================================================
-- FIX 1: Eliminar triggers que causan "record new has no field updated_at"
-- =============================================================

DO $$
DECLARE rec RECORD;
BEGIN
  FOR rec IN
    SELECT trigger_name FROM information_schema.triggers
    WHERE event_object_schema = 'public'
      AND event_object_table  = 'user_profiles'
  LOOP
    EXECUTE 'DROP TRIGGER IF EXISTS ' || quote_ident(rec.trigger_name) || ' ON public.user_profiles';
    RAISE NOTICE 'Trigger eliminado: %', rec.trigger_name;
  END LOOP;
END $$;

DROP FUNCTION IF EXISTS public.update_updated_at_column() CASCADE;
DROP FUNCTION IF EXISTS public.update_user_profiles_ts()  CASCADE;

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- =============================================================
-- FIX 2: Recrear notifications con columnas correctas (body, data)
-- La migración anterior usaba "message" y "metadata" — incorrecto.
-- =============================================================

DROP TABLE IF EXISTS public.notifications CASCADE;

CREATE TABLE public.notifications (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    TEXT        NOT NULL,
  type       TEXT        NOT NULL CHECK (type IN ('info','success','warning','error')),
  title      TEXT        NOT NULL,
  body       TEXT        NOT NULL DEFAULT '',
  data       JSONB       NOT NULL DEFAULT '{}',
  read       BOOLEAN     NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ON public.notifications(user_id);
CREATE INDEX ON public.notifications(created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_select_notifications" ON public.notifications
  FOR SELECT TO authenticated USING (user_id = auth.uid()::text);
CREATE POLICY "auth_update_notifications" ON public.notifications
  FOR UPDATE TO authenticated USING (user_id = auth.uid()::text);
CREATE POLICY "auth_delete_notifications" ON public.notifications
  FOR DELETE TO authenticated USING (user_id = auth.uid()::text);
CREATE POLICY "srvc_all_notifications" ON public.notifications
  FOR ALL TO service_role USING (true);

-- =============================================================
-- VERIFICACIÓN
-- =============================================================

SELECT trigger_name FROM information_schema.triggers
WHERE event_object_schema = 'public' AND event_object_table = 'user_profiles';

SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'notifications'
ORDER BY ordinal_position;
