-- Vendors, commitments, actuals, imports
CREATE TABLE vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id UUID NOT NULL REFERENCES legal_entities(id),
  code TEXT NOT NULL,
  name_en TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  status record_status NOT NULL DEFAULT 'active',
  UNIQUE (legal_entity_id, code)
);

CREATE TABLE import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id UUID NOT NULL REFERENCES legal_entities(id),
  import_type TEXT NOT NULL,
  file_name TEXT,
  file_total NUMERIC(18,4),
  imported_total NUMERIC(18,4),
  row_count INTEGER NOT NULL DEFAULT 0,
  approval_status approval_status NOT NULL DEFAULT 'submitted',
  imported_by UUID REFERENCES profiles(id),
  approved_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE imported_source_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_batch_id UUID NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  raw_data JSONB NOT NULL,
  parse_status TEXT NOT NULL DEFAULT 'valid',
  error_message TEXT
);

CREATE TABLE actual_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id UUID NOT NULL REFERENCES legal_entities(id),
  import_batch_id UUID REFERENCES import_batches(id),
  source_system TEXT NOT NULL,
  source_transaction_id TEXT NOT NULL,
  journal_number TEXT,
  invoice_number TEXT,
  vendor_id UUID REFERENCES vendors(id),
  transaction_date DATE NOT NULL,
  accounting_period_id UUID REFERENCES fiscal_periods(id),
  original_gl_account_id UUID REFERENCES gl_accounts(id),
  original_description TEXT,
  amount_ex_vat NUMERIC(18,4) NOT NULL,
  vat_amount NUMERIC(18,4) NOT NULL DEFAULT 0,
  amount_inc_vat NUMERIC(18,4) NOT NULL,
  recoverable_vat NUMERIC(18,4) NOT NULL DEFAULT 0,
  non_recoverable_vat NUMERIC(18,4) NOT NULL DEFAULT 0,
  vat_category TEXT,
  vat_rate NUMERIC(7,4),
  tax_invoice_reference TEXT,
  commitment_date DATE,
  accrual_date DATE,
  invoice_date DATE,
  due_date DATE,
  payment_date DATE,
  transaction_class transaction_class NOT NULL DEFAULT 'external',
  is_reversal BOOLEAN NOT NULL DEFAULT FALSE,
  reverses_transaction_id UUID REFERENCES actual_transactions(id),
  is_posted BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (legal_entity_id, source_system, source_transaction_id)
);

CREATE TABLE actual_transaction_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actual_transaction_id UUID NOT NULL REFERENCES actual_transactions(id) ON DELETE CASCADE,
  organization_unit_id UUID REFERENCES organization_units(id),
  control_account_id UUID REFERENCES control_accounts(id),
  cost_node_id UUID REFERENCES cost_nodes(id),
  project_id UUID REFERENCES projects(id),
  allocation_percent NUMERIC(7,4),
  allocation_amount NUMERIC(18,4) NOT NULL
);

CREATE TABLE commitments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id UUID NOT NULL REFERENCES legal_entities(id),
  vendor_id UUID REFERENCES vendors(id),
  control_account_id UUID REFERENCES control_accounts(id),
  reference_number TEXT NOT NULL,
  description TEXT,
  original_value NUMERIC(18,4) NOT NULL,
  approved_variations NUMERIC(18,4) NOT NULL DEFAULT 0,
  cancelled_amount NUMERIC(18,4) NOT NULL DEFAULT 0,
  invoiced_applied NUMERIC(18,4) NOT NULL DEFAULT 0,
  approval_status approval_status NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (legal_entity_id, reference_number)
);

CREATE TABLE forecast_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id UUID NOT NULL REFERENCES legal_entities(id),
  control_scope_id UUID REFERENCES control_scopes(id),
  scenario TEXT NOT NULL DEFAULT 'latest',
  effective_date DATE NOT NULL,
  assumptions TEXT,
  owner_id UUID REFERENCES profiles(id),
  approval_status approval_status NOT NULL DEFAULT 'draft',
  forecast_cost NUMERIC(18,4) NOT NULL DEFAULT 0,
  forecast_completion_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE forecast_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  forecast_version_id UUID NOT NULL REFERENCES forecast_versions(id) ON DELETE CASCADE,
  control_account_id UUID REFERENCES control_accounts(id),
  cost_node_id UUID REFERENCES cost_nodes(id),
  fiscal_period_id UUID REFERENCES fiscal_periods(id),
  forecast_amount NUMERIC(18,4) NOT NULL,
  forecast_progress NUMERIC(7,4)
);

CREATE TABLE variance_explanations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id UUID NOT NULL REFERENCES legal_entities(id),
  control_account_id UUID REFERENCES control_accounts(id),
  fiscal_period_id UUID REFERENCES fiscal_periods(id),
  variance_category TEXT NOT NULL,
  variance_amount NUMERIC(18,4) NOT NULL,
  cause TEXT NOT NULL,
  financial_impact NUMERIC(18,4),
  schedule_impact_days INTEGER,
  responsible_owner_id UUID REFERENCES profiles(id),
  corrective_action TEXT,
  target_resolution_date DATE,
  approval_status approval_status NOT NULL DEFAULT 'submitted',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE risks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id UUID NOT NULL REFERENCES legal_entities(id),
  control_scope_id UUID REFERENCES control_scopes(id),
  title_en TEXT NOT NULL,
  title_ar TEXT NOT NULL,
  probability_percent NUMERIC(7,4) NOT NULL,
  financial_impact NUMERIC(18,4) NOT NULL DEFAULT 0,
  schedule_impact_days INTEGER NOT NULL DEFAULT 0,
  owner_id UUID REFERENCES profiles(id),
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  severity TEXT NOT NULL,
  title_en TEXT NOT NULL,
  title_ar TEXT NOT NULL,
  related_entity_type TEXT,
  related_entity_id UUID,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Allocation reconciliation view helper
CREATE OR REPLACE VIEW v_budget_vs_actual AS
SELECT
  bl.id AS budget_line_id,
  bv.legal_entity_id,
  bl.planned_amount AS budget_amount,
  COALESCE(SUM(ata.allocation_amount), 0) AS actual_amount,
  bl.planned_amount - COALESCE(SUM(ata.allocation_amount), 0) AS variance_amount
FROM budget_lines bl
JOIN budget_versions bv ON bv.id = bl.budget_version_id
LEFT JOIN actual_transaction_allocations ata ON ata.cost_node_id = bl.cost_node_id
GROUP BY bl.id, bv.legal_entity_id, bl.planned_amount;
