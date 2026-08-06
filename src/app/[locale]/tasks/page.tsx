import { setRequestLocale, getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchProjectTasksAction } from "@/app/actions/project-actions";
import { CONTROL_SCOPE_KM_HOSPITAL } from "@/types/database";
import { pickLocalized } from "@/lib/i18n/display";

export default async function TasksPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("pages.tasks");

  const phases = (await fetchProjectTasksAction(CONTROL_SCOPE_KM_HOSPITAL)) ?? [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("title")}</h1>

      {phases.map((phase) => (
        <Card key={phase.id}>
          <CardHeader>
            <CardTitle>{pickLocalized(locale, phase.name_en, phase.name_ar)}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {(phase.work_packages ?? []).map((wp: {
              id: string;
              code: string;
              name_en: string;
              name_ar: string;
              tasks: {
                id: string;
                code: string;
                name_en: string;
                name_ar: string;
                baseline_start: string | null;
                baseline_end: string | null;
                progress_percent: number;
                status: string;
              }[];
            }) => (
              <div key={wp.id}>
                <h3 className="mb-2 font-medium">
                  {pickLocalized(locale, wp.name_en, wp.name_ar)}
                </h3>
                <ul className="space-y-2 text-sm">
                  {(wp.tasks ?? []).map((task) => (
                    <li key={task.id} className="flex justify-between border-b py-2">
                      <span>
                        {task.code} — {pickLocalized(locale, task.name_en, task.name_ar)}
                      </span>
                      <span>
                        {task.progress_percent}% — {task.status}
                      </span>
                      <span className="text-muted-foreground">
                        {task.baseline_start} → {task.baseline_end}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      {phases.length === 0 && (
        <p className="text-muted-foreground">{t("empty")}</p>
      )}
    </div>
  );
}
