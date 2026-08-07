import { setRequestLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/money";
import { fetchHospitalDashboardAction, createVarianceExplanationAction } from "@/app/actions/budget-actions";
import {
  classifyExpenseVarianceStatus,
  calculateVariancePercentage,
  isVarianceExplanationRequired,
} from "@/domain/financial/calculations";
import { formatCompactMoney, toNumber } from "@/domain/analytics/format";
import type { ChartPoint, ChartSeriesDef, KpiMetric } from "@/domain/analytics/types";
import { HospitalAnalyticsPanel } from "@/components/dashboard/hospital-analytics-panel";
import { CONTROL_ACCOUNT_PHARM_INJ } from "@/types/database";
import { requireRoutePermission } from "@/lib/auth/route-authorization";

export default async function HospitalDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRoutePermission("budget", "read");
  const t = await getTranslations("dashboard.hospital");
  const tLabels = await getTranslations("dashboardLabels");
  const tAnalytics = await getTranslations("analytics");
  const arabicCurrency = locale.startsWith("ar");
  const moneyLocale = locale.startsWith("ar") ? "ar-SA" : "en-SA";

  let performance = null;
  let dbError = false;
  try {
    performance = await fetchHospitalDashboardAction();
  } catch {
    dbError = true;
  }

  if (!performance) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <Card>
          <CardContent className="p-6 text-text-secondary">
            {dbError ? tAnalytics("empty.errorHint") : tLabels("noApprovedBudget")}
          </CardContent>
        </Card>
        <Link href={`/${locale}/budgets`} className="text-primary hover:underline">
          {tLabels("goToBudgets")}
        </Link>
      </div>
    );
  }

  const mtdVariance = Number(performance.mtdActual) - Number(performance.mtdBudget);
  const explanationRequired = isVarianceExplanationRequired({
    varianceAmount: String(mtdVariance),
    budgetAmount: performance.mtdBudget,
    thresholdAmount: "25000",
    thresholdPercent: "10",
  });

  if (explanationRequired && performance.currentPeriodId) {
    await createVarianceExplanationAction({
      controlAccountId: CONTROL_ACCOUNT_PHARM_INJ,
      fiscalPeriodId: performance.currentPeriodId,
      varianceAmount: String(mtdVariance),
      cause: "MTD pharmacy injectable volume above plan",
    }).catch(() => undefined);
  }

  const fmt = (v: number) =>
    formatCompactMoney(v, { locale: moneyLocale, arabicCurrency });

  const mtdBudget = toNumber(performance.mtdBudget);
  const mtdActual = toNumber(performance.mtdActual);
  const ytdBudget = toNumber(performance.ytdBudget);
  const ytdActual = toNumber(performance.ytdActual);
  const currentApproved = toNumber(performance.currentApproved);
  const fullYearForecast = toNumber(performance.fullYearForecast);
  const remainingBudget = toNumber(performance.remainingBudget);

  const mtdStatus = classifyExpenseVarianceStatus(mtdBudget, mtdActual);
  const mtdVarPct = calculateVariancePercentage({
    varianceAmount: mtdBudget - mtdActual,
    budgetAmount: mtdBudget,
  });

  const kpis: KpiMetric[] = [
    {
      id: "mtd-actual",
      label: t("mtd"),
      value: mtdActual,
      formattedValue: fmt(mtdActual),
      subtitle: `${tLabels("budget")}: ${fmt(mtdBudget)}`,
      variance: mtdBudget - mtdActual,
      variancePercent: mtdVarPct?.toNumber() ?? null,
      varianceStatus: mtdStatus,
    },
    {
      id: "ytd-actual",
      label: t("ytd"),
      value: ytdActual,
      formattedValue: fmt(ytdActual),
      subtitle: `${tLabels("budget")}: ${fmt(ytdBudget)}`,
    },
    {
      id: "current-approved",
      label: tLabels("currentApproved"),
      value: currentApproved,
      formattedValue: fmt(currentApproved),
    },
    {
      id: "forecast",
      label: t("fullYearForecast"),
      value: fullYearForecast,
      formattedValue: fmt(fullYearForecast),
      subtitle: `${tAnalytics("series.remaining")}: ${fmt(remainingBudget)}`,
    },
  ];

  // No multi-period series is returned by fetchHospitalDashboardAction — empty trend.
  const trend: ChartPoint[] = [];
  const trendSeries: ChartSeriesDef[] = [
    { key: "budget", label: tAnalytics("series.budget"), token: "chart-1", type: "area" },
    { key: "actual", label: tAnalytics("series.actual"), token: "chart-2", type: "area" },
    { key: "forecast", label: tAnalytics("series.forecast"), token: "chart-3", type: "line" },
  ];

  const utilization: ChartPoint[] = [
    {
      key: "mtd",
      label: t("mtd"),
      budget: mtdBudget,
      actual: mtdActual,
      remaining: Math.max(0, mtdBudget - mtdActual),
    },
    {
      key: "ytd",
      label: t("ytd"),
      budget: ytdBudget,
      actual: ytdActual,
      remaining: Math.max(0, ytdBudget - ytdActual),
    },
  ];

  const utilizationSeries: ChartSeriesDef[] = [
    { key: "budget", label: tAnalytics("series.budget"), token: "chart-1", type: "bar" },
    { key: "actual", label: tAnalytics("series.actual"), token: "chart-2", type: "bar" },
    { key: "remaining", label: tAnalytics("series.remaining"), token: "chart-6", type: "bar" },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">{t("mtd")}</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1">
            <div>{tLabels("budget")}: {formatMoney(performance.mtdBudget, "SAR")}</div>
            <div>{tLabels("actual")}: {formatMoney(performance.mtdActual, "SAR")}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">{t("ytd")}</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1">
            <div>{tLabels("budget")}: {formatMoney(performance.ytdBudget, "SAR")}</div>
            <div>{tLabels("actual")}: {formatMoney(performance.ytdActual, "SAR")}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">{tLabels("currentApproved")}</CardTitle></CardHeader>
          <CardContent>{formatMoney(performance.currentApproved, "SAR")}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">{t("fullYearForecast")}</CardTitle></CardHeader>
          <CardContent>{formatMoney(performance.fullYearForecast, "SAR")}</CardContent>
        </Card>
      </div>

      <HospitalAnalyticsPanel
        locale={locale}
        kpis={kpis}
        utilization={utilization}
        utilizationSeries={utilizationSeries}
        trend={trend}
        trendSeries={trendSeries}
        titles={{
          kpis: tAnalytics("sections.kpis"),
          forecastTrend: tAnalytics("sections.forecastTrend"),
          utilization: tAnalytics("sections.utilization"),
          empty: tAnalytics("empty.period"),
        }}
      />

      {explanationRequired ? (
        <Card className="border-warning/40 bg-warning-surface">
          <CardContent className="p-4 text-warning">
            {t("varianceExplanationRequired")} — {t("mtd")} {formatMoney(String(mtdVariance), "SAR")}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{tLabels("budgetLineDrillDown")}</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-start">
                <th className="py-2">{tLabels("line")}</th>
                <th className="py-2">{tLabels("budget")}</th>
                <th className="py-2">{tLabels("details")}</th>
              </tr>
            </thead>
            <tbody>
              {performance.lines.map((line) => (
                <tr key={line.id} className="border-b">
                  <td className="py-2 font-mono text-xs">{line.id.slice(0, 8)}</td>
                  <td className="py-2">{formatMoney(line.planned_amount, "SAR")}</td>
                  <td className="py-2">
                    <Link href={`/${locale}/budgets/transactions/${line.id}`} className="text-primary hover:underline">
                      {tLabels("transactions")}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
