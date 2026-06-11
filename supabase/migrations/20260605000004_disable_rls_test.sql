-- =============================================================
-- Smart Shift Pro — Deshabilitar RLS temporalmente para testing
-- Ejecutar en: Supabase Dashboard > SQL Editor > New query
-- =============================================================

-- Deshabilitar RLS en user_profiles temporalmente
ALTER TABLE user_profiles DISABLE ROW LEVEL SECURITY;
