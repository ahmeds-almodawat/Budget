-- P2 Phase 1-2: Transactional command framework and authoritative audit events (COD-H-003)

-- Idempotency ledger (private schema only)
CREATE TABLE IF NOT EXISTS private.command_idempotency (
  command_name TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  actor_id UUID NOT NULL,
  result_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (command_name, idempotency_key)
);
REVOKE ALL ON TABLE private.command_idempotency FROM PUBLIC, anon, authenticated, service_role;

-- Extend audit_events with tenant scope and correlation metadata
ALTER TABLE public.audit_events
  ADD COLUMN IF NOT EXISTS legal_entity_id UUID REFERENCES public.legal_entities(id),
  ADD COLUMN IF NOT EXISTS control_scope_id UUID REFERENCES public.control_scopes(id),
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id),
  ADD COLUMN IF NOT EXISTS correlation_id UUID,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE INDEX IF NOT EXISTS idx_audit_events_legal_entity
  ON public.audit_events (legal_entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_correlation
  ON public.audit_events (correlation_id) WHERE correlation_id IS NOT NULL;

-- Append-only enforcement on audit_events
CREATE OR REPLACE FUNCTION private.deny_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only';
END
$function$;

DROP TRIGGER IF EXISTS trg_audit_events_deny_update ON public.audit_events;
CREATE TRIGGER trg_audit_events_deny_update
  BEFORE UPDATE ON public.audit_events
  FOR EACH ROW EXECUTE FUNCTION private.deny_audit_mutation();

DROP TRIGGER IF EXISTS trg_audit_events_deny_delete ON public.audit_events;
CREATE TRIGGER trg_audit_events_deny_delete
  BEFORE DELETE ON public.audit_events
  FOR EACH ROW EXECUTE FUNCTION private.deny_audit_mutation();

-- Shared command helpers
CREATE OR REPLACE FUNCTION private.command_check_idempotency(
  p_command_name TEXT,
  p_idempotency_key TEXT,
  p_actor_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_existing JSONB;
BEGIN
  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RETURN NULL;
  END IF;
  SELECT ci.result_json INTO v_existing
  FROM private.command_idempotency AS ci
  WHERE ci.command_name = p_command_name
    AND ci.idempotency_key = p_idempotency_key
    AND ci.actor_id = p_actor_id;
  IF FOUND THEN
    RETURN v_existing || jsonb_build_object('idempotent_replay', true);
  END IF;
  RETURN NULL;
END
$function$;

CREATE OR REPLACE FUNCTION private.command_store_idempotency(
  p_command_name TEXT,
  p_idempotency_key TEXT,
  p_actor_id UUID,
  p_result JSONB
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RETURN;
  END IF;
  INSERT INTO private.command_idempotency (command_name, idempotency_key, actor_id, result_json)
  VALUES (p_command_name, p_idempotency_key, p_actor_id, p_result)
  ON CONFLICT (command_name, idempotency_key) DO NOTHING;
END
$function$;

CREATE OR REPLACE FUNCTION private.command_fail(p_code TEXT, p_message TEXT)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $function$
  SELECT jsonb_build_object('ok', false, 'error_code', p_code, 'message', p_message);
$function$;

CREATE OR REPLACE FUNCTION private.command_ok(p_payload JSONB DEFAULT '{}'::jsonb)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $function$
  SELECT jsonb_build_object('ok', true) || COALESCE(p_payload, '{}'::jsonb);
$function$;

CREATE OR REPLACE FUNCTION private.write_audit_event(
  p_actor_id UUID,
  p_action public.audit_action,
  p_entity_type TEXT,
  p_entity_id UUID,
  p_legal_entity_id UUID,
  p_control_scope_id UUID DEFAULT NULL,
  p_project_id UUID DEFAULT NULL,
  p_correlation_id UUID DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL,
  p_previous_value JSONB DEFAULT NULL,
  p_new_value JSONB DEFAULT NULL,
  p_reason TEXT DEFAULT NULL,
  p_import_batch_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.audit_events (
    actor_id, action, entity_type, entity_id,
    legal_entity_id, control_scope_id, project_id,
    correlation_id, idempotency_key,
    previous_value, new_value, reason, import_batch_id
  ) VALUES (
    p_actor_id, p_action, p_entity_type, p_entity_id,
    p_legal_entity_id, p_control_scope_id, p_project_id,
    p_correlation_id, p_idempotency_key,
    p_previous_value, p_new_value, p_reason, p_import_batch_id
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END
$function$;

REVOKE ALL ON FUNCTION private.command_check_idempotency(TEXT, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.command_store_idempotency(TEXT, TEXT, UUID, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.command_fail(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.command_ok(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.write_audit_event(
  UUID, public.audit_action, TEXT, UUID, UUID, UUID, UUID, UUID, TEXT, JSONB, JSONB, TEXT, UUID
) FROM PUBLIC;

COMMENT ON FUNCTION private.deny_audit_mutation() IS '@classification trigger_only; no client execute';
COMMENT ON FUNCTION private.command_check_idempotency(TEXT, TEXT, UUID) IS '@classification command_helper; no client execute';
COMMENT ON FUNCTION private.command_store_idempotency(TEXT, TEXT, UUID, JSONB) IS '@classification command_helper; no client execute';
COMMENT ON FUNCTION private.command_fail(TEXT, TEXT) IS '@classification command_helper; no client execute';
COMMENT ON FUNCTION private.command_ok(JSONB) IS '@classification command_helper; no client execute';
COMMENT ON FUNCTION private.write_audit_event(
  UUID, public.audit_action, TEXT, UUID, UUID, UUID, UUID, UUID, TEXT, JSONB, JSONB, TEXT, UUID
) IS '@classification command_helper; no client execute';
