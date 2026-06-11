-- =============================================================
-- Smart Shift Pro — Deshabilitar RLS completamente en user_profiles
-- Ejecutar en: Supabase Dashboard > SQL Editor > New query
-- =============================================================

-- Deshabilitar RLS completamente en user_profiles
ALTER TABLE user_profiles DISABLE ROW LEVEL SECURITY;
