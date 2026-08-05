import { setRequestLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/money";
import { fetchHospitalDashboardAction, createVarianceExplanationAction } from "@/app/actions/budget-actions";
import { isVarianceExplanationRequired } from "@/domain/financial/calculations";
import { CONTROL_ACCOUNT_PHARM_INJ } from "@/types/database";

export default async function HospitalDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("dashboard.hospital");

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
          <CardContent className="p-6 text-slate-600">
            {dbError
              ? `${locale === "ar" ? "خطأ قاعدة البيانات" : "Database error"}: ${dbError}`
              : locale === "ar"
                ? "لا توجد ميزانية معتمدة بعد. أنشئ واعتمد الميزانية من صفحة الميزانيات."
                : "No approved budget yet. Create and approve a budget from the Budgets page."}
          </CardContent>
        </Card>
        <Link href={`/${locale}/budgets`} className="text-teal-700 hover:underline">
          {locale === "ar" ? "الانتقال إلى الميزانيات" : "Go to Budgets"}
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
            <div>{locale === "ar" ? "الميزانية" : "Budget"}: {formatMoney(performance.mtdBudget, "SAR")}</div>
            <div>{locale === "ar" ? "الفعلي" : "Actual"}: {formatMoney(performance.mtdActual, "SAR")}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">{t("ytd")}</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1">
            <div>{locale === "ar" ? "الميزانية" : "Budget"}: {formatMoney(performance.ytdBudget, "SAR")}</div>
            <div>{locale === "ar" ? "الفعلي" : "Actual"}: {formatMoney(performance.ytdActual, "SAR")}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">{locale === "ar" ? "المعتمدة الحالية" : "Current approved"}</CardTitle></CardHeader>
          <CardContent>{formatMoney(performance.currentApproved, "SAR")}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">{t("fullYearForecast")}</CardTitle></CardHeader>
          <CardContent>{formatMoney(performance.fullYearForecast, "SAR")}</CardContent>
        </Card>
      </div>

      {explanationRequired ? (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="p-4 text-amber-900">
            {t("varianceExplanationRequired")} — MTD {formatMoney(String(mtdVariance), "SAR")}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{locale === "ar" ? "تفاصيل بنود الميزانية" : "Budget line drill-down"}</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-start">
                <th className="py-2">{locale === "ar" ? "البند" : "Line"}</th>
                <th className="py-2">{locale === "ar" ? "الميزانية" : "Budget"}</th>
                <th className="py-2">{locale === "ar" ? "تفاصيل" : "Details"}</th>
              </tr>
            </thead>
            <tbody>
              {performance.lines.map((line) => (
                <tr key={line.id} className="border-b">
                  <td className="py-2 font-mono text-xs">{line.id.slice(0, 8)}</td>
                  <td className="py-2">{formatMoney(line.planned_amount, "SAR")}</td>
                  <td className="py-2">
                    <Link href={`/${locale}/budgets/transactions/${line.id}`} className="text-teal-700 hover:underline">
                      {locale === "ar" ? "المعاملات" : "Transactions"}
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
