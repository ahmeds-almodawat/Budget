"use client";

import {
  AnalyticsSection,
  ChartCard,
  FinancialTrendChart,
  KpiCard,
  KpiGrid,
} from "@/components/analytics";
import type { ChartPoint, ChartSeriesDef, KpiMetric } from "@/domain/analytics/types";

export function ProjectEvmAnalyticsPanel({
  locale,
  kpis,
  trend,
  trendSeries,
  titles,
}: {
  locale: string;
  kpis: KpiMetric[];
  trend: ChartPoint[];
  trendSeries: ChartSeriesDef[];
  titles: {
    evm: string;
    empty: string;
  };
}) {
  const moneyLocale = locale.startsWith("ar") ? "ar-SA" : "en-SA";

  return (
    <div className="space-y-6" data-testid="project-evm-analytics">
      <AnalyticsSection title={titles.evm}>
        {kpis.length ? (
          <KpiGrid className="xl:grid-cols-3">
            {kpis.map((kpi) => (
              <KpiCard key={kpi.id} metric={kpi} locale={locale} />
            ))}
          </KpiGrid>
        ) : null}
        <ChartCard
          title={titles.evm}
          empty={!trend.length}
          emptyTitle={titles.empty}
          className="mt-4"
        >
          <FinancialTrendChart
            data={trend}
            series={trendSeries}
            locale={moneyLocale}
          />
        </ChartCard>
      </AnalyticsSection>
    </div>
  );
}
