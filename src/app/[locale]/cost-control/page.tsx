import { setRequestLocale, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/layout/page-header";
import { BudgetVsActualWorkspace } from "@/components/financial/budget-vs-actual-workspace";
import { WorkspaceError } from "@/components/governance/workspace-state";
import { fetchBudgetVsActualWorkspaceAction } from "@/app/actions/governance-actions";
import { requireRoutePermission } from "@/lib/auth/route-authorization";

export default async function CostControlPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRoutePermission("budget", "read");
  const t = await getTranslations("budgetVsActual");
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
