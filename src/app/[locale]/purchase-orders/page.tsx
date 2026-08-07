import { setRequestLocale, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/layout/page-header";
import { WorkspaceError } from "@/components/governance/workspace-state";
import { PurchaseOrderWorkspace } from "@/components/governance/purchase-order-workspace";
import { ProcurementAnalyticsPanel } from "@/components/governance/procurement-analytics-panel";
import {
  fetchAwardsAction,
  fetchPurchaseOrdersWithLinesAction,
} from "@/app/actions/procurement-actions";
import { getFiscalPeriods } from "@/data/repositories/budget-repository";
import { getProcurementPipelineReport } from "@/data/repositories/report-repository";
import { hasPermission } from "@/domain/auth/permissions";
import { FISCAL_YEAR_2027 } from "@/types/database";
import { requireRoutePermission } from "@/lib/auth/route-authorization";

function rfqLabel(award: {
  id: string;
  total_amount?: string | number | null;
  rfqs?: { rfq_number?: string } | { rfq_number?: string }[] | null;
}) {
  const rfq = Array.isArray(award.rfqs) ? award.rfqs[0] : award.rfqs;
  return `${rfq?.rfq_number ?? award.id.slice(0, 8)} · ${award.total_amount ?? 0}`;
}

export default async function PurchaseOrdersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requireRoutePermission("commitment", "read");
  const t = await getTranslations("procurement");
  const entityId = session.legalEntityId;
  const roles = session.ctx.roleAssignments;

  let purchaseOrders: Awaited<ReturnType<typeof fetchPurchaseOrdersWithLinesAction>> = [];
  let awards: Awaited<ReturnType<typeof fetchAwardsAction>> = [];
  let pipelineRows: Awaited<ReturnType<typeof getProcurementPipelineReport>> = [];
  let fiscalPeriodId = "";
  let errorMessage: string | null = null;
  try {
    const periods = await getFiscalPeriods(session.db, FISCAL_YEAR_2027);
    fiscalPeriodId = periods[0]?.id ?? "";
    [purchaseOrders, awards, pipelineRows] = await Promise.all([
      fetchPurchaseOrdersWithLinesAction(),
      fetchAwardsAction(),
      getProcurementPipelineReport(session.db, session.legalEntityId).catch(() => []),
    ]);
  } catch (e) {
    errorMessage = e instanceof Error ? e.message : t("loadError");
  }

  const awardOptions = awards
    .filter((a) => a.award_status === "approved")
    .map((a) => ({
      id: a.id as string,
      label: rfqLabel(a as Parameters<typeof rfqLabel>[0]),
    }));

  return (
    <div className="space-y-6">
      <PageHeader title={t("purchaseOrdersTitle")} description={t("purchaseOrdersSubtitle")} />
      {errorMessage ? (
        <WorkspaceError message={errorMessage} />
      ) : (
        <>
          <ProcurementAnalyticsPanel
            rows={pipelineRows as Array<{ stage: string; status?: string | null; amount?: string | number | null }>}
          />
          <PurchaseOrderWorkspace
            initialOrders={purchaseOrders as never}
            awardOptions={awardOptions}
            fiscalPeriodId={fiscalPeriodId}
            canCreate={hasPermission(roles, "commitment", "create", entityId)}
            canUpdate={hasPermission(roles, "commitment", "update", entityId)}
            canApprove={hasPermission(roles, "commitment", "approve", entityId)}
          />
        </>
      )}
    </div>
  );
}
