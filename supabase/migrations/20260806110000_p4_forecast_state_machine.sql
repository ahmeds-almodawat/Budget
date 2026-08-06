-- P4: Transactional forecast state machine (COD forecast control)

-- ---------------------------------------------------------------------------
-- Schema extensions
-- ---------------------------------------------------------------------------
ALTER TABLE public.forecast_versions
  ADD COLUMN IF NOT EXISTS fiscal_year_id UUID REFERENCES public.fiscal_years(id),
  ADD COLUMN IF NOT EXISTS version_label TEXT,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id),
  ADD COLUMN IF NOT EXISTS control_account_id UUID REFERENCES public.control_accounts(id),
  ADD COLUMN IF NOT EXISTS as_of_date DATE,
  ADD COLUMN IF NOT EXISTS superseded_from_id UUID REFERENCES public.forecast_versions(id),
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejected_by UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS row_version INTEGER NOT NULL DEFAULT 1;

UPDATE public.forecast_versions AS fv
SET version_label = COALESCE(fv.version_label, 'FC-' || to_char(fv.created_at, 'YYYYMMDD-HH24MISS'))
WHERE fv.version_label IS NULL;

ALTER TABLE public.forecast_versions
  ALTER COLUMN version_label SET NOT NULL;

ALTER TABLE public.forecast_lines
  ADD COLUMN IF NOT EXISTS organization_unit_id UUID REFERENCES public.organization_units(id),
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id),
  ADD COLUMN IF NOT EXISTS work_package_id UUID REFERENCES public.work_packages(id),
  ADD COLUMN IF NOT EXISTS quantity NUMERIC(18,4),
  ADD COLUMN IF NOT EXISTS unit_rate NUMERIC(18,4),
  ADD COLUMN IF NOT EXISTS assumption TEXT,
  ADD COLUMN IF NOT EXISTS forecast_to_complete NUMERIC(18,4),
  ADD COLUMN IF NOT EXISTS confidence TEXT;

DROP INDEX IF EXISTS idx_forecast_one_current_approved;

-- Uniqueness grain: legal_entity + control_scope + fiscal_year + scenario
-- + optional project + optional control_account (NULLs treated as zero UUID)
CREATE UNIQUE INDEX idx_forecast_one_current_approved
  ON public.forecast_versions (
    legal_entity_id,
    control_scope_id,
    fiscal_year_id,
    scenario,
    COALESCE(project_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(control_account_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  WHERE is_current_approved = true
    AND approval_status IN ('approved', 'locked', 'posted');

COMMENT ON INDEX idx_forecast_one_current_approved IS
  'One current approved forecast per legal_entity + control_scope + fiscal_year + scenario + project + control_account grain';

-- ---------------------------------------------------------------------------
-- Immutability: approved/superseded versions and non-draft lines
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.protect_locked_forecast_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.approval_status IN ('approved', 'locked', 'posted', 'superseded') THEN
    IF NEW.approval_status IS DISTINCT FROM OLD.approval_status THEN
      IF NOT (
        (OLD.approval_status IN ('approved', 'locked', 'posted') AND NEW.approval_status = 'superseded')
        OR (OLD.approval_status = 'approved' AND NEW.approval_status = 'locked')
      ) THEN
        RAISE EXCEPTION 'Approved forecast version cannot be modified';
      END IF;
    END IF;
    IF NEW.forecast_cost IS DISTINCT FROM OLD.forecast_cost
       OR NEW.version_label IS DISTINCT FROM OLD.version_label
       OR NEW.fiscal_year_id IS DISTINCT FROM OLD.fiscal_year_id
       OR NEW.control_scope_id IS DISTINCT FROM OLD.control_scope_id
       OR NEW.legal_entity_id IS DISTINCT FROM OLD.legal_entity_id
       OR NEW.scenario IS DISTINCT FROM OLD.scenario THEN
      RAISE EXCEPTION 'Approved forecast financial metadata is immutable';
    END IF;
  END IF;
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS trg_forecast_versions_immutable ON public.forecast_versions;
CREATE TRIGGER trg_forecast_versions_immutable
  BEFORE UPDATE ON public.forecast_versions
  FOR EACH ROW EXECUTE FUNCTION private.protect_locked_forecast_version();

CREATE OR REPLACE FUNCTION private.protect_immutable_forecast_line()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
  v_status public.approval_status;
BEGIN
  SELECT fv.approval_status INTO v_status
  FROM public.forecast_versions AS fv
  WHERE fv.id = COALESCE(NEW.forecast_version_id, OLD.forecast_version_id);
  IF v_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'Forecast lines are immutable after draft';
  END IF;
  RETURN COALESCE(NEW, OLD);
END
$function$;

DROP TRIGGER IF EXISTS trg_forecast_lines_immutable ON public.forecast_lines;
CREATE TRIGGER trg_forecast_lines_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON public.forecast_lines
  FOR EACH ROW EXECUTE FUNCTION private.protect_immutable_forecast_line();

-- ---------------------------------------------------------------------------
-- forecast_transition: draft->submitted->under_review->approved; reject/cancel
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.forecast_transition(
  p_forecast_version_id UUID,
  p_expected_status public.approval_status,
  p_next_status public.approval_status,
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
  v_cmd TEXT := 'forecast_transition_' || p_next_status::text;
  v_replay JSONB;
  v_row public.forecast_versions%ROWTYPE;
  v_total NUMERIC(18,4);
  v_result JSONB;
  v_allowed BOOLEAN;
BEGIN
  v_replay := private.command_check_idempotency(v_cmd, p_idempotency_key, v_actor);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

  IF v_actor IS NULL OR NOT private.current_user_is_active() THEN
    RETURN private.command_fail('UNAUTHENTICATED', 'Authentication required');
  END IF;

  SELECT * INTO v_row
  FROM public.forecast_versions AS fv
  WHERE fv.id = p_forecast_version_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN private.command_fail('NOT_FOUND', 'Forecast version not found');
  END IF;

  IF v_row.approval_status IS DISTINCT FROM p_expected_status THEN
    RETURN private.command_fail('STATE_MISMATCH',
      format('Expected status %s but found %s', p_expected_status, v_row.approval_status));
  END IF;

  IF NOT (
    (p_expected_status = 'draft' AND p_next_status IN ('submitted', 'cancelled'))
    OR (p_expected_status = 'submitted' AND p_next_status IN ('under_review', 'rejected', 'cancelled'))
    OR (p_expected_status = 'under_review' AND p_next_status IN ('approved', 'rejected', 'cancelled'))
    OR (p_expected_status = 'approved' AND p_next_status IN ('locked', 'superseded'))
    OR (p_expected_status = 'locked' AND p_next_status = 'superseded')
  ) THEN
    RETURN private.command_fail('INVALID_TRANSITION',
      format('Transition %s -> %s is not allowed', p_expected_status, p_next_status));
  END IF;

  IF p_next_status = 'submitted' THEN
    v_allowed := private.user_has_any_role(
      ARRAY['system_administrator','legal_entity_administrator','cost_controller','budget_owner','finance_user'],
      v_row.legal_entity_id, 'control_scope', v_row.control_scope_id);
    IF v_row.owner_id IS NOT NULL AND v_row.owner_id <> v_actor
       AND NOT private.user_has_any_role(
         ARRAY['system_administrator','legal_entity_administrator','cost_controller'],
         v_row.legal_entity_id, 'control_scope', v_row.control_scope_id) THEN
      RETURN private.command_fail('FORBIDDEN', 'Only forecast owner or controller may submit');
    END IF;
  ELSIF p_next_status = 'under_review' THEN
    v_allowed := private.user_has_any_role(
      ARRAY['system_administrator','legal_entity_administrator','cost_controller','finance_user','approver'],
      v_row.legal_entity_id, 'control_scope', v_row.control_scope_id);
  ELSIF p_next_status = 'approved' THEN
    v_allowed := private.user_has_any_role(
      ARRAY['system_administrator','legal_entity_administrator','cost_controller','approver'],
      v_row.legal_entity_id, 'control_scope', v_row.control_scope_id);
    IF v_row.submitted_by = v_actor THEN
      RETURN private.command_fail('SOD_VIOLATION', 'Submitter cannot approve forecast');
    END IF;
  ELSIF p_next_status IN ('rejected', 'cancelled') THEN
    v_allowed := private.user_has_any_role(
      ARRAY['system_administrator','legal_entity_administrator','cost_controller','approver','finance_user'],
      v_row.legal_entity_id, 'control_scope', v_row.control_scope_id);
  ELSE
    v_allowed := private.user_has_any_role(
      ARRAY['system_administrator','legal_entity_administrator','cost_controller'],
      v_row.legal_entity_id, 'control_scope', v_row.control_scope_id);
  END IF;

  IF NOT v_allowed THEN
    RETURN private.command_fail('FORBIDDEN', 'Insufficient role for forecast transition');
  END IF;

  IF p_next_status = 'approved' THEN
    SELECT COALESCE(SUM(fl.forecast_amount), 0) INTO v_total
    FROM public.forecast_lines AS fl WHERE fl.forecast_version_id = p_forecast_version_id;
    IF ABS(v_total - v_row.forecast_cost) > 0.01 AND v_row.forecast_cost > 0 THEN
      RETURN private.command_fail('RECONCILIATION',
        format('Header forecast_cost %s does not match line total %s', v_row.forecast_cost, v_total));
    END IF;
  END IF;

  IF p_next_status IN ('approved', 'locked') THEN
    UPDATE public.forecast_versions AS fv
    SET is_current_approved = false
    WHERE fv.legal_entity_id = v_row.legal_entity_id
      AND fv.control_scope_id IS NOT DISTINCT FROM v_row.control_scope_id
      AND fv.fiscal_year_id IS NOT DISTINCT FROM v_row.fiscal_year_id
      AND fv.scenario = v_row.scenario
      AND COALESCE(fv.project_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = COALESCE(v_row.project_id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND COALESCE(fv.control_account_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = COALESCE(v_row.control_account_id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND fv.id <> p_forecast_version_id
      AND fv.is_current_approved = true;
  END IF;

  UPDATE public.forecast_versions AS fv SET
    approval_status = p_next_status,
    submitted_at = CASE WHEN p_next_status = 'submitted' THEN NOW() ELSE fv.submitted_at END,
    submitted_by = CASE WHEN p_next_status = 'submitted' THEN v_actor ELSE fv.submitted_by END,
    reviewed_at = CASE WHEN p_next_status = 'under_review' THEN NOW() ELSE fv.reviewed_at END,
    reviewed_by = CASE WHEN p_next_status = 'under_review' THEN v_actor ELSE fv.reviewed_by END,
    approved_at = CASE WHEN p_next_status = 'approved' THEN NOW() ELSE fv.approved_at END,
    approved_by = CASE WHEN p_next_status = 'approved' THEN v_actor ELSE fv.approved_by END,
    locked_at = CASE WHEN p_next_status IN ('approved', 'locked') THEN NOW() ELSE fv.locked_at END,
    rejected_at = CASE WHEN p_next_status = 'rejected' THEN NOW() ELSE fv.rejected_at END,
    rejected_by = CASE WHEN p_next_status = 'rejected' THEN v_actor ELSE fv.rejected_by END,
    cancelled_at = CASE WHEN p_next_status = 'cancelled' THEN NOW() ELSE fv.cancelled_at END,
    cancelled_by = CASE WHEN p_next_status = 'cancelled' THEN v_actor ELSE fv.cancelled_by END,
    is_current_approved = CASE WHEN p_next_status IN ('approved', 'locked') THEN true ELSE fv.is_current_approved END,
    forecast_cost = CASE WHEN p_next_status = 'approved' AND v_total > 0 THEN v_total ELSE fv.forecast_cost END,
    row_version = fv.row_version + 1
  WHERE fv.id = p_forecast_version_id
  RETURNING * INTO v_row;

  PERFORM private.write_audit_event(
    v_actor, 'approve', 'forecast_version', p_forecast_version_id,
    v_row.legal_entity_id, v_row.control_scope_id, v_row.project_id,
    p_correlation_id, p_idempotency_key,
    jsonb_build_object('approval_status', p_expected_status),
    jsonb_build_object('approval_status', p_next_status, 'forecast_cost', v_row.forecast_cost),
    NULL, NULL
  );

  v_result := private.command_ok(jsonb_build_object(
    'entity_id', p_forecast_version_id,
    'approval_status', p_next_status,
    'forecast_cost', v_row.forecast_cost,
    'row_version', v_row.row_version
  ));
  PERFORM private.command_store_idempotency(v_cmd, p_idempotency_key, v_actor, v_result);
  RETURN v_result;
END
$function$;

-- Create draft with lines atomically
CREATE OR REPLACE FUNCTION private.forecast_create_draft(
  p_legal_entity_id UUID,
  p_control_scope_id UUID,
  p_fiscal_year_id UUID,
  p_version_label TEXT,
  p_scenario TEXT DEFAULT 'latest',
  p_effective_date DATE DEFAULT CURRENT_DATE,
  p_as_of_date DATE DEFAULT CURRENT_DATE,
  p_project_id UUID DEFAULT NULL,
  p_control_account_id UUID DEFAULT NULL,
  p_assumptions TEXT DEFAULT NULL,
  p_lines JSONB DEFAULT '[]'::jsonb,
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
  v_cmd TEXT := 'forecast_create_draft';
  v_replay JSONB;
  v_version_id UUID;
  v_line JSONB;
  v_total NUMERIC(18,4) := 0;
  v_result JSONB;
BEGIN
  v_replay := private.command_check_idempotency(v_cmd, p_idempotency_key, v_actor);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

  IF v_actor IS NULL OR NOT private.current_user_is_active() THEN
    RETURN private.command_fail('UNAUTHENTICATED', 'Authentication required');
  END IF;

  IF NOT private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator','cost_controller','budget_owner','finance_user'],
    p_legal_entity_id, 'control_scope', p_control_scope_id) THEN
    RETURN private.command_fail('FORBIDDEN', 'Insufficient role to create forecast');
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_total := v_total + COALESCE((v_line->>'forecast_amount')::numeric, 0);
  END LOOP;

  INSERT INTO public.forecast_versions (
    legal_entity_id, control_scope_id, fiscal_year_id, version_label, scenario,
    effective_date, as_of_date, project_id, control_account_id, assumptions,
    approval_status, forecast_cost, owner_id, created_by
  ) VALUES (
    p_legal_entity_id, p_control_scope_id, p_fiscal_year_id, p_version_label, p_scenario,
    p_effective_date, p_as_of_date, p_project_id, p_control_account_id, p_assumptions,
    'draft', v_total, v_actor, v_actor
  ) RETURNING id INTO v_version_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    INSERT INTO public.forecast_lines (
      forecast_version_id, organization_unit_id, cost_node_id, fiscal_period_id,
      control_account_id, project_id, work_package_id,
      forecast_amount, quantity, unit_rate, assumption, forecast_to_complete, confidence
    ) VALUES (
      v_version_id,
      NULLIF(v_line->>'organization_unit_id', '')::uuid,
      NULLIF(v_line->>'cost_node_id', '')::uuid,
      NULLIF(v_line->>'fiscal_period_id', '')::uuid,
      NULLIF(v_line->>'control_account_id', '')::uuid,
      NULLIF(v_line->>'project_id', '')::uuid,
      NULLIF(v_line->>'work_package_id', '')::uuid,
      COALESCE((v_line->>'forecast_amount')::numeric, 0),
      NULLIF(v_line->>'quantity', '')::numeric,
      NULLIF(v_line->>'unit_rate', '')::numeric,
      v_line->>'assumption',
      NULLIF(v_line->>'forecast_to_complete', '')::numeric,
      v_line->>'confidence'
    );
  END LOOP;

  PERFORM private.write_audit_event(
    v_actor, 'create', 'forecast_version', v_version_id,
    p_legal_entity_id, p_control_scope_id, p_project_id,
    p_correlation_id, p_idempotency_key,
    NULL,
    jsonb_build_object('version_label', p_version_label, 'forecast_cost', v_total),
    NULL, NULL
  );

  v_result := private.command_ok(jsonb_build_object(
    'entity_id', v_version_id,
    'forecast_cost', v_total
  ));
  PERFORM private.command_store_idempotency(v_cmd, p_idempotency_key, v_actor, v_result);
  RETURN v_result;
END
$function$;

-- Update draft lines (replace all lines)
CREATE OR REPLACE FUNCTION private.forecast_update_draft(
  p_forecast_version_id UUID,
  p_expected_row_version INTEGER,
  p_version_label TEXT DEFAULT NULL,
  p_assumptions TEXT DEFAULT NULL,
  p_lines JSONB DEFAULT NULL,
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
  v_cmd TEXT := 'forecast_update_draft';
  v_replay JSONB;
  v_row public.forecast_versions%ROWTYPE;
  v_line JSONB;
  v_total NUMERIC(18,4) := 0;
  v_result JSONB;
BEGIN
  v_replay := private.command_check_idempotency(v_cmd, p_idempotency_key, v_actor);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

  IF v_actor IS NULL OR NOT private.current_user_is_active() THEN
    RETURN private.command_fail('UNAUTHENTICATED', 'Authentication required');
  END IF;

  SELECT * INTO v_row FROM public.forecast_versions AS fv
  WHERE fv.id = p_forecast_version_id FOR UPDATE;

  IF NOT FOUND THEN RETURN private.command_fail('NOT_FOUND', 'Forecast version not found'); END IF;
  IF v_row.approval_status <> 'draft' THEN
    RETURN private.command_fail('INVALID_STATE', 'Only draft forecasts can be edited');
  END IF;
  IF v_row.row_version IS DISTINCT FROM p_expected_row_version THEN
    RETURN private.command_fail('STATE_MISMATCH', 'Forecast version was modified by another session');
  END IF;

  IF v_row.owner_id IS NOT NULL AND v_row.owner_id <> v_actor
     AND NOT private.user_has_any_role(
       ARRAY['system_administrator','legal_entity_administrator','cost_controller'],
       v_row.legal_entity_id, 'control_scope', v_row.control_scope_id) THEN
    RETURN private.command_fail('FORBIDDEN', 'Only forecast owner may edit draft');
  END IF;

  IF p_lines IS NOT NULL THEN
    EXECUTE 'DELETE' || ' FROM public.forecast_lines AS fl WHERE fl.forecast_version_id = $1'
      USING p_forecast_version_id;
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
    LOOP
      v_total := v_total + COALESCE((v_line->>'forecast_amount')::numeric, 0);
      INSERT INTO public.forecast_lines (
        forecast_version_id, organization_unit_id, cost_node_id, fiscal_period_id,
        control_account_id, project_id, work_package_id,
        forecast_amount, quantity, unit_rate, assumption, forecast_to_complete, confidence
      ) VALUES (
        p_forecast_version_id,
        NULLIF(v_line->>'organization_unit_id', '')::uuid,
        NULLIF(v_line->>'cost_node_id', '')::uuid,
        NULLIF(v_line->>'fiscal_period_id', '')::uuid,
        NULLIF(v_line->>'control_account_id', '')::uuid,
        NULLIF(v_line->>'project_id', '')::uuid,
        NULLIF(v_line->>'work_package_id', '')::uuid,
        COALESCE((v_line->>'forecast_amount')::numeric, 0),
        NULLIF(v_line->>'quantity', '')::numeric,
        NULLIF(v_line->>'unit_rate', '')::numeric,
        v_line->>'assumption',
        NULLIF(v_line->>'forecast_to_complete', '')::numeric,
        v_line->>'confidence'
      );
    END LOOP;
  ELSE
    SELECT COALESCE(SUM(fl.forecast_amount), 0) INTO v_total
    FROM public.forecast_lines AS fl WHERE fl.forecast_version_id = p_forecast_version_id;
  END IF;

  UPDATE public.forecast_versions AS fv SET
    version_label = COALESCE(p_version_label, fv.version_label),
    assumptions = COALESCE(p_assumptions, fv.assumptions),
    forecast_cost = v_total,
    row_version = fv.row_version + 1
  WHERE fv.id = p_forecast_version_id
  RETURNING * INTO v_row;

  PERFORM private.write_audit_event(
    v_actor, 'update', 'forecast_version', p_forecast_version_id,
    v_row.legal_entity_id, v_row.control_scope_id, v_row.project_id,
    p_correlation_id, p_idempotency_key,
    NULL,
    jsonb_build_object('forecast_cost', v_total, 'row_version', v_row.row_version),
    NULL, NULL
  );

  v_result := private.command_ok(jsonb_build_object(
    'entity_id', p_forecast_version_id,
    'forecast_cost', v_total,
    'row_version', v_row.row_version
  ));
  PERFORM private.command_store_idempotency(v_cmd, p_idempotency_key, v_actor, v_result);
  RETURN v_result;
END
$function$;

-- Approve and lock in one step (under_review -> approved)
CREATE OR REPLACE FUNCTION private.forecast_approve_and_lock(
  p_forecast_version_id UUID,
  p_expected_status public.approval_status DEFAULT 'under_review',
  p_idempotency_key TEXT DEFAULT NULL,
  p_correlation_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_step JSONB;
BEGIN
  v_step := private.forecast_transition(p_forecast_version_id, p_expected_status, 'approved', p_idempotency_key, p_correlation_id);
  IF NOT (v_step->>'ok')::boolean THEN RETURN v_step; END IF;
  RETURN private.forecast_transition(p_forecast_version_id, 'approved', 'locked', p_idempotency_key, p_correlation_id);
END
$function$;

-- Public RPC wrappers
CREATE OR REPLACE FUNCTION public.rpc_forecast_create_draft(
  p_legal_entity_id UUID, p_control_scope_id UUID, p_fiscal_year_id UUID,
  p_version_label TEXT, p_scenario TEXT DEFAULT 'latest',
  p_effective_date DATE DEFAULT CURRENT_DATE, p_as_of_date DATE DEFAULT CURRENT_DATE,
  p_project_id UUID DEFAULT NULL, p_control_account_id UUID DEFAULT NULL,
  p_assumptions TEXT DEFAULT NULL, p_lines JSONB DEFAULT '[]'::jsonb,
  p_idempotency_key TEXT DEFAULT NULL, p_correlation_id UUID DEFAULT NULL
) RETURNS JSONB LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.forecast_create_draft(p_legal_entity_id, p_control_scope_id, p_fiscal_year_id,
    p_version_label, p_scenario, p_effective_date, p_as_of_date, p_project_id, p_control_account_id,
    p_assumptions, p_lines, p_idempotency_key, p_correlation_id);
$$;

CREATE OR REPLACE FUNCTION public.rpc_forecast_update_draft(
  p_forecast_version_id UUID, p_expected_row_version INTEGER,
  p_version_label TEXT DEFAULT NULL, p_assumptions TEXT DEFAULT NULL,
  p_lines JSONB DEFAULT NULL, p_idempotency_key TEXT DEFAULT NULL,
  p_correlation_id UUID DEFAULT NULL
) RETURNS JSONB LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.forecast_update_draft(p_forecast_version_id, p_expected_row_version,
    p_version_label, p_assumptions, p_lines, p_idempotency_key, p_correlation_id);
$$;

CREATE OR REPLACE FUNCTION public.rpc_forecast_submit(
  p_forecast_version_id UUID, p_expected_status public.approval_status DEFAULT 'draft',
  p_idempotency_key TEXT DEFAULT NULL, p_correlation_id UUID DEFAULT NULL
) RETURNS JSONB LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.forecast_transition(p_forecast_version_id, p_expected_status, 'submitted', p_idempotency_key, p_correlation_id);
$$;

CREATE OR REPLACE FUNCTION public.rpc_forecast_start_review(
  p_forecast_version_id UUID, p_expected_status public.approval_status DEFAULT 'submitted',
  p_idempotency_key TEXT DEFAULT NULL, p_correlation_id UUID DEFAULT NULL
) RETURNS JSONB LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.forecast_transition(p_forecast_version_id, p_expected_status, 'under_review', p_idempotency_key, p_correlation_id);
$$;

CREATE OR REPLACE FUNCTION public.rpc_forecast_reject(
  p_forecast_version_id UUID, p_expected_status public.approval_status DEFAULT 'under_review',
  p_idempotency_key TEXT DEFAULT NULL, p_correlation_id UUID DEFAULT NULL
) RETURNS JSONB LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.forecast_transition(p_forecast_version_id, p_expected_status, 'rejected', p_idempotency_key, p_correlation_id);
$$;

CREATE OR REPLACE FUNCTION public.rpc_forecast_cancel(
  p_forecast_version_id UUID, p_expected_status public.approval_status DEFAULT 'draft',
  p_idempotency_key TEXT DEFAULT NULL, p_correlation_id UUID DEFAULT NULL
) RETURNS JSONB LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.forecast_transition(p_forecast_version_id, p_expected_status, 'cancelled', p_idempotency_key, p_correlation_id);
$$;

CREATE OR REPLACE FUNCTION public.rpc_forecast_approve_and_lock(
  p_forecast_version_id UUID, p_expected_status public.approval_status DEFAULT 'under_review',
  p_idempotency_key TEXT DEFAULT NULL, p_correlation_id UUID DEFAULT NULL
) RETURNS JSONB LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.forecast_approve_and_lock(p_forecast_version_id, p_expected_status, p_idempotency_key, p_correlation_id);
$$;

CREATE OR REPLACE FUNCTION public.rpc_forecast_supersede(
  p_forecast_version_id UUID, p_expected_status public.approval_status DEFAULT 'locked',
  p_idempotency_key TEXT DEFAULT NULL, p_correlation_id UUID DEFAULT NULL
) RETURNS JSONB LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.forecast_transition(p_forecast_version_id, p_expected_status, 'superseded', p_idempotency_key, p_correlation_id);
$$;

REVOKE ALL ON FUNCTION public.rpc_forecast_create_draft(UUID, UUID, UUID, TEXT, TEXT, DATE, DATE, UUID, UUID, TEXT, JSONB, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_forecast_update_draft(UUID, INTEGER, TEXT, TEXT, JSONB, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_forecast_submit(UUID, public.approval_status, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_forecast_start_review(UUID, public.approval_status, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_forecast_reject(UUID, public.approval_status, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_forecast_cancel(UUID, public.approval_status, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_forecast_approve_and_lock(UUID, public.approval_status, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_forecast_supersede(UUID, public.approval_status, TEXT, UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.rpc_forecast_create_draft(UUID, UUID, UUID, TEXT, TEXT, DATE, DATE, UUID, UUID, TEXT, JSONB, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_forecast_update_draft(UUID, INTEGER, TEXT, TEXT, JSONB, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_forecast_submit(UUID, public.approval_status, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_forecast_start_review(UUID, public.approval_status, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_forecast_reject(UUID, public.approval_status, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_forecast_cancel(UUID, public.approval_status, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_forecast_approve_and_lock(UUID, public.approval_status, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_forecast_supersede(UUID, public.approval_status, TEXT, UUID) TO authenticated;

REVOKE ALL ON FUNCTION private.forecast_transition(UUID, public.approval_status, public.approval_status, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.forecast_create_draft(UUID, UUID, UUID, TEXT, TEXT, DATE, DATE, UUID, UUID, TEXT, JSONB, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.forecast_update_draft(UUID, INTEGER, TEXT, TEXT, JSONB, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.forecast_approve_and_lock(UUID, public.approval_status, TEXT, UUID) FROM PUBLIC;
