import { setRequestLocale, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/layout/page-header";
import { PeriodCloseWorkspace } from "@/components/governance/period-close-workspace";
import { WorkspaceDenied, WorkspaceError } from "@/components/governance/workspace-state";
import { fetchPeriodControlsAction } from "@/app/actions/governance-actions";
import { getFiscalPeriods } from "@/data/repositories/budget-repository";
import { getAuthContext } from "@/lib/auth/context";
import { hasPermission } from "@/domain/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { FISCAL_YEAR_2027, LEGAL_ENTITY_MODAWAT } from "@/types/database";

export default async function PeriodClosePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("periodClose");
  const ctx = await getAuthContext();
  const entityId = ctx?.primaryLegalEntityId ?? LEGAL_ENTITY_MODAWAT;
  const roles = ctx?.roleAssignments ?? [];
  const canRead = hasPermission(roles, "budget", "read", entityId);
  const canClose = hasPermission(roles, "budget", "approve", entityId);

  if (!canRead) {
    return (
      <div className="space-y-6">
        <PageHeader title={t("title")} description={t("subtitle")} />
        <WorkspaceDenied />
      </div>
    );
  }

  let controls: Awaited<ReturnType<typeof fetchPeriodControlsAction>> = [];
  let fiscalPeriods: { id: string; period_number: number; start_date: string; end_date: string }[] = [];
  let errorMessage: string | null = null;
  try {
    const db = await createClient();
    fiscalPeriods = await getFiscalPeriods(db, FISCAL_YEAR_2027);
    controls = await fetchPeriodControlsAction();
  } catch (e) {
    errorMessage = e instanceof Error ? e.message : t("loadError");
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("subtitle")} />
      {errorMessage ? (
        <WorkspaceError message={errorMessage} />
      ) : (
        <PeriodCloseWorkspace
          initialControls={controls}
          fiscalPeriods={fiscalPeriods}
          canClose={canClose}
        />
      )}
    </div>
  );
}
