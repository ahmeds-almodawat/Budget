-- Defensive closure: route lifecycle mutations through validated RPCs, fail closed
-- for checklist-controlled period close, and complete schema-supported contract
-- and appraisal transitions. Earlier Ultra migrations are intentionally unchanged.

-- ---------------------------------------------------------------------------
-- Direct Data API mutation is not a lifecycle command boundary.
-- Preserve SELECT and RLS while removing ordinary authenticated DML.
-- ---------------------------------------------------------------------------
REVOKE INSERT, UPDATE, DELETE ON TABLE
  public.governed_master_records,
  public.approval_delegations,
  public.purchase_requisitions,
  public.purchase_requisition_lines,
  public.procurement_policies,
  public.rfqs,
  public.rfq_lines,
  public.rfq_suppliers,
  public.supplier_quotations,
  public.supplier_quotation_lines,
  public.evaluation_criteria,
  public.sourcing_evaluations,
  public.sourcing_evaluation_scores,
  public.sourcing_awards,
  public.sourcing_award_lines,
  public.purchase_orders,
  public.purchase_order_lines,
  public.procurement_contracts,
  public.procurement_contract_lines,
  public.goods_receipts,
  public.goods_receipt_lines,
  public.service_entries,
  public.service_entry_lines,
  public.supplier_invoices,
  public.supplier_invoice_lines,
  public.invoice_match_results,
  public.invoice_match_exceptions,
  public.payment_requests,
  public.fiscal_period_module_controls,
  public.period_close_checklist_templates,
  public.period_close_checklist_items,
  public.period_close_instances,
  public.period_close_item_results,
  public.period_reopen_requests,
  public.appraisal_cycles,
  public.appraisal_templates,
  public.appraisal_template_criteria,
  public.appraisal_assignments,
  public.appraisal_ratings,
  public.appraisal_goals,
  public.appraisal_acknowledgements
FROM authenticated;

-- ---------------------------------------------------------------------------
-- Delegated decisions: the previous generic endpoint wrote decision evidence
-- without an underlying workflow transition. Until a real assignee engine maps
-- every item type to its atomic command, fail closed and create no audit row.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_approval_act_as_delegate(
  p_item_type public.approval_item_type,
  p_entity_id UUID,
  p_decision TEXT,
  p_original_assignee_id UUID,
  p_delegation_id UUID,
  p_comments TEXT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL,
  p_correlation_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT private.current_user_is_active() THEN
    RETURN private.command_fail('UNAUTHENTICATED', 'Authentication required');
  END IF;

  RETURN private.command_fail(
    'DELEGATED_DECISION_UNAVAILABLE',
    'Delegated decisions are disabled until the underlying workflow transition is atomically integrated'
  );
END
$function$;

CREATE OR REPLACE FUNCTION public.rpc_appraisal_self_submit(
  p_assignment_id UUID,
  p_ratings JSONB DEFAULT '[]'::jsonb,
  p_expected_status public.appraisal_assignment_status DEFAULT 'employee_self_review',
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
  v_cmd TEXT := 'appraisal_self_submit';
  v_replay JSONB;
  v_row public.appraisal_assignments%ROWTYPE;
  v_crit RECORD;
  v_item JSONB;
  v_rating NUMERIC;
  v_criteria_count INTEGER;
  v_result JSONB;
BEGIN
  v_replay := private.command_check_idempotency(v_cmd, p_idempotency_key, v_actor);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF v_actor IS NULL OR NOT private.current_user_is_active() THEN
    RETURN private.command_fail('UNAUTHENTICATED', 'Authentication required');
  END IF;

  SELECT * INTO v_row
  FROM public.appraisal_assignments AS aa
  WHERE aa.id = p_assignment_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN private.command_fail('NOT_FOUND', 'Assignment not found'); END IF;
  IF v_row.assignment_status IS DISTINCT FROM p_expected_status THEN
    RETURN private.command_fail('STATE_MISMATCH', 'Unexpected assignment status');
  END IF;
  IF v_row.employee_id <> v_actor THEN
    RETURN private.command_fail('FORBIDDEN', 'Only the assigned employee can self-submit');
  END IF;
  IF jsonb_typeof(COALESCE(p_ratings, '[]'::jsonb)) <> 'array' THEN
    RETURN private.command_fail('VALIDATION', 'Ratings must be an array');
  END IF;

  SELECT COUNT(*)::INTEGER INTO v_criteria_count
  FROM public.appraisal_template_criteria AS atc
  WHERE atc.template_id = v_row.template_id;
  IF jsonb_array_length(COALESCE(p_ratings, '[]'::jsonb)) <> v_criteria_count THEN
    RETURN private.command_fail('VALIDATION', 'A self rating is required for every criterion');
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_ratings) AS item
    GROUP BY item->>'criterion_id'
    HAVING COUNT(*) > 1
  ) THEN
    RETURN private.command_fail('VALIDATION', 'Duplicate appraisal criterion');
  END IF;

  FOR v_crit IN
    SELECT atc.id, atc.max_scale
    FROM public.appraisal_template_criteria AS atc
    WHERE atc.template_id = v_row.template_id
  LOOP
    SELECT item INTO v_item
    FROM jsonb_array_elements(p_ratings) AS item
    WHERE item->>'criterion_id' = v_crit.id::TEXT;
    IF v_item IS NULL OR NULLIF(v_item->>'self_rating', '') IS NULL THEN
      RETURN private.command_fail('VALIDATION', 'A self rating is required for every criterion');
    END IF;
    BEGIN
      v_rating := (v_item->>'self_rating')::NUMERIC;
    EXCEPTION WHEN invalid_text_representation THEN
      RETURN private.command_fail('VALIDATION', 'Self rating must be numeric');
    END;
    IF v_rating < 0 OR v_rating > v_crit.max_scale THEN
      RETURN private.command_fail('VALIDATION', 'Self rating is outside the criterion scale');
    END IF;

    UPDATE public.appraisal_ratings SET
      self_rating = v_rating,
      self_comment = NULLIF(v_item->>'self_comment', '')
    WHERE assignment_id = p_assignment_id AND criterion_id = v_crit.id;
  END LOOP;

  UPDATE public.appraisal_assignments SET
    assignment_status = 'self_submitted',
    updated_at = NOW(),
    row_version = row_version + 1
  WHERE id = p_assignment_id;

  PERFORM private.notify_user(
    v_row.manager_id, 'Employee self-assessment submitted', 'تم تقديم التقييم الذاتي',
    'appraisal_assignment', p_assignment_id
  );
  PERFORM private.write_audit_event(
    v_actor, 'update', 'appraisal_assignment', p_assignment_id,
    v_row.legal_entity_id, NULL, NULL, p_correlation_id, p_idempotency_key,
    jsonb_build_object('status', v_row.assignment_status),
    jsonb_build_object('status', 'self_submitted', 'ratings_submitted', v_criteria_count),
    NULL, NULL
  );

  v_result := private.command_ok(jsonb_build_object(
    'entity_id', p_assignment_id, 'assignment_status', 'self_submitted'
  ));
  PERFORM private.command_store_idempotency(v_cmd, p_idempotency_key, v_actor, v_result);
  RETURN v_result;
END
$function$;

CREATE OR REPLACE FUNCTION public.rpc_appraisal_manager_submit(
  p_assignment_id UUID,
  p_ratings JSONB DEFAULT '[]'::jsonb,
  p_expected_status public.appraisal_assignment_status DEFAULT 'self_submitted',
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
  v_cmd TEXT := 'appraisal_manager_submit';
  v_replay JSONB;
  v_row public.appraisal_assignments%ROWTYPE;
  v_crit RECORD;
  v_item JSONB;
  v_rating NUMERIC;
  v_criteria_count INTEGER;
  v_next public.appraisal_assignment_status;
  v_result JSONB;
BEGIN
  v_replay := private.command_check_idempotency(v_cmd, p_idempotency_key, v_actor);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF v_actor IS NULL OR NOT private.current_user_is_active() THEN
    RETURN private.command_fail('UNAUTHENTICATED', 'Authentication required');
  END IF;

  SELECT * INTO v_row
  FROM public.appraisal_assignments AS aa
  WHERE aa.id = p_assignment_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN private.command_fail('NOT_FOUND', 'Assignment not found'); END IF;
  IF v_row.assignment_status IS DISTINCT FROM p_expected_status THEN
    RETURN private.command_fail('STATE_MISMATCH', 'Unexpected assignment status');
  END IF;
  IF v_row.manager_id <> v_actor THEN
    RETURN private.command_fail('FORBIDDEN', 'Only the assigned manager can submit');
  END IF;
  IF v_row.employee_id = v_actor THEN
    RETURN private.command_fail('SOD_VIOLATION', 'Cannot manage own appraisal');
  END IF;
  IF jsonb_typeof(COALESCE(p_ratings, '[]'::jsonb)) <> 'array' THEN
    RETURN private.command_fail('VALIDATION', 'Ratings must be an array');
  END IF;

  SELECT COUNT(*)::INTEGER INTO v_criteria_count
  FROM public.appraisal_template_criteria AS atc
  WHERE atc.template_id = v_row.template_id;
  IF jsonb_array_length(COALESCE(p_ratings, '[]'::jsonb)) <> v_criteria_count THEN
    RETURN private.command_fail('VALIDATION', 'A manager rating is required for every criterion');
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_ratings) AS item
    GROUP BY item->>'criterion_id' HAVING COUNT(*) > 1
  ) THEN
    RETURN private.command_fail('VALIDATION', 'Duplicate appraisal criterion');
  END IF;

  FOR v_crit IN
    SELECT atc.id, atc.max_scale
    FROM public.appraisal_template_criteria AS atc
    WHERE atc.template_id = v_row.template_id
  LOOP
    SELECT item INTO v_item
    FROM jsonb_array_elements(p_ratings) AS item
    WHERE item->>'criterion_id' = v_crit.id::TEXT;
    IF v_item IS NULL OR NULLIF(v_item->>'manager_rating', '') IS NULL THEN
      RETURN private.command_fail('VALIDATION', 'A manager rating is required for every criterion');
    END IF;
    BEGIN
      v_rating := (v_item->>'manager_rating')::NUMERIC;
    EXCEPTION WHEN invalid_text_representation THEN
      RETURN private.command_fail('VALIDATION', 'Manager rating must be numeric');
    END;
    IF v_rating < 0 OR v_rating > v_crit.max_scale THEN
      RETURN private.command_fail('VALIDATION', 'Manager rating is outside the criterion scale');
    END IF;

    UPDATE public.appraisal_ratings SET
      manager_rating = v_rating,
      manager_comment = NULLIF(v_item->>'manager_comment', '')
    WHERE assignment_id = p_assignment_id AND criterion_id = v_crit.id;
  END LOOP;

  v_next := CASE
    WHEN v_row.reviewer_id IS NULL THEN 'manager_submitted'::public.appraisal_assignment_status
    ELSE 'reviewer_review'::public.appraisal_assignment_status
  END;
  UPDATE public.appraisal_assignments SET
    assignment_status = v_next,
    updated_at = NOW(),
    row_version = row_version + 1
  WHERE id = p_assignment_id;

  IF v_row.reviewer_id IS NOT NULL THEN
    PERFORM private.notify_user(
      v_row.reviewer_id, 'Appraisal ready for calibration', 'التقييم جاهز للمعايرة',
      'appraisal_assignment', p_assignment_id
    );
  END IF;
  PERFORM private.write_audit_event(
    v_actor, 'update', 'appraisal_assignment', p_assignment_id,
    v_row.legal_entity_id, NULL, NULL, p_correlation_id, p_idempotency_key,
    jsonb_build_object('status', v_row.assignment_status),
    jsonb_build_object('status', v_next, 'ratings_submitted', v_criteria_count),
    NULL, NULL
  );

  v_result := private.command_ok(jsonb_build_object(
    'entity_id', p_assignment_id, 'assignment_status', v_next
  ));
  PERFORM private.command_store_idempotency(v_cmd, p_idempotency_key, v_actor, v_result);
  RETURN v_result;
END
$function$;

CREATE OR REPLACE FUNCTION public.rpc_appraisal_reviewer_submit(
  p_assignment_id UUID,
  p_ratings JSONB DEFAULT '[]'::jsonb,
  p_expected_status public.appraisal_assignment_status DEFAULT 'reviewer_review',
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
  v_cmd TEXT := 'appraisal_reviewer_submit';
  v_replay JSONB;
  v_row public.appraisal_assignments%ROWTYPE;
  v_crit RECORD;
  v_item JSONB;
  v_rating NUMERIC;
  v_criteria_count INTEGER;
  v_result JSONB;
BEGIN
  v_replay := private.command_check_idempotency(v_cmd, p_idempotency_key, v_actor);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF v_actor IS NULL OR NOT private.current_user_is_active() THEN
    RETURN private.command_fail('UNAUTHENTICATED', 'Authentication required');
  END IF;
  SELECT * INTO v_row FROM public.appraisal_assignments AS aa
  WHERE aa.id = p_assignment_id FOR UPDATE;
  IF NOT FOUND THEN RETURN private.command_fail('NOT_FOUND', 'Assignment not found'); END IF;
  IF v_row.assignment_status IS DISTINCT FROM p_expected_status THEN
    RETURN private.command_fail('STATE_MISMATCH', 'Unexpected assignment status');
  END IF;
  IF v_row.reviewer_id IS NULL OR v_row.reviewer_id <> v_actor THEN
    RETURN private.command_fail('FORBIDDEN', 'Only the assigned reviewer can calibrate');
  END IF;
  IF v_actor IN (v_row.employee_id, v_row.manager_id) THEN
    RETURN private.command_fail('SOD_VIOLATION', 'Reviewer must be independent');
  END IF;

  SELECT COUNT(*)::INTEGER INTO v_criteria_count
  FROM public.appraisal_template_criteria AS atc
  WHERE atc.template_id = v_row.template_id;
  IF jsonb_typeof(COALESCE(p_ratings, '[]'::jsonb)) <> 'array'
     OR jsonb_array_length(COALESCE(p_ratings, '[]'::jsonb)) <> v_criteria_count THEN
    RETURN private.command_fail('VALIDATION', 'A calibrated rating is required for every criterion');
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_ratings) AS item
    GROUP BY item->>'criterion_id' HAVING COUNT(*) > 1
  ) THEN
    RETURN private.command_fail('VALIDATION', 'Duplicate appraisal criterion');
  END IF;

  FOR v_crit IN
    SELECT atc.id, atc.max_scale
    FROM public.appraisal_template_criteria AS atc
    WHERE atc.template_id = v_row.template_id
  LOOP
    SELECT item INTO v_item FROM jsonb_array_elements(p_ratings) AS item
    WHERE item->>'criterion_id' = v_crit.id::TEXT;
    IF v_item IS NULL OR NULLIF(v_item->>'calibrated_rating', '') IS NULL THEN
      RETURN private.command_fail('VALIDATION', 'A calibrated rating is required for every criterion');
    END IF;
    BEGIN
      v_rating := (v_item->>'calibrated_rating')::NUMERIC;
    EXCEPTION WHEN invalid_text_representation THEN
      RETURN private.command_fail('VALIDATION', 'Calibrated rating must be numeric');
    END;
    IF v_rating < 0 OR v_rating > v_crit.max_scale THEN
      RETURN private.command_fail('VALIDATION', 'Calibrated rating is outside the criterion scale');
    END IF;
    UPDATE public.appraisal_ratings SET calibrated_rating = v_rating
    WHERE assignment_id = p_assignment_id AND criterion_id = v_crit.id;
  END LOOP;

  UPDATE public.appraisal_assignments SET
    assignment_status = 'manager_submitted',
    updated_at = NOW(),
    row_version = row_version + 1
  WHERE id = p_assignment_id;

  PERFORM private.write_audit_event(
    v_actor, 'update', 'appraisal_assignment', p_assignment_id,
    v_row.legal_entity_id, NULL, NULL, p_correlation_id, p_idempotency_key,
    jsonb_build_object('status', v_row.assignment_status),
    jsonb_build_object('status', 'manager_submitted', 'calibrated_ratings_submitted', v_criteria_count),
    NULL, NULL
  );

  v_result := private.command_ok(jsonb_build_object(
    'entity_id', p_assignment_id, 'assignment_status', 'manager_submitted'
  ));
  PERFORM private.command_store_idempotency(v_cmd, p_idempotency_key, v_actor, v_result);
  RETURN v_result;
END
$function$;

CREATE OR REPLACE FUNCTION public.rpc_appraisal_finalize(
  p_assignment_id UUID,
  p_expected_status public.appraisal_assignment_status DEFAULT 'manager_submitted',
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
  v_cmd TEXT := 'appraisal_finalize';
  v_replay JSONB;
  v_row public.appraisal_assignments%ROWTYPE;
  v_score NUMERIC(18,4);
  v_missing INTEGER;
  v_result JSONB;
BEGIN
  v_replay := private.command_check_idempotency(v_cmd, p_idempotency_key, v_actor);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF v_actor IS NULL OR NOT private.current_user_is_active() THEN
    RETURN private.command_fail('UNAUTHENTICATED', 'Authentication required');
  END IF;
  SELECT * INTO v_row FROM public.appraisal_assignments AS aa
  WHERE aa.id = p_assignment_id FOR UPDATE;
  IF NOT FOUND THEN RETURN private.command_fail('NOT_FOUND', 'Assignment not found'); END IF;
  IF v_row.assignment_status IS DISTINCT FROM p_expected_status THEN
    RETURN private.command_fail('STATE_MISMATCH', 'Unexpected assignment status');
  END IF;
  IF v_actor IN (v_row.employee_id, v_row.manager_id, v_row.reviewer_id) THEN
    RETURN private.command_fail('SOD_VIOLATION', 'An appraisal participant cannot finalize it');
  END IF;
  IF NOT private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator'],
    v_row.legal_entity_id, 'legal_entity', v_row.legal_entity_id
  ) THEN
    RETURN private.command_fail('FORBIDDEN', 'Appraisal administrator role required to finalize');
  END IF;

  SELECT COUNT(*)::INTEGER INTO v_missing
  FROM public.appraisal_ratings AS ar
  JOIN public.appraisal_template_criteria AS atc ON atc.id = ar.criterion_id
  WHERE ar.assignment_id = p_assignment_id
    AND atc.template_id = v_row.template_id
    AND (
      ar.manager_rating IS NULL
      OR (v_row.reviewer_id IS NOT NULL AND ar.calibrated_rating IS NULL)
    );
  IF v_missing > 0 THEN
    RETURN private.command_fail('VALIDATION', 'All required manager and calibration ratings must be complete');
  END IF;

  BEGIN
    v_score := private.appraisal_compute_score(p_assignment_id);
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    RETURN private.command_fail('VALIDATION', SQLERRM);
  END;

  UPDATE public.appraisal_assignments SET
    assignment_status = 'finalized',
    final_score = v_score,
    finalized_at = NOW(),
    finalized_by = v_actor,
    updated_at = NOW(),
    row_version = row_version + 1
  WHERE id = p_assignment_id;

  PERFORM private.notify_user(
    v_row.employee_id, 'Appraisal finalized', 'تم اعتماد التقييم',
    'appraisal_assignment', p_assignment_id
  );
  PERFORM private.write_audit_event(
    v_actor, 'update', 'appraisal_assignment', p_assignment_id,
    v_row.legal_entity_id, NULL, NULL, p_correlation_id, p_idempotency_key,
    jsonb_build_object('status', v_row.assignment_status),
    jsonb_build_object('status', 'finalized', 'final_score', v_score),
    NULL, NULL
  );

  v_result := private.command_ok(jsonb_build_object(
    'entity_id', p_assignment_id, 'assignment_status', 'finalized', 'final_score', v_score
  ));
  PERFORM private.command_store_idempotency(v_cmd, p_idempotency_key, v_actor, v_result);
  RETURN v_result;
END
$function$;

DO $grants$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'rpc_appraisal_cycle_create','rpc_appraisal_cycle_activate',
        'rpc_appraisal_assignment_create','rpc_appraisal_self_submit',
        'rpc_appraisal_manager_submit','rpc_appraisal_reviewer_submit',
        'rpc_appraisal_finalize','rpc_appraisal_acknowledge',
        'rpc_appraisal_peer_identities'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END
$grants$;

COMMENT ON FUNCTION public.rpc_approval_act_as_delegate(
  public.approval_item_type, UUID, TEXT, UUID, UUID, TEXT, TEXT, UUID
) IS '@classification defensive fail-closed endpoint; no workflow decision is recorded';

REVOKE ALL ON FUNCTION public.rpc_approval_act_as_delegate(
  public.approval_item_type, UUID, TEXT, UUID, UUID, TEXT, TEXT, UUID
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_approval_act_as_delegate(
  public.approval_item_type, UUID, TEXT, UUID, UUID, TEXT, TEXT, UUID
) TO authenticated;

-- The current inbox model does not store an actual workflow assignee. Requester
-- identity is not an approval assignment, so delegated routing must remain empty
-- until each underlying workflow exposes an atomic assignee-aware decision.
CREATE OR REPLACE VIEW public.v_delegated_approval_inbox
WITH (security_invoker = true) AS
SELECT vai.*
FROM public.v_approval_inbox AS vai
WHERE false;

COMMENT ON VIEW public.v_delegated_approval_inbox IS
  '@classification data_api_exposed; defensive empty inbox until atomic assignee-aware delegation is implemented';
GRANT SELECT ON public.v_delegated_approval_inbox TO authenticated;

-- The security-invoker inbox requires this helper, so retain authenticated
-- execute but refuse cross-tenant direct lookups inside the helper itself.
CREATE OR REPLACE FUNCTION private.resolve_effective_approver(
  p_original_assignee UUID,
  p_legal_entity UUID,
  p_workflow_type TEXT
)
RETURNS TABLE (
  effective_assignee_id UUID,
  delegation_id UUID
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_del public.approval_delegations%ROWTYPE;
BEGIN
  IF (SELECT auth.uid()) IS NULL
     OR NOT private.current_user_is_active()
     OR NOT private.user_can_access_legal_entity(p_legal_entity) THEN
    RAISE EXCEPTION 'Approval-assignee lookup is not authorized'
      USING ERRCODE = '42501';
  END IF;

  IF p_original_assignee IS NULL THEN
    effective_assignee_id := NULL;
    delegation_id := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT ad.* INTO v_del
  FROM public.approval_delegations AS ad
  WHERE ad.legal_entity_id = p_legal_entity
    AND ad.delegator_id = p_original_assignee
    AND ad.workflow_type = p_workflow_type
    AND ad.delegation_status = 'active'
    AND ad.effective_start <= NOW()
    AND ad.effective_end >= NOW()
    AND ad.revoked_at IS NULL
  ORDER BY ad.effective_start DESC
  LIMIT 1;

  IF FOUND THEN
    effective_assignee_id := v_del.delegate_id;
    delegation_id := v_del.id;
  ELSE
    effective_assignee_id := p_original_assignee;
    delegation_id := NULL;
  END IF;
  RETURN NEXT;
END
$function$;

REVOKE ALL ON FUNCTION private.resolve_effective_approver(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.resolve_effective_approver(UUID, UUID, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- Master-data hierarchy references must stay in the same tenant and type.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.enforce_governed_master_parent_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
  v_parent public.governed_master_records%ROWTYPE;
BEGIN
  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_parent
  FROM public.governed_master_records AS gmr
  WHERE gmr.id = NEW.parent_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parent master record not found' USING ERRCODE = '23503';
  END IF;
  IF v_parent.legal_entity_id IS DISTINCT FROM NEW.legal_entity_id THEN
    RAISE EXCEPTION 'Parent master record belongs to another legal entity' USING ERRCODE = '23514';
  END IF;
  IF v_parent.record_type IS DISTINCT FROM NEW.record_type THEN
    RAISE EXCEPTION 'Parent master record must use the same record type' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS trg_governed_master_parent_scope ON public.governed_master_records;
CREATE TRIGGER trg_governed_master_parent_scope
BEFORE INSERT OR UPDATE OF parent_id, legal_entity_id, record_type
ON public.governed_master_records
FOR EACH ROW EXECUTE FUNCTION private.enforce_governed_master_parent_scope();

REVOKE ALL ON FUNCTION private.enforce_governed_master_parent_scope() FROM PUBLIC, anon, authenticated;

-- Ultra workflow headers that carry both legal_entity_id and fiscal_period_id
-- must never combine a period from another tenant. RLS cannot enforce this
-- relational invariant inside SECURITY DEFINER commands.
CREATE OR REPLACE FUNCTION private.enforce_fiscal_period_entity_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.fiscal_period_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.fiscal_periods AS fp
    JOIN public.fiscal_years AS fy ON fy.id = fp.fiscal_year_id
    WHERE fp.id = NEW.fiscal_period_id
      AND fy.legal_entity_id = NEW.legal_entity_id
  ) THEN
    RAISE EXCEPTION 'Fiscal period belongs to another legal entity'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$function$;

DO $period_scope_triggers$
DECLARE
  v_table TEXT;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'purchase_requisitions','purchase_orders','goods_receipts','service_entries',
    'supplier_invoices','fiscal_period_module_controls','period_close_instances',
    'period_reopen_requests'
  ]
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_%1$s_period_entity_scope ON public.%1$I',
      v_table
    );
    EXECUTE format(
      'CREATE TRIGGER trg_%1$s_period_entity_scope BEFORE INSERT OR UPDATE OF legal_entity_id, fiscal_period_id ON public.%1$I FOR EACH ROW EXECUTE FUNCTION private.enforce_fiscal_period_entity_scope()',
      v_table
    );
  END LOOP;
END
$period_scope_triggers$;

REVOKE ALL ON FUNCTION private.enforce_fiscal_period_entity_scope()
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- One live PO per full award. The award row lock in the command serializes
-- concurrent attempts; this index remains the final database invariant.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_purchase_orders_live_award
  ON public.purchase_orders (award_id)
  WHERE award_id IS NOT NULL AND po_status <> 'cancelled';

CREATE OR REPLACE FUNCTION public.rpc_po_create_from_award(
  p_award_id UUID,
  p_fiscal_period_id UUID DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
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
  v_cmd TEXT := 'po_create_from_award';
  v_replay JSONB;
  v_entity UUID;
  v_vendor UUID;
  v_currency TEXT;
  v_award_status public.award_status;
  v_po_id UUID;
  v_po_number TEXT;
  v_total NUMERIC(18,4) := 0;
  v_line RECORD;
  v_ln SMALLINT := 0;
  v_result JSONB;
BEGIN
  v_replay := private.command_check_idempotency(v_cmd, p_idempotency_key, v_actor);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF v_actor IS NULL OR NOT private.current_user_is_active() THEN
    RETURN private.command_fail('UNAUTHENTICATED', 'Authentication required');
  END IF;

  SELECT sa.legal_entity_id, sa.vendor_id, COALESCE(sq.currency_code, 'SAR'), sa.award_status
    INTO v_entity, v_vendor, v_currency, v_award_status
  FROM public.sourcing_awards AS sa
  LEFT JOIN public.supplier_quotations AS sq ON sq.id = sa.quotation_id
  WHERE sa.id = p_award_id
  FOR UPDATE OF sa;

  IF v_entity IS NULL THEN RETURN private.command_fail('NOT_FOUND', 'Award not found'); END IF;
  IF v_award_status IS DISTINCT FROM 'approved' THEN
    RETURN private.command_fail('INVALID_STATE', 'Award must be approved before PO create');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.purchase_orders AS po
    WHERE po.award_id = p_award_id AND po.po_status <> 'cancelled'
  ) THEN
    RETURN private.command_fail('DUPLICATE', 'A live purchase order already exists for this award');
  END IF;
  IF NOT private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator','procurement_user','cost_controller'],
    v_entity, 'legal_entity', v_entity
  ) THEN
    RETURN private.command_fail('FORBIDDEN', 'Insufficient role to create PO');
  END IF;
  IF p_fiscal_period_id IS NOT NULL THEN
    PERFORM private.assert_period_open('procurement', v_entity, p_fiscal_period_id);
  END IF;

  v_po_number := private.next_po_number(v_entity);
  INSERT INTO public.purchase_orders (
    legal_entity_id, vendor_id, po_number, po_status, currency_code, total_amount,
    award_id, description, fiscal_period_id, created_by
  ) VALUES (
    v_entity, v_vendor, v_po_number, 'draft', v_currency, 0,
    p_award_id, p_description, p_fiscal_period_id, v_actor
  ) RETURNING id INTO v_po_id;

  FOR v_line IN
    SELECT sal.id AS award_line_id,
           COALESCE(prl.description, 'Award line') AS description,
           sal.awarded_quantity AS quantity,
           sal.unit_price_ex_vat,
           prl.cost_node_id,
           prl.uom,
           prl.organization_unit_id
    FROM public.sourcing_award_lines AS sal
    JOIN public.purchase_requisition_lines AS prl ON prl.id = sal.requisition_line_id
    WHERE sal.award_id = p_award_id
    ORDER BY sal.rfq_line_id, sal.id
  LOOP
    v_ln := v_ln + 1;
    INSERT INTO public.purchase_order_lines (
      purchase_order_id, line_number, award_line_id, description,
      quantity, uom, unit_price_ex_vat, cost_node_id, organization_unit_id
    ) VALUES (
      v_po_id, v_ln, v_line.award_line_id, v_line.description,
      v_line.quantity, v_line.uom, v_line.unit_price_ex_vat,
      v_line.cost_node_id, v_line.organization_unit_id
    );
    v_total := v_total + (v_line.quantity * v_line.unit_price_ex_vat);
  END LOOP;

  IF v_ln = 0 THEN RETURN private.command_fail('VALIDATION', 'Award has no lines'); END IF;
  UPDATE public.purchase_orders SET total_amount = v_total, updated_at = NOW() WHERE id = v_po_id;

  PERFORM private.write_audit_event(
    v_actor, 'create', 'purchase_order', v_po_id,
    v_entity, NULL, NULL, p_correlation_id, p_idempotency_key,
    NULL, jsonb_build_object('po_number', v_po_number, 'award_id', p_award_id, 'total_amount', v_total),
    NULL, NULL
  );

  v_result := private.command_ok(jsonb_build_object(
    'entity_id', v_po_id, 'po_number', v_po_number, 'total_amount', v_total
  ));
  PERFORM private.command_store_idempotency(v_cmd, p_idempotency_key, v_actor, v_result);
  RETURN v_result;
END
$function$;

REVOKE ALL ON FUNCTION public.rpc_po_create_from_award(UUID, UUID, TEXT, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_po_create_from_award(UUID, UUID, TEXT, TEXT, UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- Contract creation and the complete status path supported by contract_status.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_contract_create(
  p_legal_entity_id UUID,
  p_vendor_id UUID,
  p_contract_number TEXT,
  p_title_en TEXT,
  p_title_ar TEXT,
  p_start_date DATE,
  p_end_date DATE,
  p_ceiling_value NUMERIC(18,4) DEFAULT 0,
  p_award_id UUID DEFAULT NULL,
  p_currency_code TEXT DEFAULT 'SAR',
  p_control_scope_id UUID DEFAULT NULL,
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
  v_cmd TEXT := 'contract_create';
  v_replay JSONB;
  v_id UUID;
  v_result JSONB;
  v_award public.sourcing_awards%ROWTYPE;
BEGIN
  v_replay := private.command_check_idempotency(v_cmd, p_idempotency_key, v_actor);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF v_actor IS NULL OR NOT private.current_user_is_active() THEN
    RETURN private.command_fail('UNAUTHENTICATED', 'Authentication required');
  END IF;
  IF NOT private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator','procurement_user','cost_controller'],
    p_legal_entity_id, 'legal_entity', p_legal_entity_id
  ) THEN
    RETURN private.command_fail('FORBIDDEN', 'Insufficient role to create contract');
  END IF;
  IF p_end_date < p_start_date THEN
    RETURN private.command_fail('VALIDATION', 'Contract end date before start date');
  END IF;
  IF COALESCE(p_ceiling_value, 0) < 0 THEN
    RETURN private.command_fail('VALIDATION', 'Contract ceiling cannot be negative');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.vendors AS v
    WHERE v.id = p_vendor_id
      AND v.legal_entity_id = p_legal_entity_id
      AND v.status = 'active'
  ) THEN
    RETURN private.command_fail('VALIDATION', 'Vendor is not active in the contract legal entity');
  END IF;
  IF p_control_scope_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.control_scopes AS cs
    WHERE cs.id = p_control_scope_id AND cs.legal_entity_id = p_legal_entity_id
  ) THEN
    RETURN private.command_fail('VALIDATION', 'Control scope belongs to another legal entity');
  END IF;
  IF p_award_id IS NOT NULL THEN
    SELECT * INTO v_award FROM public.sourcing_awards AS sa WHERE sa.id = p_award_id;
    IF NOT FOUND
       OR v_award.legal_entity_id IS DISTINCT FROM p_legal_entity_id
       OR v_award.vendor_id IS DISTINCT FROM p_vendor_id
       OR v_award.award_status IS DISTINCT FROM 'approved' THEN
      RETURN private.command_fail('VALIDATION', 'Award is not an approved award for this entity and vendor');
    END IF;
  END IF;

  INSERT INTO public.procurement_contracts (
    legal_entity_id, vendor_id, award_id, contract_number, title_en, title_ar,
    start_date, end_date, currency_code, ceiling_value, control_scope_id,
    owner_id, created_by, contract_status
  ) VALUES (
    p_legal_entity_id, p_vendor_id, p_award_id, btrim(p_contract_number),
    btrim(p_title_en), btrim(p_title_ar), p_start_date, p_end_date,
    COALESCE(NULLIF(btrim(p_currency_code), ''), 'SAR'), COALESCE(p_ceiling_value, 0),
    p_control_scope_id, v_actor, v_actor, 'draft'
  ) RETURNING id INTO v_id;

  PERFORM private.write_audit_event(
    v_actor, 'create', 'procurement_contract', v_id,
    p_legal_entity_id, p_control_scope_id, NULL, p_correlation_id, p_idempotency_key,
    NULL, jsonb_build_object('contract_number', p_contract_number, 'vendor_id', p_vendor_id),
    NULL, NULL
  );

  v_result := private.command_ok(jsonb_build_object('entity_id', v_id, 'contract_status', 'draft'));
  PERFORM private.command_store_idempotency(v_cmd, p_idempotency_key, v_actor, v_result);
  RETURN v_result;
END
$function$;

CREATE OR REPLACE FUNCTION public.rpc_contract_submit(
  p_contract_id UUID,
  p_expected_status public.contract_status DEFAULT 'draft',
  p_idempotency_key TEXT DEFAULT NULL,
  p_correlation_id UUID DEFAULT NULL
) RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $function$
  SELECT private.contract_transition(
    p_contract_id, p_expected_status, 'submitted', p_idempotency_key, p_correlation_id
  );
$function$;

CREATE OR REPLACE FUNCTION public.rpc_contract_reject(
  p_contract_id UUID,
  p_expected_status public.contract_status DEFAULT 'submitted',
  p_idempotency_key TEXT DEFAULT NULL,
  p_correlation_id UUID DEFAULT NULL
) RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $function$
  SELECT private.contract_transition(
    p_contract_id, p_expected_status, 'rejected', p_idempotency_key, p_correlation_id
  );
$function$;

CREATE OR REPLACE FUNCTION public.rpc_contract_close(
  p_contract_id UUID,
  p_expected_status public.contract_status DEFAULT 'active',
  p_idempotency_key TEXT DEFAULT NULL,
  p_correlation_id UUID DEFAULT NULL
) RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $function$
  SELECT private.contract_transition(
    p_contract_id, p_expected_status, 'closed', p_idempotency_key, p_correlation_id
  );
$function$;

CREATE OR REPLACE FUNCTION public.rpc_contract_terminate(
  p_contract_id UUID,
  p_expected_status public.contract_status DEFAULT 'active',
  p_idempotency_key TEXT DEFAULT NULL,
  p_correlation_id UUID DEFAULT NULL
) RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $function$
  SELECT private.contract_transition(
    p_contract_id, p_expected_status, 'terminated', p_idempotency_key, p_correlation_id
  );
$function$;

CREATE OR REPLACE FUNCTION public.rpc_contract_expire(
  p_contract_id UUID,
  p_expected_status public.contract_status DEFAULT 'active',
  p_idempotency_key TEXT DEFAULT NULL,
  p_correlation_id UUID DEFAULT NULL
) RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $function$
  SELECT private.contract_transition(
    p_contract_id, p_expected_status, 'expired', p_idempotency_key, p_correlation_id
  );
$function$;

DO $grants$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'rpc_contract_create','rpc_contract_submit','rpc_contract_approve','rpc_contract_activate',
        'rpc_contract_reject','rpc_contract_close','rpc_contract_terminate','rpc_contract_expire'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END
$grants$;

-- ---------------------------------------------------------------------------
-- Appraisal identity: remove whole-row peer profile visibility and expose only
-- the names needed by an authorized appraisal relationship or administrator.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS profiles_select_appraisal_peers ON public.profiles;

CREATE OR REPLACE FUNCTION public.rpc_appraisal_peer_identities(p_legal_entity_id UUID)
RETURNS TABLE (
  id UUID,
  full_name_en TEXT,
  full_name_ar TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT DISTINCT p.id, p.full_name_en, p.full_name_ar
  FROM public.profiles AS p
  WHERE (SELECT auth.uid()) IS NOT NULL
    AND private.current_user_is_active()
    AND private.user_can_access_legal_entity(p_legal_entity_id)
    AND p.status = 'active'
    AND (
      (
        private.user_has_any_role(
          ARRAY['system_administrator','legal_entity_administrator'],
          p_legal_entity_id, 'legal_entity', p_legal_entity_id
        )
        AND EXISTS (
          SELECT 1 FROM public.memberships AS m
          WHERE m.user_id = p.id
            AND m.legal_entity_id = p_legal_entity_id
            AND m.status = 'active'
        )
      )
      OR EXISTS (
        SELECT 1
        FROM public.appraisal_assignments AS aa
        WHERE aa.legal_entity_id = p_legal_entity_id
          AND (SELECT auth.uid()) IN (aa.employee_id, aa.manager_id, aa.reviewer_id)
          AND p.id IN (aa.employee_id, aa.manager_id, aa.reviewer_id)
      )
    )
  ORDER BY p.full_name_en NULLS LAST, p.id;
$function$;

REVOKE ALL ON FUNCTION public.rpc_appraisal_peer_identities(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_appraisal_peer_identities(UUID) TO authenticated;

-- Cycle creation is now a controlled command so created_by cannot be supplied
-- by a client and cycle state cannot be set through direct table mutation.
CREATE OR REPLACE FUNCTION public.rpc_appraisal_cycle_create(
  p_legal_entity_id UUID,
  p_name_en TEXT,
  p_name_ar TEXT,
  p_period_start DATE,
  p_period_end DATE,
  p_self_assessment_deadline DATE DEFAULT NULL,
  p_manager_deadline DATE DEFAULT NULL,
  p_review_deadline DATE DEFAULT NULL,
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
  v_cmd TEXT := 'appraisal_cycle_create';
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
    ARRAY['system_administrator','legal_entity_administrator'],
    p_legal_entity_id, 'legal_entity', p_legal_entity_id
  ) THEN
    RETURN private.command_fail('FORBIDDEN', 'Appraisal administrator role required');
  END IF;
  IF p_period_end < p_period_start THEN
    RETURN private.command_fail('VALIDATION', 'Cycle end date precedes start date');
  END IF;
  IF p_self_assessment_deadline IS NOT NULL
     AND (p_self_assessment_deadline < p_period_start OR p_self_assessment_deadline > p_period_end) THEN
    RETURN private.command_fail('VALIDATION', 'Self-assessment deadline is outside the cycle');
  END IF;
  IF p_manager_deadline IS NOT NULL
     AND p_self_assessment_deadline IS NOT NULL
     AND p_manager_deadline < p_self_assessment_deadline THEN
    RETURN private.command_fail('VALIDATION', 'Manager deadline precedes self-assessment deadline');
  END IF;
  IF p_review_deadline IS NOT NULL
     AND p_manager_deadline IS NOT NULL
     AND p_review_deadline < p_manager_deadline THEN
    RETURN private.command_fail('VALIDATION', 'Review deadline precedes manager deadline');
  END IF;

  INSERT INTO public.appraisal_cycles (
    legal_entity_id, name_en, name_ar, period_start, period_end,
    self_assessment_deadline, manager_deadline, review_deadline,
    cycle_status, created_by
  ) VALUES (
    p_legal_entity_id, btrim(p_name_en), btrim(p_name_ar), p_period_start, p_period_end,
    p_self_assessment_deadline, p_manager_deadline, p_review_deadline,
    'draft', v_actor
  ) RETURNING id INTO v_id;

  PERFORM private.write_audit_event(
    v_actor, 'create', 'appraisal_cycle', v_id,
    p_legal_entity_id, NULL, NULL, p_correlation_id, p_idempotency_key,
    NULL, jsonb_build_object('status', 'draft', 'period_start', p_period_start, 'period_end', p_period_end),
    NULL, NULL
  );

  v_result := private.command_ok(jsonb_build_object('entity_id', v_id, 'cycle_status', 'draft'));
  PERFORM private.command_store_idempotency(v_cmd, p_idempotency_key, v_actor, v_result);
  RETURN v_result;
END
$function$;

CREATE OR REPLACE FUNCTION public.rpc_appraisal_assignment_create(
  p_legal_entity_id UUID,
  p_cycle_id UUID,
  p_template_id UUID,
  p_employee_id UUID,
  p_manager_id UUID,
  p_reviewer_id UUID DEFAULT NULL,
  p_organization_unit_id UUID DEFAULT NULL,
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
  v_cmd TEXT := 'appraisal_assignment_create';
  v_replay JSONB;
  v_cycle public.appraisal_cycles%ROWTYPE;
  v_template public.appraisal_templates%ROWTYPE;
  v_weight NUMERIC(18,4);
  v_id UUID;
  v_crit RECORD;
  v_result JSONB;
BEGIN
  v_replay := private.command_check_idempotency(v_cmd, p_idempotency_key, v_actor);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF v_actor IS NULL OR NOT private.current_user_is_active() THEN
    RETURN private.command_fail('UNAUTHENTICATED', 'Authentication required');
  END IF;
  IF p_employee_id = p_manager_id
     OR p_reviewer_id = p_employee_id
     OR p_reviewer_id = p_manager_id THEN
    RETURN private.command_fail('SOD_VIOLATION', 'Employee, manager, and reviewer must be distinct');
  END IF;
  IF NOT private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator'],
    p_legal_entity_id, 'legal_entity', p_legal_entity_id
  ) THEN
    RETURN private.command_fail('FORBIDDEN', 'Appraisal administrator role required');
  END IF;

  SELECT * INTO v_cycle
  FROM public.appraisal_cycles AS ac
  WHERE ac.id = p_cycle_id
  FOR UPDATE;
  IF NOT FOUND OR v_cycle.legal_entity_id IS DISTINCT FROM p_legal_entity_id THEN
    RETURN private.command_fail('NOT_FOUND', 'Cycle not found for legal entity');
  END IF;
  IF v_cycle.cycle_status <> 'active' THEN
    RETURN private.command_fail('INVALID_STATE', 'Cycle must be active');
  END IF;

  SELECT * INTO v_template
  FROM public.appraisal_templates AS at
  WHERE at.id = p_template_id;
  IF NOT FOUND
     OR v_template.legal_entity_id IS DISTINCT FROM p_legal_entity_id
     OR v_template.is_active IS DISTINCT FROM true THEN
    RETURN private.command_fail('VALIDATION', 'Active appraisal template not found for legal entity');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(ARRAY[p_employee_id, p_manager_id, p_reviewer_id]) AS person_id
    WHERE person_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.memberships AS m
        JOIN public.profiles AS p ON p.id = m.user_id AND p.status = 'active'
        WHERE m.user_id = person_id
          AND m.legal_entity_id = p_legal_entity_id
          AND m.status = 'active'
      )
  ) THEN
    RETURN private.command_fail('VALIDATION', 'Every appraisal participant must be an active entity member');
  END IF;

  IF p_organization_unit_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.organization_units AS ou
    WHERE ou.id = p_organization_unit_id
      AND ou.legal_entity_id = p_legal_entity_id
      AND ou.status = 'active'
  ) THEN
    RETURN private.command_fail('VALIDATION', 'Organization unit is not active in the legal entity');
  END IF;

  SELECT COALESCE(SUM(atc.weight), 0) INTO v_weight
  FROM public.appraisal_template_criteria AS atc
  WHERE atc.template_id = p_template_id;
  IF v_weight <> 100 THEN
    RETURN private.command_fail('VALIDATION', 'Template criteria weights must equal 100');
  END IF;

  INSERT INTO public.appraisal_assignments (
    legal_entity_id, cycle_id, template_id, employee_id, manager_id, reviewer_id,
    organization_unit_id, assignment_status, created_by
  ) VALUES (
    p_legal_entity_id, p_cycle_id, p_template_id, p_employee_id, p_manager_id, p_reviewer_id,
    p_organization_unit_id, 'employee_self_review', v_actor
  ) RETURNING id INTO v_id;

  FOR v_crit IN
    SELECT atc.id FROM public.appraisal_template_criteria AS atc
    WHERE atc.template_id = p_template_id
  LOOP
    INSERT INTO public.appraisal_ratings (assignment_id, criterion_id)
    VALUES (v_id, v_crit.id);
  END LOOP;

  PERFORM private.notify_user(
    p_employee_id, 'Appraisal assignment created', 'تم إنشاء تقييم أداء',
    'appraisal_assignment', v_id
  );
  PERFORM private.write_audit_event(
    v_actor, 'create', 'appraisal_assignment', v_id,
    p_legal_entity_id, NULL, NULL, p_correlation_id, p_idempotency_key,
    NULL, jsonb_build_object(
      'employee_id', p_employee_id,
      'manager_id', p_manager_id,
      'reviewer_id', p_reviewer_id,
      'status', 'employee_self_review'
    ),
    NULL, NULL
  );

  v_result := private.command_ok(jsonb_build_object(
    'entity_id', v_id, 'assignment_status', 'employee_self_review'
  ));
  PERFORM private.command_store_idempotency(v_cmd, p_idempotency_key, v_actor, v_result);
  RETURN v_result;
END
$function$;

DO $grants$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'rpc_appraisal_cycle_create','rpc_appraisal_cycle_activate',
        'rpc_appraisal_assignment_create','rpc_appraisal_self_submit',
        'rpc_appraisal_manager_submit','rpc_appraisal_reviewer_submit',
        'rpc_appraisal_finalize','rpc_appraisal_acknowledge',
        'rpc_appraisal_peer_identities'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END
$grants$;

COMMENT ON FUNCTION public.rpc_appraisal_peer_identities(UUID)
  IS '@classification names-only appraisal identity lookup; relationship and tenant constrained';

-- ---------------------------------------------------------------------------
-- Period close: soft close materializes the active checklist. Hard close fails
-- closed when a configured checklist is absent, mismatched, or incomplete.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_period_soft_close(
  p_fiscal_period_id UUID,
  p_legal_entity_id UUID,
  p_module public.period_module,
  p_expected_state public.period_control_state DEFAULT 'open',
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
  v_template_id UUID;
  v_template_count INTEGER;
  v_existing_template UUID;
  v_instance_id UUID;
  v_close JSONB;
BEGIN
  IF v_actor IS NULL OR NOT private.current_user_is_active() THEN
    RETURN private.command_fail('UNAUTHENTICATED', 'Authentication required');
  END IF;

  SELECT COUNT(*)::INTEGER, MIN(pct.id::TEXT)::UUID
    INTO v_template_count, v_template_id
  FROM public.period_close_checklist_templates AS pct
  WHERE pct.legal_entity_id = p_legal_entity_id
    AND pct.module = p_module
    AND pct.is_active = true;

  IF v_template_count > 1 THEN
    RETURN private.command_fail('CONFIGURATION', 'More than one active close checklist is configured');
  END IF;

  SELECT pci.template_id INTO v_existing_template
  FROM public.period_close_instances AS pci
  WHERE pci.legal_entity_id = p_legal_entity_id
    AND pci.fiscal_period_id = p_fiscal_period_id
    AND pci.module = p_module;

  IF FOUND AND v_template_count = 1 AND v_existing_template IS DISTINCT FROM v_template_id THEN
    RETURN private.command_fail('CHECKLIST', 'Existing checklist instance does not match the active template');
  END IF;

  v_close := private.period_module_transition(
    p_fiscal_period_id, p_legal_entity_id, p_module,
    p_expected_state, 'soft_close', NULL, p_idempotency_key, p_correlation_id
  );
  IF NOT COALESCE((v_close->>'ok')::BOOLEAN, false) THEN RETURN v_close; END IF;

  IF v_template_count = 1 THEN
    INSERT INTO public.period_close_instances (
      legal_entity_id, fiscal_period_id, module, template_id, created_by
    ) VALUES (
      p_legal_entity_id, p_fiscal_period_id, p_module, v_template_id, v_actor
    )
    ON CONFLICT (legal_entity_id, fiscal_period_id, module) DO NOTHING;

    SELECT pci.id INTO v_instance_id
    FROM public.period_close_instances AS pci
    WHERE pci.legal_entity_id = p_legal_entity_id
      AND pci.fiscal_period_id = p_fiscal_period_id
      AND pci.module = p_module
      AND pci.template_id = v_template_id
    FOR UPDATE;

    IF v_instance_id IS NULL THEN
      RAISE EXCEPTION 'Checklist instance could not be materialized' USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO public.period_close_item_results (instance_id, checklist_item_id, item_status)
    SELECT v_instance_id, pci.id, 'pending'
    FROM public.period_close_checklist_items AS pci
    WHERE pci.template_id = v_template_id
    ON CONFLICT (instance_id, checklist_item_id) DO NOTHING;
  END IF;

  RETURN v_close || jsonb_build_object(
    'checklist_required', v_template_count = 1,
    'checklist_instance_id', v_instance_id
  );
END
$function$;

CREATE OR REPLACE FUNCTION public.rpc_period_checklist_set_result(
  p_item_result_id UUID,
  p_item_status public.period_checklist_item_status,
  p_evidence_reference TEXT DEFAULT NULL,
  p_comments TEXT DEFAULT NULL,
  p_waiver_reason TEXT DEFAULT NULL,
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
  v_cmd TEXT := 'period_checklist_set_result';
  v_replay JSONB;
  v_result_row public.period_close_item_results%ROWTYPE;
  v_instance public.period_close_instances%ROWTYPE;
  v_item public.period_close_checklist_items%ROWTYPE;
  v_control_state public.period_control_state;
  v_allowed BOOLEAN;
  v_result JSONB;
BEGIN
  v_replay := private.command_check_idempotency(v_cmd, p_idempotency_key, v_actor);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF v_actor IS NULL OR NOT private.current_user_is_active() THEN
    RETURN private.command_fail('UNAUTHENTICATED', 'Authentication required');
  END IF;
  IF p_item_status NOT IN ('passed', 'failed', 'waived') THEN
    RETURN private.command_fail('VALIDATION', 'Checklist result must be passed, failed, or waived');
  END IF;

  SELECT * INTO v_result_row
  FROM public.period_close_item_results AS pcir
  WHERE pcir.id = p_item_result_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN private.command_fail('NOT_FOUND', 'Checklist result not found'); END IF;

  SELECT * INTO v_instance
  FROM public.period_close_instances AS pci
  WHERE pci.id = v_result_row.instance_id
  FOR UPDATE;
  SELECT * INTO v_item
  FROM public.period_close_checklist_items AS pcci
  WHERE pcci.id = v_result_row.checklist_item_id;

  IF v_instance.template_id IS DISTINCT FROM v_item.template_id THEN
    RETURN private.command_fail('VALIDATION', 'Checklist item is not part of the instance template');
  END IF;
  IF v_item.item_type = 'automatic' THEN
    RETURN private.command_fail('VALIDATION', 'Automatic checklist controls cannot be completed manually');
  END IF;

  SELECT fpmc.control_state INTO v_control_state
  FROM public.fiscal_period_module_controls AS fpmc
  WHERE fpmc.legal_entity_id = v_instance.legal_entity_id
    AND fpmc.fiscal_period_id = v_instance.fiscal_period_id
    AND fpmc.module = v_instance.module
  FOR UPDATE;
  IF v_control_state IS DISTINCT FROM 'soft_close' THEN
    RETURN private.command_fail('INVALID_STATE', 'Checklist results can change only during soft close');
  END IF;

  v_allowed := private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator'],
    v_instance.legal_entity_id, 'legal_entity', v_instance.legal_entity_id
  );
  IF NOT v_allowed AND v_item.owner_role_code IS NOT NULL THEN
    v_allowed := private.user_has_any_role(
      ARRAY[v_item.owner_role_code],
      v_instance.legal_entity_id, 'legal_entity', v_instance.legal_entity_id
    );
  END IF;
  IF NOT v_allowed THEN RETURN private.command_fail('FORBIDDEN', 'Checklist item owner role required'); END IF;

  IF p_item_status = 'waived' THEN
    IF NOT private.user_has_any_role(
      ARRAY['system_administrator','legal_entity_administrator'],
      v_instance.legal_entity_id, 'legal_entity', v_instance.legal_entity_id
    ) THEN
      RETURN private.command_fail('FORBIDDEN', 'Senior close permission required to waive a checklist item');
    END IF;
    IF p_waiver_reason IS NULL OR length(btrim(p_waiver_reason)) < 5 THEN
      RETURN private.command_fail('VALIDATION', 'Explicit waiver reason required');
    END IF;
  END IF;
  IF v_item.item_type = 'evidence_required'
     AND p_item_status = 'passed'
     AND (p_evidence_reference IS NULL OR btrim(p_evidence_reference) = '') THEN
    RETURN private.command_fail('VALIDATION', 'Evidence reference required');
  END IF;

  UPDATE public.period_close_item_results SET
    item_status = p_item_status,
    completed_by = v_actor,
    completed_at = NOW(),
    evidence_reference = NULLIF(btrim(p_evidence_reference), ''),
    comments = NULLIF(btrim(p_comments), ''),
    waiver_reason = CASE WHEN p_item_status = 'waived' THEN btrim(p_waiver_reason) ELSE NULL END
  WHERE id = p_item_result_id;

  PERFORM private.write_audit_event(
    v_actor, 'update', 'period_close_item_result', p_item_result_id,
    v_instance.legal_entity_id, NULL, NULL, p_correlation_id, p_idempotency_key,
    jsonb_build_object('status', v_result_row.item_status),
    jsonb_build_object(
      'status', p_item_status,
      'fiscal_period_id', v_instance.fiscal_period_id,
      'module', v_instance.module,
      'waiver_reason', CASE WHEN p_item_status = 'waived' THEN p_waiver_reason ELSE NULL END
    ),
    COALESCE(p_comments, p_waiver_reason), NULL
  );

  v_result := private.command_ok(jsonb_build_object(
    'entity_id', p_item_result_id, 'item_status', p_item_status
  ));
  PERFORM private.command_store_idempotency(v_cmd, p_idempotency_key, v_actor, v_result);
  RETURN v_result;
END
$function$;

CREATE OR REPLACE FUNCTION public.rpc_period_close_evaluate_readiness(
  p_fiscal_period_id UUID,
  p_legal_entity_id UUID,
  p_module public.period_module DEFAULT 'actuals'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor UUID := (SELECT auth.uid());
  v_unmapped INTEGER := 0;
  v_incomplete_alloc INTEGER := 0;
  v_open_exceptions INTEGER := 0;
  v_template_count INTEGER := 0;
  v_template_id UUID;
  v_instance_id UUID;
  v_instance_template UUID;
  v_required_incomplete INTEGER := 0;
  v_blocking_incomplete INTEGER := 0;
  v_auto RECORD;
  v_auto_pass BOOLEAN;
  v_auto_count INTEGER;
  v_pass BOOLEAN;
BEGIN
  IF v_actor IS NULL OR NOT private.current_user_is_active() THEN
    RETURN private.command_fail('UNAUTHENTICATED', 'Authentication required');
  END IF;
  IF NOT private.user_can_access_legal_entity(p_legal_entity_id) THEN
    RETURN private.command_fail('FORBIDDEN', 'No access to legal entity');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.fiscal_periods AS fp WHERE fp.id = p_fiscal_period_id
  ) THEN
    RETURN private.command_fail('NOT_FOUND', 'Fiscal period not found');
  END IF;

  SELECT COUNT(*)::INTEGER, MIN(pct.id::TEXT)::UUID
    INTO v_template_count, v_template_id
  FROM public.period_close_checklist_templates AS pct
  WHERE pct.legal_entity_id = p_legal_entity_id
    AND pct.module = p_module
    AND pct.is_active = true;
  IF v_template_count > 1 THEN
    RETURN private.command_fail('CONFIGURATION', 'More than one active close checklist is configured');
  END IF;

  SELECT pci.id, pci.template_id INTO v_instance_id, v_instance_template
  FROM public.period_close_instances AS pci
  WHERE pci.legal_entity_id = p_legal_entity_id
    AND pci.fiscal_period_id = p_fiscal_period_id
    AND pci.module = p_module;

  SELECT COUNT(*)::INTEGER INTO v_unmapped
  FROM public.unmapped_transaction_queue AS utq
  JOIN public.import_batches AS ib ON ib.id = utq.import_batch_id
  WHERE ib.legal_entity_id = p_legal_entity_id AND utq.status = 'open';

  SELECT COUNT(*)::INTEGER INTO v_incomplete_alloc
  FROM public.actual_transactions AS atx
  WHERE atx.legal_entity_id = p_legal_entity_id
    AND atx.accounting_period_id = p_fiscal_period_id
    AND atx.is_posted = true
    AND ABS(atx.amount_ex_vat) > 0
    AND ABS(COALESCE((
      SELECT SUM(ata.allocation_amount)
      FROM public.actual_transaction_allocations AS ata
      WHERE ata.actual_transaction_id = atx.id
    ), 0) - atx.amount_ex_vat) > 0.0001;

  SELECT COUNT(*)::INTEGER INTO v_open_exceptions
  FROM public.invoice_match_exceptions AS ime
  JOIN public.supplier_invoices AS si ON si.id = ime.supplier_invoice_id
  WHERE si.legal_entity_id = p_legal_entity_id
    AND ime.is_resolved = false
    AND (si.fiscal_period_id IS NULL OR si.fiscal_period_id = p_fiscal_period_id);

  IF v_template_count = 1 AND v_instance_id IS NOT NULL AND v_instance_template = v_template_id THEN
    FOR v_auto IN
      SELECT r.id, r.item_status, ci.control_code
      FROM public.period_close_item_results AS r
      JOIN public.period_close_checklist_items AS ci ON ci.id = r.checklist_item_id
      WHERE r.instance_id = v_instance_id AND ci.item_type = 'automatic'
      FOR UPDATE OF r
    LOOP
      CASE v_auto.control_code
        WHEN 'unmapped_actuals' THEN v_auto_count := v_unmapped;
        WHEN 'unmapped_cleared' THEN v_auto_count := v_unmapped;
        WHEN 'incomplete_allocations' THEN v_auto_count := v_incomplete_alloc;
        WHEN 'open_match_exceptions' THEN v_auto_count := v_open_exceptions;
        ELSE v_auto_count := -1;
      END CASE;
      v_auto_pass := v_auto_count = 0;

      UPDATE public.period_close_item_results SET
        item_status = CASE WHEN v_auto_pass THEN 'passed' ELSE 'failed' END,
        completed_by = NULL,
        completed_at = NOW(),
        automatic_result = jsonb_build_object(
          'control_code', v_auto.control_code,
          'count', v_auto_count,
          'supported', v_auto_count >= 0,
          'evaluated_at', NOW()
        )
      WHERE id = v_auto.id;

      IF v_auto.item_status IS DISTINCT FROM
         (CASE WHEN v_auto_pass THEN 'passed' ELSE 'failed' END)::public.period_checklist_item_status THEN
        PERFORM private.write_audit_event(
          v_actor, 'update', 'period_close_item_result', v_auto.id,
          p_legal_entity_id, NULL, NULL, NULL, NULL,
          jsonb_build_object('status', v_auto.item_status),
          jsonb_build_object(
            'status', CASE WHEN v_auto_pass THEN 'passed' ELSE 'failed' END,
            'automatic', true,
            'control_code', v_auto.control_code,
            'count', v_auto_count
          ),
          NULL, NULL
        );
      END IF;
    END LOOP;

    SELECT COUNT(*)::INTEGER INTO v_required_incomplete
    FROM public.period_close_checklist_items AS ci
    LEFT JOIN public.period_close_item_results AS r
      ON r.checklist_item_id = ci.id AND r.instance_id = v_instance_id
    WHERE ci.template_id = v_template_id
      AND ci.is_required = true
      AND (r.id IS NULL OR r.item_status NOT IN ('passed', 'waived'));

    SELECT COUNT(*)::INTEGER INTO v_blocking_incomplete
    FROM public.period_close_checklist_items AS ci
    LEFT JOIN public.period_close_item_results AS r
      ON r.checklist_item_id = ci.id AND r.instance_id = v_instance_id
    WHERE ci.template_id = v_template_id
      AND ci.is_blocking = true
      AND (r.id IS NULL OR r.item_status NOT IN ('passed', 'waived'));
  ELSIF v_template_count = 1 THEN
    v_required_incomplete := 1;
    v_blocking_incomplete := 1;
  END IF;

  v_pass := (
    v_unmapped = 0
    AND v_incomplete_alloc = 0
    AND v_open_exceptions = 0
    AND (v_template_count = 0 OR (
      v_instance_id IS NOT NULL
      AND v_instance_template = v_template_id
      AND v_required_incomplete = 0
      AND v_blocking_incomplete = 0
    ))
  );

  RETURN private.command_ok(jsonb_build_object(
    'pass', v_pass,
    'checklist_required', v_template_count = 1,
    'checklist_instance_id', v_instance_id,
    'checklist_template_id', v_template_id,
    'controls', jsonb_build_array(
      jsonb_build_object('control_code', 'unmapped_actuals', 'pass', v_unmapped = 0, 'count', v_unmapped),
      jsonb_build_object('control_code', 'incomplete_allocations', 'pass', v_incomplete_alloc = 0, 'count', v_incomplete_alloc),
      jsonb_build_object('control_code', 'open_match_exceptions', 'pass', v_open_exceptions = 0, 'count', v_open_exceptions),
      jsonb_build_object(
        'control_code', 'required_checklist_complete',
        'pass', v_template_count = 0 OR (v_instance_id IS NOT NULL AND v_instance_template = v_template_id AND v_required_incomplete = 0),
        'count', v_required_incomplete
      ),
      jsonb_build_object(
        'control_code', 'blocking_checklist_complete',
        'pass', v_template_count = 0 OR (v_instance_id IS NOT NULL AND v_instance_template = v_template_id AND v_blocking_incomplete = 0),
        'count', v_blocking_incomplete
      )
    )
  ));
END
$function$;

CREATE OR REPLACE FUNCTION public.rpc_period_hard_close_with_checklist(
  p_fiscal_period_id UUID,
  p_legal_entity_id UUID,
  p_module public.period_module,
  p_expected_state public.period_control_state DEFAULT 'soft_close',
  p_idempotency_key TEXT DEFAULT NULL,
  p_correlation_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_ready JSONB;
  v_instance_id UUID;
BEGIN
  v_ready := public.rpc_period_close_evaluate_readiness(
    p_fiscal_period_id, p_legal_entity_id, p_module
  );
  IF NOT COALESCE((v_ready->>'ok')::BOOLEAN, false) THEN RETURN v_ready; END IF;
  IF NOT COALESCE((v_ready->>'pass')::BOOLEAN, false) THEN
    RETURN private.command_fail('READINESS', 'Period hard close blocked by readiness controls');
  END IF;

  IF COALESCE((v_ready->>'checklist_required')::BOOLEAN, false) THEN
    v_instance_id := NULLIF(v_ready->>'checklist_instance_id', '')::UUID;
    IF v_instance_id IS NULL THEN
      RETURN private.command_fail('CHECKLIST', 'Required checklist instance is missing');
    END IF;
    PERFORM 1 FROM public.period_close_instances AS pci WHERE pci.id = v_instance_id FOR UPDATE;
    IF NOT FOUND THEN RETURN private.command_fail('CHECKLIST', 'Required checklist instance is missing'); END IF;
  END IF;

  RETURN private.period_module_transition(
    p_fiscal_period_id, p_legal_entity_id, p_module,
    p_expected_state, 'hard_close', NULL, p_idempotency_key, p_correlation_id
  );
END
$function$;

CREATE OR REPLACE FUNCTION public.rpc_period_hard_close_gated(
  p_fiscal_period_id UUID,
  p_legal_entity_id UUID,
  p_module public.period_module,
  p_expected_state public.period_control_state DEFAULT 'soft_close',
  p_idempotency_key TEXT DEFAULT NULL,
  p_correlation_id UUID DEFAULT NULL
) RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $function$
  SELECT public.rpc_period_hard_close_with_checklist(
    p_fiscal_period_id, p_legal_entity_id, p_module,
    p_expected_state, p_idempotency_key, p_correlation_id
  );
$function$;

-- Legacy public names remain callable for compatibility but can no longer
-- bypass the checklist or the two-person reopen workflow.
CREATE OR REPLACE FUNCTION public.rpc_period_hard_close(
  p_fiscal_period_id UUID,
  p_legal_entity_id UUID,
  p_module public.period_module,
  p_expected_state public.period_control_state DEFAULT 'soft_close',
  p_idempotency_key TEXT DEFAULT NULL,
  p_correlation_id UUID DEFAULT NULL
) RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $function$
  SELECT public.rpc_period_hard_close_with_checklist(
    p_fiscal_period_id, p_legal_entity_id, p_module,
    p_expected_state, p_idempotency_key, p_correlation_id
  );
$function$;

CREATE OR REPLACE FUNCTION public.rpc_period_reopen(
  p_fiscal_period_id UUID,
  p_legal_entity_id UUID,
  p_module public.period_module,
  p_reason TEXT,
  p_expected_state public.period_control_state DEFAULT 'hard_close',
  p_idempotency_key TEXT DEFAULT NULL,
  p_correlation_id UUID DEFAULT NULL
) RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $function$
  SELECT private.command_fail(
    'REOPEN_APPROVAL_REQUIRED',
    'Use the reopen request and independent approval workflow'
  );
$function$;

-- Transition the locked period first. A command-style failure must not leave the
-- reopen request approved while the period remains hard closed.
CREATE OR REPLACE FUNCTION public.rpc_period_reopen_approve(
  p_reopen_request_id UUID,
  p_decision_reason TEXT DEFAULT NULL,
  p_expected_status public.period_reopen_request_status DEFAULT 'submitted',
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
  v_cmd TEXT := 'period_reopen_approve';
  v_replay JSONB;
  v_row public.period_reopen_requests%ROWTYPE;
  v_close JSONB;
  v_result JSONB;
BEGIN
  v_replay := private.command_check_idempotency(v_cmd, p_idempotency_key, v_actor);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF v_actor IS NULL OR NOT private.current_user_is_active() THEN
    RETURN private.command_fail('UNAUTHENTICATED', 'Authentication required');
  END IF;

  SELECT * INTO v_row
  FROM public.period_reopen_requests AS prr
  WHERE prr.id = p_reopen_request_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN private.command_fail('NOT_FOUND', 'Reopen request not found'); END IF;
  IF v_row.status IS DISTINCT FROM p_expected_status THEN
    RETURN private.command_fail('STATE_MISMATCH', 'Unexpected reopen request status');
  END IF;
  IF v_row.requested_by = v_actor THEN
    RETURN private.command_fail('SOD_VIOLATION', 'Requester cannot approve own reopen');
  END IF;
  IF NOT private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator'],
    v_row.legal_entity_id, 'legal_entity', v_row.legal_entity_id
  ) THEN
    RETURN private.command_fail('FORBIDDEN', 'Senior gate roles required to approve reopen');
  END IF;

  v_close := private.period_module_transition(
    v_row.fiscal_period_id, v_row.legal_entity_id, v_row.module,
    'hard_close', 'reopened', v_row.reason, p_idempotency_key, p_correlation_id
  );
  IF NOT COALESCE((v_close->>'ok')::BOOLEAN, false) THEN
    RETURN v_close;
  END IF;

  UPDATE public.period_reopen_requests SET
    status = 'approved',
    approved_by = v_actor,
    decision_reason = p_decision_reason,
    decided_at = NOW(),
    updated_at = NOW(),
    row_version = row_version + 1
  WHERE id = p_reopen_request_id;

  PERFORM private.write_audit_event(
    v_actor, 'update', 'period_reopen_request', p_reopen_request_id,
    v_row.legal_entity_id, NULL, NULL, p_correlation_id, p_idempotency_key,
    jsonb_build_object('status', p_expected_status),
    jsonb_build_object('status', 'approved'),
    p_decision_reason, NULL
  );

  v_result := private.command_ok(jsonb_build_object(
    'entity_id', p_reopen_request_id,
    'status', 'approved',
    'period_control', v_close
  ));
  PERFORM private.command_store_idempotency(v_cmd, p_idempotency_key, v_actor, v_result);
  RETURN v_result;
END
$function$;

DO $grants$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'rpc_period_soft_close','rpc_period_checklist_set_result',
        'rpc_period_close_evaluate_readiness','rpc_period_hard_close_with_checklist',
        'rpc_period_hard_close_gated','rpc_period_hard_close','rpc_period_reopen',
        'rpc_period_reopen_request','rpc_period_reopen_approve'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END
$grants$;
