-- Historial de cambios por turno
-- Registra cada upsertShift con el estado resultante, timestamp y userId

CREATE TABLE IF NOT EXISTS shift_history (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id      TEXT        NOT NULL,
  employee_id   TEXT        NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  date          DATE        NOT NULL,
  changed_by    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  start_hour    INTEGER     NOT NULL,
  end_hour      INTEGER     NOT NULL,
  break_minutes INTEGER     NOT NULL,
  code          TEXT        NOT NULL,
  locked        BOOLEAN     NOT NULL DEFAULT false,
  note          TEXT
);

CREATE INDEX IF NOT EXISTS idx_shift_history_emp_date   ON shift_history(employee_id, date);
CREATE INDEX IF NOT EXISTS idx_shift_history_changed_at ON shift_history(changed_at DESC);

ALTER TABLE shift_history ENABLE ROW LEVEL SECURITY;

-- Usuarios autenticados pueden leer todo el historial de su organización
CREATE POLICY "shift_history_select" ON shift_history
  FOR SELECT TO authenticated USING (true);

-- Solo puede insertar filas donde changed_by sea el usuario actual
CREATE POLICY "shift_history_insert" ON shift_history
  FOR INSERT TO authenticated
  WITH CHECK (changed_by = auth.uid() OR changed_by IS NULL);
