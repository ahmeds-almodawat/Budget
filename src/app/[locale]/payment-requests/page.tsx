import { setRequestLocale, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/layout/page-header";
import { WorkspaceError } from "@/components/governance/workspace-state";
import { PaymentRequestWorkspace } from "@/components/governance/fulfillment-workspace";
import {
  fetchInvoicesAction,
  fetchPaymentRequestsListAction,
} from "@/app/actions/procurement-actions";
import { hasPermission } from "@/domain/auth/permissions";
import { requireRoutePermission } from "@/lib/auth/route-authorization";

export default async function PaymentRequestsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requireRoutePermission("commitment", "read");
  const t = await getTranslations("procurement");
  const tPages = await getTranslations("pages.paymentRequests");
  const entityId = session.legalEntityId;
  const roles = session.ctx.roleAssignments;

  let requests: Awaited<ReturnType<typeof fetchPaymentRequestsListAction>> = [];
  let invoices: Awaited<ReturnType<typeof fetchInvoicesAction>> = [];
  let errorMessage: string | null = null;
  try {
    [requests, invoices] = await Promise.all([
      fetchPaymentRequestsListAction(),
      fetchInvoicesAction(),
    ]);
  } catch (e) {
    errorMessage = e instanceof Error ? e.message : t("loadError");
  }

  const approvedInvoices = invoices.filter((inv) => inv.invoice_status === "approved");

  return (
    <div className="space-y-6">
      <PageHeader title={tPages("title")} description={tPages("subtitle")} />
      {errorMessage ? (
        <WorkspaceError message={errorMessage} />
      ) : (
        <PaymentRequestWorkspace
          initialRequests={requests as never}
          invoiceOptions={approvedInvoices.map((inv) => ({
            id: inv.id as string,
            label: inv.invoice_number as string,
            maxAmount: String(inv.gross_amount ?? 0),
          }))}
          canCreate={hasPermission(roles, "commitment", "create", entityId)}
          canUpdate={hasPermission(roles, "commitment", "update", entityId)}
          canApprove={hasPermission(roles, "commitment", "approve", entityId)}
        />
      )}
    </div>
  );
}
