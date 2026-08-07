-- ULTRA MEGA: classification comments required by authorization catalog tests

COMMENT ON TABLE public.procurement_contract_lines IS '@classification data_api_exposed; authenticated only; RLS mandatory';
COMMENT ON TABLE public.goods_receipt_lines IS '@classification data_api_exposed; authenticated only; RLS mandatory';
COMMENT ON TABLE public.service_entry_lines IS '@classification data_api_exposed; authenticated only; RLS mandatory';
COMMENT ON TABLE public.supplier_invoice_lines IS '@classification data_api_exposed; authenticated only; RLS mandatory';
COMMENT ON TABLE public.invoice_match_exceptions IS '@classification data_api_exposed; authenticated only; RLS mandatory';
COMMENT ON TABLE public.po_number_sequences IS '@classification data_api_exposed; authenticated only; RLS mandatory; sequence helper';
COMMENT ON TABLE public.approval_decision_audit IS '@classification data_api_exposed; authenticated only; RLS mandatory; append-oriented decision audit';
COMMENT ON TABLE public.appraisal_cycles IS '@classification data_api_exposed; authenticated only; RLS mandatory';
COMMENT ON TABLE public.appraisal_templates IS '@classification data_api_exposed; authenticated only; RLS mandatory';
COMMENT ON TABLE public.appraisal_template_criteria IS '@classification data_api_exposed; authenticated only; RLS mandatory';
COMMENT ON TABLE public.appraisal_ratings IS '@classification data_api_exposed; authenticated only; RLS mandatory';
COMMENT ON TABLE public.appraisal_goals IS '@classification data_api_exposed; authenticated only; RLS mandatory';
COMMENT ON TABLE public.appraisal_acknowledgements IS '@classification data_api_exposed; authenticated only; RLS mandatory';
COMMENT ON TABLE public.period_close_checklist_templates IS '@classification data_api_exposed; authenticated only; RLS mandatory';
COMMENT ON TABLE public.period_close_checklist_items IS '@classification data_api_exposed; authenticated only; RLS mandatory';
COMMENT ON TABLE public.period_close_instances IS '@classification data_api_exposed; authenticated only; RLS mandatory';
COMMENT ON TABLE public.period_close_item_results IS '@classification data_api_exposed; authenticated only; RLS mandatory';

-- Ensure remaining ultra tables also carry classification if present
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'rfqs') THEN
    EXECUTE 'COMMENT ON TABLE public.rfqs IS ''@classification data_api_exposed; authenticated only; RLS mandatory''';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'rfq_lines') THEN
    EXECUTE 'COMMENT ON TABLE public.rfq_lines IS ''@classification data_api_exposed; authenticated only; RLS mandatory''';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'rfq_suppliers') THEN
    EXECUTE 'COMMENT ON TABLE public.rfq_suppliers IS ''@classification data_api_exposed; authenticated only; RLS mandatory''';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'supplier_quotations') THEN
    EXECUTE 'COMMENT ON TABLE public.supplier_quotations IS ''@classification data_api_exposed; authenticated only; RLS mandatory''';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'supplier_quotation_lines') THEN
    EXECUTE 'COMMENT ON TABLE public.supplier_quotation_lines IS ''@classification data_api_exposed; authenticated only; RLS mandatory''';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'evaluation_criteria') THEN
    EXECUTE 'COMMENT ON TABLE public.evaluation_criteria IS ''@classification data_api_exposed; authenticated only; RLS mandatory''';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'sourcing_evaluations') THEN
    EXECUTE 'COMMENT ON TABLE public.sourcing_evaluations IS ''@classification data_api_exposed; authenticated only; RLS mandatory''';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'sourcing_evaluation_scores') THEN
    EXECUTE 'COMMENT ON TABLE public.sourcing_evaluation_scores IS ''@classification data_api_exposed; authenticated only; RLS mandatory''';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'sourcing_awards') THEN
    EXECUTE 'COMMENT ON TABLE public.sourcing_awards IS ''@classification data_api_exposed; authenticated only; RLS mandatory''';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'sourcing_award_lines') THEN
    EXECUTE 'COMMENT ON TABLE public.sourcing_award_lines IS ''@classification data_api_exposed; authenticated only; RLS mandatory''';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'purchase_order_lines') THEN
    EXECUTE 'COMMENT ON TABLE public.purchase_order_lines IS ''@classification data_api_exposed; authenticated only; RLS mandatory''';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'procurement_contracts') THEN
    EXECUTE 'COMMENT ON TABLE public.procurement_contracts IS ''@classification data_api_exposed; authenticated only; RLS mandatory''';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'goods_receipts') THEN
    EXECUTE 'COMMENT ON TABLE public.goods_receipts IS ''@classification data_api_exposed; authenticated only; RLS mandatory''';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'service_entries') THEN
    EXECUTE 'COMMENT ON TABLE public.service_entries IS ''@classification data_api_exposed; authenticated only; RLS mandatory''';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'invoice_match_results') THEN
    EXECUTE 'COMMENT ON TABLE public.invoice_match_results IS ''@classification data_api_exposed; authenticated only; RLS mandatory''';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'procurement_policies') THEN
    EXECUTE 'COMMENT ON TABLE public.procurement_policies IS ''@classification data_api_exposed; authenticated only; RLS mandatory''';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'period_reopen_requests') THEN
    EXECUTE 'COMMENT ON TABLE public.period_reopen_requests IS ''@classification data_api_exposed; authenticated only; RLS mandatory''';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'appraisal_assignments') THEN
    EXECUTE 'COMMENT ON TABLE public.appraisal_assignments IS ''@classification data_api_exposed; authenticated only; RLS mandatory''';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'v_delegated_approval_inbox') THEN
    EXECUTE 'COMMENT ON VIEW public.v_delegated_approval_inbox IS ''@classification data_api_exposed; authenticated only; security_invoker''';
  END IF;
END $$;
