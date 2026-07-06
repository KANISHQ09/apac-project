-- =============================================================================
-- Migration: Admin Mock Seed — Development / Testing ONLY
-- =============================================================================
-- Seeds 7 pre-confirmed administrative accounts with minimal, robust schema.
--
-- ┌──────────────────────────────┬─────────────────────────────────────┬────────────────────────────┬────────────────┐
-- │  Role                        │  Email                              │  Password                  │  Department    │
-- ├──────────────────────────────┼─────────────────────────────────────┼────────────────────────────┼────────────────┤
-- │  super_admin                 │  admin@samadhan.gov.in              │  Samadhan@Admin2024!       │  all           │
-- │  department_admin            │  water@samadhan.gov.in              │  Samadhan@Water2024!       │  water_supply  │
-- │  department_admin            │  sanitation@samadhan.gov.in         │  Samadhan@Sanitation2024!  │  sanitation    │
-- │  department_admin            │  electricity@samadhan.gov.in        │  Samadhan@Electricity2024! │  electricity   │
-- │  department_admin            │  roads@samadhan.gov.in              │  Samadhan@Roads2024!       │  roads         │
-- │  department_admin            │  parks@samadhan.gov.in              │  Samadhan@Parks2024!       │  parks         │
-- │  department_admin            │  buildings@samadhan.gov.in          │  Samadhan@Buildings2024!   │  buildings     │
-- └──────────────────────────────┴─────────────────────────────────────┴────────────────────────────┴────────────────┘
--
-- ⚠️  NEVER run this migration against a production database.
-- =============================================================================

-- Ensure search path includes extensions (where pgcrypto usually resides) and public/auth
SET search_path TO public, extensions, auth;

-- Ensure pgcrypto is available in search path (install if missing)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  v_super_admin_id   UUID := 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  v_water_id         UUID := 'c1eebc99-9c0b-4ef8-bb6d-6bb9bd380a13';
  v_sanitation_id    UUID := 'c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a14';
  v_electricity_id   UUID := 'c3eebc99-9c0b-4ef8-bb6d-6bb9bd380a15';
  v_roads_id         UUID := 'c4eebc99-9c0b-4ef8-bb6d-6bb9bd380a16';
  v_parks_id         UUID := 'c5eebc99-9c0b-4ef8-bb6d-6bb9bd380a17';
  v_buildings_id     UUID := 'c6eebc99-9c0b-4ef8-bb6d-6bb9bd380a18';
BEGIN

  -- ── Cleanup any prior conflicting entries ─────────────────────────────────
  -- Cascade delete handles removing references from public tables (profiles, user_roles, etc.)
  DELETE FROM auth.users WHERE email IN (
    'admin@samadhan.gov.in',
    'water@samadhan.gov.in',
    'sanitation@samadhan.gov.in',
    'electricity@samadhan.gov.in',
    'roads@samadhan.gov.in',
    'parks@samadhan.gov.in',
    'buildings@samadhan.gov.in'
  );

  -- ── 1. Super Admin ───────────────────────────────────────────────────────
  INSERT INTO auth.users (
    id, email, encrypted_password, email_confirmed_at,
    raw_user_meta_data, raw_app_meta_data, role, aud
  ) VALUES (
    v_super_admin_id,
    'admin@samadhan.gov.in',
    crypt('Samadhan@Admin2024!', gen_salt('bf')),
    now(),
    '{"full_name": "Samadhan Super Admin", "is_mock_seed": true}'::jsonb,
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    'authenticated', 'authenticated'
  );
  INSERT INTO public.profiles (user_id, full_name, city, state)
    VALUES (v_super_admin_id, 'Samadhan Super Admin', 'New Delhi', 'Delhi')
    ON CONFLICT (user_id) DO UPDATE SET
      full_name = EXCLUDED.full_name,
      city = EXCLUDED.city,
      state = EXCLUDED.state;
  INSERT INTO public.notification_preferences (user_id)
    VALUES (v_super_admin_id)
    ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role, department)
    VALUES (v_super_admin_id, 'super_admin', 'all')
    ON CONFLICT (user_id, role) DO UPDATE SET department = 'all';

  -- ── 2. Water Supply Admin ────────────────────────────────────────────────
  INSERT INTO auth.users (
    id, email, encrypted_password, email_confirmed_at,
    raw_user_meta_data, raw_app_meta_data, role, aud
  ) VALUES (
    v_water_id,
    'water@samadhan.gov.in',
    crypt('Samadhan@Water2024!', gen_salt('bf')),
    now(),
    '{"full_name": "Water Supply Admin", "is_mock_seed": true}'::jsonb,
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    'authenticated', 'authenticated'
  );
  INSERT INTO public.profiles (user_id, full_name, city, state)
    VALUES (v_water_id, 'Water Supply Admin', 'Mumbai', 'Maharashtra')
    ON CONFLICT (user_id) DO UPDATE SET
      full_name = EXCLUDED.full_name,
      city = EXCLUDED.city,
      state = EXCLUDED.state;
  INSERT INTO public.notification_preferences (user_id)
    VALUES (v_water_id)
    ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role, department)
    VALUES (v_water_id, 'department_admin', 'water_supply')
    ON CONFLICT (user_id, role) DO UPDATE SET department = 'water_supply';

  -- ── 3. Sanitation Admin ──────────────────────────────────────────────────
  INSERT INTO auth.users (
    id, email, encrypted_password, email_confirmed_at,
    raw_user_meta_data, raw_app_meta_data, role, aud
  ) VALUES (
    v_sanitation_id,
    'sanitation@samadhan.gov.in',
    crypt('Samadhan@Sanitation2024!', gen_salt('bf')),
    now(),
    '{"full_name": "Sanitation Admin", "is_mock_seed": true}'::jsonb,
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    'authenticated', 'authenticated'
  );
  INSERT INTO public.profiles (user_id, full_name, city, state)
    VALUES (v_sanitation_id, 'Sanitation Admin', 'Bengaluru', 'Karnataka')
    ON CONFLICT (user_id) DO UPDATE SET
      full_name = EXCLUDED.full_name,
      city = EXCLUDED.city,
      state = EXCLUDED.state;
  INSERT INTO public.notification_preferences (user_id)
    VALUES (v_sanitation_id)
    ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role, department)
    VALUES (v_sanitation_id, 'department_admin', 'sanitation')
    ON CONFLICT (user_id, role) DO UPDATE SET department = 'sanitation';

  -- ── 4. Electricity Admin ─────────────────────────────────────────────────
  INSERT INTO auth.users (
    id, email, encrypted_password, email_confirmed_at,
    raw_user_meta_data, raw_app_meta_data, role, aud
  ) VALUES (
    v_electricity_id,
    'electricity@samadhan.gov.in',
    crypt('Samadhan@Electricity2024!', gen_salt('bf')),
    now(),
    '{"full_name": "Electricity Admin", "is_mock_seed": true}'::jsonb,
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    'authenticated', 'authenticated'
  );
  INSERT INTO public.profiles (user_id, full_name, city, state)
    VALUES (v_electricity_id, 'Electricity Admin', 'Chennai', 'Tamil Nadu')
    ON CONFLICT (user_id) DO UPDATE SET
      full_name = EXCLUDED.full_name,
      city = EXCLUDED.city,
      state = EXCLUDED.state;
  INSERT INTO public.notification_preferences (user_id)
    VALUES (v_electricity_id)
    ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role, department)
    VALUES (v_electricity_id, 'department_admin', 'electricity')
    ON CONFLICT (user_id, role) DO UPDATE SET department = 'electricity';

  -- ── 5. Roads Admin ───────────────────────────────────────────────────────
  INSERT INTO auth.users (
    id, email, encrypted_password, email_confirmed_at,
    raw_user_meta_data, raw_app_meta_data, role, aud
  ) VALUES (
    v_roads_id,
    'roads@samadhan.gov.in',
    crypt('Samadhan@Roads2024!', gen_salt('bf')),
    now(),
    '{"full_name": "Roads Admin", "is_mock_seed": true}'::jsonb,
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    'authenticated', 'authenticated'
  );
  INSERT INTO public.profiles (user_id, full_name, city, state)
    VALUES (v_roads_id, 'Roads Admin', 'Pune', 'Maharashtra')
    ON CONFLICT (user_id) DO UPDATE SET
      full_name = EXCLUDED.full_name,
      city = EXCLUDED.city,
      state = EXCLUDED.state;
  INSERT INTO public.notification_preferences (user_id)
    VALUES (v_roads_id)
    ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role, department)
    VALUES (v_roads_id, 'department_admin', 'roads')
    ON CONFLICT (user_id, role) DO UPDATE SET department = 'roads';

  -- ── 6. Parks & Gardens Admin ─────────────────────────────────────────────
  INSERT INTO auth.users (
    id, email, encrypted_password, email_confirmed_at,
    raw_user_meta_data, raw_app_meta_data, role, aud
  ) VALUES (
    v_parks_id,
    'parks@samadhan.gov.in',
    crypt('Samadhan@Parks2024!', gen_salt('bf')),
    now(),
    '{"full_name": "Parks & Gardens Admin", "is_mock_seed": true}'::jsonb,
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    'authenticated', 'authenticated'
  );
  INSERT INTO public.profiles (user_id, full_name, city, state)
    VALUES (v_parks_id, 'Parks & Gardens Admin', 'Jaipur', 'Rajasthan')
    ON CONFLICT (user_id) DO UPDATE SET
      full_name = EXCLUDED.full_name,
      city = EXCLUDED.city,
      state = EXCLUDED.state;
  INSERT INTO public.notification_preferences (user_id)
    VALUES (v_parks_id)
    ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role, department)
    VALUES (v_parks_id, 'department_admin', 'parks')
    ON CONFLICT (user_id, role) DO UPDATE SET department = 'parks';

  -- ── 7. Buildings Admin ───────────────────────────────────────────────────
  INSERT INTO auth.users (
    id, email, encrypted_password, email_confirmed_at,
    raw_user_meta_data, raw_app_meta_data, role, aud
  ) VALUES (
    v_buildings_id,
    'buildings@samadhan.gov.in',
    crypt('Samadhan@Buildings2024!', gen_salt('bf')),
    now(),
    '{"full_name": "Buildings Admin", "is_mock_seed": true}'::jsonb,
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    'authenticated', 'authenticated'
  );
  INSERT INTO public.profiles (user_id, full_name, city, state)
    VALUES (v_buildings_id, 'Buildings Admin', 'Hyderabad', 'Telangana')
    ON CONFLICT (user_id) DO UPDATE SET
      full_name = EXCLUDED.full_name,
      city = EXCLUDED.city,
      state = EXCLUDED.state;
  INSERT INTO public.notification_preferences (user_id)
    VALUES (v_buildings_id)
    ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role, department)
    VALUES (v_buildings_id, 'department_admin', 'buildings')
    ON CONFLICT (user_id, role) DO UPDATE SET department = 'buildings';

END $$;
