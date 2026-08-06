-- Fix: public RPC wrappers must be SECURITY DEFINER to invoke private command functions.

CREATE OR REPLACE FUNCTION public.rpc_budget_submit(
  p_budget_version_id UUID,
  p_expected_status public.approval_status DEFAULT 'draft',
  p_idempotency_key TEXT DEFAULT NULL,
  p_correlation_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.budget_transition(p_budget_version_id, p_expected_status, 'submitted', p_idempotency_key, p_correlation_id);
$$;

CREATE OR REPLACE FUNCTION public.rpc_budget_start_review(
  p_budget_version_id UUID,
  p_expected_status public.approval_status DEFAULT 'submitted',
  p_idempotency_key TEXT DEFAULT NULL,
  p_correlation_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.budget_transition(p_budget_version_id, p_expected_status, 'under_review', p_idempotency_key, p_correlation_id);
$$;

CREATE OR REPLACE FUNCTION public.rpc_budget_reject(
  p_budget_version_id UUID,
  p_expected_status public.approval_status DEFAULT 'under_review',
  p_idempotency_key TEXT DEFAULT NULL,
  p_correlation_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.budget_transition(p_budget_version_id, p_expected_status, 'rejected', p_idempotency_key, p_correlation_id);
$$;

CREATE OR REPLACE FUNCTION public.rpc_budget_approve_and_lock(
  p_budget_version_id UUID,
  p_expected_status public.approval_status DEFAULT 'under_review',
  p_idempotency_key TEXT DEFAULT NULL,
  p_correlation_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.budget_approve_and_lock(p_budget_version_id, p_expected_status, p_idempotency_key, p_correlation_id);
$$;

CREATE OR REPLACE FUNCTION public.rpc_budget_supersede(
  p_budget_version_id UUID,
  p_expected_status public.approval_status DEFAULT 'locked',
  p_idempotency_key TEXT DEFAULT NULL,
  p_correlation_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.budget_transition(p_budget_version_id, p_expected_status, 'superseded', p_idempotency_key, p_correlation_id);
$$;

CREATE OR REPLACE FUNCTION public.rpc_budget_approve_change_request(
  p_change_request_id UUID,
  p_expected_status public.approval_status DEFAULT 'submitted',
  p_idempotency_key TEXT DEFAULT NULL,
  p_correlation_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.budget_approve_change_request(p_change_request_id, p_expected_status, p_idempotency_key, p_correlation_id);
$$;

CREATE OR REPLACE FUNCTION public.rpc_import_review_batch(
  p_batch_id UUID, p_expected_status public.approval_status DEFAULT 'submitted', p_idempotency_key TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.import_review_batch(p_batch_id, p_expected_status, p_idempotency_key);
$$;

CREATE OR REPLACE FUNCTION public.rpc_import_post_batch(
  p_batch_id UUID, p_expected_status public.approval_status DEFAULT 'under_review',
  p_idempotency_key TEXT DEFAULT NULL, p_correlation_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.import_post_batch(p_batch_id, p_expected_status, p_idempotency_key, p_correlation_id);
$$;

CREATE OR REPLACE FUNCTION public.rpc_post_actual_transaction(
  p_transaction_id UUID, p_idempotency_key TEXT DEFAULT NULL, p_correlation_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.post_actual_transaction(p_transaction_id, p_idempotency_key, p_correlation_id);
$$;

CREATE OR REPLACE FUNCTION public.rpc_reverse_actual_transaction(
  p_original_transaction_id UUID, p_reason TEXT,
  p_idempotency_key TEXT DEFAULT NULL, p_correlation_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.reverse_actual_transaction(p_original_transaction_id, p_reason, p_idempotency_key, p_correlation_id);
$$;

CREATE OR REPLACE FUNCTION public.rpc_submit_progress(
  p_milestone_id UUID, p_reported_progress NUMERIC, p_notes TEXT DEFAULT NULL,
  p_evidence_description TEXT DEFAULT NULL, p_idempotency_key TEXT DEFAULT NULL, p_correlation_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.submit_progress(p_milestone_id, p_reported_progress, p_notes, p_evidence_description, p_idempotency_key, p_correlation_id);
$$;

CREATE OR REPLACE FUNCTION public.rpc_verify_progress(
  p_progress_update_id UUID, p_verified_progress NUMERIC,
  p_expected_status public.approval_status DEFAULT 'submitted',
  p_idempotency_key TEXT DEFAULT NULL, p_correlation_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.verify_progress(p_progress_update_id, p_verified_progress, p_expected_status, p_idempotency_key, p_correlation_id);
$$;

CREATE OR REPLACE FUNCTION public.rpc_accept_milestone(
  p_milestone_id UUID, p_expected_status public.approval_status DEFAULT 'approved',
  p_idempotency_key TEXT DEFAULT NULL, p_correlation_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.accept_milestone(p_milestone_id, p_expected_status, p_idempotency_key, p_correlation_id);
$$;

CREATE OR REPLACE FUNCTION public.rpc_schedule_approve_extension(
  p_request_id UUID, p_approved_days INTEGER,
  p_expected_status public.approval_status DEFAULT 'submitted',
  p_idempotency_key TEXT DEFAULT NULL, p_correlation_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.schedule_approve_extension(p_request_id, p_approved_days, p_expected_status, p_idempotency_key, p_correlation_id);
$$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
