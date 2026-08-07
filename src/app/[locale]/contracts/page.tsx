import { setRequestLocale, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/layout/page-header";
import { WorkspaceError } from "@/components/governance/workspace-state";
import { ContractWorkspace } from "@/components/governance/fulfillment-workspace";
import {
  fetchContractsAction,
  fetchVendorsEnrichedAction,
} from "@/app/actions/procurement-actions";
import { hasPermission } from "@/domain/auth/permissions";
import { requireRoutePermission } from "@/lib/auth/route-authorization";

export default async function ContractsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requireRoutePermission("commitment", "read");
  const t = await getTranslations("procurement");
  const tPages = await getTranslations("pages.contracts");
  const entityId = session.legalEntityId;
  const roles = session.ctx.roleAssignments;

  let contracts: Awaited<ReturnType<typeof fetchContractsAction>> = [];
  let vendors: Awaited<ReturnType<typeof fetchVendorsEnrichedAction>> = [];
  let errorMessage: string | null = null;
  try {
    [contracts, vendors] = await Promise.all([fetchContractsAction(), fetchVendorsEnrichedAction()]);
  } catch (e) {
    errorMessage = e instanceof Error ? e.message : t("loadError");
  }

  return (
    <div className="space-y-6">
      <PageHeader title={tPages("title")} description={tPages("subtitle")} />
      {errorMessage ? (
        <WorkspaceError message={errorMessage} />
      ) : (
        <ContractWorkspace
          initialContracts={contracts as never}
          vendorOptions={vendors
            .filter((v) => v.status === "active")
            .map((v) => ({ id: v.id as string, label: v.name_en as string }))}
          canCreate={hasPermission(roles, "commitment", "create", entityId)}
          canApprove={hasPermission(roles, "commitment", "approve", entityId)}
          canUpdate={hasPermission(roles, "commitment", "update", entityId)}
        />
      )}
    </div>
  );
}
