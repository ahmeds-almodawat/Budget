-- Expanded RLS for authenticated user operations (auth milestone)

-- Read policies for reference data
ALTER TABLE cost_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE fiscal_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE fiscal_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE control_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_monthly_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE imported_source_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE actual_transaction_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_change_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE duplicate_review_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY role_assignments_select_own ON role_assignments
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY cost_nodes_member_read ON cost_nodes
  FOR SELECT USING (legal_entity_id IN (SELECT user_legal_entity_ids()));

CREATE POLICY fiscal_years_member_read ON fiscal_years
  FOR SELECT USING (TRUE);

CREATE POLICY fiscal_periods_member_read ON fiscal_periods
  FOR SELECT USING (TRUE);

CREATE POLICY control_accounts_member_read ON control_accounts
  FOR SELECT USING (legal_entity_id IN (SELECT user_legal_entity_ids()));

CREATE POLICY budget_monthly_allocations_read ON budget_monthly_allocations
  FOR SELECT USING (
    budget_line_id IN (
      SELECT bl.id FROM budget_lines bl
      JOIN budget_versions bv ON bv.id = bl.budget_version_id
      WHERE bv.legal_entity_id IN (SELECT user_legal_entity_ids())
    )
  );

CREATE POLICY budget_monthly_allocations_insert ON budget_monthly_allocations
  FOR INSERT WITH CHECK (
    budget_line_id IN (
      SELECT bl.id FROM budget_lines bl
      JOIN budget_versions bv ON bv.id = bl.budget_version_id
      WHERE bv.legal_entity_id IN (SELECT user_legal_entity_ids())
        AND bv.approval_status IN ('draft', 'submitted', 'under_review')
        AND NOT user_has_role('auditor')
        AND NOT user_has_role('viewer')
    )
  );

CREATE POLICY actual_allocations_read ON actual_transaction_allocations
  FOR SELECT USING (
    organization_unit_id IN (
      SELECT id FROM organization_units WHERE legal_entity_id IN (SELECT user_legal_entity_ids())
    )
  );

CREATE POLICY actual_allocations_insert ON actual_transaction_allocations
  FOR INSERT WITH CHECK (
    organization_unit_id IN (
      SELECT id FROM organization_units WHERE legal_entity_id IN (SELECT user_legal_entity_ids())
    )
    AND (
      user_has_role('finance_user')
      OR user_has_role('cost_controller')
      OR user_has_role('system_administrator')
    )
  );

CREATE POLICY import_batches_insert ON import_batches
  FOR INSERT WITH CHECK (
    legal_entity_id IN (SELECT user_legal_entity_ids())
    AND (
      user_has_role('finance_user')
      OR user_has_role('cost_controller')
      OR user_has_role('system_administrator')
    )
    AND NOT user_has_role('auditor')
    AND NOT user_has_role('viewer')
  );

CREATE POLICY import_batches_update ON import_batches
  FOR UPDATE USING (
    legal_entity_id IN (SELECT user_legal_entity_ids())
    AND (
      user_has_role('finance_user')
      OR user_has_role('cost_controller')
      OR user_has_role('system_administrator')
    )
    AND NOT user_has_role('auditor')
    AND NOT user_has_role('viewer')
  );

CREATE POLICY imported_source_rows_insert ON imported_source_rows
  FOR INSERT WITH CHECK (
    import_batch_id IN (
      SELECT id FROM import_batches WHERE legal_entity_id IN (SELECT user_legal_entity_ids())
    )
    AND (
      user_has_role('finance_user')
      OR user_has_role('cost_controller')
      OR user_has_role('system_administrator')
    )
  );

CREATE POLICY imported_source_rows_read ON imported_source_rows
  FOR SELECT USING (
    import_batch_id IN (
      SELECT id FROM import_batches WHERE legal_entity_id IN (SELECT user_legal_entity_ids())
    )
  );

CREATE POLICY budget_change_requests_insert ON budget_change_requests
  FOR INSERT WITH CHECK (
    budget_version_id IN (
      SELECT id FROM budget_versions WHERE legal_entity_id IN (SELECT user_legal_entity_ids())
    )
    AND (
      user_has_role('budget_owner')
      OR user_has_role('cost_controller')
      OR user_has_role('system_administrator')
    )
    AND NOT user_has_role('auditor')
    AND NOT user_has_role('viewer')
  );

CREATE POLICY budget_change_requests_update ON budget_change_requests
  FOR UPDATE USING (
    budget_version_id IN (
      SELECT id FROM budget_versions WHERE legal_entity_id IN (SELECT user_legal_entity_ids())
    )
    AND (
      user_has_role('approver')
      OR user_has_role('system_administrator')
      OR user_has_role('legal_entity_administrator')
    )
    AND NOT user_has_role('auditor')
    AND NOT user_has_role('viewer')
  );

CREATE POLICY budget_change_lines_insert ON budget_change_lines
  FOR INSERT WITH CHECK (
    change_request_id IN (
      SELECT bcr.id FROM budget_change_requests bcr
      JOIN budget_versions bv ON bv.id = bcr.budget_version_id
      WHERE bv.legal_entity_id IN (SELECT user_legal_entity_ids())
    )
    AND NOT user_has_role('auditor')
    AND NOT user_has_role('viewer')
  );

CREATE POLICY variance_explanations_insert ON variance_explanations
  FOR INSERT WITH CHECK (
    legal_entity_id IN (SELECT user_legal_entity_ids())
    AND (
      user_has_role('finance_user')
      OR user_has_role('cost_controller')
      OR user_has_role('system_administrator')
    )
    AND NOT user_has_role('auditor')
    AND NOT user_has_role('viewer')
  );

CREATE POLICY unmapped_queue_insert ON unmapped_transaction_queue
  FOR INSERT WITH CHECK (
    import_batch_id IN (
      SELECT id FROM import_batches WHERE legal_entity_id IN (SELECT user_legal_entity_ids())
    )
    AND (
      user_has_role('finance_user')
      OR user_has_role('cost_controller')
    )
  );

CREATE POLICY duplicate_queue_read ON duplicate_review_queue
  FOR SELECT USING (
    import_batch_id IN (
      SELECT id FROM import_batches WHERE legal_entity_id IN (SELECT user_legal_entity_ids())
    )
  );

CREATE POLICY duplicate_queue_insert ON duplicate_review_queue
  FOR INSERT WITH CHECK (
    import_batch_id IN (
      SELECT id FROM import_batches WHERE legal_entity_id IN (SELECT user_legal_entity_ids())
    )
    AND (
      user_has_role('finance_user')
      OR user_has_role('cost_controller')
    )
  );

CREATE POLICY projects_insert ON projects
  FOR INSERT WITH CHECK (
    control_scope_id IN (
      SELECT id FROM control_scopes WHERE legal_entity_id IN (SELECT user_legal_entity_ids())
    )
    AND (
      user_has_role('project_manager')
      OR user_has_role('pmo_director')
      OR user_has_role('system_administrator')
    )
    AND NOT user_has_role('auditor')
    AND NOT user_has_role('viewer')
  );

ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY teams_member_read ON teams
  FOR SELECT USING (legal_entity_id IN (SELECT user_legal_entity_ids()));

CREATE POLICY milestones_member_read ON milestones
  FOR SELECT USING (
    project_id IN (
      SELECT p.id FROM projects p
      JOIN control_scopes cs ON cs.id = p.control_scope_id
      WHERE cs.legal_entity_id IN (SELECT user_legal_entity_ids())
    )
  );

-- Restrict SECURITY DEFINER function execution to authenticated users
REVOKE ALL ON FUNCTION user_legal_entity_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION user_legal_entity_ids() TO authenticated;

REVOKE ALL ON FUNCTION user_has_role(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION user_has_role(TEXT, UUID) TO authenticated;
