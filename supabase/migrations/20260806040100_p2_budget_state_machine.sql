-- P2 Phase 3-4: Budget state machine and change control (COD-H-004, COD-H-005, COD-H-006)

-- One current approved budget per scope + fiscal year
CREATE UNIQUE INDEX IF NOT EXISTS idx_budget_one_current_approved
  ON public.budget_versions (legal_entity_id, control_scope_id, fiscal_year_id)
  WHERE is_current_approved = true
    AND approval_status IN ('approved', 'locked', 'posted');

-- Extend immutability to approved status on budget versions
CREATE OR REPLACE FUNCTION private.protect_locked_budget_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.approval_status IN ('approved', 'locked', 'posted', 'superseded') THEN
    IF NEW.approval_status IS DISTINCT FROM OLD.approval_status
       AND NEW.approval_status NOT IN ('superseded', 'cancelled') THEN
      RAISE EXCEPTION 'Approved or locked budget version cannot be modified';
    END IF;
    IF NEW.original_approved_amount IS DISTINCT FROM OLD.original_approved_amount
       OR NEW.approved_increases IS DISTINCT FROM OLD.approved_increases
       OR NEW.approved_reductions IS DISTINCT FROM OLD.approved_reductions
       OR NEW.contingency_amount IS DISTINCT FROM OLD.contingency_amount
       OR NEW.management_reserve_amount IS DISTINCT FROM OLD.management_reserve_amount THEN
      RAISE EXCEPTION 'Approved financial amounts are immutable';
    END IF;
    IF NEW.version_label IS DISTINCT FROM OLD.version_label
       OR NEW.fiscal_year_id IS DISTINCT FROM OLD.fiscal_year_id
       OR NEW.control_scope_id IS DISTINCT FROM OLD.control_scope_id
       OR NEW.legal_entity_id IS DISTINCT FROM OLD.legal_entity_id THEN
      RAISE EXCEPTION 'Approved budget scope metadata is immutable';
    END IF;
  END IF;
  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION private.protect_immutable_budget_line()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
  v_status public.approval_status;
BEGIN
  SELECT bv.approval_status INTO v_status
  FROM public.budget_versions AS bv
  WHERE bv.id = COALESCE(NEW.budget_version_id, OLD.budget_version_id);
  IF v_status IN ('approved', 'locked', 'posted', 'superseded') THEN
    RAISE EXCEPTION 'Budget lines are immutable after approval';
  END IF;
  RETURN COALESCE(NEW, OLD);
END
$function$;

CREATE OR REPLACE FUNCTION private.protect_immutable_budget_monthly()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
  v_status public.approval_status;
BEGIN
  SELECT bv.approval_status INTO v_status
  FROM public.budget_lines AS bl
  JOIN public.budget_versions AS bv ON bv.id = bl.budget_version_id
  WHERE bl.id = COALESCE(NEW.budget_line_id, OLD.budget_line_id);
  IF v_status IN ('approved', 'locked', 'posted', 'superseded') THEN
    RAISE EXCEPTION 'Monthly allocations are immutable after approval';
  END IF;
  RETURN COALESCE(NEW, OLD);
END
$function$;

DROP TRIGGER IF EXISTS trg_budget_lines_immutable ON public.budget_lines;
CREATE TRIGGER trg_budget_lines_immutable
  BEFORE UPDATE OR DELETE ON public.budget_lines
  FOR EACH ROW EXECUTE FUNCTION private.protect_immutable_budget_line();

DROP TRIGGER IF EXISTS trg_budget_monthly_immutable ON public.budget_monthly_allocations;
CREATE TRIGGER trg_budget_monthly_immutable
  BEFORE UPDATE OR DELETE ON public.budget_monthly_allocations
  FOR EACH ROW EXECUTE FUNCTION private.protect_immutable_budget_monthly();

-- Budget transition command
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

  -- Transition graph enforcement
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

  -- Role checks per transition
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

  IF p_next_status = 'approved' THEN
    SELECT * INTO v_row FROM public.budget_versions AS bv WHERE bv.id = p_budget_version_id;
  END IF;

  IF p_next_status IN ('approved', 'locked') THEN
    UPDATE public.budget_versions AS bv
    SET is_current_approved = false
    WHERE bv.legal_entity_id = v_row.legal_entity_id
      AND bv.control_scope_id IS NOT DISTINCT FROM v_row.control_scope_id
      AND bv.fiscal_year_id = v_row.fiscal_year_id
      AND bv.id <> p_budget_version_id
      AND bv.is_current_approved = true;
    UPDATE public.budget_versions AS bv
    SET is_current_approved = true
    WHERE bv.id = p_budget_version_id;
  END IF;

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

-- Approve and lock in one atomic command
CREATE OR REPLACE FUNCTION private.budget_approve_and_lock(
  p_budget_version_id UUID,
  p_expected_status public.approval_status DEFAULT 'under_review',
  p_idempotency_key TEXT DEFAULT NULL,
  p_correlation_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_step JSONB;
BEGIN
  v_step := private.budget_transition(p_budget_version_id, p_expected_status, 'approved', p_idempotency_key, p_correlation_id);
  IF NOT (v_step->>'ok')::boolean THEN RETURN v_step; END IF;
  RETURN private.budget_transition(p_budget_version_id, 'approved', 'locked', p_idempotency_key, p_correlation_id);
END
$function$;

-- Budget change approval: only change request ID required
CREATE OR REPLACE FUNCTION private.budget_approve_change_request(
  p_change_request_id UUID,
  p_expected_status public.approval_status DEFAULT 'submitted',
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
  v_cmd TEXT := 'budget_approve_change_request';
  v_replay JSONB;
  v_req public.budget_change_requests%ROWTYPE;
  v_source public.budget_versions%ROWTYPE;
  v_new_version_id UUID;
  v_new_label TEXT;
  v_line RECORD;
  v_new_line_id UUID;
  v_delta NUMERIC(18,4);
  v_result JSONB;
BEGIN
  v_replay := private.command_check_idempotency(v_cmd, p_idempotency_key, v_actor);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

  IF v_actor IS NULL OR NOT private.current_user_is_active() THEN
    RETURN private.command_fail('UNAUTHENTICATED', 'Authentication required');
  END IF;

  SELECT * INTO v_req FROM public.budget_change_requests AS bcr
  WHERE bcr.id = p_change_request_id FOR UPDATE;
  IF NOT FOUND THEN RETURN private.command_fail('NOT_FOUND', 'Change request not found'); END IF;
  IF v_req.approval_status IS DISTINCT FROM p_expected_status THEN
    RETURN private.command_fail('STATE_MISMATCH', 'Change request is not in expected status');
  END IF;
  IF v_req.requester_id = v_actor THEN
    RETURN private.command_fail('SOD_VIOLATION', 'Requester cannot approve own change request');
  END IF;

  SELECT * INTO v_source FROM public.budget_versions AS bv
  WHERE bv.id = v_req.budget_version_id FOR UPDATE;
  IF NOT FOUND THEN RETURN private.command_fail('NOT_FOUND', 'Source budget version not found'); END IF;
  IF v_source.approval_status NOT IN ('locked', 'posted') THEN
    RETURN private.command_fail('INVALID_STATE', 'Change can only apply to locked/posted budgets');
  END IF;

  IF NOT private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator','cost_controller','approver'],
    v_source.legal_entity_id, 'control_scope', v_source.control_scope_id) THEN
    RETURN private.command_fail('FORBIDDEN', 'Insufficient role to approve change request');
  END IF;

  v_new_label := v_source.version_label || '-CHG-' || to_char(NOW(), 'YYYYMMDD-HH24MISS');
  INSERT INTO public.budget_versions (
    legal_entity_id, control_scope_id, fiscal_year_id, version_label, version_type,
    approval_status, is_current_approved, original_approved_amount,
    approved_increases, approved_reductions, created_by
  ) VALUES (
    v_source.legal_entity_id, v_source.control_scope_id, v_source.fiscal_year_id,
    v_new_label, 'change_order', 'locked', false,
    v_source.original_approved_amount, v_source.approved_increases, v_source.approved_reductions,
    v_actor
  ) RETURNING id INTO v_new_version_id;

  FOR v_line IN
    SELECT bl.*, COALESCE(SUM(bcl.amount) FILTER (WHERE bcl.change_request_id = p_change_request_id), 0) AS delta
    FROM public.budget_lines AS bl
    LEFT JOIN public.budget_change_lines AS bcl
      ON bcl.destination_budget_line_id = bl.id AND bcl.change_request_id = p_change_request_id
    WHERE bl.budget_version_id = v_source.id
    GROUP BY bl.id
  LOOP
    v_delta := v_line.delta;
    INSERT INTO public.budget_lines (
      budget_version_id, control_account_id, organization_unit_id, cost_node_id,
      planned_quantity, unit_of_measure, planned_unit_rate, planned_amount,
      driver_formula, assumption, owner_id, notes, version
    ) VALUES (
      v_new_version_id, v_line.control_account_id, v_line.organization_unit_id, v_line.cost_node_id,
      v_line.planned_quantity, v_line.unit_of_measure, v_line.planned_unit_rate,
      v_line.planned_amount + v_delta,
      v_line.driver_formula, v_line.assumption, v_line.owner_id, v_line.notes, 1
    ) RETURNING id INTO v_new_line_id;

    INSERT INTO public.budget_monthly_allocations (budget_line_id, fiscal_period_id, allocated_amount)
    SELECT v_new_line_id, bma.fiscal_period_id,
      CASE WHEN v_line.planned_amount = 0 THEN bma.allocated_amount
           ELSE round(bma.allocated_amount * (v_line.planned_amount + v_delta) / v_line.planned_amount, 4)
      END
    FROM public.budget_monthly_allocations AS bma
    WHERE bma.budget_line_id = v_line.id;
  END LOOP;

  SELECT COALESCE(SUM(bl.planned_amount), 0) INTO v_delta
  FROM public.budget_lines AS bl WHERE bl.budget_version_id = v_new_version_id;

  UPDATE public.budget_versions AS bv SET
    original_approved_amount = v_delta,
    approved_increases = v_source.approved_increases + v_req.requested_amount,
    approved_at = NOW(), approved_by = v_actor, locked_at = NOW(),
    is_current_approved = true
  WHERE bv.id = v_new_version_id;

  UPDATE public.budget_versions AS bv SET
    approval_status = 'superseded', is_current_approved = false
  WHERE bv.id = v_source.id;

  UPDATE public.budget_change_requests AS bcr SET
    approval_status = 'approved', effective_date = CURRENT_DATE
  WHERE bcr.id = p_change_request_id;

  PERFORM private.write_audit_event(
    v_actor, 'approve', 'budget_change_request', p_change_request_id,
    v_source.legal_entity_id, v_source.control_scope_id, NULL,
    p_correlation_id, p_idempotency_key,
    jsonb_build_object('source_version_id', v_source.id, 'status', p_expected_status),
    jsonb_build_object('new_version_id', v_new_version_id, 'status', 'approved'),
    v_req.reason, NULL
  );

  v_result := private.command_ok(jsonb_build_object(
    'entity_id', p_change_request_id,
    'new_budget_version_id', v_new_version_id,
    'superseded_version_id', v_source.id
  ));
  PERFORM private.command_store_idempotency(v_cmd, p_idempotency_key, v_actor, v_result);
  RETURN v_result;
END
$function$;

-- Public RPC wrappers
CREATE OR REPLACE FUNCTION public.rpc_budget_submit(
  p_budget_version_id UUID,
  p_expected_status public.approval_status DEFAULT 'draft',
  p_idempotency_key TEXT DEFAULT NULL,
  p_correlation_id UUID DEFAULT NULL
) RETURNS JSONB LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.budget_transition(p_budget_version_id, p_expected_status, 'submitted', p_idempotency_key, p_correlation_id);
$$;
CREATE OR REPLACE FUNCTION public.rpc_budget_start_review(
  p_budget_version_id UUID,
  p_expected_status public.approval_status DEFAULT 'submitted',
  p_idempotency_key TEXT DEFAULT NULL,
  p_correlation_id UUID DEFAULT NULL
) RETURNS JSONB LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.budget_transition(p_budget_version_id, p_expected_status, 'under_review', p_idempotency_key, p_correlation_id);
$$;
CREATE OR REPLACE FUNCTION public.rpc_budget_reject(
  p_budget_version_id UUID,
  p_expected_status public.approval_status DEFAULT 'under_review',
  p_idempotency_key TEXT DEFAULT NULL,
  p_correlation_id UUID DEFAULT NULL
) RETURNS JSONB LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.budget_transition(p_budget_version_id, p_expected_status, 'rejected', p_idempotency_key, p_correlation_id);
$$;
CREATE OR REPLACE FUNCTION public.rpc_budget_approve_and_lock(
  p_budget_version_id UUID,
  p_expected_status public.approval_status DEFAULT 'under_review',
  p_idempotency_key TEXT DEFAULT NULL,
  p_correlation_id UUID DEFAULT NULL
) RETURNS JSONB LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.budget_approve_and_lock(p_budget_version_id, p_expected_status, p_idempotency_key, p_correlation_id);
$$;
CREATE OR REPLACE FUNCTION public.rpc_budget_supersede(
  p_budget_version_id UUID,
  p_expected_status public.approval_status DEFAULT 'locked',
  p_idempotency_key TEXT DEFAULT NULL,
  p_correlation_id UUID DEFAULT NULL
) RETURNS JSONB LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.budget_transition(p_budget_version_id, p_expected_status, 'superseded', p_idempotency_key, p_correlation_id);
$$;
CREATE OR REPLACE FUNCTION public.rpc_budget_approve_change_request(
  p_change_request_id UUID,
  p_expected_status public.approval_status DEFAULT 'submitted',
  p_idempotency_key TEXT DEFAULT NULL,
  p_correlation_id UUID DEFAULT NULL
) RETURNS JSONB LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.budget_approve_change_request(p_change_request_id, p_expected_status, p_idempotency_key, p_correlation_id);
$$;

REVOKE ALL ON FUNCTION public.rpc_budget_submit(UUID, public.approval_status, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_budget_start_review(UUID, public.approval_status, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_budget_reject(UUID, public.approval_status, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_budget_approve_and_lock(UUID, public.approval_status, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_budget_supersede(UUID, public.approval_status, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_budget_approve_change_request(UUID, public.approval_status, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_budget_submit(UUID, public.approval_status, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_budget_start_review(UUID, public.approval_status, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_budget_approve_and_lock(UUID, public.approval_status, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_budget_reject(UUID, public.approval_status, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_budget_supersede(UUID, public.approval_status, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_budget_approve_change_request(UUID, public.approval_status, TEXT, UUID) TO authenticated;

REVOKE ALL ON FUNCTION private.budget_transition(UUID, public.approval_status, public.approval_status, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.budget_approve_and_lock(UUID, public.approval_status, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.budget_approve_change_request(UUID, public.approval_status, TEXT, UUID) FROM PUBLIC;
