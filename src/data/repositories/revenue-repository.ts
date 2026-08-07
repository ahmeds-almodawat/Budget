import type { SupabaseClient } from "@supabase/supabase-js";
import { DataAccessError, getFiscalPeriods } from "@/data/repositories/budget-repository";
import { FISCAL_YEAR_2027 } from "@/types/database";

export interface BudgetVsActualRow {
  legal_entity_id: string;
  control_scope_id: string | null;
  fiscal_year_id: string;
  fiscal_period_id: string;
  period_number: number;
  organization_unit_id: string | null;
  cost_node_id: string | null;
  financial_classification: string;
  financial_reporting_group: string;
  payer_id: string | null;
  service_line_id: string | null;
  monthly_budget: string | number;
  mtd_actual: string | number;
  ytd_actual: string | number;
  variance_amount: string | number;
  variance_percentage: string | number | null;
  variance_status: string;
  commitment_open_current: string | number;
  external_internal_class: string;
}

export interface RevenueBudgetVsActualRow {
  legal_entity_id: string;
  control_scope_id: string | null;
  fiscal_period_id: string;
  period_number: number;
  organization_unit_id: string | null;
  payer_id: string | null;
  payer_category_id: string | null;
  service_line_id: string | null;
  budgeted_revenue: string | number;
  gross_actual_revenue: string | number;
  rejection_amount: string | number;
  discount_amount: string | number;
  refund_amount: string | number;
  credit_note_amount: string | number;
  other_deduction_amount: string | number;
  actual_net_revenue: string | number;
  external_net_revenue: string | number;
  internal_revenue: string | number;
  revenue_variance: string | number;
  revenue_variance_percentage: string | number | null;
  attainment_percentage: string | number | null;
}

export interface ProfitabilityRow {
  legal_entity_id: string;
  control_scope_id: string | null;
  fiscal_period_id: string;
  period_number: number;
  net_revenue: string | number;
  net_revenue_budget: string | number;
  cost_of_revenue: string | number;
  gross_profit: string | number;
  gross_margin_percentage: string | number | null;
  payroll: string | number;
  operating_expenses: string | number;
  operating_contribution: string | number;
  operating_contribution_margin: string | number | null;
  capex_actual: string | number;
}

export interface BudgetVsActualFilters {
  fiscalPeriodId?: string;
  controlScopeId?: string;
  organizationUnitId?: string;
  payerId?: string;
  payerCategoryId?: string;
  serviceLineId?: string;
  financialReportingGroup?: string;
}

function applyFilters<T extends { eq: (col: string, val: string) => T }>(
  query: T,
  filters: BudgetVsActualFilters,
): T {
  let q = query;
  if (filters.fiscalPeriodId) q = q.eq("fiscal_period_id", filters.fiscalPeriodId);
  if (filters.controlScopeId) q = q.eq("control_scope_id", filters.controlScopeId);
  if (filters.organizationUnitId) q = q.eq("organization_unit_id", filters.organizationUnitId);
  if (filters.payerId) q = q.eq("payer_id", filters.payerId);
  if (filters.serviceLineId) q = q.eq("service_line_id", filters.serviceLineId);
  if (filters.financialReportingGroup) {
    q = q.eq("financial_reporting_group", filters.financialReportingGroup);
  }
  return q;
}

export async function getBudgetVsActualDetail(
  db: SupabaseClient,
  legalEntityId: string,
  filters: BudgetVsActualFilters = {},
) {
  let query = db
    .from("v_budget_vs_actual")
    .select("*")
    .eq("legal_entity_id", legalEntityId);
  query = applyFilters(query, filters);
  const { data, error } = await query;
  if (error) throw new DataAccessError(error.message, "DATABASE");
  return (data ?? []) as BudgetVsActualRow[];
}

export async function getRevenueBudgetVsActual(
  db: SupabaseClient,
  legalEntityId: string,
  filters: BudgetVsActualFilters = {},
) {
  let query = db
    .from("v_revenue_budget_vs_actual")
    .select("*")
    .eq("legal_entity_id", legalEntityId);
  if (filters.fiscalPeriodId) query = query.eq("fiscal_period_id", filters.fiscalPeriodId);
  if (filters.controlScopeId) query = query.eq("control_scope_id", filters.controlScopeId);
  if (filters.organizationUnitId) query = query.eq("organization_unit_id", filters.organizationUnitId);
  if (filters.payerId) query = query.eq("payer_id", filters.payerId);
  if (filters.payerCategoryId) query = query.eq("payer_category_id", filters.payerCategoryId);
  if (filters.serviceLineId) query = query.eq("service_line_id", filters.serviceLineId);
  const { data, error } = await query;
  if (error) throw new DataAccessError(error.message, "DATABASE");
  return (data ?? []) as RevenueBudgetVsActualRow[];
}

export async function getProfitabilityPerformance(
  db: SupabaseClient,
  legalEntityId: string,
  filters: Pick<BudgetVsActualFilters, "fiscalPeriodId" | "controlScopeId"> = {},
) {
  let query = db
    .from("v_profitability_period_performance")
    .select("*")
    .eq("legal_entity_id", legalEntityId);
  if (filters.fiscalPeriodId) query = query.eq("fiscal_period_id", filters.fiscalPeriodId);
  if (filters.controlScopeId) query = query.eq("control_scope_id", filters.controlScopeId);
  const { data, error } = await query;
  if (error) throw new DataAccessError(error.message, "DATABASE");
  return (data ?? []) as ProfitabilityRow[];
}

export async function getPayers(db: SupabaseClient, legalEntityId: string) {
  const { data, error } = await db
    .from("payers")
    .select("id, code, name_en, name_ar, payer_categories(code, name_en, name_ar)")
    .eq("legal_entity_id", legalEntityId)
    .eq("status", "active");
  if (error) throw new DataAccessError(error.message, "DATABASE");
  return data ?? [];
}

export async function getServiceLines(db: SupabaseClient, legalEntityId: string) {
  const { data, error } = await db
    .from("service_lines")
    .select("id, code, name_en, name_ar")
    .eq("legal_entity_id", legalEntityId)
    .eq("status", "active");
  if (error) throw new DataAccessError(error.message, "DATABASE");
  return data ?? [];
}

export async function getRevenueComponentTypes(db: SupabaseClient) {
  const { data, error } = await db
    .from("revenue_component_types")
    .select("id, code, name_en, name_ar, net_effect_multiplier")
    .order("code");
  if (error) throw new DataAccessError(error.message, "DATABASE");
  return data ?? [];
}

export async function getPayerCategories(db: SupabaseClient) {
  const { data, error } = await db
    .from("payer_categories")
    .select("id, code, name_en, name_ar")
    .order("code");
  if (error) throw new DataAccessError(error.message, "DATABASE");
  return data ?? [];
}

export async function loadBudgetVsActualWorkspaceData(
  db: SupabaseClient,
  legalEntityId: string,
  fiscalYearId: string = FISCAL_YEAR_2027,
) {
  const [revenueRows, allRows, profitabilityRows, payers, serviceLines, fiscalPeriods] =
    await Promise.all([
      getRevenueBudgetVsActual(db, legalEntityId),
      getBudgetVsActualDetail(db, legalEntityId),
      getProfitabilityPerformance(db, legalEntityId),
      getPayers(db, legalEntityId),
      getServiceLines(db, legalEntityId),
      getFiscalPeriods(db, fiscalYearId),
    ]);

  const expenseRows = allRows.filter(
    (r) =>
      r.financial_reporting_group !== "revenue" &&
      r.financial_reporting_group !== "internal_transfer" &&
      r.financial_reporting_group !== "statistical",
  );

  return {
    revenueRows,
    expenseRows,
    profitabilityRows,
    payers,
    serviceLines,
    fiscalPeriods,
  };
}
