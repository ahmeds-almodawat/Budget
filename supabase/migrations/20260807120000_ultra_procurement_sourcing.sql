-- Ultra procurement sourcing: vendor extension, policies, RFQ/quotation/evaluation/award
-- Additive only. Extends vendors (no suppliers table). NUMERIC(18,4) money. No bank fields.

-- =============================================================================
-- 1. Vendor master extensions (status remains record_status: active | inactive)
-- =============================================================================
ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS tax_registration_number TEXT,
  ADD COLUMN IF NOT EXISTS commercial_registration_number TEXT,
  ADD COLUMN IF NOT EXISTS country TEXT,
  ADD COLUMN IF NOT EXISTS currency_code TEXT NOT NULL DEFAULT 'SAR',
  ADD COLUMN IF NOT EXISTS contact_email TEXT,
  ADD COLUMN IF NOT EXISTS contact_phone TEXT,
  ADD COLUMN IF NOT EXISTS payment_terms_days INTEGER,
  ADD COLUMN IF NOT EXISTS supplier_category TEXT,
  ADD COLUMN IF NOT EXISTS legal_name TEXT,
  ADD COLUMN IF NOT EXISTS effective_from DATE,
  ADD COLUMN IF NOT EXISTS effective_to DATE,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_vendors_legal_entity_status
  ON public.vendors (legal_entity_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS uq_vendors_tax_registration_active
  ON public.vendors (legal_entity_id, tax_registration_number)
  WHERE tax_registration_number IS NOT NULL AND status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS uq_vendors_commercial_registration_active
  ON public.vendors (legal_entity_id, commercial_registration_number)
  WHERE commercial_registration_number IS NOT NULL AND status = 'active';

CREATE OR REPLACE FUNCTION private.vendor_is_active(p_vendor_id UUID)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.vendors AS v
    WHERE v.id = p_vendor_id
      AND v.status = 'active'
      AND (v.effective_from IS NULL OR v.effective_from <= CURRENT_DATE)
      AND (v.effective_to IS NULL OR v.effective_to >= CURRENT_DATE)
  );
$function$;

REVOKE ALL ON FUNCTION private.vendor_is_active(UUID) FROM PUBLIC;

-- =============================================================================
-- 2. Procurement policies
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.procurement_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id UUID NOT NULL REFERENCES public.legal_entities(id),
  quantity_tolerance_percent NUMERIC(7,4) NOT NULL DEFAULT 0,
  price_tolerance_percent NUMERIC(7,4) NOT NULL DEFAULT 0,
  invoice_total_tolerance_amount NUMERIC(18,4) NOT NULL DEFAULT 0,
  rfq_required_threshold NUMERIC(18,4) NOT NULL DEFAULT 0,
  minimum_quotes_required INTEGER NOT NULL DEFAULT 1,
  direct_purchase_threshold NUMERIC(18,4) NOT NULL DEFAULT 0,
  status public.record_status NOT NULL DEFAULT 'active',
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,
  created_by UUID REFERENCES public.profiles(id),
  updated_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT procurement_policies_qty_tol_chk CHECK (quantity_tolerance_percent >= 0),
  CONSTRAINT procurement_policies_price_tol_chk CHECK (price_tolerance_percent >= 0),
  CONSTRAINT procurement_policies_invoice_tol_chk CHECK (invoice_total_tolerance_amount >= 0),
  CONSTRAINT procurement_policies_min_quotes_chk CHECK (minimum_quotes_required >= 1),
  CONSTRAINT procurement_policies_effective_chk CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_procurement_policies_active_entity
  ON public.procurement_policies (legal_entity_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_procurement_policies_entity
  ON public.procurement_policies (legal_entity_id);

-- =============================================================================
-- 3. Enums
-- =============================================================================
DO $enums$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'rfq_status') THEN
    CREATE TYPE public.rfq_status AS ENUM (
      'draft', 'issued', 'responses_open', 'responses_closed',
      'evaluation', 'awarded', 'closed', 'cancelled'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'quotation_status') THEN
    CREATE TYPE public.quotation_status AS ENUM (
      'received', 'validated', 'withdrawn', 'disqualified', 'accepted_for_evaluation'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'evaluation_status') THEN
    CREATE TYPE public.evaluation_status AS ENUM (
      'draft', 'submitted', 'finalized', 'cancelled'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'award_status') THEN
    CREATE TYPE public.award_status AS ENUM (
      'draft', 'submitted', 'approved', 'rejected', 'cancelled'
    );
  END IF;
END
$enums$;

-- =============================================================================
-- 4. Requisition line extensions
-- =============================================================================
ALTER TABLE public.purchase_requisition_lines
  ADD COLUMN IF NOT EXISTS uom TEXT,
  ADD COLUMN IF NOT EXISTS organization_unit_id UUID REFERENCES public.organization_units(id),
  ADD COLUMN IF NOT EXISTS preferred_vendor_id UUID REFERENCES public.vendors(id),
  ADD COLUMN IF NOT EXISTS required_by DATE;

CREATE INDEX IF NOT EXISTS idx_prl_organization_unit
  ON public.purchase_requisition_lines (organization_unit_id)
  WHERE organization_unit_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_prl_preferred_vendor
  ON public.purchase_requisition_lines (preferred_vendor_id)
  WHERE preferred_vendor_id IS NOT NULL;

-- =============================================================================
-- 5. RFQ / quotation / evaluation / award tables
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.rfqs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id UUID NOT NULL REFERENCES public.legal_entities(id),
  requisition_id UUID NOT NULL REFERENCES public.purchase_requisitions(id),
  rfq_number TEXT NOT NULL,
  title_en TEXT NOT NULL,
  title_ar TEXT NOT NULL,
  issue_date DATE,
  response_deadline TIMESTAMPTZ,
  currency_code TEXT NOT NULL DEFAULT 'SAR',
  terms TEXT,
  delivery_location TEXT,
  rfq_status public.rfq_status NOT NULL DEFAULT 'draft',
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  issued_by UUID REFERENCES public.profiles(id),
  closed_by UUID REFERENCES public.profiles(id),
  issued_at TIMESTAMPTZ,
  responses_closed_at TIMESTAMPTZ,
  cancel_reason TEXT,
  row_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (legal_entity_id, rfq_number)
);

CREATE INDEX IF NOT EXISTS idx_rfqs_requisition ON public.rfqs (requisition_id);
CREATE INDEX IF NOT EXISTS idx_rfqs_entity_status ON public.rfqs (legal_entity_id, rfq_status);

CREATE TABLE IF NOT EXISTS public.rfq_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id UUID NOT NULL REFERENCES public.rfqs(id) ON DELETE CASCADE,
  requisition_line_id UUID NOT NULL REFERENCES public.purchase_requisition_lines(id),
  line_number SMALLINT NOT NULL,
  description TEXT NOT NULL,
  quantity NUMERIC(18,4) NOT NULL,
  uom TEXT,
  target_delivery_date DATE,
  CONSTRAINT rfq_lines_qty_chk CHECK (quantity > 0),
  UNIQUE (rfq_id, line_number),
  UNIQUE (rfq_id, requisition_line_id)
);

CREATE INDEX IF NOT EXISTS idx_rfq_lines_rfq ON public.rfq_lines (rfq_id);
CREATE INDEX IF NOT EXISTS idx_rfq_lines_requisition_line ON public.rfq_lines (requisition_line_id);

CREATE TABLE IF NOT EXISTS public.rfq_suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id UUID NOT NULL REFERENCES public.rfqs(id) ON DELETE CASCADE,
  vendor_id UUID NOT NULL REFERENCES public.vendors(id),
  invitation_status TEXT NOT NULL DEFAULT 'invited',
  invited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  invited_by UUID REFERENCES public.profiles(id),
  response_status TEXT,
  CONSTRAINT rfq_suppliers_invitation_chk CHECK (
    invitation_status IN ('invited', 'responded', 'declined', 'withdrawn')
  ),
  UNIQUE (rfq_id, vendor_id)
);

CREATE INDEX IF NOT EXISTS idx_rfq_suppliers_rfq ON public.rfq_suppliers (rfq_id);
CREATE INDEX IF NOT EXISTS idx_rfq_suppliers_vendor ON public.rfq_suppliers (vendor_id);

CREATE TABLE IF NOT EXISTS public.supplier_quotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id UUID NOT NULL REFERENCES public.legal_entities(id),
  rfq_id UUID NOT NULL REFERENCES public.rfqs(id),
  vendor_id UUID NOT NULL REFERENCES public.vendors(id),
  supplier_quote_reference TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_until DATE,
  currency_code TEXT NOT NULL DEFAULT 'SAR',
  payment_terms TEXT,
  delivery_terms TEXT,
  subtotal_ex_vat NUMERIC(18,4) NOT NULL DEFAULT 0,
  vat_amount NUMERIC(18,4) NOT NULL DEFAULT 0,
  total_amount NUMERIC(18,4) NOT NULL DEFAULT 0,
  quotation_status public.quotation_status NOT NULL DEFAULT 'received',
  entered_by UUID NOT NULL REFERENCES public.profiles(id),
  validated_by UUID REFERENCES public.profiles(id),
  notes TEXT,
  revision_number INTEGER NOT NULL DEFAULT 1,
  is_late BOOLEAN NOT NULL DEFAULT FALSE,
  row_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT supplier_quotations_amounts_chk CHECK (
    subtotal_ex_vat >= 0 AND vat_amount >= 0 AND total_amount >= 0
  ),
  UNIQUE (rfq_id, vendor_id, supplier_quote_reference)
);

CREATE INDEX IF NOT EXISTS idx_supplier_quotations_rfq ON public.supplier_quotations (rfq_id);
CREATE INDEX IF NOT EXISTS idx_supplier_quotations_vendor ON public.supplier_quotations (vendor_id);
CREATE INDEX IF NOT EXISTS idx_supplier_quotations_entity ON public.supplier_quotations (legal_entity_id);

CREATE TABLE IF NOT EXISTS public.supplier_quotation_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id UUID NOT NULL REFERENCES public.supplier_quotations(id) ON DELETE CASCADE,
  rfq_line_id UUID NOT NULL REFERENCES public.rfq_lines(id),
  quoted_quantity NUMERIC(18,4) NOT NULL,
  unit_price_ex_vat NUMERIC(18,4) NOT NULL,
  vat_rate NUMERIC(7,4) NOT NULL DEFAULT 0,
  vat_amount NUMERIC(18,4) NOT NULL DEFAULT 0,
  total_ex_vat NUMERIC(18,4) GENERATED ALWAYS AS (quoted_quantity * unit_price_ex_vat) STORED,
  delivery_days INTEGER,
  delivery_date DATE,
  alternative_specification TEXT,
  notes TEXT,
  CONSTRAINT supplier_quotation_lines_qty_chk CHECK (quoted_quantity > 0),
  CONSTRAINT supplier_quotation_lines_price_chk CHECK (unit_price_ex_vat >= 0),
  UNIQUE (quotation_id, rfq_line_id)
);

CREATE INDEX IF NOT EXISTS idx_supplier_quotation_lines_quotation
  ON public.supplier_quotation_lines (quotation_id);
CREATE INDEX IF NOT EXISTS idx_supplier_quotation_lines_rfq_line
  ON public.supplier_quotation_lines (rfq_line_id);

CREATE TABLE IF NOT EXISTS public.evaluation_criteria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id UUID NOT NULL REFERENCES public.legal_entities(id),
  rfq_id UUID NOT NULL REFERENCES public.rfqs(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  name_en TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  weight_percent NUMERIC(7,4) NOT NULL,
  scoring_scale_max NUMERIC(18,4) NOT NULL DEFAULT 100,
  is_mandatory BOOLEAN NOT NULL DEFAULT FALSE,
  sequence_no SMALLINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT evaluation_criteria_weight_chk CHECK (weight_percent > 0 AND weight_percent <= 100),
  CONSTRAINT evaluation_criteria_scale_chk CHECK (scoring_scale_max > 0),
  UNIQUE (rfq_id, sequence_no)
);

CREATE INDEX IF NOT EXISTS idx_evaluation_criteria_rfq ON public.evaluation_criteria (rfq_id);
CREATE INDEX IF NOT EXISTS idx_evaluation_criteria_entity ON public.evaluation_criteria (legal_entity_id);

CREATE TABLE IF NOT EXISTS public.sourcing_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id UUID NOT NULL REFERENCES public.legal_entities(id),
  rfq_id UUID NOT NULL REFERENCES public.rfqs(id),
  quotation_id UUID NOT NULL REFERENCES public.supplier_quotations(id),
  evaluator_id UUID NOT NULL REFERENCES public.profiles(id),
  evaluation_status public.evaluation_status NOT NULL DEFAULT 'draft',
  weighted_score NUMERIC(18,4) NOT NULL DEFAULT 0,
  has_mandatory_failure BOOLEAN NOT NULL DEFAULT FALSE,
  recommendation TEXT,
  comments TEXT,
  submitted_at TIMESTAMPTZ,
  row_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (rfq_id, quotation_id, evaluator_id)
);

CREATE INDEX IF NOT EXISTS idx_sourcing_evaluations_rfq ON public.sourcing_evaluations (rfq_id);
CREATE INDEX IF NOT EXISTS idx_sourcing_evaluations_quotation ON public.sourcing_evaluations (quotation_id);
CREATE INDEX IF NOT EXISTS idx_sourcing_evaluations_evaluator ON public.sourcing_evaluations (evaluator_id);

CREATE TABLE IF NOT EXISTS public.sourcing_evaluation_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id UUID NOT NULL REFERENCES public.sourcing_evaluations(id) ON DELETE CASCADE,
  criterion_id UUID NOT NULL REFERENCES public.evaluation_criteria(id),
  score NUMERIC(18,4) NOT NULL,
  is_pass BOOLEAN,
  comments TEXT,
  CONSTRAINT sourcing_evaluation_scores_score_chk CHECK (score >= 0),
  UNIQUE (evaluation_id, criterion_id)
);

CREATE INDEX IF NOT EXISTS idx_sourcing_evaluation_scores_evaluation
  ON public.sourcing_evaluation_scores (evaluation_id);
CREATE INDEX IF NOT EXISTS idx_sourcing_evaluation_scores_criterion
  ON public.sourcing_evaluation_scores (criterion_id);

CREATE TABLE IF NOT EXISTS public.sourcing_awards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id UUID NOT NULL REFERENCES public.legal_entities(id),
  rfq_id UUID NOT NULL REFERENCES public.rfqs(id),
  vendor_id UUID NOT NULL REFERENCES public.vendors(id),
  quotation_id UUID NOT NULL REFERENCES public.supplier_quotations(id),
  evaluation_id UUID REFERENCES public.sourcing_evaluations(id),
  award_status public.award_status NOT NULL DEFAULT 'draft',
  justification TEXT,
  total_amount NUMERIC(18,4) NOT NULL DEFAULT 0,
  submitted_by UUID NOT NULL REFERENCES public.profiles(id),
  approved_by UUID REFERENCES public.profiles(id),
  submitted_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  row_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sourcing_awards_total_chk CHECK (total_amount >= 0)
);

CREATE INDEX IF NOT EXISTS idx_sourcing_awards_rfq ON public.sourcing_awards (rfq_id);
CREATE INDEX IF NOT EXISTS idx_sourcing_awards_vendor ON public.sourcing_awards (vendor_id);
CREATE INDEX IF NOT EXISTS idx_sourcing_awards_quotation ON public.sourcing_awards (quotation_id);
CREATE INDEX IF NOT EXISTS idx_sourcing_awards_entity_status
  ON public.sourcing_awards (legal_entity_id, award_status);

CREATE TABLE IF NOT EXISTS public.sourcing_award_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  award_id UUID NOT NULL REFERENCES public.sourcing_awards(id) ON DELETE CASCADE,
  rfq_line_id UUID NOT NULL REFERENCES public.rfq_lines(id),
  requisition_line_id UUID NOT NULL REFERENCES public.purchase_requisition_lines(id),
  quotation_line_id UUID REFERENCES public.supplier_quotation_lines(id),
  awarded_quantity NUMERIC(18,4) NOT NULL,
  unit_price_ex_vat NUMERIC(18,4) NOT NULL,
  line_amount NUMERIC(18,4) GENERATED ALWAYS AS (awarded_quantity * unit_price_ex_vat) STORED,
  CONSTRAINT sourcing_award_lines_qty_chk CHECK (awarded_quantity > 0),
  CONSTRAINT sourcing_award_lines_price_chk CHECK (unit_price_ex_vat >= 0),
  UNIQUE (award_id, rfq_line_id)
);

CREATE INDEX IF NOT EXISTS idx_sourcing_award_lines_award ON public.sourcing_award_lines (award_id);
CREATE INDEX IF NOT EXISTS idx_sourcing_award_lines_rfq_line ON public.sourcing_award_lines (rfq_line_id);
CREATE INDEX IF NOT EXISTS idx_sourcing_award_lines_requisition_line
  ON public.sourcing_award_lines (requisition_line_id);

-- =============================================================================
-- 6. Helpers: remaining requisition quantity
-- =============================================================================
CREATE OR REPLACE FUNCTION private.requisition_line_awarded_qty(p_requisition_line_id UUID)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT COALESCE(SUM(sal.awarded_quantity), 0)
  FROM public.sourcing_award_lines AS sal
  JOIN public.sourcing_awards AS sa ON sa.id = sal.award_id
  WHERE sal.requisition_line_id = p_requisition_line_id
    AND sa.award_status IN ('submitted', 'approved');
$function$;

CREATE OR REPLACE FUNCTION private.requisition_line_remaining_qty(p_requisition_line_id UUID)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT GREATEST(
    COALESCE((SELECT prl.quantity FROM public.purchase_requisition_lines AS prl WHERE prl.id = p_requisition_line_id), 0)
      - private.requisition_line_awarded_qty(p_requisition_line_id),
    0
  );
$function$;

REVOKE ALL ON FUNCTION private.requisition_line_awarded_qty(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.requisition_line_remaining_qty(UUID) FROM PUBLIC;

-- =============================================================================
-- 7. Commands / RPCs
-- =============================================================================

-- 7a. Requisition line upsert (draft only)
CREATE OR REPLACE FUNCTION private.requisition_upsert_line(
  p_requisition_id UUID,
  p_line_number SMALLINT,
  p_description TEXT,
  p_quantity NUMERIC,
  p_unit_price NUMERIC,
  p_cost_node_id UUID DEFAULT NULL,
  p_uom TEXT DEFAULT NULL,
  p_organization_unit_id UUID DEFAULT NULL,
  p_preferred_vendor_id UUID DEFAULT NULL,
  p_required_by DATE DEFAULT NULL,
  p_line_id UUID DEFAULT NULL,
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
  v_cmd TEXT := 'requisition_upsert_line';
  v_replay JSONB;
  v_req public.purchase_requisitions%ROWTYPE;
  v_line_id UUID;
  v_result JSONB;
  v_total NUMERIC(18,4);
BEGIN
  v_replay := private.command_check_idempotency(v_cmd, p_idempotency_key, v_actor);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF v_actor IS NULL OR NOT private.current_user_is_active() THEN
    RETURN private.command_fail('UNAUTHENTICATED', 'Authentication required');
  END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RETURN private.command_fail('VALIDATION', 'Quantity must be positive');
  END IF;
  IF p_unit_price IS NULL OR p_unit_price < 0 THEN
    RETURN private.command_fail('VALIDATION', 'Unit price cannot be negative');
  END IF;

  SELECT * INTO v_req FROM public.purchase_requisitions AS pr
  WHERE pr.id = p_requisition_id FOR UPDATE;
  IF NOT FOUND THEN RETURN private.command_fail('NOT_FOUND', 'Requisition not found'); END IF;
  IF v_req.requisition_status NOT IN ('draft', 'returned_for_revision') THEN
    RETURN private.command_fail('STATE_MISMATCH', 'Lines editable only on draft/returned requisitions');
  END IF;
  IF v_req.fiscal_period_id IS NOT NULL THEN
    PERFORM private.assert_period_open('procurement', v_req.legal_entity_id, v_req.fiscal_period_id);
  END IF;
  IF NOT (
    v_req.requester_id = v_actor
    AND private.user_has_any_role(
      ARRAY['system_administrator','legal_entity_administrator','finance_user','cost_controller','budget_owner','procurement_user'],
      v_req.legal_entity_id, 'legal_entity', v_req.legal_entity_id)
  ) THEN
    RETURN private.command_fail('FORBIDDEN', 'Insufficient role to edit requisition lines');
  END IF;
  IF p_preferred_vendor_id IS NOT NULL AND NOT private.vendor_is_active(p_preferred_vendor_id) THEN
    RETURN private.command_fail('VENDOR_INACTIVE', 'Preferred vendor is not active');
  END IF;

  IF p_line_id IS NOT NULL THEN
    UPDATE public.purchase_requisition_lines AS prl SET
      line_number = p_line_number,
      description = p_description,
      quantity = p_quantity::NUMERIC(18,4),
      unit_price = p_unit_price::NUMERIC(18,4),
      cost_node_id = p_cost_node_id,
      uom = p_uom,
      organization_unit_id = p_organization_unit_id,
      preferred_vendor_id = p_preferred_vendor_id,
      required_by = p_required_by
    WHERE prl.id = p_line_id AND prl.requisition_id = p_requisition_id
    RETURNING prl.id INTO v_line_id;
    IF v_line_id IS NULL THEN
      RETURN private.command_fail('NOT_FOUND', 'Requisition line not found');
    END IF;
  ELSE
    INSERT INTO public.purchase_requisition_lines (
      requisition_id, line_number, description, quantity, unit_price, cost_node_id,
      uom, organization_unit_id, preferred_vendor_id, required_by
    ) VALUES (
      p_requisition_id, p_line_number, p_description, p_quantity::NUMERIC(18,4),
      p_unit_price::NUMERIC(18,4), p_cost_node_id, p_uom, p_organization_unit_id,
      p_preferred_vendor_id, p_required_by
    )
    ON CONFLICT (requisition_id, line_number) DO UPDATE SET
      description = EXCLUDED.description,
      quantity = EXCLUDED.quantity,
      unit_price = EXCLUDED.unit_price,
      cost_node_id = EXCLUDED.cost_node_id,
      uom = EXCLUDED.uom,
      organization_unit_id = EXCLUDED.organization_unit_id,
      preferred_vendor_id = EXCLUDED.preferred_vendor_id,
      required_by = EXCLUDED.required_by
    RETURNING id INTO v_line_id;
  END IF;

  SELECT COALESCE(SUM(prl.line_total), 0) INTO v_total
  FROM public.purchase_requisition_lines AS prl WHERE prl.requisition_id = p_requisition_id;

  UPDATE public.purchase_requisitions AS pr SET
    estimated_total = v_total,
    updated_at = NOW(),
    row_version = pr.row_version + 1
  WHERE pr.id = p_requisition_id;

  PERFORM private.write_audit_event(
    v_actor, 'update', 'purchase_requisition_line', v_line_id,
    v_req.legal_entity_id, v_req.control_scope_id, NULL,
    p_correlation_id, p_idempotency_key,
    NULL,
    jsonb_build_object(
      'requisition_id', p_requisition_id,
      'line_id', v_line_id,
      'line_number', p_line_number,
      'quantity', p_quantity,
      'unit_price', p_unit_price,
      'estimated_total', v_total
    ),
    NULL, NULL
  );

  v_result := private.command_ok(jsonb_build_object(
    'entity_id', v_line_id,
    'requisition_id', p_requisition_id,
    'estimated_total', v_total
  ));
  PERFORM private.command_store_idempotency(v_cmd, p_idempotency_key, v_actor, v_result);
  RETURN v_result;
END
$function$;

CREATE OR REPLACE FUNCTION public.rpc_requisition_upsert_line(
  p_requisition_id UUID,
  p_line_number SMALLINT,
  p_description TEXT,
  p_quantity NUMERIC,
  p_unit_price NUMERIC,
  p_cost_node_id UUID DEFAULT NULL,
  p_uom TEXT DEFAULT NULL,
  p_organization_unit_id UUID DEFAULT NULL,
  p_preferred_vendor_id UUID DEFAULT NULL,
  p_required_by DATE DEFAULT NULL,
  p_line_id UUID DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL,
  p_correlation_id UUID DEFAULT NULL
) RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.requisition_upsert_line(
    p_requisition_id, p_line_number, p_description, p_quantity, p_unit_price,
    p_cost_node_id, p_uom, p_organization_unit_id, p_preferred_vendor_id,
    p_required_by, p_line_id, p_idempotency_key, p_correlation_id
  );
$$;

-- 7b. Create RFQ from approved/sourcing requisition
CREATE OR REPLACE FUNCTION private.rfq_create_from_requisition(
  p_requisition_id UUID,
  p_rfq_number TEXT,
  p_title_en TEXT DEFAULT NULL,
  p_title_ar TEXT DEFAULT NULL,
  p_response_deadline TIMESTAMPTZ DEFAULT NULL,
  p_currency_code TEXT DEFAULT NULL,
  p_terms TEXT DEFAULT NULL,
  p_delivery_location TEXT DEFAULT NULL,
  p_line_ids UUID[] DEFAULT NULL,
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
  v_cmd TEXT := 'rfq_create_from_requisition';
  v_replay JSONB;
  v_req public.purchase_requisitions%ROWTYPE;
  v_rfq_id UUID;
  v_line RECORD;
  v_line_no SMALLINT := 0;
  v_remaining NUMERIC(18,4);
  v_result JSONB;
BEGIN
  v_replay := private.command_check_idempotency(v_cmd, p_idempotency_key, v_actor);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF v_actor IS NULL OR NOT private.current_user_is_active() THEN
    RETURN private.command_fail('UNAUTHENTICATED', 'Authentication required');
  END IF;
  IF p_rfq_number IS NULL OR btrim(p_rfq_number) = '' THEN
    RETURN private.command_fail('VALIDATION', 'RFQ number is required');
  END IF;

  SELECT * INTO v_req FROM public.purchase_requisitions AS pr
  WHERE pr.id = p_requisition_id FOR UPDATE;
  IF NOT FOUND THEN RETURN private.command_fail('NOT_FOUND', 'Requisition not found'); END IF;
  IF v_req.requisition_status NOT IN ('approved', 'sourcing') THEN
    RETURN private.command_fail('STATE_MISMATCH', 'Requisition must be approved or sourcing');
  END IF;
  IF v_req.fiscal_period_id IS NOT NULL THEN
    PERFORM private.assert_period_open('procurement', v_req.legal_entity_id, v_req.fiscal_period_id);
  END IF;
  IF NOT private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator','procurement_user','cost_controller'],
    v_req.legal_entity_id, 'legal_entity', v_req.legal_entity_id
  ) THEN
    RETURN private.command_fail('FORBIDDEN', 'Insufficient role to create RFQ');
  END IF;

  INSERT INTO public.rfqs (
    legal_entity_id, requisition_id, rfq_number, title_en, title_ar,
    response_deadline, currency_code, terms, delivery_location, rfq_status, created_by
  ) VALUES (
    v_req.legal_entity_id, p_requisition_id, btrim(p_rfq_number),
    COALESCE(NULLIF(btrim(p_title_en), ''), v_req.title_en),
    COALESCE(NULLIF(btrim(p_title_ar), ''), v_req.title_ar),
    p_response_deadline,
    COALESCE(NULLIF(btrim(p_currency_code), ''), v_req.currency_code),
    p_terms, p_delivery_location, 'draft', v_actor
  ) RETURNING id INTO v_rfq_id;

  FOR v_line IN
    SELECT prl.*
    FROM public.purchase_requisition_lines AS prl
    WHERE prl.requisition_id = p_requisition_id
      AND (p_line_ids IS NULL OR prl.id = ANY (p_line_ids))
    ORDER BY prl.line_number
  LOOP
    v_remaining := private.requisition_line_remaining_qty(v_line.id);
    IF v_remaining <= 0 THEN
      CONTINUE;
    END IF;
    v_line_no := v_line_no + 1;
    INSERT INTO public.rfq_lines (
      rfq_id, requisition_line_id, line_number, description, quantity, uom, target_delivery_date
    ) VALUES (
      v_rfq_id, v_line.id, v_line_no, v_line.description, v_remaining, v_line.uom, v_line.required_by
    );
  END LOOP;

  IF v_line_no = 0 THEN
    DELETE FROM public.rfqs WHERE id = v_rfq_id;
    RETURN private.command_fail('NO_REMAINING_QTY', 'No remaining requisition quantity to source');
  END IF;

  IF v_req.requisition_status = 'approved' THEN
    UPDATE public.purchase_requisitions AS pr SET
      requisition_status = 'sourcing',
      updated_at = NOW(),
      row_version = pr.row_version + 1
    WHERE pr.id = p_requisition_id;
  END IF;

  PERFORM private.write_audit_event(
    v_actor, 'create', 'rfq', v_rfq_id,
    v_req.legal_entity_id, v_req.control_scope_id, NULL,
    p_correlation_id, p_idempotency_key,
    NULL,
    jsonb_build_object('rfq_number', p_rfq_number, 'requisition_id', p_requisition_id, 'line_count', v_line_no),
    NULL, NULL
  );

  v_result := private.command_ok(jsonb_build_object('entity_id', v_rfq_id, 'rfq_status', 'draft', 'line_count', v_line_no));
  PERFORM private.command_store_idempotency(v_cmd, p_idempotency_key, v_actor, v_result);
  RETURN v_result;
END
$function$;

CREATE OR REPLACE FUNCTION public.rpc_rfq_create_from_requisition(
  p_requisition_id UUID,
  p_rfq_number TEXT,
  p_title_en TEXT DEFAULT NULL,
  p_title_ar TEXT DEFAULT NULL,
  p_response_deadline TIMESTAMPTZ DEFAULT NULL,
  p_currency_code TEXT DEFAULT NULL,
  p_terms TEXT DEFAULT NULL,
  p_delivery_location TEXT DEFAULT NULL,
  p_line_ids UUID[] DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL,
  p_correlation_id UUID DEFAULT NULL
) RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.rfq_create_from_requisition(
    p_requisition_id, p_rfq_number, p_title_en, p_title_ar, p_response_deadline,
    p_currency_code, p_terms, p_delivery_location, p_line_ids, p_idempotency_key, p_correlation_id
  );
$$;

-- 7c. Invite supplier
CREATE OR REPLACE FUNCTION private.rfq_invite_supplier(
  p_rfq_id UUID,
  p_vendor_id UUID,
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
  v_cmd TEXT := 'rfq_invite_supplier';
  v_replay JSONB;
  v_rfq public.rfqs%ROWTYPE;
  v_id UUID;
  v_result JSONB;
BEGIN
  v_replay := private.command_check_idempotency(v_cmd, p_idempotency_key, v_actor);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF v_actor IS NULL OR NOT private.current_user_is_active() THEN
    RETURN private.command_fail('UNAUTHENTICATED', 'Authentication required');
  END IF;

  SELECT * INTO v_rfq FROM public.rfqs AS r WHERE r.id = p_rfq_id FOR UPDATE;
  IF NOT FOUND THEN RETURN private.command_fail('NOT_FOUND', 'RFQ not found'); END IF;
  IF v_rfq.rfq_status NOT IN ('draft', 'issued', 'responses_open') THEN
    RETURN private.command_fail('STATE_MISMATCH', 'Cannot invite suppliers in current RFQ status');
  END IF;
  IF NOT private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator','procurement_user','cost_controller'],
    v_rfq.legal_entity_id, 'legal_entity', v_rfq.legal_entity_id
  ) THEN
    RETURN private.command_fail('FORBIDDEN', 'Insufficient role to invite supplier');
  END IF;
  IF NOT private.vendor_is_active(p_vendor_id) THEN
    RETURN private.command_fail('VENDOR_INACTIVE', 'Only active vendors may be invited');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.vendors AS v
    WHERE v.id = p_vendor_id AND v.legal_entity_id = v_rfq.legal_entity_id
  ) THEN
    RETURN private.command_fail('VALIDATION', 'Vendor must belong to RFQ legal entity');
  END IF;

  INSERT INTO public.rfq_suppliers (rfq_id, vendor_id, invitation_status, invited_by)
  VALUES (p_rfq_id, p_vendor_id, 'invited', v_actor)
  ON CONFLICT (rfq_id, vendor_id) DO UPDATE SET
    invitation_status = 'invited',
    invited_at = NOW(),
    invited_by = v_actor
  RETURNING id INTO v_id;

  PERFORM private.write_audit_event(
    v_actor, 'create', 'rfq_supplier', v_id,
    v_rfq.legal_entity_id, NULL, NULL,
    p_correlation_id, p_idempotency_key,
    NULL, jsonb_build_object('rfq_id', p_rfq_id, 'vendor_id', p_vendor_id),
    NULL, NULL
  );

  v_result := private.command_ok(jsonb_build_object('entity_id', v_id, 'rfq_id', p_rfq_id, 'vendor_id', p_vendor_id));
  PERFORM private.command_store_idempotency(v_cmd, p_idempotency_key, v_actor, v_result);
  RETURN v_result;
END
$function$;

CREATE OR REPLACE FUNCTION public.rpc_rfq_invite_supplier(
  p_rfq_id UUID,
  p_vendor_id UUID,
  p_idempotency_key TEXT DEFAULT NULL,
  p_correlation_id UUID DEFAULT NULL
) RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.rfq_invite_supplier(p_rfq_id, p_vendor_id, p_idempotency_key, p_correlation_id);
$$;

-- 7d. Issue RFQ
CREATE OR REPLACE FUNCTION private.rfq_issue(
  p_rfq_id UUID,
  p_issue_date DATE DEFAULT CURRENT_DATE,
  p_response_deadline TIMESTAMPTZ DEFAULT NULL,
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
  v_cmd TEXT := 'rfq_issue';
  v_replay JSONB;
  v_rfq public.rfqs%ROWTYPE;
  v_deadline TIMESTAMPTZ;
  v_invite_count INTEGER;
  v_result JSONB;
BEGIN
  v_replay := private.command_check_idempotency(v_cmd, p_idempotency_key, v_actor);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF v_actor IS NULL OR NOT private.current_user_is_active() THEN
    RETURN private.command_fail('UNAUTHENTICATED', 'Authentication required');
  END IF;

  SELECT * INTO v_rfq FROM public.rfqs AS r WHERE r.id = p_rfq_id FOR UPDATE;
  IF NOT FOUND THEN RETURN private.command_fail('NOT_FOUND', 'RFQ not found'); END IF;
  IF v_rfq.rfq_status IS DISTINCT FROM 'draft' THEN
    RETURN private.command_fail('STATE_MISMATCH', 'RFQ must be draft to issue');
  END IF;
  IF NOT private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator','procurement_user'],
    v_rfq.legal_entity_id, 'legal_entity', v_rfq.legal_entity_id
  ) THEN
    RETURN private.command_fail('FORBIDDEN', 'Insufficient role to issue RFQ');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.rfq_lines AS rl WHERE rl.rfq_id = p_rfq_id) THEN
    RETURN private.command_fail('VALIDATION', 'RFQ requires at least one line');
  END IF;

  SELECT COUNT(*) INTO v_invite_count FROM public.rfq_suppliers AS rs WHERE rs.rfq_id = p_rfq_id;
  IF v_invite_count < 1 THEN
    RETURN private.command_fail('VALIDATION', 'RFQ requires at least one invited supplier');
  END IF;

  v_deadline := COALESCE(p_response_deadline, v_rfq.response_deadline);
  IF v_deadline IS NOT NULL AND v_deadline::date < COALESCE(p_issue_date, CURRENT_DATE) THEN
    RETURN private.command_fail('VALIDATION', 'Response deadline cannot precede issue date');
  END IF;

  UPDATE public.rfqs AS r SET
    rfq_status = 'responses_open',
    issue_date = COALESCE(p_issue_date, CURRENT_DATE),
    response_deadline = v_deadline,
    issued_by = v_actor,
    issued_at = NOW(),
    updated_at = NOW(),
    row_version = r.row_version + 1
  WHERE r.id = p_rfq_id
  RETURNING * INTO v_rfq;

  PERFORM private.write_audit_event(
    v_actor, 'update', 'rfq', p_rfq_id,
    v_rfq.legal_entity_id, NULL, NULL,
    p_correlation_id, p_idempotency_key,
    jsonb_build_object('status', 'draft'),
    jsonb_build_object('status', 'responses_open', 'issue_date', v_rfq.issue_date),
    NULL, NULL
  );

  v_result := private.command_ok(jsonb_build_object('entity_id', p_rfq_id, 'rfq_status', 'responses_open'));
  PERFORM private.command_store_idempotency(v_cmd, p_idempotency_key, v_actor, v_result);
  RETURN v_result;
END
$function$;

CREATE OR REPLACE FUNCTION public.rpc_rfq_issue(
  p_rfq_id UUID,
  p_issue_date DATE DEFAULT CURRENT_DATE,
  p_response_deadline TIMESTAMPTZ DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL,
  p_correlation_id UUID DEFAULT NULL
) RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.rfq_issue(p_rfq_id, p_issue_date, p_response_deadline, p_idempotency_key, p_correlation_id);
$$;

-- 7e. Close responses
CREATE OR REPLACE FUNCTION private.rfq_close_responses(
  p_rfq_id UUID,
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
  v_cmd TEXT := 'rfq_close_responses';
  v_replay JSONB;
  v_rfq public.rfqs%ROWTYPE;
  v_result JSONB;
BEGIN
  v_replay := private.command_check_idempotency(v_cmd, p_idempotency_key, v_actor);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF v_actor IS NULL OR NOT private.current_user_is_active() THEN
    RETURN private.command_fail('UNAUTHENTICATED', 'Authentication required');
  END IF;

  SELECT * INTO v_rfq FROM public.rfqs AS r WHERE r.id = p_rfq_id FOR UPDATE;
  IF NOT FOUND THEN RETURN private.command_fail('NOT_FOUND', 'RFQ not found'); END IF;
  IF v_rfq.rfq_status NOT IN ('issued', 'responses_open') THEN
    RETURN private.command_fail('STATE_MISMATCH', 'RFQ responses not open');
  END IF;
  IF NOT private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator','procurement_user','cost_controller'],
    v_rfq.legal_entity_id, 'legal_entity', v_rfq.legal_entity_id
  ) THEN
    RETURN private.command_fail('FORBIDDEN', 'Insufficient role to close RFQ responses');
  END IF;

  UPDATE public.rfqs AS r SET
    rfq_status = 'responses_closed',
    closed_by = v_actor,
    responses_closed_at = NOW(),
    updated_at = NOW(),
    row_version = r.row_version + 1
  WHERE r.id = p_rfq_id
  RETURNING * INTO v_rfq;

  PERFORM private.write_audit_event(
    v_actor, 'update', 'rfq', p_rfq_id,
    v_rfq.legal_entity_id, NULL, NULL,
    p_correlation_id, p_idempotency_key,
    jsonb_build_object('status', 'responses_open'),
    jsonb_build_object('status', 'responses_closed'),
    NULL, NULL
  );

  v_result := private.command_ok(jsonb_build_object('entity_id', p_rfq_id, 'rfq_status', 'responses_closed'));
  PERFORM private.command_store_idempotency(v_cmd, p_idempotency_key, v_actor, v_result);
  RETURN v_result;
END
$function$;

CREATE OR REPLACE FUNCTION public.rpc_rfq_close_responses(
  p_rfq_id UUID,
  p_idempotency_key TEXT DEFAULT NULL,
  p_correlation_id UUID DEFAULT NULL
) RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.rfq_close_responses(p_rfq_id, p_idempotency_key, p_correlation_id);
$$;

-- 7f. Create quotation
-- p_lines: [{rfq_line_id, quoted_quantity, unit_price_ex_vat, vat_rate?, vat_amount?, delivery_days?, delivery_date?, alternative_specification?, notes?}]
CREATE OR REPLACE FUNCTION private.quotation_create(
  p_rfq_id UUID,
  p_vendor_id UUID,
  p_supplier_quote_reference TEXT,
  p_lines JSONB,
  p_currency_code TEXT DEFAULT NULL,
  p_valid_until DATE DEFAULT NULL,
  p_payment_terms TEXT DEFAULT NULL,
  p_delivery_terms TEXT DEFAULT NULL,
  p_vat_amount NUMERIC DEFAULT 0,
  p_notes TEXT DEFAULT NULL,
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
  v_cmd TEXT := 'quotation_create';
  v_replay JSONB;
  v_rfq public.rfqs%ROWTYPE;
  v_quote_id UUID;
  v_line JSONB;
  v_rfq_line public.rfq_lines%ROWTYPE;
  v_subtotal NUMERIC(18,4) := 0;
  v_line_total NUMERIC(18,4);
  v_is_late BOOLEAN := FALSE;
  v_result JSONB;
BEGIN
  v_replay := private.command_check_idempotency(v_cmd, p_idempotency_key, v_actor);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF v_actor IS NULL OR NOT private.current_user_is_active() THEN
    RETURN private.command_fail('UNAUTHENTICATED', 'Authentication required');
  END IF;
  IF p_supplier_quote_reference IS NULL OR btrim(p_supplier_quote_reference) = '' THEN
    RETURN private.command_fail('VALIDATION', 'Supplier quote reference is required');
  END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RETURN private.command_fail('VALIDATION', 'Quotation lines are required');
  END IF;

  SELECT * INTO v_rfq FROM public.rfqs AS r WHERE r.id = p_rfq_id FOR UPDATE;
  IF NOT FOUND THEN RETURN private.command_fail('NOT_FOUND', 'RFQ not found'); END IF;
  IF v_rfq.rfq_status NOT IN ('responses_open', 'issued') THEN
    RETURN private.command_fail('STATE_MISMATCH', 'Quotations accepted only while responses are open');
  END IF;
  IF NOT private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator','procurement_user','finance_user','cost_controller'],
    v_rfq.legal_entity_id, 'legal_entity', v_rfq.legal_entity_id
  ) THEN
    RETURN private.command_fail('FORBIDDEN', 'Insufficient role to create quotation');
  END IF;
  IF NOT private.vendor_is_active(p_vendor_id) THEN
    RETURN private.command_fail('VENDOR_INACTIVE', 'Inactive vendor cannot quote');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.rfq_suppliers AS rs
    WHERE rs.rfq_id = p_rfq_id AND rs.vendor_id = p_vendor_id
  ) THEN
    RETURN private.command_fail('VALIDATION', 'Vendor must be invited to RFQ');
  END IF;

  IF v_rfq.response_deadline IS NOT NULL AND NOW() > v_rfq.response_deadline THEN
    v_is_late := TRUE;
    RETURN private.command_fail('LATE_QUOTATION', 'Response deadline has passed; late quotations are not silently accepted');
  END IF;

  -- Validate all lines before insert (avoid partial commit on command_fail)
  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.rfq_lines AS rl
      WHERE rl.id = (v_line->>'rfq_line_id')::UUID AND rl.rfq_id = p_rfq_id
    ) THEN
      RETURN private.command_fail('VALIDATION', 'Invalid RFQ line on quotation');
    END IF;
    IF (v_line->>'quoted_quantity')::NUMERIC <= 0 OR (v_line->>'unit_price_ex_vat')::NUMERIC < 0 THEN
      RETURN private.command_fail('VALIDATION', 'Invalid quotation line amounts');
    END IF;
  END LOOP;

  INSERT INTO public.supplier_quotations (
    legal_entity_id, rfq_id, vendor_id, supplier_quote_reference, valid_until,
    currency_code, payment_terms, delivery_terms, vat_amount, notes,
    quotation_status, entered_by, is_late
  ) VALUES (
    v_rfq.legal_entity_id, p_rfq_id, p_vendor_id, btrim(p_supplier_quote_reference), p_valid_until,
    COALESCE(NULLIF(btrim(p_currency_code), ''), v_rfq.currency_code),
    p_payment_terms, p_delivery_terms, COALESCE(p_vat_amount, 0)::NUMERIC(18,4), p_notes,
    'received', v_actor, v_is_late
  ) RETURNING id INTO v_quote_id;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines)
  LOOP
    SELECT * INTO v_rfq_line FROM public.rfq_lines AS rl
    WHERE rl.id = (v_line->>'rfq_line_id')::UUID AND rl.rfq_id = p_rfq_id;

    v_line_total := ((v_line->>'quoted_quantity')::NUMERIC * (v_line->>'unit_price_ex_vat')::NUMERIC)::NUMERIC(18,4);
    v_subtotal := v_subtotal + v_line_total;

    INSERT INTO public.supplier_quotation_lines (
      quotation_id, rfq_line_id, quoted_quantity, unit_price_ex_vat,
      vat_rate, vat_amount, delivery_days, delivery_date, alternative_specification, notes
    ) VALUES (
      v_quote_id,
      v_rfq_line.id,
      (v_line->>'quoted_quantity')::NUMERIC(18,4),
      (v_line->>'unit_price_ex_vat')::NUMERIC(18,4),
      COALESCE((v_line->>'vat_rate')::NUMERIC, 0)::NUMERIC(7,4),
      COALESCE((v_line->>'vat_amount')::NUMERIC, 0)::NUMERIC(18,4),
      (v_line->>'delivery_days')::INTEGER,
      (v_line->>'delivery_date')::DATE,
      v_line->>'alternative_specification',
      v_line->>'notes'
    );
  END LOOP;

  UPDATE public.supplier_quotations AS sq SET
    subtotal_ex_vat = v_subtotal,
    total_amount = v_subtotal + COALESCE(p_vat_amount, 0)::NUMERIC(18,4),
    updated_at = NOW()
  WHERE sq.id = v_quote_id;

  UPDATE public.rfq_suppliers AS rs SET
    invitation_status = 'responded',
    response_status = 'received'
  WHERE rs.rfq_id = p_rfq_id AND rs.vendor_id = p_vendor_id;

  PERFORM private.write_audit_event(
    v_actor, 'create', 'supplier_quotation', v_quote_id,
    v_rfq.legal_entity_id, NULL, NULL,
    p_correlation_id, p_idempotency_key,
    NULL,
    jsonb_build_object(
      'rfq_id', p_rfq_id,
      'vendor_id', p_vendor_id,
      'supplier_quote_reference', p_supplier_quote_reference,
      'subtotal_ex_vat', v_subtotal
    ),
    NULL, NULL
  );

  v_result := private.command_ok(jsonb_build_object(
    'entity_id', v_quote_id,
    'subtotal_ex_vat', v_subtotal,
    'total_amount', v_subtotal + COALESCE(p_vat_amount, 0)::NUMERIC(18,4)
  ));
  PERFORM private.command_store_idempotency(v_cmd, p_idempotency_key, v_actor, v_result);
  RETURN v_result;
END
$function$;

CREATE OR REPLACE FUNCTION public.rpc_quotation_create(
  p_rfq_id UUID,
  p_vendor_id UUID,
  p_supplier_quote_reference TEXT,
  p_lines JSONB,
  p_currency_code TEXT DEFAULT NULL,
  p_valid_until DATE DEFAULT NULL,
  p_payment_terms TEXT DEFAULT NULL,
  p_delivery_terms TEXT DEFAULT NULL,
  p_vat_amount NUMERIC DEFAULT 0,
  p_notes TEXT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL,
  p_correlation_id UUID DEFAULT NULL
) RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.quotation_create(
    p_rfq_id, p_vendor_id, p_supplier_quote_reference, p_lines, p_currency_code,
    p_valid_until, p_payment_terms, p_delivery_terms, p_vat_amount, p_notes,
    p_idempotency_key, p_correlation_id
  );
$$;

-- 7g. Evaluation submit
-- p_criteria (optional upsert): [{sequence_no, category, name_en, name_ar, weight_percent, scoring_scale_max?, is_mandatory?}]
-- p_scores: [{criterion_id? | sequence_no?, score, is_pass?, comments?}]
CREATE OR REPLACE FUNCTION private.evaluation_submit(
  p_rfq_id UUID,
  p_quotation_id UUID,
  p_scores JSONB,
  p_criteria JSONB DEFAULT NULL,
  p_recommendation TEXT DEFAULT NULL,
  p_comments TEXT DEFAULT NULL,
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
  v_cmd TEXT := 'evaluation_submit';
  v_replay JSONB;
  v_rfq public.rfqs%ROWTYPE;
  v_quote public.supplier_quotations%ROWTYPE;
  v_eval_id UUID;
  v_crit JSONB;
  v_score JSONB;
  v_weight_sum NUMERIC(18,4);
  v_weighted NUMERIC(18,4) := 0;
  v_has_fail BOOLEAN := FALSE;
  v_criterion_id UUID;
  v_scale NUMERIC(18,4);
  v_weight NUMERIC(7,4);
  v_raw NUMERIC(18,4);
  v_result JSONB;
BEGIN
  v_replay := private.command_check_idempotency(v_cmd, p_idempotency_key, v_actor);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF v_actor IS NULL OR NOT private.current_user_is_active() THEN
    RETURN private.command_fail('UNAUTHENTICATED', 'Authentication required');
  END IF;
  IF p_scores IS NULL OR jsonb_typeof(p_scores) <> 'array' OR jsonb_array_length(p_scores) = 0 THEN
    RETURN private.command_fail('VALIDATION', 'Scores are required');
  END IF;

  SELECT * INTO v_rfq FROM public.rfqs AS r WHERE r.id = p_rfq_id FOR UPDATE;
  IF NOT FOUND THEN RETURN private.command_fail('NOT_FOUND', 'RFQ not found'); END IF;
  IF v_rfq.rfq_status NOT IN ('responses_closed', 'evaluation', 'awarded') THEN
    RETURN private.command_fail('STATE_MISMATCH', 'RFQ not ready for evaluation');
  END IF;
  IF NOT private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator','procurement_user','finance_user','cost_controller','approver'],
    v_rfq.legal_entity_id, 'legal_entity', v_rfq.legal_entity_id
  ) THEN
    RETURN private.command_fail('FORBIDDEN', 'Insufficient role to submit evaluation');
  END IF;

  SELECT * INTO v_quote FROM public.supplier_quotations AS sq
  WHERE sq.id = p_quotation_id AND sq.rfq_id = p_rfq_id;
  IF NOT FOUND THEN RETURN private.command_fail('NOT_FOUND', 'Quotation not found for RFQ'); END IF;
  IF v_quote.quotation_status IN ('withdrawn', 'disqualified') THEN
    RETURN private.command_fail('STATE_MISMATCH', 'Quotation not eligible for evaluation');
  END IF;

  IF p_criteria IS NOT NULL AND jsonb_typeof(p_criteria) = 'array' AND jsonb_array_length(p_criteria) > 0 THEN
    SELECT COALESCE(SUM((c->>'weight_percent')::NUMERIC), 0) INTO v_weight_sum
    FROM jsonb_array_elements(p_criteria) AS c;
    IF v_weight_sum IS DISTINCT FROM 100::NUMERIC THEN
      RETURN private.command_fail('VALIDATION', 'Evaluation criteria weights must sum to 100');
    END IF;

    DELETE FROM public.evaluation_criteria AS ec WHERE ec.rfq_id = p_rfq_id;
    FOR v_crit IN SELECT value FROM jsonb_array_elements(p_criteria)
    LOOP
      INSERT INTO public.evaluation_criteria (
        legal_entity_id, rfq_id, category, name_en, name_ar,
        weight_percent, scoring_scale_max, is_mandatory, sequence_no
      ) VALUES (
        v_rfq.legal_entity_id, p_rfq_id,
        COALESCE(v_crit->>'category', 'general'),
        v_crit->>'name_en',
        COALESCE(v_crit->>'name_ar', v_crit->>'name_en'),
        (v_crit->>'weight_percent')::NUMERIC(7,4),
        COALESCE((v_crit->>'scoring_scale_max')::NUMERIC, 100)::NUMERIC(18,4),
        COALESCE((v_crit->>'is_mandatory')::BOOLEAN, FALSE),
        (v_crit->>'sequence_no')::SMALLINT
      );
    END LOOP;
  END IF;

  SELECT COALESCE(SUM(ec.weight_percent), 0) INTO v_weight_sum
  FROM public.evaluation_criteria AS ec WHERE ec.rfq_id = p_rfq_id;
  IF v_weight_sum IS DISTINCT FROM 100::NUMERIC THEN
    RETURN private.command_fail('VALIDATION', 'Evaluation criteria weights must sum to 100');
  END IF;

  INSERT INTO public.sourcing_evaluations (
    legal_entity_id, rfq_id, quotation_id, evaluator_id, evaluation_status,
    recommendation, comments
  ) VALUES (
    v_rfq.legal_entity_id, p_rfq_id, p_quotation_id, v_actor, 'draft',
    p_recommendation, p_comments
  )
  ON CONFLICT (rfq_id, quotation_id, evaluator_id) DO UPDATE SET
    recommendation = EXCLUDED.recommendation,
    comments = EXCLUDED.comments,
    evaluation_status = 'draft',
    updated_at = NOW(),
    row_version = public.sourcing_evaluations.row_version + 1
  RETURNING id INTO v_eval_id;

  DELETE FROM public.sourcing_evaluation_scores AS ses WHERE ses.evaluation_id = v_eval_id;

  FOR v_score IN SELECT value FROM jsonb_array_elements(p_scores)
  LOOP
    IF v_score ? 'criterion_id' AND NULLIF(v_score->>'criterion_id', '') IS NOT NULL THEN
      v_criterion_id := (v_score->>'criterion_id')::UUID;
    ELSE
      SELECT ec.id INTO v_criterion_id
      FROM public.evaluation_criteria AS ec
      WHERE ec.rfq_id = p_rfq_id AND ec.sequence_no = (v_score->>'sequence_no')::SMALLINT;
    END IF;

    SELECT ec.scoring_scale_max, ec.weight_percent
    INTO v_scale, v_weight
    FROM public.evaluation_criteria AS ec
    WHERE ec.id = v_criterion_id AND ec.rfq_id = p_rfq_id;
    IF NOT FOUND THEN
      DELETE FROM public.sourcing_evaluation_scores AS ses WHERE ses.evaluation_id = v_eval_id;
      RETURN private.command_fail('VALIDATION', 'Unknown evaluation criterion');
    END IF;

    v_raw := (v_score->>'score')::NUMERIC(18,4);
    IF v_raw < 0 OR v_raw > v_scale THEN
      DELETE FROM public.sourcing_evaluation_scores AS ses WHERE ses.evaluation_id = v_eval_id;
      RETURN private.command_fail('VALIDATION', 'Score out of scale');
    END IF;

    IF COALESCE((v_score->>'is_pass')::BOOLEAN, TRUE) = FALSE THEN
      v_has_fail := TRUE;
    ELSIF EXISTS (
      SELECT 1 FROM public.evaluation_criteria AS ec
      WHERE ec.id = v_criterion_id AND ec.is_mandatory AND v_raw = 0
    ) THEN
      v_has_fail := TRUE;
    END IF;

    -- Weighted contribution: (score / scale) * weight_percent
    v_weighted := v_weighted + ((v_raw / v_scale) * v_weight)::NUMERIC(18,4);

    INSERT INTO public.sourcing_evaluation_scores (
      evaluation_id, criterion_id, score, is_pass, comments
    ) VALUES (
      v_eval_id, v_criterion_id, v_raw,
      (v_score->>'is_pass')::BOOLEAN,
      v_score->>'comments'
    );
  END LOOP;

  IF (
    SELECT COUNT(*) FROM public.sourcing_evaluation_scores AS ses WHERE ses.evaluation_id = v_eval_id
  ) <> (
    SELECT COUNT(*) FROM public.evaluation_criteria AS ec WHERE ec.rfq_id = p_rfq_id
  ) THEN
    DELETE FROM public.sourcing_evaluation_scores AS ses WHERE ses.evaluation_id = v_eval_id;
    RETURN private.command_fail('VALIDATION', 'All criteria must be scored');
  END IF;

  UPDATE public.sourcing_evaluations AS se SET
    weighted_score = v_weighted,
    has_mandatory_failure = v_has_fail,
    evaluation_status = 'submitted',
    submitted_at = NOW(),
    updated_at = NOW(),
    row_version = se.row_version + 1
  WHERE se.id = v_eval_id;

  IF v_rfq.rfq_status = 'responses_closed' THEN
    UPDATE public.rfqs AS r SET
      rfq_status = 'evaluation',
      updated_at = NOW(),
      row_version = r.row_version + 1
    WHERE r.id = p_rfq_id;
  END IF;

  IF v_quote.quotation_status = 'received' THEN
    UPDATE public.supplier_quotations AS sq SET
      quotation_status = 'accepted_for_evaluation',
      updated_at = NOW(),
      row_version = sq.row_version + 1
    WHERE sq.id = p_quotation_id;
  END IF;

  PERFORM private.write_audit_event(
    v_actor, 'update', 'sourcing_evaluation', v_eval_id,
    v_rfq.legal_entity_id, NULL, NULL,
    p_correlation_id, p_idempotency_key,
    NULL,
    jsonb_build_object(
      'rfq_id', p_rfq_id,
      'quotation_id', p_quotation_id,
      'weighted_score', v_weighted,
      'has_mandatory_failure', v_has_fail
    ),
    NULL, NULL
  );

  v_result := private.command_ok(jsonb_build_object(
    'entity_id', v_eval_id,
    'weighted_score', v_weighted,
    'has_mandatory_failure', v_has_fail,
    'evaluation_status', 'submitted'
  ));
  PERFORM private.command_store_idempotency(v_cmd, p_idempotency_key, v_actor, v_result);
  RETURN v_result;
END
$function$;

CREATE OR REPLACE FUNCTION public.rpc_evaluation_submit(
  p_rfq_id UUID,
  p_quotation_id UUID,
  p_scores JSONB,
  p_criteria JSONB DEFAULT NULL,
  p_recommendation TEXT DEFAULT NULL,
  p_comments TEXT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL,
  p_correlation_id UUID DEFAULT NULL
) RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.evaluation_submit(
    p_rfq_id, p_quotation_id, p_scores, p_criteria, p_recommendation, p_comments,
    p_idempotency_key, p_correlation_id
  );
$$;

-- 7h. Award create and submit
-- p_lines: [{rfq_line_id, awarded_quantity, unit_price_ex_vat, quotation_line_id?}]
CREATE OR REPLACE FUNCTION private.award_create_and_submit(
  p_rfq_id UUID,
  p_quotation_id UUID,
  p_lines JSONB,
  p_justification TEXT DEFAULT NULL,
  p_evaluation_id UUID DEFAULT NULL,
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
  v_cmd TEXT := 'award_create_and_submit';
  v_replay JSONB;
  v_rfq public.rfqs%ROWTYPE;
  v_quote public.supplier_quotations%ROWTYPE;
  v_award_id UUID;
  v_line JSONB;
  v_rfq_line public.rfq_lines%ROWTYPE;
  v_qty NUMERIC(18,4);
  v_remaining NUMERIC(18,4);
  v_consumed NUMERIC(18,4);
  v_total NUMERIC(18,4) := 0;
  v_result JSONB;
  v_pending JSONB := '{}'::jsonb;
BEGIN
  v_replay := private.command_check_idempotency(v_cmd, p_idempotency_key, v_actor);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF v_actor IS NULL OR NOT private.current_user_is_active() THEN
    RETURN private.command_fail('UNAUTHENTICATED', 'Authentication required');
  END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RETURN private.command_fail('VALIDATION', 'Award lines are required');
  END IF;

  SELECT * INTO v_rfq FROM public.rfqs AS r WHERE r.id = p_rfq_id FOR UPDATE;
  IF NOT FOUND THEN RETURN private.command_fail('NOT_FOUND', 'RFQ not found'); END IF;
  IF v_rfq.rfq_status NOT IN ('evaluation', 'responses_closed', 'awarded') THEN
    RETURN private.command_fail('STATE_MISMATCH', 'RFQ not ready for award');
  END IF;
  IF NOT private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator','procurement_user','cost_controller'],
    v_rfq.legal_entity_id, 'legal_entity', v_rfq.legal_entity_id
  ) THEN
    RETURN private.command_fail('FORBIDDEN', 'Insufficient role to create award');
  END IF;

  SELECT * INTO v_quote FROM public.supplier_quotations AS sq
  WHERE sq.id = p_quotation_id AND sq.rfq_id = p_rfq_id;
  IF NOT FOUND THEN RETURN private.command_fail('NOT_FOUND', 'Quotation not found'); END IF;
  IF NOT private.vendor_is_active(v_quote.vendor_id) THEN
    RETURN private.command_fail('VENDOR_INACTIVE', 'Cannot award inactive vendor');
  END IF;

  -- Validate all lines before insert (avoid partial commit on command_fail)
  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines)
  LOOP
    SELECT * INTO v_rfq_line FROM public.rfq_lines AS rl
    WHERE rl.id = (v_line->>'rfq_line_id')::UUID AND rl.rfq_id = p_rfq_id;
    IF NOT FOUND THEN
      RETURN private.command_fail('VALIDATION', 'Invalid RFQ line on award');
    END IF;

    v_qty := (v_line->>'awarded_quantity')::NUMERIC(18,4);
    IF v_qty <= 0 OR (v_line->>'unit_price_ex_vat')::NUMERIC < 0 THEN
      RETURN private.command_fail('VALIDATION', 'Invalid award line amounts');
    END IF;

    v_consumed := COALESCE((v_pending->>v_rfq_line.requisition_line_id::text)::NUMERIC, 0);
    v_remaining := private.requisition_line_remaining_qty(v_rfq_line.requisition_line_id) - v_consumed;
    IF v_qty > v_remaining THEN
      RETURN private.command_fail('QTY_EXCEEDED', 'Award quantity exceeds requisition remaining');
    END IF;
    v_pending := jsonb_set(
      v_pending,
      ARRAY[v_rfq_line.requisition_line_id::text],
      to_jsonb(v_consumed + v_qty)
    );
  END LOOP;

  INSERT INTO public.sourcing_awards (
    legal_entity_id, rfq_id, vendor_id, quotation_id, evaluation_id,
    award_status, justification, submitted_by, submitted_at
  ) VALUES (
    v_rfq.legal_entity_id, p_rfq_id, v_quote.vendor_id, p_quotation_id, p_evaluation_id,
    'submitted', p_justification, v_actor, NOW()
  ) RETURNING id INTO v_award_id;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines)
  LOOP
    SELECT * INTO v_rfq_line FROM public.rfq_lines AS rl
    WHERE rl.id = (v_line->>'rfq_line_id')::UUID AND rl.rfq_id = p_rfq_id;

    v_qty := (v_line->>'awarded_quantity')::NUMERIC(18,4);

    INSERT INTO public.sourcing_award_lines (
      award_id, rfq_line_id, requisition_line_id, quotation_line_id,
      awarded_quantity, unit_price_ex_vat
    ) VALUES (
      v_award_id,
      v_rfq_line.id,
      v_rfq_line.requisition_line_id,
      (v_line->>'quotation_line_id')::UUID,
      v_qty,
      (v_line->>'unit_price_ex_vat')::NUMERIC(18,4)
    );

    v_total := v_total + (v_qty * (v_line->>'unit_price_ex_vat')::NUMERIC)::NUMERIC(18,4);
  END LOOP;

  UPDATE public.sourcing_awards AS sa SET
    total_amount = v_total,
    updated_at = NOW()
  WHERE sa.id = v_award_id;

  PERFORM private.write_audit_event(
    v_actor, 'create', 'sourcing_award', v_award_id,
    v_rfq.legal_entity_id, NULL, NULL,
    p_correlation_id, p_idempotency_key,
    NULL,
    jsonb_build_object(
      'rfq_id', p_rfq_id,
      'quotation_id', p_quotation_id,
      'vendor_id', v_quote.vendor_id,
      'total_amount', v_total,
      'award_status', 'submitted'
    ),
    p_justification, NULL
  );

  v_result := private.command_ok(jsonb_build_object(
    'entity_id', v_award_id,
    'award_status', 'submitted',
    'total_amount', v_total
  ));
  PERFORM private.command_store_idempotency(v_cmd, p_idempotency_key, v_actor, v_result);
  RETURN v_result;
END
$function$;

CREATE OR REPLACE FUNCTION public.rpc_award_create_and_submit(
  p_rfq_id UUID,
  p_quotation_id UUID,
  p_lines JSONB,
  p_justification TEXT DEFAULT NULL,
  p_evaluation_id UUID DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL,
  p_correlation_id UUID DEFAULT NULL
) RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.award_create_and_submit(
    p_rfq_id, p_quotation_id, p_lines, p_justification, p_evaluation_id,
    p_idempotency_key, p_correlation_id
  );
$$;

-- 7i. Award approve (SOD)
CREATE OR REPLACE FUNCTION private.award_approve(
  p_award_id UUID,
  p_expected_status public.award_status DEFAULT 'submitted',
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
  v_cmd TEXT := 'award_approve';
  v_replay JSONB;
  v_award public.sourcing_awards%ROWTYPE;
  v_rfq public.rfqs%ROWTYPE;
  v_req public.purchase_requisitions%ROWTYPE;
  v_line RECORD;
  v_remaining NUMERIC(18,4);
  v_result JSONB;
BEGIN
  v_replay := private.command_check_idempotency(v_cmd, p_idempotency_key, v_actor);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF v_actor IS NULL OR NOT private.current_user_is_active() THEN
    RETURN private.command_fail('UNAUTHENTICATED', 'Authentication required');
  END IF;

  SELECT * INTO v_award FROM public.sourcing_awards AS sa
  WHERE sa.id = p_award_id FOR UPDATE;
  IF NOT FOUND THEN RETURN private.command_fail('NOT_FOUND', 'Award not found'); END IF;
  IF v_award.award_status IS DISTINCT FROM p_expected_status THEN
    RETURN private.command_fail('STATE_MISMATCH', 'Unexpected award status');
  END IF;
  IF v_award.award_status IS DISTINCT FROM 'submitted' THEN
    RETURN private.command_fail('STATE_MISMATCH', 'Only submitted awards can be approved');
  END IF;

  SELECT * INTO v_rfq FROM public.rfqs AS r WHERE r.id = v_award.rfq_id FOR UPDATE;
  SELECT * INTO v_req FROM public.purchase_requisitions AS pr WHERE pr.id = v_rfq.requisition_id;

  IF NOT private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator','approver','finance_user'],
    v_award.legal_entity_id, 'legal_entity', v_award.legal_entity_id
  ) THEN
    RETURN private.command_fail('FORBIDDEN', 'Insufficient role to approve award');
  END IF;

  -- SOD: requester cannot final approve
  IF v_req.requester_id = v_actor THEN
    RETURN private.command_fail('SOD_VIOLATION', 'Requester cannot final approve award');
  END IF;
  -- SOD: award submitter cannot approve own award
  IF v_award.submitted_by = v_actor THEN
    RETURN private.command_fail('SOD_VIOLATION', 'Award submitter cannot final approve');
  END IF;
  -- SOD: evaluator cannot be sole final approver
  IF EXISTS (
    SELECT 1 FROM public.sourcing_evaluations AS se
    WHERE se.rfq_id = v_award.rfq_id
      AND se.evaluator_id = v_actor
      AND se.evaluation_status IN ('submitted', 'finalized')
  ) THEN
    RETURN private.command_fail('SOD_VIOLATION', 'Evaluator cannot sole final approve award');
  END IF;

  -- Re-validate remaining quantities under lock
  FOR v_line IN
    SELECT sal.*, prl.quantity AS req_qty
    FROM public.sourcing_award_lines AS sal
    JOIN public.purchase_requisition_lines AS prl ON prl.id = sal.requisition_line_id
    WHERE sal.award_id = p_award_id
  LOOP
    v_remaining := private.requisition_line_remaining_qty(v_line.requisition_line_id)
      + v_line.awarded_quantity; -- add back this award's submitted qty
    IF v_line.awarded_quantity > v_remaining THEN
      RETURN private.command_fail('QTY_EXCEEDED', 'Award quantity exceeds requisition remaining');
    END IF;
  END LOOP;

  IF NOT private.vendor_is_active(v_award.vendor_id) THEN
    RETURN private.command_fail('VENDOR_INACTIVE', 'Cannot approve award for inactive vendor');
  END IF;

  UPDATE public.sourcing_awards AS sa SET
    award_status = 'approved',
    approved_by = v_actor,
    approved_at = NOW(),
    updated_at = NOW(),
    row_version = sa.row_version + 1
  WHERE sa.id = p_award_id
  RETURNING * INTO v_award;

  UPDATE public.rfqs AS r SET
    rfq_status = 'awarded',
    updated_at = NOW(),
    row_version = r.row_version + 1
  WHERE r.id = v_rfq.id
    AND r.rfq_status <> 'closed';

  PERFORM private.write_audit_event(
    v_actor, 'approve', 'sourcing_award', p_award_id,
    v_award.legal_entity_id, NULL, NULL,
    p_correlation_id, p_idempotency_key,
    jsonb_build_object('status', 'submitted'),
    jsonb_build_object('status', 'approved', 'total_amount', v_award.total_amount),
    NULL, NULL
  );

  v_result := private.command_ok(jsonb_build_object(
    'entity_id', p_award_id,
    'award_status', 'approved'
  ));
  PERFORM private.command_store_idempotency(v_cmd, p_idempotency_key, v_actor, v_result);
  RETURN v_result;
END
$function$;

CREATE OR REPLACE FUNCTION public.rpc_award_approve(
  p_award_id UUID,
  p_expected_status public.award_status DEFAULT 'submitted',
  p_idempotency_key TEXT DEFAULT NULL,
  p_correlation_id UUID DEFAULT NULL
) RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.award_approve(p_award_id, p_expected_status, p_idempotency_key, p_correlation_id);
$$;

-- =============================================================================
-- 8. Grants / revoke on functions
-- =============================================================================
REVOKE ALL ON FUNCTION public.rpc_requisition_upsert_line(UUID, SMALLINT, TEXT, NUMERIC, NUMERIC, UUID, TEXT, UUID, UUID, DATE, UUID, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_rfq_create_from_requisition(UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT, TEXT, UUID[], TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_rfq_invite_supplier(UUID, UUID, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_rfq_issue(UUID, DATE, TIMESTAMPTZ, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_rfq_close_responses(UUID, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_quotation_create(UUID, UUID, TEXT, JSONB, TEXT, DATE, TEXT, TEXT, NUMERIC, TEXT, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_evaluation_submit(UUID, UUID, JSONB, JSONB, TEXT, TEXT, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_award_create_and_submit(UUID, UUID, JSONB, TEXT, UUID, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_award_approve(UUID, public.award_status, TEXT, UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.rpc_requisition_upsert_line(UUID, SMALLINT, TEXT, NUMERIC, NUMERIC, UUID, TEXT, UUID, UUID, DATE, UUID, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_rfq_create_from_requisition(UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT, TEXT, UUID[], TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_rfq_invite_supplier(UUID, UUID, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_rfq_issue(UUID, DATE, TIMESTAMPTZ, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_rfq_close_responses(UUID, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_quotation_create(UUID, UUID, TEXT, JSONB, TEXT, DATE, TEXT, TEXT, NUMERIC, TEXT, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_evaluation_submit(UUID, UUID, JSONB, JSONB, TEXT, TEXT, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_award_create_and_submit(UUID, UUID, JSONB, TEXT, UUID, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_award_approve(UUID, public.award_status, TEXT, UUID) TO authenticated;

REVOKE ALL ON FUNCTION private.requisition_upsert_line(UUID, SMALLINT, TEXT, NUMERIC, NUMERIC, UUID, TEXT, UUID, UUID, DATE, UUID, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.rfq_create_from_requisition(UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT, TEXT, UUID[], TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.rfq_invite_supplier(UUID, UUID, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.rfq_issue(UUID, DATE, TIMESTAMPTZ, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.rfq_close_responses(UUID, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.quotation_create(UUID, UUID, TEXT, JSONB, TEXT, DATE, TEXT, TEXT, NUMERIC, TEXT, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.evaluation_submit(UUID, UUID, JSONB, JSONB, TEXT, TEXT, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.award_create_and_submit(UUID, UUID, JSONB, TEXT, UUID, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.award_approve(UUID, public.award_status, TEXT, UUID) FROM PUBLIC;

-- =============================================================================
-- 9. RLS + table grants
-- =============================================================================
DO $rls$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'procurement_policies',
    'rfqs',
    'rfq_lines',
    'rfq_suppliers',
    'supplier_quotations',
    'supplier_quotation_lines',
    'evaluation_criteria',
    'sourcing_evaluations',
    'sourcing_evaluation_scores',
    'sourcing_awards',
    'sourcing_award_lines'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END
$rls$;

-- procurement_policies
CREATE POLICY procurement_policies_select_member ON public.procurement_policies
  FOR SELECT TO authenticated USING (private.user_can_access_legal_entity(legal_entity_id));
CREATE POLICY procurement_policies_insert_authorized ON public.procurement_policies
  FOR INSERT TO authenticated WITH CHECK (private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator','procurement_user','cost_controller'],
    legal_entity_id
  ));
CREATE POLICY procurement_policies_update_authorized ON public.procurement_policies
  FOR UPDATE TO authenticated USING (private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator','procurement_user','cost_controller'],
    legal_entity_id
  ));

-- rfqs
CREATE POLICY rfqs_select_member ON public.rfqs
  FOR SELECT TO authenticated USING (private.user_can_access_legal_entity(legal_entity_id));
CREATE POLICY rfqs_insert_authorized ON public.rfqs
  FOR INSERT TO authenticated WITH CHECK (private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator','procurement_user','cost_controller'],
    legal_entity_id
  ));
CREATE POLICY rfqs_update_authorized ON public.rfqs
  FOR UPDATE TO authenticated USING (private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator','procurement_user','cost_controller','approver'],
    legal_entity_id
  ));

-- rfq_lines (via parent RFQ)
CREATE POLICY rfq_lines_select_member ON public.rfq_lines
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.rfqs AS r
      WHERE r.id = rfq_id AND private.user_can_access_legal_entity(r.legal_entity_id)
    )
  );
CREATE POLICY rfq_lines_insert_authorized ON public.rfq_lines
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.rfqs AS r
      WHERE r.id = rfq_id AND private.user_has_any_role(
        ARRAY['system_administrator','legal_entity_administrator','procurement_user','cost_controller'],
        r.legal_entity_id
      )
    )
  );
CREATE POLICY rfq_lines_update_authorized ON public.rfq_lines
  FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.rfqs AS r
      WHERE r.id = rfq_id AND private.user_has_any_role(
        ARRAY['system_administrator','legal_entity_administrator','procurement_user','cost_controller'],
        r.legal_entity_id
      )
    )
  );

-- rfq_suppliers
CREATE POLICY rfq_suppliers_select_member ON public.rfq_suppliers
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.rfqs AS r
      WHERE r.id = rfq_id AND private.user_can_access_legal_entity(r.legal_entity_id)
    )
  );
CREATE POLICY rfq_suppliers_insert_authorized ON public.rfq_suppliers
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.rfqs AS r
      WHERE r.id = rfq_id AND private.user_has_any_role(
        ARRAY['system_administrator','legal_entity_administrator','procurement_user','cost_controller'],
        r.legal_entity_id
      )
    )
  );
CREATE POLICY rfq_suppliers_update_authorized ON public.rfq_suppliers
  FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.rfqs AS r
      WHERE r.id = rfq_id AND private.user_has_any_role(
        ARRAY['system_administrator','legal_entity_administrator','procurement_user','cost_controller'],
        r.legal_entity_id
      )
    )
  );

-- supplier_quotations
CREATE POLICY supplier_quotations_select_member ON public.supplier_quotations
  FOR SELECT TO authenticated USING (private.user_can_access_legal_entity(legal_entity_id));
CREATE POLICY supplier_quotations_insert_authorized ON public.supplier_quotations
  FOR INSERT TO authenticated WITH CHECK (private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator','procurement_user','finance_user','cost_controller'],
    legal_entity_id
  ));
CREATE POLICY supplier_quotations_update_authorized ON public.supplier_quotations
  FOR UPDATE TO authenticated USING (private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator','procurement_user','finance_user','cost_controller'],
    legal_entity_id
  ));

-- supplier_quotation_lines
CREATE POLICY supplier_quotation_lines_select_member ON public.supplier_quotation_lines
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.supplier_quotations AS sq
      WHERE sq.id = quotation_id AND private.user_can_access_legal_entity(sq.legal_entity_id)
    )
  );
CREATE POLICY supplier_quotation_lines_insert_authorized ON public.supplier_quotation_lines
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.supplier_quotations AS sq
      WHERE sq.id = quotation_id AND private.user_has_any_role(
        ARRAY['system_administrator','legal_entity_administrator','procurement_user','finance_user','cost_controller'],
        sq.legal_entity_id
      )
    )
  );
CREATE POLICY supplier_quotation_lines_update_authorized ON public.supplier_quotation_lines
  FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.supplier_quotations AS sq
      WHERE sq.id = quotation_id AND private.user_has_any_role(
        ARRAY['system_administrator','legal_entity_administrator','procurement_user','finance_user','cost_controller'],
        sq.legal_entity_id
      )
    )
  );

-- evaluation_criteria
CREATE POLICY evaluation_criteria_select_member ON public.evaluation_criteria
  FOR SELECT TO authenticated USING (private.user_can_access_legal_entity(legal_entity_id));
CREATE POLICY evaluation_criteria_insert_authorized ON public.evaluation_criteria
  FOR INSERT TO authenticated WITH CHECK (private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator','procurement_user','finance_user','cost_controller'],
    legal_entity_id
  ));
CREATE POLICY evaluation_criteria_update_authorized ON public.evaluation_criteria
  FOR UPDATE TO authenticated USING (private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator','procurement_user','finance_user','cost_controller'],
    legal_entity_id
  ));

-- sourcing_evaluations
CREATE POLICY sourcing_evaluations_select_member ON public.sourcing_evaluations
  FOR SELECT TO authenticated USING (private.user_can_access_legal_entity(legal_entity_id));
CREATE POLICY sourcing_evaluations_insert_authorized ON public.sourcing_evaluations
  FOR INSERT TO authenticated WITH CHECK (private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator','procurement_user','finance_user','cost_controller','approver'],
    legal_entity_id
  ));
CREATE POLICY sourcing_evaluations_update_authorized ON public.sourcing_evaluations
  FOR UPDATE TO authenticated USING (private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator','procurement_user','finance_user','cost_controller','approver'],
    legal_entity_id
  ));

-- sourcing_evaluation_scores
CREATE POLICY sourcing_evaluation_scores_select_member ON public.sourcing_evaluation_scores
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.sourcing_evaluations AS se
      WHERE se.id = evaluation_id AND private.user_can_access_legal_entity(se.legal_entity_id)
    )
  );
CREATE POLICY sourcing_evaluation_scores_insert_authorized ON public.sourcing_evaluation_scores
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sourcing_evaluations AS se
      WHERE se.id = evaluation_id AND private.user_has_any_role(
        ARRAY['system_administrator','legal_entity_administrator','procurement_user','finance_user','cost_controller','approver'],
        se.legal_entity_id
      )
    )
  );
CREATE POLICY sourcing_evaluation_scores_update_authorized ON public.sourcing_evaluation_scores
  FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.sourcing_evaluations AS se
      WHERE se.id = evaluation_id AND private.user_has_any_role(
        ARRAY['system_administrator','legal_entity_administrator','procurement_user','finance_user','cost_controller','approver'],
        se.legal_entity_id
      )
    )
  );

-- sourcing_awards
CREATE POLICY sourcing_awards_select_member ON public.sourcing_awards
  FOR SELECT TO authenticated USING (private.user_can_access_legal_entity(legal_entity_id));
CREATE POLICY sourcing_awards_insert_authorized ON public.sourcing_awards
  FOR INSERT TO authenticated WITH CHECK (private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator','procurement_user','cost_controller'],
    legal_entity_id
  ));
CREATE POLICY sourcing_awards_update_authorized ON public.sourcing_awards
  FOR UPDATE TO authenticated USING (private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator','procurement_user','cost_controller','approver','finance_user'],
    legal_entity_id
  ));

-- sourcing_award_lines
CREATE POLICY sourcing_award_lines_select_member ON public.sourcing_award_lines
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.sourcing_awards AS sa
      WHERE sa.id = award_id AND private.user_can_access_legal_entity(sa.legal_entity_id)
    )
  );
CREATE POLICY sourcing_award_lines_insert_authorized ON public.sourcing_award_lines
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sourcing_awards AS sa
      WHERE sa.id = award_id AND private.user_has_any_role(
        ARRAY['system_administrator','legal_entity_administrator','procurement_user','cost_controller'],
        sa.legal_entity_id
      )
    )
  );
CREATE POLICY sourcing_award_lines_update_authorized ON public.sourcing_award_lines
  FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.sourcing_awards AS sa
      WHERE sa.id = award_id AND private.user_has_any_role(
        ARRAY['system_administrator','legal_entity_administrator','procurement_user','cost_controller','approver'],
        sa.legal_entity_id
      )
    )
  );

GRANT SELECT, INSERT, UPDATE ON TABLE
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
  public.sourcing_award_lines
TO authenticated;

COMMENT ON TABLE public.procurement_policies IS '@classification data_api_exposed; authenticated only; RLS mandatory';
COMMENT ON TABLE public.rfqs IS '@classification data_api_exposed; authenticated only; RLS mandatory';
COMMENT ON TABLE public.rfq_lines IS '@classification data_api_exposed; authenticated only; RLS mandatory';
COMMENT ON TABLE public.rfq_suppliers IS '@classification data_api_exposed; authenticated only; RLS mandatory';
COMMENT ON TABLE public.supplier_quotations IS '@classification data_api_exposed; authenticated only; RLS mandatory';
COMMENT ON TABLE public.supplier_quotation_lines IS '@classification data_api_exposed; authenticated only; RLS mandatory';
COMMENT ON TABLE public.evaluation_criteria IS '@classification data_api_exposed; authenticated only; RLS mandatory';
COMMENT ON TABLE public.sourcing_evaluations IS '@classification data_api_exposed; authenticated only; RLS mandatory';
COMMENT ON TABLE public.sourcing_evaluation_scores IS '@classification data_api_exposed; authenticated only; RLS mandatory';
COMMENT ON TABLE public.sourcing_awards IS '@classification data_api_exposed; authenticated only; RLS mandatory';
COMMENT ON TABLE public.sourcing_award_lines IS '@classification data_api_exposed; authenticated only; RLS mandatory';
COMMENT ON FUNCTION private.vendor_is_active(UUID) IS '@classification helper; SECURITY DEFINER; no client execute';
