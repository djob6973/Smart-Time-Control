-- =========================================================
-- Módulo: Gestión y Seguimiento de Jornada Laboral
-- =========================================================
-- NOTA: areas.id y employees.id son TEXT en este proyecto.
-- Las tablas propias del módulo usan UUID para sus propios PKs.
-- auth.users.id es UUID (estándar Supabase).
-- =========================================================

-- Horarios programados (plantillas reutilizables)
CREATE TABLE IF NOT EXISTS jornada_horarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre VARCHAR(100) NOT NULL,
  tipo_jornada VARCHAR(50) NOT NULL DEFAULT 'completa',
  hora_entrada TIME,
  hora_salida TIME,
  break_inicio TIME,
  break_fin TIME,
  almuerzo_inicio TIME,
  almuerzo_fin TIME,
  dias_aplicables INT[] DEFAULT '{1,2,3,4,5}',
  area_id TEXT REFERENCES areas(id) ON DELETE SET NULL,
  cargo VARCHAR(100),
  turno VARCHAR(50),
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Asignación de horario por empleado
CREATE TABLE IF NOT EXISTS jornada_horarios_empleado (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  horario_id UUID NOT NULL REFERENCES jornada_horarios(id) ON DELETE CASCADE,
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Registros de jornada (marcaciones reales)
CREATE TABLE IF NOT EXISTS jornada_registros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  fecha DATE NOT NULL,
  hora_exacta TIMESTAMPTZ NOT NULL,
  tipo_movimiento VARCHAR(50) NOT NULL,
  area_id TEXT REFERENCES areas(id) ON DELETE SET NULL,
  usuario_registro_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  observaciones TEXT,
  estado VARCHAR(50) NOT NULL DEFAULT 'valido',
  es_modificacion BOOLEAN NOT NULL DEFAULT false,
  registro_original_id UUID REFERENCES jornada_registros(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS jornada_registros_employee_fecha ON jornada_registros(employee_id, fecha);
CREATE INDEX IF NOT EXISTS jornada_registros_fecha ON jornada_registros(fecha);

-- Auditoría de modificaciones manuales
CREATE TABLE IF NOT EXISTS jornada_modificaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registro_id UUID NOT NULL REFERENCES jornada_registros(id) ON DELETE CASCADE,
  usuario_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fecha_modificacion TIMESTAMPTZ NOT NULL DEFAULT now(),
  motivo TEXT NOT NULL,
  campo_modificado VARCHAR(100),
  valor_anterior TEXT,
  valor_nuevo TEXT
);

-- Control de cupos simultáneos (break / almuerzo)
CREATE TABLE IF NOT EXISTS jornada_cupos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id TEXT REFERENCES areas(id) ON DELETE CASCADE,
  tipo VARCHAR(50) NOT NULL,
  max_simultaneos INT NOT NULL DEFAULT 3,
  cargo VARCHAR(100),
  turno VARCHAR(50),
  hora_inicio TIME,
  hora_fin TIME,
  activo BOOLEAN NOT NULL DEFAULT true
);

-- Configuración global / por área
CREATE TABLE IF NOT EXISTS jornada_configuracion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id TEXT REFERENCES areas(id) ON DELETE CASCADE,
  tolerancia_llegada_min INT NOT NULL DEFAULT 15,
  tiempo_max_break_min INT NOT NULL DEFAULT 15,
  tiempo_max_almuerzo_min INT NOT NULL DEFAULT 60,
  dias_laborales INT[] NOT NULL DEFAULT '{1,2,3,4,5}',
  hora_inicio_jornada TIME NOT NULL DEFAULT '08:00',
  hora_fin_jornada TIME NOT NULL DEFAULT '18:00',
  requiere_aprobacion_edicion BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Configuración global por defecto
INSERT INTO jornada_configuracion (tolerancia_llegada_min, tiempo_max_break_min, tiempo_max_almuerzo_min)
VALUES (15, 15, 60)
ON CONFLICT DO NOTHING;

-- RLS
ALTER TABLE jornada_horarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE jornada_horarios_empleado ENABLE ROW LEVEL SECURITY;
ALTER TABLE jornada_registros ENABLE ROW LEVEL SECURITY;
ALTER TABLE jornada_modificaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE jornada_cupos ENABLE ROW LEVEL SECURITY;
ALTER TABLE jornada_configuracion ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read jornada_horarios" ON jornada_horarios FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write jornada_horarios" ON jornada_horarios FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated read jornada_horarios_empleado" ON jornada_horarios_empleado FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write jornada_horarios_empleado" ON jornada_horarios_empleado FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated read jornada_registros" ON jornada_registros FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write jornada_registros" ON jornada_registros FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated read jornada_modificaciones" ON jornada_modificaciones FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write jornada_modificaciones" ON jornada_modificaciones FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated read jornada_cupos" ON jornada_cupos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write jornada_cupos" ON jornada_cupos FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated read jornada_configuracion" ON jornada_configuracion FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write jornada_configuracion" ON jornada_configuracion FOR ALL TO authenticated USING (true) WITH CHECK (true);
