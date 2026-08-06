-- P4: Transactional forecast supersede (approve new + supersede prior in one command)

CREATE OR REPLACE FUNCTION private.forecast_approve_and_supersede(
  p_new_forecast_version_id UUID,
  p_superseded_forecast_version_id UUID,
  p_expected_new_status public.approval_status DEFAULT 'under_review',
  p_approver_comment TEXT DEFAULT NULL,
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
  v_cmd TEXT := 'forecast_approve_and_supersede';
  v_replay JSONB;
  v_new public.forecast_versions%ROWTYPE;
  v_old public.forecast_versions%ROWTYPE;
  v_step JSONB;
  v_result JSONB;
BEGIN
  v_replay := private.command_check_idempotency(v_cmd, p_idempotency_key, v_actor);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

  IF v_actor IS NULL OR NOT private.current_user_is_active() THEN
    RETURN private.command_fail('UNAUTHENTICATED', 'Authentication required');
  END IF;

  SELECT * INTO v_new FROM public.forecast_versions AS fv
  WHERE fv.id = p_new_forecast_version_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN private.command_fail('NOT_FOUND', 'New forecast version not found');
  END IF;

  SELECT * INTO v_old FROM public.forecast_versions AS fv
  WHERE fv.id = p_superseded_forecast_version_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN private.command_fail('NOT_FOUND', 'Superseded forecast version not found');
  END IF;

  IF v_new.legal_entity_id <> v_old.legal_entity_id
     OR v_new.control_scope_id IS DISTINCT FROM v_old.control_scope_id
     OR v_new.fiscal_year_id IS DISTINCT FROM v_old.fiscal_year_id
     OR v_new.scenario IS DISTINCT FROM v_old.scenario
     OR COALESCE(v_new.project_id, '00000000-0000-0000-0000-000000000000'::uuid)
        <> COALESCE(v_old.project_id, '00000000-0000-0000-0000-000000000000'::uuid)
     OR COALESCE(v_new.control_account_id, '00000000-0000-0000-0000-000000000000'::uuid)
        <> COALESCE(v_old.control_account_id, '00000000-0000-0000-0000-000000000000'::uuid) THEN
    RETURN private.command_fail('SCOPE_MISMATCH', 'Forecast versions are not in the same uniqueness grain');
  END IF;

  IF v_old.approval_status NOT IN ('approved', 'locked') THEN
    RETURN private.command_fail('STATE_CONFLICT', 'Superseded version must be approved and locked');
  END IF;

  IF v_new.approval_status <> p_expected_new_status THEN
    RETURN private.command_fail('STATE_CONFLICT',
      format('Expected new forecast status %s but found %s', p_expected_new_status, v_new.approval_status));
  END IF;

  IF NOT private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator','cost_controller','budget_owner','finance_user','approver'],
    v_new.legal_entity_id, 'control_scope', v_new.control_scope_id) THEN
    RETURN private.command_fail('FORBIDDEN', 'Insufficient role to supersede forecast');
  END IF;

  IF v_new.submitted_by = v_actor OR v_new.created_by = v_actor THEN
    RETURN private.command_fail('SOD_VIOLATION', 'Submitter cannot approve forecast supersede');
  END IF;

  v_step := private.forecast_approve_and_lock(p_new_forecast_version_id, p_expected_new_status, NULL, p_correlation_id);
  IF NOT (v_step->>'ok')::boolean THEN RETURN v_step; END IF;

  v_step := private.forecast_transition(p_superseded_forecast_version_id, 'locked', 'superseded', NULL, p_correlation_id);
  IF NOT (v_step->>'ok')::boolean THEN
    RAISE EXCEPTION 'Supersede rollback required: %', v_step;
  END IF;

  UPDATE public.forecast_versions AS fv SET
    is_current_approved = false,
    superseded_from_id = p_superseded_forecast_version_id
  WHERE fv.id = p_new_forecast_version_id;

  PERFORM private.write_audit_event(
    v_actor, 'approve', 'forecast_version', p_new_forecast_version_id,
    v_new.legal_entity_id, v_new.control_scope_id, v_new.project_id,
    p_correlation_id, p_idempotency_key,
    jsonb_build_object(
      'superseded_version_id', p_superseded_forecast_version_id,
      'previous_status', v_old.approval_status
    ),
    jsonb_build_object(
      'new_version_id', p_new_forecast_version_id,
      'approval_status', 'locked'
    ),
    p_approver_comment, NULL
  );

  v_result := private.command_ok(jsonb_build_object(
    'entity_id', p_new_forecast_version_id,
    'superseded_version_id', p_superseded_forecast_version_id,
    'approval_status', 'locked'
  ));
  PERFORM private.command_store_idempotency(v_cmd, p_idempotency_key, v_actor, v_result);
  RETURN v_result;
END
$function$;

CREATE OR REPLACE FUNCTION public.rpc_forecast_approve_and_supersede(
  p_new_forecast_version_id UUID,
  p_superseded_forecast_version_id UUID,
  p_expected_new_status public.approval_status DEFAULT 'under_review',
  p_approver_comment TEXT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL,
  p_correlation_id UUID DEFAULT NULL
) RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.forecast_approve_and_supersede(
    p_new_forecast_version_id, p_superseded_forecast_version_id,
    p_expected_new_status, p_approver_comment, p_idempotency_key, p_correlation_id
  );
$$;

REVOKE ALL ON FUNCTION public.rpc_forecast_approve_and_supersede(UUID, UUID, public.approval_status, TEXT, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_forecast_approve_and_supersede(UUID, UUID, public.approval_status, TEXT, TEXT, UUID) TO authenticated;
REVOKE ALL ON FUNCTION private.forecast_approve_and_supersede(UUID, UUID, public.approval_status, TEXT, TEXT, UUID) FROM PUBLIC;
