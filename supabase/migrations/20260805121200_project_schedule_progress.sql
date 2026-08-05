-- Phase 1: Project schedule, progress submission, and verification

CREATE TYPE delay_reason_class AS ENUM (
  'weather', 'owner_delay', 'design_change', 'resource_shortage', 'permit', 'force_majeure', 'other'
);

-- Schedule delay and revision fields on projects
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS gross_delay_days INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS excusable_delay_days INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_delay_days INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delay_reason_class delay_reason_class;

-- Phase revision dates and delay fields
ALTER TABLE project_phases
  ADD COLUMN IF NOT EXISTS approved_revised_start DATE,
  ADD COLUMN IF NOT EXISTS approved_revised_end DATE,
  ADD COLUMN IF NOT EXISTS gross_delay_days INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS excusable_delay_days INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_delay_days INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delay_reason_class delay_reason_class;

-- Task revision dates and delay fields
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS approved_revised_start DATE,
  ADD COLUMN IF NOT EXISTS approved_revised_end DATE,
  ADD COLUMN IF NOT EXISTS gross_delay_days INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS excusable_delay_days INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_delay_days INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delay_reason_class delay_reason_class;

-- Milestone delay fields
ALTER TABLE milestones
  ADD COLUMN IF NOT EXISTS gross_delay_days INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS excusable_delay_days INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_delay_days INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delay_reason_class delay_reason_class;

-- Progress evidence attachments
CREATE TABLE progress_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  progress_update_id UUID NOT NULL REFERENCES milestone_progress_updates(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT,
  description TEXT,
  uploaded_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Extend schedule change requests
ALTER TABLE schedule_change_requests
  ADD COLUMN IF NOT EXISTS entity_type TEXT NOT NULL DEFAULT 'project',
  ADD COLUMN IF NOT EXISTS entity_id UUID,
  ADD COLUMN IF NOT EXISTS gross_delay_days INTEGER,
  ADD COLUMN IF NOT EXISTS excusable_delay_days INTEGER,
  ADD COLUMN IF NOT EXISTS net_delay_days INTEGER,
  ADD COLUMN IF NOT EXISTS delay_reason_class delay_reason_class;

-- Milestone baseline date immutability
CREATE OR REPLACE FUNCTION protect_milestone_baseline()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.baseline_date IS NOT NULL AND NEW.baseline_date IS DISTINCT FROM OLD.baseline_date THEN
    RAISE EXCEPTION 'Original milestone baseline date cannot be overwritten';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_milestones_protect_baseline
  BEFORE UPDATE ON milestones
  FOR EACH ROW EXECUTE FUNCTION protect_milestone_baseline();

-- Phase baseline immutability
CREATE OR REPLACE FUNCTION protect_phase_baseline()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.baseline_start IS NOT NULL AND NEW.baseline_start IS DISTINCT FROM OLD.baseline_start THEN
    RAISE EXCEPTION 'Original phase baseline start cannot be overwritten';
  END IF;
  IF OLD.baseline_end IS NOT NULL AND NEW.baseline_end IS DISTINCT FROM OLD.baseline_end THEN
    RAISE EXCEPTION 'Original phase baseline end cannot be overwritten';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_phases_protect_baseline
  BEFORE UPDATE ON project_phases
  FOR EACH ROW EXECUTE FUNCTION protect_phase_baseline();

-- Task baseline immutability
CREATE OR REPLACE FUNCTION protect_task_baseline()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.baseline_start IS NOT NULL AND NEW.baseline_start IS DISTINCT FROM OLD.baseline_start THEN
    RAISE EXCEPTION 'Original task baseline start cannot be overwritten';
  END IF;
  IF OLD.baseline_end IS NOT NULL AND NEW.baseline_end IS DISTINCT FROM OLD.baseline_end THEN
    RAISE EXCEPTION 'Original task baseline end cannot be overwritten';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tasks_protect_baseline
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION protect_task_baseline();

-- Employee seed user for progress submission tests
INSERT INTO roles (code, name_en, name_ar, is_read_only)
VALUES ('employee', 'Employee', 'موظف', false)
ON CONFLICT (code) DO NOTHING;

DO $$
DECLARE
  employee_id UUID := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa7';
  pm_id UUID := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6';
  encrypted_pw TEXT := crypt('Password123!', gen_salt('bf'));
BEGIN
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  )
  VALUES (
    employee_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'employee@modawat.local', encrypted_pw, NOW(), '', '', '', '',
    '{"provider":"email","providers":["email"]}', '{}', NOW(), NOW()
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  VALUES (
    employee_id, employee_id, 'employee@modawat.local',
    jsonb_build_object('sub', employee_id::text, 'email', 'employee@modawat.local'),
    'email', NOW(), NOW(), NOW()
  )
  ON CONFLICT DO NOTHING;

  INSERT INTO profiles (id, email, full_name_en, full_name_ar)
  VALUES (employee_id, 'employee@modawat.local', 'Employee User', 'موظف')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO memberships (user_id, organization_id, legal_entity_id, status)
  VALUES (employee_id, '11111111-1111-1111-1111-111111111101', '11111111-1111-1111-1111-111111111102', 'active')
  ON CONFLICT DO NOTHING;

  INSERT INTO role_assignments (user_id, role_id, scope_type, scope_id)
  SELECT employee_id, r.id, 'legal_entity', '11111111-1111-1111-1111-111111111102'
  FROM roles r WHERE r.code = 'employee'
  ON CONFLICT DO NOTHING;
END $$;

-- Khamis Mushait project seed (tasks and milestone steps)
INSERT INTO projects (
  id, control_scope_id, primary_location_id, responsible_department_id,
  project_manager_id, baseline_start, baseline_end, forecast_start, forecast_end,
  scope_description
) VALUES (
  'cccccccc-cccc-cccc-cccc-ccccccccccc1',
  '55555555-5555-5555-5555-555555555503',
  '33333333-3333-3333-3333-333333333306',
  '33333333-3333-3333-3333-333333333306',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6',
  '2027-01-01', '2028-06-30', '2027-01-15', '2028-09-30',
  'Khamis Mushait New Hospital Building'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO project_phases (
  id, project_id, code, name_en, name_ar, sequence_no, baseline_start, baseline_end
) VALUES (
  'dddddddd-dddd-dddd-dddd-dddddddddd01',
  'cccccccc-cccc-cccc-cccc-ccccccccccc1',
  'STRUCT', 'Structural Works', 'الأعمال الإنشائية', 3,
  '2027-04-01', '2027-12-31'
) ON CONFLICT (project_id, code) DO NOTHING;

INSERT INTO work_packages (
  id, phase_id, code, name_en, name_ar, responsible_team_id
) VALUES (
  'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee01',
  'dddddddd-dddd-dddd-dddd-dddddddddd01',
  'FOUND', 'Foundation Works', 'أعمال الأساسات',
  '99999999-9999-9999-9999-999999999901'
) ON CONFLICT (phase_id, code) DO NOTHING;

INSERT INTO milestones (
  id, project_id, phase_id, work_package_id, code, name_en, name_ar,
  responsible_team_id, baseline_date, forecast_date, approved_progress, reported_progress,
  progress_method, approval_status
) VALUES (
  'ffffffff-ffff-ffff-ffff-ffffffffff01',
  'cccccccc-cccc-cccc-cccc-ccccccccccc1',
  'dddddddd-dddd-dddd-dddd-dddddddddd01',
  'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee01',
  'MS-FOUNDATION', 'Foundation Completed and Approved', 'اكتمال واعتماد الأساسات',
  '99999999-9999-9999-9999-999999999901',
  '2027-08-30', '2027-09-15', 65, 65, 'weighted_steps', 'approved'
) ON CONFLICT (project_id, code) DO NOTHING;

INSERT INTO milestone_steps (id, milestone_id, name_en, name_ar, weight_percent, sequence_no, completed)
VALUES
  ('11111111-1111-1111-1111-111111111101', 'ffffffff-ffff-ffff-ffff-ffffffffff01', 'Excavation', 'الحفر', 20, 1, true),
  ('11111111-1111-1111-1111-111111111102', 'ffffffff-ffff-ffff-ffff-ffffffffff01', 'Rebar Installation', 'تركيب الحديد', 30, 2, true),
  ('11111111-1111-1111-1111-111111111103', 'ffffffff-ffff-ffff-ffff-ffffffffff01', 'Concrete Pour', 'صب الخرسانة', 30, 3, false),
  ('11111111-1111-1111-1111-111111111104', 'ffffffff-ffff-ffff-ffff-ffffffffff01', 'Curing & Inspection', 'المعالجة والفحص', 20, 4, false)
ON CONFLICT DO NOTHING;

INSERT INTO tasks (id, work_package_id, code, name_en, name_ar, assigned_to, baseline_start, baseline_end, progress_percent, status)
VALUES
  ('22222222-2222-2222-2222-222222222201', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee01', 'EXCAV', 'Site Excavation', 'حفر الموقع', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa7', '2027-04-01', '2027-05-15', 100, 'completed'),
  ('22222222-2222-2222-2222-222222222202', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee01', 'REBAR', 'Rebar Installation', 'تركيب الحديد', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa7', '2027-05-16', '2027-07-01', 80, 'in_progress'),
  ('22222222-2222-2222-2222-222222222203', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee01', 'POUR', 'Concrete Pour', 'صب الخرسانة', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa7', '2027-07-02', '2027-08-15', 0, 'not_started')
ON CONFLICT (work_package_id, code) DO NOTHING;

-- RLS for progress tables
ALTER TABLE milestone_progress_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE milestone_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE progress_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_change_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY milestone_progress_read ON milestone_progress_updates
  FOR SELECT USING (
    milestone_id IN (
      SELECT m.id FROM milestones m
      JOIN projects p ON p.id = m.project_id
      JOIN control_scopes cs ON cs.id = p.control_scope_id
      WHERE cs.legal_entity_id IN (SELECT user_legal_entity_ids())
    )
  );

CREATE POLICY milestone_progress_insert ON milestone_progress_updates
  FOR INSERT WITH CHECK (
    reported_by = auth.uid()
    AND milestone_id IN (
      SELECT m.id FROM milestones m
      JOIN projects p ON p.id = m.project_id
      JOIN control_scopes cs ON cs.id = p.control_scope_id
      WHERE cs.legal_entity_id IN (SELECT user_legal_entity_ids())
    )
    AND (
      user_has_role('employee') OR user_has_role('project_manager')
      OR user_has_role('milestone_owner') OR user_has_role('system_administrator')
    )
    AND NOT user_has_role('auditor') AND NOT user_has_role('viewer')
  );

CREATE POLICY milestone_progress_update ON milestone_progress_updates
  FOR UPDATE USING (
    milestone_id IN (
      SELECT m.id FROM milestones m
      JOIN projects p ON p.id = m.project_id
      JOIN control_scopes cs ON cs.id = p.control_scope_id
      WHERE cs.legal_entity_id IN (SELECT user_legal_entity_ids())
    )
    AND (
      user_has_role('approver') OR user_has_role('project_manager')
      OR user_has_role('system_administrator')
    )
    AND NOT user_has_role('auditor') AND NOT user_has_role('viewer')
  );

CREATE POLICY milestone_steps_read ON milestone_steps
  FOR SELECT USING (
    milestone_id IN (
      SELECT m.id FROM milestones m
      JOIN projects p ON p.id = m.project_id
      JOIN control_scopes cs ON cs.id = p.control_scope_id
      WHERE cs.legal_entity_id IN (SELECT user_legal_entity_ids())
    )
  );

CREATE POLICY tasks_member_read ON tasks
  FOR SELECT USING (
    work_package_id IN (
      SELECT wp.id FROM work_packages wp
      JOIN project_phases pp ON pp.id = wp.phase_id
      JOIN projects p ON p.id = pp.project_id
      JOIN control_scopes cs ON cs.id = p.control_scope_id
      WHERE cs.legal_entity_id IN (SELECT user_legal_entity_ids())
    )
  );

CREATE POLICY phases_member_read ON project_phases
  FOR SELECT USING (
    project_id IN (
      SELECT p.id FROM projects p
      JOIN control_scopes cs ON cs.id = p.control_scope_id
      WHERE cs.legal_entity_id IN (SELECT user_legal_entity_ids())
    )
  );

CREATE POLICY progress_evidence_read ON progress_evidence
  FOR SELECT USING (
    progress_update_id IN (
      SELECT mpu.id FROM milestone_progress_updates mpu
      JOIN milestones m ON m.id = mpu.milestone_id
      JOIN projects p ON p.id = m.project_id
      JOIN control_scopes cs ON cs.id = p.control_scope_id
      WHERE cs.legal_entity_id IN (SELECT user_legal_entity_ids())
    )
  );

CREATE POLICY progress_evidence_insert ON progress_evidence
  FOR INSERT WITH CHECK (
    uploaded_by = auth.uid()
    AND progress_update_id IN (
      SELECT mpu.id FROM milestone_progress_updates mpu
      WHERE mpu.reported_by = auth.uid()
    )
  );

CREATE POLICY schedule_changes_read ON schedule_change_requests
  FOR SELECT USING (
    project_id IN (
      SELECT p.id FROM projects p
      JOIN control_scopes cs ON cs.id = p.control_scope_id
      WHERE cs.legal_entity_id IN (SELECT user_legal_entity_ids())
    )
  );

CREATE POLICY schedule_changes_insert ON schedule_change_requests
  FOR INSERT WITH CHECK (
    requester_id = auth.uid()
    AND project_id IN (
      SELECT p.id FROM projects p
      JOIN control_scopes cs ON cs.id = p.control_scope_id
      WHERE cs.legal_entity_id IN (SELECT user_legal_entity_ids())
    )
    AND (
      user_has_role('project_manager') OR user_has_role('employee')
      OR user_has_role('system_administrator')
    )
    AND NOT user_has_role('auditor') AND NOT user_has_role('viewer')
  );

CREATE POLICY schedule_changes_update ON schedule_change_requests
  FOR UPDATE USING (
    project_id IN (
      SELECT p.id FROM projects p
      JOIN control_scopes cs ON cs.id = p.control_scope_id
      WHERE cs.legal_entity_id IN (SELECT user_legal_entity_ids())
    )
    AND (
      user_has_role('approver') OR user_has_role('project_manager')
      OR user_has_role('system_administrator')
    )
    AND NOT user_has_role('auditor') AND NOT user_has_role('viewer')
  );

CREATE POLICY milestones_update ON milestones
  FOR UPDATE USING (
    project_id IN (
      SELECT p.id FROM projects p
      JOIN control_scopes cs ON cs.id = p.control_scope_id
      WHERE cs.legal_entity_id IN (SELECT user_legal_entity_ids())
    )
    AND (
      user_has_role('approver') OR user_has_role('project_manager')
      OR user_has_role('employee') OR user_has_role('milestone_owner')
      OR user_has_role('system_administrator')
    )
    AND NOT user_has_role('auditor') AND NOT user_has_role('viewer')
  );
