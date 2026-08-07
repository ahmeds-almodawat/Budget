-- P5: delegated approvals

CREATE TABLE public.approval_delegations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id UUID NOT NULL REFERENCES public.legal_entities(id),
  delegator_id UUID NOT NULL REFERENCES public.profiles(id),
  delegate_id UUID NOT NULL REFERENCES public.profiles(id),
  control_scope_id UUID REFERENCES public.control_scopes(id),
  workflow_type TEXT NOT NULL,
  permission_code TEXT NOT NULL,
  financial_threshold NUMERIC(18,4),
  effective_start TIMESTAMPTZ NOT NULL,
  effective_end TIMESTAMPTZ NOT NULL,
  reason TEXT NOT NULL,
  delegation_status public.delegation_status NOT NULL DEFAULT 'draft',
  submitted_by UUID REFERENCES public.profiles(id),
  approved_by UUID REFERENCES public.profiles(id),
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES public.profiles(id),
  row_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT approval_delegations_no_self CHECK (delegator_id <> delegate_id),
  CONSTRAINT approval_delegations_date_order CHECK (effective_end > effective_start)
);

CREATE INDEX idx_approval_delegations_delegate_active
  ON public.approval_delegations (delegate_id, legal_entity_id)
  WHERE delegation_status = 'active';

CREATE OR REPLACE FUNCTION private.delegation_transition(
  p_delegation_id UUID,
  p_expected_status public.delegation_status,
  p_next_status public.delegation_status,
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
  v_cmd TEXT := 'delegation_' || p_next_status::text;
  v_replay JSONB;
  v_row public.approval_delegations%ROWTYPE;
  v_result JSONB;
  v_allowed BOOLEAN := false;
BEGIN
  v_replay := private.command_check_idempotency(v_cmd, p_idempotency_key, v_actor);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF v_actor IS NULL OR NOT private.current_user_is_active() THEN
    RETURN private.command_fail('UNAUTHENTICATED', 'Authentication required');
  END IF;

  SELECT * INTO v_row FROM public.approval_delegations AS ad
  WHERE ad.id = p_delegation_id FOR UPDATE;
  IF NOT FOUND THEN RETURN private.command_fail('NOT_FOUND', 'Delegation not found'); END IF;
  IF v_row.delegation_status IS DISTINCT FROM p_expected_status THEN
    RETURN private.command_fail('STATE_MISMATCH', 'Unexpected delegation status');
  END IF;

  IF NOT (
    (p_expected_status = 'draft' AND p_next_status = 'submitted')
    OR (p_expected_status = 'submitted' AND p_next_status IN ('approved', 'rejected', 'cancelled'))
    OR (p_expected_status = 'approved' AND p_next_status = 'active')
    OR (p_expected_status = 'active' AND p_next_status IN ('revoked', 'expired'))
    OR (p_expected_status = 'draft' AND p_next_status = 'cancelled')
  ) THEN
    RETURN private.command_fail('INVALID_TRANSITION', 'Delegation transition not allowed');
  END IF;

  IF p_next_status IN ('submitted', 'cancelled') THEN
    v_allowed := v_row.delegator_id = v_actor AND private.user_has_any_role(
      ARRAY['system_administrator','legal_entity_administrator','approver','finance_user','cost_controller'],
      v_row.legal_entity_id, 'legal_entity', v_row.legal_entity_id);
  ELSIF p_next_status = 'approved' THEN
    v_allowed := private.user_has_any_role(
      ARRAY['system_administrator','legal_entity_administrator','approver'],
      v_row.legal_entity_id, 'legal_entity', v_row.legal_entity_id);
    IF v_row.delegator_id = v_actor THEN
      RETURN private.command_fail('SOD_VIOLATION', 'Delegator cannot approve own delegation');
    END IF;
  ELSIF p_next_status = 'active' THEN
    v_allowed := private.user_has_any_role(
      ARRAY['system_administrator','legal_entity_administrator'],
      v_row.legal_entity_id, 'legal_entity', v_row.legal_entity_id);
  ELSIF p_next_status = 'revoked' THEN
    v_allowed := v_row.delegator_id = v_actor OR private.user_has_any_role(
      ARRAY['system_administrator','legal_entity_administrator'],
      v_row.legal_entity_id, 'legal_entity', v_row.legal_entity_id);
  ELSE
    v_allowed := private.user_has_any_role(
      ARRAY['system_administrator','legal_entity_administrator','approver'],
      v_row.legal_entity_id, 'legal_entity', v_row.legal_entity_id);
  END IF;
  IF NOT v_allowed THEN RETURN private.command_fail('FORBIDDEN', 'Insufficient role for delegation'); END IF;

  UPDATE public.approval_delegations AS ad SET
    delegation_status = p_next_status,
    submitted_by = CASE WHEN p_next_status = 'submitted' THEN v_actor ELSE ad.submitted_by END,
    approved_by = CASE WHEN p_next_status = 'approved' THEN v_actor ELSE ad.approved_by END,
    revoked_at = CASE WHEN p_next_status = 'revoked' THEN NOW() ELSE ad.revoked_at END,
    revoked_by = CASE WHEN p_next_status = 'revoked' THEN v_actor ELSE ad.revoked_by END,
    updated_at = NOW(),
    row_version = ad.row_version + 1
  WHERE ad.id = p_delegation_id
  RETURNING * INTO v_row;

  PERFORM private.write_audit_event(
    v_actor, 'update', 'approval_delegation', p_delegation_id,
    v_row.legal_entity_id, NULL, NULL,
    p_correlation_id, p_idempotency_key,
    jsonb_build_object('status', p_expected_status),
    jsonb_build_object('status', p_next_status, 'delegate_id', v_row.delegate_id),
    NULL, NULL
  );

  v_result := private.command_ok(jsonb_build_object('entity_id', p_delegation_id, 'delegation_status', p_next_status));
  PERFORM private.command_store_idempotency(v_cmd, p_idempotency_key, v_actor, v_result);
  RETURN v_result;
END
$function$;

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

CREATE OR REPLACE FUNCTION public.rpc_delegation_create_draft(
  p_legal_entity_id UUID, p_delegate_id UUID, p_control_scope_id UUID,
  p_workflow_type TEXT, p_permission_code TEXT, p_financial_threshold NUMERIC(18,4),
  p_effective_start TIMESTAMPTZ, p_effective_end TIMESTAMPTZ, p_reason TEXT,
  p_idempotency_key TEXT DEFAULT NULL, p_correlation_id UUID DEFAULT NULL
) RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.delegation_create_draft(p_legal_entity_id, p_delegate_id, p_control_scope_id,
    p_workflow_type, p_permission_code, p_financial_threshold, p_effective_start, p_effective_end,
    p_reason, p_idempotency_key, p_correlation_id);
$$;

CREATE OR REPLACE FUNCTION public.rpc_delegation_submit(
  p_delegation_id UUID, p_expected_status public.delegation_status DEFAULT 'draft',
  p_idempotency_key TEXT DEFAULT NULL, p_correlation_id UUID DEFAULT NULL
) RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.delegation_transition(p_delegation_id, p_expected_status, 'submitted', p_idempotency_key, p_correlation_id);
$$;

CREATE OR REPLACE FUNCTION public.rpc_delegation_approve(
  p_delegation_id UUID, p_expected_status public.delegation_status DEFAULT 'submitted',
  p_idempotency_key TEXT DEFAULT NULL, p_correlation_id UUID DEFAULT NULL
) RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.delegation_transition(p_delegation_id, p_expected_status, 'approved', p_idempotency_key, p_correlation_id);
$$;

CREATE OR REPLACE FUNCTION public.rpc_delegation_activate(
  p_delegation_id UUID, p_expected_status public.delegation_status DEFAULT 'approved',
  p_idempotency_key TEXT DEFAULT NULL, p_correlation_id UUID DEFAULT NULL
) RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.delegation_transition(p_delegation_id, p_expected_status, 'active', p_idempotency_key, p_correlation_id);
$$;

CREATE OR REPLACE FUNCTION public.rpc_delegation_revoke(
  p_delegation_id UUID, p_expected_status public.delegation_status DEFAULT 'active',
  p_idempotency_key TEXT DEFAULT NULL, p_correlation_id UUID DEFAULT NULL
) RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.delegation_transition(p_delegation_id, p_expected_status, 'revoked', p_idempotency_key, p_correlation_id);
$$;

CREATE OR REPLACE FUNCTION public.rpc_delegation_cancel(
  p_delegation_id UUID, p_expected_status public.delegation_status DEFAULT 'draft',
  p_idempotency_key TEXT DEFAULT NULL, p_correlation_id UUID DEFAULT NULL
) RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.delegation_transition(p_delegation_id, p_expected_status, 'cancelled', p_idempotency_key, p_correlation_id);
$$;

REVOKE ALL ON FUNCTION public.rpc_delegation_create_draft(UUID, UUID, UUID, TEXT, TEXT, NUMERIC, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_delegation_submit(UUID, public.delegation_status, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_delegation_approve(UUID, public.delegation_status, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_delegation_activate(UUID, public.delegation_status, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_delegation_revoke(UUID, public.delegation_status, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_delegation_cancel(UUID, public.delegation_status, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_delegation_create_draft(UUID, UUID, UUID, TEXT, TEXT, NUMERIC, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_delegation_submit(UUID, public.delegation_status, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_delegation_approve(UUID, public.delegation_status, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_delegation_activate(UUID, public.delegation_status, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_delegation_revoke(UUID, public.delegation_status, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_delegation_cancel(UUID, public.delegation_status, TEXT, UUID) TO authenticated;
REVOKE ALL ON FUNCTION private.delegation_transition(UUID, public.delegation_status, public.delegation_status, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.delegation_create_draft(UUID, UUID, UUID, TEXT, TEXT, NUMERIC, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, UUID) FROM PUBLIC;
