import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { fetchMilestoneDetailAction } from "@/app/actions/project-actions";
import { MilestoneDetailWorkflow } from "@/components/project/milestone-detail-workflow";
import { getAuthContext } from "@/lib/auth/context";
import { hasPermission, type RoleAssignment } from "@/domain/auth/permissions";
import { LEGAL_ENTITY_MODAWAT } from "@/types/database";

export default async function MilestoneDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const detail = await fetchMilestoneDetailAction(id);
  if (!detail) notFound();

  const ctx = await getAuthContext();
  const roleAssignments: RoleAssignment[] = ctx?.roleAssignments ?? [];

  const permissions = {
    canSubmit: hasPermission(roleAssignments, "milestone", "update", LEGAL_ENTITY_MODAWAT),
    canVerify: hasPermission(roleAssignments, "milestone", "approve", LEGAL_ENTITY_MODAWAT),
    canAccept: hasPermission(roleAssignments, "milestone", "approve", LEGAL_ENTITY_MODAWAT),
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
