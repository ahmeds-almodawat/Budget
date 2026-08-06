import { setRequestLocale, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/layout/page-header";
import { BudgetVsActualWorkspace } from "@/components/financial/budget-vs-actual-workspace";
import { WorkspaceDenied, WorkspaceError } from "@/components/governance/workspace-state";
import { fetchBudgetVsActualWorkspaceAction } from "@/app/actions/governance-actions";
import { getAuthContext } from "@/lib/auth/context";
import { hasPermission } from "@/domain/auth/permissions";
import { LEGAL_ENTITY_MODAWAT } from "@/types/database";

export default async function CostControlPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("budgetVsActual");
  const ctx = await getAuthContext();
  const entityId = ctx?.primaryLegalEntityId ?? LEGAL_ENTITY_MODAWAT;
  const roles = ctx?.roleAssignments ?? [];
  const canRead = hasPermission(roles, "budget", "read", entityId);

  if (!canRead) {
    return (
      <div className="space-y-6">
        <PageHeader title={t("title")} description={t("subtitle")} />
        <WorkspaceDenied />
      </div>
    );
  }

  let data: Awaited<ReturnType<typeof fetchBudgetVsActualWorkspaceAction>> | null = null;
  let errorMessage: string | null = null;
  try {
    data = await fetchBudgetVsActualWorkspaceAction();
  } catch (e) {
    errorMessage = e instanceof Error ? e.message : t("loadError");
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("subtitle")} />
      {errorMessage ? (
        <WorkspaceError message={errorMessage} />
      ) : data ? (
        <BudgetVsActualWorkspace {...data} />
      ) : null}
    </div>
  );
}
