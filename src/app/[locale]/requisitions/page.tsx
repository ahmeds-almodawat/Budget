import { setRequestLocale, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/layout/page-header";
import { RequisitionWorkspace } from "@/components/governance/requisition-workspace";
import { WorkspaceDenied, WorkspaceError } from "@/components/governance/workspace-state";
import { fetchRequisitionsAction } from "@/app/actions/governance-actions";
import { getFiscalPeriods } from "@/data/repositories/budget-repository";
import { getAuthContext } from "@/lib/auth/context";
import { hasPermission } from "@/domain/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { FISCAL_YEAR_2027, LEGAL_ENTITY_MODAWAT } from "@/types/database";

export default async function RequisitionsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("requisition");
  const ctx = await getAuthContext();
  const entityId = ctx?.primaryLegalEntityId ?? LEGAL_ENTITY_MODAWAT;
  const roles = ctx?.roleAssignments ?? [];
  const canRead = hasPermission(roles, "commitment", "read", entityId);
  const canCreate = hasPermission(roles, "commitment", "create", entityId);
  const canSubmit = hasPermission(roles, "commitment", "update", entityId);

  if (!canRead) {
    return (
      <div className="space-y-6">
        <PageHeader title={t("title")} description={t("subtitle")} />
        <WorkspaceDenied />
      </div>
    );
  }

  let requisitions: Awaited<ReturnType<typeof fetchRequisitionsAction>> = [];
  let fiscalPeriodId = "";
  let errorMessage: string | null = null;
  try {
    const db = await createClient();
    const periods = await getFiscalPeriods(db, FISCAL_YEAR_2027);
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
