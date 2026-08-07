import { setRequestLocale, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/layout/page-header";
import { PeriodCloseWorkspace } from "@/components/governance/period-close-workspace";
import { WorkspaceError } from "@/components/governance/workspace-state";
import { fetchPeriodControlsAction, fetchPeriodTemplatesAction } from "@/app/actions/governance-actions";
import { getFiscalPeriods } from "@/data/repositories/budget-repository";
import { hasPermission } from "@/domain/auth/permissions";
import { FISCAL_YEAR_2027 } from "@/types/database";
import { requireRoutePermission } from "@/lib/auth/route-authorization";

export default async function PeriodClosePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requireRoutePermission("period_close", "read");
  const t = await getTranslations("periodClose");
  const entityId = session.legalEntityId;
  const roles = session.ctx.roleAssignments;
  const canClose = hasPermission(roles, "period_close", "approve", entityId);
  const canManageTemplates = hasPermission(roles, "period_close", "create", entityId) &&
    hasPermission(roles, "period_close", "update", entityId);
  const canRequestReopen = hasPermission(roles, "period_close", "create", entityId);
  const canApproveReopen = hasPermission(roles, "period_close", "approve", entityId);

  let controls: Awaited<ReturnType<typeof fetchPeriodControlsAction>> = [];
  let templates: Awaited<ReturnType<typeof fetchPeriodTemplatesAction>> = [];
  let fiscalPeriods: { id: string; period_number: number; start_date: string; end_date: string }[] = [];
  let errorMessage: string | null = null;
  try {
    fiscalPeriods = await getFiscalPeriods(session.db, FISCAL_YEAR_2027);
    [controls, templates] = await Promise.all([fetchPeriodControlsAction(), fetchPeriodTemplatesAction()]);
  } catch (e) {
    errorMessage = e instanceof Error ? e.message : t("loadError");
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("subtitle")} />
      {errorMessage ? (
        <WorkspaceError message={errorMessage} />
      ) : (
        <PeriodCloseWorkspace
          initialControls={controls}
          initialTemplates={templates}
          fiscalPeriods={fiscalPeriods}
          canClose={canClose}
          canManageTemplates={canManageTemplates}
          canRequestReopen={canRequestReopen}
          canApproveReopen={canApproveReopen}
        />
      )}
    </div>
  );
}
