import { setRequestLocale, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/layout/page-header";
import { MasterDataWorkspace } from "@/components/governance/master-data-workspace";
import { WorkspaceError } from "@/components/governance/workspace-state";
import { fetchMasterRecordsAction } from "@/app/actions/governance-actions";
import { hasPermission } from "@/domain/auth/permissions";
import { requireRoutePermission } from "@/lib/auth/route-authorization";

export default async function MasterDataPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requireRoutePermission("master_data", "read");
  const t = await getTranslations("masterData");
  const entityId = session.legalEntityId;
  const roles = session.ctx.roleAssignments;

  const permissions = {
    canCreate: hasPermission(roles, "master_data", "create", entityId),
    canSubmit: hasPermission(roles, "master_data", "update", entityId),
    canApprove: hasPermission(roles, "master_data", "approve", entityId),
    canDeactivate: hasPermission(roles, "master_data", "update", entityId),
  };

  let records: Awaited<ReturnType<typeof fetchMasterRecordsAction>> = [];
  let errorMessage: string | null = null;
  try {
    records = await fetchMasterRecordsAction();
  } catch (e) {
    errorMessage = e instanceof Error ? e.message : t("loadError");
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("subtitle")} />
      {errorMessage ? (
        <WorkspaceError message={errorMessage} />
      ) : (
        <MasterDataWorkspace initialRecords={records} {...permissions} />
      )}
    </div>
  );
}
