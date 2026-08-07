-- Integrity constraints, triggers, and expanded RLS

-- Cost hierarchy parent links for seeded nodes
UPDATE cost_nodes SET parent_id = '66666666-6666-6666-6666-666666666601'
WHERE id = '66666666-6666-6666-6666-666666666602';
UPDATE cost_nodes SET parent_id = '66666666-6666-6666-6666-666666666602'
WHERE id = '66666666-6666-6666-6666-666666666603';
UPDATE cost_nodes SET parent_id = '66666666-6666-6666-6666-666666666604'
WHERE id = '66666666-6666-6666-6666-666666666605';

-- Organization unit hierarchy
UPDATE organization_units SET parent_id = '33333333-3333-3333-3333-333333333301'
WHERE id IN ('33333333-3333-3333-3333-333333333303', '33333333-3333-3333-3333-333333333305');
UPDATE organization_units SET parent_id = '33333333-3333-3333-3333-333333333303'
WHERE id = '33333333-3333-3333-3333-333333333305';

-- Prevent self-parent on organization units
ALTER TABLE organization_units
  ADD CONSTRAINT organization_units_no_self_parent
  CHECK (parent_id IS NULL OR parent_id <> id);

CREATE OR REPLACE FUNCTION prevent_org_unit_cycle()
RETURNS TRIGGER AS $$
DECLARE
  current_id UUID := NEW.parent_id;
  depth INTEGER := 0;
BEGIN
  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.parent_id = NEW.id THEN
    RAISE EXCEPTION 'Organization unit cannot be its own parent';
  END IF;
  WHILE current_id IS NOT NULL AND depth < 100 LOOP
    IF current_id = NEW.id THEN
      RAISE EXCEPTION 'Organization unit hierarchy cycle detected';
    END IF;
    SELECT parent_id INTO current_id FROM organization_units WHERE id = current_id;
    depth := depth + 1;
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_org_units_prevent_cycle
  BEFORE INSERT OR UPDATE OF parent_id ON organization_units
  FOR EACH ROW EXECUTE FUNCTION prevent_org_unit_cycle();

-- Cost node cycle prevention
ALTER TABLE cost_nodes
  ADD CONSTRAINT cost_nodes_no_self_parent
  CHECK (parent_id IS NULL OR parent_id <> id);

CREATE OR REPLACE FUNCTION prevent_cost_node_cycle()
RETURNS TRIGGER AS $$
DECLARE
  current_id UUID := NEW.parent_id;
  depth INTEGER := 0;
BEGIN
  IF NEW.parent_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.parent_id = NEW.id THEN
    RAISE EXCEPTION 'Cost node cannot be its own parent';
  END IF;
  WHILE current_id IS NOT NULL AND depth < 100 LOOP
    IF current_id = NEW.id THEN
      RAISE EXCEPTION 'Cost hierarchy cycle detected';
    END IF;
    SELECT parent_id INTO current_id FROM cost_nodes WHERE id = current_id;
    depth := depth + 1;
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_cost_nodes_prevent_cycle
  BEFORE INSERT OR UPDATE OF parent_id ON cost_nodes
  FOR EACH ROW EXECUTE FUNCTION prevent_cost_node_cycle();

CREATE TRIGGER trg_cost_nodes_enforce_leaf_posting
  BEFORE INSERT OR UPDATE OF allows_posting ON cost_nodes
  FOR EACH ROW EXECUTE FUNCTION enforce_leaf_posting();

-- Prevent posting to inactive cost nodes
CREATE OR REPLACE FUNCTION prevent_inactive_cost_posting()
RETURNS TRIGGER AS $$
DECLARE
  node_status record_status;
  allows BOOLEAN;
BEGIN
  SELECT status, allows_posting INTO node_status, allows
  FROM cost_nodes WHERE id = NEW.cost_node_id;
  IF node_status = 'inactive' OR allows IS NOT TRUE THEN
    RAISE EXCEPTION 'Posting prohibited on inactive or non-leaf cost node';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_budget_lines_active_leaf
  BEFORE INSERT OR UPDATE ON budget_lines
  FOR EACH ROW EXECUTE FUNCTION prevent_inactive_cost_posting();

CREATE TRIGGER trg_actual_alloc_active_leaf
  BEFORE INSERT OR UPDATE ON actual_transaction_allocations
  FOR EACH ROW
  WHEN (NEW.cost_node_id IS NOT NULL)
  EXECUTE FUNCTION prevent_inactive_cost_posting();

-- Budget version immutability when locked/posted
CREATE OR REPLACE FUNCTION protect_locked_budget_version()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.approval_status IN ('locked', 'posted', 'superseded') THEN
    IF NEW.approval_status IS DISTINCT FROM OLD.approval_status
       AND NEW.approval_status NOT IN ('superseded', 'cancelled') THEN
      RAISE EXCEPTION 'Locked or posted budget version cannot be modified';
    END IF;
    IF NEW.original_approved_amount IS DISTINCT FROM OLD.original_approved_amount
       OR NEW.approved_increases IS DISTINCT FROM OLD.approved_increases
       OR NEW.approved_reductions IS DISTINCT FROM OLD.approved_reductions THEN
      RAISE EXCEPTION 'Approved financial amounts are immutable';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_budget_versions_immutable
  BEFORE UPDATE ON budget_versions
  FOR EACH ROW EXECUTE FUNCTION protect_locked_budget_version();

-- Allocation reconciliation
CREATE OR REPLACE FUNCTION validate_allocation_reconciliation()
RETURNS TRIGGER AS $$
DECLARE
  txn_id UUID;
  source_amount NUMERIC(18,4);
  allocated_total NUMERIC(18,4);
BEGIN
  txn_id := COALESCE(NEW.actual_transaction_id, OLD.actual_transaction_id);
  SELECT amount_ex_vat INTO source_amount FROM actual_transactions WHERE id = txn_id;
  SELECT COALESCE(SUM(allocation_amount), 0) INTO allocated_total
  FROM actual_transaction_allocations WHERE actual_transaction_id = txn_id;
  IF allocated_total > source_amount + 0.0001 THEN
    RAISE EXCEPTION 'Allocation total exceeds source transaction amount';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER trg_allocation_reconciliation
  AFTER INSERT OR UPDATE OR DELETE ON actual_transaction_allocations
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION validate_allocation_reconciliation();

-- Milestone progress segregation: reporter cannot verify own submission
ALTER TABLE milestone_progress_updates
  DROP CONSTRAINT IF EXISTS milestone_progress_updates_reported_by_check;
ALTER TABLE milestone_progress_updates
  ADD CONSTRAINT milestone_progress_updates_no_self_verify
  CHECK (verified_by IS NULL OR verified_by <> reported_by);

-- Schedule baseline preservation on projects
CREATE OR REPLACE FUNCTION protect_project_baseline()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.baseline_start IS NOT NULL AND NEW.baseline_start IS DISTINCT FROM OLD.baseline_start THEN
    RAISE EXCEPTION 'Original baseline start cannot be overwritten';
  END IF;
  IF OLD.baseline_end IS NOT NULL AND NEW.baseline_end IS DISTINCT FROM OLD.baseline_end THEN
    RAISE EXCEPTION 'Original baseline end cannot be overwritten';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_projects_protect_baseline
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION protect_project_baseline();

-- Budget workflow audit columns
ALTER TABLE budget_versions
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS submitted_by UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES profiles(id);

-- Import batch reconciliation fields
ALTER TABLE import_batches
  ADD COLUMN IF NOT EXISTS accepted_row_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rejected_row_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS accepted_total NUMERIC(18,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rejected_total NUMERIC(18,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS posted_total NUMERIC(18,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_posted BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS source_file_hash TEXT;

CREATE TABLE IF NOT EXISTS unmapped_transaction_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_batch_id UUID NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
  imported_source_row_id UUID REFERENCES imported_source_rows(id),
  actual_transaction_id UUID REFERENCES actual_transactions(id),
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS duplicate_review_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_batch_id UUID REFERENCES import_batches(id),
  candidate_transaction_id UUID REFERENCES actual_transactions(id),
  match_reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fix view with security invoker
DROP VIEW IF EXISTS v_budget_vs_actual;
CREATE VIEW v_budget_vs_actual
WITH (security_invoker = true) AS
SELECT
  bl.id AS budget_line_id,
  bv.legal_entity_id,
  bv.control_scope_id,
  bl.organization_unit_id,
  bl.cost_node_id,
  bl.planned_amount AS budget_amount,
  COALESCE(SUM(ata.allocation_amount), 0) AS actual_amount,
  bl.planned_amount - COALESCE(SUM(ata.allocation_amount), 0) AS variance_amount
FROM budget_lines bl
JOIN budget_versions bv ON bv.id = bl.budget_version_id
LEFT JOIN actual_transaction_allocations ata
  ON ata.cost_node_id = bl.cost_node_id
  AND (ata.organization_unit_id IS NOT DISTINCT FROM bl.organization_unit_id)
WHERE bv.approval_status IN ('approved', 'locked', 'posted')
GROUP BY bl.id, bv.legal_entity_id, bv.control_scope_id, bl.organization_unit_id, bl.cost_node_id, bl.planned_amount;

-- Expanded RLS policies
CREATE POLICY memberships_select_own ON memberships
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY organizations_select_member ON organizations
  FOR SELECT USING (
    id IN (
      SELECT organization_id FROM memberships
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY control_scopes_member_read ON control_scopes
  FOR SELECT USING (legal_entity_id IN (SELECT user_legal_entity_ids()));

CREATE POLICY projects_member_read ON projects
  FOR SELECT USING (
    control_scope_id IN (
      SELECT id FROM control_scopes WHERE legal_entity_id IN (SELECT user_legal_entity_ids())
    )
  );

CREATE POLICY budget_lines_read ON budget_lines
  FOR SELECT USING (
    budget_version_id IN (
      SELECT id FROM budget_versions WHERE legal_entity_id IN (SELECT user_legal_entity_ids())
    )
  );

CREATE POLICY budget_lines_write ON budget_lines
  FOR INSERT WITH CHECK (
    budget_version_id IN (
      SELECT id FROM budget_versions bv
      WHERE bv.legal_entity_id IN (SELECT user_legal_entity_ids())
        AND bv.approval_status IN ('draft', 'submitted', 'under_review')
        AND NOT user_has_role('auditor')
        AND NOT user_has_role('viewer')
    )
  );

CREATE POLICY budget_lines_update ON budget_lines
  FOR UPDATE USING (
    budget_version_id IN (
      SELECT id FROM budget_versions bv
      WHERE bv.legal_entity_id IN (SELECT user_legal_entity_ids())
        AND bv.approval_status IN ('draft', 'submitted', 'under_review')
        AND NOT user_has_role('auditor')
        AND NOT user_has_role('viewer')
    )
  );

CREATE POLICY commitments_read ON commitments
  FOR SELECT USING (legal_entity_id IN (SELECT user_legal_entity_ids()));

CREATE POLICY import_batches_read ON import_batches
  FOR SELECT USING (legal_entity_id IN (SELECT user_legal_entity_ids()));

ALTER TABLE import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE unmapped_transaction_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE duplicate_review_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_change_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE variance_explanations ENABLE ROW LEVEL SECURITY;

CREATE POLICY import_batches_read_policy ON import_batches
  FOR SELECT USING (legal_entity_id IN (SELECT user_legal_entity_ids()));

CREATE POLICY unmapped_queue_read ON unmapped_transaction_queue
  FOR SELECT USING (
    import_batch_id IN (
      SELECT id FROM import_batches WHERE legal_entity_id IN (SELECT user_legal_entity_ids())
    )
  );

CREATE POLICY variance_explanations_read ON variance_explanations
  FOR SELECT USING (legal_entity_id IN (SELECT user_legal_entity_ids()));

CREATE POLICY budget_change_requests_read ON budget_change_requests
  FOR SELECT USING (
    budget_version_id IN (
      SELECT id FROM budget_versions WHERE legal_entity_id IN (SELECT user_legal_entity_ids())
    )
  );

-- Service role bypass is implicit; authenticated users governed by policies above.
