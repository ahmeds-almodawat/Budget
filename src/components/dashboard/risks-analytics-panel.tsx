"use client";

import {
  AnalyticsSection,
  ChartCard,
  ExceptionSummary,
  RiskMatrix,
} from "@/components/analytics";
import type { RiskPlotPoint } from "@/domain/analytics/types";

export function RisksAnalyticsPanel({
  matrixRisks,
  openException,
  titles,
  showMatrix,
}: {
  matrixRisks: RiskPlotPoint[];
  openException: { id: string; label: string; count: number; tone?: "neutral" | "warning" | "danger" };
  titles: {
    riskMatrix: string;
    exceptions: string;
    empty: string;
  };
  showMatrix: boolean;
}) {
  return (
    <div className="space-y-6" data-testid="risks-analytics">
      {showMatrix ? (
        <AnalyticsSection title={titles.riskMatrix}>
          <ChartCard
            title={titles.riskMatrix}
            empty={!matrixRisks.length}
            emptyTitle={titles.empty}
          >
            <RiskMatrix risks={matrixRisks} />
          </ChartCard>
        </AnalyticsSection>
      ) : null}

      <AnalyticsSection title={titles.exceptions}>
        <ExceptionSummary items={[openException]} />
      </AnalyticsSection>
    </div>
  );
}
