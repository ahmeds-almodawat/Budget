import { setRequestLocale, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/layout/page-header";
import { ProcurementWorkspace } from "@/components/governance/procurement-workspace";
import { WorkspaceError } from "@/components/governance/workspace-state";
import {
  fetchPaymentRequestsAction,
  fetchPurchaseOrdersAction,
  fetchSupplierInvoicesAction,
} from "@/app/actions/governance-actions";
import { requireRoutePermission } from "@/lib/auth/route-authorization";

export default async function PurchaseOrdersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRoutePermission("commitment", "read");
  const t = await getTranslations("procurement");
  let purchaseOrders: Awaited<ReturnType<typeof fetchPurchaseOrdersAction>> = [];
  let invoices: Awaited<ReturnType<typeof fetchSupplierInvoicesAction>> = [];
  let payments: Awaited<ReturnType<typeof fetchPaymentRequestsAction>> = [];
  let errorMessage: string | null = null;
  try {
    [purchaseOrders, invoices, payments] = await Promise.all([
      fetchPurchaseOrdersAction(),
      fetchSupplierInvoicesAction(),
      fetchPaymentRequestsAction(),
    ]);
  } catch (e) {
    errorMessage = e instanceof Error ? e.message : t("loadError");
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("subtitle")} />
      {errorMessage ? (
        <WorkspaceError message={errorMessage} />
      ) : (
        <ProcurementWorkspace
          purchaseOrders={purchaseOrders}
          invoices={invoices}
          payments={payments}
        />
      )}
    </div>
  );
}
