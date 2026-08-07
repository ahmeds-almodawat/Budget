"use server";

import { AuthError } from "@/lib/auth/errors";
import { withActivePermission } from "@/lib/auth/action-guard";
import { DataAccessError } from "@/data/repositories/budget-repository";
import {
  approveBudgetChangeRequest,
  createBudgetChangeRequest,
  createDraftBudgetVersion,
  getBudgetTransactions,
  getHospitalBudgetPerformance,
  getLegalEntities,
  getLeafCostNodes,
  getOrganizationUnits,
  transitionBudgetVersion,
} from "@/data/repositories/budget-repository";
import { CONTROL_SCOPE_HOSPITAL_BUDGET_2027, FISCAL_YEAR_2027, type BudgetLineInput } from "@/types/database";
import { money } from "@/lib/money";
import { violatesSegregationOfDuties } from "@/domain/auth/permissions";

async function resolveHospitalScopeId(
  db: Parameters<typeof getHospitalBudgetPerformance>[0],
  legalEntityId: string,
): Promise<string> {
  const { data, error } = await db
    .from("control_scopes")
    .select("id")
    .eq("legal_entity_id", legalEntityId)
    .eq("code", "HOSP-BUD-2027")
    .maybeSingle();
  if (error) throw new DataAccessError(error.message, "DATABASE");
  return data?.id ?? CONTROL_SCOPE_HOSPITAL_BUDGET_2027;
}

export async function fetchBudgetMasterData() {
  return withActivePermission("budget", "read", async ({ legalEntityId, db }) => {
    const [entities, units, costNodes] = await Promise.all([
      getLegalEntities(db),
      getOrganizationUnits(db, legalEntityId),
      getLeafCostNodes(db, legalEntityId),
    ]);
    return { entities, units, costNodes, activeLegalEntityId: legalEntityId };
  });
}

export async function saveHospitalDraftBudgetAction(lines: BudgetLineInput[]) {
  return withActivePermission("budget", "create", async ({ ctx, legalEntityId, db }) => {
    const controlScopeId = await resolveHospitalScopeId(db, legalEntityId);
    return createDraftBudgetVersion(db, {
      legalEntityId,
      controlScopeId,
      fiscalYearId: FISCAL_YEAR_2027,
      versionLabel: `HOSP-DRAFT-${Date.now()}`,
      createdBy: ctx.userId,
      lines,
    });
  });
}

export async function submitHospitalBudgetAction(budgetVersionId: string) {
  return withActivePermission("budget", "update", async ({ ctx, db }) =>
    transitionBudgetVersion(db, {
      budgetVersionId,
      nextStatus: "submitted",
      actorId: ctx.userId,
    }),
  );
}

export async function reviewHospitalBudgetAction(budgetVersionId: string) {
  return withActivePermission("actual", "read", async ({ ctx, db }) =>
    transitionBudgetVersion(db, {
      budgetVersionId,
      nextStatus: "under_review",
      actorId: ctx.userId,
    }),
  );
}

export async function approveHospitalBudgetAction(budgetVersionId: string) {
  return withActivePermission("budget", "approve", async ({ ctx, db }) => {
    const { data: version } = await db
      .from("budget_versions")
      .select("submitted_by")
      .eq("id", budgetVersionId)
      .single();

    if (version?.submitted_by === ctx.userId) {
      throw new AuthError("Requester cannot approve their own budget.", "FORBIDDEN");
    }

    if (
      version?.submitted_by &&
      violatesSegregationOfDuties("budget_owner", "budget_owner", "budget") &&
      version.submitted_by === ctx.userId
    ) {
      throw new AuthError("Requester cannot approve their own budget.", "FORBIDDEN");
    }

    return transitionBudgetVersion(db, {
      budgetVersionId,
      nextStatus: "locked",
      actorId: ctx.userId,
    });
  });
}

export async function requestHospitalBudgetChangeAction(params: {
  budgetVersionId: string;
  budgetLineId: string;
  increaseAmount: string;
  reason: string;
}) {
  return withActivePermission("budget", "update", async ({ ctx, db }) => {
    const { data: line } = await db.from("budget_lines").select("*").eq("id", params.budgetLineId).single();
    if (!line) throw new DataAccessError("Budget line not found.", "NOT_FOUND");
    const before = money(line.planned_amount);
    const after = before.plus(params.increaseAmount);
    return createBudgetChangeRequest(db, {
      budgetVersionId: params.budgetVersionId,
      changeType: "increase",
      requestedAmount: params.increaseAmount,
      reason: params.reason,
      requesterId: ctx.userId,
      budgetLineId: params.budgetLineId,
      beforeAmount: before.toFixed(4),
      afterAmount: after.toFixed(4),
    });
  });
}

export async function approveHospitalBudgetChangeAction(params: { changeRequestId: string }) {
  return withActivePermission("budget", "approve", async ({ ctx, db }) => {
    const { data: change } = await db
      .from("budget_change_requests")
      .select("requester_id")
      .eq("id", params.changeRequestId)
      .single();

    if (change?.requester_id === ctx.userId) {
      throw new AuthError("Requester cannot approve their own change request.", "FORBIDDEN");
    }

    return approveBudgetChangeRequest(db, {
      changeRequestId: params.changeRequestId,
      approverId: ctx.userId,
    });
  });
}

export async function fetchHospitalDashboardAction(reportDate?: string) {
  return withActivePermission("budget", "read", async ({ legalEntityId, db }) => {
    const controlScopeId = await resolveHospitalScopeId(db, legalEntityId);
    return getHospitalBudgetPerformance(db, {
      legalEntityId,
      controlScopeId,
      reportDate,
    });
  });
}

export async function fetchBudgetLineTransactionsAction(budgetLineId: string) {
  return withActivePermission("budget", "read", async ({ db }) => getBudgetTransactions(db, budgetLineId));
}

export async function fetchBudgetLineIdAction(budgetVersionId: string) {
  return withActivePermission("budget", "read", async ({ db }) => {
    const { data, error } = await db
      .from("budget_lines")
      .select("id")
      .eq("budget_version_id", budgetVersionId)
      .limit(1)
      .maybeSingle();
    if (error) throw new DataAccessError(error.message, "DATABASE");
    return data?.id ?? null;
  });
}

export async function createVarianceExplanationAction(params: {
  controlAccountId: string;
  fiscalPeriodId: string;
  varianceAmount: string;
  cause: string;
}) {
  return withActivePermission("variance", "update", async ({ ctx, legalEntityId, db }) => {
    const { data, error } = await db.from("variance_explanations").insert({
      legal_entity_id: legalEntityId,
      control_account_id: params.controlAccountId,
      fiscal_period_id: params.fiscalPeriodId,
      variance_amount: params.varianceAmount,
      cause: params.cause,
      responsible_owner_id: ctx.userId,
      approval_status: "submitted",
      variance_category: "volume",
    }).select("*").single();
    if (error) throw new DataAccessError(error.message, "DATABASE");
    return data;
  });
}

export async function fetchLatestHospitalBudgetVersionAction() {
  return withActivePermission("budget", "read", async ({ legalEntityId, db }) => {
    const controlScopeId = await resolveHospitalScopeId(db, legalEntityId);
    const { data, error } = await db
      .from("budget_versions")
      .select("id, approval_status")
      .eq("legal_entity_id", legalEntityId)
      .eq("control_scope_id", controlScopeId)
      .in("approval_status", ["draft", "submitted", "under_review", "approved"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new DataAccessError(error.message, "DATABASE");
    return data;
  });
}

export async function getSessionUserId() {
  const { getAuthContext } = await import("@/lib/auth/context");
  const ctx = await getAuthContext();
  return ctx?.userId ?? null;
}
