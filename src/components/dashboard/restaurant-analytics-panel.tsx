"use client";

import {
  AnalyticsSection,
  CategoryBarChart,
  ChartCard,
} from "@/components/analytics";
import type { ChartPoint, ChartSeriesDef } from "@/domain/analytics/types";

export function RestaurantAnalyticsPanel({
  locale,
  revenueByBranch,
  revenueSeries,
  foodCostByBranch,
  foodCostSeries,
  titles,
}: {
  locale: string;
  revenueByBranch: ChartPoint[];
  revenueSeries: ChartSeriesDef[];
  foodCostByBranch: ChartPoint[];
  foodCostSeries: ChartSeriesDef[];
  titles: {
    branchComparison: string;
    foodCost: string;
    empty: string;
  };
}) {
  const moneyLocale = locale.startsWith("ar") ? "ar-SA" : "en-SA";

  return (
    <div className="space-y-6" data-testid="restaurant-analytics">
      <AnalyticsSection title={titles.branchComparison}>
        <div className="grid gap-4 xl:grid-cols-2">
          <ChartCard
            title={titles.branchComparison}
            empty={!revenueByBranch.length}
            emptyTitle={titles.empty}
          >
            <CategoryBarChart
              data={revenueByBranch}
              series={revenueSeries}
              layout="horizontal"
              locale={moneyLocale}
              height={Math.max(240, revenueByBranch.length * 48)}
            />
          </ChartCard>
          <ChartCard
            title={titles.foodCost}
            empty={!foodCostByBranch.length}
            emptyTitle={titles.empty}
          >
            <CategoryBarChart
              data={foodCostByBranch}
              series={foodCostSeries}
              layout="horizontal"
              locale={moneyLocale}
              height={Math.max(240, foodCostByBranch.length * 48)}
            />
          </ChartCard>
        </div>
      </AnalyticsSection>
    </div>
  );
}
