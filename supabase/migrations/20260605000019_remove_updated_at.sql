-- =============================================================
-- Smart Shift Pro — Eliminar campo updated_at de user_profiles
-- Ejecutar en: Supabase Dashboard > SQL Editor > New query
-- =============================================================

-- Eliminar el campo updated_at que está causando problemas
ALTER TABLE user_profiles DROP COLUMN IF EXISTS updated_at;
