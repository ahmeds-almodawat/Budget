"use client";

import {
  AnalyticsSection,
  CategoryBarChart,
  ChartCard,
  ExceptionSummary,
  FinancialTrendChart,
  KpiCard,
  KpiGrid,
  ManagementInsightCard,
  WaterfallChart,
} from "@/components/analytics";
import type { ExecutiveAnalyticsModel } from "@/lib/analytics/executive-view-model";

export function ExecutiveAnalyticsDashboard({
  model,
  locale,
  titles,
}: {
  model: ExecutiveAnalyticsModel;
  locale: string;
  titles: {
    kpis: string;
    revenueTrend: string;
    utilization: string;
    profitability: string;
    grossToNet: string;
    profitabilityBridge: string;
    exceptions: string;
    insights: string;
    empty: string;
  };
}) {
  const moneyLocale = locale.startsWith("ar") ? "ar-SA" : "en-SA";
  return (
    <div className="space-y-8" data-testid="executive-analytics">
      <AnalyticsSection title={titles.kpis}>
        <KpiGrid>
          {model.kpis.map((kpi) => (
            <KpiCard key={kpi.id} metric={kpi} locale={locale} />
          ))}
        </KpiGrid>
      </AnalyticsSection>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard
          title={titles.revenueTrend}
          empty={!model.revenueTrend.length}
          emptyTitle={titles.empty}
        >
          <FinancialTrendChart
            data={model.revenueTrend}
            series={model.revenueSeries}
            mode="area"
            locale={moneyLocale}
          />
        </ChartCard>
        <ChartCard
          title={titles.profitability}
          empty={!model.profitabilityTrend.length}
          emptyTitle={titles.empty}
        >
          <FinancialTrendChart
            data={model.profitabilityTrend}
            series={model.profitabilitySeries}
            locale={moneyLocale}
          />
        </ChartCard>
      </div>

      <ChartCard title={titles.utilization} empty={!model.utilization.length} emptyTitle={titles.empty}>
        <CategoryBarChart
          data={model.utilization}
          series={model.utilizationSeries}
          locale={moneyLocale}
          height={320}
        />
      </ChartCard>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard title={titles.grossToNet} empty={model.grossToNet.length < 2} emptyTitle={titles.empty}>
          <WaterfallChart steps={model.grossToNet} locale={moneyLocale} />
        </ChartCard>
        <ChartCard
          title={titles.profitabilityBridge}
          empty={model.profitabilityBridge.length < 2}
          emptyTitle={titles.empty}
        >
          <WaterfallChart steps={model.profitabilityBridge} locale={moneyLocale} />
        </ChartCard>
      </div>

      <AnalyticsSection title={titles.exceptions}>
        <ExceptionSummary items={model.exceptions} />
      </AnalyticsSection>

      <AnalyticsSection title={titles.insights}>
        <ManagementInsightCard insights={model.insights} />
      </AnalyticsSection>
    </div>
  );
}
