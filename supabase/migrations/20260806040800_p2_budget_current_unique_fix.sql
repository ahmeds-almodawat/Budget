-- Fix: deactivate prior current-approved budgets before setting the new current flag.

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
