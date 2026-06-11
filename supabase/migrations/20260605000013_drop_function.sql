-- =============================================================
-- Smart Shift Pro — Eliminar función update_user_profiles_ts
-- Ejecutar en: Supabase Dashboard > SQL Editor > New query
-- =============================================================

-- Eliminar la función problemática
DROP FUNCTION IF EXISTS update_user_profiles_ts();
