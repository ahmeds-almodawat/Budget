-- Allow approver role to lock approved forecasts (required for rpc_forecast_approve_and_lock chain)

CREATE OR REPLACE FUNCTION private.forecast_transition(
  p_forecast_version_id UUID,
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
  v_cmd TEXT := 'forecast_transition_' || p_next_status::text;
  v_replay JSONB;
  v_row public.forecast_versions%ROWTYPE;
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
  FROM public.forecast_versions AS fv
  WHERE fv.id = p_forecast_version_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN private.command_fail('NOT_FOUND', 'Forecast version not found');
  END IF;

  IF v_row.approval_status IS DISTINCT FROM p_expected_status THEN
    RETURN private.command_fail('STATE_MISMATCH',
      format('Expected status %s but found %s', p_expected_status, v_row.approval_status));
  END IF;

  IF NOT (
    (p_expected_status = 'draft' AND p_next_status IN ('submitted', 'cancelled'))
    OR (p_expected_status = 'submitted' AND p_next_status IN ('under_review', 'rejected', 'cancelled'))
    OR (p_expected_status = 'under_review' AND p_next_status IN ('approved', 'rejected', 'cancelled'))
    OR (p_expected_status = 'approved' AND p_next_status IN ('locked', 'superseded'))
    OR (p_expected_status = 'locked' AND p_next_status = 'superseded')
  ) THEN
    RETURN private.command_fail('INVALID_TRANSITION',
      format('Transition %s -> %s is not allowed', p_expected_status, p_next_status));
  END IF;

  IF p_next_status = 'submitted' THEN
    v_allowed := private.user_has_any_role(
      ARRAY['system_administrator','legal_entity_administrator','cost_controller','budget_owner','finance_user'],
      v_row.legal_entity_id, 'control_scope', v_row.control_scope_id);
    IF v_row.owner_id IS NOT NULL AND v_row.owner_id <> v_actor
       AND NOT private.user_has_any_role(
         ARRAY['system_administrator','legal_entity_administrator','cost_controller'],
         v_row.legal_entity_id, 'control_scope', v_row.control_scope_id) THEN
      RETURN private.command_fail('FORBIDDEN', 'Only forecast owner or controller may submit');
    END IF;
  ELSIF p_next_status = 'under_review' THEN
    v_allowed := private.user_has_any_role(
      ARRAY['system_administrator','legal_entity_administrator','cost_controller','finance_user','approver'],
      v_row.legal_entity_id, 'control_scope', v_row.control_scope_id);
  ELSIF p_next_status = 'approved' THEN
    v_allowed := private.user_has_any_role(
      ARRAY['system_administrator','legal_entity_administrator','cost_controller','approver'],
      v_row.legal_entity_id, 'control_scope', v_row.control_scope_id);
    IF v_row.submitted_by = v_actor THEN
      RETURN private.command_fail('SOD_VIOLATION', 'Submitter cannot approve forecast');
    END IF;
  ELSIF p_next_status = 'locked' THEN
    v_allowed := private.user_has_any_role(
      ARRAY['system_administrator','legal_entity_administrator','cost_controller','approver'],
      v_row.legal_entity_id, 'control_scope', v_row.control_scope_id);
    IF v_row.submitted_by = v_actor THEN
      RETURN private.command_fail('SOD_VIOLATION', 'Submitter cannot lock forecast');
    END IF;
  ELSIF p_next_status = 'superseded' THEN
    v_allowed := private.user_has_any_role(
      ARRAY['system_administrator','legal_entity_administrator','cost_controller','approver'],
      v_row.legal_entity_id, 'control_scope', v_row.control_scope_id);
  ELSIF p_next_status IN ('rejected', 'cancelled') THEN
    v_allowed := private.user_has_any_role(
      ARRAY['system_administrator','legal_entity_administrator','cost_controller','approver','finance_user'],
      v_row.legal_entity_id, 'control_scope', v_row.control_scope_id);
  ELSE
    v_allowed := private.user_has_any_role(
      ARRAY['system_administrator','legal_entity_administrator','cost_controller'],
      v_row.legal_entity_id, 'control_scope', v_row.control_scope_id);
  END IF;

  IF NOT v_allowed THEN
    RETURN private.command_fail('FORBIDDEN', 'Insufficient role for forecast transition');
  END IF;

  IF p_next_status = 'approved' THEN
    SELECT COALESCE(SUM(fl.forecast_amount), 0) INTO v_total
    FROM public.forecast_lines AS fl WHERE fl.forecast_version_id = p_forecast_version_id;
    IF ABS(v_total - v_row.forecast_cost) > 0.01 AND v_row.forecast_cost > 0 THEN
      RETURN private.command_fail('RECONCILIATION',
        format('Header forecast_cost %s does not match line total %s', v_row.forecast_cost, v_total));
    END IF;
  END IF;

  IF p_next_status IN ('approved', 'locked') THEN
    UPDATE public.forecast_versions AS fv
    SET is_current_approved = false
    WHERE fv.legal_entity_id = v_row.legal_entity_id
      AND fv.control_scope_id IS NOT DISTINCT FROM v_row.control_scope_id
      AND fv.fiscal_year_id IS NOT DISTINCT FROM v_row.fiscal_year_id
      AND fv.scenario = v_row.scenario
      AND COALESCE(fv.project_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = COALESCE(v_row.project_id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND COALESCE(fv.control_account_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = COALESCE(v_row.control_account_id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND fv.id <> p_forecast_version_id
      AND fv.is_current_approved = true;
  END IF;

  UPDATE public.forecast_versions AS fv SET
    approval_status = p_next_status,
    submitted_at = CASE WHEN p_next_status = 'submitted' THEN NOW() ELSE fv.submitted_at END,
    submitted_by = CASE WHEN p_next_status = 'submitted' THEN v_actor ELSE fv.submitted_by END,
    reviewed_at = CASE WHEN p_next_status = 'under_review' THEN NOW() ELSE fv.reviewed_at END,
    reviewed_by = CASE WHEN p_next_status = 'under_review' THEN v_actor ELSE fv.reviewed_by END,
    approved_at = CASE WHEN p_next_status = 'approved' THEN NOW() ELSE fv.approved_at END,
    approved_by = CASE WHEN p_next_status = 'approved' THEN v_actor ELSE fv.approved_by END,
    locked_at = CASE WHEN p_next_status IN ('approved', 'locked') THEN NOW() ELSE fv.locked_at END,
    rejected_at = CASE WHEN p_next_status = 'rejected' THEN NOW() ELSE fv.rejected_at END,
    rejected_by = CASE WHEN p_next_status = 'rejected' THEN v_actor ELSE fv.rejected_by END,
    cancelled_at = CASE WHEN p_next_status = 'cancelled' THEN NOW() ELSE fv.cancelled_at END,
    cancelled_by = CASE WHEN p_next_status = 'cancelled' THEN v_actor ELSE fv.cancelled_by END,
    is_current_approved = CASE WHEN p_next_status IN ('approved', 'locked') THEN true ELSE fv.is_current_approved END,
    forecast_cost = CASE WHEN p_next_status = 'approved' AND v_total > 0 THEN v_total ELSE fv.forecast_cost END,
    row_version = fv.row_version + 1
  WHERE fv.id = p_forecast_version_id
  RETURNING * INTO v_row;

  PERFORM private.write_audit_event(
    v_actor, 'approve', 'forecast_version', p_forecast_version_id,
    v_row.legal_entity_id, v_row.control_scope_id, v_row.project_id,
    p_correlation_id, p_idempotency_key,
    jsonb_build_object('approval_status', p_expected_status),
    jsonb_build_object('approval_status', p_next_status, 'forecast_cost', v_row.forecast_cost),
    NULL, NULL
  );

  v_result := private.command_ok(jsonb_build_object(
    'entity_id', p_forecast_version_id,
    'approval_status', p_next_status,
    'forecast_cost', v_row.forecast_cost,
    'row_version', v_row.row_version
  ));
  PERFORM private.command_store_idempotency(v_cmd, p_idempotency_key, v_actor, v_result);
  RETURN v_result;
END
$function$;

REVOKE ALL ON FUNCTION private.forecast_transition(UUID, public.approval_status, public.approval_status, TEXT, UUID) FROM PUBLIC;
