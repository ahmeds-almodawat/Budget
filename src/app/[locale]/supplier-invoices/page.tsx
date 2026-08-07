import { setRequestLocale, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/layout/page-header";
import { WorkspaceError } from "@/components/governance/workspace-state";
import { SupplierInvoiceWorkspace } from "@/components/governance/fulfillment-workspace";
import {
  fetchInvoicesAction,
  fetchPurchaseOrdersWithLinesAction,
} from "@/app/actions/procurement-actions";
import { hasPermission } from "@/domain/auth/permissions";
import { requireRoutePermission } from "@/lib/auth/route-authorization";

export default async function SupplierInvoicesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requireRoutePermission("commitment", "read");
  const t = await getTranslations("procurement");
  const tPages = await getTranslations("pages.supplierInvoices");
  const entityId = session.legalEntityId;
  const roles = session.ctx.roleAssignments;

  let invoices: Awaited<ReturnType<typeof fetchInvoicesAction>> = [];
  let purchaseOrders: Awaited<ReturnType<typeof fetchPurchaseOrdersWithLinesAction>> = [];
  let errorMessage: string | null = null;
  try {
    [invoices, purchaseOrders] = await Promise.all([
      fetchInvoicesAction(),
      fetchPurchaseOrdersWithLinesAction(),
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
        <SupplierInvoiceWorkspace
          initialInvoices={invoices as never}
          poOptions={purchaseOrders
            .filter((po) => ["issued", "partially_received", "closed"].includes(po.po_status as string))
            .map((po) => ({
              id: po.id as string,
              label: po.po_number as string,
              vendorId: po.vendor_id as string,
            }))}
          canCreate={hasPermission(roles, "commitment", "create", entityId)}
          canUpdate={hasPermission(roles, "commitment", "update", entityId)}
          canApprove={hasPermission(roles, "commitment", "approve", entityId)}
        />
      )}
    </div>
  );
}
