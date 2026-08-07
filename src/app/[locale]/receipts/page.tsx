import { setRequestLocale, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/layout/page-header";
import { WorkspaceError } from "@/components/governance/workspace-state";
import { ReceiptWorkspace } from "@/components/governance/fulfillment-workspace";
import {
  fetchPurchaseOrdersWithLinesAction,
  fetchReceiptsAction,
} from "@/app/actions/procurement-actions";
import { hasPermission } from "@/domain/auth/permissions";
import { requireRoutePermission } from "@/lib/auth/route-authorization";

export default async function ReceiptsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requireRoutePermission("commitment", "read");
  const t = await getTranslations("procurement");
  const tPages = await getTranslations("pages.receipts");
  const entityId = session.legalEntityId;
  const roles = session.ctx.roleAssignments;

  let receipts: Awaited<ReturnType<typeof fetchReceiptsAction>> = [];
  let purchaseOrders: Awaited<ReturnType<typeof fetchPurchaseOrdersWithLinesAction>> = [];
  let errorMessage: string | null = null;
  try {
    [receipts, purchaseOrders] = await Promise.all([
      fetchReceiptsAction(),
      fetchPurchaseOrdersWithLinesAction(),
    ]);
  } catch (e) {
    errorMessage = e instanceof Error ? e.message : t("loadError");
  }

  const issuedPos = purchaseOrders.filter((po) =>
    ["issued", "partially_received"].includes(po.po_status as string),
  );
  const poLinesByPo: Record<string, { id: string; quantity: string | number }[]> = {};
  for (const po of purchaseOrders) {
    poLinesByPo[po.id as string] =
      ((po as { purchase_order_lines?: { id: string; quantity: string | number }[] }).purchase_order_lines ?? []);
  }

  return (
    <div className="space-y-6">
      <PageHeader title={tPages("title")} description={tPages("subtitle")} />
      {errorMessage ? (
        <WorkspaceError message={errorMessage} />
      ) : (
        <ReceiptWorkspace
          initialReceipts={receipts as never}
          poOptions={issuedPos.map((po) => ({
            id: po.id as string,
            label: po.po_number as string,
          }))}
          poLinesByPo={poLinesByPo}
          canCreate={hasPermission(roles, "commitment", "create", entityId)}
          canApprove={hasPermission(roles, "commitment", "approve", entityId)}
        />
      )}
    </div>
  );
}
