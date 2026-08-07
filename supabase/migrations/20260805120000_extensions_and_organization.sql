-- Extensions and shared enums. Keep extension-owned functions out of the Data
-- API's public schema.
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "btree_gist" WITH SCHEMA extensions;

CREATE TYPE approval_status AS ENUM (
  'draft', 'submitted', 'under_review', 'approved', 'rejected', 'locked', 'posted', 'superseded', 'cancelled'
);

CREATE TYPE record_status AS ENUM ('active', 'inactive');

CREATE TYPE cost_classification AS ENUM (
  'capex', 'opex', 'revenue', 'cost_of_revenue', 'payroll', 'working_capital', 'internal_transfer', 'statistical'
);

CREATE TYPE progress_method AS ENUM (
  'zero_hundred', 'fifty_fifty', 'weighted_steps', 'quantity_completed', 'milestone_weighted', 'manual_verified'
);

CREATE TYPE dependency_type AS ENUM ('fs', 'ss', 'ff', 'sf');

CREATE TYPE transaction_class AS ENUM (
  'external', 'intercompany', 'interbranch', 'shared_service', 'internal_allocation', 'elimination'
);

CREATE TYPE scope_type AS ENUM (
  'operational_budget', 'project', 'program', 'capital_initiative', 'department_plan',
  'restaurant_opening', 'annual_business_plan', 'cost_reduction', 'revenue_plan', 'other'
);

CREATE TYPE audit_action AS ENUM (
  'create', 'update', 'delete', 'approve', 'reject', 'import', 'allocate', 'reverse', 'cancel'
);

-- Organizations
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name_en TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  status record_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID,
  updated_by UUID
);

CREATE TABLE legal_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  code TEXT NOT NULL,
  name_en TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  default_currency CHAR(3) NOT NULL DEFAULT 'SAR',
  default_timezone TEXT NOT NULL DEFAULT 'Asia/Riyadh',
  financial_year_start_month SMALLINT NOT NULL DEFAULT 1 CHECK (financial_year_start_month BETWEEN 1 AND 12),
  status record_status NOT NULL DEFAULT 'active',
  effective_start DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_end DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, code)
);

CREATE TABLE organization_unit_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id UUID NOT NULL REFERENCES legal_entities(id),
  code TEXT NOT NULL,
  name_en TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  level_order SMALLINT NOT NULL,
  is_cost_center_level BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (legal_entity_id, code)
);

CREATE TABLE organization_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id UUID NOT NULL REFERENCES legal_entities(id),
  unit_type_id UUID NOT NULL REFERENCES organization_unit_types(id),
  parent_id UUID REFERENCES organization_units(id),
  code TEXT NOT NULL,
  name_en TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  responsible_manager_id UUID,
  approval_status approval_status NOT NULL DEFAULT 'draft',
  status record_status NOT NULL DEFAULT 'active',
  effective_start DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_end DATE,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (legal_entity_id, code)
);

CREATE INDEX idx_org_units_parent ON organization_units(parent_id);
CREATE INDEX idx_org_units_entity ON organization_units(legal_entity_id);
