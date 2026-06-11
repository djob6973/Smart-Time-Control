-- =============================================================
-- Smart Shift Pro — Recrear updated_at sin triggers
-- Ejecutar en: Supabase Dashboard > SQL Editor > New query
-- =============================================================

-- Recrear el campo updated_at sin ningún trigger
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
