import { setRequestLocale, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/layout/page-header";
import { DelegationWorkspace } from "@/components/governance/delegation-workspace";
import { WorkspaceDenied, WorkspaceError } from "@/components/governance/workspace-state";
import {
  fetchDelegationsAction,
  fetchProfilesForDelegationAction,
} from "@/app/actions/governance-actions";
import { getAuthContext } from "@/lib/auth/context";
import { hasPermission } from "@/domain/auth/permissions";
import { LEGAL_ENTITY_MODAWAT } from "@/types/database";

export default async function DelegationsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("delegation");
  const ctx = await getAuthContext();
  const entityId = ctx?.primaryLegalEntityId ?? LEGAL_ENTITY_MODAWAT;
  const roles = ctx?.roleAssignments ?? [];
  const canRead = hasPermission(roles, "approval", "read", entityId);
  const canCreate = hasPermission(roles, "approval", "create", entityId);

  if (!canRead) {
    return (
      <div className="space-y-6">
        <PageHeader title={t("title")} description={t("subtitle")} />
        <WorkspaceDenied />
      </div>
    );
  }

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
        />
      )}
    </div>
  );
}
