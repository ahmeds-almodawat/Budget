import { setRequestLocale, getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/money";
import { fetchProjectDashboardAction } from "@/app/actions/project-actions";
import { CONTROL_SCOPE_KM_HOSPITAL } from "@/types/database";
import { pickLocalized } from "@/lib/i18n/display";
import { loadRouteData, requireRoutePermission } from "@/lib/auth/route-authorization";
import { formatCompactMoney, formatRatio, toNumber } from "@/domain/analytics/format";
import type { ChartPoint, ChartSeriesDef, KpiMetric } from "@/domain/analytics/types";
import { ProjectEvmAnalyticsPanel } from "@/components/dashboard/project-evm-analytics-panel";

function decimalToNumber(value: { toNumber?: () => number; toString: () => string } | number | string | null | undefined): number | null {
  if (value == null) return null;
  if (typeof value === "number") return value;
  if (typeof value === "string") return toNumber(value);
  if (typeof value.toNumber === "function") return value.toNumber();
  return toNumber(value.toString());
}

export default async function ProjectDashboardPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  await requireRoutePermission("project", "read");
  const t = await getTranslations("dashboard.project");
  const tPages = await getTranslations("pages.projects");
  const tLabels = await getTranslations("dashboardLabels");
  const tAnalytics = await getTranslations("analytics");
  const arabicCurrency = locale.startsWith("ar");
  const moneyLocale = locale.startsWith("ar") ? "ar-SA" : "en-SA";

  const scopeId = id === "cs-khamis-hospital" ? CONTROL_SCOPE_KM_HOSPITAL : id;
  const dashboard = await loadRouteData(() => fetchProjectDashboardAction(scopeId));

  if (!dashboard) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-text-secondary">{tPages("notFound")}</p>
      </div>
    );
  }

  const { project, metrics, milestones } = dashboard;
  const fmt = (v: number) =>
    formatCompactMoney(v, { locale: moneyLocale, arabicCurrency });

  const bac = decimalToNumber(metrics?.budgetAtCompletion);
  const pv = decimalToNumber(metrics?.plannedValue);
  const ev = decimalToNumber(metrics?.earnedValue);
  const ac = decimalToNumber(metrics?.actualCost);
  const cv = decimalToNumber(metrics?.costVariance);
  const sv = decimalToNumber(metrics?.scheduleVariance);
  const cpi = decimalToNumber(metrics?.costPerformanceIndex);
  const spi = decimalToNumber(metrics?.schedulePerformanceIndex);
  const eac = decimalToNumber(metrics?.estimateAtCompletion);

  const kpis: KpiMetric[] = metrics
    ? [
        {
          id: "bac",
          label: tAnalytics("kpi.bac"),
          value: bac,
          formattedValue: bac == null ? "—" : fmt(bac),
        },
        {
          id: "pv",
          label: t("pv"),
          value: pv,
          formattedValue: pv == null ? "—" : fmt(pv),
        },
        {
          id: "ev",
          label: t("ev"),
          value: ev,
          formattedValue: ev == null ? "—" : fmt(ev),
        },
        {
          id: "ac",
          label: t("ac"),
          value: ac,
          formattedValue: ac == null ? "—" : fmt(ac),
        },
        {
          id: "cpi",
          label: tAnalytics("kpi.cpi"),
          value: cpi,
          formattedValue: formatRatio(cpi, locale),
        },
        {
          id: "spi",
          label: tAnalytics("kpi.spi"),
          value: spi,
          formattedValue: formatRatio(spi, locale),
        },
        {
          id: "cv",
          label: tAnalytics("kpi.cv"),
          value: cv,
          formattedValue: cv == null ? "—" : fmt(cv),
        },
        {
          id: "sv",
          label: tAnalytics("kpi.sv"),
          value: sv,
          formattedValue: sv == null ? "—" : fmt(sv),
        },
        {
          id: "eac",
          label: tAnalytics("kpi.eac"),
          value: eac,
          formattedValue: eac == null ? "—" : fmt(eac),
        },
      ]
    : [];

  // EVM view is a current control-account snapshot — no period history series.
  const trend: ChartPoint[] = [];
  const trendSeries: ChartSeriesDef[] = [
    { key: "pv", label: tAnalytics("series.pv"), token: "chart-1", type: "line" },
    { key: "ev", label: tAnalytics("series.ev"), token: "chart-2", type: "line" },
    { key: "ac", label: tAnalytics("series.ac"), token: "chart-3", type: "line" },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <p className="text-text-secondary">
        {pickLocalized(locale, project.control_scopes?.name_en, project.control_scopes?.name_ar)}
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">{t("pv")}</CardTitle></CardHeader>
          <CardContent>
            {metrics ? formatMoney(metrics.plannedValue, "SAR") : tPages("insufficientData")}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">{t("ev")}</CardTitle></CardHeader>
          <CardContent>
            {metrics ? formatMoney(metrics.earnedValue, "SAR") : tPages("insufficientData")}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">{t("ac")}</CardTitle></CardHeader>
          <CardContent>
            {metrics ? formatMoney(metrics.actualCost, "SAR") : tPages("insufficientData")}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">{t("cpi")}</CardTitle></CardHeader>
          <CardContent>{metrics?.costPerformanceIndex?.toFixed(2) ?? tPages("insufficientData")}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">{t("spi")}</CardTitle></CardHeader>
          <CardContent>{metrics?.schedulePerformanceIndex?.toFixed(2) ?? tPages("insufficientData")}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">{tAnalytics("kpi.eac")}</CardTitle></CardHeader>
          <CardContent>
            {metrics?.estimateAtCompletion != null
              ? formatMoney(metrics.estimateAtCompletion, "SAR")
              : tPages("insufficientData")}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">{tAnalytics("kpi.vac")}</CardTitle></CardHeader>
          <CardContent>
            {metrics?.varianceAtCompletion != null
              ? formatMoney(metrics.varianceAtCompletion, "SAR")
              : tPages("insufficientData")}
          </CardContent>
        </Card>
      </div>

      <ProjectEvmAnalyticsPanel
        locale={locale}
        kpis={kpis}
        trend={trend}
        trendSeries={trendSeries}
        titles={{
          evm: tAnalytics("sections.evm"),
          empty: tAnalytics("empty.period"),
        }}
      />

      <Card>
        <CardHeader><CardTitle>{tLabels("baselines")}</CardTitle></CardHeader>
        <CardContent className="grid gap-2 text-sm md:grid-cols-2">
          <div>{tLabels("originalBaselineStart")}: {project.baseline_start}</div>
          <div>{tLabels("originalBaselineEnd")}: {project.baseline_end}</div>
          <div>{tLabels("currentForecastEnd")}: {project.forecast_end}</div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>{t("timeline")}</CardTitle></CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            {milestones.map((m) => (
              <li key={m.id} className="flex justify-between border-b py-2">
                <span>{pickLocalized(locale, m.name_en, m.name_ar)}</span>
                <span>{m.approved_progress}% — {m.approval_status}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
