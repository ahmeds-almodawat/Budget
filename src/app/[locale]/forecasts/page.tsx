import { setRequestLocale, getTranslations } from "next-intl/server";
import { fetchForecastsAction } from "@/app/actions/forecast-actions";
import { ForecastsWorkspace } from "@/components/forecasts/forecasts-workspace";
import { hasPermission } from "@/domain/auth/permissions";
import { getFiscalPeriods } from "@/data/repositories/budget-repository";
import { FISCAL_YEAR_2027 } from "@/types/database";
import { requireRoutePermission } from "@/lib/auth/route-authorization";
import { toPublicDataAccessError } from "@/lib/errors/safe-error";

export default async function ForecastsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requireRoutePermission("forecast", "read");
  const t = await getTranslations("forecasts");

  const roleAssignments = session.ctx.roleAssignments;
  const entityId = session.legalEntityId;

  let forecasts: Awaited<ReturnType<typeof fetchForecastsAction>> = [];
  let errorMessage: string | null = null;
  let defaultFiscalPeriodId = "";
  try {
    const periods = await getFiscalPeriods(session.db, FISCAL_YEAR_2027);
    defaultFiscalPeriodId = periods[0]?.id ?? "";
    forecasts = await fetchForecastsAction();
  } catch (error) {
    errorMessage = toPublicDataAccessError(error).message || t("loadError");
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
        <p className="mt-1 text-sm text-text-secondary">{t("subtitle")}</p>
      </div>

      {errorMessage ? (
        <p className="text-sm text-danger">{errorMessage}</p>
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
