-- ULTRA MEGA: public wrapper for budget_checked → procurement_review

CREATE OR REPLACE FUNCTION public.rpc_requisition_procurement_review(
  p_requisition_id UUID,
  p_expected_status public.requisition_status DEFAULT 'budget_checked',
  p_idempotency_key TEXT DEFAULT NULL,
  p_correlation_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT private.requisition_transition(
    p_requisition_id, p_expected_status, 'procurement_review', p_idempotency_key, p_correlation_id
  );
$$;

REVOKE ALL ON FUNCTION public.rpc_requisition_procurement_review(UUID, public.requisition_status, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_requisition_procurement_review(UUID, public.requisition_status, TEXT, UUID) TO authenticated;
