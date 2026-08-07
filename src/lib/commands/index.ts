import type { SupabaseClient } from "@supabase/supabase-js";
import type { ApprovalStatus } from "@/types/database";
import { DataAccessError } from "@/data/repositories/budget-repository";
import { assertCommandOk, type CommandOptions, type CommandResult } from "@/lib/commands/types";

async function invokeRpc<T extends CommandResult>(
  db: SupabaseClient,
  fn: string,
  args: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await db.rpc(fn, args);
  if (error) {
    const msg = error.message ?? "Database error";
    if (/cycle|own parent|weights must|READINESS|CHECKLIST/i.test(msg)) {
      throw new DataAccessError(msg, "VALIDATION");
    }
    throw new DataAccessError(msg, "DATABASE");
  }
  if (!data || typeof data !== "object") {
    throw new DataAccessError("Invalid command response", "DATABASE");
  }
  const result = data as T;
  if (!result.ok) {
    const code = result.error_code ?? "COMMAND_FAILED";
    if (code === "NOT_FOUND") throw new DataAccessError(result.message ?? "Not found", "NOT_FOUND");
    if (
      code === "STATE_MISMATCH" ||
      code === "STATE_CONFLICT" ||
      code === "SCOPE_MISMATCH" ||
      code === "INVALID_TRANSITION" ||
      code === "INVALID_STATE" ||
      code === "VALIDATION" ||
      code === "RECONCILIATION" ||
      code === "READINESS" ||
      code === "CHECKLIST" ||
      code === "CYCLE" ||
      code === "PERIOD_CLOSED"
    ) {
      throw new DataAccessError(result.message ?? "Validation failed", "VALIDATION");
    }
    if (code === "FORBIDDEN" || code === "SOD_VIOLATION" || code === "UNAUTHENTICATED") {
      throw new DataAccessError(result.message ?? "Forbidden", "FORBIDDEN");
    }
    if (code === "CONFLICT") throw new DataAccessError(result.message ?? "Conflict", "CONFLICT");
    throw new DataAccessError(result.message ?? "Command failed", "DATABASE");
  }
  return result;
}

export async function budgetSubmit(
  db: SupabaseClient,
  budgetVersionId: string,
  options: CommandOptions = {},
) {
  return assertCommandOk(
    await invokeRpc(db, "rpc_budget_submit", {
      p_budget_version_id: budgetVersionId,
      p_expected_status: options.expectedStatus ?? "draft",
      p_idempotency_key: options.idempotencyKey ?? null,
      p_correlation_id: options.correlationId ?? null,
    }),
  );
}

export async function budgetStartReview(
  db: SupabaseClient,
  budgetVersionId: string,
  options: CommandOptions = {},
) {
  return assertCommandOk(
    await invokeRpc(db, "rpc_budget_start_review", {
      p_budget_version_id: budgetVersionId,
      p_expected_status: options.expectedStatus ?? "submitted",
      p_idempotency_key: options.idempotencyKey ?? null,
      p_correlation_id: options.correlationId ?? null,
    }),
  );
}

export async function budgetReject(
  db: SupabaseClient,
  budgetVersionId: string,
  options: CommandOptions = {},
) {
  return assertCommandOk(
    await invokeRpc(db, "rpc_budget_reject", {
      p_budget_version_id: budgetVersionId,
      p_expected_status: options.expectedStatus ?? "under_review",
      p_idempotency_key: options.idempotencyKey ?? null,
      p_correlation_id: options.correlationId ?? null,
    }),
  );
}

export async function budgetApproveAndLock(
  db: SupabaseClient,
  budgetVersionId: string,
  options: CommandOptions = {},
) {
  return assertCommandOk(
    await invokeRpc(db, "rpc_budget_approve_and_lock", {
      p_budget_version_id: budgetVersionId,
      p_expected_status: options.expectedStatus ?? "under_review",
      p_idempotency_key: options.idempotencyKey ?? null,
      p_correlation_id: options.correlationId ?? null,
    }),
  );
}

export async function budgetApproveChangeRequest(
  db: SupabaseClient,
  changeRequestId: string,
  options: CommandOptions = {},
) {
  return assertCommandOk(
    await invokeRpc(db, "rpc_budget_approve_change_request", {
      p_change_request_id: changeRequestId,
      p_expected_status: options.expectedStatus ?? "submitted",
      p_idempotency_key: options.idempotencyKey ?? null,
      p_correlation_id: options.correlationId ?? null,
    }),
  );
}

export async function importReviewBatch(
  db: SupabaseClient,
  batchId: string,
  options: CommandOptions = {},
) {
  return assertCommandOk(
    await invokeRpc(db, "rpc_import_review_batch", {
      p_batch_id: batchId,
      p_expected_status: options.expectedStatus ?? "submitted",
      p_idempotency_key: options.idempotencyKey ?? null,
    }),
  );
}

export async function importPostBatch(
  db: SupabaseClient,
  batchId: string,
  options: CommandOptions = {},
) {
  return assertCommandOk(
    await invokeRpc(db, "rpc_import_post_batch", {
      p_batch_id: batchId,
      p_expected_status: options.expectedStatus ?? "under_review",
      p_idempotency_key: options.idempotencyKey ?? null,
      p_correlation_id: options.correlationId ?? null,
    }),
  );
}

export async function postActualTransaction(
  db: SupabaseClient,
  transactionId: string,
  options: CommandOptions = {},
) {
  return assertCommandOk(
    await invokeRpc(db, "rpc_post_actual_transaction", {
      p_transaction_id: transactionId,
      p_idempotency_key: options.idempotencyKey ?? null,
      p_correlation_id: options.correlationId ?? null,
    }),
  );
}

export async function reverseActualTransaction(
  db: SupabaseClient,
  originalTransactionId: string,
  reason: string,
  options: CommandOptions = {},
) {
  return assertCommandOk(
    await invokeRpc(db, "rpc_reverse_actual_transaction", {
      p_original_transaction_id: originalTransactionId,
      p_reason: reason,
      p_idempotency_key: options.idempotencyKey ?? null,
      p_correlation_id: options.correlationId ?? null,
    }),
  );
}

export async function submitProgressCommand(
  db: SupabaseClient,
  params: {
    milestoneId: string;
    reportedProgress: number;
    notes?: string;
    evidenceDescription?: string;
  },
  options: CommandOptions = {},
) {
  return assertCommandOk(
    await invokeRpc(db, "rpc_submit_progress", {
      p_milestone_id: params.milestoneId,
      p_reported_progress: params.reportedProgress,
      p_notes: params.notes ?? null,
      p_evidence_description: params.evidenceDescription ?? null,
      p_idempotency_key: options.idempotencyKey ?? null,
      p_correlation_id: options.correlationId ?? null,
    }),
  );
}

export async function verifyProgressCommand(
  db: SupabaseClient,
  params: { progressUpdateId: string; verifiedProgress: number },
  options: CommandOptions = {},
) {
  return assertCommandOk(
    await invokeRpc(db, "rpc_verify_progress", {
      p_progress_update_id: params.progressUpdateId,
      p_verified_progress: params.verifiedProgress,
      p_expected_status: options.expectedStatus ?? "submitted",
      p_idempotency_key: options.idempotencyKey ?? null,
      p_correlation_id: options.correlationId ?? null,
    }),
  );
}

export async function acceptMilestoneCommand(
  db: SupabaseClient,
  milestoneId: string,
  options: CommandOptions = {},
) {
  return assertCommandOk(
    await invokeRpc(db, "rpc_accept_milestone", {
      p_milestone_id: milestoneId,
      p_expected_status: options.expectedStatus ?? "approved",
      p_idempotency_key: options.idempotencyKey ?? null,
      p_correlation_id: options.correlationId ?? null,
    }),
  );
}

export async function scheduleApproveExtension(
  db: SupabaseClient,
  params: { requestId: string; approvedDays: number },
  options: CommandOptions = {},
) {
  return assertCommandOk(
    await invokeRpc(db, "rpc_schedule_approve_extension", {
      p_request_id: params.requestId,
      p_approved_days: params.approvedDays,
      p_expected_status: options.expectedStatus ?? "submitted",
      p_idempotency_key: options.idempotencyKey ?? null,
      p_correlation_id: options.correlationId ?? null,
    }),
  );
}

export interface ForecastLineInput {
  organizationUnitId?: string;
  costNodeId?: string;
  fiscalPeriodId: string;
  controlAccountId?: string;
  projectId?: string;
  workPackageId?: string;
  forecastAmount: string;
  quantity?: string;
  unitRate?: string;
  assumption?: string;
  forecastToComplete?: string;
  confidence?: string;
}

function toForecastLineJson(line: ForecastLineInput) {
  return {
    organization_unit_id: line.organizationUnitId ?? "",
    cost_node_id: line.costNodeId ?? "",
    fiscal_period_id: line.fiscalPeriodId,
    control_account_id: line.controlAccountId ?? "",
    project_id: line.projectId ?? "",
    work_package_id: line.workPackageId ?? "",
    forecast_amount: line.forecastAmount,
    quantity: line.quantity ?? "",
    unit_rate: line.unitRate ?? "",
    assumption: line.assumption ?? "",
    forecast_to_complete: line.forecastToComplete ?? "",
    confidence: line.confidence ?? "",
  };
}

export async function forecastCreateDraft(
  db: SupabaseClient,
  params: {
    legalEntityId: string;
    controlScopeId: string;
    fiscalYearId: string;
    versionLabel: string;
    scenario?: string;
    projectId?: string;
    controlAccountId?: string;
    assumptions?: string;
    lines: ForecastLineInput[];
  },
  options: CommandOptions = {},
) {
  return assertCommandOk(
    await invokeRpc(db, "rpc_forecast_create_draft", {
      p_legal_entity_id: params.legalEntityId,
      p_control_scope_id: params.controlScopeId,
      p_fiscal_year_id: params.fiscalYearId,
      p_version_label: params.versionLabel,
      p_scenario: params.scenario ?? "latest",
      p_project_id: params.projectId ?? null,
      p_control_account_id: params.controlAccountId ?? null,
      p_assumptions: params.assumptions ?? null,
      p_lines: params.lines.map(toForecastLineJson),
      p_idempotency_key: options.idempotencyKey ?? null,
      p_correlation_id: options.correlationId ?? null,
    }),
  );
}

export async function forecastUpdateDraft(
  db: SupabaseClient,
  params: {
    forecastVersionId: string;
    expectedRowVersion: number;
    versionLabel?: string;
    assumptions?: string;
    lines?: ForecastLineInput[];
  },
  options: CommandOptions = {},
) {
  return assertCommandOk(
    await invokeRpc(db, "rpc_forecast_update_draft", {
      p_forecast_version_id: params.forecastVersionId,
      p_expected_row_version: params.expectedRowVersion,
      p_version_label: params.versionLabel ?? null,
      p_assumptions: params.assumptions ?? null,
      p_lines: params.lines ? params.lines.map(toForecastLineJson) : null,
      p_idempotency_key: options.idempotencyKey ?? null,
      p_correlation_id: options.correlationId ?? null,
    }),
  );
}

export async function forecastSubmit(
  db: SupabaseClient,
  forecastVersionId: string,
  options: CommandOptions = {},
) {
  return assertCommandOk(
    await invokeRpc(db, "rpc_forecast_submit", {
      p_forecast_version_id: forecastVersionId,
      p_expected_status: options.expectedStatus ?? "draft",
      p_idempotency_key: options.idempotencyKey ?? null,
      p_correlation_id: options.correlationId ?? null,
    }),
  );
}

export async function forecastStartReview(
  db: SupabaseClient,
  forecastVersionId: string,
  options: CommandOptions = {},
) {
  return assertCommandOk(
    await invokeRpc(db, "rpc_forecast_start_review", {
      p_forecast_version_id: forecastVersionId,
      p_expected_status: options.expectedStatus ?? "submitted",
      p_idempotency_key: options.idempotencyKey ?? null,
      p_correlation_id: options.correlationId ?? null,
    }),
  );
}

export async function forecastReject(
  db: SupabaseClient,
  forecastVersionId: string,
  options: CommandOptions = {},
) {
  return assertCommandOk(
    await invokeRpc(db, "rpc_forecast_reject", {
      p_forecast_version_id: forecastVersionId,
      p_expected_status: options.expectedStatus ?? "under_review",
      p_idempotency_key: options.idempotencyKey ?? null,
      p_correlation_id: options.correlationId ?? null,
    }),
  );
}

export async function forecastCancel(
  db: SupabaseClient,
  forecastVersionId: string,
  options: CommandOptions = {},
) {
  return assertCommandOk(
    await invokeRpc(db, "rpc_forecast_cancel", {
      p_forecast_version_id: forecastVersionId,
      p_expected_status: options.expectedStatus ?? "draft",
      p_idempotency_key: options.idempotencyKey ?? null,
      p_correlation_id: options.correlationId ?? null,
    }),
  );
}

export async function forecastApproveAndLock(
  db: SupabaseClient,
  forecastVersionId: string,
  options: CommandOptions = {},
) {
  return assertCommandOk(
    await invokeRpc(db, "rpc_forecast_approve_and_lock", {
      p_forecast_version_id: forecastVersionId,
      p_expected_status: options.expectedStatus ?? "under_review",
      p_idempotency_key: options.idempotencyKey ?? null,
      p_correlation_id: options.correlationId ?? null,
    }),
  );
}

export async function forecastApproveAndSupersede(
  db: SupabaseClient,
  params: {
    newForecastVersionId: string;
    supersededForecastVersionId: string;
    approverComment: string;
    expectedNewStatus?: ApprovalStatus;
    idempotencyKey?: string;
    correlationId?: string;
  },
) {
  return assertCommandOk(
    await invokeRpc(db, "rpc_forecast_approve_and_supersede", {
      p_new_forecast_version_id: params.newForecastVersionId,
      p_superseded_forecast_version_id: params.supersededForecastVersionId,
      p_expected_new_status: params.expectedNewStatus ?? "under_review",
      p_approver_comment: params.approverComment,
      p_idempotency_key: params.idempotencyKey ?? null,
      p_correlation_id: params.correlationId ?? null,
    }),
  );
}

export type { ApprovalStatus, CommandOptions, CommandResult };

export async function masterRecordCreateDraft(
  db: SupabaseClient,
  params: {
    legalEntityId: string;
    recordType: string;
    code: string;
    nameEn: string;
    nameAr: string;
    description?: string;
    parentId?: string;
    attributes?: Record<string, unknown>;
    changeReason?: string;
    idempotencyKey?: string;
    correlationId?: string;
  },
) {
  return assertCommandOk(
    await invokeRpc(db, "rpc_master_record_create_draft", {
      p_legal_entity_id: params.legalEntityId,
      p_record_type: params.recordType,
      p_code: params.code,
      p_name_en: params.nameEn,
      p_name_ar: params.nameAr,
      p_description: params.description ?? null,
      p_parent_id: params.parentId ?? null,
      p_attributes: params.attributes ?? {},
      p_change_reason: params.changeReason ?? null,
      p_idempotency_key: params.idempotencyKey ?? null,
      p_correlation_id: params.correlationId ?? null,
    }),
  );
}

export async function masterRecordCreateRevision(
  db: SupabaseClient,
  params: {
    recordId: string;
    nameEn: string;
    nameAr: string;
    description?: string;
    parentId?: string;
    attributes?: Record<string, unknown>;
    effectiveStart?: string;
    effectiveEnd?: string;
    changeReason: string;
    idempotencyKey?: string;
    correlationId?: string;
  },
) {
  return assertCommandOk(
    await invokeRpc(db, "rpc_master_record_create_revision", {
      p_record_id: params.recordId,
      p_name_en: params.nameEn,
      p_name_ar: params.nameAr,
      p_description: params.description ?? null,
      p_parent_id: params.parentId ?? null,
      p_attributes: params.attributes ?? {},
      p_effective_start: params.effectiveStart ?? null,
      p_effective_end: params.effectiveEnd ?? null,
      p_change_reason: params.changeReason,
      p_idempotency_key: params.idempotencyKey ?? null,
      p_correlation_id: params.correlationId ?? null,
    }),
  );
}

export async function delegationCreateDraft(
  db: SupabaseClient,
  params: {
    legalEntityId: string;
    delegateId: string;
    workflowType: string;
    permissionCode: string;
    effectiveStart: string;
    effectiveEnd: string;
    reason: string;
    controlScopeId?: string;
    financialThreshold?: string;
    idempotencyKey?: string;
  },
) {
  return assertCommandOk(
    await invokeRpc(db, "rpc_delegation_create_draft", {
      p_legal_entity_id: params.legalEntityId,
      p_delegate_id: params.delegateId,
      p_control_scope_id: params.controlScopeId ?? null,
      p_workflow_type: params.workflowType,
      p_permission_code: params.permissionCode,
      p_financial_threshold: params.financialThreshold ?? null,
      p_effective_start: params.effectiveStart,
      p_effective_end: params.effectiveEnd,
      p_reason: params.reason,
      p_idempotency_key: params.idempotencyKey ?? null,
      p_correlation_id: null,
    }),
  );
}

export async function requisitionCreateDraft(
  db: SupabaseClient,
  params: {
    legalEntityId: string;
    requisitionNumber: string;
    titleEn: string;
    titleAr: string;
    controlScopeId?: string;
    fiscalPeriodId?: string;
    idempotencyKey?: string;
  },
) {
  return assertCommandOk(
    await invokeRpc(db, "rpc_requisition_create_draft", {
      p_legal_entity_id: params.legalEntityId,
      p_requisition_number: params.requisitionNumber,
      p_title_en: params.titleEn,
      p_title_ar: params.titleAr,
      p_control_scope_id: params.controlScopeId ?? null,
      p_cost_node_id: null,
      p_fiscal_period_id: params.fiscalPeriodId ?? null,
      p_idempotency_key: params.idempotencyKey ?? null,
      p_correlation_id: null,
    }),
  );
}

export async function requisitionSubmit(
  db: SupabaseClient,
  requisitionId: string,
  options: CommandOptions = {},
) {
  return assertCommandOk(
    await invokeRpc(db, "rpc_requisition_submit", {
      p_requisition_id: requisitionId,
      p_expected_status: options.expectedStatus ?? "draft",
      p_idempotency_key: options.idempotencyKey ?? null,
      p_correlation_id: options.correlationId ?? null,
    }),
  );
}

export async function requisitionUpsertLine(
  db: SupabaseClient,
  params: {
    requisitionId: string;
    lineNumber: number;
    description: string;
    quantity: string | number;
    unitPrice: string | number;
    costNodeId?: string;
    uom?: string;
    organizationUnitId?: string;
    preferredVendorId?: string;
    requiredBy?: string;
    lineId?: string;
    idempotencyKey?: string;
  },
) {
  return assertCommandOk(
    await invokeRpc(db, "rpc_requisition_upsert_line", {
      p_requisition_id: params.requisitionId,
      p_line_number: params.lineNumber,
      p_description: params.description,
      p_quantity: params.quantity,
      p_unit_price: params.unitPrice,
      p_cost_node_id: params.costNodeId ?? null,
      p_uom: params.uom ?? null,
      p_organization_unit_id: params.organizationUnitId ?? null,
      p_preferred_vendor_id: params.preferredVendorId ?? null,
      p_required_by: params.requiredBy ?? null,
      p_line_id: params.lineId ?? null,
      p_idempotency_key: params.idempotencyKey ?? null,
      p_correlation_id: null,
    }),
  );
}

export async function requisitionDepartmentApprove(
  db: SupabaseClient,
  requisitionId: string,
  options: CommandOptions = {},
) {
  return assertCommandOk(
    await invokeRpc(db, "rpc_requisition_department_approve", {
      p_requisition_id: requisitionId,
      p_expected_status: options.expectedStatus ?? "submitted",
      p_idempotency_key: options.idempotencyKey ?? null,
      p_correlation_id: options.correlationId ?? null,
    }),
  );
}

export async function requisitionBudgetCheck(
  db: SupabaseClient,
  requisitionId: string,
  options: CommandOptions = {},
) {
  return assertCommandOk(
    await invokeRpc(db, "rpc_requisition_budget_check", {
      p_requisition_id: requisitionId,
      p_expected_status: options.expectedStatus ?? "department_approved",
      p_idempotency_key: options.idempotencyKey ?? null,
      p_correlation_id: options.correlationId ?? null,
    }),
  );
}

export async function requisitionProcurementReview(
  db: SupabaseClient,
  requisitionId: string,
  options: CommandOptions = {},
) {
  return assertCommandOk(
    await invokeRpc(db, "rpc_requisition_procurement_review", {
      p_requisition_id: requisitionId,
      p_expected_status: options.expectedStatus ?? "budget_checked",
      p_idempotency_key: options.idempotencyKey ?? null,
      p_correlation_id: options.correlationId ?? null,
    }),
  );
}

export async function requisitionApprove(
  db: SupabaseClient,
  requisitionId: string,
  options: CommandOptions = {},
) {
  return assertCommandOk(
    await invokeRpc(db, "rpc_requisition_approve", {
      p_requisition_id: requisitionId,
      p_expected_status: options.expectedStatus ?? "procurement_review",
      p_idempotency_key: options.idempotencyKey ?? null,
      p_correlation_id: options.correlationId ?? null,
    }),
  );
}

export async function rfqCreateFromRequisition(
  db: SupabaseClient,
  params: {
    requisitionId: string;
    rfqNumber: string;
    titleEn?: string;
    titleAr?: string;
    responseDeadline?: string;
    currencyCode?: string;
    terms?: string;
    deliveryLocation?: string;
    lineIds?: string[];
    idempotencyKey?: string;
  },
) {
  return assertCommandOk(
    await invokeRpc(db, "rpc_rfq_create_from_requisition", {
      p_requisition_id: params.requisitionId,
      p_rfq_number: params.rfqNumber,
      p_title_en: params.titleEn ?? null,
      p_title_ar: params.titleAr ?? null,
      p_response_deadline: params.responseDeadline ?? null,
      p_currency_code: params.currencyCode ?? null,
      p_terms: params.terms ?? null,
      p_delivery_location: params.deliveryLocation ?? null,
      p_line_ids: params.lineIds ?? null,
      p_idempotency_key: params.idempotencyKey ?? null,
      p_correlation_id: null,
    }),
  );
}

export async function rfqInviteSupplier(
  db: SupabaseClient,
  params: { rfqId: string; vendorId: string; idempotencyKey?: string },
) {
  return assertCommandOk(
    await invokeRpc(db, "rpc_rfq_invite_supplier", {
      p_rfq_id: params.rfqId,
      p_vendor_id: params.vendorId,
      p_idempotency_key: params.idempotencyKey ?? null,
      p_correlation_id: null,
    }),
  );
}

export async function rfqIssue(
  db: SupabaseClient,
  params: {
    rfqId: string;
    issueDate?: string;
    responseDeadline?: string;
    idempotencyKey?: string;
  },
) {
  return assertCommandOk(
    await invokeRpc(db, "rpc_rfq_issue", {
      p_rfq_id: params.rfqId,
      p_issue_date: params.issueDate ?? null,
      p_response_deadline: params.responseDeadline ?? null,
      p_idempotency_key: params.idempotencyKey ?? null,
      p_correlation_id: null,
    }),
  );
}

export async function rfqCloseResponses(
  db: SupabaseClient,
  rfqId: string,
  options: CommandOptions = {},
) {
  return assertCommandOk(
    await invokeRpc(db, "rpc_rfq_close_responses", {
      p_rfq_id: rfqId,
      p_idempotency_key: options.idempotencyKey ?? null,
      p_correlation_id: options.correlationId ?? null,
    }),
  );
}

export async function quotationCreate(
  db: SupabaseClient,
  params: {
    rfqId: string;
    vendorId: string;
    supplierQuoteReference: string;
    lines: unknown[];
    currencyCode?: string;
    validUntil?: string;
    paymentTerms?: string;
    deliveryTerms?: string;
    vatAmount?: string | number;
    notes?: string;
    idempotencyKey?: string;
  },
) {
  return assertCommandOk(
    await invokeRpc(db, "rpc_quotation_create", {
      p_rfq_id: params.rfqId,
      p_vendor_id: params.vendorId,
      p_supplier_quote_reference: params.supplierQuoteReference,
      p_lines: params.lines,
      p_currency_code: params.currencyCode ?? null,
      p_valid_until: params.validUntil ?? null,
      p_payment_terms: params.paymentTerms ?? null,
      p_delivery_terms: params.deliveryTerms ?? null,
      p_vat_amount: params.vatAmount ?? 0,
      p_notes: params.notes ?? null,
      p_idempotency_key: params.idempotencyKey ?? null,
      p_correlation_id: null,
    }),
  );
}

export async function evaluationSubmit(
  db: SupabaseClient,
  params: {
    rfqId: string;
    quotationId: string;
    scores: unknown[];
    criteria?: unknown[];
    recommendation?: string;
    comments?: string;
    idempotencyKey?: string;
  },
) {
  return assertCommandOk(
    await invokeRpc(db, "rpc_evaluation_submit", {
      p_rfq_id: params.rfqId,
      p_quotation_id: params.quotationId,
      p_scores: params.scores,
      p_criteria: params.criteria ?? null,
      p_recommendation: params.recommendation ?? null,
      p_comments: params.comments ?? null,
      p_idempotency_key: params.idempotencyKey ?? null,
      p_correlation_id: null,
    }),
  );
}

export async function awardCreateAndSubmit(
  db: SupabaseClient,
  params: {
    rfqId: string;
    quotationId: string;
    lines: unknown[];
    justification?: string;
    evaluationId?: string;
    idempotencyKey?: string;
  },
) {
  return assertCommandOk(
    await invokeRpc(db, "rpc_award_create_and_submit", {
      p_rfq_id: params.rfqId,
      p_quotation_id: params.quotationId,
      p_lines: params.lines,
      p_justification: params.justification ?? null,
      p_evaluation_id: params.evaluationId ?? null,
      p_idempotency_key: params.idempotencyKey ?? null,
      p_correlation_id: null,
    }),
  );
}

export async function awardApprove(
  db: SupabaseClient,
  awardId: string,
  options: CommandOptions = {},
) {
  return assertCommandOk(
    await invokeRpc(db, "rpc_award_approve", {
      p_award_id: awardId,
      p_expected_status: options.expectedStatus ?? "submitted",
      p_idempotency_key: options.idempotencyKey ?? null,
      p_correlation_id: options.correlationId ?? null,
    }),
  );
}

export async function poCreateFromAward(
  db: SupabaseClient,
  params: {
    awardId: string;
    fiscalPeriodId?: string;
    description?: string;
    idempotencyKey?: string;
  },
) {
  return assertCommandOk(
    await invokeRpc(db, "rpc_po_create_from_award", {
      p_award_id: params.awardId,
      p_fiscal_period_id: params.fiscalPeriodId ?? null,
      p_description: params.description ?? null,
      p_idempotency_key: params.idempotencyKey ?? null,
      p_correlation_id: null,
    }),
  );
}

export async function poSubmit(
  db: SupabaseClient,
  poId: string,
  options: CommandOptions = {},
) {
  return assertCommandOk(
    await invokeRpc(db, "rpc_po_submit", {
      p_po_id: poId,
      p_expected_status: options.expectedStatus ?? "draft",
      p_idempotency_key: options.idempotencyKey ?? null,
      p_correlation_id: options.correlationId ?? null,
    }),
  );
}

export async function poApprove(
  db: SupabaseClient,
  poId: string,
  options: CommandOptions = {},
) {
  return assertCommandOk(
    await invokeRpc(db, "rpc_po_approve", {
      p_po_id: poId,
      p_expected_status: options.expectedStatus ?? "submitted",
      p_idempotency_key: options.idempotencyKey ?? null,
      p_correlation_id: options.correlationId ?? null,
    }),
  );
}

export async function poIssue(
  db: SupabaseClient,
  poId: string,
  options: CommandOptions = {},
) {
  return assertCommandOk(
    await invokeRpc(db, "rpc_po_issue", {
      p_po_id: poId,
      p_expected_status: options.expectedStatus ?? "approved",
      p_idempotency_key: options.idempotencyKey ?? null,
      p_correlation_id: options.correlationId ?? null,
    }),
  );
}

export async function poCancel(
  db: SupabaseClient,
  params: {
    poId: string;
    reason?: string;
    expectedStatus?: string;
    idempotencyKey?: string;
  },
) {
  return assertCommandOk(
    await invokeRpc(db, "rpc_po_cancel", {
      p_po_id: params.poId,
      p_reason: params.reason ?? null,
      p_expected_status: params.expectedStatus ?? null,
      p_idempotency_key: params.idempotencyKey ?? null,
      p_correlation_id: null,
    }),
  );
}

export async function contractCreate(
  db: SupabaseClient,
  params: {
    legalEntityId: string;
    vendorId: string;
    contractNumber: string;
    titleEn: string;
    titleAr: string;
    startDate: string;
    endDate: string;
    ceilingValue?: string | number;
    awardId?: string;
    currencyCode?: string;
    controlScopeId?: string;
    idempotencyKey?: string;
  },
) {
  return assertCommandOk(
    await invokeRpc(db, "rpc_contract_create", {
      p_legal_entity_id: params.legalEntityId,
      p_vendor_id: params.vendorId,
      p_contract_number: params.contractNumber,
      p_title_en: params.titleEn,
      p_title_ar: params.titleAr,
      p_start_date: params.startDate,
      p_end_date: params.endDate,
      p_ceiling_value: params.ceilingValue ?? 0,
      p_award_id: params.awardId ?? null,
      p_currency_code: params.currencyCode ?? "SAR",
      p_control_scope_id: params.controlScopeId ?? null,
      p_idempotency_key: params.idempotencyKey ?? null,
      p_correlation_id: null,
    }),
  );
}

export async function contractApprove(
  db: SupabaseClient,
  contractId: string,
  options: CommandOptions = {},
) {
  return assertCommandOk(
    await invokeRpc(db, "rpc_contract_approve", {
      p_contract_id: contractId,
      p_expected_status: options.expectedStatus ?? "submitted",
      p_idempotency_key: options.idempotencyKey ?? null,
      p_correlation_id: options.correlationId ?? null,
    }),
  );
}

export async function contractSubmit(
  db: SupabaseClient,
  contractId: string,
  options: CommandOptions = {},
) {
  return assertCommandOk(
    await invokeRpc(db, "rpc_contract_submit", {
      p_contract_id: contractId,
      p_expected_status: options.expectedStatus ?? "draft",
      p_idempotency_key: options.idempotencyKey ?? null,
      p_correlation_id: options.correlationId ?? null,
    }),
  );
}

export async function contractActivate(
  db: SupabaseClient,
  contractId: string,
  options: CommandOptions = {},
) {
  return assertCommandOk(
    await invokeRpc(db, "rpc_contract_activate", {
      p_contract_id: contractId,
      p_expected_status: options.expectedStatus ?? "approved",
      p_idempotency_key: options.idempotencyKey ?? null,
      p_correlation_id: options.correlationId ?? null,
    }),
  );
}

async function contractTerminalTransition(
  db: SupabaseClient,
  rpc: "rpc_contract_reject" | "rpc_contract_close" | "rpc_contract_terminate" | "rpc_contract_expire",
  contractId: string,
  expectedStatus: string,
  options: CommandOptions = {},
) {
  return assertCommandOk(
    await invokeRpc(db, rpc, {
      p_contract_id: contractId,
      p_expected_status: options.expectedStatus ?? expectedStatus,
      p_idempotency_key: options.idempotencyKey ?? null,
      p_correlation_id: options.correlationId ?? null,
    }),
  );
}

export async function contractReject(db: SupabaseClient, contractId: string, options: CommandOptions = {}) {
  return contractTerminalTransition(db, "rpc_contract_reject", contractId, "submitted", options);
}

export async function contractClose(db: SupabaseClient, contractId: string, options: CommandOptions = {}) {
  return contractTerminalTransition(db, "rpc_contract_close", contractId, "active", options);
}

export async function contractTerminate(db: SupabaseClient, contractId: string, options: CommandOptions = {}) {
  return contractTerminalTransition(db, "rpc_contract_terminate", contractId, "active", options);
}

export async function contractExpire(db: SupabaseClient, contractId: string, options: CommandOptions = {}) {
  return contractTerminalTransition(db, "rpc_contract_expire", contractId, "active", options);
}

export async function goodsReceiptCreate(
  db: SupabaseClient,
  params: {
    purchaseOrderId: string;
    receiptNumber: string;
    receiptDate?: string;
    deliveryNote?: string;
    lines?: unknown[];
    fiscalPeriodId?: string;
    idempotencyKey?: string;
  },
) {
  return assertCommandOk(
    await invokeRpc(db, "rpc_goods_receipt_create", {
      p_purchase_order_id: params.purchaseOrderId,
      p_receipt_number: params.receiptNumber,
      p_receipt_date: params.receiptDate ?? null,
      p_delivery_note: params.deliveryNote ?? null,
      p_lines: params.lines ?? [],
      p_fiscal_period_id: params.fiscalPeriodId ?? null,
      p_idempotency_key: params.idempotencyKey ?? null,
      p_correlation_id: null,
    }),
  );
}

export async function goodsReceiptAccept(
  db: SupabaseClient,
  goodsReceiptId: string,
  options: CommandOptions = {},
) {
  return assertCommandOk(
    await invokeRpc(db, "rpc_goods_receipt_accept", {
      p_goods_receipt_id: goodsReceiptId,
      p_expected_status: options.expectedStatus ?? "draft",
      p_idempotency_key: options.idempotencyKey ?? null,
      p_correlation_id: options.correlationId ?? null,
    }),
  );
}

export async function serviceEntryCreate(
  db: SupabaseClient,
  params: {
    legalEntityId: string;
    vendorId: string;
    entryNumber: string;
    description: string;
    purchaseOrderId?: string;
    contractId?: string;
    lines?: unknown[];
    fiscalPeriodId?: string;
    idempotencyKey?: string;
  },
) {
  return assertCommandOk(
    await invokeRpc(db, "rpc_service_entry_create", {
      p_legal_entity_id: params.legalEntityId,
      p_vendor_id: params.vendorId,
      p_entry_number: params.entryNumber,
      p_description: params.description,
      p_purchase_order_id: params.purchaseOrderId ?? null,
      p_contract_id: params.contractId ?? null,
      p_lines: params.lines ?? [],
      p_fiscal_period_id: params.fiscalPeriodId ?? null,
      p_idempotency_key: params.idempotencyKey ?? null,
      p_correlation_id: null,
    }),
  );
}

export async function serviceEntryAccept(
  db: SupabaseClient,
  serviceEntryId: string,
  options: CommandOptions = {},
) {
  return assertCommandOk(
    await invokeRpc(db, "rpc_service_entry_accept", {
      p_service_entry_id: serviceEntryId,
      p_expected_status: options.expectedStatus ?? "draft",
      p_idempotency_key: options.idempotencyKey ?? null,
      p_correlation_id: options.correlationId ?? null,
    }),
  );
}

export async function supplierInvoiceCreate(
  db: SupabaseClient,
  params: {
    legalEntityId: string;
    purchaseOrderId: string;
    vendorId: string;
    invoiceNumber: string;
    invoiceDate: string;
    grossAmount: string | number;
    subtotalExVat?: string | number;
    vatAmount?: string | number;
    dueDate?: string;
    lines?: unknown[];
    fiscalPeriodId?: string;
    idempotencyKey?: string;
  },
) {
  return assertCommandOk(
    await invokeRpc(db, "rpc_supplier_invoice_create", {
      p_legal_entity_id: params.legalEntityId,
      p_purchase_order_id: params.purchaseOrderId,
      p_vendor_id: params.vendorId,
      p_invoice_number: params.invoiceNumber,
      p_invoice_date: params.invoiceDate,
      p_gross_amount: params.grossAmount,
      p_subtotal_ex_vat: params.subtotalExVat ?? null,
      p_vat_amount: params.vatAmount ?? 0,
      p_due_date: params.dueDate ?? null,
      p_lines: params.lines ?? [],
      p_fiscal_period_id: params.fiscalPeriodId ?? null,
      p_idempotency_key: params.idempotencyKey ?? null,
      p_correlation_id: null,
    }),
  );
}

export async function supplierInvoiceMatch(
  db: SupabaseClient,
  supplierInvoiceId: string,
  options: CommandOptions = {},
) {
  return assertCommandOk(
    await invokeRpc(db, "rpc_supplier_invoice_match", {
      p_supplier_invoice_id: supplierInvoiceId,
      p_idempotency_key: options.idempotencyKey ?? null,
      p_correlation_id: options.correlationId ?? null,
    }),
  );
}

export async function invoiceMatchOverride(
  db: SupabaseClient,
  params: { supplierInvoiceId: string; reason: string; idempotencyKey?: string },
) {
  return assertCommandOk(
    await invokeRpc(db, "rpc_invoice_match_override", {
      p_supplier_invoice_id: params.supplierInvoiceId,
      p_reason: params.reason,
      p_idempotency_key: params.idempotencyKey ?? null,
      p_correlation_id: null,
    }),
  );
}

export async function supplierInvoiceApprove(
  db: SupabaseClient,
  supplierInvoiceId: string,
  options: CommandOptions = {},
) {
  return assertCommandOk(
    await invokeRpc(db, "rpc_supplier_invoice_approve", {
      p_supplier_invoice_id: supplierInvoiceId,
      p_expected_status: options.expectedStatus ?? "matched",
      p_idempotency_key: options.idempotencyKey ?? null,
      p_correlation_id: options.correlationId ?? null,
    }),
  );
}

export async function supplierInvoiceReverseAndReplace(
  db: SupabaseClient,
  params: {
    supplierInvoiceId: string;
    reason: string;
    replacementInvoiceNumber?: string;
    replacementInvoiceDate?: string;
    idempotencyKey?: string;
    correlationId?: string;
  },
) {
  return assertCommandOk(
    await invokeRpc(db, "rpc_supplier_invoice_reverse_and_replace", {
      p_supplier_invoice_id: params.supplierInvoiceId,
      p_reason: params.reason,
      p_replacement_invoice_number: params.replacementInvoiceNumber ?? null,
      p_replacement_invoice_date: params.replacementInvoiceDate ?? null,
      p_idempotency_key: params.idempotencyKey ?? null,
      p_correlation_id: params.correlationId ?? null,
    }),
  );
}

export async function paymentRequestCreate(
  db: SupabaseClient,
  params: {
    legalEntityId: string;
    supplierInvoiceId: string;
    amount: string | number;
    dueDate?: string;
    reason?: string;
    idempotencyKey?: string;
  },
) {
  return assertCommandOk(
    await invokeRpc(db, "rpc_payment_request_create", {
      p_legal_entity_id: params.legalEntityId,
      p_supplier_invoice_id: params.supplierInvoiceId,
      p_amount: params.amount,
      p_due_date: params.dueDate ?? null,
      p_reason: params.reason ?? null,
      p_idempotency_key: params.idempotencyKey ?? null,
      p_correlation_id: null,
    }),
  );
}

export async function paymentRequestSubmit(
  db: SupabaseClient,
  paymentRequestId: string,
  options: CommandOptions = {},
) {
  return assertCommandOk(
    await invokeRpc(db, "rpc_payment_request_submit", {
      p_payment_request_id: paymentRequestId,
      p_expected_status: options.expectedStatus ?? "draft",
      p_idempotency_key: options.idempotencyKey ?? null,
      p_correlation_id: options.correlationId ?? null,
    }),
  );
}

export async function paymentRequestApprove(
  db: SupabaseClient,
  paymentRequestId: string,
  options: CommandOptions = {},
) {
  return assertCommandOk(
    await invokeRpc(db, "rpc_payment_request_approve", {
      p_payment_request_id: paymentRequestId,
      p_expected_status: options.expectedStatus ?? "submitted",
      p_idempotency_key: options.idempotencyKey ?? null,
      p_correlation_id: options.correlationId ?? null,
    }),
  );
}

export async function paymentRequestReject(
  db: SupabaseClient,
  params: { paymentRequestId: string; reason: string; idempotencyKey?: string; correlationId?: string },
) {
  return assertCommandOk(
    await invokeRpc(db, "rpc_payment_request_reject", {
      p_payment_request_id: params.paymentRequestId,
      p_reason: params.reason,
      p_expected_status: "submitted",
      p_idempotency_key: params.idempotencyKey ?? null,
      p_correlation_id: params.correlationId ?? null,
    }),
  );
}

export async function paymentRequestCancel(
  db: SupabaseClient,
  params: {
    paymentRequestId: string;
    reason: string;
    expectedStatus: "draft" | "submitted" | "approved";
    idempotencyKey?: string;
    correlationId?: string;
  },
) {
  return assertCommandOk(
    await invokeRpc(db, "rpc_payment_request_cancel", {
      p_payment_request_id: params.paymentRequestId,
      p_reason: params.reason,
      p_expected_status: params.expectedStatus,
      p_idempotency_key: params.idempotencyKey ?? null,
      p_correlation_id: params.correlationId ?? null,
    }),
  );
}

export async function periodSoftClose(
  db: SupabaseClient,
  params: { fiscalPeriodId: string; legalEntityId: string; module: string; idempotencyKey?: string },
) {
  return assertCommandOk(
    await invokeRpc(db, "rpc_period_soft_close", {
      p_fiscal_period_id: params.fiscalPeriodId,
      p_legal_entity_id: params.legalEntityId,
      p_module: params.module,
      p_idempotency_key: params.idempotencyKey ?? null,
      p_correlation_id: null,
    }),
  );
}

async function delegationTransition(
  db: SupabaseClient,
  delegationId: string,
  rpc: string,
  expectedStatus: string,
  options: CommandOptions = {},
) {
  return assertCommandOk(
    await invokeRpc(db, rpc, {
      p_delegation_id: delegationId,
      p_expected_status: expectedStatus,
      p_idempotency_key: options.idempotencyKey ?? null,
      p_correlation_id: options.correlationId ?? null,
    }),
  );
}

export async function delegationSubmit(
  db: SupabaseClient,
  delegationId: string,
  options: CommandOptions = {},
) {
  return delegationTransition(db, delegationId, "rpc_delegation_submit", options.expectedStatus ?? "draft", options);
}

export async function delegationApprove(
  db: SupabaseClient,
  delegationId: string,
  options: CommandOptions = {},
) {
  return delegationTransition(db, delegationId, "rpc_delegation_approve", options.expectedStatus ?? "submitted", options);
}

export async function delegationActivate(
  db: SupabaseClient,
  delegationId: string,
  options: CommandOptions = {},
) {
  return delegationTransition(db, delegationId, "rpc_delegation_activate", options.expectedStatus ?? "approved", options);
}

export async function delegationRevoke(
  db: SupabaseClient,
  delegationId: string,
  options: CommandOptions = {},
) {
  return delegationTransition(db, delegationId, "rpc_delegation_revoke", options.expectedStatus ?? "active", options);
}

export async function delegationCancel(
  db: SupabaseClient,
  delegationId: string,
  options: CommandOptions = {},
) {
  return delegationTransition(db, delegationId, "rpc_delegation_cancel", options.expectedStatus ?? "draft", options);
}

export async function periodHardClose(
  db: SupabaseClient,
  params: {
    fiscalPeriodId: string;
    legalEntityId: string;
    module: string;
    idempotencyKey?: string;
  },
) {
  return assertCommandOk(
    await invokeRpc(db, "rpc_period_hard_close", {
      p_fiscal_period_id: params.fiscalPeriodId,
      p_legal_entity_id: params.legalEntityId,
      p_module: params.module,
      p_expected_state: "soft_close",
      p_idempotency_key: params.idempotencyKey ?? null,
      p_correlation_id: null,
    }),
  );
}

export async function periodHardCloseGated(
  db: SupabaseClient,
  params: {
    fiscalPeriodId: string;
    legalEntityId: string;
    module: string;
    expectedState?: string;
    idempotencyKey?: string;
    correlationId?: string;
  },
) {
  return assertCommandOk(
    await invokeRpc(db, "rpc_period_hard_close_gated", {
      p_fiscal_period_id: params.fiscalPeriodId,
      p_legal_entity_id: params.legalEntityId,
      p_module: params.module,
      p_expected_state: params.expectedState ?? "soft_close",
      p_idempotency_key: params.idempotencyKey ?? null,
      p_correlation_id: params.correlationId ?? null,
    }),
  );
}

export async function periodCloseEvaluateReadiness(
  db: SupabaseClient,
  params: {
    fiscalPeriodId: string;
    legalEntityId: string;
    module?: string;
  },
) {
  return assertCommandOk(
    await invokeRpc(db, "rpc_period_close_evaluate_readiness", {
      p_fiscal_period_id: params.fiscalPeriodId,
      p_legal_entity_id: params.legalEntityId,
      p_module: params.module ?? "actuals",
    }),
  );
}

export async function periodTemplateCreate(
  db: SupabaseClient,
  params: {
    legalEntityId: string;
    module: string;
    code: string;
    nameEn: string;
    nameAr: string;
    effectiveFrom?: string;
    idempotencyKey?: string;
    correlationId?: string;
  },
) {
  return assertCommandOk(
    await invokeRpc(db, "rpc_period_template_create", {
      p_legal_entity_id: params.legalEntityId,
      p_module: params.module,
      p_code: params.code,
      p_name_en: params.nameEn,
      p_name_ar: params.nameAr,
      p_effective_from: params.effectiveFrom ?? null,
      p_idempotency_key: params.idempotencyKey ?? null,
      p_correlation_id: params.correlationId ?? null,
    }),
  );
}

export async function periodTemplateAddItem(
  db: SupabaseClient,
  params: {
    templateId: string;
    sequenceNo: number;
    nameEn: string;
    nameAr: string;
    description?: string;
    itemType: "manual" | "automatic";
    ownerRoleCode?: string;
    isRequired: boolean;
    isBlocking: boolean;
    controlCode?: string;
    idempotencyKey?: string;
    correlationId?: string;
  },
) {
  return assertCommandOk(
    await invokeRpc(db, "rpc_period_template_add_item", {
      p_template_id: params.templateId,
      p_sequence_no: params.sequenceNo,
      p_name_en: params.nameEn,
      p_name_ar: params.nameAr,
      p_description: params.description ?? null,
      p_item_type: params.itemType,
      p_owner_role_code: params.ownerRoleCode ?? null,
      p_is_required: params.isRequired,
      p_is_blocking: params.isBlocking,
      p_control_code: params.controlCode ?? null,
      p_idempotency_key: params.idempotencyKey ?? null,
      p_correlation_id: params.correlationId ?? null,
    }),
  );
}

async function periodTemplateTransition(
  db: SupabaseClient,
  templateId: string,
  rpc: string,
  expectedStatus: string,
  options: CommandOptions = {},
) {
  return assertCommandOk(
    await invokeRpc(db, rpc, {
      p_template_id: templateId,
      p_expected_status: expectedStatus,
      p_idempotency_key: options.idempotencyKey ?? null,
      p_correlation_id: options.correlationId ?? null,
    }),
  );
}

export async function periodTemplateSubmit(db: SupabaseClient, templateId: string, options: CommandOptions = {}) {
  return periodTemplateTransition(db, templateId, "rpc_period_template_submit", "draft", options);
}

export async function periodTemplateApprove(db: SupabaseClient, templateId: string, options: CommandOptions = {}) {
  return periodTemplateTransition(db, templateId, "rpc_period_template_approve", "submitted", options);
}

export async function periodTemplateRetire(
  db: SupabaseClient,
  params: { templateId: string; reason: string; idempotencyKey?: string; correlationId?: string },
) {
  return assertCommandOk(
    await invokeRpc(db, "rpc_period_template_retire", {
      p_template_id: params.templateId,
      p_reason: params.reason,
      p_expected_status: "approved",
      p_idempotency_key: params.idempotencyKey ?? null,
      p_correlation_id: params.correlationId ?? null,
    }),
  );
}

export async function periodChecklistSetResult(
  db: SupabaseClient,
  params: {
    itemResultId: string;
    itemStatus: "passed" | "failed" | "waived";
    evidenceReference?: string;
    comments?: string;
    waiverReason?: string;
    idempotencyKey?: string;
    correlationId?: string;
  },
) {
  return assertCommandOk(
    await invokeRpc(db, "rpc_period_checklist_set_result", {
      p_item_result_id: params.itemResultId,
      p_item_status: params.itemStatus,
      p_evidence_reference: params.evidenceReference ?? null,
      p_comments: params.comments ?? null,
      p_waiver_reason: params.waiverReason ?? null,
      p_idempotency_key: params.idempotencyKey ?? null,
      p_correlation_id: params.correlationId ?? null,
    }),
  );
}

export async function periodReopenRequest(
  db: SupabaseClient,
  params: {
    fiscalPeriodId: string;
    legalEntityId: string;
    module: string;
    reason: string;
    evidenceReference?: string;
    idempotencyKey?: string;
    correlationId?: string;
  },
) {
  return assertCommandOk(
    await invokeRpc(db, "rpc_period_reopen_request", {
      p_fiscal_period_id: params.fiscalPeriodId,
      p_legal_entity_id: params.legalEntityId,
      p_module: params.module,
      p_reason: params.reason,
      p_evidence_reference: params.evidenceReference ?? null,
      p_idempotency_key: params.idempotencyKey ?? null,
      p_correlation_id: params.correlationId ?? null,
    }),
  );
}

export async function periodReopenApprove(
  db: SupabaseClient,
  params: {
    reopenRequestId: string;
    decisionReason?: string;
    expectedStatus?: string;
    idempotencyKey?: string;
    correlationId?: string;
  },
) {
  return assertCommandOk(
    await invokeRpc(db, "rpc_period_reopen_approve", {
      p_reopen_request_id: params.reopenRequestId,
      p_decision_reason: params.decisionReason ?? null,
      p_expected_status: params.expectedStatus ?? "submitted",
      p_idempotency_key: params.idempotencyKey ?? null,
      p_correlation_id: params.correlationId ?? null,
    }),
  );
}

export async function periodReopen(
  db: SupabaseClient,
  params: {
    fiscalPeriodId: string;
    legalEntityId: string;
    module: string;
    reason: string;
    idempotencyKey?: string;
  },
) {
  return assertCommandOk(
    await invokeRpc(db, "rpc_period_reopen", {
      p_fiscal_period_id: params.fiscalPeriodId,
      p_legal_entity_id: params.legalEntityId,
      p_module: params.module,
      p_reason: params.reason,
      p_expected_state: "hard_close",
      p_idempotency_key: params.idempotencyKey ?? null,
      p_correlation_id: null,
    }),
  );
}

export async function approvalActAsDelegate(
  db: SupabaseClient,
  params: {
    itemType: string;
    entityId: string;
    decision: string;
    originalAssigneeId: string;
    delegationId: string;
    comments?: string;
    idempotencyKey?: string;
    correlationId?: string;
  },
) {
  return assertCommandOk(
    await invokeRpc(db, "rpc_approval_act_as_delegate", {
      p_item_type: params.itemType,
      p_entity_id: params.entityId,
      p_decision: params.decision,
      p_original_assignee_id: params.originalAssigneeId,
      p_delegation_id: params.delegationId,
      p_comments: params.comments ?? null,
      p_idempotency_key: params.idempotencyKey ?? null,
      p_correlation_id: params.correlationId ?? null,
    }),
  );
}

export async function appraisalCycleActivate(
  db: SupabaseClient,
  cycleId: string,
  options: CommandOptions & { expectedStatus?: string } = {},
) {
  return assertCommandOk(
    await invokeRpc(db, "rpc_appraisal_cycle_activate", {
      p_cycle_id: cycleId,
      p_expected_status: options.expectedStatus ?? "draft",
      p_idempotency_key: options.idempotencyKey ?? null,
      p_correlation_id: options.correlationId ?? null,
    }),
  );
}

export async function appraisalTemplateCreate(
  db: SupabaseClient,
  params: {
    legalEntityId: string;
    code: string;
    nameEn: string;
    nameAr: string;
    instructionsEn?: string;
    instructionsAr?: string;
    ratingScaleMax?: number;
    idempotencyKey?: string;
    correlationId?: string;
  },
) {
  return assertCommandOk(
    await invokeRpc(db, "rpc_appraisal_template_create", {
      p_legal_entity_id: params.legalEntityId,
      p_code: params.code,
      p_name_en: params.nameEn,
      p_name_ar: params.nameAr,
      p_instructions_en: params.instructionsEn ?? null,
      p_instructions_ar: params.instructionsAr ?? null,
      p_rating_scale_max: params.ratingScaleMax ?? 5,
      p_idempotency_key: params.idempotencyKey ?? null,
      p_correlation_id: params.correlationId ?? null,
    }),
  );
}

export async function appraisalTemplateAddCriterion(
  db: SupabaseClient,
  params: {
    templateId: string;
    sequenceNo: number;
    category: string;
    nameEn: string;
    nameAr: string;
    weight: string | number;
    maxScale: number;
    idempotencyKey?: string;
    correlationId?: string;
  },
) {
  return assertCommandOk(
    await invokeRpc(db, "rpc_appraisal_template_add_criterion", {
      p_template_id: params.templateId,
      p_sequence_no: params.sequenceNo,
      p_category: params.category,
      p_name_en: params.nameEn,
      p_name_ar: params.nameAr,
      p_weight: params.weight,
      p_max_scale: params.maxScale,
      p_idempotency_key: params.idempotencyKey ?? null,
      p_correlation_id: params.correlationId ?? null,
    }),
  );
}

async function appraisalTemplateTransition(
  db: SupabaseClient,
  templateId: string,
  rpc: string,
  expectedStatus: string,
  options: CommandOptions = {},
) {
  return assertCommandOk(
    await invokeRpc(db, rpc, {
      p_template_id: templateId,
      p_expected_status: expectedStatus,
      p_idempotency_key: options.idempotencyKey ?? null,
      p_correlation_id: options.correlationId ?? null,
    }),
  );
}

export async function appraisalTemplateSubmit(db: SupabaseClient, templateId: string, options: CommandOptions = {}) {
  return appraisalTemplateTransition(db, templateId, "rpc_appraisal_template_submit", "draft", options);
}

export async function appraisalTemplateApprove(db: SupabaseClient, templateId: string, options: CommandOptions = {}) {
  return appraisalTemplateTransition(db, templateId, "rpc_appraisal_template_approve", "submitted", options);
}

export async function appraisalTemplateRetire(
  db: SupabaseClient,
  params: { templateId: string; reason: string; idempotencyKey?: string; correlationId?: string },
) {
  return assertCommandOk(
    await invokeRpc(db, "rpc_appraisal_template_retire", {
      p_template_id: params.templateId,
      p_reason: params.reason,
      p_expected_status: "approved",
      p_idempotency_key: params.idempotencyKey ?? null,
      p_correlation_id: params.correlationId ?? null,
    }),
  );
}

export async function appraisalGoalCreate(
  db: SupabaseClient,
  params: {
    assignmentId: string;
    description: string;
    targetText?: string;
    measureUnit?: string;
    weight: string | number;
    idempotencyKey?: string;
    correlationId?: string;
  },
) {
  return assertCommandOk(
    await invokeRpc(db, "rpc_appraisal_goal_create", {
      p_assignment_id: params.assignmentId,
      p_description: params.description,
      p_target_text: params.targetText ?? null,
      p_measure_unit: params.measureUnit ?? null,
      p_weight: params.weight,
      p_idempotency_key: params.idempotencyKey ?? null,
      p_correlation_id: params.correlationId ?? null,
    }),
  );
}

export async function appraisalGoalEmployeeUpdate(
  db: SupabaseClient,
  params: { goalId: string; employeeComment: string; idempotencyKey?: string; correlationId?: string },
) {
  return assertCommandOk(
    await invokeRpc(db, "rpc_appraisal_goal_employee_update", {
      p_goal_id: params.goalId,
      p_employee_comment: params.employeeComment,
      p_idempotency_key: params.idempotencyKey ?? null,
      p_correlation_id: params.correlationId ?? null,
    }),
  );
}

export async function appraisalGoalManagerUpdate(
  db: SupabaseClient,
  params: {
    goalId: string;
    managerRating: string | number;
    managerComment?: string;
    idempotencyKey?: string;
    correlationId?: string;
  },
) {
  return assertCommandOk(
    await invokeRpc(db, "rpc_appraisal_goal_manager_update", {
      p_goal_id: params.goalId,
      p_manager_rating: params.managerRating,
      p_manager_comment: params.managerComment ?? null,
      p_idempotency_key: params.idempotencyKey ?? null,
      p_correlation_id: params.correlationId ?? null,
    }),
  );
}

export async function appraisalCycleCreate(
  db: SupabaseClient,
  params: {
    legalEntityId: string;
    nameEn: string;
    nameAr: string;
    periodStart: string;
    periodEnd: string;
    selfAssessmentDeadline?: string;
    managerDeadline?: string;
    reviewDeadline?: string;
    idempotencyKey?: string;
    correlationId?: string;
  },
) {
  return assertCommandOk(
    await invokeRpc(db, "rpc_appraisal_cycle_create", {
      p_legal_entity_id: params.legalEntityId,
      p_name_en: params.nameEn,
      p_name_ar: params.nameAr,
      p_period_start: params.periodStart,
      p_period_end: params.periodEnd,
      p_self_assessment_deadline: params.selfAssessmentDeadline ?? null,
      p_manager_deadline: params.managerDeadline ?? null,
      p_review_deadline: params.reviewDeadline ?? null,
      p_idempotency_key: params.idempotencyKey ?? null,
      p_correlation_id: params.correlationId ?? null,
    }),
  );
}

export async function appraisalAssignmentCreate(
  db: SupabaseClient,
  params: {
    legalEntityId: string;
    cycleId: string;
    templateId: string;
    employeeId: string;
    managerId: string;
    reviewerId?: string;
    organizationUnitId?: string;
    idempotencyKey?: string;
    correlationId?: string;
  },
) {
  return assertCommandOk(
    await invokeRpc(db, "rpc_appraisal_assignment_create", {
      p_legal_entity_id: params.legalEntityId,
      p_cycle_id: params.cycleId,
      p_template_id: params.templateId,
      p_employee_id: params.employeeId,
      p_manager_id: params.managerId,
      p_reviewer_id: params.reviewerId ?? null,
      p_organization_unit_id: params.organizationUnitId ?? null,
      p_idempotency_key: params.idempotencyKey ?? null,
      p_correlation_id: params.correlationId ?? null,
    }),
  );
}

export async function appraisalSelfSubmit(
  db: SupabaseClient,
  params: {
    assignmentId: string;
    ratings?: Array<{ criterion_id: string; self_rating?: number | string; self_comment?: string }>;
    expectedStatus?: string;
    idempotencyKey?: string;
    correlationId?: string;
  },
) {
  return assertCommandOk(
    await invokeRpc(db, "rpc_appraisal_self_submit", {
      p_assignment_id: params.assignmentId,
      p_ratings: params.ratings ?? [],
      p_expected_status: params.expectedStatus ?? "employee_self_review",
      p_idempotency_key: params.idempotencyKey ?? null,
      p_correlation_id: params.correlationId ?? null,
    }),
  );
}

export async function appraisalManagerSubmit(
  db: SupabaseClient,
  params: {
    assignmentId: string;
    ratings?: Array<{ criterion_id: string; manager_rating?: number | string; manager_comment?: string }>;
    expectedStatus?: string;
    idempotencyKey?: string;
    correlationId?: string;
  },
) {
  return assertCommandOk(
    await invokeRpc(db, "rpc_appraisal_manager_submit", {
      p_assignment_id: params.assignmentId,
      p_ratings: params.ratings ?? [],
      p_expected_status: params.expectedStatus ?? "self_submitted",
      p_idempotency_key: params.idempotencyKey ?? null,
      p_correlation_id: params.correlationId ?? null,
    }),
  );
}

export async function appraisalReviewerSubmit(
  db: SupabaseClient,
  params: {
    assignmentId: string;
    ratings: Array<{ criterion_id: string; calibrated_rating?: number | string }>;
    expectedStatus?: string;
    idempotencyKey?: string;
    correlationId?: string;
  },
) {
  return assertCommandOk(
    await invokeRpc(db, "rpc_appraisal_reviewer_submit", {
      p_assignment_id: params.assignmentId,
      p_ratings: params.ratings,
      p_expected_status: params.expectedStatus ?? "reviewer_review",
      p_idempotency_key: params.idempotencyKey ?? null,
      p_correlation_id: params.correlationId ?? null,
    }),
  );
}

export async function appraisalFinalize(
  db: SupabaseClient,
  assignmentId: string,
  options: CommandOptions & { expectedStatus?: string } = {},
) {
  return assertCommandOk(
    await invokeRpc(db, "rpc_appraisal_finalize", {
      p_assignment_id: assignmentId,
      p_expected_status: options.expectedStatus ?? "manager_submitted",
      p_idempotency_key: options.idempotencyKey ?? null,
      p_correlation_id: options.correlationId ?? null,
    }),
  );
}

export async function appraisalAcknowledge(
  db: SupabaseClient,
  params: {
    assignmentId: string;
    comments?: string;
    expectedStatus?: string;
    idempotencyKey?: string;
    correlationId?: string;
  },
) {
  return assertCommandOk(
    await invokeRpc(db, "rpc_appraisal_acknowledge", {
      p_assignment_id: params.assignmentId,
      p_comments: params.comments ?? null,
      p_expected_status: params.expectedStatus ?? "finalized",
      p_idempotency_key: params.idempotencyKey ?? null,
      p_correlation_id: params.correlationId ?? null,
    }),
  );
}

export async function masterRecordDeactivate(
  db: SupabaseClient,
  params: {
    recordId: string;
    expectedStatus?: string;
    changeReason?: string;
    idempotencyKey?: string;
    correlationId?: string;
  },
) {
  return assertCommandOk(
    await invokeRpc(db, "rpc_master_record_deactivate", {
      p_record_id: params.recordId,
      p_expected_status: params.expectedStatus ?? "approved",
      p_change_reason: params.changeReason ?? null,
      p_idempotency_key: params.idempotencyKey ?? null,
      p_correlation_id: params.correlationId ?? null,
    }),
  );
}

export async function masterRecordReject(
  db: SupabaseClient,
  params: {
    recordId: string;
    expectedStatus?: string;
    changeReason?: string;
    idempotencyKey?: string;
    correlationId?: string;
  },
) {
  return assertCommandOk(
    await invokeRpc(db, "rpc_master_record_reject", {
      p_record_id: params.recordId,
      p_expected_status: params.expectedStatus ?? "submitted",
      p_change_reason: params.changeReason ?? null,
      p_idempotency_key: params.idempotencyKey ?? null,
      p_correlation_id: params.correlationId ?? null,
    }),
  );
}
