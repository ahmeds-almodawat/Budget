-- Development seed data (Al Modawat scenario)
-- Note: profiles require auth.users; seed organization and reference data only

INSERT INTO organizations (id, code, name_en, name_ar)
VALUES ('11111111-1111-1111-1111-111111111101', 'MODAWAT-GROUP', 'Al Modawat Group', 'مجموعة المداوات')
ON CONFLICT (code) DO NOTHING;

INSERT INTO legal_entities (id, organization_id, code, name_en, name_ar)
VALUES (
  '11111111-1111-1111-1111-111111111102',
  '11111111-1111-1111-1111-111111111101',
  'MODAWAT',
  'Al Modawat Specialized Medical Company',
  'شركة المداوات الطبية المتخصصة'
)
ON CONFLICT (organization_id, code) DO NOTHING;

INSERT INTO organization_unit_types (id, legal_entity_id, code, name_en, name_ar, level_order, is_cost_center_level)
VALUES
  ('22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111102', 'BU', 'Business Unit', 'وحدة أعمال', 1, false),
  ('22222222-2222-2222-2222-222222222202', '11111111-1111-1111-1111-111111111102', 'LOC', 'Location', 'موقع', 2, false),
  ('22222222-2222-2222-2222-222222222203', '11111111-1111-1111-1111-111111111102', 'DEPT', 'Department', 'قسم', 3, true)
ON CONFLICT (legal_entity_id, code) DO NOTHING;

INSERT INTO organization_units (id, legal_entity_id, unit_type_id, code, name_en, name_ar, approval_status)
VALUES
  ('33333333-3333-3333-3333-333333333301', '11111111-1111-1111-1111-111111111102', '22222222-2222-2222-2222-222222222201', 'HOSP-OPS', 'Hospital Operations', 'عمليات المستشفى', 'approved'),
  ('33333333-3333-3333-3333-333333333302', '11111111-1111-1111-1111-111111111102', '22222222-2222-2222-2222-222222222201', 'REST-OPS', 'Restaurant Operations', 'عمليات المطاعم', 'approved'),
  ('33333333-3333-3333-3333-333333333303', '11111111-1111-1111-1111-111111111102', '22222222-2222-2222-2222-222222222202', 'HOSP-MUH', 'Main Hospital – Muhayil', 'المستشفى الرئيسي – محايل', 'approved'),
  ('33333333-3333-3333-3333-333333333304', '11111111-1111-1111-1111-111111111102', '22222222-2222-2222-2222-222222222202', 'REST-B1', 'Restaurant Branch 1', 'فرع المطعم 1', 'approved'),
  ('33333333-3333-3333-3333-333333333305', '11111111-1111-1111-1111-111111111102', '22222222-2222-2222-2222-222222222203', 'PHARM', 'Pharmacy', 'الصيدلية', 'approved')
ON CONFLICT (legal_entity_id, code) DO NOTHING;

INSERT INTO control_scope_types (id, code, name_en, name_ar, scope_type)
VALUES
  ('44444444-4444-4444-4444-444444444401', 'OP-BUD', 'Operational Budget', 'ميزانية تشغيلية', 'operational_budget'),
  ('44444444-4444-4444-4444-444444444402', 'PROJECT', 'Capital Project', 'مشروع رأسمالي', 'project')
ON CONFLICT (code) DO NOTHING;

INSERT INTO control_scopes (id, legal_entity_id, scope_type_id, code, name_en, name_ar, approval_status)
VALUES
  ('55555555-5555-5555-5555-555555555501', '11111111-1111-1111-1111-111111111102', '44444444-4444-4444-4444-444444444401', 'HOSP-BUD-2027', '2027 Main Hospital Operating Budget', 'ميزانية تشغيل المستشفى 2027', 'approved'),
  ('55555555-5555-5555-5555-555555555502', '11111111-1111-1111-1111-111111111102', '44444444-4444-4444-4444-444444444401', 'REST-BUD-2027', '2027 Restaurant Operating Budget', 'ميزانية تشغيل المطاعم 2027', 'approved'),
  ('55555555-5555-5555-5555-555555555503', '11111111-1111-1111-1111-111111111102', '44444444-4444-4444-4444-444444444402', 'PROJ-KM-HOSP', 'Khamis Mushait New Hospital Project', 'مشروع مستشفى خميس مشيط', 'approved')
ON CONFLICT (legal_entity_id, code) DO NOTHING;

INSERT INTO cost_nodes (id, legal_entity_id, code, name_en, name_ar, node_level, classification, is_leaf, allows_posting)
VALUES
  ('66666666-6666-6666-6666-666666666601', '11111111-1111-1111-1111-111111111102', 'MED-SUP', 'Medical Supplies', 'المستلزمات الطبية', 1, 'opex', false, false),
  ('66666666-6666-6666-6666-666666666602', '11111111-1111-1111-1111-111111111102', 'MED-MED', 'Medicines', 'الأدوية', 2, 'opex', false, false),
  ('66666666-6666-6666-6666-666666666603', '11111111-1111-1111-1111-111111111102', 'MED-INJ', 'Injectable Medicines', 'الأدوية القابلة للحقن', 3, 'opex', true, true),
  ('66666666-6666-6666-6666-666666666604', '11111111-1111-1111-1111-111111111102', 'FOOD', 'Food Cost', 'تكلفة الطعام', 1, 'cost_of_revenue', false, false),
  ('66666666-6666-6666-6666-666666666605', '11111111-1111-1111-1111-111111111102', 'FOOD-BEEF', 'Beef', 'لحم بقري', 3, 'cost_of_revenue', true, true)
ON CONFLICT (legal_entity_id, code) DO NOTHING;

INSERT INTO fiscal_years (id, legal_entity_id, year_label, start_date, end_date)
VALUES ('77777777-7777-7777-7777-777777777701', '11111111-1111-1111-1111-111111111102', 'FY2027', '2027-01-01', '2027-12-31')
ON CONFLICT (legal_entity_id, year_label) DO NOTHING;

INSERT INTO fiscal_periods (id, fiscal_year_id, period_number, start_date, end_date)
SELECT
  gen_random_uuid(),
  '77777777-7777-7777-7777-777777777701',
  gs,
  make_date(2027, gs, 1),
  (make_date(2027, gs, 1) + INTERVAL '1 month' - INTERVAL '1 day')::date
FROM generate_series(1, 12) gs
ON CONFLICT DO NOTHING;

INSERT INTO roles (code, name_en, name_ar, is_read_only)
VALUES
  ('system_administrator', 'System Administrator', 'مسؤول النظام', false),
  ('auditor', 'Auditor', 'مدقق', true),
  ('viewer', 'Viewer', 'م viewer', true),
  ('finance_user', 'Finance User', 'مستخدم مالي', false),
  ('project_manager', 'Project Manager', 'مدير مشروع', false)
ON CONFLICT (code) DO NOTHING;
