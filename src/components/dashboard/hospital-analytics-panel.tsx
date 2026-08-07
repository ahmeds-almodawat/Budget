"use client";

import {
  AnalyticsSection,
  CategoryBarChart,
  ChartCard,
  FinancialTrendChart,
  KpiCard,
  KpiGrid,
} from "@/components/analytics";
import type { ChartPoint, ChartSeriesDef, KpiMetric } from "@/domain/analytics/types";

export function HospitalAnalyticsPanel({
  locale,
  kpis,
  utilization,
  utilizationSeries,
  trend,
  trendSeries,
  titles,
}: {
  locale: string;
  kpis: KpiMetric[];
  utilization: ChartPoint[];
  utilizationSeries: ChartSeriesDef[];
  trend: ChartPoint[];
  trendSeries: ChartSeriesDef[];
  titles: {
    kpis: string;
    forecastTrend: string;
    utilization: string;
    empty: string;
  };
}) {
  const moneyLocale = locale.startsWith("ar") ? "ar-SA" : "en-SA";

  return (
    <div className="space-y-6" data-testid="hospital-analytics">
      <AnalyticsSection title={titles.kpis}>
        <KpiGrid>
          {kpis.map((kpi) => (
            <KpiCard key={kpi.id} metric={kpi} locale={locale} />
          ))}
        </KpiGrid>
      </AnalyticsSection>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard
          title={titles.forecastTrend}
          empty={!trend.length}
          emptyTitle={titles.empty}
        >
          <FinancialTrendChart
            data={trend}
            series={trendSeries}
            mode="area"
            locale={moneyLocale}
          />
        </ChartCard>
        <ChartCard
          title={titles.utilization}
          empty={!utilization.length}
          emptyTitle={titles.empty}
        >
          <CategoryBarChart
            data={utilization}
            series={utilizationSeries}
            locale={moneyLocale}
            height={280}
          />
        </ChartCard>
      </div>
    </div>
  );
}
