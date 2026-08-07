-- P5: purchase requisitions and procurement lifecycle

CREATE TABLE public.purchase_requisitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id UUID NOT NULL REFERENCES public.legal_entities(id),
  requisition_number TEXT NOT NULL,
  title_en TEXT NOT NULL,
  title_ar TEXT NOT NULL,
  requester_id UUID NOT NULL REFERENCES public.profiles(id),
  control_scope_id UUID REFERENCES public.control_scopes(id),
  cost_node_id UUID REFERENCES public.cost_nodes(id),
  fiscal_period_id UUID REFERENCES public.fiscal_periods(id),
  currency_code TEXT NOT NULL DEFAULT 'SAR',
  estimated_total NUMERIC(18,4) NOT NULL DEFAULT 0,
  budget_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  approval_rule_version_id UUID,
  requisition_status public.requisition_status NOT NULL DEFAULT 'draft',
  submitted_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES public.profiles(id),
  row_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (legal_entity_id, requisition_number)
);

CREATE TABLE public.purchase_requisition_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requisition_id UUID NOT NULL REFERENCES public.purchase_requisitions(id) ON DELETE CASCADE,
  line_number SMALLINT NOT NULL,
  description TEXT NOT NULL,
  quantity NUMERIC(18,4) NOT NULL DEFAULT 1,
  unit_price NUMERIC(18,4) NOT NULL DEFAULT 0,
  line_total NUMERIC(18,4) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  cost_node_id UUID REFERENCES public.cost_nodes(id),
  UNIQUE (requisition_id, line_number)
);

CREATE TYPE public.po_status AS ENUM (
  'draft', 'submitted', 'approved', 'issued', 'partially_received', 'closed', 'cancelled', 'rejected'
);

CREATE TABLE public.purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id UUID NOT NULL REFERENCES public.legal_entities(id),
  requisition_id UUID REFERENCES public.purchase_requisitions(id),
  vendor_id UUID NOT NULL REFERENCES public.vendors(id),
  po_number TEXT NOT NULL,
  po_status public.po_status NOT NULL DEFAULT 'draft',
  commitment_id UUID REFERENCES public.commitments(id),
  currency_code TEXT NOT NULL DEFAULT 'SAR',
  total_amount NUMERIC(18,4) NOT NULL DEFAULT 0,
  issued_at TIMESTAMPTZ,
  issued_by UUID REFERENCES public.profiles(id),
  row_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (legal_entity_id, po_number)
);

CREATE TYPE public.invoice_status AS ENUM (
  'draft', 'submitted', 'matched', 'approved', 'paid', 'rejected', 'cancelled'
);

CREATE TABLE public.supplier_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id UUID NOT NULL REFERENCES public.legal_entities(id),
  purchase_order_id UUID NOT NULL REFERENCES public.purchase_orders(id),
  vendor_id UUID NOT NULL REFERENCES public.vendors(id),
  invoice_number TEXT NOT NULL,
  invoice_status public.invoice_status NOT NULL DEFAULT 'draft',
  invoice_date DATE NOT NULL,
  gross_amount NUMERIC(18,4) NOT NULL,
  matched_amount NUMERIC(18,4) NOT NULL DEFAULT 0,
  row_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (legal_entity_id, vendor_id, invoice_number)
);

CREATE TYPE public.payment_request_status AS ENUM (
  'draft', 'submitted', 'approved', 'released', 'cancelled', 'rejected'
);

CREATE TABLE public.payment_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id UUID NOT NULL REFERENCES public.legal_entities(id),
  supplier_invoice_id UUID NOT NULL REFERENCES public.supplier_invoices(id),
  request_status public.payment_request_status NOT NULL DEFAULT 'draft',
  amount NUMERIC(18,4) NOT NULL,
  requested_by UUID NOT NULL REFERENCES public.profiles(id),
  approved_by UUID REFERENCES public.profiles(id),
  row_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION private.requisition_transition(
  p_requisition_id UUID,
  p_expected_status public.requisition_status,
  p_next_status public.requisition_status,
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
  v_cmd TEXT := 'requisition_' || p_next_status::text;
  v_replay JSONB;
  v_row public.purchase_requisitions%ROWTYPE;
  v_total NUMERIC(18,4);
  v_result JSONB;
  v_allowed BOOLEAN := false;
BEGIN
  v_replay := private.command_check_idempotency(v_cmd, p_idempotency_key, v_actor);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF v_actor IS NULL OR NOT private.current_user_is_active() THEN
    RETURN private.command_fail('UNAUTHENTICATED', 'Authentication required');
  END IF;

  SELECT * INTO v_row FROM public.purchase_requisitions AS pr
  WHERE pr.id = p_requisition_id FOR UPDATE;
  IF NOT FOUND THEN RETURN private.command_fail('NOT_FOUND', 'Requisition not found'); END IF;
  IF v_row.requisition_status IS DISTINCT FROM p_expected_status THEN
    RETURN private.command_fail('STATE_MISMATCH', 'Unexpected requisition status');
  END IF;

  IF v_row.fiscal_period_id IS NOT NULL THEN
    PERFORM private.assert_period_open('procurement', v_row.legal_entity_id, v_row.fiscal_period_id);
  END IF;

  IF NOT (
    (p_expected_status = 'draft' AND p_next_status = 'submitted')
    OR (p_expected_status = 'submitted' AND p_next_status IN ('department_approved', 'rejected', 'returned_for_revision', 'cancelled'))
    OR (p_expected_status = 'department_approved' AND p_next_status IN ('budget_checked', 'rejected', 'returned_for_revision'))
    OR (p_expected_status = 'budget_checked' AND p_next_status IN ('procurement_review', 'rejected'))
    OR (p_expected_status = 'procurement_review' AND p_next_status IN ('approved', 'rejected'))
    OR (p_expected_status = 'approved' AND p_next_status IN ('sourcing', 'ordered', 'closed'))
    OR (p_expected_status = 'sourcing' AND p_next_status IN ('ordered', 'closed'))
    OR (p_expected_status = 'ordered' AND p_next_status = 'closed')
    OR (p_expected_status = 'returned_for_revision' AND p_next_status = 'draft')
  ) THEN
    RETURN private.command_fail('INVALID_TRANSITION', 'Requisition transition not allowed');
  END IF;

  IF p_next_status = 'submitted' THEN
    v_allowed := v_row.requester_id = v_actor;
  ELSIF p_next_status IN ('department_approved', 'procurement_review') THEN
    v_allowed := private.user_has_any_role(
      ARRAY['system_administrator','legal_entity_administrator','cost_controller','budget_owner'],
      v_row.legal_entity_id, 'control_scope', v_row.control_scope_id);
  ELSIF p_next_status = 'budget_checked' THEN
    v_allowed := private.user_has_any_role(
      ARRAY['system_administrator','legal_entity_administrator','finance_user','cost_controller'],
      v_row.legal_entity_id, 'legal_entity', v_row.legal_entity_id);
  ELSIF p_next_status = 'approved' THEN
    v_allowed := private.user_has_any_role(
      ARRAY['system_administrator','legal_entity_administrator','approver'],
      v_row.legal_entity_id, 'legal_entity', v_row.legal_entity_id);
    IF v_row.requester_id = v_actor THEN
      RETURN private.command_fail('SOD_VIOLATION', 'Requester cannot approve requisition');
    END IF;
  ELSE
    v_allowed := private.user_has_any_role(
      ARRAY['system_administrator','legal_entity_administrator','finance_user','cost_controller'],
      v_row.legal_entity_id, 'legal_entity', v_row.legal_entity_id);
  END IF;
  IF NOT v_allowed THEN RETURN private.command_fail('FORBIDDEN', 'Insufficient role for requisition'); END IF;

  SELECT COALESCE(SUM(prl.line_total), 0) INTO v_total
  FROM public.purchase_requisition_lines AS prl WHERE prl.requisition_id = p_requisition_id;

  UPDATE public.purchase_requisitions AS pr SET
    requisition_status = p_next_status,
    estimated_total = v_total,
    submitted_at = CASE WHEN p_next_status = 'submitted' THEN NOW() ELSE pr.submitted_at END,
    approved_at = CASE WHEN p_next_status = 'approved' THEN NOW() ELSE pr.approved_at END,
    approved_by = CASE WHEN p_next_status = 'approved' THEN v_actor ELSE pr.approved_by END,
    updated_at = NOW(),
    row_version = pr.row_version + 1
  WHERE pr.id = p_requisition_id
  RETURNING * INTO v_row;

  PERFORM private.write_audit_event(
    v_actor, 'update', 'purchase_requisition', p_requisition_id,
    v_row.legal_entity_id, NULL, NULL,
    p_correlation_id, p_idempotency_key,
    jsonb_build_object('status', p_expected_status),
    jsonb_build_object('status', p_next_status, 'estimated_total', v_total),
    NULL, NULL
  );

  v_result := private.command_ok(jsonb_build_object('entity_id', p_requisition_id, 'requisition_status', p_next_status));
  PERFORM private.command_store_idempotency(v_cmd, p_idempotency_key, v_actor, v_result);
  RETURN v_result;
END
$function$;

CREATE OR REPLACE FUNCTION private.requisition_create_draft(
  p_legal_entity_id UUID, p_requisition_number TEXT, p_title_en TEXT, p_title_ar TEXT,
  p_control_scope_id UUID, p_cost_node_id UUID, p_fiscal_period_id UUID,
  p_idempotency_key TEXT DEFAULT NULL, p_correlation_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor UUID := (SELECT auth.uid());
  v_cmd TEXT := 'requisition_create_draft';
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
    ARRAY['system_administrator','legal_entity_administrator','finance_user','cost_controller','budget_owner'],
    p_legal_entity_id, 'legal_entity', p_legal_entity_id) THEN
    RETURN private.command_fail('FORBIDDEN', 'Insufficient role to create requisition');
  END IF;
  IF p_fiscal_period_id IS NOT NULL THEN
    PERFORM private.assert_period_open('procurement', p_legal_entity_id, p_fiscal_period_id);
  END IF;

  INSERT INTO public.purchase_requisitions (
    legal_entity_id, requisition_number, title_en, title_ar, requester_id,
    control_scope_id, cost_node_id, fiscal_period_id, requisition_status
  ) VALUES (
    p_legal_entity_id, p_requisition_number, p_title_en, p_title_ar, v_actor,
    p_control_scope_id, p_cost_node_id, p_fiscal_period_id, 'draft'
  ) RETURNING id INTO v_id;

  PERFORM private.write_audit_event(
    v_actor, 'create', 'purchase_requisition', v_id,
    p_legal_entity_id, NULL, NULL,
    p_correlation_id, p_idempotency_key,
    NULL, jsonb_build_object('requisition_number', p_requisition_number),
    NULL, NULL
  );

  v_result := private.command_ok(jsonb_build_object('entity_id', v_id));
  PERFORM private.command_store_idempotency(v_cmd, p_idempotency_key, v_actor, v_result);
  RETURN v_result;
END
$function$;

CREATE OR REPLACE FUNCTION public.rpc_requisition_create_draft(
  p_legal_entity_id UUID, p_requisition_number TEXT, p_title_en TEXT, p_title_ar TEXT,
  p_control_scope_id UUID DEFAULT NULL, p_cost_node_id UUID DEFAULT NULL, p_fiscal_period_id UUID DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL, p_correlation_id UUID DEFAULT NULL
) RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.requisition_create_draft(p_legal_entity_id, p_requisition_number, p_title_en, p_title_ar,
    p_control_scope_id, p_cost_node_id, p_fiscal_period_id, p_idempotency_key, p_correlation_id);
$$;

CREATE OR REPLACE FUNCTION public.rpc_requisition_submit(
  p_requisition_id UUID, p_expected_status public.requisition_status DEFAULT 'draft',
  p_idempotency_key TEXT DEFAULT NULL, p_correlation_id UUID DEFAULT NULL
) RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.requisition_transition(p_requisition_id, p_expected_status, 'submitted', p_idempotency_key, p_correlation_id);
$$;

CREATE OR REPLACE FUNCTION public.rpc_requisition_department_approve(
  p_requisition_id UUID, p_expected_status public.requisition_status DEFAULT 'submitted',
  p_idempotency_key TEXT DEFAULT NULL, p_correlation_id UUID DEFAULT NULL
) RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.requisition_transition(p_requisition_id, p_expected_status, 'department_approved', p_idempotency_key, p_correlation_id);
$$;

CREATE OR REPLACE FUNCTION public.rpc_requisition_budget_check(
  p_requisition_id UUID, p_expected_status public.requisition_status DEFAULT 'department_approved',
  p_idempotency_key TEXT DEFAULT NULL, p_correlation_id UUID DEFAULT NULL
) RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.requisition_transition(p_requisition_id, p_expected_status, 'budget_checked', p_idempotency_key, p_correlation_id);
$$;

CREATE OR REPLACE FUNCTION public.rpc_requisition_approve(
  p_requisition_id UUID, p_expected_status public.requisition_status DEFAULT 'procurement_review',
  p_idempotency_key TEXT DEFAULT NULL, p_correlation_id UUID DEFAULT NULL
) RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.requisition_transition(p_requisition_id, p_expected_status, 'approved', p_idempotency_key, p_correlation_id);
$$;

REVOKE ALL ON FUNCTION public.rpc_requisition_create_draft(UUID, TEXT, TEXT, TEXT, UUID, UUID, UUID, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_requisition_submit(UUID, public.requisition_status, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_requisition_department_approve(UUID, public.requisition_status, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_requisition_budget_check(UUID, public.requisition_status, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_requisition_approve(UUID, public.requisition_status, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_requisition_create_draft(UUID, TEXT, TEXT, TEXT, UUID, UUID, UUID, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_requisition_submit(UUID, public.requisition_status, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_requisition_approve(UUID, public.requisition_status, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_requisition_department_approve(UUID, public.requisition_status, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_requisition_budget_check(UUID, public.requisition_status, TEXT, UUID) TO authenticated;
REVOKE ALL ON FUNCTION private.requisition_transition(UUID, public.requisition_status, public.requisition_status, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.requisition_create_draft(UUID, TEXT, TEXT, TEXT, UUID, UUID, UUID, TEXT, UUID) FROM PUBLIC;
