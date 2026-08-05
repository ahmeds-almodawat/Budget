"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
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
  DataAccessError,
} from "@/data/repositories/budget-repository";
import {
  CONTROL_SCOPE_HOSPITAL_BUDGET_2027,
  FISCAL_YEAR_2027,
  LEGAL_ENTITY_MODAWAT,
  type BudgetLineInput,
} from "@/types/database";
import { money, sumMoney } from "@/lib/money";
import { violatesSegregationOfDuties } from "@/domain/auth/permissions";

const BUDGET_OWNER_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1";
const APPROVER_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2";
const FINANCE_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3";

async function assertActor(actorId: string) {
  if (!actorId) throw new DataAccessError("Authentication required.", "FORBIDDEN");
}

export async function fetchBudgetMasterData() {
  const db = createAdminClient();
  const [entities, units, costNodes] = await Promise.all([
    getLegalEntities(db),
    getOrganizationUnits(db, LEGAL_ENTITY_MODAWAT),
    getLeafCostNodes(db, LEGAL_ENTITY_MODAWAT),
  ]);
  return { entities, units, costNodes };
}

export async function saveHospitalDraftBudgetAction(lines: BudgetLineInput[]) {
  await assertActor(BUDGET_OWNER_ID);
  const db = createAdminClient();
  return createDraftBudgetVersion(db, {
    legalEntityId: LEGAL_ENTITY_MODAWAT,
    controlScopeId: CONTROL_SCOPE_HOSPITAL_BUDGET_2027,
    fiscalYearId: FISCAL_YEAR_2027,
    versionLabel: `HOSP-DRAFT-${Date.now()}`,
    createdBy: BUDGET_OWNER_ID,
    lines,
  });
}

export async function submitHospitalBudgetAction(budgetVersionId: string) {
  await assertActor(BUDGET_OWNER_ID);
  const db = createAdminClient();
  return transitionBudgetVersion(db, {
    budgetVersionId,
    nextStatus: "submitted",
    actorId: BUDGET_OWNER_ID,
  });
}

export async function reviewHospitalBudgetAction(budgetVersionId: string) {
  await assertActor(FINANCE_ID);
  const db = createAdminClient();
  return transitionBudgetVersion(db, {
    budgetVersionId,
    nextStatus: "under_review",
    actorId: FINANCE_ID,
  });
}

export async function approveHospitalBudgetAction(budgetVersionId: string, requesterId: string) {
  await assertActor(APPROVER_ID);
  if (violatesSegregationOfDuties("budget_owner", "budget_owner", "budget") && requesterId === APPROVER_ID) {
    throw new DataAccessError("Requester cannot approve their own budget.", "FORBIDDEN");
  }
  const db = createAdminClient();
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
    actorId: APPROVER_ID,
    lockOriginalAmount: originalAmount,
  });

  return transitionBudgetVersion(db, {
    budgetVersionId: approved.id,
    nextStatus: "locked",
    actorId: APPROVER_ID,
  });
}

export async function requestHospitalBudgetChangeAction(params: {
  budgetVersionId: string;
  budgetLineId: string;
  increaseAmount: string;
  reason: string;
}) {
  await assertActor(BUDGET_OWNER_ID);
  const db = createAdminClient();
  const { data: line } = await db.from("budget_lines").select("*").eq("id", params.budgetLineId).single();
  if (!line) throw new DataAccessError("Budget line not found.", "NOT_FOUND");
  const before = money(line.planned_amount);
  const after = before.plus(params.increaseAmount);
  return createBudgetChangeRequest(db, {
    budgetVersionId: params.budgetVersionId,
    changeType: "increase",
    requestedAmount: params.increaseAmount,
    reason: params.reason,
    requesterId: BUDGET_OWNER_ID,
    budgetLineId: params.budgetLineId,
    beforeAmount: before.toFixed(4),
    afterAmount: after.toFixed(4),
  });
}

export async function approveHospitalBudgetChangeAction(params: {
  changeRequestId: string;
  budgetVersionId: string;
  budgetLineId: string;
  increaseAmount: string;
}) {
  await assertActor(APPROVER_ID);
  const db = createAdminClient();
  return approveBudgetChangeRequest(db, {
    ...params,
    approverId: APPROVER_ID,
  });
}

export async function fetchHospitalDashboardAction() {
  const db = createAdminClient();
  return getHospitalBudgetPerformance(db, {
    legalEntityId: LEGAL_ENTITY_MODAWAT,
    controlScopeId: CONTROL_SCOPE_HOSPITAL_BUDGET_2027,
  });
}

export async function fetchBudgetLineTransactionsAction(budgetLineId: string) {
  const db = createAdminClient();
  return getBudgetTransactions(db, budgetLineId);
}

export async function createVarianceExplanationAction(params: {
  controlAccountId: string;
  fiscalPeriodId: string;
  varianceAmount: string;
  cause: string;
}) {
  await assertActor(FINANCE_ID);
  const db = createAdminClient();
  const { data, error } = await db.from("variance_explanations").insert({
    legal_entity_id: LEGAL_ENTITY_MODAWAT,
    control_account_id: params.controlAccountId,
    fiscal_period_id: params.fiscalPeriodId,
    variance_category: "volume",
    variance_amount: params.varianceAmount,
    cause: params.cause,
    responsible_owner_id: FINANCE_ID,
    approval_status: "submitted",
  }).select("*").single();
  if (error) throw new DataAccessError(error.message, "DATABASE");
  return data;
}

export async function getSessionUserId() {
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}
