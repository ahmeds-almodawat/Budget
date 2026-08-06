-- Keep audit_events outside direct Data API table access while providing a
-- tenant-scoped, role-authorized read path for the audit workspace.
CREATE OR REPLACE FUNCTION public.rpc_search_audit_events(
  p_legal_entity_id UUID,
  p_entity_type TEXT DEFAULT NULL,
  p_action TEXT DEFAULT NULL,
  p_actor_id UUID DEFAULT NULL,
  p_from_date DATE DEFAULT NULL,
  p_to_date DATE DEFAULT NULL,
  p_limit INTEGER DEFAULT 100
)
RETURNS SETOF JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NOT private.current_user_is_active()
     OR NOT private.user_has_any_role(
       ARRAY['system_administrator', 'legal_entity_administrator', 'auditor'],
       p_legal_entity_id
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Access denied';
  END IF;

  RETURN QUERY
  SELECT to_jsonb(ae) || jsonb_build_object(
    'profiles',
    CASE
      WHEN p.id IS NULL THEN NULL
      ELSE jsonb_build_object(
        'full_name_en', p.full_name_en,
        'full_name_ar', p.full_name_ar,
        'email', p.email
      )
    END
  )
  FROM public.audit_events AS ae
  LEFT JOIN public.profiles AS p ON p.id = ae.actor_id
  WHERE ae.legal_entity_id = p_legal_entity_id
    AND (p_entity_type IS NULL OR ae.entity_type = p_entity_type)
    AND (p_action IS NULL OR ae.action::TEXT = p_action)
    AND (p_actor_id IS NULL OR ae.actor_id = p_actor_id)
    AND (p_from_date IS NULL OR ae.created_at >= p_from_date::TIMESTAMPTZ)
    AND (p_to_date IS NULL OR ae.created_at < (p_to_date + 1)::TIMESTAMPTZ)
  ORDER BY ae.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 200);
END
$function$;

REVOKE ALL ON FUNCTION public.rpc_search_audit_events(
  UUID, TEXT, TEXT, UUID, DATE, DATE, INTEGER
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_search_audit_events(
  UUID, TEXT, TEXT, UUID, DATE, DATE, INTEGER
) TO authenticated;

COMMENT ON FUNCTION public.rpc_search_audit_events(
  UUID, TEXT, TEXT, UUID, DATE, DATE, INTEGER
) IS '@classification data_api_command; tenant-scoped audit read; authenticated only';
