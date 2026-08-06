"use server";

import { withActivePermission } from "@/lib/auth/action-guard";
import {
  getBudgetVsActualReport,
  getMilestonePerformanceReport,
  getRestaurantReport,
  getUnmappedActualsReport,
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
      return getMilestonePerformanceReport(db);
    case "restaurant_operational":
      return getRestaurantReport(db);
    case "unmapped_actuals":
      return getUnmappedActualsReport(db, legalEntityId);
    case "budget_actual_commitments":
      return getBudgetVsActualReport(db, legalEntityId);
    default:
      return [];
  }
}

export async function fetchReportAction(reportType: ReportType) {
  return withActivePermission("report", "read", async ({ legalEntityId, db }) =>
    fetchReportData(db, reportType, legalEntityId),
  );
}

export async function exportReportCsvAction(reportType: ReportType) {
  return withActivePermission("report", "export", async ({ legalEntityId, db }) => {
    const rows = await fetchReportData(db, reportType, legalEntityId);
    return {
      csv: rowsToSafeCsv(rows as Record<string, unknown>[]),
      filename: `${reportType}.csv`,
    };
  });
}

export async function exportReportExcelAction(reportType: ReportType) {
  return withActivePermission("report", "export", async ({ legalEntityId, db }) => {
    const rows = await fetchReportData(db, reportType, legalEntityId);
    const buffer = await buildSafeXlsxBuffer(rows as Record<string, unknown>[], reportType.slice(0, 31));
    return {
      base64: buffer.toString("base64"),
      filename: `${reportType}.xlsx`,
    };
  });
}
