import { setRequestLocale, getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/money";
import { fetchProjectDashboardAction } from "@/app/actions/project-actions";
import { CONTROL_SCOPE_KM_HOSPITAL } from "@/types/database";
import { pickLocalized } from "@/lib/i18n/display";
import { loadRouteData, requireRoutePermission } from "@/lib/auth/route-authorization";

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
          <CardContent>{metrics?.costPerformanceIndex?.toFixed(2) ?? "N/A"}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">{t("spi")}</CardTitle></CardHeader>
          <CardContent>{metrics?.schedulePerformanceIndex?.toFixed(2) ?? "N/A"}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">EAC</CardTitle></CardHeader>
          <CardContent>
            {metrics?.estimateAtCompletion
              ? formatMoney(metrics.estimateAtCompletion, "SAR")
              : "N/A"}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">VAC</CardTitle></CardHeader>
          <CardContent>
            {metrics?.varianceAtCompletion
              ? formatMoney(metrics.varianceAtCompletion, "SAR")
              : "N/A"}
          </CardContent>
        </Card>
      </div>
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
