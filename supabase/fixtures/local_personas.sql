-- LOCAL TEST FIXTURE ONLY.
-- This file is never executed by `supabase db reset`. Invoke it through
-- `npm run db:fixtures:local`, whose guard requires a running loopback stack and
-- ALLOW_LOCAL_FIXTURES=true.

BEGIN;
SELECT pg_catalog.pg_advisory_xact_lock(208052026);

-- A second legal entity in the same group and an unrelated organization/entity
-- make group-scope and cross-tenant assertions non-vacuous.
INSERT INTO public.organizations (id, code, name_en, name_ar)
VALUES ('12111111-1111-1111-1111-111111111101', 'FIXTURE-OTHER-GROUP', 'Fixture Other Group', 'مجموعة اختبار أخرى')
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name_en = EXCLUDED.name_en, name_ar = EXCLUDED.name_ar;

INSERT INTO public.legal_entities (id, organization_id, code, name_en, name_ar)
VALUES
  ('11111111-1111-1111-1111-111111111103', '11111111-1111-1111-1111-111111111101', 'MODAWAT-SECOND', 'Modawat Second Entity', 'كيان مداواة الثاني'),
  ('12111111-1111-1111-1111-111111111102', '12111111-1111-1111-1111-111111111101', 'FIXTURE-OTHER', 'Fixture Other Entity', 'كيان اختبار آخر')
ON CONFLICT (id) DO UPDATE SET organization_id = EXCLUDED.organization_id, code = EXCLUDED.code,
  name_en = EXCLUDED.name_en, name_ar = EXCLUDED.name_ar, status = 'active';

INSERT INTO public.organization_unit_types (
  id, legal_entity_id, code, name_en, name_ar, level_order, is_cost_center_level
)
VALUES (
  '22222222-2222-2222-2222-2222222222b1', '12111111-1111-1111-1111-111111111102',
  'BRANCH', 'Branch', 'فرع', 1, true
)
ON CONFLICT (id) DO UPDATE SET legal_entity_id = EXCLUDED.legal_entity_id, code = EXCLUDED.code;

INSERT INTO public.organization_units (
  id, legal_entity_id, unit_type_id, code, name_en, name_ar, approval_status
)
VALUES (
  '33333333-3333-3333-3333-3333333333b1', '12111111-1111-1111-1111-111111111102',
  '22222222-2222-2222-2222-2222222222b1', 'REST-OTHER', 'Other Tenant Branch', 'فرع المستأجر الآخر', 'approved'
)
ON CONFLICT (id) DO UPDATE SET legal_entity_id = EXCLUDED.legal_entity_id,
  unit_type_id = EXCLUDED.unit_type_id, code = EXCLUDED.code;

INSERT INTO public.cost_nodes (
  id, legal_entity_id, code, name_en, name_ar, node_level,
  classification, is_leaf, allows_posting
)
VALUES (
  '66666666-6666-6666-6666-6666666666b1', '12111111-1111-1111-1111-111111111102',
  'REV', 'Revenue', 'الإيرادات', 1, 'revenue', true, true
)
ON CONFLICT (id) DO UPDATE SET legal_entity_id = EXCLUDED.legal_entity_id,
  code = EXCLUDED.code, allows_posting = true;

-- A second project in the primary entity proves an exact project assignment
-- cannot authorize a sibling project.
INSERT INTO public.control_scopes (
  id, legal_entity_id, scope_type_id, code, name_en, name_ar, approval_status, effective_start
)
VALUES (
  '55555555-5555-5555-5555-555555555504', '11111111-1111-1111-1111-111111111102',
  '44444444-4444-4444-4444-444444444402', 'FIXTURE-PROJECT-2',
  'Fixture Project Two', 'مشروع الاختبار الثاني', 'approved', CURRENT_DATE
)
ON CONFLICT (id) DO UPDATE SET legal_entity_id = EXCLUDED.legal_entity_id, code = EXCLUDED.code;

INSERT INTO public.projects (id, control_scope_id, scope_description)
VALUES ('cccccccc-cccc-cccc-cccc-ccccccccccc2', '55555555-5555-5555-5555-555555555504', 'Fixture sibling project')
ON CONFLICT (id) DO UPDATE SET control_scope_id = EXCLUDED.control_scope_id;

-- Deterministic local Auth personas. All share a development-only password.
WITH fixture_users(id, email) AS (
  VALUES
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1'::uuid, 'budget.owner@modawat.local'),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2'::uuid, 'approver@modawat.local'),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3'::uuid, 'finance@modawat.local'),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4'::uuid, 'auditor@modawat.local'),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5'::uuid, 'viewer@modawat.local'),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6'::uuid, 'pm@modawat.local'),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa7'::uuid, 'employee@modawat.local'),
    ('baaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1'::uuid, 'group.admin@modawat.local'),
    ('baaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2'::uuid, 'inactive.finance@modawat.local'),
    ('baaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3'::uuid, 'future.finance@modawat.local'),
    ('baaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4'::uuid, 'expired.finance@modawat.local'),
    ('baaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5'::uuid, 'no.membership@modawat.local'),
    ('baaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6'::uuid, 'other.finance@modawat.local'),
    ('baaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa7'::uuid, 'project.pm@modawat.local')
)
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
SELECT id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', email,
  extensions.crypt('Password123!', extensions.gen_salt('bf')), NOW(), '', '', '', '',
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, NOW(), NOW()
FROM fixture_users
ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email,
  encrypted_password = EXCLUDED.encrypted_password, email_confirmed_at = EXCLUDED.email_confirmed_at,
  confirmation_token = '', recovery_token = '', email_change_token_new = '', email_change = '',
  updated_at = NOW();

INSERT INTO auth.identities (
  id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
)
SELECT u.id, u.id, u.email,
  pg_catalog.jsonb_build_object('sub', u.id::text, 'email', u.email),
  'email', NOW(), NOW(), NOW()
FROM auth.users AS u
WHERE u.email LIKE '%@modawat.local'
ON CONFLICT (provider_id, provider) DO UPDATE SET
  user_id = EXCLUDED.user_id, identity_data = EXCLUDED.identity_data, updated_at = NOW();

INSERT INTO public.profiles (id, email, full_name_en, full_name_ar, status)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'budget.owner@modawat.local', 'Budget Owner User', 'مالك الميزانية', 'active'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'approver@modawat.local', 'Approver User', 'المعتمد', 'active'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'finance@modawat.local', 'Finance User', 'المستخدم المالي', 'active'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4', 'auditor@modawat.local', 'Auditor User', 'المدقق', 'active'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5', 'viewer@modawat.local', 'Viewer User', 'العارض', 'active'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6', 'pm@modawat.local', 'Project Manager User', 'مدير المشروع', 'active'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa7', 'employee@modawat.local', 'Employee User', 'الموظف', 'active'),
  ('baaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'group.admin@modawat.local', 'Group Administrator', 'مسؤول المجموعة', 'active'),
  ('baaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'inactive.finance@modawat.local', 'Inactive Finance', 'مستخدم مالي غير نشط', 'inactive'),
  ('baaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'future.finance@modawat.local', 'Future Finance', 'مستخدم مالي مستقبلي', 'active'),
  ('baaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4', 'expired.finance@modawat.local', 'Expired Finance', 'مستخدم مالي منتهي', 'active'),
  ('baaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5', 'no.membership@modawat.local', 'No Membership', 'بدون عضوية', 'active'),
  ('baaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6', 'other.finance@modawat.local', 'Other Entity Finance', 'مالية الكيان الآخر', 'active'),
  ('baaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa7', 'project.pm@modawat.local', 'Project Scoped PM', 'مدير مشروع محدد', 'active')
ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, full_name_en = EXCLUDED.full_name_en,
  full_name_ar = EXCLUDED.full_name_ar, status = EXCLUDED.status;

INSERT INTO public.memberships (id, user_id, organization_id, legal_entity_id, status)
VALUES
  ('d0000000-0000-0000-0000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','11111111-1111-1111-1111-111111111101','11111111-1111-1111-1111-111111111102','active'),
  ('d0000000-0000-0000-0000-000000000002','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2','11111111-1111-1111-1111-111111111101','11111111-1111-1111-1111-111111111102','active'),
  ('d0000000-0000-0000-0000-000000000003','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3','11111111-1111-1111-1111-111111111101','11111111-1111-1111-1111-111111111102','active'),
  ('d0000000-0000-0000-0000-000000000004','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4','11111111-1111-1111-1111-111111111101','11111111-1111-1111-1111-111111111102','active'),
  ('d0000000-0000-0000-0000-000000000005','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5','11111111-1111-1111-1111-111111111101','11111111-1111-1111-1111-111111111102','active'),
  ('d0000000-0000-0000-0000-000000000006','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6','11111111-1111-1111-1111-111111111101','11111111-1111-1111-1111-111111111102','active'),
  ('d0000000-0000-0000-0000-000000000007','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa7','11111111-1111-1111-1111-111111111101','11111111-1111-1111-1111-111111111102','active'),
  ('d0000000-0000-0000-0000-000000000011','baaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','11111111-1111-1111-1111-111111111101',NULL,'active'),
  ('d0000000-0000-0000-0000-000000000012','baaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2','11111111-1111-1111-1111-111111111101','11111111-1111-1111-1111-111111111102','active'),
  ('d0000000-0000-0000-0000-000000000013','baaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3','11111111-1111-1111-1111-111111111101','11111111-1111-1111-1111-111111111102','active'),
  ('d0000000-0000-0000-0000-000000000014','baaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4','11111111-1111-1111-1111-111111111101','11111111-1111-1111-1111-111111111102','active'),
  ('d0000000-0000-0000-0000-000000000016','baaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6','12111111-1111-1111-1111-111111111101','12111111-1111-1111-1111-111111111102','active'),
  ('d0000000-0000-0000-0000-000000000017','baaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa7','11111111-1111-1111-1111-111111111101','11111111-1111-1111-1111-111111111102','active')
ON CONFLICT (id) DO UPDATE SET user_id = EXCLUDED.user_id, organization_id = EXCLUDED.organization_id,
  legal_entity_id = EXCLUDED.legal_entity_id, status = EXCLUDED.status;

-- Deterministic role assignments cover active, inactive, future, expired,
-- group, other-entity, no-membership, legal-entity, and exact-project cases.
INSERT INTO public.role_assignments (
  id, user_id, role_id, scope_type, scope_id, effective_start, effective_end
)
SELECT assignment.id, assignment.user_id, r.id, assignment.scope_type::public.assignment_scope,
  assignment.scope_id, assignment.effective_start, assignment.effective_end
FROM (VALUES
  ('e0000000-0000-0000-0000-000000000001'::uuid,'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1'::uuid,'budget_owner','legal_entity','11111111-1111-1111-1111-111111111102'::uuid,CURRENT_DATE,NULL::date),
  ('e0000000-0000-0000-0000-000000000002','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2','approver','legal_entity','11111111-1111-1111-1111-111111111102',CURRENT_DATE,NULL),
  ('e0000000-0000-0000-0000-000000000003','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3','finance_user','legal_entity','11111111-1111-1111-1111-111111111102',CURRENT_DATE,NULL),
  ('e0000000-0000-0000-0000-000000000004','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4','auditor','legal_entity','11111111-1111-1111-1111-111111111102',CURRENT_DATE,NULL),
  ('e0000000-0000-0000-0000-000000000005','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5','viewer','legal_entity','11111111-1111-1111-1111-111111111102',CURRENT_DATE,NULL),
  ('e0000000-0000-0000-0000-000000000006','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6','project_manager','legal_entity','11111111-1111-1111-1111-111111111102',CURRENT_DATE,NULL),
  ('e0000000-0000-0000-0000-000000000007','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa7','employee','project','cccccccc-cccc-cccc-cccc-ccccccccccc1',CURRENT_DATE,NULL),
  ('e0000000-0000-0000-0000-000000000027','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa7','employee','legal_entity','11111111-1111-1111-1111-111111111102',CURRENT_DATE,NULL),
  ('e0000000-0000-0000-0000-000000000011','baaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','system_administrator','group','11111111-1111-1111-1111-111111111101',CURRENT_DATE,NULL),
  ('e0000000-0000-0000-0000-000000000012','baaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2','finance_user','legal_entity','11111111-1111-1111-1111-111111111102',CURRENT_DATE,NULL),
  ('e0000000-0000-0000-0000-000000000013','baaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3','finance_user','legal_entity','11111111-1111-1111-1111-111111111102',CURRENT_DATE + 30,NULL),
  ('e0000000-0000-0000-0000-000000000014','baaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4','finance_user','legal_entity','11111111-1111-1111-1111-111111111102',CURRENT_DATE - 60,CURRENT_DATE - 1),
  ('e0000000-0000-0000-0000-000000000015','baaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5','finance_user','legal_entity','11111111-1111-1111-1111-111111111102',CURRENT_DATE,NULL),
  ('e0000000-0000-0000-0000-000000000016','baaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6','finance_user','legal_entity','12111111-1111-1111-1111-111111111102',CURRENT_DATE,NULL),
  ('e0000000-0000-0000-0000-000000000017','baaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa7','project_manager','project','cccccccc-cccc-cccc-cccc-ccccccccccc1',CURRENT_DATE,NULL)
) AS assignment(id,user_id,role_code,scope_type,scope_id,effective_start,effective_end)
JOIN public.roles AS r ON r.code = assignment.role_code
ON CONFLICT (id) DO UPDATE SET user_id = EXCLUDED.user_id, role_id = EXCLUDED.role_id,
  scope_type = EXCLUDED.scope_type, scope_id = EXCLUDED.scope_id,
  effective_start = EXCLUDED.effective_start, effective_end = EXCLUDED.effective_end;

UPDATE public.projects SET project_manager_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6'
WHERE id = 'cccccccc-cccc-cccc-cccc-ccccccccccc1';
UPDATE public.tasks SET assigned_to = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa7'
WHERE work_package_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee01';
UPDATE public.risks SET owner_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6'
WHERE id = '33333333-3333-3333-3333-333333333399';
UPDATE public.issues SET owner_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6'
WHERE id = '44444444-4444-4444-4444-444444444499';

-- Cross-tenant and posted/unposted aggregate evidence.
DELETE FROM public.actual_transaction_allocations
WHERE actual_transaction_id IN (
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb301',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb999'
);
INSERT INTO public.actual_transactions (
  id, legal_entity_id, source_system, source_transaction_id, transaction_date,
  amount_ex_vat, amount_inc_vat, original_description, is_posted
)
VALUES
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb301','12111111-1111-1111-1111-111111111102','FIXTURE','OTHER-POSTED','2027-03-15',12345,12345,'Other tenant posted revenue',true),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb999','11111111-1111-1111-1111-111111111102','FIXTURE','PRIMARY-UNPOSTED','2027-03-15',99999,99999,'Unposted revenue must not aggregate',false)
ON CONFLICT (id) DO UPDATE SET amount_ex_vat = EXCLUDED.amount_ex_vat,
  amount_inc_vat = EXCLUDED.amount_inc_vat, is_posted = EXCLUDED.is_posted;

INSERT INTO public.actual_transaction_allocations (
  actual_transaction_id, organization_unit_id, cost_node_id, allocation_amount
)
VALUES
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb301','33333333-3333-3333-3333-3333333333b1','66666666-6666-6666-6666-6666666666b1',12345),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb999','33333333-3333-3333-3333-333333333304','66666666-6666-6666-6666-666666666610',99999);

-- Replace legacy restaurant POS allocations (immutable posted headers) with period-linked
-- reporting-path allocations so branch and BvA views stay consistent.
DELETE FROM public.actual_transaction_allocations
WHERE actual_transaction_id IN (
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb101',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb102',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb103',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb201',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb202',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb203'
);

-- Revenue reporting-path fixture: additive posted actuals with accounting_period_id and
-- revenue dimensions so v_budget_vs_actual / v_revenue_budget_vs_actual expose rows via PostgREST.
-- Period IDs are resolved at insert time because seed migrations may not retain deterministic UUIDs.
WITH mar_period AS (
  SELECT fp.id
  FROM public.fiscal_periods AS fp
  WHERE fp.fiscal_year_id = '77777777-7777-7777-7777-777777777701'::uuid
    AND fp.period_number = 3
  LIMIT 1
)
INSERT INTO public.actual_transactions (
  id, legal_entity_id, source_system, source_transaction_id, transaction_date,
  amount_ex_vat, amount_inc_vat, original_description, is_posted, transaction_class, accounting_period_id
)
SELECT
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb111'::uuid,
  '11111111-1111-1111-1111-111111111102'::uuid,
  'FIXTURE',
  'FIXTURE-REV-B1-MAR',
  '2027-03-15'::date,
  85000,
  85000,
  'Fixture REST-B1 March external revenue',
  true,
  'external'::public.transaction_class,
  mar_period.id
FROM mar_period
UNION ALL
SELECT
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb112'::uuid,
  '11111111-1111-1111-1111-111111111102'::uuid,
  'FIXTURE',
  'FIXTURE-REV-B2-MAR',
  '2027-03-15'::date,
  72000,
  72000,
  'Fixture REST-B2 March external revenue',
  true,
  'external'::public.transaction_class,
  mar_period.id
FROM mar_period
UNION ALL
SELECT
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb110'::uuid,
  '11111111-1111-1111-1111-111111111102'::uuid,
  'FIXTURE',
  'FIXTURE-REV-INTERNAL-MAR',
  '2027-03-15'::date,
  5000,
  5000,
  'Fixture internal intercompany revenue',
  true,
  'intercompany'::public.transaction_class,
  mar_period.id
FROM mar_period
ON CONFLICT (id) DO UPDATE SET
  accounting_period_id = EXCLUDED.accounting_period_id,
  transaction_class = EXCLUDED.transaction_class,
  is_posted = EXCLUDED.is_posted,
  amount_ex_vat = EXCLUDED.amount_ex_vat;

DELETE FROM public.actual_transaction_allocations
WHERE actual_transaction_id IN (
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb111',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb112',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb110'
);

INSERT INTO public.actual_transaction_allocations (
  actual_transaction_id, organization_unit_id, cost_node_id, allocation_amount,
  revenue_component_type_id, payer_id, service_line_id
)
SELECT
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb111'::uuid,
  '33333333-3333-3333-3333-333333333304'::uuid,
  '66666666-6666-6666-6666-666666666610'::uuid,
  85000,
  rct.id,
  '88888888-8888-8888-8888-888888888801'::uuid,
  '99999999-9999-9999-9999-999999999904'::uuid
FROM public.revenue_component_types AS rct
WHERE rct.code = 'gross_revenue'
UNION ALL
SELECT
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb112'::uuid,
  '33333333-3333-3333-3333-333333333307'::uuid,
  '66666666-6666-6666-6666-666666666610'::uuid,
  72000,
  rct.id,
  NULL::uuid,
  NULL::uuid
FROM public.revenue_component_types AS rct
WHERE rct.code = 'gross_revenue'
UNION ALL
SELECT
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb110'::uuid,
  '33333333-3333-3333-3333-333333333304'::uuid,
  '66666666-6666-6666-6666-666666666610'::uuid,
  5000,
  rct.id,
  NULL::uuid,
  NULL::uuid
FROM public.revenue_component_types AS rct
WHERE rct.code = 'gross_revenue';

INSERT INTO public.actual_transactions (
  id, legal_entity_id, source_system, source_transaction_id, transaction_date,
  amount_ex_vat, amount_inc_vat, original_description, is_posted, transaction_class, accounting_period_id
)
SELECT
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb113'::uuid,
  '11111111-1111-1111-1111-111111111102'::uuid,
  'FIXTURE',
  'FIXTURE-REST-B1-FOOD-MAR',
  '2027-03-15'::date,
  25500,
  25500,
  'Fixture REST-B1 March food cost',
  true,
  'external'::public.transaction_class,
  mar_period.id
FROM (
  SELECT fp.id
  FROM public.fiscal_periods AS fp
  WHERE fp.fiscal_year_id = '77777777-7777-7777-7777-777777777701'::uuid
    AND fp.period_number = 3
  LIMIT 1
) AS mar_period
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.actual_transaction_allocations (
  actual_transaction_id, organization_unit_id, cost_node_id, allocation_amount
)
VALUES
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb113', '33333333-3333-3333-3333-333333333304', '66666666-6666-6666-6666-666666666605', 25500)
ON CONFLICT DO NOTHING;

-- =============================================================================
-- ULTRA MEGA fixtures: vendors, policies, delegation, appraisal, period checklist.
-- Lifecycle documents (requisition→RFQ→PO→payment) are created via RPC in tests.
-- =============================================================================

-- Cost controller persona (finance delegates here). Synthetic local identity only.
WITH cost_controller_user(id, email) AS (
  VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa8'::uuid, 'cost.controller@modawat.local')
)
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
SELECT id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', email,
  extensions.crypt('Password123!', extensions.gen_salt('bf')), NOW(), '', '', '', '',
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, NOW(), NOW()
FROM cost_controller_user
ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email,
  encrypted_password = EXCLUDED.encrypted_password, email_confirmed_at = EXCLUDED.email_confirmed_at,
  confirmation_token = '', recovery_token = '', email_change_token_new = '', email_change = '',
  updated_at = NOW();

INSERT INTO auth.identities (
  id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
)
SELECT u.id, u.id, u.email,
  pg_catalog.jsonb_build_object('sub', u.id::text, 'email', u.email),
  'email', NOW(), NOW(), NOW()
FROM auth.users AS u
WHERE u.id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa8'
ON CONFLICT (provider_id, provider) DO UPDATE SET
  user_id = EXCLUDED.user_id, identity_data = EXCLUDED.identity_data, updated_at = NOW();

INSERT INTO public.profiles (id, email, full_name_en, full_name_ar, status)
VALUES (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa8', 'cost.controller@modawat.local',
  'Cost Controller User', 'مراقب التكلفة', 'active'
)
ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, full_name_en = EXCLUDED.full_name_en,
  full_name_ar = EXCLUDED.full_name_ar, status = EXCLUDED.status;

INSERT INTO public.memberships (id, user_id, organization_id, legal_entity_id, status)
VALUES (
  'd0000000-0000-0000-0000-000000000018',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa8',
  '11111111-1111-1111-1111-111111111101',
  '11111111-1111-1111-1111-111111111102',
  'active'
)
ON CONFLICT (id) DO UPDATE SET user_id = EXCLUDED.user_id, organization_id = EXCLUDED.organization_id,
  legal_entity_id = EXCLUDED.legal_entity_id, status = EXCLUDED.status;

INSERT INTO public.role_assignments (
  id, user_id, role_id, scope_type, scope_id, effective_start, effective_end
)
SELECT 'e0000000-0000-0000-0000-000000000018'::uuid,
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa8'::uuid,
  r.id, 'legal_entity'::public.assignment_scope,
  '11111111-1111-1111-1111-111111111102'::uuid, CURRENT_DATE, NULL::date
FROM public.roles AS r
WHERE r.code = 'cost_controller'
ON CONFLICT (id) DO UPDATE SET user_id = EXCLUDED.user_id, role_id = EXCLUDED.role_id,
  scope_type = EXCLUDED.scope_type, scope_id = EXCLUDED.scope_id,
  effective_start = EXCLUDED.effective_start, effective_end = EXCLUDED.effective_end;

-- Delegation changes routing and attribution, not the delegate's baseline role
-- boundary. This persona is independently eligible for the real transition.
INSERT INTO public.role_assignments (
  id, user_id, role_id, scope_type, scope_id, effective_start, effective_end
)
SELECT 'e0000000-0000-0000-0000-000000000019'::uuid,
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa8'::uuid,
  r.id, 'legal_entity'::public.assignment_scope,
  '11111111-1111-1111-1111-111111111102'::uuid, CURRENT_DATE, NULL::date
FROM public.roles AS r WHERE r.code = 'approver'
ON CONFLICT (id) DO UPDATE SET user_id = EXCLUDED.user_id, role_id = EXCLUDED.role_id,
  scope_type = EXCLUDED.scope_type, scope_id = EXCLUDED.scope_id,
  effective_start = EXCLUDED.effective_start, effective_end = EXCLUDED.effective_end;

-- Three active vendors for the primary (restaurant/hospital) legal entity.
INSERT INTO public.vendors (
  id, legal_entity_id, code, name_en, name_ar, status, currency_code, payment_terms_days,
  supplier_category, created_by
)
VALUES
  (
    'dddddddd-dddd-dddd-dddd-ddddddddd101', '11111111-1111-1111-1111-111111111102',
    'VND-FOOD-01', 'Fixture Food Supplier', 'مورد أغذية اختباري', 'active', 'SAR', 30,
    'food', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3'
  ),
  (
    'dddddddd-dddd-dddd-dddd-ddddddddd102', '11111111-1111-1111-1111-111111111102',
    'VND-MED-01', 'Fixture Medical Supplier', 'مورد طبي اختباري', 'active', 'SAR', 45,
    'medical', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3'
  ),
  (
    'dddddddd-dddd-dddd-dddd-ddddddddd103', '11111111-1111-1111-1111-111111111102',
    'VND-GEN-01', 'Fixture General Supplier', 'مورد عام اختباري', 'active', 'SAR', 15,
    'general', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3'
  )
ON CONFLICT (id) DO UPDATE SET
  legal_entity_id = EXCLUDED.legal_entity_id, code = EXCLUDED.code,
  name_en = EXCLUDED.name_en, name_ar = EXCLUDED.name_ar, status = 'active';

UPDATE public.procurement_policies
SET status = 'inactive', effective_to = CURRENT_DATE, updated_at = NOW()
WHERE legal_entity_id = '11111111-1111-1111-1111-111111111102'
  AND id <> 'dddddddd-dddd-dddd-dddd-ddddddddd201'
  AND status = 'active';

INSERT INTO public.procurement_policies (
  id, legal_entity_id, quantity_tolerance_percent, price_tolerance_percent,
  invoice_total_tolerance_amount, rfq_required_threshold, minimum_quotes_required,
  direct_purchase_threshold, status, effective_from, created_by
)
VALUES (
  'dddddddd-dddd-dddd-dddd-ddddddddd201',
  '11111111-1111-1111-1111-111111111102',
  0, 0, 0, 1000, 1, 500, 'active', CURRENT_DATE,
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3'
)
ON CONFLICT (id) DO UPDATE SET
  quantity_tolerance_percent = EXCLUDED.quantity_tolerance_percent,
  price_tolerance_percent = EXCLUDED.price_tolerance_percent,
  invoice_total_tolerance_amount = EXCLUDED.invoice_total_tolerance_amount,
  status = 'active', effective_to = NULL;

-- Active delegation: assigned approver → independently eligible cost controller.
INSERT INTO public.approval_delegations (
  id, legal_entity_id, delegator_id, delegate_id, workflow_type, permission_code,
  financial_threshold, effective_start, effective_end, reason, delegation_status,
  submitted_by, approved_by
)
VALUES (
  'dddddddd-dddd-dddd-dddd-ddddddddd301',
  '11111111-1111-1111-1111-111111111102',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa8',
  'purchase_requisition', 'commitment.approve', NULL,
  NOW() - INTERVAL '1 day', NOW() + INTERVAL '180 days',
  'Fixture active approver to cost-controller delegation', 'active',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'baaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1'
)
ON CONFLICT (id) DO UPDATE SET
  delegator_id = EXCLUDED.delegator_id, delegate_id = EXCLUDED.delegate_id,
  workflow_type = EXCLUDED.workflow_type, delegation_status = 'active',
  effective_start = EXCLUDED.effective_start, effective_end = EXCLUDED.effective_end,
  revoked_at = NULL, revoked_by = NULL;

-- Appraisal cycle + template (weights 100) + assignment employee → manager (pm).
INSERT INTO public.appraisal_templates (
  id, legal_entity_id, code, name_en, name_ar, rating_scale_max, is_active,
  governance_status, approved_by, approved_at
)
VALUES (
  'dddddddd-dddd-dddd-dddd-ddddddddd402',
  '11111111-1111-1111-1111-111111111102',
  'APP-STD-2027', 'Standard Annual Template', 'قالب التقييم السنوي', 5, true,
  'approved', 'baaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', NOW()
)
ON CONFLICT (id) DO UPDATE SET name_en = EXCLUDED.name_en, name_ar = EXCLUDED.name_ar,
  is_active = true, governance_status='approved',approved_by=EXCLUDED.approved_by,
  approved_at=EXCLUDED.approved_at,legal_entity_id = EXCLUDED.legal_entity_id;

INSERT INTO public.appraisal_template_criteria (
  id, template_id, sequence_no, category, name_en, name_ar, weight, max_scale
)
VALUES
  (
    'dddddddd-dddd-dddd-dddd-ddddddddd403',
    'dddddddd-dddd-dddd-dddd-ddddddddd402', 1, 'competency',
    'Delivery', 'الإنجاز', 60, 5
  ),
  (
    'dddddddd-dddd-dddd-dddd-ddddddddd404',
    'dddddddd-dddd-dddd-dddd-ddddddddd402', 2, 'competency',
    'Collaboration', 'التعاون', 40, 5
  )
ON CONFLICT (id) DO UPDATE SET weight = EXCLUDED.weight, max_scale = EXCLUDED.max_scale;

INSERT INTO public.appraisal_cycles (
  id, legal_entity_id, name_en, name_ar, period_start, period_end,
  cycle_status, created_by, activated_at
)
VALUES (
  'dddddddd-dddd-dddd-dddd-ddddddddd401',
  '11111111-1111-1111-1111-111111111102',
  'FY2027 Mid-Year Appraisal', 'تقييم منتصف 2027',
  '2027-01-01', '2027-06-30', 'active',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', NOW()
)
ON CONFLICT (id) DO UPDATE SET cycle_status = 'active', activated_at = COALESCE(appraisal_cycles.activated_at, NOW()), legal_entity_id = EXCLUDED.legal_entity_id;

INSERT INTO public.appraisal_assignments (
  id, legal_entity_id, cycle_id, template_id, employee_id, manager_id,
  assignment_status, created_by
)
VALUES (
  'dddddddd-dddd-dddd-dddd-ddddddddd405',
  '11111111-1111-1111-1111-111111111102',
  'dddddddd-dddd-dddd-dddd-ddddddddd401',
  'dddddddd-dddd-dddd-dddd-ddddddddd402',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa7',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6',
  'employee_self_review',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3'
)
ON CONFLICT (id) DO UPDATE SET
  employee_id = EXCLUDED.employee_id, manager_id = EXCLUDED.manager_id,
  assignment_status = EXCLUDED.assignment_status, legal_entity_id = EXCLUDED.legal_entity_id;

-- Period close checklist template with one blocking item (March FY2027).
INSERT INTO public.period_close_checklist_templates (
  id, legal_entity_id, module, code, name_en, name_ar, is_active,
  governance_status, approved_by, approved_at
)
VALUES (
  'dddddddd-dddd-dddd-dddd-ddddddddd501',
  '11111111-1111-1111-1111-111111111102',
  'actuals', 'ACTUALS-CLOSE-STD',
  'Actuals Close Checklist', 'قائمة إغلاق الفعلي', true,
  'approved', 'baaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', NOW()
)
ON CONFLICT (id) DO UPDATE SET is_active = true, governance_status='approved',
  approved_by=EXCLUDED.approved_by,approved_at=EXCLUDED.approved_at,
  name_en = EXCLUDED.name_en, name_ar = EXCLUDED.name_ar;

INSERT INTO public.period_close_checklist_items (
  id, template_id, sequence_no, name_en, name_ar, description,
  item_type, owner_role_code, is_required, is_blocking, control_code
)
VALUES (
  'dddddddd-dddd-dddd-dddd-ddddddddd502',
  'dddddddd-dddd-dddd-dddd-ddddddddd501',
  1, 'Reconcile unmapped queue', 'مطابقة قائمة غير المربوط',
  'Blocking fixture checklist item for hard-close gate',
  'manual', 'finance_user', true, true, 'unmapped_cleared'
)
ON CONFLICT (id) DO UPDATE SET is_blocking = true, is_required = true;

WITH mar_period AS (
  SELECT fp.id
  FROM public.fiscal_periods AS fp
  WHERE fp.fiscal_year_id = '77777777-7777-7777-7777-777777777701'::uuid
    AND fp.period_number = 3
  LIMIT 1
),
upserted AS (
  INSERT INTO public.period_close_instances (
    id, legal_entity_id, fiscal_period_id, module, template_id, created_by
  )
  SELECT
    'dddddddd-dddd-dddd-dddd-ddddddddd503'::uuid,
    '11111111-1111-1111-1111-111111111102'::uuid,
    mar_period.id,
    'actuals'::public.period_module,
    'dddddddd-dddd-dddd-dddd-ddddddddd501'::uuid,
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3'::uuid
  FROM mar_period
  ON CONFLICT (legal_entity_id, fiscal_period_id, module) DO UPDATE SET
    template_id = EXCLUDED.template_id,
    updated_at = NOW()
  RETURNING id
)
INSERT INTO public.period_close_item_results (
  id, instance_id, checklist_item_id, item_status
)
SELECT
  'dddddddd-dddd-dddd-dddd-ddddddddd504'::uuid,
  upserted.id,
  'dddddddd-dddd-dddd-dddd-ddddddddd502'::uuid,
  'pending'::public.period_checklist_item_status
FROM upserted
ON CONFLICT (instance_id, checklist_item_id) DO UPDATE SET item_status = 'pending';

COMMIT;
