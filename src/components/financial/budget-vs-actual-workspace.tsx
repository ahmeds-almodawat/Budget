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
import {
  AnalyticsSection,
  ChartCard,
  FinancialTrendChart,
  KpiCard,
  KpiGrid,
  VarianceBars,
  WaterfallChart,
} from "@/components/analytics";
import { buildGrossToNetBridge, buildProfitabilityBridge } from "@/domain/analytics/bridges";
import {
  formatCompactMoney,
  formatCompactPercent,
  toNumber,
} from "@/domain/analytics/format";
import {
  expenseTrendSeries,
  profitabilityTrendSeries,
  revenueTrendSeries,
  sparklineFromSeries,
  topVariances,
} from "@/domain/analytics/series";
import type { ChartSeriesDef, KpiMetric } from "@/domain/analytics/types";

type TabKey = "revenue" | "expense" | "profitability";
type TrendMode = TabKey;

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
  const tAnalytics = useTranslations("analytics");
  const tStatus = useTranslations("varianceStatus");
  const [tab, setTab] = useState<TabKey>("revenue");
  const [trendMode, setTrendMode] = useState<TrendMode>("revenue");
  const [periodId, setPeriodId] = useState("");
  const [payerId, setPayerId] = useState("");
  const [serviceLineId, setServiceLineId] = useState("");
  const [exportPending, startExport] = useTransition();

  const moneyLocale = locale.startsWith("ar") ? "ar-SA" : "en-SA";
  const arabicCurrency = locale.startsWith("ar");

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

  const filteredProfitability = useMemo(
    () => profitabilityRows.filter((p) => !periodId || p.fiscal_period_id === periodId),
    [profitabilityRows, periodId],
  );

  const summary = useMemo(() => {
    const revBudget = filteredRevenue.reduce((s, r) => s + toNumber(r.budgeted_revenue), 0);
    const revActual = filteredRevenue.reduce((s, r) => s + toNumber(r.external_net_revenue), 0);
    const revActualNet = filteredRevenue.reduce((s, r) => s + toNumber(r.actual_net_revenue), 0);
    const expBudget = filteredExpense.reduce((s, r) => s + toNumber(r.monthly_budget), 0);
    const expActual = filteredExpense.reduce((s, r) => s + toNumber(r.mtd_actual), 0);
    const profitTotals = filteredProfitability.reduce(
      (acc, row) => ({
        net: acc.net + toNumber(row.net_revenue),
        cor: acc.cor + toNumber(row.cost_of_revenue),
        gp: acc.gp + toNumber(row.gross_profit),
        payroll: acc.payroll + toNumber(row.payroll),
        opex: acc.opex + toNumber(row.operating_expenses),
        oc: acc.oc + toNumber(row.operating_contribution),
      }),
      { net: 0, cor: 0, gp: 0, payroll: 0, opex: 0, oc: 0 },
    );
    const latestProfit = [...filteredProfitability].sort((a, b) => a.period_number - b.period_number).at(-1);
    return {
      revBudget,
      revActual,
      revActualNet,
      revVariance: revActual - revBudget,
      expBudget,
      expActual,
      expVariance: expBudget - expActual,
      gross: filteredRevenue.reduce((s, r) => s + toNumber(r.gross_actual_revenue), 0),
      rejections: filteredRevenue.reduce((s, r) => s + toNumber(r.rejection_amount), 0),
      discounts: filteredRevenue.reduce((s, r) => s + toNumber(r.discount_amount), 0),
      refunds: filteredRevenue.reduce((s, r) => s + toNumber(r.refund_amount), 0),
      credits: filteredRevenue.reduce((s, r) => s + toNumber(r.credit_note_amount), 0),
      otherDed: filteredRevenue.reduce((s, r) => s + toNumber(r.other_deduction_amount), 0),
      grossProfit: profitTotals.gp,
      grossMargin: latestProfit?.gross_margin_percentage ?? null,
      operatingContribution: profitTotals.oc,
      profitTotals,
    };
  }, [filteredRevenue, filteredExpense, filteredProfitability]);

  const fmt = (v: number) => formatCompactMoney(v, { locale: moneyLocale, arabicCurrency });

  const revenueTrend = useMemo(() => revenueTrendSeries(filteredRevenue), [filteredRevenue]);
  const expenseTrend = useMemo(() => expenseTrendSeries(filteredExpense), [filteredExpense]);
  const profitabilityTrend = useMemo(
    () => profitabilityTrendSeries(filteredProfitability),
    [filteredProfitability],
  );

  const kpiMetrics: KpiMetric[] = useMemo(
    () => [
      {
        id: "revenue",
        label: tAnalytics("kpi.revenue"),
        value: summary.revActualNet,
        formattedValue: fmt(summary.revActualNet),
        sparkline: sparklineFromSeries(revenueTrend, "actual"),
      },
      {
        id: "revenue-vs-budget",
        label: tAnalytics("kpi.revenueVsBudget"),
        value: summary.revActualNet - summary.revBudget,
        formattedValue: fmt(summary.revActualNet - summary.revBudget),
      },
      {
        id: "gross-profit",
        label: tAnalytics("kpi.grossProfit"),
        value: summary.grossProfit,
        formattedValue: fmt(summary.grossProfit),
      },
      {
        id: "gross-margin",
        label: tAnalytics("kpi.grossMargin"),
        value: summary.grossMargin != null ? toNumber(summary.grossMargin) : null,
        formattedValue:
          summary.grossMargin != null
            ? formatCompactPercent(toNumber(summary.grossMargin) * 100, locale)
            : "—",
      },
      {
        id: "operating-contribution",
        label: tAnalytics("kpi.operatingContribution"),
        value: summary.operatingContribution,
        formattedValue: fmt(summary.operatingContribution),
      },
      {
        id: "actual-operating-cost",
        label: tAnalytics("kpi.actualOperatingCost"),
        value: summary.expActual,
        formattedValue: fmt(summary.expActual),
        sparkline: sparklineFromSeries(expenseTrend, "actual"),
      },
    ],
    // fmt closes over locale; metrics recompute when filtered aggregates change
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
    [summary, revenueTrend, expenseTrend, locale, tAnalytics],
  );

  const trendChart = useMemo(() => {
    if (trendMode === "expense") {
      const series: ChartSeriesDef[] = [
        { key: "budget", label: tAnalytics("series.budget"), token: "chart-2" },
        { key: "actual", label: tAnalytics("series.actual"), token: "chart-1" },
      ];
      return { data: expenseTrend, series, title: tAnalytics("sections.expenseTrend") };
    }
    if (trendMode === "profitability") {
      const series: ChartSeriesDef[] = [
        { key: "netRevenue", label: tAnalytics("series.netRevenue"), token: "chart-1" },
        { key: "grossProfit", label: tAnalytics("series.grossProfit"), token: "chart-3" },
        {
          key: "operatingContribution",
          label: tAnalytics("series.operatingContribution"),
          token: "chart-5",
        },
      ];
      return { data: profitabilityTrend, series, title: tAnalytics("sections.profitabilityTrend") };
    }
    const series: ChartSeriesDef[] = [
      { key: "budget", label: tAnalytics("series.budget"), token: "chart-2" },
      { key: "actual", label: tAnalytics("series.actual"), token: "chart-1" },
    ];
    return { data: revenueTrend, series, title: tAnalytics("sections.revenueTrend") };
  }, [trendMode, expenseTrend, profitabilityTrend, revenueTrend, tAnalytics]);

  const grossToNet = useMemo(
    () =>
      buildGrossToNetBridge({
        grossRevenue: summary.gross,
        rejections: summary.rejections,
        discounts: summary.discounts,
        refunds: summary.refunds,
        creditNotes: summary.credits,
        otherDeductions: summary.otherDed,
        netRevenue: summary.revActualNet,
        labels: {
          gross: tAnalytics("bridge.gross"),
          rejections: tAnalytics("bridge.rejections"),
          discounts: tAnalytics("bridge.discounts"),
          refunds: tAnalytics("bridge.refunds"),
          creditNotes: tAnalytics("bridge.creditNotes"),
          otherDeductions: tAnalytics("bridge.otherDeductions"),
          adjustments: tAnalytics("bridge.adjustments"),
          net: tAnalytics("bridge.net"),
        },
      }),
    [summary, tAnalytics],
  );

  const profitabilityBridge = useMemo(
    () =>
      buildProfitabilityBridge({
        netRevenue: filteredProfitability.length > 0 ? summary.profitTotals.net : summary.revActualNet,
        costOfRevenue: summary.profitTotals.cor,
        grossProfit: summary.profitTotals.gp,
        payroll: summary.profitTotals.payroll,
        operatingExpenses: summary.profitTotals.opex,
        operatingContribution: summary.profitTotals.oc,
        labels: {
          netRevenue: tAnalytics("series.netRevenue"),
          costOfRevenue: tAnalytics("bridge.costOfRevenue"),
          grossProfit: tAnalytics("kpi.grossProfit"),
          payroll: tAnalytics("bridge.payroll"),
          operatingExpenses: tAnalytics("bridge.operatingExpenses"),
          operatingContribution: tAnalytics("kpi.operatingContribution"),
        },
      }),
    [summary, filteredProfitability.length, tAnalytics],
  );

  const varianceItems = useMemo(() => {
    const revenueItems = filteredRevenue.map((r, idx) => ({
      id: `rev-${r.fiscal_period_id}-${r.payer_id ?? "all"}-${idx}`,
      label: `P${r.period_number}`,
      budget: toNumber(r.budgeted_revenue),
      actual: toNumber(r.actual_net_revenue),
      kind: "revenue" as const,
    }));
    const expenseItems = filteredExpense.map((r, idx) => ({
      id: `exp-${r.fiscal_period_id}-${r.cost_node_id ?? r.financial_reporting_group}-${idx}`,
      label: `P${r.period_number} · ${r.financial_reporting_group}`,
      budget: toNumber(r.monthly_budget),
      actual: toNumber(r.mtd_actual),
      kind: "expense" as const,
    }));
    const all = [...revenueItems, ...expenseItems];
    return {
      favorable: topVariances(all, "favorable", 5),
      unfavorable: topVariances(all, "unfavorable", 5),
    };
  }, [filteredRevenue, filteredExpense]);

  const tabs: TabKey[] = ["revenue", "expense", "profitability"];
  const trendModes: TrendMode[] = ["revenue", "expense", "profitability"];
  const hasLoadedData =
    filteredRevenue.length > 0 || filteredExpense.length > 0 || filteredProfitability.length > 0;

  return (
    <div className="space-y-6" data-testid="budget-vs-actual-workspace">
      <AnalyticsSection title={tAnalytics("sections.kpis")}>
        {hasLoadedData ? (
          <KpiGrid>
            {kpiMetrics.map((metric) => (
              <KpiCard key={metric.id} metric={metric} locale={locale} />
            ))}
          </KpiGrid>
        ) : (
          <ChartCard title={tAnalytics("sections.kpis")} empty emptyTitle={tAnalytics("empty.period")}>
            <div />
          </ChartCard>
        )}
      </AnalyticsSection>

      <ChartCard
        title={trendChart.title}
        empty={!trendChart.data.length}
        emptyTitle={tAnalytics("empty.period")}
        actions={
          <div className="flex flex-wrap gap-1">
            {trendModes.map((mode) => (
              <Button
                key={mode}
                type="button"
                size="sm"
                variant={trendMode === mode ? "default" : "outline"}
                onClick={() => setTrendMode(mode)}
                aria-label={`${tAnalytics("common.chartData")}: ${tAnalytics(`modes.${mode}`)}`}
              >
                {tAnalytics(`modes.${mode}`)}
              </Button>
            ))}
          </div>
        }
      >
        <FinancialTrendChart
          data={trendChart.data}
          series={trendChart.series}
          mode={trendMode === "revenue" ? "area" : "line"}
          locale={moneyLocale}
        />
      </ChartCard>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard
          title={tAnalytics("sections.grossToNet")}
          empty={filteredRevenue.length === 0 || grossToNet.length < 2}
          emptyTitle={tAnalytics("empty.period")}
        >
          <WaterfallChart steps={grossToNet} locale={moneyLocale} />
        </ChartCard>
        <ChartCard
          title={tAnalytics("sections.profitabilityBridge")}
          empty={filteredProfitability.length === 0 || profitabilityBridge.length < 2}
          emptyTitle={tAnalytics("empty.period")}
        >
          <WaterfallChart steps={profitabilityBridge} locale={moneyLocale} />
        </ChartCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard
          title={tAnalytics("sections.favorableVariances")}
          empty={!varianceItems.favorable.length}
          emptyTitle={tAnalytics("empty.period")}
        >
          <VarianceBars items={varianceItems.favorable} locale={moneyLocale} />
        </ChartCard>
        <ChartCard
          title={tAnalytics("sections.unfavorableVariances")}
          empty={!varianceItems.unfavorable.length}
          emptyTitle={tAnalytics("empty.period")}
        >
          <VarianceBars items={varianceItems.unfavorable} locale={moneyLocale} />
        </ChartCard>
      </div>

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
                <tr className="border-b text-start text-muted-foreground">
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
                <tr className="border-b text-start text-muted-foreground">
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
            {filteredProfitability.map((p) => (
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
