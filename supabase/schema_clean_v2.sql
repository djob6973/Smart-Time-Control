-- ================================================================
-- Smart Shift Pro — Schema Limpio v2.0
-- UN ÚNICO script para base de datos nueva / reseteada
-- Ejecutar en: Supabase Dashboard > SQL Editor > New query
-- ================================================================

-- ── 1. TABLAS BASE WFM ──────────────────────────────────────────

CREATE TABLE public.areas (
  id                    TEXT        PRIMARY KEY,
  name                  TEXT        NOT NULL,
  leader                TEXT        NOT NULL DEFAULT '',
  start_hour            INTEGER     NOT NULL DEFAULT 8,
  end_hour              INTEGER     NOT NULL DEFAULT 18,
  working_days          INTEGER[]   NOT NULL DEFAULT '{1,2,3,4,5,6}',
  max_hours_day         INTEGER     NOT NULL DEFAULT 8,
  max_hours_week        INTEGER     NOT NULL DEFAULT 46,
  max_hours_month       INTEGER     NOT NULL DEFAULT 192,
  allow_overtime        BOOLEAN     NOT NULL DEFAULT false,
  allow_sunday          BOOLEAN     NOT NULL DEFAULT false,
  min_rest_hours        INTEGER     NOT NULL DEFAULT 8,
  coverage_requirements JSONB       NOT NULL DEFAULT '[]',
  enable_coverage_mode  BOOLEAN     NOT NULL DEFAULT false,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.employees (
  id            TEXT        PRIMARY KEY,
  full_name     TEXT        NOT NULL,
  document_id   TEXT        NOT NULL DEFAULT '',
  position      TEXT        NOT NULL DEFAULT '',
  area_id       TEXT        REFERENCES public.areas(id) ON DELETE SET NULL,
  leader        TEXT        NOT NULL DEFAULT '',
  status        TEXT        NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','inactive')),
  contract_type TEXT        NOT NULL DEFAULT 'indefinido'
                  CHECK (contract_type IN ('indefinido','fijo','obra','aprendiz')),
  hire_date     DATE        NOT NULL,
  availability  JSONB       NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.shifts (
  id            TEXT        PRIMARY KEY,
  employee_id   TEXT        NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  date          DATE        NOT NULL,
  start_hour    INTEGER     NOT NULL DEFAULT 8,
  end_hour      INTEGER     NOT NULL DEFAULT 16,
  break_minutes INTEGER     NOT NULL DEFAULT 60,
  code          TEXT        NOT NULL DEFAULT 'STD',
  locked        BOOLEAN     NOT NULL DEFAULT false,
  note          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (employee_id, date)
);

CREATE TABLE public.absences (
  id          TEXT        PRIMARY KEY,
  employee_id TEXT        NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  type        TEXT        NOT NULL
                CHECK (type IN ('vacaciones','incapacidad','licencia','permiso','no_remunerada','compensatorio')),
  start_date  DATE        NOT NULL,
  end_date    DATE        NOT NULL,
  start_hour  INTEGER,
  end_hour    INTEGER,
  reason      TEXT        NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 2. NOTIFICACIONES ───────────────────────────────────────────

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

-- ── 3. USER PROFILES ────────────────────────────────────────────

CREATE TABLE public.user_profiles (
  id         UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      TEXT        NOT NULL,
  full_name  TEXT        NOT NULL DEFAULT '',
  role_id    TEXT        NOT NULL DEFAULT 'consulta'
               CHECK (role_id IN ('admin','supervisor','lider','gestor','consulta')),
  area_id    TEXT        REFERENCES public.areas(id) ON DELETE SET NULL,
  is_active  BOOLEAN     NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ON public.user_profiles(email);
CREATE INDEX ON public.user_profiles(role_id);

-- ── 4. MÓDULO JORNADA ───────────────────────────────────────────

CREATE TABLE public.jornada_horarios (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre           VARCHAR(100) NOT NULL,
  tipo_jornada     VARCHAR(50)  NOT NULL DEFAULT 'completa',
  hora_entrada     TIME,
  hora_salida      TIME,
  break_inicio     TIME,
  break_fin        TIME,
  almuerzo_inicio  TIME,
  almuerzo_fin     TIME,
  dias_aplicables  INT[]        DEFAULT '{1,2,3,4,5}',
  area_id          TEXT         REFERENCES public.areas(id) ON DELETE SET NULL,
  cargo            VARCHAR(100),
  turno            VARCHAR(50),
  activo           BOOLEAN      NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE public.jornada_horarios_empleado (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id  TEXT        NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  horario_id   UUID        NOT NULL REFERENCES public.jornada_horarios(id) ON DELETE CASCADE,
  fecha_inicio DATE        NOT NULL,
  fecha_fin    DATE,
  activo       BOOLEAN     NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.jornada_registros (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id          TEXT        NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  fecha                DATE        NOT NULL,
  hora_exacta          TIMESTAMPTZ NOT NULL,
  tipo_movimiento      VARCHAR(50) NOT NULL,
  area_id              TEXT        REFERENCES public.areas(id) ON DELETE SET NULL,
  usuario_registro_id  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  observaciones        TEXT,
  estado               VARCHAR(50) NOT NULL DEFAULT 'valido',
  es_modificacion      BOOLEAN     NOT NULL DEFAULT false,
  registro_original_id UUID        REFERENCES public.jornada_registros(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ON public.jornada_registros(employee_id, fecha);
CREATE INDEX ON public.jornada_registros(fecha);

CREATE TABLE public.jornada_modificaciones (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  registro_id        UUID        NOT NULL REFERENCES public.jornada_registros(id) ON DELETE CASCADE,
  usuario_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fecha_modificacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  motivo             TEXT        NOT NULL,
  campo_modificado   VARCHAR(100),
  valor_anterior     TEXT,
  valor_nuevo        TEXT
);

CREATE TABLE public.jornada_cupos (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id         TEXT        REFERENCES public.areas(id) ON DELETE CASCADE,
  tipo            VARCHAR(50) NOT NULL,
  max_simultaneos INT         NOT NULL DEFAULT 3,
  cargo           VARCHAR(100),
  turno           VARCHAR(50),
  hora_inicio     TIME,
  hora_fin        TIME,
  activo          BOOLEAN     NOT NULL DEFAULT true
);

CREATE TABLE public.jornada_configuracion (
  id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id                     TEXT        REFERENCES public.areas(id) ON DELETE CASCADE,
  tolerancia_llegada_min      INT         NOT NULL DEFAULT 15,
  tiempo_max_break_min        INT         NOT NULL DEFAULT 15,
  tiempo_max_almuerzo_min     INT         NOT NULL DEFAULT 60,
  dias_laborales              INT[]       NOT NULL DEFAULT '{1,2,3,4,5}',
  hora_inicio_jornada         TIME        NOT NULL DEFAULT '08:00',
  hora_fin_jornada            TIME        NOT NULL DEFAULT '18:00',
  requiere_aprobacion_edicion BOOLEAN     NOT NULL DEFAULT true,
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Configuración global por defecto
INSERT INTO public.jornada_configuracion
  (tolerancia_llegada_min, tiempo_max_break_min, tiempo_max_almuerzo_min)
VALUES (15, 15, 60);

-- ── 5. ROW LEVEL SECURITY ───────────────────────────────────────

ALTER TABLE public.areas                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shifts                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.absences                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jornada_horarios          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jornada_horarios_empleado ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jornada_registros         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jornada_modificaciones    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jornada_cupos             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jornada_configuracion     ENABLE ROW LEVEL SECURITY;

-- WFM (authenticated + service_role)
CREATE POLICY "auth_all_areas"     ON public.areas     FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_employees" ON public.employees FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_shifts"    ON public.shifts    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_absences"  ON public.absences  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "srvc_all_areas"     ON public.areas     FOR ALL TO service_role  USING (true);
CREATE POLICY "srvc_all_employees" ON public.employees FOR ALL TO service_role  USING (true);
CREATE POLICY "srvc_all_shifts"    ON public.shifts    FOR ALL TO service_role  USING (true);
CREATE POLICY "srvc_all_absences"  ON public.absences  FOR ALL TO service_role  USING (true);

-- Notificaciones
CREATE POLICY "auth_select_notifications" ON public.notifications FOR SELECT    TO authenticated USING (user_id = auth.uid()::text);
CREATE POLICY "auth_update_notifications" ON public.notifications FOR UPDATE    TO authenticated USING (user_id = auth.uid()::text);
CREATE POLICY "auth_delete_notifications" ON public.notifications FOR DELETE    TO authenticated USING (user_id = auth.uid()::text);
CREATE POLICY "srvc_all_notifications"    ON public.notifications FOR ALL       TO service_role  USING (true);

-- user_profiles
CREATE POLICY "auth_select_profiles" ON public.user_profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_update_own"      ON public.user_profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "srvc_all_profiles"    ON public.user_profiles FOR ALL    TO service_role  USING (true);

-- Jornada
CREATE POLICY "auth_all_jornada_horarios"     ON public.jornada_horarios         FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_jornada_he"           ON public.jornada_horarios_empleado FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_jornada_registros"    ON public.jornada_registros         FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_jornada_modif"        ON public.jornada_modificaciones    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_jornada_cupos"        ON public.jornada_cupos             FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_jornada_config"       ON public.jornada_configuracion     FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "srvc_all_jornada_horarios"     ON public.jornada_horarios         FOR ALL TO service_role  USING (true);
CREATE POLICY "srvc_all_jornada_he"           ON public.jornada_horarios_empleado FOR ALL TO service_role  USING (true);
CREATE POLICY "srvc_all_jornada_registros"    ON public.jornada_registros         FOR ALL TO service_role  USING (true);
CREATE POLICY "srvc_all_jornada_modif"        ON public.jornada_modificaciones    FOR ALL TO service_role  USING (true);
CREATE POLICY "srvc_all_jornada_cupos"        ON public.jornada_cupos             FOR ALL TO service_role  USING (true);
CREATE POLICY "srvc_all_jornada_config"       ON public.jornada_configuracion     FOR ALL TO service_role  USING (true);

-- ── 6. FUNCIÓN: crear perfil al registrar usuario ───────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── 7. FUNCIÓN: helper is_admin ─────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT COALESCE(
    (SELECT is_active AND role_id = 'admin'
     FROM public.user_profiles
     WHERE id = auth.uid()),
    false
  )
$$;

-- ── 8. VERIFICACIÓN FINAL ───────────────────────────────────────

SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
