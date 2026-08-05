import { setRequestLocale, getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/money";
import {
  seedHospitalBudget,
} from "@/data/seed/development-seed";
import { isVarianceExplanationRequired } from "@/domain/financial/calculations";

export default async function HospitalDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("dashboard.hospital");

  const mtdVariance = (
    Number(seedHospitalBudget.mtdActual) - Number(seedHospitalBudget.mtdBudget)
  ).toFixed(2);
  const explanationRequired = isVarianceExplanationRequired({
    varianceAmount: mtdVariance,
    budgetAmount: seedHospitalBudget.mtdBudget,
    thresholdAmount: "25000",
    thresholdPercent: "10",
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">{t("mtd")}</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1">
            <div>Budget: {formatMoney(seedHospitalBudget.mtdBudget, "SAR")}</div>
            <div>Actual: {formatMoney(seedHospitalBudget.mtdActual, "SAR")}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">{t("ytd")}</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1">
            <div>Budget: {formatMoney(seedHospitalBudget.ytdBudget, "SAR")}</div>
            <div>Actual: {formatMoney(seedHospitalBudget.ytdActual, "SAR")}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">{t("fullYearForecast")}</CardTitle></CardHeader>
          <CardContent>{formatMoney(seedHospitalBudget.fullYearForecast, "SAR")}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">{t("unmappedActuals")}</CardTitle></CardHeader>
          <CardContent>{seedHospitalBudget.unmappedActuals}</CardContent>
        </Card>
      </div>
      {explanationRequired ? (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="p-4 text-amber-900">
            {locale === "ar"
              ? "مطلوب تفسير انحراف مادي — MTD"
              : "Material variance explanation required — MTD"}
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader><CardTitle>{locale === "ar" ? "حسب القسم" : "By Department"}</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-start">
                <th className="py-2">{locale === "ar" ? "القسم" : "Department"}</th>
                <th className="py-2">{locale === "ar" ? "الميزانية" : "Budget"}</th>
                <th className="py-2">{locale === "ar" ? "الفعلي" : "Actual"}</th>
              </tr>
            </thead>
            <tbody>
              {seedHospitalBudget.departments.map((d) => (
                <tr key={d.nameEn} className="border-b">
                  <td className="py-2">{locale === "ar" ? d.nameAr : d.nameEn}</td>
                  <td className="py-2">{formatMoney(d.budget, "SAR")}</td>
                  <td className="py-2">{formatMoney(d.actual, "SAR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
