-- =============================================================
-- Smart Shift Pro — Crear usuario administrador de prueba
-- Ejecutar en: Supabase Dashboard > SQL Editor > New query
-- IMPORTANTE: ejecutar DESPUÉS de schema_auth.sql
-- =============================================================
-- Credenciales que se crearán:
--   Email    : admin@wfm.local
--   Contraseña: Admin2024!
-- Cambia los valores antes de ejecutar si lo prefieres.
-- =============================================================

DO $$
DECLARE
  v_uid  UUID := gen_random_uuid();
  v_email TEXT := 'admin@wfm.local';
  v_pass  TEXT := 'Admin2024!';
  v_name  TEXT := 'Administrador WFM';
BEGIN

  -- ── 1. Insertar en auth.users (email ya confirmado) ──────────
  INSERT INTO auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,        -- confirmado desde el principio
    raw_app_meta_data,
    raw_user_meta_data,
    is_super_admin,
    created_at,
    updated_at
  ) VALUES (
    v_uid,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    v_email,
    crypt(v_pass, gen_salt('bf')),  -- hash bcrypt seguro
    NOW(),
    '{"provider":"email","providers":["email"]}',
    json_build_object('full_name', v_name),
    false,
    NOW(),
    NOW()
  );

  -- ── 2. Insertar identidad email (necesario para login) ───────
  INSERT INTO auth.identities (
    id,
    provider_id,
    user_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  ) VALUES (
    gen_random_uuid(),
    v_email,                    -- para email auth, provider_id = email
    v_uid,
    json_build_object(
      'sub',            v_uid::text,
      'email',          v_email,
      'email_verified', true,
      'provider',       'email'
    ),
    'email',
    NOW(),
    NOW(),
    NOW()
  );

  -- ── 3. Crear perfil con rol admin ────────────────────────────
  INSERT INTO user_profiles (id, email, full_name, role_id, is_active)
  VALUES (v_uid, v_email, v_name, 'admin', true);

  RAISE NOTICE '✓ Usuario administrador creado exitosamente';
  RAISE NOTICE '  Email     : %', v_email;
  RAISE NOTICE '  Contraseña: %', v_pass;
  RAISE NOTICE '  UUID      : %', v_uid;

END;
$$;
