import { setRequestLocale, getTranslations } from "next-intl/server";
import { fetchForecastsAction } from "@/app/actions/forecast-actions";
import { ForecastsWorkspace } from "@/components/forecasts/forecasts-workspace";
import { getAuthContext } from "@/lib/auth/context";
import { hasPermission } from "@/domain/auth/permissions";
import { getFiscalPeriods } from "@/data/repositories/budget-repository";
import { createClient } from "@/lib/supabase/server";
import { FISCAL_YEAR_2027, LEGAL_ENTITY_MODAWAT } from "@/types/database";

export default async function ForecastsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("forecasts");

  const ctx = await getAuthContext();
  const roleAssignments = ctx?.roleAssignments ?? [];
  const entityId = ctx?.primaryLegalEntityId ?? LEGAL_ENTITY_MODAWAT;

  let forecasts: Awaited<ReturnType<typeof fetchForecastsAction>> = [];
  let errorMessage: string | null = null;
  let defaultFiscalPeriodId = "";
  try {
    const db = await createClient();
    const periods = await getFiscalPeriods(db, FISCAL_YEAR_2027);
    defaultFiscalPeriodId = periods[0]?.id ?? "";
    forecasts = await fetchForecastsAction();
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : t("loadError");
  }

  const permissions = {
    canCreate: hasPermission(roleAssignments, "forecast", "create", entityId),
    canSubmit: hasPermission(roleAssignments, "forecast", "update", entityId),
    canReview: hasPermission(roleAssignments, "forecast", "update", entityId),
    canApprove: hasPermission(roleAssignments, "forecast", "approve", entityId),
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-sm text-slate-600">{t("subtitle")}</p>
      </div>

      {errorMessage ? (
        <p className="text-sm text-red-700">{errorMessage}</p>
      ) : (
        <ForecastsWorkspace
          initialForecasts={forecasts}
          defaultFiscalPeriodId={defaultFiscalPeriodId}
          {...permissions}
        />
      )}
    </div>
  );
}
