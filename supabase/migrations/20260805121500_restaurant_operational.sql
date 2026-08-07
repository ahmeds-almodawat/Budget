-- Phase 5: Restaurant operational control with mapped actuals

INSERT INTO organization_units (id, legal_entity_id, unit_type_id, parent_id, code, name_en, name_ar, approval_status)
VALUES
  ('33333333-3333-3333-3333-333333333307', '11111111-1111-1111-1111-111111111102',
   '22222222-2222-2222-2222-222222222202', '33333333-3333-3333-3333-333333333302',
   'REST-B2', 'Restaurant Branch 2', 'فرع المطعم 2', 'approved')
ON CONFLICT (legal_entity_id, code) DO NOTHING;

INSERT INTO cost_nodes (id, legal_entity_id, parent_id, code, name_en, name_ar, node_level, classification, is_leaf, allows_posting)
VALUES
  ('66666666-6666-6666-6666-666666666609', '11111111-1111-1111-1111-111111111102', '66666666-6666-6666-6666-666666666604', 'LABOR', 'Labor Cost', 'تكلفة العمالة', 2, 'cost_of_revenue', true, true),
  ('66666666-6666-6666-6666-666666666610', '11111111-1111-1111-1111-111111111102', NULL, 'REV', 'Revenue', 'الإيرادات', 1, 'revenue', true, true)
ON CONFLICT (legal_entity_id, code) DO NOTHING;

-- Restaurant operational metrics view
CREATE OR REPLACE VIEW v_restaurant_branch_performance AS
SELECT
  ou.id AS branch_id,
  ou.code AS branch_code,
  ou.name_en,
  ou.name_ar,
  COALESCE(SUM(CASE WHEN cn.code IN ('FOOD-BEEF', 'FOOD') THEN ata.allocation_amount ELSE 0 END), 0) AS food_cost,
  COALESCE(SUM(CASE WHEN cn.code = 'LABOR' THEN ata.allocation_amount ELSE 0 END), 0) AS labor_cost,
  COALESCE(SUM(CASE WHEN cn.code = 'REV' THEN ata.allocation_amount ELSE 0 END), 0) AS revenue,
  COUNT(DISTINCT CASE WHEN cn.code = 'REV' THEN at.id END) AS cover_transactions
FROM organization_units ou
LEFT JOIN actual_transaction_allocations ata ON ata.organization_unit_id = ou.id
LEFT JOIN actual_transactions at ON at.id = ata.actual_transaction_id AND at.is_posted = TRUE
LEFT JOIN cost_nodes cn ON cn.id = ata.cost_node_id
WHERE ou.code LIKE 'REST-%'
GROUP BY ou.id, ou.code, ou.name_en, ou.name_ar;

GRANT SELECT ON v_restaurant_branch_performance TO authenticated;

-- Seed restaurant actuals for branch comparison
INSERT INTO actual_transactions (
  id, legal_entity_id, source_system, source_transaction_id, transaction_date,
  amount_ex_vat, vat_amount, amount_inc_vat, original_description, is_posted
) VALUES
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb101', '11111111-1111-1111-1111-111111111102', 'REST-POS', 'REST-B1-REV-001', '2027-03-15', 85000, 0, 85000, 'Branch 1 revenue', true),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb102', '11111111-1111-1111-1111-111111111102', 'REST-POS', 'REST-B1-FOOD-001', '2027-03-15', 25500, 0, 25500, 'Branch 1 food', true),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb103', '11111111-1111-1111-1111-111111111102', 'REST-POS', 'REST-B1-LAB-001', '2027-03-15', 21250, 0, 21250, 'Branch 1 labor', true),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb201', '11111111-1111-1111-1111-111111111102', 'REST-POS', 'REST-B2-REV-001', '2027-03-15', 72000, 0, 72000, 'Branch 2 revenue', true),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb202', '11111111-1111-1111-1111-111111111102', 'REST-POS', 'REST-B2-FOOD-001', '2027-03-15', 23040, 0, 23040, 'Branch 2 food', true),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb203', '11111111-1111-1111-1111-111111111102', 'REST-POS', 'REST-B2-LAB-001', '2027-03-15', 18000, 0, 18000, 'Branch 2 labor', true)
ON CONFLICT (legal_entity_id, source_system, source_transaction_id) DO NOTHING;

INSERT INTO actual_transaction_allocations (actual_transaction_id, organization_unit_id, cost_node_id, allocation_amount)
VALUES
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb101', '33333333-3333-3333-3333-333333333304', '66666666-6666-6666-6666-666666666610', 85000),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb102', '33333333-3333-3333-3333-333333333304', '66666666-6666-6666-6666-666666666605', 25500),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb103', '33333333-3333-3333-3333-333333333304', '66666666-6666-6666-6666-666666666609', 21250),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb201', '33333333-3333-3333-3333-333333333307', '66666666-6666-6666-6666-666666666610', 72000),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb202', '33333333-3333-3333-3333-333333333307', '66666666-6666-6666-6666-666666666605', 23040),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb203', '33333333-3333-3333-3333-333333333307', '66666666-6666-6666-6666-666666666609', 18000)
ON CONFLICT DO NOTHING;
