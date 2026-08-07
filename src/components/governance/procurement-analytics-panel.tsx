"use client";

import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ChartCard, PipelineFunnel } from "@/components/analytics";
import { buildProcurementPipeline } from "@/domain/analytics/timeline";

const STAGE_ORDER = [
  "requisition",
  "rfq",
  "quotation",
  "evaluation",
  "award",
  "purchase_order",
  "receipt",
  "invoice",
  "matching",
  "payment_ready",
] as const;

export type ProcurementPipelineRow = {
  stage: string;
  status?: string | null;
  amount?: string | number | null;
  count?: number;
};

export function ProcurementAnalyticsPanel({
  rows,
}: {
  rows: ProcurementPipelineRow[];
}) {
  const locale = useLocale();
  const tAnalytics = useTranslations("analytics");
  const moneyLocale = locale.startsWith("ar") ? "ar-SA" : "en-SA";
  const arabicCurrency = locale.startsWith("ar");

  const stages = useMemo(() => {
    const labels: Record<string, string> = {};
    for (const stage of STAGE_ORDER) {
      labels[stage] = tAnalytics(`pipelineStages.${stage}`);
    }
    return buildProcurementPipeline(rows, [...STAGE_ORDER], labels);
  }, [rows, tAnalytics]);

  const hasData = stages.some((s) => s.count > 0);

  return (
    <div data-testid="procurement-analytics-panel">
      <ChartCard
        title={tAnalytics("sections.pipeline")}
        empty={!hasData}
        emptyTitle={tAnalytics("empty.pipeline")}
      >
        <PipelineFunnel stages={stages} locale={moneyLocale} arabicCurrency={arabicCurrency} />
      </ChartCard>
    </div>
  );
}
