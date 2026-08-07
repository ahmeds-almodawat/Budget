-- @classification migration
-- Allow managers/reviewers/admins to read limited peer profile identity
-- for appraisal assignments they can already access (names/emails only via SELECT).

DROP POLICY IF EXISTS profiles_select_appraisal_peers ON public.profiles;
CREATE POLICY profiles_select_appraisal_peers ON public.profiles
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.appraisal_assignments AS aa
      WHERE (
          aa.employee_id = profiles.id
          OR aa.manager_id = profiles.id
          OR aa.reviewer_id = profiles.id
        )
        AND (
          aa.employee_id = (SELECT auth.uid())
          OR aa.manager_id = (SELECT auth.uid())
          OR aa.reviewer_id = (SELECT auth.uid())
          OR private.user_has_any_role(
            ARRAY['system_administrator', 'legal_entity_administrator'],
            aa.legal_entity_id
          )
        )
    )
  );

COMMENT ON POLICY profiles_select_appraisal_peers ON public.profiles IS
  'Appraisal peers may read coworker display identity for assignments in their scope; narratives remain on appraisal tables.';
