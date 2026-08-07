import { setRequestLocale, getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchRestaurantPerformanceAction } from "@/app/actions/restaurant-actions";
import { formatMoney } from "@/lib/money";
import { pickLocalized } from "@/lib/i18n/display";
import { requireRoutePermission } from "@/lib/auth/route-authorization";
import { RestaurantAnalyticsPanel } from "@/components/dashboard/restaurant-analytics-panel";
import type { ChartPoint, ChartSeriesDef } from "@/domain/analytics/types";

export default async function RestaurantDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRoutePermission("report", "read");
  const t = await getTranslations("dashboard.restaurant");
  const tLabels = await getTranslations("dashboardLabels");
  const tAnalytics = await getTranslations("analytics");

  const branches = (await fetchRestaurantPerformanceAction()) ?? [];

  const revenueByBranch: ChartPoint[] = branches.map((b) => ({
    key: b.branch_id,
    label: pickLocalized(locale, b.name_en, b.name_ar),
    revenue: b.revenue,
  }));

  const foodCostByBranch: ChartPoint[] = branches
    .filter((b) => b.foodCostPercent != null)
    .map((b) => ({
      key: b.branch_id,
      label: pickLocalized(locale, b.name_en, b.name_ar),
      foodCostPercent: b.foodCostPercent as number,
    }));

  const revenueSeries: ChartSeriesDef[] = [
    { key: "revenue", label: tLabels("revenue"), token: "chart-1", type: "bar" },
  ];
  const foodCostSeries: ChartSeriesDef[] = [
    { key: "foodCostPercent", label: t("foodCostPercent"), token: "chart-3", type: "bar" },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("title")}</h1>

      <RestaurantAnalyticsPanel
        locale={locale}
        revenueByBranch={revenueByBranch}
        revenueSeries={revenueSeries}
        foodCostByBranch={foodCostByBranch}
        foodCostSeries={foodCostSeries}
        titles={{
          branchComparison: tAnalytics("sections.branchComparison"),
          foodCost: tAnalytics("kpi.foodCost"),
          empty: tAnalytics("empty.period"),
        }}
      />

      {branches.length >= 2 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("branchComparison")}</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-start">
                  <th className="py-2">{tLabels("branch")}</th>
                  <th>{tLabels("revenue")}</th>
                  <th>{t("foodCostPercent")}</th>
                  <th>{t("laborCostPercent")}</th>
                  <th>{tLabels("covers")}</th>
                </tr>
              </thead>
              <tbody>
                {branches.map((b) => (
                  <tr key={b.branch_id} className="border-b">
                    <td className="py-2">{pickLocalized(locale, b.name_en, b.name_ar)}</td>
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
              <CardTitle>{pickLocalized(locale, branch.name_en, branch.name_ar)}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm">
              <div>{tLabels("revenue")}: {formatMoney(branch.revenue, "SAR")}</div>
              <div>{t("foodCostPercent")}: {branch.foodCostPercent?.toFixed(1) ?? "—"}%</div>
              <div>{t("laborCostPercent")}: {branch.laborCostPercent?.toFixed(1) ?? "—"}%</div>
              <div>{tLabels("foodCost")}: {formatMoney(branch.food_cost, "SAR")}</div>
              <div>{tLabels("laborCost")}: {formatMoney(branch.labor_cost, "SAR")}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
