-- Expose forecast versions/lines to authenticated read via RLS (required for UI and integration tests)

ALTER TABLE public.forecast_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forecast_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS forecast_versions_select_member ON public.forecast_versions;
CREATE POLICY forecast_versions_select_member ON public.forecast_versions
  FOR SELECT TO authenticated
  USING (private.user_can_access_legal_entity(legal_entity_id));

DROP POLICY IF EXISTS forecast_lines_select_member ON public.forecast_lines;
CREATE POLICY forecast_lines_select_member ON public.forecast_lines
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.forecast_versions AS fv
      WHERE fv.id = forecast_lines.forecast_version_id
        AND private.user_can_access_legal_entity(fv.legal_entity_id)
    )
  );

GRANT SELECT ON TABLE public.forecast_versions, public.forecast_lines TO authenticated;

COMMENT ON TABLE public.forecast_versions IS '@classification data_api_exposed; authenticated only; RLS mandatory';
COMMENT ON TABLE public.forecast_lines IS '@classification data_api_exposed; authenticated only; RLS mandatory';
