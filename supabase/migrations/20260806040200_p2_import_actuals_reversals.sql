-- P2 Phase 5-7: Import posting, actual posting/allocation, reversals (COD-H-007, COD-H-009, COD-M-005, COD-H-010)

-- Actual transactions default to unposted draft
ALTER TABLE public.actual_transactions ALTER COLUMN is_posted SET DEFAULT false;

-- One reversal per original transaction
CREATE UNIQUE INDEX IF NOT EXISTS idx_actual_one_reversal
  ON public.actual_transactions (reverses_transaction_id)
  WHERE reverses_transaction_id IS NOT NULL;

-- Posted actual immutability
CREATE OR REPLACE FUNCTION private.protect_posted_actual()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.is_posted = true THEN
    IF NEW.is_posted IS DISTINCT FROM OLD.is_posted
       OR NEW.amount_ex_vat IS DISTINCT FROM OLD.amount_ex_vat
       OR NEW.vat_amount IS DISTINCT FROM OLD.vat_amount
       OR NEW.amount_inc_vat IS DISTINCT FROM OLD.amount_inc_vat
       OR NEW.legal_entity_id IS DISTINCT FROM OLD.legal_entity_id
       OR NEW.transaction_date IS DISTINCT FROM OLD.transaction_date
       OR NEW.accounting_period_id IS DISTINCT FROM OLD.accounting_period_id THEN
      RAISE EXCEPTION 'Posted actual transactions are immutable';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' AND OLD.is_posted = true THEN
    RAISE EXCEPTION 'Posted actual transactions cannot be deleted';
  END IF;
  RETURN COALESCE(NEW, OLD);
END
$function$;

DROP TRIGGER IF EXISTS trg_actual_posted_immutable ON public.actual_transactions;
CREATE TRIGGER trg_actual_posted_immutable
  BEFORE UPDATE OR DELETE ON public.actual_transactions
  FOR EACH ROW EXECUTE FUNCTION private.protect_posted_actual();

-- Cross-tenant allocation integrity
CREATE OR REPLACE FUNCTION private.enforce_allocation_tenant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
  v_txn_entity UUID;
  v_ou_entity UUID;
  v_cn_entity UUID;
  v_ca_entity UUID;
  v_proj_entity UUID;
BEGIN
  SELECT atx.legal_entity_id INTO v_txn_entity
  FROM public.actual_transactions AS atx
  WHERE atx.id = COALESCE(NEW.actual_transaction_id, OLD.actual_transaction_id);

  IF NEW.organization_unit_id IS NOT NULL THEN
    SELECT ou.legal_entity_id INTO v_ou_entity
    FROM public.organization_units AS ou WHERE ou.id = NEW.organization_unit_id;
    IF v_ou_entity IS DISTINCT FROM v_txn_entity THEN
      RAISE EXCEPTION 'Allocation organization unit tenant mismatch';
    END IF;
  END IF;

  IF NEW.cost_node_id IS NOT NULL THEN
    SELECT cn.legal_entity_id INTO v_cn_entity
    FROM public.cost_nodes AS cn WHERE cn.id = NEW.cost_node_id;
    IF v_cn_entity IS DISTINCT FROM v_txn_entity THEN
      RAISE EXCEPTION 'Allocation cost node tenant mismatch';
    END IF;
  END IF;

  IF NEW.control_account_id IS NOT NULL THEN
    SELECT ca.legal_entity_id INTO v_ca_entity
    FROM public.control_accounts AS ca WHERE ca.id = NEW.control_account_id;
    IF v_ca_entity IS DISTINCT FROM v_txn_entity THEN
      RAISE EXCEPTION 'Allocation control account tenant mismatch';
    END IF;
  END IF;

  IF NEW.project_id IS NOT NULL THEN
    SELECT cs.legal_entity_id INTO v_proj_entity
    FROM public.projects AS p
    JOIN public.control_scopes AS cs ON cs.id = p.control_scope_id
    WHERE p.id = NEW.project_id;
    IF v_proj_entity IS DISTINCT FROM v_txn_entity THEN
      RAISE EXCEPTION 'Allocation project tenant mismatch';
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END
$function$;

DROP TRIGGER IF EXISTS trg_allocation_tenant_consistency ON public.actual_transaction_allocations;
CREATE TRIGGER trg_allocation_tenant_consistency
  BEFORE INSERT OR UPDATE ON public.actual_transaction_allocations
  FOR EACH ROW EXECUTE FUNCTION private.enforce_allocation_tenant_consistency();

-- Exact reconciliation at posting time
CREATE OR REPLACE FUNCTION private.validate_exact_allocation_reconciliation(p_txn_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $function$
DECLARE
  v_source NUMERIC(18,4);
  v_allocated NUMERIC(18,4);
BEGIN
  SELECT atx.amount_ex_vat INTO v_source FROM public.actual_transactions AS atx WHERE atx.id = p_txn_id;
  SELECT COALESCE(SUM(ata.allocation_amount), 0) INTO v_allocated
  FROM public.actual_transaction_allocations AS ata WHERE ata.actual_transaction_id = p_txn_id;
  RETURN abs(v_allocated - v_source) <= 0.0001;
END
$function$;

-- Import batch posting (atomic, segregated)
CREATE OR REPLACE FUNCTION private.import_post_batch(
  p_batch_id UUID,
  p_expected_status public.approval_status DEFAULT 'under_review',
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
  v_cmd TEXT := 'import_post_batch';
  v_replay JSONB;
  v_batch public.import_batches%ROWTYPE;
  v_row RECORD;
  v_txn_id UUID;
  v_posted_total NUMERIC(18,4) := 0;
  v_dup_count INTEGER := 0;
  v_result JSONB;
  v_payload JSONB;
BEGIN
  v_replay := private.command_check_idempotency(v_cmd, p_idempotency_key, v_actor);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

  IF v_actor IS NULL OR NOT private.current_user_is_active() THEN
    RETURN private.command_fail('UNAUTHENTICATED', 'Authentication required');
  END IF;

  SELECT * INTO v_batch FROM public.import_batches AS ib WHERE ib.id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN RETURN private.command_fail('NOT_FOUND', 'Import batch not found'); END IF;
  IF v_batch.is_posted THEN
    RETURN private.command_ok(jsonb_build_object('entity_id', p_batch_id, 'already_posted', true));
  END IF;
  IF v_batch.approval_status IS DISTINCT FROM p_expected_status THEN
    RETURN private.command_fail('STATE_MISMATCH', 'Import batch not in expected review status');
  END IF;
  IF v_batch.imported_by = v_actor THEN
    RETURN private.command_fail('SOD_VIOLATION', 'Importer cannot post own batch');
  END IF;
  IF NOT private.user_has_any_role(
    ARRAY['system_administrator','cost_controller','finance_user','approver'],
    v_batch.legal_entity_id) THEN
    RETURN private.command_fail('FORBIDDEN', 'Insufficient role to post import batch');
  END IF;

  FOR v_row IN
    SELECT isr.* FROM public.imported_source_rows AS isr
    WHERE isr.import_batch_id = p_batch_id AND isr.parse_status <> 'error'
    ORDER BY isr.row_number
  LOOP
    v_payload := v_row.raw_data;
    IF EXISTS (
      SELECT 1 FROM public.actual_transactions AS atx
      WHERE atx.legal_entity_id = v_batch.legal_entity_id
        AND atx.source_system = 'CSV_IMPORT'
        AND atx.source_transaction_id = v_payload->>'sourceTransactionId'
    ) THEN
      INSERT INTO public.duplicate_review_queue (import_batch_id, match_reason, status)
      VALUES (p_batch_id, 'Duplicate source transaction ' || (v_payload->>'sourceTransactionId'), 'pending');
      v_dup_count := v_dup_count + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.actual_transactions (
      legal_entity_id, import_batch_id, source_system, source_transaction_id,
      journal_number, invoice_number, transaction_date, accounting_period_id,
      original_description, amount_ex_vat, vat_amount, amount_inc_vat, invoice_date, is_posted
    ) VALUES (
      v_batch.legal_entity_id, p_batch_id, 'CSV_IMPORT', v_payload->>'sourceTransactionId',
      v_payload->>'journalNumber', v_payload->>'invoiceNumber',
      (v_payload->>'transactionDate')::date, NULL,
      v_payload->>'description',
      (v_payload->>'amountExVat')::numeric, COALESCE((v_payload->>'vatAmount')::numeric, 0),
      COALESCE((v_payload->>'amountExVat')::numeric, 0) + COALESCE((v_payload->>'vatAmount')::numeric, 0),
      (v_payload->>'transactionDate')::date, false
    ) RETURNING id INTO v_txn_id;

    IF (v_payload->>'organizationUnitId') IS NULL OR (v_payload->>'costNodeId') IS NULL THEN
      INSERT INTO public.unmapped_transaction_queue (
        import_batch_id, imported_source_row_id, actual_transaction_id, reason, status
      ) VALUES (
        p_batch_id, v_row.id, v_txn_id, 'Missing organization unit or cost item mapping', 'open'
      );
      v_posted_total := v_posted_total + (v_payload->>'amountExVat')::numeric;
      CONTINUE;
    END IF;

    INSERT INTO public.actual_transaction_allocations (
      actual_transaction_id, organization_unit_id, cost_node_id, allocation_percent, allocation_amount
    ) VALUES (
      v_txn_id, (v_payload->>'organizationUnitId')::uuid, (v_payload->>'costNodeId')::uuid,
      100, (v_payload->>'amountExVat')::numeric
    );

    IF NOT private.validate_exact_allocation_reconciliation(v_txn_id) THEN
      RAISE EXCEPTION 'Allocation does not reconcile to source amount for row %', v_row.row_number;
    END IF;

    UPDATE public.actual_transactions AS atx SET is_posted = true WHERE atx.id = v_txn_id;
    v_posted_total := v_posted_total + (v_payload->>'amountExVat')::numeric;
  END LOOP;

  UPDATE public.import_batches AS ib SET
    is_posted = true, posted_total = v_posted_total,
    approval_status = 'posted', approved_by = v_actor
  WHERE ib.id = p_batch_id;

  PERFORM private.write_audit_event(
    v_actor, 'import', 'import_batch', p_batch_id,
    v_batch.legal_entity_id, NULL, NULL,
    p_correlation_id, p_idempotency_key,
    jsonb_build_object('approval_status', p_expected_status, 'is_posted', false),
    jsonb_build_object('approval_status', 'posted', 'is_posted', true, 'posted_total', v_posted_total),
    NULL, p_batch_id
  );

  v_result := private.command_ok(jsonb_build_object(
    'entity_id', p_batch_id, 'posted_total', v_posted_total, 'duplicate_count', v_dup_count
  ));
  PERFORM private.command_store_idempotency(v_cmd, p_idempotency_key, v_actor, v_result);
  RETURN v_result;
END
$function$;

-- Import prepare (submitted) and review (under_review) transitions
CREATE OR REPLACE FUNCTION private.import_review_batch(
  p_batch_id UUID,
  p_expected_status public.approval_status DEFAULT 'submitted',
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor UUID := (SELECT auth.uid());
  v_batch public.import_batches%ROWTYPE;
BEGIN
  SELECT * INTO v_batch FROM public.import_batches AS ib WHERE ib.id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN RETURN private.command_fail('NOT_FOUND', 'Import batch not found'); END IF;
  IF v_batch.approval_status IS DISTINCT FROM p_expected_status THEN
    RETURN private.command_fail('STATE_MISMATCH', 'Import batch not in expected status');
  END IF;
  IF v_batch.imported_by = v_actor THEN
    RETURN private.command_fail('SOD_VIOLATION', 'Importer cannot review own batch');
  END IF;
  IF NOT private.user_has_any_role(
    ARRAY['system_administrator','cost_controller','finance_user','approver'],
    v_batch.legal_entity_id) THEN
    RETURN private.command_fail('FORBIDDEN', 'Insufficient role to review import batch');
  END IF;
  UPDATE public.import_batches AS ib SET approval_status = 'under_review' WHERE ib.id = p_batch_id;
  RETURN private.command_ok(jsonb_build_object('entity_id', p_batch_id, 'approval_status', 'under_review'));
END
$function$;

-- Post actual transaction with exact allocation reconciliation
CREATE OR REPLACE FUNCTION private.post_actual_transaction(
  p_transaction_id UUID,
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
  v_cmd TEXT := 'post_actual_transaction';
  v_replay JSONB;
  v_txn public.actual_transactions%ROWTYPE;
  v_result JSONB;
BEGIN
  v_replay := private.command_check_idempotency(v_cmd, p_idempotency_key, v_actor);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

  SELECT * INTO v_txn FROM public.actual_transactions AS atx WHERE atx.id = p_transaction_id FOR UPDATE;
  IF NOT FOUND THEN RETURN private.command_fail('NOT_FOUND', 'Transaction not found'); END IF;
  IF v_txn.is_posted THEN
    RETURN private.command_ok(jsonb_build_object('entity_id', p_transaction_id, 'already_posted', true));
  END IF;
  IF NOT private.user_has_any_role(
    ARRAY['system_administrator','cost_controller','finance_user'],
    v_txn.legal_entity_id) THEN
    RETURN private.command_fail('FORBIDDEN', 'Insufficient role to post actual');
  END IF;
  IF NOT private.validate_exact_allocation_reconciliation(p_transaction_id) THEN
    RETURN private.command_fail('RECONCILIATION', 'Allocations must exactly reconcile to source amount');
  END IF;

  UPDATE public.actual_transactions AS atx SET is_posted = true WHERE atx.id = p_transaction_id;

  PERFORM private.write_audit_event(
    v_actor, 'allocate', 'actual_transaction', p_transaction_id,
    v_txn.legal_entity_id, NULL, NULL, p_correlation_id, p_idempotency_key,
    jsonb_build_object('is_posted', false), jsonb_build_object('is_posted', true),
    NULL, v_txn.import_batch_id
  );

  v_result := private.command_ok(jsonb_build_object('entity_id', p_transaction_id));
  PERFORM private.command_store_idempotency(v_cmd, p_idempotency_key, v_actor, v_result);
  RETURN v_result;
END
$function$;

-- Idempotent reversal
CREATE OR REPLACE FUNCTION private.reverse_actual_transaction(
  p_original_transaction_id UUID,
  p_reason TEXT,
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
  v_cmd TEXT := 'reverse_actual_transaction';
  v_replay JSONB;
  v_orig public.actual_transactions%ROWTYPE;
  v_existing UUID;
  v_rev_id UUID;
  v_alloc RECORD;
  v_result JSONB;
BEGIN
  v_replay := private.command_check_idempotency(v_cmd, p_idempotency_key, v_actor);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

  SELECT * INTO v_orig FROM public.actual_transactions AS atx
  WHERE atx.id = p_original_transaction_id FOR UPDATE;
  IF NOT FOUND THEN RETURN private.command_fail('NOT_FOUND', 'Original transaction not found'); END IF;
  IF v_orig.is_reversal THEN RETURN private.command_fail('FORBIDDEN', 'Cannot reverse a reversal'); END IF;
  IF NOT v_orig.is_posted THEN RETURN private.command_fail('INVALID_STATE', 'Only posted transactions can be reversed'); END IF;
  IF NOT private.user_has_any_role(
    ARRAY['system_administrator','cost_controller','finance_user','approver'],
    v_orig.legal_entity_id) THEN
    RETURN private.command_fail('FORBIDDEN', 'Insufficient role to reverse actual');
  END IF;

  SELECT atx.id INTO v_existing FROM public.actual_transactions AS atx
  WHERE atx.reverses_transaction_id = p_original_transaction_id;
  IF FOUND THEN
    v_result := private.command_ok(jsonb_build_object(
      'entity_id', v_existing, 'reversal_id', v_existing, 'already_reversed', true
    ));
    PERFORM private.command_store_idempotency(v_cmd, p_idempotency_key, v_actor, v_result);
    RETURN v_result;
  END IF;

  INSERT INTO public.actual_transactions (
    legal_entity_id, source_system, source_transaction_id, transaction_date,
    accounting_period_id, original_description,
    amount_ex_vat, vat_amount, amount_inc_vat,
    invoice_date, vendor_id, is_reversal, reverses_transaction_id, is_posted
  ) VALUES (
    v_orig.legal_entity_id, v_orig.source_system,
    v_orig.source_transaction_id || '-REV',
    v_orig.transaction_date, v_orig.accounting_period_id,
    'Reversal: ' || COALESCE(p_reason, ''),
    -v_orig.amount_ex_vat, -v_orig.vat_amount, -v_orig.amount_inc_vat,
    v_orig.invoice_date, v_orig.vendor_id, true, p_original_transaction_id, false
  ) RETURNING id INTO v_rev_id;

  FOR v_alloc IN
    SELECT * FROM public.actual_transaction_allocations AS ata
    WHERE ata.actual_transaction_id = p_original_transaction_id
  LOOP
    INSERT INTO public.actual_transaction_allocations (
      actual_transaction_id, organization_unit_id, control_account_id, cost_node_id,
      project_id, allocation_percent, allocation_amount
    ) VALUES (
      v_rev_id, v_alloc.organization_unit_id, v_alloc.control_account_id, v_alloc.cost_node_id,
      v_alloc.project_id, v_alloc.allocation_percent, -v_alloc.allocation_amount
    );
  END LOOP;

  IF NOT private.validate_exact_allocation_reconciliation(v_rev_id) THEN
    RAISE EXCEPTION 'Reversal allocations do not reconcile';
  END IF;

  UPDATE public.actual_transactions AS atx SET is_posted = true WHERE atx.id = v_rev_id;

  PERFORM private.write_audit_event(
    v_actor, 'reverse', 'actual_transaction', p_original_transaction_id,
    v_orig.legal_entity_id, NULL, NULL, p_correlation_id, p_idempotency_key,
    jsonb_build_object('transaction_id', p_original_transaction_id),
    jsonb_build_object('reversal_id', v_rev_id),
    p_reason, v_orig.import_batch_id
  );

  v_result := private.command_ok(jsonb_build_object('entity_id', p_original_transaction_id, 'reversal_id', v_rev_id));
  PERFORM private.command_store_idempotency(v_cmd, p_idempotency_key, v_actor, v_result);
  RETURN v_result;
END
$function$;

-- Public RPC wrappers
CREATE OR REPLACE FUNCTION public.rpc_import_review_batch(
  p_batch_id UUID, p_expected_status public.approval_status DEFAULT 'submitted', p_idempotency_key TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.import_review_batch(p_batch_id, p_expected_status, p_idempotency_key);
$$;
CREATE OR REPLACE FUNCTION public.rpc_import_post_batch(
  p_batch_id UUID, p_expected_status public.approval_status DEFAULT 'under_review',
  p_idempotency_key TEXT DEFAULT NULL, p_correlation_id UUID DEFAULT NULL
) RETURNS JSONB LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.import_post_batch(p_batch_id, p_expected_status, p_idempotency_key, p_correlation_id);
$$;
CREATE OR REPLACE FUNCTION public.rpc_post_actual_transaction(
  p_transaction_id UUID, p_idempotency_key TEXT DEFAULT NULL, p_correlation_id UUID DEFAULT NULL
) RETURNS JSONB LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.post_actual_transaction(p_transaction_id, p_idempotency_key, p_correlation_id);
$$;
CREATE OR REPLACE FUNCTION public.rpc_reverse_actual_transaction(
  p_original_transaction_id UUID, p_reason TEXT,
  p_idempotency_key TEXT DEFAULT NULL, p_correlation_id UUID DEFAULT NULL
) RETURNS JSONB LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.reverse_actual_transaction(p_original_transaction_id, p_reason, p_idempotency_key, p_correlation_id);
$$;

REVOKE ALL ON FUNCTION public.rpc_import_review_batch(UUID, public.approval_status, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_import_post_batch(UUID, public.approval_status, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_post_actual_transaction(UUID, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_reverse_actual_transaction(UUID, TEXT, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_import_review_batch(UUID, public.approval_status, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_import_post_batch(UUID, public.approval_status, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_post_actual_transaction(UUID, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_reverse_actual_transaction(UUID, TEXT, TEXT, UUID) TO authenticated;

REVOKE ALL ON FUNCTION private.import_post_batch(UUID, public.approval_status, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.import_review_batch(UUID, public.approval_status, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.post_actual_transaction(UUID, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.reverse_actual_transaction(UUID, TEXT, TEXT, UUID) FROM PUBLIC;
