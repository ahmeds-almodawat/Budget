"use server";

import { AuthError, isAuthError } from "@/lib/auth/errors";
import {
  assertLegalEntityAccess,
  getAuthenticatedDb,
  requirePermission,
} from "@/lib/auth/context";
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
import {
  CONTROL_SCOPE_HOSPITAL_BUDGET_2027,
  FISCAL_YEAR_2027,
  LEGAL_ENTITY_MODAWAT,
  type BudgetLineInput,
} from "@/types/database";
import { money, sumMoney } from "@/lib/money";
import { violatesSegregationOfDuties } from "@/domain/auth/permissions";

function mapActionError(error: unknown): never {
  if (isAuthError(error)) {
    throw new DataAccessError(error.message, error.code === "UNAUTHENTICATED" ? "FORBIDDEN" : "FORBIDDEN");
  }
  throw error;
}

export async function fetchBudgetMasterData() {
  try {
    const { ctx, db } = await getAuthenticatedDb();
    assertLegalEntityAccess(ctx, LEGAL_ENTITY_MODAWAT);
    requirePermission(ctx, "budget", "read", LEGAL_ENTITY_MODAWAT);

    const [entities, units, costNodes] = await Promise.all([
      getLegalEntities(db),
      getOrganizationUnits(db, LEGAL_ENTITY_MODAWAT),
      getLeafCostNodes(db, LEGAL_ENTITY_MODAWAT),
    ]);
    return { entities, units, costNodes };
  } catch (error) {
    mapActionError(error);
  }
}

export async function saveHospitalDraftBudgetAction(lines: BudgetLineInput[]) {
  try {
    const { ctx, db } = await getAuthenticatedDb();
    assertLegalEntityAccess(ctx, LEGAL_ENTITY_MODAWAT);
    requirePermission(ctx, "budget", "create", LEGAL_ENTITY_MODAWAT);

    return createDraftBudgetVersion(db, {
      legalEntityId: LEGAL_ENTITY_MODAWAT,
      controlScopeId: CONTROL_SCOPE_HOSPITAL_BUDGET_2027,
      fiscalYearId: FISCAL_YEAR_2027,
      versionLabel: `HOSP-DRAFT-${Date.now()}`,
      createdBy: ctx.userId,
      lines,
    });
  } catch (error) {
    mapActionError(error);
  }
}

export async function submitHospitalBudgetAction(budgetVersionId: string) {
  try {
    const { ctx, db } = await getAuthenticatedDb();
    assertLegalEntityAccess(ctx, LEGAL_ENTITY_MODAWAT);
    requirePermission(ctx, "budget", "update", LEGAL_ENTITY_MODAWAT);

    return transitionBudgetVersion(db, {
      budgetVersionId,
      nextStatus: "submitted",
      actorId: ctx.userId,
    });
  } catch (error) {
    mapActionError(error);
  }
}

export async function reviewHospitalBudgetAction(budgetVersionId: string) {
  try {
    const { ctx, db } = await getAuthenticatedDb();
    assertLegalEntityAccess(ctx, LEGAL_ENTITY_MODAWAT);
    requirePermission(ctx, "actual", "read", LEGAL_ENTITY_MODAWAT);

    return transitionBudgetVersion(db, {
      budgetVersionId,
      nextStatus: "under_review",
      actorId: ctx.userId,
    });
  } catch (error) {
    mapActionError(error);
  }
}

export async function approveHospitalBudgetAction(budgetVersionId: string) {
  try {
    const { ctx, db } = await getAuthenticatedDb();
    assertLegalEntityAccess(ctx, LEGAL_ENTITY_MODAWAT);
    requirePermission(ctx, "budget", "approve", LEGAL_ENTITY_MODAWAT);

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

    const { data: lines } = await db
      .from("budget_lines")
      .select("planned_amount")
      .eq("budget_version_id", budgetVersionId);
    const originalAmount = sumMoney((lines ?? []).map((l) => l.planned_amount)).toFixed(4);

    await db
      .from("budget_versions")
      .update({ is_current_approved: false })
      .eq("control_scope_id", CONTROL_SCOPE_HOSPITAL_BUDGET_2027)
      .eq("is_current_approved", true);

    const approved = await transitionBudgetVersion(db, {
      budgetVersionId,
      nextStatus: "approved",
      actorId: ctx.userId,
      lockOriginalAmount: originalAmount,
    });

    return transitionBudgetVersion(db, {
      budgetVersionId: approved.id,
      nextStatus: "locked",
      actorId: ctx.userId,
    });
  } catch (error) {
    mapActionError(error);
  }
}

export async function requestHospitalBudgetChangeAction(params: {
  budgetVersionId: string;
  budgetLineId: string;
  increaseAmount: string;
  reason: string;
}) {
  try {
    const { ctx, db } = await getAuthenticatedDb();
    assertLegalEntityAccess(ctx, LEGAL_ENTITY_MODAWAT);
    requirePermission(ctx, "budget", "update", LEGAL_ENTITY_MODAWAT);

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
  } catch (error) {
    mapActionError(error);
  }
}

export async function approveHospitalBudgetChangeAction(params: {
  changeRequestId: string;
  budgetVersionId: string;
  budgetLineId: string;
  increaseAmount: string;
}) {
  try {
    const { ctx, db } = await getAuthenticatedDb();
    assertLegalEntityAccess(ctx, LEGAL_ENTITY_MODAWAT);
    requirePermission(ctx, "budget", "approve", LEGAL_ENTITY_MODAWAT);

    const { data: change } = await db
      .from("budget_change_requests")
      .select("requester_id")
      .eq("id", params.changeRequestId)
      .single();

    if (change?.requester_id === ctx.userId) {
      throw new AuthError("Requester cannot approve their own change request.", "FORBIDDEN");
    }

    return approveBudgetChangeRequest(db, {
      ...params,
      approverId: ctx.userId,
    });
  } catch (error) {
    mapActionError(error);
  }
}

export async function fetchHospitalDashboardAction() {
  try {
    const { ctx, db } = await getAuthenticatedDb();
    assertLegalEntityAccess(ctx, LEGAL_ENTITY_MODAWAT);
    requirePermission(ctx, "budget", "read", LEGAL_ENTITY_MODAWAT);

    return getHospitalBudgetPerformance(db, {
      legalEntityId: LEGAL_ENTITY_MODAWAT,
      controlScopeId: CONTROL_SCOPE_HOSPITAL_BUDGET_2027,
    });
  } catch (error) {
    mapActionError(error);
  }
}

export async function fetchBudgetLineTransactionsAction(budgetLineId: string) {
  try {
    const { ctx, db } = await getAuthenticatedDb();
    assertLegalEntityAccess(ctx, LEGAL_ENTITY_MODAWAT);
    requirePermission(ctx, "budget", "read", LEGAL_ENTITY_MODAWAT);

    return getBudgetTransactions(db, budgetLineId);
  } catch (error) {
    mapActionError(error);
  }
}

export async function fetchBudgetLineIdAction(budgetVersionId: string) {
  try {
    const { ctx, db } = await getAuthenticatedDb();
    assertLegalEntityAccess(ctx, LEGAL_ENTITY_MODAWAT);
    requirePermission(ctx, "budget", "read", LEGAL_ENTITY_MODAWAT);

    const { data, error } = await db
      .from("budget_lines")
      .select("id")
      .eq("budget_version_id", budgetVersionId)
      .limit(1)
      .maybeSingle();
    if (error) throw new DataAccessError(error.message, "DATABASE");
    return data?.id ?? null;
  } catch (error) {
    mapActionError(error);
  }
}

export async function createVarianceExplanationAction(params: {
  controlAccountId: string;
  fiscalPeriodId: string;
  varianceAmount: string;
  cause: string;
}) {
  try {
    const { ctx, db } = await getAuthenticatedDb();
    assertLegalEntityAccess(ctx, LEGAL_ENTITY_MODAWAT);
    requirePermission(ctx, "variance", "update", LEGAL_ENTITY_MODAWAT);

    const { data, error } = await db.from("variance_explanations").insert({
      legal_entity_id: LEGAL_ENTITY_MODAWAT,
      control_account_id: params.controlAccountId,
      fiscal_period_id: params.fiscalPeriodId,
      variance_category: "volume",
      variance_amount: params.varianceAmount,
      cause: params.cause,
      responsible_owner_id: ctx.userId,
      approval_status: "submitted",
    }).select("*").single();
    if (error) throw new DataAccessError(error.message, "DATABASE");
    return data;
  } catch (error) {
    mapActionError(error);
  }
}

export async function fetchLatestHospitalBudgetVersionAction() {
  try {
    const { ctx, db } = await getAuthenticatedDb();
    assertLegalEntityAccess(ctx, LEGAL_ENTITY_MODAWAT);
    requirePermission(ctx, "budget", "read", LEGAL_ENTITY_MODAWAT);

    const { data, error } = await db
      .from("budget_versions")
      .select("id, approval_status")
      .eq("legal_entity_id", LEGAL_ENTITY_MODAWAT)
      .eq("control_scope_id", CONTROL_SCOPE_HOSPITAL_BUDGET_2027)
      .in("approval_status", ["draft", "submitted", "under_review", "approved"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new DataAccessError(error.message, "DATABASE");
    return data;
  } catch (error) {
    mapActionError(error);
  }
}

export async function getSessionUserId() {
  const { getAuthContext } = await import("@/lib/auth/context");
  const ctx = await getAuthContext();
  return ctx?.userId ?? null;
}
