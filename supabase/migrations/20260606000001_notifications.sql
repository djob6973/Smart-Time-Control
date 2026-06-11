-- =============================================================
-- Smart Shift Pro — Notifications Table
-- =============================================================

-- ── NOTIFICATIONS TABLE ───────────────────────────────────────
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

-- ── INDEXES ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

-- ── ROW LEVEL SECURITY ───────────────────────────────────────────
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Políticas permisivas para la clave anon (fase de desarrollo)
CREATE POLICY "anon_all_notifications" ON notifications FOR ALL TO anon USING (true) WITH CHECK (true);
