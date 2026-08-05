-- Workflow reference data.
--
-- The legacy filename is retained because this migration version may already be
-- recorded in shared environments. Local auth personas were moved to the
-- explicitly invoked supabase/fixtures/local_personas.sql fixture.

-- Deterministic fiscal period IDs without destructive seed cleanup.
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
  ('88888888-8888-8888-8888-888888888812', '77777777-7777-7777-7777-777777777701', 12, '2027-12-01', '2027-12-31')
ON CONFLICT (fiscal_year_id, period_number) DO UPDATE
SET start_date = EXCLUDED.start_date,
    end_date = EXCLUDED.end_date;

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
