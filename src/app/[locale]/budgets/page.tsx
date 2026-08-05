import { setRequestLocale, getTranslations } from "next-intl/server";
import { HospitalBudgetWorkflow } from "@/components/budget/hospital-budget-workflow";
import { getAuthContext } from "@/lib/auth/context";
import { hasPermission, type RoleAssignment, type RoleCode } from "@/domain/auth/permissions";
import { LEGAL_ENTITY_MODAWAT } from "@/types/database";

export default async function BudgetsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("budget");
  const ctx = await getAuthContext();

  const roleAssignments: RoleAssignment[] = (ctx?.roleAssignments ?? []).length
    ? ctx!.roleAssignments
    : (ctx?.roleCodes ?? []).map((roleCode) => ({
        roleCode: roleCode as RoleCode,
        scopeType: "legal_entity" as const,
        scopeId: LEGAL_ENTITY_MODAWAT,
      }));

  const scopeId = LEGAL_ENTITY_MODAWAT;
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
    </div>
  );
}
