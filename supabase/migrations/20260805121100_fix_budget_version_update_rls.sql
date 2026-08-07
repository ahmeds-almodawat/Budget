-- Fix budget_versions update policy: allow transition TO locked/posted, deny updates ON locked/posted rows

DROP POLICY IF EXISTS budget_versions_update ON budget_versions;

CREATE POLICY budget_versions_update ON budget_versions
  FOR UPDATE
  USING (
    legal_entity_id IN (SELECT user_legal_entity_ids())
    AND NOT user_has_role('auditor')
    AND NOT user_has_role('viewer')
    AND approval_status NOT IN ('locked', 'posted')
  )
  WITH CHECK (
    legal_entity_id IN (SELECT user_legal_entity_ids())
    AND NOT user_has_role('auditor')
    AND NOT user_has_role('viewer')
  );
