-- Priority 0/1 authorization boundary.
-- This migration is deliberately data-preserving: it does not create, delete,
-- rotate, or rewrite any Auth user. Legacy test-account handling is an explicit
-- operator procedure outside the production migration chain.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA private TO authenticated;

-- Existing installations may have btree_gist in public. It is relocatable, so
-- move its extension-owned functions out of the Data API schema.
DO $migration$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_extension e
    JOIN pg_catalog.pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname = 'btree_gist' AND n.nspname = 'public'
  ) THEN
    ALTER EXTENSION btree_gist SET SCHEMA extensions;
  END IF;
END
$migration$;

-- Move every application trigger function out of public. Replacing each body
-- below preserves trigger dependencies while removing search_path ambiguity.
ALTER FUNCTION public.enforce_leaf_posting() SET SCHEMA private;
ALTER FUNCTION public.prevent_org_unit_cycle() SET SCHEMA private;
ALTER FUNCTION public.prevent_cost_node_cycle() SET SCHEMA private;
ALTER FUNCTION public.prevent_inactive_cost_posting() SET SCHEMA private;
ALTER FUNCTION public.protect_locked_budget_version() SET SCHEMA private;
ALTER FUNCTION public.validate_allocation_reconciliation() SET SCHEMA private;
ALTER FUNCTION public.protect_project_baseline() SET SCHEMA private;
ALTER FUNCTION public.protect_milestone_baseline() SET SCHEMA private;
ALTER FUNCTION public.protect_phase_baseline() SET SCHEMA private;
ALTER FUNCTION public.protect_task_baseline() SET SCHEMA private;

CREATE OR REPLACE FUNCTION private.enforce_leaf_posting()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  IF NEW.allows_posting AND EXISTS (
    SELECT 1 FROM public.cost_nodes AS c WHERE c.parent_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'Cannot allow posting on non-leaf cost node';
  END IF;
  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION private.prevent_org_unit_cycle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
  current_id uuid := NEW.parent_id;
  depth integer := 0;
BEGIN
  IF NEW.parent_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.parent_id = NEW.id THEN
    RAISE EXCEPTION 'Organization unit cannot be its own parent';
  END IF;
  WHILE current_id IS NOT NULL AND depth < 100 LOOP
    IF current_id = NEW.id THEN
      RAISE EXCEPTION 'Organization unit hierarchy cycle detected';
    END IF;
    SELECT ou.parent_id INTO current_id
    FROM public.organization_units AS ou WHERE ou.id = current_id;
    depth := depth + 1;
  END LOOP;
  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION private.prevent_cost_node_cycle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
  current_id uuid := NEW.parent_id;
  depth integer := 0;
BEGIN
  IF NEW.parent_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.parent_id = NEW.id THEN
    RAISE EXCEPTION 'Cost node cannot be its own parent';
  END IF;
  WHILE current_id IS NOT NULL AND depth < 100 LOOP
    IF current_id = NEW.id THEN
      RAISE EXCEPTION 'Cost hierarchy cycle detected';
    END IF;
    SELECT cn.parent_id INTO current_id
    FROM public.cost_nodes AS cn WHERE cn.id = current_id;
    depth := depth + 1;
  END LOOP;
  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION private.prevent_inactive_cost_posting()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
  node_status public.record_status;
  allows boolean;
BEGIN
  SELECT cn.status, cn.allows_posting INTO node_status, allows
  FROM public.cost_nodes AS cn WHERE cn.id = NEW.cost_node_id;
  IF node_status = 'inactive' OR allows IS NOT TRUE THEN
    RAISE EXCEPTION 'Posting prohibited on inactive or non-leaf cost node';
  END IF;
  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION private.protect_locked_budget_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.approval_status IN ('locked', 'posted', 'superseded') THEN
    IF NEW.approval_status IS DISTINCT FROM OLD.approval_status
       AND NEW.approval_status NOT IN ('superseded', 'cancelled') THEN
      RAISE EXCEPTION 'Locked or posted budget version cannot be modified';
    END IF;
    IF NEW.original_approved_amount IS DISTINCT FROM OLD.original_approved_amount
       OR NEW.approved_increases IS DISTINCT FROM OLD.approved_increases
       OR NEW.approved_reductions IS DISTINCT FROM OLD.approved_reductions THEN
      RAISE EXCEPTION 'Approved financial amounts are immutable';
    END IF;
  END IF;
  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION private.validate_allocation_reconciliation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
  txn_id uuid;
  source_amount numeric(18,4);
  allocated_total numeric(18,4);
BEGIN
  txn_id := COALESCE(NEW.actual_transaction_id, OLD.actual_transaction_id);
  SELECT atx.amount_ex_vat INTO source_amount
  FROM public.actual_transactions AS atx WHERE atx.id = txn_id;
  SELECT COALESCE(SUM(ata.allocation_amount), 0) INTO allocated_total
  FROM public.actual_transaction_allocations AS ata
  WHERE ata.actual_transaction_id = txn_id;
  IF allocated_total > source_amount + 0.0001 THEN
    RAISE EXCEPTION 'Allocation total exceeds source transaction amount';
  END IF;
  RETURN COALESCE(NEW, OLD);
END
$function$;

CREATE OR REPLACE FUNCTION private.protect_project_baseline()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $function$
BEGIN
  IF OLD.baseline_start IS NOT NULL AND NEW.baseline_start IS DISTINCT FROM OLD.baseline_start THEN
    RAISE EXCEPTION 'Original baseline start cannot be overwritten';
  END IF;
  IF OLD.baseline_end IS NOT NULL AND NEW.baseline_end IS DISTINCT FROM OLD.baseline_end THEN
    RAISE EXCEPTION 'Original baseline end cannot be overwritten';
  END IF;
  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION private.protect_milestone_baseline()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $function$
BEGIN
  IF OLD.baseline_date IS NOT NULL AND NEW.baseline_date IS DISTINCT FROM OLD.baseline_date THEN
    RAISE EXCEPTION 'Original milestone baseline date cannot be overwritten';
  END IF;
  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION private.protect_phase_baseline()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $function$
BEGIN
  IF OLD.baseline_start IS NOT NULL AND NEW.baseline_start IS DISTINCT FROM OLD.baseline_start THEN
    RAISE EXCEPTION 'Original phase baseline start cannot be overwritten';
  END IF;
  IF OLD.baseline_end IS NOT NULL AND NEW.baseline_end IS DISTINCT FROM OLD.baseline_end THEN
    RAISE EXCEPTION 'Original phase baseline end cannot be overwritten';
  END IF;
  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION private.protect_task_baseline()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $function$
BEGIN
  IF OLD.baseline_start IS NOT NULL AND NEW.baseline_start IS DISTINCT FROM OLD.baseline_start THEN
    RAISE EXCEPTION 'Original task baseline start cannot be overwritten';
  END IF;
  IF OLD.baseline_end IS NOT NULL AND NEW.baseline_end IS DISTINCT FROM OLD.baseline_end THEN
    RAISE EXCEPTION 'Original task baseline end cannot be overwritten';
  END IF;
  RETURN NEW;
END
$function$;

-- Canonical authorization helpers. These are deliberately in a non-exposed
-- schema, fully qualified, stable, and callable only by authenticated sessions.
CREATE OR REPLACE FUNCTION private.current_user_is_active()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles AS p
    WHERE p.id = (SELECT auth.uid()) AND p.status = 'active'
  );
$function$;

CREATE OR REPLACE FUNCTION private.current_user_has_active_membership()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT private.current_user_is_active() AND EXISTS (
    SELECT 1 FROM public.memberships AS m
    WHERE m.user_id = (SELECT auth.uid()) AND m.status = 'active'
  );
$function$;

CREATE OR REPLACE FUNCTION private.user_can_access_legal_entity(p_legal_entity_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT private.current_user_is_active() AND EXISTS (
    SELECT 1
    FROM public.legal_entities AS le
    JOIN public.memberships AS m
      ON m.organization_id = le.organization_id
     AND (m.legal_entity_id IS NULL OR m.legal_entity_id = le.id)
    WHERE le.id = p_legal_entity_id
      AND m.user_id = (SELECT auth.uid())
      AND m.status = 'active'
      AND le.status = 'active'
      AND le.effective_start <= CURRENT_DATE
      AND (le.effective_end IS NULL OR le.effective_end >= CURRENT_DATE)
  );
$function$;

CREATE OR REPLACE FUNCTION private.user_has_any_role(
  p_role_codes text[],
  p_legal_entity_id uuid,
  p_required_scope_type public.assignment_scope DEFAULT NULL,
  p_required_scope_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT private.user_can_access_legal_entity(p_legal_entity_id) AND EXISTS (
    SELECT 1
    FROM public.role_assignments AS ra
    JOIN public.roles AS r ON r.id = ra.role_id
    JOIN public.legal_entities AS le ON le.id = p_legal_entity_id
    WHERE ra.user_id = (SELECT auth.uid())
      AND r.code = ANY (p_role_codes)
      AND ra.effective_start <= CURRENT_DATE
      AND (ra.effective_end IS NULL OR ra.effective_end >= CURRENT_DATE)
      AND (
        (ra.scope_type = 'group' AND ra.scope_id = le.organization_id)
        OR (ra.scope_type = 'legal_entity' AND ra.scope_id = p_legal_entity_id)
        OR (
          p_required_scope_type IS NOT NULL
          AND p_required_scope_id IS NOT NULL
          AND ra.scope_type = p_required_scope_type
          AND ra.scope_id = p_required_scope_id
        )
        OR (
          p_required_scope_type = 'project'
          AND ra.scope_type = 'control_scope'
          AND ra.scope_id = (
            SELECT p.control_scope_id FROM public.projects AS p
            WHERE p.id = p_required_scope_id
          )
        )
        OR (
          p_required_scope_type = 'control_account'
          AND ra.scope_type = 'control_scope'
          AND ra.scope_id = (
            SELECT ca.control_scope_id FROM public.control_accounts AS ca
            WHERE ca.id = p_required_scope_id
          )
        )
      )
  );
$function$;

CREATE OR REPLACE FUNCTION private.user_has_role(
  p_role_code text,
  p_legal_entity_id uuid,
  p_required_scope_type public.assignment_scope DEFAULT NULL,
  p_required_scope_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT private.user_has_any_role(
    ARRAY[p_role_code], p_legal_entity_id, p_required_scope_type, p_required_scope_id
  );
$function$;

-- Legacy policies depend on the two public helpers, so remove those policies
-- before retiring the obsolete public entry points.
DO $migration$
DECLARE policy_record record;
BEGIN
  FOR policy_record IN
    SELECT schemaname, tablename, policyname
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I',
      policy_record.policyname, policy_record.schemaname, policy_record.tablename);
  END LOOP;
END
$migration$;

DROP FUNCTION IF EXISTS public.user_legal_entity_ids();
DROP FUNCTION IF EXISTS public.user_has_role(text, uuid);

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.current_user_is_active() TO authenticated;
GRANT EXECUTE ON FUNCTION private.current_user_has_active_membership() TO authenticated;
GRANT EXECUTE ON FUNCTION private.user_can_access_legal_entity(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.user_has_any_role(text[], uuid, public.assignment_scope, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.user_has_role(text, uuid, public.assignment_scope, uuid) TO authenticated;

COMMENT ON FUNCTION private.current_user_is_active() IS '@classification authorization_helper; active profile gate';
COMMENT ON FUNCTION private.current_user_has_active_membership() IS '@classification authorization_helper; active membership gate';
COMMENT ON FUNCTION private.user_can_access_legal_entity(uuid) IS '@classification authorization_helper; active tenant membership gate';
COMMENT ON FUNCTION private.user_has_any_role(text[], uuid, public.assignment_scope, uuid) IS '@classification authorization_helper; effective hierarchical role scope gate';
COMMENT ON FUNCTION private.user_has_role(text, uuid, public.assignment_scope, uuid) IS '@classification authorization_helper; effective hierarchical role scope gate';

-- Rebuild all API views as invoker views. Each aggregate contains an explicit
-- tenant predicate in addition to the base-table RLS boundary.
DROP VIEW IF EXISTS public.v_approval_inbox;
CREATE VIEW public.v_approval_inbox
WITH (security_invoker = true) AS
SELECT bv.id AS entity_id, bv.legal_entity_id,
  'budget'::public.approval_item_type AS item_type,
  bv.version_label AS title_en, bv.version_label AS title_ar,
  bv.submitted_by AS requester_id, bv.approval_status, bv.submitted_at,
  NULL::date AS due_date
FROM public.budget_versions AS bv
WHERE bv.approval_status IN ('submitted', 'under_review')
  AND private.user_can_access_legal_entity(bv.legal_entity_id)
UNION ALL
SELECT bcr.id, bv.legal_entity_id, 'budget_change'::public.approval_item_type,
  bcr.reason, bcr.reason, bcr.requester_id, bcr.approval_status,
  bcr.created_at, NULL::date
FROM public.budget_change_requests AS bcr
JOIN public.budget_versions AS bv ON bv.id = bcr.budget_version_id
WHERE bcr.approval_status = 'submitted'
  AND private.user_can_access_legal_entity(bv.legal_entity_id)
UNION ALL
SELECT ib.id, ib.legal_entity_id, 'import_batch'::public.approval_item_type,
  COALESCE(ib.file_name, 'Import batch'), COALESCE(ib.file_name, 'دفعة استيراد'),
  ib.imported_by, ib.approval_status, ib.created_at, NULL::date
FROM public.import_batches AS ib
WHERE ib.approval_status = 'submitted'
  AND private.user_can_access_legal_entity(ib.legal_entity_id)
UNION ALL
SELECT mpu.id, cs.legal_entity_id, 'milestone_progress'::public.approval_item_type,
  m.name_en, m.name_ar, mpu.reported_by, mpu.approval_status,
  mpu.created_at, NULL::date
FROM public.milestone_progress_updates AS mpu
JOIN public.milestones AS m ON m.id = mpu.milestone_id
JOIN public.projects AS p ON p.id = m.project_id
JOIN public.control_scopes AS cs ON cs.id = p.control_scope_id
WHERE mpu.approval_status = 'submitted' AND mpu.verified_by IS NULL
  AND private.user_can_access_legal_entity(cs.legal_entity_id)
UNION ALL
SELECT scr.id, cs.legal_entity_id, 'schedule_extension'::public.approval_item_type,
  scr.reason, scr.reason, scr.requester_id, scr.approval_status,
  scr.created_at, NULL::date
FROM public.schedule_change_requests AS scr
JOIN public.projects AS p ON p.id = scr.project_id
JOIN public.control_scopes AS cs ON cs.id = p.control_scope_id
WHERE scr.approval_status = 'submitted'
  AND private.user_can_access_legal_entity(cs.legal_entity_id)
UNION ALL
SELECT ve.id, ve.legal_entity_id, 'variance_explanation'::public.approval_item_type,
  ve.cause, ve.cause, ve.responsible_owner_id, ve.approval_status,
  ve.created_at, ve.target_resolution_date
FROM public.variance_explanations AS ve
WHERE ve.approval_status = 'submitted'
  AND private.user_can_access_legal_entity(ve.legal_entity_id);

DROP VIEW IF EXISTS public.v_restaurant_branch_performance;
CREATE VIEW public.v_restaurant_branch_performance
WITH (security_invoker = true) AS
SELECT ou.id AS branch_id, ou.code AS branch_code, ou.name_en, ou.name_ar,
  COALESCE(SUM(CASE WHEN cn.code IN ('FOOD-BEEF', 'FOOD') THEN ata.allocation_amount ELSE 0 END), 0) AS food_cost,
  COALESCE(SUM(CASE WHEN cn.code = 'LABOR' THEN ata.allocation_amount ELSE 0 END), 0) AS labor_cost,
  COALESCE(SUM(CASE WHEN cn.code = 'REV' THEN ata.allocation_amount ELSE 0 END), 0) AS revenue,
  COUNT(DISTINCT CASE WHEN cn.code = 'REV' THEN atx.id END) AS cover_transactions
FROM public.organization_units AS ou
LEFT JOIN (
  public.actual_transaction_allocations AS ata
  JOIN public.actual_transactions AS atx
    ON atx.id = ata.actual_transaction_id AND atx.is_posted = true
) ON ata.organization_unit_id = ou.id
LEFT JOIN public.cost_nodes AS cn ON cn.id = ata.cost_node_id
WHERE ou.code LIKE 'REST-%'
  AND private.user_can_access_legal_entity(ou.legal_entity_id)
GROUP BY ou.id, ou.code, ou.name_en, ou.name_ar;

DROP VIEW IF EXISTS public.v_budget_vs_actual;
CREATE VIEW public.v_budget_vs_actual
WITH (security_invoker = true) AS
SELECT bl.id AS budget_line_id, bv.legal_entity_id, bv.control_scope_id,
  bl.organization_unit_id, bl.cost_node_id, bl.planned_amount AS budget_amount,
  COALESCE(SUM(ata.allocation_amount), 0) AS actual_amount,
  bl.planned_amount - COALESCE(SUM(ata.allocation_amount), 0) AS variance_amount
FROM public.budget_lines AS bl
JOIN public.budget_versions AS bv ON bv.id = bl.budget_version_id
LEFT JOIN public.actual_transaction_allocations AS ata
  ON ata.cost_node_id = bl.cost_node_id
 AND ata.organization_unit_id IS NOT DISTINCT FROM bl.organization_unit_id
WHERE bv.approval_status IN ('approved', 'locked', 'posted')
  AND private.user_can_access_legal_entity(bv.legal_entity_id)
GROUP BY bl.id, bv.legal_entity_id, bv.control_scope_id,
  bl.organization_unit_id, bl.cost_node_id, bl.planned_amount;

-- Remove the legacy permissive policy set, then make RLS mandatory for every
-- public table, including server-only tables. Server-only tables intentionally
-- receive no client policy.
DO $migration$
DECLARE policy_record record;
BEGIN
  FOR policy_record IN
    SELECT schemaname, tablename, policyname
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I',
      policy_record.policyname, policy_record.schemaname, policy_record.tablename);
  END LOOP;
END
$migration$;

DO $migration$
DECLARE table_record record;
BEGIN
  FOR table_record IN
    SELECT c.relname
    FROM pg_catalog.pg_class AS c
    JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_record.relname);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', table_record.relname);
  END LOOP;
END
$migration$;

-- Identity and tenant roots.
CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT TO authenticated
  USING (private.current_user_is_active() AND id = (SELECT auth.uid()));
CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE TO authenticated
  USING (private.current_user_is_active() AND id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()) AND status = 'active');

CREATE POLICY memberships_select_own ON public.memberships
  FOR SELECT TO authenticated
  USING (private.current_user_is_active() AND user_id = (SELECT auth.uid()) AND status = 'active');

CREATE POLICY organizations_select_member ON public.organizations
  FOR SELECT TO authenticated
  USING (
    private.current_user_is_active() AND status = 'active' AND EXISTS (
      SELECT 1 FROM public.memberships AS m
      WHERE m.user_id = (SELECT auth.uid())
        AND m.organization_id = organizations.id AND m.status = 'active'
    )
  );

CREATE POLICY legal_entities_select_member ON public.legal_entities
  FOR SELECT TO authenticated
  USING (private.user_can_access_legal_entity(id));

CREATE POLICY role_assignments_select_own ON public.role_assignments
  FOR SELECT TO authenticated
  USING (
    private.current_user_has_active_membership() AND user_id = (SELECT auth.uid())
    AND effective_start <= CURRENT_DATE
    AND (effective_end IS NULL OR effective_end >= CURRENT_DATE)
  );

CREATE POLICY roles_select_assigned ON public.roles
  FOR SELECT TO authenticated
  USING (
    private.current_user_has_active_membership() AND EXISTS (
      SELECT 1 FROM public.role_assignments AS ra
      WHERE ra.user_id = (SELECT auth.uid()) AND ra.role_id = roles.id
        AND ra.effective_start <= CURRENT_DATE
        AND (ra.effective_end IS NULL OR ra.effective_end >= CURRENT_DATE)
    )
  );

CREATE POLICY notifications_select_own ON public.notifications
  FOR SELECT TO authenticated
  USING (private.current_user_is_active() AND user_id = (SELECT auth.uid()));

CREATE POLICY control_scope_types_select_active ON public.control_scope_types
  FOR SELECT TO authenticated USING (private.current_user_has_active_membership());

-- Direct legal-entity tables.
CREATE POLICY organization_unit_types_select_member ON public.organization_unit_types
  FOR SELECT TO authenticated USING (private.user_can_access_legal_entity(legal_entity_id));
CREATE POLICY organization_units_select_member ON public.organization_units
  FOR SELECT TO authenticated USING (private.user_can_access_legal_entity(legal_entity_id));
CREATE POLICY control_scopes_select_member ON public.control_scopes
  FOR SELECT TO authenticated USING (private.user_can_access_legal_entity(legal_entity_id));
CREATE POLICY cost_nodes_select_member ON public.cost_nodes
  FOR SELECT TO authenticated USING (private.user_can_access_legal_entity(legal_entity_id));
CREATE POLICY control_accounts_select_member ON public.control_accounts
  FOR SELECT TO authenticated USING (private.user_can_access_legal_entity(legal_entity_id));
CREATE POLICY fiscal_years_select_member ON public.fiscal_years
  FOR SELECT TO authenticated USING (private.user_can_access_legal_entity(legal_entity_id));
CREATE POLICY budget_versions_select_member ON public.budget_versions
  FOR SELECT TO authenticated USING (private.user_can_access_legal_entity(legal_entity_id));
CREATE POLICY actual_transactions_select_member ON public.actual_transactions
  FOR SELECT TO authenticated USING (private.user_can_access_legal_entity(legal_entity_id));
CREATE POLICY commitments_select_member ON public.commitments
  FOR SELECT TO authenticated USING (private.user_can_access_legal_entity(legal_entity_id));
CREATE POLICY import_batches_select_member ON public.import_batches
  FOR SELECT TO authenticated USING (private.user_can_access_legal_entity(legal_entity_id));
CREATE POLICY variance_explanations_select_member ON public.variance_explanations
  FOR SELECT TO authenticated USING (private.user_can_access_legal_entity(legal_entity_id));
CREATE POLICY approval_requests_select_member ON public.approval_requests
  FOR SELECT TO authenticated USING (private.user_can_access_legal_entity(legal_entity_id));
CREATE POLICY teams_select_member ON public.teams
  FOR SELECT TO authenticated USING (private.user_can_access_legal_entity(legal_entity_id));
CREATE POLICY vendors_select_member ON public.vendors
  FOR SELECT TO authenticated USING (private.user_can_access_legal_entity(legal_entity_id));
CREATE POLICY risks_select_member ON public.risks
  FOR SELECT TO authenticated USING (private.user_can_access_legal_entity(legal_entity_id));
CREATE POLICY issues_select_member ON public.issues
  FOR SELECT TO authenticated USING (private.user_can_access_legal_entity(legal_entity_id));
CREATE POLICY register_actions_select_member ON public.register_actions
  FOR SELECT TO authenticated USING (private.user_can_access_legal_entity(legal_entity_id));
CREATE POLICY decisions_select_member ON public.decisions
  FOR SELECT TO authenticated USING (private.user_can_access_legal_entity(legal_entity_id));
CREATE POLICY register_dependencies_select_member ON public.register_dependencies
  FOR SELECT TO authenticated USING (private.user_can_access_legal_entity(legal_entity_id));

-- Tables whose tenant key is reached through a parent.
CREATE POLICY fiscal_periods_select_member ON public.fiscal_periods
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.fiscal_years AS fy
    WHERE fy.id = fiscal_periods.fiscal_year_id
      AND private.user_can_access_legal_entity(fy.legal_entity_id)
  ));
CREATE POLICY budget_lines_select_member ON public.budget_lines
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.budget_versions AS bv
    WHERE bv.id = budget_lines.budget_version_id
      AND private.user_can_access_legal_entity(bv.legal_entity_id)
  ));
CREATE POLICY budget_monthly_allocations_select_member ON public.budget_monthly_allocations
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.budget_lines AS bl
    JOIN public.budget_versions AS bv ON bv.id = bl.budget_version_id
    WHERE bl.id = budget_monthly_allocations.budget_line_id
      AND private.user_can_access_legal_entity(bv.legal_entity_id)
  ));
CREATE POLICY budget_change_requests_select_member ON public.budget_change_requests
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.budget_versions AS bv
    WHERE bv.id = budget_change_requests.budget_version_id
      AND private.user_can_access_legal_entity(bv.legal_entity_id)
  ));
CREATE POLICY budget_change_lines_select_member ON public.budget_change_lines
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.budget_change_requests AS bcr
    JOIN public.budget_versions AS bv ON bv.id = bcr.budget_version_id
    WHERE bcr.id = budget_change_lines.change_request_id
      AND private.user_can_access_legal_entity(bv.legal_entity_id)
  ));
CREATE POLICY actual_allocations_select_member ON public.actual_transaction_allocations
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.actual_transactions AS atx
    WHERE atx.id = actual_transaction_allocations.actual_transaction_id
      AND private.user_can_access_legal_entity(atx.legal_entity_id)
  ));
CREATE POLICY imported_source_rows_select_member ON public.imported_source_rows
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.import_batches AS ib
    WHERE ib.id = imported_source_rows.import_batch_id
      AND private.user_can_access_legal_entity(ib.legal_entity_id)
  ));
CREATE POLICY unmapped_queue_select_member ON public.unmapped_transaction_queue
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.import_batches AS ib
    WHERE ib.id = unmapped_transaction_queue.import_batch_id
      AND private.user_can_access_legal_entity(ib.legal_entity_id)
  ));
CREATE POLICY duplicate_queue_select_member ON public.duplicate_review_queue
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.import_batches AS ib
    WHERE ib.id = duplicate_review_queue.import_batch_id
      AND private.user_can_access_legal_entity(ib.legal_entity_id)
  ));

-- Project hierarchy reads.
CREATE POLICY projects_select_member ON public.projects
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.control_scopes AS cs
    WHERE cs.id = projects.control_scope_id
      AND private.user_can_access_legal_entity(cs.legal_entity_id)
  ));
CREATE POLICY project_phases_select_member ON public.project_phases
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.projects AS p
    JOIN public.control_scopes AS cs ON cs.id = p.control_scope_id
    WHERE p.id = project_phases.project_id
      AND private.user_can_access_legal_entity(cs.legal_entity_id)
  ));
CREATE POLICY work_packages_select_member ON public.work_packages
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.project_phases AS pp
    JOIN public.projects AS p ON p.id = pp.project_id
    JOIN public.control_scopes AS cs ON cs.id = p.control_scope_id
    WHERE pp.id = work_packages.phase_id
      AND private.user_can_access_legal_entity(cs.legal_entity_id)
  ));
CREATE POLICY tasks_select_member ON public.tasks
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.work_packages AS wp
    JOIN public.project_phases AS pp ON pp.id = wp.phase_id
    JOIN public.projects AS p ON p.id = pp.project_id
    JOIN public.control_scopes AS cs ON cs.id = p.control_scope_id
    WHERE wp.id = tasks.work_package_id
      AND private.user_can_access_legal_entity(cs.legal_entity_id)
  ));
CREATE POLICY milestones_select_member ON public.milestones
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.projects AS p
    JOIN public.control_scopes AS cs ON cs.id = p.control_scope_id
    WHERE p.id = milestones.project_id
      AND private.user_can_access_legal_entity(cs.legal_entity_id)
  ));
CREATE POLICY milestone_steps_select_member ON public.milestone_steps
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.milestones AS m
    JOIN public.projects AS p ON p.id = m.project_id
    JOIN public.control_scopes AS cs ON cs.id = p.control_scope_id
    WHERE m.id = milestone_steps.milestone_id
      AND private.user_can_access_legal_entity(cs.legal_entity_id)
  ));
CREATE POLICY milestone_progress_select_member ON public.milestone_progress_updates
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.milestones AS m
    JOIN public.projects AS p ON p.id = m.project_id
    JOIN public.control_scopes AS cs ON cs.id = p.control_scope_id
    WHERE m.id = milestone_progress_updates.milestone_id
      AND private.user_can_access_legal_entity(cs.legal_entity_id)
  ));
CREATE POLICY progress_evidence_select_member ON public.progress_evidence
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.milestone_progress_updates AS mpu
    JOIN public.milestones AS m ON m.id = mpu.milestone_id
    JOIN public.projects AS p ON p.id = m.project_id
    JOIN public.control_scopes AS cs ON cs.id = p.control_scope_id
    WHERE mpu.id = progress_evidence.progress_update_id
      AND private.user_can_access_legal_entity(cs.legal_entity_id)
  ));
CREATE POLICY schedule_changes_select_member ON public.schedule_change_requests
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.projects AS p
    JOIN public.control_scopes AS cs ON cs.id = p.control_scope_id
    WHERE p.id = schedule_change_requests.project_id
      AND private.user_can_access_legal_entity(cs.legal_entity_id)
  ));

-- Financial and workflow writes. Every policy is explicitly authenticated and
-- validates both active tenant membership and an effective role assignment.
CREATE POLICY budget_versions_insert_authorized ON public.budget_versions
  FOR INSERT TO authenticated WITH CHECK (
    created_by = (SELECT auth.uid())
    AND private.user_has_any_role(
      ARRAY['system_administrator','legal_entity_administrator','cost_controller','budget_owner'],
      legal_entity_id, 'control_scope', control_scope_id
    )
  );
CREATE POLICY budget_versions_update_authorized ON public.budget_versions
  FOR UPDATE TO authenticated
  USING (private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator','cost_controller','finance_user','budget_owner','approver'],
    legal_entity_id, 'control_scope', control_scope_id
  ))
  WITH CHECK (private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator','cost_controller','finance_user','budget_owner','approver'],
    legal_entity_id, 'control_scope', control_scope_id
  ));

CREATE POLICY budget_lines_insert_authorized ON public.budget_lines
  FOR INSERT TO authenticated WITH CHECK (EXISTS (
    SELECT 1 FROM public.budget_versions AS bv
    WHERE bv.id = budget_lines.budget_version_id
      AND bv.approval_status IN ('draft','submitted','under_review')
      AND private.user_has_any_role(
        ARRAY['system_administrator','legal_entity_administrator','cost_controller','department_manager','budget_owner'],
        bv.legal_entity_id, 'control_scope', bv.control_scope_id
      )
  ));
CREATE POLICY budget_lines_update_authorized ON public.budget_lines
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.budget_versions AS bv
    WHERE bv.id = budget_lines.budget_version_id
      AND bv.approval_status IN ('draft','submitted','under_review')
      AND private.user_has_any_role(
        ARRAY['system_administrator','legal_entity_administrator','cost_controller','department_manager','budget_owner'],
        bv.legal_entity_id, 'control_scope', bv.control_scope_id
      )
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.budget_versions AS bv
    WHERE bv.id = budget_lines.budget_version_id
      AND bv.approval_status IN ('draft','submitted','under_review')
      AND private.user_has_any_role(
        ARRAY['system_administrator','legal_entity_administrator','cost_controller','department_manager','budget_owner'],
        bv.legal_entity_id, 'control_scope', bv.control_scope_id
      )
  ));

CREATE POLICY budget_monthly_insert_authorized ON public.budget_monthly_allocations
  FOR INSERT TO authenticated WITH CHECK (EXISTS (
    SELECT 1 FROM public.budget_lines AS bl
    JOIN public.budget_versions AS bv ON bv.id = bl.budget_version_id
    WHERE bl.id = budget_monthly_allocations.budget_line_id
      AND bv.approval_status IN ('draft','submitted','under_review')
      AND private.user_has_any_role(
        ARRAY['system_administrator','legal_entity_administrator','cost_controller','department_manager','budget_owner'],
        bv.legal_entity_id, 'control_scope', bv.control_scope_id
      )
  ));

CREATE POLICY budget_change_requests_insert_authorized ON public.budget_change_requests
  FOR INSERT TO authenticated WITH CHECK (
    requester_id = (SELECT auth.uid()) AND EXISTS (
      SELECT 1 FROM public.budget_versions AS bv
      WHERE bv.id = budget_change_requests.budget_version_id
        AND private.user_has_any_role(
          ARRAY['system_administrator','legal_entity_administrator','cost_controller','budget_owner'],
          bv.legal_entity_id, 'control_scope', bv.control_scope_id
        )
    )
  );
CREATE POLICY budget_change_requests_update_authorized ON public.budget_change_requests
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.budget_versions AS bv
    WHERE bv.id = budget_change_requests.budget_version_id
      AND private.user_has_any_role(
        ARRAY['system_administrator','legal_entity_administrator','cost_controller','approver'],
        bv.legal_entity_id, 'control_scope', bv.control_scope_id
      )
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.budget_versions AS bv
    WHERE bv.id = budget_change_requests.budget_version_id
      AND private.user_has_any_role(
        ARRAY['system_administrator','legal_entity_administrator','cost_controller','approver'],
        bv.legal_entity_id, 'control_scope', bv.control_scope_id
      )
  ));
CREATE POLICY budget_change_lines_insert_authorized ON public.budget_change_lines
  FOR INSERT TO authenticated WITH CHECK (EXISTS (
    SELECT 1 FROM public.budget_change_requests AS bcr
    JOIN public.budget_versions AS bv ON bv.id = bcr.budget_version_id
    WHERE bcr.id = budget_change_lines.change_request_id
      AND private.user_has_any_role(
        ARRAY['system_administrator','legal_entity_administrator','cost_controller','budget_owner'],
        bv.legal_entity_id, 'control_scope', bv.control_scope_id
      )
  ));

CREATE POLICY actual_transactions_insert_authorized ON public.actual_transactions
  FOR INSERT TO authenticated WITH CHECK (private.user_has_any_role(
    ARRAY['system_administrator','cost_controller','finance_user'], legal_entity_id
  ));
CREATE POLICY actual_transactions_update_authorized ON public.actual_transactions
  FOR UPDATE TO authenticated
  USING (NOT is_posted AND private.user_has_any_role(
    ARRAY['system_administrator','cost_controller','finance_user'], legal_entity_id
  ))
  WITH CHECK (private.user_has_any_role(
    ARRAY['system_administrator','cost_controller','finance_user'], legal_entity_id
  ));
CREATE POLICY actual_allocations_insert_authorized ON public.actual_transaction_allocations
  FOR INSERT TO authenticated WITH CHECK (EXISTS (
    SELECT 1 FROM public.actual_transactions AS atx
    WHERE atx.id = actual_transaction_allocations.actual_transaction_id
      AND private.user_has_any_role(
        ARRAY['system_administrator','cost_controller','finance_user'], atx.legal_entity_id
      )
  ));

CREATE POLICY commitments_insert_authorized ON public.commitments
  FOR INSERT TO authenticated WITH CHECK (private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator','cost_controller','procurement_user'],
    legal_entity_id
  ));
CREATE POLICY commitments_update_authorized ON public.commitments
  FOR UPDATE TO authenticated
  USING (private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator','cost_controller','procurement_user'],
    legal_entity_id
  ))
  WITH CHECK (private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator','cost_controller','procurement_user'],
    legal_entity_id
  ));

CREATE POLICY import_batches_insert_authorized ON public.import_batches
  FOR INSERT TO authenticated WITH CHECK (
    imported_by = (SELECT auth.uid()) AND private.user_has_any_role(
      ARRAY['system_administrator','cost_controller','finance_user'], legal_entity_id
    )
  );
CREATE POLICY import_batches_update_authorized ON public.import_batches
  FOR UPDATE TO authenticated
  USING (private.user_has_any_role(
    ARRAY['system_administrator','cost_controller','finance_user','approver'], legal_entity_id
  ))
  WITH CHECK (private.user_has_any_role(
    ARRAY['system_administrator','cost_controller','finance_user','approver'], legal_entity_id
  ));
CREATE POLICY imported_source_rows_insert_authorized ON public.imported_source_rows
  FOR INSERT TO authenticated WITH CHECK (EXISTS (
    SELECT 1 FROM public.import_batches AS ib
    WHERE ib.id = imported_source_rows.import_batch_id
      AND private.user_has_any_role(
        ARRAY['system_administrator','cost_controller','finance_user'], ib.legal_entity_id
      )
  ));
CREATE POLICY unmapped_queue_insert_authorized ON public.unmapped_transaction_queue
  FOR INSERT TO authenticated WITH CHECK (EXISTS (
    SELECT 1 FROM public.import_batches AS ib
    WHERE ib.id = unmapped_transaction_queue.import_batch_id
      AND private.user_has_any_role(
        ARRAY['system_administrator','cost_controller','finance_user'], ib.legal_entity_id
      )
  ));
CREATE POLICY duplicate_queue_insert_authorized ON public.duplicate_review_queue
  FOR INSERT TO authenticated WITH CHECK (EXISTS (
    SELECT 1 FROM public.import_batches AS ib
    WHERE ib.id = duplicate_review_queue.import_batch_id
      AND private.user_has_any_role(
        ARRAY['system_administrator','cost_controller','finance_user'], ib.legal_entity_id
      )
  ));

CREATE POLICY approval_requests_insert_authorized ON public.approval_requests
  FOR INSERT TO authenticated WITH CHECK (
    requester_id = (SELECT auth.uid())
    AND private.user_has_any_role(
      ARRAY['system_administrator','legal_entity_administrator','pmo_director','project_manager','cost_controller','finance_user','procurement_user','department_manager','budget_owner','milestone_owner','employee'],
      legal_entity_id
    )
  );
CREATE POLICY approval_requests_update_authorized ON public.approval_requests
  FOR UPDATE TO authenticated
  USING (private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator','pmo_director','cost_controller','finance_user','approver'],
    legal_entity_id
  ))
  WITH CHECK (private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator','pmo_director','cost_controller','finance_user','approver'],
    legal_entity_id
  ));

CREATE POLICY variance_explanations_insert_authorized ON public.variance_explanations
  FOR INSERT TO authenticated WITH CHECK (private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator','project_manager','cost_controller','finance_user','department_manager','budget_owner'],
    legal_entity_id
  ));
CREATE POLICY variance_explanations_update_authorized ON public.variance_explanations
  FOR UPDATE TO authenticated
  USING (private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator','project_manager','cost_controller','finance_user','department_manager','budget_owner','approver'],
    legal_entity_id
  ))
  WITH CHECK (private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator','project_manager','cost_controller','finance_user','department_manager','budget_owner','approver'],
    legal_entity_id
  ));

CREATE POLICY control_accounts_insert_authorized ON public.control_accounts
  FOR INSERT TO authenticated WITH CHECK (private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator','pmo_director','project_manager','cost_controller'],
    legal_entity_id,
    CASE WHEN project_id IS NOT NULL THEN 'project'::public.assignment_scope ELSE NULL END,
    project_id
  ));

-- Project workflow writes preserve project-scoped roles: a project assignment
-- authorizes its exact project, while group/legal-entity/control-scope roles may
-- authorize their documented descendants.
CREATE POLICY projects_insert_authorized ON public.projects
  FOR INSERT TO authenticated WITH CHECK (EXISTS (
    SELECT 1 FROM public.control_scopes AS cs
    WHERE cs.id = projects.control_scope_id
      AND private.user_has_any_role(
        ARRAY['system_administrator','legal_entity_administrator','pmo_director','project_manager'],
        cs.legal_entity_id, 'control_scope', cs.id
      )
  ));
CREATE POLICY projects_update_authorized ON public.projects
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.control_scopes AS cs
    WHERE cs.id = projects.control_scope_id
      AND private.user_has_any_role(
        ARRAY['system_administrator','legal_entity_administrator','pmo_director','project_manager'],
        cs.legal_entity_id, 'project', projects.id
      )
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.control_scopes AS cs
    WHERE cs.id = projects.control_scope_id
      AND private.user_has_any_role(
        ARRAY['system_administrator','legal_entity_administrator','pmo_director','project_manager'],
        cs.legal_entity_id, 'project', projects.id
      )
  ));

CREATE POLICY milestones_insert_authorized ON public.milestones
  FOR INSERT TO authenticated WITH CHECK (EXISTS (
    SELECT 1 FROM public.projects AS p
    JOIN public.control_scopes AS cs ON cs.id = p.control_scope_id
    WHERE p.id = milestones.project_id
      AND private.user_has_any_role(
        ARRAY['system_administrator','legal_entity_administrator','pmo_director','project_manager'],
        cs.legal_entity_id, 'project', p.id
      )
  ));
CREATE POLICY milestones_update_authorized ON public.milestones
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects AS p
    JOIN public.control_scopes AS cs ON cs.id = p.control_scope_id
    WHERE p.id = milestones.project_id
      AND private.user_has_any_role(
        ARRAY['system_administrator','legal_entity_administrator','pmo_director','project_manager','milestone_owner','employee','approver'],
        cs.legal_entity_id, 'project', p.id
      )
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.projects AS p
    JOIN public.control_scopes AS cs ON cs.id = p.control_scope_id
    WHERE p.id = milestones.project_id
      AND private.user_has_any_role(
        ARRAY['system_administrator','legal_entity_administrator','pmo_director','project_manager','milestone_owner','employee','approver'],
        cs.legal_entity_id, 'project', p.id
      )
  ));

CREATE POLICY milestone_progress_insert_authorized ON public.milestone_progress_updates
  FOR INSERT TO authenticated WITH CHECK (
    reported_by = (SELECT auth.uid()) AND EXISTS (
      SELECT 1 FROM public.milestones AS m
      JOIN public.projects AS p ON p.id = m.project_id
      JOIN public.control_scopes AS cs ON cs.id = p.control_scope_id
      WHERE m.id = milestone_progress_updates.milestone_id
        AND private.user_has_any_role(
          ARRAY['system_administrator','pmo_director','project_manager','milestone_owner','employee'],
          cs.legal_entity_id, 'project', p.id
        )
    )
  );
CREATE POLICY milestone_progress_update_authorized ON public.milestone_progress_updates
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.milestones AS m
    JOIN public.projects AS p ON p.id = m.project_id
    JOIN public.control_scopes AS cs ON cs.id = p.control_scope_id
    WHERE m.id = milestone_progress_updates.milestone_id
      AND private.user_has_any_role(
        ARRAY['system_administrator','pmo_director','project_manager','approver'],
        cs.legal_entity_id, 'project', p.id
      )
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.milestones AS m
    JOIN public.projects AS p ON p.id = m.project_id
    JOIN public.control_scopes AS cs ON cs.id = p.control_scope_id
    WHERE m.id = milestone_progress_updates.milestone_id
      AND private.user_has_any_role(
        ARRAY['system_administrator','pmo_director','project_manager','approver'],
        cs.legal_entity_id, 'project', p.id
      )
  ));

CREATE POLICY progress_evidence_insert_authorized ON public.progress_evidence
  FOR INSERT TO authenticated WITH CHECK (
    uploaded_by = (SELECT auth.uid()) AND EXISTS (
      SELECT 1 FROM public.milestone_progress_updates AS mpu
      JOIN public.milestones AS m ON m.id = mpu.milestone_id
      JOIN public.projects AS p ON p.id = m.project_id
      JOIN public.control_scopes AS cs ON cs.id = p.control_scope_id
      WHERE mpu.id = progress_evidence.progress_update_id
        AND private.user_has_any_role(
          ARRAY['system_administrator','pmo_director','project_manager','milestone_owner','employee'],
          cs.legal_entity_id, 'project', p.id
        )
    )
  );

CREATE POLICY schedule_changes_insert_authorized ON public.schedule_change_requests
  FOR INSERT TO authenticated WITH CHECK (
    requester_id = (SELECT auth.uid()) AND EXISTS (
      SELECT 1 FROM public.projects AS p
      JOIN public.control_scopes AS cs ON cs.id = p.control_scope_id
      WHERE p.id = schedule_change_requests.project_id
        AND private.user_has_any_role(
          ARRAY['system_administrator','legal_entity_administrator','pmo_director','project_manager'],
          cs.legal_entity_id, 'project', p.id
        )
    )
  );
CREATE POLICY schedule_changes_update_authorized ON public.schedule_change_requests
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects AS p
    JOIN public.control_scopes AS cs ON cs.id = p.control_scope_id
    WHERE p.id = schedule_change_requests.project_id
      AND private.user_has_any_role(
        ARRAY['system_administrator','legal_entity_administrator','pmo_director','approver'],
        cs.legal_entity_id, 'project', p.id
      )
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.projects AS p
    JOIN public.control_scopes AS cs ON cs.id = p.control_scope_id
    WHERE p.id = schedule_change_requests.project_id
      AND private.user_has_any_role(
        ARRAY['system_administrator','legal_entity_administrator','pmo_director','approver'],
        cs.legal_entity_id, 'project', p.id
      )
  ));

-- Governance register writes are entity scoped. Project-scoped roles are not
-- promoted to entity scope by these policies.
CREATE POLICY risks_insert_authorized ON public.risks
  FOR INSERT TO authenticated WITH CHECK (private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator','pmo_director','project_manager','department_manager'],
    legal_entity_id,
    CASE WHEN control_scope_id IS NOT NULL THEN 'control_scope'::public.assignment_scope ELSE NULL END,
    control_scope_id
  ));
CREATE POLICY risks_update_authorized ON public.risks
  FOR UPDATE TO authenticated
  USING (private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator','pmo_director','project_manager','department_manager'],
    legal_entity_id,
    CASE WHEN control_scope_id IS NOT NULL THEN 'control_scope'::public.assignment_scope ELSE NULL END,
    control_scope_id
  ))
  WITH CHECK (private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator','pmo_director','project_manager','department_manager'],
    legal_entity_id,
    CASE WHEN control_scope_id IS NOT NULL THEN 'control_scope'::public.assignment_scope ELSE NULL END,
    control_scope_id
  ));
CREATE POLICY issues_insert_authorized ON public.issues
  FOR INSERT TO authenticated WITH CHECK (private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator','pmo_director','project_manager','department_manager'],
    legal_entity_id
  ));
CREATE POLICY register_actions_insert_authorized ON public.register_actions
  FOR INSERT TO authenticated WITH CHECK (private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator','pmo_director','project_manager','department_manager'],
    legal_entity_id
  ));
CREATE POLICY decisions_insert_authorized ON public.decisions
  FOR INSERT TO authenticated WITH CHECK (private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator','pmo_director','project_manager','department_manager'],
    legal_entity_id
  ));
CREATE POLICY register_dependencies_insert_authorized ON public.register_dependencies
  FOR INSERT TO authenticated WITH CHECK (private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator','pmo_director','project_manager','department_manager'],
    legal_entity_id
  ));

-- Catalog classification is mandatory and machine-testable. A server-only
-- object is not available through the Data API even though its owner and local
-- maintenance connections retain access.
DO $migration$
DECLARE
  table_name text;
  server_only_tables constant text[] := ARRAY[
    'audit_events', 'forecast_lines', 'forecast_versions', 'gl_accounts',
    'gl_cost_mappings', 'permissions', 'role_permissions',
    'task_dependencies', 'team_members'
  ];
BEGIN
  FOR table_name IN
    SELECT c.relname
    FROM pg_catalog.pg_class AS c
    JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
    ORDER BY c.relname
  LOOP
    IF table_name = ANY (server_only_tables) THEN
      EXECUTE format(
        'COMMENT ON TABLE public.%I IS %L', table_name,
        '@classification administrative_server_only; no Data API privileges'
      );
    ELSE
      EXECUTE format(
        'COMMENT ON TABLE public.%I IS %L', table_name,
        '@classification data_api_exposed; authenticated only; RLS mandatory'
      );
    END IF;
  END LOOP;
END
$migration$;

COMMENT ON VIEW public.v_approval_inbox IS '@classification data_api_exposed; authenticated only; security_invoker aggregate';
COMMENT ON VIEW public.v_budget_vs_actual IS '@classification data_api_exposed; authenticated only; security_invoker aggregate';
COMMENT ON VIEW public.v_restaurant_branch_performance IS '@classification data_api_exposed; authenticated only; security_invoker aggregate; posted actuals only';

COMMENT ON FUNCTION private.enforce_leaf_posting() IS '@classification trigger_only; no client execute';
COMMENT ON FUNCTION private.prevent_org_unit_cycle() IS '@classification trigger_only; no client execute';
COMMENT ON FUNCTION private.prevent_cost_node_cycle() IS '@classification trigger_only; no client execute';
COMMENT ON FUNCTION private.prevent_inactive_cost_posting() IS '@classification trigger_only; no client execute';
COMMENT ON FUNCTION private.protect_locked_budget_version() IS '@classification trigger_only; no client execute';
COMMENT ON FUNCTION private.validate_allocation_reconciliation() IS '@classification trigger_only; no client execute';
COMMENT ON FUNCTION private.protect_project_baseline() IS '@classification trigger_only; no client execute';
COMMENT ON FUNCTION private.protect_milestone_baseline() IS '@classification trigger_only; no client execute';
COMMENT ON FUNCTION private.protect_phase_baseline() IS '@classification trigger_only; no client execute';
COMMENT ON FUNCTION private.protect_task_baseline() IS '@classification trigger_only; no client execute';

-- Deny by default, then grant only the operations backed by an explicit RLS
-- policy. anon and service_role receive no business-object privileges.
REVOKE ALL ON SCHEMA public FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE
  public.actual_transaction_allocations,
  public.actual_transactions,
  public.approval_requests,
  public.budget_change_lines,
  public.budget_change_requests,
  public.budget_lines,
  public.budget_monthly_allocations,
  public.budget_versions,
  public.commitments,
  public.control_accounts,
  public.control_scope_types,
  public.control_scopes,
  public.cost_nodes,
  public.decisions,
  public.duplicate_review_queue,
  public.fiscal_periods,
  public.fiscal_years,
  public.import_batches,
  public.imported_source_rows,
  public.issues,
  public.legal_entities,
  public.memberships,
  public.milestone_progress_updates,
  public.milestone_steps,
  public.milestones,
  public.notifications,
  public.organization_unit_types,
  public.organization_units,
  public.organizations,
  public.profiles,
  public.progress_evidence,
  public.project_phases,
  public.projects,
  public.register_actions,
  public.register_dependencies,
  public.risks,
  public.role_assignments,
  public.roles,
  public.schedule_change_requests,
  public.tasks,
  public.teams,
  public.unmapped_transaction_queue,
  public.variance_explanations,
  public.vendors,
  public.work_packages,
  public.v_approval_inbox,
  public.v_budget_vs_actual,
  public.v_restaurant_branch_performance
TO authenticated;

GRANT INSERT ON TABLE
  public.actual_transaction_allocations,
  public.actual_transactions,
  public.approval_requests,
  public.budget_change_lines,
  public.budget_change_requests,
  public.budget_lines,
  public.budget_monthly_allocations,
  public.budget_versions,
  public.commitments,
  public.control_accounts,
  public.decisions,
  public.duplicate_review_queue,
  public.import_batches,
  public.imported_source_rows,
  public.issues,
  public.milestone_progress_updates,
  public.milestones,
  public.progress_evidence,
  public.projects,
  public.register_actions,
  public.register_dependencies,
  public.risks,
  public.schedule_change_requests,
  public.unmapped_transaction_queue,
  public.variance_explanations
TO authenticated;

GRANT UPDATE ON TABLE
  public.actual_transactions,
  public.approval_requests,
  public.budget_change_requests,
  public.budget_lines,
  public.budget_versions,
  public.commitments,
  public.import_batches,
  public.milestone_progress_updates,
  public.milestones,
  public.projects,
  public.risks,
  public.schedule_change_requests,
  public.variance_explanations
TO authenticated;

GRANT UPDATE (
  full_name_en, full_name_ar, preferred_locale, preferred_timezone, updated_at
) ON public.profiles TO authenticated;

-- RLS helper lookup indexes: policies are only safe at production scale when
-- their profile, membership, role, and hierarchy probes stay index-backed.
CREATE INDEX IF NOT EXISTS idx_memberships_auth_lookup
  ON public.memberships (user_id, status, legal_entity_id, organization_id);
CREATE INDEX IF NOT EXISTS idx_role_assignments_auth_lookup
  ON public.role_assignments (user_id, effective_start, effective_end, role_id, scope_type, scope_id);
CREATE INDEX IF NOT EXISTS idx_legal_entities_org_active
  ON public.legal_entities (organization_id, status, effective_start, effective_end);
CREATE INDEX IF NOT EXISTS idx_projects_control_scope
  ON public.projects (control_scope_id);
CREATE INDEX IF NOT EXISTS idx_project_phases_project
  ON public.project_phases (project_id);
CREATE INDEX IF NOT EXISTS idx_work_packages_phase
  ON public.work_packages (phase_id);
CREATE INDEX IF NOT EXISTS idx_tasks_work_package
  ON public.tasks (work_package_id);
CREATE INDEX IF NOT EXISTS idx_milestones_project
  ON public.milestones (project_id);
CREATE INDEX IF NOT EXISTS idx_milestone_steps_milestone
  ON public.milestone_steps (milestone_id);
CREATE INDEX IF NOT EXISTS idx_milestone_progress_milestone
  ON public.milestone_progress_updates (milestone_id);
CREATE INDEX IF NOT EXISTS idx_imported_source_rows_batch
  ON public.imported_source_rows (import_batch_id);
CREATE INDEX IF NOT EXISTS idx_actual_allocations_transaction
  ON public.actual_transaction_allocations (actual_transaction_id);
