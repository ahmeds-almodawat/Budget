import { HospitalBudgetWorkflow } from "@/components/budget/hospital-budget-workflow";
import { RevenueBudgetWorkflow } from "@/components/budget/revenue-budget-workflow";
import { hasPermission, type RoleAssignment } from "@/domain/auth/permissions";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { requireRoutePermission } from "@/lib/auth/route-authorization";

export default async function BudgetsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requireRoutePermission("budget", "read");
  const t = await getTranslations("budget");
  const roleAssignments: RoleAssignment[] = session.ctx.roleAssignments;

  const scopeId = session.legalEntityId;
  const permissions = {
    canDraft: hasPermission(roleAssignments, "budget", "create", scopeId),
    canSubmit: hasPermission(roleAssignments, "budget", "update", scopeId),
    canReview: hasPermission(roleAssignments, "actual", "read", scopeId),
    canApprove: hasPermission(roleAssignments, "budget", "approve", scopeId),
    canRequestChange: hasPermission(roleAssignments, "budget", "update", scopeId),
    canApproveChange: hasPermission(roleAssignments, "budget", "approve", scopeId),
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <HospitalBudgetWorkflow permissions={permissions} />
      <RevenueBudgetWorkflow
        permissions={{ canDraft: permissions.canDraft, canSubmit: permissions.canSubmit }}
      />
    </div>
  );
}
