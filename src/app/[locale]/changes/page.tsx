import { setRequestLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchProjectTimelineAction } from "@/app/actions/project-actions";
import { ScheduleChangesWorkflow } from "@/components/project/schedule-changes-workflow";
import { hasPermission, type RoleAssignment } from "@/domain/auth/permissions";
import { CONTROL_SCOPE_KM_HOSPITAL } from "@/types/database";
import { requireRoutePermission } from "@/lib/auth/route-authorization";

export default async function ChangesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requireRoutePermission("project", "read");
  const tPages = await getTranslations("pages.changes");
  const tTimeline = await getTranslations("timeline");

  const timeline = await fetchProjectTimelineAction(CONTROL_SCOPE_KM_HOSPITAL);
  const roleAssignments: RoleAssignment[] = session.ctx.roleAssignments;

  const permissions = {
    canRequest: hasPermission(roleAssignments, "project", "update", session.legalEntityId),
    canApprove: hasPermission(roleAssignments, "project", "approve", session.legalEntityId),
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{tPages("title")}</h1>
        <Link
          href={`/${locale}/projects/cs-khamis-hospital/timeline`}
          className="text-sm text-primary hover:underline"
        >
          {tPages("timeline")}
        </Link>
      </div>

      {timeline && (
        <Card>
          <CardHeader>
            <CardTitle>{tTimeline("projectSummary")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm md:grid-cols-2">
            <div>
              {tTimeline("baselineStart")}: {timeline.project.baseline_start}
            </div>
            <div>
              {tTimeline("baselineEnd")}: {timeline.project.baseline_end}
            </div>
            <div>
              {tTimeline("forecastEnd")}: {timeline.project.forecast_end}
            </div>
            <div>
              {tTimeline("netDelay")}: {timeline.project.net_delay_days ?? 0}d
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
