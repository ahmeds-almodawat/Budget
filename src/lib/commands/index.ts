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
  if (error) throw new DataAccessError(error.message, "DATABASE");
  if (!data || typeof data !== "object") {
    throw new DataAccessError("Invalid command response", "DATABASE");
  }
  const result = data as T;
  if (!result.ok) {
    const code = result.error_code ?? "COMMAND_FAILED";
    if (code === "NOT_FOUND") throw new DataAccessError(result.message ?? "Not found", "NOT_FOUND");
    if (code === "STATE_MISMATCH" || code === "STATE_CONFLICT" || code === "SCOPE_MISMATCH" || code === "INVALID_TRANSITION" || code === "VALIDATION" || code === "RECONCILIATION") {
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

