import type { RevenueBudgetVsActualRow, BudgetVsActualRow, ProfitabilityRow } from "@/data/repositories/revenue-repository";

const REVENUE_COLUMNS = [
  "legal_entity_id",
  "control_scope_id",
  "fiscal_year_id",
  "fiscal_period_id",
  "period_number",
  "organization_unit_id",
  "payer_category_id",
  "payer_id",
  "service_line_id",
  "budgeted_revenue",
  "gross_actual_revenue",
  "rejection_amount",
  "discount_amount",
  "refund_amount",
  "credit_note_amount",
  "other_deduction_amount",
  "other_adjustment_amount",
  "actual_net_revenue",
  "internal_revenue",
  "external_net_revenue",
  "revenue_variance",
  "revenue_variance_percentage",
  "attainment_percentage",
] as const;

function num(value: string | number | null | undefined): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function mapRevenueExportRows(rows: RevenueBudgetVsActualRow[]): Record<string, unknown>[] {
  return rows.map((r) => ({
    legal_entity_id: r.legal_entity_id,
    control_scope_id: r.control_scope_id,
    fiscal_year_id: null,
    fiscal_period_id: r.fiscal_period_id,
    period_number: r.period_number,
    organization_unit_id: r.organization_unit_id,
    payer_category_id: r.payer_category_id,
    payer_id: r.payer_id,
    service_line_id: r.service_line_id,
    budget_basis: null,
    revenue_budget: num(r.budgeted_revenue),
    gross_revenue: num(r.gross_actual_revenue),
    rejection: num(r.rejection_amount),
    discount: num(r.discount_amount),
    refund: num(r.refund_amount),
    credit_note: num(r.credit_note_amount),
    other_deduction: num(r.other_deduction_amount),
    other_adjustment: null,
    net_revenue: num(r.actual_net_revenue),
    internal_revenue: num(r.internal_revenue),
    external_net_revenue: num(r.external_net_revenue),
    variance: num(r.revenue_variance),
    variance_percentage: num(r.revenue_variance_percentage),
    attainment_percentage: num(r.attainment_percentage),
    status: null,
  }));
}

export function mapExpenseExportRows(rows: BudgetVsActualRow[]): Record<string, unknown>[] {
  return rows.map((r) => ({
    legal_entity_id: r.legal_entity_id,
    control_scope_id: r.control_scope_id,
    fiscal_period_id: r.fiscal_period_id,
    period_number: r.period_number,
    organization_unit_id: r.organization_unit_id,
    classification: r.financial_classification,
    reporting_group: r.financial_reporting_group,
    payer_id: r.payer_id,
    service_line_id: r.service_line_id,
    monthly_budget: num(r.monthly_budget),
    mtd_actual: num(r.mtd_actual),
    ytd_actual: num(r.ytd_actual),
    variance_amount: num(r.variance_amount),
    variance_percentage: num(r.variance_percentage),
    variance_status: r.variance_status,
    commitment_open_current: num(r.commitment_open_current),
    external_internal_class: r.external_internal_class,
  }));
}

export function mapProfitabilityExportRows(rows: ProfitabilityRow[]): Record<string, unknown>[] {
  return rows.map((r) => ({
    legal_entity_id: r.legal_entity_id,
    control_scope_id: r.control_scope_id,
    fiscal_period_id: r.fiscal_period_id,
    period_number: r.period_number,
    net_revenue: num(r.net_revenue),
    net_revenue_budget: num(r.net_revenue_budget),
    cost_of_revenue: num(r.cost_of_revenue),
    gross_profit: num(r.gross_profit),
    gross_margin_percentage: num(r.gross_margin_percentage),
    payroll: num(r.payroll),
    operating_expenses: num(r.operating_expenses),
    operating_contribution: num(r.operating_contribution),
    capex_actual: num(r.capex_actual),
  }));
}

export function buildExportFilename(reportType: string, date = new Date()): string {
  const stamp = date.toISOString().slice(0, 10);
  return `${reportType}-${stamp}.csv`;
}

export { REVENUE_COLUMNS };
