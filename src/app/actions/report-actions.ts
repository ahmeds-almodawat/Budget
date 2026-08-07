"use server";

import { withActivePermission } from "@/lib/auth/action-guard";
import {
  getBudgetVsActualReport,
  getForecastAtCompletionReport,
  getMonthlyCashFlowReport,
  getMilestonePerformanceReport,
  getProjectCostByPhaseReport,
  getTeamMilestonePerformanceReport,
  getVarianceExplanationsReport,
  getAuditHistoryReport,
  getRestaurantReport,
  getUnmappedActualsReport,
  getProcurementPipelineReport,
  getInvoiceMatchExceptionsReport,
  getPeriodCloseReadinessReport,
  getAppraisalCycleCompletionReport,
  type ReportType,
} from "@/data/repositories/report-repository";
import { buildSafeXlsxBuffer, rowsToSafeCsv } from "@/lib/export/spreadsheet-safe";

async function fetchReportData(
  db: Parameters<typeof getBudgetVsActualReport>[0],
  reportType: ReportType,
  legalEntityId: string,
) {
  switch (reportType) {
    case "budget_vs_actual":
      return getBudgetVsActualReport(db, legalEntityId);
    case "milestone_performance":
      return getMilestonePerformanceReport(db, legalEntityId);
    case "forecast_at_completion":
      return getForecastAtCompletionReport(db, legalEntityId);
    case "monthly_cash_flow":
      return getMonthlyCashFlowReport(db, legalEntityId);
    case "project_cost_phase_category":
      return getProjectCostByPhaseReport(db, legalEntityId);
    case "team_milestone_performance":
      return getTeamMilestonePerformanceReport(db, legalEntityId);
    case "variance_explanations":
      return getVarianceExplanationsReport(db, legalEntityId);
    case "audit_history":
      return getAuditHistoryReport(db, legalEntityId);
    case "restaurant_operational":
      return getRestaurantReport(db, legalEntityId);
    case "unmapped_actuals":
      return getUnmappedActualsReport(db, legalEntityId);
    case "budget_actual_commitments":
      return getBudgetVsActualReport(db, legalEntityId);
    case "procurement_pipeline":
      return getProcurementPipelineReport(db, legalEntityId);
    case "invoice_match_exceptions":
      return getInvoiceMatchExceptionsReport(db, legalEntityId);
    case "period_close_readiness":
      return getPeriodCloseReadinessReport(db, legalEntityId);
    case "appraisal_cycle_completion":
      return getAppraisalCycleCompletionReport(db, legalEntityId);
    default:
      return [];
  }
}

export async function fetchReportAction(reportType: ReportType) {
  if (reportType === "audit_history") {
    return withActivePermission("audit", "read", async ({ legalEntityId, db }) =>
      fetchReportData(db, reportType, legalEntityId),
    );
  }
  return withActivePermission("report", "read", async ({ legalEntityId, db }) =>
    fetchReportData(db, reportType, legalEntityId),
  );
}

export async function exportReportCsvAction(reportType: ReportType) {
  const resource = reportType === "audit_history" ? "audit" : "report";
  return withActivePermission(resource, "export", async ({ legalEntityId, db }) => {
    const rows = await fetchReportData(db, reportType, legalEntityId);
    return {
      csv: rowsToSafeCsv(rows as Record<string, unknown>[]),
      filename: `${reportType}.csv`,
    };
  });
}

export async function exportReportExcelAction(reportType: ReportType) {
  const resource = reportType === "audit_history" ? "audit" : "report";
  return withActivePermission(resource, "export", async ({ legalEntityId, db }) => {
    const rows = await fetchReportData(db, reportType, legalEntityId);
    const buffer = await buildSafeXlsxBuffer(rows as Record<string, unknown>[], reportType.slice(0, 31));
    return {
      base64: buffer.toString("base64"),
      filename: `${reportType}.xlsx`,
    };
  });
}
