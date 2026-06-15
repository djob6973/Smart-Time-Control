import { execute } from "./db";

let done = false;

export async function runMigration(): Promise<void> {
  if (done) return;

  // ── Extensiones ─────────────────────────────────────────────────────────────
  await execute(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);

  // ── Tablas base de la aplicación ─────────────────────────────────────────────

  await execute(`
    CREATE TABLE IF NOT EXISTS public.areas (
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
    )
  `);

  await execute(`
    CREATE TABLE IF NOT EXISTS public.employees (
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
    )
  `);

  await execute(`
    CREATE TABLE IF NOT EXISTS public.shifts (
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
    )
  `);

  await execute(`
    CREATE TABLE IF NOT EXISTS public.absences (
      id          TEXT        PRIMARY KEY,
      employee_id TEXT        NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
      type        TEXT        NOT NULL
                    CHECK (type IN ('vacaciones','incapacidad','licencia','permiso','no_remunerada','compensatorio')),
      start_date  DATE        NOT NULL,
      end_date    DATE        NOT NULL,
      start_hour  INTEGER,
      end_hour    INTEGER,
      reason      TEXT        NOT NULL DEFAULT '',
      status      TEXT        NOT NULL DEFAULT 'pendiente'
                    CHECK (status IN ('pendiente','aprobada','rechazada')),
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await execute(`
    CREATE TABLE IF NOT EXISTS public.shift_history (
      id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      shift_id      TEXT        NOT NULL,
      employee_id   TEXT        NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
      date          DATE        NOT NULL,
      changed_by    UUID,
      changed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      start_hour    INTEGER     NOT NULL,
      end_hour      INTEGER     NOT NULL,
      break_minutes INTEGER     NOT NULL,
      code          TEXT        NOT NULL,
      locked        BOOLEAN     NOT NULL DEFAULT false,
      note          TEXT
    )
  `);

  await execute(`CREATE INDEX IF NOT EXISTS idx_shift_history_emp_date   ON public.shift_history(employee_id, date)`);
  await execute(`CREATE INDEX IF NOT EXISTS idx_shift_history_changed_at ON public.shift_history(changed_at DESC)`);

  await execute(`
    CREATE TABLE IF NOT EXISTS public.report_approvals (
      id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      row_id     TEXT        NOT NULL UNIQUE,
      date       DATE        NOT NULL,
      status     TEXT        NOT NULL DEFAULT 'Pendiente'
                   CHECK (status IN ('Pendiente', 'Aprobada', 'No aprobada')),
      changed_by UUID,
      changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await execute(`CREATE INDEX IF NOT EXISTS idx_report_approvals_date ON public.report_approvals(date)`);

  await execute(`
    CREATE TABLE IF NOT EXISTS public.notifications (
      id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id    TEXT        NOT NULL,
      type       TEXT        NOT NULL CHECK (type IN ('info','success','warning','error')),
      title      TEXT        NOT NULL,
      body       TEXT        NOT NULL DEFAULT '',
      data       JSONB       NOT NULL DEFAULT '{}',
      read       BOOLEAN     NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await execute(`CREATE INDEX IF NOT EXISTS idx_notifications_user_id    ON public.notifications(user_id)`);
  await execute(`CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at DESC)`);

  // ── RBAC ─────────────────────────────────────────────────────────────────────

  await execute(`
    CREATE TABLE IF NOT EXISTS public.roles (
      id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      nombre      TEXT        UNIQUE NOT NULL,
      descripcion TEXT,
      permisos    JSONB       NOT NULL DEFAULT '{}',
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await execute(`
    INSERT INTO public.roles (nombre, descripcion, permisos) VALUES
      ('admin', 'Administrador con acceso completo',
       '{"dashboard":"full","scheduler":"full","mi_horario":"view","employees":"full","areas":"full","absences":"full","reports":"full","jornada":"full","jornada_dashboard":"full","jornada_registro":"full","jornada_historial":"full","jornada_reportes":"full","jornada_configuracion":"full","mi_jornada_reportes":"view","settings":"full","settings_roles":"full","settings_users":"full","settings_data":"full","restrictToOwnArea":false,"canApproveAbsences":true,"canGenerateShifts":true,"canExportReports":true,"canManageRoles":true,"canDeleteData":true}'),
      ('supervisor', 'Supervisor operacional',
       '{"dashboard":"view","scheduler":"edit","mi_horario":"view","employees":"edit","areas":"view","absences":"edit","reports":"view","jornada":"edit","jornada_dashboard":"view","jornada_registro":"edit","jornada_historial":"edit","jornada_reportes":"view","jornada_configuracion":"none","mi_jornada_reportes":"view","settings":"view","settings_roles":"none","settings_users":"none","settings_data":"none","restrictToOwnArea":true,"canApproveAbsences":true,"canGenerateShifts":true,"canExportReports":true,"canManageRoles":false,"canDeleteData":false}'),
      ('lider', 'Líder de área',
       '{"dashboard":"view","scheduler":"edit","mi_horario":"view","employees":"view","areas":"view","absences":"edit","reports":"view","jornada":"edit","jornada_dashboard":"view","jornada_registro":"edit","jornada_historial":"view","jornada_reportes":"view","jornada_configuracion":"none","mi_jornada_reportes":"view","settings":"none","settings_roles":"none","settings_users":"none","settings_data":"none","restrictToOwnArea":true,"canApproveAbsences":false,"canGenerateShifts":false,"canExportReports":false,"canManageRoles":false,"canDeleteData":false}'),
      ('gestor', 'Gestor de turnos',
       '{"dashboard":"view","scheduler":"edit","mi_horario":"view","employees":"view","areas":"view","absences":"view","reports":"view","jornada":"edit","jornada_dashboard":"view","jornada_registro":"edit","jornada_historial":"view","jornada_reportes":"none","jornada_configuracion":"none","mi_jornada_reportes":"view","settings":"none","settings_roles":"none","settings_users":"none","settings_data":"none","restrictToOwnArea":false,"canApproveAbsences":false,"canGenerateShifts":false,"canExportReports":false,"canManageRoles":false,"canDeleteData":false}'),
      ('consulta', 'Acceso de sólo lectura',
       '{"dashboard":"view","scheduler":"view","mi_horario":"view","employees":"view","areas":"view","absences":"view","reports":"view","jornada":"view","jornada_dashboard":"view","jornada_registro":"none","jornada_historial":"view","jornada_reportes":"none","jornada_configuracion":"none","mi_jornada_reportes":"view","settings":"none","settings_roles":"none","settings_users":"none","settings_data":"none","restrictToOwnArea":false,"canApproveAbsences":false,"canGenerateShifts":false,"canExportReports":false,"canManageRoles":false,"canDeleteData":false}')
    ON CONFLICT (nombre) DO NOTHING
  `);

  // ── Perfiles de usuario ───────────────────────────────────────────────────────

  await execute(`
    CREATE TABLE IF NOT EXISTS public.user_profiles (
      id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      email                    TEXT        NOT NULL UNIQUE,
      nombre                   TEXT        NOT NULL DEFAULT '',
      full_name                TEXT        NOT NULL DEFAULT '',
      activo                   BOOLEAN     NOT NULL DEFAULT true,
      is_active                BOOLEAN     NOT NULL DEFAULT true,
      role_id                  TEXT,
      area_id                  TEXT        REFERENCES public.areas(id) ON DELETE SET NULL,
      employee_id              TEXT        REFERENCES public.employees(id) ON DELETE SET NULL,
      password_hash            TEXT,
      reset_token              TEXT,
      reset_token_expires_at   TIMESTAMPTZ,
      created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await execute(`CREATE INDEX IF NOT EXISTS idx_user_profiles_email  ON public.user_profiles(email)`);
  await execute(`CREATE INDEX IF NOT EXISTS idx_user_profiles_activo ON public.user_profiles(activo)`);

  // Columnas de auth para DBs pre-existentes (no-op si ya existen)
  await execute(`ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS password_hash TEXT`);
  await execute(`ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS reset_token TEXT`);
  await execute(`ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS reset_token_expires_at TIMESTAMPTZ`);

  // ── Sesiones ─────────────────────────────────────────────────────────────────

  await execute(`
    CREATE TABLE IF NOT EXISTS public.sessions (
      token       TEXT        PRIMARY KEY,
      user_id     TEXT        NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at  TIMESTAMPTZ NOT NULL
    )
  `);

  await execute(`CREATE INDEX IF NOT EXISTS idx_sessions_user_id    ON public.sessions(user_id)`);
  await execute(`CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON public.sessions(expires_at)`);

  // ── Organizaciones ───────────────────────────────────────────────────────────

  await execute(`
    CREATE TABLE IF NOT EXISTS public.organizations (
      id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      nombre         TEXT        NOT NULL,
      slug           TEXT        NOT NULL UNIQUE,
      activo         BOOLEAN     NOT NULL DEFAULT true,
      plan           TEXT        NOT NULL DEFAULT 'free',
      config         JSONB       NOT NULL DEFAULT '{}',
      creado_en      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await execute(`
    INSERT INTO public.organizations (id, nombre, slug, plan)
    VALUES ('00000000-0000-0000-0000-000000000001', 'Default Organization', 'default', 'pro')
    ON CONFLICT DO NOTHING
  `);

  await execute(`
    CREATE TABLE IF NOT EXISTS public.user_roles (
      user_id         UUID        NOT NULL,
      role_id         UUID        NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
      organization_id UUID,
      assigned_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      assigned_by     UUID,
      PRIMARY KEY (user_id, role_id)
    )
  `);

  await execute(`CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id)`);

  await execute(`
    CREATE TABLE IF NOT EXISTS public.user_organizations (
      user_id         UUID        NOT NULL,
      organization_id UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
      activo          BOOLEAN     NOT NULL DEFAULT true,
      creado_en       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, organization_id)
    )
  `);

  await execute(`CREATE INDEX IF NOT EXISTS idx_user_orgs_user ON public.user_organizations(user_id)`);
  await execute(`CREATE INDEX IF NOT EXISTS idx_user_orgs_org  ON public.user_organizations(organization_id)`);

  // ── Módulo Jornada ───────────────────────────────────────────────────────────

  await execute(`
    CREATE TABLE IF NOT EXISTS public.jornada_horarios (
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
    )
  `);

  await execute(`
    CREATE TABLE IF NOT EXISTS public.jornada_horarios_empleado (
      id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      employee_id  TEXT        NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
      horario_id   UUID        NOT NULL REFERENCES public.jornada_horarios(id) ON DELETE CASCADE,
      fecha_inicio DATE        NOT NULL,
      fecha_fin    DATE,
      activo       BOOLEAN     NOT NULL DEFAULT true,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await execute(`
    CREATE TABLE IF NOT EXISTS public.jornada_registros (
      id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      employee_id          TEXT        NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
      fecha                DATE        NOT NULL,
      hora_exacta          TIMESTAMPTZ NOT NULL,
      tipo_movimiento      VARCHAR(50) NOT NULL,
      area_id              TEXT        REFERENCES public.areas(id) ON DELETE SET NULL,
      usuario_registro_id  UUID,
      observaciones        TEXT,
      estado               VARCHAR(50) NOT NULL DEFAULT 'valido',
      es_modificacion      BOOLEAN     NOT NULL DEFAULT false,
      registro_original_id UUID        REFERENCES public.jornada_registros(id) ON DELETE SET NULL,
      created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await execute(`CREATE INDEX IF NOT EXISTS idx_jornada_registros_emp_fecha ON public.jornada_registros(employee_id, fecha)`);
  await execute(`CREATE INDEX IF NOT EXISTS idx_jornada_registros_fecha     ON public.jornada_registros(fecha)`);

  await execute(`
    CREATE TABLE IF NOT EXISTS public.jornada_modificaciones (
      id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      registro_id        UUID,
      usuario_id         UUID        NOT NULL,
      fecha_modificacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      motivo             TEXT        NOT NULL,
      campo_modificado   VARCHAR(100),
      valor_anterior     TEXT,
      valor_nuevo        TEXT
    )
  `);

  // Migración para instancias existentes: eliminar FK CASCADE para que el audit
  // trail persista al borrar un registro (sin CASCADE el registro_id queda intacto).
  await execute(`ALTER TABLE public.jornada_modificaciones DROP CONSTRAINT IF EXISTS jornada_modificaciones_registro_id_fkey`);
  await execute(`ALTER TABLE public.jornada_modificaciones ALTER COLUMN registro_id DROP NOT NULL`);

  await execute(`
    CREATE TABLE IF NOT EXISTS public.jornada_cupos (
      id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      area_id         TEXT        REFERENCES public.areas(id) ON DELETE CASCADE,
      tipo            VARCHAR(50) NOT NULL,
      max_simultaneos INT         NOT NULL DEFAULT 3,
      cargo           VARCHAR(100),
      turno           VARCHAR(50),
      hora_inicio     TIME,
      hora_fin        TIME,
      activo          BOOLEAN     NOT NULL DEFAULT true
    )
  `);

  await execute(`
    CREATE TABLE IF NOT EXISTS public.jornada_configuracion (
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
    )
  `);

  await execute(`
    INSERT INTO public.jornada_configuracion
      (tolerancia_llegada_min, tiempo_max_break_min, tiempo_max_almuerzo_min)
    VALUES (15, 15, 60)
    ON CONFLICT DO NOTHING
  `);

  // ── Trigger updated_at para user_profiles ────────────────────────────────────

  await execute(`
    CREATE OR REPLACE FUNCTION public.update_timestamp()
    RETURNS TRIGGER LANGUAGE plpgsql AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$
  `);

  await execute(`DROP TRIGGER IF EXISTS user_profiles_updated_at ON public.user_profiles`);
  await execute(`
    CREATE TRIGGER user_profiles_updated_at
      BEFORE UPDATE ON public.user_profiles
      FOR EACH ROW EXECUTE FUNCTION public.update_timestamp()
  `);

  done = true; // solo se marca como completada si todo tuvo éxito
}
