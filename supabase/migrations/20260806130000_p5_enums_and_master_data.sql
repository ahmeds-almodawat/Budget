-- P5: enums and governed master data

CREATE TYPE public.master_record_type AS ENUM (
  'legal_entity', 'organization_unit_type', 'organization_unit', 'department', 'cost_center',
  'team', 'cost_category', 'cost_subcategory', 'cost_item', 'gl_account', 'gl_cost_mapping',
  'vendor', 'unit_of_measure', 'currency', 'vat_treatment', 'fiscal_calendar', 'fiscal_period',
  'project_type', 'control_scope_type', 'workflow_type', 'variance_reason', 'risk_category',
  'approval_threshold'
);

CREATE TYPE public.governance_workflow_status AS ENUM (
  'draft', 'submitted', 'approved', 'inactive', 'rejected', 'cancelled'
);

CREATE TYPE public.delegation_status AS ENUM (
  'draft', 'submitted', 'approved', 'active', 'expired', 'rejected', 'revoked', 'cancelled'
);

CREATE TYPE public.requisition_status AS ENUM (
  'draft', 'submitted', 'department_approved', 'budget_checked', 'procurement_review',
  'approved', 'sourcing', 'ordered', 'closed', 'rejected', 'cancelled', 'returned_for_revision'
);

CREATE TYPE public.period_module AS ENUM (
  'budgets', 'actuals', 'procurement', 'projects', 'forecasts', 'reporting'
);

CREATE TYPE public.period_control_state AS ENUM (
  'future', 'open', 'soft_close', 'hard_close', 'reopened', 'archived'
);

CREATE TABLE public.governed_master_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id UUID NOT NULL REFERENCES public.legal_entities(id),
  record_type public.master_record_type NOT NULL,
  code TEXT NOT NULL,
  name_en TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  description TEXT,
  parent_id UUID REFERENCES public.governed_master_records(id),
  attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
  effective_start DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_end DATE,
  governance_status public.governance_workflow_status NOT NULL DEFAULT 'draft',
  change_reason TEXT,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  submitted_by UUID REFERENCES public.profiles(id),
  approved_by UUID REFERENCES public.profiles(id),
  row_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (legal_entity_id, record_type, code)
);

CREATE INDEX idx_governed_master_records_parent
  ON public.governed_master_records (parent_id) WHERE parent_id IS NOT NULL;

CREATE OR REPLACE FUNCTION private.master_record_cycle_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
  v_cursor UUID := NEW.parent_id;
  v_hops INTEGER := 0;
BEGIN
  IF NEW.parent_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.parent_id = OLD.id THEN
    RAISE EXCEPTION 'Master record cannot be its own parent';
  END IF;
  WHILE v_cursor IS NOT NULL AND v_hops < 32 LOOP
    IF v_cursor = NEW.id THEN
      RAISE EXCEPTION 'Master record hierarchy cycle detected';
    END IF;
    SELECT gmr.parent_id INTO v_cursor FROM public.governed_master_records AS gmr WHERE gmr.id = v_cursor;
    v_hops := v_hops + 1;
  END LOOP;
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS trg_governed_master_records_cycle ON public.governed_master_records;
CREATE TRIGGER trg_governed_master_records_cycle
  BEFORE INSERT OR UPDATE OF parent_id ON public.governed_master_records
  FOR EACH ROW EXECUTE FUNCTION private.master_record_cycle_guard();

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

  IF NOT private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator','finance_user','cost_controller'],
    v_row.legal_entity_id, 'legal_entity', v_row.legal_entity_id) THEN
    RETURN private.command_fail('FORBIDDEN', 'Insufficient role for master data transition');
  END IF;

  IF p_next_status = 'approved' AND v_row.submitted_by = v_actor THEN
    RETURN private.command_fail('SOD_VIOLATION', 'Submitter cannot approve master data');
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

CREATE OR REPLACE FUNCTION private.master_record_create_draft(
  p_legal_entity_id UUID,
  p_record_type public.master_record_type,
  p_code TEXT,
  p_name_en TEXT,
  p_name_ar TEXT,
  p_description TEXT DEFAULT NULL,
  p_parent_id UUID DEFAULT NULL,
  p_attributes JSONB DEFAULT '{}'::jsonb,
  p_effective_start DATE DEFAULT CURRENT_DATE,
  p_effective_end DATE DEFAULT NULL,
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
  v_cmd TEXT := 'master_record_create_draft';
  v_replay JSONB;
  v_id UUID;
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
    RETURN private.command_fail('FORBIDDEN', 'Insufficient role to create master data');
  END IF;

  INSERT INTO public.governed_master_records (
    legal_entity_id, record_type, code, name_en, name_ar, description, parent_id,
    attributes, effective_start, effective_end, governance_status, change_reason, created_by
  ) VALUES (
    p_legal_entity_id, p_record_type, p_code, p_name_en, p_name_ar, p_description, p_parent_id,
    COALESCE(p_attributes, '{}'::jsonb), p_effective_start, p_effective_end, 'draft', p_change_reason, v_actor
  ) RETURNING id INTO v_id;

  PERFORM private.write_audit_event(
    v_actor, 'create', 'governed_master_record', v_id,
    p_legal_entity_id, NULL, NULL,
    p_correlation_id, p_idempotency_key,
    NULL,
    jsonb_build_object('record_type', p_record_type, 'code', p_code),
    p_change_reason, NULL
  );

  v_result := private.command_ok(jsonb_build_object('entity_id', v_id));
  PERFORM private.command_store_idempotency(v_cmd, p_idempotency_key, v_actor, v_result);
  RETURN v_result;
END
$function$;

CREATE OR REPLACE FUNCTION public.rpc_master_record_create_draft(
  p_legal_entity_id UUID, p_record_type public.master_record_type, p_code TEXT,
  p_name_en TEXT, p_name_ar TEXT, p_description TEXT DEFAULT NULL, p_parent_id UUID DEFAULT NULL,
  p_attributes JSONB DEFAULT '{}'::jsonb, p_effective_start DATE DEFAULT CURRENT_DATE,
  p_effective_end DATE DEFAULT NULL, p_change_reason TEXT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL, p_correlation_id UUID DEFAULT NULL
) RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.master_record_create_draft(p_legal_entity_id, p_record_type, p_code, p_name_en, p_name_ar,
    p_description, p_parent_id, p_attributes, p_effective_start, p_effective_end, p_change_reason,
    p_idempotency_key, p_correlation_id);
$$;

CREATE OR REPLACE FUNCTION public.rpc_master_record_submit(
  p_record_id UUID, p_expected_status public.governance_workflow_status DEFAULT 'draft',
  p_idempotency_key TEXT DEFAULT NULL, p_correlation_id UUID DEFAULT NULL
) RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.master_record_transition(p_record_id, p_expected_status, 'submitted', p_idempotency_key, p_correlation_id);
$$;

CREATE OR REPLACE FUNCTION public.rpc_master_record_approve(
  p_record_id UUID, p_expected_status public.governance_workflow_status DEFAULT 'submitted',
  p_idempotency_key TEXT DEFAULT NULL, p_correlation_id UUID DEFAULT NULL
) RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.master_record_transition(p_record_id, p_expected_status, 'approved', p_idempotency_key, p_correlation_id);
$$;

REVOKE ALL ON FUNCTION public.rpc_master_record_create_draft(UUID, public.master_record_type, TEXT, TEXT, TEXT, TEXT, UUID, JSONB, DATE, DATE, TEXT, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_master_record_submit(UUID, public.governance_workflow_status, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_master_record_approve(UUID, public.governance_workflow_status, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_master_record_create_draft(UUID, public.master_record_type, TEXT, TEXT, TEXT, TEXT, UUID, JSONB, DATE, DATE, TEXT, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_master_record_submit(UUID, public.governance_workflow_status, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_master_record_approve(UUID, public.governance_workflow_status, TEXT, UUID) TO authenticated;
REVOKE ALL ON FUNCTION private.master_record_transition(UUID, public.governance_workflow_status, public.governance_workflow_status, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.master_record_create_draft(UUID, public.master_record_type, TEXT, TEXT, TEXT, TEXT, UUID, JSONB, DATE, DATE, TEXT, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.master_record_cycle_guard() FROM PUBLIC, anon, authenticated, service_role;
