-- Phase 3: Unified approvals workspace

CREATE TYPE approval_item_type AS ENUM (
  'budget', 'budget_change', 'import_batch', 'milestone_progress',
  'milestone_completion', 'schedule_extension', 'variance_explanation', 'contingency_use'
);

CREATE TABLE approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id UUID NOT NULL REFERENCES legal_entities(id),
  item_type approval_item_type NOT NULL,
  entity_id UUID NOT NULL,
  title_en TEXT NOT NULL,
  title_ar TEXT NOT NULL,
  requester_id UUID NOT NULL REFERENCES profiles(id),
  approver_id UUID REFERENCES profiles(id),
  delegated_to UUID REFERENCES profiles(id),
  approval_status approval_status NOT NULL DEFAULT 'submitted',
  due_date DATE,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_approval_requests_status ON approval_requests(approval_status);
CREATE INDEX idx_approval_requests_approver ON approval_requests(approver_id);
CREATE INDEX idx_approval_requests_requester ON approval_requests(requester_id);

-- Unified inbox view from existing workflow tables
CREATE OR REPLACE VIEW v_approval_inbox AS
SELECT
  bv.id AS entity_id,
  bv.legal_entity_id,
  'budget'::approval_item_type AS item_type,
  bv.version_label AS title_en,
  bv.version_label AS title_ar,
  bv.submitted_by AS requester_id,
  bv.approval_status,
  bv.submitted_at,
  NULL::DATE AS due_date
FROM budget_versions bv
WHERE bv.approval_status IN ('submitted', 'under_review')
UNION ALL
SELECT
  bcr.id, bv.legal_entity_id, 'budget_change'::approval_item_type,
  bcr.reason, bcr.reason,
  bcr.requester_id, bcr.approval_status, bcr.created_at, NULL::DATE
FROM budget_change_requests bcr
JOIN budget_versions bv ON bv.id = bcr.budget_version_id
WHERE bcr.approval_status = 'submitted'
UNION ALL
SELECT
  ib.id, ib.legal_entity_id, 'import_batch'::approval_item_type,
  COALESCE(ib.file_name, 'Import batch'), COALESCE(ib.file_name, 'دفعة استيراد'),
  ib.imported_by, ib.approval_status, ib.created_at, NULL::DATE
FROM import_batches ib
WHERE ib.approval_status = 'submitted'
UNION ALL
SELECT
  mpu.id, cs.legal_entity_id, 'milestone_progress'::approval_item_type,
  m.name_en, m.name_ar,
  mpu.reported_by, mpu.approval_status, mpu.created_at, NULL::DATE
FROM milestone_progress_updates mpu
JOIN milestones m ON m.id = mpu.milestone_id
JOIN projects p ON p.id = m.project_id
JOIN control_scopes cs ON cs.id = p.control_scope_id
WHERE mpu.approval_status = 'submitted' AND mpu.verified_by IS NULL
UNION ALL
SELECT
  scr.id, cs.legal_entity_id, 'schedule_extension'::approval_item_type,
  scr.reason, scr.reason,
  scr.requester_id, scr.approval_status, scr.created_at, NULL::DATE
FROM schedule_change_requests scr
JOIN projects p ON p.id = scr.project_id
JOIN control_scopes cs ON cs.id = p.control_scope_id
WHERE scr.approval_status = 'submitted'
UNION ALL
SELECT
  ve.id, ve.legal_entity_id, 'variance_explanation'::approval_item_type,
  ve.cause, ve.cause,
  ve.responsible_owner_id, ve.approval_status, ve.created_at, ve.target_resolution_date
FROM variance_explanations ve
WHERE ve.approval_status = 'submitted';

ALTER TABLE approval_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY approval_requests_read ON approval_requests
  FOR SELECT USING (legal_entity_id IN (SELECT user_legal_entity_ids()));

CREATE POLICY approval_requests_insert ON approval_requests
  FOR INSERT WITH CHECK (
    legal_entity_id IN (SELECT user_legal_entity_ids())
    AND requester_id = auth.uid()
    AND NOT user_has_role('auditor') AND NOT user_has_role('viewer')
  );

CREATE POLICY approval_requests_update ON approval_requests
  FOR UPDATE USING (
    legal_entity_id IN (SELECT user_legal_entity_ids())
    AND (
      user_has_role('approver') OR user_has_role('finance_user')
      OR user_has_role('cost_controller') OR user_has_role('system_administrator')
    )
    AND NOT user_has_role('auditor') AND NOT user_has_role('viewer')
  );

-- Grant view access
GRANT SELECT ON v_approval_inbox TO authenticated;
