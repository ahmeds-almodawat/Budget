import type { GanttItem, PipelineStage, TimelineEvent } from "@/domain/analytics/types";
import { toNumber } from "@/domain/analytics/format";
import { financialConfig } from "@/config/product";

export type GanttCalendarBand = {
  key: string;
  label: string;
  start: string;
  end: string;
  leftPct: number;
  widthPct: number;
};

/** Map project phases + WBS + milestones into presentation Gantt items using real dates only. */
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
    work_packages?: Array<{
      id: string;
      name: string;
      tasks?: Array<{
        id: string;
        name: string;
        baseline_start: string | null;
        baseline_end: string | null;
        forecast_start: string | null;
        forecast_end: string | null;
        actual_start?: string | null;
        actual_end?: string | null;
        progress_percent?: number | string | null;
        status?: string | null;
      }>;
    }>;
  }>;
  milestones: Array<{
    id: string;
    name: string;
    phase_id: string | null;
    work_package_id?: string | null;
    baseline_date: string | null;
    forecast_date: string | null;
    actual_date: string | null;
    approved_progress: number | string | null;
    approval_status?: string | null;
  }>;
  today?: string;
}): GanttItem[] {
  const today = input.today ?? dateInTimeZone();
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

    for (const wp of phase.work_packages ?? []) {
      // Work packages have no schedule columns in schema — hierarchy only (no invented bars).
      items.push({
        id: wp.id,
        parentId: phase.id,
        label: wp.name,
        kind: "work_package",
        baselineStart: null,
        baselineEnd: null,
        forecastStart: null,
        forecastEnd: null,
        progressPercent: null,
        delayed: false,
        completed: false,
      });

      for (const task of wp.tasks ?? []) {
        const progress =
          task.progress_percent == null ? null : toNumber(task.progress_percent);
        const completed =
          Boolean(task.actual_end) ||
          task.status === "completed" ||
          (progress != null && progress >= 100);
        const forecastEnd = task.forecast_end ?? task.baseline_end;
        items.push({
          id: task.id,
          parentId: wp.id,
          label: task.name,
          kind: "task",
          baselineStart: task.baseline_start,
          baselineEnd: task.baseline_end,
          forecastStart: task.forecast_start ?? task.baseline_start,
          forecastEnd,
          status: task.status ?? null,
          progressPercent: progress,
          delayed: Boolean(forecastEnd && forecastEnd < today && !completed),
          completed,
        });
      }
    }
  }

  for (const milestone of input.milestones) {
    const progress =
      milestone.approved_progress == null ? null : toNumber(milestone.approved_progress);
    const completed = Boolean(milestone.actual_date) || (progress != null && progress >= 100);
    items.push({
      id: milestone.id,
      parentId: milestone.work_package_id ?? milestone.phase_id ?? input.projectId,
      label: milestone.name,
      kind: "milestone",
      baselineStart: milestone.baseline_date,
      baselineEnd: milestone.baseline_date,
      forecastStart: milestone.forecast_date,
      forecastEnd: milestone.forecast_date,
      actualDate: milestone.actual_date,
      status: milestone.approval_status ?? null,
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
    for (const d of [
      item.baselineStart,
      item.forecastStart,
      item.baselineEnd,
      item.forecastEnd,
      item.actualDate ?? null,
    ]) {
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

export function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
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

function isoMonthStart(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

function isoMonthEnd(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${iso.slice(0, 7)}-${String(last).padStart(2, "0")}`;
}

function weekStartMonday(iso: string): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

function formatMonthLabel(iso: string, locale: string): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  return new Intl.DateTimeFormat(locale.startsWith("ar") ? "ar" : "en", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
}

function formatWeekLabel(iso: string, locale: string): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  return new Intl.DateTimeFormat(locale.startsWith("ar") ? "ar" : "en", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(d);
}

function formatYearLabel(iso: string): string {
  return iso.slice(0, 4);
}

function clipBand(
  rangeStart: string,
  rangeEnd: string,
  bandStart: string,
  bandEnd: string,
): { leftPct: number; widthPct: number } | null {
  const start = bandStart < rangeStart ? rangeStart : bandStart;
  const end = bandEnd > rangeEnd ? rangeEnd : bandEnd;
  if (end < start) return null;
  return ganttBarOffset(rangeStart, rangeEnd, start, end);
}

/** Readable calendar bands — year/month for long ranges, month/week for shorter ones. */
export function buildGanttCalendarBands(
  rangeStart: string,
  rangeEnd: string,
  locale = "en",
): { mode: "month" | "week"; primary: GanttCalendarBand[]; secondary: GanttCalendarBand[] } {
  const span = daysBetween(rangeStart, rangeEnd);
  const useWeeks = span <= 120;
  const primary: GanttCalendarBand[] = [];
  const secondary: GanttCalendarBand[] = [];

  if (useWeeks) {
    let cursor = isoMonthStart(rangeStart);
    while (cursor <= rangeEnd) {
      const end = isoMonthEnd(cursor);
      const geom = clipBand(rangeStart, rangeEnd, cursor, end);
      if (geom) {
        primary.push({
          key: `m-${cursor}`,
          label: formatMonthLabel(cursor, locale),
          start: cursor,
          end,
          ...geom,
        });
      }
      const [y, m] = cursor.split("-").map(Number);
      cursor = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01`;
    }

    let week = weekStartMonday(rangeStart);
    while (week <= rangeEnd) {
      const end = addDaysIso(week, 6);
      const geom = clipBand(rangeStart, rangeEnd, week, end);
      if (geom) {
        secondary.push({
          key: `w-${week}`,
          label: formatWeekLabel(week, locale),
          start: week,
          end,
          ...geom,
        });
      }
      week = addDaysIso(week, 7);
    }
    return { mode: "week", primary, secondary };
  }

  // Long projects: year bands + month subdivisions
  let year = Number(rangeStart.slice(0, 4));
  const endYear = Number(rangeEnd.slice(0, 4));
  while (year <= endYear) {
    const start = `${year}-01-01`;
    const end = `${year}-12-31`;
    const geom = clipBand(rangeStart, rangeEnd, start, end);
    if (geom) {
      primary.push({
        key: `y-${year}`,
        label: formatYearLabel(start),
        start,
        end,
        ...geom,
      });
    }
    year += 1;
  }

  let cursor = isoMonthStart(rangeStart);
  while (cursor <= rangeEnd) {
    const end = isoMonthEnd(cursor);
    const geom = clipBand(rangeStart, rangeEnd, cursor, end);
    if (geom) {
      secondary.push({
        key: `m-${cursor}`,
        label: formatMonthLabel(cursor, locale),
        start: cursor,
        end,
        ...geom,
      });
    }
    const [y, m] = cursor.split("-").map(Number);
    cursor = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01`;
  }

  return { mode: "month", primary, secondary };
}

export function ganttItemDepth(items: GanttItem[], item: GanttItem): number {
  let depth = 0;
  let parent = item.parentId;
  while (parent) {
    depth += 1;
    const parentItem = items.find((i) => i.id === parent);
    parent = parentItem?.parentId ?? null;
  }
  return depth;
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
  const encountered = new Set(stageOrder);
  const unknownAmountStages = new Set<string>();
  for (const row of rows) {
    const stage = row.stage;
    const current = map.get(stage) ?? {
      id: stage,
      label: labels[stage] ?? stage,
      count: 0,
      amount: 0,
    };
    current.count += row.count ?? 1;
    if (row.amount == null) {
      unknownAmountStages.add(stage);
      current.amount = null;
    } else if (!unknownAmountStages.has(stage)) {
      current.amount = (current.amount ?? 0) + toNumber(row.amount);
    }
    map.set(stage, current);
    encountered.add(stage);
  }
  return Array.from(encountered).map((s) => map.get(s)!).filter(Boolean);
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
export function dateInTimeZone(
  date = new Date(),
  timeZone = financialConfig.defaultTimezone,
): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}
