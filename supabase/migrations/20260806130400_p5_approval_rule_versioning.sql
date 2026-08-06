-- P5: approval rule versioning

CREATE TABLE public.approval_rule_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id UUID NOT NULL REFERENCES public.legal_entities(id),
  workflow_type TEXT NOT NULL,
  version_number INTEGER NOT NULL,
  rule_definition JSONB NOT NULL,
  effective_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effective_end TIMESTAMPTZ,
  governance_status public.governance_workflow_status NOT NULL DEFAULT 'draft',
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  approved_by UUID REFERENCES public.profiles(id),
  row_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (legal_entity_id, workflow_type, version_number)
);

CREATE UNIQUE INDEX idx_approval_rule_current
  ON public.approval_rule_versions (legal_entity_id, workflow_type)
  WHERE governance_status = 'approved' AND effective_end IS NULL;

CREATE OR REPLACE FUNCTION private.approval_rule_transition(
  p_rule_id UUID,
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
  v_cmd TEXT := 'approval_rule_' || p_next_status::text;
  v_replay JSONB;
  v_row public.approval_rule_versions%ROWTYPE;
  v_result JSONB;
BEGIN
  v_replay := private.command_check_idempotency(v_cmd, p_idempotency_key, v_actor);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF v_actor IS NULL OR NOT private.current_user_is_active() THEN
    RETURN private.command_fail('UNAUTHENTICATED', 'Authentication required');
  END IF;

  SELECT * INTO v_row FROM public.approval_rule_versions AS arv
  WHERE arv.id = p_rule_id FOR UPDATE;
  IF NOT FOUND THEN RETURN private.command_fail('NOT_FOUND', 'Approval rule not found'); END IF;
  IF v_row.governance_status IS DISTINCT FROM p_expected_status THEN
    RETURN private.command_fail('STATE_MISMATCH', 'Unexpected approval rule status');
  END IF;
  IF NOT private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator','cost_controller'],
    v_row.legal_entity_id, 'legal_entity', v_row.legal_entity_id) THEN
    RETURN private.command_fail('FORBIDDEN', 'Insufficient role for approval rule');
  END IF;
  IF p_next_status = 'approved' AND v_row.created_by = v_actor THEN
    RETURN private.command_fail('SOD_VIOLATION', 'Rule author cannot approve rule version');
  END IF;

  IF p_next_status = 'approved' THEN
    UPDATE public.approval_rule_versions AS arv
    SET effective_end = NOW(), updated_at = NOW(), row_version = arv.row_version + 1
    WHERE arv.legal_entity_id = v_row.legal_entity_id
      AND arv.workflow_type = v_row.workflow_type
      AND arv.governance_status = 'approved'
      AND arv.effective_end IS NULL
      AND arv.id <> p_rule_id;
  END IF;

  UPDATE public.approval_rule_versions AS arv SET
    governance_status = p_next_status,
    approved_by = CASE WHEN p_next_status = 'approved' THEN v_actor ELSE arv.approved_by END,
    updated_at = NOW(),
    row_version = arv.row_version + 1
  WHERE arv.id = p_rule_id
  RETURNING * INTO v_row;

  PERFORM private.write_audit_event(
    v_actor, 'update', 'approval_rule_version', p_rule_id,
    v_row.legal_entity_id, NULL, NULL,
    p_correlation_id, p_idempotency_key,
    jsonb_build_object('status', p_expected_status),
    jsonb_build_object('status', p_next_status, 'workflow_type', v_row.workflow_type, 'version', v_row.version_number),
    NULL, NULL
  );

  v_result := private.command_ok(jsonb_build_object('entity_id', p_rule_id, 'governance_status', p_next_status));
  PERFORM private.command_store_idempotency(v_cmd, p_idempotency_key, v_actor, v_result);
  RETURN v_result;
END
$function$;

CREATE OR REPLACE FUNCTION private.approval_rule_create_draft(
  p_legal_entity_id UUID, p_workflow_type TEXT, p_rule_definition JSONB,
  p_idempotency_key TEXT DEFAULT NULL, p_correlation_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor UUID := (SELECT auth.uid());
  v_cmd TEXT := 'approval_rule_create_draft';
  v_replay JSONB;
  v_id UUID;
  v_next_version INTEGER;
  v_result JSONB;
BEGIN
  v_replay := private.command_check_idempotency(v_cmd, p_idempotency_key, v_actor);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF v_actor IS NULL OR NOT private.current_user_is_active() THEN
    RETURN private.command_fail('UNAUTHENTICATED', 'Authentication required');
  END IF;
  IF NOT private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator','cost_controller'],
    p_legal_entity_id, 'legal_entity', p_legal_entity_id) THEN
    RETURN private.command_fail('FORBIDDEN', 'Insufficient role to create approval rule');
  END IF;

  SELECT COALESCE(MAX(arv.version_number), 0) + 1 INTO v_next_version
  FROM public.approval_rule_versions AS arv
  WHERE arv.legal_entity_id = p_legal_entity_id AND arv.workflow_type = p_workflow_type;

  INSERT INTO public.approval_rule_versions (
    legal_entity_id, workflow_type, version_number, rule_definition, governance_status, created_by
  ) VALUES (
    p_legal_entity_id, p_workflow_type, v_next_version, p_rule_definition, 'draft', v_actor
  ) RETURNING id INTO v_id;

  PERFORM private.write_audit_event(
    v_actor, 'create', 'approval_rule_version', v_id,
    p_legal_entity_id, NULL, NULL,
    p_correlation_id, p_idempotency_key,
    NULL, jsonb_build_object('workflow_type', p_workflow_type, 'version', v_next_version),
    NULL, NULL
  );

  v_result := private.command_ok(jsonb_build_object('entity_id', v_id, 'version_number', v_next_version));
  PERFORM private.command_store_idempotency(v_cmd, p_idempotency_key, v_actor, v_result);
  RETURN v_result;
END
$function$;

CREATE OR REPLACE FUNCTION public.rpc_approval_rule_create_draft(
  p_legal_entity_id UUID, p_workflow_type TEXT, p_rule_definition JSONB,
  p_idempotency_key TEXT DEFAULT NULL, p_correlation_id UUID DEFAULT NULL
) RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.approval_rule_create_draft(p_legal_entity_id, p_workflow_type, p_rule_definition,
    p_idempotency_key, p_correlation_id);
$$;

CREATE OR REPLACE FUNCTION public.rpc_approval_rule_submit(
  p_rule_id UUID, p_expected_status public.governance_workflow_status DEFAULT 'draft',
  p_idempotency_key TEXT DEFAULT NULL, p_correlation_id UUID DEFAULT NULL
) RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.approval_rule_transition(p_rule_id, p_expected_status, 'submitted', p_idempotency_key, p_correlation_id);
$$;

CREATE OR REPLACE FUNCTION public.rpc_approval_rule_approve(
  p_rule_id UUID, p_expected_status public.governance_workflow_status DEFAULT 'submitted',
  p_idempotency_key TEXT DEFAULT NULL, p_correlation_id UUID DEFAULT NULL
) RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.approval_rule_transition(p_rule_id, p_expected_status, 'approved', p_idempotency_key, p_correlation_id);
$$;

REVOKE ALL ON FUNCTION public.rpc_approval_rule_create_draft(UUID, TEXT, JSONB, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_approval_rule_submit(UUID, public.governance_workflow_status, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_approval_rule_approve(UUID, public.governance_workflow_status, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_approval_rule_create_draft(UUID, TEXT, JSONB, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_approval_rule_submit(UUID, public.governance_workflow_status, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_approval_rule_approve(UUID, public.governance_workflow_status, TEXT, UUID) TO authenticated;
REVOKE ALL ON FUNCTION private.approval_rule_transition(UUID, public.governance_workflow_status, public.governance_workflow_status, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.approval_rule_create_draft(UUID, TEXT, JSONB, TEXT, UUID) FROM PUBLIC;
