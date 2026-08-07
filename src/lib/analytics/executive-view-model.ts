import { money } from "@/lib/money";
import {
  classifyExpenseVarianceStatus,
  classifyRevenueVarianceStatus,
  calculateVariancePercentage,
} from "@/domain/financial/calculations";
import {
  formatCompactMoney,
  formatCompactPercent,
  toNumber,
} from "@/domain/analytics/format";
import {
  profitabilityTrendSeries,
  revenueTrendSeries,
  sparklineFromSeries,
  utilizationByClassification,
} from "@/domain/analytics/series";
import { buildGrossToNetBridge, buildProfitabilityBridge } from "@/domain/analytics/bridges";
import type {
  ChartPoint,
  ChartSeriesDef,
  KpiMetric,
  ManagementInsight,
  WaterfallStep,
} from "@/domain/analytics/types";
import type {
  BudgetVsActualRow,
  ProfitabilityRow,
  RevenueBudgetVsActualRow,
} from "@/data/repositories/revenue-repository";

export interface ExecutiveAnalyticsModel {
  kpis: KpiMetric[];
  revenueTrend: ChartPoint[];
  revenueSeries: ChartSeriesDef[];
  utilization: ChartPoint[];
  utilizationSeries: ChartSeriesDef[];
  profitabilityTrend: ChartPoint[];
  profitabilitySeries: ChartSeriesDef[];
  grossToNet: WaterfallStep[];
  profitabilityBridge: WaterfallStep[];
  insights: ManagementInsight[];
  exceptions: Array<{ id: string; label: string; count: number; href?: string; tone?: "neutral" | "warning" | "danger" }>;
}

export function buildExecutiveAnalyticsModel(input: {
  locale: string;
  localePrefix: string;
  arabicCurrency?: boolean;
  revenueRows: RevenueBudgetVsActualRow[];
  expenseRows: BudgetVsActualRow[];
  profitabilityRows: ProfitabilityRow[];
  openCommitments: number;
  delayedMilestones: number;
  matchExceptions: number;
  unmappedActuals: number;
  periodBlockers: number;
  labels: {
    revenue: string;
    revenueVsBudget: string;
    grossProfit: string;
    grossMargin: string;
    operatingContribution: string;
    actualOperatingCost: string;
    openCommitments: string;
    capex: string;
    capexSubtitle: string;
    budget: string;
    actual: string;
    commitment: string;
    remaining: string;
    netRevenue: string;
    grossProfitSeries: string;
    operatingContributionSeries: string;
    costOfRevenue: string;
    payroll: string;
    opex: string;
    gross: string;
    rejections: string;
    discounts: string;
    refunds: string;
    creditNotes: string;
    otherDeductions: string;
    adjustments: string;
    net: string;
    classification: Record<string, string>;
    exceptions: {
      delayedMilestones: string;
      matchExceptions: string;
      unmapped: string;
      periodBlockers: string;
    };
    insights: {
      matchExceptions: string;
      delayedMilestones: string;
    };
  };
}): ExecutiveAnalyticsModel {
  const fmt = (v: number) =>
    formatCompactMoney(v, { locale: input.locale, arabicCurrency: input.arabicCurrency });

  const revenueBudget = input.revenueRows.reduce((s, r) => s + toNumber(r.budgeted_revenue), 0);
  const revenueActual = input.revenueRows.reduce((s, r) => s + toNumber(r.actual_net_revenue), 0);
  const gross = input.revenueRows.reduce((s, r) => s + toNumber(r.gross_actual_revenue), 0);
  const rejections = input.revenueRows.reduce((s, r) => s + toNumber(r.rejection_amount), 0);
  const discounts = input.revenueRows.reduce((s, r) => s + toNumber(r.discount_amount), 0);
  const refunds = input.revenueRows.reduce((s, r) => s + toNumber(r.refund_amount), 0);
  const credits = input.revenueRows.reduce((s, r) => s + toNumber(r.credit_note_amount), 0);
  const otherDed = input.revenueRows.reduce((s, r) => s + toNumber(r.other_deduction_amount), 0);

  const latestProfit = [...input.profitabilityRows].sort((a, b) => a.period_number - b.period_number).at(-1);
  const totalProfit = input.profitabilityRows.reduce(
    (acc, row) => ({
      net: acc.net + toNumber(row.net_revenue),
      cor: acc.cor + toNumber(row.cost_of_revenue),
      gp: acc.gp + toNumber(row.gross_profit),
      payroll: acc.payroll + toNumber(row.payroll),
      opex: acc.opex + toNumber(row.operating_expenses),
      oc: acc.oc + toNumber(row.operating_contribution),
      capex: acc.capex + toNumber(row.capex_actual),
    }),
    { net: 0, cor: 0, gp: 0, payroll: 0, opex: 0, oc: 0, capex: 0 },
  );

  const expenseActual = input.expenseRows.reduce((s, r) => s + toNumber(r.mtd_actual), 0);
  const revStatus = classifyRevenueVarianceStatus(revenueBudget, revenueActual);
  const revVarPct = calculateVariancePercentage({
    varianceAmount: money(revenueActual).minus(revenueBudget),
    budgetAmount: revenueBudget,
  });

  const revenueTrend = revenueTrendSeries(input.revenueRows);
  const profitabilityTrend = profitabilityTrendSeries(input.profitabilityRows);
  const utilization = utilizationByClassification(input.expenseRows, input.labels.classification);

  const kpis: KpiMetric[] = [
    {
      id: "revenue",
      label: input.labels.revenue,
      value: revenueActual,
      formattedValue: fmt(revenueActual),
      href: `${input.localePrefix}/cost-control`,
      sparkline: sparklineFromSeries(revenueTrend, "actual"),
    },
    {
      id: "revenue-vs-budget",
      label: input.labels.revenueVsBudget,
      value: revenueActual - revenueBudget,
      formattedValue: fmt(revenueActual - revenueBudget),
      variancePercent: revVarPct?.toNumber() ?? null,
      varianceStatus: revStatus,
      href: `${input.localePrefix}/cost-control`,
    },
    {
      id: "gross-profit",
      label: input.labels.grossProfit,
      value: totalProfit.gp,
      formattedValue: fmt(totalProfit.gp),
    },
    {
      id: "gross-margin",
      label: input.labels.grossMargin,
      value: latestProfit?.gross_margin_percentage != null ? toNumber(latestProfit.gross_margin_percentage) : null,
      formattedValue:
        latestProfit?.gross_margin_percentage != null
          ? formatCompactPercent(toNumber(latestProfit.gross_margin_percentage) * 100, input.locale)
          : "—",
    },
    {
      id: "operating-contribution",
      label: input.labels.operatingContribution,
      value: totalProfit.oc,
      formattedValue: fmt(totalProfit.oc),
    },
    {
      id: "actual-opex",
      label: input.labels.actualOperatingCost,
      value: expenseActual,
      formattedValue: fmt(expenseActual),
      varianceStatus: classifyExpenseVarianceStatus(
        input.expenseRows.reduce((s, r) => s + toNumber(r.monthly_budget), 0),
        expenseActual,
      ),
    },
    {
      id: "open-commitments",
      label: input.labels.openCommitments,
      value: input.openCommitments,
      formattedValue: fmt(input.openCommitments),
      href: `${input.localePrefix}/commitments`,
    },
    {
      id: "capex",
      label: input.labels.capex,
      value: totalProfit.capex,
      formattedValue: fmt(totalProfit.capex),
      subtitle: input.labels.capexSubtitle,
    },
  ];

  const insights: ManagementInsight[] = [];
  if (revenueBudget !== 0) {
    const pct = ((revenueActual - revenueBudget) / revenueBudget) * 100;
    insights.push({
      id: "rev-vs-budget",
      text: `${input.labels.revenueVsBudget}: ${formatCompactPercent(pct, input.locale)}`,
      tone: revStatus === "favorable" ? "favorable" : revStatus === "unfavorable" ? "unfavorable" : "neutral",
      href: `${input.localePrefix}/cost-control`,
    });
  }
  if (input.matchExceptions > 0) {
    insights.push({
      id: "match-ex",
      text: input.labels.insights.matchExceptions,
      tone: "warning",
      href: `${input.localePrefix}/supplier-invoices`,
    });
  }
  if (input.delayedMilestones > 0) {
    insights.push({
      id: "delayed-ms",
      text: input.labels.insights.delayedMilestones,
      tone: "warning",
      href: `${input.localePrefix}/milestones`,
    });
  }

  return {
    kpis,
    revenueTrend,
    revenueSeries: [
      { key: "budget", label: input.labels.budget, token: "chart-2" },
      { key: "actual", label: input.labels.actual, token: "chart-1" },
    ],
    utilization,
    utilizationSeries: [
      { key: "budget", label: input.labels.budget, token: "chart-2" },
      { key: "actual", label: input.labels.actual, token: "chart-1" },
      { key: "commitment", label: input.labels.commitment, token: "chart-4" },
      { key: "remaining", label: input.labels.remaining, token: "chart-6" },
    ],
    profitabilityTrend,
    profitabilitySeries: [
      { key: "netRevenue", label: input.labels.netRevenue, token: "chart-1" },
      { key: "grossProfit", label: input.labels.grossProfitSeries, token: "chart-3" },
      { key: "operatingContribution", label: input.labels.operatingContributionSeries, token: "chart-5" },
    ],
    grossToNet: buildGrossToNetBridge({
      grossRevenue: gross,
      rejections,
      discounts,
      refunds,
      creditNotes: credits,
      otherDeductions: otherDed,
      netRevenue: revenueActual,
      labels: {
        gross: input.labels.gross,
        rejections: input.labels.rejections,
        discounts: input.labels.discounts,
        refunds: input.labels.refunds,
        creditNotes: input.labels.creditNotes,
        otherDeductions: input.labels.otherDeductions,
        adjustments: input.labels.adjustments,
        net: input.labels.net,
      },
    }),
    profitabilityBridge: buildProfitabilityBridge({
      netRevenue: input.profitabilityRows.length > 0 ? totalProfit.net : revenueActual,
      costOfRevenue: totalProfit.cor,
      grossProfit: totalProfit.gp,
      payroll: totalProfit.payroll,
      operatingExpenses: totalProfit.opex,
      operatingContribution: totalProfit.oc,
      labels: {
        netRevenue: input.labels.netRevenue,
        costOfRevenue: input.labels.costOfRevenue,
        grossProfit: input.labels.grossProfit,
        payroll: input.labels.payroll,
        operatingExpenses: input.labels.opex,
        operatingContribution: input.labels.operatingContribution,
      },
    }),
    insights,
    exceptions: [
      {
        id: "delayed",
        label: input.labels.exceptions.delayedMilestones,
        count: input.delayedMilestones,
        href: `${input.localePrefix}/milestones`,
        tone: input.delayedMilestones > 0 ? "warning" : "neutral",
      },
      {
        id: "match",
        label: input.labels.exceptions.matchExceptions,
        count: input.matchExceptions,
        href: `${input.localePrefix}/supplier-invoices`,
        tone: input.matchExceptions > 0 ? "danger" : "neutral",
      },
      {
        id: "unmapped",
        label: input.labels.exceptions.unmapped,
        count: input.unmappedActuals,
        href: `${input.localePrefix}/actuals`,
        tone: input.unmappedActuals > 0 ? "warning" : "neutral",
      },
      {
        id: "period",
        label: input.labels.exceptions.periodBlockers,
        count: input.periodBlockers,
        href: `${input.localePrefix}/period-close`,
        tone: input.periodBlockers > 0 ? "danger" : "neutral",
      },
    ],
  };
}
