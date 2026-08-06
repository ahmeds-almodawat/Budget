import { setRequestLocale, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/layout/page-header";
import { DelegationWorkspace } from "@/components/governance/delegation-workspace";
import { WorkspaceError } from "@/components/governance/workspace-state";
import {
  fetchDelegationsAction,
  fetchProfilesForDelegationAction,
} from "@/app/actions/governance-actions";
import { hasPermission } from "@/domain/auth/permissions";
import { requireRoutePermission } from "@/lib/auth/route-authorization";

export default async function DelegationsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requireRoutePermission("approval", "read");
  const t = await getTranslations("delegation");
  const entityId = session.legalEntityId;
  const roles = session.ctx.roleAssignments;
  const canCreate = hasPermission(roles, "approval", "create", entityId);

  let delegations: Awaited<ReturnType<typeof fetchDelegationsAction>> = [];
  let profiles: Awaited<ReturnType<typeof fetchProfilesForDelegationAction>> = [];
  let errorMessage: string | null = null;
  try {
    [delegations, profiles] = await Promise.all([
      fetchDelegationsAction(),
      fetchProfilesForDelegationAction(),
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
        <DelegationWorkspace
          initialDelegations={delegations}
          profiles={profiles}
          canCreate={canCreate}
          canSubmit={hasPermission(roles, "approval", "update", entityId)}
          canApprove={hasPermission(roles, "approval", "approve", entityId)}
          canRevoke={hasPermission(roles, "approval", "update", entityId)}
        />
      )}
    </div>
  );
}
