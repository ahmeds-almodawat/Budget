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
    if (code === "STATE_MISMATCH" || code === "INVALID_TRANSITION" || code === "VALIDATION" || code === "RECONCILIATION") {
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

export type { ApprovalStatus, CommandOptions, CommandResult };
