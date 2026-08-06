-- P2 Phase 8-9: Progress, schedule transactions, baseline versions (COD-H-012, COD-M-006)

ALTER TABLE public.milestone_progress_updates
  DROP CONSTRAINT IF EXISTS chk_reported_progress_range;
ALTER TABLE public.milestone_progress_updates
  ADD CONSTRAINT chk_reported_progress_range CHECK (reported_progress >= 0 AND reported_progress <= 100);
ALTER TABLE public.milestone_progress_updates
  DROP CONSTRAINT IF EXISTS chk_verified_progress_range;
ALTER TABLE public.milestone_progress_updates
  ADD CONSTRAINT chk_verified_progress_range CHECK (
    verified_progress IS NULL OR (verified_progress >= 0 AND verified_progress <= 100)
  );

CREATE TABLE IF NOT EXISTS public.schedule_baseline_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id),
  version_number INTEGER NOT NULL,
  baseline_start DATE,
  baseline_end DATE,
  approved_revised_end DATE,
  schedule_change_request_id UUID REFERENCES public.schedule_change_requests(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES public.profiles(id),
  UNIQUE (project_id, version_number)
);

COMMENT ON TABLE public.schedule_baseline_versions IS '@classification data_api_exposed; authenticated only; RLS mandatory';
ALTER TABLE public.schedule_baseline_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_baseline_versions FORCE ROW LEVEL SECURITY;

CREATE POLICY schedule_baseline_select_member ON public.schedule_baseline_versions
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.projects AS p
    JOIN public.control_scopes AS cs ON cs.id = p.control_scope_id
    WHERE p.id = schedule_baseline_versions.project_id
      AND private.user_can_access_legal_entity(cs.legal_entity_id)
  ));
GRANT SELECT ON TABLE public.schedule_baseline_versions TO authenticated;

CREATE OR REPLACE FUNCTION private.submit_progress(
  p_milestone_id UUID,
  p_reported_progress NUMERIC,
  p_notes TEXT DEFAULT NULL,
  p_evidence_description TEXT DEFAULT NULL,
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
  v_cmd TEXT := 'submit_progress';
  v_replay JSONB;
  v_project_id UUID;
  v_entity UUID;
  v_scope UUID;
  v_update_id UUID;
  v_result JSONB;
BEGIN
  v_replay := private.command_check_idempotency(v_cmd, p_idempotency_key, v_actor);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF p_reported_progress < 0 OR p_reported_progress > 100 THEN
    RETURN private.command_fail('VALIDATION', 'Progress must be between 0 and 100');
  END IF;

  SELECT m.project_id, cs.legal_entity_id, cs.id
  INTO v_project_id, v_entity, v_scope
  FROM public.milestones AS m
  JOIN public.projects AS p ON p.id = m.project_id
  JOIN public.control_scopes AS cs ON cs.id = p.control_scope_id
  WHERE m.id = p_milestone_id
  FOR UPDATE OF m;
  IF NOT FOUND THEN RETURN private.command_fail('NOT_FOUND', 'Milestone not found'); END IF;

  IF NOT private.user_has_any_role(
    ARRAY['system_administrator','pmo_director','project_manager','milestone_owner','employee'],
    v_entity, 'project', v_project_id) THEN
    RETURN private.command_fail('FORBIDDEN', 'Insufficient role to submit progress');
  END IF;

  INSERT INTO public.milestone_progress_updates (
    milestone_id, reported_by, reported_progress, approval_status, notes
  ) VALUES (p_milestone_id, v_actor, p_reported_progress, 'submitted', p_notes)
  RETURNING id INTO v_update_id;

  UPDATE public.milestones AS m SET reported_progress = p_reported_progress WHERE m.id = p_milestone_id;

  IF p_evidence_description IS NOT NULL AND btrim(p_evidence_description) <> '' THEN
    INSERT INTO public.progress_evidence (progress_update_id, file_name, description, uploaded_by)
    VALUES (v_update_id, 'field-report.txt', p_evidence_description, v_actor);
  END IF;

  PERFORM private.write_audit_event(
    v_actor, 'update', 'milestone_progress_update', v_update_id,
    v_entity, v_scope, v_project_id, p_correlation_id, p_idempotency_key,
    NULL, jsonb_build_object('reported_progress', p_reported_progress, 'status', 'submitted'),
    p_notes, NULL
  );

  v_result := private.command_ok(jsonb_build_object('entity_id', v_update_id, 'milestone_id', p_milestone_id));
  PERFORM private.command_store_idempotency(v_cmd, p_idempotency_key, v_actor, v_result);
  RETURN v_result;
END
$function$;

CREATE OR REPLACE FUNCTION private.verify_progress(
  p_progress_update_id UUID,
  p_verified_progress NUMERIC,
  p_expected_status public.approval_status DEFAULT 'submitted',
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
  v_cmd TEXT := 'verify_progress';
  v_replay JSONB;
  v_upd public.milestone_progress_updates%ROWTYPE;
  v_entity UUID;
  v_scope UUID;
  v_project_id UUID;
  v_result JSONB;
BEGIN
  v_replay := private.command_check_idempotency(v_cmd, p_idempotency_key, v_actor);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF p_verified_progress < 0 OR p_verified_progress > 100 THEN
    RETURN private.command_fail('VALIDATION', 'Verified progress must be between 0 and 100');
  END IF;

  SELECT mpu.* INTO v_upd
  FROM public.milestone_progress_updates AS mpu
  WHERE mpu.id = p_progress_update_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN private.command_fail('NOT_FOUND', 'Progress update not found'); END IF;

  SELECT cs.legal_entity_id, cs.id, m.project_id
  INTO v_entity, v_scope, v_project_id
  FROM public.milestones AS m
  JOIN public.projects AS p ON p.id = m.project_id
  JOIN public.control_scopes AS cs ON cs.id = p.control_scope_id
  WHERE m.id = v_upd.milestone_id;

  IF NOT FOUND THEN RETURN private.command_fail('NOT_FOUND', 'Milestone not found'); END IF;
  IF v_upd.approval_status IS DISTINCT FROM p_expected_status THEN
    RETURN private.command_fail('STATE_MISMATCH', 'Progress update not in expected status');
  END IF;
  IF v_upd.verified_by IS NOT NULL THEN
    RETURN private.command_ok(jsonb_build_object('entity_id', p_progress_update_id, 'already_verified', true));
  END IF;
  IF v_upd.reported_by = v_actor THEN
    RETURN private.command_fail('SOD_VIOLATION', 'Reporter cannot verify own progress');
  END IF;
  IF NOT private.user_has_any_role(
    ARRAY['system_administrator','pmo_director','project_manager','approver'],
    v_entity, 'project', v_project_id) THEN
    RETURN private.command_fail('FORBIDDEN', 'Insufficient role to verify progress');
  END IF;

  UPDATE public.milestone_progress_updates AS mpu SET
    verified_by = v_actor, verified_progress = p_verified_progress, approval_status = 'approved'
  WHERE mpu.id = p_progress_update_id;

  UPDATE public.milestones AS m SET
    approved_progress = p_verified_progress, reported_progress = p_verified_progress, approval_status = 'approved'
  WHERE m.id = v_upd.milestone_id;

  PERFORM private.write_audit_event(
    v_actor, 'approve', 'milestone_progress_update', p_progress_update_id,
    v_entity, v_scope, v_project_id, p_correlation_id, p_idempotency_key,
    jsonb_build_object('status', p_expected_status),
    jsonb_build_object('verified_progress', p_verified_progress, 'status', 'approved'),
    NULL, NULL
  );

  v_result := private.command_ok(jsonb_build_object('entity_id', p_progress_update_id, 'milestone_id', v_upd.milestone_id));
  PERFORM private.command_store_idempotency(v_cmd, p_idempotency_key, v_actor, v_result);
  RETURN v_result;
END
$function$;

CREATE OR REPLACE FUNCTION private.accept_milestone(
  p_milestone_id UUID,
  p_expected_status public.approval_status DEFAULT 'approved',
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
  v_cmd TEXT := 'accept_milestone';
  v_replay JSONB;
  v_entity UUID;
  v_scope UUID;
  v_project_id UUID;
  v_status public.approval_status;
  v_result JSONB;
BEGIN
  v_replay := private.command_check_idempotency(v_cmd, p_idempotency_key, v_actor);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

  SELECT m.approval_status, cs.legal_entity_id, cs.id, m.project_id
  INTO v_status, v_entity, v_scope, v_project_id
  FROM public.milestones AS m
  JOIN public.projects AS p ON p.id = m.project_id
  JOIN public.control_scopes AS cs ON cs.id = p.control_scope_id
  WHERE m.id = p_milestone_id FOR UPDATE OF m;
  IF NOT FOUND THEN RETURN private.command_fail('NOT_FOUND', 'Milestone not found'); END IF;
  IF v_status = 'approved' THEN
    RETURN private.command_ok(jsonb_build_object('entity_id', p_milestone_id, 'already_accepted', true));
  END IF;
  IF NOT private.user_has_any_role(
    ARRAY['system_administrator','pmo_director','project_manager','approver'],
    v_entity, 'project', v_project_id) THEN
    RETURN private.command_fail('FORBIDDEN', 'Insufficient role to accept milestone');
  END IF;

  UPDATE public.milestones AS m SET
    approval_status = 'approved', actual_date = CURRENT_DATE
  WHERE m.id = p_milestone_id;

  PERFORM private.write_audit_event(
    v_actor, 'approve', 'milestone', p_milestone_id,
    v_entity, v_scope, v_project_id, p_correlation_id, p_idempotency_key,
    jsonb_build_object('status', v_status), jsonb_build_object('status', 'accepted'),
    NULL, NULL
  );

  v_result := private.command_ok(jsonb_build_object('entity_id', p_milestone_id));
  PERFORM private.command_store_idempotency(v_cmd, p_idempotency_key, v_actor, v_result);
  RETURN v_result;
END
$function$;

CREATE OR REPLACE FUNCTION private.schedule_approve_extension(
  p_request_id UUID,
  p_approved_days INTEGER,
  p_expected_status public.approval_status DEFAULT 'submitted',
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
  v_cmd TEXT := 'schedule_approve_extension';
  v_replay JSONB;
  v_req public.schedule_change_requests%ROWTYPE;
  v_proj public.projects%ROWTYPE;
  v_entity UUID;
  v_scope UUID;
  v_new_end DATE;
  v_version INTEGER;
  v_result JSONB;
BEGIN
  v_replay := private.command_check_idempotency(v_cmd, p_idempotency_key, v_actor);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

  SELECT * INTO v_req FROM public.schedule_change_requests AS scr
  WHERE scr.id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RETURN private.command_fail('NOT_FOUND', 'Schedule change not found'); END IF;
  IF v_req.approval_status IS DISTINCT FROM p_expected_status THEN
    RETURN private.command_fail('STATE_MISMATCH', 'Schedule request not in expected status');
  END IF;
  IF v_req.requester_id = v_actor THEN
    RETURN private.command_fail('SOD_VIOLATION', 'Requester cannot approve own schedule extension');
  END IF;

  SELECT * INTO v_proj FROM public.projects AS p
  WHERE p.id = v_req.project_id FOR UPDATE;

  SELECT cs.legal_entity_id, cs.id INTO v_entity, v_scope
  FROM public.control_scopes AS cs
  WHERE cs.id = v_proj.control_scope_id;
  IF NOT FOUND THEN RETURN private.command_fail('NOT_FOUND', 'Project not found'); END IF;

  IF NOT private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator','pmo_director','approver'],
    v_entity, 'project', v_req.project_id) THEN
    RETURN private.command_fail('FORBIDDEN', 'Insufficient role to approve schedule extension');
  END IF;

  v_new_end := COALESCE(v_proj.approved_revised_end, v_proj.baseline_end, v_proj.forecast_end);
  IF v_new_end IS NOT NULL THEN
    v_new_end := v_new_end + p_approved_days;
  END IF;

  UPDATE public.schedule_change_requests AS scr SET
    approved_days = p_approved_days, approver_id = v_actor,
    approval_status = 'approved', approval_date = CURRENT_DATE
  WHERE scr.id = p_request_id;

  UPDATE public.projects AS p SET
    forecast_end = v_new_end, approved_revised_end = v_new_end,
    gross_delay_days = v_req.gross_delay_days, excusable_delay_days = v_req.excusable_delay_days,
    net_delay_days = v_req.net_delay_days, delay_reason_class = v_req.delay_reason_class
  WHERE p.id = v_req.project_id;

  SELECT COALESCE(MAX(sbv.version_number), 0) + 1 INTO v_version
  FROM public.schedule_baseline_versions AS sbv WHERE sbv.project_id = v_req.project_id;

  INSERT INTO public.schedule_baseline_versions (
    project_id, version_number, baseline_start, baseline_end, approved_revised_end,
    schedule_change_request_id, created_by
  ) VALUES (
    v_req.project_id, v_version, v_proj.baseline_start, v_proj.baseline_end, v_new_end,
    p_request_id, v_actor
  );

  PERFORM private.write_audit_event(
    v_actor, 'approve', 'schedule_change_request', p_request_id,
    v_entity, v_scope, v_req.project_id, p_correlation_id, p_idempotency_key,
    jsonb_build_object('status', p_expected_status),
    jsonb_build_object('status', 'approved', 'approved_days', p_approved_days, 'new_end', v_new_end),
    v_req.reason, NULL
  );

  v_result := private.command_ok(jsonb_build_object(
    'entity_id', p_request_id, 'project_id', v_req.project_id, 'approved_revised_end', v_new_end
  ));
  PERFORM private.command_store_idempotency(v_cmd, p_idempotency_key, v_actor, v_result);
  RETURN v_result;
END
$function$;

CREATE OR REPLACE FUNCTION public.rpc_submit_progress(
  p_milestone_id UUID, p_reported_progress NUMERIC, p_notes TEXT DEFAULT NULL,
  p_evidence_description TEXT DEFAULT NULL, p_idempotency_key TEXT DEFAULT NULL, p_correlation_id UUID DEFAULT NULL
) RETURNS JSONB LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.submit_progress(p_milestone_id, p_reported_progress, p_notes, p_evidence_description, p_idempotency_key, p_correlation_id);
$$;
CREATE OR REPLACE FUNCTION public.rpc_verify_progress(
  p_progress_update_id UUID, p_verified_progress NUMERIC,
  p_expected_status public.approval_status DEFAULT 'submitted',
  p_idempotency_key TEXT DEFAULT NULL, p_correlation_id UUID DEFAULT NULL
) RETURNS JSONB LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.verify_progress(p_progress_update_id, p_verified_progress, p_expected_status, p_idempotency_key, p_correlation_id);
$$;
CREATE OR REPLACE FUNCTION public.rpc_accept_milestone(
  p_milestone_id UUID, p_expected_status public.approval_status DEFAULT 'approved',
  p_idempotency_key TEXT DEFAULT NULL, p_correlation_id UUID DEFAULT NULL
) RETURNS JSONB LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.accept_milestone(p_milestone_id, p_expected_status, p_idempotency_key, p_correlation_id);
$$;
CREATE OR REPLACE FUNCTION public.rpc_schedule_approve_extension(
  p_request_id UUID, p_approved_days INTEGER,
  p_expected_status public.approval_status DEFAULT 'submitted',
  p_idempotency_key TEXT DEFAULT NULL, p_correlation_id UUID DEFAULT NULL
) RETURNS JSONB LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.schedule_approve_extension(p_request_id, p_approved_days, p_expected_status, p_idempotency_key, p_correlation_id);
$$;

REVOKE ALL ON FUNCTION public.rpc_submit_progress(UUID, NUMERIC, TEXT, TEXT, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_verify_progress(UUID, NUMERIC, public.approval_status, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_accept_milestone(UUID, public.approval_status, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_schedule_approve_extension(UUID, INTEGER, public.approval_status, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_submit_progress(UUID, NUMERIC, TEXT, TEXT, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_verify_progress(UUID, NUMERIC, public.approval_status, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_accept_milestone(UUID, public.approval_status, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_schedule_approve_extension(UUID, INTEGER, public.approval_status, TEXT, UUID) TO authenticated;

REVOKE ALL ON FUNCTION private.submit_progress(UUID, NUMERIC, TEXT, TEXT, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.verify_progress(UUID, NUMERIC, public.approval_status, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.accept_milestone(UUID, public.approval_status, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.schedule_approve_extension(UUID, INTEGER, public.approval_status, TEXT, UUID) FROM PUBLIC;
