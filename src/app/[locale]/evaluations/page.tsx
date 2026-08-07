import { setRequestLocale, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/layout/page-header";
import { WorkspaceError } from "@/components/governance/workspace-state";
import { AwardPanel, EvaluationWorkspace } from "@/components/governance/sourcing-workspace";
import {
  fetchAwardsAction,
  fetchEvaluationsAction,
  fetchQuotationsAction,
  fetchRfqsAction,
} from "@/app/actions/procurement-actions";
import { hasPermission } from "@/domain/auth/permissions";
import { requireRoutePermission } from "@/lib/auth/route-authorization";

export default async function EvaluationsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requireRoutePermission("commitment", "read");
  const t = await getTranslations("procurement");
  const tPages = await getTranslations("pages.evaluations");
  const entityId = session.legalEntityId;
  const roles = session.ctx.roleAssignments;

  let evaluations: Awaited<ReturnType<typeof fetchEvaluationsAction>> = [];
  let quotations: Awaited<ReturnType<typeof fetchQuotationsAction>> = [];
  let awards: Awaited<ReturnType<typeof fetchAwardsAction>> = [];
  let rfqs: Awaited<ReturnType<typeof fetchRfqsAction>> = [];
  let errorMessage: string | null = null;
  try {
    [evaluations, quotations, awards, rfqs] = await Promise.all([
      fetchEvaluationsAction(),
      fetchQuotationsAction(),
      fetchAwardsAction(),
      fetchRfqsAction(),
    ]);
  } catch (e) {
    errorMessage = e instanceof Error ? e.message : t("loadError");
  }

  const rfqLinesByRfq: Record<string, { id: string; quantity: string | number }[]> = {};
  for (const rfq of rfqs) {
    rfqLinesByRfq[rfq.id as string] =
      ((rfq as { rfq_lines?: { id: string; quantity: string | number }[] }).rfq_lines ?? []);
  }

  const quotationOptions = quotations.map((q) => ({
    id: q.id as string,
    rfqId: q.rfq_id as string,
    label: `${q.supplier_quote_reference} (${q.rfq_id?.toString().slice(0, 8)})`,
    lines: [],
  }));

  return (
    <div className="space-y-8">
      <PageHeader title={tPages("title")} description={tPages("subtitle")} />
      {errorMessage ? (
        <WorkspaceError message={errorMessage} />
      ) : (
        <>
          <EvaluationWorkspace
            evaluations={evaluations as never}
            quotationOptions={quotationOptions}
            canUpdate={hasPermission(roles, "commitment", "update", entityId)}
          />
          <AwardPanel
            awards={awards as never}
            quotationOptions={quotationOptions}
            rfqLinesByRfq={rfqLinesByRfq}
            canCreate={hasPermission(roles, "commitment", "create", entityId)}
            canApprove={hasPermission(roles, "commitment", "approve", entityId)}
          />
        </>
      )}
    </div>
  );
}
