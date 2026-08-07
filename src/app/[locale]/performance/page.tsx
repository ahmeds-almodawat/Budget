import { setRequestLocale, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/layout/page-header";
import { PerformanceWorkspace } from "@/components/performance/performance-workspace";
import { createClient } from "@/lib/supabase/server";
import { requireRoutePermission } from "@/lib/auth/route-authorization";
import { hasPermission } from "@/domain/auth/permissions";
import {
  listAppraisalCycles,
  listAppraisalPeerIdentities,
  listAllAssignments,
  listAppraisalTemplates,
  listMyAppraisals,
  listTeamAppraisals,
} from "@/data/repositories/appraisal-repository";

export default async function EmployeePerformancePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requireRoutePermission("appraisal", "read");
  const t = await getTranslations("dashboard.employee");
  const tApp = await getTranslations("appraisal");
  const db = await createClient();
  const entityId = session.legalEntityId;
  const userId = session.ctx.userId;
  const canManageCycles = hasPermission(session.ctx.roleAssignments, "appraisal", "create", entityId);

  const { data: teams } = await db
    .from("teams")
    .select("id, code, name_en, name_ar")
    .order("code");

  const { data: milestones } = await db
    .from("milestones")
    .select("approved_progress, baseline_date, forecast_date, actual_date, responsible_team_id");

  const scorecard = (teams ?? []).map((team) => {
    const teamMilestones = (milestones ?? []).filter((m) => m.responsible_team_id === team.id);
    const onTime = teamMilestones.filter(
      (m) => m.actual_date && m.baseline_date && m.actual_date <= m.baseline_date,
    ).length;
    const total = teamMilestones.length || 1;
    return {
      id: team.id,
      code: team.code,
      name_en: team.name_en,
      name_ar: team.name_ar,
      onTimePercent: Math.round((onTime / total) * 100),
      milestoneCount: teamMilestones.length,
    };
  });

  const [myAppraisals, teamAppraisals, cycles, templates] = await Promise.all([
    listMyAppraisals(db, entityId, userId),
    canManageCycles
      ? listAllAssignments(db, entityId)
      : listTeamAppraisals(db, entityId, userId),
    listAppraisalCycles(db, entityId),
    listAppraisalTemplates(db, entityId),
  ]);

  const profiles = await listAppraisalPeerIdentities(db, entityId);

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={tApp("subtitle")} />
      <PerformanceWorkspace
        scorecard={scorecard}
        myAppraisals={myAppraisals}
        teamAppraisals={teamAppraisals}
        cycles={cycles}
        templates={templates}
        profiles={profiles.map((p) => ({
          id: p.id,
          full_name_en: p.full_name_en,
          full_name_ar: p.full_name_ar,
        }))}
        canManageCycles={canManageCycles}
        localePrefix={`/${locale}`}
      />
    </div>
  );
}
