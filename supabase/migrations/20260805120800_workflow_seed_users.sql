-- Test users, memberships, and extended seed for workflows
-- Local development only

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Deterministic fiscal period IDs
DELETE FROM fiscal_periods WHERE fiscal_year_id = '77777777-7777-7777-7777-777777777701';
INSERT INTO fiscal_periods (id, fiscal_year_id, period_number, start_date, end_date)
VALUES
  ('88888888-8888-8888-8888-888888888801', '77777777-7777-7777-7777-777777777701', 1, '2027-01-01', '2027-01-31'),
  ('88888888-8888-8888-8888-888888888802', '77777777-7777-7777-7777-777777777701', 2, '2027-02-01', '2027-02-28'),
  ('88888888-8888-8888-8888-888888888803', '77777777-7777-7777-7777-777777777701', 3, '2027-03-01', '2027-03-31'),
  ('88888888-8888-8888-8888-888888888804', '77777777-7777-7777-7777-777777777701', 4, '2027-04-01', '2027-04-30'),
  ('88888888-8888-8888-8888-888888888805', '77777777-7777-7777-7777-777777777701', 5, '2027-05-01', '2027-05-31'),
  ('88888888-8888-8888-8888-888888888806', '77777777-7777-7777-7777-777777777701', 6, '2027-06-01', '2027-06-30'),
  ('88888888-8888-8888-8888-888888888807', '77777777-7777-7777-7777-777777777701', 7, '2027-07-01', '2027-07-31'),
  ('88888888-8888-8888-8888-888888888808', '77777777-7777-7777-7777-777777777701', 8, '2027-08-01', '2027-08-31'),
  ('88888888-8888-8888-8888-888888888809', '77777777-7777-7777-7777-777777777701', 9, '2027-09-01', '2027-09-30'),
  ('88888888-8888-8888-8888-888888888810', '77777777-7777-7777-7777-777777777701', 10, '2027-10-01', '2027-10-31'),
  ('88888888-8888-8888-8888-888888888811', '77777777-7777-7777-7777-777777777701', 11, '2027-11-01', '2027-11-30'),
  ('88888888-8888-8888-8888-888888888812', '77777777-7777-7777-7777-777777777701', 12, '2027-12-01', '2027-12-31');

INSERT INTO roles (code, name_en, name_ar, is_read_only)
VALUES
  ('budget_owner', 'Budget Owner', 'مالك الميزانية', false),
  ('approver', 'Approver', 'معتمد', false),
  ('cost_controller', 'Cost Controller', 'مراقب التكلفة', false),
  ('legal_entity_administrator', 'Legal Entity Administrator', 'مسؤول الكيان القانوني', false)
ON CONFLICT (code) DO NOTHING;

UPDATE roles SET name_ar = 'عارض' WHERE code = 'viewer';

-- Engineering department and construction cost hierarchy for project slice
INSERT INTO organization_units (id, legal_entity_id, unit_type_id, parent_id, code, name_en, name_ar, approval_status)
VALUES
  ('33333333-3333-3333-3333-333333333306', '11111111-1111-1111-1111-111111111102', '22222222-2222-2222-2222-222222222203', '33333333-3333-3333-3333-333333333301', 'ENG', 'Engineering', 'الهندسة', 'approved')
ON CONFLICT (legal_entity_id, code) DO NOTHING;

INSERT INTO cost_nodes (id, legal_entity_id, parent_id, code, name_en, name_ar, node_level, classification, is_leaf, allows_posting)
VALUES
  ('66666666-6666-6666-6666-666666666606', '11111111-1111-1111-1111-111111111102', NULL, 'CONST', 'Construction', 'الإنشاءات', 1, 'capex', false, false),
  ('66666666-6666-6666-6666-666666666607', '11111111-1111-1111-1111-111111111102', '66666666-6666-6666-6666-666666666606', 'CIVIL', 'Civil Works', 'الأعمال المدنية', 2, 'capex', false, false),
  ('66666666-6666-6666-6666-666666666608', '11111111-1111-1111-1111-111111111102', '66666666-6666-6666-6666-666666666607', 'CONCRETE', 'Ready-Mix Concrete', 'خرسانة جاهزة', 3, 'capex', true, true)
ON CONFLICT (legal_entity_id, code) DO NOTHING;

INSERT INTO teams (id, legal_entity_id, code, name_en, name_ar)
VALUES ('99999999-9999-9999-9999-999999999901', '11111111-1111-1111-1111-111111111102', 'CONST-TEAM', 'Construction Project Team', 'فريق مشروع الإنشاء')
ON CONFLICT (legal_entity_id, code) DO NOTHING;

-- Local test auth users (password: Password123!)
-- IDs are deterministic for repeatable tests
DO $$
DECLARE
  budget_owner_id UUID := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1';
  approver_id UUID := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2';
  finance_id UUID := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3';
  auditor_id UUID := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4';
  viewer_id UUID := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5';
  pm_id UUID := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6';
  encrypted_pw TEXT := crypt('Password123!', gen_salt('bf'));
BEGIN
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES
    (budget_owner_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'budget.owner@modawat.local', encrypted_pw, NOW(), '{"provider":"email","providers":["email"]}', '{}', NOW(), NOW()),
    (approver_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'approver@modawat.local', encrypted_pw, NOW(), '{"provider":"email","providers":["email"]}', '{}', NOW(), NOW()),
    (finance_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'finance@modawat.local', encrypted_pw, NOW(), '{"provider":"email","providers":["email"]}', '{}', NOW(), NOW()),
    (auditor_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'auditor@modawat.local', encrypted_pw, NOW(), '{"provider":"email","providers":["email"]}', '{}', NOW(), NOW()),
    (viewer_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'viewer@modawat.local', encrypted_pw, NOW(), '{"provider":"email","providers":["email"]}', '{}', NOW(), NOW()),
    (pm_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pm@modawat.local', encrypted_pw, NOW(), '{"provider":"email","providers":["email"]}', '{}', NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  SELECT id, id, email, jsonb_build_object('sub', id::text, 'email', email), 'email', NOW(), NOW(), NOW()
  FROM auth.users
  WHERE email LIKE '%@modawat.local'
  ON CONFLICT DO NOTHING;

  INSERT INTO profiles (id, email, full_name_en, full_name_ar)
  VALUES
    (budget_owner_id, 'budget.owner@modawat.local', 'Budget Owner User', 'مالك الميزانية'),
    (approver_id, 'approver@modawat.local', 'Approver User', 'المعتمد'),
    (finance_id, 'finance@modawat.local', 'Finance User', 'المستخدم المالي'),
    (auditor_id, 'auditor@modawat.local', 'Auditor User', 'المدقق'),
    (viewer_id, 'viewer@modawat.local', 'Viewer User', 'العارض'),
    (pm_id, 'pm@modawat.local', 'Project Manager User', 'مدير المشروع')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO memberships (user_id, organization_id, legal_entity_id, status)
  SELECT u.id, '11111111-1111-1111-1111-111111111101', '11111111-1111-1111-1111-111111111102', 'active'
  FROM auth.users u WHERE u.email LIKE '%@modawat.local'
  ON CONFLICT DO NOTHING;

  INSERT INTO role_assignments (user_id, role_id, scope_type, scope_id)
  SELECT budget_owner_id, r.id, 'legal_entity', '11111111-1111-1111-1111-111111111102'
  FROM roles r WHERE r.code = 'budget_owner'
  ON CONFLICT DO NOTHING;

  INSERT INTO role_assignments (user_id, role_id, scope_type, scope_id)
  SELECT approver_id, r.id, 'legal_entity', '11111111-1111-1111-1111-111111111102'
  FROM roles r WHERE r.code = 'approver'
  ON CONFLICT DO NOTHING;

  INSERT INTO role_assignments (user_id, role_id, scope_type, scope_id)
  SELECT finance_id, r.id, 'legal_entity', '11111111-1111-1111-1111-111111111102'
  FROM roles r WHERE r.code = 'finance_user'
  ON CONFLICT DO NOTHING;

  INSERT INTO role_assignments (user_id, role_id, scope_type, scope_id)
  SELECT auditor_id, r.id, 'legal_entity', '11111111-1111-1111-1111-111111111102'
  FROM roles r WHERE r.code = 'auditor'
  ON CONFLICT DO NOTHING;

  INSERT INTO role_assignments (user_id, role_id, scope_type, scope_id)
  SELECT viewer_id, r.id, 'legal_entity', '11111111-1111-1111-1111-111111111102'
  FROM roles r WHERE r.code = 'viewer'
  ON CONFLICT DO NOTHING;

  INSERT INTO role_assignments (user_id, role_id, scope_type, scope_id)
  SELECT pm_id, r.id, 'legal_entity', '11111111-1111-1111-1111-111111111102'
  FROM roles r WHERE r.code = 'project_manager'
  ON CONFLICT DO NOTHING;
END $$;

-- Hospital control account for pharmacy injectables
INSERT INTO control_accounts (
  id, legal_entity_id, control_scope_id, organization_unit_id, cost_node_id, code, name_en, name_ar
) VALUES (
  'aaaaaaa1-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
  '11111111-1111-1111-1111-111111111102',
  '55555555-5555-5555-5555-555555555501',
  '33333333-3333-3333-3333-333333333305',
  '66666666-6666-6666-6666-666666666603',
  'CA-HOSP-PHARM-INJ',
  'Hospital Pharmacy Injectable Medicines',
  'أدوية قابلة للحقن - صيدلية المستشفى'
) ON CONFLICT (legal_entity_id, code) DO NOTHING;
