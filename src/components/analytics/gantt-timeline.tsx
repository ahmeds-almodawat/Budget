"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { GanttItem } from "@/domain/analytics/types";
import {
  buildGanttCalendarBands,
  buildGanttRange,
  dateInTimeZone,
  ganttBarOffset,
  ganttItemDepth,
} from "@/domain/analytics/timeline";

const KIND_KEY: Record<GanttItem["kind"], string> = {
  project: "kinds.project",
  phase: "kinds.phase",
  work_package: "kinds.workPackage",
  task: "kinds.task",
  milestone: "kinds.milestone",
};

function itemHasSchedule(item: GanttItem): boolean {
  return Boolean(
    item.baselineStart ||
      item.baselineEnd ||
      item.forecastStart ||
      item.forecastEnd ||
      item.actualDate,
  );
}

function statusLabel(
  item: GanttItem,
  t: (key: string) => string,
): string {
  if (item.completed) return t("statuses.completed");
  if (item.delayed) return t("statuses.delayed");
  if (item.status) return item.status.replaceAll("_", " ");
  if (itemHasSchedule(item)) return t("statuses.inProgress");
  return t("common.noDates");
}

export function GanttTimeline({
  items,
  today = dateInTimeZone(),
  className,
  compact = false,
}: {
  items: GanttItem[];
  today?: string;
  className?: string;
  /** Compact executive preview (fewer chrome columns, capped height). */
  compact?: boolean;
}) {
  const t = useTranslations("analytics");
  const locale = useLocale();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const range = useMemo(() => buildGanttRange(items), [items]);

  const bands = useMemo(() => {
    if (!range.start || !range.end) return null;
    return buildGanttCalendarBands(range.start, range.end, locale);
  }, [range.start, range.end, locale]);

  if (!items.length || !range.start || !range.end || !bands) {
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

  const todayInRange = today >= range.start && today <= range.end;
  const todayOffset = todayInRange
    ? ganttBarOffset(range.start, range.end, today, today)
    : null;

  const monthCount = Math.max(1, bands.secondary.length || bands.primary.length);
  const timelineMinWidth = Math.max(compact ? 560 : 720, monthCount * (compact ? 72 : 88));
  const leftCols = compact
    ? "grid-cols-[minmax(200px,240px)_1fr]"
    : "grid-cols-[minmax(280px,340px)_1fr]";

  return (
    <div
      className={cn(
        "overflow-x-auto rounded-xl border border-border bg-card",
        compact && "max-h-[380px] overflow-y-auto",
        className,
      )}
      data-testid={compact ? "gantt-timeline-preview" : "gantt-timeline"}
    >
      <div className="border-b border-border px-3 py-2" data-testid="gantt-legend">
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-text-secondary">
          <li className="inline-flex items-center gap-1.5">
            <span className="inline-block h-1.5 w-6 rounded-sm bg-[var(--chart-6)]/55" />
            {t("common.baseline")}
          </li>
          <li className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2 w-6 rounded-sm bg-[var(--chart-1)]" />
            {t("common.forecast")}
          </li>
          <li className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2 w-6 rounded-sm bg-[var(--chart-1)]/35 ring-1 ring-inset ring-[var(--chart-1)]/40" />
            {t("common.progress")}
          </li>
          <li className="inline-flex items-center gap-1.5">
            <span className="inline-block size-2 rotate-45 bg-information" />
            {t("kinds.milestone")}
          </li>
          <li className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3 w-px bg-warning" />
            {t("common.today")}
          </li>
        </ul>
      </div>

      <div style={{ minWidth: timelineMinWidth }}>
        <div
          className={cn("sticky top-0 z-20 grid border-b border-border bg-surface-muted/90 backdrop-blur-sm", leftCols)}
          data-testid="gantt-calendar-header"
        >
          <div className="sticky start-0 z-30 border-e border-border bg-surface-muted/95 px-3 py-2 text-xs font-medium text-text-secondary">
            {compact ? t("common.item") : t("common.scheduleColumn")}
          </div>
          <div className="relative" dir="ltr">
            <div className="relative h-7 border-b border-border/70">
              {bands.primary.map((band) => (
                <div
                  key={band.key}
                  className="absolute inset-y-0 flex items-center justify-center border-e border-border/50 px-1 text-[11px] font-semibold text-text-primary"
                  style={{ left: `${band.leftPct}%`, width: `${band.widthPct}%` }}
                >
                  <span className="truncate">{band.label}</span>
                </div>
              ))}
            </div>
            <div className="relative h-6">
              {bands.secondary.map((band) => (
                <div
                  key={band.key}
                  className="absolute inset-y-0 flex items-center justify-center border-e border-border/40 px-0.5 text-[10px] text-text-secondary"
                  style={{ left: `${band.leftPct}%`, width: `${band.widthPct}%` }}
                >
                  <span className="truncate">{band.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {visible.map((item) => {
          const baseline = ganttBarOffset(
            range.start!,
            range.end!,
            item.baselineStart,
            item.baselineEnd,
          );
          const forecast = ganttBarOffset(
            range.start!,
            range.end!,
            item.forecastStart ?? item.baselineStart,
            item.forecastEnd ?? item.baselineEnd,
          );
          const hasChildren = items.some((c) => c.parentId === item.id);
          const depth = ganttItemDepth(items, item);
          const progress = Math.min(100, Math.max(0, item.progressPercent ?? 0));
          const isMilestone = item.kind === "milestone";
          const milestoneTip = [
            t("kinds.milestone"),
            `${t("common.baseline")}: ${item.baselineStart ?? "—"}`,
            `${t("common.forecast")}: ${item.forecastStart ?? "—"}`,
            `${t("common.actual")}: ${item.actualDate ?? "—"}`,
            `${t("common.status")}: ${statusLabel(item, t)}`,
          ].join("\n");

          return (
            <div
              key={item.id}
              className={cn("grid border-b border-border/60 text-sm", leftCols)}
              data-testid={`gantt-row-${item.kind}`}
              data-gantt-label={item.label}
            >
              <div
                className="sticky start-0 z-10 flex items-center gap-2 border-e border-border bg-card px-2 py-1.5"
                style={{ paddingInlineStart: `${8 + depth * 12}px` }}
              >
                {hasChildren ? (
                  <button
                    type="button"
                    className="inline-flex size-5 shrink-0 items-center justify-center rounded border border-border text-[11px] leading-none text-text-secondary hover:bg-surface-muted"
                    onClick={() => setCollapsed((c) => ({ ...c, [item.id]: !c[item.id] }))}
                    aria-expanded={!collapsed[item.id]}
                    aria-label={t("common.toggleItem", { item: item.label })}
                    data-testid="gantt-expand-toggle"
                  >
                    {collapsed[item.id] ? "+" : "−"}
                  </button>
                ) : (
                  <span className="inline-block size-5 shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="shrink-0 rounded bg-surface-muted px-1 py-0.5 text-[10px] uppercase tracking-wide text-text-secondary">
                      {t(KIND_KEY[item.kind])}
                    </span>
                    <span
                      className={cn(
                        "truncate text-[13px]",
                        isMilestone && "font-medium",
                        item.kind === "project" && "font-semibold",
                      )}
                    >
                      {item.label}
                    </span>
                  </div>
                  {!compact ? (
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-text-secondary">
                      <span className="tabular-nums">
                        {item.progressPercent != null ? `${Math.round(item.progressPercent)}%` : "—"}
                      </span>
                      <span>·</span>
                      <span className="truncate">{statusLabel(item, t)}</span>
                    </div>
                  ) : null}
                </div>
              </div>

              <div
                className={cn("relative bg-background", compact ? "h-9" : "h-11")}
                dir="ltr"
                data-testid="gantt-track"
              >
                {bands.secondary.map((band) => (
                  <div
                    key={`grid-${band.key}`}
                    className="pointer-events-none absolute inset-y-0 border-e border-border/30"
                    style={{ left: `${band.leftPct}%`, width: `${band.widthPct}%` }}
                    aria-hidden
                  />
                ))}

                {todayOffset ? (
                  <div
                    className="pointer-events-none absolute inset-y-0 z-[5]"
                    style={{ left: `${todayOffset.leftPct}%` }}
                    data-testid="gantt-today-marker"
                  >
                    <div className="absolute inset-y-0 w-px bg-warning/80" />
                    {!compact ? (
                      <span className="absolute top-0 -translate-x-1/2 rounded bg-warning/15 px-1 text-[9px] font-medium text-warning">
                        {t("common.today")}
                      </span>
                    ) : null}
                  </div>
                ) : null}

                {!isMilestone && baseline ? (
                  <div
                    title={`${t("common.baseline")}: ${item.baselineStart} → ${item.baselineEnd}`}
                    className="absolute top-1.5 h-1.5 rounded-sm bg-[var(--chart-6)]/45"
                    style={{ left: `${baseline.leftPct}%`, width: `${baseline.widthPct}%` }}
                    data-testid="gantt-baseline-bar"
                  />
                ) : null}

                {!isMilestone && forecast ? (
                  <div
                    title={`${t("common.forecast")}: ${item.forecastStart ?? item.baselineStart} → ${item.forecastEnd ?? item.baselineEnd}`}
                    className={cn(
                      "absolute bottom-1.5 h-2.5 overflow-hidden rounded-sm",
                      item.delayed
                        ? "bg-danger/25"
                        : item.completed
                          ? "bg-success/25"
                          : "bg-[var(--chart-1)]/25",
                    )}
                    style={{
                      left: `${forecast.leftPct}%`,
                      width: `${Math.max(forecast.widthPct, 0.6)}%`,
                    }}
                    data-testid="gantt-forecast-bar"
                  >
                    {item.completed || progress > 0 ? (
                      <div
                        className={cn(
                          "h-full rounded-sm",
                          item.delayed
                            ? "bg-danger"
                            : item.completed
                              ? "bg-success"
                              : "bg-[var(--chart-1)]",
                        )}
                        style={{ width: `${item.completed ? 100 : progress}%` }}
                        data-testid="gantt-progress-fill"
                        title={`${t("common.progress")}: ${Math.round(item.completed ? 100 : progress)}%`}
                      />
                    ) : null}
                  </div>
                ) : null}

                {!isMilestone && !baseline && !forecast ? (
                  <div
                    className="absolute inset-y-0 flex items-center px-2 text-[10px] text-text-secondary"
                    data-testid="gantt-no-dates"
                  >
                    {t("common.noDates")}
                  </div>
                ) : null}

                {isMilestone
                  ? (() => {
                      const markerDate =
                        item.forecastStart ?? item.actualDate ?? item.baselineStart;
                      if (!markerDate) {
                        return (
                          <div className="absolute inset-y-0 flex items-center px-2 text-[10px] text-text-secondary">
                            {t("common.noDates")}
                          </div>
                        );
                      }
                      const mark = ganttBarOffset(range.start!, range.end!, markerDate, markerDate);
                      const baselineMark =
                        item.baselineStart &&
                        item.baselineStart !== markerDate
                          ? ganttBarOffset(
                              range.start!,
                              range.end!,
                              item.baselineStart,
                              item.baselineStart,
                            )
                          : null;
                      return (
                        <>
                          {baselineMark ? (
                            <div
                              className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-[var(--chart-6)] bg-[var(--chart-6)]/30"
                              style={{ left: `${baselineMark.leftPct}%` }}
                              title={`${t("common.baseline")}: ${item.baselineStart}`}
                              aria-hidden
                            />
                          ) : null}
                          <div
                            className={cn(
                              "absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 shadow-sm",
                              item.delayed
                                ? "bg-danger"
                                : item.completed
                                  ? "bg-success"
                                  : "bg-information",
                            )}
                            style={{ left: `${mark?.leftPct ?? 0}%` }}
                            title={milestoneTip}
                            data-testid="gantt-milestone-marker"
                            role="img"
                            aria-label={milestoneTip}
                          />
                        </>
                      );
                    })()
                  : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function RoadmapTimeline({ items }: { items: GanttItem[] }) {
  const t = useTranslations("analytics");
  const phases = items.filter((i) => i.kind === "phase" || i.kind === "milestone");
  if (!phases.length) return null;
  return (
    <ul className="grid gap-3 md:grid-cols-2" data-testid="roadmap-timeline">
      {phases.map((item) => (
        <li key={item.id} className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm font-medium">{item.label}</p>
          <p className="mt-1 text-xs text-text-secondary tabular-nums">
            {item.forecastStart ?? item.baselineStart ?? "—"} →{" "}
            {item.forecastEnd ?? item.baselineEnd ?? "—"}
          </p>
          <p className="mt-2 text-xs">
            {item.completed
              ? t("statuses.completed")
              : item.delayed
                ? t("statuses.delayed")
                : t("statuses.inProgress")}
            {item.progressPercent != null ? ` · ${item.progressPercent}%` : ""}
          </p>
        </li>
      ))}
    </ul>
  );
}

/** Mobile-friendly chronological list fallback for Gantt. */
export function CompactChronology({ items }: { items: GanttItem[] }) {
  const t = useTranslations("analytics");
  const ordered = [...items]
    .filter((item) => item.kind !== "project")
    .sort((a, b) =>
      (a.forecastStart ?? a.baselineStart ?? "9999").localeCompare(
        b.forecastStart ?? b.baselineStart ?? "9999",
      ),
    );

  return (
    <ol className="space-y-3 md:hidden" data-testid="compact-chronology">
      {ordered.map((item) => (
        <li
          key={item.id}
          className="rounded-lg border border-border bg-card p-3 text-sm"
          data-testid="chronology-item"
          data-gantt-label={item.label}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wide text-text-secondary">
                {t(KIND_KEY[item.kind])}
              </p>
              <p className="font-medium">{item.label}</p>
            </div>
            <span className="shrink-0 text-xs text-text-secondary">{statusLabel(item, t)}</span>
          </div>
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-text-secondary">
            <div>
              <dt className="text-[10px] uppercase">{t("common.baseline")}</dt>
              <dd className="tabular-nums">
                {item.baselineStart ?? "—"}
                {item.kind !== "milestone" ? ` → ${item.baselineEnd ?? "—"}` : ""}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase">{t("common.forecast")}</dt>
              <dd className="tabular-nums">
                {item.forecastStart ?? "—"}
                {item.kind !== "milestone" ? ` → ${item.forecastEnd ?? "—"}` : ""}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase">{t("common.progress")}</dt>
              <dd className="tabular-nums">
                {item.progressPercent != null ? `${Math.round(item.progressPercent)}%` : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase">{t("common.status")}</dt>
              <dd>{statusLabel(item, t)}</dd>
            </div>
          </dl>
        </li>
      ))}
    </ol>
  );
}
