-- ULTRA: delegation resolution, period-close checklist/reopen, appraisals, master deactivate, notify helper

ALTER TYPE public.approval_item_type ADD VALUE IF NOT EXISTS 'purchase_order';
ALTER TYPE public.approval_item_type ADD VALUE IF NOT EXISTS 'payment_request';
ALTER TYPE public.approval_item_type ADD VALUE IF NOT EXISTS 'period_reopen';
ALTER TYPE public.approval_item_type ADD VALUE IF NOT EXISTS 'appraisal';

-- =============================================================================
-- E) Notifications helper
-- =============================================================================
CREATE OR REPLACE FUNCTION private.notify_user(
  p_user_id UUID,
  p_title_en TEXT,
  p_title_ar TEXT,
  p_related_type TEXT DEFAULT NULL,
  p_related_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_id UUID;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN NULL;
  END IF;
  INSERT INTO public.notifications (
    user_id, severity, title_en, title_ar, related_entity_type, related_entity_id, status
  ) VALUES (
    p_user_id, 'info', p_title_en, p_title_ar, p_related_type, p_related_id, 'open'
  ) RETURNING id INTO v_id;
  RETURN v_id;
END
$function$;

REVOKE ALL ON FUNCTION private.notify_user(UUID, TEXT, TEXT, TEXT, UUID) FROM PUBLIC;

-- =============================================================================
-- A) Delegation resolution + inbox + cycle guard + act-as
-- =============================================================================
CREATE OR REPLACE FUNCTION private.delegation_would_cycle(
  p_legal_entity_id UUID,
  p_delegator_id UUID,
  p_delegate_id UUID,
  p_workflow_type TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_cursor UUID := p_delegate_id;
  v_hops INTEGER := 0;
  v_next UUID;
BEGIN
  IF p_delegator_id = p_delegate_id THEN
    RETURN true;
  END IF;
  WHILE v_cursor IS NOT NULL AND v_hops < 16 LOOP
    IF v_cursor = p_delegator_id THEN
      RETURN true;
    END IF;
    SELECT ad.delegate_id INTO v_next
    FROM public.approval_delegations AS ad
    WHERE ad.legal_entity_id = p_legal_entity_id
      AND ad.delegator_id = v_cursor
      AND ad.workflow_type = p_workflow_type
      AND ad.delegation_status = 'active'
      AND ad.effective_start <= NOW()
      AND ad.effective_end >= NOW()
    LIMIT 1;
    v_cursor := v_next;
    v_hops := v_hops + 1;
    v_next := NULL;
  END LOOP;
  RETURN false;
END
$function$;

REVOKE ALL ON FUNCTION private.delegation_would_cycle(UUID, UUID, UUID, TEXT) FROM PUBLIC;

CREATE OR REPLACE FUNCTION private.resolve_effective_approver(
  p_original_assignee UUID,
  p_legal_entity UUID,
  p_workflow_type TEXT
)
RETURNS TABLE (
  effective_assignee_id UUID,
  delegation_id UUID
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_del public.approval_delegations%ROWTYPE;
BEGIN
  IF p_original_assignee IS NULL THEN
    effective_assignee_id := NULL;
    delegation_id := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT ad.* INTO v_del
  FROM public.approval_delegations AS ad
  WHERE ad.legal_entity_id = p_legal_entity
    AND ad.delegator_id = p_original_assignee
    AND ad.workflow_type = p_workflow_type
    AND ad.delegation_status = 'active'
    AND ad.effective_start <= NOW()
    AND ad.effective_end >= NOW()
    AND ad.revoked_at IS NULL
  ORDER BY ad.effective_start DESC
  LIMIT 1;

  IF FOUND THEN
    effective_assignee_id := v_del.delegate_id;
    delegation_id := v_del.id;
  ELSE
    effective_assignee_id := p_original_assignee;
    delegation_id := NULL;
  END IF;
  RETURN NEXT;
END
$function$;

REVOKE ALL ON FUNCTION private.resolve_effective_approver(UUID, UUID, TEXT) FROM PUBLIC;

-- Patch delegation_create_draft to block cycles
CREATE OR REPLACE FUNCTION private.delegation_create_draft(
  p_legal_entity_id UUID, p_delegate_id UUID, p_control_scope_id UUID,
  p_workflow_type TEXT, p_permission_code TEXT, p_financial_threshold NUMERIC(18,4),
  p_effective_start TIMESTAMPTZ, p_effective_end TIMESTAMPTZ, p_reason TEXT,
  p_idempotency_key TEXT DEFAULT NULL, p_correlation_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor UUID := (SELECT auth.uid());
  v_cmd TEXT := 'delegation_create_draft';
  v_replay JSONB;
  v_id UUID;
  v_result JSONB;
BEGIN
  v_replay := private.command_check_idempotency(v_cmd, p_idempotency_key, v_actor);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF v_actor IS NULL OR NOT private.current_user_is_active() THEN
    RETURN private.command_fail('UNAUTHENTICATED', 'Authentication required');
  END IF;
  IF p_delegate_id = v_actor THEN
    RETURN private.command_fail('SOD_VIOLATION', 'Cannot delegate to self');
  END IF;
  IF private.delegation_would_cycle(p_legal_entity_id, v_actor, p_delegate_id, p_workflow_type) THEN
    RETURN private.command_fail('CYCLE', 'Delegation would create a cycle');
  END IF;
  IF NOT private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator','approver','finance_user','cost_controller'],
    p_legal_entity_id, 'legal_entity', p_legal_entity_id) THEN
    RETURN private.command_fail('FORBIDDEN', 'Insufficient role to create delegation');
  END IF;

  INSERT INTO public.approval_delegations (
    legal_entity_id, delegator_id, delegate_id, control_scope_id, workflow_type,
    permission_code, financial_threshold, effective_start, effective_end, reason, delegation_status
  ) VALUES (
    p_legal_entity_id, v_actor, p_delegate_id, p_control_scope_id, p_workflow_type,
    p_permission_code, p_financial_threshold, p_effective_start, p_effective_end, p_reason, 'draft'
  ) RETURNING id INTO v_id;

  PERFORM private.write_audit_event(
    v_actor, 'create', 'approval_delegation', v_id,
    p_legal_entity_id, NULL, NULL,
    p_correlation_id, p_idempotency_key,
    NULL,
    jsonb_build_object('delegate_id', p_delegate_id, 'workflow_type', p_workflow_type),
    p_reason, NULL
  );

  v_result := private.command_ok(jsonb_build_object('entity_id', v_id));
  PERFORM private.command_store_idempotency(v_cmd, p_idempotency_key, v_actor, v_result);
  RETURN v_result;
END
$function$;

CREATE TABLE IF NOT EXISTS public.approval_decision_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id UUID NOT NULL REFERENCES public.legal_entities(id),
  item_type public.approval_item_type NOT NULL,
  entity_id UUID NOT NULL,
  decision TEXT NOT NULL,
  actor_id UUID NOT NULL REFERENCES public.profiles(id),
  original_assignee_id UUID REFERENCES public.profiles(id),
  delegator_id UUID REFERENCES public.profiles(id),
  delegation_id UUID REFERENCES public.approval_delegations(id),
  acting_as BOOLEAN NOT NULL DEFAULT false,
  comments TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_approval_decision_audit_entity
  ON public.approval_decision_audit (item_type, entity_id, created_at DESC);

ALTER TABLE public.approval_decision_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_decision_audit FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS approval_decision_audit_select_member ON public.approval_decision_audit;
CREATE POLICY approval_decision_audit_select_member ON public.approval_decision_audit
  FOR SELECT TO authenticated USING (private.user_can_access_legal_entity(legal_entity_id));

GRANT SELECT ON TABLE public.approval_decision_audit TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_approval_act_as_delegate(
  p_item_type public.approval_item_type,
  p_entity_id UUID,
  p_decision TEXT,
  p_original_assignee_id UUID,
  p_delegation_id UUID,
  p_comments TEXT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL,
  p_correlation_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor UUID := (SELECT auth.uid());
  v_cmd TEXT := 'approval_act_as_delegate';
  v_replay JSONB;
  v_del public.approval_delegations%ROWTYPE;
  v_audit_id UUID;
  v_result JSONB;
BEGIN
  v_replay := private.command_check_idempotency(v_cmd, p_idempotency_key, v_actor);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF v_actor IS NULL OR NOT private.current_user_is_active() THEN
    RETURN private.command_fail('UNAUTHENTICATED', 'Authentication required');
  END IF;
  IF p_decision IS NULL OR btrim(p_decision) = '' THEN
    RETURN private.command_fail('VALIDATION', 'Decision required');
  END IF;

  SELECT * INTO v_del FROM public.approval_delegations AS ad
  WHERE ad.id = p_delegation_id FOR UPDATE;
  IF NOT FOUND THEN RETURN private.command_fail('NOT_FOUND', 'Delegation not found'); END IF;
  IF v_del.delegation_status <> 'active'
     OR v_del.effective_start > NOW()
     OR v_del.effective_end < NOW() THEN
    RETURN private.command_fail('INVALID_STATE', 'Delegation not active');
  END IF;
  IF v_del.delegate_id <> v_actor THEN
    RETURN private.command_fail('FORBIDDEN', 'Only active delegate may act');
  END IF;
  IF v_del.delegator_id IS DISTINCT FROM p_original_assignee_id THEN
    RETURN private.command_fail('VALIDATION', 'Original assignee does not match delegation');
  END IF;

  INSERT INTO public.approval_decision_audit (
    legal_entity_id, item_type, entity_id, decision, actor_id,
    original_assignee_id, delegator_id, delegation_id, acting_as, comments
  ) VALUES (
    v_del.legal_entity_id, p_item_type, p_entity_id, p_decision, v_actor,
    p_original_assignee_id, v_del.delegator_id, p_delegation_id, true, p_comments
  ) RETURNING id INTO v_audit_id;

  PERFORM private.write_audit_event(
    v_actor, 'approve', 'approval_decision', v_audit_id,
    v_del.legal_entity_id, NULL, NULL, p_correlation_id, p_idempotency_key,
    NULL,
    jsonb_build_object(
      'acting_as', true,
      'delegator_id', v_del.delegator_id,
      'delegation_id', p_delegation_id,
      'item_type', p_item_type,
      'entity_id', p_entity_id,
      'decision', p_decision
    ),
    p_comments, NULL
  );

  PERFORM private.notify_user(
    v_del.delegator_id,
    'Delegated approval action taken',
    'تم اتخاذ إجراء موافقة بالتفويض',
    'approval_decision',
    v_audit_id
  );

  v_result := private.command_ok(jsonb_build_object(
    'entity_id', v_audit_id,
    'acting_as', true,
    'delegator_id', v_del.delegator_id
  ));
  PERFORM private.command_store_idempotency(v_cmd, p_idempotency_key, v_actor, v_result);
  RETURN v_result;
END
$function$;

REVOKE ALL ON FUNCTION public.rpc_approval_act_as_delegate(
  public.approval_item_type, UUID, TEXT, UUID, UUID, TEXT, TEXT, UUID
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_approval_act_as_delegate(
  public.approval_item_type, UUID, TEXT, UUID, UUID, TEXT, TEXT, UUID
) TO authenticated;

-- Recreate inbox with original/effective assignee columns
-- DROP required: CREATE OR REPLACE cannot rename/reorder view columns.
DROP VIEW IF EXISTS public.v_delegated_approval_inbox;
DROP VIEW IF EXISTS public.v_approval_inbox;

CREATE VIEW public.v_approval_inbox
WITH (security_invoker = true) AS
WITH base AS (
  SELECT
    bv.id AS entity_id,
    bv.legal_entity_id,
    'budget'::public.approval_item_type AS item_type,
    bv.version_label AS title_en,
    bv.version_label AS title_ar,
    bv.submitted_by AS requester_id,
    bv.submitted_by AS original_assignee_id,
    'budget'::TEXT AS workflow_type,
    bv.approval_status,
    bv.submitted_at,
    NULL::DATE AS due_date
  FROM public.budget_versions AS bv
  WHERE bv.approval_status IN ('submitted', 'under_review')
  UNION ALL
  SELECT
    bcr.id, bv.legal_entity_id, 'budget_change'::public.approval_item_type,
    bcr.reason, bcr.reason, bcr.requester_id, bcr.requester_id, 'budget_change',
    bcr.approval_status, bcr.created_at, NULL::DATE
  FROM public.budget_change_requests AS bcr
  JOIN public.budget_versions AS bv ON bv.id = bcr.budget_version_id
  WHERE bcr.approval_status = 'submitted'
  UNION ALL
  SELECT
    ib.id, ib.legal_entity_id, 'import_batch'::public.approval_item_type,
    COALESCE(ib.file_name, 'Import batch'), COALESCE(ib.file_name, 'دفعة استيراد'),
    ib.imported_by, ib.imported_by, 'import_batch',
    ib.approval_status, ib.created_at, NULL::DATE
  FROM public.import_batches AS ib
  WHERE ib.approval_status = 'submitted'
  UNION ALL
  SELECT
    mpu.id, cs.legal_entity_id, 'milestone_progress'::public.approval_item_type,
    m.name_en, m.name_ar, mpu.reported_by, mpu.reported_by, 'milestone_progress',
    mpu.approval_status, mpu.created_at, NULL::DATE
  FROM public.milestone_progress_updates AS mpu
  JOIN public.milestones AS m ON m.id = mpu.milestone_id
  JOIN public.projects AS p ON p.id = m.project_id
  JOIN public.control_scopes AS cs ON cs.id = p.control_scope_id
  WHERE mpu.approval_status = 'submitted' AND mpu.verified_by IS NULL
  UNION ALL
  SELECT
    scr.id, cs.legal_entity_id, 'schedule_extension'::public.approval_item_type,
    scr.reason, scr.reason, scr.requester_id, scr.requester_id, 'schedule_extension',
    scr.approval_status, scr.created_at, NULL::DATE
  FROM public.schedule_change_requests AS scr
  JOIN public.projects AS p ON p.id = scr.project_id
  JOIN public.control_scopes AS cs ON cs.id = p.control_scope_id
  WHERE scr.approval_status = 'submitted'
  UNION ALL
  SELECT
    ve.id, ve.legal_entity_id, 'variance_explanation'::public.approval_item_type,
    ve.cause, ve.cause, ve.responsible_owner_id, ve.responsible_owner_id, 'variance_explanation',
    ve.approval_status, ve.created_at, ve.target_resolution_date
  FROM public.variance_explanations AS ve
  WHERE ve.approval_status = 'submitted'
  UNION ALL
  SELECT
    ad.id, ad.legal_entity_id, 'delegation'::public.approval_item_type,
    ad.workflow_type, ad.workflow_type, ad.delegator_id, ad.delegator_id, 'delegation',
    'submitted'::public.approval_status, ad.created_at, ad.effective_end::DATE
  FROM public.approval_delegations AS ad
  WHERE ad.delegation_status = 'submitted'
  UNION ALL
  SELECT
    pr.id, pr.legal_entity_id, 'purchase_requisition'::public.approval_item_type,
    pr.title_en, pr.title_ar, pr.requester_id, pr.requester_id, 'purchase_requisition',
    'submitted'::public.approval_status, pr.submitted_at, NULL::DATE
  FROM public.purchase_requisitions AS pr
  WHERE pr.requisition_status IN ('submitted', 'procurement_review')
  UNION ALL
  SELECT
    arv.id, arv.legal_entity_id, 'approval_rule'::public.approval_item_type,
    arv.workflow_type, arv.workflow_type, arv.created_by, arv.created_by, 'approval_rule',
    'submitted'::public.approval_status, arv.created_at, NULL::DATE
  FROM public.approval_rule_versions AS arv
  WHERE arv.governance_status = 'submitted'
)
SELECT
  b.entity_id,
  b.legal_entity_id,
  b.item_type,
  b.title_en,
  b.title_ar,
  b.requester_id,
  b.original_assignee_id,
  r.effective_assignee_id,
  r.delegation_id,
  b.approval_status,
  b.submitted_at,
  b.due_date
FROM base AS b
CROSS JOIN LATERAL private.resolve_effective_approver(
  b.original_assignee_id, b.legal_entity_id, b.workflow_type
) AS r;

COMMENT ON VIEW public.v_approval_inbox IS
  '@classification data_api_exposed; authenticated only; security_invoker; includes original/effective assignee + delegation_id';

CREATE OR REPLACE VIEW public.v_delegated_approval_inbox
WITH (security_invoker = true) AS
SELECT *
FROM public.v_approval_inbox AS vai
WHERE vai.effective_assignee_id = (SELECT auth.uid())
  AND vai.delegation_id IS NOT NULL;

COMMENT ON VIEW public.v_delegated_approval_inbox IS
  '@classification data_api_exposed; items where current user is effective delegate';

GRANT SELECT ON public.v_approval_inbox TO authenticated;
GRANT SELECT ON public.v_delegated_approval_inbox TO authenticated;

-- =============================================================================
-- B) Period close checklist + reopen + readiness + gated hard close
-- =============================================================================
DO $enum$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'period_checklist_item_type') THEN
    CREATE TYPE public.period_checklist_item_type AS ENUM ('automatic', 'manual', 'evidence_required');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'period_checklist_item_status') THEN
    CREATE TYPE public.period_checklist_item_status AS ENUM (
      'pending', 'in_progress', 'passed', 'failed', 'waived'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'period_reopen_request_status') THEN
    CREATE TYPE public.period_reopen_request_status AS ENUM (
      'draft', 'submitted', 'approved', 'rejected', 'cancelled'
    );
  END IF;
END
$enum$;

CREATE TABLE IF NOT EXISTS public.period_close_checklist_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id UUID NOT NULL REFERENCES public.legal_entities(id),
  module public.period_module NOT NULL,
  code TEXT NOT NULL,
  name_en TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (legal_entity_id, module, code)
);

CREATE TABLE IF NOT EXISTS public.period_close_checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.period_close_checklist_templates(id) ON DELETE CASCADE,
  sequence_no INTEGER NOT NULL,
  name_en TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  description TEXT,
  item_type public.period_checklist_item_type NOT NULL DEFAULT 'manual',
  owner_role_code TEXT,
  is_required BOOLEAN NOT NULL DEFAULT true,
  is_blocking BOOLEAN NOT NULL DEFAULT true,
  control_code TEXT,
  UNIQUE (template_id, sequence_no)
);

CREATE TABLE IF NOT EXISTS public.period_close_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id UUID NOT NULL REFERENCES public.legal_entities(id),
  fiscal_period_id UUID NOT NULL REFERENCES public.fiscal_periods(id),
  module public.period_module NOT NULL,
  template_id UUID REFERENCES public.period_close_checklist_templates(id),
  readiness_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (legal_entity_id, fiscal_period_id, module)
);

CREATE TABLE IF NOT EXISTS public.period_close_item_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id UUID NOT NULL REFERENCES public.period_close_instances(id) ON DELETE CASCADE,
  checklist_item_id UUID NOT NULL REFERENCES public.period_close_checklist_items(id),
  item_status public.period_checklist_item_status NOT NULL DEFAULT 'pending',
  completed_by UUID REFERENCES public.profiles(id),
  completed_at TIMESTAMPTZ,
  evidence_reference TEXT,
  comments TEXT,
  waiver_reason TEXT,
  automatic_result JSONB,
  UNIQUE (instance_id, checklist_item_id)
);

CREATE TABLE IF NOT EXISTS public.period_reopen_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id UUID NOT NULL REFERENCES public.legal_entities(id),
  fiscal_period_id UUID NOT NULL REFERENCES public.fiscal_periods(id),
  module public.period_module NOT NULL,
  requested_by UUID NOT NULL REFERENCES public.profiles(id),
  approved_by UUID REFERENCES public.profiles(id),
  status public.period_reopen_request_status NOT NULL DEFAULT 'draft',
  reason TEXT NOT NULL,
  decision_reason TEXT,
  evidence_reference TEXT,
  target_state public.period_control_state NOT NULL DEFAULT 'open',
  requested_at TIMESTAMPTZ,
  decided_at TIMESTAMPTZ,
  row_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_period_reopen_active
  ON public.period_reopen_requests (legal_entity_id, fiscal_period_id, module)
  WHERE status IN ('draft', 'submitted');

CREATE OR REPLACE FUNCTION public.rpc_period_close_evaluate_readiness(
  p_fiscal_period_id UUID,
  p_legal_entity_id UUID,
  p_module public.period_module DEFAULT 'actuals'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor UUID := (SELECT auth.uid());
  v_unmapped INTEGER := 0;
  v_incomplete_alloc INTEGER := 0;
  v_open_exceptions INTEGER := 0;
  v_blocking_incomplete INTEGER := 0;
  v_pass BOOLEAN;
BEGIN
  IF v_actor IS NULL OR NOT private.current_user_is_active() THEN
    RETURN private.command_fail('UNAUTHENTICATED', 'Authentication required');
  END IF;
  IF NOT private.user_can_access_legal_entity(p_legal_entity_id) THEN
    RETURN private.command_fail('FORBIDDEN', 'No access to legal entity');
  END IF;

  SELECT COUNT(*)::INTEGER INTO v_unmapped
  FROM public.unmapped_transaction_queue AS utq
  JOIN public.import_batches AS ib ON ib.id = utq.import_batch_id
  WHERE ib.legal_entity_id = p_legal_entity_id
    AND utq.status = 'open';

  SELECT COUNT(*)::INTEGER INTO v_incomplete_alloc
  FROM public.actual_transactions AS atx
  WHERE atx.legal_entity_id = p_legal_entity_id
    AND atx.accounting_period_id = p_fiscal_period_id
    AND atx.is_posted = true
    AND ABS(atx.amount_ex_vat) > 0
    AND ABS(COALESCE((
      SELECT SUM(ata.allocation_amount) FROM public.actual_transaction_allocations AS ata
      WHERE ata.actual_transaction_id = atx.id
    ), 0) - atx.amount_ex_vat) > 0.0001;

  SELECT COUNT(*)::INTEGER INTO v_open_exceptions
  FROM public.invoice_match_exceptions AS ime
  JOIN public.supplier_invoices AS si ON si.id = ime.supplier_invoice_id
  WHERE si.legal_entity_id = p_legal_entity_id
    AND ime.is_resolved = false
    AND (si.fiscal_period_id IS NULL OR si.fiscal_period_id = p_fiscal_period_id);

  SELECT COUNT(*)::INTEGER INTO v_blocking_incomplete
  FROM public.period_close_item_results AS r
  JOIN public.period_close_instances AS i ON i.id = r.instance_id
  JOIN public.period_close_checklist_items AS ci ON ci.id = r.checklist_item_id
  WHERE i.legal_entity_id = p_legal_entity_id
    AND i.fiscal_period_id = p_fiscal_period_id
    AND i.module = p_module
    AND ci.is_blocking = true
    AND r.item_status NOT IN ('passed', 'waived');

  v_pass := (v_unmapped = 0 AND v_incomplete_alloc = 0 AND v_open_exceptions = 0 AND v_blocking_incomplete = 0);

  RETURN private.command_ok(jsonb_build_object(
    'pass', v_pass,
    'controls', jsonb_build_array(
      jsonb_build_object('control_code', 'unmapped_actuals', 'pass', v_unmapped = 0, 'count', v_unmapped),
      jsonb_build_object('control_code', 'incomplete_allocations', 'pass', v_incomplete_alloc = 0, 'count', v_incomplete_alloc),
      jsonb_build_object('control_code', 'open_match_exceptions', 'pass', v_open_exceptions = 0, 'count', v_open_exceptions),
      jsonb_build_object('control_code', 'blocking_checklist_incomplete', 'pass', v_blocking_incomplete = 0, 'count', v_blocking_incomplete)
    )
  ));
END
$function$;

CREATE OR REPLACE FUNCTION public.rpc_period_hard_close_with_checklist(
  p_fiscal_period_id UUID,
  p_legal_entity_id UUID,
  p_module public.period_module,
  p_expected_state public.period_control_state DEFAULT 'soft_close',
  p_idempotency_key TEXT DEFAULT NULL,
  p_correlation_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_ready JSONB;
  v_blocking INTEGER;
BEGIN
  v_ready := public.rpc_period_close_evaluate_readiness(p_fiscal_period_id, p_legal_entity_id, p_module);
  IF NOT COALESCE((v_ready->>'ok')::boolean, false) THEN
    RETURN v_ready;
  END IF;
  IF NOT COALESCE((v_ready->>'pass')::boolean, false) THEN
    RETURN private.command_fail('READINESS', 'Period hard close blocked by readiness controls');
  END IF;

  SELECT COUNT(*)::INTEGER INTO v_blocking
  FROM public.period_close_item_results AS r
  JOIN public.period_close_instances AS i ON i.id = r.instance_id
  JOIN public.period_close_checklist_items AS ci ON ci.id = r.checklist_item_id
  WHERE i.legal_entity_id = p_legal_entity_id
    AND i.fiscal_period_id = p_fiscal_period_id
    AND i.module = p_module
    AND ci.is_blocking = true
    AND r.item_status NOT IN ('passed', 'waived');
  IF v_blocking > 0 THEN
    RETURN private.command_fail('CHECKLIST', 'Blocking checklist items incomplete');
  END IF;

  RETURN private.period_module_transition(
    p_fiscal_period_id, p_legal_entity_id, p_module,
    p_expected_state, 'hard_close', NULL, p_idempotency_key, p_correlation_id
  );
END
$function$;

CREATE OR REPLACE FUNCTION public.rpc_period_hard_close_gated(
  p_fiscal_period_id UUID,
  p_legal_entity_id UUID,
  p_module public.period_module,
  p_expected_state public.period_control_state DEFAULT 'soft_close',
  p_idempotency_key TEXT DEFAULT NULL,
  p_correlation_id UUID DEFAULT NULL
) RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.rpc_period_hard_close_with_checklist(
    p_fiscal_period_id, p_legal_entity_id, p_module, p_expected_state, p_idempotency_key, p_correlation_id
  );
$$;

CREATE OR REPLACE FUNCTION public.rpc_period_reopen_request(
  p_fiscal_period_id UUID,
  p_legal_entity_id UUID,
  p_module public.period_module,
  p_reason TEXT,
  p_evidence_reference TEXT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL,
  p_correlation_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor UUID := (SELECT auth.uid());
  v_cmd TEXT := 'period_reopen_request';
  v_replay JSONB;
  v_id UUID;
  v_state public.period_control_state;
  v_result JSONB;
BEGIN
  v_replay := private.command_check_idempotency(v_cmd, p_idempotency_key, v_actor);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF v_actor IS NULL OR NOT private.current_user_is_active() THEN
    RETURN private.command_fail('UNAUTHENTICATED', 'Authentication required');
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
    RETURN private.command_fail('VALIDATION', 'Reopen reason required');
  END IF;
  IF NOT private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator','finance_user','cost_controller'],
    p_legal_entity_id, 'legal_entity', p_legal_entity_id
  ) THEN
    RETURN private.command_fail('FORBIDDEN', 'Insufficient role to request reopen');
  END IF;

  SELECT fpmc.control_state INTO v_state
  FROM public.fiscal_period_module_controls AS fpmc
  WHERE fpmc.fiscal_period_id = p_fiscal_period_id
    AND fpmc.legal_entity_id = p_legal_entity_id
    AND fpmc.module = p_module;
  IF v_state IS DISTINCT FROM 'hard_close' THEN
    RETURN private.command_fail('INVALID_STATE', 'Module must be hard closed to request reopen');
  END IF;

  INSERT INTO public.period_reopen_requests (
    legal_entity_id, fiscal_period_id, module, requested_by, status, reason,
    evidence_reference, requested_at
  ) VALUES (
    p_legal_entity_id, p_fiscal_period_id, p_module, v_actor, 'submitted', p_reason,
    p_evidence_reference, NOW()
  ) RETURNING id INTO v_id;

  PERFORM private.write_audit_event(
    v_actor, 'create', 'period_reopen_request', v_id,
    p_legal_entity_id, NULL, NULL, p_correlation_id, p_idempotency_key,
    NULL, jsonb_build_object('module', p_module, 'fiscal_period_id', p_fiscal_period_id),
    p_reason, NULL
  );

  v_result := private.command_ok(jsonb_build_object('entity_id', v_id, 'status', 'submitted'));
  PERFORM private.command_store_idempotency(v_cmd, p_idempotency_key, v_actor, v_result);
  RETURN v_result;
END
$function$;

CREATE OR REPLACE FUNCTION public.rpc_period_reopen_approve(
  p_reopen_request_id UUID,
  p_decision_reason TEXT DEFAULT NULL,
  p_expected_status public.period_reopen_request_status DEFAULT 'submitted',
  p_idempotency_key TEXT DEFAULT NULL,
  p_correlation_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor UUID := (SELECT auth.uid());
  v_cmd TEXT := 'period_reopen_approve';
  v_replay JSONB;
  v_row public.period_reopen_requests%ROWTYPE;
  v_close JSONB;
  v_result JSONB;
BEGIN
  v_replay := private.command_check_idempotency(v_cmd, p_idempotency_key, v_actor);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF v_actor IS NULL OR NOT private.current_user_is_active() THEN
    RETURN private.command_fail('UNAUTHENTICATED', 'Authentication required');
  END IF;

  SELECT * INTO v_row FROM public.period_reopen_requests AS prr
  WHERE prr.id = p_reopen_request_id FOR UPDATE;
  IF NOT FOUND THEN RETURN private.command_fail('NOT_FOUND', 'Reopen request not found'); END IF;
  IF v_row.status IS DISTINCT FROM p_expected_status THEN
    RETURN private.command_fail('STATE_MISMATCH', 'Unexpected reopen request status');
  END IF;
  IF v_row.requested_by = v_actor THEN
    RETURN private.command_fail('SOD_VIOLATION', 'Requester cannot approve own reopen');
  END IF;
  IF NOT private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator'],
    v_row.legal_entity_id, 'legal_entity', v_row.legal_entity_id
  ) THEN
    RETURN private.command_fail('FORBIDDEN', 'Senior gate roles required to approve reopen');
  END IF;

  UPDATE public.period_reopen_requests SET
    status = 'approved',
    approved_by = v_actor,
    decision_reason = p_decision_reason,
    decided_at = NOW(),
    updated_at = NOW(),
    row_version = row_version + 1
  WHERE id = p_reopen_request_id;

  v_close := private.period_module_transition(
    v_row.fiscal_period_id, v_row.legal_entity_id, v_row.module,
    'hard_close', 'reopened', v_row.reason, p_idempotency_key, p_correlation_id
  );
  IF NOT COALESCE((v_close->>'ok')::boolean, false) THEN
    RETURN v_close;
  END IF;

  PERFORM private.write_audit_event(
    v_actor, 'update', 'period_reopen_request', p_reopen_request_id,
    v_row.legal_entity_id, NULL, NULL, p_correlation_id, p_idempotency_key,
    jsonb_build_object('status', p_expected_status),
    jsonb_build_object('status', 'approved'),
    p_decision_reason, NULL
  );

  v_result := private.command_ok(jsonb_build_object(
    'entity_id', p_reopen_request_id,
    'status', 'approved',
    'period_control', v_close
  ));
  PERFORM private.command_store_idempotency(v_cmd, p_idempotency_key, v_actor, v_result);
  RETURN v_result;
END
$function$;

-- Wire assert_period_open into budget transitions (soft/hard close for budgets module)
CREATE OR REPLACE FUNCTION private.assert_budgets_periods_open(
  p_legal_entity_id UUID,
  p_fiscal_year_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_fp UUID;
BEGIN
  FOR v_fp IN
    SELECT fp.id FROM public.fiscal_periods AS fp WHERE fp.fiscal_year_id = p_fiscal_year_id
  LOOP
    PERFORM private.assert_period_open('budgets', p_legal_entity_id, v_fp);
  END LOOP;
END
$function$;

REVOKE ALL ON FUNCTION private.assert_budgets_periods_open(UUID, UUID) FROM PUBLIC;

-- Patch latest budget_transition to enforce budgets period open (after soft/hard close)
CREATE OR REPLACE FUNCTION private.budget_transition(
  p_budget_version_id UUID,
  p_expected_status public.approval_status,
  p_next_status public.approval_status,
  p_idempotency_key TEXT DEFAULT NULL,
  p_correlation_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor UUID := (SELECT auth.uid());
  v_cmd TEXT := 'budget_transition_' || p_next_status::text;
  v_replay JSONB;
  v_row public.budget_versions%ROWTYPE;
  v_total NUMERIC(18,4);
  v_result JSONB;
  v_allowed BOOLEAN;
BEGIN
  v_replay := private.command_check_idempotency(v_cmd, p_idempotency_key, v_actor);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

  IF v_actor IS NULL OR NOT private.current_user_is_active() THEN
    RETURN private.command_fail('UNAUTHENTICATED', 'Authentication required');
  END IF;

  SELECT * INTO v_row
  FROM public.budget_versions AS bv
  WHERE bv.id = p_budget_version_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN private.command_fail('NOT_FOUND', 'Budget version not found');
  END IF;

  IF v_row.approval_status IS DISTINCT FROM p_expected_status THEN
    RETURN private.command_fail('STATE_MISMATCH',
      format('Expected status %s but found %s', p_expected_status, v_row.approval_status));
  END IF;

  -- Period soft/hard close gate for budgets module
  BEGIN
    PERFORM private.assert_budgets_periods_open(v_row.legal_entity_id, v_row.fiscal_year_id);
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    RETURN private.command_fail('PERIOD_CLOSED', SQLERRM);
  END;

  IF NOT (
    (p_expected_status = 'draft' AND p_next_status = 'submitted')
    OR (p_expected_status = 'submitted' AND p_next_status IN ('under_review', 'rejected', 'cancelled'))
    OR (p_expected_status = 'under_review' AND p_next_status IN ('approved', 'rejected', 'cancelled'))
    OR (p_expected_status = 'approved' AND p_next_status IN ('locked', 'superseded'))
    OR (p_expected_status = 'locked' AND p_next_status IN ('posted', 'superseded'))
    OR (p_expected_status = 'posted' AND p_next_status = 'superseded')
  ) THEN
    RETURN private.command_fail('INVALID_TRANSITION',
      format('Transition %s -> %s is not allowed', p_expected_status, p_next_status));
  END IF;

  IF p_next_status = 'submitted' THEN
    v_allowed := private.user_has_any_role(
      ARRAY['system_administrator','legal_entity_administrator','cost_controller','budget_owner'],
      v_row.legal_entity_id, 'control_scope', v_row.control_scope_id);
  ELSIF p_next_status = 'under_review' THEN
    v_allowed := private.user_has_any_role(
      ARRAY['system_administrator','legal_entity_administrator','cost_controller','finance_user','approver'],
      v_row.legal_entity_id, 'control_scope', v_row.control_scope_id);
  ELSIF p_next_status IN ('approved', 'locked') THEN
    v_allowed := private.user_has_any_role(
      ARRAY['system_administrator','legal_entity_administrator','cost_controller','approver'],
      v_row.legal_entity_id, 'control_scope', v_row.control_scope_id);
    IF v_row.submitted_by = v_actor THEN
      RETURN private.command_fail('SOD_VIOLATION', 'Submitter cannot approve budget');
    END IF;
  ELSIF p_next_status = 'rejected' THEN
    v_allowed := private.user_has_any_role(
      ARRAY['system_administrator','legal_entity_administrator','cost_controller','approver'],
      v_row.legal_entity_id, 'control_scope', v_row.control_scope_id);
  ELSE
    v_allowed := private.user_has_any_role(
      ARRAY['system_administrator','legal_entity_administrator','cost_controller'],
      v_row.legal_entity_id, 'control_scope', v_row.control_scope_id);
  END IF;

  IF NOT v_allowed THEN
    RETURN private.command_fail('FORBIDDEN', 'Insufficient role for budget transition');
  END IF;

  IF p_next_status = 'approved' THEN
    SELECT COALESCE(SUM(bl.planned_amount), 0) INTO v_total
    FROM public.budget_lines AS bl WHERE bl.budget_version_id = p_budget_version_id;
  END IF;

  IF p_next_status IN ('approved', 'locked') THEN
    UPDATE public.budget_versions AS bv
    SET is_current_approved = false
    WHERE bv.legal_entity_id = v_row.legal_entity_id
      AND bv.control_scope_id IS NOT DISTINCT FROM v_row.control_scope_id
      AND bv.fiscal_year_id = v_row.fiscal_year_id
      AND bv.id <> p_budget_version_id
      AND bv.is_current_approved = true;
  END IF;

  UPDATE public.budget_versions AS bv SET
    approval_status = p_next_status,
    submitted_at = CASE WHEN p_next_status = 'submitted' THEN NOW() ELSE bv.submitted_at END,
    submitted_by = CASE WHEN p_next_status = 'submitted' THEN v_actor ELSE bv.submitted_by END,
    reviewed_at = CASE WHEN p_next_status = 'under_review' THEN NOW() ELSE bv.reviewed_at END,
    reviewed_by = CASE WHEN p_next_status = 'under_review' THEN v_actor ELSE bv.reviewed_by END,
    approved_at = CASE WHEN p_next_status = 'approved' THEN NOW() ELSE bv.approved_at END,
    approved_by = CASE WHEN p_next_status = 'approved' THEN v_actor ELSE bv.approved_by END,
    locked_at = CASE WHEN p_next_status = 'locked' THEN NOW() ELSE bv.locked_at END,
    is_current_approved = CASE WHEN p_next_status IN ('approved', 'locked') THEN true ELSE bv.is_current_approved END,
    original_approved_amount = CASE WHEN p_next_status = 'approved' THEN v_total ELSE bv.original_approved_amount END
  WHERE bv.id = p_budget_version_id
  RETURNING * INTO v_row;

  PERFORM private.write_audit_event(
    v_actor, 'approve', 'budget_version', p_budget_version_id,
    v_row.legal_entity_id, v_row.control_scope_id, NULL,
    p_correlation_id, p_idempotency_key,
    jsonb_build_object('approval_status', p_expected_status),
    jsonb_build_object('approval_status', p_next_status),
    NULL, NULL
  );

  v_result := private.command_ok(jsonb_build_object(
    'entity_id', p_budget_version_id,
    'approval_status', p_next_status,
    'original_approved_amount', v_row.original_approved_amount
  ));
  PERFORM private.command_store_idempotency(v_cmd, p_idempotency_key, v_actor, v_result);
  RETURN v_result;
END
$function$;

-- =============================================================================
-- C) Appraisals (no salary fields)
-- =============================================================================
DO $enum$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'appraisal_cycle_status') THEN
    CREATE TYPE public.appraisal_cycle_status AS ENUM ('draft', 'active', 'review', 'closed', 'cancelled');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'appraisal_assignment_status') THEN
    CREATE TYPE public.appraisal_assignment_status AS ENUM (
      'draft', 'employee_self_review', 'self_submitted', 'manager_review',
      'manager_submitted', 'reviewer_review', 'finalized', 'employee_acknowledged',
      'returned_for_revision', 'cancelled'
    );
  END IF;
END
$enum$;

CREATE TABLE IF NOT EXISTS public.appraisal_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id UUID NOT NULL REFERENCES public.legal_entities(id),
  name_en TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  self_assessment_deadline DATE,
  manager_deadline DATE,
  review_deadline DATE,
  cycle_status public.appraisal_cycle_status NOT NULL DEFAULT 'draft',
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  activated_at TIMESTAMPTZ,
  row_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT appraisal_cycles_dates CHECK (period_end >= period_start)
);

CREATE TABLE IF NOT EXISTS public.appraisal_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id UUID NOT NULL REFERENCES public.legal_entities(id),
  code TEXT NOT NULL,
  name_en TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  instructions_en TEXT,
  instructions_ar TEXT,
  rating_scale_max INTEGER NOT NULL DEFAULT 5 CHECK (rating_scale_max > 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (legal_entity_id, code)
);

CREATE TABLE IF NOT EXISTS public.appraisal_template_criteria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.appraisal_templates(id) ON DELETE CASCADE,
  sequence_no INTEGER NOT NULL,
  category TEXT NOT NULL DEFAULT 'competency',
  name_en TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  weight NUMERIC(7,4) NOT NULL CHECK (weight > 0),
  max_scale INTEGER NOT NULL DEFAULT 5 CHECK (max_scale > 0),
  UNIQUE (template_id, sequence_no)
);

CREATE TABLE IF NOT EXISTS public.appraisal_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id UUID NOT NULL REFERENCES public.legal_entities(id),
  cycle_id UUID NOT NULL REFERENCES public.appraisal_cycles(id),
  template_id UUID NOT NULL REFERENCES public.appraisal_templates(id),
  employee_id UUID NOT NULL REFERENCES public.profiles(id),
  manager_id UUID NOT NULL REFERENCES public.profiles(id),
  reviewer_id UUID REFERENCES public.profiles(id),
  organization_unit_id UUID REFERENCES public.organization_units(id),
  assignment_status public.appraisal_assignment_status NOT NULL DEFAULT 'draft',
  final_score NUMERIC(18,4),
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  finalized_at TIMESTAMPTZ,
  finalized_by UUID REFERENCES public.profiles(id),
  row_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (cycle_id, employee_id, template_id),
  CONSTRAINT appraisal_assignments_no_self_manager CHECK (employee_id <> manager_id)
);

CREATE TABLE IF NOT EXISTS public.appraisal_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES public.appraisal_assignments(id) ON DELETE CASCADE,
  criterion_id UUID NOT NULL REFERENCES public.appraisal_template_criteria(id),
  self_rating NUMERIC(18,4),
  manager_rating NUMERIC(18,4),
  calibrated_rating NUMERIC(18,4),
  self_comment TEXT,
  manager_comment TEXT,
  UNIQUE (assignment_id, criterion_id)
);

CREATE TABLE IF NOT EXISTS public.appraisal_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES public.appraisal_assignments(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  target_text TEXT,
  measure_unit TEXT,
  weight NUMERIC(7,4) NOT NULL DEFAULT 0 CHECK (weight >= 0),
  employee_comment TEXT,
  manager_rating NUMERIC(18,4),
  manager_comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.appraisal_acknowledgements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES public.appraisal_assignments(id) ON DELETE CASCADE,
  acknowledged_by UUID NOT NULL REFERENCES public.profiles(id),
  acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  comments TEXT,
  UNIQUE (assignment_id, acknowledged_by)
);

CREATE OR REPLACE FUNCTION private.appraisal_compute_score(p_assignment_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_weight_sum NUMERIC(18,4);
  v_score NUMERIC(18,4);
BEGIN
  SELECT COALESCE(SUM(atc.weight), 0) INTO v_weight_sum
  FROM public.appraisal_template_criteria AS atc
  JOIN public.appraisal_assignments AS aa ON aa.template_id = atc.template_id
  WHERE aa.id = p_assignment_id;
  IF v_weight_sum <> 100 THEN
    RAISE EXCEPTION 'Appraisal criteria weights must sum to 100 (found %)', v_weight_sum
      USING ERRCODE = 'P0001';
  END IF;

  SELECT COALESCE(SUM(
    (COALESCE(ar.calibrated_rating, ar.manager_rating, 0) / NULLIF(atc.max_scale, 0)::NUMERIC) * atc.weight
  ), 0) INTO v_score
  FROM public.appraisal_ratings AS ar
  JOIN public.appraisal_template_criteria AS atc ON atc.id = ar.criterion_id
  WHERE ar.assignment_id = p_assignment_id;

  RETURN round(v_score, 4);
END
$function$;

CREATE OR REPLACE FUNCTION public.rpc_appraisal_cycle_activate(
  p_cycle_id UUID,
  p_expected_status public.appraisal_cycle_status DEFAULT 'draft',
  p_idempotency_key TEXT DEFAULT NULL,
  p_correlation_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor UUID := (SELECT auth.uid());
  v_cmd TEXT := 'appraisal_cycle_activate';
  v_replay JSONB;
  v_row public.appraisal_cycles%ROWTYPE;
  v_result JSONB;
BEGIN
  v_replay := private.command_check_idempotency(v_cmd, p_idempotency_key, v_actor);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF v_actor IS NULL OR NOT private.current_user_is_active() THEN
    RETURN private.command_fail('UNAUTHENTICATED', 'Authentication required');
  END IF;
  SELECT * INTO v_row FROM public.appraisal_cycles AS ac WHERE ac.id = p_cycle_id FOR UPDATE;
  IF NOT FOUND THEN RETURN private.command_fail('NOT_FOUND', 'Cycle not found'); END IF;
  IF v_row.cycle_status IS DISTINCT FROM p_expected_status THEN
    RETURN private.command_fail('STATE_MISMATCH', 'Unexpected cycle status');
  END IF;
  IF NOT private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator'],
    v_row.legal_entity_id, 'legal_entity', v_row.legal_entity_id
  ) THEN
    RETURN private.command_fail('FORBIDDEN', 'Insufficient role to activate cycle');
  END IF;

  UPDATE public.appraisal_cycles SET
    cycle_status = 'active',
    activated_at = NOW(),
    updated_at = NOW(),
    row_version = row_version + 1
  WHERE id = p_cycle_id;

  PERFORM private.write_audit_event(
    v_actor, 'update', 'appraisal_cycle', p_cycle_id,
    v_row.legal_entity_id, NULL, NULL, p_correlation_id, p_idempotency_key,
    jsonb_build_object('status', p_expected_status),
    jsonb_build_object('status', 'active'),
    NULL, NULL
  );

  v_result := private.command_ok(jsonb_build_object('entity_id', p_cycle_id, 'cycle_status', 'active'));
  PERFORM private.command_store_idempotency(v_cmd, p_idempotency_key, v_actor, v_result);
  RETURN v_result;
END
$function$;

CREATE OR REPLACE FUNCTION public.rpc_appraisal_assignment_create(
  p_legal_entity_id UUID,
  p_cycle_id UUID,
  p_template_id UUID,
  p_employee_id UUID,
  p_manager_id UUID,
  p_reviewer_id UUID DEFAULT NULL,
  p_organization_unit_id UUID DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL,
  p_correlation_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor UUID := (SELECT auth.uid());
  v_cmd TEXT := 'appraisal_assignment_create';
  v_replay JSONB;
  v_cycle public.appraisal_cycles%ROWTYPE;
  v_weight NUMERIC(18,4);
  v_id UUID;
  v_crit RECORD;
  v_result JSONB;
BEGIN
  v_replay := private.command_check_idempotency(v_cmd, p_idempotency_key, v_actor);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF v_actor IS NULL OR NOT private.current_user_is_active() THEN
    RETURN private.command_fail('UNAUTHENTICATED', 'Authentication required');
  END IF;
  IF p_employee_id = p_manager_id THEN
    RETURN private.command_fail('SOD_VIOLATION', 'Employee cannot be own manager');
  END IF;
  IF NOT private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator'],
    p_legal_entity_id, 'legal_entity', p_legal_entity_id
  ) THEN
    RETURN private.command_fail('FORBIDDEN', 'Insufficient role to create assignment');
  END IF;

  SELECT * INTO v_cycle FROM public.appraisal_cycles AS ac WHERE ac.id = p_cycle_id;
  IF NOT FOUND OR v_cycle.legal_entity_id IS DISTINCT FROM p_legal_entity_id THEN
    RETURN private.command_fail('NOT_FOUND', 'Cycle not found for entity');
  END IF;
  IF v_cycle.cycle_status <> 'active' THEN
    RETURN private.command_fail('INVALID_STATE', 'Cycle must be active');
  END IF;

  SELECT COALESCE(SUM(atc.weight), 0) INTO v_weight
  FROM public.appraisal_template_criteria AS atc WHERE atc.template_id = p_template_id;
  IF v_weight <> 100 THEN
    RETURN private.command_fail('VALIDATION', 'Template criteria weights must equal 100');
  END IF;

  INSERT INTO public.appraisal_assignments (
    legal_entity_id, cycle_id, template_id, employee_id, manager_id, reviewer_id,
    organization_unit_id, assignment_status, created_by
  ) VALUES (
    p_legal_entity_id, p_cycle_id, p_template_id, p_employee_id, p_manager_id, p_reviewer_id,
    p_organization_unit_id, 'employee_self_review', v_actor
  ) RETURNING id INTO v_id;

  FOR v_crit IN
    SELECT atc.id FROM public.appraisal_template_criteria AS atc WHERE atc.template_id = p_template_id
  LOOP
    INSERT INTO public.appraisal_ratings (assignment_id, criterion_id) VALUES (v_id, v_crit.id);
  END LOOP;

  PERFORM private.notify_user(
    p_employee_id, 'Appraisal assignment created', 'تم إنشاء تقييم أداء', 'appraisal_assignment', v_id
  );
  PERFORM private.write_audit_event(
    v_actor, 'create', 'appraisal_assignment', v_id,
    p_legal_entity_id, NULL, NULL, p_correlation_id, p_idempotency_key,
    NULL, jsonb_build_object('employee_id', p_employee_id, 'manager_id', p_manager_id),
    NULL, NULL
  );

  v_result := private.command_ok(jsonb_build_object('entity_id', v_id));
  PERFORM private.command_store_idempotency(v_cmd, p_idempotency_key, v_actor, v_result);
  RETURN v_result;
END
$function$;

CREATE OR REPLACE FUNCTION public.rpc_appraisal_self_submit(
  p_assignment_id UUID,
  p_ratings JSONB DEFAULT '[]'::jsonb,
  p_expected_status public.appraisal_assignment_status DEFAULT 'employee_self_review',
  p_idempotency_key TEXT DEFAULT NULL,
  p_correlation_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor UUID := (SELECT auth.uid());
  v_cmd TEXT := 'appraisal_self_submit';
  v_replay JSONB;
  v_row public.appraisal_assignments%ROWTYPE;
  v_item JSONB;
  v_result JSONB;
BEGIN
  v_replay := private.command_check_idempotency(v_cmd, p_idempotency_key, v_actor);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF v_actor IS NULL OR NOT private.current_user_is_active() THEN
    RETURN private.command_fail('UNAUTHENTICATED', 'Authentication required');
  END IF;
  SELECT * INTO v_row FROM public.appraisal_assignments AS aa WHERE aa.id = p_assignment_id FOR UPDATE;
  IF NOT FOUND THEN RETURN private.command_fail('NOT_FOUND', 'Assignment not found'); END IF;
  IF v_row.assignment_status IS DISTINCT FROM p_expected_status THEN
    RETURN private.command_fail('STATE_MISMATCH', 'Unexpected assignment status');
  END IF;
  IF v_row.employee_id <> v_actor THEN
    RETURN private.command_fail('FORBIDDEN', 'Only employee can self-submit');
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_ratings, '[]'::jsonb))
  LOOP
    UPDATE public.appraisal_ratings SET
      self_rating = (v_item->>'self_rating')::NUMERIC,
      self_comment = v_item->>'self_comment'
    WHERE assignment_id = p_assignment_id
      AND criterion_id = (v_item->>'criterion_id')::UUID;
  END LOOP;

  UPDATE public.appraisal_assignments SET
    assignment_status = 'self_submitted',
    updated_at = NOW(),
    row_version = row_version + 1
  WHERE id = p_assignment_id;

  PERFORM private.notify_user(
    v_row.manager_id, 'Employee self-assessment submitted', 'تم تقديم التقييم الذاتي',
    'appraisal_assignment', p_assignment_id
  );
  PERFORM private.write_audit_event(
    v_actor, 'update', 'appraisal_assignment', p_assignment_id,
    v_row.legal_entity_id, NULL, NULL, p_correlation_id, p_idempotency_key,
    jsonb_build_object('status', p_expected_status),
    jsonb_build_object('status', 'self_submitted'),
    NULL, NULL
  );

  v_result := private.command_ok(jsonb_build_object('entity_id', p_assignment_id, 'assignment_status', 'self_submitted'));
  PERFORM private.command_store_idempotency(v_cmd, p_idempotency_key, v_actor, v_result);
  RETURN v_result;
END
$function$;

CREATE OR REPLACE FUNCTION public.rpc_appraisal_manager_submit(
  p_assignment_id UUID,
  p_ratings JSONB DEFAULT '[]'::jsonb,
  p_expected_status public.appraisal_assignment_status DEFAULT 'self_submitted',
  p_idempotency_key TEXT DEFAULT NULL,
  p_correlation_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor UUID := (SELECT auth.uid());
  v_cmd TEXT := 'appraisal_manager_submit';
  v_replay JSONB;
  v_row public.appraisal_assignments%ROWTYPE;
  v_item JSONB;
  v_next public.appraisal_assignment_status;
  v_result JSONB;
BEGIN
  v_replay := private.command_check_idempotency(v_cmd, p_idempotency_key, v_actor);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF v_actor IS NULL OR NOT private.current_user_is_active() THEN
    RETURN private.command_fail('UNAUTHENTICATED', 'Authentication required');
  END IF;
  SELECT * INTO v_row FROM public.appraisal_assignments AS aa WHERE aa.id = p_assignment_id FOR UPDATE;
  IF NOT FOUND THEN RETURN private.command_fail('NOT_FOUND', 'Assignment not found'); END IF;
  IF v_row.assignment_status NOT IN ('self_submitted', 'manager_review') THEN
    RETURN private.command_fail('STATE_MISMATCH', 'Unexpected assignment status');
  END IF;
  IF p_expected_status IS NOT NULL AND v_row.assignment_status IS DISTINCT FROM p_expected_status
     AND NOT (p_expected_status = 'self_submitted' AND v_row.assignment_status = 'manager_review') THEN
    RETURN private.command_fail('STATE_MISMATCH', 'Unexpected assignment status');
  END IF;
  IF v_row.manager_id <> v_actor THEN
    RETURN private.command_fail('FORBIDDEN', 'Only assigned manager can submit');
  END IF;
  IF v_row.employee_id = v_actor THEN
    RETURN private.command_fail('SOD_VIOLATION', 'Cannot manage own appraisal');
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_ratings, '[]'::jsonb))
  LOOP
    UPDATE public.appraisal_ratings SET
      manager_rating = (v_item->>'manager_rating')::NUMERIC,
      manager_comment = v_item->>'manager_comment'
    WHERE assignment_id = p_assignment_id
      AND criterion_id = (v_item->>'criterion_id')::UUID;
  END LOOP;

  UPDATE public.appraisal_assignments SET assignment_status = 'manager_review', updated_at = NOW()
  WHERE id = p_assignment_id AND assignment_status = 'self_submitted';

  v_next := CASE WHEN v_row.reviewer_id IS NOT NULL THEN 'manager_submitted'::public.appraisal_assignment_status
                 ELSE 'manager_submitted'::public.appraisal_assignment_status END;

  UPDATE public.appraisal_assignments SET
    assignment_status = v_next,
    updated_at = NOW(),
    row_version = row_version + 1
  WHERE id = p_assignment_id;

  PERFORM private.write_audit_event(
    v_actor, 'update', 'appraisal_assignment', p_assignment_id,
    v_row.legal_entity_id, NULL, NULL, p_correlation_id, p_idempotency_key,
    jsonb_build_object('status', v_row.assignment_status),
    jsonb_build_object('status', v_next),
    NULL, NULL
  );

  v_result := private.command_ok(jsonb_build_object('entity_id', p_assignment_id, 'assignment_status', v_next));
  PERFORM private.command_store_idempotency(v_cmd, p_idempotency_key, v_actor, v_result);
  RETURN v_result;
END
$function$;

CREATE OR REPLACE FUNCTION public.rpc_appraisal_finalize(
  p_assignment_id UUID,
  p_expected_status public.appraisal_assignment_status DEFAULT 'manager_submitted',
  p_idempotency_key TEXT DEFAULT NULL,
  p_correlation_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor UUID := (SELECT auth.uid());
  v_cmd TEXT := 'appraisal_finalize';
  v_replay JSONB;
  v_row public.appraisal_assignments%ROWTYPE;
  v_score NUMERIC(18,4);
  v_result JSONB;
BEGIN
  v_replay := private.command_check_idempotency(v_cmd, p_idempotency_key, v_actor);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF v_actor IS NULL OR NOT private.current_user_is_active() THEN
    RETURN private.command_fail('UNAUTHENTICATED', 'Authentication required');
  END IF;
  SELECT * INTO v_row FROM public.appraisal_assignments AS aa WHERE aa.id = p_assignment_id FOR UPDATE;
  IF NOT FOUND THEN RETURN private.command_fail('NOT_FOUND', 'Assignment not found'); END IF;
  IF v_row.assignment_status IS DISTINCT FROM p_expected_status
     AND v_row.assignment_status IS DISTINCT FROM 'reviewer_review' THEN
    RETURN private.command_fail('STATE_MISMATCH', 'Unexpected assignment status');
  END IF;
  IF v_row.employee_id = v_actor THEN
    RETURN private.command_fail('SOD_VIOLATION', 'Employee cannot finalize own appraisal');
  END IF;
  IF NOT (
    v_row.manager_id = v_actor
    OR v_row.reviewer_id = v_actor
    OR private.user_has_any_role(
      ARRAY['system_administrator','legal_entity_administrator'],
      v_row.legal_entity_id, 'legal_entity', v_row.legal_entity_id)
  ) THEN
    RETURN private.command_fail('FORBIDDEN', 'Insufficient role to finalize');
  END IF;

  BEGIN
    v_score := private.appraisal_compute_score(p_assignment_id);
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    RETURN private.command_fail('VALIDATION', SQLERRM);
  END;

  UPDATE public.appraisal_assignments SET
    assignment_status = 'finalized',
    final_score = v_score,
    finalized_at = NOW(),
    finalized_by = v_actor,
    updated_at = NOW(),
    row_version = row_version + 1
  WHERE id = p_assignment_id;

  PERFORM private.notify_user(
    v_row.employee_id, 'Appraisal finalized', 'تم اعتماد التقييم',
    'appraisal_assignment', p_assignment_id
  );
  PERFORM private.write_audit_event(
    v_actor, 'update', 'appraisal_assignment', p_assignment_id,
    v_row.legal_entity_id, NULL, NULL, p_correlation_id, p_idempotency_key,
    jsonb_build_object('status', v_row.assignment_status),
    jsonb_build_object('status', 'finalized', 'final_score', v_score),
    NULL, NULL
  );

  v_result := private.command_ok(jsonb_build_object(
    'entity_id', p_assignment_id, 'assignment_status', 'finalized', 'final_score', v_score
  ));
  PERFORM private.command_store_idempotency(v_cmd, p_idempotency_key, v_actor, v_result);
  RETURN v_result;
END
$function$;

CREATE OR REPLACE FUNCTION public.rpc_appraisal_acknowledge(
  p_assignment_id UUID,
  p_comments TEXT DEFAULT NULL,
  p_expected_status public.appraisal_assignment_status DEFAULT 'finalized',
  p_idempotency_key TEXT DEFAULT NULL,
  p_correlation_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor UUID := (SELECT auth.uid());
  v_cmd TEXT := 'appraisal_acknowledge';
  v_replay JSONB;
  v_row public.appraisal_assignments%ROWTYPE;
  v_result JSONB;
BEGIN
  v_replay := private.command_check_idempotency(v_cmd, p_idempotency_key, v_actor);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF v_actor IS NULL OR NOT private.current_user_is_active() THEN
    RETURN private.command_fail('UNAUTHENTICATED', 'Authentication required');
  END IF;
  SELECT * INTO v_row FROM public.appraisal_assignments AS aa WHERE aa.id = p_assignment_id FOR UPDATE;
  IF NOT FOUND THEN RETURN private.command_fail('NOT_FOUND', 'Assignment not found'); END IF;
  IF v_row.assignment_status IS DISTINCT FROM p_expected_status THEN
    RETURN private.command_fail('STATE_MISMATCH', 'Unexpected assignment status');
  END IF;
  IF v_row.employee_id <> v_actor THEN
    RETURN private.command_fail('FORBIDDEN', 'Only employee can acknowledge');
  END IF;

  INSERT INTO public.appraisal_acknowledgements (assignment_id, acknowledged_by, comments)
  VALUES (p_assignment_id, v_actor, p_comments)
  ON CONFLICT (assignment_id, acknowledged_by) DO UPDATE
    SET comments = EXCLUDED.comments, acknowledged_at = NOW();

  UPDATE public.appraisal_assignments SET
    assignment_status = 'employee_acknowledged',
    updated_at = NOW(),
    row_version = row_version + 1
  WHERE id = p_assignment_id;

  PERFORM private.write_audit_event(
    v_actor, 'update', 'appraisal_assignment', p_assignment_id,
    v_row.legal_entity_id, NULL, NULL, p_correlation_id, p_idempotency_key,
    jsonb_build_object('status', p_expected_status),
    jsonb_build_object('status', 'employee_acknowledged'),
    p_comments, NULL
  );

  v_result := private.command_ok(jsonb_build_object('entity_id', p_assignment_id, 'assignment_status', 'employee_acknowledged'));
  PERFORM private.command_store_idempotency(v_cmd, p_idempotency_key, v_actor, v_result);
  RETURN v_result;
END
$function$;

-- =============================================================================
-- D) Master data deactivate / reject
-- =============================================================================
CREATE OR REPLACE FUNCTION public.rpc_master_record_deactivate(
  p_record_id UUID,
  p_expected_status public.governance_workflow_status DEFAULT 'approved',
  p_change_reason TEXT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL,
  p_correlation_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor UUID := (SELECT auth.uid());
  v_cmd TEXT := 'master_record_deactivate';
  v_replay JSONB;
  v_row public.governed_master_records%ROWTYPE;
  v_result JSONB;
BEGIN
  v_replay := private.command_check_idempotency(v_cmd, p_idempotency_key, v_actor);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF v_actor IS NULL OR NOT private.current_user_is_active() THEN
    RETURN private.command_fail('UNAUTHENTICATED', 'Authentication required');
  END IF;
  SELECT * INTO v_row FROM public.governed_master_records AS gmr WHERE gmr.id = p_record_id FOR UPDATE;
  IF NOT FOUND THEN RETURN private.command_fail('NOT_FOUND', 'Master record not found'); END IF;
  IF v_row.governance_status IS DISTINCT FROM p_expected_status THEN
    RETURN private.command_fail('STATE_MISMATCH', 'Unexpected master record status');
  END IF;
  IF NOT private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator','finance_user','cost_controller'],
    v_row.legal_entity_id, 'legal_entity', v_row.legal_entity_id
  ) THEN
    RETURN private.command_fail('FORBIDDEN', 'Insufficient role to deactivate master data');
  END IF;

  UPDATE public.governed_master_records SET
    governance_status = 'inactive',
    change_reason = COALESCE(p_change_reason, change_reason),
    effective_end = COALESCE(effective_end, CURRENT_DATE),
    updated_at = NOW(),
    row_version = row_version + 1
  WHERE id = p_record_id;

  PERFORM private.write_audit_event(
    v_actor, 'update', 'governed_master_record', p_record_id,
    v_row.legal_entity_id, NULL, NULL, p_correlation_id, p_idempotency_key,
    jsonb_build_object('status', p_expected_status),
    jsonb_build_object('status', 'inactive'),
    p_change_reason, NULL
  );

  v_result := private.command_ok(jsonb_build_object('entity_id', p_record_id, 'governance_status', 'inactive'));
  PERFORM private.command_store_idempotency(v_cmd, p_idempotency_key, v_actor, v_result);
  RETURN v_result;
END
$function$;

CREATE OR REPLACE FUNCTION public.rpc_master_record_reject(
  p_record_id UUID,
  p_expected_status public.governance_workflow_status DEFAULT 'submitted',
  p_change_reason TEXT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL,
  p_correlation_id UUID DEFAULT NULL
) RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.master_record_transition(p_record_id, p_expected_status, 'rejected', p_idempotency_key, p_correlation_id);
$$;

-- Extend master_record_transition to allow reject path with reason via wrapper above;
-- ensure rejected is a valid transition from submitted (patch private function)
CREATE OR REPLACE FUNCTION private.master_record_transition(
  p_record_id UUID,
  p_expected_status public.governance_workflow_status,
  p_next_status public.governance_workflow_status,
  p_idempotency_key TEXT DEFAULT NULL,
  p_correlation_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor UUID := (SELECT auth.uid());
  v_cmd TEXT := 'master_record_' || p_next_status::text;
  v_replay JSONB;
  v_row public.governed_master_records%ROWTYPE;
  v_result JSONB;
BEGIN
  v_replay := private.command_check_idempotency(v_cmd, p_idempotency_key, v_actor);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF v_actor IS NULL OR NOT private.current_user_is_active() THEN
    RETURN private.command_fail('UNAUTHENTICATED', 'Authentication required');
  END IF;

  SELECT * INTO v_row FROM public.governed_master_records AS gmr
  WHERE gmr.id = p_record_id FOR UPDATE;
  IF NOT FOUND THEN RETURN private.command_fail('NOT_FOUND', 'Master record not found'); END IF;
  IF v_row.governance_status IS DISTINCT FROM p_expected_status THEN
    RETURN private.command_fail('STATE_MISMATCH', 'Unexpected master record status');
  END IF;

  IF NOT (
    (p_expected_status = 'draft' AND p_next_status IN ('submitted', 'cancelled'))
    OR (p_expected_status = 'submitted' AND p_next_status IN ('approved', 'rejected', 'cancelled'))
    OR (p_expected_status = 'approved' AND p_next_status = 'inactive')
  ) THEN
    RETURN private.command_fail('INVALID_TRANSITION', 'Master record transition not allowed');
  END IF;

  IF NOT private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator','finance_user','cost_controller'],
    v_row.legal_entity_id, 'legal_entity', v_row.legal_entity_id) THEN
    RETURN private.command_fail('FORBIDDEN', 'Insufficient role for master data transition');
  END IF;

  IF p_next_status IN ('approved', 'rejected') AND v_row.submitted_by = v_actor THEN
    RETURN private.command_fail('SOD_VIOLATION', 'Submitter cannot decide master data');
  END IF;

  UPDATE public.governed_master_records AS gmr SET
    governance_status = p_next_status,
    submitted_by = CASE WHEN p_next_status = 'submitted' THEN v_actor ELSE gmr.submitted_by END,
    approved_by = CASE WHEN p_next_status = 'approved' THEN v_actor ELSE gmr.approved_by END,
    updated_at = NOW(),
    row_version = gmr.row_version + 1
  WHERE gmr.id = p_record_id
  RETURNING * INTO v_row;

  PERFORM private.write_audit_event(
    v_actor, 'update', 'governed_master_record', p_record_id,
    v_row.legal_entity_id, NULL, NULL,
    p_correlation_id, p_idempotency_key,
    jsonb_build_object('status', p_expected_status),
    jsonb_build_object('status', p_next_status, 'record_type', v_row.record_type),
    NULL, NULL
  );

  v_result := private.command_ok(jsonb_build_object('entity_id', p_record_id, 'governance_status', p_next_status));
  PERFORM private.command_store_idempotency(v_cmd, p_idempotency_key, v_actor, v_result);
  RETURN v_result;
END
$function$;

-- =============================================================================
-- RLS + grants (period + appraisal)
-- =============================================================================
DO $rls$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'period_close_checklist_templates','period_close_checklist_items',
    'period_close_instances','period_close_item_results','period_reopen_requests',
    'appraisal_cycles','appraisal_templates','appraisal_template_criteria',
    'appraisal_assignments','appraisal_ratings','appraisal_goals','appraisal_acknowledgements'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END
$rls$;

DROP POLICY IF EXISTS period_close_checklist_templates_select ON public.period_close_checklist_templates;
CREATE POLICY period_close_checklist_templates_select ON public.period_close_checklist_templates
  FOR SELECT TO authenticated USING (private.user_can_access_legal_entity(legal_entity_id));
DROP POLICY IF EXISTS period_close_checklist_templates_write ON public.period_close_checklist_templates;
CREATE POLICY period_close_checklist_templates_write ON public.period_close_checklist_templates
  FOR ALL TO authenticated USING (private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator','finance_user','cost_controller'], legal_entity_id))
  WITH CHECK (private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator','finance_user','cost_controller'], legal_entity_id));

DROP POLICY IF EXISTS period_close_checklist_items_select ON public.period_close_checklist_items;
CREATE POLICY period_close_checklist_items_select ON public.period_close_checklist_items
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.period_close_checklist_templates AS t
      WHERE t.id = template_id AND private.user_can_access_legal_entity(t.legal_entity_id))
  );
DROP POLICY IF EXISTS period_close_checklist_items_write ON public.period_close_checklist_items;
CREATE POLICY period_close_checklist_items_write ON public.period_close_checklist_items
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.period_close_checklist_templates AS t WHERE t.id = template_id
      AND private.user_has_any_role(
        ARRAY['system_administrator','legal_entity_administrator','finance_user','cost_controller'], t.legal_entity_id))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.period_close_checklist_templates AS t WHERE t.id = template_id
      AND private.user_has_any_role(
        ARRAY['system_administrator','legal_entity_administrator','finance_user','cost_controller'], t.legal_entity_id))
  );

DROP POLICY IF EXISTS period_close_instances_select ON public.period_close_instances;
CREATE POLICY period_close_instances_select ON public.period_close_instances
  FOR SELECT TO authenticated USING (private.user_can_access_legal_entity(legal_entity_id));
DROP POLICY IF EXISTS period_close_instances_write ON public.period_close_instances;
CREATE POLICY period_close_instances_write ON public.period_close_instances
  FOR ALL TO authenticated USING (private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator','finance_user','cost_controller'], legal_entity_id))
  WITH CHECK (private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator','finance_user','cost_controller'], legal_entity_id));

DROP POLICY IF EXISTS period_close_item_results_select ON public.period_close_item_results;
CREATE POLICY period_close_item_results_select ON public.period_close_item_results
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.period_close_instances AS i
      WHERE i.id = instance_id AND private.user_can_access_legal_entity(i.legal_entity_id))
  );
DROP POLICY IF EXISTS period_close_item_results_write ON public.period_close_item_results;
CREATE POLICY period_close_item_results_write ON public.period_close_item_results
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.period_close_instances AS i WHERE i.id = instance_id
      AND private.user_has_any_role(
        ARRAY['system_administrator','legal_entity_administrator','finance_user','cost_controller'], i.legal_entity_id))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.period_close_instances AS i WHERE i.id = instance_id
      AND private.user_has_any_role(
        ARRAY['system_administrator','legal_entity_administrator','finance_user','cost_controller'], i.legal_entity_id))
  );

DROP POLICY IF EXISTS period_reopen_requests_select ON public.period_reopen_requests;
CREATE POLICY period_reopen_requests_select ON public.period_reopen_requests
  FOR SELECT TO authenticated USING (private.user_can_access_legal_entity(legal_entity_id));
DROP POLICY IF EXISTS period_reopen_requests_insert ON public.period_reopen_requests;
CREATE POLICY period_reopen_requests_insert ON public.period_reopen_requests
  FOR INSERT TO authenticated WITH CHECK (
    requested_by = (SELECT auth.uid())
    AND private.user_has_any_role(
      ARRAY['system_administrator','legal_entity_administrator','finance_user','cost_controller'], legal_entity_id)
  );
DROP POLICY IF EXISTS period_reopen_requests_update ON public.period_reopen_requests;
CREATE POLICY period_reopen_requests_update ON public.period_reopen_requests
  FOR UPDATE TO authenticated USING (private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator','finance_user','cost_controller'], legal_entity_id));

-- Appraisals: employee own, manager assigned, admin entity; cross-entity denied via legal_entity checks
DROP POLICY IF EXISTS appraisal_cycles_select ON public.appraisal_cycles;
CREATE POLICY appraisal_cycles_select ON public.appraisal_cycles
  FOR SELECT TO authenticated USING (private.user_can_access_legal_entity(legal_entity_id));
DROP POLICY IF EXISTS appraisal_cycles_write ON public.appraisal_cycles;
CREATE POLICY appraisal_cycles_write ON public.appraisal_cycles
  FOR ALL TO authenticated USING (private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator'], legal_entity_id))
  WITH CHECK (private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator'], legal_entity_id));

DROP POLICY IF EXISTS appraisal_templates_select ON public.appraisal_templates;
CREATE POLICY appraisal_templates_select ON public.appraisal_templates
  FOR SELECT TO authenticated USING (private.user_can_access_legal_entity(legal_entity_id));
DROP POLICY IF EXISTS appraisal_templates_write ON public.appraisal_templates;
CREATE POLICY appraisal_templates_write ON public.appraisal_templates
  FOR ALL TO authenticated USING (private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator'], legal_entity_id))
  WITH CHECK (private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator'], legal_entity_id));

DROP POLICY IF EXISTS appraisal_template_criteria_select ON public.appraisal_template_criteria;
CREATE POLICY appraisal_template_criteria_select ON public.appraisal_template_criteria
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.appraisal_templates AS t
      WHERE t.id = template_id AND private.user_can_access_legal_entity(t.legal_entity_id))
  );
DROP POLICY IF EXISTS appraisal_template_criteria_write ON public.appraisal_template_criteria;
CREATE POLICY appraisal_template_criteria_write ON public.appraisal_template_criteria
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.appraisal_templates AS t WHERE t.id = template_id
      AND private.user_has_any_role(ARRAY['system_administrator','legal_entity_administrator'], t.legal_entity_id))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.appraisal_templates AS t WHERE t.id = template_id
      AND private.user_has_any_role(ARRAY['system_administrator','legal_entity_administrator'], t.legal_entity_id))
  );

DROP POLICY IF EXISTS appraisal_assignments_select ON public.appraisal_assignments;
CREATE POLICY appraisal_assignments_select ON public.appraisal_assignments
  FOR SELECT TO authenticated USING (
    private.user_can_access_legal_entity(legal_entity_id)
    AND (
      employee_id = (SELECT auth.uid())
      OR manager_id = (SELECT auth.uid())
      OR reviewer_id = (SELECT auth.uid())
      OR private.user_has_any_role(
        ARRAY['system_administrator','legal_entity_administrator'], legal_entity_id)
    )
  );
DROP POLICY IF EXISTS appraisal_assignments_write ON public.appraisal_assignments;
CREATE POLICY appraisal_assignments_write ON public.appraisal_assignments
  FOR ALL TO authenticated USING (
    private.user_has_any_role(ARRAY['system_administrator','legal_entity_administrator'], legal_entity_id)
    OR manager_id = (SELECT auth.uid())
    OR employee_id = (SELECT auth.uid())
  ) WITH CHECK (private.user_can_access_legal_entity(legal_entity_id));

DROP POLICY IF EXISTS appraisal_ratings_select ON public.appraisal_ratings;
CREATE POLICY appraisal_ratings_select ON public.appraisal_ratings
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.appraisal_assignments AS aa
      WHERE aa.id = assignment_id
        AND private.user_can_access_legal_entity(aa.legal_entity_id)
        AND (
          aa.employee_id = (SELECT auth.uid())
          OR aa.manager_id = (SELECT auth.uid())
          OR aa.reviewer_id = (SELECT auth.uid())
          OR private.user_has_any_role(
            ARRAY['system_administrator','legal_entity_administrator'], aa.legal_entity_id)
        )
    )
  );
DROP POLICY IF EXISTS appraisal_ratings_write ON public.appraisal_ratings;
CREATE POLICY appraisal_ratings_write ON public.appraisal_ratings
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.appraisal_assignments AS aa
      WHERE aa.id = assignment_id
        AND (
          aa.employee_id = (SELECT auth.uid())
          OR aa.manager_id = (SELECT auth.uid())
          OR aa.reviewer_id = (SELECT auth.uid())
          OR private.user_has_any_role(
            ARRAY['system_administrator','legal_entity_administrator'], aa.legal_entity_id)
        )
    )
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.appraisal_assignments AS aa WHERE aa.id = assignment_id
      AND private.user_can_access_legal_entity(aa.legal_entity_id))
  );

DROP POLICY IF EXISTS appraisal_goals_select ON public.appraisal_goals;
CREATE POLICY appraisal_goals_select ON public.appraisal_goals
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.appraisal_assignments AS aa
      WHERE aa.id = assignment_id AND private.user_can_access_legal_entity(aa.legal_entity_id)
        AND (aa.employee_id = (SELECT auth.uid()) OR aa.manager_id = (SELECT auth.uid())
          OR private.user_has_any_role(ARRAY['system_administrator','legal_entity_administrator'], aa.legal_entity_id))
    )
  );
DROP POLICY IF EXISTS appraisal_goals_write ON public.appraisal_goals;
CREATE POLICY appraisal_goals_write ON public.appraisal_goals
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.appraisal_assignments AS aa
      WHERE aa.id = assignment_id
        AND (aa.employee_id = (SELECT auth.uid()) OR aa.manager_id = (SELECT auth.uid())
          OR private.user_has_any_role(ARRAY['system_administrator','legal_entity_administrator'], aa.legal_entity_id))
    )
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.appraisal_assignments AS aa WHERE aa.id = assignment_id
      AND private.user_can_access_legal_entity(aa.legal_entity_id))
  );

DROP POLICY IF EXISTS appraisal_acknowledgements_select ON public.appraisal_acknowledgements;
CREATE POLICY appraisal_acknowledgements_select ON public.appraisal_acknowledgements
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.appraisal_assignments AS aa
      WHERE aa.id = assignment_id AND private.user_can_access_legal_entity(aa.legal_entity_id)
        AND (aa.employee_id = (SELECT auth.uid()) OR aa.manager_id = (SELECT auth.uid())
          OR private.user_has_any_role(ARRAY['system_administrator','legal_entity_administrator'], aa.legal_entity_id))
    )
  );
DROP POLICY IF EXISTS appraisal_acknowledgements_insert ON public.appraisal_acknowledgements;
CREATE POLICY appraisal_acknowledgements_insert ON public.appraisal_acknowledgements
  FOR INSERT TO authenticated WITH CHECK (
    acknowledged_by = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.appraisal_assignments AS aa
      WHERE aa.id = assignment_id AND aa.employee_id = (SELECT auth.uid())
        AND private.user_can_access_legal_entity(aa.legal_entity_id)
    )
  );

GRANT SELECT, INSERT, UPDATE ON TABLE
  public.period_close_checklist_templates,
  public.period_close_checklist_items,
  public.period_close_instances,
  public.period_close_item_results,
  public.period_reopen_requests,
  public.appraisal_cycles,
  public.appraisal_templates,
  public.appraisal_template_criteria,
  public.appraisal_assignments,
  public.appraisal_ratings,
  public.appraisal_goals,
  public.appraisal_acknowledgements
TO authenticated;

DO $grants$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'rpc_period_close_evaluate_readiness','rpc_period_hard_close_with_checklist','rpc_period_hard_close_gated',
        'rpc_period_reopen_request','rpc_period_reopen_approve',
        'rpc_appraisal_cycle_activate','rpc_appraisal_assignment_create','rpc_appraisal_self_submit',
        'rpc_appraisal_manager_submit','rpc_appraisal_finalize','rpc_appraisal_acknowledge',
        'rpc_master_record_deactivate','rpc_master_record_reject'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END
$grants$;

REVOKE ALL ON FUNCTION private.appraisal_compute_score(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.delegation_would_cycle(UUID, UUID, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.resolve_effective_approver(UUID, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.notify_user(UUID, TEXT, TEXT, TEXT, UUID) FROM PUBLIC;

COMMENT ON TABLE public.appraisal_assignments IS '@classification data_api_exposed; no salary fields; RLS employee/manager/admin';
COMMENT ON TABLE public.period_reopen_requests IS '@classification data_api_exposed; senior reopen gate';
COMMENT ON VIEW public.v_delegated_approval_inbox IS '@classification data_api_exposed; delegated inbox filter';
