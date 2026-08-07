import { setRequestLocale, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/layout/page-header";
import { WorkspaceError } from "@/components/governance/workspace-state";
import { ServiceEntryWorkspace } from "@/components/governance/fulfillment-workspace";
import {
  fetchPurchaseOrdersWithLinesAction,
  fetchServiceEntriesAction,
  fetchVendorsEnrichedAction,
} from "@/app/actions/procurement-actions";
import { hasPermission } from "@/domain/auth/permissions";
import { requireRoutePermission } from "@/lib/auth/route-authorization";

export default async function ServiceEntriesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requireRoutePermission("commitment", "read");
  const t = await getTranslations("procurement");
  const tPages = await getTranslations("pages.serviceEntries");
  const entityId = session.legalEntityId;
  const roles = session.ctx.roleAssignments;

  let entries: Awaited<ReturnType<typeof fetchServiceEntriesAction>> = [];
  let purchaseOrders: Awaited<ReturnType<typeof fetchPurchaseOrdersWithLinesAction>> = [];
  let vendors: Awaited<ReturnType<typeof fetchVendorsEnrichedAction>> = [];
  let errorMessage: string | null = null;
  try {
    [entries, purchaseOrders, vendors] = await Promise.all([
      fetchServiceEntriesAction(),
      fetchPurchaseOrdersWithLinesAction(),
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
        <ServiceEntryWorkspace
          initialEntries={entries as never}
          vendorOptions={vendors
            .filter((v) => v.status === "active")
            .map((v) => ({ id: v.id as string, label: v.name_en as string }))}
          poOptions={purchaseOrders
            .filter((po) => ["issued", "partially_received", "approved"].includes(po.po_status as string))
            .map((po) => ({ id: po.id as string, label: po.po_number as string }))}
          canCreate={hasPermission(roles, "commitment", "create", entityId)}
          canApprove={hasPermission(roles, "commitment", "approve", entityId)}
        />
      )}
    </div>
  );
}
