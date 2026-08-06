import { setRequestLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/money";
import { fetchHospitalDashboardAction, createVarianceExplanationAction } from "@/app/actions/budget-actions";
import { isVarianceExplanationRequired } from "@/domain/financial/calculations";
import { CONTROL_ACCOUNT_PHARM_INJ } from "@/types/database";
import { requireRoutePermission } from "@/lib/auth/route-authorization";

export default async function HospitalDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRoutePermission("budget", "read");
  const t = await getTranslations("dashboard.hospital");
  const tLabels = await getTranslations("dashboardLabels");

  let performance = null;
  let dbError: string | null = null;
  try {
    performance = await fetchHospitalDashboardAction();
  } catch (e) {
    dbError = e instanceof Error ? e.message : "Database unavailable";
  }

  if (!performance) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <Card>
          <CardContent className="p-6 text-text-secondary">
            {dbError
              ? `${tLabels("databaseError")}: ${dbError}`
              : tLabels("noApprovedBudget")}
          </CardContent>
        </Card>
        <Link href={`/${locale}/budgets`} className="text-primary hover:underline">
          {tLabels("goToBudgets")}
        </Link>
      </div>
    );
  }

  const mtdVariance = Number(performance.mtdActual) - Number(performance.mtdBudget);
  const explanationRequired = isVarianceExplanationRequired({
    varianceAmount: String(mtdVariance),
    budgetAmount: performance.mtdBudget,
    thresholdAmount: "25000",
    thresholdPercent: "10",
  });

  if (explanationRequired && performance.currentPeriodId) {
    await createVarianceExplanationAction({
      controlAccountId: CONTROL_ACCOUNT_PHARM_INJ,
      fiscalPeriodId: performance.currentPeriodId,
      varianceAmount: String(mtdVariance),
      cause: "MTD pharmacy injectable volume above plan",
    }).catch(() => undefined);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">{t("mtd")}</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1">
            <div>{tLabels("budget")}: {formatMoney(performance.mtdBudget, "SAR")}</div>
            <div>{tLabels("actual")}: {formatMoney(performance.mtdActual, "SAR")}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">{t("ytd")}</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1">
            <div>{tLabels("budget")}: {formatMoney(performance.ytdBudget, "SAR")}</div>
            <div>{tLabels("actual")}: {formatMoney(performance.ytdActual, "SAR")}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">{tLabels("currentApproved")}</CardTitle></CardHeader>
          <CardContent>{formatMoney(performance.currentApproved, "SAR")}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">{t("fullYearForecast")}</CardTitle></CardHeader>
          <CardContent>{formatMoney(performance.fullYearForecast, "SAR")}</CardContent>
        </Card>
      </div>

      {explanationRequired ? (
        <Card className="border-warning/40 bg-warning-surface">
          <CardContent className="p-4 text-warning">
            {t("varianceExplanationRequired")} — MTD {formatMoney(String(mtdVariance), "SAR")}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{tLabels("budgetLineDrillDown")}</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-start">
                <th className="py-2">{tLabels("line")}</th>
                <th className="py-2">{tLabels("budget")}</th>
                <th className="py-2">{tLabels("details")}</th>
              </tr>
            </thead>
            <tbody>
              {performance.lines.map((line) => (
                <tr key={line.id} className="border-b">
                  <td className="py-2 font-mono text-xs">{line.id.slice(0, 8)}</td>
                  <td className="py-2">{formatMoney(line.planned_amount, "SAR")}</td>
                  <td className="py-2">
                    <Link href={`/${locale}/budgets/transactions/${line.id}`} className="text-primary hover:underline">
                      {tLabels("transactions")}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
