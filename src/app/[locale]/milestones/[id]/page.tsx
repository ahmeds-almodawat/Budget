import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { fetchMilestoneDetailAction } from "@/app/actions/project-actions";
import { MilestoneDetailWorkflow } from "@/components/project/milestone-detail-workflow";
import { getAuthContext } from "@/lib/auth/context";
import { hasPermission, type RoleAssignment } from "@/domain/auth/permissions";
import { LEGAL_ENTITY_MODAWAT } from "@/types/database";
import { loadRouteData, requireRoutePermission } from "@/lib/auth/route-authorization";

export default async function MilestoneDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  await requireRoutePermission("milestone", "read");

  const detail = await loadRouteData(() => fetchMilestoneDetailAction(id));
  if (!detail) notFound();

  const ctx = await getAuthContext();
  const roleAssignments: RoleAssignment[] = ctx?.roleAssignments ?? [];
  const projectScope = {
    legalEntityId: LEGAL_ENTITY_MODAWAT,
    scopeType: "project" as const,
    scopeId: detail.milestone.project_id,
  };

  const permissions = {
    canSubmit: hasPermission(roleAssignments, "milestone", "update", projectScope),
    canVerify: hasPermission(roleAssignments, "milestone", "approve", projectScope),
    canAccept: hasPermission(roleAssignments, "milestone", "approve", projectScope),
  };

  return (
    <MilestoneDetailWorkflow
      milestone={detail.milestone}
      steps={detail.steps}
      updates={detail.updates}
      weightedProgress={detail.weightedProgress}
      permissions={permissions}
    />
  );
}
