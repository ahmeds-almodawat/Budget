import type { SupabaseClient } from "@supabase/supabase-js";
import { money, sumMoney } from "@/lib/money";
import { calculateCurrentApprovedBudget } from "@/domain/financial/calculations";
import type { ApprovalStatus, BudgetLineInput, ReportFilters } from "@/types/database";
import {
  budgetApproveAndLock,
  budgetApproveChangeRequest,
  budgetReject,
  budgetStartReview,
  budgetSubmit,
} from "@/lib/commands";

export class DataAccessError extends Error {
  constructor(
    message: string,
    public code: "NOT_FOUND" | "VALIDATION" | "FORBIDDEN" | "CONFLICT" | "DATABASE",
  ) {
    super(message);
    this.name = "DataAccessError";
  }
}

export async function getLegalEntities(db: SupabaseClient) {
  const { data, error } = await db
    .from("legal_entities")
    .select("id, code, name_en, name_ar")
    .eq("status", "active")
    .order("code");
  if (error) throw new DataAccessError(error.message, "DATABASE");
  return data ?? [];
}

export async function getOrganizationUnits(db: SupabaseClient, legalEntityId: string) {
  const { data, error } = await db
    .from("organization_units")
    .select("id, code, name_en, name_ar, unit_type_id, parent_id")
    .eq("legal_entity_id", legalEntityId)
    .eq("status", "active")
    .order("code");
  if (error) throw new DataAccessError(error.message, "DATABASE");
  return data ?? [];
}

export async function getLeafCostNodes(db: SupabaseClient, legalEntityId: string) {
  const { data, error } = await db
    .from("cost_nodes")
    .select("id, code, name_en, name_ar, node_level, parent_id")
    .eq("legal_entity_id", legalEntityId)
    .eq("allows_posting", true)
    .eq("status", "active")
    .order("code");
  if (error) throw new DataAccessError(error.message, "DATABASE");
  return data ?? [];
}

export async function getFiscalPeriods(db: SupabaseClient, fiscalYearId: string) {
  const { data, error } = await db
    .from("fiscal_periods")
    .select("id, period_number, start_date, end_date")
    .eq("fiscal_year_id", fiscalYearId)
    .order("period_number");
  if (error) throw new DataAccessError(error.message, "DATABASE");
  return data ?? [];
}

export async function getControlScopes(db: SupabaseClient, legalEntityId: string) {
  const { data, error } = await db
    .from("control_scopes")
    .select("id, code, name_en, name_ar, approval_status, scope_type_id")
    .eq("legal_entity_id", legalEntityId)
    .order("code");
  if (error) throw new DataAccessError(error.message, "DATABASE");
  return data ?? [];
}

export function validateMonthlyAllocations(annualAmount: string, monthlyAmounts: string[]) {
  if (monthlyAmounts.length !== 12) {
    throw new DataAccessError("Monthly allocations must contain 12 periods.", "VALIDATION");
  }
  const total = sumMoney(monthlyAmounts);
  const annual = money(annualAmount);
  if (total.minus(annual).abs().gt(money("0.01"))) {
    throw new DataAccessError(
      `Monthly allocations (${total.toFixed(2)}) must equal annual amount (${annual.toFixed(2)}).`,
      "VALIDATION",
    );
  }
}

export async function createDraftBudgetVersion(
  db: SupabaseClient,
  params: {
    legalEntityId: string;
    controlScopeId: string;
    fiscalYearId: string;
    versionLabel: string;
    createdBy: string;
    lines: BudgetLineInput[];
  },
) {
  validateBudgetLines(params.lines);

  const { data: version, error: versionError } = await db
    .from("budget_versions")
    .insert({
      legal_entity_id: params.legalEntityId,
      control_scope_id: params.controlScopeId,
      fiscal_year_id: params.fiscalYearId,
      version_label: params.versionLabel,
      version_type: "operational",
      approval_status: "draft",
      created_by: params.createdBy,
    })
    .select("*")
    .single();

  if (versionError) throw new DataAccessError(versionError.message, "DATABASE");

  const periods = await getFiscalPeriods(db, params.fiscalYearId);
  for (const line of params.lines) {
    validateMonthlyAllocations(line.plannedAmount, line.monthlyAmounts);
    const { data: budgetLine, error: lineError } = await db
      .from("budget_lines")
      .insert({
        budget_version_id: version.id,
        organization_unit_id: line.organizationUnitId,
        cost_node_id: line.costNodeId,
        control_account_id: line.controlAccountId ?? null,
        planned_quantity: line.plannedQuantity ?? null,
        unit_of_measure: line.unitOfMeasure ?? null,
        planned_unit_rate: line.plannedUnitRate ?? null,
        planned_amount: line.plannedAmount,
        assumption: line.assumption ?? null,
        owner_id: params.createdBy,
      })
      .select("id")
      .single();
    if (lineError) throw new DataAccessError(lineError.message, "DATABASE");

    const allocations = periods.map((period, index) => ({
      budget_line_id: budgetLine.id,
      fiscal_period_id: period.id,
      allocated_amount: line.monthlyAmounts[index],
    }));
    const { error: allocError } = await db.from("budget_monthly_allocations").insert(allocations);
    if (allocError) throw new DataAccessError(allocError.message, "DATABASE");
  }

  return version;
}

function validateBudgetLines(lines: BudgetLineInput[]) {
  if (lines.length === 0) {
    throw new DataAccessError("At least one budget line is required.", "VALIDATION");
  }
}

export async function transitionBudgetVersion(
  db: SupabaseClient,
  params: {
    budgetVersionId: string;
    nextStatus: ApprovalStatus;
    actorId: string;
    lockOriginalAmount?: string;
    idempotencyKey?: string;
    correlationId?: string;
    expectedStatus?: ApprovalStatus;
  },
) {
  const options = {
    idempotencyKey: params.idempotencyKey,
    correlationId: params.correlationId,
    expectedStatus: params.expectedStatus,
  };

  if (params.nextStatus === "submitted") {
    await budgetSubmit(db, params.budgetVersionId, { ...options, expectedStatus: params.expectedStatus ?? "draft" });
  } else if (params.nextStatus === "under_review") {
    await budgetStartReview(db, params.budgetVersionId, { ...options, expectedStatus: params.expectedStatus ?? "submitted" });
  } else if (params.nextStatus === "rejected") {
    await budgetReject(db, params.budgetVersionId, { ...options, expectedStatus: params.expectedStatus ?? "under_review" });
  } else if (params.nextStatus === "approved" || params.nextStatus === "locked") {
    const { data: current } = await db
      .from("budget_versions")
      .select("approval_status")
      .eq("id", params.budgetVersionId)
      .single();
    if (current?.approval_status !== "locked") {
      await budgetApproveAndLock(db, params.budgetVersionId, { ...options, expectedStatus: params.expectedStatus ?? "under_review" });
    }
  } else {
    throw new DataAccessError(`Unsupported budget transition: ${params.nextStatus}`, "VALIDATION");
  }

  const { data, error } = await db
    .from("budget_versions")
    .select("*")
    .eq("id", params.budgetVersionId)
    .single();
  if (error) throw new DataAccessError(error.message, "DATABASE");
  return data;
}

export async function createBudgetChangeRequest(
  db: SupabaseClient,
  params: {
    budgetVersionId: string;
    changeType: "increase" | "reduction" | "reallocation";
    requestedAmount: string;
    reason: string;
    requesterId: string;
    budgetLineId: string;
    beforeAmount: string;
    afterAmount: string;
  },
) {
  const { data: change, error } = await db
    .from("budget_change_requests")
    .insert({
      budget_version_id: params.budgetVersionId,
      change_type: params.changeType,
      requested_amount: params.requestedAmount,
      reason: params.reason,
      requester_id: params.requesterId,
      approval_status: "submitted",
    })
    .select("*")
    .single();
  if (error) throw new DataAccessError(error.message, "DATABASE");

  const { error: lineError } = await db.from("budget_change_lines").insert({
    change_request_id: change.id,
    destination_budget_line_id: params.budgetLineId,
    amount: params.requestedAmount,
    before_amount: params.beforeAmount,
    after_amount: params.afterAmount,
  });
  if (lineError) throw new DataAccessError(lineError.message, "DATABASE");
  return change;
}

export async function approveBudgetChangeRequest(
  db: SupabaseClient,
  params: {
    changeRequestId: string;
    approverId: string;
    idempotencyKey?: string;
    correlationId?: string;
    expectedStatus?: ApprovalStatus;
  },
) {
  const result = await budgetApproveChangeRequest(db, params.changeRequestId, {
    idempotencyKey: params.idempotencyKey,
    correlationId: params.correlationId,
    expectedStatus: params.expectedStatus ?? "submitted",
  });

  const { data: version, error } = await db
    .from("budget_versions")
    .select("*")
    .eq("id", result.new_budget_version_id as string)
    .single();
  if (error || !version) throw new DataAccessError("New budget version not found.", "NOT_FOUND");

  return calculateCurrentApprovedBudget({
    originalApproved: version.original_approved_amount,
    increases: version.approved_increases,
    reductions: version.approved_reductions,
  }).toFixed(2);
}

export async function getHospitalBudgetPerformance(db: SupabaseClient, filters: ReportFilters) {
  const scopeId = filters.controlScopeId;
  const entityId = filters.legalEntityId;
  if (!scopeId || !entityId) {
    throw new DataAccessError("legalEntityId and controlScopeId are required.", "VALIDATION");
  }

  const { data: version, error: versionError } = await db
    .from("budget_versions")
    .select("*")
    .eq("legal_entity_id", entityId)
    .eq("control_scope_id", scopeId)
    .in("approval_status", ["approved", "locked", "posted"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (versionError) throw new DataAccessError(versionError.message, "DATABASE");
  if (!version) return null;

  const { data: lines, error: linesError } = await db
    .from("budget_lines")
    .select("id, planned_amount, organization_unit_id, cost_node_id")
    .eq("budget_version_id", version.id);
  if (linesError) throw new DataAccessError(linesError.message, "DATABASE");

  const { data: allocations, error: allocError } = await db
    .from("budget_monthly_allocations")
    .select("allocated_amount, fiscal_period_id, budget_line_id")
    .in("budget_line_id", (lines ?? []).map((l) => l.id));
  if (allocError) throw new DataAccessError(allocError.message, "DATABASE");

  const lineIds = (lines ?? []).map((l) => l.id);
  let actualRows: { allocation_amount: string; organization_unit_id: string | null; cost_node_id: string | null; fiscal_period_id: string | null }[] = [];
  if (lineIds.length > 0) {
    const { data, error } = await db
      .from("actual_transaction_allocations")
      .select("allocation_amount, organization_unit_id, cost_node_id, actual_transaction_id")
      .in("organization_unit_id", (lines ?? []).map((l) => l.organization_unit_id));
    if (error) throw new DataAccessError(error.message, "DATABASE");
    const txnIds = [...new Set((data ?? []).map((r) => r.actual_transaction_id))];
    let txnPeriodMap = new Map<string, string>();
    if (txnIds.length > 0) {
      const { data: txns } = await db
        .from("actual_transactions")
        .select("id, accounting_period_id")
        .in("id", txnIds);
      txnPeriodMap = new Map((txns ?? []).map((t) => [t.id, t.accounting_period_id]));
    }
    actualRows = (data ?? []).map((row) => ({
      allocation_amount: row.allocation_amount,
      organization_unit_id: row.organization_unit_id,
      cost_node_id: row.cost_node_id,
      fiscal_period_id: txnPeriodMap.get(row.actual_transaction_id) ?? null,
    }));
  }

  const periods = await getFiscalPeriods(db, version.fiscal_year_id);
  const currentPeriod = periods.find((p) => p.period_number === 3) ?? periods[0];

  const mtdBudget = sumMoney(
    (allocations ?? [])
      .filter((a) => a.fiscal_period_id === currentPeriod?.id)
      .map((a) => a.allocated_amount),
  );
  const ytdBudget = sumMoney((allocations ?? []).map((a) => a.allocated_amount));
  const mtdActual = sumMoney(
    actualRows
      .filter((a) => a.fiscal_period_id === currentPeriod?.id)
      .map((a) => a.allocation_amount),
  );
  const ytdActual = sumMoney(actualRows.map((a) => a.allocation_amount));

  const currentApproved = calculateCurrentApprovedBudget({
    originalApproved: version.original_approved_amount,
    increases: version.approved_increases,
    reductions: version.approved_reductions,
  });

  return {
    version,
    currentApproved: currentApproved.toFixed(2),
    mtdBudget: mtdBudget.toFixed(2),
    mtdActual: mtdActual.toFixed(2),
    ytdBudget: ytdBudget.toFixed(2),
    ytdActual: ytdActual.toFixed(2),
    fullYearForecast: ytdActual.plus(mtdBudget).toFixed(2),
    lines: lines ?? [],
    actualRows,
    periods,
    currentPeriodId: currentPeriod?.id ?? null,
  };
}

export async function getBudgetTransactions(db: SupabaseClient, budgetLineId: string) {
  const { data: line, error: lineError } = await db
    .from("budget_lines")
    .select("*")
    .eq("id", budgetLineId)
    .single();
  if (lineError || !line) throw new DataAccessError("Budget line not found.", "NOT_FOUND");

  const { data, error } = await db
    .from("actual_transaction_allocations")
    .select("*, actual_transactions(*)")
    .eq("organization_unit_id", line.organization_unit_id)
    .eq("cost_node_id", line.cost_node_id);
  if (error) throw new DataAccessError(error.message, "DATABASE");
  return data ?? [];
}
