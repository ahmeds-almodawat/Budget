-- Control scopes, projects, WBS
CREATE TABLE control_scope_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name_en TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  scope_type scope_type NOT NULL
);

CREATE TABLE control_scopes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id UUID NOT NULL REFERENCES legal_entities(id),
  scope_type_id UUID NOT NULL REFERENCES control_scope_types(id),
  parent_id UUID REFERENCES control_scopes(id),
  code TEXT NOT NULL,
  name_en TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  approval_status approval_status NOT NULL DEFAULT 'draft',
  status record_status NOT NULL DEFAULT 'active',
  effective_start DATE,
  effective_end DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (legal_entity_id, code)
);

CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  control_scope_id UUID NOT NULL UNIQUE REFERENCES control_scopes(id),
  project_type TEXT,
  sponsor_id UUID REFERENCES profiles(id),
  project_manager_id UUID REFERENCES profiles(id),
  primary_location_id UUID REFERENCES organization_units(id),
  responsible_department_id UUID REFERENCES organization_units(id),
  priority SMALLINT,
  scope_description TEXT,
  status record_status NOT NULL DEFAULT 'active',
  baseline_start DATE,
  baseline_end DATE,
  approved_revised_start DATE,
  approved_revised_end DATE,
  forecast_start DATE,
  forecast_end DATE,
  actual_start DATE,
  actual_end DATE,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE project_phases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name_en TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  sequence_no SMALLINT NOT NULL,
  baseline_start DATE,
  baseline_end DATE,
  forecast_start DATE,
  forecast_end DATE,
  actual_start DATE,
  actual_end DATE,
  UNIQUE (project_id, code)
);

CREATE TABLE work_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phase_id UUID NOT NULL REFERENCES project_phases(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name_en TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  responsible_team_id UUID REFERENCES teams(id),
  UNIQUE (phase_id, code)
);

CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_package_id UUID NOT NULL REFERENCES work_packages(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name_en TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  assigned_to UUID REFERENCES profiles(id),
  baseline_start DATE,
  baseline_end DATE,
  forecast_start DATE,
  forecast_end DATE,
  actual_start DATE,
  actual_end DATE,
  progress_percent NUMERIC(7,4) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'not_started',
  UNIQUE (work_package_id, code)
);

CREATE TABLE task_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  predecessor_task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  successor_task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  dependency_type dependency_type NOT NULL DEFAULT 'fs',
  lag_days INTEGER NOT NULL DEFAULT 0,
  CHECK (predecessor_task_id <> successor_task_id),
  UNIQUE (predecessor_task_id, successor_task_id)
);

CREATE TABLE milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  phase_id UUID REFERENCES project_phases(id),
  work_package_id UUID REFERENCES work_packages(id),
  code TEXT NOT NULL,
  name_en TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  responsible_person_id UUID REFERENCES profiles(id),
  responsible_team_id UUID REFERENCES teams(id),
  importance_weight NUMERIC(7,4) NOT NULL DEFAULT 1,
  baseline_date DATE,
  approved_revised_date DATE,
  forecast_date DATE,
  actual_date DATE,
  progress_method progress_method NOT NULL DEFAULT 'manual_verified',
  approved_progress NUMERIC(7,4) NOT NULL DEFAULT 0,
  reported_progress NUMERIC(7,4) NOT NULL DEFAULT 0,
  approval_status approval_status NOT NULL DEFAULT 'draft',
  quality_status TEXT,
  delay_reason TEXT,
  UNIQUE (project_id, code)
);

CREATE TABLE milestone_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  milestone_id UUID NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
  name_en TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  weight_percent NUMERIC(7,4) NOT NULL,
  sequence_no SMALLINT NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE milestone_progress_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  milestone_id UUID NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
  reported_by UUID NOT NULL REFERENCES profiles(id),
  reported_progress NUMERIC(7,4) NOT NULL,
  verified_by UUID REFERENCES profiles(id),
  verified_progress NUMERIC(7,4),
  approval_status approval_status NOT NULL DEFAULT 'submitted',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (reported_by IS DISTINCT FROM verified_by OR verified_by IS NULL)
);

CREATE TABLE schedule_change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id),
  requested_days INTEGER NOT NULL,
  approved_days INTEGER,
  reason TEXT NOT NULL,
  requester_id UUID NOT NULL REFERENCES profiles(id),
  approver_id UUID REFERENCES profiles(id),
  approval_status approval_status NOT NULL DEFAULT 'submitted',
  approval_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
