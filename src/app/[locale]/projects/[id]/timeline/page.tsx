import { setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchProjectTimelineAction } from "@/app/actions/project-actions";
import { CONTROL_SCOPE_KM_HOSPITAL } from "@/types/database";

export default async function ProjectTimelinePage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const scopeId = id === "cs-khamis-hospital" ? CONTROL_SCOPE_KM_HOSPITAL : id;
  const timeline = await fetchProjectTimelineAction(scopeId);

  if (!timeline) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">
          {locale === "ar" ? "الجدول الزمني" : "Project timeline"}
        </h1>
        <p className="text-slate-600">
          {locale === "ar" ? "المشروع غير موجود" : "Project not found"}
        </p>
      </div>
    );
  }

  const { project, phases, milestones } = timeline;
  const scopeName =
    locale === "ar"
      ? project.control_scopes?.name_ar
      : project.control_scopes?.name_en;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {locale === "ar" ? "الجدول الزمني" : "Project timeline"}
          </h1>
          <p className="text-slate-600">{scopeName}</p>
        </div>
        <div className="flex gap-4 text-sm">
          <Link href={`/${locale}/tasks`} className="text-teal-700 hover:underline">
            {locale === "ar" ? "المهام" : "Tasks"}
          </Link>
          <Link href={`/${locale}/milestones`} className="text-teal-700 hover:underline">
            {locale === "ar" ? "المعالم" : "Milestones"}
          </Link>
          <Link href={`/${locale}/changes`} className="text-teal-700 hover:underline">
            {locale === "ar" ? "تغييرات الجدول" : "Schedule changes"}
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{locale === "ar" ? "خطوط الأساس" : "Baselines"}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm md:grid-cols-2">
          <div>{locale === "ar" ? "البداية الأصلية" : "Original start"}: {project.baseline_start}</div>
          <div>{locale === "ar" ? "النهاية الأصلية" : "Original end"}: {project.baseline_end}</div>
          <div>{locale === "ar" ? "البداية المنقحة" : "Revised start"}: {project.approved_revised_start ?? "—"}</div>
          <div>{locale === "ar" ? "النهاية المنقحة" : "Revised end"}: {project.approved_revised_end ?? "—"}</div>
          <div>{locale === "ar" ? "التوقع" : "Forecast end"}: {project.forecast_end}</div>
          <div>
            {locale === "ar" ? "التأخير" : "Delay"}: gross {project.gross_delay_days ?? 0},
            excusable {project.excusable_delay_days ?? 0}, net {project.net_delay_days ?? 0}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{locale === "ar" ? "المراحل" : "Phases"}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            {phases.map((p) => (
              <li key={p.id} className="flex justify-between border-b py-2">
                <span>{locale === "ar" ? p.name_ar : p.name_en}</span>
                <span>{p.baseline_start} → {p.baseline_end}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{locale === "ar" ? "المعالم" : "Milestones"}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            {milestones.map((m) => (
              <li key={m.id} className="flex justify-between border-b py-2">
                <Link href={`/${locale}/milestones/${m.id}`} className="text-teal-700 hover:underline">
                  {locale === "ar" ? m.name_ar : m.name_en}
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
