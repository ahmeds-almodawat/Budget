import { setRequestLocale, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/layout/page-header";
import { ApprovalRulesWorkspace } from "@/components/governance/approval-rules-workspace";
import { WorkspaceDenied, WorkspaceError } from "@/components/governance/workspace-state";
import { fetchApprovalRulesAction } from "@/app/actions/governance-actions";
import { getAuthContext } from "@/lib/auth/context";
import { hasPermission } from "@/domain/auth/permissions";
import { LEGAL_ENTITY_MODAWAT } from "@/types/database";

export default async function ApprovalRulesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("approvalRules");
  const ctx = await getAuthContext();
  const entityId = ctx?.primaryLegalEntityId ?? LEGAL_ENTITY_MODAWAT;
  const roles = ctx?.roleAssignments ?? [];
  const canRead = hasPermission(roles, "approval", "read", entityId);
  const canSimulate = hasPermission(roles, "approval", "approve", entityId);

  if (!canRead) {
    return (
      <div className="space-y-6">
        <PageHeader title={t("title")} description={t("subtitle")} />
        <WorkspaceDenied />
      </div>
    );
  }

  let rules: Awaited<ReturnType<typeof fetchApprovalRulesAction>> = [];
  let errorMessage: string | null = null;
  try {
    rules = await fetchApprovalRulesAction();
  } catch (e) {
    errorMessage = e instanceof Error ? e.message : t("loadError");
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("subtitle")} />
      {errorMessage ? (
        <WorkspaceError message={errorMessage} />
      ) : (
        <ApprovalRulesWorkspace initialRules={rules} canSimulate={canSimulate} />
      )}
    </div>
  );
}
