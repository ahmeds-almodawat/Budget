"use server";

import { isAuthError } from "@/lib/auth/errors";
import {
  assertLegalEntityAccess,
  getAuthenticatedDb,
  requirePermission,
} from "@/lib/auth/context";
import { DataAccessError } from "@/data/repositories/budget-repository";
import {
  getBudgetVsActualReport,
  getMilestonePerformanceReport,
  getRestaurantReport,
  getUnmappedActualsReport,
  rowsToCsv,
  type ReportType,
} from "@/data/repositories/report-repository";
import { LEGAL_ENTITY_MODAWAT } from "@/types/database";
import * as XLSX from "xlsx";

function mapActionError(error: unknown): never {
  if (isAuthError(error)) {
    throw new DataAccessError(error.message, "FORBIDDEN");
  }
  throw error;
}

async function fetchReportData(db: Awaited<ReturnType<typeof getAuthenticatedDb>>["db"], reportType: ReportType) {
  switch (reportType) {
    case "budget_vs_actual":
      return getBudgetVsActualReport(db);
    case "milestone_performance":
      return getMilestonePerformanceReport(db);
    case "restaurant_operational":
      return getRestaurantReport(db);
    case "unmapped_actuals":
      return getUnmappedActualsReport(db, LEGAL_ENTITY_MODAWAT);
    case "budget_actual_commitments":
      return getBudgetVsActualReport(db);
    default:
      return [];
  }
}

export async function fetchReportAction(reportType: ReportType) {
  try {
    const { ctx, db } = await getAuthenticatedDb();
    assertLegalEntityAccess(ctx, LEGAL_ENTITY_MODAWAT);
    requirePermission(ctx, "report", "read", LEGAL_ENTITY_MODAWAT);
    return fetchReportData(db, reportType);
  } catch (error) {
    mapActionError(error);
  }
}

export async function exportReportCsvAction(reportType: ReportType) {
  try {
    const { ctx, db } = await getAuthenticatedDb();
    assertLegalEntityAccess(ctx, LEGAL_ENTITY_MODAWAT);
    requirePermission(ctx, "report", "export", LEGAL_ENTITY_MODAWAT);
    const rows = await fetchReportData(db, reportType);
    return { csv: rowsToCsv(rows as Record<string, unknown>[]), filename: `${reportType}.csv` };
  } catch (error) {
    mapActionError(error);
  }
}

export async function exportReportExcelAction(reportType: ReportType) {
  try {
    const { ctx, db } = await getAuthenticatedDb();
    assertLegalEntityAccess(ctx, LEGAL_ENTITY_MODAWAT);
    requirePermission(ctx, "report", "export", LEGAL_ENTITY_MODAWAT);
    const rows = await fetchReportData(db, reportType);
    const sheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, reportType.slice(0, 31));
    const buffer = XLSX.write(workbook, { type: "base64", bookType: "xlsx" });
    return { base64: buffer, filename: `${reportType}.xlsx` };
  } catch (error) {
    mapActionError(error);
  }
}
