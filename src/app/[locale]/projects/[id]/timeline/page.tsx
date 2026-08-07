import { setRequestLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchProjectDashboardAction, fetchProjectTimelineAction } from "@/app/actions/project-actions";
import { CONTROL_SCOPE_KM_HOSPITAL } from "@/types/database";
import { pickLocalized } from "@/lib/i18n/display";
import { loadRouteData, requireRoutePermission } from "@/lib/auth/route-authorization";
import { dateInTimeZone } from "@/domain/analytics/timeline";
import { formatCompactPercent, formatRatio, toNumber } from "@/domain/analytics/format";
import type { KpiMetric } from "@/domain/analytics/types";
import { ProjectTimelineAnalytics } from "@/components/dashboard/project-timeline-analytics";
import { mapTimelineToGanttItems } from "@/lib/projects/map-timeline-gantt";

function decimalToNumber(
  value: { toNumber?: () => number; toString: () => string } | number | string | null | undefined,
): number | null {
  if (value == null) return null;
  if (typeof value === "number") return value;
  if (typeof value === "string") return toNumber(value);
  if (typeof value.toNumber === "function") return value.toNumber();
  return toNumber(value.toString());
}

export default async function ProjectTimelinePage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  await requireRoutePermission("project", "read");
  const t = await getTranslations("timeline");
  const tPages = await getTranslations("pages.projects");
  const tAnalytics = await getTranslations("analytics");

  const scopeId = id === "cs-khamis-hospital" ? CONTROL_SCOPE_KM_HOSPITAL : id;
  const [timeline, dashboard] = await Promise.all([
    loadRouteData(() => fetchProjectTimelineAction(scopeId)),
    loadRouteData(() => fetchProjectDashboardAction(scopeId)),
  ]);

  if (!timeline) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-text-secondary">{tPages("notFound")}</p>
      </div>
    );
  }

  const { project, phases, milestones } = timeline;
  const scopeName = pickLocalized(
    locale,
    project.control_scopes?.name_en,
    project.control_scopes?.name_ar,
  );

  const today = dateInTimeZone();
  const ganttItems = mapTimelineToGanttItems({
    locale,
    project,
    phases,
    milestones,
    today,
  });

  const metrics = dashboard?.metrics;
  const spi = decimalToNumber(metrics?.schedulePerformanceIndex);
  const pv = decimalToNumber(metrics?.plannedValue);
  const ev = decimalToNumber(metrics?.earnedValue);
  const scheduleProgress =
    pv != null && pv > 0 && ev != null ? Math.round((ev / pv) * 1000) / 10 : null;

  const progressValues = milestones
    .map((m) => (m.approved_progress == null ? null : toNumber(m.approved_progress)))
    .filter((v): v is number => v != null);
  const overallProgress =
    progressValues.length > 0
      ? Math.round(
          (progressValues.reduce((sum, v) => sum + v, 0) / progressValues.length) * 10,
        ) / 10
      : null;

  const delayedMilestones = ganttItems.filter((i) => i.kind === "milestone" && i.delayed).length;

  const scheduleKpis: KpiMetric[] = [
    {
      id: "overall-progress",
      label: tAnalytics("kpi.overallProgress"),
      value: overallProgress,
      formattedValue:
        overallProgress == null ? "—" : formatCompactPercent(overallProgress, locale),
    },
    {
      id: "schedule-progress",
      label: tAnalytics("kpi.scheduleProgress"),
      value: scheduleProgress,
      formattedValue:
        scheduleProgress == null ? "—" : formatCompactPercent(scheduleProgress, locale),
    },
    {
      id: "spi",
      label: tAnalytics("kpi.spi"),
      value: spi,
      formattedValue: formatRatio(spi, locale),
    },
    {
      id: "forecast-completion",
      label: tAnalytics("kpi.forecastCompletion"),
      value: null,
      formattedValue: project.forecast_end ?? "—",
    },
    {
      id: "delayed-milestones",
      label: tAnalytics("kpi.delayedMilestones"),
      value: delayedMilestones,
      formattedValue: String(delayedMilestones),
    },
  ];

  return (
    <div className="space-y-6" data-testid="project-timeline-page">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-text-secondary">{scopeName}</p>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
          <Link href={`/${locale}/projects/${id}`} className="text-primary hover:underline">
            {t("projectSummary")}
          </Link>
          <Link href={`/${locale}/tasks`} className="text-primary hover:underline">
            {t("tasks")}
          </Link>
          <Link href={`/${locale}/milestones`} className="text-primary hover:underline">
            {t("milestones")}
          </Link>
          <Link href={`/${locale}/changes`} className="text-primary hover:underline">
            {t("scheduleChanges")}
          </Link>
        </div>
      </div>

      <ProjectTimelineAnalytics
        items={ganttItems}
        today={today}
        locale={locale}
        scheduleKpis={scheduleKpis}
        titles={{
          timeline: tAnalytics("sections.timeline"),
          roadmap: tAnalytics("sections.roadmap"),
          empty: tAnalytics("empty.schedule"),
        }}
      />

      <Card>
        <CardHeader>
          <CardTitle>{t("baselines")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm md:grid-cols-2">
          <div>{t("originalStart")}: {project.baseline_start}</div>
          <div>{t("originalEnd")}: {project.baseline_end}</div>
          <div>{t("revisedStart")}: {project.approved_revised_start ?? "—"}</div>
          <div>{t("revisedEnd")}: {project.approved_revised_end ?? "—"}</div>
          <div>{t("forecastEnd")}: {project.forecast_end}</div>
          <div>
            {t("delay")}: gross {project.gross_delay_days ?? 0},
            excusable {project.excusable_delay_days ?? 0}, net {project.net_delay_days ?? 0}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("phases")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            {phases.map((p) => (
              <li key={p.id} className="flex justify-between border-b py-2">
                <span>{pickLocalized(locale, p.name_en, p.name_ar)}</span>
                <span>{p.baseline_start} → {p.baseline_end}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("milestones")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            {milestones.map((m) => (
              <li key={m.id} className="flex justify-between border-b py-2">
                <Link href={`/${locale}/milestones/${m.id}`} className="text-primary hover:underline">
                  {pickLocalized(locale, m.name_en, m.name_ar)}
                </Link>
                <span>{m.baseline_date} / {m.forecast_date}</span>
                <span>{m.approved_progress}%</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
