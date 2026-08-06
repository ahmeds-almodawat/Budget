-- P6: Revenue control reference data, management-reporting dimensions, and GL mapping extensions

CREATE TABLE public.revenue_component_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name_en TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  net_effect_multiplier SMALLINT NOT NULL CHECK (net_effect_multiplier IN (-1, 1)),
  is_deduction BOOLEAN NOT NULL DEFAULT FALSE,
  status public.record_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES public.profiles(id),
  CONSTRAINT revenue_component_types_multiplier_check CHECK (
    (is_deduction = true AND net_effect_multiplier = -1)
    OR (is_deduction = false AND net_effect_multiplier = 1)
    OR (code = 'other_adjustment')
  )
);

COMMENT ON TABLE public.revenue_component_types IS
  '@classification data_api_exposed; revenue gross-to-net component reference';

INSERT INTO public.revenue_component_types (code, name_en, name_ar, net_effect_multiplier, is_deduction)
VALUES
  ('gross_revenue', 'Gross Revenue', 'إيراد إجمالي', 1, false),
  ('rejection', 'Rejection', 'رفض', -1, true),
  ('discount', 'Discount', 'خصم', -1, true),
  ('refund', 'Refund', 'استرداد', -1, true),
  ('credit_note', 'Credit Note', 'إشعار دائن', -1, true),
  ('other_deduction', 'Other Deduction', 'خصم آخر', -1, true),
  ('other_adjustment', 'Other Adjustment', 'تعديل آخر', 1, false)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE public.payer_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name_en TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  status public.record_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.payer_categories IS
  '@classification data_api_exposed; payer category reference';

INSERT INTO public.payer_categories (code, name_en, name_ar)
VALUES
  ('government', 'Government', 'حكومي'),
  ('insurance', 'Insurance', 'تأمين'),
  ('cash', 'Cash', 'نقدي'),
  ('charity', 'Charity', 'خيري'),
  ('corporate', 'Corporate', 'شركات'),
  ('citizen_program', 'Citizen Program', 'برنامج مواطن'),
  ('exempt_program', 'Exempt Program', 'برنامج معفى'),
  ('other', 'Other', 'أخرى')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE public.payers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id UUID NOT NULL REFERENCES public.legal_entities(id),
  payer_category_id UUID NOT NULL REFERENCES public.payer_categories(id),
  code TEXT NOT NULL,
  name_en TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  status public.record_status NOT NULL DEFAULT 'active',
  effective_start DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_end DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (legal_entity_id, code)
);

COMMENT ON TABLE public.payers IS
  '@classification data_api_exposed; payer master scoped to legal entity';

CREATE TABLE public.service_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id UUID NOT NULL REFERENCES public.legal_entities(id),
  code TEXT NOT NULL,
  name_en TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  status public.record_status NOT NULL DEFAULT 'active',
  effective_start DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_end DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (legal_entity_id, code)
);

COMMENT ON TABLE public.service_lines IS
  '@classification data_api_exposed; service line / sales channel dimension';

CREATE TYPE public.revenue_budget_basis AS ENUM ('net_only', 'component_based');

ALTER TABLE public.budget_lines
  ADD COLUMN IF NOT EXISTS payer_id UUID REFERENCES public.payers(id),
  ADD COLUMN IF NOT EXISTS service_line_id UUID REFERENCES public.service_lines(id),
  ADD COLUMN IF NOT EXISTS revenue_component_type_id UUID REFERENCES public.revenue_component_types(id),
  ADD COLUMN IF NOT EXISTS revenue_budget_basis public.revenue_budget_basis;

ALTER TABLE public.forecast_lines
  ADD COLUMN IF NOT EXISTS organization_unit_id UUID REFERENCES public.organization_units(id),
  ADD COLUMN IF NOT EXISTS payer_id UUID REFERENCES public.payers(id),
  ADD COLUMN IF NOT EXISTS service_line_id UUID REFERENCES public.service_lines(id),
  ADD COLUMN IF NOT EXISTS revenue_component_type_id UUID REFERENCES public.revenue_component_types(id),
  ADD COLUMN IF NOT EXISTS revenue_budget_basis public.revenue_budget_basis;

ALTER TABLE public.actual_transaction_allocations
  ADD COLUMN IF NOT EXISTS source_allocation_amount NUMERIC(18,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reporting_amount_ex_vat NUMERIC(18,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS non_recoverable_vat_allocated NUMERIC(18,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payer_id UUID REFERENCES public.payers(id),
  ADD COLUMN IF NOT EXISTS service_line_id UUID REFERENCES public.service_lines(id),
  ADD COLUMN IF NOT EXISTS revenue_component_type_id UUID REFERENCES public.revenue_component_types(id);

ALTER TABLE public.actual_transaction_allocations DISABLE TRIGGER USER;
UPDATE public.actual_transaction_allocations AS ata
SET
  source_allocation_amount = CASE
    WHEN ata.source_allocation_amount = 0 THEN ata.allocation_amount
    ELSE ata.source_allocation_amount
  END,
  reporting_amount_ex_vat = CASE
    WHEN ata.reporting_amount_ex_vat = 0 THEN
      CASE
        WHEN cn.classification IN ('revenue', 'internal_transfer', 'opex', 'payroll', 'cost_of_revenue', 'capex', 'working_capital')
          THEN ABS(ata.allocation_amount)
        ELSE ata.allocation_amount
      END
    ELSE ata.reporting_amount_ex_vat
  END
FROM public.cost_nodes AS cn
WHERE cn.id = ata.cost_node_id;
ALTER TABLE public.actual_transaction_allocations ENABLE TRIGGER USER;

CREATE TABLE public.gl_reporting_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id UUID NOT NULL REFERENCES public.legal_entities(id),
  gl_account_id UUID NOT NULL REFERENCES public.gl_accounts(id),
  cost_node_id UUID REFERENCES public.cost_nodes(id),
  management_sign_multiplier SMALLINT NOT NULL DEFAULT 1 CHECK (management_sign_multiplier IN (-1, 1)),
  source_normal_balance TEXT CHECK (source_normal_balance IN ('debit', 'credit')),
  revenue_component_type_id UUID REFERENCES public.revenue_component_types(id),
  payer_id UUID REFERENCES public.payers(id),
  service_line_id UUID REFERENCES public.service_lines(id),
  default_transaction_class public.transaction_class,
  effective_start DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_end DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (gl_account_id, effective_start)
);

COMMENT ON TABLE public.gl_reporting_rules IS
  '@classification server_only; auditable GL to management-reporting normalization rules';

CREATE OR REPLACE FUNCTION private.validate_revenue_budget_basis(p_budget_version_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_basis_count INTEGER;
BEGIN
  SELECT COUNT(DISTINCT bl.revenue_budget_basis) INTO v_basis_count
  FROM public.budget_lines AS bl
  JOIN public.cost_nodes AS cn ON cn.id = bl.cost_node_id
  WHERE bl.budget_version_id = p_budget_version_id
    AND cn.classification = 'revenue'
    AND bl.revenue_budget_basis IS NOT NULL;

  IF v_basis_count > 1 THEN
    RAISE EXCEPTION 'Revenue budget lines in one version cannot mix net_only and component_based bases';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION private.validate_allocation_revenue_dimensions()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
  v_classification public.cost_classification;
  v_entity UUID;
  v_payer_entity UUID;
  v_sl_entity UUID;
BEGIN
  SELECT cn.classification, cn.legal_entity_id INTO v_classification, v_entity
  FROM public.cost_nodes AS cn WHERE cn.id = NEW.cost_node_id;

  IF NEW.payer_id IS NOT NULL THEN
    SELECT p.legal_entity_id INTO v_payer_entity FROM public.payers AS p WHERE p.id = NEW.payer_id;
    IF v_payer_entity IS DISTINCT FROM v_entity THEN
      RAISE EXCEPTION 'Payer legal entity mismatch on allocation';
    END IF;
    IF v_classification NOT IN ('revenue', 'internal_transfer') THEN
      RAISE EXCEPTION 'Payer dimension requires revenue classification';
    END IF;
  END IF;

  IF NEW.service_line_id IS NOT NULL THEN
    SELECT sl.legal_entity_id INTO v_sl_entity FROM public.service_lines AS sl WHERE sl.id = NEW.service_line_id;
    IF v_sl_entity IS DISTINCT FROM v_entity THEN
      RAISE EXCEPTION 'Service line legal entity mismatch on allocation';
    END IF;
  END IF;

  IF NEW.revenue_component_type_id IS NOT NULL AND v_classification NOT IN ('revenue', 'internal_transfer') THEN
    RAISE EXCEPTION 'Revenue component requires revenue classification';
  END IF;

  IF NEW.source_allocation_amount IS NULL OR NEW.source_allocation_amount = 0 THEN
    NEW.source_allocation_amount := NEW.allocation_amount;
  END IF;
  IF NEW.reporting_amount_ex_vat IS NULL
     OR (NEW.reporting_amount_ex_vat = 0 AND NEW.allocation_amount <> 0) THEN
    NEW.reporting_amount_ex_vat := ABS(NEW.allocation_amount);
  END IF;

  RETURN NEW;
END;
$function$;

CREATE INDEX IF NOT EXISTS idx_payers_entity ON public.payers (legal_entity_id, status);
CREATE INDEX IF NOT EXISTS idx_service_lines_entity ON public.service_lines (legal_entity_id, status);
CREATE INDEX IF NOT EXISTS idx_allocations_revenue_dims
  ON public.actual_transaction_allocations (payer_id, service_line_id, revenue_component_type_id);
CREATE INDEX IF NOT EXISTS idx_budget_lines_revenue_dims
  ON public.budget_lines (payer_id, service_line_id, revenue_component_type_id);

DROP TRIGGER IF EXISTS trg_validate_allocation_revenue_dimensions ON public.actual_transaction_allocations;
CREATE TRIGGER trg_validate_allocation_revenue_dimensions
  BEFORE INSERT OR UPDATE ON public.actual_transaction_allocations
  FOR EACH ROW EXECUTE FUNCTION private.validate_allocation_revenue_dimensions();

-- Seed generic payers and service lines for primary legal entity (development reference only)
INSERT INTO public.payers (id, legal_entity_id, payer_category_id, code, name_en, name_ar)
SELECT
  '88888888-8888-8888-8888-888888888801'::uuid,
  '11111111-1111-1111-1111-111111111102'::uuid,
  pc.id,
  'PAYER-GOV-GENERIC',
  'Generic Government Payer',
  'جهة حكومية عامة'
FROM public.payer_categories AS pc WHERE pc.code = 'government'
ON CONFLICT (legal_entity_id, code) DO NOTHING;

INSERT INTO public.payers (id, legal_entity_id, payer_category_id, code, name_en, name_ar)
SELECT
  '88888888-8888-8888-8888-888888888802'::uuid,
  '11111111-1111-1111-1111-111111111102'::uuid,
  pc.id,
  'PAYER-INS-GENERIC',
  'Generic Insurance Payer',
  'جهة تأمين عامة'
FROM public.payer_categories AS pc WHERE pc.code = 'insurance'
ON CONFLICT (legal_entity_id, code) DO NOTHING;

INSERT INTO public.payers (id, legal_entity_id, payer_category_id, code, name_en, name_ar)
SELECT
  '88888888-8888-8888-8888-888888888803'::uuid,
  '11111111-1111-1111-1111-111111111102'::uuid,
  pc.id,
  'PAYER-CASH-GENERIC',
  'Generic Cash Payer',
  'دافع نقدي عام'
FROM public.payer_categories AS pc WHERE pc.code = 'cash'
ON CONFLICT (legal_entity_id, code) DO NOTHING;

INSERT INTO public.service_lines (id, legal_entity_id, code, name_en, name_ar)
VALUES
  ('99999999-9999-9999-9999-999999999901', '11111111-1111-1111-1111-111111111102', 'SL-OUTPATIENT', 'Outpatient', 'عيادات خارجية'),
  ('99999999-9999-9999-9999-999999999902', '11111111-1111-1111-1111-111111111102', 'SL-INPATIENT', 'Inpatient', 'تنويم'),
  ('99999999-9999-9999-9999-999999999903', '11111111-1111-1111-1111-111111111102', 'SL-PHARMACY', 'Pharmacy', 'صيدلية'),
  ('99999999-9999-9999-9999-999999999904', '11111111-1111-1111-1111-111111111102', 'SL-DINE-IN', 'Dine In', 'تناول في المطعم'),
  ('99999999-9999-9999-9999-999999999905', '11111111-1111-1111-1111-111111111102', 'SL-DELIVERY', 'Delivery', 'توصيل')
ON CONFLICT (legal_entity_id, code) DO NOTHING;

REVOKE ALL ON FUNCTION private.validate_revenue_budget_basis(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.validate_allocation_revenue_dimensions() FROM PUBLIC;
