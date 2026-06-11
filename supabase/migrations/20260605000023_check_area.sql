-- =============================================================
-- Smart Shift Pro — Verificar si el área existe
-- Ejecutar en: Supabase Dashboard > SQL Editor > New query
-- =============================================================

-- Verificar si el área existe
SELECT * FROM areas WHERE id = 'area-1780433596018';

-- Listar todas las áreas disponibles
SELECT id, name FROM areas LIMIT 10;
