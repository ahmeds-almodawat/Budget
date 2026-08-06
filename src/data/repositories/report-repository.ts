import type { SupabaseClient } from "@supabase/supabase-js";
import { DataAccessError } from "@/data/repositories/budget-repository";
import { calculateEarnedValue } from "@/domain/financial/calculations";
import { money } from "@/lib/money";
import { searchAuditEvents } from "@/data/repositories/audit-repository";

export type ReportType =
  | "budget_vs_actual"
  | "budget_actual_commitments"
  | "forecast_at_completion"
  | "monthly_cash_flow"
  | "milestone_performance"
  | "restaurant_operational"
  | "project_cost_phase_category"
  | "team_milestone_performance"
  | "variance_explanations"
  | "unmapped_actuals"
  | "audit_history";

export async function getBudgetVsActualReport(db: SupabaseClient, legalEntityId: string) {
  const { data, error } = await db
    .from("v_budget_vs_actual")
    .select("*")
    .eq("legal_entity_id", legalEntityId);
  if (error) throw new DataAccessError(error.message, "DATABASE");
  return data ?? [];
}

async function getProjectIdsForLegalEntity(db: SupabaseClient, legalEntityId: string) {
  const { data, error } = await db
    .from("projects")
    .select("id, control_scopes!inner(legal_entity_id)")
    .eq("control_scopes.legal_entity_id", legalEntityId);
  if (error) throw new DataAccessError(error.message, "DATABASE");
  return (data ?? []).map((project) => project.id);
}

export async function getMilestonePerformanceReport(db: SupabaseClient, legalEntityId: string) {
  const projectIds = await getProjectIdsForLegalEntity(db, legalEntityId);
  if (projectIds.length === 0) return [];
  const { data, error } = await db
    .from("milestones")
    .select("code, name_en, name_ar, baseline_date, forecast_date, approved_progress, reported_progress, approval_status, projects(control_scopes(name_en))")
    .in("project_id", projectIds)
    .order("baseline_date");
  if (error) throw new DataAccessError(error.message, "DATABASE");
  return data ?? [];
}

export async function getRestaurantReport(db: SupabaseClient, legalEntityId: string) {
  const { data, error } = await db
    .from("v_restaurant_branch_performance")
    .select("*")
    .eq("legal_entity_id", legalEntityId);
  if (error) throw new DataAccessError(error.message, "DATABASE");
  return data ?? [];
}

export async function getUnmappedActualsReport(db: SupabaseClient, legalEntityId: string) {
  const { data, error } = await db
    .from("unmapped_transaction_queue")
    .select("*, import_batches!inner(legal_entity_id)")
    .eq("import_batches.legal_entity_id", legalEntityId)
    .eq("status", "open");
  if (error) throw new DataAccessError(error.message, "DATABASE");
  return data ?? [];
}

export async function getForecastAtCompletionReport(db: SupabaseClient, legalEntityId: string) {
  const projectIds = await getProjectIdsForLegalEntity(db, legalEntityId);
  if (projectIds.length === 0) return [];
  const { data, error } = await db
    .from("v_project_earned_value")
    .select("project_id, control_account_id, status_date, bac, pv, ev, ac")
    .in("project_id", projectIds);
  if (error) throw new DataAccessError(error.message, "DATABASE");

  return (data ?? []).map((row) => {
    const result = calculateEarnedValue({
      budgetAtCompletion: row.bac ?? 0,
      plannedValue: row.pv ?? 0,
      earnedValue: row.ev ?? 0,
      actualCost: row.ac ?? 0,
    });
    return {
      project_id: row.project_id,
      control_account_id: row.control_account_id,
      status_date: row.status_date,
      bac: result.budgetAtCompletion.toFixed(4),
      pv: result.plannedValue.toFixed(4),
      ev: result.earnedValue.toFixed(4),
      ac: result.actualCost.toFixed(4),
      cv: result.costVariance.toFixed(4),
      sv: result.scheduleVariance.toFixed(4),
      cpi: result.costPerformanceIndex?.toFixed(4) ?? null,
      spi: result.schedulePerformanceIndex?.toFixed(4) ?? null,
      eac: result.estimateAtCompletion?.toFixed(4) ?? null,
      etc: result.estimateToComplete?.toFixed(4) ?? null,
      vac: result.varianceAtCompletion?.toFixed(4) ?? null,
    };
  });
}

export async function getMonthlyCashFlowReport(db: SupabaseClient, legalEntityId: string) {
  const { data, error } = await db
    .from("actual_transactions")
    .select("transaction_date, payment_date, amount_inc_vat, is_reversal")
    .eq("legal_entity_id", legalEntityId)
    .eq("is_posted", true)
    .order("transaction_date");
  if (error) throw new DataAccessError(error.message, "DATABASE");

  const totals = new Map<string, ReturnType<typeof money>>();
  for (const row of data ?? []) {
    const date = row.payment_date ?? row.transaction_date;
    const period = date.slice(0, 7);
    const signed = money(row.amount_inc_vat ?? 0).times(row.is_reversal ? -1 : 1);
    totals.set(period, (totals.get(period) ?? money(0)).plus(signed));
  }
  return [...totals.entries()].map(([period, cashOutflow]) => ({
    period,
    cash_outflow: cashOutflow.toFixed(4),
  }));
}

export async function getProjectCostByPhaseReport(db: SupabaseClient, legalEntityId: string) {
  const projectIds = await getProjectIdsForLegalEntity(db, legalEntityId);
  if (projectIds.length === 0) return [];
  const { data: values, error } = await db
    .from("v_project_earned_value")
    .select("project_id, control_account_id, bac, ac")
    .in("project_id", projectIds);
  if (error) throw new DataAccessError(error.message, "DATABASE");

  const accountIds = (values ?? []).map((row) => row.control_account_id);
  const { data: accounts, error: accountError } = accountIds.length
    ? await db
        .from("control_accounts")
        .select("id, code, name_en, name_ar, project_phases(code, name_en, name_ar), cost_nodes(code, name_en, name_ar)")
        .in("id", accountIds)
    : { data: [], error: null };
  if (accountError) throw new DataAccessError(accountError.message, "DATABASE");

  const byId = new Map((accounts ?? []).map((account) => [account.id, account]));
  return (values ?? []).map((row) => {
    const account = byId.get(row.control_account_id);
    return {
      project_id: row.project_id,
      control_account_code: account?.code ?? row.control_account_id,
      control_account_name_en: account?.name_en ?? null,
      control_account_name_ar: account?.name_ar ?? null,
      phase: account?.project_phases ?? null,
      cost_category: account?.cost_nodes ?? null,
      budget_at_completion: row.bac,
      actual_cost: row.ac,
    };
  });
}

export async function getTeamMilestonePerformanceReport(db: SupabaseClient, legalEntityId: string) {
  const { data: teams, error: teamError } = await db
    .from("teams")
    .select("id, code, name_en, name_ar")
    .eq("legal_entity_id", legalEntityId)
    .order("code");
  if (teamError) throw new DataAccessError(teamError.message, "DATABASE");

  const { data: milestones, error: milestoneError } = await db
    .from("milestones")
    .select("responsible_team_id, approved_progress, baseline_date, actual_date");
  if (milestoneError) throw new DataAccessError(milestoneError.message, "DATABASE");

  return (teams ?? []).map((team) => {
    const assigned = (milestones ?? []).filter((row) => row.responsible_team_id === team.id);
    const completedOnTime = assigned.filter(
      (row) => row.actual_date && row.baseline_date && row.actual_date <= row.baseline_date,
    ).length;
    const progressTotal = assigned.reduce(
      (sum, row) => sum.plus(money(row.approved_progress ?? 0)),
      money(0),
    );
    return {
      team_code: team.code,
      team_name_en: team.name_en,
      team_name_ar: team.name_ar,
      milestone_count: assigned.length,
      completed_on_time: completedOnTime,
      average_approved_progress: assigned.length
        ? progressTotal.div(assigned.length).toFixed(4)
        : "0.0000",
    };
  });
}

export async function getVarianceExplanationsReport(db: SupabaseClient, legalEntityId: string) {
  const { data, error } = await db
    .from("variance_explanations")
    .select("id, control_account_id, fiscal_period_id, variance_category, variance_amount, cause, financial_impact, schedule_impact_days, corrective_action, target_resolution_date, approval_status, created_at")
    .eq("legal_entity_id", legalEntityId)
    .order("created_at", { ascending: false });
  if (error) throw new DataAccessError(error.message, "DATABASE");
  return data ?? [];
}

export async function getAuditHistoryReport(db: SupabaseClient, legalEntityId: string) {
  return searchAuditEvents(db, legalEntityId, { limit: 200 });
}
