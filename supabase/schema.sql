-- =============================================================
-- Smart Shift Pro — Schema Supabase
-- Ejecutar en: Supabase Dashboard > SQL Editor > New query
-- =============================================================

-- ── AREAS ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS areas (
  id               TEXT PRIMARY KEY,
  name             TEXT        NOT NULL,
  leader           TEXT        NOT NULL DEFAULT '',
  start_hour       INTEGER     NOT NULL DEFAULT 8,
  end_hour         INTEGER     NOT NULL DEFAULT 18,
  working_days     INTEGER[]   NOT NULL DEFAULT '{1,2,3,4,5,6}',
  max_hours_day    INTEGER     NOT NULL DEFAULT 8,
  max_hours_week   INTEGER     NOT NULL DEFAULT 46,
  max_hours_month  INTEGER     NOT NULL DEFAULT 192,
  allow_overtime   BOOLEAN     NOT NULL DEFAULT false,
  allow_sunday     BOOLEAN     NOT NULL DEFAULT false,
  min_rest_hours   INTEGER     NOT NULL DEFAULT 8,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── EMPLOYEES ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employees (
  id              TEXT PRIMARY KEY,
  full_name       TEXT        NOT NULL,
  document_id     TEXT        NOT NULL DEFAULT '',
  position        TEXT        NOT NULL DEFAULT '',
  area_id         TEXT        REFERENCES areas(id) ON DELETE SET NULL,
  leader          TEXT        NOT NULL DEFAULT '',
  status          TEXT        NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'inactive')),
  contract_type   TEXT        NOT NULL DEFAULT 'indefinido'
                    CHECK (contract_type IN ('indefinido', 'fijo', 'obra', 'aprendiz')),
  hire_date       DATE        NOT NULL,
  availability    JSONB       NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── SHIFTS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shifts (
  id              TEXT PRIMARY KEY,
  employee_id     TEXT        NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  date            DATE        NOT NULL,
  start_hour      INTEGER     NOT NULL DEFAULT 8,
  end_hour        INTEGER     NOT NULL DEFAULT 16,
  break_minutes   INTEGER     NOT NULL DEFAULT 60,
  code            TEXT        NOT NULL DEFAULT 'STD',
  locked          BOOLEAN     NOT NULL DEFAULT false,
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (employee_id, date)
);

-- ── ABSENCES ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS absences (
  id              TEXT PRIMARY KEY,
  employee_id     TEXT        NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  type            TEXT        NOT NULL
                    CHECK (type IN ('vacaciones','incapacidad','licencia','permiso','no_remunerada','compensatorio')),
  start_date      DATE        NOT NULL,
  end_date        DATE        NOT NULL,
  start_hour      INTEGER,
  end_hour        INTEGER,
  reason          TEXT        NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── NOTIFICATIONS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id              TEXT PRIMARY KEY,
  user_id         TEXT        NOT NULL,
  type            TEXT        NOT NULL
                    CHECK (type IN ('info','success','warning','error')),
  title           TEXT        NOT NULL,
  message         TEXT        NOT NULL,
  read            BOOLEAN     NOT NULL DEFAULT false,
  action_url      TEXT,
  metadata        JSONB       NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── ROW LEVEL SECURITY ────────────────────────────────────────
-- Habilitar RLS en todas las tablas
ALTER TABLE areas     ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE absences  ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Políticas permisivas para la clave anon (fase de desarrollo)
-- IMPORTANTE: En producción con auth real, reemplazar estas políticas
-- por políticas basadas en auth.uid().
CREATE POLICY "anon_all_areas"     ON areas     FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_employees" ON employees FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_shifts"    ON shifts    FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_absences"  ON absences  FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_notifications" ON notifications FOR ALL TO anon USING (true) WITH CHECK (true);
