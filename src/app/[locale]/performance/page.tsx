import { setRequestLocale, getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { pickLocalized } from "@/lib/i18n/display";

export default async function EmployeePerformancePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("dashboard.employee");
  const tPages = await getTranslations("pages.performance");
  const db = await createClient();

  const { data: teams } = await db
    .from("teams")
    .select("id, code, name_en, name_ar")
    .order("code");

  const { data: milestones } = await db
    .from("milestones")
    .select("approved_progress, baseline_date, forecast_date, actual_date, responsible_team_id");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <div className="grid gap-4 lg:grid-cols-2">
        {(teams ?? []).map((team) => {
          const teamMilestones = (milestones ?? []).filter((m) => m.responsible_team_id === team.id);
          const onTime = teamMilestones.filter((m) => m.actual_date && m.baseline_date && m.actual_date <= m.baseline_date).length;
          const total = teamMilestones.length || 1;
          return (
            <Card key={team.id}>
              <CardHeader>
                <CardTitle>{pickLocalized(locale, team.name_en, team.name_ar)}</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3 text-sm">
                <div>{t("onTimeCompletion")}: {Math.round((onTime / total) * 100)}%</div>
                <div>{tPages("milestones")}: {teamMilestones.length}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
