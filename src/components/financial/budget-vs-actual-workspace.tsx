"use client";

import { useMemo, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMoney, formatPercent } from "@/lib/money";
import { pickLocalized } from "@/lib/i18n/display";
import { exportBudgetVsActualCsvAction } from "@/app/actions/revenue-export-actions";
import type {
  BudgetVsActualRow,
  ProfitabilityRow,
  RevenueBudgetVsActualRow,
} from "@/data/repositories/revenue-repository";

type TabKey = "revenue" | "expense" | "profitability";

export interface FilterOption {
  id: string;
  labelEn: string;
  labelAr: string;
}

export function BudgetVsActualWorkspace({
  revenueRows,
  expenseRows,
  profitabilityRows,
  payers,
  serviceLines,
  fiscalPeriods,
}: {
  revenueRows: RevenueBudgetVsActualRow[];
  expenseRows: BudgetVsActualRow[];
  profitabilityRows: ProfitabilityRow[];
  payers: FilterOption[];
  serviceLines: FilterOption[];
  fiscalPeriods: { id: string; period_number: number }[];
}) {
  const locale = useLocale();
  const t = useTranslations("budgetVsActual");
  const tStatus = useTranslations("varianceStatus");
  const [tab, setTab] = useState<TabKey>("revenue");
  const [periodId, setPeriodId] = useState("");
  const [payerId, setPayerId] = useState("");
  const [serviceLineId, setServiceLineId] = useState("");
  const [exportPending, startExport] = useTransition();

  const exportFilters = useMemo(
    () => ({
      fiscalPeriodId: periodId || undefined,
      payerId: payerId || undefined,
      serviceLineId: serviceLineId || undefined,
    }),
    [periodId, payerId, serviceLineId],
  );

  function downloadExport() {
    const reportType = tab === "profitability" ? "profitability" : tab === "expense" ? "expense" : "revenue";
    startExport(async () => {
      const result = await exportBudgetVsActualCsvAction(reportType, exportFilters);
      const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  const filteredRevenue = useMemo(
    () =>
      revenueRows.filter((r) => {
        if (periodId && r.fiscal_period_id !== periodId) return false;
        if (payerId && r.payer_id !== payerId) return false;
        if (serviceLineId && r.service_line_id !== serviceLineId) return false;
        return true;
      }),
    [revenueRows, periodId, payerId, serviceLineId],
  );

  const filteredExpense = useMemo(
    () =>
      expenseRows.filter((r) => {
        if (periodId && r.fiscal_period_id !== periodId) return false;
        if (payerId && r.payer_id !== payerId) return false;
        if (serviceLineId && r.service_line_id !== serviceLineId) return false;
        return true;
      }),
    [expenseRows, periodId, payerId, serviceLineId],
  );

  const summary = useMemo(() => {
    const revBudget = filteredRevenue.reduce((s, r) => s + Number(r.budgeted_revenue ?? 0), 0);
    const revActual = filteredRevenue.reduce((s, r) => s + Number(r.external_net_revenue ?? 0), 0);
    const expBudget = filteredExpense.reduce((s, r) => s + Number(r.monthly_budget ?? 0), 0);
    const expActual = filteredExpense.reduce((s, r) => s + Number(r.mtd_actual ?? 0), 0);
    const prof = profitabilityRows.find((p) => !periodId || p.fiscal_period_id === periodId);
    return {
      revBudget,
      revActual,
      revVariance: revActual - revBudget,
      expBudget,
      expActual,
      expVariance: expBudget - expActual,
      grossProfit: Number(prof?.gross_profit ?? 0),
      grossMargin: prof?.gross_margin_percentage ?? null,
      operatingContribution: Number(prof?.operating_contribution ?? 0),
    };
  }, [filteredRevenue, filteredExpense, profitabilityRows, periodId]);

  const tabs: TabKey[] = ["revenue", "expense", "profitability"];

  return (
    <div className="space-y-6" data-testid="budget-vs-actual-workspace">
      <div className="flex flex-wrap gap-2">
        {tabs.map((key) => (
          <button
            key={key}
            type="button"
            className={`rounded-md px-3 py-1.5 text-sm ${tab === key ? "bg-primary text-primary-foreground" : "bg-surface-muted text-foreground"}`}
            onClick={() => setTab(key)}
          >
            {t(`tabs.${key}`)}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <select className="rounded-md border px-2 py-1 text-sm" value={periodId} onChange={(e) => setPeriodId(e.target.value)}>
          <option value="">{t("filters.allPeriods")}</option>
          {fiscalPeriods.map((p) => (
            <option key={p.id} value={p.id}>{t("filters.period", { number: p.period_number })}</option>
          ))}
        </select>
        <select className="rounded-md border px-2 py-1 text-sm" value={payerId} onChange={(e) => setPayerId(e.target.value)}>
          <option value="">{t("filters.allPayers")}</option>
          {payers.map((p) => (
            <option key={p.id} value={p.id}>{pickLocalized(locale, p.labelEn, p.labelAr)}</option>
          ))}
        </select>
        <select className="rounded-md border px-2 py-1 text-sm" value={serviceLineId} onChange={(e) => setServiceLineId(e.target.value)}>
          <option value="">{t("filters.allServiceLines")}</option>
          {serviceLines.map((s) => (
            <option key={s.id} value={s.id}>{pickLocalized(locale, s.labelEn, s.labelAr)}</option>
          ))}
        </select>
        <Button type="button" variant="outline" size="sm" data-testid="export-bva-csv" disabled={exportPending} onClick={downloadExport}>
          {t("exportCsv")}
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card><CardHeader><CardTitle className="text-sm">{t("cards.revenueBudget")}</CardTitle></CardHeader><CardContent>{formatMoney(summary.revBudget, "SAR")}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">{t("cards.actualNetRevenue")}</CardTitle></CardHeader><CardContent>{formatMoney(summary.revActual, "SAR")}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">{t("cards.revenueVariance")}</CardTitle></CardHeader><CardContent>{formatMoney(summary.revVariance, "SAR")}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">{t("cards.grossProfit")}</CardTitle></CardHeader><CardContent>{formatMoney(summary.grossProfit, "SAR")}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">{t("cards.grossMargin")}</CardTitle></CardHeader><CardContent>{summary.grossMargin != null ? formatPercent(Number(summary.grossMargin) * 100) : "—"}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">{t("cards.operatingContribution")}</CardTitle></CardHeader><CardContent>{formatMoney(summary.operatingContribution, "SAR")}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">{t("cards.costBudget")}</CardTitle></CardHeader><CardContent>{formatMoney(summary.expBudget, "SAR")}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">{t("cards.costVariance")}</CardTitle></CardHeader><CardContent>{formatMoney(summary.expVariance, "SAR")}</CardContent></Card>
      </div>

      {tab === "revenue" ? (
        <Card>
          <CardHeader><CardTitle className="text-base">{t("tables.revenue")}</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="p-2">{t("columns.period")}</th>
                  <th className="p-2">{t("columns.budget")}</th>
                  <th className="p-2">{t("columns.gross")}</th>
                  <th className="p-2">{t("columns.rejections")}</th>
                  <th className="p-2">{t("columns.net")}</th>
                  <th className="p-2">{t("columns.variance")}</th>
                  <th className="p-2">{t("columns.status")}</th>
                </tr>
              </thead>
              <tbody>
                {filteredRevenue.map((r, idx) => (
                  <tr key={`${r.fiscal_period_id}-${r.payer_id}-${idx}`} className="border-b" data-testid="revenue-row">
                    <td className="p-2">{r.period_number}</td>
                    <td className="p-2">{formatMoney(r.budgeted_revenue, "SAR")}</td>
                    <td className="p-2">{formatMoney(r.gross_actual_revenue, "SAR")}</td>
                    <td className="p-2">{formatMoney(r.rejection_amount, "SAR")}</td>
                    <td className="p-2">{formatMoney(r.external_net_revenue, "SAR")}</td>
                    <td className="p-2">{formatMoney(r.revenue_variance, "SAR")}</td>
                    <td className="p-2">
                      <Badge variant="outline">
                        {Number(r.revenue_variance) >= 0 ? tStatus("favorable") : tStatus("unfavorable")}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : null}

      {tab === "expense" ? (
        <Card>
          <CardHeader><CardTitle className="text-base">{t("tables.expense")}</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="p-2">{t("columns.period")}</th>
                  <th className="p-2">{t("columns.classification")}</th>
                  <th className="p-2">{t("columns.budget")}</th>
                  <th className="p-2">{t("columns.actual")}</th>
                  <th className="p-2">{t("columns.commitment")}</th>
                  <th className="p-2">{t("columns.variance")}</th>
                  <th className="p-2">{t("columns.status")}</th>
                </tr>
              </thead>
              <tbody>
                {filteredExpense.map((r, idx) => (
                  <tr key={`${r.fiscal_period_id}-${r.cost_node_id}-${idx}`} className="border-b" data-testid="expense-row">
                    <td className="p-2">{r.period_number}</td>
                    <td className="p-2">{r.financial_reporting_group}</td>
                    <td className="p-2">{formatMoney(r.monthly_budget, "SAR")}</td>
                    <td className="p-2">{formatMoney(r.mtd_actual, "SAR")}</td>
                    <td className="p-2">{formatMoney(r.commitment_open_current, "SAR")}</td>
                    <td className="p-2">{formatMoney(r.variance_amount, "SAR")}</td>
                    <td className="p-2"><Badge variant="outline">{tStatus(r.variance_status)}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : null}

      {tab === "profitability" ? (
        <Card data-testid="profitability-section">
          <CardHeader><CardTitle className="text-base">{t("tables.profitability")}</CardTitle></CardHeader>
          <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
            {profitabilityRows.map((p) => (
              <div key={p.fiscal_period_id} className="rounded border p-3">
                <p>{t("columns.period")}: {p.period_number}</p>
                <p>{t("columns.net")}: {formatMoney(p.net_revenue, "SAR")}</p>
                <p>{t("cards.grossProfit")}: {formatMoney(p.gross_profit, "SAR")}</p>
                <p>{t("cards.grossMargin")}: {p.gross_margin_percentage != null ? formatPercent(Number(p.gross_margin_percentage) * 100) : "—"}</p>
                <p>{t("cards.operatingContribution")}: {formatMoney(p.operating_contribution, "SAR")}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
