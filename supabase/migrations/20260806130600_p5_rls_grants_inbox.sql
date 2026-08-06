-- P5: RLS, grants, inbox extensions, FK completion

ALTER TABLE public.purchase_requisitions
  ADD CONSTRAINT purchase_requisitions_rule_fk
  FOREIGN KEY (approval_rule_version_id) REFERENCES public.approval_rule_versions(id);

-- governed_master_records
ALTER TABLE public.governed_master_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY governed_master_records_select_member ON public.governed_master_records
  FOR SELECT TO authenticated USING (private.user_can_access_legal_entity(legal_entity_id));
CREATE POLICY governed_master_records_insert_authorized ON public.governed_master_records
  FOR INSERT TO authenticated WITH CHECK (private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator','finance_user','cost_controller'],
    legal_entity_id
  ));
CREATE POLICY governed_master_records_update_authorized ON public.governed_master_records
  FOR UPDATE TO authenticated USING (private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator','finance_user','cost_controller'],
    legal_entity_id
  ));

-- approval_delegations
ALTER TABLE public.approval_delegations ENABLE ROW LEVEL SECURITY;
CREATE POLICY approval_delegations_select_member ON public.approval_delegations
  FOR SELECT TO authenticated USING (private.user_can_access_legal_entity(legal_entity_id));
CREATE POLICY approval_delegations_insert_authorized ON public.approval_delegations
  FOR INSERT TO authenticated WITH CHECK (
    delegator_id = (SELECT auth.uid())
    AND private.user_has_any_role(
      ARRAY['system_administrator','legal_entity_administrator','approver','finance_user','cost_controller'],
      legal_entity_id
    )
  );
CREATE POLICY approval_delegations_update_authorized ON public.approval_delegations
  FOR UPDATE TO authenticated USING (
    delegator_id = (SELECT auth.uid())
    OR private.user_has_any_role(
      ARRAY['system_administrator','legal_entity_administrator','approver'],
      legal_entity_id
    )
  );

-- fiscal_period_module_controls
ALTER TABLE public.fiscal_period_module_controls ENABLE ROW LEVEL SECURITY;
CREATE POLICY fiscal_period_module_controls_select_member ON public.fiscal_period_module_controls
  FOR SELECT TO authenticated USING (private.user_can_access_legal_entity(legal_entity_id));
CREATE POLICY fiscal_period_module_controls_insert_authorized ON public.fiscal_period_module_controls
  FOR INSERT TO authenticated WITH CHECK (private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator','finance_user','cost_controller'],
    legal_entity_id
  ));
CREATE POLICY fiscal_period_module_controls_update_authorized ON public.fiscal_period_module_controls
  FOR UPDATE TO authenticated USING (private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator','finance_user','cost_controller'],
    legal_entity_id
  ));

-- purchase_requisitions
ALTER TABLE public.purchase_requisitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY purchase_requisitions_select_member ON public.purchase_requisitions
  FOR SELECT TO authenticated USING (private.user_can_access_legal_entity(legal_entity_id));
CREATE POLICY purchase_requisitions_insert_authorized ON public.purchase_requisitions
  FOR INSERT TO authenticated WITH CHECK (
    requester_id = (SELECT auth.uid())
    AND private.user_has_any_role(
      ARRAY['system_administrator','legal_entity_administrator','finance_user','cost_controller','budget_owner','procurement_user'],
      legal_entity_id
    )
  );
CREATE POLICY purchase_requisitions_update_authorized ON public.purchase_requisitions
  FOR UPDATE TO authenticated USING (private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator','finance_user','cost_controller','budget_owner','procurement_user','approver'],
    legal_entity_id
  ));

-- purchase_requisition_lines
ALTER TABLE public.purchase_requisition_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY purchase_requisition_lines_select_member ON public.purchase_requisition_lines
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.purchase_requisitions AS pr
      WHERE pr.id = requisition_id
        AND private.user_can_access_legal_entity(pr.legal_entity_id)
    )
  );
CREATE POLICY purchase_requisition_lines_insert_authorized ON public.purchase_requisition_lines
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.purchase_requisitions AS pr
      WHERE pr.id = requisition_id
        AND pr.requester_id = (SELECT auth.uid())
        AND private.user_has_any_role(
          ARRAY['system_administrator','legal_entity_administrator','finance_user','cost_controller','budget_owner','procurement_user'],
          pr.legal_entity_id
        )
    )
  );
CREATE POLICY purchase_requisition_lines_update_authorized ON public.purchase_requisition_lines
  FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.purchase_requisitions AS pr
      WHERE pr.id = requisition_id
        AND private.user_has_any_role(
          ARRAY['system_administrator','legal_entity_administrator','finance_user','cost_controller','budget_owner','procurement_user'],
          pr.legal_entity_id
        )
    )
  );

-- purchase_orders
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY purchase_orders_select_member ON public.purchase_orders
  FOR SELECT TO authenticated USING (private.user_can_access_legal_entity(legal_entity_id));
CREATE POLICY purchase_orders_insert_authorized ON public.purchase_orders
  FOR INSERT TO authenticated WITH CHECK (private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator','procurement_user','cost_controller'],
    legal_entity_id
  ));
CREATE POLICY purchase_orders_update_authorized ON public.purchase_orders
  FOR UPDATE TO authenticated USING (private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator','procurement_user','cost_controller','approver'],
    legal_entity_id
  ));

-- supplier_invoices
ALTER TABLE public.supplier_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY supplier_invoices_select_member ON public.supplier_invoices
  FOR SELECT TO authenticated USING (private.user_can_access_legal_entity(legal_entity_id));
CREATE POLICY supplier_invoices_insert_authorized ON public.supplier_invoices
  FOR INSERT TO authenticated WITH CHECK (private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator','procurement_user','finance_user'],
    legal_entity_id
  ));
CREATE POLICY supplier_invoices_update_authorized ON public.supplier_invoices
  FOR UPDATE TO authenticated USING (private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator','procurement_user','finance_user','approver'],
    legal_entity_id
  ));

-- payment_requests
ALTER TABLE public.payment_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY payment_requests_select_member ON public.payment_requests
  FOR SELECT TO authenticated USING (private.user_can_access_legal_entity(legal_entity_id));
CREATE POLICY payment_requests_insert_authorized ON public.payment_requests
  FOR INSERT TO authenticated WITH CHECK (
    requested_by = (SELECT auth.uid())
    AND private.user_has_any_role(
      ARRAY['system_administrator','legal_entity_administrator','finance_user','procurement_user'],
      legal_entity_id
    )
  );
CREATE POLICY payment_requests_update_authorized ON public.payment_requests
  FOR UPDATE TO authenticated USING (private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator','finance_user','approver'],
    legal_entity_id
  ));

-- approval_rule_versions
ALTER TABLE public.approval_rule_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY approval_rule_versions_select_member ON public.approval_rule_versions
  FOR SELECT TO authenticated USING (private.user_can_access_legal_entity(legal_entity_id));
CREATE POLICY approval_rule_versions_insert_authorized ON public.approval_rule_versions
  FOR INSERT TO authenticated WITH CHECK (private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator','cost_controller'],
    legal_entity_id
  ));
CREATE POLICY approval_rule_versions_update_authorized ON public.approval_rule_versions
  FOR UPDATE TO authenticated USING (private.user_has_any_role(
    ARRAY['system_administrator','legal_entity_administrator','cost_controller','approver'],
    legal_entity_id
  ));

GRANT SELECT ON TABLE
  public.governed_master_records,
  public.approval_delegations,
  public.fiscal_period_module_controls,
  public.purchase_requisitions,
  public.purchase_requisition_lines,
  public.purchase_orders,
  public.supplier_invoices,
  public.payment_requests,
  public.approval_rule_versions
TO authenticated;

GRANT INSERT ON TABLE
  public.governed_master_records,
  public.approval_delegations,
  public.fiscal_period_module_controls,
  public.purchase_requisitions,
  public.purchase_requisition_lines,
  public.purchase_orders,
  public.supplier_invoices,
  public.payment_requests,
  public.approval_rule_versions
TO authenticated;

GRANT UPDATE ON TABLE
  public.governed_master_records,
  public.approval_delegations,
  public.fiscal_period_module_controls,
  public.purchase_requisitions,
  public.purchase_requisition_lines,
  public.purchase_orders,
  public.supplier_invoices,
  public.payment_requests,
  public.approval_rule_versions
TO authenticated;

DO $migration$
DECLARE table_record record;
BEGIN
  FOR table_record IN
    SELECT unnest(ARRAY[
      'governed_master_records', 'approval_delegations', 'fiscal_period_module_controls',
      'purchase_requisitions', 'purchase_requisition_lines', 'purchase_orders',
      'supplier_invoices', 'payment_requests', 'approval_rule_versions'
    ]) AS relname
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_record.relname);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', table_record.relname);
  END LOOP;
END
$migration$;

COMMENT ON TABLE public.governed_master_records IS '@classification data_api_exposed; authenticated only; RLS mandatory';
COMMENT ON TABLE public.approval_delegations IS '@classification data_api_exposed; authenticated only; RLS mandatory';
COMMENT ON TABLE public.fiscal_period_module_controls IS '@classification data_api_exposed; authenticated only; RLS mandatory';
COMMENT ON TABLE public.purchase_requisitions IS '@classification data_api_exposed; authenticated only; RLS mandatory';
COMMENT ON TABLE public.purchase_requisition_lines IS '@classification data_api_exposed; authenticated only; RLS mandatory';
COMMENT ON TABLE public.purchase_orders IS '@classification data_api_exposed; authenticated only; RLS mandatory';
COMMENT ON TABLE public.supplier_invoices IS '@classification data_api_exposed; authenticated only; RLS mandatory';
COMMENT ON TABLE public.payment_requests IS '@classification data_api_exposed; authenticated only; RLS mandatory';
COMMENT ON TABLE public.approval_rule_versions IS '@classification data_api_exposed; authenticated only; RLS mandatory';
COMMENT ON FUNCTION private.master_record_cycle_guard() IS '@classification trigger_only; no client execute';
