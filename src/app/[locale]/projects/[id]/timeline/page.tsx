import { setRequestLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchProjectTimelineAction } from "@/app/actions/project-actions";
import { CONTROL_SCOPE_KM_HOSPITAL } from "@/types/database";
import { pickLocalized } from "@/lib/i18n/display";

export default async function ProjectTimelinePage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("timeline");
  const tPages = await getTranslations("pages.projects");

  const scopeId = id === "cs-khamis-hospital" ? CONTROL_SCOPE_KM_HOSPITAL : id;
  const timeline = await fetchProjectTimelineAction(scopeId);

  if (!timeline) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-slate-600">{tPages("notFound")}</p>
      </div>
    );
  }

  const { project, phases, milestones } = timeline;
  const scopeName = pickLocalized(
    locale,
    project.control_scopes?.name_en,
    project.control_scopes?.name_ar,
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-slate-600">{scopeName}</p>
        </div>
        <div className="flex gap-4 text-sm">
          <Link href={`/${locale}/tasks`} className="text-teal-700 hover:underline">
            {t("tasks")}
          </Link>
          <Link href={`/${locale}/milestones`} className="text-teal-700 hover:underline">
            {t("milestones")}
          </Link>
          <Link href={`/${locale}/changes`} className="text-teal-700 hover:underline">
            {t("scheduleChanges")}
          </Link>
        </div>
      </div>

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
                <Link href={`/${locale}/milestones/${m.id}`} className="text-teal-700 hover:underline">
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
