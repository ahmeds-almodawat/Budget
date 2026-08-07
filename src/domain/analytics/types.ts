import type { VarianceStatus } from "@/domain/financial/calculations";

export type ChartToken =
  | "chart-1"
  | "chart-2"
  | "chart-3"
  | "chart-4"
  | "chart-5"
  | "chart-6"
  | "success"
  | "warning"
  | "danger"
  | "information";

export interface KpiMetric {
  id: string;
  label: string;
  value: number | null;
  formattedValue: string;
  unit?: string;
  subtitle?: string;
  comparisonLabel?: string;
  comparisonValue?: number | null;
  variance?: number | null;
  variancePercent?: number | null;
  varianceStatus?: VarianceStatus;
  href?: string;
  sparkline?: number[];
}

export interface ChartPoint {
  key: string;
  label: string;
  [seriesKey: string]: string | number | null;
}

export interface ChartSeriesDef {
  key: string;
  label: string;
  token: ChartToken;
  type?: "line" | "area" | "bar";
  valueKind?: "money" | "percent" | "number" | "ratio";
}

export interface WaterfallStep {
  id: string;
  label: string;
  value: number;
  kind: "total" | "increase" | "decrease";
}

export interface TimelineEvent {
  id: string;
  label: string;
  at: string | null;
  status?: string;
  detail?: string;
}

export interface GanttItem {
  id: string;
  parentId: string | null;
  label: string;
  kind: "project" | "phase" | "work_package" | "task" | "milestone";
  baselineStart: string | null;
  baselineEnd: string | null;
  forecastStart: string | null;
  forecastEnd: string | null;
  progressPercent: number | null;
  delayed: boolean;
  completed: boolean;
}

export interface PipelineStage {
  id: string;
  label: string;
  count: number;
  amount: number | null;
}

export interface VarianceItem {
  id: string;
  label: string;
  budget: number;
  actual: number;
  variance: number;
  status: VarianceStatus;
}

export interface RiskPlotPoint {
  id: string;
  label: string;
  probability: number;
  impact: number;
  status: string;
  owner?: string | null;
}

export interface ManagementInsight {
  id: string;
  text: string;
  tone: "neutral" | "favorable" | "unfavorable" | "warning";
  href?: string;
}
