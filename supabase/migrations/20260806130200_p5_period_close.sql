-- P5: fiscal period module controls and close/reopen commands

CREATE TABLE public.fiscal_period_module_controls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_period_id UUID NOT NULL REFERENCES public.fiscal_periods(id) ON DELETE CASCADE,
  legal_entity_id UUID NOT NULL REFERENCES public.legal_entities(id),
  module public.period_module NOT NULL,
  control_state public.period_control_state NOT NULL DEFAULT 'open',
  soft_closed_at TIMESTAMPTZ,
  soft_closed_by UUID REFERENCES public.profiles(id),
  hard_closed_at TIMESTAMPTZ,
  hard_closed_by UUID REFERENCES public.profiles(id),
  reopened_at TIMESTAMPTZ,
  reopened_by UUID REFERENCES public.profiles(id),
  reopen_reason TEXT,
  checklist_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  row_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (fiscal_period_id, legal_entity_id, module)
);

CREATE OR REPLACE FUNCTION private.assert_period_open(
  p_module public.period_module,
  p_legal_entity_id UUID,
  p_fiscal_period_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_state public.period_control_state;
BEGIN
  SELECT fpmc.control_state INTO v_state
  FROM public.fiscal_period_module_controls AS fpmc
  WHERE fpmc.fiscal_period_id = p_fiscal_period_id
    AND fpmc.legal_entity_id = p_legal_entity_id
    AND fpmc.module = p_module;
  IF v_state IS NULL THEN RETURN; END IF;
  IF v_state IN ('hard_close', 'archived') THEN
    RAISE EXCEPTION 'Period is hard closed for module %', p_module USING ERRCODE = 'P0001';
  END IF;
  IF v_state = 'soft_close' THEN
    RAISE EXCEPTION 'Period is soft closed for module %', p_module USING ERRCODE = 'P0001';
  END IF;
END
$function$;

CREATE OR REPLACE FUNCTION private.period_module_transition(
  p_fiscal_period_id UUID,
  p_legal_entity_id UUID,
  p_module public.period_module,
  p_expected_state public.period_control_state,
  p_next_state public.period_control_state,
  p_reason TEXT DEFAULT NULL,
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
  v_cmd TEXT := 'period_' || p_module::text || '_' || p_next_state::text;
  v_replay JSONB;
  v_row public.fiscal_period_module_controls%ROWTYPE;
  v_result JSONB;
BEGIN
  v_replay := private.command_check_idempotency(v_cmd, p_idempotency_key, v_actor);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF v_actor IS NULL OR NOT private.current_user_is_active() THEN
    RETURN private.command_fail('UNAUTHENTICATED', 'Authentication required');
  END IF;
  IF NOT private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator','finance_user','cost_controller'],
    p_legal_entity_id, 'legal_entity', p_legal_entity_id) THEN
    RETURN private.command_fail('FORBIDDEN', 'Insufficient role for period control');
  END IF;

  INSERT INTO public.fiscal_period_module_controls (
    fiscal_period_id, legal_entity_id, module, control_state
  ) VALUES (
    p_fiscal_period_id, p_legal_entity_id, p_module, 'open'
  ) ON CONFLICT (fiscal_period_id, legal_entity_id, module) DO NOTHING;

  SELECT * INTO v_row FROM public.fiscal_period_module_controls AS fpmc
  WHERE fpmc.fiscal_period_id = p_fiscal_period_id
    AND fpmc.legal_entity_id = p_legal_entity_id
    AND fpmc.module = p_module
  FOR UPDATE;

  IF v_row.control_state IS DISTINCT FROM p_expected_state THEN
    RETURN private.command_fail('STATE_MISMATCH', 'Unexpected period control state');
  END IF;

  IF NOT (
    (p_expected_state = 'open' AND p_next_state = 'soft_close')
    OR (p_expected_state = 'soft_close' AND p_next_state IN ('hard_close', 'open'))
    OR (p_expected_state = 'hard_close' AND p_next_state = 'reopened')
    OR (p_expected_state = 'reopened' AND p_next_state = 'open')
  ) THEN
    RETURN private.command_fail('INVALID_TRANSITION', 'Period control transition not allowed');
  END IF;

  IF p_next_state = 'reopened' AND (p_reason IS NULL OR length(trim(p_reason)) < 5) THEN
    RETURN private.command_fail('VALIDATION', 'Reopen reason required');
  END IF;

  UPDATE public.fiscal_period_module_controls AS fpmc SET
    control_state = p_next_state,
    soft_closed_at = CASE WHEN p_next_state = 'soft_close' THEN NOW() ELSE fpmc.soft_closed_at END,
    soft_closed_by = CASE WHEN p_next_state = 'soft_close' THEN v_actor ELSE fpmc.soft_closed_by END,
    hard_closed_at = CASE WHEN p_next_state = 'hard_close' THEN NOW() ELSE fpmc.hard_closed_at END,
    hard_closed_by = CASE WHEN p_next_state = 'hard_close' THEN v_actor ELSE fpmc.hard_closed_by END,
    reopened_at = CASE WHEN p_next_state IN ('reopened', 'open') AND p_expected_state = 'hard_close' THEN NOW() ELSE fpmc.reopened_at END,
    reopened_by = CASE WHEN p_next_state IN ('reopened', 'open') AND p_expected_state = 'hard_close' THEN v_actor ELSE fpmc.reopened_by END,
    reopen_reason = CASE WHEN p_next_state IN ('reopened', 'open') AND p_expected_state = 'hard_close' THEN p_reason ELSE fpmc.reopen_reason END,
    updated_at = NOW(),
    row_version = fpmc.row_version + 1
  WHERE fpmc.id = v_row.id
  RETURNING * INTO v_row;

  IF p_next_state = 'reopened' THEN
    UPDATE public.fiscal_period_module_controls AS fpmc
    SET control_state = 'open', updated_at = NOW(), row_version = fpmc.row_version + 1
    WHERE fpmc.id = v_row.id;
  END IF;

  PERFORM private.write_audit_event(
    v_actor, 'update', 'fiscal_period_module_control', v_row.id,
    p_legal_entity_id, NULL, NULL,
    p_correlation_id, p_idempotency_key,
    jsonb_build_object('module', p_module, 'state', p_expected_state),
    jsonb_build_object('module', p_module, 'state', p_next_state),
    p_reason, NULL
  );

  v_result := private.command_ok(jsonb_build_object(
    'entity_id', v_row.id, 'module', p_module, 'control_state', CASE WHEN p_next_state = 'reopened' THEN 'open' ELSE p_next_state END
  ));
  PERFORM private.command_store_idempotency(v_cmd, p_idempotency_key, v_actor, v_result);
  RETURN v_result;
END
$function$;

CREATE OR REPLACE FUNCTION public.rpc_period_soft_close(
  p_fiscal_period_id UUID, p_legal_entity_id UUID, p_module public.period_module,
  p_expected_state public.period_control_state DEFAULT 'open',
  p_idempotency_key TEXT DEFAULT NULL, p_correlation_id UUID DEFAULT NULL
) RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.period_module_transition(p_fiscal_period_id, p_legal_entity_id, p_module,
    p_expected_state, 'soft_close', NULL, p_idempotency_key, p_correlation_id);
$$;

CREATE OR REPLACE FUNCTION public.rpc_period_hard_close(
  p_fiscal_period_id UUID, p_legal_entity_id UUID, p_module public.period_module,
  p_expected_state public.period_control_state DEFAULT 'soft_close',
  p_idempotency_key TEXT DEFAULT NULL, p_correlation_id UUID DEFAULT NULL
) RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.period_module_transition(p_fiscal_period_id, p_legal_entity_id, p_module,
    p_expected_state, 'hard_close', NULL, p_idempotency_key, p_correlation_id);
$$;

CREATE OR REPLACE FUNCTION public.rpc_period_reopen(
  p_fiscal_period_id UUID, p_legal_entity_id UUID, p_module public.period_module,
  p_reason TEXT, p_expected_state public.period_control_state DEFAULT 'hard_close',
  p_idempotency_key TEXT DEFAULT NULL, p_correlation_id UUID DEFAULT NULL
) RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.period_module_transition(p_fiscal_period_id, p_legal_entity_id, p_module,
    p_expected_state, 'reopened', p_reason, p_idempotency_key, p_correlation_id);
$$;

REVOKE ALL ON FUNCTION public.rpc_period_soft_close(UUID, UUID, public.period_module, public.period_control_state, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_period_hard_close(UUID, UUID, public.period_module, public.period_control_state, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_period_reopen(UUID, UUID, public.period_module, TEXT, public.period_control_state, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_period_soft_close(UUID, UUID, public.period_module, public.period_control_state, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_period_hard_close(UUID, UUID, public.period_module, public.period_control_state, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_period_reopen(UUID, UUID, public.period_module, TEXT, public.period_control_state, TEXT, UUID) TO authenticated;
REVOKE ALL ON FUNCTION private.assert_period_open(public.period_module, UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.period_module_transition(UUID, UUID, public.period_module, public.period_control_state, public.period_control_state, TEXT, TEXT, UUID) FROM PUBLIC;
