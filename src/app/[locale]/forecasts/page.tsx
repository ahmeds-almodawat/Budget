import { setRequestLocale, getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchForecastsAction } from "@/app/actions/forecast-actions";
import { formatMoney } from "@/lib/money";

export default async function ForecastsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("forecasts");

  let forecasts: Awaited<ReturnType<typeof fetchForecastsAction>> = [];
  let errorMessage: string | null = null;
  try {
    forecasts = await fetchForecastsAction();
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : t("loadError");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-sm text-slate-600">{t("subtitle")}</p>
      </div>

      {errorMessage ? (
        <Card>
          <CardContent className="p-6 text-red-700">{errorMessage}</CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4">
        {forecasts.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-slate-600">{t("empty")}</CardContent>
          </Card>
        ) : (
          forecasts.map((forecast) => (
            <Card key={forecast.id}>
              <CardHeader>
                <CardTitle className="text-base">
                  {forecast.version_label} · {forecast.approval_status}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-slate-600">
                <div>{t("lineCount", { count: forecast.forecast_lines?.length ?? 0 })}</div>
                <div>
                  {t("currentApproved")}: {forecast.is_current_approved ? t("yes") : t("no")}
                </div>
                <div className="mt-2 space-y-1">
                  {(forecast.forecast_lines ?? []).slice(0, 5).map((line: { id: string; forecast_amount: string }) => (
                    <div key={line.id}>
                      {formatMoney(line.forecast_amount, "SAR")}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
