"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  exportReportCsvAction,
  exportReportExcelAction,
  fetchReportAction,
} from "@/app/actions/report-actions";
import type { ReportType } from "@/data/repositories/report-repository";
import { formatMoney } from "@/lib/money";
import { ChartCard, CategoryBarChart, ProgressBar } from "@/components/analytics";
import { toNumber } from "@/domain/analytics/format";
import type { ChartPoint } from "@/domain/analytics/types";

const REPORT_TYPES: ReportType[] = [
  "budget_vs_actual",
  "budget_actual_commitments",
  "forecast_at_completion",
  "monthly_cash_flow",
  "milestone_performance",
  "restaurant_operational",
  "project_cost_phase_category",
  "team_milestone_performance",
  "variance_explanations",
  "unmapped_actuals",
  "audit_history",
  "procurement_pipeline",
  "invoice_match_exceptions",
  "period_close_readiness",
  "appraisal_cycle_completion",
];

const REPORT_KEYS = {
  budget_vs_actual: "budgetVsActual",
  budget_actual_commitments: "budgetActualCommitments",
  forecast_at_completion: "forecastAtCompletion",
  monthly_cash_flow: "monthlyCashFlow",
  milestone_performance: "milestonePerformance",
  restaurant_operational: "restaurantOperational",
  project_cost_phase_category: "projectCostPhaseCategory",
  team_milestone_performance: "teamMilestonePerformance",
  variance_explanations: "varianceExplanations",
  unmapped_actuals: "unmappedActuals",
  audit_history: "auditHistory",
  procurement_pipeline: "procurementPipeline",
  invoice_match_exceptions: "invoiceMatchExceptions",
  period_close_readiness: "periodCloseReadiness",
  appraisal_cycle_completion: "appraisalCycleCompletion",
} as const satisfies Record<ReportType, string>;

const MONEY_COLUMNS = new Set([
  "current_approved_amount",
  "actual_amount",
  "commitment_open",
  "budget_at_completion",
  "actual_cost",
  "cash_outflow",
  "variance_amount",
  "financial_impact",
  "bac",
  "pv",
  "ev",
  "ac",
  "cv",
  "sv",
  "eac",
  "etc",
  "vac",
]);

export function ReportsWorkspace({
  canExport,
  canViewAudit,
}: {
  canExport: boolean;
  canViewAudit: boolean;
}) {
  const t = useTranslations("reports");
  const tAnalytics = useTranslations("analytics");
  const [selected, setSelected] = useState<ReportType>("budget_vs_actual");
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [pending, startTransition] = useTransition();
  const reportTypes = canViewAudit
    ? REPORT_TYPES
    : REPORT_TYPES.filter((type) => type !== "audit_history");

  const chartPreview: { points: ChartPoint[]; readiness?: number } | null = (() => {
    if (!rows.length) return null;
    if (selected === "procurement_pipeline") {
      const map = new Map<string, ChartPoint>();
      for (const row of rows) {
        const stage = String(row.stage ?? row.status ?? "other");
        const existing = map.get(stage) ?? { key: stage, label: stage, amount: 0, count: 0 };
        existing.amount = (existing.amount as number) + toNumber(row.amount as string | number | undefined);
        existing.count = (existing.count as number) + toNumber((row.count as string | number | undefined) ?? 1);
        map.set(stage, existing);
      }
      return { points: Array.from(map.values()) };
    }
    if (selected === "budget_vs_actual" || selected === "budget_actual_commitments") {
      const map = new Map<string, ChartPoint>();
      for (const row of rows) {
        const key = String(row.financial_reporting_group ?? row.period_number ?? "row");
        const existing = map.get(key) ?? {
          key,
          label: key,
          budget: 0,
          actual: 0,
        };
        existing.budget =
          (existing.budget as number) +
          toNumber((row.current_approved_amount ?? row.monthly_budget) as string | number | undefined);
        existing.actual =
          (existing.actual as number) + toNumber((row.actual_amount ?? row.mtd_actual) as string | number | undefined);
        map.set(key, existing);
      }
      return { points: Array.from(map.values()).slice(0, 12) };
    }
    if (selected === "period_close_readiness") {
      const rates = rows
        .map((r) => toNumber((r.readiness_percent ?? r.completion_rate) as string | number | undefined))
        .filter((n) => !Number.isNaN(n));
      if (!rates.length) return null;
      const avg = rates.reduce((a, b) => a + b, 0) / rates.length;
      return { points: [], readiness: avg };
    }
    if (selected === "appraisal_cycle_completion") {
      const rates = rows
        .map((r) => toNumber(r.completion_rate as string | number | undefined))
        .filter((n) => !Number.isNaN(n));
      if (!rates.length) return null;
      return { points: [], readiness: rates.reduce((a, b) => a + b, 0) / rates.length };
    }
    return null;
  })();

  function loadReport(type: ReportType) {
    setSelected(type);
    startTransition(async () => {
      const data = await fetchReportAction(type);
      setRows((data as Record<string, unknown>[]) ?? []);
    });
  }

  function downloadCsv() {
    startTransition(async () => {
      const result = await exportReportCsvAction(selected);
      if (!result) return;
      const blob = new Blob([result.csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  function downloadExcel() {
    startTransition(async () => {
      const result = await exportReportExcelAction(selected);
      if (!result) return;
      const binary = atob(result.base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {reportTypes.map((type) => (
          <Button
            key={type}
            data-testid={`report-type-${type}`}
            variant={selected === type ? "default" : "outline"}
            size="sm"
            disabled={pending}
            onClick={() => loadReport(type)}
          >
            {t(REPORT_KEYS[type] as Parameters<typeof t>[0])}
          </Button>
        ))}
      </div>

      {canExport ? (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={pending || rows.length === 0} onClick={downloadCsv}>
            {t("exportCsv")}
          </Button>
          <Button size="sm" variant="outline" disabled={pending || rows.length === 0} onClick={downloadExcel}>
            {t("exportExcel")}
          </Button>
        </div>
      ) : null}

      {chartPreview ? (
        <ChartCard title={tAnalytics("sections.insights")} empty={false}>
          {chartPreview.readiness != null ? (
            <ProgressBar value={chartPreview.readiness} label={tAnalytics("kpi.readiness")} />
          ) : null}
          {chartPreview.points.length > 0 ? (
            <CategoryBarChart
              data={chartPreview.points}
              series={
                selected === "procurement_pipeline"
                  ? [{ key: "amount", label: tAnalytics("series.actual"), token: "chart-3" }]
                  : [
                      { key: "budget", label: tAnalytics("series.budget"), token: "chart-2" },
                      { key: "actual", label: tAnalytics("series.actual"), token: "chart-1" },
                    ]
              }
              layout="horizontal"
              height={280}
            />
          ) : null}
        </ChartCard>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t("preview")}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {rows.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  {headers.map((h) => (
                    <th key={h} className="px-2 py-1 text-start">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 50).map((row, i) => (
                  <tr key={i} className="border-b">
                    {headers.map((h) => (
                      <td key={h} className="px-2 py-1">
                        {MONEY_COLUMNS.has(h) && row[h] != null
                          ? formatMoney(String(row[h] ?? 0), "SAR")
                          : typeof row[h] === "object"
                            ? JSON.stringify(row[h])
                            : String(row[h] ?? "")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-muted-foreground">{t("selectReport")}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
