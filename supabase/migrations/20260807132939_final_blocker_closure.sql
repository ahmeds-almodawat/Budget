-- Final audited blocker closure.
-- Additive only: hardens procurement relationships/accounting and completes
-- delegated approval, master governance, period configuration, and appraisal
-- configuration command paths.

-- =============================================================================
-- Shared schema extensions
-- =============================================================================

ALTER TYPE public.invoice_status ADD VALUE IF NOT EXISTS 'reversed';
ALTER TYPE public.approval_item_type ADD VALUE IF NOT EXISTS 'sourcing_award';

ALTER TABLE public.procurement_policies
  ADD COLUMN IF NOT EXISTS allow_two_way_match BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS two_way_match_limit NUMERIC(18,4) NOT NULL DEFAULT 0;

ALTER TABLE public.service_entry_lines
  ADD COLUMN IF NOT EXISTS contract_line_id UUID REFERENCES public.procurement_contract_lines(id);

ALTER TABLE public.supplier_invoices
  ADD COLUMN IF NOT EXISTS reversed_by UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reversal_reason TEXT,
  ADD COLUMN IF NOT EXISTS replacement_of_invoice_id UUID REFERENCES public.supplier_invoices(id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_supplier_invoice_replacement
  ON public.supplier_invoices (replacement_of_invoice_id)
  WHERE replacement_of_invoice_id IS NOT NULL AND invoice_status <> 'cancelled';

ALTER TABLE public.invoice_match_results DROP CONSTRAINT IF EXISTS invoice_match_results_match_mode_check;
ALTER TABLE public.invoice_match_results ADD CONSTRAINT invoice_match_results_match_mode_check
  CHECK (match_mode IN ('two_way','three_way_goods','three_way_service','two_way_policy_exception','mixed_line_match'));

CREATE TABLE IF NOT EXISTS public.invoice_commitment_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id UUID NOT NULL REFERENCES public.legal_entities(id),
  supplier_invoice_id UUID NOT NULL REFERENCES public.supplier_invoices(id),
  supplier_invoice_line_id UUID NOT NULL REFERENCES public.supplier_invoice_lines(id),
  commitment_id UUID NOT NULL REFERENCES public.commitments(id),
  applied_amount NUMERIC(18,4) NOT NULL CHECK (applied_amount > 0),
  application_status TEXT NOT NULL DEFAULT 'applied'
    CHECK (application_status IN ('applied','reversed')),
  applied_by UUID NOT NULL REFERENCES public.profiles(id),
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reversed_by UUID REFERENCES public.profiles(id),
  reversed_at TIMESTAMPTZ,
  reversal_reason TEXT,
  CONSTRAINT uq_invoice_commitment_line UNIQUE (supplier_invoice_line_id),
  CONSTRAINT invoice_commitment_reversal_shape CHECK (
    (application_status = 'applied' AND reversed_by IS NULL AND reversed_at IS NULL)
    OR (application_status = 'reversed' AND reversed_by IS NOT NULL AND reversed_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_invoice_commitment_commitment
  ON public.invoice_commitment_applications (commitment_id, application_status);

ALTER TABLE public.invoice_commitment_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_commitment_applications FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS invoice_commitment_applications_select ON public.invoice_commitment_applications;
CREATE POLICY invoice_commitment_applications_select
  ON public.invoice_commitment_applications FOR SELECT TO authenticated
  USING (private.user_can_access_legal_entity(legal_entity_id));
REVOKE ALL ON TABLE public.invoice_commitment_applications FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.invoice_commitment_applications TO authenticated;
COMMENT ON TABLE public.invoice_commitment_applications IS
  '@classification financial_control; authenticated read via tenant RLS; mutation only through invoice lifecycle RPCs';

-- Authoritative pending-assignee records. These rows are evidence, not a
-- parallel approval state machine: the business object remains authoritative.
CREATE TABLE IF NOT EXISTS public.workflow_approval_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id UUID NOT NULL REFERENCES public.legal_entities(id),
  item_type public.approval_item_type NOT NULL,
  workflow_type TEXT NOT NULL,
  permission_code TEXT NOT NULL,
  entity_id UUID NOT NULL,
  title_en TEXT NOT NULL,
  title_ar TEXT NOT NULL,
  requester_id UUID REFERENCES public.profiles(id),
  original_assignee_id UUID NOT NULL REFERENCES public.profiles(id),
  financial_amount NUMERIC(18,4),
  assignment_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (assignment_status IN ('pending','approved','rejected','cancelled')),
  decision TEXT,
  decision_reason TEXT,
  decided_by UUID REFERENCES public.profiles(id),
  decided_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  due_date DATE,
  row_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT workflow_assignment_decision_shape CHECK (
    (assignment_status = 'pending' AND decision IS NULL AND decided_by IS NULL AND decided_at IS NULL)
    OR (assignment_status <> 'pending' AND decision IS NOT NULL AND decided_by IS NOT NULL AND decided_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_workflow_assignment_pending
  ON public.workflow_approval_assignments (item_type, entity_id)
  WHERE assignment_status = 'pending';
CREATE INDEX IF NOT EXISTS idx_workflow_assignment_assignee
  ON public.workflow_approval_assignments (original_assignee_id, assignment_status, submitted_at DESC);

ALTER TABLE public.workflow_approval_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_approval_assignments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS workflow_approval_assignments_select ON public.workflow_approval_assignments;
CREATE POLICY workflow_approval_assignments_select
  ON public.workflow_approval_assignments FOR SELECT TO authenticated
  USING (private.user_can_access_legal_entity(legal_entity_id));
REVOKE ALL ON TABLE public.workflow_approval_assignments FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.workflow_approval_assignments TO authenticated;
COMMENT ON TABLE public.workflow_approval_assignments IS
  '@classification approval_control; authoritative pending assignee evidence; authenticated read via tenant RLS';

-- Existing fixture templates are treated as the previously approved version.
ALTER TABLE public.period_close_checklist_templates
  ADD COLUMN IF NOT EXISTS version_number INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS governance_status public.governance_workflow_status NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS effective_to DATE,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS submitted_by UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS retired_by UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS retired_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS row_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE public.period_close_checklist_templates
  DROP CONSTRAINT IF EXISTS period_close_checklist_template_legal_entity_id_module_code_key;

UPDATE public.period_close_checklist_templates
SET governance_status = CASE WHEN is_active THEN 'approved'::public.governance_workflow_status ELSE 'inactive'::public.governance_workflow_status END,
    approved_at = CASE WHEN is_active THEN COALESCE(approved_at, created_at) ELSE approved_at END
WHERE governance_status = 'draft' AND created_by IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_period_template_version
  ON public.period_close_checklist_templates (legal_entity_id, module, code, version_number);
CREATE UNIQUE INDEX IF NOT EXISTS uq_period_template_active
  ON public.period_close_checklist_templates (legal_entity_id, module)
  WHERE governance_status = 'approved' AND is_active = true;

ALTER TABLE public.appraisal_templates
  ADD COLUMN IF NOT EXISTS version_number INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS governance_status public.governance_workflow_status NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS submitted_by UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS retired_by UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS retired_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS row_version INTEGER NOT NULL DEFAULT 1;

ALTER TABLE public.appraisal_templates
  DROP CONSTRAINT IF EXISTS appraisal_templates_legal_entity_id_code_key;

UPDATE public.appraisal_templates
SET governance_status = CASE WHEN is_active THEN 'approved'::public.governance_workflow_status ELSE 'inactive'::public.governance_workflow_status END,
    approved_at = CASE WHEN is_active THEN COALESCE(approved_at, created_at) ELSE approved_at END
WHERE governance_status = 'draft' AND created_by IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_appraisal_template_version
  ON public.appraisal_templates (legal_entity_id, code, version_number);
CREATE UNIQUE INDEX IF NOT EXISTS uq_appraisal_template_active_code
  ON public.appraisal_templates (legal_entity_id, code)
  WHERE governance_status = 'approved' AND is_active = true;

ALTER TABLE public.governed_master_records
  ADD COLUMN IF NOT EXISTS revision_number INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS supersedes_record_id UUID REFERENCES public.governed_master_records(id),
  ADD COLUMN IF NOT EXISTS is_current BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.governed_master_records
  DROP CONSTRAINT IF EXISTS governed_master_records_legal_entity_id_record_type_code_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_governed_master_revision
  ON public.governed_master_records(legal_entity_id,record_type,code,revision_number);
CREATE UNIQUE INDEX IF NOT EXISTS uq_governed_master_current
  ON public.governed_master_records(legal_entity_id,record_type,code)
  WHERE is_current;

ALTER TABLE public.organization_unit_types
  ADD COLUMN IF NOT EXISTS status public.record_status NOT NULL DEFAULT 'active';

-- Link a governed proposal to the exact operational record it controls.
CREATE TABLE IF NOT EXISTS public.governed_master_bindings (
  governed_record_id UUID PRIMARY KEY REFERENCES public.governed_master_records(id),
  legal_entity_id UUID NOT NULL REFERENCES public.legal_entities(id),
  operational_table TEXT NOT NULL,
  operational_record_id UUID NOT NULL,
  bound_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  bound_by UUID NOT NULL REFERENCES public.profiles(id),
  CONSTRAINT governed_master_supported_table CHECK (
    operational_table IN (
      'organization_unit_types','organization_units','cost_nodes','gl_accounts',
      'vendors','service_lines'
    )
  ),
  CONSTRAINT governed_master_binding_revision_unique UNIQUE (governed_record_id, operational_table)
);

CREATE INDEX IF NOT EXISTS idx_governed_master_operational
  ON public.governed_master_bindings(operational_table,operational_record_id);

ALTER TABLE public.governed_master_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.governed_master_bindings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS governed_master_bindings_select ON public.governed_master_bindings;
CREATE POLICY governed_master_bindings_select
  ON public.governed_master_bindings FOR SELECT TO authenticated
  USING (private.user_can_access_legal_entity(legal_entity_id));
REVOKE ALL ON TABLE public.governed_master_bindings FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.governed_master_bindings TO authenticated;
COMMENT ON TABLE public.governed_master_bindings IS
  '@classification master_control; binds governed revisions to operational master records; authenticated read via tenant RLS';

-- =============================================================================
-- Procurement relationship integrity and matching/accounting
-- =============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS uq_goods_receipt_po_line
  ON public.goods_receipt_lines (goods_receipt_id, purchase_order_line_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_service_entry_po_line
  ON public.service_entry_lines (service_entry_id, purchase_order_line_id)
  WHERE purchase_order_line_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_service_entry_contract_line
  ON public.service_entry_lines (service_entry_id, contract_line_id)
  WHERE contract_line_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_supplier_invoice_po_line
  ON public.supplier_invoice_lines (supplier_invoice_id, purchase_order_line_id);

CREATE OR REPLACE FUNCTION private.enforce_goods_receipt_relationship()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_po public.purchase_orders%ROWTYPE;
BEGIN
  SELECT * INTO v_po FROM public.purchase_orders AS po WHERE po.id = NEW.purchase_order_id;
  IF NOT FOUND OR v_po.legal_entity_id IS DISTINCT FROM NEW.legal_entity_id
     OR v_po.vendor_id IS DISTINCT FROM NEW.vendor_id THEN
    RAISE EXCEPTION 'Goods receipt PO, entity, and vendor must match' USING ERRCODE = '23514';
  END IF;
  IF v_po.po_status NOT IN ('issued','partially_received','closed') THEN
    RAISE EXCEPTION 'Goods receipt requires an issued PO' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION private.enforce_goods_receipt_line_relationship()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.goods_receipts AS gr
    JOIN public.purchase_order_lines AS pol ON pol.id = NEW.purchase_order_line_id
    WHERE gr.id = NEW.goods_receipt_id AND pol.purchase_order_id = gr.purchase_order_id
  ) THEN
    RAISE EXCEPTION 'Receipt line does not belong to receipt PO' USING ERRCODE = '23514';
  END IF;
  IF NEW.quantity_received < 0 OR NEW.quantity_accepted < 0 OR NEW.quantity_rejected < 0
     OR NEW.quantity_accepted + NEW.quantity_rejected > NEW.quantity_received THEN
    RAISE EXCEPTION 'Invalid goods receipt quantities' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION private.enforce_service_entry_relationship()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  v_po public.purchase_orders%ROWTYPE;
  v_contract public.procurement_contracts%ROWTYPE;
BEGIN
  IF NEW.purchase_order_id IS NULL AND NEW.contract_id IS NULL THEN
    RAISE EXCEPTION 'Service entry requires a PO or contract' USING ERRCODE = '23514';
  END IF;
  IF NEW.purchase_order_id IS NOT NULL THEN
    SELECT * INTO v_po FROM public.purchase_orders AS po WHERE po.id = NEW.purchase_order_id;
    IF NOT FOUND OR v_po.legal_entity_id IS DISTINCT FROM NEW.legal_entity_id
       OR v_po.vendor_id IS DISTINCT FROM NEW.vendor_id
       OR v_po.po_status NOT IN ('issued','partially_received','closed') THEN
      RAISE EXCEPTION 'Service entry PO, entity, vendor, or state mismatch' USING ERRCODE = '23514';
    END IF;
    IF NEW.contract_id IS NOT NULL AND v_po.contract_id IS DISTINCT FROM NEW.contract_id THEN
      RAISE EXCEPTION 'Service entry contract does not match PO contract' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW.contract_id IS NOT NULL THEN
    SELECT * INTO v_contract FROM public.procurement_contracts AS pc WHERE pc.id = NEW.contract_id;
    IF NOT FOUND OR v_contract.legal_entity_id IS DISTINCT FROM NEW.legal_entity_id
       OR v_contract.vendor_id IS DISTINCT FROM NEW.vendor_id
       OR v_contract.contract_status NOT IN ('active','approved') THEN
      RAISE EXCEPTION 'Service entry contract, entity, vendor, or state mismatch' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION private.enforce_service_entry_line_relationship()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_entry public.service_entries%ROWTYPE;
BEGIN
  SELECT * INTO v_entry FROM public.service_entries AS se WHERE se.id = NEW.service_entry_id;
  IF NEW.purchase_order_line_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.purchase_order_lines AS pol
    WHERE pol.id = NEW.purchase_order_line_id
      AND pol.purchase_order_id = v_entry.purchase_order_id
  ) THEN
    RAISE EXCEPTION 'Service line does not belong to entry PO' USING ERRCODE = '23514';
  END IF;
  IF NEW.contract_line_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.procurement_contract_lines AS pcl
    WHERE pcl.id = NEW.contract_line_id AND pcl.contract_id = v_entry.contract_id
  ) THEN
    RAISE EXCEPTION 'Service line does not belong to entry contract' USING ERRCODE = '23514';
  END IF;
  IF v_entry.purchase_order_id IS NOT NULL AND NEW.purchase_order_line_id IS NULL THEN
    RAISE EXCEPTION 'PO-backed service line requires a PO line' USING ERRCODE = '23514';
  END IF;
  IF v_entry.contract_id IS NOT NULL AND v_entry.purchase_order_id IS NULL
     AND NEW.contract_line_id IS NULL THEN
    RAISE EXCEPTION 'Contract-only service line requires a contract line' USING ERRCODE = '23514';
  END IF;
  IF NEW.quantity <= 0 OR NEW.unit_price_ex_vat < 0
     OR NEW.accepted_amount IS DISTINCT FROM ROUND(NEW.quantity * NEW.unit_price_ex_vat, 4) THEN
    RAISE EXCEPTION 'Invalid service line amount' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION private.enforce_supplier_invoice_relationship()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_po public.purchase_orders%ROWTYPE;
BEGIN
  SELECT * INTO v_po FROM public.purchase_orders AS po WHERE po.id = NEW.purchase_order_id;
  IF NOT FOUND OR v_po.legal_entity_id IS DISTINCT FROM NEW.legal_entity_id
     OR v_po.vendor_id IS DISTINCT FROM NEW.vendor_id
     OR v_po.po_status IN ('draft','submitted','rejected','cancelled') THEN
    RAISE EXCEPTION 'Invoice PO, entity, vendor, or state mismatch' USING ERRCODE = '23514';
  END IF;
  IF NEW.contract_id IS NOT NULL AND v_po.contract_id IS DISTINCT FROM NEW.contract_id THEN
    RAISE EXCEPTION 'Invoice contract does not match PO contract' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION private.enforce_supplier_invoice_line_relationship()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
BEGIN
  IF NEW.purchase_order_line_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.supplier_invoices AS si
    JOIN public.purchase_order_lines AS pol ON pol.id = NEW.purchase_order_line_id
    WHERE si.id = NEW.supplier_invoice_id AND pol.purchase_order_id = si.purchase_order_id
  ) THEN
    RAISE EXCEPTION 'Invoice line must reference a line on the invoice PO' USING ERRCODE = '23514';
  END IF;
  IF NEW.quantity <= 0 OR NEW.unit_price_ex_vat < 0 OR NEW.vat_amount < 0 THEN
    RAISE EXCEPTION 'Invalid supplier invoice line amounts' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_goods_receipt_relationship ON public.goods_receipts;
CREATE TRIGGER trg_goods_receipt_relationship BEFORE INSERT OR UPDATE
  ON public.goods_receipts FOR EACH ROW EXECUTE FUNCTION private.enforce_goods_receipt_relationship();
DROP TRIGGER IF EXISTS trg_goods_receipt_line_relationship ON public.goods_receipt_lines;
CREATE TRIGGER trg_goods_receipt_line_relationship BEFORE INSERT OR UPDATE
  ON public.goods_receipt_lines FOR EACH ROW EXECUTE FUNCTION private.enforce_goods_receipt_line_relationship();
DROP TRIGGER IF EXISTS trg_service_entry_relationship ON public.service_entries;
CREATE TRIGGER trg_service_entry_relationship BEFORE INSERT OR UPDATE
  ON public.service_entries FOR EACH ROW EXECUTE FUNCTION private.enforce_service_entry_relationship();
DROP TRIGGER IF EXISTS trg_service_entry_line_relationship ON public.service_entry_lines;
CREATE TRIGGER trg_service_entry_line_relationship BEFORE INSERT OR UPDATE
  ON public.service_entry_lines FOR EACH ROW EXECUTE FUNCTION private.enforce_service_entry_line_relationship();
DROP TRIGGER IF EXISTS trg_supplier_invoice_relationship ON public.supplier_invoices;
CREATE TRIGGER trg_supplier_invoice_relationship BEFORE INSERT OR UPDATE
  ON public.supplier_invoices FOR EACH ROW EXECUTE FUNCTION private.enforce_supplier_invoice_relationship();
DROP TRIGGER IF EXISTS trg_supplier_invoice_line_relationship ON public.supplier_invoice_lines;
CREATE TRIGGER trg_supplier_invoice_line_relationship BEFORE INSERT OR UPDATE
  ON public.supplier_invoice_lines FOR EACH ROW EXECUTE FUNCTION private.enforce_supplier_invoice_line_relationship();

REVOKE ALL ON FUNCTION private.enforce_goods_receipt_relationship() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.enforce_goods_receipt_line_relationship() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.enforce_service_entry_relationship() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.enforce_service_entry_line_relationship() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.enforce_supplier_invoice_relationship() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.enforce_supplier_invoice_line_relationship() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.rpc_service_entry_accept(
  p_service_entry_id UUID,
  p_expected_status public.service_entry_status DEFAULT 'draft',
  p_idempotency_key TEXT DEFAULT NULL,
  p_correlation_id UUID DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  v_actor UUID := (SELECT auth.uid());
  v_cmd TEXT := 'service_entry_accept';
  v_replay JSONB;
  v_row public.service_entries%ROWTYPE;
  v_amount NUMERIC(18,4);
  v_ceiling NUMERIC(18,4);
  v_previous NUMERIC(18,4);
  v_line RECORD;
  v_line_previous NUMERIC(18,4);
  v_result JSONB;
BEGIN
  v_replay := private.command_check_idempotency(v_cmd, p_idempotency_key, v_actor);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF v_actor IS NULL OR NOT private.current_user_is_active() THEN
    RETURN private.command_fail('UNAUTHENTICATED','Authentication required');
  END IF;
  SELECT * INTO v_row FROM public.service_entries AS se WHERE se.id = p_service_entry_id FOR UPDATE;
  IF NOT FOUND THEN RETURN private.command_fail('NOT_FOUND','Service entry not found'); END IF;
  IF v_row.entry_status IS DISTINCT FROM p_expected_status THEN
    RETURN private.command_fail('STATE_MISMATCH','Unexpected service entry status');
  END IF;
  IF NOT private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator','procurement_user','cost_controller','budget_owner','approver'],
    v_row.legal_entity_id,'legal_entity',v_row.legal_entity_id
  ) THEN RETURN private.command_fail('FORBIDDEN','Insufficient role to accept service entry'); END IF;
  IF v_row.created_by = v_actor THEN
    RETURN private.command_fail('SOD_VIOLATION','Service entry creator cannot accept own entry');
  END IF;
  IF v_row.fiscal_period_id IS NOT NULL THEN
    PERFORM private.assert_period_open('procurement',v_row.legal_entity_id,v_row.fiscal_period_id);
  END IF;

  SELECT COALESCE(SUM(sel.accepted_amount),0) INTO v_amount
  FROM public.service_entry_lines AS sel WHERE sel.service_entry_id = p_service_entry_id;
  IF v_amount <= 0 THEN RETURN private.command_fail('VALIDATION','Service entry has no positive lines'); END IF;

  IF v_row.purchase_order_id IS NOT NULL THEN
    PERFORM 1 FROM public.purchase_orders AS po WHERE po.id = v_row.purchase_order_id FOR UPDATE;
    SELECT po.total_amount INTO v_ceiling FROM public.purchase_orders AS po WHERE po.id = v_row.purchase_order_id;
    SELECT COALESCE(SUM(se.accepted_amount),0) INTO v_previous
    FROM public.service_entries AS se
    WHERE se.purchase_order_id = v_row.purchase_order_id AND se.entry_status = 'accepted' AND se.id <> p_service_entry_id;
    IF v_previous + v_amount > v_ceiling THEN
      RETURN private.command_fail('CEILING_EXCEEDED','Service acceptance exceeds PO ceiling');
    END IF;
  END IF;

  IF v_row.contract_id IS NOT NULL THEN
    PERFORM 1 FROM public.procurement_contracts AS pc WHERE pc.id = v_row.contract_id FOR UPDATE;
    SELECT pc.ceiling_value INTO v_ceiling FROM public.procurement_contracts AS pc WHERE pc.id = v_row.contract_id;
    SELECT COALESCE(SUM(se.accepted_amount),0) INTO v_previous
    FROM public.service_entries AS se
    WHERE se.contract_id = v_row.contract_id AND se.entry_status = 'accepted' AND se.id <> p_service_entry_id;
    IF v_previous + v_amount > v_ceiling THEN
      RETURN private.command_fail('CEILING_EXCEEDED','Service acceptance exceeds contract ceiling');
    END IF;
    FOR v_line IN
      SELECT sel.contract_line_id, SUM(sel.accepted_amount)::NUMERIC(18,4) AS amount
      FROM public.service_entry_lines AS sel WHERE sel.service_entry_id = p_service_entry_id
      GROUP BY sel.contract_line_id
    LOOP
      IF v_line.contract_line_id IS NOT NULL THEN
        SELECT COALESCE(SUM(sel.accepted_amount),0) INTO v_line_previous
        FROM public.service_entry_lines AS sel
        JOIN public.service_entries AS se ON se.id = sel.service_entry_id
        WHERE sel.contract_line_id = v_line.contract_line_id
          AND se.entry_status = 'accepted' AND se.id <> p_service_entry_id;
        SELECT COALESCE(pcl.line_ceiling,pcl.quantity * pcl.unit_price_ex_vat) INTO v_ceiling
        FROM public.procurement_contract_lines AS pcl WHERE pcl.id = v_line.contract_line_id;
        IF v_line_previous + v_line.amount > v_ceiling THEN
          RETURN private.command_fail('CEILING_EXCEEDED','Service acceptance exceeds contract line ceiling');
        END IF;
      END IF;
    END LOOP;
  END IF;

  UPDATE public.service_entries AS se SET entry_status='accepted', accepted_amount=v_amount,
    accepted_by=v_actor, accepted_at=NOW(), updated_at=NOW(), row_version=se.row_version+1
  WHERE se.id=p_service_entry_id;
  PERFORM private.write_audit_event(v_actor,'update','service_entry',p_service_entry_id,
    v_row.legal_entity_id,NULL,NULL,p_correlation_id,p_idempotency_key,
    jsonb_build_object('status',p_expected_status),
    jsonb_build_object('status','accepted','accepted_amount',v_amount),NULL,NULL);
  v_result := private.command_ok(jsonb_build_object('entity_id',p_service_entry_id,'accepted_amount',v_amount));
  PERFORM private.command_store_idempotency(v_cmd,p_idempotency_key,v_actor,v_result);
  RETURN v_result;
END $function$;

REVOKE ALL ON FUNCTION public.rpc_service_entry_accept(UUID,public.service_entry_status,TEXT,UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_service_entry_accept(UUID,public.service_entry_status,TEXT,UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_service_entry_create(
  p_legal_entity_id UUID, p_vendor_id UUID, p_entry_number TEXT, p_description TEXT,
  p_purchase_order_id UUID DEFAULT NULL, p_contract_id UUID DEFAULT NULL,
  p_lines JSONB DEFAULT '[]', p_fiscal_period_id UUID DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL, p_correlation_id UUID DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  v_actor UUID := (SELECT auth.uid()); v_cmd TEXT := 'service_entry_create'; v_replay JSONB;
  v_entity UUID; v_vendor UUID; v_po public.purchase_orders%ROWTYPE;
  v_contract public.procurement_contracts%ROWTYPE; v_id UUID; v_item JSONB;
  v_ln SMALLINT := 0; v_result JSONB;
BEGIN
  v_replay := private.command_check_idempotency(v_cmd,p_idempotency_key,v_actor);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF v_actor IS NULL OR NOT private.current_user_is_active() THEN
    RETURN private.command_fail('UNAUTHENTICATED','Authentication required');
  END IF;
  IF p_purchase_order_id IS NULL AND p_contract_id IS NULL THEN
    RETURN private.command_fail('VALIDATION','PO or contract required');
  END IF;
  IF jsonb_typeof(COALESCE(p_lines,'[]')) <> 'array' OR jsonb_array_length(COALESCE(p_lines,'[]')) = 0 THEN
    RETURN private.command_fail('VALIDATION','Service entry lines required');
  END IF;
  IF p_purchase_order_id IS NOT NULL THEN
    SELECT * INTO v_po FROM public.purchase_orders AS po WHERE po.id=p_purchase_order_id FOR UPDATE;
    IF NOT FOUND THEN RETURN private.command_fail('NOT_FOUND','PO not found'); END IF;
    IF v_po.po_status NOT IN ('issued','partially_received') THEN
      RETURN private.command_fail('INVALID_STATE','PO is not open for service acceptance');
    END IF;
    v_entity := v_po.legal_entity_id; v_vendor := v_po.vendor_id;
    IF p_contract_id IS NOT NULL AND v_po.contract_id IS DISTINCT FROM p_contract_id THEN
      RETURN private.command_fail('VALIDATION','Contract does not belong to PO');
    END IF;
  END IF;
  IF p_contract_id IS NOT NULL THEN
    SELECT * INTO v_contract FROM public.procurement_contracts AS pc WHERE pc.id=p_contract_id FOR UPDATE;
    IF NOT FOUND OR v_contract.contract_status NOT IN ('approved','active') THEN
      RETURN private.command_fail('INVALID_STATE','Active contract not found');
    END IF;
    IF v_entity IS NOT NULL AND (v_contract.legal_entity_id IS DISTINCT FROM v_entity OR v_contract.vendor_id IS DISTINCT FROM v_vendor) THEN
      RETURN private.command_fail('VALIDATION','PO and contract entity/vendor mismatch');
    END IF;
    v_entity := v_contract.legal_entity_id; v_vendor := v_contract.vendor_id;
  END IF;
  IF p_legal_entity_id IS DISTINCT FROM v_entity OR p_vendor_id IS DISTINCT FROM v_vendor THEN
    RETURN private.command_fail('VALIDATION','Caller entity/vendor does not match authoritative parent');
  END IF;
  IF NOT private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator','procurement_user','cost_controller','budget_owner'],
    v_entity,'legal_entity',v_entity
  ) THEN RETURN private.command_fail('FORBIDDEN','Insufficient role to create service entry'); END IF;
  IF p_fiscal_period_id IS NOT NULL THEN PERFORM private.assert_period_open('procurement',v_entity,p_fiscal_period_id); END IF;

  INSERT INTO public.service_entries(legal_entity_id,purchase_order_id,contract_id,vendor_id,
    entry_number,description,created_by,fiscal_period_id,entry_status)
  VALUES(v_entity,p_purchase_order_id,p_contract_id,v_vendor,btrim(p_entry_number),btrim(p_description),
    v_actor,COALESCE(p_fiscal_period_id,v_po.fiscal_period_id),'draft') RETURNING id INTO v_id;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
    v_ln := v_ln+1;
    INSERT INTO public.service_entry_lines(service_entry_id,purchase_order_line_id,contract_line_id,
      line_number,description,quantity,unit_price_ex_vat,accepted_amount)
    VALUES(v_id,NULLIF(v_item->>'purchase_order_line_id','')::UUID,
      NULLIF(v_item->>'contract_line_id','')::UUID,COALESCE((v_item->>'line_number')::SMALLINT,v_ln),
      COALESCE(NULLIF(btrim(v_item->>'description'),''),p_description),
      COALESCE((v_item->>'quantity')::NUMERIC,1),COALESCE((v_item->>'unit_price_ex_vat')::NUMERIC,0),
      ROUND(COALESCE((v_item->>'quantity')::NUMERIC,1)*COALESCE((v_item->>'unit_price_ex_vat')::NUMERIC,0),4));
  END LOOP;
  PERFORM private.write_audit_event(v_actor,'create','service_entry',v_id,v_entity,NULL,NULL,
    p_correlation_id,p_idempotency_key,NULL,jsonb_build_object('entry_number',p_entry_number,
    'purchase_order_id',p_purchase_order_id,'contract_id',p_contract_id),NULL,NULL);
  v_result:=private.command_ok(jsonb_build_object('entity_id',v_id));
  PERFORM private.command_store_idempotency(v_cmd,p_idempotency_key,v_actor,v_result); RETURN v_result;
END $function$;

REVOKE ALL ON FUNCTION public.rpc_service_entry_create(UUID,UUID,TEXT,TEXT,UUID,UUID,JSONB,UUID,TEXT,UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_service_entry_create(UUID,UUID,TEXT,TEXT,UUID,UUID,JSONB,UUID,TEXT,UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_supplier_invoice_create(
  p_legal_entity_id UUID, p_purchase_order_id UUID, p_vendor_id UUID,
  p_invoice_number TEXT, p_invoice_date DATE, p_gross_amount NUMERIC,
  p_subtotal_ex_vat NUMERIC DEFAULT NULL, p_vat_amount NUMERIC DEFAULT 0,
  p_due_date DATE DEFAULT NULL, p_lines JSONB DEFAULT '[]',
  p_fiscal_period_id UUID DEFAULT NULL, p_idempotency_key TEXT DEFAULT NULL,
  p_correlation_id UUID DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  v_actor UUID := (SELECT auth.uid()); v_cmd TEXT := 'supplier_invoice_create'; v_replay JSONB;
  v_po public.purchase_orders%ROWTYPE; v_id UUID; v_item JSONB; v_ln SMALLINT:=0;
  v_sub NUMERIC(18,4); v_line_sub NUMERIC(18,4); v_line_vat NUMERIC(18,4); v_result JSONB;
BEGIN
  v_replay:=private.command_check_idempotency(v_cmd,p_idempotency_key,v_actor);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF v_actor IS NULL OR NOT private.current_user_is_active() THEN RETURN private.command_fail('UNAUTHENTICATED','Authentication required'); END IF;
  SELECT * INTO v_po FROM public.purchase_orders AS po WHERE po.id=p_purchase_order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN private.command_fail('NOT_FOUND','PO not found'); END IF;
  IF v_po.po_status IN ('draft','submitted','rejected','cancelled') THEN RETURN private.command_fail('INVALID_STATE','PO is not invoiceable'); END IF;
  IF p_legal_entity_id IS DISTINCT FROM v_po.legal_entity_id OR p_vendor_id IS DISTINCT FROM v_po.vendor_id THEN
    RETURN private.command_fail('VALIDATION','Invoice entity/vendor must match PO');
  END IF;
  IF NOT private.user_has_any_role(ARRAY['system_administrator','legal_entity_administrator','procurement_user','finance_user'],
    v_po.legal_entity_id,'legal_entity',v_po.legal_entity_id) THEN RETURN private.command_fail('FORBIDDEN','Insufficient role to create invoice'); END IF;
  IF jsonb_typeof(COALESCE(p_lines,'[]')) <> 'array' OR jsonb_array_length(COALESCE(p_lines,'[]'))=0 THEN
    RETURN private.command_fail('VALIDATION','Invoice lines required');
  END IF;
  IF p_gross_amount <= 0 OR COALESCE(p_vat_amount,0)<0 THEN RETURN private.command_fail('VALIDATION','Invalid invoice totals'); END IF;
  IF COALESCE(p_fiscal_period_id,v_po.fiscal_period_id) IS NOT NULL THEN
    PERFORM private.assert_period_open('procurement',v_po.legal_entity_id,COALESCE(p_fiscal_period_id,v_po.fiscal_period_id));
  END IF;
  v_sub:=ROUND(COALESCE(p_subtotal_ex_vat,p_gross_amount-COALESCE(p_vat_amount,0)),4);
  SELECT ROUND(COALESCE(SUM((x->>'quantity')::NUMERIC*(x->>'unit_price_ex_vat')::NUMERIC),0),4),
         ROUND(COALESCE(SUM(COALESCE((x->>'vat_amount')::NUMERIC,0)),0),4)
    INTO v_line_sub,v_line_vat FROM jsonb_array_elements(p_lines) AS x;
  IF ABS(v_line_sub-v_sub)>0.0001 OR ABS(v_line_vat-COALESCE(p_vat_amount,0))>0.0001
     OR ABS((v_sub+COALESCE(p_vat_amount,0))-p_gross_amount)>0.0001 THEN
    RETURN private.command_fail('RECONCILIATION','Invoice header does not reconcile to lines');
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_lines) AS x
    GROUP BY x->>'purchase_order_line_id' HAVING COUNT(*)>1) THEN
    RETURN private.command_fail('VALIDATION','Duplicate PO line in invoice');
  END IF;

  INSERT INTO public.supplier_invoices(legal_entity_id,purchase_order_id,vendor_id,contract_id,
    invoice_number,invoice_date,due_date,gross_amount,subtotal_ex_vat,vat_amount,match_status,
    invoice_status,fiscal_period_id,created_by,currency_code)
  VALUES(v_po.legal_entity_id,v_po.id,v_po.vendor_id,v_po.contract_id,btrim(p_invoice_number),p_invoice_date,
    p_due_date,p_gross_amount,v_sub,COALESCE(p_vat_amount,0),'unmatched','draft',
    COALESCE(p_fiscal_period_id,v_po.fiscal_period_id),v_actor,v_po.currency_code) RETURNING id INTO v_id;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
    v_ln:=v_ln+1;
    INSERT INTO public.supplier_invoice_lines(supplier_invoice_id,purchase_order_line_id,line_number,
      description,quantity,unit_price_ex_vat,vat_amount)
    VALUES(v_id,(v_item->>'purchase_order_line_id')::UUID,COALESCE((v_item->>'line_number')::SMALLINT,v_ln),
      COALESCE(NULLIF(btrim(v_item->>'description'),''),'Invoice line'),(v_item->>'quantity')::NUMERIC,
      (v_item->>'unit_price_ex_vat')::NUMERIC,COALESCE((v_item->>'vat_amount')::NUMERIC,0));
  END LOOP;
  PERFORM private.write_audit_event(v_actor,'create','supplier_invoice',v_id,v_po.legal_entity_id,NULL,NULL,
    p_correlation_id,p_idempotency_key,NULL,jsonb_build_object('invoice_number',p_invoice_number,
    'purchase_order_id',v_po.id,'gross_amount',p_gross_amount),NULL,NULL);
  v_result:=private.command_ok(jsonb_build_object('entity_id',v_id));
  PERFORM private.command_store_idempotency(v_cmd,p_idempotency_key,v_actor,v_result); RETURN v_result;
END $function$;

REVOKE ALL ON FUNCTION public.rpc_supplier_invoice_create(UUID,UUID,UUID,TEXT,DATE,NUMERIC,NUMERIC,NUMERIC,DATE,JSONB,UUID,TEXT,UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_supplier_invoice_create(UUID,UUID,UUID,TEXT,DATE,NUMERIC,NUMERIC,NUMERIC,DATE,JSONB,UUID,TEXT,UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_supplier_invoice_match(
  p_supplier_invoice_id UUID, p_idempotency_key TEXT DEFAULT NULL,
  p_correlation_id UUID DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  v_actor UUID := (SELECT auth.uid()); v_cmd TEXT := 'supplier_invoice_match'; v_replay JSONB;
  v_inv public.supplier_invoices%ROWTYPE; v_po public.purchase_orders%ROWTYPE;
  v_policy public.procurement_policies%ROWTYPE; v_line RECORD;
  v_prior_qty NUMERIC(18,4); v_prior_amt NUMERIC(18,4); v_receipt_qty NUMERIC(18,4);
  v_service_amt NUMERIC(18,4); v_reference_qty NUMERIC(18,4); v_reference_amt NUMERIC(18,4);
  v_cumulative_qty NUMERIC(18,4); v_cumulative_amt NUMERIC(18,4);
  v_price_variance NUMERIC(18,4); v_qty_variance NUMERIC(18,4); v_amt_variance NUMERIC(18,4);
  v_po_amt NUMERIC(18,4):=0; v_evidence_amt NUMERIC(18,4):=0;
  v_total_qty_variance NUMERIC(18,4):=0; v_total_price_variance NUMERIC(18,4):=0;
  v_total_amt_variance NUMERIC(18,4):=0; v_has_exception BOOLEAN:=false;
  v_goods INTEGER:=0; v_service INTEGER:=0; v_two_way INTEGER:=0; v_line_count INTEGER:=0;
  v_mode TEXT; v_status public.invoice_match_status; v_details JSONB:='[]'; v_result_id UUID; v_result JSONB;
BEGIN
  v_replay:=private.command_check_idempotency(v_cmd,p_idempotency_key,v_actor);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF v_actor IS NULL OR NOT private.current_user_is_active() THEN RETURN private.command_fail('UNAUTHENTICATED','Authentication required'); END IF;
  SELECT * INTO v_inv FROM public.supplier_invoices AS si WHERE si.id=p_supplier_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RETURN private.command_fail('NOT_FOUND','Invoice not found'); END IF;
  IF v_inv.invoice_status NOT IN ('draft','submitted','matched','exception') THEN
    RETURN private.command_fail('INVALID_STATE','Invoice cannot be matched in its current state');
  END IF;
  IF NOT private.user_has_any_role(ARRAY['system_administrator','legal_entity_administrator','procurement_user','finance_user','cost_controller'],
    v_inv.legal_entity_id,'legal_entity',v_inv.legal_entity_id) THEN RETURN private.command_fail('FORBIDDEN','Insufficient role to match invoice'); END IF;
  IF v_inv.fiscal_period_id IS NOT NULL THEN PERFORM private.assert_period_open('procurement',v_inv.legal_entity_id,v_inv.fiscal_period_id); END IF;
  SELECT * INTO v_po FROM public.purchase_orders AS po WHERE po.id=v_inv.purchase_order_id FOR UPDATE;
  IF NOT FOUND OR v_po.legal_entity_id IS DISTINCT FROM v_inv.legal_entity_id OR v_po.vendor_id IS DISTINCT FROM v_inv.vendor_id THEN
    RETURN private.command_fail('VALIDATION','Invoice parent relationship is invalid');
  END IF;
  SELECT * INTO v_policy FROM public.procurement_policies AS pp
  WHERE pp.legal_entity_id=v_inv.legal_entity_id AND pp.status='active'
    AND pp.effective_from<=v_inv.invoice_date AND (pp.effective_to IS NULL OR pp.effective_to>=v_inv.invoice_date)
  ORDER BY pp.effective_from DESC LIMIT 1;
  IF NOT FOUND THEN RETURN private.command_fail('CONFIGURATION','Active procurement policy required'); END IF;

  DELETE FROM public.invoice_match_exceptions WHERE supplier_invoice_id=p_supplier_invoice_id AND is_resolved=false;
  FOR v_line IN
    SELECT sil.*,pol.purchase_order_id,pol.quantity AS po_quantity,pol.unit_price_ex_vat AS po_unit_price,
           pol.line_total_ex_vat AS po_line_total
    FROM public.supplier_invoice_lines AS sil
    JOIN public.purchase_order_lines AS pol ON pol.id=sil.purchase_order_line_id
    WHERE sil.supplier_invoice_id=p_supplier_invoice_id
    ORDER BY sil.line_number FOR UPDATE OF sil
  LOOP
    v_line_count:=v_line_count+1;
    IF v_line.purchase_order_id IS DISTINCT FROM v_po.id THEN RETURN private.command_fail('VALIDATION','Mixed-PO invoice lines are not allowed'); END IF;
    SELECT COALESCE(SUM(other.quantity),0),COALESCE(SUM(other.line_total_ex_vat),0)
      INTO v_prior_qty,v_prior_amt
    FROM public.supplier_invoice_lines AS other
    JOIN public.supplier_invoices AS oi ON oi.id=other.supplier_invoice_id
    WHERE other.purchase_order_line_id=v_line.purchase_order_line_id AND oi.id<>p_supplier_invoice_id
      AND oi.invoice_status IN ('matched','approved','paid')
      AND oi.invoice_status<>'reversed';

    SELECT COALESCE(SUM(grl.quantity_accepted),0) INTO v_receipt_qty
    FROM public.goods_receipt_lines AS grl JOIN public.goods_receipts AS gr ON gr.id=grl.goods_receipt_id
    WHERE grl.purchase_order_line_id=v_line.purchase_order_line_id AND gr.receipt_status='accepted';
    SELECT COALESCE(SUM(sel.accepted_amount),0) INTO v_service_amt
    FROM public.service_entry_lines AS sel JOIN public.service_entries AS se ON se.id=sel.service_entry_id
    WHERE sel.purchase_order_line_id=v_line.purchase_order_line_id AND se.entry_status='accepted';

    IF v_receipt_qty>0 AND v_service_amt>0 THEN
      v_has_exception:=true;
      INSERT INTO public.invoice_match_exceptions(supplier_invoice_id,exception_code,message,amount)
      VALUES(p_supplier_invoice_id,'ambiguous_evidence','PO line has both goods and service evidence',v_line.line_total_ex_vat);
      v_reference_qty:=0; v_reference_amt:=0;
    ELSIF v_receipt_qty>0 THEN
      v_goods:=v_goods+1; v_reference_qty:=v_receipt_qty;
      v_reference_amt:=ROUND(v_receipt_qty*v_line.po_unit_price,4);
    ELSIF v_service_amt>0 THEN
      v_service:=v_service+1; v_reference_qty:=v_line.po_quantity; v_reference_amt:=v_service_amt;
    ELSIF v_policy.allow_two_way_match AND v_inv.subtotal_ex_vat<=v_policy.two_way_match_limit THEN
      v_two_way:=v_two_way+1; v_reference_qty:=v_line.po_quantity; v_reference_amt:=v_line.po_line_total;
    ELSE
      v_has_exception:=true; v_reference_qty:=0; v_reference_amt:=0;
      INSERT INTO public.invoice_match_exceptions(supplier_invoice_id,exception_code,message,amount)
      VALUES(p_supplier_invoice_id,'missing_fulfillment_evidence','Accepted receipt or service entry is required by policy',v_line.line_total_ex_vat);
    END IF;

    v_cumulative_qty:=v_prior_qty+v_line.quantity;
    v_cumulative_amt:=v_prior_amt+v_line.line_total_ex_vat;
    v_qty_variance:=GREATEST(v_cumulative_qty-(v_reference_qty*(1+v_policy.quantity_tolerance_percent/100)),0);
    v_price_variance:=ABS(v_line.unit_price_ex_vat-v_line.po_unit_price);
    v_amt_variance:=GREATEST(v_cumulative_amt-(v_reference_amt+v_policy.invoice_total_tolerance_amount),0);
    IF v_qty_variance>0 THEN
      v_has_exception:=true;
      INSERT INTO public.invoice_match_exceptions(supplier_invoice_id,exception_code,message,amount)
      VALUES(p_supplier_invoice_id,'cumulative_quantity_exceeded','Cumulative invoiced quantity exceeds matched evidence',v_qty_variance);
    END IF;
    IF v_price_variance>ABS(v_line.po_unit_price)*(v_policy.price_tolerance_percent/100) THEN
      v_has_exception:=true;
      INSERT INTO public.invoice_match_exceptions(supplier_invoice_id,exception_code,message,amount)
      VALUES(p_supplier_invoice_id,'unit_price_variance','Invoice unit price exceeds policy tolerance',v_price_variance);
    END IF;
    IF v_amt_variance>0 THEN
      v_has_exception:=true;
      INSERT INTO public.invoice_match_exceptions(supplier_invoice_id,exception_code,message,amount)
      VALUES(p_supplier_invoice_id,'cumulative_amount_exceeded','Cumulative invoiced amount exceeds matched evidence',v_amt_variance);
    END IF;
    v_po_amt:=v_po_amt+ROUND(v_line.quantity*v_line.po_unit_price,4);
    v_evidence_amt:=v_evidence_amt+v_reference_amt;
    v_total_qty_variance:=v_total_qty_variance+v_qty_variance;
    v_total_price_variance:=v_total_price_variance+v_price_variance;
    v_total_amt_variance:=v_total_amt_variance+v_amt_variance;
    v_details:=v_details||jsonb_build_array(jsonb_build_object('invoice_line_id',v_line.id,
      'purchase_order_line_id',v_line.purchase_order_line_id,'prior_invoiced_quantity',v_prior_qty,
      'cumulative_invoiced_quantity',v_cumulative_qty,'reference_quantity',v_reference_qty,
      'prior_invoiced_amount',v_prior_amt,'cumulative_invoiced_amount',v_cumulative_amt,
      'reference_amount',v_reference_amt,'quantity_variance',v_qty_variance,
      'unit_price_variance',v_price_variance,'amount_variance',v_amt_variance));
  END LOOP;
  IF v_line_count=0 THEN RETURN private.command_fail('VALIDATION','Invoice lines required'); END IF;
  IF ABS((SELECT COALESCE(SUM(sil.line_total_ex_vat),0) FROM public.supplier_invoice_lines AS sil WHERE sil.supplier_invoice_id=p_supplier_invoice_id)-v_inv.subtotal_ex_vat)>0.0001
     OR ABS((SELECT COALESCE(SUM(sil.vat_amount),0) FROM public.supplier_invoice_lines AS sil WHERE sil.supplier_invoice_id=p_supplier_invoice_id)-v_inv.vat_amount)>0.0001 THEN
    v_has_exception:=true;
    INSERT INTO public.invoice_match_exceptions(supplier_invoice_id,exception_code,message,amount)
    VALUES(p_supplier_invoice_id,'header_line_reconciliation','Invoice header no longer reconciles to line totals',v_inv.gross_amount);
  END IF;
  v_mode:=CASE WHEN v_goods>0 AND v_service=0 AND v_two_way=0 THEN 'three_way_goods'
    WHEN v_service>0 AND v_goods=0 AND v_two_way=0 THEN 'three_way_service'
    WHEN v_two_way=v_line_count THEN 'two_way_policy_exception' ELSE 'mixed_line_match' END;
  v_status:=CASE WHEN v_has_exception THEN 'exception'::public.invoice_match_status
    WHEN v_total_qty_variance=0 AND v_total_price_variance=0 AND v_total_amt_variance=0 THEN 'matched'::public.invoice_match_status
    ELSE 'matched_within_tolerance'::public.invoice_match_status END;

  INSERT INTO public.invoice_match_results(supplier_invoice_id,match_mode,match_status,po_amount,
    receipt_or_service_amount,invoice_amount,quantity_variance,price_variance,amount_variance,
    tolerance_applied,matched_by,details)
  VALUES(p_supplier_invoice_id,v_mode,v_status,v_po_amt,v_evidence_amt,v_inv.subtotal_ex_vat,
    v_total_qty_variance,v_total_price_variance,v_total_amt_variance,
    jsonb_build_object('quantity_tolerance_percent',v_policy.quantity_tolerance_percent,
      'price_tolerance_percent',v_policy.price_tolerance_percent,
      'invoice_total_tolerance_amount',v_policy.invoice_total_tolerance_amount,
      'allow_two_way_match',v_policy.allow_two_way_match,'two_way_match_limit',v_policy.two_way_match_limit),
    v_actor,jsonb_build_object('lines',v_details))
  ON CONFLICT(supplier_invoice_id) DO UPDATE SET match_mode=EXCLUDED.match_mode,match_status=EXCLUDED.match_status,
    po_amount=EXCLUDED.po_amount,receipt_or_service_amount=EXCLUDED.receipt_or_service_amount,
    invoice_amount=EXCLUDED.invoice_amount,quantity_variance=EXCLUDED.quantity_variance,
    price_variance=EXCLUDED.price_variance,amount_variance=EXCLUDED.amount_variance,
    tolerance_applied=EXCLUDED.tolerance_applied,matched_by=EXCLUDED.matched_by,matched_at=NOW(),details=EXCLUDED.details
  RETURNING id INTO v_result_id;
  UPDATE public.invoice_match_exceptions SET match_result_id=v_result_id
    WHERE supplier_invoice_id=p_supplier_invoice_id AND match_result_id IS NULL;
  UPDATE public.supplier_invoices AS si SET match_status=v_status,
    matched_amount=CASE WHEN v_status IN ('matched','matched_within_tolerance') THEN si.subtotal_ex_vat ELSE 0 END,
    invoice_status=CASE WHEN v_status IN ('matched','matched_within_tolerance') THEN 'matched'::public.invoice_status ELSE 'exception'::public.invoice_status END,
    updated_at=NOW(),row_version=si.row_version+1 WHERE si.id=p_supplier_invoice_id;
  PERFORM private.write_audit_event(v_actor,'update','supplier_invoice',p_supplier_invoice_id,v_inv.legal_entity_id,NULL,NULL,
    p_correlation_id,p_idempotency_key,jsonb_build_object('match_status',v_inv.match_status),
    jsonb_build_object('match_status',v_status,'mode',v_mode,'line_count',v_line_count),NULL,NULL);
  v_result:=private.command_ok(jsonb_build_object('entity_id',p_supplier_invoice_id,'match_status',v_status,
    'match_mode',v_mode,'match_result_id',v_result_id));
  PERFORM private.command_store_idempotency(v_cmd,p_idempotency_key,v_actor,v_result); RETURN v_result;
END $function$;

REVOKE ALL ON FUNCTION public.rpc_supplier_invoice_match(UUID,TEXT,UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_supplier_invoice_match(UUID,TEXT,UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_supplier_invoice_approve(
  p_supplier_invoice_id UUID, p_expected_status public.invoice_status DEFAULT 'matched',
  p_idempotency_key TEXT DEFAULT NULL, p_correlation_id UUID DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  v_actor UUID := (SELECT auth.uid()); v_cmd TEXT := 'supplier_invoice_approve'; v_replay JSONB;
  v_inv public.supplier_invoices%ROWTYPE; v_po public.purchase_orders%ROWTYPE;
  v_commit public.commitments%ROWTYPE; v_line RECORD; v_relief NUMERIC(18,4):=0;
  v_open NUMERIC(18,4); v_result JSONB;
BEGIN
  v_replay:=private.command_check_idempotency(v_cmd,p_idempotency_key,v_actor);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF v_actor IS NULL OR NOT private.current_user_is_active() THEN RETURN private.command_fail('UNAUTHENTICATED','Authentication required'); END IF;
  SELECT * INTO v_inv FROM public.supplier_invoices AS si WHERE si.id=p_supplier_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RETURN private.command_fail('NOT_FOUND','Invoice not found'); END IF;
  IF v_inv.invoice_status IS DISTINCT FROM p_expected_status THEN RETURN private.command_fail('STATE_MISMATCH','Unexpected invoice status'); END IF;
  IF v_inv.match_status NOT IN ('matched','matched_within_tolerance','overridden') THEN RETURN private.command_fail('INVALID_STATE','Invoice must be matched before approval'); END IF;
  IF NOT private.user_has_any_role(ARRAY['system_administrator','legal_entity_administrator','finance_user','approver'],
    v_inv.legal_entity_id,'legal_entity',v_inv.legal_entity_id) THEN RETURN private.command_fail('FORBIDDEN','Insufficient role to approve invoice'); END IF;
  IF v_inv.created_by=v_actor OR v_inv.submitted_by=v_actor THEN RETURN private.command_fail('SOD_VIOLATION','Invoice recorder cannot approve'); END IF;
  SELECT * INTO v_po FROM public.purchase_orders AS po WHERE po.id=v_inv.purchase_order_id FOR UPDATE;
  IF NOT FOUND OR v_po.commitment_id IS NULL THEN RETURN private.command_fail('ACCOUNTING','PO commitment is missing'); END IF;
  SELECT * INTO v_commit FROM public.commitments AS c WHERE c.id=v_po.commitment_id FOR UPDATE;
  IF NOT FOUND OR v_commit.legal_entity_id IS DISTINCT FROM v_inv.legal_entity_id THEN RETURN private.command_fail('ACCOUNTING','Commitment relationship is invalid'); END IF;
  FOR v_line IN SELECT sil.* FROM public.supplier_invoice_lines AS sil
    WHERE sil.supplier_invoice_id=p_supplier_invoice_id ORDER BY sil.id FOR UPDATE LOOP
    v_relief:=v_relief+v_line.line_total_ex_vat;
  END LOOP;
  IF v_relief<=0 THEN RETURN private.command_fail('RECONCILIATION','Invoice has no commitment-relief amount'); END IF;
  v_open:=v_commit.original_value+v_commit.approved_variations-v_commit.cancelled_amount-v_commit.invoiced_applied;
  IF v_relief>v_open+0.0001 THEN RETURN private.command_fail('COMMITMENT_EXCEEDED','Invoice relief exceeds remaining commitment'); END IF;
  INSERT INTO public.invoice_commitment_applications(legal_entity_id,supplier_invoice_id,supplier_invoice_line_id,
    commitment_id,applied_amount,applied_by)
  SELECT v_inv.legal_entity_id,p_supplier_invoice_id,sil.id,v_commit.id,sil.line_total_ex_vat,v_actor
  FROM public.supplier_invoice_lines AS sil WHERE sil.supplier_invoice_id=p_supplier_invoice_id;
  UPDATE public.commitments AS c SET invoiced_applied=(SELECT COALESCE(SUM(ica.applied_amount),0)
    FROM public.invoice_commitment_applications AS ica WHERE ica.commitment_id=c.id AND ica.application_status='applied')
    WHERE c.id=v_commit.id;
  UPDATE public.supplier_invoices AS si SET invoice_status='approved',approved_by=v_actor,approved_at=NOW(),
    updated_at=NOW(),row_version=si.row_version+1 WHERE si.id=p_supplier_invoice_id;
  PERFORM private.write_audit_event(v_actor,'approve','supplier_invoice',p_supplier_invoice_id,v_inv.legal_entity_id,NULL,NULL,
    p_correlation_id,p_idempotency_key,jsonb_build_object('status',p_expected_status),
    jsonb_build_object('status','approved','commitment_id',v_commit.id,'commitment_relief',v_relief),NULL,NULL);
  v_result:=private.command_ok(jsonb_build_object('entity_id',p_supplier_invoice_id,'invoice_status','approved',
    'commitment_id',v_commit.id,'commitment_relief',v_relief));
  PERFORM private.command_store_idempotency(v_cmd,p_idempotency_key,v_actor,v_result); RETURN v_result;
END $function$;

REVOKE ALL ON FUNCTION public.rpc_supplier_invoice_approve(UUID,public.invoice_status,TEXT,UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_supplier_invoice_approve(UUID,public.invoice_status,TEXT,UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_supplier_invoice_reverse_and_replace(
  p_supplier_invoice_id UUID, p_reason TEXT, p_replacement_invoice_number TEXT DEFAULT NULL,
  p_replacement_invoice_date DATE DEFAULT NULL, p_idempotency_key TEXT DEFAULT NULL,
  p_correlation_id UUID DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  v_actor UUID := (SELECT auth.uid()); v_cmd TEXT := 'supplier_invoice_reverse_and_replace'; v_replay JSONB;
  v_inv public.supplier_invoices%ROWTYPE; v_commitment_id UUID; v_replacement UUID; v_result JSONB;
BEGIN
  v_replay:=private.command_check_idempotency(v_cmd,p_idempotency_key,v_actor);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF v_actor IS NULL OR NOT private.current_user_is_active() THEN RETURN private.command_fail('UNAUTHENTICATED','Authentication required'); END IF;
  IF p_reason IS NULL OR length(btrim(p_reason))<5 THEN RETURN private.command_fail('VALIDATION','Reversal reason required'); END IF;
  SELECT * INTO v_inv FROM public.supplier_invoices AS si WHERE si.id=p_supplier_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RETURN private.command_fail('NOT_FOUND','Invoice not found'); END IF;
  IF v_inv.invoice_status<>'approved' THEN RETURN private.command_fail('STATE_MISMATCH','Only approved invoices can be reversed'); END IF;
  IF NOT private.user_has_any_role(ARRAY['system_administrator','legal_entity_administrator','finance_user'],
    v_inv.legal_entity_id,'legal_entity',v_inv.legal_entity_id) THEN RETURN private.command_fail('FORBIDDEN','Insufficient role to reverse invoice'); END IF;
  IF v_inv.approved_by=v_actor THEN RETURN private.command_fail('SOD_VIOLATION','Invoice approver cannot reverse the same invoice'); END IF;
  IF EXISTS(SELECT 1 FROM public.payment_requests AS pr WHERE pr.supplier_invoice_id=p_supplier_invoice_id
    AND pr.request_status IN ('submitted','approved','released')) THEN
    RETURN private.command_fail('PAYMENT_EXISTS','Cancel active payment requests before reversing invoice');
  END IF;
  SELECT ica.commitment_id INTO v_commitment_id FROM public.invoice_commitment_applications AS ica
    WHERE ica.supplier_invoice_id=p_supplier_invoice_id AND ica.application_status='applied'
    ORDER BY ica.id LIMIT 1 FOR UPDATE;
  IF v_commitment_id IS NULL THEN RETURN private.command_fail('RECONCILIATION','Applied commitment relief not found'); END IF;
  PERFORM 1 FROM public.commitments AS c WHERE c.id=v_commitment_id FOR UPDATE;
  UPDATE public.invoice_commitment_applications SET application_status='reversed',reversed_by=v_actor,
    reversed_at=NOW(),reversal_reason=btrim(p_reason)
    WHERE supplier_invoice_id=p_supplier_invoice_id AND application_status='applied';
  UPDATE public.commitments AS c SET invoiced_applied=(SELECT COALESCE(SUM(ica.applied_amount),0)
    FROM public.invoice_commitment_applications AS ica WHERE ica.commitment_id=c.id AND ica.application_status='applied')
    WHERE c.id=v_commitment_id;
  UPDATE public.supplier_invoices AS si SET invoice_status='reversed',reversed_by=v_actor,reversed_at=NOW(),
    reversal_reason=btrim(p_reason),updated_at=NOW(),row_version=si.row_version+1 WHERE si.id=p_supplier_invoice_id;
  IF NULLIF(btrim(p_replacement_invoice_number),'') IS NOT NULL THEN
    INSERT INTO public.supplier_invoices(legal_entity_id,purchase_order_id,vendor_id,contract_id,invoice_number,
      invoice_date,due_date,gross_amount,subtotal_ex_vat,vat_amount,match_status,invoice_status,
      currency_code,fiscal_period_id,created_by,replacement_of_invoice_id)
    VALUES(v_inv.legal_entity_id,v_inv.purchase_order_id,v_inv.vendor_id,v_inv.contract_id,btrim(p_replacement_invoice_number),
      COALESCE(p_replacement_invoice_date,CURRENT_DATE),v_inv.due_date,v_inv.gross_amount,v_inv.subtotal_ex_vat,
      v_inv.vat_amount,'unmatched','draft',v_inv.currency_code,v_inv.fiscal_period_id,v_actor,v_inv.id)
    RETURNING id INTO v_replacement;
    INSERT INTO public.supplier_invoice_lines(supplier_invoice_id,purchase_order_line_id,line_number,description,
      quantity,unit_price_ex_vat,vat_amount)
    SELECT v_replacement,sil.purchase_order_line_id,sil.line_number,sil.description,sil.quantity,sil.unit_price_ex_vat,sil.vat_amount
    FROM public.supplier_invoice_lines AS sil WHERE sil.supplier_invoice_id=p_supplier_invoice_id ORDER BY sil.line_number;
  END IF;
  PERFORM private.write_audit_event(v_actor,'reverse','supplier_invoice',p_supplier_invoice_id,v_inv.legal_entity_id,NULL,NULL,
    p_correlation_id,p_idempotency_key,jsonb_build_object('status','approved'),
    jsonb_build_object('status','reversed','commitment_id',v_commitment_id,'replacement_invoice_id',v_replacement),p_reason,NULL);
  IF v_replacement IS NOT NULL THEN
    PERFORM private.write_audit_event(v_actor,'create','supplier_invoice',v_replacement,v_inv.legal_entity_id,NULL,NULL,
      p_correlation_id,p_idempotency_key,NULL,jsonb_build_object('replacement_of_invoice_id',p_supplier_invoice_id,
      'status','draft'),p_reason,NULL);
  END IF;
  v_result:=private.command_ok(jsonb_build_object('entity_id',p_supplier_invoice_id,'invoice_status','reversed',
    'replacement_invoice_id',v_replacement));
  PERFORM private.command_store_idempotency(v_cmd,p_idempotency_key,v_actor,v_result); RETURN v_result;
END $function$;

REVOKE ALL ON FUNCTION public.rpc_supplier_invoice_reverse_and_replace(UUID,TEXT,TEXT,DATE,TEXT,UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_supplier_invoice_reverse_and_replace(UUID,TEXT,TEXT,DATE,TEXT,UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_payment_request_reject(
  p_payment_request_id UUID, p_reason TEXT,
  p_expected_status public.payment_request_status DEFAULT 'submitted',
  p_idempotency_key TEXT DEFAULT NULL,p_correlation_id UUID DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_actor UUID:=(SELECT auth.uid()); v_cmd TEXT:='payment_request_reject'; v_replay JSONB;
  v_row public.payment_requests%ROWTYPE; v_result JSONB;
BEGIN
  v_replay:=private.command_check_idempotency(v_cmd,p_idempotency_key,v_actor);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF v_actor IS NULL OR NOT private.current_user_is_active() THEN RETURN private.command_fail('UNAUTHENTICATED','Authentication required'); END IF;
  SELECT * INTO v_row FROM public.payment_requests AS pr WHERE pr.id=p_payment_request_id FOR UPDATE;
  IF NOT FOUND THEN RETURN private.command_fail('NOT_FOUND','Payment request not found'); END IF;
  IF v_row.request_status IS DISTINCT FROM p_expected_status OR p_expected_status<>'submitted' THEN RETURN private.command_fail('STATE_MISMATCH','Only submitted requests can be rejected'); END IF;
  IF v_row.requested_by=v_actor THEN RETURN private.command_fail('SOD_VIOLATION','Requester cannot reject own request'); END IF;
  IF p_reason IS NULL OR length(btrim(p_reason))<5 THEN RETURN private.command_fail('VALIDATION','Rejection reason required'); END IF;
  IF NOT private.user_has_any_role(ARRAY['system_administrator','legal_entity_administrator','finance_user','approver'],
    v_row.legal_entity_id,'legal_entity',v_row.legal_entity_id) THEN RETURN private.command_fail('FORBIDDEN','Insufficient role'); END IF;
  UPDATE public.payment_requests AS pr SET request_status='rejected',updated_at=NOW(),row_version=pr.row_version+1 WHERE pr.id=p_payment_request_id;
  PERFORM private.write_audit_event(v_actor,'reject','payment_request',p_payment_request_id,v_row.legal_entity_id,NULL,NULL,
    p_correlation_id,p_idempotency_key,jsonb_build_object('status',p_expected_status),jsonb_build_object('status','rejected'),p_reason,NULL);
  v_result:=private.command_ok(jsonb_build_object('entity_id',p_payment_request_id,'request_status','rejected'));
  PERFORM private.command_store_idempotency(v_cmd,p_idempotency_key,v_actor,v_result); RETURN v_result;
END $function$;

CREATE OR REPLACE FUNCTION public.rpc_payment_request_cancel(
  p_payment_request_id UUID,p_reason TEXT,p_expected_status public.payment_request_status,
  p_idempotency_key TEXT DEFAULT NULL,p_correlation_id UUID DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_actor UUID:=(SELECT auth.uid()); v_cmd TEXT:='payment_request_cancel'; v_replay JSONB;
  v_row public.payment_requests%ROWTYPE; v_result JSONB;
BEGIN
  v_replay:=private.command_check_idempotency(v_cmd,p_idempotency_key,v_actor);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF v_actor IS NULL OR NOT private.current_user_is_active() THEN RETURN private.command_fail('UNAUTHENTICATED','Authentication required'); END IF;
  SELECT * INTO v_row FROM public.payment_requests AS pr WHERE pr.id=p_payment_request_id FOR UPDATE;
  IF NOT FOUND THEN RETURN private.command_fail('NOT_FOUND','Payment request not found'); END IF;
  IF v_row.request_status IS DISTINCT FROM p_expected_status OR p_expected_status NOT IN ('draft','submitted','approved') THEN
    RETURN private.command_fail('STATE_MISMATCH','Request is not cancellable'); END IF;
  IF p_reason IS NULL OR length(btrim(p_reason))<5 THEN RETURN private.command_fail('VALIDATION','Cancellation reason required'); END IF;
  IF v_row.requested_by<>v_actor AND NOT private.user_has_any_role(ARRAY['system_administrator','legal_entity_administrator','finance_user'],
    v_row.legal_entity_id,'legal_entity',v_row.legal_entity_id) THEN RETURN private.command_fail('FORBIDDEN','Insufficient role'); END IF;
  IF p_expected_status='approved' AND v_row.requested_by=v_actor THEN RETURN private.command_fail('SOD_VIOLATION','Requester cannot cancel an approved request'); END IF;
  UPDATE public.payment_requests AS pr SET request_status='cancelled',updated_at=NOW(),row_version=pr.row_version+1 WHERE pr.id=p_payment_request_id;
  PERFORM private.write_audit_event(v_actor,'cancel','payment_request',p_payment_request_id,v_row.legal_entity_id,NULL,NULL,
    p_correlation_id,p_idempotency_key,jsonb_build_object('status',p_expected_status),jsonb_build_object('status','cancelled'),p_reason,NULL);
  v_result:=private.command_ok(jsonb_build_object('entity_id',p_payment_request_id,'request_status','cancelled'));
  PERFORM private.command_store_idempotency(v_cmd,p_idempotency_key,v_actor,v_result); RETURN v_result;
END $function$;

REVOKE ALL ON FUNCTION public.rpc_payment_request_reject(UUID,TEXT,public.payment_request_status,TEXT,UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_payment_request_cancel(UUID,TEXT,public.payment_request_status,TEXT,UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_payment_request_reject(UUID,TEXT,public.payment_request_status,TEXT,UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_payment_request_cancel(UUID,TEXT,public.payment_request_status,TEXT,UUID) TO authenticated;

-- Freeze submitted sourcing evidence and bind every award to the authoritative
-- evaluation, quotation, quotation line, and server-quoted price.
CREATE UNIQUE INDEX IF NOT EXISTS uq_award_rfq_line
  ON public.sourcing_award_lines (award_id, rfq_line_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_award_quotation_line
  ON public.sourcing_award_lines (award_id, quotation_line_id)
  WHERE quotation_line_id IS NOT NULL;

CREATE OR REPLACE FUNCTION private.enforce_evaluation_immutability()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
BEGIN
  IF TG_OP='UPDATE' AND OLD.evaluation_status IN ('submitted','finalized') THEN
    RAISE EXCEPTION 'Submitted sourcing evaluation is immutable' USING ERRCODE='55000';
  END IF;
  IF TG_OP='DELETE' AND OLD.evaluation_status IN ('submitted','finalized') THEN
    RAISE EXCEPTION 'Submitted sourcing evaluation is immutable' USING ERRCODE='55000';
  END IF;
  IF TG_OP='INSERT' AND EXISTS(SELECT 1 FROM public.rfqs AS r WHERE r.id=NEW.rfq_id AND r.rfq_status IN ('awarded','closed','cancelled')) THEN
    RAISE EXCEPTION 'Cannot evaluate a finalized RFQ' USING ERRCODE='55000';
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $function$;

CREATE OR REPLACE FUNCTION private.enforce_evaluation_score_immutability()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_evaluation UUID:=COALESCE(NEW.evaluation_id,OLD.evaluation_id);
BEGIN
  IF EXISTS(SELECT 1 FROM public.sourcing_evaluations AS se WHERE se.id=v_evaluation
    AND se.evaluation_status IN ('submitted','finalized')) THEN
    RAISE EXCEPTION 'Scores for a submitted evaluation are immutable' USING ERRCODE='55000';
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $function$;

CREATE OR REPLACE FUNCTION private.enforce_evaluation_criteria_immutability()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_rfq UUID:=COALESCE(NEW.rfq_id,OLD.rfq_id);
BEGIN
  IF EXISTS(SELECT 1 FROM public.sourcing_evaluations AS se WHERE se.rfq_id=v_rfq
    AND se.evaluation_status IN ('submitted','finalized'))
     OR EXISTS(SELECT 1 FROM public.sourcing_awards AS sa WHERE sa.rfq_id=v_rfq
       AND sa.award_status NOT IN ('rejected','cancelled')) THEN
    RAISE EXCEPTION 'Evaluation criteria are frozen after submission' USING ERRCODE='55000';
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $function$;

CREATE OR REPLACE FUNCTION private.enforce_sourcing_award_relationship()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_rfq public.rfqs%ROWTYPE; v_quote public.supplier_quotations%ROWTYPE; v_eval public.sourcing_evaluations%ROWTYPE;
BEGIN
  IF TG_OP='INSERT' THEN
    SELECT * INTO v_rfq FROM public.rfqs AS r WHERE r.id=NEW.rfq_id;
    SELECT * INTO v_quote FROM public.supplier_quotations AS sq WHERE sq.id=NEW.quotation_id;
    IF NEW.evaluation_id IS NULL THEN
      SELECT se.id INTO NEW.evaluation_id FROM public.sourcing_evaluations AS se
      WHERE se.rfq_id=NEW.rfq_id AND se.quotation_id=NEW.quotation_id
        AND se.evaluation_status IN ('submitted','finalized') AND NOT se.has_mandatory_failure
      ORDER BY se.submitted_at DESC,se.id LIMIT 1;
    END IF;
    SELECT * INTO v_eval FROM public.sourcing_evaluations AS se WHERE se.id=NEW.evaluation_id;
    IF NOT FOUND OR NEW.evaluation_id IS NULL THEN RAISE EXCEPTION 'Submitted evaluation required for award' USING ERRCODE='23514'; END IF;
    IF v_rfq.legal_entity_id IS DISTINCT FROM NEW.legal_entity_id OR v_rfq.rfq_status NOT IN ('responses_closed','evaluation') THEN
      RAISE EXCEPTION 'Award RFQ entity or state mismatch' USING ERRCODE='23514'; END IF;
    IF v_quote.rfq_id IS DISTINCT FROM NEW.rfq_id OR v_quote.legal_entity_id IS DISTINCT FROM NEW.legal_entity_id
       OR v_quote.vendor_id IS DISTINCT FROM NEW.vendor_id OR v_quote.quotation_status NOT IN ('validated','accepted_for_evaluation') THEN
      RAISE EXCEPTION 'Award quotation is not eligible for this RFQ' USING ERRCODE='23514'; END IF;
    IF v_eval.rfq_id IS DISTINCT FROM NEW.rfq_id OR v_eval.quotation_id IS DISTINCT FROM NEW.quotation_id
       OR v_eval.legal_entity_id IS DISTINCT FROM NEW.legal_entity_id
       OR v_eval.evaluation_status NOT IN ('submitted','finalized') OR v_eval.has_mandatory_failure THEN
      RAISE EXCEPTION 'Award evaluation relationship or compliance failure' USING ERRCODE='23514'; END IF;
  ELSIF OLD.award_status IN ('submitted','approved') AND (
    ROW(NEW.rfq_id,NEW.quotation_id,NEW.evaluation_id,NEW.vendor_id)
      IS DISTINCT FROM ROW(OLD.rfq_id,OLD.quotation_id,OLD.evaluation_id,OLD.vendor_id)
    OR (NEW.total_amount IS DISTINCT FROM OLD.total_amount AND NOT (
      OLD.award_status='submitted' AND OLD.total_amount=0 AND NEW.total_amount>0
    ))
  ) THEN
    RAISE EXCEPTION 'Submitted award relationships and amount are immutable' USING ERRCODE='55000';
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION private.enforce_sourcing_award_line_relationship()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_award public.sourcing_awards%ROWTYPE; v_rfq_line public.rfq_lines%ROWTYPE; v_quote_line public.supplier_quotation_lines%ROWTYPE;
BEGIN
  SELECT * INTO v_award FROM public.sourcing_awards AS sa WHERE sa.id=NEW.award_id;
  IF TG_OP='UPDATE' AND v_award.award_status IN ('submitted','approved') THEN
    RAISE EXCEPTION 'Submitted award lines are immutable' USING ERRCODE='55000';
  END IF;
  SELECT * INTO v_rfq_line FROM public.rfq_lines AS rl WHERE rl.id=NEW.rfq_line_id;
  SELECT * INTO v_quote_line FROM public.supplier_quotation_lines AS sqln WHERE sqln.id=NEW.quotation_line_id;
  IF NOT FOUND OR NEW.quotation_line_id IS NULL THEN RAISE EXCEPTION 'Quotation line required' USING ERRCODE='23514'; END IF;
  IF v_rfq_line.rfq_id IS DISTINCT FROM v_award.rfq_id OR v_rfq_line.requisition_line_id IS DISTINCT FROM NEW.requisition_line_id THEN
    RAISE EXCEPTION 'Award RFQ/requisition line relationship mismatch' USING ERRCODE='23514'; END IF;
  IF v_quote_line.quotation_id IS DISTINCT FROM v_award.quotation_id OR v_quote_line.rfq_line_id IS DISTINCT FROM NEW.rfq_line_id THEN
    RAISE EXCEPTION 'Award quotation line relationship mismatch' USING ERRCODE='23514'; END IF;
  IF NEW.awarded_quantity<=0 OR NEW.awarded_quantity>v_quote_line.quoted_quantity THEN
    RAISE EXCEPTION 'Award quantity exceeds quoted quantity' USING ERRCODE='23514'; END IF;
  IF NEW.unit_price_ex_vat IS DISTINCT FROM v_quote_line.unit_price_ex_vat THEN
    RAISE EXCEPTION 'Award price must equal authoritative quoted price' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_sourcing_evaluation_immutable ON public.sourcing_evaluations;
CREATE TRIGGER trg_sourcing_evaluation_immutable BEFORE INSERT OR UPDATE OR DELETE ON public.sourcing_evaluations
  FOR EACH ROW EXECUTE FUNCTION private.enforce_evaluation_immutability();
DROP TRIGGER IF EXISTS trg_sourcing_evaluation_score_immutable ON public.sourcing_evaluation_scores;
CREATE TRIGGER trg_sourcing_evaluation_score_immutable BEFORE INSERT OR UPDATE OR DELETE ON public.sourcing_evaluation_scores
  FOR EACH ROW EXECUTE FUNCTION private.enforce_evaluation_score_immutability();
DROP TRIGGER IF EXISTS trg_evaluation_criteria_immutable ON public.evaluation_criteria;
CREATE TRIGGER trg_evaluation_criteria_immutable BEFORE INSERT OR UPDATE OR DELETE ON public.evaluation_criteria
  FOR EACH ROW EXECUTE FUNCTION private.enforce_evaluation_criteria_immutability();
DROP TRIGGER IF EXISTS trg_sourcing_award_relationship ON public.sourcing_awards;
CREATE TRIGGER trg_sourcing_award_relationship BEFORE INSERT OR UPDATE ON public.sourcing_awards
  FOR EACH ROW EXECUTE FUNCTION private.enforce_sourcing_award_relationship();
DROP TRIGGER IF EXISTS trg_sourcing_award_line_relationship ON public.sourcing_award_lines;
CREATE TRIGGER trg_sourcing_award_line_relationship BEFORE INSERT OR UPDATE ON public.sourcing_award_lines
  FOR EACH ROW EXECUTE FUNCTION private.enforce_sourcing_award_line_relationship();

REVOKE ALL ON FUNCTION private.enforce_evaluation_immutability() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.enforce_evaluation_score_immutability() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.enforce_evaluation_criteria_immutability() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.enforce_sourcing_award_relationship() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.enforce_sourcing_award_line_relationship() FROM PUBLIC;

-- =============================================================================
-- Authoritative delegated approvals
-- =============================================================================

ALTER TABLE public.approval_decision_audit
  ADD COLUMN IF NOT EXISTS actual_actor_user_id UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS original_assignee_user_id UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS delegated_from_user_id UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS workflow_object_type TEXT,
  ADD COLUMN IF NOT EXISTS workflow_object_id UUID,
  ADD COLUMN IF NOT EXISTS decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE OR REPLACE FUNCTION private.find_workflow_assignee(
  p_legal_entity_id UUID,p_excluded_user_id UUID,p_role_codes TEXT[]
)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $function$
  SELECT ra.user_id
  FROM public.role_assignments AS ra
  JOIN public.roles AS r ON r.id=ra.role_id
  JOIN public.profiles AS p ON p.id=ra.user_id AND p.status='active'
  JOIN public.legal_entities AS le ON le.id=p_legal_entity_id
  LEFT JOIN public.memberships AS m ON m.user_id=ra.user_id AND m.status='active'
    AND (m.legal_entity_id=p_legal_entity_id OR (m.legal_entity_id IS NULL AND m.organization_id=le.organization_id))
  WHERE r.code=ANY(p_role_codes) AND ra.user_id IS DISTINCT FROM p_excluded_user_id
    AND ra.effective_start<=CURRENT_DATE AND (ra.effective_end IS NULL OR ra.effective_end>=CURRENT_DATE)
    AND m.id IS NOT NULL
    AND ((ra.scope_type='legal_entity' AND ra.scope_id=p_legal_entity_id)
      OR (r.code='system_administrator' AND ra.scope_type='group' AND ra.scope_id=le.organization_id))
  ORDER BY array_position(p_role_codes,r.code),ra.user_id
  LIMIT 1
$function$;

CREATE OR REPLACE FUNCTION private.create_workflow_assignment(
  p_legal_entity_id UUID,p_item_type public.approval_item_type,p_workflow_type TEXT,
  p_permission_code TEXT,p_entity_id UUID,p_title_en TEXT,p_title_ar TEXT,
  p_requester_id UUID,p_financial_amount NUMERIC,p_role_codes TEXT[],p_due_date DATE DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_assignee UUID; v_id UUID;
BEGIN
  v_assignee:=private.find_workflow_assignee(p_legal_entity_id,p_requester_id,p_role_codes);
  IF v_assignee IS NULL THEN RAISE EXCEPTION 'No qualified independent workflow assignee configured' USING ERRCODE='P0001'; END IF;
  INSERT INTO public.workflow_approval_assignments(legal_entity_id,item_type,workflow_type,permission_code,
    entity_id,title_en,title_ar,requester_id,original_assignee_id,financial_amount,due_date)
  VALUES(p_legal_entity_id,p_item_type,p_workflow_type,p_permission_code,p_entity_id,
    COALESCE(NULLIF(p_title_en,''),p_workflow_type),COALESCE(NULLIF(p_title_ar,''),p_title_en,p_workflow_type),
    p_requester_id,v_assignee,p_financial_amount,p_due_date)
  ON CONFLICT(item_type,entity_id) WHERE assignment_status='pending' DO UPDATE SET
    title_en=EXCLUDED.title_en,title_ar=EXCLUDED.title_ar,financial_amount=EXCLUDED.financial_amount,
    updated_at=NOW(),row_version=public.workflow_approval_assignments.row_version+1
  RETURNING id INTO v_id;
  PERFORM private.notify_user(v_assignee,'Approval assigned','تم تعيين موافقة',p_item_type::TEXT,p_entity_id);
  RETURN v_id;
END $function$;

CREATE OR REPLACE FUNCTION private.sync_workflow_assignment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_actor UUID:=(SELECT auth.uid()); v_status TEXT; v_decision TEXT;
BEGIN
  IF v_actor IS NULL THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME='purchase_requisitions' THEN
    IF NEW.requisition_status='procurement_review' AND OLD.requisition_status IS DISTINCT FROM NEW.requisition_status THEN
      PERFORM private.create_workflow_assignment(NEW.legal_entity_id,'purchase_requisition','purchase_requisition',
        'commitment.approve',NEW.id,NEW.title_en,NEW.title_ar,NEW.requester_id,NEW.estimated_total,
        ARRAY['approver','legal_entity_administrator','system_administrator'],NULL);
    END IF;
    v_status:=NEW.requisition_status::TEXT;
  ELSIF TG_TABLE_NAME='payment_requests' THEN
    IF NEW.request_status='submitted' AND OLD.request_status IS DISTINCT FROM NEW.request_status THEN
      PERFORM private.create_workflow_assignment(NEW.legal_entity_id,'payment_request','payment_request',
        'payment.approve',NEW.id,'Payment request','طلب دفع',NEW.requested_by,NEW.amount,
        ARRAY['approver','finance_user','legal_entity_administrator','system_administrator'],NEW.due_date);
    END IF;
    v_status:=NEW.request_status::TEXT;
  ELSIF TG_TABLE_NAME='sourcing_awards' THEN
    IF TG_OP='INSERT' AND NEW.award_status='submitted' THEN
      PERFORM private.create_workflow_assignment(NEW.legal_entity_id,'sourcing_award','sourcing_award',
        'commitment.approve',NEW.id,'Sourcing award','ترسية توريد',NEW.submitted_by,NEW.total_amount,
        ARRAY['approver','finance_user','legal_entity_administrator','system_administrator'],NULL);
    END IF;
    IF TG_OP='UPDATE' AND NEW.award_status='submitted' AND NEW.total_amount IS DISTINCT FROM OLD.total_amount THEN
      UPDATE public.workflow_approval_assignments AS waa SET financial_amount=NEW.total_amount,
        updated_at=NOW(),row_version=waa.row_version+1
      WHERE waa.item_type='sourcing_award' AND waa.entity_id=NEW.id AND waa.assignment_status='pending';
    END IF;
    v_status:=NEW.award_status::TEXT;
  END IF;
  IF v_status IN ('approved','rejected','cancelled') THEN
    v_decision:=CASE WHEN v_status='approved' THEN 'approve' WHEN v_status='rejected' THEN 'reject' ELSE 'cancel' END;
    UPDATE public.workflow_approval_assignments AS waa SET assignment_status=v_status,
      decision=v_decision,decided_by=v_actor,decided_at=NOW(),updated_at=NOW(),row_version=waa.row_version+1
    WHERE waa.entity_id=NEW.id AND waa.item_type=CASE TG_TABLE_NAME
      WHEN 'purchase_requisitions' THEN 'purchase_requisition'::public.approval_item_type
      WHEN 'payment_requests' THEN 'payment_request'::public.approval_item_type
      ELSE 'sourcing_award'::public.approval_item_type END
      AND waa.assignment_status='pending';
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_requisition_assignment_sync ON public.purchase_requisitions;
CREATE TRIGGER trg_requisition_assignment_sync AFTER UPDATE ON public.purchase_requisitions
  FOR EACH ROW EXECUTE FUNCTION private.sync_workflow_assignment();
DROP TRIGGER IF EXISTS trg_payment_assignment_sync ON public.payment_requests;
CREATE TRIGGER trg_payment_assignment_sync AFTER UPDATE ON public.payment_requests
  FOR EACH ROW EXECUTE FUNCTION private.sync_workflow_assignment();
DROP TRIGGER IF EXISTS trg_award_assignment_sync ON public.sourcing_awards;
CREATE TRIGGER trg_award_assignment_sync AFTER INSERT OR UPDATE ON public.sourcing_awards
  FOR EACH ROW EXECUTE FUNCTION private.sync_workflow_assignment();

CREATE OR REPLACE FUNCTION private.resolve_assignment_actor(p_assignment_id UUID)
RETURNS TABLE(effective_assignee_id UUID,delegation_id UUID)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_a public.workflow_approval_assignments%ROWTYPE; v_d public.approval_delegations%ROWTYPE;
BEGIN
  SELECT * INTO v_a FROM public.workflow_approval_assignments AS waa WHERE waa.id=p_assignment_id;
  SELECT * INTO v_d FROM public.approval_delegations AS ad
  WHERE ad.legal_entity_id=v_a.legal_entity_id AND ad.delegator_id=v_a.original_assignee_id
    AND ad.workflow_type=v_a.workflow_type AND ad.permission_code=v_a.permission_code
    AND ad.delegation_status='active' AND ad.revoked_at IS NULL
    AND ad.effective_start<=NOW() AND ad.effective_end>=NOW()
    AND (ad.financial_threshold IS NULL OR v_a.financial_amount IS NULL OR ad.financial_threshold>=v_a.financial_amount)
    AND NOT EXISTS(SELECT 1 FROM public.approval_delegations AS second_hop
      WHERE second_hop.legal_entity_id=v_a.legal_entity_id AND second_hop.delegator_id=ad.delegate_id
        AND second_hop.workflow_type=v_a.workflow_type AND second_hop.delegation_status='active'
        AND second_hop.revoked_at IS NULL AND second_hop.effective_start<=NOW() AND second_hop.effective_end>=NOW())
  ORDER BY ad.effective_start DESC,ad.id LIMIT 1;
  IF FOUND THEN effective_assignee_id:=v_d.delegate_id; delegation_id:=v_d.id;
  ELSE effective_assignee_id:=v_a.original_assignee_id; delegation_id:=NULL; END IF;
  RETURN NEXT;
END $function$;

DROP VIEW IF EXISTS public.v_delegated_approval_inbox;
DROP VIEW IF EXISTS public.v_approval_inbox;
CREATE VIEW public.v_approval_inbox WITH (security_invoker=true) AS
SELECT waa.entity_id,waa.legal_entity_id,waa.item_type,waa.title_en,waa.title_ar,waa.requester_id,
  waa.original_assignee_id,CASE WHEN waa.assignment_status='pending' THEN resolved.effective_assignee_id ELSE waa.decided_by END AS effective_assignee_id,
  CASE WHEN waa.assignment_status='pending' THEN resolved.delegation_id ELSE NULL::UUID END AS delegation_id,
  waa.assignment_status AS approval_status,waa.submitted_at,waa.due_date
FROM public.workflow_approval_assignments AS waa
CROSS JOIN LATERAL private.resolve_assignment_actor(waa.id) AS resolved;
CREATE VIEW public.v_delegated_approval_inbox WITH (security_invoker=true) AS
SELECT * FROM public.v_approval_inbox AS vai
WHERE vai.approval_status='pending' AND vai.delegation_id IS NOT NULL
  AND vai.effective_assignee_id=(SELECT auth.uid());
COMMENT ON VIEW public.v_approval_inbox IS
  '@classification approval_inbox; security_invoker; authoritative workflow assignments and effective actor routing';
COMMENT ON VIEW public.v_delegated_approval_inbox IS
  '@classification delegated_approval_inbox; security_invoker; current actor delegated pending assignments only';
GRANT SELECT ON public.v_approval_inbox,public.v_delegated_approval_inbox TO authenticated;

REVOKE ALL ON FUNCTION private.find_workflow_assignee(UUID,UUID,TEXT[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.create_workflow_assignment(UUID,public.approval_item_type,TEXT,TEXT,UUID,TEXT,TEXT,UUID,NUMERIC,TEXT[],DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.sync_workflow_assignment() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.resolve_assignment_actor(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.resolve_assignment_actor(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_requisition_reject(
  p_requisition_id UUID,p_reason TEXT,p_expected_status public.requisition_status DEFAULT 'procurement_review',
  p_idempotency_key TEXT DEFAULT NULL,p_correlation_id UUID DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_actor UUID:=(SELECT auth.uid()); v_row public.purchase_requisitions%ROWTYPE; v_result JSONB;
BEGIN
  IF v_actor IS NULL OR NOT private.current_user_is_active() THEN RETURN private.command_fail('UNAUTHENTICATED','Authentication required'); END IF;
  IF p_reason IS NULL OR length(btrim(p_reason))<5 THEN RETURN private.command_fail('VALIDATION','Rejection reason required'); END IF;
  SELECT * INTO v_row FROM public.purchase_requisitions AS pr WHERE pr.id=p_requisition_id;
  IF NOT FOUND THEN RETURN private.command_fail('NOT_FOUND','Requisition not found'); END IF;
  IF v_row.requester_id=v_actor THEN RETURN private.command_fail('SOD_VIOLATION','Requester cannot reject own requisition'); END IF;
  v_result:=private.requisition_transition(p_requisition_id,p_expected_status,'rejected',p_idempotency_key,p_correlation_id);
  IF COALESCE((v_result->>'ok')::BOOLEAN,false) THEN
    PERFORM private.write_audit_event(v_actor,'reject','purchase_requisition',p_requisition_id,v_row.legal_entity_id,NULL,NULL,
      p_correlation_id,p_idempotency_key,jsonb_build_object('status',p_expected_status),jsonb_build_object('status','rejected'),p_reason,NULL);
  END IF;
  RETURN v_result;
END $function$;

CREATE OR REPLACE FUNCTION public.rpc_award_reject(
  p_award_id UUID,p_reason TEXT,p_expected_status public.award_status DEFAULT 'submitted',
  p_idempotency_key TEXT DEFAULT NULL,p_correlation_id UUID DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_actor UUID:=(SELECT auth.uid()); v_row public.sourcing_awards%ROWTYPE; v_result JSONB;
BEGIN
  IF v_actor IS NULL OR NOT private.current_user_is_active() THEN RETURN private.command_fail('UNAUTHENTICATED','Authentication required'); END IF;
  IF p_reason IS NULL OR length(btrim(p_reason))<5 THEN RETURN private.command_fail('VALIDATION','Rejection reason required'); END IF;
  SELECT * INTO v_row FROM public.sourcing_awards AS sa WHERE sa.id=p_award_id FOR UPDATE;
  IF NOT FOUND THEN RETURN private.command_fail('NOT_FOUND','Award not found'); END IF;
  IF v_row.award_status IS DISTINCT FROM p_expected_status OR p_expected_status<>'submitted' THEN RETURN private.command_fail('STATE_MISMATCH','Only submitted award can be rejected'); END IF;
  IF v_row.submitted_by=v_actor THEN RETURN private.command_fail('SOD_VIOLATION','Award submitter cannot reject own award'); END IF;
  IF NOT private.user_has_any_role(ARRAY['system_administrator','legal_entity_administrator','approver','finance_user'],
    v_row.legal_entity_id,'legal_entity',v_row.legal_entity_id) THEN RETURN private.command_fail('FORBIDDEN','Insufficient role'); END IF;
  UPDATE public.sourcing_awards AS sa SET award_status='rejected',updated_at=NOW(),row_version=sa.row_version+1 WHERE sa.id=p_award_id;
  PERFORM private.write_audit_event(v_actor,'reject','sourcing_award',p_award_id,v_row.legal_entity_id,NULL,NULL,
    p_correlation_id,p_idempotency_key,jsonb_build_object('status',p_expected_status),jsonb_build_object('status','rejected'),p_reason,NULL);
  v_result:=private.command_ok(jsonb_build_object('entity_id',p_award_id,'award_status','rejected')); RETURN v_result;
END $function$;

REVOKE ALL ON FUNCTION public.rpc_requisition_reject(UUID,TEXT,public.requisition_status,TEXT,UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_award_reject(UUID,TEXT,public.award_status,TEXT,UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_requisition_reject(UUID,TEXT,public.requisition_status,TEXT,UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_award_reject(UUID,TEXT,public.award_status,TEXT,UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_approval_act_as_delegate(
  p_item_type public.approval_item_type,p_entity_id UUID,p_decision TEXT,
  p_original_assignee_id UUID,p_delegation_id UUID,p_comments TEXT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL,p_correlation_id UUID DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE
  v_actor UUID:=(SELECT auth.uid()); v_cmd TEXT:='approval_act_as_delegate'; v_replay JSONB;
  v_assignment_id UUID; v_assignment public.workflow_approval_assignments%ROWTYPE;
  v_delegation public.approval_delegations%ROWTYPE; v_resolved RECORD; v_transition JSONB;
  v_audit_id UUID; v_result JSONB;
BEGIN
  v_replay:=private.command_check_idempotency(v_cmd,p_idempotency_key,v_actor);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF v_actor IS NULL OR NOT private.current_user_is_active() THEN RETURN private.command_fail('UNAUTHENTICATED','Authentication required'); END IF;
  IF p_decision NOT IN ('approve','reject') THEN RETURN private.command_fail('VALIDATION','Supported decision is approve or reject'); END IF;
  IF p_item_type NOT IN ('purchase_requisition','payment_request','sourcing_award') THEN
    RETURN private.command_fail('UNSUPPORTED','Workflow does not have a delegated adapter'); END IF;
  SELECT waa.id INTO v_assignment_id FROM public.workflow_approval_assignments AS waa
    WHERE waa.item_type=p_item_type AND waa.entity_id=p_entity_id;
  IF v_assignment_id IS NULL THEN RETURN private.command_fail('NOT_FOUND','Authoritative approval assignment not found'); END IF;

  -- Lock business object first. Direct and delegated decisions therefore share
  -- one lock order and one competing-decision boundary.
  CASE p_item_type
    WHEN 'purchase_requisition' THEN PERFORM 1 FROM public.purchase_requisitions AS pr WHERE pr.id=p_entity_id FOR UPDATE;
    WHEN 'payment_request' THEN PERFORM 1 FROM public.payment_requests AS pr WHERE pr.id=p_entity_id FOR UPDATE;
    WHEN 'sourcing_award' THEN PERFORM 1 FROM public.sourcing_awards AS sa WHERE sa.id=p_entity_id FOR UPDATE;
    ELSE NULL;
  END CASE;
  SELECT * INTO v_assignment FROM public.workflow_approval_assignments AS waa WHERE waa.id=v_assignment_id FOR UPDATE;
  IF v_assignment.assignment_status<>'pending' THEN RETURN private.command_fail('STATE_MISMATCH','Approval assignment already decided'); END IF;
  IF v_assignment.original_assignee_id IS DISTINCT FROM p_original_assignee_id THEN
    RETURN private.command_fail('VALIDATION','Original assignee does not match authoritative assignment'); END IF;
  SELECT * INTO v_delegation FROM public.approval_delegations AS ad WHERE ad.id=p_delegation_id FOR UPDATE;
  IF NOT FOUND OR v_delegation.legal_entity_id IS DISTINCT FROM v_assignment.legal_entity_id
    OR v_delegation.delegator_id IS DISTINCT FROM v_assignment.original_assignee_id
    OR v_delegation.delegate_id IS DISTINCT FROM v_actor
    OR v_delegation.workflow_type IS DISTINCT FROM v_assignment.workflow_type
    OR v_delegation.permission_code IS DISTINCT FROM v_assignment.permission_code
    OR v_delegation.delegation_status<>'active' OR v_delegation.revoked_at IS NOT NULL
    OR v_delegation.effective_start>NOW() OR v_delegation.effective_end<NOW()
    OR (v_delegation.financial_threshold IS NOT NULL AND v_assignment.financial_amount IS NOT NULL
      AND v_delegation.financial_threshold<v_assignment.financial_amount) THEN
    RETURN private.command_fail('DELEGATION_INVALID','Delegation is not valid for this assignment');
  END IF;
  SELECT * INTO v_resolved FROM private.resolve_assignment_actor(v_assignment.id);
  IF v_resolved.effective_assignee_id IS DISTINCT FROM v_actor OR v_resolved.delegation_id IS DISTINCT FROM p_delegation_id THEN
    RETURN private.command_fail('DELEGATION_INVALID','Delegation does not resolve to current actor'); END IF;

  CASE p_item_type
    WHEN 'purchase_requisition' THEN
      IF p_decision='approve' THEN v_transition:=public.rpc_requisition_approve(p_entity_id,'procurement_review',NULL,p_correlation_id);
      ELSE v_transition:=public.rpc_requisition_reject(p_entity_id,COALESCE(p_comments,'Delegated rejection'),'procurement_review',NULL,p_correlation_id); END IF;
    WHEN 'payment_request' THEN
      IF p_decision='approve' THEN v_transition:=public.rpc_payment_request_approve(p_entity_id,'submitted',NULL,p_correlation_id);
      ELSE v_transition:=public.rpc_payment_request_reject(p_entity_id,COALESCE(p_comments,'Delegated rejection'),'submitted',NULL,p_correlation_id); END IF;
    WHEN 'sourcing_award' THEN
      IF p_decision='approve' THEN v_transition:=public.rpc_award_approve(p_entity_id,'submitted',NULL,p_correlation_id);
      ELSE v_transition:=public.rpc_award_reject(p_entity_id,COALESCE(p_comments,'Delegated rejection'),'submitted',NULL,p_correlation_id); END IF;
  END CASE;
  IF NOT COALESCE((v_transition->>'ok')::BOOLEAN,false) THEN RETURN v_transition; END IF;
  UPDATE public.workflow_approval_assignments AS waa SET decision_reason=NULLIF(btrim(p_comments),''),updated_at=NOW()
    WHERE waa.id=v_assignment.id;
  INSERT INTO public.approval_decision_audit(legal_entity_id,item_type,entity_id,decision,actor_id,
    original_assignee_id,delegator_id,delegation_id,acting_as,comments,actual_actor_user_id,
    original_assignee_user_id,delegated_from_user_id,workflow_object_type,workflow_object_id,decided_at)
  VALUES(v_assignment.legal_entity_id,p_item_type,p_entity_id,p_decision,v_actor,
    v_assignment.original_assignee_id,v_delegation.delegator_id,v_delegation.id,true,p_comments,v_actor,
    v_assignment.original_assignee_id,v_delegation.delegator_id,v_assignment.workflow_type,p_entity_id,NOW())
  RETURNING id INTO v_audit_id;
  PERFORM private.write_audit_event(v_actor,CASE WHEN p_decision='approve' THEN 'approve'::public.audit_action ELSE 'reject'::public.audit_action END,
    'approval_decision',v_audit_id,v_assignment.legal_entity_id,NULL,NULL,p_correlation_id,p_idempotency_key,NULL,
    jsonb_build_object('actual_actor_user_id',v_actor,'original_assignee_user_id',v_assignment.original_assignee_id,
      'delegated_from_user_id',v_delegation.delegator_id,'delegation_id',v_delegation.id,
      'workflow_object_type',v_assignment.workflow_type,'workflow_object_id',p_entity_id,'decision',p_decision),p_comments,NULL);
  PERFORM private.notify_user(v_assignment.original_assignee_id,'Delegated approval completed','اكتملت الموافقة المفوضة',
    v_assignment.workflow_type,p_entity_id);
  v_result:=private.command_ok(jsonb_build_object('entity_id',p_entity_id,'assignment_id',v_assignment.id,
    'decision_audit_id',v_audit_id,'decision',p_decision,'actual_actor_user_id',v_actor,
    'original_assignee_user_id',v_assignment.original_assignee_id,'delegation_id',v_delegation.id));
  PERFORM private.command_store_idempotency(v_cmd,p_idempotency_key,v_actor,v_result); RETURN v_result;
END $function$;

REVOKE ALL ON FUNCTION public.rpc_approval_act_as_delegate(public.approval_item_type,UUID,TEXT,UUID,UUID,TEXT,TEXT,UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_approval_act_as_delegate(public.approval_item_type,UUID,TEXT,UUID,UUID,TEXT,TEXT,UUID) TO authenticated;

-- =============================================================================
-- Versioned period-close configuration
-- =============================================================================

CREATE OR REPLACE FUNCTION private.guard_period_template_history()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
BEGIN
  IF EXISTS(SELECT 1 FROM public.period_close_instances AS pci WHERE pci.template_id=OLD.id)
     AND ROW(NEW.legal_entity_id,NEW.module,NEW.code,NEW.name_en,NEW.name_ar,NEW.version_number,NEW.effective_from)
       IS DISTINCT FROM ROW(OLD.legal_entity_id,OLD.module,OLD.code,OLD.name_en,OLD.name_ar,OLD.version_number,OLD.effective_from) THEN
    RAISE EXCEPTION 'Used period-close template definition is immutable' USING ERRCODE='55000';
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION private.guard_period_item_history()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_template UUID:=COALESCE(NEW.template_id,OLD.template_id);
BEGIN
  IF EXISTS(SELECT 1 FROM public.period_close_instances AS pci WHERE pci.template_id=v_template) THEN
    RAISE EXCEPTION 'Items on a used period-close template are immutable' USING ERRCODE='55000';
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $function$;

DROP TRIGGER IF EXISTS trg_period_template_history ON public.period_close_checklist_templates;
CREATE TRIGGER trg_period_template_history BEFORE UPDATE ON public.period_close_checklist_templates
  FOR EACH ROW EXECUTE FUNCTION private.guard_period_template_history();
DROP TRIGGER IF EXISTS trg_period_item_history ON public.period_close_checklist_items;
CREATE TRIGGER trg_period_item_history BEFORE UPDATE OR DELETE ON public.period_close_checklist_items
  FOR EACH ROW EXECUTE FUNCTION private.guard_period_item_history();

CREATE OR REPLACE FUNCTION public.rpc_period_template_create(
  p_legal_entity_id UUID,p_module public.period_module,p_code TEXT,p_name_en TEXT,p_name_ar TEXT,
  p_effective_from DATE DEFAULT CURRENT_DATE,p_idempotency_key TEXT DEFAULT NULL,p_correlation_id UUID DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_actor UUID:=(SELECT auth.uid()); v_cmd TEXT:='period_template_create'; v_replay JSONB;
  v_id UUID; v_version INTEGER; v_result JSONB;
BEGIN
  v_replay:=private.command_check_idempotency(v_cmd,p_idempotency_key,v_actor); IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF v_actor IS NULL OR NOT private.current_user_is_active() THEN RETURN private.command_fail('UNAUTHENTICATED','Authentication required'); END IF;
  IF NOT private.user_has_any_role(ARRAY['system_administrator','legal_entity_administrator'],p_legal_entity_id,'legal_entity',p_legal_entity_id) THEN
    RETURN private.command_fail('FORBIDDEN','Period-close administrator role required'); END IF;
  IF NULLIF(btrim(p_code),'') IS NULL OR NULLIF(btrim(p_name_en),'') IS NULL OR NULLIF(btrim(p_name_ar),'') IS NULL THEN
    RETURN private.command_fail('VALIDATION','Code and bilingual names required'); END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_legal_entity_id::TEXT||':'||p_module::TEXT||':'||upper(btrim(p_code)),0));
  SELECT COALESCE(MAX(pct.version_number),0)+1 INTO v_version FROM public.period_close_checklist_templates AS pct
    WHERE pct.legal_entity_id=p_legal_entity_id AND pct.module=p_module AND upper(pct.code)=upper(btrim(p_code));
  INSERT INTO public.period_close_checklist_templates(legal_entity_id,module,code,name_en,name_ar,is_active,
    version_number,governance_status,effective_from,created_by)
  VALUES(p_legal_entity_id,p_module,upper(btrim(p_code)),btrim(p_name_en),btrim(p_name_ar),false,
    v_version,'draft',COALESCE(p_effective_from,CURRENT_DATE),v_actor) RETURNING id INTO v_id;
  PERFORM private.write_audit_event(v_actor,'create','period_close_template',v_id,p_legal_entity_id,NULL,NULL,
    p_correlation_id,p_idempotency_key,NULL,jsonb_build_object('status','draft','module',p_module,'version',v_version),NULL,NULL);
  v_result:=private.command_ok(jsonb_build_object('entity_id',v_id,'governance_status','draft','version_number',v_version));
  PERFORM private.command_store_idempotency(v_cmd,p_idempotency_key,v_actor,v_result); RETURN v_result;
END $function$;

CREATE OR REPLACE FUNCTION public.rpc_period_template_add_item(
  p_template_id UUID,p_sequence_no SMALLINT,p_name_en TEXT,p_name_ar TEXT,p_description TEXT,
  p_item_type public.period_checklist_item_type,p_owner_role_code TEXT,p_is_required BOOLEAN,
  p_is_blocking BOOLEAN,p_control_code TEXT DEFAULT NULL,p_idempotency_key TEXT DEFAULT NULL,p_correlation_id UUID DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_actor UUID:=(SELECT auth.uid()); v_cmd TEXT:='period_template_add_item'; v_replay JSONB;
  v_template public.period_close_checklist_templates%ROWTYPE; v_id UUID; v_result JSONB;
BEGIN
  v_replay:=private.command_check_idempotency(v_cmd,p_idempotency_key,v_actor); IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF v_actor IS NULL OR NOT private.current_user_is_active() THEN RETURN private.command_fail('UNAUTHENTICATED','Authentication required'); END IF;
  SELECT * INTO v_template FROM public.period_close_checklist_templates AS pct WHERE pct.id=p_template_id FOR UPDATE;
  IF NOT FOUND THEN RETURN private.command_fail('NOT_FOUND','Template not found'); END IF;
  IF v_template.governance_status<>'draft' THEN RETURN private.command_fail('STATE_MISMATCH','Only draft template can be edited'); END IF;
  IF v_template.created_by<>v_actor AND NOT private.user_has_any_role(ARRAY['system_administrator','legal_entity_administrator'],
    v_template.legal_entity_id,'legal_entity',v_template.legal_entity_id) THEN RETURN private.command_fail('FORBIDDEN','Template administrator required'); END IF;
  IF p_owner_role_code IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.roles AS r WHERE r.code=p_owner_role_code) THEN
    RETURN private.command_fail('VALIDATION','Unknown owner role'); END IF;
  IF p_item_type='automatic' AND p_control_code NOT IN ('unmapped_actuals','unmapped_cleared','incomplete_allocations','open_match_exceptions') THEN
    RETURN private.command_fail('VALIDATION','Unsupported automatic control code'); END IF;
  INSERT INTO public.period_close_checklist_items(template_id,sequence_no,name_en,name_ar,description,item_type,
    owner_role_code,is_required,is_blocking,control_code)
  VALUES(p_template_id,p_sequence_no,btrim(p_name_en),btrim(p_name_ar),NULLIF(btrim(p_description),''),p_item_type,
    p_owner_role_code,COALESCE(p_is_required,true),COALESCE(p_is_blocking,false),NULLIF(btrim(p_control_code),''))
  RETURNING id INTO v_id;
  PERFORM private.write_audit_event(v_actor,'create','period_close_template_item',v_id,v_template.legal_entity_id,NULL,NULL,
    p_correlation_id,p_idempotency_key,NULL,jsonb_build_object('template_id',p_template_id,'sequence_no',p_sequence_no,
    'item_type',p_item_type,'required',p_is_required,'blocking',p_is_blocking),NULL,NULL);
  v_result:=private.command_ok(jsonb_build_object('entity_id',v_id,'template_id',p_template_id));
  PERFORM private.command_store_idempotency(v_cmd,p_idempotency_key,v_actor,v_result); RETURN v_result;
END $function$;

CREATE OR REPLACE FUNCTION public.rpc_period_template_submit(
  p_template_id UUID,p_expected_status public.governance_workflow_status DEFAULT 'draft',
  p_idempotency_key TEXT DEFAULT NULL,p_correlation_id UUID DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_actor UUID:=(SELECT auth.uid()); v_cmd TEXT:='period_template_submit'; v_replay JSONB;
  v_template public.period_close_checklist_templates%ROWTYPE; v_result JSONB;
BEGIN
  v_replay:=private.command_check_idempotency(v_cmd,p_idempotency_key,v_actor); IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF v_actor IS NULL OR NOT private.current_user_is_active() THEN RETURN private.command_fail('UNAUTHENTICATED','Authentication required'); END IF;
  SELECT * INTO v_template FROM public.period_close_checklist_templates AS pct WHERE pct.id=p_template_id FOR UPDATE;
  IF NOT FOUND THEN RETURN private.command_fail('NOT_FOUND','Template not found'); END IF;
  IF v_template.governance_status IS DISTINCT FROM p_expected_status OR p_expected_status<>'draft' THEN RETURN private.command_fail('STATE_MISMATCH','Only draft template can be submitted'); END IF;
  IF v_template.created_by<>v_actor THEN RETURN private.command_fail('FORBIDDEN','Only template creator can submit'); END IF;
  IF NOT EXISTS(SELECT 1 FROM public.period_close_checklist_items AS pci WHERE pci.template_id=p_template_id AND pci.is_required)
     OR NOT EXISTS(SELECT 1 FROM public.period_close_checklist_items AS pci WHERE pci.template_id=p_template_id AND pci.is_blocking) THEN
    RETURN private.command_fail('VALIDATION','Template needs required and blocking controls'); END IF;
  UPDATE public.period_close_checklist_templates AS pct SET governance_status='submitted',submitted_by=v_actor,
    submitted_at=NOW(),updated_at=NOW(),row_version=pct.row_version+1 WHERE pct.id=p_template_id;
  PERFORM private.write_audit_event(v_actor,'update','period_close_template',p_template_id,v_template.legal_entity_id,NULL,NULL,
    p_correlation_id,p_idempotency_key,jsonb_build_object('status','draft'),jsonb_build_object('status','submitted'),NULL,NULL);
  v_result:=private.command_ok(jsonb_build_object('entity_id',p_template_id,'governance_status','submitted'));
  PERFORM private.command_store_idempotency(v_cmd,p_idempotency_key,v_actor,v_result); RETURN v_result;
END $function$;

CREATE OR REPLACE FUNCTION public.rpc_period_template_approve(
  p_template_id UUID,p_expected_status public.governance_workflow_status DEFAULT 'submitted',
  p_idempotency_key TEXT DEFAULT NULL,p_correlation_id UUID DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_actor UUID:=(SELECT auth.uid()); v_cmd TEXT:='period_template_approve'; v_replay JSONB;
  v_template public.period_close_checklist_templates%ROWTYPE; v_result JSONB;
BEGIN
  v_replay:=private.command_check_idempotency(v_cmd,p_idempotency_key,v_actor); IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF v_actor IS NULL OR NOT private.current_user_is_active() THEN RETURN private.command_fail('UNAUTHENTICATED','Authentication required'); END IF;
  SELECT * INTO v_template FROM public.period_close_checklist_templates AS pct WHERE pct.id=p_template_id FOR UPDATE;
  IF NOT FOUND THEN RETURN private.command_fail('NOT_FOUND','Template not found'); END IF;
  IF v_template.governance_status IS DISTINCT FROM p_expected_status OR p_expected_status<>'submitted' THEN RETURN private.command_fail('STATE_MISMATCH','Only submitted template can be approved'); END IF;
  IF v_template.created_by=v_actor OR v_template.submitted_by=v_actor THEN RETURN private.command_fail('SOD_VIOLATION','Template creator cannot approve'); END IF;
  IF NOT private.user_has_any_role(ARRAY['system_administrator','legal_entity_administrator'],v_template.legal_entity_id,'legal_entity',v_template.legal_entity_id) THEN
    RETURN private.command_fail('FORBIDDEN','Period-close administrator role required'); END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_template.legal_entity_id::TEXT||':'||v_template.module::TEXT,0));
  UPDATE public.period_close_checklist_templates AS pct SET governance_status='inactive',is_active=false,
    effective_to=GREATEST(CURRENT_DATE-1,pct.effective_from),retired_by=v_actor,retired_at=NOW(),updated_at=NOW(),row_version=pct.row_version+1
  WHERE pct.legal_entity_id=v_template.legal_entity_id AND pct.module=v_template.module AND pct.is_active
    AND pct.governance_status='approved' AND pct.id<>p_template_id;
  UPDATE public.period_close_checklist_templates AS pct SET governance_status='approved',is_active=true,
    approved_by=v_actor,approved_at=NOW(),updated_at=NOW(),row_version=pct.row_version+1 WHERE pct.id=p_template_id;
  PERFORM private.write_audit_event(v_actor,'approve','period_close_template',p_template_id,v_template.legal_entity_id,NULL,NULL,
    p_correlation_id,p_idempotency_key,jsonb_build_object('status','submitted'),
    jsonb_build_object('status','approved','active',true,'version',v_template.version_number),NULL,NULL);
  v_result:=private.command_ok(jsonb_build_object('entity_id',p_template_id,'governance_status','approved','is_active',true));
  PERFORM private.command_store_idempotency(v_cmd,p_idempotency_key,v_actor,v_result); RETURN v_result;
END $function$;

CREATE OR REPLACE FUNCTION public.rpc_period_template_retire(
  p_template_id UUID,p_reason TEXT,p_expected_status public.governance_workflow_status DEFAULT 'approved',
  p_idempotency_key TEXT DEFAULT NULL,p_correlation_id UUID DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_actor UUID:=(SELECT auth.uid()); v_cmd TEXT:='period_template_retire'; v_replay JSONB;
  v_template public.period_close_checklist_templates%ROWTYPE; v_result JSONB;
BEGIN
  v_replay:=private.command_check_idempotency(v_cmd,p_idempotency_key,v_actor); IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF v_actor IS NULL OR NOT private.current_user_is_active() THEN RETURN private.command_fail('UNAUTHENTICATED','Authentication required'); END IF;
  SELECT * INTO v_template FROM public.period_close_checklist_templates AS pct WHERE pct.id=p_template_id FOR UPDATE;
  IF NOT FOUND OR v_template.governance_status IS DISTINCT FROM p_expected_status THEN RETURN private.command_fail('STATE_MISMATCH','Active template not found'); END IF;
  IF p_reason IS NULL OR length(btrim(p_reason))<5 THEN RETURN private.command_fail('VALIDATION','Retirement reason required'); END IF;
  IF NOT private.user_has_any_role(ARRAY['system_administrator','legal_entity_administrator'],v_template.legal_entity_id,'legal_entity',v_template.legal_entity_id) THEN
    RETURN private.command_fail('FORBIDDEN','Period-close administrator role required'); END IF;
  UPDATE public.period_close_checklist_templates AS pct SET governance_status='inactive',is_active=false,effective_to=CURRENT_DATE,
    retired_by=v_actor,retired_at=NOW(),updated_at=NOW(),row_version=pct.row_version+1 WHERE pct.id=p_template_id;
  PERFORM private.write_audit_event(v_actor,'update','period_close_template',p_template_id,v_template.legal_entity_id,NULL,NULL,
    p_correlation_id,p_idempotency_key,jsonb_build_object('status','approved'),jsonb_build_object('status','inactive'),p_reason,NULL);
  v_result:=private.command_ok(jsonb_build_object('entity_id',p_template_id,'governance_status','inactive'));
  PERFORM private.command_store_idempotency(v_cmd,p_idempotency_key,v_actor,v_result); RETURN v_result;
END $function$;

CREATE OR REPLACE FUNCTION public.rpc_period_hard_close_with_checklist(
  p_fiscal_period_id UUID,p_legal_entity_id UUID,p_module public.period_module,
  p_expected_state public.period_control_state DEFAULT 'soft_close',p_idempotency_key TEXT DEFAULT NULL,p_correlation_id UUID DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_ready JSONB; v_template_id UUID; v_template_count INTEGER; v_instance_id UUID;
BEGIN
  SELECT COUNT(*)::INTEGER,MIN(pct.id::TEXT)::UUID INTO v_template_count,v_template_id
  FROM public.period_close_checklist_templates AS pct
  WHERE pct.legal_entity_id=p_legal_entity_id AND pct.module=p_module AND pct.is_active
    AND pct.governance_status='approved' AND pct.effective_from<=CURRENT_DATE
    AND (pct.effective_to IS NULL OR pct.effective_to>=CURRENT_DATE);
  IF v_template_count<>1 THEN RETURN private.command_fail('CONFIGURATION','Exactly one approved active checklist is required before hard close'); END IF;
  SELECT pci.id INTO v_instance_id FROM public.period_close_instances AS pci
    WHERE pci.legal_entity_id=p_legal_entity_id AND pci.fiscal_period_id=p_fiscal_period_id
      AND pci.module=p_module AND pci.template_id=v_template_id FOR UPDATE;
  IF v_instance_id IS NULL THEN RETURN private.command_fail('CHECKLIST','Required checklist instance is missing'); END IF;
  v_ready:=public.rpc_period_close_evaluate_readiness(p_fiscal_period_id,p_legal_entity_id,p_module);
  IF NOT COALESCE((v_ready->>'ok')::BOOLEAN,false) THEN RETURN v_ready; END IF;
  IF NOT COALESCE((v_ready->>'pass')::BOOLEAN,false) THEN RETURN private.command_fail('READINESS','Period hard close blocked by readiness controls'); END IF;
  RETURN private.period_module_transition(p_fiscal_period_id,p_legal_entity_id,p_module,p_expected_state,'hard_close',NULL,p_idempotency_key,p_correlation_id);
END $function$;

DO $grants$ DECLARE r RECORD; BEGIN FOR r IN
  SELECT p.oid::regprocedure AS sig FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname IN ('rpc_period_template_create','rpc_period_template_add_item',
    'rpc_period_template_submit','rpc_period_template_approve','rpc_period_template_retire','rpc_period_hard_close_with_checklist')
LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon',r.sig); EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',r.sig); END LOOP; END $grants$;
REVOKE ALL ON FUNCTION private.guard_period_template_history() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.guard_period_item_history() FROM PUBLIC;

-- =============================================================================
-- Versioned appraisal configuration and controlled goals
-- =============================================================================

CREATE OR REPLACE FUNCTION private.guard_appraisal_template_history()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
BEGIN
  IF EXISTS(SELECT 1 FROM public.appraisal_assignments AS aa WHERE aa.template_id=OLD.id)
     AND ROW(NEW.legal_entity_id,NEW.code,NEW.name_en,NEW.name_ar,NEW.instructions_en,NEW.instructions_ar,NEW.rating_scale_max,NEW.version_number)
       IS DISTINCT FROM ROW(OLD.legal_entity_id,OLD.code,OLD.name_en,OLD.name_ar,OLD.instructions_en,OLD.instructions_ar,OLD.rating_scale_max,OLD.version_number) THEN
    RAISE EXCEPTION 'Used appraisal template definition is immutable' USING ERRCODE='55000';
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION private.guard_appraisal_criterion_history()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_template UUID:=COALESCE(NEW.template_id,OLD.template_id);
BEGIN
  IF EXISTS(SELECT 1 FROM public.appraisal_assignments AS aa WHERE aa.template_id=v_template)
     OR EXISTS(SELECT 1 FROM public.appraisal_templates AS at WHERE at.id=v_template AND at.governance_status IN ('submitted','approved','inactive')) THEN
    RAISE EXCEPTION 'Published or used appraisal criteria are immutable' USING ERRCODE='55000';
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $function$;

CREATE OR REPLACE FUNCTION private.enforce_appraisal_assignment_template()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.appraisal_templates AS at WHERE at.id=NEW.template_id
    AND at.legal_entity_id=NEW.legal_entity_id AND at.governance_status='approved' AND at.is_active) THEN
    RAISE EXCEPTION 'Assignment requires an approved active template' USING ERRCODE='23514';
  END IF;
  IF NEW.employee_id=NEW.manager_id OR NEW.employee_id=NEW.reviewer_id OR NEW.manager_id=NEW.reviewer_id THEN
    RAISE EXCEPTION 'Employee, manager, and reviewer must be distinct' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_appraisal_template_history ON public.appraisal_templates;
CREATE TRIGGER trg_appraisal_template_history BEFORE UPDATE ON public.appraisal_templates
  FOR EACH ROW EXECUTE FUNCTION private.guard_appraisal_template_history();
DROP TRIGGER IF EXISTS trg_appraisal_criterion_history ON public.appraisal_template_criteria;
CREATE TRIGGER trg_appraisal_criterion_history BEFORE UPDATE OR DELETE ON public.appraisal_template_criteria
  FOR EACH ROW EXECUTE FUNCTION private.guard_appraisal_criterion_history();
DROP TRIGGER IF EXISTS trg_appraisal_assignment_template ON public.appraisal_assignments;
CREATE TRIGGER trg_appraisal_assignment_template BEFORE INSERT OR UPDATE OF template_id,legal_entity_id,employee_id,manager_id,reviewer_id
  ON public.appraisal_assignments FOR EACH ROW EXECUTE FUNCTION private.enforce_appraisal_assignment_template();

CREATE OR REPLACE FUNCTION public.rpc_appraisal_template_create(
  p_legal_entity_id UUID,p_code TEXT,p_name_en TEXT,p_name_ar TEXT,p_instructions_en TEXT DEFAULT NULL,
  p_instructions_ar TEXT DEFAULT NULL,p_rating_scale_max INTEGER DEFAULT 5,p_idempotency_key TEXT DEFAULT NULL,p_correlation_id UUID DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_actor UUID:=(SELECT auth.uid()); v_cmd TEXT:='appraisal_template_create'; v_replay JSONB;
  v_version INTEGER; v_id UUID; v_result JSONB;
BEGIN
  v_replay:=private.command_check_idempotency(v_cmd,p_idempotency_key,v_actor); IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF v_actor IS NULL OR NOT private.current_user_is_active() THEN RETURN private.command_fail('UNAUTHENTICATED','Authentication required'); END IF;
  IF NOT private.user_has_any_role(ARRAY['system_administrator','legal_entity_administrator'],p_legal_entity_id,'legal_entity',p_legal_entity_id) THEN
    RETURN private.command_fail('FORBIDDEN','Performance administrator role required'); END IF;
  IF p_rating_scale_max<2 OR p_rating_scale_max>10 THEN RETURN private.command_fail('VALIDATION','Rating scale must be between 2 and 10'); END IF;
  IF NULLIF(btrim(p_code),'') IS NULL OR NULLIF(btrim(p_name_en),'') IS NULL OR NULLIF(btrim(p_name_ar),'') IS NULL THEN
    RETURN private.command_fail('VALIDATION','Code and bilingual names required'); END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_legal_entity_id::TEXT||':'||upper(btrim(p_code)),0));
  SELECT COALESCE(MAX(at.version_number),0)+1 INTO v_version FROM public.appraisal_templates AS at
    WHERE at.legal_entity_id=p_legal_entity_id AND upper(at.code)=upper(btrim(p_code));
  INSERT INTO public.appraisal_templates(legal_entity_id,code,name_en,name_ar,instructions_en,instructions_ar,
    rating_scale_max,is_active,version_number,governance_status,created_by)
  VALUES(p_legal_entity_id,upper(btrim(p_code)),btrim(p_name_en),btrim(p_name_ar),NULLIF(btrim(p_instructions_en),''),
    NULLIF(btrim(p_instructions_ar),''),p_rating_scale_max,false,v_version,'draft',v_actor) RETURNING id INTO v_id;
  PERFORM private.write_audit_event(v_actor,'create','appraisal_template',v_id,p_legal_entity_id,NULL,NULL,p_correlation_id,p_idempotency_key,
    NULL,jsonb_build_object('status','draft','version',v_version,'rating_scale_max',p_rating_scale_max),NULL,NULL);
  v_result:=private.command_ok(jsonb_build_object('entity_id',v_id,'governance_status','draft','version_number',v_version));
  PERFORM private.command_store_idempotency(v_cmd,p_idempotency_key,v_actor,v_result); RETURN v_result;
END $function$;

CREATE OR REPLACE FUNCTION public.rpc_appraisal_template_add_criterion(
  p_template_id UUID,p_sequence_no INTEGER,p_category TEXT,p_name_en TEXT,p_name_ar TEXT,p_weight NUMERIC,
  p_max_scale INTEGER,p_idempotency_key TEXT DEFAULT NULL,p_correlation_id UUID DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_actor UUID:=(SELECT auth.uid()); v_cmd TEXT:='appraisal_template_add_criterion'; v_replay JSONB;
  v_template public.appraisal_templates%ROWTYPE; v_total NUMERIC; v_id UUID; v_result JSONB;
BEGIN
  v_replay:=private.command_check_idempotency(v_cmd,p_idempotency_key,v_actor); IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF v_actor IS NULL OR NOT private.current_user_is_active() THEN RETURN private.command_fail('UNAUTHENTICATED','Authentication required'); END IF;
  SELECT * INTO v_template FROM public.appraisal_templates AS at WHERE at.id=p_template_id FOR UPDATE;
  IF NOT FOUND THEN RETURN private.command_fail('NOT_FOUND','Template not found'); END IF;
  IF v_template.governance_status<>'draft' THEN RETURN private.command_fail('STATE_MISMATCH','Only draft template can be edited'); END IF;
  IF v_template.created_by<>v_actor AND NOT private.user_has_any_role(ARRAY['system_administrator','legal_entity_administrator'],
    v_template.legal_entity_id,'legal_entity',v_template.legal_entity_id) THEN RETURN private.command_fail('FORBIDDEN','Performance administrator role required'); END IF;
  IF p_weight<=0 OR p_weight>100 OR p_max_scale<2 OR p_max_scale>v_template.rating_scale_max THEN
    RETURN private.command_fail('VALIDATION','Invalid criterion weight or scale'); END IF;
  SELECT COALESCE(SUM(atc.weight),0) INTO v_total FROM public.appraisal_template_criteria AS atc WHERE atc.template_id=p_template_id;
  IF v_total+p_weight>100 THEN RETURN private.command_fail('VALIDATION','Criteria weights exceed 100'); END IF;
  INSERT INTO public.appraisal_template_criteria(template_id,sequence_no,category,name_en,name_ar,weight,max_scale)
  VALUES(p_template_id,p_sequence_no,COALESCE(NULLIF(btrim(p_category),''),'competency'),btrim(p_name_en),btrim(p_name_ar),p_weight,p_max_scale)
  RETURNING id INTO v_id;
  PERFORM private.write_audit_event(v_actor,'create','appraisal_template_criterion',v_id,v_template.legal_entity_id,NULL,NULL,
    p_correlation_id,p_idempotency_key,NULL,jsonb_build_object('template_id',p_template_id,'weight',p_weight,'max_scale',p_max_scale),NULL,NULL);
  v_result:=private.command_ok(jsonb_build_object('entity_id',v_id,'template_id',p_template_id));
  PERFORM private.command_store_idempotency(v_cmd,p_idempotency_key,v_actor,v_result); RETURN v_result;
END $function$;

CREATE OR REPLACE FUNCTION public.rpc_appraisal_template_submit(
  p_template_id UUID,p_expected_status public.governance_workflow_status DEFAULT 'draft',
  p_idempotency_key TEXT DEFAULT NULL,p_correlation_id UUID DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_actor UUID:=(SELECT auth.uid()); v_cmd TEXT:='appraisal_template_submit'; v_replay JSONB;
  v_template public.appraisal_templates%ROWTYPE; v_weight NUMERIC; v_result JSONB;
BEGIN
  v_replay:=private.command_check_idempotency(v_cmd,p_idempotency_key,v_actor); IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF v_actor IS NULL OR NOT private.current_user_is_active() THEN RETURN private.command_fail('UNAUTHENTICATED','Authentication required'); END IF;
  SELECT * INTO v_template FROM public.appraisal_templates AS at WHERE at.id=p_template_id FOR UPDATE;
  IF NOT FOUND OR v_template.governance_status IS DISTINCT FROM p_expected_status OR p_expected_status<>'draft' THEN
    RETURN private.command_fail('STATE_MISMATCH','Only draft template can be submitted'); END IF;
  IF v_template.created_by<>v_actor THEN RETURN private.command_fail('FORBIDDEN','Only template creator can submit'); END IF;
  SELECT COALESCE(SUM(atc.weight),0) INTO v_weight FROM public.appraisal_template_criteria AS atc WHERE atc.template_id=p_template_id;
  IF v_weight<>100 THEN RETURN private.command_fail('VALIDATION','Criteria weights must equal 100'); END IF;
  UPDATE public.appraisal_templates AS at SET governance_status='submitted',submitted_by=v_actor,submitted_at=NOW(),
    row_version=at.row_version+1 WHERE at.id=p_template_id;
  PERFORM private.write_audit_event(v_actor,'update','appraisal_template',p_template_id,v_template.legal_entity_id,NULL,NULL,
    p_correlation_id,p_idempotency_key,jsonb_build_object('status','draft'),jsonb_build_object('status','submitted','weight',v_weight),NULL,NULL);
  v_result:=private.command_ok(jsonb_build_object('entity_id',p_template_id,'governance_status','submitted'));
  PERFORM private.command_store_idempotency(v_cmd,p_idempotency_key,v_actor,v_result); RETURN v_result;
END $function$;

CREATE OR REPLACE FUNCTION public.rpc_appraisal_template_approve(
  p_template_id UUID,p_expected_status public.governance_workflow_status DEFAULT 'submitted',
  p_idempotency_key TEXT DEFAULT NULL,p_correlation_id UUID DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_actor UUID:=(SELECT auth.uid()); v_cmd TEXT:='appraisal_template_approve'; v_replay JSONB;
  v_template public.appraisal_templates%ROWTYPE; v_result JSONB;
BEGIN
  v_replay:=private.command_check_idempotency(v_cmd,p_idempotency_key,v_actor); IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF v_actor IS NULL OR NOT private.current_user_is_active() THEN RETURN private.command_fail('UNAUTHENTICATED','Authentication required'); END IF;
  SELECT * INTO v_template FROM public.appraisal_templates AS at WHERE at.id=p_template_id FOR UPDATE;
  IF NOT FOUND OR v_template.governance_status IS DISTINCT FROM p_expected_status OR p_expected_status<>'submitted' THEN
    RETURN private.command_fail('STATE_MISMATCH','Only submitted template can be approved'); END IF;
  IF v_template.created_by=v_actor OR v_template.submitted_by=v_actor THEN RETURN private.command_fail('SOD_VIOLATION','Template creator cannot approve'); END IF;
  IF NOT private.user_has_any_role(ARRAY['system_administrator','legal_entity_administrator'],v_template.legal_entity_id,'legal_entity',v_template.legal_entity_id) THEN
    RETURN private.command_fail('FORBIDDEN','Performance administrator role required'); END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_template.legal_entity_id::TEXT||':'||upper(v_template.code),0));
  UPDATE public.appraisal_templates AS at SET governance_status='inactive',is_active=false,retired_by=v_actor,retired_at=NOW(),
    row_version=at.row_version+1 WHERE at.legal_entity_id=v_template.legal_entity_id AND upper(at.code)=upper(v_template.code)
    AND at.governance_status='approved' AND at.is_active AND at.id<>p_template_id;
  UPDATE public.appraisal_templates AS at SET governance_status='approved',is_active=true,approved_by=v_actor,approved_at=NOW(),
    row_version=at.row_version+1 WHERE at.id=p_template_id;
  PERFORM private.write_audit_event(v_actor,'approve','appraisal_template',p_template_id,v_template.legal_entity_id,NULL,NULL,
    p_correlation_id,p_idempotency_key,jsonb_build_object('status','submitted'),jsonb_build_object('status','approved','active',true),NULL,NULL);
  v_result:=private.command_ok(jsonb_build_object('entity_id',p_template_id,'governance_status','approved','is_active',true));
  PERFORM private.command_store_idempotency(v_cmd,p_idempotency_key,v_actor,v_result); RETURN v_result;
END $function$;

CREATE OR REPLACE FUNCTION public.rpc_appraisal_template_retire(
  p_template_id UUID,p_reason TEXT,p_expected_status public.governance_workflow_status DEFAULT 'approved',
  p_idempotency_key TEXT DEFAULT NULL,p_correlation_id UUID DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_actor UUID:=(SELECT auth.uid()); v_cmd TEXT:='appraisal_template_retire'; v_replay JSONB;
  v_template public.appraisal_templates%ROWTYPE; v_result JSONB;
BEGIN
  v_replay:=private.command_check_idempotency(v_cmd,p_idempotency_key,v_actor); IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF v_actor IS NULL OR NOT private.current_user_is_active() THEN RETURN private.command_fail('UNAUTHENTICATED','Authentication required'); END IF;
  SELECT * INTO v_template FROM public.appraisal_templates AS at WHERE at.id=p_template_id FOR UPDATE;
  IF NOT FOUND OR v_template.governance_status IS DISTINCT FROM p_expected_status THEN RETURN private.command_fail('STATE_MISMATCH','Active template not found'); END IF;
  IF p_reason IS NULL OR length(btrim(p_reason))<5 THEN RETURN private.command_fail('VALIDATION','Retirement reason required'); END IF;
  IF NOT private.user_has_any_role(ARRAY['system_administrator','legal_entity_administrator'],v_template.legal_entity_id,'legal_entity',v_template.legal_entity_id) THEN
    RETURN private.command_fail('FORBIDDEN','Performance administrator role required'); END IF;
  UPDATE public.appraisal_templates AS at SET governance_status='inactive',is_active=false,retired_by=v_actor,retired_at=NOW(),row_version=at.row_version+1
    WHERE at.id=p_template_id;
  PERFORM private.write_audit_event(v_actor,'update','appraisal_template',p_template_id,v_template.legal_entity_id,NULL,NULL,
    p_correlation_id,p_idempotency_key,jsonb_build_object('status','approved'),jsonb_build_object('status','inactive'),p_reason,NULL);
  v_result:=private.command_ok(jsonb_build_object('entity_id',p_template_id,'governance_status','inactive'));
  PERFORM private.command_store_idempotency(v_cmd,p_idempotency_key,v_actor,v_result); RETURN v_result;
END $function$;

CREATE OR REPLACE FUNCTION public.rpc_appraisal_goal_create(
  p_assignment_id UUID,p_description TEXT,p_target_text TEXT,p_measure_unit TEXT,p_weight NUMERIC,
  p_idempotency_key TEXT DEFAULT NULL,p_correlation_id UUID DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_actor UUID:=(SELECT auth.uid()); v_cmd TEXT:='appraisal_goal_create'; v_replay JSONB;
  v_assignment public.appraisal_assignments%ROWTYPE; v_total NUMERIC; v_id UUID; v_result JSONB;
BEGIN
  v_replay:=private.command_check_idempotency(v_cmd,p_idempotency_key,v_actor); IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF v_actor IS NULL OR NOT private.current_user_is_active() THEN RETURN private.command_fail('UNAUTHENTICATED','Authentication required'); END IF;
  SELECT * INTO v_assignment FROM public.appraisal_assignments AS aa WHERE aa.id=p_assignment_id FOR UPDATE;
  IF NOT FOUND THEN RETURN private.command_fail('NOT_FOUND','Assignment not found'); END IF;
  IF v_assignment.assignment_status<>'employee_self_review' OR EXISTS(SELECT 1 FROM public.appraisal_ratings AS ar
    WHERE ar.assignment_id=p_assignment_id AND (ar.self_rating IS NOT NULL OR ar.self_comment IS NOT NULL)) THEN
    RETURN private.command_fail('STATE_MISMATCH','Goals can be configured only before self review begins'); END IF;
  IF NOT private.user_has_any_role(ARRAY['system_administrator','legal_entity_administrator'],v_assignment.legal_entity_id,'legal_entity',v_assignment.legal_entity_id) THEN
    RETURN private.command_fail('FORBIDDEN','Performance administrator role required'); END IF;
  IF p_weight<=0 OR p_weight>100 OR NULLIF(btrim(p_description),'') IS NULL THEN RETURN private.command_fail('VALIDATION','Invalid goal or weight'); END IF;
  SELECT COALESCE(SUM(ag.weight),0) INTO v_total FROM public.appraisal_goals AS ag WHERE ag.assignment_id=p_assignment_id;
  IF v_total+p_weight>100 THEN RETURN private.command_fail('VALIDATION','Goal weights exceed 100'); END IF;
  INSERT INTO public.appraisal_goals(assignment_id,description,target_text,measure_unit,weight)
  VALUES(p_assignment_id,btrim(p_description),NULLIF(btrim(p_target_text),''),NULLIF(btrim(p_measure_unit),''),p_weight) RETURNING id INTO v_id;
  PERFORM private.write_audit_event(v_actor,'create','appraisal_goal',v_id,v_assignment.legal_entity_id,NULL,NULL,p_correlation_id,p_idempotency_key,
    NULL,jsonb_build_object('assignment_id',p_assignment_id,'weight',p_weight),NULL,NULL);
  v_result:=private.command_ok(jsonb_build_object('entity_id',v_id,'assignment_id',p_assignment_id));
  PERFORM private.command_store_idempotency(v_cmd,p_idempotency_key,v_actor,v_result); RETURN v_result;
END $function$;

CREATE OR REPLACE FUNCTION public.rpc_appraisal_goal_employee_update(
  p_goal_id UUID,p_employee_comment TEXT,p_idempotency_key TEXT DEFAULT NULL,p_correlation_id UUID DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_actor UUID:=(SELECT auth.uid()); v_cmd TEXT:='appraisal_goal_employee_update'; v_replay JSONB;
  v_assignment public.appraisal_assignments%ROWTYPE; v_goal public.appraisal_goals%ROWTYPE; v_result JSONB;
BEGIN
  v_replay:=private.command_check_idempotency(v_cmd,p_idempotency_key,v_actor); IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF v_actor IS NULL OR NOT private.current_user_is_active() THEN RETURN private.command_fail('UNAUTHENTICATED','Authentication required'); END IF;
  SELECT * INTO v_goal FROM public.appraisal_goals AS ag WHERE ag.id=p_goal_id FOR UPDATE;
  SELECT * INTO v_assignment FROM public.appraisal_assignments AS aa WHERE aa.id=v_goal.assignment_id FOR UPDATE;
  IF NOT FOUND OR v_assignment.employee_id<>v_actor THEN RETURN private.command_fail('FORBIDDEN','Only assigned employee may update own goal comment'); END IF;
  IF v_assignment.assignment_status<>'employee_self_review' THEN RETURN private.command_fail('STATE_MISMATCH','Employee goal comment is closed'); END IF;
  UPDATE public.appraisal_goals SET employee_comment=NULLIF(btrim(p_employee_comment),'') WHERE id=p_goal_id;
  PERFORM private.write_audit_event(v_actor,'update','appraisal_goal',p_goal_id,v_assignment.legal_entity_id,NULL,NULL,p_correlation_id,p_idempotency_key,
    jsonb_build_object('employee_comment',v_goal.employee_comment),jsonb_build_object('employee_comment_set',NULLIF(btrim(p_employee_comment),'') IS NOT NULL),NULL,NULL);
  v_result:=private.command_ok(jsonb_build_object('entity_id',p_goal_id));
  PERFORM private.command_store_idempotency(v_cmd,p_idempotency_key,v_actor,v_result); RETURN v_result;
END $function$;

CREATE OR REPLACE FUNCTION public.rpc_appraisal_goal_manager_update(
  p_goal_id UUID,p_manager_rating NUMERIC,p_manager_comment TEXT,p_idempotency_key TEXT DEFAULT NULL,p_correlation_id UUID DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_actor UUID:=(SELECT auth.uid()); v_cmd TEXT:='appraisal_goal_manager_update'; v_replay JSONB;
  v_assignment public.appraisal_assignments%ROWTYPE; v_goal public.appraisal_goals%ROWTYPE; v_scale INTEGER; v_result JSONB;
BEGIN
  v_replay:=private.command_check_idempotency(v_cmd,p_idempotency_key,v_actor); IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF v_actor IS NULL OR NOT private.current_user_is_active() THEN RETURN private.command_fail('UNAUTHENTICATED','Authentication required'); END IF;
  SELECT * INTO v_goal FROM public.appraisal_goals AS ag WHERE ag.id=p_goal_id FOR UPDATE;
  SELECT * INTO v_assignment FROM public.appraisal_assignments AS aa WHERE aa.id=v_goal.assignment_id FOR UPDATE;
  IF NOT FOUND OR v_assignment.manager_id<>v_actor THEN RETURN private.command_fail('FORBIDDEN','Only assigned manager may rate goal'); END IF;
  IF v_assignment.assignment_status NOT IN ('self_submitted','manager_review') THEN
    RETURN private.command_fail('STATE_MISMATCH','Manager goal rating is closed');
  END IF;
  SELECT at.rating_scale_max INTO v_scale FROM public.appraisal_templates AS at WHERE at.id=v_assignment.template_id;
  IF p_manager_rating<0 OR p_manager_rating>v_scale THEN RETURN private.command_fail('VALIDATION','Goal rating out of scale'); END IF;
  UPDATE public.appraisal_goals SET manager_rating=p_manager_rating,manager_comment=NULLIF(btrim(p_manager_comment),'') WHERE id=p_goal_id;
  PERFORM private.write_audit_event(v_actor,'update','appraisal_goal',p_goal_id,v_assignment.legal_entity_id,NULL,NULL,p_correlation_id,p_idempotency_key,
    jsonb_build_object('manager_rating',v_goal.manager_rating),jsonb_build_object('manager_rating',p_manager_rating),NULL,NULL);
  v_result:=private.command_ok(jsonb_build_object('entity_id',p_goal_id,'manager_rating',p_manager_rating));
  PERFORM private.command_store_idempotency(v_cmd,p_idempotency_key,v_actor,v_result); RETURN v_result;
END $function$;

DO $grants$ DECLARE r RECORD; BEGIN FOR r IN
  SELECT p.oid::regprocedure AS sig FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname IN ('rpc_appraisal_template_create','rpc_appraisal_template_add_criterion',
    'rpc_appraisal_template_submit','rpc_appraisal_template_approve','rpc_appraisal_template_retire',
    'rpc_appraisal_goal_create','rpc_appraisal_goal_employee_update','rpc_appraisal_goal_manager_update')
LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon',r.sig); EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',r.sig); END LOOP; END $grants$;
REVOKE ALL ON FUNCTION private.guard_appraisal_template_history() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.guard_appraisal_criterion_history() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.enforce_appraisal_assignment_template() FROM PUBLIC;

-- =============================================================================
-- Governed master revisions bound to operational records
-- =============================================================================

REVOKE INSERT,UPDATE,DELETE ON TABLE public.organization_unit_types,public.organization_units,
  public.cost_nodes,public.vendors FROM authenticated;

CREATE OR REPLACE FUNCTION public.rpc_master_record_create_revision(
  p_record_id UUID,p_name_en TEXT,p_name_ar TEXT,p_description TEXT DEFAULT NULL,p_parent_id UUID DEFAULT NULL,
  p_attributes JSONB DEFAULT '{}',p_effective_start DATE DEFAULT CURRENT_DATE,p_effective_end DATE DEFAULT NULL,
  p_change_reason TEXT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL,p_correlation_id UUID DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_actor UUID:=(SELECT auth.uid()); v_cmd TEXT:='master_record_create_revision'; v_replay JSONB;
  v_old public.governed_master_records%ROWTYPE; v_id UUID; v_result JSONB;
BEGIN
  v_replay:=private.command_check_idempotency(v_cmd,p_idempotency_key,v_actor); IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF v_actor IS NULL OR NOT private.current_user_is_active() THEN RETURN private.command_fail('UNAUTHENTICATED','Authentication required'); END IF;
  SELECT * INTO v_old FROM public.governed_master_records AS gmr WHERE gmr.id=p_record_id FOR UPDATE;
  IF NOT FOUND OR v_old.governance_status<>'approved' OR NOT v_old.is_current THEN RETURN private.command_fail('STATE_MISMATCH','Current approved master record required'); END IF;
  IF NOT private.user_has_any_role(ARRAY['system_administrator','legal_entity_administrator','finance_user','cost_controller'],
    v_old.legal_entity_id,'legal_entity',v_old.legal_entity_id) THEN RETURN private.command_fail('FORBIDDEN','Insufficient master-data role'); END IF;
  IF p_change_reason IS NULL OR length(btrim(p_change_reason))<5 THEN RETURN private.command_fail('VALIDATION','Revision reason required'); END IF;
  INSERT INTO public.governed_master_records(legal_entity_id,record_type,code,name_en,name_ar,description,parent_id,
    attributes,effective_start,effective_end,governance_status,change_reason,created_by,revision_number,supersedes_record_id,is_current)
  VALUES(v_old.legal_entity_id,v_old.record_type,v_old.code,btrim(p_name_en),btrim(p_name_ar),NULLIF(btrim(p_description),''),
    COALESCE(p_parent_id,v_old.parent_id),COALESCE(p_attributes,v_old.attributes),COALESCE(p_effective_start,CURRENT_DATE),p_effective_end,
    'draft',btrim(p_change_reason),v_actor,v_old.revision_number+1,v_old.id,false) RETURNING id INTO v_id;
  PERFORM private.write_audit_event(v_actor,'create','governed_master_record',v_id,v_old.legal_entity_id,NULL,NULL,p_correlation_id,p_idempotency_key,
    NULL,jsonb_build_object('status','draft','revision',v_old.revision_number+1,'supersedes_record_id',v_old.id),p_change_reason,NULL);
  v_result:=private.command_ok(jsonb_build_object('entity_id',v_id,'governance_status','draft','revision_number',v_old.revision_number+1));
  PERFORM private.command_store_idempotency(v_cmd,p_idempotency_key,v_actor,v_result); RETURN v_result;
END $function$;

CREATE OR REPLACE FUNCTION public.rpc_master_record_approve(
  p_record_id UUID,p_expected_status public.governance_workflow_status DEFAULT 'submitted',
  p_idempotency_key TEXT DEFAULT NULL,p_correlation_id UUID DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE
  v_actor UUID:=(SELECT auth.uid()); v_row public.governed_master_records%ROWTYPE; v_previous public.governed_master_records%ROWTYPE;
  v_result JSONB; v_operational_id UUID; v_parent_operational UUID; v_unit_type UUID; v_level SMALLINT; v_table TEXT;
BEGIN
  IF v_actor IS NULL OR NOT private.current_user_is_active() THEN RETURN private.command_fail('UNAUTHENTICATED','Authentication required'); END IF;
  SELECT * INTO v_row FROM public.governed_master_records AS gmr WHERE gmr.id=p_record_id FOR UPDATE;
  IF NOT FOUND THEN RETURN private.command_fail('NOT_FOUND','Master record not found'); END IF;
  IF v_row.record_type NOT IN ('organization_unit_type','organization_unit','department','cost_center','team',
    'cost_category','cost_subcategory','cost_item','vendor') THEN
    RETURN private.command_fail('UNSUPPORTED','This catalog type is not an operational governed master type');
  END IF;
  IF v_row.parent_id IS NOT NULL THEN
    SELECT gmb.operational_record_id INTO v_parent_operational FROM public.governed_master_bindings AS gmb
      JOIN public.governed_master_records AS parent ON parent.id=gmb.governed_record_id
    WHERE gmb.governed_record_id=v_row.parent_id AND gmb.legal_entity_id=v_row.legal_entity_id
      AND parent.governance_status='approved';
    IF v_parent_operational IS NULL THEN RETURN private.command_fail('VALIDATION','Approved operational parent required'); END IF;
  END IF;
  IF v_row.supersedes_record_id IS NOT NULL THEN
    SELECT * INTO v_previous FROM public.governed_master_records AS old WHERE old.id=v_row.supersedes_record_id FOR UPDATE;
    SELECT gmb.operational_record_id,gmb.operational_table INTO v_operational_id,v_table
      FROM public.governed_master_bindings AS gmb WHERE gmb.governed_record_id=v_previous.id;
    IF v_operational_id IS NULL THEN RETURN private.command_fail('VALIDATION','Superseded operational binding not found'); END IF;
  END IF;
  IF v_row.record_type IN ('organization_unit','department','cost_center','team') THEN
    IF NULLIF(v_row.attributes->>'unit_type_id','') IS NOT NULL THEN
      SELECT out.id INTO v_unit_type FROM public.organization_unit_types AS out
      WHERE out.id=(v_row.attributes->>'unit_type_id')::UUID AND out.legal_entity_id=v_row.legal_entity_id AND out.status='active';
    ELSE
      SELECT out.id INTO v_unit_type FROM public.organization_unit_types AS out
      WHERE out.legal_entity_id=v_row.legal_entity_id AND out.status='active'
        AND upper(out.code)=upper(CASE WHEN v_row.record_type='organization_unit' THEN COALESCE(v_row.attributes->>'unit_type_code','') ELSE v_row.record_type::TEXT END)
      ORDER BY out.level_order LIMIT 1;
    END IF;
    IF v_unit_type IS NULL THEN RETURN private.command_fail('VALIDATION','Approved operational organization-unit type required'); END IF;
  END IF;
  IF v_row.record_type IN ('cost_subcategory','cost_item') AND v_parent_operational IS NULL THEN
    RETURN private.command_fail('VALIDATION','Cost hierarchy parent required');
  END IF;

  v_result:=private.master_record_transition(p_record_id,p_expected_status,'approved',p_idempotency_key,p_correlation_id);
  IF NOT COALESCE((v_result->>'ok')::BOOLEAN,false) THEN RETURN v_result; END IF;
  IF EXISTS(SELECT 1 FROM public.governed_master_bindings AS gmb WHERE gmb.governed_record_id=p_record_id) THEN RETURN v_result; END IF;

  CASE
    WHEN v_row.record_type='organization_unit_type' THEN
      v_table:='organization_unit_types';
      IF v_operational_id IS NULL THEN
        SELECT (COALESCE(MAX(out.level_order),0)+1)::SMALLINT INTO v_level FROM public.organization_unit_types AS out WHERE out.legal_entity_id=v_row.legal_entity_id;
        INSERT INTO public.organization_unit_types(legal_entity_id,code,name_en,name_ar,level_order,is_cost_center_level,status)
        VALUES(v_row.legal_entity_id,v_row.code,v_row.name_en,v_row.name_ar,COALESCE((v_row.attributes->>'level_order')::SMALLINT,v_level),
          COALESCE((v_row.attributes->>'is_cost_center_level')::BOOLEAN,false),'active') RETURNING id INTO v_operational_id;
      ELSE
        UPDATE public.organization_unit_types SET name_en=v_row.name_en,name_ar=v_row.name_ar,
          level_order=COALESCE((v_row.attributes->>'level_order')::SMALLINT,level_order),
          is_cost_center_level=COALESCE((v_row.attributes->>'is_cost_center_level')::BOOLEAN,is_cost_center_level),status='active'
        WHERE id=v_operational_id AND legal_entity_id=v_row.legal_entity_id;
      END IF;
    WHEN v_row.record_type IN ('organization_unit','department','cost_center','team') THEN
      v_table:='organization_units';
      IF v_operational_id IS NULL THEN
        INSERT INTO public.organization_units(legal_entity_id,unit_type_id,parent_id,code,name_en,name_ar,approval_status,status,effective_start)
        VALUES(v_row.legal_entity_id,v_unit_type,v_parent_operational,v_row.code,v_row.name_en,v_row.name_ar,'approved','active',v_row.effective_start)
        RETURNING id INTO v_operational_id;
      ELSE
        UPDATE public.organization_units SET unit_type_id=v_unit_type,parent_id=v_parent_operational,name_en=v_row.name_en,name_ar=v_row.name_ar,
          approval_status='approved',status='active',effective_start=v_row.effective_start,effective_end=v_row.effective_end,
          version=version+1,updated_at=NOW() WHERE id=v_operational_id AND legal_entity_id=v_row.legal_entity_id;
      END IF;
    WHEN v_row.record_type IN ('cost_category','cost_subcategory','cost_item') THEN
      v_table:='cost_nodes';
      v_level:=CASE v_row.record_type WHEN 'cost_category' THEN 1 WHEN 'cost_subcategory' THEN 2 ELSE 3 END;
      IF v_operational_id IS NULL THEN
        INSERT INTO public.cost_nodes(legal_entity_id,parent_id,code,name_en,name_ar,node_level,classification,is_leaf,allows_posting,status)
        VALUES(v_row.legal_entity_id,v_parent_operational,v_row.code,v_row.name_en,v_row.name_ar,v_level,
          NULLIF(v_row.attributes->>'classification','')::public.cost_classification,v_row.record_type='cost_item',v_row.record_type='cost_item','active')
        RETURNING id INTO v_operational_id;
      ELSE
        UPDATE public.cost_nodes SET parent_id=v_parent_operational,name_en=v_row.name_en,name_ar=v_row.name_ar,
          classification=COALESCE(NULLIF(v_row.attributes->>'classification','')::public.cost_classification,classification),
          status='active' WHERE id=v_operational_id AND legal_entity_id=v_row.legal_entity_id;
      END IF;
    WHEN v_row.record_type='vendor' THEN
      v_table:='vendors';
      IF v_operational_id IS NULL THEN
        INSERT INTO public.vendors(legal_entity_id,code,name_en,name_ar,status,tax_registration_number,
          commercial_registration_number,country,currency_code,contact_email,contact_phone,payment_terms_days,
          supplier_category,legal_name,effective_from,effective_to,created_by,updated_by)
        VALUES(v_row.legal_entity_id,v_row.code,v_row.name_en,v_row.name_ar,'active',v_row.attributes->>'tax_registration_number',
          v_row.attributes->>'commercial_registration_number',v_row.attributes->>'country',COALESCE(v_row.attributes->>'currency_code','SAR'),
          v_row.attributes->>'contact_email',v_row.attributes->>'contact_phone',NULLIF(v_row.attributes->>'payment_terms_days','')::INTEGER,
          v_row.attributes->>'supplier_category',v_row.attributes->>'legal_name',v_row.effective_start,v_row.effective_end,v_actor,v_actor)
        RETURNING id INTO v_operational_id;
      ELSE
        UPDATE public.vendors SET name_en=v_row.name_en,name_ar=v_row.name_ar,status='active',
          tax_registration_number=v_row.attributes->>'tax_registration_number',commercial_registration_number=v_row.attributes->>'commercial_registration_number',
          country=v_row.attributes->>'country',currency_code=COALESCE(v_row.attributes->>'currency_code',currency_code),
          contact_email=v_row.attributes->>'contact_email',contact_phone=v_row.attributes->>'contact_phone',
          payment_terms_days=COALESCE(NULLIF(v_row.attributes->>'payment_terms_days','')::INTEGER,payment_terms_days),
          supplier_category=v_row.attributes->>'supplier_category',legal_name=v_row.attributes->>'legal_name',
          effective_from=v_row.effective_start,effective_to=v_row.effective_end,updated_by=v_actor,updated_at=NOW()
        WHERE id=v_operational_id AND legal_entity_id=v_row.legal_entity_id;
      END IF;
  END CASE;
  IF v_row.supersedes_record_id IS NOT NULL THEN
    UPDATE public.governed_master_records SET is_current=false,governance_status='inactive',effective_end=CURRENT_DATE,updated_at=NOW()
      WHERE id=v_row.supersedes_record_id;
    UPDATE public.governed_master_records SET is_current=true WHERE id=p_record_id;
  END IF;
  INSERT INTO public.governed_master_bindings(governed_record_id,legal_entity_id,operational_table,operational_record_id,bound_by)
    VALUES(p_record_id,v_row.legal_entity_id,v_table,v_operational_id,v_actor);
  PERFORM private.write_audit_event(v_actor,'approve','operational_master_binding',v_operational_id,v_row.legal_entity_id,NULL,NULL,
    p_correlation_id,p_idempotency_key,NULL,jsonb_build_object('governed_record_id',p_record_id,'operational_table',v_table,
    'revision_number',v_row.revision_number),v_row.change_reason,NULL);
  RETURN v_result||jsonb_build_object('operational_table',v_table,'operational_record_id',v_operational_id);
END $function$;

CREATE OR REPLACE FUNCTION public.rpc_master_record_deactivate(
  p_record_id UUID,p_expected_status public.governance_workflow_status DEFAULT 'approved',p_change_reason TEXT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL,p_correlation_id UUID DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_actor UUID:=(SELECT auth.uid()); v_cmd TEXT:='master_record_deactivate'; v_replay JSONB;
  v_row public.governed_master_records%ROWTYPE; v_binding public.governed_master_bindings%ROWTYPE; v_result JSONB;
BEGIN
  v_replay:=private.command_check_idempotency(v_cmd,p_idempotency_key,v_actor); IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF v_actor IS NULL OR NOT private.current_user_is_active() THEN RETURN private.command_fail('UNAUTHENTICATED','Authentication required'); END IF;
  SELECT * INTO v_row FROM public.governed_master_records AS gmr WHERE gmr.id=p_record_id FOR UPDATE;
  SELECT * INTO v_binding FROM public.governed_master_bindings AS gmb WHERE gmb.governed_record_id=p_record_id;
  IF NOT FOUND OR v_row.governance_status IS DISTINCT FROM p_expected_status OR NOT v_row.is_current THEN RETURN private.command_fail('STATE_MISMATCH','Current approved bound record required'); END IF;
  IF p_change_reason IS NULL OR length(btrim(p_change_reason))<5 THEN RETURN private.command_fail('VALIDATION','Deactivation reason required'); END IF;
  IF NOT private.user_has_any_role(ARRAY['system_administrator','legal_entity_administrator','finance_user','cost_controller'],
    v_row.legal_entity_id,'legal_entity',v_row.legal_entity_id) THEN RETURN private.command_fail('FORBIDDEN','Insufficient master-data role'); END IF;
  IF v_binding.operational_table='organization_unit_types' THEN
    IF EXISTS(SELECT 1 FROM public.organization_units AS ou WHERE ou.unit_type_id=v_binding.operational_record_id AND ou.status='active') THEN
      RETURN private.command_fail('DEPENDENCY','Active organization units use this type'); END IF;
    UPDATE public.organization_unit_types SET status='inactive' WHERE id=v_binding.operational_record_id;
  ELSIF v_binding.operational_table='organization_units' THEN
    IF EXISTS(SELECT 1 FROM public.organization_units AS ou WHERE ou.parent_id=v_binding.operational_record_id AND ou.status='active') THEN
      RETURN private.command_fail('DEPENDENCY','Active child organization units exist'); END IF;
    UPDATE public.organization_units SET status='inactive',effective_end=CURRENT_DATE,updated_at=NOW() WHERE id=v_binding.operational_record_id;
  ELSIF v_binding.operational_table='cost_nodes' THEN
    IF EXISTS(SELECT 1 FROM public.cost_nodes AS cn WHERE cn.parent_id=v_binding.operational_record_id AND cn.status='active') THEN
      RETURN private.command_fail('DEPENDENCY','Active child cost nodes exist'); END IF;
    UPDATE public.cost_nodes SET status='inactive' WHERE id=v_binding.operational_record_id;
  ELSIF v_binding.operational_table='vendors' THEN
    IF EXISTS(SELECT 1 FROM public.purchase_orders AS po WHERE po.vendor_id=v_binding.operational_record_id
      AND po.po_status NOT IN ('closed','cancelled','rejected')) OR EXISTS(SELECT 1 FROM public.procurement_contracts AS pc
      WHERE pc.vendor_id=v_binding.operational_record_id AND pc.contract_status IN ('draft','submitted','approved','active')) THEN
      RETURN private.command_fail('DEPENDENCY','Open procurement documents use this vendor'); END IF;
    UPDATE public.vendors SET status='inactive',effective_to=CURRENT_DATE,updated_by=v_actor,updated_at=NOW() WHERE id=v_binding.operational_record_id;
  ELSE RETURN private.command_fail('UNSUPPORTED','Operational master type cannot be deactivated'); END IF;
  UPDATE public.governed_master_records SET governance_status='inactive',is_current=false,effective_end=CURRENT_DATE,
    change_reason=btrim(p_change_reason),updated_at=NOW(),row_version=row_version+1 WHERE id=p_record_id;
  PERFORM private.write_audit_event(v_actor,'update','governed_master_record',p_record_id,v_row.legal_entity_id,NULL,NULL,p_correlation_id,p_idempotency_key,
    jsonb_build_object('status','approved'),jsonb_build_object('status','inactive','operational_record_id',v_binding.operational_record_id),p_change_reason,NULL);
  v_result:=private.command_ok(jsonb_build_object('entity_id',p_record_id,'governance_status','inactive',
    'operational_table',v_binding.operational_table,'operational_record_id',v_binding.operational_record_id));
  PERFORM private.command_store_idempotency(v_cmd,p_idempotency_key,v_actor,v_result); RETURN v_result;
END $function$;

REVOKE ALL ON FUNCTION public.rpc_master_record_create_revision(UUID,TEXT,TEXT,TEXT,UUID,JSONB,DATE,DATE,TEXT,TEXT,UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_master_record_approve(UUID,public.governance_workflow_status,TEXT,UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_master_record_deactivate(UUID,public.governance_workflow_status,TEXT,TEXT,UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_master_record_create_revision(UUID,TEXT,TEXT,TEXT,UUID,JSONB,DATE,DATE,TEXT,TEXT,UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_master_record_approve(UUID,public.governance_workflow_status,TEXT,UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_master_record_deactivate(UUID,public.governance_workflow_status,TEXT,TEXT,UUID) TO authenticated;
