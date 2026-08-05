import { setRequestLocale, getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/money";
import { fetchProjectDashboardAction } from "@/app/actions/project-actions";
import { CONTROL_SCOPE_KM_HOSPITAL } from "@/types/database";

export default async function ProjectDashboardPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("dashboard.project");

  const scopeId = id === "cs-khamis-hospital" ? CONTROL_SCOPE_KM_HOSPITAL : id;
  const dashboard = await fetchProjectDashboardAction(scopeId);

  if (!dashboard) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-slate-600">{locale === "ar" ? "المشروع غير موجود" : "Project not found"}</p>
      </div>
    );
  }

  const { project, metrics, milestones } = dashboard;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <p className="text-slate-600">
        {locale === "ar" ? project.control_scopes?.name_ar : project.control_scopes?.name_en}
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">{t("pv")}</CardTitle></CardHeader>
          <CardContent>{formatMoney(metrics.plannedValue, "SAR")}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">{t("ev")}</CardTitle></CardHeader>
          <CardContent>{formatMoney(metrics.earnedValue, "SAR")}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">{t("ac")}</CardTitle></CardHeader>
          <CardContent>{formatMoney(metrics.actualCost, "SAR")}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">{t("cpi")}</CardTitle></CardHeader>
          <CardContent>{metrics.costPerformanceIndex?.toFixed(2) ?? "N/A"}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">{t("spi")}</CardTitle></CardHeader>
          <CardContent>{metrics.schedulePerformanceIndex?.toFixed(2) ?? "N/A"}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">EAC</CardTitle></CardHeader>
          <CardContent>
            {metrics.estimateAtCompletion
              ? formatMoney(metrics.estimateAtCompletion, "SAR")
              : "N/A"}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">VAC</CardTitle></CardHeader>
          <CardContent>
            {metrics.varianceAtCompletion
              ? formatMoney(metrics.varianceAtCompletion, "SAR")
              : "N/A"}
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader><CardTitle>{locale === "ar" ? "خط الأساس" : "Baselines"}</CardTitle></CardHeader>
        <CardContent className="grid gap-2 text-sm md:grid-cols-2">
          <div>{locale === "ar" ? "البداية الأصلية" : "Original baseline start"}: {project.baseline_start}</div>
          <div>{locale === "ar" ? "النهاية الأصلية" : "Original baseline end"}: {project.baseline_end}</div>
          <div>{locale === "ar" ? "التوقع الحالي" : "Forecast end"}: {project.forecast_end}</div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>{locale === "ar" ? "المعالم" : "Milestones"}</CardTitle></CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            {milestones.map((m) => (
              <li key={m.id} className="flex justify-between border-b py-2">
                <span>{locale === "ar" ? m.name_ar : m.name_en}</span>
                <span>{m.approved_progress}% — {m.approval_status}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
