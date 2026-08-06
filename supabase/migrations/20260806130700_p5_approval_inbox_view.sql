-- P5: inbox view with P5 item types (must follow enum extension migration)

CREATE OR REPLACE VIEW public.v_approval_inbox
WITH (security_invoker = true) AS
SELECT
  bv.id AS entity_id,
  bv.legal_entity_id,
  'budget'::public.approval_item_type AS item_type,
  bv.version_label AS title_en,
  bv.version_label AS title_ar,
  bv.submitted_by AS requester_id,
  bv.approval_status,
  bv.submitted_at,
  NULL::DATE AS due_date
FROM public.budget_versions AS bv
WHERE bv.approval_status IN ('submitted', 'under_review')
UNION ALL
SELECT
  bcr.id, bv.legal_entity_id, 'budget_change'::public.approval_item_type,
  bcr.reason, bcr.reason,
  bcr.requester_id, bcr.approval_status, bcr.created_at, NULL::DATE
FROM public.budget_change_requests AS bcr
JOIN public.budget_versions AS bv ON bv.id = bcr.budget_version_id
WHERE bcr.approval_status = 'submitted'
UNION ALL
SELECT
  ib.id, ib.legal_entity_id, 'import_batch'::public.approval_item_type,
  COALESCE(ib.file_name, 'Import batch'), COALESCE(ib.file_name, 'دفعة استيراد'),
  ib.imported_by, ib.approval_status, ib.created_at, NULL::DATE
FROM public.import_batches AS ib
WHERE ib.approval_status = 'submitted'
UNION ALL
SELECT
  mpu.id, cs.legal_entity_id, 'milestone_progress'::public.approval_item_type,
  m.name_en, m.name_ar,
  mpu.reported_by, mpu.approval_status, mpu.created_at, NULL::DATE
FROM public.milestone_progress_updates AS mpu
JOIN public.milestones AS m ON m.id = mpu.milestone_id
JOIN public.projects AS p ON p.id = m.project_id
JOIN public.control_scopes AS cs ON cs.id = p.control_scope_id
WHERE mpu.approval_status = 'submitted' AND mpu.verified_by IS NULL
UNION ALL
SELECT
  scr.id, cs.legal_entity_id, 'schedule_extension'::public.approval_item_type,
  scr.reason, scr.reason,
  scr.requester_id, scr.approval_status, scr.created_at, NULL::DATE
FROM public.schedule_change_requests AS scr
JOIN public.projects AS p ON p.id = scr.project_id
JOIN public.control_scopes AS cs ON cs.id = p.control_scope_id
WHERE scr.approval_status = 'submitted'
UNION ALL
SELECT
  ve.id, ve.legal_entity_id, 'variance_explanation'::public.approval_item_type,
  ve.cause, ve.cause,
  ve.responsible_owner_id, ve.approval_status, ve.created_at, ve.target_resolution_date
FROM public.variance_explanations AS ve
WHERE ve.approval_status = 'submitted'
UNION ALL
SELECT
  ad.id, ad.legal_entity_id, 'delegation'::public.approval_item_type,
  ad.workflow_type, ad.workflow_type,
  ad.delegator_id, 'submitted'::public.approval_status, ad.created_at, ad.effective_end::DATE
FROM public.approval_delegations AS ad
WHERE ad.delegation_status = 'submitted'
UNION ALL
SELECT
  pr.id, pr.legal_entity_id, 'purchase_requisition'::public.approval_item_type,
  pr.title_en, pr.title_ar,
  pr.requester_id, 'submitted'::public.approval_status, pr.submitted_at, NULL::DATE
FROM public.purchase_requisitions AS pr
WHERE pr.requisition_status IN ('submitted', 'procurement_review')
UNION ALL
SELECT
  arv.id, arv.legal_entity_id, 'approval_rule'::public.approval_item_type,
  arv.workflow_type, arv.workflow_type,
  arv.created_by, 'submitted'::public.approval_status, arv.created_at, NULL::DATE
FROM public.approval_rule_versions AS arv
WHERE arv.governance_status = 'submitted';

COMMENT ON VIEW public.v_approval_inbox IS '@classification data_api_exposed; authenticated only; security_invoker aggregate; includes P5 delegation, requisition, and approval-rule items';
