import { setRequestLocale, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/layout/page-header";
import { ApprovalRulesWorkspace } from "@/components/governance/approval-rules-workspace";
import { WorkspaceError } from "@/components/governance/workspace-state";
import { fetchApprovalRulesAction } from "@/app/actions/governance-actions";
import { hasPermission } from "@/domain/auth/permissions";
import { requireRoutePermission } from "@/lib/auth/route-authorization";

export default async function ApprovalRulesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requireRoutePermission("approval", "read");
  const t = await getTranslations("approvalRules");
  const entityId = session.legalEntityId;
  const roles = session.ctx.roleAssignments;
  const canSimulate = hasPermission(roles, "approval", "approve", entityId);

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
