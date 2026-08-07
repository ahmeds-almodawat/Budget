import { setRequestLocale, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/layout/page-header";
import { WorkspaceError } from "@/components/governance/workspace-state";
import { RfqWorkspace } from "@/components/governance/rfq-workspace";
import {
  fetchRequisitionsWithLinesAction,
  fetchRfqsAction,
  fetchVendorsEnrichedAction,
} from "@/app/actions/procurement-actions";
import { hasPermission } from "@/domain/auth/permissions";
import { requireRoutePermission } from "@/lib/auth/route-authorization";

export default async function RfqsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requireRoutePermission("commitment", "read");
  const t = await getTranslations("procurement");
  const tPages = await getTranslations("pages.rfqs");
  const entityId = session.legalEntityId;
  const roles = session.ctx.roleAssignments;

  let rfqs: Awaited<ReturnType<typeof fetchRfqsAction>> = [];
  let requisitions: Awaited<ReturnType<typeof fetchRequisitionsWithLinesAction>> = [];
  let vendors: Awaited<ReturnType<typeof fetchVendorsEnrichedAction>> = [];
  let errorMessage: string | null = null;
  try {
    [rfqs, requisitions, vendors] = await Promise.all([
      fetchRfqsAction(),
      fetchRequisitionsWithLinesAction(),
      fetchVendorsEnrichedAction(),
    ]);
  } catch (e) {
    errorMessage = e instanceof Error ? e.message : t("loadError");
  }

  return (
    <div className="space-y-6">
      <PageHeader title={tPages("title")} description={tPages("subtitle")} />
      {errorMessage ? (
        <WorkspaceError message={errorMessage} />
      ) : (
        <RfqWorkspace
          initialRfqs={rfqs as never}
          requisitionOptions={requisitions
            .filter((r) => ["approved", "sourcing"].includes(r.requisition_status as string))
            .map((r) => ({
              id: r.id as string,
              label: `${r.requisition_number} — ${r.title_en}`,
            }))}
          vendorOptions={vendors
            .filter((v) => v.status === "active")
            .map((v) => ({ id: v.id as string, label: v.name_en as string }))}
          canCreate={hasPermission(roles, "commitment", "create", entityId)}
          canUpdate={hasPermission(roles, "commitment", "update", entityId)}
        />
      )}
    </div>
  );
}
