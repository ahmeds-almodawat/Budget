import { setRequestLocale, getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchRestaurantPerformanceAction } from "@/app/actions/restaurant-actions";
import { formatMoney } from "@/lib/money";

export default async function RestaurantDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("dashboard.restaurant");

  const branches = (await fetchRestaurantPerformanceAction()) ?? [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("title")}</h1>

      {branches.length >= 2 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("branchComparison")}</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2">{locale === "ar" ? "الفرع" : "Branch"}</th>
                  <th>{locale === "ar" ? "الإيرادات" : "Revenue"}</th>
                  <th>{t("foodCostPercent")}</th>
                  <th>{t("laborCostPercent")}</th>
                  <th>{locale === "ar" ? "التغطيات" : "Covers"}</th>
                </tr>
              </thead>
              <tbody>
                {branches.map((b) => (
                  <tr key={b.branch_id} className="border-b">
                    <td className="py-2">{locale === "ar" ? b.name_ar : b.name_en}</td>
                    <td>{formatMoney(b.revenue, "SAR")}</td>
                    <td>{b.foodCostPercent?.toFixed(1) ?? "—"}%</td>
                    <td>{b.laborCostPercent?.toFixed(1) ?? "—"}%</td>
                    <td>{b.cover_transactions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {branches.map((branch) => (
          <Card key={branch.branch_id}>
            <CardHeader>
              <CardTitle>{locale === "ar" ? branch.name_ar : branch.name_en}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm">
              <div>{locale === "ar" ? "الإيرادات" : "Revenue"}: {formatMoney(branch.revenue, "SAR")}</div>
              <div>{t("foodCostPercent")}: {branch.foodCostPercent?.toFixed(1) ?? "—"}%</div>
              <div>{t("laborCostPercent")}: {branch.laborCostPercent?.toFixed(1) ?? "—"}%</div>
              <div>{locale === "ar" ? "تكلفة الطعام" : "Food cost"}: {formatMoney(branch.food_cost, "SAR")}</div>
              <div>{locale === "ar" ? "تكلفة العمالة" : "Labor cost"}: {formatMoney(branch.labor_cost, "SAR")}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
