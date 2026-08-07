import type { GanttItem, PipelineStage, TimelineEvent } from "@/domain/analytics/types";
import { toNumber } from "@/domain/analytics/format";

/** Map project phases + milestones into presentation Gantt items using real dates only. */
export function buildProjectGanttItems(input: {
  projectId: string;
  projectLabel: string;
  project: {
    baseline_start: string | null;
    baseline_end: string | null;
    forecast_start: string | null;
    forecast_end: string | null;
    actual_end?: string | null;
  };
  phases: Array<{
    id: string;
    name: string;
    baseline_start: string | null;
    baseline_end: string | null;
    forecast_start: string | null;
    forecast_end: string | null;
    actual_end?: string | null;
  }>;
  milestones: Array<{
    id: string;
    name: string;
    phase_id: string | null;
    baseline_date: string | null;
    forecast_date: string | null;
    actual_date: string | null;
    approved_progress: number | string | null;
  }>;
  today?: string;
}): GanttItem[] {
  const today = input.today ?? new Date().toISOString().slice(0, 10);
  const items: GanttItem[] = [
    {
      id: input.projectId,
      parentId: null,
      label: input.projectLabel,
      kind: "project",
      baselineStart: input.project.baseline_start,
      baselineEnd: input.project.baseline_end,
      forecastStart: input.project.forecast_start,
      forecastEnd: input.project.forecast_end,
      progressPercent: null,
      delayed: Boolean(
        input.project.forecast_end &&
          input.project.forecast_end < today &&
          !input.project.actual_end,
      ),
      completed: Boolean(input.project.actual_end),
    },
  ];

  for (const phase of input.phases) {
    items.push({
      id: phase.id,
      parentId: input.projectId,
      label: phase.name,
      kind: "phase",
      baselineStart: phase.baseline_start,
      baselineEnd: phase.baseline_end,
      forecastStart: phase.forecast_start,
      forecastEnd: phase.forecast_end,
      progressPercent: null,
      delayed: Boolean(phase.forecast_end && phase.forecast_end < today && !phase.actual_end),
      completed: Boolean(phase.actual_end),
    });
  }

  for (const milestone of input.milestones) {
    const progress =
      milestone.approved_progress == null ? null : toNumber(milestone.approved_progress);
    const completed = Boolean(milestone.actual_date) || (progress != null && progress >= 100);
    items.push({
      id: milestone.id,
      parentId: milestone.phase_id ?? input.projectId,
      label: milestone.name,
      kind: "milestone",
      baselineStart: milestone.baseline_date,
      baselineEnd: milestone.baseline_date,
      forecastStart: milestone.forecast_date,
      forecastEnd: milestone.forecast_date,
      progressPercent: progress,
      delayed: Boolean(milestone.forecast_date && milestone.forecast_date < today && !completed),
      completed,
    });
  }

  return items;
}

export function sortTimelineEvents(events: TimelineEvent[]): TimelineEvent[] {
  return [...events].sort((a, b) => {
    if (!a.at && !b.at) return 0;
    if (!a.at) return 1;
    if (!b.at) return -1;
    return a.at.localeCompare(b.at);
  });
}

export function buildGanttRange(items: GanttItem[]): { start: string | null; end: string | null } {
  let start: string | null = null;
  let end: string | null = null;
  for (const item of items) {
    for (const d of [item.baselineStart, item.forecastStart, item.baselineEnd, item.forecastEnd]) {
      if (!d) continue;
      if (!start || d < start) start = d;
      if (!end || d > end) end = d;
    }
  }
  return { start, end };
}

export function daysBetween(start: string, end: string): number {
  const a = Date.parse(start);
  const b = Date.parse(end);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

export function ganttBarOffset(
  rangeStart: string,
  rangeEnd: string,
  barStart: string | null,
  barEnd: string | null,
): { leftPct: number; widthPct: number } | null {
  if (!barStart || !barEnd) return null;
  const total = Math.max(1, daysBetween(rangeStart, rangeEnd));
  const left = Math.max(0, daysBetween(rangeStart, barStart));
  const width = Math.max(1, daysBetween(barStart, barEnd));
  return {
    leftPct: (left / total) * 100,
    widthPct: Math.min(100 - (left / total) * 100, (width / total) * 100),
  };
}

export function buildProcurementPipeline(
  rows: Array<{ stage: string; status?: string | null; amount?: string | number | null; count?: number }>,
  stageOrder: string[],
  labels: Record<string, string>,
): PipelineStage[] {
  const map = new Map<string, PipelineStage>();
  for (const stage of stageOrder) {
    map.set(stage, { id: stage, label: labels[stage] ?? stage, count: 0, amount: 0 });
  }
  for (const row of rows) {
    const stage = row.stage;
    const current = map.get(stage) ?? {
      id: stage,
      label: labels[stage] ?? stage,
      count: 0,
      amount: 0,
    };
    current.count += row.count ?? 1;
    current.amount += toNumber(row.amount ?? 0);
    map.set(stage, current);
  }
  return stageOrder.map((s) => map.get(s)!).filter(Boolean);
}

export function periodCloseProgress(input: {
  automaticPassed: number;
  automaticTotal: number;
  manualPassed: number;
  manualTotal: number;
  blockingFailures: number;
}): { readinessPercent: number; blocked: boolean } {
  const total = input.automaticTotal + input.manualTotal;
  if (total <= 0) {
    return { readinessPercent: 0, blocked: input.blockingFailures > 0 };
  }
  const passed = input.automaticPassed + input.manualPassed;
  const readinessPercent = Math.round((passed / total) * 100);
  return { readinessPercent, blocked: input.blockingFailures > 0 };
}

export function approvalAgeBuckets(
  items: Array<{ createdAt: string | null }>,
  now = new Date(),
): Array<{ id: string; label: string; count: number }> {
  const buckets = [
    { id: "0-2", label: "0–2", min: 0, max: 2, count: 0 },
    { id: "3-5", label: "3–5", min: 3, max: 5, count: 0 },
    { id: "6-10", label: "6–10", min: 6, max: 10, count: 0 },
    { id: "10+", label: "10+", min: 11, max: Number.POSITIVE_INFINITY, count: 0 },
  ];
  for (const item of items) {
    if (!item.createdAt) continue;
    const created = Date.parse(item.createdAt);
    if (Number.isNaN(created)) continue;
    const days = Math.floor((now.getTime() - created) / 86_400_000);
    const bucket = buckets.find((b) => days >= b.min && days <= b.max);
    if (bucket) bucket.count += 1;
  }
  return buckets.map(({ id, label, count }) => ({ id, label, count }));
}
