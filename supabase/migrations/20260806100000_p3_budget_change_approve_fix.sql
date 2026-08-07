-- Fix COD-H-006: budget change approval must stage new version as draft before locking.
-- Inserting as locked then updating financial amounts violates protect_locked_budget_version.

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
    v_new_label, 'change_order', 'draft', false,
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

  UPDATE public.budget_versions AS bv
  SET is_current_approved = false
  WHERE bv.legal_entity_id = v_source.legal_entity_id
    AND bv.control_scope_id IS NOT DISTINCT FROM v_source.control_scope_id
    AND bv.fiscal_year_id = v_source.fiscal_year_id
    AND bv.id <> v_new_version_id
    AND bv.is_current_approved = true;

  UPDATE public.budget_versions AS bv SET
    approval_status = 'locked',
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
