import { setRequestLocale, getTranslations } from "next-intl/server";
import { ExecutiveKpiGrid } from "@/components/dashboard/kpi-cards";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/money";
import {
  seedHospitalBudget,
  seedRestaurantBudget,
} from "@/data/seed/development-seed";

export default async function ExecutiveDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("dashboard.executive");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <ExecutiveKpiGrid locale={locale} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("hospitalPerformance")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>{locale === "ar" ? "YTD الميزانية" : "YTD Budget"}</span>
              <span>{formatMoney(seedHospitalBudget.ytdBudget, "SAR")}</span>
            </div>
            <div className="flex justify-between">
              <span>{locale === "ar" ? "YTD الفعلي" : "YTD Actual"}</span>
              <span>{formatMoney(seedHospitalBudget.ytdActual, "SAR")}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("restaurantPerformance")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {seedRestaurantBudget.branches.map((b) => (
              <div key={b.nameEn} className="flex justify-between gap-4">
                <span>{locale === "ar" ? b.nameAr : b.nameEn}</span>
                <span>
                  FC {b.foodCostPercent}% / LC {b.laborCostPercent}%
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
