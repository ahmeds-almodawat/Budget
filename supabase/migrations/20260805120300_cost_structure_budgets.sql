-- Cost structure, control accounts, budgets
CREATE TABLE cost_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id UUID NOT NULL REFERENCES legal_entities(id),
  parent_id UUID REFERENCES cost_nodes(id),
  code TEXT NOT NULL,
  name_en TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  node_level SMALLINT NOT NULL CHECK (node_level BETWEEN 1 AND 3),
  classification cost_classification,
  is_leaf BOOLEAN NOT NULL DEFAULT FALSE,
  allows_posting BOOLEAN NOT NULL DEFAULT FALSE,
  status record_status NOT NULL DEFAULT 'active',
  UNIQUE (legal_entity_id, code)
);

CREATE OR REPLACE FUNCTION enforce_leaf_posting()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.allows_posting THEN
    IF EXISTS (SELECT 1 FROM cost_nodes c WHERE c.parent_id = NEW.id) THEN
      RAISE EXCEPTION 'Cannot allow posting on non-leaf cost node';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE gl_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id UUID NOT NULL REFERENCES legal_entities(id),
  code TEXT NOT NULL,
  name_en TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  UNIQUE (legal_entity_id, code)
);

CREATE TABLE gl_cost_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gl_account_id UUID NOT NULL REFERENCES gl_accounts(id),
  cost_node_id UUID NOT NULL REFERENCES cost_nodes(id),
  effective_start DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_end DATE,
  UNIQUE (gl_account_id, cost_node_id, effective_start)
);

CREATE TABLE control_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id UUID NOT NULL REFERENCES legal_entities(id),
  control_scope_id UUID REFERENCES control_scopes(id),
  organization_unit_id UUID REFERENCES organization_units(id),
  project_id UUID REFERENCES projects(id),
  phase_id UUID REFERENCES project_phases(id),
  work_package_id UUID REFERENCES work_packages(id),
  cost_node_id UUID REFERENCES cost_nodes(id),
  responsible_manager_id UUID REFERENCES profiles(id),
  responsible_team_id UUID REFERENCES teams(id),
  code TEXT NOT NULL,
  name_en TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  progress_method progress_method NOT NULL DEFAULT 'manual_verified',
  status record_status NOT NULL DEFAULT 'active',
  UNIQUE (legal_entity_id, code)
);

CREATE TABLE fiscal_years (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id UUID NOT NULL REFERENCES legal_entities(id),
  year_label TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_closed BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (legal_entity_id, year_label)
);

CREATE TABLE fiscal_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_year_id UUID NOT NULL REFERENCES fiscal_years(id) ON DELETE CASCADE,
  period_number SMALLINT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_closed BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (fiscal_year_id, period_number)
);

CREATE TABLE budget_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id UUID NOT NULL REFERENCES legal_entities(id),
  control_scope_id UUID REFERENCES control_scopes(id),
  fiscal_year_id UUID NOT NULL REFERENCES fiscal_years(id),
  version_label TEXT NOT NULL,
  version_type TEXT NOT NULL,
  approval_status approval_status NOT NULL DEFAULT 'draft',
  is_current_approved BOOLEAN NOT NULL DEFAULT FALSE,
  original_approved_amount NUMERIC(18,4) NOT NULL DEFAULT 0,
  contingency_amount NUMERIC(18,4) NOT NULL DEFAULT 0,
  management_reserve_amount NUMERIC(18,4) NOT NULL DEFAULT 0,
  approved_increases NUMERIC(18,4) NOT NULL DEFAULT 0,
  approved_reductions NUMERIC(18,4) NOT NULL DEFAULT 0,
  locked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id),
  UNIQUE (legal_entity_id, control_scope_id, fiscal_year_id, version_label)
);

CREATE TABLE budget_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_version_id UUID NOT NULL REFERENCES budget_versions(id) ON DELETE CASCADE,
  control_account_id UUID REFERENCES control_accounts(id),
  organization_unit_id UUID REFERENCES organization_units(id),
  cost_node_id UUID NOT NULL REFERENCES cost_nodes(id),
  planned_quantity NUMERIC(18,4),
  unit_of_measure TEXT,
  planned_unit_rate NUMERIC(18,4),
  planned_amount NUMERIC(18,4) NOT NULL,
  driver_formula TEXT,
  assumption TEXT,
  owner_id UUID REFERENCES profiles(id),
  notes TEXT,
  version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE budget_monthly_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_line_id UUID NOT NULL REFERENCES budget_lines(id) ON DELETE CASCADE,
  fiscal_period_id UUID NOT NULL REFERENCES fiscal_periods(id),
  allocated_amount NUMERIC(18,4) NOT NULL,
  UNIQUE (budget_line_id, fiscal_period_id)
);

CREATE TABLE budget_change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_version_id UUID NOT NULL REFERENCES budget_versions(id),
  change_type TEXT NOT NULL CHECK (change_type IN ('increase', 'reduction', 'reallocation')),
  requested_amount NUMERIC(18,4) NOT NULL,
  reason TEXT NOT NULL,
  requester_id UUID NOT NULL REFERENCES profiles(id),
  approval_status approval_status NOT NULL DEFAULT 'submitted',
  effective_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE budget_change_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  change_request_id UUID NOT NULL REFERENCES budget_change_requests(id) ON DELETE CASCADE,
  source_budget_line_id UUID REFERENCES budget_lines(id),
  destination_budget_line_id UUID REFERENCES budget_lines(id),
  amount NUMERIC(18,4) NOT NULL,
  before_amount NUMERIC(18,4) NOT NULL,
  after_amount NUMERIC(18,4) NOT NULL
);
