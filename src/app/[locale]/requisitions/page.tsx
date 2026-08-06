import { setRequestLocale, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/layout/page-header";
import { RequisitionWorkspace } from "@/components/governance/requisition-workspace";
import { WorkspaceError } from "@/components/governance/workspace-state";
import { fetchRequisitionsAction } from "@/app/actions/governance-actions";
import { getFiscalPeriods } from "@/data/repositories/budget-repository";
import { hasPermission } from "@/domain/auth/permissions";
import { FISCAL_YEAR_2027 } from "@/types/database";
import { requireRoutePermission } from "@/lib/auth/route-authorization";

export default async function RequisitionsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requireRoutePermission("commitment", "read");
  const t = await getTranslations("requisition");
  const entityId = session.legalEntityId;
  const roles = session.ctx.roleAssignments;
  const canCreate = hasPermission(roles, "commitment", "create", entityId);
  const canSubmit = hasPermission(roles, "commitment", "update", entityId);

  let requisitions: Awaited<ReturnType<typeof fetchRequisitionsAction>> = [];
  let fiscalPeriodId = "";
  let errorMessage: string | null = null;
  try {
    const periods = await getFiscalPeriods(session.db, FISCAL_YEAR_2027);
    fiscalPeriodId = periods[0]?.id ?? "";
    requisitions = await fetchRequisitionsAction();
  } catch (e) {
    errorMessage = e instanceof Error ? e.message : t("loadError");
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("subtitle")} />
      {errorMessage ? (
        <WorkspaceError message={errorMessage} />
      ) : (
        <RequisitionWorkspace
          initialRequisitions={requisitions}
          fiscalPeriodId={fiscalPeriodId}
          canCreate={canCreate}
          canSubmit={canSubmit}
        />
      )}
    </div>
  );
}
