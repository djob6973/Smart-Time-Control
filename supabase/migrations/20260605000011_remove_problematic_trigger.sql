-- =============================================================
-- Smart Shift Pro — Eliminar trigger problemático en user_profiles
-- Ejecutar en: Supabase Dashboard > SQL Editor > New query
-- =============================================================

-- Eliminar el trigger problemático
DROP TRIGGER IF EXISTS user_profiles_updated_at ON user_profiles;
