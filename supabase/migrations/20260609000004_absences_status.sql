-- Agrega columna status a absences (faltaba desde la creación de la tabla)
ALTER TABLE absences
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (status IN ('pendiente', 'aprobada', 'rechazada'));
