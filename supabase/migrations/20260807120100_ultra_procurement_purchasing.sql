-- ULTRA: procurement purchasing (PO lines, contracts, receipts, service entries, invoices, matching, payments)
-- Depends conceptually on 20260807120000_ultra_procurement_sourcing.sql (sourcing_awards, procurement_policies)

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
DO $enum$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'contract_status') THEN
    CREATE TYPE public.contract_status AS ENUM (
      'draft', 'submitted', 'approved', 'active', 'closed', 'rejected', 'terminated', 'expired'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'goods_receipt_status') THEN
    CREATE TYPE public.goods_receipt_status AS ENUM (
      'draft', 'submitted', 'inspected', 'accepted', 'rejected', 'cancelled'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'service_entry_status') THEN
    CREATE TYPE public.service_entry_status AS ENUM (
      'draft', 'submitted', 'accepted', 'rejected', 'reversed'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'invoice_match_status') THEN
    CREATE TYPE public.invoice_match_status AS ENUM (
      'unmatched', 'matched', 'matched_within_tolerance', 'exception', 'overridden'
    );
  END IF;
END
$enum$;

ALTER TYPE public.invoice_status ADD VALUE IF NOT EXISTS 'exception';

-- ready_for_payment semantics: payment_request_status.approved means ready_for_payment (NOT paid).
-- Do not implement bank payment execution. App maps approved = ready_for_payment.
COMMENT ON TYPE public.payment_request_status IS
  'Payment request lifecycle. approved = ready_for_payment (treasury-ready); released is post-handoff; never auto-mark paid from approval.';

-- ---------------------------------------------------------------------------
-- Policy fallback (sourcing migration owns full policy table; ensure tolerance columns exist)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.procurement_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id UUID NOT NULL REFERENCES public.legal_entities(id),
  quantity_tolerance_percent NUMERIC(7,4) NOT NULL DEFAULT 0,
  price_tolerance_percent NUMERIC(7,4) NOT NULL DEFAULT 0,
  invoice_total_tolerance_amount NUMERIC(18,4) NOT NULL DEFAULT 0,
  rfq_required_threshold NUMERIC(18,4),
  minimum_quotes_required INTEGER NOT NULL DEFAULT 1,
  direct_purchase_threshold NUMERIC(18,4),
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_procurement_policies_entity_active
  ON public.procurement_policies (legal_entity_id)
  WHERE effective_to IS NULL;

ALTER TABLE public.procurement_policies
  ADD COLUMN IF NOT EXISTS quantity_tolerance_percent NUMERIC(7,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS price_tolerance_percent NUMERIC(7,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS invoice_total_tolerance_amount NUMERIC(18,4) NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
-- PO number sequence helper
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.po_number_sequences (
  legal_entity_id UUID PRIMARY KEY REFERENCES public.legal_entities(id),
  last_value BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION private.next_po_number(p_legal_entity_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_next BIGINT;
  v_lock_key BIGINT;
BEGIN
  v_lock_key := ('x' || substr(replace(p_legal_entity_id::text, '-', ''), 1, 15))::bit(60)::bigint;
  PERFORM pg_advisory_xact_lock(v_lock_key);
  INSERT INTO public.po_number_sequences (legal_entity_id, last_value)
  VALUES (p_legal_entity_id, 1)
  ON CONFLICT (legal_entity_id) DO UPDATE
    SET last_value = public.po_number_sequences.last_value + 1,
        updated_at = NOW()
  RETURNING last_value INTO v_next;
  RETURN 'PO-' || to_char(NOW(), 'YYYY') || '-' || lpad(v_next::text, 6, '0');
END
$function$;

CREATE OR REPLACE FUNCTION private.procurement_qty_tolerance_percent(p_legal_entity_id UUID)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT COALESCE(
    (
      SELECT pp.quantity_tolerance_percent
      FROM public.procurement_policies AS pp
      WHERE pp.legal_entity_id = p_legal_entity_id
        AND pp.effective_from <= CURRENT_DATE
        AND (pp.effective_to IS NULL OR pp.effective_to >= CURRENT_DATE)
      ORDER BY pp.effective_from DESC
      LIMIT 1
    ),
    0::NUMERIC
  );
$function$;

CREATE OR REPLACE FUNCTION private.procurement_price_tolerance_percent(p_legal_entity_id UUID)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT COALESCE(
    (
      SELECT pp.price_tolerance_percent
      FROM public.procurement_policies AS pp
      WHERE pp.legal_entity_id = p_legal_entity_id
        AND pp.effective_from <= CURRENT_DATE
        AND (pp.effective_to IS NULL OR pp.effective_to >= CURRENT_DATE)
      ORDER BY pp.effective_from DESC
      LIMIT 1
    ),
    0::NUMERIC
  );
$function$;

CREATE OR REPLACE FUNCTION private.procurement_invoice_total_tolerance(p_legal_entity_id UUID)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT COALESCE(
    (
      SELECT pp.invoice_total_tolerance_amount
      FROM public.procurement_policies AS pp
      WHERE pp.legal_entity_id = p_legal_entity_id
        AND pp.effective_from <= CURRENT_DATE
        AND (pp.effective_to IS NULL OR pp.effective_to >= CURRENT_DATE)
      ORDER BY pp.effective_from DESC
      LIMIT 1
    ),
    0::NUMERIC
  );
$function$;

-- ---------------------------------------------------------------------------
-- Alter existing headers
-- ---------------------------------------------------------------------------
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS contract_id UUID,
  ADD COLUMN IF NOT EXISTS award_id UUID,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS fiscal_period_id UUID REFERENCES public.fiscal_periods(id),
  ADD COLUMN IF NOT EXISTS control_scope_id UUID REFERENCES public.control_scopes(id),
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS submitted_by UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

DO $fk$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'sourcing_awards'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'purchase_orders_award_id_fkey'
    ) THEN
      ALTER TABLE public.purchase_orders
        ADD CONSTRAINT purchase_orders_award_id_fkey
        FOREIGN KEY (award_id) REFERENCES public.sourcing_awards(id);
    END IF;
  END IF;
END
$fk$;

ALTER TABLE public.supplier_invoices
  ADD COLUMN IF NOT EXISTS subtotal_ex_vat NUMERIC(18,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vat_amount NUMERIC(18,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS due_date DATE,
  ADD COLUMN IF NOT EXISTS match_status public.invoice_match_status NOT NULL DEFAULT 'unmatched',
  ADD COLUMN IF NOT EXISTS currency_code TEXT NOT NULL DEFAULT 'SAR',
  ADD COLUMN IF NOT EXISTS contract_id UUID,
  ADD COLUMN IF NOT EXISTS fiscal_period_id UUID REFERENCES public.fiscal_periods(id),
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS submitted_by UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

ALTER TABLE public.payment_requests
  ADD COLUMN IF NOT EXISTS due_date DATE,
  ADD COLUMN IF NOT EXISTS reason TEXT,
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS currency_code TEXT NOT NULL DEFAULT 'SAR';

COMMENT ON COLUMN public.payment_requests.request_status IS
  'approved means ready_for_payment (not bank-paid). Do not set paid via this workflow.';

-- ---------------------------------------------------------------------------
-- New tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.purchase_order_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  line_number SMALLINT NOT NULL,
  award_line_id UUID,
  description TEXT NOT NULL,
  quantity NUMERIC(18,4) NOT NULL CHECK (quantity > 0),
  uom TEXT,
  unit_price_ex_vat NUMERIC(18,4) NOT NULL CHECK (unit_price_ex_vat >= 0),
  vat_rate NUMERIC(7,4) NOT NULL DEFAULT 0,
  line_total_ex_vat NUMERIC(18,4) GENERATED ALWAYS AS (quantity * unit_price_ex_vat) STORED,
  organization_unit_id UUID REFERENCES public.organization_units(id),
  cost_node_id UUID REFERENCES public.cost_nodes(id),
  control_account_id UUID REFERENCES public.control_accounts(id),
  control_scope_id UUID REFERENCES public.control_scopes(id),
  delivery_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (purchase_order_id, line_number)
);

DO $fk$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'sourcing_award_lines'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'purchase_order_lines_award_line_id_fkey'
  ) THEN
    ALTER TABLE public.purchase_order_lines
      ADD CONSTRAINT purchase_order_lines_award_line_id_fkey
      FOREIGN KEY (award_line_id) REFERENCES public.sourcing_award_lines(id);
  END IF;
END
$fk$;

CREATE TABLE IF NOT EXISTS public.procurement_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id UUID NOT NULL REFERENCES public.legal_entities(id),
  vendor_id UUID NOT NULL REFERENCES public.vendors(id),
  award_id UUID,
  contract_number TEXT NOT NULL,
  title_en TEXT NOT NULL,
  title_ar TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  currency_code TEXT NOT NULL DEFAULT 'SAR',
  ceiling_value NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (ceiling_value >= 0),
  payment_terms_days INTEGER,
  renewal_type TEXT,
  owner_id UUID REFERENCES public.profiles(id),
  control_scope_id UUID REFERENCES public.control_scopes(id),
  contract_status public.contract_status NOT NULL DEFAULT 'draft',
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  submitted_by UUID REFERENCES public.profiles(id),
  approved_by UUID REFERENCES public.profiles(id),
  activated_at TIMESTAMPTZ,
  row_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (legal_entity_id, contract_number),
  CONSTRAINT procurement_contracts_dates CHECK (end_date >= start_date)
);

DO $fk$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'sourcing_awards'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'procurement_contracts_award_id_fkey'
  ) THEN
    ALTER TABLE public.procurement_contracts
      ADD CONSTRAINT procurement_contracts_award_id_fkey
      FOREIGN KEY (award_id) REFERENCES public.sourcing_awards(id);
  END IF;
END
$fk$;

CREATE TABLE IF NOT EXISTS public.procurement_contract_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES public.procurement_contracts(id) ON DELETE CASCADE,
  line_number SMALLINT NOT NULL,
  description TEXT NOT NULL,
  quantity NUMERIC(18,4) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price_ex_vat NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (unit_price_ex_vat >= 0),
  line_ceiling NUMERIC(18,4) GENERATED ALWAYS AS (quantity * unit_price_ex_vat) STORED,
  cost_node_id UUID REFERENCES public.cost_nodes(id),
  UNIQUE (contract_id, line_number)
);

ALTER TABLE public.purchase_orders
  DROP CONSTRAINT IF EXISTS purchase_orders_contract_id_fkey;
ALTER TABLE public.purchase_orders
  ADD CONSTRAINT purchase_orders_contract_id_fkey
  FOREIGN KEY (contract_id) REFERENCES public.procurement_contracts(id);

ALTER TABLE public.supplier_invoices
  DROP CONSTRAINT IF EXISTS supplier_invoices_contract_id_fkey;
ALTER TABLE public.supplier_invoices
  ADD CONSTRAINT supplier_invoices_contract_id_fkey
  FOREIGN KEY (contract_id) REFERENCES public.procurement_contracts(id);

CREATE TABLE IF NOT EXISTS public.goods_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id UUID NOT NULL REFERENCES public.legal_entities(id),
  purchase_order_id UUID NOT NULL REFERENCES public.purchase_orders(id),
  vendor_id UUID NOT NULL REFERENCES public.vendors(id),
  receipt_number TEXT NOT NULL,
  receipt_date DATE NOT NULL DEFAULT CURRENT_DATE,
  delivery_note TEXT,
  receiver_id UUID NOT NULL REFERENCES public.profiles(id),
  location_note TEXT,
  receipt_status public.goods_receipt_status NOT NULL DEFAULT 'draft',
  comments TEXT,
  fiscal_period_id UUID REFERENCES public.fiscal_periods(id),
  accepted_by UUID REFERENCES public.profiles(id),
  accepted_at TIMESTAMPTZ,
  row_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (legal_entity_id, receipt_number)
);

CREATE TABLE IF NOT EXISTS public.goods_receipt_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goods_receipt_id UUID NOT NULL REFERENCES public.goods_receipts(id) ON DELETE CASCADE,
  purchase_order_line_id UUID NOT NULL REFERENCES public.purchase_order_lines(id),
  line_number SMALLINT NOT NULL,
  quantity_received NUMERIC(18,4) NOT NULL CHECK (quantity_received >= 0),
  quantity_accepted NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (quantity_accepted >= 0),
  quantity_rejected NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (quantity_rejected >= 0),
  rejection_reason TEXT,
  acceptance_note TEXT,
  UNIQUE (goods_receipt_id, line_number)
);

CREATE TABLE IF NOT EXISTS public.service_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id UUID NOT NULL REFERENCES public.legal_entities(id),
  purchase_order_id UUID REFERENCES public.purchase_orders(id),
  contract_id UUID REFERENCES public.procurement_contracts(id),
  vendor_id UUID NOT NULL REFERENCES public.vendors(id),
  entry_number TEXT NOT NULL,
  service_period_start DATE,
  service_period_end DATE,
  description TEXT NOT NULL,
  entry_status public.service_entry_status NOT NULL DEFAULT 'draft',
  accepted_amount NUMERIC(18,4) NOT NULL DEFAULT 0,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  accepted_by UUID REFERENCES public.profiles(id),
  accepted_at TIMESTAMPTZ,
  fiscal_period_id UUID REFERENCES public.fiscal_periods(id),
  row_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (legal_entity_id, entry_number),
  CONSTRAINT service_entries_po_or_contract CHECK (purchase_order_id IS NOT NULL OR contract_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.service_entry_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_entry_id UUID NOT NULL REFERENCES public.service_entries(id) ON DELETE CASCADE,
  purchase_order_line_id UUID REFERENCES public.purchase_order_lines(id),
  line_number SMALLINT NOT NULL,
  description TEXT NOT NULL,
  quantity NUMERIC(18,4) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price_ex_vat NUMERIC(18,4) NOT NULL DEFAULT 0,
  accepted_amount NUMERIC(18,4) NOT NULL DEFAULT 0,
  UNIQUE (service_entry_id, line_number)
);

CREATE TABLE IF NOT EXISTS public.supplier_invoice_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_invoice_id UUID NOT NULL REFERENCES public.supplier_invoices(id) ON DELETE CASCADE,
  purchase_order_line_id UUID REFERENCES public.purchase_order_lines(id),
  line_number SMALLINT NOT NULL,
  description TEXT NOT NULL,
  quantity NUMERIC(18,4) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price_ex_vat NUMERIC(18,4) NOT NULL CHECK (unit_price_ex_vat >= 0),
  vat_amount NUMERIC(18,4) NOT NULL DEFAULT 0,
  line_total_ex_vat NUMERIC(18,4) GENERATED ALWAYS AS (quantity * unit_price_ex_vat) STORED,
  UNIQUE (supplier_invoice_id, line_number)
);

CREATE TABLE IF NOT EXISTS public.invoice_match_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_invoice_id UUID NOT NULL REFERENCES public.supplier_invoices(id) ON DELETE CASCADE,
  match_mode TEXT NOT NULL CHECK (match_mode IN ('two_way', 'three_way_goods', 'three_way_service')),
  match_status public.invoice_match_status NOT NULL,
  po_amount NUMERIC(18,4) NOT NULL DEFAULT 0,
  receipt_or_service_amount NUMERIC(18,4) NOT NULL DEFAULT 0,
  invoice_amount NUMERIC(18,4) NOT NULL DEFAULT 0,
  quantity_variance NUMERIC(18,4) NOT NULL DEFAULT 0,
  price_variance NUMERIC(18,4) NOT NULL DEFAULT 0,
  amount_variance NUMERIC(18,4) NOT NULL DEFAULT 0,
  tolerance_applied JSONB NOT NULL DEFAULT '{}'::jsonb,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  matched_by UUID REFERENCES public.profiles(id),
  matched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (supplier_invoice_id)
);

CREATE TABLE IF NOT EXISTS public.invoice_match_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_invoice_id UUID NOT NULL REFERENCES public.supplier_invoices(id) ON DELETE CASCADE,
  match_result_id UUID REFERENCES public.invoice_match_results(id) ON DELETE CASCADE,
  exception_code TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'blocking',
  message TEXT NOT NULL,
  amount NUMERIC(18,4),
  is_resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_by UUID REFERENCES public.profiles(id),
  resolved_at TIMESTAMPTZ,
  override_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_po_lines_po ON public.purchase_order_lines (purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_gr_po ON public.goods_receipts (purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_gr_lines_pol ON public.goods_receipt_lines (purchase_order_line_id);
CREATE INDEX IF NOT EXISTS idx_se_po ON public.service_entries (purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_sil_invoice ON public.supplier_invoice_lines (supplier_invoice_id);
CREATE INDEX IF NOT EXISTS idx_ime_open ON public.invoice_match_exceptions (supplier_invoice_id)
  WHERE is_resolved = false;


-- ---------------------------------------------------------------------------
-- RPCs: PO lifecycle
-- ---------------------------------------------------------------------------
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

  IF v_entity IS NULL THEN
    RETURN private.command_fail('NOT_FOUND', 'Award not found');
  END IF;
  IF v_award_status IS DISTINCT FROM 'approved' THEN
    RETURN private.command_fail('INVALID_STATE', 'Award must be approved before PO create');
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
    SELECT
      sal.id AS award_line_id,
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

  IF v_ln = 0 THEN
    RETURN private.command_fail('VALIDATION', 'Award has no lines');
  END IF;

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

CREATE OR REPLACE FUNCTION private.po_transition(
  p_po_id UUID,
  p_expected_status public.po_status,
  p_next_status public.po_status,
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
  v_cmd TEXT := 'po_' || p_next_status::text;
  v_replay JSONB;
  v_row public.purchase_orders%ROWTYPE;
  v_total NUMERIC(18,4);
  v_commitment_id UUID;
  v_result JSONB;
  v_allowed BOOLEAN := false;
BEGIN
  v_replay := private.command_check_idempotency(v_cmd, p_idempotency_key, v_actor);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF v_actor IS NULL OR NOT private.current_user_is_active() THEN
    RETURN private.command_fail('UNAUTHENTICATED', 'Authentication required');
  END IF;

  SELECT * INTO v_row FROM public.purchase_orders AS po WHERE po.id = p_po_id FOR UPDATE;
  IF NOT FOUND THEN RETURN private.command_fail('NOT_FOUND', 'Purchase order not found'); END IF;
  IF v_row.po_status IS DISTINCT FROM p_expected_status THEN
    RETURN private.command_fail('STATE_MISMATCH', 'Unexpected PO status');
  END IF;
  IF v_row.fiscal_period_id IS NOT NULL THEN
    PERFORM private.assert_period_open('procurement', v_row.legal_entity_id, v_row.fiscal_period_id);
  END IF;

  IF NOT (
    (p_expected_status = 'draft' AND p_next_status IN ('submitted', 'cancelled'))
    OR (p_expected_status = 'submitted' AND p_next_status IN ('approved', 'rejected', 'cancelled'))
    OR (p_expected_status = 'approved' AND p_next_status IN ('issued', 'cancelled'))
    OR (p_expected_status = 'issued' AND p_next_status IN ('cancelled', 'closed', 'partially_received'))
  ) THEN
    RETURN private.command_fail('INVALID_TRANSITION', 'PO transition not allowed');
  END IF;

  IF p_next_status = 'submitted' THEN
    v_allowed := private.user_has_any_role(
      ARRAY['system_administrator','legal_entity_administrator','procurement_user','cost_controller'],
      v_row.legal_entity_id, 'legal_entity', v_row.legal_entity_id);
  ELSIF p_next_status = 'approved' THEN
    v_allowed := private.user_has_any_role(
      ARRAY['system_administrator','legal_entity_administrator','approver','procurement_user'],
      v_row.legal_entity_id, 'legal_entity', v_row.legal_entity_id);
    IF v_row.created_by = v_actor OR v_row.submitted_by = v_actor THEN
      RETURN private.command_fail('SOD_VIOLATION', 'Requester cannot approve PO');
    END IF;
  ELSIF p_next_status = 'issued' THEN
    v_allowed := private.user_has_any_role(
      ARRAY['system_administrator','legal_entity_administrator','procurement_user','cost_controller'],
      v_row.legal_entity_id, 'legal_entity', v_row.legal_entity_id);
  ELSE
    v_allowed := private.user_has_any_role(
      ARRAY['system_administrator','legal_entity_administrator','procurement_user','cost_controller','approver'],
      v_row.legal_entity_id, 'legal_entity', v_row.legal_entity_id);
  END IF;
  IF NOT v_allowed THEN RETURN private.command_fail('FORBIDDEN', 'Insufficient role for PO'); END IF;

  SELECT COALESCE(SUM(pol.line_total_ex_vat), 0) INTO v_total
  FROM public.purchase_order_lines AS pol WHERE pol.purchase_order_id = p_po_id;
  IF p_next_status IN ('submitted', 'approved', 'issued') AND v_total <= 0 THEN
    RETURN private.command_fail('VALIDATION', 'PO must have positive line totals');
  END IF;

  IF p_next_status = 'issued' THEN
    IF v_row.commitment_id IS NULL THEN
      INSERT INTO public.commitments (
        legal_entity_id, vendor_id, reference_number, description,
        original_value, approval_status
      ) VALUES (
        v_row.legal_entity_id, v_row.vendor_id, v_row.po_number,
        COALESCE(v_row.description, v_row.po_number),
        v_total, 'approved'
      ) RETURNING id INTO v_commitment_id;
    ELSE
      UPDATE public.commitments AS c SET
        original_value = v_total,
        vendor_id = v_row.vendor_id
      WHERE c.id = v_row.commitment_id
      RETURNING id INTO v_commitment_id;
    END IF;
  END IF;

  IF p_next_status = 'cancelled' AND v_row.commitment_id IS NOT NULL THEN
    UPDATE public.commitments AS c SET
      cancelled_amount = GREATEST(c.original_value - c.invoiced_applied, 0)
    WHERE c.id = v_row.commitment_id;
  END IF;

  UPDATE public.purchase_orders AS po SET
    po_status = p_next_status,
    total_amount = v_total,
    submitted_by = CASE WHEN p_next_status = 'submitted' THEN v_actor ELSE po.submitted_by END,
    submitted_at = CASE WHEN p_next_status = 'submitted' THEN NOW() ELSE po.submitted_at END,
    approved_by = CASE WHEN p_next_status = 'approved' THEN v_actor ELSE po.approved_by END,
    approved_at = CASE WHEN p_next_status = 'approved' THEN NOW() ELSE po.approved_at END,
    issued_by = CASE WHEN p_next_status = 'issued' THEN v_actor ELSE po.issued_by END,
    issued_at = CASE WHEN p_next_status = 'issued' THEN NOW() ELSE po.issued_at END,
    commitment_id = CASE WHEN p_next_status = 'issued' THEN COALESCE(v_commitment_id, po.commitment_id) ELSE po.commitment_id END,
    cancelled_by = CASE WHEN p_next_status = 'cancelled' THEN v_actor ELSE po.cancelled_by END,
    cancelled_at = CASE WHEN p_next_status = 'cancelled' THEN NOW() ELSE po.cancelled_at END,
    cancel_reason = CASE WHEN p_next_status = 'cancelled' THEN p_reason ELSE po.cancel_reason END,
    updated_at = NOW(),
    row_version = po.row_version + 1
  WHERE po.id = p_po_id
  RETURNING * INTO v_row;

  PERFORM private.write_audit_event(
    v_actor, 'update', 'purchase_order', p_po_id,
    v_row.legal_entity_id, v_row.control_scope_id, NULL,
    p_correlation_id, p_idempotency_key,
    jsonb_build_object('status', p_expected_status),
    jsonb_build_object('status', p_next_status, 'total_amount', v_total, 'commitment_id', v_row.commitment_id),
    p_reason, NULL
  );

  v_result := private.command_ok(jsonb_build_object(
    'entity_id', p_po_id, 'po_status', p_next_status, 'commitment_id', v_row.commitment_id
  ));
  PERFORM private.command_store_idempotency(v_cmd, p_idempotency_key, v_actor, v_result);
  RETURN v_result;
END
$function$;

CREATE OR REPLACE FUNCTION public.rpc_po_submit(
  p_po_id UUID, p_expected_status public.po_status DEFAULT 'draft',
  p_idempotency_key TEXT DEFAULT NULL, p_correlation_id UUID DEFAULT NULL
) RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.po_transition(p_po_id, p_expected_status, 'submitted', NULL, p_idempotency_key, p_correlation_id);
$$;

CREATE OR REPLACE FUNCTION public.rpc_po_approve(
  p_po_id UUID, p_expected_status public.po_status DEFAULT 'submitted',
  p_idempotency_key TEXT DEFAULT NULL, p_correlation_id UUID DEFAULT NULL
) RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.po_transition(p_po_id, p_expected_status, 'approved', NULL, p_idempotency_key, p_correlation_id);
$$;

CREATE OR REPLACE FUNCTION public.rpc_po_issue(
  p_po_id UUID, p_expected_status public.po_status DEFAULT 'approved',
  p_idempotency_key TEXT DEFAULT NULL, p_correlation_id UUID DEFAULT NULL
) RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.po_transition(p_po_id, p_expected_status, 'issued', NULL, p_idempotency_key, p_correlation_id);
$$;

CREATE OR REPLACE FUNCTION public.rpc_po_cancel(
  p_po_id UUID, p_reason TEXT DEFAULT NULL,
  p_expected_status public.po_status DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL, p_correlation_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_row public.purchase_orders%ROWTYPE;
  v_expected public.po_status;
BEGIN
  SELECT * INTO v_row FROM public.purchase_orders AS po WHERE po.id = p_po_id;
  IF NOT FOUND THEN RETURN private.command_fail('NOT_FOUND', 'Purchase order not found'); END IF;
  v_expected := COALESCE(p_expected_status, v_row.po_status);
  RETURN private.po_transition(p_po_id, v_expected, 'cancelled', p_reason, p_idempotency_key, p_correlation_id);
END
$function$;


-- ---------------------------------------------------------------------------
-- Contracts
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

  INSERT INTO public.procurement_contracts (
    legal_entity_id, vendor_id, award_id, contract_number, title_en, title_ar,
    start_date, end_date, currency_code, ceiling_value, control_scope_id,
    owner_id, created_by, contract_status
  ) VALUES (
    p_legal_entity_id, p_vendor_id, p_award_id, p_contract_number, p_title_en, p_title_ar,
    p_start_date, p_end_date, COALESCE(p_currency_code, 'SAR'), COALESCE(p_ceiling_value, 0),
    p_control_scope_id, v_actor, v_actor, 'draft'
  ) RETURNING id INTO v_id;

  PERFORM private.write_audit_event(
    v_actor, 'create', 'procurement_contract', v_id,
    p_legal_entity_id, p_control_scope_id, NULL, p_correlation_id, p_idempotency_key,
    NULL, jsonb_build_object('contract_number', p_contract_number), NULL, NULL
  );

  v_result := private.command_ok(jsonb_build_object('entity_id', v_id));
  PERFORM private.command_store_idempotency(v_cmd, p_idempotency_key, v_actor, v_result);
  RETURN v_result;
END
$function$;

CREATE OR REPLACE FUNCTION private.contract_transition(
  p_contract_id UUID,
  p_expected_status public.contract_status,
  p_next_status public.contract_status,
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
  v_cmd TEXT := 'contract_' || p_next_status::text;
  v_replay JSONB;
  v_row public.procurement_contracts%ROWTYPE;
  v_result JSONB;
  v_allowed BOOLEAN := false;
BEGIN
  v_replay := private.command_check_idempotency(v_cmd, p_idempotency_key, v_actor);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF v_actor IS NULL OR NOT private.current_user_is_active() THEN
    RETURN private.command_fail('UNAUTHENTICATED', 'Authentication required');
  END IF;

  SELECT * INTO v_row FROM public.procurement_contracts AS c WHERE c.id = p_contract_id FOR UPDATE;
  IF NOT FOUND THEN RETURN private.command_fail('NOT_FOUND', 'Contract not found'); END IF;
  IF v_row.contract_status IS DISTINCT FROM p_expected_status THEN
    RETURN private.command_fail('STATE_MISMATCH', 'Unexpected contract status');
  END IF;

  IF NOT (
    (p_expected_status = 'draft' AND p_next_status IN ('submitted', 'rejected'))
    OR (p_expected_status = 'submitted' AND p_next_status IN ('approved', 'rejected'))
    OR (p_expected_status = 'approved' AND p_next_status IN ('active', 'rejected'))
    OR (p_expected_status = 'active' AND p_next_status IN ('closed', 'terminated', 'expired'))
  ) THEN
    RETURN private.command_fail('INVALID_TRANSITION', 'Contract transition not allowed');
  END IF;

  IF p_next_status = 'approved' THEN
    v_allowed := private.user_has_any_role(
      ARRAY['system_administrator','legal_entity_administrator','approver'],
      v_row.legal_entity_id, 'legal_entity', v_row.legal_entity_id);
    IF v_row.created_by = v_actor OR v_row.submitted_by = v_actor THEN
      RETURN private.command_fail('SOD_VIOLATION', 'Creator cannot approve contract');
    END IF;
  ELSIF p_next_status = 'active' THEN
    v_allowed := private.user_has_any_role(
      ARRAY['system_administrator','legal_entity_administrator','procurement_user'],
      v_row.legal_entity_id, 'legal_entity', v_row.legal_entity_id);
  ELSE
    v_allowed := private.user_has_any_role(
      ARRAY['system_administrator','legal_entity_administrator','procurement_user','cost_controller','approver'],
      v_row.legal_entity_id, 'legal_entity', v_row.legal_entity_id);
  END IF;
  IF NOT v_allowed THEN RETURN private.command_fail('FORBIDDEN', 'Insufficient role for contract'); END IF;

  UPDATE public.procurement_contracts AS c SET
    contract_status = p_next_status,
    submitted_by = CASE WHEN p_next_status = 'submitted' THEN v_actor ELSE c.submitted_by END,
    approved_by = CASE WHEN p_next_status = 'approved' THEN v_actor ELSE c.approved_by END,
    activated_at = CASE WHEN p_next_status = 'active' THEN NOW() ELSE c.activated_at END,
    updated_at = NOW(),
    row_version = c.row_version + 1
  WHERE c.id = p_contract_id
  RETURNING * INTO v_row;

  PERFORM private.write_audit_event(
    v_actor, 'update', 'procurement_contract', p_contract_id,
    v_row.legal_entity_id, v_row.control_scope_id, NULL,
    p_correlation_id, p_idempotency_key,
    jsonb_build_object('status', p_expected_status),
    jsonb_build_object('status', p_next_status),
    NULL, NULL
  );

  v_result := private.command_ok(jsonb_build_object('entity_id', p_contract_id, 'contract_status', p_next_status));
  PERFORM private.command_store_idempotency(v_cmd, p_idempotency_key, v_actor, v_result);
  RETURN v_result;
END
$function$;

CREATE OR REPLACE FUNCTION public.rpc_contract_approve(
  p_contract_id UUID, p_expected_status public.contract_status DEFAULT 'submitted',
  p_idempotency_key TEXT DEFAULT NULL, p_correlation_id UUID DEFAULT NULL
) RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.contract_transition(p_contract_id, p_expected_status, 'approved', p_idempotency_key, p_correlation_id);
$$;

CREATE OR REPLACE FUNCTION public.rpc_contract_activate(
  p_contract_id UUID, p_expected_status public.contract_status DEFAULT 'approved',
  p_idempotency_key TEXT DEFAULT NULL, p_correlation_id UUID DEFAULT NULL
) RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.contract_transition(p_contract_id, p_expected_status, 'active', p_idempotency_key, p_correlation_id);
$$;

-- ---------------------------------------------------------------------------
-- Goods receipts
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_goods_receipt_create(
  p_purchase_order_id UUID,
  p_receipt_number TEXT,
  p_receipt_date DATE DEFAULT CURRENT_DATE,
  p_delivery_note TEXT DEFAULT NULL,
  p_lines JSONB DEFAULT '[]'::jsonb,
  p_fiscal_period_id UUID DEFAULT NULL,
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
  v_cmd TEXT := 'goods_receipt_create';
  v_replay JSONB;
  v_po public.purchase_orders%ROWTYPE;
  v_gr_id UUID;
  v_item JSONB;
  v_ln SMALLINT := 0;
  v_result JSONB;
BEGIN
  v_replay := private.command_check_idempotency(v_cmd, p_idempotency_key, v_actor);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF v_actor IS NULL OR NOT private.current_user_is_active() THEN
    RETURN private.command_fail('UNAUTHENTICATED', 'Authentication required');
  END IF;

  SELECT * INTO v_po FROM public.purchase_orders AS po WHERE po.id = p_purchase_order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN private.command_fail('NOT_FOUND', 'PO not found'); END IF;
  IF v_po.po_status NOT IN ('issued', 'partially_received') THEN
    RETURN private.command_fail('INVALID_STATE', 'PO must be issued to receive');
  END IF;
  IF NOT private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator','procurement_user','cost_controller'],
    v_po.legal_entity_id, 'legal_entity', v_po.legal_entity_id
  ) THEN
    RETURN private.command_fail('FORBIDDEN', 'Insufficient role to create goods receipt');
  END IF;
  IF COALESCE(p_fiscal_period_id, v_po.fiscal_period_id) IS NOT NULL THEN
    PERFORM private.assert_period_open('procurement', v_po.legal_entity_id, COALESCE(p_fiscal_period_id, v_po.fiscal_period_id));
  END IF;

  INSERT INTO public.goods_receipts (
    legal_entity_id, purchase_order_id, vendor_id, receipt_number, receipt_date,
    delivery_note, receiver_id, fiscal_period_id, receipt_status
  ) VALUES (
    v_po.legal_entity_id, p_purchase_order_id, v_po.vendor_id, p_receipt_number,
    COALESCE(p_receipt_date, CURRENT_DATE), p_delivery_note, v_actor,
    COALESCE(p_fiscal_period_id, v_po.fiscal_period_id), 'draft'
  ) RETURNING id INTO v_gr_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_lines, '[]'::jsonb))
  LOOP
    v_ln := v_ln + 1;
    INSERT INTO public.goods_receipt_lines (
      goods_receipt_id, purchase_order_line_id, line_number,
      quantity_received, quantity_accepted, quantity_rejected, rejection_reason
    ) VALUES (
      v_gr_id,
      (v_item->>'purchase_order_line_id')::UUID,
      COALESCE((v_item->>'line_number')::SMALLINT, v_ln),
      COALESCE((v_item->>'quantity_received')::NUMERIC, 0),
      COALESCE((v_item->>'quantity_accepted')::NUMERIC, COALESCE((v_item->>'quantity_received')::NUMERIC, 0)),
      COALESCE((v_item->>'quantity_rejected')::NUMERIC, 0),
      v_item->>'rejection_reason'
    );
  END LOOP;

  PERFORM private.write_audit_event(
    v_actor, 'create', 'goods_receipt', v_gr_id,
    v_po.legal_entity_id, NULL, NULL, p_correlation_id, p_idempotency_key,
    NULL, jsonb_build_object('receipt_number', p_receipt_number, 'purchase_order_id', p_purchase_order_id),
    NULL, NULL
  );

  v_result := private.command_ok(jsonb_build_object('entity_id', v_gr_id));
  PERFORM private.command_store_idempotency(v_cmd, p_idempotency_key, v_actor, v_result);
  RETURN v_result;
END
$function$;

CREATE OR REPLACE FUNCTION public.rpc_goods_receipt_accept(
  p_goods_receipt_id UUID,
  p_expected_status public.goods_receipt_status DEFAULT 'draft',
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
  v_cmd TEXT := 'goods_receipt_accept';
  v_replay JSONB;
  v_gr public.goods_receipts%ROWTYPE;
  v_po public.purchase_orders%ROWTYPE;
  v_tol NUMERIC(18,4);
  v_line RECORD;
  v_ordered NUMERIC(18,4);
  v_accepted_prev NUMERIC(18,4);
  v_remaining NUMERIC(18,4);
  v_max_allowed NUMERIC(18,4);
  v_result JSONB;
BEGIN
  v_replay := private.command_check_idempotency(v_cmd, p_idempotency_key, v_actor);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF v_actor IS NULL OR NOT private.current_user_is_active() THEN
    RETURN private.command_fail('UNAUTHENTICATED', 'Authentication required');
  END IF;

  SELECT * INTO v_gr FROM public.goods_receipts AS gr WHERE gr.id = p_goods_receipt_id FOR UPDATE;
  IF NOT FOUND THEN RETURN private.command_fail('NOT_FOUND', 'Goods receipt not found'); END IF;
  IF v_gr.receipt_status IS DISTINCT FROM p_expected_status THEN
    RETURN private.command_fail('STATE_MISMATCH', 'Unexpected goods receipt status');
  END IF;
  IF v_gr.receipt_status = 'accepted' THEN
    RETURN private.command_fail('INVALID_STATE', 'Already accepted');
  END IF;

  SELECT * INTO v_po FROM public.purchase_orders AS po WHERE po.id = v_gr.purchase_order_id FOR UPDATE;
  IF v_po.po_status = 'cancelled' THEN
    RETURN private.command_fail('INVALID_STATE', 'Cannot accept receipt on cancelled PO');
  END IF;
  IF NOT private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator','procurement_user','cost_controller'],
    v_gr.legal_entity_id, 'legal_entity', v_gr.legal_entity_id
  ) THEN
    RETURN private.command_fail('FORBIDDEN', 'Insufficient role to accept goods receipt');
  END IF;
  IF v_gr.fiscal_period_id IS NOT NULL THEN
    PERFORM private.assert_period_open('procurement', v_gr.legal_entity_id, v_gr.fiscal_period_id);
  END IF;

  v_tol := private.procurement_qty_tolerance_percent(v_gr.legal_entity_id);

  FOR v_line IN
    SELECT grl.* FROM public.goods_receipt_lines AS grl
    WHERE grl.goods_receipt_id = p_goods_receipt_id
    FOR UPDATE
  LOOP
    SELECT pol.quantity INTO v_ordered
    FROM public.purchase_order_lines AS pol WHERE pol.id = v_line.purchase_order_line_id;
    SELECT COALESCE(SUM(grl2.quantity_accepted), 0) INTO v_accepted_prev
    FROM public.goods_receipt_lines AS grl2
    JOIN public.goods_receipts AS gr2 ON gr2.id = grl2.goods_receipt_id
    WHERE grl2.purchase_order_line_id = v_line.purchase_order_line_id
      AND gr2.receipt_status = 'accepted'
      AND gr2.id <> p_goods_receipt_id;
    v_remaining := v_ordered - v_accepted_prev;
    v_max_allowed := v_remaining * (1 + (v_tol / 100.0));
    IF v_line.quantity_accepted > v_max_allowed THEN
      RETURN private.command_fail('TOLERANCE',
        format('Accepted qty %s exceeds remaining %s with tolerance %s%%',
          v_line.quantity_accepted, v_remaining, v_tol));
    END IF;
  END LOOP;

  UPDATE public.goods_receipts AS gr SET
    receipt_status = 'accepted',
    accepted_by = v_actor,
    accepted_at = NOW(),
    updated_at = NOW(),
    row_version = gr.row_version + 1
  WHERE gr.id = p_goods_receipt_id;

  UPDATE public.purchase_orders AS po SET
    po_status = CASE
      WHEN EXISTS (
        SELECT 1 FROM public.purchase_order_lines AS pol
        WHERE pol.purchase_order_id = v_po.id
          AND pol.quantity > (
            SELECT COALESCE(SUM(grl.quantity_accepted), 0)
            FROM public.goods_receipt_lines AS grl
            JOIN public.goods_receipts AS grx ON grx.id = grl.goods_receipt_id
            WHERE grl.purchase_order_line_id = pol.id AND grx.receipt_status = 'accepted'
          )
      ) THEN 'partially_received'::public.po_status
      ELSE 'closed'::public.po_status
    END,
    updated_at = NOW(),
    row_version = po.row_version + 1
  WHERE po.id = v_po.id;

  PERFORM private.write_audit_event(
    v_actor, 'update', 'goods_receipt', p_goods_receipt_id,
    v_gr.legal_entity_id, NULL, NULL, p_correlation_id, p_idempotency_key,
    jsonb_build_object('status', p_expected_status),
    jsonb_build_object('status', 'accepted'),
    NULL, NULL
  );

  v_result := private.command_ok(jsonb_build_object('entity_id', p_goods_receipt_id, 'receipt_status', 'accepted'));
  PERFORM private.command_store_idempotency(v_cmd, p_idempotency_key, v_actor, v_result);
  RETURN v_result;
END
$function$;


-- ---------------------------------------------------------------------------
-- Service entries
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_service_entry_create(
  p_legal_entity_id UUID,
  p_vendor_id UUID,
  p_entry_number TEXT,
  p_description TEXT,
  p_purchase_order_id UUID DEFAULT NULL,
  p_contract_id UUID DEFAULT NULL,
  p_lines JSONB DEFAULT '[]'::jsonb,
  p_fiscal_period_id UUID DEFAULT NULL,
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
  v_cmd TEXT := 'service_entry_create';
  v_replay JSONB;
  v_id UUID;
  v_item JSONB;
  v_ln SMALLINT := 0;
  v_result JSONB;
BEGIN
  v_replay := private.command_check_idempotency(v_cmd, p_idempotency_key, v_actor);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF v_actor IS NULL OR NOT private.current_user_is_active() THEN
    RETURN private.command_fail('UNAUTHENTICATED', 'Authentication required');
  END IF;
  IF p_purchase_order_id IS NULL AND p_contract_id IS NULL THEN
    RETURN private.command_fail('VALIDATION', 'PO or contract required');
  END IF;
  IF NOT private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator','procurement_user','cost_controller','budget_owner'],
    p_legal_entity_id, 'legal_entity', p_legal_entity_id
  ) THEN
    RETURN private.command_fail('FORBIDDEN', 'Insufficient role to create service entry');
  END IF;
  IF p_fiscal_period_id IS NOT NULL THEN
    PERFORM private.assert_period_open('procurement', p_legal_entity_id, p_fiscal_period_id);
  END IF;

  INSERT INTO public.service_entries (
    legal_entity_id, purchase_order_id, contract_id, vendor_id, entry_number,
    description, created_by, fiscal_period_id, entry_status
  ) VALUES (
    p_legal_entity_id, p_purchase_order_id, p_contract_id, p_vendor_id, p_entry_number,
    p_description, v_actor, p_fiscal_period_id, 'draft'
  ) RETURNING id INTO v_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_lines, '[]'::jsonb))
  LOOP
    v_ln := v_ln + 1;
    INSERT INTO public.service_entry_lines (
      service_entry_id, purchase_order_line_id, line_number, description,
      quantity, unit_price_ex_vat, accepted_amount
    ) VALUES (
      v_id,
      NULLIF(v_item->>'purchase_order_line_id', '')::UUID,
      COALESCE((v_item->>'line_number')::SMALLINT, v_ln),
      COALESCE(v_item->>'description', p_description),
      COALESCE((v_item->>'quantity')::NUMERIC, 1),
      COALESCE((v_item->>'unit_price_ex_vat')::NUMERIC, 0),
      COALESCE((v_item->>'accepted_amount')::NUMERIC,
        COALESCE((v_item->>'quantity')::NUMERIC, 1) * COALESCE((v_item->>'unit_price_ex_vat')::NUMERIC, 0))
    );
  END LOOP;

  PERFORM private.write_audit_event(
    v_actor, 'create', 'service_entry', v_id,
    p_legal_entity_id, NULL, NULL, p_correlation_id, p_idempotency_key,
    NULL, jsonb_build_object('entry_number', p_entry_number), NULL, NULL
  );

  v_result := private.command_ok(jsonb_build_object('entity_id', v_id));
  PERFORM private.command_store_idempotency(v_cmd, p_idempotency_key, v_actor, v_result);
  RETURN v_result;
END
$function$;

CREATE OR REPLACE FUNCTION public.rpc_service_entry_accept(
  p_service_entry_id UUID,
  p_expected_status public.service_entry_status DEFAULT 'draft',
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
  v_cmd TEXT := 'service_entry_accept';
  v_replay JSONB;
  v_row public.service_entries%ROWTYPE;
  v_amount NUMERIC(18,4);
  v_po_total NUMERIC(18,4);
  v_prev NUMERIC(18,4);
  v_result JSONB;
BEGIN
  v_replay := private.command_check_idempotency(v_cmd, p_idempotency_key, v_actor);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF v_actor IS NULL OR NOT private.current_user_is_active() THEN
    RETURN private.command_fail('UNAUTHENTICATED', 'Authentication required');
  END IF;

  SELECT * INTO v_row FROM public.service_entries AS se WHERE se.id = p_service_entry_id FOR UPDATE;
  IF NOT FOUND THEN RETURN private.command_fail('NOT_FOUND', 'Service entry not found'); END IF;
  IF v_row.entry_status IS DISTINCT FROM p_expected_status THEN
    RETURN private.command_fail('STATE_MISMATCH', 'Unexpected service entry status');
  END IF;
  IF NOT private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator','procurement_user','cost_controller','budget_owner','approver'],
    v_row.legal_entity_id, 'legal_entity', v_row.legal_entity_id
  ) THEN
    RETURN private.command_fail('FORBIDDEN', 'Insufficient role to accept service entry');
  END IF;
  IF v_row.fiscal_period_id IS NOT NULL THEN
    PERFORM private.assert_period_open('procurement', v_row.legal_entity_id, v_row.fiscal_period_id);
  END IF;

  SELECT COALESCE(SUM(sel.accepted_amount), 0) INTO v_amount
  FROM public.service_entry_lines AS sel WHERE sel.service_entry_id = p_service_entry_id;

  IF v_row.purchase_order_id IS NOT NULL THEN
    SELECT total_amount INTO v_po_total FROM public.purchase_orders WHERE id = v_row.purchase_order_id;
    SELECT COALESCE(SUM(se2.accepted_amount), 0) INTO v_prev
    FROM public.service_entries AS se2
    WHERE se2.purchase_order_id = v_row.purchase_order_id
      AND se2.entry_status = 'accepted'
      AND se2.id <> p_service_entry_id;
    IF v_prev + v_amount > v_po_total THEN
      RETURN private.command_fail('TOLERANCE', 'Service accepted amount exceeds PO remaining value');
    END IF;
  END IF;

  UPDATE public.service_entries AS se SET
    entry_status = 'accepted',
    accepted_amount = v_amount,
    accepted_by = v_actor,
    accepted_at = NOW(),
    updated_at = NOW(),
    row_version = se.row_version + 1
  WHERE se.id = p_service_entry_id;

  PERFORM private.write_audit_event(
    v_actor, 'update', 'service_entry', p_service_entry_id,
    v_row.legal_entity_id, NULL, NULL, p_correlation_id, p_idempotency_key,
    jsonb_build_object('status', p_expected_status),
    jsonb_build_object('status', 'accepted', 'accepted_amount', v_amount),
    NULL, NULL
  );

  v_result := private.command_ok(jsonb_build_object('entity_id', p_service_entry_id, 'accepted_amount', v_amount));
  PERFORM private.command_store_idempotency(v_cmd, p_idempotency_key, v_actor, v_result);
  RETURN v_result;
END
$function$;

-- ---------------------------------------------------------------------------
-- Supplier invoices + matching
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_supplier_invoice_create(
  p_legal_entity_id UUID,
  p_purchase_order_id UUID,
  p_vendor_id UUID,
  p_invoice_number TEXT,
  p_invoice_date DATE,
  p_gross_amount NUMERIC(18,4),
  p_subtotal_ex_vat NUMERIC(18,4) DEFAULT NULL,
  p_vat_amount NUMERIC(18,4) DEFAULT 0,
  p_due_date DATE DEFAULT NULL,
  p_lines JSONB DEFAULT '[]'::jsonb,
  p_fiscal_period_id UUID DEFAULT NULL,
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
  v_cmd TEXT := 'supplier_invoice_create';
  v_replay JSONB;
  v_id UUID;
  v_item JSONB;
  v_ln SMALLINT := 0;
  v_sub NUMERIC(18,4);
  v_result JSONB;
BEGIN
  v_replay := private.command_check_idempotency(v_cmd, p_idempotency_key, v_actor);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF v_actor IS NULL OR NOT private.current_user_is_active() THEN
    RETURN private.command_fail('UNAUTHENTICATED', 'Authentication required');
  END IF;
  IF NOT private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator','procurement_user','finance_user'],
    p_legal_entity_id, 'legal_entity', p_legal_entity_id
  ) THEN
    RETURN private.command_fail('FORBIDDEN', 'Insufficient role to create invoice');
  END IF;
  IF p_fiscal_period_id IS NOT NULL THEN
    PERFORM private.assert_period_open('procurement', p_legal_entity_id, p_fiscal_period_id);
  END IF;

  v_sub := COALESCE(p_subtotal_ex_vat, p_gross_amount - COALESCE(p_vat_amount, 0));

  INSERT INTO public.supplier_invoices (
    legal_entity_id, purchase_order_id, vendor_id, invoice_number, invoice_date,
    due_date, gross_amount, subtotal_ex_vat, vat_amount, match_status,
    invoice_status, fiscal_period_id, created_by
  ) VALUES (
    p_legal_entity_id, p_purchase_order_id, p_vendor_id, p_invoice_number, p_invoice_date,
    p_due_date, p_gross_amount, v_sub, COALESCE(p_vat_amount, 0), 'unmatched',
    'draft', p_fiscal_period_id, v_actor
  ) RETURNING id INTO v_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_lines, '[]'::jsonb))
  LOOP
    v_ln := v_ln + 1;
    INSERT INTO public.supplier_invoice_lines (
      supplier_invoice_id, purchase_order_line_id, line_number, description,
      quantity, unit_price_ex_vat, vat_amount
    ) VALUES (
      v_id,
      NULLIF(v_item->>'purchase_order_line_id', '')::UUID,
      COALESCE((v_item->>'line_number')::SMALLINT, v_ln),
      COALESCE(v_item->>'description', 'Invoice line'),
      COALESCE((v_item->>'quantity')::NUMERIC, 1),
      COALESCE((v_item->>'unit_price_ex_vat')::NUMERIC, 0),
      COALESCE((v_item->>'vat_amount')::NUMERIC, 0)
    );
  END LOOP;

  PERFORM private.write_audit_event(
    v_actor, 'create', 'supplier_invoice', v_id,
    p_legal_entity_id, NULL, NULL, p_correlation_id, p_idempotency_key,
    NULL, jsonb_build_object('invoice_number', p_invoice_number, 'gross_amount', p_gross_amount),
    NULL, NULL
  );

  v_result := private.command_ok(jsonb_build_object('entity_id', v_id));
  PERFORM private.command_store_idempotency(v_cmd, p_idempotency_key, v_actor, v_result);
  RETURN v_result;
END
$function$;

CREATE OR REPLACE FUNCTION public.rpc_supplier_invoice_match(
  p_supplier_invoice_id UUID,
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
  v_cmd TEXT := 'supplier_invoice_match';
  v_replay JSONB;
  v_inv public.supplier_invoices%ROWTYPE;
  v_po public.purchase_orders%ROWTYPE;
  v_po_amt NUMERIC(18,4);
  v_recv_amt NUMERIC(18,4);
  v_svc_amt NUMERIC(18,4);
  v_recv_qty NUMERIC(18,4);
  v_inv_qty NUMERIC(18,4);
  v_ref_amt NUMERIC(18,4);
  v_mode TEXT;
  v_status public.invoice_match_status;
  v_qty_var NUMERIC(18,4);
  v_price_var NUMERIC(18,4);
  v_amt_var NUMERIC(18,4);
  v_price_tol NUMERIC(18,4);
  v_total_tol NUMERIC(18,4);
  v_result_id UUID;
  v_result JSONB;
BEGIN
  v_replay := private.command_check_idempotency(v_cmd, p_idempotency_key, v_actor);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF v_actor IS NULL OR NOT private.current_user_is_active() THEN
    RETURN private.command_fail('UNAUTHENTICATED', 'Authentication required');
  END IF;

  SELECT * INTO v_inv FROM public.supplier_invoices AS si WHERE si.id = p_supplier_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RETURN private.command_fail('NOT_FOUND', 'Invoice not found'); END IF;
  IF NOT private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator','procurement_user','finance_user','cost_controller'],
    v_inv.legal_entity_id, 'legal_entity', v_inv.legal_entity_id
  ) THEN
    RETURN private.command_fail('FORBIDDEN', 'Insufficient role to match invoice');
  END IF;
  IF v_inv.fiscal_period_id IS NOT NULL THEN
    PERFORM private.assert_period_open('procurement', v_inv.legal_entity_id, v_inv.fiscal_period_id);
  END IF;

  SELECT * INTO v_po FROM public.purchase_orders AS po WHERE po.id = v_inv.purchase_order_id;
  v_po_amt := COALESCE(v_po.total_amount, 0);

  SELECT COALESCE(SUM(grl.quantity_accepted * pol.unit_price_ex_vat), 0),
         COALESCE(SUM(grl.quantity_accepted), 0)
    INTO v_recv_amt, v_recv_qty
  FROM public.goods_receipt_lines AS grl
  JOIN public.goods_receipts AS gr ON gr.id = grl.goods_receipt_id
  JOIN public.purchase_order_lines AS pol ON pol.id = grl.purchase_order_line_id
  WHERE gr.purchase_order_id = v_inv.purchase_order_id AND gr.receipt_status = 'accepted';

  SELECT COALESCE(SUM(se.accepted_amount), 0) INTO v_svc_amt
  FROM public.service_entries AS se
  WHERE se.purchase_order_id = v_inv.purchase_order_id AND se.entry_status = 'accepted';

  SELECT COALESCE(SUM(sil.quantity), 0) INTO v_inv_qty
  FROM public.supplier_invoice_lines AS sil WHERE sil.supplier_invoice_id = p_supplier_invoice_id;

  IF v_recv_amt > 0 THEN
    v_mode := 'three_way_goods';
    v_ref_amt := v_recv_amt;
  ELSIF v_svc_amt > 0 THEN
    v_mode := 'three_way_service';
    v_ref_amt := v_svc_amt;
  ELSE
    v_mode := 'two_way';
    v_ref_amt := v_po_amt;
  END IF;

  v_price_tol := private.procurement_price_tolerance_percent(v_inv.legal_entity_id);
  v_total_tol := private.procurement_invoice_total_tolerance(v_inv.legal_entity_id);
  v_qty_var := CASE WHEN v_mode = 'three_way_goods' THEN v_inv_qty - v_recv_qty ELSE 0 END;
  v_amt_var := v_inv.subtotal_ex_vat - v_ref_amt;
  v_price_var := v_inv.subtotal_ex_vat - v_po_amt;

  DELETE FROM public.invoice_match_exceptions WHERE supplier_invoice_id = p_supplier_invoice_id AND is_resolved = false;

  IF ABS(v_amt_var) <= v_total_tol AND (v_mode <> 'three_way_goods' OR ABS(v_qty_var) = 0)
     AND ABS(v_price_var) <= (v_po_amt * (v_price_tol / 100.0)) THEN
    IF ABS(v_amt_var) = 0 AND ABS(v_price_var) = 0 THEN
      v_status := 'matched';
    ELSE
      v_status := 'matched_within_tolerance';
    END IF;
  ELSE
    v_status := 'exception';
    IF v_mode = 'three_way_service' AND v_svc_amt <= 0 THEN
      INSERT INTO public.invoice_match_exceptions (supplier_invoice_id, exception_code, message, amount)
      VALUES (p_supplier_invoice_id, 'missing_service_entry', 'No accepted service entry for three-way service match', v_inv.subtotal_ex_vat);
    END IF;
    IF v_mode = 'three_way_goods' AND v_recv_amt <= 0 THEN
      INSERT INTO public.invoice_match_exceptions (supplier_invoice_id, exception_code, message, amount)
      VALUES (p_supplier_invoice_id, 'missing_receipt', 'No accepted goods receipt for three-way goods match', v_inv.subtotal_ex_vat);
    END IF;
    IF ABS(v_amt_var) > v_total_tol THEN
      INSERT INTO public.invoice_match_exceptions (supplier_invoice_id, exception_code, message, amount)
      VALUES (p_supplier_invoice_id, 'amount_variance', 'Invoice amount variance exceeds tolerance', v_amt_var);
    END IF;
    IF ABS(v_price_var) > (v_po_amt * (v_price_tol / 100.0)) THEN
      INSERT INTO public.invoice_match_exceptions (supplier_invoice_id, exception_code, message, amount)
      VALUES (p_supplier_invoice_id, 'price_variance', 'Invoice vs PO price variance exceeds tolerance', v_price_var);
    END IF;
    IF v_mode = 'three_way_goods' AND ABS(v_qty_var) > 0 THEN
      INSERT INTO public.invoice_match_exceptions (supplier_invoice_id, exception_code, message, amount)
      VALUES (p_supplier_invoice_id, 'quantity_variance', 'Invoice quantity differs from accepted receipt quantity', v_qty_var);
    END IF;
  END IF;

  INSERT INTO public.invoice_match_results (
    supplier_invoice_id, match_mode, match_status, po_amount, receipt_or_service_amount,
    invoice_amount, quantity_variance, price_variance, amount_variance,
    tolerance_applied, matched_by, details
  ) VALUES (
    p_supplier_invoice_id, v_mode, v_status, v_po_amt, v_ref_amt,
    v_inv.subtotal_ex_vat, v_qty_var, v_price_var, v_amt_var,
    jsonb_build_object('price_tolerance_percent', v_price_tol, 'invoice_total_tolerance_amount', v_total_tol),
    v_actor,
    jsonb_build_object('mode', v_mode)
  )
  ON CONFLICT (supplier_invoice_id) DO UPDATE SET
    match_mode = EXCLUDED.match_mode,
    match_status = EXCLUDED.match_status,
    po_amount = EXCLUDED.po_amount,
    receipt_or_service_amount = EXCLUDED.receipt_or_service_amount,
    invoice_amount = EXCLUDED.invoice_amount,
    quantity_variance = EXCLUDED.quantity_variance,
    price_variance = EXCLUDED.price_variance,
    amount_variance = EXCLUDED.amount_variance,
    tolerance_applied = EXCLUDED.tolerance_applied,
    matched_by = EXCLUDED.matched_by,
    matched_at = NOW(),
    details = EXCLUDED.details
  RETURNING id INTO v_result_id;

  UPDATE public.invoice_match_exceptions
  SET match_result_id = v_result_id
  WHERE supplier_invoice_id = p_supplier_invoice_id AND match_result_id IS NULL;

  UPDATE public.supplier_invoices AS si SET
    match_status = v_status,
    matched_amount = CASE WHEN v_status IN ('matched', 'matched_within_tolerance') THEN si.subtotal_ex_vat ELSE si.matched_amount END,
    invoice_status = CASE
      WHEN v_status IN ('matched', 'matched_within_tolerance') THEN 'matched'::public.invoice_status
      WHEN v_status = 'exception' THEN 'submitted'::public.invoice_status
      ELSE si.invoice_status
    END,
    updated_at = NOW(),
    row_version = si.row_version + 1
  WHERE si.id = p_supplier_invoice_id;

  PERFORM private.write_audit_event(
    v_actor, 'update', 'supplier_invoice', p_supplier_invoice_id,
    v_inv.legal_entity_id, NULL, NULL, p_correlation_id, p_idempotency_key,
    jsonb_build_object('match_status', v_inv.match_status),
    jsonb_build_object('match_status', v_status, 'mode', v_mode),
    NULL, NULL
  );

  v_result := private.command_ok(jsonb_build_object(
    'entity_id', p_supplier_invoice_id, 'match_status', v_status, 'match_mode', v_mode, 'match_result_id', v_result_id
  ));
  PERFORM private.command_store_idempotency(v_cmd, p_idempotency_key, v_actor, v_result);
  RETURN v_result;
END
$function$;

CREATE OR REPLACE FUNCTION public.rpc_invoice_match_override(
  p_supplier_invoice_id UUID,
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
  v_cmd TEXT := 'invoice_match_override';
  v_replay JSONB;
  v_inv public.supplier_invoices%ROWTYPE;
  v_result JSONB;
BEGIN
  v_replay := private.command_check_idempotency(v_cmd, p_idempotency_key, v_actor);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF v_actor IS NULL OR NOT private.current_user_is_active() THEN
    RETURN private.command_fail('UNAUTHENTICATED', 'Authentication required');
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
    RETURN private.command_fail('VALIDATION', 'Override reason required');
  END IF;

  SELECT * INTO v_inv FROM public.supplier_invoices AS si WHERE si.id = p_supplier_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RETURN private.command_fail('NOT_FOUND', 'Invoice not found'); END IF;
  IF NOT private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator','finance_user','approver'],
    v_inv.legal_entity_id, 'legal_entity', v_inv.legal_entity_id
  ) THEN
    RETURN private.command_fail('FORBIDDEN', 'Insufficient role for match override');
  END IF;
  IF v_inv.created_by = v_actor THEN
    RETURN private.command_fail('SOD_VIOLATION', 'Invoice creator cannot override match');
  END IF;

  UPDATE public.invoice_match_exceptions SET
    is_resolved = true,
    resolved_by = v_actor,
    resolved_at = NOW(),
    override_reason = p_reason
  WHERE supplier_invoice_id = p_supplier_invoice_id AND is_resolved = false;

  UPDATE public.invoice_match_results SET
    match_status = 'overridden',
    matched_by = v_actor,
    matched_at = NOW(),
    details = COALESCE(details, '{}'::jsonb) || jsonb_build_object('override_reason', p_reason)
  WHERE supplier_invoice_id = p_supplier_invoice_id;

  UPDATE public.supplier_invoices SET
    match_status = 'overridden',
    invoice_status = 'matched',
    updated_at = NOW(),
    row_version = row_version + 1
  WHERE id = p_supplier_invoice_id;

  PERFORM private.write_audit_event(
    v_actor, 'update', 'supplier_invoice', p_supplier_invoice_id,
    v_inv.legal_entity_id, NULL, NULL, p_correlation_id, p_idempotency_key,
    jsonb_build_object('match_status', v_inv.match_status),
    jsonb_build_object('match_status', 'overridden'),
    p_reason, NULL
  );

  v_result := private.command_ok(jsonb_build_object('entity_id', p_supplier_invoice_id, 'match_status', 'overridden'));
  PERFORM private.command_store_idempotency(v_cmd, p_idempotency_key, v_actor, v_result);
  RETURN v_result;
END
$function$;

CREATE OR REPLACE FUNCTION public.rpc_supplier_invoice_approve(
  p_supplier_invoice_id UUID,
  p_expected_status public.invoice_status DEFAULT 'matched',
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
  v_cmd TEXT := 'supplier_invoice_approve';
  v_replay JSONB;
  v_inv public.supplier_invoices%ROWTYPE;
  v_result JSONB;
BEGIN
  v_replay := private.command_check_idempotency(v_cmd, p_idempotency_key, v_actor);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF v_actor IS NULL OR NOT private.current_user_is_active() THEN
    RETURN private.command_fail('UNAUTHENTICATED', 'Authentication required');
  END IF;

  SELECT * INTO v_inv FROM public.supplier_invoices AS si WHERE si.id = p_supplier_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RETURN private.command_fail('NOT_FOUND', 'Invoice not found'); END IF;
  IF v_inv.invoice_status IS DISTINCT FROM p_expected_status THEN
    RETURN private.command_fail('STATE_MISMATCH', 'Unexpected invoice status');
  END IF;
  IF v_inv.match_status NOT IN ('matched', 'matched_within_tolerance', 'overridden') THEN
    RETURN private.command_fail('INVALID_STATE', 'Invoice must be matched or overridden before approve');
  END IF;
  IF NOT private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator','finance_user','approver'],
    v_inv.legal_entity_id, 'legal_entity', v_inv.legal_entity_id
  ) THEN
    RETURN private.command_fail('FORBIDDEN', 'Insufficient role to approve invoice');
  END IF;
  IF v_inv.created_by = v_actor OR v_inv.submitted_by = v_actor THEN
    RETURN private.command_fail('SOD_VIOLATION', 'Invoice recorder cannot approve');
  END IF;

  UPDATE public.supplier_invoices SET
    invoice_status = 'approved',
    approved_by = v_actor,
    approved_at = NOW(),
    updated_at = NOW(),
    row_version = row_version + 1
  WHERE id = p_supplier_invoice_id;

  PERFORM private.write_audit_event(
    v_actor, 'update', 'supplier_invoice', p_supplier_invoice_id,
    v_inv.legal_entity_id, NULL, NULL, p_correlation_id, p_idempotency_key,
    jsonb_build_object('status', p_expected_status),
    jsonb_build_object('status', 'approved'),
    NULL, NULL
  );

  v_result := private.command_ok(jsonb_build_object('entity_id', p_supplier_invoice_id, 'invoice_status', 'approved'));
  PERFORM private.command_store_idempotency(v_cmd, p_idempotency_key, v_actor, v_result);
  RETURN v_result;
END
$function$;


-- ---------------------------------------------------------------------------
-- Payment requests (approved = ready_for_payment; NOT paid)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_payment_request_create(
  p_legal_entity_id UUID,
  p_supplier_invoice_id UUID,
  p_amount NUMERIC(18,4),
  p_due_date DATE DEFAULT NULL,
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
  v_cmd TEXT := 'payment_request_create';
  v_replay JSONB;
  v_inv public.supplier_invoices%ROWTYPE;
  v_requested NUMERIC(18,4);
  v_balance NUMERIC(18,4);
  v_id UUID;
  v_result JSONB;
BEGIN
  v_replay := private.command_check_idempotency(v_cmd, p_idempotency_key, v_actor);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF v_actor IS NULL OR NOT private.current_user_is_active() THEN
    RETURN private.command_fail('UNAUTHENTICATED', 'Authentication required');
  END IF;

  SELECT * INTO v_inv FROM public.supplier_invoices AS si WHERE si.id = p_supplier_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RETURN private.command_fail('NOT_FOUND', 'Invoice not found'); END IF;
  IF v_inv.legal_entity_id IS DISTINCT FROM p_legal_entity_id THEN
    RETURN private.command_fail('VALIDATION', 'Legal entity mismatch');
  END IF;
  IF v_inv.invoice_status <> 'approved' THEN
    RETURN private.command_fail('INVALID_STATE', 'Invoice must be approved');
  END IF;
  IF v_inv.match_status NOT IN ('matched', 'matched_within_tolerance', 'overridden') THEN
    RETURN private.command_fail('INVALID_STATE', 'Invoice match not cleared');
  END IF;
  IF NOT private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator','finance_user','procurement_user'],
    p_legal_entity_id, 'legal_entity', p_legal_entity_id
  ) THEN
    RETURN private.command_fail('FORBIDDEN', 'Insufficient role to create payment request');
  END IF;

  SELECT COALESCE(SUM(pr.amount), 0) INTO v_requested
  FROM public.payment_requests AS pr
  WHERE pr.supplier_invoice_id = p_supplier_invoice_id
    AND pr.request_status NOT IN ('cancelled', 'rejected');
  v_balance := v_inv.gross_amount - v_requested;
  IF p_amount <= 0 OR p_amount > v_balance THEN
    RETURN private.command_fail('VALIDATION', 'Amount exceeds unpaid invoice balance');
  END IF;

  INSERT INTO public.payment_requests (
    legal_entity_id, supplier_invoice_id, request_status, amount,
    requested_by, due_date, reason
  ) VALUES (
    p_legal_entity_id, p_supplier_invoice_id, 'draft', p_amount,
    v_actor, p_due_date, p_reason
  ) RETURNING id INTO v_id;

  PERFORM private.write_audit_event(
    v_actor, 'create', 'payment_request', v_id,
    p_legal_entity_id, NULL, NULL, p_correlation_id, p_idempotency_key,
    NULL, jsonb_build_object('amount', p_amount, 'supplier_invoice_id', p_supplier_invoice_id),
    p_reason, NULL
  );

  v_result := private.command_ok(jsonb_build_object('entity_id', v_id, 'ready_for_payment', false));
  PERFORM private.command_store_idempotency(v_cmd, p_idempotency_key, v_actor, v_result);
  RETURN v_result;
END
$function$;

CREATE OR REPLACE FUNCTION public.rpc_payment_request_submit(
  p_payment_request_id UUID,
  p_expected_status public.payment_request_status DEFAULT 'draft',
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
  v_cmd TEXT := 'payment_request_submit';
  v_replay JSONB;
  v_row public.payment_requests%ROWTYPE;
  v_result JSONB;
BEGIN
  v_replay := private.command_check_idempotency(v_cmd, p_idempotency_key, v_actor);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF v_actor IS NULL OR NOT private.current_user_is_active() THEN
    RETURN private.command_fail('UNAUTHENTICATED', 'Authentication required');
  END IF;

  SELECT * INTO v_row FROM public.payment_requests AS pr WHERE pr.id = p_payment_request_id FOR UPDATE;
  IF NOT FOUND THEN RETURN private.command_fail('NOT_FOUND', 'Payment request not found'); END IF;
  IF v_row.request_status IS DISTINCT FROM p_expected_status THEN
    RETURN private.command_fail('STATE_MISMATCH', 'Unexpected payment request status');
  END IF;
  IF v_row.requested_by <> v_actor AND NOT private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator','finance_user'],
    v_row.legal_entity_id, 'legal_entity', v_row.legal_entity_id
  ) THEN
    RETURN private.command_fail('FORBIDDEN', 'Only requester can submit');
  END IF;

  UPDATE public.payment_requests SET
    request_status = 'submitted',
    submitted_at = NOW(),
    updated_at = NOW(),
    row_version = row_version + 1
  WHERE id = p_payment_request_id;

  PERFORM private.write_audit_event(
    v_actor, 'update', 'payment_request', p_payment_request_id,
    v_row.legal_entity_id, NULL, NULL, p_correlation_id, p_idempotency_key,
    jsonb_build_object('status', p_expected_status),
    jsonb_build_object('status', 'submitted'),
    NULL, NULL
  );

  v_result := private.command_ok(jsonb_build_object('entity_id', p_payment_request_id, 'request_status', 'submitted'));
  PERFORM private.command_store_idempotency(v_cmd, p_idempotency_key, v_actor, v_result);
  RETURN v_result;
END
$function$;

CREATE OR REPLACE FUNCTION public.rpc_payment_request_approve(
  p_payment_request_id UUID,
  p_expected_status public.payment_request_status DEFAULT 'submitted',
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
  v_cmd TEXT := 'payment_request_approve';
  v_replay JSONB;
  v_row public.payment_requests%ROWTYPE;
  v_inv public.supplier_invoices%ROWTYPE;
  v_requested NUMERIC(18,4);
  v_result JSONB;
BEGIN
  v_replay := private.command_check_idempotency(v_cmd, p_idempotency_key, v_actor);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF v_actor IS NULL OR NOT private.current_user_is_active() THEN
    RETURN private.command_fail('UNAUTHENTICATED', 'Authentication required');
  END IF;

  SELECT * INTO v_row FROM public.payment_requests AS pr WHERE pr.id = p_payment_request_id FOR UPDATE;
  IF NOT FOUND THEN RETURN private.command_fail('NOT_FOUND', 'Payment request not found'); END IF;
  IF v_row.request_status IS DISTINCT FROM p_expected_status THEN
    RETURN private.command_fail('STATE_MISMATCH', 'Unexpected payment request status');
  END IF;
  IF v_row.requested_by = v_actor THEN
    RETURN private.command_fail('SOD_VIOLATION', 'Requester cannot approve payment request');
  END IF;
  IF NOT private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator','finance_user','approver'],
    v_row.legal_entity_id, 'legal_entity', v_row.legal_entity_id
  ) THEN
    RETURN private.command_fail('FORBIDDEN', 'Insufficient role to approve payment request');
  END IF;

  SELECT * INTO v_inv FROM public.supplier_invoices AS si WHERE si.id = v_row.supplier_invoice_id FOR UPDATE;
  SELECT COALESCE(SUM(pr.amount), 0) INTO v_requested
  FROM public.payment_requests AS pr
  WHERE pr.supplier_invoice_id = v_row.supplier_invoice_id
    AND pr.id <> p_payment_request_id
    AND pr.request_status IN ('approved', 'released', 'submitted');
  IF v_row.amount > (v_inv.gross_amount - v_requested) THEN
    RETURN private.command_fail('VALIDATION', 'Amount exceeds unpaid invoice balance');
  END IF;

  -- approved = ready_for_payment (NOT bank paid)
  UPDATE public.payment_requests SET
    request_status = 'approved',
    approved_by = v_actor,
    approved_at = NOW(),
    updated_at = NOW(),
    row_version = row_version + 1
  WHERE id = p_payment_request_id;

  PERFORM private.write_audit_event(
    v_actor, 'update', 'payment_request', p_payment_request_id,
    v_row.legal_entity_id, NULL, NULL, p_correlation_id, p_idempotency_key,
    jsonb_build_object('status', p_expected_status),
    jsonb_build_object('status', 'approved', 'ready_for_payment', true),
    NULL, NULL
  );

  v_result := private.command_ok(jsonb_build_object(
    'entity_id', p_payment_request_id,
    'request_status', 'approved',
    'ready_for_payment', true
  ));
  PERFORM private.command_store_idempotency(v_cmd, p_idempotency_key, v_actor, v_result);
  RETURN v_result;
END
$function$;

-- ---------------------------------------------------------------------------
-- RLS + grants
-- ---------------------------------------------------------------------------
DO $rls$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'purchase_order_lines','procurement_contracts','procurement_contract_lines',
    'goods_receipts','goods_receipt_lines','service_entries','service_entry_lines',
    'supplier_invoice_lines','invoice_match_results','invoice_match_exceptions',
    'po_number_sequences','procurement_policies'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END
$rls$;

-- purchase_order_lines
DROP POLICY IF EXISTS purchase_order_lines_select_member ON public.purchase_order_lines;
CREATE POLICY purchase_order_lines_select_member ON public.purchase_order_lines
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.purchase_orders AS po
      WHERE po.id = purchase_order_id AND private.user_can_access_legal_entity(po.legal_entity_id))
  );
DROP POLICY IF EXISTS purchase_order_lines_insert_authorized ON public.purchase_order_lines;
CREATE POLICY purchase_order_lines_insert_authorized ON public.purchase_order_lines
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.purchase_orders AS po WHERE po.id = purchase_order_id
      AND private.user_has_any_role(
        ARRAY['system_administrator','legal_entity_administrator','procurement_user','cost_controller'],
        po.legal_entity_id))
  );
DROP POLICY IF EXISTS purchase_order_lines_update_authorized ON public.purchase_order_lines;
CREATE POLICY purchase_order_lines_update_authorized ON public.purchase_order_lines
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.purchase_orders AS po WHERE po.id = purchase_order_id
      AND private.user_has_any_role(
        ARRAY['system_administrator','legal_entity_administrator','procurement_user','cost_controller'],
        po.legal_entity_id))
  );

-- procurement_contracts
DROP POLICY IF EXISTS procurement_contracts_select_member ON public.procurement_contracts;
CREATE POLICY procurement_contracts_select_member ON public.procurement_contracts
  FOR SELECT TO authenticated USING (private.user_can_access_legal_entity(legal_entity_id));
DROP POLICY IF EXISTS procurement_contracts_insert_authorized ON public.procurement_contracts;
CREATE POLICY procurement_contracts_insert_authorized ON public.procurement_contracts
  FOR INSERT TO authenticated WITH CHECK (private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator','procurement_user','cost_controller'], legal_entity_id));
DROP POLICY IF EXISTS procurement_contracts_update_authorized ON public.procurement_contracts;
CREATE POLICY procurement_contracts_update_authorized ON public.procurement_contracts
  FOR UPDATE TO authenticated USING (private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator','procurement_user','cost_controller','approver'], legal_entity_id));

DROP POLICY IF EXISTS procurement_contract_lines_select_member ON public.procurement_contract_lines;
CREATE POLICY procurement_contract_lines_select_member ON public.procurement_contract_lines
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.procurement_contracts AS c
      WHERE c.id = contract_id AND private.user_can_access_legal_entity(c.legal_entity_id))
  );
DROP POLICY IF EXISTS procurement_contract_lines_write_authorized ON public.procurement_contract_lines;
CREATE POLICY procurement_contract_lines_write_authorized ON public.procurement_contract_lines
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.procurement_contracts AS c WHERE c.id = contract_id
      AND private.user_has_any_role(
        ARRAY['system_administrator','legal_entity_administrator','procurement_user','cost_controller'],
        c.legal_entity_id))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.procurement_contracts AS c WHERE c.id = contract_id
      AND private.user_has_any_role(
        ARRAY['system_administrator','legal_entity_administrator','procurement_user','cost_controller'],
        c.legal_entity_id))
  );

-- goods receipts
DROP POLICY IF EXISTS goods_receipts_select_member ON public.goods_receipts;
CREATE POLICY goods_receipts_select_member ON public.goods_receipts
  FOR SELECT TO authenticated USING (private.user_can_access_legal_entity(legal_entity_id));
DROP POLICY IF EXISTS goods_receipts_insert_authorized ON public.goods_receipts;
CREATE POLICY goods_receipts_insert_authorized ON public.goods_receipts
  FOR INSERT TO authenticated WITH CHECK (private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator','procurement_user','cost_controller'], legal_entity_id));
DROP POLICY IF EXISTS goods_receipts_update_authorized ON public.goods_receipts;
CREATE POLICY goods_receipts_update_authorized ON public.goods_receipts
  FOR UPDATE TO authenticated USING (private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator','procurement_user','cost_controller'], legal_entity_id));

DROP POLICY IF EXISTS goods_receipt_lines_select_member ON public.goods_receipt_lines;
CREATE POLICY goods_receipt_lines_select_member ON public.goods_receipt_lines
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.goods_receipts AS gr
      WHERE gr.id = goods_receipt_id AND private.user_can_access_legal_entity(gr.legal_entity_id))
  );
DROP POLICY IF EXISTS goods_receipt_lines_write_authorized ON public.goods_receipt_lines;
CREATE POLICY goods_receipt_lines_write_authorized ON public.goods_receipt_lines
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.goods_receipts AS gr WHERE gr.id = goods_receipt_id
      AND private.user_has_any_role(
        ARRAY['system_administrator','legal_entity_administrator','procurement_user','cost_controller'],
        gr.legal_entity_id))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.goods_receipts AS gr WHERE gr.id = goods_receipt_id
      AND private.user_has_any_role(
        ARRAY['system_administrator','legal_entity_administrator','procurement_user','cost_controller'],
        gr.legal_entity_id))
  );

-- service entries
DROP POLICY IF EXISTS service_entries_select_member ON public.service_entries;
CREATE POLICY service_entries_select_member ON public.service_entries
  FOR SELECT TO authenticated USING (private.user_can_access_legal_entity(legal_entity_id));
DROP POLICY IF EXISTS service_entries_insert_authorized ON public.service_entries;
CREATE POLICY service_entries_insert_authorized ON public.service_entries
  FOR INSERT TO authenticated WITH CHECK (private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator','procurement_user','cost_controller','budget_owner'], legal_entity_id));
DROP POLICY IF EXISTS service_entries_update_authorized ON public.service_entries;
CREATE POLICY service_entries_update_authorized ON public.service_entries
  FOR UPDATE TO authenticated USING (private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator','procurement_user','cost_controller','budget_owner','approver'], legal_entity_id));

DROP POLICY IF EXISTS service_entry_lines_select_member ON public.service_entry_lines;
CREATE POLICY service_entry_lines_select_member ON public.service_entry_lines
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.service_entries AS se
      WHERE se.id = service_entry_id AND private.user_can_access_legal_entity(se.legal_entity_id))
  );
DROP POLICY IF EXISTS service_entry_lines_write_authorized ON public.service_entry_lines;
CREATE POLICY service_entry_lines_write_authorized ON public.service_entry_lines
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.service_entries AS se WHERE se.id = service_entry_id
      AND private.user_has_any_role(
        ARRAY['system_administrator','legal_entity_administrator','procurement_user','cost_controller','budget_owner'],
        se.legal_entity_id))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.service_entries AS se WHERE se.id = service_entry_id
      AND private.user_has_any_role(
        ARRAY['system_administrator','legal_entity_administrator','procurement_user','cost_controller','budget_owner'],
        se.legal_entity_id))
  );

-- invoice lines / match
DROP POLICY IF EXISTS supplier_invoice_lines_select_member ON public.supplier_invoice_lines;
CREATE POLICY supplier_invoice_lines_select_member ON public.supplier_invoice_lines
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.supplier_invoices AS si
      WHERE si.id = supplier_invoice_id AND private.user_can_access_legal_entity(si.legal_entity_id))
  );
DROP POLICY IF EXISTS supplier_invoice_lines_write_authorized ON public.supplier_invoice_lines;
CREATE POLICY supplier_invoice_lines_write_authorized ON public.supplier_invoice_lines
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.supplier_invoices AS si WHERE si.id = supplier_invoice_id
      AND private.user_has_any_role(
        ARRAY['system_administrator','legal_entity_administrator','procurement_user','finance_user'],
        si.legal_entity_id))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.supplier_invoices AS si WHERE si.id = supplier_invoice_id
      AND private.user_has_any_role(
        ARRAY['system_administrator','legal_entity_administrator','procurement_user','finance_user'],
        si.legal_entity_id))
  );

DROP POLICY IF EXISTS invoice_match_results_select_member ON public.invoice_match_results;
CREATE POLICY invoice_match_results_select_member ON public.invoice_match_results
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.supplier_invoices AS si
      WHERE si.id = supplier_invoice_id AND private.user_can_access_legal_entity(si.legal_entity_id))
  );
DROP POLICY IF EXISTS invoice_match_exceptions_select_member ON public.invoice_match_exceptions;
CREATE POLICY invoice_match_exceptions_select_member ON public.invoice_match_exceptions
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.supplier_invoices AS si
      WHERE si.id = supplier_invoice_id AND private.user_can_access_legal_entity(si.legal_entity_id))
  );

DROP POLICY IF EXISTS procurement_policies_select_member ON public.procurement_policies;
CREATE POLICY procurement_policies_select_member ON public.procurement_policies
  FOR SELECT TO authenticated USING (private.user_can_access_legal_entity(legal_entity_id));
DROP POLICY IF EXISTS procurement_policies_write_authorized ON public.procurement_policies;
CREATE POLICY procurement_policies_write_authorized ON public.procurement_policies
  FOR ALL TO authenticated USING (private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator','procurement_user'], legal_entity_id))
  WITH CHECK (private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator','procurement_user'], legal_entity_id));

DROP POLICY IF EXISTS po_number_sequences_deny_client ON public.po_number_sequences;
CREATE POLICY po_number_sequences_deny_client ON public.po_number_sequences
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

GRANT SELECT, INSERT, UPDATE ON TABLE
  public.purchase_order_lines,
  public.procurement_contracts,
  public.procurement_contract_lines,
  public.goods_receipts,
  public.goods_receipt_lines,
  public.service_entries,
  public.service_entry_lines,
  public.supplier_invoice_lines,
  public.invoice_match_results,
  public.invoice_match_exceptions,
  public.procurement_policies
TO authenticated;

GRANT SELECT ON TABLE public.po_number_sequences TO authenticated;

-- Function grants
DO $grants$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'rpc_po_create_from_award','rpc_po_submit','rpc_po_approve','rpc_po_issue','rpc_po_cancel',
        'rpc_contract_create','rpc_contract_approve','rpc_contract_activate',
        'rpc_goods_receipt_create','rpc_goods_receipt_accept',
        'rpc_service_entry_create','rpc_service_entry_accept',
        'rpc_supplier_invoice_create','rpc_supplier_invoice_match','rpc_invoice_match_override',
        'rpc_supplier_invoice_approve',
        'rpc_payment_request_create','rpc_payment_request_submit','rpc_payment_request_approve'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END
$grants$;

REVOKE ALL ON FUNCTION private.next_po_number(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.procurement_qty_tolerance_percent(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.procurement_price_tolerance_percent(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.procurement_invoice_total_tolerance(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.po_transition(UUID, public.po_status, public.po_status, TEXT, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.contract_transition(UUID, public.contract_status, public.contract_status, TEXT, UUID) FROM PUBLIC;

COMMENT ON TABLE public.purchase_order_lines IS '@classification data_api_exposed; authenticated only; RLS mandatory';
COMMENT ON TABLE public.procurement_contracts IS '@classification data_api_exposed; authenticated only; RLS mandatory';
COMMENT ON TABLE public.goods_receipts IS '@classification data_api_exposed; authenticated only; RLS mandatory';
COMMENT ON TABLE public.service_entries IS '@classification data_api_exposed; authenticated only; RLS mandatory';
COMMENT ON TABLE public.invoice_match_results IS '@classification data_api_exposed; authenticated only; RLS mandatory';
COMMENT ON COLUMN public.payment_requests.request_status IS 'approved = ready_for_payment (not bank paid)';
