import { toNumber } from "@/domain/analytics/format";
import type { ChartPoint, VarianceItem } from "@/domain/analytics/types";
import {
  classifyExpenseVarianceStatus,
  classifyRevenueVarianceStatus,
  type VarianceStatus,
} from "@/domain/financial/calculations";

export function aggregateByPeriod<T extends { period_number: number }>(
  rows: T[],
  builders: Record<string, (row: T) => number>,
): ChartPoint[] {
  const map = new Map<number, ChartPoint>();
  for (const row of rows) {
    const key = row.period_number;
    const existing = map.get(key) ?? { key: String(key), label: `P${key}` };
    for (const [series, fn] of Object.entries(builders)) {
      const prev = typeof existing[series] === "number" ? (existing[series] as number) : 0;
      existing[series] = prev + fn(row);
    }
    map.set(key, existing);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a - b)
    .map(([, point]) => point);
}

export function revenueTrendSeries(
  rows: Array<{
    period_number: number;
    budgeted_revenue: string | number;
    actual_net_revenue: string | number;
  }>,
): ChartPoint[] {
  return aggregateByPeriod(rows, {
    budget: (r) => toNumber(r.budgeted_revenue),
    actual: (r) => toNumber(r.actual_net_revenue),
  });
}

export function expenseTrendSeries(
  rows: Array<{
    period_number: number;
    monthly_budget: string | number;
    mtd_actual: string | number;
    commitment_open_current?: string | number;
  }>,
): ChartPoint[] {
  return aggregateByPeriod(rows, {
    budget: (r) => toNumber(r.monthly_budget),
    actual: (r) => toNumber(r.mtd_actual),
    commitment: (r) => toNumber(r.commitment_open_current ?? 0),
  });
}

export function profitabilityTrendSeries(
  rows: Array<{
    period_number: number;
    net_revenue: string | number;
    gross_profit: string | number;
    operating_contribution: string | number;
  }>,
): ChartPoint[] {
  return aggregateByPeriod(rows, {
    netRevenue: (r) => toNumber(r.net_revenue),
    grossProfit: (r) => toNumber(r.gross_profit),
    operatingContribution: (r) => toNumber(r.operating_contribution),
  });
}

export function utilizationByClassification(
  rows: Array<{
    financial_reporting_group: string;
    monthly_budget: string | number;
    mtd_actual: string | number;
    commitment_open_current?: string | number;
  }>,
  labels: Record<string, string>,
): ChartPoint[] {
  const map = new Map<string, ChartPoint>();
  for (const row of rows) {
    const key = row.financial_reporting_group || "other";
    const existing = map.get(key) ?? {
      key,
      label: labels[key] ?? key,
      budget: 0,
      actual: 0,
      commitment: 0,
    };
    existing.budget = (existing.budget as number) + toNumber(row.monthly_budget);
    existing.actual = (existing.actual as number) + toNumber(row.mtd_actual);
    existing.commitment =
      (existing.commitment as number) + toNumber(row.commitment_open_current ?? 0);
    map.set(key, existing);
  }
  return Array.from(map.values()).map((p) => ({
    ...p,
    remaining: Math.max(0, (p.budget as number) - (p.actual as number) - (p.commitment as number)),
  }));
}

export function topVariances(
  items: Array<{
    id: string;
    label: string;
    budget: number;
    actual: number;
    kind: "revenue" | "expense";
  }>,
  direction: "favorable" | "unfavorable",
  limit = 5,
): VarianceItem[] {
  const mapped: VarianceItem[] = items.map((item) => {
    const status: VarianceStatus =
      item.kind === "revenue"
        ? classifyRevenueVarianceStatus(item.budget, item.actual)
        : classifyExpenseVarianceStatus(item.budget, item.actual);
    const variance =
      item.kind === "revenue" ? item.actual - item.budget : item.budget - item.actual;
    return {
      id: item.id,
      label: item.label,
      budget: item.budget,
      actual: item.actual,
      variance,
      status,
    };
  });
  return mapped
    .filter((v) => v.status === direction)
    .sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance))
    .slice(0, limit);
}

export function sparklineFromSeries(points: ChartPoint[], seriesKey: string): number[] {
  return points
    .map((p) => (typeof p[seriesKey] === "number" ? (p[seriesKey] as number) : null))
    .filter((n): n is number => n != null);
}
