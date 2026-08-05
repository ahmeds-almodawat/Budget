-- Phase 2: Risk, issue, action, and decision control registers

ALTER TABLE risks
  ADD COLUMN IF NOT EXISTS description_en TEXT,
  ADD COLUMN IF NOT EXISTS description_ar TEXT,
  ADD COLUMN IF NOT EXISTS quality_impact TEXT,
  ADD COLUMN IF NOT EXISTS mitigation_plan TEXT,
  ADD COLUMN IF NOT EXISTS contingency_plan TEXT,
  ADD COLUMN IF NOT EXISTS control_account_id UUID REFERENCES control_accounts(id),
  ADD COLUMN IF NOT EXISTS milestone_id UUID REFERENCES milestones(id),
  ADD COLUMN IF NOT EXISTS contingency_budget NUMERIC(18,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS escalation_level TEXT,
  ADD COLUMN IF NOT EXISTS risk_exposure NUMERIC(18,4) GENERATED ALWAYS AS (
    financial_impact * probability_percent / 100
  ) STORED;

CREATE TABLE issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id UUID NOT NULL REFERENCES legal_entities(id),
  control_scope_id UUID REFERENCES control_scopes(id),
  project_id UUID REFERENCES projects(id),
  title_en TEXT NOT NULL,
  title_ar TEXT NOT NULL,
  description_en TEXT,
  description_ar TEXT,
  severity TEXT NOT NULL DEFAULT 'medium',
  owner_id UUID REFERENCES profiles(id),
  linked_risk_id UUID REFERENCES risks(id),
  linked_milestone_id UUID REFERENCES milestones(id),
  status TEXT NOT NULL DEFAULT 'open',
  due_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE register_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id UUID NOT NULL REFERENCES legal_entities(id),
  control_scope_id UUID REFERENCES control_scopes(id),
  project_id UUID REFERENCES projects(id),
  title_en TEXT NOT NULL,
  title_ar TEXT NOT NULL,
  description_en TEXT,
  description_ar TEXT,
  owner_id UUID REFERENCES profiles(id),
  linked_issue_id UUID REFERENCES issues(id),
  linked_risk_id UUID REFERENCES risks(id),
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'open',
  priority TEXT NOT NULL DEFAULT 'medium',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id UUID NOT NULL REFERENCES legal_entities(id),
  control_scope_id UUID REFERENCES control_scopes(id),
  project_id UUID REFERENCES projects(id),
  title_en TEXT NOT NULL,
  title_ar TEXT NOT NULL,
  description_en TEXT,
  description_ar TEXT,
  decided_by UUID REFERENCES profiles(id),
  decision_date DATE NOT NULL DEFAULT CURRENT_DATE,
  linked_issue_id UUID REFERENCES issues(id),
  linked_risk_id UUID REFERENCES risks(id),
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE register_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id UUID NOT NULL REFERENCES legal_entities(id),
  control_scope_id UUID REFERENCES control_scopes(id),
  project_id UUID REFERENCES projects(id),
  title_en TEXT NOT NULL,
  title_ar TEXT NOT NULL,
  dependency_type TEXT NOT NULL DEFAULT 'external',
  owner_id UUID REFERENCES profiles(id),
  linked_milestone_id UUID REFERENCES milestones(id),
  impact_description TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed sample risk for Khamis project
INSERT INTO risks (
  id, legal_entity_id, control_scope_id, title_en, title_ar,
  probability_percent, financial_impact, schedule_impact_days,
  owner_id, status, quality_impact, mitigation_plan, contingency_plan,
  milestone_id, contingency_budget, escalation_level
) VALUES (
  '33333333-3333-3333-3333-333333333399',
  '11111111-1111-1111-1111-111111111102',
  '55555555-5555-5555-5555-555555555503',
  'Concrete supply disruption', 'اضطراب إمدادات الخرسانة',
  30, 500000, 21,
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6',
  'open', 'medium', 'Qualify alternate suppliers', 'Use contingency budget for expedited delivery',
  'ffffffff-ffff-ffff-ffff-ffffffffff01', 150000, 'project_manager'
) ON CONFLICT DO NOTHING;

INSERT INTO issues (
  id, legal_entity_id, control_scope_id, project_id, title_en, title_ar,
  severity, owner_id, linked_risk_id, status
) VALUES (
  '44444444-4444-4444-4444-444444444499',
  '11111111-1111-1111-1111-111111111102',
  '55555555-5555-5555-5555-555555555503',
  'cccccccc-cccc-cccc-cccc-ccccccccccc1',
  'Delayed rebar delivery', 'تأخر تسليم حديد التسليح',
  'high', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6',
  '33333333-3333-3333-3333-333333333399', 'open'
) ON CONFLICT DO NOTHING;

-- RLS
ALTER TABLE issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE register_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE register_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE risks ENABLE ROW LEVEL SECURITY;

CREATE POLICY risks_member_read ON risks
  FOR SELECT USING (legal_entity_id IN (SELECT user_legal_entity_ids()));

CREATE POLICY risks_insert ON risks
  FOR INSERT WITH CHECK (
    legal_entity_id IN (SELECT user_legal_entity_ids())
    AND (user_has_role('project_manager') OR user_has_role('cost_controller') OR user_has_role('system_administrator'))
    AND NOT user_has_role('auditor') AND NOT user_has_role('viewer')
  );

CREATE POLICY risks_update ON risks
  FOR UPDATE USING (
    legal_entity_id IN (SELECT user_legal_entity_ids())
    AND (user_has_role('project_manager') OR user_has_role('cost_controller') OR user_has_role('system_administrator'))
    AND NOT user_has_role('auditor') AND NOT user_has_role('viewer')
  );

CREATE POLICY issues_member_read ON issues
  FOR SELECT USING (legal_entity_id IN (SELECT user_legal_entity_ids()));

CREATE POLICY issues_insert ON issues
  FOR INSERT WITH CHECK (
    legal_entity_id IN (SELECT user_legal_entity_ids())
    AND NOT user_has_role('auditor') AND NOT user_has_role('viewer')
  );

CREATE POLICY register_actions_read ON register_actions
  FOR SELECT USING (legal_entity_id IN (SELECT user_legal_entity_ids()));

CREATE POLICY register_actions_insert ON register_actions
  FOR INSERT WITH CHECK (
    legal_entity_id IN (SELECT user_legal_entity_ids())
    AND NOT user_has_role('auditor') AND NOT user_has_role('viewer')
  );

CREATE POLICY decisions_read ON decisions
  FOR SELECT USING (legal_entity_id IN (SELECT user_legal_entity_ids()));

CREATE POLICY decisions_insert ON decisions
  FOR INSERT WITH CHECK (
    legal_entity_id IN (SELECT user_legal_entity_ids())
    AND NOT user_has_role('auditor') AND NOT user_has_role('viewer')
  );

CREATE POLICY register_dependencies_read ON register_dependencies
  FOR SELECT USING (legal_entity_id IN (SELECT user_legal_entity_ids()));

CREATE POLICY register_dependencies_insert ON register_dependencies
  FOR INSERT WITH CHECK (
    legal_entity_id IN (SELECT user_legal_entity_ids())
    AND NOT user_has_role('auditor') AND NOT user_has_role('viewer')
  );
