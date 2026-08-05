import { setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchProjectTimelineAction } from "@/app/actions/project-actions";
import { ScheduleChangesWorkflow } from "@/components/project/schedule-changes-workflow";
import { getAuthContext } from "@/lib/auth/context";
import { hasPermission, type RoleAssignment } from "@/domain/auth/permissions";
import { CONTROL_SCOPE_KM_HOSPITAL, LEGAL_ENTITY_MODAWAT } from "@/types/database";

export default async function ChangesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const timeline = await fetchProjectTimelineAction(CONTROL_SCOPE_KM_HOSPITAL);
  const ctx = await getAuthContext();
  const roleAssignments: RoleAssignment[] = ctx?.roleAssignments ?? [];

  const permissions = {
    canRequest: hasPermission(roleAssignments, "project", "update", LEGAL_ENTITY_MODAWAT),
    canApprove: hasPermission(roleAssignments, "project", "approve", LEGAL_ENTITY_MODAWAT),
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">
          {locale === "ar" ? "تغييرات الجدول" : "Schedule changes"}
        </h1>
        <Link
          href={`/${locale}/projects/cs-khamis-hospital/timeline`}
          className="text-sm text-teal-700 hover:underline"
        >
          {locale === "ar" ? "الجدول الزمني" : "Project timeline"}
        </Link>
      </div>

      {timeline && (
        <Card>
          <CardHeader>
            <CardTitle>{locale === "ar" ? "ملخص المشروع" : "Project summary"}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm md:grid-cols-2">
            <div>
              {locale === "ar" ? "البداية الأصلية" : "Baseline start"}: {timeline.project.baseline_start}
            </div>
            <div>
              {locale === "ar" ? "النهاية الأصلية" : "Baseline end"}: {timeline.project.baseline_end}
            </div>
            <div>
              {locale === "ar" ? "التوقع" : "Forecast end"}: {timeline.project.forecast_end}
            </div>
            <div>
              {locale === "ar" ? "صافي التأخير" : "Net delay"}: {timeline.project.net_delay_days ?? 0}d
            </div>
          </CardContent>
        </Card>
      )}

      <ScheduleChangesWorkflow
        scheduleChanges={timeline?.scheduleChanges ?? []}
        permissions={permissions}
      />
    </div>
  );
}
