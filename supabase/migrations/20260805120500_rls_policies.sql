-- Row Level Security foundation (deny by default)
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE control_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE actual_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE actual_transaction_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE commitments ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION user_legal_entity_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT m.legal_entity_id
  FROM memberships m
  WHERE m.user_id = auth.uid()
    AND m.status = 'active'
    AND m.legal_entity_id IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION user_has_role(p_role_code TEXT, p_scope_id UUID DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM role_assignments ra
    JOIN roles r ON r.id = ra.role_id
    WHERE ra.user_id = auth.uid()
      AND r.code = p_role_code
      AND (p_scope_id IS NULL OR ra.scope_id = p_scope_id OR ra.scope_type = 'group')
      AND (ra.effective_end IS NULL OR ra.effective_end >= CURRENT_DATE)
  );
$$;

-- Profiles: users read/update own profile
CREATE POLICY profiles_select_own ON profiles FOR SELECT USING (id = auth.uid());
CREATE POLICY profiles_update_own ON profiles FOR UPDATE USING (id = auth.uid());

-- Legal entities: members only
CREATE POLICY legal_entities_member_read ON legal_entities
  FOR SELECT USING (id IN (SELECT user_legal_entity_ids()));

-- Organization units: entity scoped
CREATE POLICY org_units_member_read ON organization_units
  FOR SELECT USING (legal_entity_id IN (SELECT user_legal_entity_ids()));

-- Budgets: entity scoped read; write requires non-read-only role
CREATE POLICY budget_versions_read ON budget_versions
  FOR SELECT USING (legal_entity_id IN (SELECT user_legal_entity_ids()));

CREATE POLICY budget_versions_write ON budget_versions
  FOR INSERT WITH CHECK (
    legal_entity_id IN (SELECT user_legal_entity_ids())
    AND NOT user_has_role('auditor')
    AND NOT user_has_role('viewer')
  );

CREATE POLICY budget_versions_update ON budget_versions
  FOR UPDATE USING (
    legal_entity_id IN (SELECT user_legal_entity_ids())
    AND NOT user_has_role('auditor')
    AND NOT user_has_role('viewer')
    AND approval_status NOT IN ('locked', 'posted')
  );

-- Actual transactions: read within entity; no direct update on posted
CREATE POLICY actuals_read ON actual_transactions
  FOR SELECT USING (legal_entity_id IN (SELECT user_legal_entity_ids()));

CREATE POLICY actuals_insert ON actual_transactions
  FOR INSERT WITH CHECK (
    legal_entity_id IN (SELECT user_legal_entity_ids())
    AND (user_has_role('finance_user') OR user_has_role('cost_controller') OR user_has_role('system_administrator'))
  );

CREATE POLICY actuals_no_update ON actual_transactions
  FOR UPDATE USING (FALSE);

CREATE POLICY actuals_no_delete ON actual_transactions
  FOR DELETE USING (FALSE);

-- Audit: auditors and admins
CREATE POLICY audit_read ON audit_events
  FOR SELECT USING (
    user_has_role('auditor') OR user_has_role('system_administrator') OR user_has_role('legal_entity_administrator')
  );

CREATE POLICY audit_insert ON audit_events
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Default deny: no policies on other tables until scoped policies added in deployment
