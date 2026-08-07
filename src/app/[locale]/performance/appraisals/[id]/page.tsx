import { setRequestLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { AppraisalDetailWorkspace } from "@/components/performance/appraisal-detail-workspace";
import { requireRoutePermission } from "@/lib/auth/route-authorization";
import { hasPermission } from "@/domain/auth/permissions";
import {
  getAppraisalAssignment,
  getAssignmentGoals,
  getAssignmentRatings,
  listTemplateCriteria,
} from "@/data/repositories/appraisal-repository";
import { DataAccessError } from "@/data/repositories/budget-repository";

export default async function AppraisalDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const session = await requireRoutePermission("appraisal", "read");
  const t = await getTranslations("appraisal");

  let assignment;
  try {
    assignment = await getAppraisalAssignment(session.db, id);
  } catch (err) {
    if (err instanceof DataAccessError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  if (assignment.legal_entity_id !== session.legalEntityId) {
    notFound();
  }

  const [ratings, criteria, goals] = await Promise.all([
    getAssignmentRatings(session.db, assignment.id),
    listTemplateCriteria(session.db, assignment.template_id),
    getAssignmentGoals(session.db, assignment.id),
  ]);

  const canManage =
    hasPermission(session.ctx.roleAssignments, "appraisal", "approve", session.legalEntityId) ||
    assignment.manager_id === session.ctx.userId ||
    assignment.reviewer_id === session.ctx.userId;

  return (
    <div className="space-y-6">
      <PageHeader title={t("detailTitle")} description={t("detailSubtitle")} />
      <AppraisalDetailWorkspace
        assignment={assignment}
        ratings={ratings}
        criteria={criteria}
        goals={goals}
        currentUserId={session.ctx.userId}
        canManage={canManage}
        canCreateGoals={hasPermission(session.ctx.roleAssignments, "appraisal", "create", session.legalEntityId)}
      />
    </div>
  );
}
