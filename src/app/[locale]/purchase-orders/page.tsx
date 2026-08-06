import { setRequestLocale, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/layout/page-header";
import { ProcurementWorkspace } from "@/components/governance/procurement-workspace";
import { WorkspaceDenied, WorkspaceError } from "@/components/governance/workspace-state";
import {
  fetchPaymentRequestsAction,
  fetchPurchaseOrdersAction,
  fetchSupplierInvoicesAction,
} from "@/app/actions/governance-actions";
import { getAuthContext } from "@/lib/auth/context";
import { hasPermission } from "@/domain/auth/permissions";
import { LEGAL_ENTITY_MODAWAT } from "@/types/database";

export default async function PurchaseOrdersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("procurement");
  const ctx = await getAuthContext();
  const entityId = ctx?.primaryLegalEntityId ?? LEGAL_ENTITY_MODAWAT;
  const roles = ctx?.roleAssignments ?? [];
  const canRead = hasPermission(roles, "commitment", "read", entityId);

  if (!canRead) {
    return (
      <div className="space-y-6">
        <PageHeader title={t("title")} description={t("subtitle")} />
        <WorkspaceDenied />
      </div>
    );
  }

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
