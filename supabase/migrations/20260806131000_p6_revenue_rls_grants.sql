-- P6: RLS for revenue control tables

ALTER TABLE public.revenue_component_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.revenue_component_types FORCE ROW LEVEL SECURITY;
ALTER TABLE public.payer_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payer_categories FORCE ROW LEVEL SECURITY;
ALTER TABLE public.payers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payers FORCE ROW LEVEL SECURITY;
ALTER TABLE public.service_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_lines FORCE ROW LEVEL SECURITY;
ALTER TABLE public.gl_reporting_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gl_reporting_rules FORCE ROW LEVEL SECURITY;

CREATE POLICY revenue_component_types_select ON public.revenue_component_types
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY payer_categories_select ON public.payer_categories
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY payers_select_member ON public.payers
  FOR SELECT TO authenticated
  USING (private.user_can_access_legal_entity(legal_entity_id));

CREATE POLICY payers_insert_authorized ON public.payers
  FOR INSERT TO authenticated
  WITH CHECK (
    private.user_has_any_role(
      ARRAY['system_administrator','legal_entity_administrator','finance_user','cost_controller'],
      legal_entity_id, 'legal_entity', legal_entity_id)
  );

CREATE POLICY payers_update_authorized ON public.payers
  FOR UPDATE TO authenticated
  USING (
    private.user_has_any_role(
      ARRAY['system_administrator','legal_entity_administrator','finance_user','cost_controller'],
      legal_entity_id, 'legal_entity', legal_entity_id)
  )
  WITH CHECK (
    private.user_has_any_role(
      ARRAY['system_administrator','legal_entity_administrator','finance_user','cost_controller'],
      legal_entity_id, 'legal_entity', legal_entity_id)
  );

CREATE POLICY service_lines_select_member ON public.service_lines
  FOR SELECT TO authenticated
  USING (private.user_can_access_legal_entity(legal_entity_id));

CREATE POLICY service_lines_insert_authorized ON public.service_lines
  FOR INSERT TO authenticated
  WITH CHECK (
    private.user_has_any_role(
      ARRAY['system_administrator','legal_entity_administrator','finance_user','cost_controller'],
      legal_entity_id, 'legal_entity', legal_entity_id)
  );

CREATE POLICY service_lines_update_authorized ON public.service_lines
  FOR UPDATE TO authenticated
  USING (
    private.user_has_any_role(
      ARRAY['system_administrator','legal_entity_administrator','finance_user','cost_controller'],
      legal_entity_id, 'legal_entity', legal_entity_id)
  )
  WITH CHECK (
    private.user_has_any_role(
      ARRAY['system_administrator','legal_entity_administrator','finance_user','cost_controller'],
      legal_entity_id, 'legal_entity', legal_entity_id)
  );

GRANT SELECT ON TABLE public.revenue_component_types, public.payer_categories TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.payers, public.service_lines TO authenticated;
