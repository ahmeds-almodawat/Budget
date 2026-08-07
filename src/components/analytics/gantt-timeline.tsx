"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { GanttItem } from "@/domain/analytics/types";
import { buildGanttRange, ganttBarOffset } from "@/domain/analytics/timeline";

export function GanttTimeline({
  items,
  today = new Date().toISOString().slice(0, 10),
  className,
}: {
  items: GanttItem[];
  today?: string;
  className?: string;
}) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const range = useMemo(() => buildGanttRange(items), [items]);

  if (!items.length || !range.start || !range.end) {
    return null;
  }

  const visible = items.filter((item) => {
    if (!item.parentId) return true;
    let parent = item.parentId;
    while (parent) {
      if (collapsed[parent]) return false;
      const parentItem = items.find((i) => i.id === parent);
      parent = parentItem?.parentId ?? "";
      if (!parent) break;
    }
    return true;
  });

  const todayOffset = ganttBarOffset(range.start, range.end, today, today);

  return (
    <div className={cn("overflow-x-auto rounded-xl border border-border", className)} data-testid="gantt-timeline">
      <div className="min-w-[720px]">
        <div className="grid grid-cols-[220px_1fr] border-b border-border bg-surface-muted/50 text-xs font-medium text-text-secondary">
          <div className="sticky start-0 z-10 bg-surface-muted/50 px-3 py-2">Item</div>
          <div className="px-3 py-2 tabular-nums">
            {range.start} → {range.end}
          </div>
        </div>
        {visible.map((item) => {
          const baseline = ganttBarOffset(range.start!, range.end!, item.baselineStart, item.baselineEnd);
          const forecast = ganttBarOffset(range.start!, range.end!, item.forecastStart, item.forecastEnd);
          const hasChildren = items.some((c) => c.parentId === item.id);
          return (
            <div key={item.id} className="grid grid-cols-[220px_1fr] border-b border-border/70 text-sm">
              <div className="sticky start-0 z-10 flex items-center gap-2 bg-card px-3 py-2">
                {hasChildren ? (
                  <button
                    type="button"
                    className="rounded border border-border px-1 text-xs"
                    onClick={() => setCollapsed((c) => ({ ...c, [item.id]: !c[item.id] }))}
                    aria-expanded={!collapsed[item.id]}
                  >
                    {collapsed[item.id] ? "+" : "−"}
                  </button>
                ) : (
                  <span className="inline-block w-4" />
                )}
                <span className={cn(item.kind === "milestone" && "font-medium")}>{item.label}</span>
              </div>
              <div className="relative h-10 bg-background">
                {todayOffset ? (
                  <div
                    className="absolute inset-y-0 w-px bg-warning"
                    style={{ left: `${todayOffset.leftPct}%` }}
                    aria-hidden
                  />
                ) : null}
                {baseline ? (
                  <div
                    title="Baseline"
                    className="absolute top-2 h-2 rounded bg-[var(--chart-6)]/50"
                    style={{ left: `${baseline.leftPct}%`, width: `${baseline.widthPct}%` }}
                  />
                ) : null}
                {forecast ? (
                  <div
                    title="Forecast"
                    className={cn(
                      "absolute bottom-2 h-2.5 rounded",
                      item.delayed ? "bg-danger" : item.completed ? "bg-success" : "bg-[var(--chart-1)]",
                    )}
                    style={{ left: `${forecast.leftPct}%`, width: `${Math.max(forecast.widthPct, item.kind === "milestone" ? 0.8 : forecast.widthPct)}%` }}
                  />
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function RoadmapTimeline({ items }: { items: GanttItem[] }) {
  const phases = items.filter((i) => i.kind === "phase" || i.kind === "milestone");
  if (!phases.length) return null;
  return (
    <ul className="grid gap-3 md:grid-cols-2" data-testid="roadmap-timeline">
      {phases.map((item) => (
        <li key={item.id} className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm font-medium">{item.label}</p>
          <p className="mt-1 text-xs text-text-secondary tabular-nums">
            {item.forecastStart ?? item.baselineStart ?? "—"} → {item.forecastEnd ?? item.baselineEnd ?? "—"}
          </p>
          <p className="mt-2 text-xs">
            {item.completed ? "Completed" : item.delayed ? "Delayed" : "In progress"}
            {item.progressPercent != null ? ` · ${item.progressPercent}%` : ""}
          </p>
        </li>
      ))}
    </ul>
  );
}

/** Mobile-friendly chronological list fallback for Gantt. */
export function CompactChronology({ items }: { items: GanttItem[] }) {
  const ordered = [...items].sort((a, b) =>
    (a.forecastStart ?? a.baselineStart ?? "").localeCompare(b.forecastStart ?? b.baselineStart ?? ""),
  );
  return (
    <ol className="space-y-3 md:hidden" data-testid="compact-chronology">
      {ordered.map((item) => (
        <li key={item.id} className="rounded-lg border border-border p-3 text-sm">
          <p className="font-medium">{item.label}</p>
          <p className="text-xs text-text-secondary tabular-nums">
            {item.forecastStart ?? item.baselineStart ?? "—"} → {item.forecastEnd ?? item.baselineEnd ?? "—"}
          </p>
        </li>
      ))}
    </ol>
  );
}
