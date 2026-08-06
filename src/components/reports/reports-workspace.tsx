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

const REPORT_TYPES: ReportType[] = [
  "budget_vs_actual",
  "budget_actual_commitments",
  "milestone_performance",
  "restaurant_operational",
  "unmapped_actuals",
];

const REPORT_KEYS = {
  budget_vs_actual: "budgetVsActual",
  budget_actual_commitments: "budgetActualCommitments",
  milestone_performance: "milestonePerformance",
  restaurant_operational: "restaurantOperational",
  unmapped_actuals: "unmappedActuals",
} as const satisfies Record<ReportType, string>;

export function ReportsWorkspace() {
  const t = useTranslations("reports");
  const [selected, setSelected] = useState<ReportType>("budget_vs_actual");
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [pending, startTransition] = useTransition();

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
        {REPORT_TYPES.map((type) => (
          <Button
            key={type}
            variant={selected === type ? "default" : "outline"}
            size="sm"
            disabled={pending}
            onClick={() => loadReport(type)}
          >
            {t(REPORT_KEYS[type] as Parameters<typeof t>[0])}
          </Button>
        ))}
      </div>

      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={pending || rows.length === 0} onClick={downloadCsv}>
          {t("exportCsv")}
        </Button>
        <Button size="sm" variant="outline" disabled={pending || rows.length === 0} onClick={downloadExcel}>
          {t("exportExcel")}
        </Button>
      </div>

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
                    <th key={h} className="px-2 py-1 text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 50).map((row, i) => (
                  <tr key={i} className="border-b">
                    {headers.map((h) => (
                      <td key={h} className="px-2 py-1">
                        {typeof row[h] === "number" || (typeof row[h] === "string" && /^\d/.test(String(row[h])))
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
