-- Aprobaciones de novedades en reportes
-- row_id: "{employeeId}-{date}-{code}" — clave determinista por turno+novedad
-- date: columna separada para queries eficientes por rango de fechas

CREATE TABLE IF NOT EXISTS report_approvals (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  row_id     TEXT        NOT NULL UNIQUE,
  date       DATE        NOT NULL,
  status     TEXT        NOT NULL DEFAULT 'Pendiente'
               CHECK (status IN ('Pendiente', 'Aprobada', 'No aprobada')),
  changed_by UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_report_approvals_date ON report_approvals(date);

ALTER TABLE report_approvals ENABLE ROW LEVEL SECURITY;

-- Cualquier usuario autenticado puede leer todas las aprobaciones
CREATE POLICY "report_approvals_select" ON report_approvals
  FOR SELECT TO authenticated USING (true);

-- Cualquier usuario autenticado puede crear/actualizar aprobaciones
CREATE POLICY "report_approvals_upsert" ON report_approvals
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (changed_by = auth.uid() OR changed_by IS NULL);
