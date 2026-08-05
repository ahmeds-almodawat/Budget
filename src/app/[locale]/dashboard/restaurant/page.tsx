import { setRequestLocale, getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/money";
import { seedRestaurantBudget } from "@/data/seed/development-seed";

export default async function RestaurantDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("dashboard.restaurant");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <div className="grid gap-4 lg:grid-cols-2">
        {seedRestaurantBudget.branches.map((branch) => {
          const foodAlert = branch.foodCostPercent > seedRestaurantBudget.foodCostThreshold;
          const laborAlert = branch.laborCostPercent > seedRestaurantBudget.laborCostThreshold;
          return (
            <Card key={branch.nameEn} className={foodAlert || laborAlert ? "border-red-300" : ""}>
              <CardHeader>
                <CardTitle>{locale === "ar" ? branch.nameAr : branch.nameEn}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>{locale === "ar" ? "إيرادات" : "Revenue"}</span>
                  <span>{formatMoney(branch.revenueActual, "SAR")}</span>
                </div>
                <div className={`flex justify-between ${foodAlert ? "text-red-700 font-medium" : ""}`}>
                  <span>{t("foodCostPercent")}</span>
                  <span>{branch.foodCostPercent}%</span>
                </div>
                <div className={`flex justify-between ${laborAlert ? "text-red-700 font-medium" : ""}`}>
                  <span>{t("laborCostPercent")}</span>
                  <span>{branch.laborCostPercent}%</span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
