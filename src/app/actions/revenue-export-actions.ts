"use server";

import { withActivePermission } from "@/lib/auth/action-guard";
import { rowsToSafeCsv } from "@/lib/export/spreadsheet-safe";
import {
  buildExportFilename,
  mapExpenseExportRows,
  mapProfitabilityExportRows,
  mapRevenueExportRows,
} from "@/lib/export/revenue-bva-export";
import {
  getBudgetVsActualDetail,
  getProfitabilityPerformance,
  getRevenueBudgetVsActual,
  type BudgetVsActualFilters,
} from "@/data/repositories/revenue-repository";

export type RevenueExportType = "revenue" | "expense" | "profitability";

export async function exportBudgetVsActualCsvAction(
  reportType: RevenueExportType,
  filters: BudgetVsActualFilters = {},
) {
  return withActivePermission("report", "export", async ({ legalEntityId, db }) => {
    let rows: Record<string, unknown>[] = [];
    let filename = buildExportFilename(reportType);

    if (reportType === "revenue") {
      const data = await getRevenueBudgetVsActual(db, legalEntityId, filters);
      rows = mapRevenueExportRows(data);
      filename = buildExportFilename("revenue-detail");
    } else if (reportType === "expense") {
      const data = await getBudgetVsActualDetail(db, legalEntityId, {
        ...filters,
        financialReportingGroup: undefined,
      });
      const expense = data.filter(
        (r) => !["revenue", "internal_transfer", "statistical"].includes(r.financial_classification),
      );
      rows = mapExpenseExportRows(expense);
      filename = buildExportFilename("expense-detail");
    } else {
      const data = await getProfitabilityPerformance(db, legalEntityId, filters);
      rows = mapProfitabilityExportRows(data);
      filename = buildExportFilename("profitability");
    }

    const csv = `\uFEFF${rowsToSafeCsv(rows)}`;
    return { csv, filename, rowCount: rows.length };
  });
}
