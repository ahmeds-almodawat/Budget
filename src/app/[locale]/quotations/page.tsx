import { setRequestLocale, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/layout/page-header";
import { WorkspaceError } from "@/components/governance/workspace-state";
import { QuotationWorkspace } from "@/components/governance/sourcing-workspace";
import {
  fetchQuotationsAction,
  fetchRfqsAction,
  fetchVendorsEnrichedAction,
} from "@/app/actions/procurement-actions";
import { hasPermission } from "@/domain/auth/permissions";
import { requireRoutePermission } from "@/lib/auth/route-authorization";

export default async function QuotationsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requireRoutePermission("commitment", "read");
  const t = await getTranslations("procurement");
  const tPages = await getTranslations("pages.quotations");
  const entityId = session.legalEntityId;
  const roles = session.ctx.roleAssignments;

  let quotations: Awaited<ReturnType<typeof fetchQuotationsAction>> = [];
  let rfqs: Awaited<ReturnType<typeof fetchRfqsAction>> = [];
  let vendors: Awaited<ReturnType<typeof fetchVendorsEnrichedAction>> = [];
  let errorMessage: string | null = null;
  try {
    [quotations, rfqs, vendors] = await Promise.all([
      fetchQuotationsAction(),
      fetchRfqsAction(),
      fetchVendorsEnrichedAction(),
    ]);
  } catch (e) {
    errorMessage = e instanceof Error ? e.message : t("loadError");
  }

  const openRfqs = rfqs.filter((r) =>
    ["responses_open", "issued"].includes(r.rfq_status as string),
  );
  const rfqLinesByRfq: Record<string, { id: string; description: string; quantity: string | number }[]> =
    {};
  for (const rfq of rfqs) {
    const lines = (rfq as { rfq_lines?: { id: string; description: string; quantity: string | number }[] })
      .rfq_lines;
    rfqLinesByRfq[rfq.id as string] = lines ?? [];
  }

  return (
    <div className="space-y-6">
      <PageHeader title={tPages("title")} description={tPages("subtitle")} />
      {errorMessage ? (
        <WorkspaceError message={errorMessage} />
      ) : (
        <QuotationWorkspace
          quotations={quotations as never}
          rfqOptions={openRfqs.map((r) => ({
            id: r.id as string,
            label: `${r.rfq_number} — ${r.title_en}`,
          }))}
          vendorOptions={vendors
            .filter((v) => v.status === "active")
            .map((v) => ({ id: v.id as string, label: v.name_en as string }))}
          rfqLinesByRfq={rfqLinesByRfq}
          canCreate={hasPermission(roles, "commitment", "create", entityId)}
        />
      )}
    </div>
  );
}
