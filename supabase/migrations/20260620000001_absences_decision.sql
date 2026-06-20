-- Agrega campos de decisión a ausencias: nota, quién aprobó/rechazó y cuándo
ALTER TABLE absences
  ADD COLUMN IF NOT EXISTS decision_note TEXT,
  ADD COLUMN IF NOT EXISTS decided_by    TEXT,
  ADD COLUMN IF NOT EXISTS decided_at    TIMESTAMPTZ;
